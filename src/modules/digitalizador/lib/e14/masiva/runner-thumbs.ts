"use client";

/**
 * SPLIT del runner (refactor/runner-logger-v1, C1 — movimiento puro): la
 * miniatura de la bandeja era el único bloque con responsabilidad de
 * RENDER (canvas 2d) dentro del orquestador — vive aquí. Sin imports:
 * solo DOM globals. El resto del pipeline NO toca este archivo (los
 * runner-*.ts jamás se importan entre sí — runner.ts es el orquestador).
 */

/** Thumb de la bandeja: canvas 2d, lado mayor 320, JPEG 0.7 (kit §4 regla 4).
 *  Con loadImageMemo NO (el thumb es una foto distinta; decode directo y
 *  fuera — la RAM muere con el canvas). También lo usa el mini-store al
 *  re-sincronizar un acta editada en REVISIÓN (thumb fresco tras recorte). */
export async function hacerThumb(
  dataUrl: string | null | undefined,
): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("THUMB_NO_DECODE"));
      img.src = dataUrl;
    });
    const ladoMayor = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const escala = Math.min(1, 320 / ladoMayor);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined; // thumb es cosmético — nunca tumba el desenlace
  }
}
