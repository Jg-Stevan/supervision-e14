/**
 * pipeline-comun.ts — R7c (M6-fin): la UNA implementación de los cuerpos
 * gemelos restantes de `pipeline()`/`pipelineRecorte()` de
 * scanner-core-bridge.ts (mapa de cabecera del bridge, PENDIENTE r7c).
 *
 * Patrón EntradaDesenlace (R7a): las diferencias LEGÍTIMAS entre los dos
 * sitios entran EXPLÍCITAS como campos tipados de cada helper — un cambio
 * futuro de criterio compila o falla en ambos sitios, no diverge en silencio
 * (el modo de fallo del bug F0.2 rev.1). Lo COMÚN vive una sola vez aquí.
 *
 * Transcripciones literales (origen = scanner-core-bridge.ts en la base de
 * R7c, commit 710f8c6):
 *   · senalDeContenido — L265-273 (era module-private del bridge; R7a §10.2
 *     la lista como gemelo «senalDeContenido/ocrLegible ×2»).
 *   · fmtClasif        — L368-384 (ídem: solo la consumían los 2 logs).
 *   · el resto son la composición EXACTA de las líneas gemelas de cada
 *     bloque (banda dirigida L982-991/L1623-1629 · esquinas e71
 *     L910-912/L1651-1653 · veto L1099-1101/L1662-1663 · señales de texto
 *     L1014-1044/L1689-1724 · evidencia-borde L1162-1169/L1762-1769 ·
 *     payload del diagnóstico L1191-1235/L1787-1829 · cola del log de
 *     auditoría L1259-1281/L1851-1867).
 *
 * PURO salvo los 2 helpers que orquestan I/O ya existente (banda → ocrBanda;
 * esquinas → esquinasDeActa): mismos awaits que hoy, NINGUNO nuevo. Sin
 * estado de módulo. El log de auditoría se compone con el MISMO orden de
 * tokens (contrato D51: solo AÑADIR al final).
 */
import { ocrTextIsValid } from "@jg-stevan/scanner-core/ocr";
import type { Quad } from "@jg-stevan/scanner-core/types";
import { ocrBanda } from "./ocr-escalonado-runner";
import { faltaSeccionInferior, PATRON_CABECERA, tipoDeBanda, type ClasificacionE14 } from "./clasificador";
import {
  contrasteEfectivoDe,
  esquinasDeActa,
  scoreDeCalidad,
  type InfoCrop,
  type PageQualityV2,
} from "./calidad";
import { lazoPerdonadoPorLectura, senalDeLectura, type SenalLectura } from "./senal-lectura";
import {
  ESQUINAS_OK,
  cuatroEsquinasFaltan,
  ladoEsquinaFaltante,
  trazaEsquinas,
  type EsquinasActa,
} from "./integridad";
import type { ResultadoCompletitud } from "./completitud";
import { construirDiagnosticoDelDesenlace } from "./auditoria";
import type { SalidaDesenlace } from "./gate";
import type { Acta, DiagnosticoActa } from "./types";

// ─── Señal de contenido (§D1 SPEC-e14-score-ocr) — MOVIDA del bridge ────────

/**
 * §D1 (SPEC-e14-score-ocr): SEÑAL DE CONTENIDO del acta — se calcula DESPUÉS
 * del OCR + clasificación. El score del dueño mide el RECONOCIMIENTO («el
 * score se basa en el reconocimiento del acta por ocr y que el acta esté
 * completa»), no solo las métricas fotográficas. Señales: cabecera E-14 o
 * alguna lectura cruda del clasificador (MESA/tipo). `ocrTextIsValid` NO es
 * señal (la bolsa de papas lo pasa con texto ficticio del empaque).
 */
export function senalDeContenido(texto: string, clasificacion: ClasificacionE14): boolean {
  const p = clasificacion.parciales;
  return (
    PATRON_CABECERA.test(texto) ||
    p?.cabecera === true ||
    (p?.mesa != null && Number.isFinite(p.mesa)) ||
    p?.tipo != null
  );
}

// ─── Traza de clasificación (formato D51) — MOVIDA del bridge ───────────────

/** Traza §4.6: clasif={dep:88,mun:335,zon:05,std:02,mesa:001,tipo:T,nivel:AUTO}. */
export function fmtClasif(c: ClasificacionE14 | null): string {
  if (!c) return "sin-clasificar";
  const tipo = c.tipo === "TRANSMISION" ? "T" : c.tipo === "DELEGADOS" ? "D" : "-";
  // KIT actas-vivas-paginas-v1 (FASE B): página en la traza de auditoría —
  // «pag:2/2» leída · «pag:?» DESCONOCIDA (el hueco irá al primer libre).
  const pag = c.pagina ? `${c.pagina.index}/${c.pagina.total}` : "?";
  // KIT identificacion-codigo-v1 (Task 120): consenso del código + avisos de
  // los cruces en la traza de auditoría (cod:crudo · av:A+B+C).
  const cod = c.codigoUnico ? `,cod:${c.codigoUnico.crudo}` : "";
  const av = c.avisos?.length ? `,av:${c.avisos.join("+")}` : "";
  return (
    `dep:${c.departamento?.codigo ?? "?"},mun:${c.municipio?.codigo ?? "?"},` +
    `zon:${c.zona?.codigo ?? "?"},std:${c.puesto?.codigo ?? "?"},` +
    `mesa:${c.mesa !== null ? String(c.mesa).padStart(3, "0") : "?"},` +
    `pag:${pag},tipo:${tipo},nivel:${c.nivel}${cod}${av}`
  );
}

// ─── Banda dirigida (KIT consenso-frankfurt-v1 FASE 4 §5) ───────────────────

/** Segunda pasada OCR del crop invertido ×2 cuando el OCR completo no leyó
 *  la banda (sello blanco-sobre-negro §0-F4) — UNA sola vez, ANTES de
 *  clasificarCabecera; el tiempo se suma a ms.ocr (es OCR).
 *  Diferencia legítima del sitio EXPLÍCITA: `simular` — escaneo pasa
 *  `!opciones.simular` (SIM: OMITIDO, AC6 — cero llamadas a ocrBanda en SIM,
 *  chips 8.2/7.0/4.3 intactos); el recorte pasa `false` (no hay SIM).
 *  Devuelve el texto con `"\n" + banda` AÑADIDO (byte a byte como hoy,
 *  aunque la banda venga vacía) y muta `ms.ocr` como hoy. */
export async function bandaDirigidaSiFalta(o: {
  texto: string;
  fotoProcesada: string;
  simular: boolean;
  /** Acumulador de tiempos del sitio — se muta `ms.ocr` (la banda ES OCR). */
  ms: { ocr: number };
}): Promise<string> {
  if (o.simular || tipoDeBanda(o.texto) !== null) return o.texto;
  const tBanda = performance.now();
  const textoConBanda = o.texto + "\n" + (await ocrBanda(o.fotoProcesada));
  o.ms.ocr += performance.now() - tBanda;
  return textoConBanda;
}

// ─── Esquinas fiduciales + e71 (KIT consenso-frankfurt-v1 / e71-consolidación)

/** Medición ÚNICA de esquinas fiduciales (helper único esquinasDeActa §4.4)
 *  + lado faltante + traza del log. Diferencia legítima del sitio EXPLÍCITA:
 *  `simular` — escaneo: SIM mide ESQUINAS_OK neutro y traza "sim" (assets de
 *  la demo sin marcas calibradas — chips 8.2/7.0/4.3 intactos, §2.2 del kit);
 *  recorte: `false` (siempre real). <80×120 → null (n/d — jamás condena). */
export async function medirEsquinasSitio(o: {
  fotoProcesada: string;
  simular: boolean;
}): Promise<{ esquinas: EsquinasActa | null; ladoEsquina: string | null; trazaEsq: string }> {
  const esquinas = o.simular ? ESQUINAS_OK : await esquinasDeActa(o.fotoProcesada);
  const ladoEsquina = esquinas ? ladoEsquinaFaltante(esquinas) : null;
  const trazaEsq = o.simular ? "sim" : trazaEsquinas(esquinas);
  return { esquinas, ladoEsquina, trazaEsq };
}

/** e71 (P10) — VETO 4/4 FIDUCIALES (kit e71-consolidación): las 4 marcas
 *  ausentes (`esquinas=FALTA_tl+tr+bl+br`) → el papel NO está demostrado
 *  entero. El criterio vive en `cuatroEsquinasFaltan` (helper ÚNICO — ambos
 *  pipelines ya lo consultaban); este helper hace EXPLÍCITA la diferencia
 *  legítima del sitio: `aplica` — escaneo: `!opciones.simular` (en SIM
 *  esquinas=ESQUINAS_OK → el veto es inalcanzable, guard explícito) ·
 *  recorte: `true` (siempre mide real). La LECTURA perdona al marco impreso,
 *  pero NUNCA a la ausencia total de fiduciales (evidencia física manda). */
export function vetoCuatroEsquinas(o: { esquinas: EsquinasActa | null; aplica: boolean }): boolean {
  return o.aplica && cuatroEsquinasFaltan(o.esquinas);
}

// ─── Señales de texto + score base (clasificación → lazo → score §4.1) ──────

/** La COMPOSICIÓN de señales idéntica en los 2 pipelines (pitfall §9.9):
 *  RECORTADA por OCR de secciones (faltaSeccionInferior) OR esquina faltante
 *  sin perdón de lazo (kit lectura-perdona-lazo §4-B — la señal de secciones
 *  NUNCA se perdona) · ocrLegible · señal de CONTENIDO §D1 · señal de
 *  LECTURA v2 · piso-10 (KIT e14-luz-sim-puntos-v1 T-D: LAS 4 condiciones de
 *  §4.1, todas o ninguna — G3) · score BASE de scoreDeCalidad (antes de los
 *  caps — el caller conserva `scoreVisual = scoreBase`).
 *  TODO puro y síncrono: los awaits del sitio (divipol/marcadores) quedan en
 *  el caller en el MISMO orden relativo que hoy. */
export function caracterizarLectura(o: {
  texto: string;
  clasificacion: ClasificacionE14;
  esquinas: EsquinasActa | null;
  ladoEsquina: string | null;
  calidad: PageQualityV2;
}): {
  faltaSeccion: boolean;
  lazoPerdonado: boolean;
  recortada: boolean;
  ocrLegible: boolean;
  senalActa: boolean;
  senal: SenalLectura;
  pisoPerfecto: boolean;
  scoreBase: number;
} {
  // KIT actas-vivas-paginas-v1 (FASE C): RECORTADA por OCR de secciones —
  // P1 sin «SUMA TOTAL» / P≥2 sin «FIRMA»; página DESCONOCIDA nunca condena.
  const faltaSeccion = faltaSeccionInferior(o.texto, o.clasificacion.pagina);
  const lazoPerdonado = lazoPerdonadoPorLectura(o.esquinas, o.texto, faltaSeccion);
  const recortada = faltaSeccion || (o.ladoEsquina !== null && !lazoPerdonado);
  const ocrLegible = ocrTextIsValid(o.texto);
  const senalActa = senalDeContenido(o.texto, o.clasificacion);
  const senal = senalDeLectura(o.texto, o.clasificacion.parciales);
  const pisoPerfecto =
    senal.nivel === "FUERTE" &&
    senal.anclas >= 8 &&
    o.calidad.sharpnessHi >= 90 &&
    o.calidad.contrastPapel >= 75;
  const scoreBase = scoreDeCalidad(o.calidad, {
    ocrLegible,
    identificada: o.clasificacion.nivel === "AUTO",
    conSenal: senalActa,
    pisoPerfecto,
  });
  return { faltaSeccion, lazoPerdonado, recortada, ocrLegible, senalActa, senal, pisoPerfecto, scoreBase };
}

// ─── Log de auditoría (formato D51 — CONGELADO, solo AÑADIR al final) ───────

/** Segmento `borde=…tintaFilo=…franja=[…]fondo=…perdon=…` del log §3c — SOLO
 *  cuando hubo sospecha geométrica (AC8: sin sospecha, "" — el log queda como
 *  hoy). KIT e14-esquinas-suaves-v1 (Q1): token `perdon=` AL FINAL del
 *  segmento. Escaneo pasa `verificacionResuelta` (null → "") · recorte pasa
 *  su verificación no-null — MISMA expresión. */
export function evidenciaBordeDe(v: ResultadoCompletitud | null): string {
  return v && v.sospecha
    ? ` borde=${v.sospecha}` +
        ` tintaFilo=${v.tintaFilo}` +
        ` franja=[${v.densidades.map((d) => d.toFixed(1)).join(",")}]` +
        ` fondo=${v.fondo}` +
        (v.perdonLado ? ` perdon=${v.perdonLado}` : "")
    : "";
}

/** COLA COMÚN del log de auditoría de los 2 pipelines — del token `votos=`
 *  hasta el final (ClasifDebil incluido). El ORDEN de los tokens comunes
 *  queda congelado en ESTA única implementación (un cambio futuro compila
 *  una vez y aplica a ambos sitios — el modo de fallo del pitfall §9.9).
 *  Las diferencias legítimas del sitio entran explícitas:
 *   · evidenciaSitio — escaneo: `${evidenciaAsis}${evidenciaBorde}` ·
 *     recorte: `${evidenciaBordeRecorte}${manual/escudo-manual}` (tokens
 *     insertados tras `esquinas=`, contiguos como hoy).
 *   · extrasSim — escaneo: ` sim=…` (§D3, solo SIM con chip) · recorte: "".
 *   · extrasDeteccion — escaneo: ` detectOrigen=…`/` detectReintento=1`
 *     (KIT e14-masiva-ux-v1 T1.3) · recorte: "" (no corre detección).
 *  El head («[e14] pipeline …» / «[e14] recorte …» con decode/detect)
 *  queda EN EL CALLER: es la parte genuinamente distinta. */
export function trazaDesenlaceComun(o: {
  votosSkipPag2: boolean;
  densidadVotosPct: number;
  marcadoresOk: boolean;
  recortada: boolean;
  ladoEsquina: string | null;
  lazoPerdonado: boolean;
  trazaEsq: string;
  evidenciaSitio: string;
  quad: Quad;
  quadOrigen: DiagnosticoActa["captura"]["quadOrigen"];
  pisoPerfecto: boolean;
  score: number;
  filtro: string;
  ocrIn: string;
  confOcr: number | null;
  detOcr: number;
  recOcr: number;
  senal: SenalLectura;
  desenlace: SalidaDesenlace;
  infoCrop: InfoCrop;
  calidad: PageQualityV2;
  ocrLegible: boolean;
  extrasSim: string;
  extrasDeteccion: string;
  diag: DiagnosticoActa | null;
}): string {
  // FASE S (§S.1.5): crop= bbox real usado por calidadDeActa (px) — WxH;
  // `full` si el fallback al frame completo se activó (diagnóstico en campo).
  const cropLog = o.infoCrop.fallback ? "full" : `${o.infoCrop.w}x${o.infoCrop.h}`;
  return (
    `votos=${o.votosSkipPag2 ? "skip-pag2" : `${o.densidadVotosPct.toFixed(1)}%`}` +
    `${o.marcadoresOk ? "" : " SIN_VOTOS"}` +
    `${o.recortada ? " recortada=1" : ""}` +
    `${o.ladoEsquina ? ` lado=${o.ladoEsquina}` : ""}` +
    `${o.lazoPerdonado ? " lazo=perdonado" : ""}` +
    ` esquinas=${o.trazaEsq}${o.evidenciaSitio} ` +
    `quad=[${o.quad.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}] ` +
    `piso10=${o.pisoPerfecto ? 1 : 0}${o.quadOrigen ? ` origen=${o.quadOrigen}` : ""} ` +
    `score=${o.score} filtro=${o.filtro} ocrIn=${o.ocrIn} ` +
    // KIT e14-motor-rapidocr-v1 (PROD-2 §4.2): token grep-able del motor de
    // producción, junto al ocrIn= del PROD-1 (conf/det/rec del OCR principal
    // — capturados antes de la banda).
    `ocr=rapidocr conf=${o.confOcr != null ? o.confOcr.toFixed(2) : "?"} ` +
    `det=${Math.round(o.detOcr)}ms rec=${Math.round(o.recOcr)}ms ` +
    // KIT e14-score-lectura-v1 (REBASE): señal de lectura v2 en la traza.
    `lectura=${o.senal.nivel} anclas=${o.senal.anclas} ` +
    `piso=${o.score >= 8.5 && o.senal.nivel === "FUERTE"} ` +
    `clasif={${fmtClasif(o.desenlace.clasificacion)}} ` +
    `crop=${cropLog} ` +
    `metricas={sharpness:${o.calidad.sharpness} brightness:${o.calidad.brightness} ` +
    `contrast:${o.calidad.contrast} contEff:${contrasteEfectivoDe(o.calidad, o.ocrLegible)} ` +
    `level:${o.calidad.level}})${o.extrasSim}${o.diag ? " diag=1" : ""}` +
    o.extrasDeteccion +
    // KIT e63f-autoenvio-v1 (F0): balde fino del no-AUTO — token ADITIVO AL
    // FINAL (contrato D51). Ausente si AUTO o sin motivo de los listados
    // (puesto-lugar/tipo/mesa-registro/ruta).
    `${o.desenlace.clasificacion?.clasifDebil ? ` ClasifDebil=${o.desenlace.clasificacion.clasifDebil}` : ""}`
  );
}

// ─── Payload del registro del desenlace (R7b M4 + R7c: los 2 call-sites) ────

/** Monta el payload de `construirDiagnosticoDelDesenlace` para AMBOS sitios:
 *  las ~35 líneas de campos IDÉNTICOS viven UNA vez aquí (transcripción del
 *  call-site del escaneo) y las 8 diferencias legítimas del sitio entran
 *  EXPLÍCITAS en `sitio` (las mismas que ya documentaba auditoria.ts):
 *   · actaId — escaneo: "" (se parcha con el id REAL tras construirActa) ·
 *     recorte: acta.id (el acta existe — identidad conservada).
 *   · intento/maxIntentos — escaneo: opciones.* · recorte: acta.*.
 *   · gateMarco — escaneo: veredicto del marco impreso (null en fotos/SIM) ·
 *     recorte: undefined (la clave viaja AUSENTE byte a byte).
 *   · fondo — escaneo: verificacionResuelta?.fondo ?? false · recorte:
 *     verificacion.fondo.
 *   · filtro — escaneo: filtroActa ("bw"/"original" del paso 3) · recorte:
 *     el filtro del acta conservado.
 *   · decodeMs/detectMs — escaneo: medidos (null honesto si no corrió) ·
 *     recorte: null/null (esa ruta no mide decode/detección).
 *  El caller conserva su GUARDA de sitio y el try/catch (observación PASIVA
 *  §9.7: si falla, el desenlace NO se toca → diag=null). */
export function construirDiagnosticoSitio(args: {
  // comunes (expresiones idénticas en los 2 call-sites)
  desenlace: SalidaDesenlace;
  rechazoFinal: Acta["rechazo"];
  scoreVisual: number;
  scoreFinal: number;
  techosDiag: string[];
  calidad: PageQualityV2;
  /** Texto OCR POST-banda — alimenta lecturaChars y ocrValido. */
  texto: string;
  ocrLegible: boolean;
  senal: SenalLectura;
  senalActa: boolean;
  completa: boolean;
  recortada: boolean;
  ladoEsquina: string | null;
  marcadores: { densidadVotosPct: number; hayVotos: boolean };
  marcadoresOk: boolean;
  votosSkipPag2: boolean;
  procesadaVacia: boolean;
  motor: string;
  infoCrop: InfoCrop;
  quad: Quad;
  quadOrigen: DiagnosticoActa["captura"]["quadOrigen"];
  ms: { proceso: number; procesoBw: number; procesoOcr: number; calidad: number; ocr: number; total: number };
  // diferencias legítimas del sitio (explícitas — ver cabecera)
  sitio: {
    actaId: string;
    intento: number;
    maxIntentos: number;
    gateMarco: "completo" | "ceñido" | "cortado" | "no-encontrado" | null | undefined;
    fondo: boolean;
    filtro: string;
    decodeMs: number | null;
    detectMs: number | null;
  };
}): DiagnosticoActa {
  return construirDiagnosticoDelDesenlace({
    actaId: args.sitio.actaId,
    intento: args.sitio.intento,
    maxIntentos: args.sitio.maxIntentos,
    status: args.desenlace.status,
    rechazo: args.rechazoFinal,
    scoreVisual: args.scoreVisual,
    scoreFinal: args.scoreFinal,
    techos: args.techosDiag,
    calidad: args.calidad,
    ocrLegible: args.ocrLegible,
    lecturaChars: args.texto.length,
    senalLectura: { nivel: args.senal.nivel, anclas: args.senal.anclas },
    senalActa: args.senalActa,
    ocrValido: ocrTextIsValid(args.texto),
    completa: args.completa,
    // D63-C (T2.3): veredicto del marco impreso (null en fotos/SIM);
    // `undefined` preserva la AUSENCIA de la clave en el recorte.
    gateMarco: args.sitio.gateMarco,
    fondo: args.sitio.fondo,
    recortada: args.recortada,
    ladoEsquina: args.ladoEsquina ?? null,
    votos: {
      densidadPct: args.marcadores.densidadVotosPct,
      skipPag2: args.votosSkipPag2,
      ok: args.marcadoresOk,
    },
    procesadaVacia: args.procesadaVacia,
    clasifNivel: args.desenlace.clasificacion?.nivel ?? "—",
    motor: args.motor,
    filtro: args.sitio.filtro,
    crop: { w: args.infoCrop.w, h: args.infoCrop.h, fallback: args.infoCrop.fallback },
    quad: args.quad,
    quadOrigen: args.quadOrigen,
    msProceso: args.ms.proceso,
    msProcesoBw: args.ms.procesoBw,
    msProcesoOcr: args.ms.procesoOcr,
    msCalidad: args.ms.calidad,
    msOcr: args.ms.ocr,
    msTotal: args.ms.total,
    // D61 — decode/detect YA se medían (traza de consola) — ahora PERSISTEN.
    // null honesto si la fase no corrió — jamás inventar.
    decodeMs: args.sitio.decodeMs,
    detectMs: args.sitio.detectMs,
  });
}

