/**
 * KIT e14-orientacion-auto-v1 (§2) — probe de orientación por confianza de
 * rec + anclas de lectura. Causa raíz del informe del dueño 19/10 (12
 * RECHAZADAS score 4.9, «BAJO — NO SE RECONOCE INFORMACIÓN», lectura DEBIL:
 * actas físicamente ROTADAS 90°/180° al fotografiarlas — tira Consulado de
 * Egipto, KIT 399). El EXIF ya lo aplica el core (F-IMPORT) — NO es bug de
 * decode: el acta está puesta de costado/cabeza-abajo al fotografiarla. El
 * cls PP-OCR solo corrige 180° DE LÍNEA con umbral conservador sobre crops
 * de baja calidad — nunca 90°/270° ni garantiza el 180° de página.
 *
 * Principio (§2.1): NO correr 4 OCR completos. El det ya encontró las cajas —
 * el texto de una acta rotada en bloque usa LAS MISMAS cajas, solo que los
 * crops salen girados (girar el crop == girar la página y recortar la caja
 * transformada). Basta sondear con rec sobre unos pocos crops girados:
 *
 *   score(r) = anclas(r)·2 + confMedia(r)·(charsLegibles(r)/40)  [tope 10]
 *
 * guard absoluto (§2.1 paso 2): score(r) < 1.0 Y confMedia(r) < 0.55 → NO
 * candidata (jamás inventar). Decisión (paso 3): r* = argmax de candidatas;
 * aplicar SOLO si score(r*) ≥ score(0) + MARGEN (1.5) y r* ≠ 0.
 *
 * Atajos (paso 3): acta VERTICAL (tira E-14, H>W) → caso probable 180°
 * (sondea 180 primero; si dispara contra 0°, ni sondea 90/270) · HORIZONTAL
 * (W>H) → sospecha 90/270 alta (sondea esas dos primero, 180 al final).
 * score(0) SIEMPRE se sondea (baseline del MARGEN — el ejemplo de traza del
 * kit trae las cuatro).
 *
 * Presupuesto (§2.2 / D56 §3 T3): PROBE_BUDGET_MS = 12000 — si a mitad de
 * probe se pasa, aborta y sigue con 0° (comportamiento de hoy; el 4000
 * original NUNCA alcanzó el primer desafiante en la HP 4 cores del dueño:
 * det1920 3037 ms + rec0 ~3000 ms = 6030 > 4000 → aplicado=0 garantizado).
 * SIM: el probe NO corre
 * (guard en el bridge — chips 8.2/7.0/4.3 intactos). Sin recorte: corre igual
 * (no hay quad, pero la rotación del contenido es independiente — §2.2; en
 * ESTA base sinRecorte solo existe en SIM → el guard del bridge lo cubre).
 *
 * Traza en línea PROPIA (§2.1 paso 5 — los instrumentos del dueño parsean por
 * prefijo; NO mezclar campos con pipeline/recorte; solo AÑADIR):
 *   [e14] orientacion crop=WxH rot=R probe={0:a,90:b,180:c,270:d} anclasR=n confR=0.xx aplicado=0|1 ms=NNN cortes=sana|presupuesto|vacio|completo
 * (en probe={} aparecen SOLO las rotaciones sondeadas — los atajos cortan;
 * rot=R es la ganadora, con anclasR/confR de ELLA; aplicado=0 cuando no rota.
 * D56 §3 T4: cortes= es ADITIVO AL FINAL — sana = salió por el atajo T1
 * (lectura a 0° no-DEBIL) · presupuesto = aborto por budget · vacio = det
 * sin cajas · completo = el probe terminó su decisión (incluye el atajo
 * MARGEN que ya decidió ganadora — contrato D51: solo AÑADIR; los campos
 * previos NO cambian de forma).
 * Sin línea si el probe ni siquiera corrió (SIM o error duro de det/init —
 * catch general: el probe JAMÁS tumba el pipeline, §5).
 *
 * KIT e70-orientacion-condicional-v1 (P4.1 del dueño): el EXIF de cámara YA
 * NO omite el sondeo por sí solo — dice cómo estaba el TELÉFONO, no cómo
 * quedó el acta (evidencia: 3 fotos landscape con EXIF rechazadas score 4.9,
 * anclas 0, cabeceraE14 false). El bridge entra en MODO CONFIRMACIÓN
 * (opciones.confirmar): la pasada 0° de este probe (det cap rápido + rec
 * sobre los crops) ES la «primera pasada de OCR rápido» del criterio — quad
 * del WORKER (no del fallback sobel) + anclas >= 3 Y conf >= 0.7 a 0° ⇒
 * orientación CONFIRMADA ⇒ cortes=confirmada (sin challengers). Cualquier
 * condición fallida (anclas 0, conf 0.3, quad de fallback) ⇒ sondeo completo
 * 0/90/180/270 y el MARGEN decide. En este modo el atajo T1 sana NO aplica
 * (su MEDIA por chars>=150 perdonaba lecturas basura de actas de lado — el
 * criterio del dueño es EL gate). Sin opciones → comportamiento de hoy byte
 * a byte (recorte manual y flujos sin EXIF). Traza: exif=0|1 ADITIVO AL
 * FINAL (1 = el caller pidió modo confirmación).
 *
 * PURO orquestación sobre rapidocr.ts (sin sesión nueva, sin descargas —
 * MISMO singleton ORT, §2.2). La rotación JAMÁS cambia el score por sí misma:
 * solo habilita que el OCR lea de verdad; los caps/gate existentes mandan
 * después (escudo-fondo, recortada, sin-votos — §2.2).
 *
 * KIT REPARTE-3-AGENTES-v1 (Agente A, Cambio 1) — MINI-PROBE A 320 px:
 * el probe era el costo oculto gigante del lote 1 en campo (5.3–13.6 s por
 * acta, ~488 s de ~10 min; 46/46 actas lo pagaron, incluidas las que luego
 * murieron DUPLICADAS). Ahora sondea PRIMERO una MINIATURA (lado mayor
 * PROBE_MINI_LADO=320, JPEG q0.92, aspecto preservado — helpers del repo:
 * loadImageMemo + canvasCon) y solo si su desenlace alcanza la confianza del
 * FALLO SEGURO (miniaturaConfiada: corte sana/confirmada, o rotación
 * aplicada con ≥2 anclas y conf ≥0.6) manda ESA decisión; en CUALQUIER otro
 * caso (vacío, débil, presupuesto, error de la miniatura) se corre el sondeo
 * a resolución original — el comportamiento de HOY byte a byte — y ESA es la
 * decisión. Estructura que garantiza la igualdad: UNA sola función de sondeo
 * (sondeoDe) decide en ambos caminos — mismos crops, mismo orden D62, mismos
 * atajos, mismo MARGEN; solo cambia la resolución de la fuente. La miniatura
 * SUB-LEE (crops chicos → conf menor), así que la dirección del sesgo es
 * conocida: hacia «no alcanza confianza» → camino original (conservador).
 * Campo NUEVO ADITIVO en el resultado: orientacionProbeEscala (320 = decidió
 * la miniatura; >320 = decidió la re-corrida original; ≤320 = la foto ya era
 * pequeña — un solo sondeo). Traza: campo `escala=` ADITIVO AL FINAL de la
 * línea de siempre (D51/D56 — los campos previos no cambian de forma). El
 * presupuesto PROBE_BUDGET_MS=12000 cubre el probe COMPLETO (t0 compartido).
 */

import { canvasCon, loadImageMemo } from "./image-utils"; // SPRINT-A A3/A1 — factory de canvas + decode memo
import { ANCLAS_LECTURA, norm, senalDeLectura } from "./senal-lectura";
import {
  rapidOcrCropsOrientacion,
  rapidOcrInit,
  rapidOcrRecLote,
} from "./ocr/rapidocr";
import { logger } from "../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)

type Rotacion = 0 | 90 | 180 | 270;

export interface ProbeOrientacion {
  rot: Rotacion; // ganadora (aplicada o 0 si no rota)
  aplicado: boolean;
  scores: Partial<Record<Rotacion, number>>;
  anclas: Partial<Record<Rotacion, number>>;
  conf: Partial<Record<Rotacion, number>>;
  ms: number;
  // KIT REPARTE-3-AGENTES-v1 (Agente A, Cambio 1) — campo NUEVO ADITIVO:
  // lado mayor (px) del canvas sobre el que se produjo la decisión final.
  //  320  → decidió la MINIATURA (camino mini, confianza suficiente — ver
  //         PROBE_MINI_* abajo).
  //  >320 → la miniatura NO alcanzó confianza (fallo seguro) → la decisión
  //         es del sondeo a resolución original (comportamiento de HOY).
  //  ≤320 → la foto ya era pequeña: UN solo sondeo (byte-idéntico a hoy).
  // Cero consumidores rotos: el bridge solo lee rot/aplicado/ms; el informe
  // (territorio del Agente C) puede anotarlo después (append-only).
  orientacionProbeEscala: number;
  // WAVE2 A1 — sub-decisión de la miniatura descartada por el FALLO SEGURO
  // (datos de campo para la calibración wave 3 — jamás cambia la decisión de
  // HOY). Solo en el camino fallo seguro CON miniatura corrida; ausente si
  // mini==null (det/rec de la mini falló o no corrió), en el camino confiado
  // (escala=320 — la mini YA es la decisión) y en foto pequeña (≤320).
  orientacionProbeMini?: {
    rot: Rotacion;
    aplicado: boolean;
    corte: "sana" | "presupuesto" | "completo" | "confirmada";
    conf: number | null;
    anclas: number | null;
  };
}

/** e70 (P4.1) — opciones del probe. Su PRESENCIA activa el MODO
 *  CONFIRMACIÓN (solo el branch exif-camara del bridge): el criterio del
 *  dueño reemplaza al atajo T1 sana como ÚNICO gate a 0°. quadWorker=false
 *  → sin atajo («el quad se detectó mal» — fallback sobel fabricó la
 *  geometría → sondeo completo). Ausente → comportamiento de hoy byte a
 *  byte (recorte manual, flujos sin EXIF). */
export interface OpcionesProbeOrientacion {
  confirmar?: { quadWorker: boolean };
}

/** §2.2 — tope duro del probe: a mitad, abortar y seguir con 0° (hoy).
 *  D56 §3 T3: 4000 → 12000 — presupuesto HONESTO. El caso roto del dueño
 *  (HP 4 cores: det a 1920 = 3037 ms) ya agotaba 4000 con el baseline a 0°.
 *  Con det del probe a DET_CAP_RAPIDO (T2) el caso roto cabe: det ~1.2 s +
 *  rec0 ~3 s + rec90 ~3 s + rec270 ~3 s ≈ 10.2 s < 12 s. Solo lo pagan actas
 *  con lectura DEBIL a 0° (las sanas salen por el atajo T1 en ~4 s). */
const PROBE_BUDGET_MS = 12000;
/** §2.1 paso 3 — margen mínimo sobre score(0) para aplicar la rotación. */
const MARGEN_ORIENTACION = 1.5;
/** §2.1 paso 1 — K crops repartidos por el acta. */
const PROBE_K_CROPS = 8;
/** Tope del score por rotación (§2.1 «con tope por rotación»: 5 anclas ya
 *  saturan la señal; el MARGEN compara igual en 0..10). */
const TOPE_SCORE = 10;

// ─── KIT REPARTE-3-AGENTES-v1 (Agente A, Cambio 1): MINI-PROBE a 320 px ─────
// El probe de HOY corre det (cap 1280) + rec ×4 rotaciones sobre la foto a
// resolución completa — el paso más caro invisible del pipeline (lote 1 del
// dueño: 5.3–13.6 s por acta, ~488 s del lote, 46/46 actas lo pagaron). La
// miniatura hace det+rec ~50-100× más barato; el FALLO SEGURO devuelve el
// comportamiento de HOY (sondeo a resolución original) en cuanto la
// miniatura no alcanza confianza — la decisión final JAMÁS cambia por este
// cambio: o la miniatura decide con evidencia fuerte, o decide la pasada
// completa de siempre.

/** Lado mayor MÁXIMO de la miniatura (px, aspecto preservado). 320 = un E-14
 *  completo cabe con sus líneas largas legibles por det (las cajas existen;
 *  el rec sobre crops tan chicos SÍ pierde conf — de ahí el fallo seguro). */
const PROBE_MINI_LADO = 320;
/** FALLO SEGURO — umbral conservador Nº 1: la rotación GANADORA de la
 *  miniatura necesita ≥ 2 anclas de ANCLAS_LECTURA (cabecera E-14,
 *  CONSULADO/PAÍS/ZONA/PUESTO/MESA, código 1D — matches regex estructurales,
 *  no ruido) para confiarse. Con 1 ancla o 0 → re-corrida a resolución
 *  original (comportamiento de HOY). */
const PROBE_MINI_ANCLAS_MIN = 2;
/** FALLO SEGURO — umbral conservador Nº 2: conf media del rec ≥ 0.6 en la
 *  ganadora. El rec de producción sobre texto legible da 0.8-0.97; 0.6 es el
 *  piso conservador (por debajo → la miniatura está adivinando → original). */
const PROBE_MINI_CONF_MIN = 0.6;

// ─── KIT e14-probe-adaptativo-v1 (D62 T1): ganador persistente del sondeo ───
// El patrón del escáner/fotógrafo del dueño es consistente (lote 15:04: CCW →
// ganador rot=270): con el ganador sondeado ANTES que el resto, cada acta
// rotada se ahorra una pasada completa (~2-4 s). Persistencia en localStorage
// (clave e14-probe-ganador-v1) con try/catch TOTAL — modo privado / cuota /
// SSR / ambiente sin storage ⇒ sin ganador ⇒ comportamiento de hoy byte a
// byte (el probe JAMÁS tumba el pipeline, §5).

const CLAVE_GANADOR = "e14-probe-ganador-v1";
const ANILLO_TOPE = 10;

/** [D62-anillo-inicio]
 * Anillo de los ÚLTIMOS 10 desenlaces del probe con aplicado=1 (solo rot 90/
 * 180/270 — 0 nunca se aplica). El ganador se DERIVA del anillo: la rot más
 * frecuente; empate ⇒ la de desenlace más reciente. Formato compacto
 * [{"rot":270,"ts":<epoch>}…] — el kit pedía ~100 bytes con {rot,ts,n}
 * agregado; el anillo es lo mínimo que respeta la ventana de 10 + empate
 * (un agregado solo no puede expulsar al 11.º más viejo) — ver REPORTE §4. */
interface DesenlaceRot {
  rot: Rotacion;
  ts: number;
}

function anilloGanadorLeer(): DesenlaceRot[] {
  try {
    const raw = localStorage.getItem(CLAVE_GANADOR);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const anillo: DesenlaceRot[] = [];
    for (const e of parsed) {
      if (e && typeof e === "object") {
        const r = (e as { rot?: unknown }).rot;
        const t = (e as { ts?: unknown }).ts;
        if ((r === 90 || r === 180 || r === 270) && typeof t === "number") {
          anillo.push({ rot: r, ts: t });
        }
      }
    }
    return anillo.slice(-ANILLO_TOPE); // anillo: solo los últimos 10
  } catch {
    return [];
  }
}

/** Ganador actual del anillo (más frecuente; empate ⇒ más reciente) o null.
 *  La recencia se deriva de la POSICIÓN en el anillo (el último índice es el
 *  desenlace más nuevo) — robusta aunque dos desenlaces caigan en el mismo
 *  ms (Date.now()).
 *  KIT e14-orientacion-qr-v1 — EXPORTADO ADITIVO: la brújula QR lo lee para
 *  ORDENAR las esquinas del rescate (lección bench v8.3: el orden fijo por
 *  forma del warp erró 4/4; el anillo es señal de campo real). */
export function ganadorPersistente(): Rotacion | null {
  try {
    const anillo = anilloGanadorLeer();
    if (anillo.length === 0) return null;
    const freq = new Map<Rotacion, { n: number; ultimaPos: number }>();
    anillo.forEach((d, i) => {
      const f = freq.get(d.rot);
      if (f) {
        f.n += 1;
        f.ultimaPos = i;
      } else {
        freq.set(d.rot, { n: 1, ultimaPos: i });
      }
    });
    let ganador: Rotacion | null = null;
    for (const [rot, f] of freq) {
      if (ganador === null) {
        ganador = rot;
        continue;
      }
      const g = freq.get(ganador)!;
      if (f.n > g.n || (f.n === g.n && f.ultimaPos > g.ultimaPos)) ganador = rot;
    }
    return ganador;
  } catch {
    return null;
  }
}

/** Registrar UN desenlace aplicado (aplicado=1). Un fallo del probe (catch →
 * null), el caso vacío o aplicado=0 NUNCA escriben (kit T1.4).
 * KIT e14-orientacion-qr-v1 — EXPORTADO ADITIVO: la brújula QR registra SU
 * rotación aplicada (mismo contrato «aplicado=1» — alimenta el orden del
 * sondeo y de las esquinas del rescate). */
export function anilloGanadorRegistrar(rot: Rotacion): void {
  try {
    const anillo = anilloGanadorLeer();
    anillo.push({ rot, ts: Date.now() });
    while (anillo.length > ANILLO_TOPE) anillo.shift(); // expulsa el más viejo
    localStorage.setItem(CLAVE_GANADOR, JSON.stringify(anillo));
  } catch {
    // sin storage (modo privado/cuota): el sondeo sigue con el orden de hoy
  }
}
/** [D62-anillo-fin] */

/** Dimensiones de canvas o imagen (para girar tanto crops como dataURLs). */
function dimsDe(s: HTMLCanvasElement | HTMLImageElement): { w: number; h: number } {
  return s instanceof HTMLCanvasElement
    ? { w: s.width, h: s.height }
    : { w: s.naturalWidth, h: s.naturalHeight };
}

/** Girar una fuente canvas/img por 90/180/270° (misma equivalencia §2.1:
 *  girar el crop == girar la página y recortar la caja transformada). */
function girarFuente(
  src: HTMLCanvasElement | HTMLImageElement,
  rot: Rotacion,
): HTMLCanvasElement {
  if (rot === 0) {
    // Normaliza a canvas (el caller trabaja SIEMPRE con canvases).
    const { w, h } = dimsDe(src);
    const mismo = canvasCon(w, h); // SPRINT-A A3 — factory
    mismo.getContext("2d")!.drawImage(src, 0, 0);
    return mismo;
  }
  const { w, h } = dimsDe(src);
  // SPRINT-A A3 — factory (mismo estado final: lienzo limpio del tamaño
  // correcto — 180: w×h; 90/270 intercambian dimensiones — antes de girar).
  const tmp = canvasCon(rot === 180 ? w : h, rot === 180 ? h : w);
  const ctx = tmp.getContext("2d")!;
  if (rot === 180) {
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    ctx.drawImage(src, 0, 0);
    return tmp;
  }
  if (rot === 90) {
    ctx.translate(tmp.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, tmp.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return tmp;
}

/** Aplicar (§2.1 paso 4): girar UNA dataURL — canvas rotate + re-encode
 *  JPEG q0.92 (kit literal). JAMÁS lanza: si el re-encode falla devuelve la
 *  entrada sin tocar (el pipeline sigue con 0° — comportamiento de hoy, §5). */
export async function rotarDataUrl(
  dataUrl: string,
  rot: Rotacion,
): Promise<string> {
  if (rot === 0) return dataUrl;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("ORIENTACION_NO_DECODE"));
      img.src = dataUrl;
    });
    return girarFuente(img, rot).toDataURL("image/jpeg", 0.92);
  } catch {
    return dataUrl;
  }
}

/** Desenlace CRUDO de UN sondeo (det + rec por rotación) sobre UNA fuente.
 *  Compartido por el camino miniatura y el camino de resolución original —
 *  la MISMA función decide en ambos: la decisión de la miniatura es la
 *  decisión de la resolución completa salvo por la RESOLUCIÓN de sus entradas
 *  (mismos crops, mismo orden, mismos atajos, mismo MARGEN). */
interface SondeoSalida {
  /** true = det sin cajas (traza cortes=vacio — el sondeo no puntúa). */
  vacio: boolean;
  w: number;
  h: number;
  rot: Rotacion;
  aplicado: boolean;
  scores: Partial<Record<Rotacion, number>>;
  anclas: Partial<Record<Rotacion, number>>;
  conf: Partial<Record<Rotacion, number>>;
  corte: "sana" | "presupuesto" | "completo" | "confirmada";
  orden: Rotacion[];
}

async function sondeoDe(
  rt: Awaited<ReturnType<typeof rapidOcrInit>>,
  fuente: string,
  opciones: OpcionesProbeOrientacion | undefined,
  gan: Rotacion | null,
  t0: number,
): Promise<SondeoSalida> {
  const { crops, w, h } = await rapidOcrCropsOrientacion(rt, fuente, PROBE_K_CROPS);
  if (crops.length === 0) {
    return {
      vacio: true,
      w,
      h,
      rot: 0,
      aplicado: false,
      scores: { 0: 0 },
      anclas: { 0: 0 },
      conf: { 0: 0 },
      corte: "completo",
      orden: [],
    };
  }
  const scores: Partial<Record<Rotacion, number>> = {};
  const anclas: Partial<Record<Rotacion, number>> = {};
  const conf: Partial<Record<Rotacion, number>> = {};
  // Orden de sondeo (§2.1 paso 3): 0° SIEMPRE primero (baseline del MARGEN;
  // el atajo T1 de lectura-sana depende de él — INTACTO) y luego el
  // desafiante probable según la forma de la tira.
  // D62 T1 — orden ADAPTATIVO: con ganador persistente (aplicado=1 reciente)
  // se sondea [0, ganador, resto…] (el resto conserva el orden actual minus
  // ganador); sin ganador ⇒ el orden de HOY sin cambio (rama h > w respetada).
  // (El orden se deriva de w/h de la FUENTE del sondeo — miniatura y original
  // comparten aspecto ⇒ mismo orden en ambos caminos.)
  const base: Rotacion[] = h > w ? [0, 180, 90, 270] : [0, 90, 270, 180];
  const orden: Rotacion[] =
    gan === null || gan === 0
      ? base
      : [0, gan, ...base.filter((r) => r !== 0 && r !== gan)];
  let mejor: Rotacion | null = null;
  // D56 §3 T4 — por qué terminó el sondeo (solo para la traza, aditivo).
  // e70: + "confirmada" (criterio del dueño — valor ADITIVO, los previos
  // no cambian de forma; D51).
  let corte: "sana" | "presupuesto" | "completo" | "confirmada" = "completo";
  for (const rot of orden) {
    // §2.2 presupuesto: a mitad de probe, abortar y seguir con 0° (hoy).
    // El t0 es COMPARTIDO con el camino miniatura: el techo de 12 s es el
    // del probe COMPLETO (mini + posible re-corrida), no por pasada.
    if (rot !== 0 && performance.now() - t0 > PROBE_BUDGET_MS) {
      corte = "presupuesto";
      break;
    }
    // 0° usa los crops DIRECTOS (rec no muta canvases — no hace falta copia).
    const girados = rot === 0 ? crops : crops.map((c) => girarFuente(c, rot));
    const lineas = await rapidOcrRecLote(rt, girados);
    const texto = lineas.map((l) => l.texto).join("\n");
    const confMedia =
      lineas.length === 0
        ? 0
        : lineas.reduce((s, l) => s + l.conf, 0) / lineas.length;
    const nAnclas = ANCLAS_LECTURA.filter(([, re]) => re.test(texto)).length;
    const chars = norm(texto).replace(/ /g, "").length;
    scores[rot] = Math.min(TOPE_SCORE, nAnclas * 2 + confMedia * (chars / 40));
    anclas[rot] = nAnclas;
    conf[rot] = confMedia;
    if (rot === 0) {
      // e70 — MODO CONFIRMACIÓN (P4.1): el criterio del dueño es EL gate —
      // quad del WORKER + anclas >= 3 Y conf >= 0.7 a 0° ⇒ la primera
      // pasada rápida CONFIRMÓ la orientación ⇒ sin challengers. En este
      // modo T1 sana NO aplica (su MEDIA por chars>=150 perdonaba lecturas
      // basura de actas fotografiadas de lado — el falso positivo exacto
      // del skip por EXIF).
      if (opciones?.confirmar) {
        if (
          opciones.confirmar.quadWorker &&
          nAnclas >= 3 &&
          confMedia >= 0.7
        ) {
          corte = "confirmada";
          break;
        }
        continue;
      }
      // D56 §3 T1 — atajo de lectura-sana: si el texto a 0° YA se lee,
      // ninguna rotación puede necesitar aplicarse y ninguna debe arriesgar
      // la lectura (rotar es riesgo puro). El acta sana sale en ~4 s sin
      // sondear 90/270/180; la rotada del dueño leyó anclas0=0 chars=9 →
      // DEBIL → sigue a los challengers ✓. Regresión nula esperada: el
      // MARGEN ya protegía parcialmente; esto lo hace explícito y barato.
      if (senalDeLectura(texto).nivel !== "DEBIL") {
        corte = "sana";
        break;
      }
      continue;
    }
    // Guard absoluto (§2.1 paso 2): score<1.0 Y conf<0.55 → NO candidata.
    const candidata = (scores[rot] ?? 0) >= 1.0 || (conf[rot] ?? 0) >= 0.55;
    if (!candidata) continue;
    if (mejor === null || (scores[rot] ?? 0) > (scores[mejor] ?? 0)) mejor = rot;
    // Atajo (§2.1 paso 3): el desafiante ya dispara contra 0° → dejar de
    // sondear (ahorra las rotaciones restantes).
    if ((scores[mejor] ?? 0) >= (scores[0] ?? 0) + MARGEN_ORIENTACION) break;
  }
  // Liberar los canvases transitorios (§2.1 paso 4 — sin retener memoria).
  crops.length = 0;
  const aplicado =
    mejor !== null && (scores[mejor] ?? 0) >= (scores[0] ?? 0) + MARGEN_ORIENTACION;
  const rot: Rotacion = aplicado ? mejor! : 0;
  return { vacio: false, w, h, rot, aplicado, scores, anclas, conf, corte, orden };
}

/** FALLO SEGURO del mini-probe — ¿la decisión de la miniatura alcanza
 *  confianza para manda? SOLO tres desenlaces se confían (todo lo demás →
 *  re-corrida a resolución original, el comportamiento de HOY):
 *  · corte "sana": 0° leyó texto no-DEBIL (chars ≥ 150 o cabecera E-14 o
 *    ≥2 anclas — senalDeLectura). La miniatura SUB-LEE respecto a la
 *    original: si ELLA ya lee, la original lee ≥ ⇒ también "sana" ⇒
 *    aplicado=0 en ambos.
 *  · corte "confirmada": el gate del dueño (quadWorker + anclas ≥ 3 Y
 *    conf ≥ 0.7 a 0°) — su evidencia ya es fuerte por construcción.
 *  · aplicado=1 con ganadora FUERTE: ≥ PROBE_MINI_ANCLAS_MIN anclas Y
 *    ≥ PROBE_MINI_CONF_MIN conf en la rotación ganadora (señal estructural
 *    de rotación real — el texto de una acta rotada solo se lee girado).
 *  aplicado=0 débil, corte "vacio" y "presupuesto" NUNCA se confían: la
 *  miniatura sub-lee ⇒ un «no rotar» suyo podría esconder una rotación que
 *  la resolución completa sí encontraría (dirección peligrosa). */
function miniaturaConfiada(s: SondeoSalida): boolean {
  if (s.vacio) return false;
  if (s.corte === "sana" || s.corte === "confirmada") return true;
  if (
    s.aplicado &&
    (s.anclas[s.rot] ?? 0) >= PROBE_MINI_ANCLAS_MIN &&
    (s.conf[s.rot] ?? 0) >= PROBE_MINI_CONF_MIN
  ) {
    return true;
  }
  return false;
}

/** Miniatura JPEG (q0.92 — misma calidad del re-encode de rotarDataUrl) a
 *  PROBE_MINI_LADO del lado mayor, aspecto preservado. Reúsa los helpers del
 *  repo: decode vía loadImageMemo (LRU compartido — el decode que ya usaba
 *  cropsOrientacion) y canvasCon (factory SPRINT-A A3); el suavizado es el
 *  default del navegador — la MISMA receta de decodeImagenLru/analizarPixeles
 *  (fidelidad byte-idéntica del reescalado). null ante CUALQUIER fallo → el
 *  sondeo corre a resolución original (comportamiento de HOY, jamás tumba). */
async function miniaturaDataUrlDe(fotoOcr: string): Promise<string | null> {
  try {
    const img = await loadImageMemo(fotoOcr);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const escala = Math.min(1, PROBE_MINI_LADO / Math.max(w, h));
    const ancho = Math.max(1, Math.round(w * escala));
    const alto = Math.max(1, Math.round(h * escala));
    const cv = canvasCon(ancho, alto);
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, ancho, alto);
    const url = cv.toDataURL("image/jpeg", 0.92);
    cv.width = 0; // liberar el canvas transitorio (§2.1 — sin retener memoria)
    cv.height = 0;
    return url;
  } catch {
    return null;
  }
}

/** Traza del sondeo DECISOR (formato §2.1 paso 5 — los instrumentos del dueño
 *  parsean por prefijo; UNA línea por probe, los campos previos NO cambian de
 *  forma). `escala=` es ADITIVO AL FINAL (D51/D56): lado mayor del canvas que
 *  produjo la decisión (320 = camino miniatura; >320 = re-corrida original;
 *  ≤320 = foto ya pequeña — un solo sondeo). */
function trazarSondeo(s: SondeoSalida, ms: number, escala: number, gan: Rotacion | null, conExif: boolean): void {
  if (s.vacio) {
    logger.info(
      `[e14] orientacion crop=${s.w}x${s.h} rot=0 probe={0:0.00} anclas0=0 conf0=0.00 aplicado=0 ms=${ms} cortes=vacio escala=${escala}`,
    );
    return;
  }
  const probeTxt = (Object.keys(s.scores) as unknown as Rotacion[])
    .map((r) => `${r}:${(s.scores[r] ?? 0).toFixed(2)}`)
    .join(",");
  logger.info(
    `[e14] orientacion crop=${s.w}x${s.h} rot=${s.rot} probe={${probeTxt}} anclas${s.rot}=${s.anclas[s.rot] ?? 0} conf${s.rot}=${(s.conf[s.rot] ?? 0).toFixed(2)} aplicado=${s.aplicado ? 1 : 0} ms=${ms} cortes=${s.corte} orden=${s.orden.join(",")} gan=${gan ?? "-"} exif=${conExif ? 1 : 0} escala=${escala}`,
  );
}

function resultadoDe(s: SondeoSalida, ms: number, escala: number): ProbeOrientacion {
  if (s.vacio) {
    return { rot: 0, aplicado: false, scores: { 0: 0 }, anclas: { 0: 0 }, conf: { 0: 0 }, ms, orientacionProbeEscala: escala };
  }
  return { rot: s.rot, aplicado: s.aplicado, scores: s.scores, anclas: s.anclas, conf: s.conf, ms, orientacionProbeEscala: escala };
}

/** Probe de orientación (§2.1). Devuelve null SOLO si no pudo correr
 *  (fallo de init/det — el pipeline sigue con 0°; sin traza, «el probe ni
 *  siquiera corrió»). Con det sin cajas: traza con 0:0.00 y aplicado=0
 *  (AC-4 — la traza está en el 100% de las no-SIM donde el probe corrió;
 *  NUNCA se alimenta a rec un lote vacío).
 *
 *  KIT REPARTE-3-AGENTES-v1 (Agente A, Cambio 1) — MINI-PROBE: sondea PRIMERO
 *  una miniatura a PROBE_MINI_LADO (320 px del lado mayor). Si su desenlace
 *  alcanza la confianza del fallo seguro (miniaturaConfiada), ESA es la
 *  decisión (ahorro ~5-13 s/acta). Si NO la alcanza (o la miniatura no pudo
 *  construirse/correr), se corre el sondeo a resolución original — el
 *  comportamiento de HOY byte a byte — y ESA es la decisión. El presupuesto
 *  de 12 s cubre TODO el probe (t0 compartido por ambas pasadas). */
export async function probeOrientacion(
  fotoOcr: string,
  opciones?: OpcionesProbeOrientacion,
): Promise<ProbeOrientacion | null> {
  const t0 = performance.now();
  try {
    const rt = await rapidOcrInit(); // MISMO singleton (§2.2 — sin sesiones nuevas)
    // D62 T1 — el ganador se lee UNA vez: miniatura y original sondean con el
    // MISMO orden (mismo aspecto ⇒ mismo orden de todas formas).
    const gan = ganadorPersistente();
    // ¿La foto ya es una «miniatura» (lado mayor ≤ PROBE_MINI_LADO)? Escalarla
    // no cambia nada: UN solo sondeo sobre la fuente real — byte-idéntico a
    // HOY (el det a cap 1280 no la reduce).
    const base = await loadImageMemo(fotoOcr);
    const ladoMayor = Math.max(base.naturalWidth || 0, base.naturalHeight || 0);
    if (ladoMayor > 0 && ladoMayor <= PROBE_MINI_LADO) {
      const s = await sondeoDe(rt, fotoOcr, opciones, gan, t0);
      const ms = Math.round(performance.now() - t0);
      trazarSondeo(s, ms, Math.max(s.w, s.h), gan, !!opciones?.confirmar);
      if (s.aplicado) anilloGanadorRegistrar(s.rot); // D62 T1.4
      return resultadoDe(s, ms, Math.max(s.w, s.h));
    }
    // Camino MINIATURA (cualquier fallo aquí → null → camino original).
    let mini: SondeoSalida | null = null;
    const miniUrl = await miniaturaDataUrlDe(fotoOcr);
    if (miniUrl) {
      try {
        mini = await sondeoDe(rt, miniUrl, opciones, gan, t0);
      } catch {
        mini = null; // det/rec de la miniatura falló → resolución original
      }
    }
    if (mini && miniaturaConfiada(mini)) {
      const ms = Math.round(performance.now() - t0);
      trazarSondeo(mini, ms, PROBE_MINI_LADO, gan, !!opciones?.confirmar);
      if (mini.aplicado) anilloGanadorRegistrar(mini.rot); // D62 T1.4
      return resultadoDe(mini, ms, PROBE_MINI_LADO);
    }
    // FALLO SEGURO — la miniatura no alcanzó confianza (o no corrió): el
    // sondeo a resolución original de SIEMPRE decide (comportamiento de HOY).
    const full = await sondeoDe(rt, fotoOcr, opciones, gan, t0);
    const ms = Math.round(performance.now() - t0);
    trazarSondeo(full, ms, Math.max(full.w, full.h), gan, !!opciones?.confirmar);
    if (full.aplicado) anilloGanadorRegistrar(full.rot); // D62 T1.4
    // WAVE2 A1 — sub-decisión de la miniatura descartada por el fallo seguro
    // (datos para calibración wave 3 — jamás cambia la decisión de HOY).
    const res = resultadoDe(full, ms, Math.max(full.w, full.h));
    if (mini) {
      res.orientacionProbeMini = {
        rot: mini.rot,
        aplicado: mini.aplicado,
        corte: mini.corte,
        conf: mini.conf[mini.rot] ?? null,
        anclas: mini.anclas[mini.rot] ?? null,
      };
    }
    return res;
  } catch {
    return null; // §5: el probe jamás tumba el pipeline (comportamiento de hoy)
  }
}
