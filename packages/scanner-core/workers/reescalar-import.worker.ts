/// <reference lib="webworker" />
/**
 * E2 (Ola E) — WORKER del reescalado de importación.
 *
 * HOY `reescalarFueraDelHilo` (useDestello.ts) decodifica la foto de 12 MP
 * (≈50 MB de RGBA) y la re-encodea en el hilo principal: en el A13 eso se
 * midió como 14-54 s de espera pick → «analizando» y fue el pico de memoria
 * de los dos crashes de renderer de la sesión de campo. El nombre prometía
 * hilo aparte y el trabajo estaba en el hilo de la UI.
 *
 * AHORA: el main manda el File/BLOB (structured clone, sin copia de píxeles)
 * y AQUÍ corren `createImageBitmap` (decode + resize) y
 * `OffscreenCanvas.convertToBlob` (encode JPEG). El main solo recibe el Blob
 * resultante.
 *
 * CONTRATO de mensajes:
 *   petición  `{ id, blob, ancho, alto, cap, calidad }` — `ancho`/`alto`
 *             vienen de leer el contenedor JPEG en el main (sin decodificar);
 *             `cap` = lado mayor final; `calidad` = resizeQuality del
 *             decodificador ("medium" | "high").
 *   respuesta `{ id, ok: true, jpeg, ancho, alto, msDecode, msEncode }`
 *             `{ id, ok: false, error }` ante CUALQUIER fallo.
 *
 * RED LINES (las mismas del fallback-canvas / capa0-qr):
 *  · JAMÁS throw sin capturar: cualquier error → `{ok:false}` y el main cae a
 *    la ruta del hilo principal de siempre.
 *  · `bitmap.close()` inmediato tras el encode (el pico se libera ya).
 *  · NUNCA upscala (`escala = min(1, cap/lado)`).
 */

interface PeticionReescalo {
  id: number;
  blob: Blob;
  ancho: number;
  alto: number;
  cap: number;
  calidad: "medium" | "high";
}

type RespuestaReescalo =
  | {
      id: number;
      ok: true;
      jpeg: Blob;
      ancho: number;
      alto: number;
      msDecode: number;
      msEncode: number;
    }
  | { id: number; ok: false; error: string };

async function reescalar(p: PeticionReescalo): Promise<RespuestaReescalo> {
  try {
    const largo = Math.max(p.ancho, p.alto);
    if (!(largo > 0)) throw new Error("sin dimensiones");
    const escala = Math.min(1, p.cap / largo);
    const w = Math.max(1, Math.round(p.ancho * escala));
    const h = Math.max(1, Math.round(p.alto * escala));
    const tDecode = performance.now();
    const bitmap = await createImageBitmap(p.blob, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: p.calidad,
      imageOrientation: "from-image",
    });
    const msDecode = performance.now() - tDecode;
    try {
      const lienzo = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = lienzo.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("sin contexto 2d");
      const tEncode = performance.now();
      ctx.drawImage(bitmap, 0, 0);
      const jpeg = await lienzo.convertToBlob({ type: "image/jpeg", quality: 0.95 });
      const msEncode = performance.now() - tEncode;
      if (!jpeg.size) throw new Error("encode vacío");
      return {
        id: p.id,
        ok: true,
        jpeg,
        ancho: bitmap.width,
        alto: bitmap.height,
        msDecode,
        msEncode,
      };
    } finally {
      bitmap.close?.();
    }
  } catch (e) {
    return { id: p.id, ok: false, error: e instanceof Error ? e.message : "fallo del reescalo" };
  }
}

/** Cableado SOLO en un entorno de worker real (el archivo se importa desde
 *  tests como módulo puro — mismo guard que fallback-canvas). */
if (typeof window === "undefined" && typeof self !== "undefined") {
  self.onmessage = (e: MessageEvent<PeticionReescalo>) => {
    void reescalar(e.data).then((r: RespuestaReescalo) => {
      self.postMessage(r);
    });
  };
}
