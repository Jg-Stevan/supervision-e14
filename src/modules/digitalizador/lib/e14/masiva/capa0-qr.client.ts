"use client";

/**
 * KIT e14-capa0-qr-worker-v1 (D40) — CLIENTE del worker de la CAPA 0 QR.
 *
 * Hermano del cliente del sondeo (sondeo-qr.client.ts — mismo diseño
 * conservador, adaptado a la CONCURRENCIA del runner):
 *  · Worker precompilado en public/scanner/capa0-qr.worker.js (IIFE —
 *    precedente detection-worker.js / sondeo-qr.worker.js; el .ts NO se
 *    deja al bundler de la app — lección del FIX DICTAMEN-e73 §3.1).
 *  · Peticiones con `id` correlativo (map de pendientes): el runner puede
 *    tener 2 actas en vuelo (pool=2 del D38 amplificado) — el worker las
 *    procesa en su propio event loop y las respuestas se rutean por id.
 *  · Hard-kill anti-zombi: `presupuesto + 1500 ms` → terminate + respawn
 *    perezoso + TODOS los pendientes → null (un worker colgado JAMÁS frena
 *    el runner — el caller en main decide: fallback camino de hoy).
 *  · Feature-detect obligatorio: sin Worker/OffscreenCanvas → null SIEMPRE
 *    (el runner cae al camino de hoy byte-idéntico).
 *  · Flag OFF (capa0QrWorker, default true) → null SIN instanciar worker
 *    (kill-switch del dueño — el runner corre el camino de hoy).
 *  · JAMÁS throw: cualquier fallo (crear/postMessage/respuesta mala) → null.
 *
 * API única: decodificarQrCapa0Worker(blob, opciones) →
 *   { corrio: true, payload, tier, ms } | null
 *   · objeto = el worker CORRIÓ (payload null = sin QR en los tiers jsQR —
 *     el caller añade el rescate zxing de main para cobertura EXACTA).
 *   · null = NO corrió (el caller corre el camino de hoy byte-idéntico).
 */
import { logger } from "../../logger";
import { leerFlags } from "../flags";
import type { RespuestaCapa0 } from "./capa0-qr.worker";

/** Resultado del worker — ESPEJO de RespuestaCapa0 (sin el id).
 *  R1.1 — presupuestoVencido: el reló de la cadena venció al terminar
 *  (el null fue CORTE por presupuesto, no agotamiento — la caché negativa
 *  R1.2 del runner NO cachea cortes). undefined = bundle del worker viejo
 *  (sin el campo) — tratado como vencido (conservador). */
export type ResultadoCapa0Worker = {
  corrio: true;
  payload: string | null;
  tier: string | null;
  ms: number;
  presupuestoVencido?: boolean;
};

/** Opciones de la cadena (plan de gama D74 — mismos nombres del runner). */
export type OpcionesCapa0Worker = {
  ladoLargo: number;
  rescate4096: boolean;
  presupuestoMs: number | null;
};

/** Base pública de assets — MISMO patrón del repo (sondeo-qr.client.ts).
 *  R2 — único en src/shared/env.ts (era const local §B2 #10). */
import { PUBLIC_BASE } from "@/shared/env";

/** Cache-busting del worker precompilado (mismo patrón ?v=N del
 *  detection-worker — bump al regenerar el bundle).
 *  R1.1 — v2: presupuesto REAL (guard por cuadrante/fracción en barridos +
 *  guard por rotación + guard del rescate 4096) y RespuestaCapa0
 *  .presupuestoVencido (R1.2 — la caché negativa no cachea cortes). */
const WORKER_URL = `${PUBLIC_BASE}/scanner/capa0-qr.worker.js?v=2`;

/** Gracia del hard-kill SOBRE el presupuesto del worker (mismo patrón del
 *  sondeo: presupuesto + gracia — el kill solo cae sobre colgajes reales). */
const GRACIA_KILL_MS = 1500;

let worker: Worker | null = null;
let workerListo = false;

function obtenerWorker(): Worker | null {
  if (workerListo) return worker;
  workerListo = true; // una sola tentativa por vida del módulo — el respawn
  // del hard-kill RE-ACTIVA (workerListo=false en terminarWorker).
  try {
    worker = new Worker(WORKER_URL);
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = enMensaje;
    worker.onerror = enError;
  }
  return worker;
}

/** Pendientes vivos por id — el hard-kill resuelve TODOS a null. */
const pendientes = new Map<
  number,
  { resolve: (r: ResultadoCapa0Worker | null) => void; kill: ReturnType<typeof setTimeout> }
>();
let seqId = 0;

function enMensaje(ev: MessageEvent<RespuestaCapa0>): void {
  const r = ev.data;
  const pendiente = typeof r?.id === "number" ? pendientes.get(r.id) : undefined;
  if (!pendiente) return; // respuesta huérfana (post-kill) — ignorar
  pendientes.delete(r.id);
  clearTimeout(pendiente.kill);
  pendiente.resolve({
    corrio: true,
    payload: typeof r.payload === "string" && r.payload.length > 0 ? r.payload : null,
    tier: typeof r.payload === "string" && r.payload.length > 0 ? String(r.tier ?? "") : null,
    ms: Number(r.ms) || 0,
    // R1.1 — passthrough honesto: undefined (bundle viejo) = conservador
    presupuestoVencido: r.presupuestoVencido === false ? false : true,
  });
}

function enError(): void {
  terminarWorker(); // worker roto → respawn perezoso + pendientes a null
}

function terminarWorker(): void {
  // Hard-kill/error: TODOS los pendientes viven → null (el runner cae al
  // camino de hoy) y el respawn es perezoso (el próximo mensaje re-crea).
  for (const [, pendiente] of pendientes) {
    clearTimeout(pendiente.kill);
    pendiente.resolve(null);
  }
  pendientes.clear();
  try {
    worker?.terminate();
  } catch {
    /* ya muerto */
  }
  worker = null;
  workerListo = false;
}

/**
 * API ÚNICA del kit: la cadena jsQR de la CAPA 0 en el worker. Jamás throw;
 * sin soporte / flag OFF / hard-kill / error → null (el caller en main corre
 * el camino de hoy byte-idéntico).
 */
export function decodificarQrCapa0Worker(
  blob: Blob,
  opciones: OpcionesCapa0Worker,
): Promise<ResultadoCapa0Worker | null> {
  return new Promise((resolve) => {
    try {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
        resolve(null);
        return;
      }
      // Kill-switch del dueño — leído EN EL LLAMADO (mismo patrón del sondeo:
      // el override localStorage aplica sin reload).
      if (!leerFlags().capa0QrWorker) {
        resolve(null);
        return;
      }
      const w = obtenerWorker();
      if (!w) {
        resolve(null); // worker no disponible → degradación honesta
        return;
      }
      const id = ++seqId;
      const presupuesto = opciones.presupuestoMs;
      const kill = setTimeout(
        () => {
          logger.warn(
            `[e14] capa0-qr worker hard-kill presupuesto=${presupuesto ?? "∞"}+${GRACIA_KILL_MS} — worker colgado (respawn); el runner cae al camino de hoy`,
          );
          terminarWorker();
        },
        (presupuesto ?? 120_000) + GRACIA_KILL_MS,
      );
      pendientes.set(id, { resolve, kill });
      w.postMessage({
        id,
        blob,
        ladoLargo: opciones.ladoLargo,
        rescate4096: opciones.rescate4096,
        presupuestoMs: presupuesto,
      });
    } catch {
      resolve(null); // jamás tumba el pipeline (doctrina del conservador)
    }
  });
}
