/**
 * GUARD-BORDE Rev. 2 (SPEC-e14-guard-borde §2-§3) — «la geometría sospecha,
 * la tinta condena» (D1). Helper ÚNICO de completitud para los DOS caminos
 * del pipeline (cámara/archivo de escanearActa + recorte manual de
 * pipelineRecorte — D3/AC11: sin duplicación de la regla).
 *
 * Historia: el veto de completitud (§F-1/§F-2 de SPEC-camara-funcional,
 * PR #33) condenaba con la GEOMETRÍA del quad — esquina sobre el borde
 * (≤0.001/≥0.999) o área <30% → INCOMPLETA con cap 6.4. El dueño reportó el
 * falso positivo exacto (§0 mandato 1): su acta completa llena el encuadre
 * (hábito apretado medido: esquinas 0.988/0.998) y el worker OpenCV entrega
 * esquinas EXACTAS al filo (clampRect del detection-worker L1206 →
 * toFractions L1349, sin shrink; isValidQuadFloats acepta [-0.05, 1.05]) →
 * RECHAZADA 6.4 con la imagen perfecta. Además el worker considera válido un
 * quad desde 25% (QUAD_MIN_AREA_RATIO) y el guard mataba desde 30%:
 * VENTANA DE MUERTE 25-30% (actas completas a distancia cómoda morían).
 *
 * Por qué la geometría NO puede decidir sola (§1b): la señal «quad al filo /
 * quad chico» es ambigua POR CONSTRUCCIÓN — sirve para el caso que la originó
 * (acta cortada por el encuadre) y FALLA en su caso espejo (acta completa con
 * encuadre apretado o lejano). En ambos el recorte procesado sale visualmente
 * perfecto. La evidencia de cortadura NO está en la geometría: está en el
 * CONTENIDO del recorte — si el papel fue cortado por el encuadre, la TINTA
 * IMPRESA llega cortada al filo del recorte; si el papel terminó antes del
 * filo, el filo es margen blanco del impreso.
 *
 * Calibración D5 con la foto REAL del dueño (§1c, acta-real-elcairo-pag1.png
 * 960×2893 b/n — densidad de tinta lum<128 en la franja EXTERIOR 0-2% por
 * lado): superior 7.0% · inferior 0.3% · izquierda 3.6% · derecha 0.7%. La
 * foto PERFECTA del dueño YA trae tinta al filo (marcas de registro cortadas)
 * — cualquier umbral «frágil» la condenaría. Umbral de condena: densidad
 * ≥ 20% (holgura ~3× sobre el peor filo real medido; un renglón/tabla cortado
 * es densidad continua muy por encima). El umbral es CALIBRABLE con evidencia
 * (F-C, §8.5); la REGLA de D1 NO se toca.
 *
 * Escudo anti-fondo (D10): una franja exterior casi uniformemente oscura
 * (densidad ≥ 85%) es FONDO/SOMBRA incluida por el warp (NO tinta cortada) →
 * ese lado NO condena; el acta pasa al gate con TECHO 7.9 (nunca ÓPTIMA —
 * statusDeScore: ≥8 sería ÓPTIMA; el recorte trae fondo y el operador puede
 * preferir repetir), sin copy nuevo. Fabricación de prueba F-E (§8.7).
 *
 * Intocables preservados fuera de este archivo: evaluarGate (§7 score-ocr —
 * D6/AC10), copys de rechazo, contingencia C4, chips sim (completa=true
 * forzado — AC7). packages/ y detection-worker.js SIN tocar (D8).
 */
import type { Quad } from "@jg-stevan/scanner-core/types";
// KIT e14-optimizacion-v1 (T1): decode memoizado — loadImage del package pasa
// por el memo FIFO tope 2 de image-utils (misma firma, mismo decode).
import { canvasCon, loadImageMemo } from "./image-utils";
// KIT consenso-frankfurt-v1 (FASE 2, §3): las esquinas fiduciales del kit
// identificacion-codigo-v1 perdonan la sospecha geométrica. Mismo paquete
// src — SIN ciclo: integridad no importa completitud.
import type { EsquinasActa } from "./integridad";

// ── Geometría (mismos umbrales del guard del PR #33 — §F-1, byte a byte) ──
/** «Sobre el borde» literal — el acta BUENA del dueño enmarca apretado
 *  (0.988/0.998): un margen mayor condenaría su caso (evidencia CHANGES
 *  0-decimoquinto). */
const MARGEN_BORDE = 0.001;
/** COBERTURA mínima del quad (shoelace). Con área <30% NO se puede verificar
 *  que el acta esté completa → TODOS los lados quedan sospechosos (D2: con el
 *  brazo cobertura no se sabe dónde corta). */
// KIT e14-esquinas-suaves-v1 (Q3): 0.30 → 0.25 — ALINEADA con QUAD_MIN_AREA_
// RATIO=0.25 del detection-worker (el worker ya considera válido desde 25%).
// El header documentaba la «VENTANA DE MUERTE 25-30%»: actas completas a
// distancia cómoda quedaban sospechosas en 25-30% y morían. Hoy la sospecha
// solo dispara el análisis de tinta, pero seguía generando medición/ruido de
// log gratuito. 25-30% vuelve a ser quad SANO (D4: camino feliz, costo 0).
const AREA_MINIMA = 0.25;

// ── Análisis de tinta al filo (D5) ──
/** Franja EXTERIOR medida: 0-2% del lado (mínimo 3 px — fotos chicas). */
const FRANJA_EXTERIOR = 0.02;
const MIN_FRANJA_PX = 3;
/** Ancho del canvas de análisis (~320 px — §3a; presupuesto <30 ms p95 §3d). */
const ANCHO_ANALISIS = 320;
/** Tinta = luminancia < 128 (mismos pesos 0.299/0.587/0.114 del core). */
const TINTA_LUMA_OSCURA = 128;
/** Umbral de CONDENA (D5): densidad de tinta en la franja ≥ 20%. */
const UMBRAL_TINTA_FILO = 0.2;
/** Umbral del ESCUDO anti-fondo (D10): franja ≥ 85% oscura = fondo/sombra
 *  uniforme incluida por el warp, NO tinta cortada. */
const UMBRAL_FONDO = 0.85;
/** §7 (warp degenerado): recorte inservible (<80 px de lado útil, decode
 *  fallido o sin ctx) → la sospecha geométrica SE MANTIENE como condena
 *  (igual que hoy — conservador). */
const LADO_UTILIZABLE_MIN = 80;

/** Lados del recorte (Norte=arriba, Sur=abajo, Este=derecha, Oeste=izquierda)
 *  — el quad llena el recorte (fotoProcesada ES el interior del warp), así
 *  que cada lado del quad ES un lado de la imagen. */
type Lado = "N" | "S" | "E" | "O";
const ORDEN_LADOS: Lado[] = ["N", "S", "E", "O"];

/** Resultado del guard (§3a + escudo D10). `densidades` en % (0-100), una por
 *  lado sospechoso EN EL MISMO ORDEN de `sospecha`. */
export interface ResultadoCompletitud {
  /** Decisión final del guard: false SOLO si tinta cortada confirmada (o
   *  recorte inservible con sospecha — §7). */
  completa: boolean;
  /** Lados sospechosos p.ej. "S|E" (campo `borde=` del log §3c); "" sin
   *  sospecha (AC8: log como hoy). */
  sospecha: string;
  /** Condena: tinta impresa cortada al filo en algún lado sospechoso. */
  tintaFilo: boolean;
  /** Densidad de tinta medida por lado sospechoso, en % (franja=[...] log). */
  densidades: number[];
  /** Escudo D10 activado: alguna franja sospechosa ≥85% (fondo/sombra). */
  fondo: boolean;
  // KIT e14-esquinas-suaves-v1 (Q1): lados perdonados por par fiducial
  // ("N|O") — evidencia para el log (token perdon=). "" si no hubo perdón.
  perdonLado: string;
}

/** Área del cuadrilátero (shoelace — robusta al orden de las esquinas).
 *  CÓPIA VERBATIM del guard del PR #33 (bridge esActaCompleta L136-143). */
function areaDeQuad(quad: Quad): number {
  let dobleArea = 0;
  for (let i = 0; i < quad.length; i++) {
    const p = quad[i];
    const q = quad[(i + 1) % quad.length];
    dobleArea += p.x * q.y - q.x * p.y;
  }
  return Math.abs(dobleArea) / 2;
}

/** Brazo BORDE (D2): los lados cuya esquina toca el filo (≤0.001/≥0.999).
 *  Una esquina en una esquina del frame toca DOS lados — ambos sospechosos. */
function ladosAlBorde(quad: Quad): Lado[] {
  const set = new Set<Lado>();
  for (const p of quad) {
    if (p.y <= MARGEN_BORDE) set.add("N");
    if (p.y >= 1 - MARGEN_BORDE) set.add("S");
    if (p.x >= 1 - MARGEN_BORDE) set.add("E");
    if (p.x <= MARGEN_BORDE) set.add("O");
  }
  return ORDEN_LADOS.filter((l) => set.has(l));
}

/**
 * MOTOR DE TINTA COMPARTIDO (KIT e14-gate-v2 G1) — un solo criterio para
 * TODA medición de tinta sobre la fotoProcesada: decodifica a canvas
 * ~320 px (§3a) y expone `densidadDe(sx, sy, sw, sh)` — fracción de píxeles
 * con tinta (luma<128, mismos pesos 0.299/0.587/0.114 del core) sobre
 * COORDENADAS DE PÍXEL del canvas de análisis (cw×ch). Consumidores:
 *  · medirTintaAlFilo (este archivo) — franjas 0-2% del filo (GUARD-BORDE).
 *  · medirZonaVotos (./marcadores) — zona de votos del E-14 (GATE v2).
 * Cero duplicación (verificación obligatoria del kit). Presupuesto <30 ms
 * p95 (§3d) — el decode/downscale es el MISMO de siempre.
 * `utilizable: false` ante cualquier fallo de decode/canvas o recorte
 * degenerado (<80 px de lado útil — §7) — cada consumidor decide.
 */
interface MotorTinta {
  utilizable: boolean;
  /** Dimensiones (px) del canvas de análisis. */
  cw: number;
  ch: number;
  /** Densidad 0-1 de tinta (luma<128) en el rectángulo pedido (px). */
  densidadDe: (sx: number, sy: number, sw: number, sh: number) => number;
}

export async function motorTinta(fotoProcesada: string): Promise<MotorTinta> {
  const noUtilizable: MotorTinta = {
    utilizable: false,
    cw: 0,
    ch: 0,
    densidadDe: () => 0,
  };
  try {
    const img = await loadImageMemo(fotoProcesada);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return noUtilizable;
    const escala = ANCHO_ANALISIS / w;
    const cw = Math.max(1, Math.round(w * escala));
    const ch = Math.max(1, Math.round(h * escala));
    if (cw < LADO_UTILIZABLE_MIN || ch < LADO_UTILIZABLE_MIN) {
      return noUtilizable; // warp degenerado (§7)
    }
    const canvas = canvasCon(cw, ch); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return noUtilizable;
    ctx.drawImage(img, 0, 0, cw, ch);

    /** Densidad (0-1) de tinta en el rectángulo pedido — recorrido por
     *  líneas (columnas para N/S, filas para E/O): el promedio de fracciones
     *  por línea ES la densidad de la franja completa (líneas de igual largo)
     *  y tolera artefactos locales de la compresión JPEG de cámara. */
    const densidadDe = (sx: number, sy: number, sw: number, sh: number): number => {
      const franja = ctx.getImageData(sx, sy, sw, sh);
      const data = franja.data;
      let oscuras = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < TINTA_LUMA_OSCURA) oscuras += 1;
      }
      return oscuras / (sw * sh);
    };
    return { utilizable: true, cw, ch, densidadDe };
  } catch {
    return noUtilizable;
  }
}

/**
 * Densidad de tinta (luma < 128) en la franja EXTERIOR 0-2% de cada lado
 * sospechoso, sobre el MOTOR COMPARTIDO motorTinta (mismo decode ~320 px).
 * Muestreo por líneas/columnas (D5): la densidad es el promedio de las
 * franjas medidas — tolera la compresión JPEG de cámara (el análisis corre
 * sobre fotoProcesada ya binarizada por el filtro b/n del pipeline).
 * Devuelve `utilizable: false` ante cualquier fallo de decode/canvas o
 * recorte degenerado (§7) — el consumidor mantiene la condena geométrica.
 */
async function medirTintaAlFilo(
  fotoProcesada: string,
  lados: Lado[],
): Promise<{ utilizable: boolean; densidades: number[] }> {
  const motor = await motorTinta(fotoProcesada);
  if (!motor.utilizable) return { utilizable: false, densidades: [] };
  const { cw, ch, densidadDe } = motor;
  const franjaH = Math.max(MIN_FRANJA_PX, Math.round(ch * FRANJA_EXTERIOR));
  const franjaW = Math.max(MIN_FRANJA_PX, Math.round(cw * FRANJA_EXTERIOR));

  const densidades: number[] = [];
  for (const lado of lados) {
    if (lado === "N") {
      densidades.push(densidadDe(0, 0, cw, franjaH));
    } else if (lado === "S") {
      densidades.push(densidadDe(0, ch - franjaH, cw, franjaH));
    } else if (lado === "O") {
      densidades.push(densidadDe(0, 0, franjaW, ch));
    } else {
      densidades.push(densidadDe(cw - franjaW, 0, franjaW, ch));
    }
  }
  return { utilizable: true, densidades: densidades.map((d) => d * 100) };
}

/**
 * KIT consenso-frankfurt-v1 (FASE 2, §3): los fiduciales PERDONAN al guard
 * geométrico — helper ÚNICO aplicado a TODOS los desenlaces del análisis:
 * 4 marcas presentes = el papel está DEMOSTRADO entero dentro del cuadro
 * (ANALISIS §5.1 — ese era su propósito original) → la sospecha geométrica
 * NO condena aunque haya tinta al filo (la «tinta al filo» es contenido
 * pegado al borde del papel, no recorte). `sospecha`, `tintaFilo`,
 * `densidades` y `fondo` se conservan para el log (el escudo D10/techo 7.9
 * sigue activo en el bridge: fondo en el warp sigue molesto, no es recorte).
 * // Fuente: §0-F2 — la acta perfecta de Frankfurt 746 encuadrada al filo
 * (hábito del dueño) condenaba INCOMPLETA 6.4 OBLIGATORIO REPETIR FOTO:
 * la franja exterior 0-2% mezclaba grietas de MESA oscura con papel y la
 * densidad caía en la zona 20-85% del escudo. Conservador: un recorte REAL
 * con las 4 marcas visibles no existe (si vieras las 4 marcas, el papel
 * está entero) — y el kit 118 sigue atrapando recortes de CONTENIDO por
 * OCR de secciones, sin cambio.
 */
function perdonadaSiPapelEntero(
  r: ResultadoCompletitud,
  esquinas?: EsquinasActa | null,
): ResultadoCompletitud {
  if (
    !r.completa &&
    esquinas &&
    esquinas.tl &&
    esquinas.tr &&
    esquinas.bl &&
    esquinas.br
  ) {
    return { ...r, completa: true };
  }
  return r;
}

// KIT e14-esquinas-suaves-v1 (Q1): ¿el LADO sospechoso tiene su PAR fiducial
// completo? Las marcas viven DENTRO del papel (y 2.2-5.2% sup · 97.6-97.9%
// inf) — ambas visibles = el borde de ese lado está demostrado dentro del
// cuadro. Un recorte REAL de ese lado cortaría las marcas (no existen las 4
// marcas en un recorte real — FASE 2; por lado es la misma prueba).
function ladoConParFiducial(lado: Lado, e: EsquinasActa | null | undefined): boolean {
  if (!e) return false;
  if (lado === "N") return e.tl && e.tr;
  if (lado === "S") return e.bl && e.br;
  if (lado === "O") return e.tl && e.bl;
  return e.tr && e.br; // E
}

/**
 * GUARD-BORDE (D1) — tabla de decisión §2:
 *  | Geometría                          | Tinta al filo        | Resultado            |
 *  | Sana (sin filo ∧ área ≥30%)        | — (ni se analiza)    | COMPLETA (costo 0)   |
 *  | Sospechosa (alBorde ∨ área <30%)   | NO en lados sospech. | COMPLETA → gate (cura) |
 *  | Sospechosa                         | SÍ (≥20%, D5)        | INCOMPLETA → veto 6.4 |
 *  | Sospechosa + franja ≥85% (D10)     | fondo, NO tinta      | COMPLETA → gate techo 7.9 |
 *  | Sospechosa condenada + 4 fiduciales (FASE 2) | — | COMPLETA (perdón — log conserva la evidencia) |
 * Camino frío (D4): quad sano → SIN decodificación ni análisis (cero costo).
 * `esquinas` (opcional, FASE 2): null o con faltantes → comportamiento
 * EXACTO de hoy (la tinta decide).
 */
export async function verificarCompletitud(
  quad: Quad,
  fotoProcesada: string,
  esquinas?: EsquinasActa | null,
): Promise<ResultadoCompletitud> {
  const porBorde = ladosAlBorde(quad);
  const cobertura = areaDeQuad(quad) < AREA_MINIMA;
  // D2 — señal POR LADO: brazo BORDE → solo los lados con esquina al filo;
  // brazo COBERTURA (área <30%) → los 4 lados (no se sabe dónde corta).
  const sospechosos = cobertura ? ORDEN_LADOS : porBorde;
  if (sospechosos.length === 0) {
    // Quad sano: la sospecha se levanta sin análisis (D4 — camino feliz).
    return {
      completa: true,
      sospecha: "",
      tintaFilo: false,
      densidades: [],
      fondo: false,
      perdonLado: "",
    };
  }
  const sospecha = sospechosos.join("|");
  const analisis = await medirTintaAlFilo(fotoProcesada, sospechosos);
  if (!analisis.utilizable) {
    // §7 (warp degenerado / decode imposible): la sospecha geométrica SE
    // MANTIENE como condena, igual que hoy (comportamiento del PR #33) —
    // salvo 4 fiduciales presentes (FASE 2: papel entero demostrado).
    // KIT e14-esquinas-suaves-v1 (Q1): rama degenerada SIN cambio — sin
    // medición no hay perdón por lado (conservador); el perdón total 4/4
    // de FASE 2 se conserva aquí.
    return perdonadaSiPapelEntero(
      {
        completa: false,
        sospecha,
        tintaFilo: true,
        densidades: [],
        fondo: false,
        perdonLado: "",
      },
      esquinas,
    );
  }
  // D10 primero (escudo): franja ≥85% = fondo/sombra incluida por el warp —
  // ese lado NO condena. Condena (D5): densidad ≥20% — PERO KIT e14-esquinas-
  // suaves-v1 (Q1): el LADO con su par fiducial presente se PERDONA (papel
  // demostrado entero — la tinta al filo es del impreso, no del recorte).
  let tintaFilo = false;
  let fondo = false;
  const perdonados: string[] = [];
  for (let i = 0; i < sospechosos.length; i++) {
    const d = analisis.densidades[i];
    if (d >= UMBRAL_FONDO * 100) {
      fondo = true;
      continue;
    }
    if (d < UMBRAL_TINTA_FILO * 100) continue;
    if (ladoConParFiducial(sospechosos[i], esquinas)) {
      perdonados.push(sospechosos[i]);
      continue;
    }
    tintaFilo = true;
  }
  // KIT e14-esquinas-suaves-v1 (Q1): el perdón por lado RELAJA al perdón
  // total 4/4 de FASE 2 (queda subsumido — si TODOS los lados quedan
  // perdonados, tintaFilo=false → completa). `perdonadaSiPapelEntero` NO se
  // borra: la usa la rama degenerada (!analisis.utilizable).
  return {
    completa: !tintaFilo,
    sospecha,
    tintaFilo,
    densidades: analisis.densidades,
    fondo,
    perdonLado: perdonados.join("|"),
  };
}
