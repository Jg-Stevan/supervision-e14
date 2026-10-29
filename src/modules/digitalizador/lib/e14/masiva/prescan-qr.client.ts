"use client";

/**
 * KIT e107-prescan-qr-cola-v1 (§D.1) — CLIENTE del detection-worker REAL
 * (OpenCV: `detect` → quad · `warp` → recorte rectificado SIN rotar) para el
 * PRE-SCAN QR en «PROCESAR COLA».
 *
 * Espejo del patrón e73 (sondeo-qr.client.ts) pero hablando el protocolo
 * EXACTO del Anexo 1 del kit — el MISMO que el harness validó sobre el
 * deploy real (download/e14-qr-harness-v2.console.js). Cero precedentes
 * nuevos de bundling: el worker es el asset público que YA existe
 * (public/scanner/detection-worker.js — el ÚNICO `new Worker` del core,
 * WORKER_URL con `?v=8`) — sin precompilación, sin smoke de frescura.
 *
 *  · Serial estricto: UNA petición en vuelo, cola FIFO (el worker responde
 *    `busy` si se ensucian las manos — el cliente serial lo hace imposible
 *    por construcción).
 *  · Correlación por `ts` incremental (mismo patrón del detector-client del
 *    core: `pending` por `ts`).
 *  · Hard-kill anti-zombi POR PETICIÓN: PRESUPUESTO_FILA_MS +
 *    HARD_KILL_EXTRA_MS → terminate() + respawn perezoso + resolve null
 *    (un worker colgado JAMÁS frena el clic — regla de oro 3 del dueño).
 *  · Bitmaps SIEMPRE transferidos (`postMessage(msg, [bitmap])`) — pico de
 *    RAM móvil; el bitmap queda detached y el worker lo cierra (A-04).
 *  · Feature-detect: sin Worker/createImageBitmap/OffscreenCanvas →
 *    `listo()=false` → abort honesto (§G — flujo de hoy byte-idéntico).
 *  · JAMÁS throw: cualquier fallo (crear/postMessage/respuesta mala) →
 *    null (doctrina del conservador).
 *
 * URLs: `?v=8` primero (cache-bust del core), fallback sin query — primer
 * `ready` gana, timeout BOOT_TIMEOUT_MS → siguiente URL. Arranque
 * SERIALIZADO (un race paralelo bootearía OpenCV 2× — pico de RAM móvil).
 */
import { logger } from "../../logger";
// KIT flujo-dueno-v1 (K2): forma canónica del quad del core (solo tipo —
// se borra en compile: cero dependencia runtime).
import type { Quad } from "@jg-stevan/scanner-core/types";
// KIT e14-prescan-warp-lado-v1: válvulas del dueño (presupuesto de fila
// configurable + maxWarpLongSide del warp) — mismo patrón e73 (sondeo).
// KIT e14-gama-adaptativa-v1 (D74): la lectura del presupuesto es EFECTIVA
// (gama BAJO/MEDIO adaptativa lo sube — menos hard-kills por lentitud).
import { flagsMasivaEfectivos } from "../gama";

/** Base pública de assets — MISMO patrón del repo (sondeo-qr.client.ts:54/
 * flags.ts/rapidocr.ts): assets servidos desde public/ con prefijo
 * NEXT_PUBLIC_BASE_PATH (Vercel/OpenNext sirve bajo base path). */
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const WORKER_URLS = [
  `${PUBLIC_BASE}/scanner/detection-worker.js?v=8`,
  `${PUBLIC_BASE}/scanner/detection-worker.js`,
] as const;

export const BOOT_TIMEOUT_MS = 8000; // OpenCV carga ~1-3 s primera vez
export const PRESUPUESTO_FILA_MS = 4000; // detect+warp+QR por fila (reló local)
export const HARD_KILL_EXTRA_MS = 1500; // terminate + respawn perezoso + null
export const DETECT_LONG_SIDE = 400; // clase 400 del core (PROCESS_LONG_SIDE, resizeQuality "low")

/** KIT e14-prescan-warp-lado-v1: presupuesto de fila saneado del flag
 *  (default 4000 = PRESUPUESTO_FILA_MS — byte-idéntico). Clamp 1000..30000
 *  (jamás por debajo de 1 s: el hard-kill anti-zombi sigue existiendo).
 *  KIT e14-gama-adaptativa-v1 (D74): lectura EFECTIVA — en gama BAJO/MEDIO
 *  adaptativa el plan lo SUBE (6000/5000): un hard-kill por LENTITUD cuesta
 *  más que la espera (kill = respawn frío de OpenCV + re-do completo). */
function presupuestoFilaDeFlags(): number {
  try {
    const n = flagsMasivaEfectivos().prescanQrPresupuestoMs;
    if (typeof n === "number" && Number.isFinite(n)) {
      return Math.max(1000, Math.min(30_000, Math.round(n)));
    }
  } catch {
    /* silencioso — default */
  }
  return PRESUPUESTO_FILA_MS;
}

/** Contrato mínimo del worker clásico que este cliente maneja (tests lo
 *  falsifican — patrón WorkerSondeo e73). */
export interface WorkerDeteccion {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** Fábrica del worker — inyectable SOLO para tests (patrón e73). */
export type FabricaWorkerDeteccion = (url: string) => WorkerDeteccion | null;

let fabrica: FabricaWorkerDeteccion = fabricaProduccion;

function fabricaProduccion(url: string): WorkerDeteccion | null {
  return new Worker(url) as unknown as WorkerDeteccion;
}

/** Cliente del pre-scan — API §D.1 (todo serial; JAMÁS throw). */
export interface ClientePrescan {
  /** Race de URLs → primer `ready`; timeout → false (abort honesto). */
  listo(): Promise<boolean>;
  /** {type:'detect'} → 'result'.corners (Float32Array(8) EN FRACCIONES 0–1,
   *  orden TL,TR,BR,BL) | null. bitmap400 va TRANSFERIDO. */
  detectar(bitmap400: ImageBitmap): Promise<Float32Array | null>;
  /** {type:'warp'} → 'warped'.bitmap | null. bitmapFull va TRANSFERIDO
   *  (queda detached — jamás close() después); quad en fracciones.
   *  KIT e14-prescan-warp-lado-v1: `maxWarpLado` opcional (≥256) →
   *  msg.maxWarpLongSide (config caliente del worker); omitido = default
   *  del worker (4032) byte-idéntico. */
  warpar(
    bitmapFull: ImageBitmap,
    quad: Float32Array,
    maxWarpLado?: number,
  ): Promise<ImageBitmap | null>;
  /** terminate — fin del pre-scan (R6). Resuelve null cualquier op en vuelo. */
  destruir(): void;
}

let contadorTs = 0;

export function crearClientePrescan(): ClientePrescan {
  let worker: WorkerDeteccion | null = null;
  let listoFlag = false;
  let relodHardKill: ReturnType<typeof setTimeout> | null = null;
  // El `terminar` de la op EN VUELO — destruir() resuelve null sin colgar.
  let terminarActivo: (() => void) | null = null;
  // Serial estricto — 1 operación en vuelo, FIFO (encadena promesas).
  let cadena: Promise<unknown> = Promise.resolve();

  function soportado(): boolean {
    return (
      typeof Worker !== "undefined" &&
      typeof createImageBitmap !== "undefined" &&
      typeof OffscreenCanvas !== "undefined"
    );
  }

  /** terminate + respawn PEREZOSO: el próximo pedir() re-bootea (listo()). */
  function terminarWorker(): void {
    if (relodHardKill !== null) {
      clearTimeout(relodHardKill);
      relodHardKill = null;
    }
    try {
      worker?.terminate();
    } catch {
      /* ya muerto */
    }
    worker = null;
    listoFlag = false;
  }

  /** Conecta UNA URL y espera `ready` (o error/boot-timeout → false). */
  function conectar(urlIdx: number): Promise<boolean> {
    return new Promise((resuelve) => {
      let zarpado = false;
      let relodBoot: ReturnType<typeof setTimeout> | null = null;
      const fin = (ok: boolean): void => {
        if (zarpado) return;
        zarpado = true;
        if (relodBoot !== null) clearTimeout(relodBoot);
        resuelve(ok);
      };
      let w: WorkerDeteccion | null = null;
      try {
        w = fabrica(WORKER_URLS[urlIdx] ?? WORKER_URLS[0]!);
      } catch {
        fin(false);
        return;
      }
      if (!w) {
        fin(false);
        return;
      }
      worker = w;
      relodBoot = setTimeout(() => {
        terminarWorker(); // boot zombi — fuera (respawn perezoso)
        fin(false);
      }, BOOT_TIMEOUT_MS);
      w.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { type?: string } | null;
        const tipo = String(data?.type ?? "");
        if (tipo === "ready") {
          listoFlag = true;
          fin(true);
          return;
        }
        // 'error' de boot (opencv.js falló / cv undefined) → siguiente URL
        if (tipo === "error") {
          terminarWorker();
          fin(false);
        }
        // 'result'/'warped'/'busy' durante boot: sin pending — ignorar.
      };
      w.onerror = () => {
        terminarWorker();
        fin(false);
      };
    });
  }

  async function listo(): Promise<boolean> {
    if (!soportado()) return false;
    if (listoFlag && worker) return true;
    terminarWorker(); // vida nueva (primer boot o respawn post-hard-kill)
    for (let i = 0; i < WORKER_URLS.length; i++) {
      if (await conectar(i)) return true;
    }
    return false;
  }

  function pedir<T>(
    kind: "detect" | "warp",
    armar: (ts: number) => { msg: unknown; transfer: Transferable[] },
  ): Promise<T | null> {
    // Cola FIFO — una petición en vuelo (serial estricto, §D.1).
    const tarea = (): Promise<T | null> =>
      new Promise<T | null>((resolve) => {
        void (async () => {
          // Respawn perezoso: worker muerto (hard-kill/boot fallido) →
          // re-boot completo AQUÍ (el hard-kill de abajo cubre boot+op).
          if (!listoFlag || !worker) {
            if (!(await listo())) {
              resolve(null);
              return;
            }
          }
          const w = worker;
          if (!w) {
            resolve(null);
            return;
          }
          const ts = ++contadorTs;
          const { msg, transfer } = armar(ts);
          let fin = false;
          const terminar = (r: T | null): void => {
            if (fin) return;
            fin = true;
            if (relodHardKill !== null) {
              clearTimeout(relodHardKill);
              relodHardKill = null;
            }
            terminarActivo = null;
            resolve(r);
          };
          terminarActivo = () => terminar(null);
          // Hard-kill anti-zombi POR PETICIÓN (§D.1): presupuesto + extra →
          // terminate + respawn perezoso + resolve null.
          // KIT e14-prescan-warp-lado-v1: presupuesto del flag (default 4000
          // — byte-idéntico; el dueño lo sube en equipos lentos).
          const presupuestoFila = presupuestoFilaDeFlags();
          relodHardKill = setTimeout(() => {
            logger.warn(
              `[e14] prescan-qr hard-kill ${kind} presupuesto=${presupuestoFila}+${HARD_KILL_EXTRA_MS} — worker colgado (respawn perezoso)`,
            );
            terminarWorker();
            terminar(null);
          }, presupuestoFila + HARD_KILL_EXTRA_MS);
          w.onmessage = (ev: MessageEvent) => {
            const d = ev.data as
              | { type?: string; ts?: number; corners?: unknown; bitmap?: unknown }
              | null;
            if (!d || typeof d !== "object") return;
            if (Number(d.ts ?? NaN) !== ts) return; // correlación estricta
            const tipo = String(d.type ?? "");
            if (kind === "detect" && tipo === "result") {
              const c = d.corners as Float32Array | null | undefined;
              // corners null → null (el CAST es seguro: kind==='detect' ⇒ T=Float32Array)
              terminar((c && c.length === 8 ? c : null) as T | null);
              return;
            }
            if (kind === "warp" && tipo === "warped") {
              const b = d.bitmap as ImageBitmap | null | undefined;
              terminar((b && typeof b === "object" ? b : null) as T | null);
              return;
            }
            if (tipo === "busy" || tipo === "error") {
              terminar(null); // conservador — el worker sigue vivo (finally suyo)
            }
          };
          w.onerror = () => {
            terminarWorker(); // worker ROTO (crash duro) → respawn perezoso
            terminar(null);
          };
          try {
            w.postMessage(msg, transfer); // bitmap SIEMPRE transferido
          } catch {
            terminarWorker();
            terminar(null);
          }
        })();
      });
    const resultado = cadena.then(tarea, tarea);
    cadena = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }

  return {
    listo,
    detectar(bitmap400: ImageBitmap): Promise<Float32Array | null> {
      return pedir<Float32Array>("detect", (ts) => ({
        msg: { type: "detect", bitmap: bitmap400, ts },
        transfer: [bitmap400],
      }));
    },
    // KIT e14-prescan-warp-lado-v1: `maxWarpLado` opcional (≥256) viaja como
    // msg.maxWarpLongSide — el worker ya lo aceptaba como config CALIENTE
    // por mensaje (detection-worker.js) sin que NADIE lo usara. OMITIDO ⇒
    // default del worker (4032) byte-idéntico.
    warpar(
      bitmapFull: ImageBitmap,
      quad: Float32Array,
      maxWarpLado?: number,
    ): Promise<ImageBitmap | null> {
      return pedir<ImageBitmap>("warp", (ts) => ({
        // Anexo 1: quad = Float32Array(8) EN FRACCIONES 0–1 (TL,TR,BR,BL —
        // llegan de `detect`); `manual` OMITIDO (default → refineQuad del
        // worker; defaults = los que el harness validó).
        msg: {
          type: "warp",
          bitmap: bitmapFull,
          quad,
          ts,
          ...(typeof maxWarpLado === "number" &&
          Number.isFinite(maxWarpLado) &&
          maxWarpLado >= 256
            ? { maxWarpLongSide: Math.round(maxWarpLado) }
            : {}),
        },
        transfer: [bitmapFull],
      }));
    },
    destruir(): void {
      const t = terminarActivo;
      terminarActivo = null;
      t?.(); // op en vuelo → null (jamás colgar al orquestador)
      terminarWorker();
    },
  };
}

/** Prueba interna (tests): reemplaza la fábrica del worker. `null` restaura
 *  la de producción (patrón e73 __setFabricaWorkerSondeoParaTest). */
export function __setFabricaWorkerDeteccionParaTest(f: FabricaWorkerDeteccion | null): void {
  fabrica = f ?? fabricaProduccion;
}

// ─── KIT flujo-dueno-v1 (K2) — helpers MOVIDOS aquí desde prescan-qr.ts ─────
// Misma doctrina §A.2 del kit e73 (módulo compartido re-exportado — cero
// diffs en consumidores): los helpers viven donde vive el CONTRATO del
// worker (clase 400 / fracciones 0-1) y sirven al pre-scan de «PROCESAR
// COLA» (prescan-qr.ts los re-exporta — consumidores sin cambios). El warp
// de ingesta (K2, flag OFF) quedó fuera del port D27.

/** (MOVIDO — KIT e14-quad-streaming-v1 P4) Float32Array(8) del worker
 *  (fracciones 0-1, TL,TR,BR,BL — contrato del cliente) → Quad del core
 *  ([{x,y}×4]). null ante CUALQUIER duda (longitud/NaN — conservador: el
 *  stamp jamás inventa; sin quad la fila procesa con detección propia como
 *  siempre). El bridge RE-VALIDA la plausibilidad por su lado (guard doble).
 *  Export SOLO-TEST-friendly (knip tiene los *.test.ts como entry). */
export function quadDeFracciones(a: Float32Array | null | undefined): Quad | null {
  try {
    if (!a || a.length !== 8) return null;
    const v = Array.from(a);
    if (v.some((n) => !Number.isFinite(n))) return null;
    return [
      { x: v[0]!, y: v[1]! },
      { x: v[2]!, y: v[3]! },
      { x: v[4]!, y: v[5]! },
      { x: v[6]!, y: v[7]! },
    ];
  } catch {
    return null; // jamás throw — doctrina del conservador
  }
}

/** (MOVIDO — e107 §D.2) Downscale a la clase 400 del core (mismo gesto del
 *  harness): proporcional al lado mayor, resizeQuality "low" — velocidad
 *  sobre nitidez. Ya chico → se transfiere tal cual. */
export async function downscaleLado(
  bitmap: ImageBitmap,
  ladoObjetivo: number,
): Promise<ImageBitmap> {
  const lado = Math.max(bitmap.width, bitmap.height);
  if (lado <= ladoObjetivo) return bitmap; // ya chico — se transfiere tal cual
  const escala = ladoObjetivo / lado;
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  return await createImageBitmap(bitmap, {
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: "low", // clase 400 del core — velocidad sobre nitidez
  });
}
