/**
 * Capa shared (R2) — luminancia única de píxeles RGBA (reporte 04 §B2 #7,
 * quick-win 7 de la misión R2).
 *
 * HOY la luma está implementada 6× con 2 espacios de color distintos:
 *
 *   BT.601 float   — completitud.ts:194 · image-utils.ts:254
 *                    (0.299·R + 0.587·G + 0.114·B)          ← CANÓNICA (×2)
 *   BT.601 entero  — scanner-core-bridge.ts:533 ((R·299+G·587+B·114)/1000|0)
 *                    orientacion-qr.ts:160,186 ((R·299+G·587+B·114)>>8)
 *                    (mismos pesos, redondeo entero distinto — hot loops con
 *                    indexado de histograma: NO se extraen v1, ver abajo)
 *   BT.709 float   — integridad.ts:82 · masiva/qr-pixeles.ts:355
 *                    (0.2126·R + 0.7152·G + 0.0722·B)       ← PENDIENTE DUEÑO
 *
 * DECISIÓN R2 (conservadora): canónica BT.601 (5 de 6 puntos de uso;
 * umbrales de tinta/papel — TINTA_LUMA_OSCURA y companía — están calibrados
 * en ese espacio). El punto BT.709 (integridad.ts + qr-pixeles.ts) se
 * conservó COMO ESTÁ en sus archivos: cambiar sus pesos mueve los valores de
 * luma y con ellos umbrales/medias (binarizada local, marcas de esquina) —
 * es la decisión pendiente del dueño (§B5 (6): «unificar en 601 tras
 * medir»). `lumaBT709` queda expuesta aquí marcada como tal para que la
 * migración futura tenga un solo hogar.
 *
 * Aritmética documentada de las variantes enteras (relación con la
 * canónica, test la fija): R·299+G·587+B·114 ≈ 1000·luma (error ≤ 1 por el
 * truncado). OJO: la variante `>> 8` de orientacion-qr.ts:160,186 divide
 * por 256 (NO por 1000) — para blanco puro da 996 (>255, fuera del
 * histograma de 256 bins): NO es una luma 0..255; es el comportamiento
 * vigente del módulo y NO se toca (hallazgo fuera de alcance — pr.md).
 *
 * Firma: `luma(data, i)` con `i` = índice del píxel ×4 en un
 * Uint8ClampedArray RGBA (getImageData). Jamás lanza con índices válidos.
 */
export type DatosRgba = Uint8ClampedArray | Uint8Array;

/** Luma BT.601 (0..255 float) — CANÓNICA. COPIA verbatim de la expresión de
 *  completitud.ts:194 ≡ image-utils.ts:254. */
export function luma(data: DatosRgba, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Luma BT.709 (0..255 float) — el espacio de integridad.ts:82 y
 *  qr-pixeles.ts:355. PENDIENTE DEL DUEÑO: unificar 601 vs 709 con una
 *  medición (cambiar pesos mueve umbrales de tinta/papel y medias de
 *  binarización — §B5 (6)). NO adoptar sin bench. */
export function lumaBT709(data: DatosRgba, i: number): number {
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}
