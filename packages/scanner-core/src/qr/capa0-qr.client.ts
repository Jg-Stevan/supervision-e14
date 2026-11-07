"use client";

/**
 * KIT e14-capa0-qr-worker-v1 — CLIENTE del worker de la CAPA 0 QR.
 *
 * FASE 2 del mapa v2.3: UNIFICACIÓN de los dos clientes (D: flujo individual
 * de cámara · S: concurrencia del runner masivo) sobre el MISMO artefacto
 * precompilado (build único 3.7 — lección DICTAMEN-e73 §3.1):
 *  · Base S-masiva: peticiones con id correlativo (pool del runner), hard-kill
 *    KILL≠ERROR (kill = corrió/vencido — el runner NO re-paga los tiers jsQR;
 *    error = null — escalera main completa), higiene F2 del catch (solo el
 *    pendiente PROPIO se limpia).
 *  · API 2 de D: decodificarQrCapa0Camara(dataUrl) — wrapper del flujo de
 *    cámara con presupuesto por tier y caída al camino de hoy (tiers "base").
 *  · Inyección (plan/flags NO viajan): { habilitado?, tier?, publicBase? } —
 *    el kill-switch del dueño y el tier adaptativo los inyecta CADA app
 *    (D: flags.capa0QrWorker + planAdaptativo().tier · S: flags + gama).
 *  · JAMÁS throw: cualquier fallo → null (el caller decide el fallback).
 */
import { logger } from "../dominio/logger";
import { publicBaseEfectivo } from "../dominio/entorno";
import type { FinCapa0, FasesCapa0, RespuestaCapa0 } from "../../workers/capa0-qr.worker";

export type { FinCapa0, FasesCapa0, PeticionCapa0 } from "../../workers/capa0-qr.worker";

/** Resultado del worker — ESPEJO de RespuestaCapa0 (sin el id). */
export type ResultadoCapa0Worker = {
  corrio: true;
  payload: string | null;
  tier: string | null;
  ms: number;
  presupuestoVencido?: boolean;
  fases?: FasesCapa0;
  fin?: FinCapa0;
};

/** Opciones de la cadena (plan de gama D74 — mismos nombres del runner). */
export type OpcionesCapa0Worker = {
  ladoLargo: number;
  rescate4096: boolean;
  presupuestoMs: number | null;
};

/** Inyección de la app (FASE 2 — el paquete no lee flags/plan/gama). */
export interface OpcionesCapa0 {
  /** Kill-switch del dueño (D/S: flags.capa0QrWorker). Default: ON. */
  habilitado?: () => boolean;
  /** Tier adaptativo (D: planAdaptativo().tier · S: gama). null = default. */
  tier?: () => "ALTO" | "MEDIO" | "BAJO" | null;
}

const opciones: OpcionesCapa0 = {};
export function configurarCapa0(o: OpcionesCapa0): void {
  Object.assign(opciones, o);
}

/** Cache-busting del worker precompilado. v4: artefacto UNIFICADO del
 *  paquete (mismo bundle en ambas apps — build único 3.7). */
const WORKER_URL = (): string => `${publicBaseEfectivo()}/scanner/capa0-qr.worker.js?v=4`;

/** Gracia del hard-kill SOBRE el presupuesto del worker. */
const GRACIA_KILL_MS = 1500;

let worker: Worker | null = null;
let workerListo = false;

function obtenerWorker(): Worker | null {
  if (workerListo) return worker;
  workerListo = true; // una sola tentativa por vida del módulo — el respawn
  // del hard-kill RE-ACTIVA (workerListo=false en terminarWorker).
  try {
    worker = new Worker(WORKER_URL());
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = enMensaje;
    worker.onerror = enError;
  }
  return worker;
}

/** Pendientes vivos por id — el hard-kill resuelve TODOS. */
const pendientes = new Map<
  number,
  { resolve: (r: ResultadoCapa0Worker | null) => void; kill: ReturnType<typeof setTimeout> }
>();
let seqId = 0;

/** R1.4-b — validación del desglose que cruza el postMessage (desconfianza
 *  sanadora — un bundle viejo no trae el campo y un mensaje malo no tumba
 *  el cliente). */
function fasesValidas(f: unknown): FasesCapa0 | undefined {
  if (typeof f !== "object" || f === null) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as FasesCapa0) : undefined;
}

/** Fines legales — espejo de FinCapa0 (el postMessage cruza sin tipos). */
const FINES_CAPA0: ReadonlySet<string> = new Set([
  "payload",
  "agotado",
  "vencido",
  "sin-decode",
]);

function enMensaje(ev: MessageEvent<RespuestaCapa0>): void {
  const r = ev.data;
  const pendiente = typeof r?.id === "number" ? pendientes.get(r.id) : undefined;
  if (!pendiente) return; // respuesta huérfana (post-kill) — ignorar
  pendientes.delete(r.id);
  arranquePendiente.delete(r.id);
  clearTimeout(pendiente.kill);
  pendiente.resolve({
    corrio: true,
    payload: typeof r.payload === "string" && r.payload.length > 0 ? r.payload : null,
    tier: typeof r.payload === "string" && r.payload.length > 0 ? String(r.tier ?? "") : null,
    ms: Number(r.ms) || 0,
    // R1.1 — passthrough honesto: undefined (bundle viejo) = conservador
    presupuestoVencido: r.presupuestoVencido === false ? false : true,
    // R1.4-b — passthrough validado: undefined = sin telemetría (jamás inventar).
    fases: fasesValidas(r.fases),
    fin:
      typeof r.fin === "string" && FINES_CAPA0.has(r.fin)
        ? (r.fin as FinCapa0)
        : undefined,
  });
}

function enError(): void {
  terminarWorker("error"); // worker roto → respawn perezoso + pendientes a null
}

/** Horas de inicio del pendiente vivo (para el `ms` honesto del kill). */
const arranquePendiente = new Map<number, number>();

function terminarWorker(motivo: "kill" | "error"): void {
  // KILL ≠ ERROR (evolución del lote demo 2026-11-03): en el kill el worker
  // SÍ recibió el blob y lleva `presupuesto+1500 ms` mordiendo la escalera
  // jsQR; resolver null haría que el caller PAGARA DE NUEVO la escalera
  // completa en main. Con `corrio:true, fin:"vencido"` el caller toma la
  // rama «worker corrió y no lo vio»: SOLO el rescate zxing de main.
  // ERROR sí resuelve null: el bundle puede no haber ejecutado nunca.
  for (const [id, pendiente] of pendientes) {
    clearTimeout(pendiente.kill);
    const t0 = arranquePendiente.get(id);
    pendiente.resolve(
      motivo === "kill"
        ? {
            corrio: true,
            payload: null,
            tier: null,
            ms: t0 ? Math.round(performance.now() - t0) : 0,
            presupuestoVencido: true,
            fin: "vencido",
          }
        : null,
    );
  }
  pendientes.clear();
  arranquePendiente.clear();
  try {
    worker?.terminate();
  } catch {
    /* ya muerto */
  }
  worker = null;
  workerListo = false;
}

/**
 * API 1 del kit: la cadena jsQR de la CAPA 0 en el worker. Jamás throw;
 * sin soporte / kill-switch OFF / hard-kill / error → null.
 */
export function decodificarQrCapa0Worker(
  blob: Blob,
  opcionesCadena: OpcionesCapa0Worker,
): Promise<ResultadoCapa0Worker | null> {
  return new Promise((resolve) => {
    // F2 — id del pendiente YA REGISTRADO (null = aún no). El catch limpia
    // SOLO el pendiente propio (con pool≥2 hay pendientes de otras actas
    // vivos en el MISMO map — un borrado masivo mataría respuestas sanas).
    let registradoId: number | null = null;
    try {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
        resolve(null);
        return;
      }
      // Kill-switch del dueño — INYECTADO por la app (leído EN EL LLAMADO:
      // el override localStorage aplica sin reload).
      if (opciones.habilitado && !opciones.habilitado()) {
        resolve(null);
        return;
      }
      const w = obtenerWorker();
      if (!w) {
        resolve(null); // worker no disponible → degradación honesta
        return;
      }
      const id = ++seqId;
      const presupuesto = opcionesCadena.presupuestoMs;
      const kill = setTimeout(
        () => {
          logger.warn(
            `[e14] capa0-qr worker hard-kill presupuesto=${presupuesto ?? "∞"}+${GRACIA_KILL_MS} — worker colgado (respawn); el caller SOLO paga el rescate zxing (los tiers jsQR ya mordieron)`,
          );
          terminarWorker("kill");
        },
        (presupuesto ?? 120_000) + GRACIA_KILL_MS,
      );
      pendientes.set(id, { resolve, kill });
      registradoId = id;
      arranquePendiente.set(id, performance.now());
      w.postMessage({
        id,
        blob,
        ladoLargo: opcionesCadena.ladoLargo,
        rescate4096: opcionesCadena.rescate4096,
        presupuestoMs: presupuesto,
      });
    } catch {
      // F2 — timer zombi: solo el pendiente PROPIO se limpia.
      if (registradoId !== null) {
        const pendiente = pendientes.get(registradoId);
        if (pendiente) clearTimeout(pendiente.kill);
        pendientes.delete(registradoId);
        arranquePendiente.delete(registradoId);
      }
      resolve(null); // jamás tumba el pipeline (doctrina del conservador)
    }
  });
}

/** Lado largo del canvas de trabajo de la cadena (MISMO literal de
 *  identidad-qr.ts QR_LADO_LARGO — literal aquí para no arrastrar el
 *  módulo con zxing al wrapper). */
const QR_LADO_LARGO = 2048;

/**
 * API 2 (de D) — la CAPA 0 QR de la CÁMARA en el worker. Contrato EXACTO del
 * bloque e64-qr T-2.1 del bridge ({payload} | null, jamás throw):
 *  · dataUrl → Blob (fetch local — sin re-decode en main).
 *  · presupuesto por tier INYECTADO (unificada: BAJO 5 s con rescate 4096
 *    OFF — floor anti-OOM; ALTO/MEDIO/null 8 s con rescate).
 *  · worker SÍ corrió → su payload (cobertura ⊇ tier base de hoy);
 *    payload null → null honesto (SIN doble trabajo en main).
 *  · worker NO corrió → camino de HOY byte-idéntico (tiers "base").
 */
export async function decodificarQrCapa0Camara(
  dataUrl: string,
): Promise<{ payload: string } | null> {
  try {
    const respuesta = await fetch(dataUrl);
    const blob = await respuesta.blob();
    let presupuestoMs = 8_000;
    let rescate4096 = true;
    try {
      const tier = opciones.tier ? opciones.tier() : null;
      if (tier === "BAJO") {
        presupuestoMs = 5_000;
        rescate4096 = false; // floor anti-OOM (lección INVALID SESSION móvil)
      }
    } catch {
      /* tier indisponible → unificada default (8 s / rescate) */
    }
    const r = await decodificarQrCapa0Worker(blob, {
      ladoLargo: QR_LADO_LARGO,
      rescate4096,
      presupuestoMs,
    });
    if (r) {
      // Telemetría PASIVA — la misma que la masiva lee en sus informes:
      // tier + ms + fin + desglose de fases (Σ fases ≤ ms SIEMPRE).
      try {
        logger.info(
          `[e14] qr-capa0-worker tier=${r.tier ?? "null"} ms=${r.ms} fin=${r.fin ?? "n/d"} fases=${r.fases ? JSON.stringify(r.fases) : "n/d"} presupuestoVencido=${r.presupuestoVencido ? 1 : 0}`,
        );
      } catch {
        /* la traza jamás tumba el pipeline */
      }
      return r.payload ? { payload: r.payload } : null;
    }
  } catch {
    /* worker/fetch falló → camino de hoy */
  }
  // Camino de HOY byte-idéntico (kill-switch OFF / sin soporte / hard-kill).
  const { decodificarQrDeCapture } = await import("./identidad-qr");
  return decodificarQrDeCapture(dataUrl, { tiers: "base" });
}
