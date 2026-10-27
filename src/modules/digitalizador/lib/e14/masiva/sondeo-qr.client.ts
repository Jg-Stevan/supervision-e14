"use client";

/**
 * KIT e73-sondeo-qr-precoz-v1 (§A.4) — CLIENTE del sondeo QR en ingesta.
 *
 * Sin precedente en el repo: diseño conservador de cero.
 *  · Singleton de worker + cola FIFO SERIALIZADA (1 sondeo a la vez — RAM
 *    móvil; el trabajo corre mientras el dueño revisa la cola, costo
 *    percibido ≈ 0).
 *  · Hard-kill anti-zombi: `setTimeout(presupuesto + 1000)` →
 *    `worker.terminate()` + respawn perezoso → resolve `null` (un worker
 *    colgado JAMÁS frena la ingesta — red line §I).
 *  · Feature-detect obligatorio (§A.1): `typeof Worker === "undefined" ||
 *    typeof OffscreenCanvas === "undefined"` → `null` SIEMPRE (degradación
 *    honesta, cero throw).
 *  · Flag OFF (sondeoQrPrecoz, default true — §D) → `null` SIN instanciar
 *    worker (kill-switch del dueño — byte-idéntico a 043b2ba).
 *  · JAMÁS throw: cualquier fallo (crear/postMessage/respuesta mala) → null.
 *
 * API única: sondearQrPrecoz(archivo: File | Blob) → {payload, tier, ms} | null
 */
import { logger } from "../../logger";
import { leerFlags } from "../flags";
// KIT e14-obs-hang-atribucion-v1 (§A.5) — hook D58: contexto barato al
// resolver el sondeo en main (el trabajo pesado vive en el worker).
import { marcarOperacion } from "../obs/operacion";
import type { RespuestaSondeo } from "./sondeo-qr.worker";

/** Resultado del sondeo — ESPEJO de RespuestaSondeo del worker: el objeto
 *  (nunca null) significa «el sondeo CORRIÓ y midió ms» (payload null = sin
 *  QR — honesto, alimenta «N leídos» del informe §E); `null` de la promesa
 *  significa «NO corrió» (flag OFF / sin soporte / hard-kill / error).
 *  Payload EXACTO (llave opaca) + tier que lo leyó — M-e73-2 del REPORTE. */
export type SondeoQr = { payload: string | null; tier: string | null; ms: number };

/** Contrato mínimo del worker que este cliente maneja (tests lo falsifican). */
export interface WorkerSondeo {
  postMessage(msg: PeticionSondeoAnonima): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent<RespuestaSondeo>) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** Mensaje anónimo (Blob viaja structured-clone). */
type PeticionSondeoAnonima = { blob: Blob; presupuestoMs: number };

/** Fábrica del worker — inyectable SOLO para tests (kit §A.5). En
 *  producción es la ÚNICA referencia `new Worker` de src/ (smoke §A.1). */
export type FabricaWorkerSondeo = () => WorkerSondeo | null;

/** Base pública de assets — MISMO patrón del repo (flags.ts/rapidocr.ts/
 *  scanner-core WORKER_URL): assets servidos desde public/ con prefijo
 *  NEXT_PUBLIC_BASE_PATH (Vercel sirve bajo /digielect14). */
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function fabricaProduccion(): WorkerSondeo | null {
  // FIX DICTAMEN-e73-implementacion-v1 §3.1: Turbopack trató
  // `new Worker(new URL("./sondeo-qr.worker.ts", import.meta.url))` como
  // ASSET estático (emitía el .ts crudo → verde falso del smoke §A.1). El
  // worker vive ahora PRECOMPILADO en public/scanner/sondeo-qr.worker.js
  // (IIFE clásica — precedente detection-worker.js de scanner-core,
  // WORKER_URL = `${PUBLIC_BASE}/scanner/detection-worker.js?v=8`),
  // regenerado por scripts/build-sondeo-worker.mjs y verificado por el
  // smoke REAL del gate (scripts/smoke-sondeo-worker.mjs).
  return new Worker(
    `${PUBLIC_BASE}/scanner/sondeo-qr.worker.js`,
  ) as unknown as WorkerSondeo;
}

let fabrica: FabricaWorkerSondeo = fabricaProduccion;
let worker: WorkerSondeo | null = null;
let workerListo = false;

function obtenerWorker(): WorkerSondeo | null {
  if (workerListo) return worker;
  workerListo = true; // una sola tentativa por vida del módulo — el respawn
  // del hard-kill RE-ACTIVA (workerListo=false en terminarWorker).
  try {
    worker = fabrica();
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
  }
  return worker;
}

function terminarWorker(): void {
  try {
    worker?.terminate();
  } catch {
    /* ya muerto */
  }
  worker = null;
  workerListo = false; // respawn perezoso — el próximo sondeo lo re-crea
}

const cola: { archivo: Blob; presupuestoMs: number; resolve: (r: SondeoQr | null) => void }[] =
  [];
let corriendo = false;

// KIT e14-sondeo-burst-v1 (P1a — diagnóstico): kills en la ÚLTIMA minute.
// La ventana llena delata HAMBRUNA de CPU (burst de ingesta: dhash/decode en
// main + OCR WASM compitiendo por 4 hilos — el worker NO está zombi, está
// lento) vs un zombi real (kill aislado). El remedio de la hambruna es
// dhash→worker (P1b), NO extender este presupuesto (§I — jamás extender).
let killsRecientes: number[] = [];

/** Presupuesto saneado del flag (§D — default 2500; jamás extender — §I). */
function presupuestoDeFlags(): number {
  const bruto = leerFlags().sondeoQrPresupuestoMs;
  const n = typeof bruto === "number" && Number.isFinite(bruto) ? Math.round(bruto) : 2500;
  return Math.max(500, Math.min(30_000, n));
}

/**
 * API ÚNICA del kit (§A.4): sondear el QR de UN archivo en la ingesta.
 * Serializada FIFO (1 a la vez); jamás throw; fallo/falta de soporte/flag
 * OFF/worker colgado → null (la vía de HOY — dhash in-pool — sigue intacta).
 */
export function sondearQrPrecoz(archivo: File | Blob): Promise<SondeoQr | null> {
  return new Promise((resolve) => {
    try {
      // Feature-detect §A.1 — entornos sin workers (o sin OffscreenCanvas)
      // devuelven null SIEMPRE, sin instanciar nada.
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
        resolve(null);
        return;
      }
      // Flag OFF → null sin instanciar worker (kill-switch, byte-idéntico).
      if (!leerFlags().sondeoQrPrecoz) {
        resolve(null);
        return;
      }
      cola.push({ archivo, presupuestoMs: presupuestoDeFlags(), resolve });
      drenar();
    } catch {
      resolve(null); // jamás tumba la ingesta (doctrina del conservador)
    }
  });
}

/** Drena la cola FIFO — un sondeo a la vez (RAM móvil). */
function drenar(): void {
  if (corriendo) return;
  const siguiente = cola.shift();
  if (!siguiente) return;
  corriendo = true;
  void ejecutar(siguiente).finally(() => {
    corriendo = false;
    drenar();
  });
}

async function ejecutar(tarea: {
  archivo: Blob;
  presupuestoMs: number;
  resolve: (r: SondeoQr | null) => void;
}): Promise<void> {
  // La tarea vive HASTA terminar() (respuesta/hard-kill/error) — el .finally
  // de drenar NO puede correr antes: si no, el siguiente mensaje saldría
  // antes de que el worker respondiera el actual (FIFO rota).
  return new Promise<void>((listo) => {
    const { archivo, presupuestoMs, resolve } = tarea;
    const w = obtenerWorker();
    if (!w) {
      resolve(null); // worker no disponible → degradación honesta
      listo();
      return;
    }
    let resuelto = false;
    let hardKill: ReturnType<typeof setTimeout> | null = null;
    const terminar = (r: SondeoQr | null): void => {
      if (resuelto) return;
      resuelto = true;
      // KIT e14-obs-hang-atribucion-v1 (§A.5) — al resolver en main el
      // resultado del worker se marca la operación activa (contexto barato:
      // el trabajo pesado vive en el worker; aquí corre el patch de bandeja
      // y la continuación de la cadenaDedup). Sin clear — la edad delata.
      marcarOperacion("qr-sondeo-ingesta");
      if (hardKill !== null) clearTimeout(hardKill);
      resolve(r);
      listo();
    };
    // Hard-kill anti-zombi (§A.4): presupuesto + 1000 ms → terminate + respawn
    // + null. El worker colgado jamás frena la ingesta.
    hardKill = setTimeout(() => {
      // Diagnóstico hambruna-vs-zombi (e14-sondeo-burst-v1): ≥3 kills/min
      // se etiquetan aparte — el grouping de observabilidad los separa de
      // los kills aislados y la próxima sesión distingue burst de zombi.
      const ahora = Date.now();
      killsRecientes = killsRecientes.filter((t) => ahora - t < 60_000);
      killsRecientes.push(ahora);
      const hambruna = killsRecientes.length >= 3 ? killsRecientes.length : 0;
      logger.warn(
        `[e14] sondeo-qr hard-kill presupuesto=${presupuestoMs}+1000 — worker colgado (respawn)${hambruna ? ` — ${hambruna} kills/min: hambruna de CPU sospechada (contención de burst), no zombi` : ""}`,
      );
      terminarWorker();
      terminar(null);
    }, presupuestoMs + 1000);
    w.onmessage = (ev: MessageEvent<RespuestaSondeo>) => {
      const r = ev.data;
      // Respuesta COMPLETA del worker (el objeto = corrió; payload null =
      // sin QR — la telemetría de ms es REAL incluso sin lectura — §E).
      terminar(
        r
          ? {
              payload: typeof r.payload === "string" && r.payload.length > 0 ? r.payload : null,
              tier: typeof r.payload === "string" && r.payload.length > 0 ? String(r.tier ?? "") : null,
              ms: Number(r.ms) || 0,
            }
          : null,
      );
    };
    w.onerror = () => {
      terminarWorker(); // worker roto → respawn perezoso
      terminar(null);
    };
    try {
      w.postMessage({ blob: archivo, presupuestoMs });
    } catch {
      terminarWorker();
      terminar(null);
    }
  });
}

/** Prueba interna (tests): reemplaza la fábrica del worker. `null` restaura
 *  la de producción. */
export function __setFabricaWorkerSondeoParaTest(f: FabricaWorkerSondeo | null): void {
  fabrica = f ?? fabricaProduccion;
  terminarWorker();
  cola.length = 0;
  corriendo = false;
  killsRecientes = []; // ventana de diagnóstico limpia entre tests
}
