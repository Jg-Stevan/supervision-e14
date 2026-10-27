/**
 * rapidocr.ts — módulo compartido — motor de producción (PROD-2, kit
 * e14-motor-rapidocr-v1) — MOVE literal desde informe/rapidocr.ts
 * (pitfall §9.8 del kit: mismo código, sin «reordenar» ni «limpiar»).
 * KIT e14-fuera-informes-v1 (R-1.5): fuera la instrumentación del informe
 * (import ../informe/telemetria + TODAS las llamadas evento() — el console
 * info de celda queda; cero efecto en el OCR).
 *
 * RapidOCR PP-OCRv4 en el navegador — puerto fiel de rapidocr_onnxruntime
 * 1.4.4 (config del bench: det_limit_side_len=1920, det_limit_type='max').
 * SIN OpenCV (el build vendored del repo es un binding custom sin
 * minAreaRect): el postproceso de detección (DB) es JS puro —
 * binarización 0.3 → dilate 2×2 → CCL 4-conectividad → convex hull →
 * min-area rect por barrido de aristas → box_score_fast → unclip →
 * esquinas TL,TR,BR,BL → mapeo inverso a coords de la fuente.
 *
 * Determinismo: executionProviders ["wasm"] (igual que el bench); WebGPU
 * disponible en el dispositivo queda anotado en el log del entorno pero NO
 * se usa.
 */

// KIT e14-observabilidad-v1 (A1-C7): tope de threads OCR = flag del dueño
// (kill switch MANUAL — ocrThreadsTope, default 4 = el literal que vivía
// aquí). La app NUNCA cambia reglas de negocio sola (D6).
// KIT e14-gama-adaptativa-v1 (D74): la LECTURA es EFECTIVA — flagsMasiva-
// Efectivos() baja el tope a 2 en gama BAJO adaptativa (deja un núcleo al
// hilo UI); el override manual del dueño manda y el flag adaptativo OFF
// devuelve el flag puro de siempre.
import { flagsMasivaEfectivos } from "../gama";

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// ─── Tipos ORT mínimos (el módulo se importa dinámicamente) ─────────────────

interface OrtValue {
  dims: readonly number[];
  data: Float32Array | Int32Array | Uint8Array | BigInt64Array;
  type: string;
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, OrtValue>): Promise<Record<string, OrtValue>>;
}
interface OrtModule {
  env: {
    wasm: {
      wasmPaths: string;
      numThreads: number;
      simd: boolean;
      proxy: boolean;
    };
  };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => OrtValue;
  InferenceSession: {
    create(uri: string, opts?: { executionProviders: string[] }): Promise<OrtSession>;
  };
}

export interface RapidOcrLinea {
  texto: string;
  conf: number;
  box: { x: number; y: number }[];
}

export interface RapidOcrResultado {
  lineas: RapidOcrLinea[];
  texto: string;
  confMedia: number;
  msDet: number;
  msCls: number;
  msRec: number;
  nBoxes: number;
}

interface RapidRuntime {
  ort: OrtModule;
  det: OrtSession;
  cls: OrtSession;
  rec: OrtSession;
  dict: string[];
}

// ─── Init (singleton — el 2.º informe no re-descarga nada) ──────────────────

let rtSingleton: Promise<RapidRuntime> | null = null;

export function rapidOcrInit(): Promise<RapidRuntime> {
  if (!rtSingleton) {
    rtSingleton = initReal().catch((e) => {
      rtSingleton = null; // reintentable
      throw e;
    });
  }
  return rtSingleton;
}

// KIT e14-prowarm-ocr-v1 (T1): pre-warm REAL de la sesión RapidOCR —
// rapidOcrInit() crea las sesiones pero NUNCA infiere; la 1.ª acta real
// pagaba ~27 s de frío (35.9 s OCR vs 8.3 s caliente, informe 19/10).
// Esto corre UNA inferencia dummy sobre canvas sintético por det+cls+rec
// y DESCARTA el resultado (§0.2). NUNCA llamar aquí a reconocerRapidOcr
// del bridge (contaminaría ultimoOcr* — §0.3): rapidOcrReconocer directo.
let prewarmHecho: Promise<boolean> | null = null;

export function rapidOcrPrecalentar(): Promise<boolean> {
  if (prewarmHecho) return prewarmHecho; // 1 sola vez por carga de página
  prewarmHecho = (async () => {
    try {
      const rt = await rapidOcrInit(); // MISMO singleton — el calor queda
      const c = canvasCon(640, 480); // SPRINT-A A3 — factory
      const ctx = ctxDe(c);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 48px monospace";
      ctx.fillText("E14 WARM-UP", 40, 120);
      ctx.font = "bold 36px monospace";
      ctx.fillText("PUESTO 01 20261019123055", 40, 240);
      ctx.fillText("TRANSMISION 98.7% 15:30:22", 40, 340);
      const dataUrl = c.toDataURL("image/png");
      const r = await rapidOcrReconocer(rt, dataUrl); // resultado DESCARTADO
      logger.info(
        `[e14-prowarm] listo det=${r.msDet}ms cls=${r.msCls}ms rec=${r.msRec}ms · ${r.nBoxes} cajas · ${r.lineas.length} líneas`,
      );
      return true;
    } catch (e) {
      // Frío como hoy: el pipeline NO depende de esto (fallback honesto).
      logger.info(
        `[e14-prowarm] fallo (continua como hoy): ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  })();
  return prewarmHecho;
}

/** D65 — KIT e14-progreso-watchdog-dedup-v1 (T1): soltar el runtime OCR
 *  cuando el watchdog mata y re-crea los workers del intento vencido.
 *  Best-effort: release() de cada sesión (det/cls/rec) SI la build de ORT
 *  lo expone (los tipos locales son mínimos), luego el singleton FUERA →
 *  la próxima rapidOcrInit() re-crea TODO (sesiones y worker proxy nuevos).
 *  El pre-warm también cae (puede volver a calentar si alguien lo llama).
 *  NOTA honesta: si el cuelgue vive DENTRO del worker proxy compartido de
 *  ORT, el runtime re-creado puede volver a colgarse → el watchdog vence
 *  otra vez (~150 s totales) y manda el veredicto honesto de siempre.
 *  NUNCA lanza: un fallo de limpieza no empeora el reintento. */
export async function rapidOcrReiniciar(): Promise<void> {
  if (!rtSingleton) return;
  try {
    const rt = await rtSingleton;
    const sesiones = [rt.det, rt.cls, rt.rec] as Array<
      OrtSession & { release?: () => unknown }
    >;
    for (const s of sesiones) {
      try {
        await s.release?.();
      } catch {
        /* sesión ya muerta — seguir con la siguiente */
      }
    }
  } catch {
    /* el singleton ya estaba roto — nada que soltar */
  }
  rtSingleton = null;
  prewarmHecho = null;
}

async function initReal(): Promise<RapidRuntime> {
  const ort = (await import("onnxruntime-web/wasm")) as unknown as OrtModule;
  ort.env.wasm.wasmPaths = `${PUBLIC_BASE}/vendor/onnxruntime/`;
  ort.env.wasm.numThreads =
    typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated
      ? // A1-C7: el `4` era el literal histórico — ahora flag del dueño
        // (default 4 → comportamiento idéntico sin overrides).
        // D74: lectura EFECTIVA — gama BAJO adaptativa ⇒ 2 hilos.
        Math.min(flagsMasivaEfectivos().ocrThreadsTope, navigator.hardwareConcurrency || 1)
      : 1;
  ort.env.wasm.simd = true;
  // KIT e14-optimizacion-v1 (T2, hallazgo #2 de AUDITORIA-e14-v1): proxy=true
  // migra det/cls/rec al worker interno de ORT — la inferencia (9.8-14.3 s)
  // deja de bloquear el main thread y el progreso de ANALIZANDO deja de
  // congelarse. MISMO EP wasm (opts de abajo), MISMO wasm, MISMO resultado.
  // numThreads queda como está: 1 en GH Pages (no hay SAB) — el proxy NO
  // requiere SAB. Revertible en 1 línea si la verificación falla (kit §3-T2.2).
  // NOTA merge D68-merge (AI Studio): el export de AI Studio trajo proxy=false
  // («error de resolución dynamic import en bundler») — workaround AMBIENTAL de
  // ese sandbox; producción (GH Pages/Vercel) verificada con proxy=true. Se
  // restaura aquí; si AI Studio lo necesita, revertir SOLO en ese entorno.
  ort.env.wasm.proxy = true;

  const opts = { executionProviders: ["wasm"] };
  const [det, cls, rec, dictResp] = await Promise.all([
    ort.InferenceSession.create(`${PUBLIC_BASE}/models/rapidocr/ch_PP-OCRv4_det_infer.onnx`, opts),
    ort.InferenceSession.create(
      `${PUBLIC_BASE}/models/rapidocr/ch_ppocr_mobile_v2.0_cls_infer.onnx`,
      opts,
    ),
    ort.InferenceSession.create(`${PUBLIC_BASE}/models/rapidocr/ch_PP-OCRv4_rec_infer.onnx`, opts),
    fetch(`${PUBLIC_BASE}/models/rapidocr/ppocr_keys.txt`),
  ]);
  if (!dictResp.ok) throw new Error(`ppocr_keys.txt HTTP ${dictResp.status}`);
  const dict = (await dictResp.text()).split("\n").filter((l) => l.length > 0);
  return { ort, det, cls, rec, dict };
}

// ─── Utilidades de imagen ───────────────────────────────────────────────────

// SPRINT-A (perf/decode-once-v1) A2: el loadImage privado (decode <img> sin
// memo — usos en reconocerRapidOcr y rapidOcrCropsOrientacion) se SUSTITUYE
// por loadImageMemo del repo: el probe de orientación y la pasada-1 del
// escalonado consumen la MISMA dataUrl → decode UNA vez (el det ya hacía HIT
// por D62 — ahora también el decode). Verificado contra la eviction tope 2:
// entre probe → pasada-1 → pasada-2 del escalonado solo viven fotoOriginal y
// fotoProcesada en la memo → la imagen del acta en vuelo NO se desaloja
// (máx 2 entradas en la ruta del OCR); el re-OCR de la banda corre DESPUÉS
// de la elección, sin dependencia con la entrada viva.
import { canvasCon, loadImageMemo } from "../image-utils";
import { logger } from "../../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)

function canvasDe(img: HTMLImageElement | HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = canvasCon(w, h); // SPRINT-A A3 — factory
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

const round32 = (v: number) => Math.max(32, Math.round(v / 32) * 32);

function ctxDe(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d no disponible");
  return ctx;
}

// ─── KIT e14-ocr-escalonado-v1 (§2.1): cap del det-preprocess (op4) ──────────
// La sesión det NO cambia (mismos pesos — el cap es del preprocess op4, NO del
// modelo ni de una sesión nueva): DET_CAP_PROD=1920 es el comportamiento de
// HOY byte a byte (config det_limit_side_len=1920, det_limit_type='max');
// DET_CAP_RAPIDO=1280 es la 1.ª pasada del OCR escalonado (banco B3 GO:
// det −56%, 120/120 votos, 0 cajas perdidas — tools/bench-det1280, PR #34).
// op1 (reduce_max_side 1920) queda INTACTO: es el preprocess fijo del paquete,
// det_limit_side_len es el parámetro que op4 implementa.
export const DET_CAP_PROD = 1920;
export const DET_CAP_RAPIDO = 1280;

// ─── KIT e14-rec-wmax480-v1 (bench v8.5): cap del ancho del tensor rec ──────
// El run() WASM del rec escala con n×wmax (floats del tensor [b,3,48,wmax]),
// NO con los píxeles del crop — medido ~0.56 ms/unidad constante en Q2–Q4
// (bench v8.5, 70 lotes). El techo 480 da: rec full media 10,733→8,729 ms
// (−19%), RapidOCR full 12,150→10,093 ms (−17%), peor caso 16.0→11.8 s
// (−26%), outliers 51.2s/41.2s/34.6s MUERTOS (max 1,760 ms) y calidad
// 7/7 gt ×4/4 intacta — tensorDeCanvases hace squish horizontal (rw=
// min(natural, targetW) con pad de ceros), NO truncado: líneas naturales
// hasta 864 sobrevivieron sin pérdida. Aplicado en AMBOS rec (producción y
// probe §2.1) para mantener el pre/post idéntico. Kill switch: REC_WMAX =
// Infinity = comportamiento anterior byte a byte.
export const REC_WMAX = 480;

// ─── Pre-det (main.py fidelidad: reduce_max → increase_min → letterbox →
//     det-preprocess round32) + registro de ops para mapear de vuelta ───────

interface OpsDet {
  w: number; // ancho final detIn
  h: number;
  /** ratio acumulado op1×op2 por eje (escala main.py preprocess). */
  ratioW: number;
  ratioH: number;
  /** padding superior del letterbox (px del espacio post-op2). */
  padTop: number;
  /** ratio del det-preprocess final (round32 sobre el padded) por eje. */
  ratioWDet: number;
  ratioHDet: number;
}

// KIT e14-ocr-escalonado-v1 (§2.1): cap PARAMETRIZABLE — default DET_CAP_PROD
// (byte a byte el flujo de hoy); el OCR escalonado pasa DET_CAP_RAPIDO en la
// 1.ª pasada.
function preDet(
  src: HTMLImageElement,
  cap: number = DET_CAP_PROD,
): { canvas: HTMLCanvasElement; ops: OpsDet } {
  let w = src.naturalWidth || src.width;
  let h = src.naturalHeight || src.height;
  let ratioW = 1;
  let ratioH = 1;

  // op1 — reduce_max_side(img, 1920): int(h*ratio) luego round32 cada lado
  if (Math.max(h, w) > 1920) {
    const ratio = 1920 / Math.max(h, w);
    const nh = round32(Math.floor(h * ratio));
    const nw = round32(Math.floor(w * ratio));
    ratioW *= nw / w;
    ratioH *= nh / h;
    w = nw;
    h = nh;
  }

  // op2 — increase_min_side(img, 30): idem con el lado menor
  if (Math.min(h, w) < 30) {
    const ratio = 30 / Math.min(h, w);
    const nh = round32(Math.floor(h * ratio));
    const nw = round32(Math.floor(w * ratio));
    ratioW *= nw / w;
    ratioH *= nh / h;
    w = nw;
    h = nh;
  }

  const imgEsc = canvasDe(src, w, h);

  // op3 — maybe_add_letterbox: h ≤ 30 o w/h > 8 → pads arriba/abajo negros.
  //   padding_h = int(abs(max(int(w/8), 30) * 2 − h) / 2)   [main.py L161-164]
  let padTop = 0;
  let canvasPadded = imgEsc;
  const widthHeightRatio = 8;
  const minHeight = 30;
  if (h <= minHeight || w / h > widthHeightRatio) {
    const newH = Math.max(Math.floor(w / widthHeightRatio), minHeight) * 2;
    padTop = Math.floor(Math.abs(newH - h) / 2);
    const padded = canvasCon(w, h + padTop * 2); // SPRINT-A A3 — factory
    const pctx = ctxDe(padded);
    pctx.fillStyle = "#000000";
    pctx.fillRect(0, 0, padded.width, padded.height);
    pctx.drawImage(imgEsc, 0, padTop);
    canvasPadded = padded;
    h = padded.height;
  }

  // op4 — det-preprocess (limit <cap> max + round32 SIEMPRE, mínimo 32) —
  //   cap=DET_CAP_PROD (1920) = producción de hoy byte a byte; 1280 = 1.ª
  //   pasada del escalonado (banco B3: −56% det, 0 votos perdidos).
  const ratioDet = Math.max(h, w) > cap ? cap / Math.max(h, w) : 1;
  const dh = round32(Math.floor(h * ratioDet));
  const dw = round32(Math.floor(w * ratioDet));
  const detIn = canvasDe(canvasPadded, dw, dh);

  return {
    canvas: detIn,
    ops: { w: dw, h: dh, ratioW, ratioH, padTop, ratioWDet: dw / w, ratioHDet: dh / h },
  };
}

/** Mapea puntos del detIn a coords de la FUENTE (inversa de las ops; clamp
 *  a bordes y redondeo — convención _get_origin_points del paquete). */
function mapearAFuente(
  p: { x: number; y: number },
  ops: OpsDet,
  srcW: number,
  srcH: number,
): { x: number; y: number } {
  // inversa secuencial: det-preprocess final (round32 sobre el padded) →
  // letterbox (−padTop) → main preprocess (op1×op2). Clamp a bordes + round
  // (convención _get_origin_points del paquete).
  const xPostPad = p.x / ops.ratioWDet;
  const yPostPad = p.y / ops.ratioHDet - ops.padTop;
  const x = xPostPad / ops.ratioW;
  const y = yPostPad / ops.ratioH;
  return {
    x: Math.max(0, Math.min(srcW, Math.round(x))),
    y: Math.max(0, Math.min(srcH, Math.round(y))),
  };
}

// ─── Post det (DBPostProcess en JS puro) ────────────────────────────────────

const DB_THRESH = 0.3;
const DB_BOX_THRESH = 0.5;
const DB_MAX_CANDIDATES = 1000;
const DB_UNCLIP_RATIO = 1.6;
const MIN_SIDE_DESCARTAR = 3;
const MIN_SIDE_TRAS_UNCLIP = 5;
const TEXT_SCORE = 0.5;

interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** ángulo del eje mayor (rad, dirección d̂). */
  theta: number;
}

/** Convex hull (monotone chain) de un conjunto de puntos. */
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** min-area rect por barrido de aristas del hull (proyectar sobre el eje de
 *  cada arista y su perpendicular; quedarse con el área mínima). */
function minAreaRect(hull: { x: number; y: number }[]): Rect | null {
  if (hull.length < 2) return null;
  let mejor: Rect | null = null;
  let mejorArea = Infinity;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len; // eje de la arista
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of hull) {
      const u = q.x * ux + q.y * uy;
      const v = -q.x * uy + q.y * ux; // perpendicular n̂ = (−uy, ux)
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (area < mejorArea) {
      mejorArea = area;
      mejor = {
        cx: ((maxU + minU) / 2) * ux + ((maxV + minV) / 2) * -uy,
        cy: ((maxU + minU) / 2) * uy + ((maxV + minV) / 2) * ux,
        w,
        h,
        theta: Math.atan2(uy, ux),
      };
    }
  }
  return mejor;
}

/** box_score_fast: media de `pred` dentro del quad (bbox + máscara por
 *  punto-en-polígono, scanline por cruce de aristas). */
function boxScoreFast(pred: Float32Array, w: number, h: number, box: { x: number; y: number }[]): number {
  let xmin = w - 1;
  let xmax = 0;
  let ymin = h - 1;
  let ymax = 0;
  for (const q of box) {
    xmin = Math.max(0, Math.min(xmin, Math.floor(q.x)));
    xmax = Math.min(w - 1, Math.max(xmax, Math.ceil(q.x)));
    ymin = Math.max(0, Math.min(ymin, Math.floor(q.y)));
    ymax = Math.min(h - 1, Math.max(ymax, Math.ceil(q.y)));
  }
  if (xmax < xmin || ymax < ymin) return 0;
  let suma = 0;
  let cuenta = 0;
  for (let y = ymin; y <= ymax; y++) {
    // intersecciones de la scanline y con las aristas del polígono
    const xs: number[] = [];
    for (let i = 0; i < box.length; i++) {
      const a = box[i];
      const b = box[(i + 1) % box.length];
      if (a.y === b.y) continue;
      const yMin = Math.min(a.y, b.y);
      const yMax = Math.max(a.y, b.y);
      if (y + 0.5 >= yMin && y + 0.5 < yMax) {
        xs.push(a.x + ((y + 0.5 - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(xmin, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(xmax, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) {
        if (x >= xs[k] && x <= xs[k + 1]) {
          suma += pred[y * w + x];
          cuenta++;
        }
      }
    }
  }
  return cuenta === 0 ? 0 : suma / cuenta;
}

/** Esquinas de un rect expandido (centro + ángulo), ordenadas TL,TR,BR,BL
 *  (convención get_mini_boxes: sort por x, pares por y). */
function esquinasRect(r: Rect): { x: number; y: number }[] {
  const cos = Math.cos(r.theta);
  const sin = Math.sin(r.theta);
  const nx = -sin;
  const ny = cos;
  const hw = r.w / 2;
  const hh = r.h / 2;
  const pts = [
    { x: r.cx + hw * cos + hh * nx, y: r.cy + hw * sin + hh * ny },
    { x: r.cx + hw * cos - hh * nx, y: r.cy + hw * sin - hh * ny },
    { x: r.cx - hw * cos + hh * nx, y: r.cy - hw * sin + hh * ny },
    { x: r.cx - hw * cos - hh * nx, y: r.cy - hw * sin - hh * ny },
  ];
  pts.sort((a, b) => a.x - b.x);
  let tl: { x: number; y: number };
  let bl: { x: number; y: number };
  let tr: { x: number; y: number };
  let br: { x: number; y: number };
  if (pts[0].y <= pts[1].y) {
    tl = pts[0];
    bl = pts[1];
  } else {
    tl = pts[1];
    bl = pts[0];
  }
  if (pts[2].y <= pts[3].y) {
    tr = pts[2];
    br = pts[3];
  } else {
    tr = pts[3];
    br = pts[2];
  }
  return [tl, tr, br, bl];
}

/** sorted_boxes estándar PaddleOCR: por y superior; solapamiento vertical
 *  (< 10 px) → por x (insert estabilizado del original). */
function ordenarCajas(boxes: { x: number; y: number }[][]): { x: number; y: number }[][] {
  const sorted = boxes.slice().sort((a, b) => a[0].y - b[0].y || a[0].x - b[0].x);
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i; j >= 0; j--) {
      if (
        Math.abs(sorted[j + 1][0].y - sorted[j][0].y) < 10 &&
        sorted[j + 1][0].x < sorted[j][0].x
      ) {
        const tmp = sorted[j];
        sorted[j] = sorted[j + 1];
        sorted[j + 1] = tmp;
      } else break;
    }
  }
  return sorted;
}

// ─── Crops, cls, rec ────────────────────────────────────────────────────────

function cropLinea(
  src: HTMLImageElement,
  box: { x: number; y: number }[],
): { canvas: HTMLCanvasElement; ratio: number } {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
  const [p0, p1, p2, p3] = box;
  const cropW = Math.max(1, Math.round(Math.max(d(p0, p1), d(p2, p3))));
  const cropH = Math.max(1, Math.round(Math.max(d(p0, p3), d(p1, p2))));
  const theta = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const canvas = canvasCon(cropW, cropH); // SPRINT-A A3 — factory
  const ctx = ctxDe(canvas);
  // get_rotate_crop_image equivalente: la matriz del contexto transforma
  // coords de la FUENTE → coords del CANVAS (inversa de [R|p0]): rotación
  // −θ y traslación −R·p0 — así la caja queda pegada al origen del canvas
  // y la imagen se dibuja 1:1 (la ventana cropW×cropH recorta el rect).
  // (v1 tenía el transform al revés: el dibujo caía fuera del canvas →
  // crops transparentes y rec vacío — bug v1.)
  const e = -cos * p0.x - sin * p0.y;
  const f = sin * p0.x - cos * p0.y;
  ctx.setTransform(cos, -sin, sin, cos, e, f);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas, ratio: cropW / cropH };
}

function tensorDeCanvases(
  ort: OrtModule,
  canvases: HTMLCanvasElement[],
  targetW: number,
): OrtValue {
  const b = canvases.length;
  const data = new Float32Array(b * 3 * 48 * targetW);
  for (let i = 0; i < b; i++) {
    const c = canvases[i];
    const ctx = ctxDe(c);
    const { width: cw, height: ch } = c;
    const img = ctx.getImageData(0, 0, cw, ch);
    // resize PaddleOCR: h=48 fijo, ancho objetivo min(ceil(48·ratio), targetW)
    // (pad de ceros a la derecha — el buffer ya nace en 0).
    const rw = Math.min(Math.max(1, Math.ceil((48 * cw) / ch)), targetW);
    for (let y = 0; y < 48; y++) {
      const sy = Math.min(ch - 1, Math.floor((y * ch) / 48));
      for (let x = 0; x < rw; x++) {
        const sx = Math.min(cw - 1, Math.floor((x * cw) / rw));
        const idx = (sy * cw + sx) * 4;
        const o = i * 3 * 48 * targetW + y * targetW + x;
        data[o] = (img.data[idx + 2] / 255 - 0.5) / 0.5; // B
        data[o + 48 * targetW] = (img.data[idx + 1] / 255 - 0.5) / 0.5; // G
        data[o + 2 * 48 * targetW] = (img.data[idx] / 255 - 0.5) / 0.5; // R
      }
    }
  }
  return new ort.Tensor("float32", data, [b, 3, 48, targetW]);
}

function softmax2(a: number, b: number): [number, number] {
  const m = Math.max(a, b);
  const ea = Math.exp(a - m);
  const eb = Math.exp(b - m);
  return [ea / (ea + eb), eb / (ea + eb)];
}

/** CTC decode: argmax por t; colapsar repetidos; ignorar blank (0);
 *  1..6622 → dict[idx-1]; 6623 → " "; conf = media de las probs softmax de
 *  los tokens seleccionados (CTCLabelDecode del paquete). */
function ctcDecode(
  tensor: OrtValue,
  dict: string[],
): { texto: string; conf: number } {
  const dims = tensor.dims;
  const T = dims[1];
  const C = dims[2];
  const data = tensor.data as Float32Array;
  let texto = "";
  let sumaConf = 0;
  let cuenta = 0;
  let ultimo = -1;
  for (let t = 0; t < T; t++) {
    const base = t * C;
    let mejor = 0;
    let mejorV = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = data[base + c];
      if (v > mejorV) {
        mejorV = v;
        mejor = c;
      }
    }
    if (mejor !== 0 && mejor !== ultimo) {
      // conf = prob del token: el ONNX del rec ya sale con softmax (igual que
      // el paquete: preds.max(axis=2) sin re-normalizar — el doble softmax
      // con shift aplastaba la conf a ~0 y descartaba TODAS las líneas).
      const prob = mejorV;
      if (mejor <= dict.length) texto += dict[mejor - 1];
      else texto += " ";
      sumaConf += prob;
      cuenta++;
    }
    ultimo = mejor;
  }
  return { texto, conf: cuenta === 0 ? 0 : sumaConf / cuenta };
}

// ─── Inferencia det ─────────────────────────────────────────────────────────

interface DetSalida {
  boxesFuente: { x: number; y: number }[][];
  msDet: number;
  nBoxes: number;
  /** D62 T2 — SOLO en HIT del memo: ms de det que esta llamada NO pagó
   *  (los pagó el probe sobre el MISMO bitmap). Ausente = miss/computo. */
  memoMsAhorrado?: number;
}

// ─── KIT e14-probe-adaptativo-v1 (D62 T2): memo del det por identidad ────────
// Cuando el probe NO aplica rotación (aplicado=0), el det a 1280 del probe
// (rapidOcrCropsOrientacion) y el det a 1280 de la pasada-1 del escalonado
// (rapidOcrReconocer con detCap=DET_CAP_RAPIDO) corren sobre el MISMO bitmap —
// el segundo es gratis si se memoiza. Clave = el PROPIO string dataURL de
// entrada (identidad exacta: rotar ⇒ re-encode ⇒ string distinto ⇒ miss
// natural, cero ramas especiales) + cap (en producción 1920 la clave jamás
// matchea la del probe 1280 ⇒ sin cambio de comportamiento). GUARD HONESTO:
// el memo JAMÁS decide score/gate — devuelve el MISMO resultado que computaría
// det (determinismo wasm: mismo bitmap + mismo cap ⇒ mismo boxesFuente/msDet;
// se devuelve la MISMA referencia). Tope 2 entradas: insertar desplaza la más
// vieja (probe y pasada-1 son consecutivos; nunca coexisten más). El memo es
// solo de ejecución (no persiste) y no corre en SIM (el probe no corre allí —
// guard del bridge; si otra vía alimenta el memo, devuelve lo mismo que
// computaría — inofensivo).
interface DetMemoEntrada {
  cap: number;
  boxesFuente: { x: number; y: number }[][];
  msDet: number;
  nBoxes: number;
}

const DET_MEMO_TOPE = 2;
const detMemo = new Map<string, DetMemoEntrada>();

function detMemoGuardar(clave: string, entrada: DetMemoEntrada): void {
  if (detMemo.size >= DET_MEMO_TOPE) {
    const masVieja = detMemo.keys().next().value; // 1.ª insertada = más vieja
    if (masVieja !== undefined) detMemo.delete(masVieja);
  }
  detMemo.delete(clave); // si la clave ya estaba (otro cap), renueva posición
  detMemo.set(clave, entrada);
}

async function inferDet(
  rt: RapidRuntime,
  src: HTMLImageElement,
  cap: number = DET_CAP_PROD,
  // D62 T2 — identidad del bitmap de origen (dataURL) para el memo; los 2
  // callers la pasan (reconocer + cropsOrientacion). Ausente = sin memo.
  claveOrigen?: string,
): Promise<DetSalida> {
  // D62 T2 — HIT: el probe ACABA de computar este mismo det (mismo dataURL +
  // mismo cap, aplicado=0). Devuelve el MISMO resultado que computaría det —
  // jamás decide score/gate. Los "det run" no se emiten (no corrió aquí).
  if (claveOrigen != null) {
    const hit = detMemo.get(claveOrigen);
    if (hit !== undefined && hit.cap === cap) {
      return {
        boxesFuente: hit.boxesFuente,
        msDet: hit.msDet,
        nBoxes: hit.nBoxes,
        memoMsAhorrado: hit.msDet,
      };
    }
  }
  const t0 = performance.now();
  const { canvas, ops } = preDet(src, cap);
  const ctx = ctxDe(canvas);
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  // PaddleOCR trabaja en BGR (cv2) — los ONNX del PP-OCRv4 esperan ese orden.
  const data = new Float32Array(w * h * 3);
  for (let i = 0, px = 0; i < img.data.length; i += 4, px++) {
    data[px] = (img.data[i + 2] / 255 - 0.5) / 0.5; // B
    data[w * h + px] = (img.data[i + 1] / 255 - 0.5) / 0.5; // G
    data[2 * w * h + px] = (img.data[i] / 255 - 0.5) / 0.5; // R
  }
  const tensor = new rt.ort.Tensor("float32", data, [1, 3, h, w]);
  logger.info(`[e14-rapidocr] det run [1,3,${h},${w}]...`);
  const res = await rt.det.run({ [rt.det.inputNames[0]]: tensor });
  logger.info(`[e14-rapidocr] det run OK (${Math.round(performance.now() - t0)}ms)`);
  const out = res[rt.det.outputNames[0]];
  const pred = out.data as Float32Array;
  const pw = out.dims[3];
  const ph = out.dims[2];
  const msDet = Math.round(performance.now() - t0);

  // 1) binarizar > 0.3
  const bitmap = new Uint8Array(pw * ph);
  for (let i = 0; i < bitmap.length; i++) bitmap[i] = pred[i] > DB_THRESH ? 1 : 0;

  // 2) dilate 2×2 (max local con kernel [[1,1],[1,1]] — crece derecha/abajo)
  const dil = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const fila = y * pw;
    const filaPrev = Math.max(0, y - 1) * pw;
    for (let x = 0; x < pw; x++) {
      const xPrev = Math.max(0, x - 1);
      const v = Math.max(
        bitmap[fila + x],
        bitmap[filaPrev + x],
        bitmap[fila + xPrev],
        bitmap[filaPrev + xPrev],
      );
      dil[fila + x] = v;
    }
  }

  // 3) CCL 4-conectividad (BFS, máx 1000 componentes)
  const labels = new Int32Array(pw * ph); // 0 = no visitado
  let nComp = 0;
  const rects: Rect[] = [];
  const stack = new Int32Array(pw * ph);
  const coords: number[] = [];
  for (let y = 0; y < ph && nComp < DB_MAX_CANDIDATES; y++) {
    for (let x = 0; x < pw && nComp < DB_MAX_CANDIDATES; x++) {
      const idx = y * pw + x;
      if (dil[idx] === 0 || labels[idx] !== 0) continue;
      nComp++;
      let sp = 0;
      stack[sp++] = idx;
      labels[idx] = nComp;
      coords.length = 0;
      while (sp > 0) {
        const cur = stack[--sp];
        const cy = (cur / pw) | 0;
        const cx = cur - cy * pw;
        coords.push(cx, cy);
        // vecinos (4-con)
        if (cx > 0 && dil[cur - 1] === 1 && labels[cur - 1] === 0) {
          labels[cur - 1] = nComp;
          stack[sp++] = cur - 1;
        }
        if (cx < pw - 1 && dil[cur + 1] === 1 && labels[cur + 1] === 0) {
          labels[cur + 1] = nComp;
          stack[sp++] = cur + 1;
        }
        if (cy > 0 && dil[cur - pw] === 1 && labels[cur - pw] === 0) {
          labels[cur - pw] = nComp;
          stack[sp++] = cur - pw;
        }
        if (cy < ph - 1 && dil[cur + pw] === 1 && labels[cur + pw] === 0) {
          labels[cur + pw] = nComp;
          stack[sp++] = cur + pw;
        }
      }
      const nPx = coords.length / 2;
      if (nPx < 10) continue; // ruido (findContours de <10 px tampoco aporta)
      // submuestreo si > 20000 px
      const stride = nPx > 20000 ? Math.ceil(nPx / 20000) : 1;
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k < nPx; k += stride) pts.push({ x: coords[k * 2], y: coords[k * 2 + 1] });
      const hull = convexHull(pts);
      const rect = minAreaRect(hull);
      if (!rect) continue;
      const sside = Math.min(rect.w, rect.h);
      if (sside < MIN_SIDE_DESCARTAR) continue;
      // esquinas del rect (pre-unclip) para el score
      const esq = esquinasRect(rect);
      const score = boxScoreFast(pred, pw, ph, esq);
      if (score < DB_BOX_THRESH) continue;
      // unclip (rect es exacto): d = área·ratio / perímetro; w += 2d, h += 2d
      const perim = 2 * (rect.w + rect.h);
      const dUnclip = (rect.w * rect.h * DB_UNCLIP_RATIO) / perim;
      const wU = rect.w + 2 * dUnclip;
      const hU = rect.h + 2 * dUnclip;
      if (Math.min(wU, hU) < MIN_SIDE_TRAS_UNCLIP) continue;
      rects.push({ cx: rect.cx, cy: rect.cy, w: wU, h: hU, theta: rect.theta });
    }
  }

  // 4) esquinas TL,TR,BR,BL + mapeo a coords de la FUENTE
  const boxesFuente = rects
    .map((r) => esquinasRect(r).map((p) => mapearAFuente(p, ops, src.naturalWidth, src.naturalHeight)))
    .filter((b) => b.every((p) => p.x >= 0 && p.y >= 0));
  const salida: DetSalida = { boxesFuente: ordenarCajas(boxesFuente), msDet, nBoxes: rects.length };
  // D62 T2 — MISS: alimenta el memo (tope 2; insertar desplaza la más vieja).
  if (claveOrigen != null) detMemoGuardar(claveOrigen, { cap, ...salida });
  return salida;
}

// ─── Reconocer (secuencia completa) ─────────────────────────────────────────

/**
 * Secuencia completa det→cls→rec. KIT e14-motor-rapidocr-v1 (PROD-2 §4.3-C4):
 * `onProgress` OPCIONAL — tras cada lote de rec (6 líneas) reporta i/total
 * (0→1). Sin callback: comportamiento byte a byte del instrumento (el informe
 * NO lo pasa — matriz congelada).
 */
export async function rapidOcrReconocer(
  rt: RapidRuntime,
  dataUrl: string,
  onProgress?: (p: number) => void,
  // KIT e14-ocr-escalonado-v1 (§2.1-§2.2): cap det de ESTA llamada —
  // ausente = DET_CAP_PROD (comportamiento de hoy byte a byte); la 1.ª
  // pasada del escalonado pasa DET_CAP_RAPIDO. La sesión/cls/rec NO cambian.
  opts?: { detCap?: number },
): Promise<RapidOcrResultado> {
  const tTotal = performance.now();
  const src = await loadImageMemo(dataUrl); // SPRINT-A A2 — decode memoizado del repo
  // D62 T2 — claveOrigen: el memo del det (probe 1280 ↔ pasada-1 1280 sobre el
  // MISMO bitmap ⇒ HIT; aplicado=1 cambia el string ⇒ miss natural).
  const { boxesFuente, msDet, memoMsAhorrado } = await inferDet(rt, src, opts?.detCap ?? DET_CAP_PROD, dataUrl);

  if (boxesFuente.length === 0) {
    return { lineas: [], texto: "", confMedia: 0, msDet, msCls: 0, msRec: 0, nBoxes: 0 };
  }

  // 5) crops por línea (desde la FUENTE, resolución nativa)
  const crops = boxesFuente.map((b) => cropLinea(src, b));

  // 6) cls por lote de 6 (rotación 180 si score > 0.9)
  const t1 = performance.now();
  const rotar: boolean[] = new Array(crops.length).fill(false);
  for (let i = 0; i < crops.length; i += 6) {
    const lote = crops.slice(i, i + 6).map((c) => c.canvas);
    const tensors = lote.map((cv) => {
      // cls: h=48, w=min(192, ceil(48·ratio)) con pad a 192
      const ratio = cv.width / cv.height;
      const wObj = Math.min(192, Math.max(1, Math.ceil(48 * ratio)));
      const tmp = canvasCon(wObj, 48); // SPRINT-A A3 — factory
      ctxDe(tmp).drawImage(cv, 0, 0, wObj, 48);
      return tmp;
    });
    const tensor = tensorDeCanvases(rt.ort, tensors, 192);
    const res = await rt.cls.run({ [rt.cls.inputNames[0]]: tensor });
    const out = res[rt.cls.outputNames[0]];
    const data = out.data as Float32Array;
    for (let k = 0; k < lote.length; k++) {
      const [p0, p180] = out.dims[1] === 2 ? softmax2(data[k * 2], data[k * 2 + 1]) : [1, 0];
      if (p180 > 0.9 && p180 > p0) rotar[i + k] = true;
    }
  }
  const msCls = Math.round(performance.now() - t1);

  // aplicar rotaciones (re-crop volteado 180°)
  const cropsFinales = crops.map((c, i) => {
    if (!rotar[i]) return c.canvas;
    const cv = c.canvas;
    const tmp = canvasCon(cv.width, cv.height); // SPRINT-A A3 — factory
    const ctx = ctxDe(tmp);
    ctx.translate(cv.width, cv.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(cv, 0, 0);
    return tmp;
  });

  // 7) rec por lote de 6 (líneas ordenadas por ratio w/h — acelera)
  const t2 = performance.now();
  const orden = cropsFinales
    .map((c, i) => ({ i, ratio: c.width / c.height }))
    .sort((a, b) => a.ratio - b.ratio);
  const lineas: RapidOcrLinea[] = new Array(cropsFinales.length);
  for (let k = 0; k < orden.length; k += 6) {
    const lote = orden.slice(k, k + 6);
    const maxRatio = Math.max(320 / 48, ...lote.map((o) => o.ratio));
    // KIT e14-rec-wmax480-v1 (bench v8.5): cap del ancho del tensor — el lote
    // entero corre al ancho de su línea más ancha; sin cap, una sola línea
    // de 864 px hinchaba TODOS los tensores del lote (0.56 ms/unidad WASM).
    const W = Math.min(REC_WMAX, Math.floor(48 * maxRatio));
    const canvases = lote.map((o) => cropsFinales[o.i]);
    const tensor = tensorDeCanvases(rt.ort, canvases, W);
    const res = await rt.rec.run({ [rt.rec.inputNames[0]]: tensor });
    const out = res[rt.rec.outputNames[0]];
    for (let m = 0; m < lote.length; m++) {
      const dims = out.dims;
      const sub: OrtValue = {
        dims: [1, dims[1], dims[2]],
        data: (out.data as Float32Array).subarray(
          m * dims[1] * dims[2],
          (m + 1) * dims[1] * dims[2],
        ) as Float32Array,
        type: out.type,
      };
      const { texto, conf } = ctcDecode(sub, rt.dict);
      if (conf >= TEXT_SCORE && texto.trim().length > 0) {
        lineas[lote[m].i] = { texto: texto.trim(), conf, box: boxesFuente[lote[m].i] };
      }
    }
    // PROD-2 (§4.3-C4): progreso real por lotes de rec — i/total (0→1).
    onProgress?.(Math.min(1, (k + lote.length) / orden.length));
  }
  const msRec = Math.round(performance.now() - t2);

  const aceptadas = lineas.filter((l): l is RapidOcrLinea => !!l);
  const texto = aceptadas.map((l) => l.texto).join("\n");
  const confMedia =
    aceptadas.length === 0 ? 0 : aceptadas.reduce((s, l) => s + l.conf, 0) / aceptadas.length;
  logger.info(
    `[e14-rapidocr] celda: det=${msDet}ms cls=${msCls}ms rec=${msRec}ms · ${boxesFuente.length} cajas · ${aceptadas.length} líneas · conf ${(confMedia * 100).toFixed(1)}% · ${Math.round(performance.now() - tTotal)}ms detMemo=${memoMsAhorrado != null ? `hit msAhorrado=${memoMsAhorrado}` : "miss"}`,
  );
  return {
    lineas: aceptadas,
    texto,
    confMedia,
    msDet,
    msCls,
    msRec,
    nBoxes: boxesFuente.length,
  };
}

// ─── KIT e14-orientacion-auto-v1 (T-A1): soporte del probe de orientación ───

/**
 * det + K crops repartidos por el acta para el probe de orientación (§2.1
 * paso 1): UNA pasada det (el MISMO inferDet de producción — sin sesión
 * nueva, §2.2) y crops ANTES del cls (el cls puede sesgar el probe en 180°,
 * kit §2.1). Selección (kit: «p. ej. boxesFuente cada len/8» — el p. ej.
 * deja la muestra a criterio): las 3 líneas MÁS LARGAS + el resto repartido
 * cada n/K por orden de centro Y. La LONGITUD importa: las anclas de
 * ANCLAS_LECTURA (cabecera E-14, fila CONSULADO/PAIS/ZONA/PUESTO/MESA,
 * código 1D) viven en las líneas largas — verificad en sandbox con dump
 * visual: el spread puro cayó todo en el cuerpo (VOTOS NULOS / TOTAL...)
 * y el probe quedó sin anclas en 180° (score 0.99 < 0+1.5 → no aplicaba).
 * El largo se mide como el lado MAYOR del rect (p0→p1 o p1→p2): en actas
 * ±90° las líneas son verticales y tl→tr daría el GROSOR, no el largo
 * (regresión medida en sandbox: score(270) 3.83→1.06 → no aplicaba).
 */
export async function rapidOcrCropsOrientacion(
  rt: RapidRuntime,
  dataUrl: string,
  k: number,
): Promise<{ crops: HTMLCanvasElement[]; w: number; h: number; msDet: number }> {
  const src = await loadImageMemo(dataUrl); // SPRINT-A A2 — decode memoizado del repo
  // D56 §3 T2: det del probe a DET_CAP_RAPIDO (banco B3 GO: −56%, 0 cajas
  // perdidas) — el probe no necesita det de producción, sí caber en presupuesto.
  // D62 T2 — claveOrigen: este det ALIMENTA el memo (mismo bitmap + cap 1280
  // ⇒ la pasada-1 del escalonado con aplicado=0 hace HIT y no repite el det).
  const { boxesFuente, msDet } = await inferDet(rt, src, DET_CAP_RAPIDO, dataUrl);
  const n = boxesFuente.length;
  const crops: HTMLCanvasElement[] = [];
  if (n > 0) {
    const kk = Math.min(k, n);
    const largoDe = (b: { x: number; y: number }[]) =>
      Math.max(
        Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y),
        Math.hypot(b[2].x - b[1].x, b[2].y - b[1].y),
      );
    const nAnchas = Math.min(3, kk);
    const anchas = [...boxesFuente]
      .sort((a, b) => largoDe(b) - largoDe(a))
      .slice(0, nAnchas);
    const enAnchas = new Set(anchas);
    const resto = [...boxesFuente]
      .sort(
        (a, b) => a.reduce((s, p) => s + p.y, 0) - b.reduce((s, p) => s + p.y, 0),
      )
      .filter((b) => !enAnchas.has(b));
    const faltan = kk - anchas.length;
    const paso = resto.length / Math.max(1, faltan); // ≥ 1 → índices sin repetir
    const elegidas = [...anchas];
    for (let i = 0; i < faltan; i++) {
      elegidas.push(resto[Math.floor(i * paso)]);
    }
    for (const b of elegidas) crops.push(cropLinea(src, b).canvas);
  }
  return { crops, w: src.naturalWidth, h: src.naturalHeight, msDet };
}

/**
 * rec CRUDO de un lote de crops para el probe (§2.1 paso 2): el MISMO pre/post
 * del rec de producción (orden por ratio → lotes de 6 → tensorDeCanvases →
 * ctcDecode) SIN cls y SIN filtro TEXT_SCORE — el probe necesita la conf
 * cruda de TODAS las líneas (un crop mal rotado debe puntuar BAJO, no
 * desaparecer del cómputo de conf/anclas). Sin sesiones nuevas: recibe el
 * MISMO runtime singleton del caller (§2.2).
 */
export async function rapidOcrRecLote(
  rt: RapidRuntime,
  canvases: HTMLCanvasElement[],
): Promise<{ texto: string; conf: number }[]> {
  const salida: { texto: string; conf: number }[] = new Array(canvases.length);
  const orden = canvases
    .map((c, i) => ({ i, ratio: c.width / c.height }))
    .sort((a, b) => a.ratio - b.ratio);
  for (let k = 0; k < orden.length; k += 6) {
    const lote = orden.slice(k, k + 6);
    const maxRatio = Math.max(320 / 48, ...lote.map((o) => o.ratio));
    // KIT e14-rec-wmax480-v1: MISMO cap que el rec de producción — el probe
    // promete «el MISMO pre/post del rec» y su conf cruda debe ser comparable.
    const W = Math.min(REC_WMAX, Math.floor(48 * maxRatio));
    const tensor = tensorDeCanvases(rt.ort, lote.map((o) => canvases[o.i]), W);
    const res = await rt.rec.run({ [rt.rec.inputNames[0]]: tensor });
    const out = res[rt.rec.outputNames[0]];
    for (let m = 0; m < lote.length; m++) {
      const dims = out.dims;
      const sub: OrtValue = {
        dims: [1, dims[1], dims[2]],
        data: (out.data as Float32Array).subarray(
          m * dims[1] * dims[2],
          (m + 1) * dims[1] * dims[2],
        ) as Float32Array,
        type: out.type,
      };
      salida[lote[m].i] = ctcDecode(sub, rt.dict);
    }
  }
  return salida;
}

// KIT e14-optimizacion-v1 (T4): notaWebgpu BORRADA — residuo del informe
// (kit fuera-informes retiró a sus consumidores; 0 refs en src/, verificado
// con rg). WebGPU sigue anotado, no usado (EP wasm fijo, determinismo).

// KIT e14-motor-rapidocr-v1 (PROD-2 §4.1-C5): pre-warm al importar el módulo
// (el bridge lo importa → arranca ANTES de la primera captura SIN tocar
// ScanView, intocable). Singleton compartido: producción e informe pagan la
// carga (~1.1 s) UNA sola vez por sesión. Silencioso: si falla aquí, la
// primera captura reintenta vía rapidOcrInit (reintentable).
if (typeof window !== "undefined") void rapidOcrInit().catch(() => {});
