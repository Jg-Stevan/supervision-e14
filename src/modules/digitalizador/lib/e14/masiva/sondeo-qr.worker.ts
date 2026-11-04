/// <reference lib="webworker" />
/**
 * KIT e73-sondeo-qr-precoz-v1 (§A.3) — WORKER de sondeo QR en INGESTA.
 *
 * Lee la identidad QR de UN archivo ANTES de que exista el pool (dedup
 * pre-pool): gemelas marcadas en la ingesta JAMÁS pagan slot, probe ni OCR.
 * Sin precedente en el repo (cero `new Worker` en src/ — el smoke de
 * bundling §A.1 con `bun run build` es la PUERTA del kit).
 *
 * Mensaje: `{blob, presupuestoMs}` → respuesta `{payload|null, tier, ms}`.
 *
 * EMISIÓN (FIX DICTAMEN-e73-implementacion-v1 §3.1): este archivo NO se
 * deja al bundler de la app — se PRECOMPILA con `bun scripts/
 * build-sondeo-worker.mjs` a `public/scanner/sondeo-qr.worker.js` (IIFE
 * clásica, precedida por detection-worker.js) y el cliente lo instancia
 * por URL absoluta. Turbopack emitía el .ts crudo como asset estático
 * (verde falso del smoke §A.1) — el smoke REAL del gate (smoke-sondeo-
 * worker.mjs) verifica el bundle emitido para que jamás vuelva a pasar.
 *
 * Ladder PRESUPUESTADO (reló LOCAL del worker — chequeo ANTES de entrar a
 * cada tier; sin presupuesto → null inmediato):
 *   S1 full    — intentoSobrePixeles(frame, BANDA_A): jsQR full-frame a
 *                2048 (~50-300 ms). tier "full".
 *   S2 recorte — recorte esquina sup-izq (QR_RECORTE_LADO ~600 px) jsQR-only
 *                + rotarPixeles 90/180/270 del recorte + intento por
 *                rotación. tiers "recorte" | "rot90" | "rot180" | "rot270".
 *                AQUÍ se resuelve la orientación errónea por centavos
 *                (fotos rotadas físicas — sin depender del EXIF).
 *   S3 barrido — SOLO si restan ≥ SONDEO_S3_MINIMO_RESTANTE_MS al terminar
 *                S2: el barrido jsQR del repo (barridoQrDePixeles — puro,
 *                en qr-pixeles.ts desde el FIX DICTAMEN-e73 §3.1), completo
 *                una vez entrado. Presupuesto insuficiente → abortar a null.
 *
 * RED LINES (kit §I):
 * · zxing-wasm JAMÁS en el worker (corrección #3 del dictamen): el grafo
 *   ESTÁTICO de este worker solo contiene qr-pixeles.ts (jsQR vendido, puro
 *   JS). FIX DICTAMEN-e73-implementacion-v1 §3.1: el barrido del repo llega
 *   por import ESTÁTICO desde el módulo puro (barridoQrDePixeles vive en
 *   qr-pixeles.ts desde el fix) — el grafo completo queda jsQR-only y el
 *   bundle emitido no contiene zxing/logger/process.env (smoke del gate).
 * · JAMÁS throw: cualquier fallo interno (decode/ladrillo/budget) →
 *   `{payload: null, tier: null, ms}` — la vía de HOY sigue (doctrina del
 *   conservador).
 * · Memoria: `bitmap.close()` INMEDIATO tras el draw (pico ~49 MB en
 *   4032px, liberado al instante); el OffscreenCanvas muere con el mensaje.
 */
import {
  barridoQrDePixeles,
  BANDA_A,
  intentoSobrePixeles,
  QR_RECORTE_LADO,
  rotarPixeles,
  type PixelesQr,
} from "./qr-pixeles";

/** (§A.3 S3) Mínimo de presupuesto RESTANTE para ENTRAR al barrido (S3):
 *  el barrido completo es acotado (nº de ventanas) pero costoso — si al
 *  terminar S2 quedan menos de 1500 ms, abortar a null (jamás extender el
 *  presupuesto — red line §I). */
export const SONDEO_S3_MINIMO_RESTANTE_MS = 1500;

/** Mensaje que el cliente (sondeo-qr.client.ts) postea al worker. */
export type PeticionSondeo = { blob: Blob; presupuestoMs: number };

/** Respuesta del worker — payload null = sin QR (o fallo honesto). */
export type RespuestaSondeo = {
  payload: string | null;
  tier: string | null;
  ms: number;
};

/** Función de barrido inyectable (S3) — la firma EXACTA de
 *  barridoQrDePixeles (pura, jsQR-only, síncrona). */
export type BarridoQrFn = (pix: PixelesQr) => string | null;

/** Deps inyectables del ladder (el worker las resuelve con el import
 *  dinámico; los tests las inyectan sin worker real — kit §A.5.1). */
export type DepsLadderSondeo = {
  barrido: BarridoQrFn;
  ladoRecorte: number;
  /** Reló inyectable (default Date.now — los tests lo congelan). */
  ahora?: () => number;
};

export type DesenlaceSondeo = { payload: string | null; tier: string | null };

/** Recorte puro de la esquina sup-izq, CLAMPADO (jamás inventa píxeles —
 *  misma semántica de la geometría del recorte del repo): copia fila a fila
 *  del buffer fuente. null si el lado pedido no cabe. */
function recorteSupIzqDePixeles(pix: PixelesQr, lado: number): PixelesQr | null {
  const ladoX = Math.min(lado, pix.width);
  const ladoY = Math.min(lado, pix.height);
  if (ladoX < 1 || ladoY < 1) return null;
  const data = new Uint8ClampedArray(ladoX * ladoY * 4);
  for (let yy = 0; yy < ladoY; yy++) {
    const si = yy * pix.width * 4;
    data.set(pix.data.subarray(si, si + ladoX * 4), yy * ladoX * 4);
  }
  return { data, width: ladoX, height: ladoY };
}

/**
 * Ladder PRESUPUESTADO del sondeo — PURO y testeable headless (píxeles y
 * barrido inyectados — kit §A.5.1, sin worker real). Chequea el presupuesto
 * ANTES de entrar a cada tier; sin presupuesto (≤0) → null inmediato. El
 * early-exit devuelve el payload con el tier que lo leyó; sin QR (o
 * presupuesto vencido) → {null, null} — jamás throw.
 */
export function ladderSondeoDePixeles(
  pix: PixelesQr,
  presupuestoMs: number,
  deps: DepsLadderSondeo,
): DesenlaceSondeo {
  const ahora = deps.ahora ?? (() => Date.now());
  // Sin presupuesto → null inmediato (kit §A.3 — jamás extender).
  if (!(presupuestoMs > 0)) return { payload: null, tier: null };
  const limite = ahora() + presupuestoMs;
  // S1 full — jsQR sobre el frame completo (banda A = imagen completa).
  if (ahora() > limite) return { payload: null, tier: null };
  const full = intentoSobrePixeles(pix, BANDA_A);
  if (full != null) return { payload: full, tier: "full" };
  // S2 recorte esquina sup-izq + rotaciones del recorte (90/180/270).
  if (ahora() > limite) return { payload: null, tier: null };
  const recorte = recorteSupIzqDePixeles(pix, deps.ladoRecorte);
  if (recorte) {
    const rotaciones: readonly [number, string][] = [
      [0, "recorte"],
      [90, "rot90"],
      [180, "rot180"],
      [270, "rot270"],
    ];
    for (const [grados, tier] of rotaciones) {
      if (ahora() > limite) return { payload: null, tier: null };
      const fuente = grados === 0 ? recorte : rotarPixeles(recorte, grados);
      const payload = intentoSobrePixeles(fuente, BANDA_A);
      if (payload != null) return { payload, tier };
    }
  }
  // S3 barrido — SOLO si restan ≥ 1500 ms al terminar S2 (kit §A.3).
  if (limite - ahora() < SONDEO_S3_MINIMO_RESTANTE_MS) {
    return { payload: null, tier: null };
  }
  const barrido = deps.barrido(pix); // completo una vez entrado
  if (barrido != null) return { payload: barrido, tier: "barrido" };
  return { payload: null, tier: null };
}

/**
 * Decode del Blob a PixelesQr (§A.3): createImageBitmap con EXIF
 * "from-image" → drawImage a OffscreenCanvas con lado largo QR_LADO_LARGO
 * (2048, dimensiones proporcionales del aspect) → getImageData.
 * `bitmap.close()` INMEDIATO tras el draw. Sin createImageBitmap/
 * OffscreenCanvas (o fallo) → null honesto — jamás throw.
 */
async function pixelesDeBlob(
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

/** Deps del ladder — resueltas ESTÁTICAMENTE del módulo puro (FIX DICTAMEN-e73
 *  §3.1: barridoQrDePixeles vive en qr-pixeles.ts — jsQR-only, worker-safe;
 *  antes llegaban por import dinámico de identidad-qr y el bundler emitía
 *  el .ts crudo — verde falso del smoke §A.1). Los tests siguen inyectando
 *  sus propias deps sin worker real — kit §A.5.1. */
const DEPS_REPO: DepsLadderSondeo = {
  barrido: barridoQrDePixeles,
  ladoRecorte: QR_RECORTE_LADO,
};

/** Mensaje completo: decode + ladder presupuestado + ms. JAMÁS throw. */
async function sondearEnWorker(peticion: PeticionSondeo): Promise<RespuestaSondeo> {
  const t0 = Date.now();
  try {
    const presupuesto = peticion.presupuestoMs;
    const pix = await pixelesDeBlob(peticion.blob, 2048 /* QR_LADO_LARGO */);
    if (!pix) return { payload: null, tier: null, ms: Date.now() - t0 };
    const desenlace = ladderSondeoDePixeles(pix, presupuesto, DEPS_REPO);
    return { ...desenlace, ms: Date.now() - t0 };
  } catch {
    return { payload: null, tier: null, ms: Date.now() - t0 }; // jamás throw (§I)
  }
}

/** Cableado del mensaje — SOLO en un entorno de worker real (self definido
 *  SIN window: en el hilo principal y en node/vitest el guard evita tocar
 *  nada — el worker se importa desde tests como módulo puro). */
if (typeof window === "undefined" && typeof self !== "undefined") {
  self.onmessage = (ev: MessageEvent<PeticionSondeo>) => {
    void sondearEnWorker(ev.data).then((respuesta: RespuestaSondeo) => {
      self.postMessage(respuesta);
    });
  };
}
