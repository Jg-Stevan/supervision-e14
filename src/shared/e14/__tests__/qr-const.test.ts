/**
 * Test de PARIDAD R2 — src/shared/e14/qr-const.ts.
 *
 * · Constantes ≡ los literales espejados del repo (los exportados se
 *   comparan por IMPORT DIRECTO del módulo puro qr-pixeles.ts; los locales
 *   de los workers/orientacion-qr por referencia literal incrustada).
 * · pixelesDeBlob ≡ la receta verbatim de los 2 workers (sondeo:155-188 ≡
 *   capa0:87-120 — referencia incrustada). En bun NO hay
 *   createImageBitmap/OffscreenCanvas → AMBAS caen por el MISMO
 *   feature-detect a null honesto (paridad del camino degradado; la paridad
 *   del camino feliz se ejercita en el harness QA del worker, fuera del
 *   alcance R2). Los workers NO se editaron (zona R1).
 */
import { describe, expect, test } from "bun:test";

import {
  LADOS_ALTA,
  pixelesDeBlob,
  QR_LADO_LARGO,
  QR_LADO_LARGO_RESCATE,
  QR_RECORTE_LADO,
  QR_WARP_LADO,
  type PixelesQr as PixelesQrShared,
} from "@/shared/e14/qr-const";
// Paridad por import directo del módulo puro worker-safe (masiva/qr-pixeles.ts).
import { QR_RECORTE_LADO as QR_RECORTE_LADO_ORIGINAL, type PixelesQr as PixelesQrOriginal } from "@/modules/digitalizador/lib/e14/masiva/qr-pixeles";

describe("paridad constantes QR (§B2 #12)", () => {
  test("QR_RECORTE_LADO ≡ qr-pixeles.ts:187 (import directo)", () => {
    expect(QR_RECORTE_LADO).toBe(QR_RECORTE_LADO_ORIGINAL);
    expect(QR_RECORTE_LADO).toBe(600);
  });

  test("literales espejo de identidad-qr.ts y de los workers", () => {
    // identidad-qr.ts:125 (export) — espejo: sondeo-qr.worker.ts:205 (2048
    // literal) y QR_LADO_UMBRAL_RESCATE capa0-qr.worker.ts:61.
    expect(QR_LADO_LARGO).toBe(2048);
    // identidad-qr.ts:518 — espejo: QR_LADO_RESCATE capa0-qr.worker.ts:58.
    expect(QR_LADO_LARGO_RESCATE).toBe(4096);
    // orientacion-qr.ts:145 ≡ QR_WARP_LADO_TOPE prescan-qr.ts:219.
    expect(QR_WARP_LADO).toBe(1600);
    // orientacion-qr.ts:222.
    expect(LADOS_ALTA).toEqual([6000, 4800, 3600]);
  });
});

describe("paridad pixelesDeBlob (§B2 #5 — receta verbatim ×2 en los workers)", () => {
  /** Referencia VERBATIM: masiva/sondeo-qr.worker.ts:155-188 ≡
   *  masiva/capa0-qr.worker.ts:87-120. NO editar. */
  async function refPixelesDeBlob(
    blob: Blob,
    ladoLargo: number,
  ): Promise<PixelesQrOriginal | null> {
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
      bitmap.close();
      bitmap = null;
      const imgData = ctx.getImageData(0, 0, w, h);
      return { data: imgData.data, width: w, height: h };
    } catch {
      return null;
    } finally {
      try {
        bitmap?.close();
      } catch {
        /* ya cerrado */
      }
    }
  }

  test("en un entorno SIN createImageBitmap/OffscreenCanvas ambas caen a null honesto (jamás throw)", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "image/jpeg" });
    const compartida = await pixelesDeBlob(blob, 2048);
    const referencia = await refPixelesDeBlob(blob, 2048);
    expect(compartida).toBe(null);
    expect(referencia).toBe(null);
    expect(compartida).toBe(referencia);
  });

  test("PixelesQr shared es estructuralmente idéntico al de qr-pixeles.ts", () => {
    const muestra: PixelesQrShared = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const original: PixelesQrOriginal = muestra; // asignabilidad estructural
    expect(original.width).toBe(1);
  });
});
