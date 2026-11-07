/**
 * KIT e14-observabilidad-v1 (A1-C7) — CAPTURA de errores + emisión de perf.
 *
 * · instalarCaptura() — idempotente: window.onerror + unhandledrejection →
 *   ErrorEvento completo (mensaje/stack truncados, digest estable, archivo
 *   src/, breadcrumbs del momento) al buffer. try/catch TOTAL y flag
 *   anti-recursión (el guard de appendEvento — README-KITS §2.4): un error
 *   DENTRO del rastreo jamás genera otro evento ni toca la consola.
 * · ErrorBoundaryObs — captura errores de render (componentDidCatch) →
 *   evento + UI de fallo sobria (sin crash blanco).
 * · emitirPerfDeActa(a) — el PUENTE del pipeline (scanner-core-bridge,
 *   cambio quirúrgico C7): hashea actaId (FNV-1a — JAMÁS el id plano,
 *   §2.5), respeta politica.metadatos, try/catch total, lazy import.
 */
import { appendEvento } from "./buffer";
import { archivoDeStack, digestDe } from "./digest";
import { obtenerBreadcrumbs } from "./breadcrumbs";
import { idDispositivo, idSesion, appVersion, fnv1a8 } from "./identidad";
// Costura ④ (3.6): la política de la app llega INYECTADA (config). El
// ErrorBoundaryObs (~58 L de clase React, L160-217 del original) SE QUEDA
// en cada app — es la ÚNICA pieza React de todo obs/ y el paquete no
// conoce React (regla §0). La app lo define sobre emitirError (exportada).
import { configObsBase } from "./config";
import type { ErrorEvento, PerfActa } from "./tipos";

const TRUNCA_MENSAJE = 500; // contrato ErrorEvento
const TRUNCA_STACK = 2000;
const MAX_BREADCRUMBS = 30;

/** Montar el ErrorEvento del contrato desde un error crudo (pura —
 *  testeada). JAMÁS lanza (entrada hostil: e puede ser cualquier cosa). */
export function eventoDeError(
  error: unknown,
  origen: "WindowError" | "UnhandledRejection" | "ErrorBoundary",
): { tipo: "error" | "warn"; datos: ErrorEvento } {
  const e = error instanceof Error ? error : null;
  const mensaje = (e ? `${e.name}: ${e.message}` : String(error ?? "desconocido")).slice(
    0,
    TRUNCA_MENSAJE,
  );
  const stack = ((e && e.stack) || "").slice(0, TRUNCA_STACK);
  const tipoConstructor = e ? e.constructor?.name ?? "Error" : origen; // no-Error → el origen manda
  return {
    tipo: "error",
    datos: {
      mensaje,
      stack,
      tipo: tipoConstructor,
      archivo: archivoDeStack(stack),
      digest: digestDe(mensaje, tipoConstructor, stack),
      breadcrumbs: obtenerBreadcrumbs().slice(-MAX_BREADCRUMBS),
    },
  };
}

/** Emitir un error al buffer con la identidad completa (sesion/dispositivo/
 *  appVersion) — silencioso SIEMPRE. */
export async function emitirError(
  error: unknown,
  origen: "WindowError" | "UnhandledRejection" | "ErrorBoundary",
): Promise<void> {
  try {
    const { tipo, datos } = eventoDeError(error, origen);
    await appendEvento({
      tipo,
      ts: Date.now(),
      sesion: idSesion(),
      dispositivo: idDispositivo(),
      appVersion: appVersion(),
      datos,
    });
  } catch {
    /* el rastreo jamás rompe la app (§2.4) */
  }
}

let capturaInstalada = false;

/** window.onerror + unhandledrejection (idempotente, cliente). */
export function instalarCaptura(): void {
  try {
    if (capturaInstalada || typeof window === "undefined") return;
    capturaInstalada = true;
    window.addEventListener("error", (ev) => {
      // solo errores de runtime (un resource load fallido también dispara
      // `error` pero con target element — se ignora, no es un fallo JS)
      if (ev.target && (ev.target as HTMLElement).tagName) return;
      void emitirError(ev.error ?? ev.message, "WindowError");
    });
    window.addEventListener("unhandledrejection", (ev) => {
      void emitirError(ev.reason, "UnhandledRejection");
    });
  } catch {
    /* silencioso */
  }
}

/** Datos de perf del contrato PerfActa (el sitio del bridge ya los tiene —
 *  NO re-evalúa nada, §9.10). */
export interface DatosPerfActa {
  actaId: string;
  status: string;
  intento: number;
  tiempos: Record<string, number>;
  scoreVisual: number;
  scoreFinal: number;
  gate: string;
  ocrValido: boolean;
}

/** §G.3 — ORDEN-WAVE3-add-envio-individual-v1 (obs-envio-individual-v1):
 *  hash del actaId para enviosDetalle (PURO). La MISMA disciplina §4.3 de
 *  emitirPerfDeActa: el id plano SOLO existe dentro de captura.ts (ancla
 *  qa-obs-privacidad bloque d — actaId plano jamás sale de aquí) —
 *  export.ts consume el diag y recibe el id YA HASHEADO: el token `actaId`
 *  ni siquiera aparece en el código del exportador. fnv1a8 8 hex. */
export function hashDeActaIdDe(diag: { actaId: string }): string {
  return fnv1a8(typeof diag?.actaId === "string" ? diag.actaId : "");
}

/** Emisión perf del puente (C7): hashea el actaId (FNV-1a 8 hex — el id
 *  plano JAMÁS sale, §2.5), respeta politica.metadatos (kill switch de
 *  datos), try/catch total, lazy import del buffer — el pipeline no espera
 *  ni puede romperse por esto. */
export function emitirPerfDeActa(a: DatosPerfActa): void {
  void import("./buffer")
    .then(async (buffer) => {
      try {
        if (!configObsBase.politicaMetadatos()) return; // kill switch de datos (D4)
        await buffer.appendEvento({
          tipo: "perf",
          ts: Date.now(),
          sesion: idSesion(),
          dispositivo: idDispositivo(),
          appVersion: appVersion(),
          datos: {
            actaIdHash: fnv1a8(a.actaId),
            status: a.status,
            intento: a.intento,
            tiempos: a.tiempos,
            scoreVisual: a.scoreVisual,
            scoreFinal: a.scoreFinal,
            gate: a.gate,
            ocrValido: a.ocrValido,
          } satisfies PerfActa,
        });
      } catch {
        /* silencioso */
      }
    })
    .catch(() => {
      /* silencioso */
    });
}
