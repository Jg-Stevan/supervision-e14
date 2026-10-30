/**
 * Capa shared (R2) — constantes QR/píxeles del dominio E-14 con hogar común
 * (reporte 04 §B2 #12 + #5, quick-win 8 de la misión R2).
 *
 * HOY los mismos literales viven espejados así (esto queda como mapa de la
 * migración — los sitios originales NO se tocaron, ver abajo):
 *
 *   QR_LADO_LARGO = 2048       — identidad-qr.ts:125 (export) · literal
 *                                espejo en sondeo-qr.worker.ts:205 y
 *                                QR_LADO_UMBRAL_RESCATE (capa0-qr.worker.ts:61)
 *   QR_LADO_LARGO_RESCATE = 4096 — identidad-qr.ts:518 (export) · literal
 *                                espejo QR_LADO_RESCATE (capa0-qr.worker.ts:58)
 *   QR_RECORTE_LADO = 600      — masiva/qr-pixeles.ts:187 (export; MÓDULO
 *                                PURO worker-safe — es el hogar natural)
 *   QR_WARP_LADO = 1600        — orientacion-qr.ts:145 ≡ QR_WARP_LADO_TOPE
 *                                (prescan-qr.ts:219) — dos copias locales
 *   LADOS_ALTA = [6000,4800,3600] — orientacion-qr.ts:222 (copia local)
 *
 * ADOPCIÓN PENDIENTE (documentada en pr.md): los workers son PRECOMPILADOS
 * por scripts/build-capa0-worker.mjs (zona de R1) — hacer que importen de
 * shared exige validar ese pipeline y NO es parte de esta misión (regla:
 * no editar la zona de otro agente). pixelesDeBlob (verbatim ×2 en los
 * workers — sondeo-qr.worker.ts:155-188 ≡ capa0-qr.worker.ts:87-120) vive
 * AQUÍ como hogar canónico con su test de paridad; los workers siguen con
 * su copia local byte-idéntica.
 *
 * `shared/` NUNCA importa de `modules/` — el tipo PixelesQr se replica
 * estructuralmente (≈ qr-pixeles.ts:27-31). Worker-safe: cero DOM (solo
 * createImageBitmap/OffscreenCanvas con feature-detect), cero imports.
 */

/** Lado largo del canvas de trabajo del sondeo/capa 0 (QR_LADO_LARGO). */
export const QR_LADO_LARGO = 2048;

/** Lado largo del RESCATE hi-res ZXing (e64-qr T-1.4 — el 4096² de main). */
export const QR_LADO_LARGO_RESCATE = 4096;

/** Recorte superior-izquierda del ladder (esquina del acta ~600 px). */
export const QR_RECORTE_LADO = 600;

/** Lado del warp de la QR-brújula de orientación (≡ QR_WARP_LADO_TOPE del
 *  prescan: el coste del warpPerspective escala con la SALIDA). */
export const QR_WARP_LADO = 1600;

/** Lados del barrido en ALTA (rescate progresivo hacia la foto completa). */
export const LADOS_ALTA = [6000, 4800, 3600] as const;

/** Píxeles RGBA decodificados (estructura gemela de masiva/qr-pixeles.ts). */
export interface PixelesQr {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Decode del Blob a PixelesQr — HOME canónico de la receta verbatim ×2
 * (sondeo-qr.worker.ts:155-188 ≡ capa0-qr.worker.ts:87-120): createImageBitmap
 * con EXIF "from-image" → drawImage a OffscreenCanvas con lado largo ≤
 * `ladoLargo` (dimensiones proporcionales del aspect) → getImageData.
 * `bitmap.close()` INMEDIATO tras el draw (pico ~49 MB liberado al instante).
 * Sin createImageBitmap/OffscreenCanvas (o fallo) → null honesto — jamás
 * throw. Cero DOM (worker-safe, red line e73 §I).
 */
export async function pixelesDeBlob(
  blob: Blob,
  ladoLargo: number,
): Promise<PixelesQr | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    if (
      typeof createImageBitmap === "undefined" ||
      typeof OffscreenCanvas === "undefined"
    ) {
      return null; // feature-detect del worker — degradación honesta
    }
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const escala = Math.min(1, ladoLargo / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close(); // INMEDIATO tras el draw — pico ~49 MB liberado al instante
    bitmap = null;
    const imgData = ctx.getImageData(0, 0, w, h);
    return { data: imgData.data, width: w, height: h };
  } catch {
    return null; // EXIF no soportado / decode falló → null honesto
  } finally {
    try {
      bitmap?.close(); // doble cierre es inofensivo (espec) — el camino feliz ya cerró
    } catch {
      /* ya cerrado */
    }
  }
}
