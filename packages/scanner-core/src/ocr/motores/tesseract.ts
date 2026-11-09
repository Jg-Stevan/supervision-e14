/**
 * Motor Tesseract ÚNICO del paquete (ítem 3.2 del mapa v2.3): los DOS
 * wrappers (digielect14 ocr/tesseract.ts · supervision-e14 ocr/tesseract-ocr.ts)
 * mueren. La config es EXACTA la misma que ambos probaban (LSTM_ONLY + PSM 4
 * + spa best ~12 MB — verificación 6.4/A.4 del mapa): SOLO `langPath` pasa a
 * ser parámetro (D lo sirve en /models/tess · S en /models/tesseract).
 *
 * Fusión:
 *  · De D (GO-B): presupuestos de verdad (reconocer 60 s capado por el
 *    pipeline · creación 180 s para la 1.ª descarga de ~19 MB en 3G · mínimo
 *    20 s para intentar) + precalentamiento fire-and-forget.
 *  · De S (fase 5b): lifecycle completo (init con timeout, reiniciar),
 *    salida en el contrato RapidOcrResultado (data.blocks v5 + lineas con
 *    bbox + conf 0-100→0-1) y progreso vivo (ANALIZANDO).
 *  · Doctrina S: JAMÁS lanza hacia afuera — null = fallo y el caller (la
 *    cascada) cae al siguiente eslabón.
 */
import { logger } from "../../dominio/logger";
import { publicBaseEfectivo } from "../../dominio/entorno";
import type { RapidOcrLinea, RapidOcrResultado } from "../rapidocr";

/** Config del motor (langPath = ÚNICO punto que divergía entre apps — 6.4). */
export interface OpcionesTesseract {
  /** Ruta del traineddata bajo publicBase (D: "/models/tess" · S: "/models/tesseract"). */
  langPath: string;
  /** Presupuesto de UNA recognize (default 60_000 — banco K3 §B, D76). */
  presupuestoReconocerMs: number;
  /** Presupuesto de la CREACIÓN del worker (1.ª descarga ~19 MB: 180_000). */
  presupuestoCreacionMs: number;
  /** Menor presupuesto con el que VALE la pena intentar (20_000). */
  presupuestoMinimoMs: number;
  /** Timeout de la init perezosa (20_000 — de S). */
  timeoutInitMs: number;
}

const OPCIONES_DEFAULT: OpcionesTesseract = {
  langPath: "/models/tess",
  presupuestoReconocerMs: 60_000,
  presupuestoCreacionMs: 180_000,
  presupuestoMinimoMs: 20_000,
  timeoutInitMs: 20_000,
};

let opciones: OpcionesTesseract = { ...OPCIONES_DEFAULT };

/** Configura el motor (la app fija SU langPath y presupuestos). */
export function configurarTesseract(o: Partial<OpcionesTesseract>): void {
  opciones = { ...opciones, ...o };
}

/** Timeout de la init del worker (descarga gz + compile WASM en frío). */

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

/** Tesseract v5 arma un blob worker e `importScripts` no resuelve rutas
 *  relativas contra `blob:` — las tres rutas deben ser absolutas. */
function urlAbsoluta(ruta: string): string {
  if (typeof location === "undefined") return ruta;
  return new URL(ruta, location.href).href;
}

async function crearWorkerInterno(): Promise<TesseractWorkerMod> {
  try {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    const w = await createWorker("spa", OEM.LSTM_ONLY, {
      // Todo vendorizado same-origin (con basePath — sin CDN externo):
      // worker + núcleos WASM + traineddata best. DIRECTORIO corePath (no
      // archivo fijo): la lib elige simd-lstm o lstm según la sonda SIMD
      // del dispositivo (ambos vendidos — paridad D/S).
      workerPath: urlAbsoluta(`${publicBaseEfectivo()}/vendor/tesseract/worker.min.js`),
      corePath: urlAbsoluta(`${publicBaseEfectivo()}/vendor/tesseract`),
      langPath: urlAbsoluta(`${publicBaseEfectivo()}${opciones.langPath}`),
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status === "recognizing text" && progresoEnVuelo) {
          progresoEnVuelo(m.progress ?? 0); // ANALIZANDO vivo (mismo emit del pipeline)
        }
      },
    });
    // PSM 4 = «single column of text of variable sizes» — la config EXACTA
    // del benchmark (spa-best + psm 4: 94,4 % dígitos · 2,2 s/pág · ~67 MB).
    await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
    return w;
  } catch (e) {
    workerProm = null; // reintentable
    throw e;
  }
}

/** Init perezosa del worker (descarga + compile + idioma). true = listo;
 *  false = fallo/timeout (el caller cae al siguiente eslabón de la cascada). */
export async function tesseractInit(): Promise<boolean> {
  try {
    if (!workerProm) workerProm = crearWorkerInterno();
    const ok = await Promise.race([
      workerProm.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), opciones.timeoutInitMs)),
    ]);
    if (!ok) void tesseractReiniciar(); // abandonada: no dejar worker huérfano
    return true === ok;
  } catch {
    workerProm = null;
    return false;
  }
}

/** Soltar el worker (APLICAR AHORA / reinicio del motor / watchdog). */
export async function tesseractReiniciar(): Promise<void> {
  const w = workerProm;
  workerProm = null;
  progresoEnVuelo = null;
  if (!w) return;
  try {
    const ww = await w;
    await ww.terminate();
  } catch {
    /* worker ya muerto — nada que hacer */
  }
}

/** Precalentamiento fire-and-forget (de D — GO-B): arranca la creación del
 *  worker SIN presupuesto; la 1.ª captura ya encuentra assets calientes.
 *  Idempotente + jamás lanza + silencioso. */
export function tessPrecalentar(): void {
  try {
    if (typeof window === "undefined" || workerProm !== null) return;
    workerProm = crearWorkerInterno();
    void workerProm.catch(() => {
      workerProm = null; // la 1.ª cascada lo reintenta con presupuesto propio
    });
  } catch {
    /* silencioso — el precalentamiento jamás tumba nada */
  }
}

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
 * OCR completo de una página con Tesseract spa-best + psm 4 — MISMO contrato
 * que rapidOcrReconocer (el pipeline no cambia). null = fallo (presupuesto
 * insuficiente/vencido, SSR, worker roto) → el caller (cascada) cae al
 * siguiente eslabón. El desglose det/cls/rec no existe aquí (un solo bloque
 * WASM): el total va en msRec.
 */
export async function tesseractReconocer(
  dataUrl: string,
  presupuestoMs: number = opciones.presupuestoReconocerMs,
  onProgreso?: (p: number) => void,
): Promise<RapidOcrResultado | null> {
  try {
    if (typeof window === "undefined") return null; // SSR — cascada cae a RapidOCR
    if (
      !(presupuestoMs >= opciones.presupuestoMinimoMs) ||
      typeof dataUrl !== "string" ||
      dataUrl.length === 0
    ) {
      return null; // presupuesto insuficiente — ni arranca (fallo segura inmediata)
    }
    const t0 = performance.now();
    if (!workerProm) workerProm = crearWorkerInterno();
    // CREACIÓN: la 1.ª vez descarga ~19 MB vendidos (3G ≈ 95-120 s) ⇒
    // presupuesto PROPIO, SIEMPRE capado por el del pipeline.
    const msCreacion = Math.min(presupuestoMs, opciones.presupuestoCreacionMs);
    const w = await Promise.race([
      workerProm,
      new Promise<never>((_, rej) =>
        setTimeout(() => {
          void tesseractReiniciar();
          rej(new Error(`tess: creación de worker vencida (${msCreacion} ms)`));
        }, msCreacion),
      ),
    ]);
    const restante = presupuestoMs - (performance.now() - t0);
    if (restante <= 0) return null; // sin presupuesto restante para recognize
    // RECOGNIZE: presupuesto del bench capado por el restante real.
    const msRec = Math.min(restante, opciones.presupuestoReconocerMs);
    progresoEnVuelo = onProgreso ?? null;
    let data: TessData;
    try {
      // output explícito: v5 puede omitir blocks por default — sin bloques
      // no hay líneas y la lectura saldría vacía por accidente.
      ({ data } = await Promise.race([
        w.recognize(dataUrl, {}, { text: true, blocks: true }),
        new Promise<never>((_, rej) =>
          setTimeout(() => {
            void tesseractReiniciar();
            rej(new Error(`tess: presupuesto vencido (${msRec} ms)`));
          }, msRec),
        ),
      ]));
    } finally {
      progresoEnVuelo = null;
    }
    const msTotal = Math.round(performance.now() - t0);
    const lineas = lineasDe(data ?? {});
    const texto = lineas.map((l) => l.texto).join("\n"); // MISMA construcción que RapidOCR
    const confMedia =
      lineas.length === 0 ? 0 : lineas.reduce((s, l) => s + l.conf, 0) / lineas.length;
    logger.info(
      `[e14-tesseract] spa-best psm4: ${lineas.length} líneas · conf ${(confMedia * 100).toFixed(1)}% · ${msTotal}ms`,
    );
    return {
      lineas,
      texto,
      confMedia,
      msDet: 0,
      msCls: 0,
      msRec: msTotal,
      msRunRec: msTotal,
      nBoxes: lineas.length,
    };
  } catch (e) {
    await tesseractReiniciar().catch(() => {});
    logger.info(
      `[e14-tesseract] fallo de reconocimiento (cascada cae al siguiente eslabón): ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}
