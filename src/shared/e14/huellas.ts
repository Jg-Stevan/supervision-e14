/**
 * P-22 (plan 2026-11-12) — HUELLAS PERCEPTUALES del anti-reproceso del
 * puente, capa SHARED (R2): funciones PURAS sin DOM, compartidas por el
 * embudo de supervisión (actas-runtime) y consumibles por cualquier módulo.
 *
 * La deuda P2 del reporte («dedup del puente móvil solo por SHA-256 exacto»):
 * el SHA-256 de los bytes no ve una acta RE-FOTOGRAFIADA (bytes distintos,
 * misma imagen). El puente ahora viaja con dos huellas adicionales que el
 * móvil estampa en el sobre `EntradaPuente`:
 *
 *  · `qrPayload` — el payload EXACTO leído del código 1D/QR impreso del acta
 *    (capa 0 del móvil), normalizado con `normalizarQrPayload`. IGUALDAD
 *    EXACTA (RED LINE 10 del dedup de masiva: jamás prefijos, sin fuzzy).
 *  · `dhash64` — hash perceptual 64-bit (hex 16, dhash horizontal 9×8) de la
 *    foto PROCESADA; el respaldo SIN QR: distancia de Hamming ≤ 6 decide
 *    «misma imagen» (umbral del dedup de masiva, medido en D65).
 *
 * `hamming64` es el gemelo EXACTO del de masiva/dedup.ts (misma aritmética
 * bit a bit; longitudes distintas → 64). No se extrae desde ahí a propósito
 * en este PR: tocar la dedup caliente de masiva exige su propia ventana de
 * medición (regla del plan) — la migración del original a shared queda
 * anotada en H-44 (deduplicación global).
 */

/** Distancia de Hamming entre dos hashes hex de 64 bit (16 caracteres hex).
 *  Longitudes distintas o ausentes → 64 (máxima distancia: jamás «igual»). */
export function hamming64(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Umbral del dedup perceptual (D65, medido en el lote demo): ≤ 6 bits
 *  distintos de 64 = «misma imagen». */
export const UMBRAL_HAMMING_DHASH = 6;

/** ¿Es un dhash64 bien formado? (hex 16 — jamás inventar/aceptar relleno). */
export function esDhash64Valido(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
}

/** Normalización del payload del código impreso: trim + NFKD sin diacríticos
 *  + mayúsculas + sin espacios (mismo criterio de lectura del clasificador:
 *  el payload viaja EXACTO al contenido leído; la normalización solo quita el
 *  ruido de la captura). Vacío/extraño → null (sin huella comparable). */
export function normalizarQrPayload(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpio = v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  return limpio.length > 0 ? limpio : null;
}
