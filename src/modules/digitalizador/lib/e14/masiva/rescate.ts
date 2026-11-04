/**
 * WAVE3 §B — ORDEN-WAVE3-remoto-rescate-obs-v1 (feat/rescate-rechazo-v1):
 * RESCATE anti-FALSO-RECHAZO transitorio.
 *
 * Hipótesis de trabajo con evidencia (lotes 7/8/9 — informes 104609/111502/
 * 113656/114337): el rechazo `BAJO — NO SE RECONOCE INFORMACIÓN` es
 * INTERMITENTE (OCR bajo presión extrema de recursos — zona p95 30-46 s),
 * NO de orientación (el probe jamás rotó en los rechazos: rot=0,
 * aplicado=false, skew ni siquiera medido) y NO determinista (las MISMAS
 * actas dieron score 10 FUERTE en las corridas siguientes). Por eso el
 * rescate es un REINTENTO controlado del paso desenlace con workers
 * frescos — la maquinaria EXISTENTE del bucle de intentos/watchdog — y NO
 * un barrido de rotaciones.
 *
 * RED LINES (kit §B.1):
 *  · jamás toca relectura.ts (e63f intacto — ese rescate es para
 *    EN_REVISION_HUMANA; este para RECHAZADAS-BAJO);
 *  · jamás rescata ADVERTENCIA/EN_REVISION;
 *  · jamás rescata rechazos de calidad (ahí re-tomar la foto SÍ ayuda).
 *  · relectura.ts, tope.ts, cola.ts: INTOCABLES.
 *
 * Costo acotado: máx 1 re-ejecución por fila (el predicado exige intento 1
 * — la 2ª pasada ya no rescata) y máx MAX_RESCATES_CORRIDA por corrida
 * (contador del runner). El veredicto del reintento manda: si también
 * RECHAZA, se acepta el rechazo ORIGINAL (honesto, sin inventar).
 */
import type { Acta } from "../types";

/** Techo del costo del rescate: máx 3 reintentos POR CORRIDA (kit §B.1). */
export const MAX_RESCATES_CORRIDA = 3;

/** Contexto del rescate (inyectado por el runner — PURO y testable). */
export interface ContextoRescate {
  /** intento ACTUAL del bucle del pipeline (solo la 1ª pasada rescata). */
  intento: number;
  /** rescates ya lanzados en ESTA corrida (contador del runner). */
  rescatesCorrida: number;
  /** escape del dueño — PROCESAR IGUAL manda SIEMPRE (RL-e65b-6). */
  forzarDedupOff?: boolean;
}

/** Predicado PURO del rescate (kit §B.1 — formato literal): SOLO
 *  RECHAZADA-BAJO («no se reconoce información»), SOLO intento 1, SOLO con
 *  cupo de corrida disponible y SIN escape del dueño activo. */
export function procedeRescateRechazo(
  desenlace: Pick<Acta, "status" | "rechazo">,
  contexto: ContextoRescate,
): boolean {
  return (
    desenlace.status === "RECHAZADA" &&
    desenlace.rechazo?.tipo === "BAJO" &&
    contexto.intento === 1 &&
    contexto.rescatesCorrida < MAX_RESCATES_CORRIDA &&
    !contexto.forzarDedupOff
  );
}
