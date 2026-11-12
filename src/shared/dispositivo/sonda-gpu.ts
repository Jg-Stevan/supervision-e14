/**
 * P-26 (plan 2026-11-12) — SONDA GPU (benchmark corto de raster) para el
 * tier INFERIDO de iOS/Safari.
 *
 * El problema (reporte §5.6 / DEUDA P1): iOS queda atrapado en MEDIO porque
 * la regla inferida exige `heapLimitMB ≥ 2048` y Safari NO expone
 * `performance.memory` (heap null → imposible). La regla del fix registrado:
 * **renderer GPU + sonda ≥ 750** cuando no hay `deviceMemory` ni
 * `performance.memory`.
 *
 * La sonda mide raster REAL (llenados con gradiente + lectura de píxeles que
 * el JIT no puede elidir) durante un presupuesto fijo (~120 ms) y devuelve un
 * SCORE 0–1000 con la MISMA escala del benchmark completo del panel
 * (perfil-dispositivo: ≥750 favorable · ≥350 inconcluso · <350 débil). El
 * factor de escala es PROVISIONAL hasta calibrar con la matriz de
 * dispositivos (docs/MEDICIONES.md — Q-56/P-26: anotar qué modelo cae en qué
 * perfil); el UMBRAL 750 es el mismo del benchmark, no un número nuevo.
 *
 * Jamás lanza; sin canvas (SSR/tests) → null — el tier queda con las reglas
 * de siempre (conservador).
 */

/** Umbral del tier ALTO inferido por sonda (el MISMO del benchmark del panel). */
export const UMBRAL_SONDA_GPU = 750;

/** Presupuesto del benchmark (ms): corto a propósito — corre en el montar de
 *  MASIVA, jamás delante de una acta. */
const PRESUPUESTO_MS = 120;

/** Factor de escala provisional ops/ms → puntos (calibrar en MEDICIONES). */
const FACTOR_OPS_POR_MS = 20;

/** Lado del lienzo del benchmark (256 = pequeño: no compite con el OCR). */
const LADO = 256;

export async function sonderGpu(
  presupuestoMs: number = PRESUPUESTO_MS,
): Promise<number | null> {
  try {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // Warm-up (primer draw paga la compilación del pipeline del raster).
    const grad0 = ctx.createLinearGradient(0, 0, LADO, LADO);
    grad0.addColorStop(0, "#123");
    grad0.addColorStop(1, "#456");
    ctx.fillStyle = grad0;
    ctx.fillRect(0, 0, LADO, LADO);
    ctx.getImageData(0, 0, LADO, LADO);

    let ops = 0;
    const inicio = performance.now();
    while (performance.now() - inicio < presupuestoMs) {
      const g = ctx.createLinearGradient(0, (ops * 7) % LADO, LADO, LADO);
      g.addColorStop(0, `#${(ops & 0xff).toString(16).padStart(2, "0")}3456`);
      g.addColorStop(1, `#6543${(ops & 0xff).toString(16).padStart(2, "0")}`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LADO, LADO);
      ctx.drawImage(canvas, (ops & 15) - 8, (ops & 15) - 8);
      // Lectura parcial (1 fila): obliga a sincronizar el raster sin cobrar
      // el costo de un getImageData completo cada vuelta.
      if (ops % 8 === 0) ctx.getImageData(0, (ops >> 3) % LADO, LADO, 1);
      ops++;
    }
    const ms = Math.max(1, performance.now() - inicio);
    const score = Math.min(1000, Math.round((ops / ms) * FACTOR_OPS_POR_MS * 10));
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}
