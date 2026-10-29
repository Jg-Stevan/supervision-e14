"use client";

/**
 * SPLIT del runner (refactor/runner-logger-v1, C1 — movimiento puro): la
 * ESPERA ACOTADA del dedup (guard de ingesta × pool, e72) vive aquí.
 *
 * Las PIEZAS ANCLADAS del dedup permanecen en runner.ts porque los
 * harnesses QA las grepean EN ESE archivo (protocolo C1 — anclas antes que
 * estética): `async function conExclusionMutua<`, `let mutexDedup…`,
 * `return conExclusionMutua(() => reutilizarResultadoCritica(fila, t0))`
 * (qa-dedup-enviadas.ts) y `const originalEnviada = actaCopia.status…` /
 * `actaCopia.enviadoAutomaticamente = null;` (qa-historico-enviadas.ts).
 * Este archivo NUNCA importa de otros runner-*.ts.
 */
import { leerRegistro } from "./cola";
import { logger } from "../../logger";
import { useMasivaStore } from "./store";

// ─── e72 — ESPERA ACOTADA por el desenlace de la original (guard de
// ingesta × pool) ─── La rama DUPLICADA de procesarUno caía al REPROCESO
// COMPLETO cuando la original aún no tenía desenlace (race Opt-1×Opt-3 del
// smoke del dueño — imagen10 pagó 32 s de OCR por ser gemela exacta de
// imagen9). Sondeo SOLO-LECTURA cada INTERVALO hasta que el registro de la
// original traiga acta (→ reutilizar copia al instante) o la espera muera:
// original QUITADA/ERROR/YA-ENVIADA (sin acta propia — jamás habrá copia),
// ESTA fila QUITADA (la voluntad del dueño manda) o TECHO (10 min ≈ 4× el
// peor caso del watchdog D65 con reintentos — el slot del pool queda libre
// y el fallback honesto de SIEMPRE corre: el dueño nunca pierde la foto).
// PENDIENTE/PROCESANDO ESPERAN (la original siempre va delante en la FIFO
// — el otro slot del pool la alcanza; sin deadlock por construcción).
// Sin timers globales — mismo patrón de esperarDesenlaceQr (e63m), techo a
// escala OCR (15 s del QR no cubren un pipeline completo).
const ESPERA_ORIGINAL_INTERVALO_MS = 400;
const ESPERA_ORIGINAL_TECHO_MS = 600_000;
async function esperarDesenlaceOriginal(
  estaFilaId: string,
  originalId: string,
): Promise<boolean> {
  const tEspera = Date.now();
  logger.info(
    `[e14] dedup fila=${estaFilaId} espera-original dupOf=${originalId}`,
  );
  while (Date.now() - tEspera < ESPERA_ORIGINAL_TECHO_MS) {
    await new Promise((r) => setTimeout(r, ESPERA_ORIGINAL_INTERVALO_MS));
    if (!useMasivaStore.getState().filas.some((f) => f.id === estaFilaId)) {
      return false; // esta fila QUITADA/VACIADA en la espera — nada que copiar
    }
    const original = useMasivaStore
      .getState()
      .filas.find((f) => f.id === originalId);
    // Whitelist COPIABLE (T-5 e65: la literal YA-ENVIADA jamás se escribe en
    // el runner — el QA la veta; AUSENTE/ERROR/ya-enviada quedan fuera por
    // construcción: sin acta propia no hay copia posible).
    const copiable =
      original != null &&
      (original.estado === "PENDIENTE" ||
        original.estado === "PROCESANDO" ||
        original.estado === "LISTA" ||
        original.estado === "DUPLICADA");
    if (!copiable) {
      return false; // sin desenlace copiable — fallback honesto de siempre
    }
    try {
      if ((await leerRegistro(originalId)).acta) return true;
    } catch {
      /* IDB caída — seguir sondeando (el techo manda) */
    }
  }
  logger.info(
    `[e14] dedup fila=${estaFilaId} espera-original techo=${ESPERA_ORIGINAL_TECHO_MS}ms → reprocesa-completo`,
  );
  return false;
}

export { esperarDesenlaceOriginal };
