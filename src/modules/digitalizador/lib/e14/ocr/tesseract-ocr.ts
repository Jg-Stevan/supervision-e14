/**
 * KIT tesseract-spa-best-v1 (fase 5b) — Tesseract spa-best + psm 4 REAL:
 * el motor de gama baja del benchmark (results/metrics.json, rondas 1-2):
 * 94,4 % de dígitos impresos, RAM pico ~67 MB, descarga 13,5 MB — el ÚNICO
 * viable en gama baja y el que el router NOMBRA como base, pero que hasta
 * hoy el repo representaba con modelos v4 de RapidOCR (ver motorADeModelos
 * en rapidocr.ts). Este módulo lo hace ELEGIBLE de verdad: tesseract.js v5
 * (WASM, LSTM-only) + spa.traineddata de tessdata_best vendorizado
 * (public/models/tesseract/spa.traineddata.gz ~12 MB) + núcleos
 * (public/vendor/tesseract — simd-lstm con fallback sin SIMD).
 *
 * Config EXACTA del benchmark: OEM LSTM_ONLY + PSM 4 (spa-best).
 *
 * D6-safe: la init del worker ES la prueba (sin sonda aparte — motor ligero
 * y benchmark-probado); fallo ⇒ fallback honesto a la red de seguridad v4
 * (la corrida jamás se tumba; el informe muestra decisión vs modelos reales,
 * mismo patrón de honestidad que la sonda de v5). Jamás lanza hacia afuera.
 */

import { logger } from "../../logger";
import type { RapidOcrLinea, RapidOcrResultado } from "./rapidocr"; // type-only: sin ciclo en runtime

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Timeout de la init del worker (descarga gz + compile WASM en frío). */
const TIMEOUT_INIT_MS = 20_000;

// ─── tipos estructurales de la salida de tesseract.js (v5: data.blocks) ─────

interface TessBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TessPalabra {
  text?: string;
}
interface TessLinea {
  text?: string;
  confidence?: number;
  bbox?: TessBbox;
  words?: TessPalabra[];
}
interface TessParrafo {
  lines?: TessLinea[];
}
interface TessBloque {
  paragraphs?: TessParrafo[];
  lines?: TessLinea[];
}
interface TessData {
  blocks?: TessBloque[] | null;
}

type TesseractWorkerMod = import("tesseract.js").Worker;

// ─── singleton del worker (mismo patrón que rtSingleton de RapidOCR) ────────

let workerProm: Promise<TesseractWorkerMod> | null = null;
/** Progreso del recognize en vuelo (el logger del worker es fijo — el
 *  callback ACTIVO se intercambia por reconocimiento). */
let progresoEnVuelo: ((p: number) => void) | null = null;

async function crearWorkerInterno(): Promise<TesseractWorkerMod> {
  try {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    const w = await createWorker("spa", OEM.LSTM_ONLY, {
      // Todo vendorizado (GH Pages sin CDN externo): worker + núcleos WASM +
      // traineddata best — la MISMA pieza que puntuó 94,4 % en el benchmark.
      workerPath: `${PUBLIC_BASE}/vendor/tesseract/worker.min.js`,
      corePath: `${PUBLIC_BASE}/vendor/tesseract`,
      langPath: `${PUBLIC_BASE}/models/tesseract`,
      gzip: true,
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status === "recognizing text" && progresoEnVuelo) {
          progresoEnVuelo(m.progress ?? 0); // ANALIZANDO vivo (mismo emit del pipeline)
        }
      },
    });
    // PSM 4 = «single column of text of variable sizes» — la config del
    // benchmark (spa-best + psm 4: 94,4 % dígitos; psm 6/3 cayeron menos).
    await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
    return w;
  } catch (e) {
    workerProm = null; // reintentable
    throw e;
  }
}

/** Init perezosa del worker (descarga + compile + idioma). true = listo;
 *  false = fallo/timeout (el caller cae a la red de seguridad v4). */
export async function tesseractInit(): Promise<boolean> {
  try {
    if (!workerProm) workerProm = crearWorkerInterno();
    const ok = await Promise.race([
      workerProm.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), TIMEOUT_INIT_MS)),
    ]);
    if (!ok) void tesseractReiniciar(); // abandonada: no dejar worker huérfano
    return ok;
  } catch {
    workerProm = null;
    return false;
  }
}

/** Soltar el worker (APLICAR AHORA / reinicio del motor). Jamás lanza. */
export async function tesseractReiniciar(): Promise<void> {
  const w = workerProm;
  workerProm = null;
  progresoEnVuelo = null;
  if (!w) return;
  try {
    const ww = await w;
    await ww.terminate();
  } catch {
    /* worker ya muerto — nada que soltar */
  }
}

// ─── reconocer (misma forma de salida que RapidOCR — el contrato del pipe) ──

/** Recolecta líneas de data.blocks (v5 retiró los atajos top-level). */
function lineasDe(data: TessData): RapidOcrLinea[] {
  const lineas: RapidOcrLinea[] = [];
  for (const bloque of data.blocks ?? []) {
    const candidatas =
      bloque.lines ?? bloque.paragraphs?.flatMap((p) => p.lines ?? []) ?? [];
    for (const l of candidatas) {
      const texto = (l.text ?? (l.words ?? []).map((w) => w.text ?? "").join(" "))
        .replace(/\s+/g, " ")
        .trim();
      if (!texto || !l.bbox) continue;
      // conf de tesseract: 0-100 → contrato RapidOCR: 0-1
      const conf = Math.max(0, Math.min(1, (l.confidence ?? 0) / 100));
      const { x0, y0, x1, y1 } = l.bbox;
      lineas.push({
        texto,
        conf,
        box: [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
      });
    }
  }
  return lineas;
}

/**
 * OCR completo de una página con Tesseract spa-best + psm 4. Devuelve el
 * MISMO contrato que rapidOcrReconocer (el pipeline no cambia) — null =
 * fallo (el caller cae a v4 con sello honesto en el informe). El desglose
 * det/cls/rec no existe aquí (un solo bloque WASM): el total va en msRec.
 */
export async function tesseractReconocer(
  dataUrl: string,
  onProgress?: (p: number) => void,
): Promise<RapidOcrResultado | null> {
  try {
    if (!workerProm) return null; // sin init → red de seguridad v4
    const w = await workerProm;
    const t0 = performance.now();
    progresoEnVuelo = onProgress ?? null;
    let data: TessData;
    try {
      // output explícito: v5 puede omitir blocks por default — sin bloques
      // no hay líneas y la lectura saldría vacía por accidente.
      ({ data } = await w.recognize(dataUrl, {}, { text: true, blocks: true }));
    } finally {
      progresoEnVuelo = null;
    }
    const msRec = Math.round(performance.now() - t0);
    const lineas = lineasDe(data ?? {});
    const texto = lineas.map((l) => l.texto).join("\n"); // MISMA construcción que RapidOCR
    const confMedia =
      lineas.length === 0 ? 0 : lineas.reduce((s, l) => s + l.conf, 0) / lineas.length;
    logger.info(
      `[e14-tesseract] spa-best psm4: ${lineas.length} líneas · conf ${(confMedia * 100).toFixed(1)}% · ${msRec}ms`,
    );
    return { lineas, texto, confMedia, msDet: 0, msCls: 0, msRec, nBoxes: lineas.length };
  } catch (e) {
    logger.info(
      `[e14-tesseract] fallo de reconocimiento (red de seguridad v4): ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}
