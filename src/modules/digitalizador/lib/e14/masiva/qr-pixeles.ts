/**
 * KIT e73-sondeo-qr-precoz-v1 (§A.2) — NÚCLEO PURO de píxeles para decode QR.
 *
 * Módulo NUEVO, puro y worker-safe: cero DOM, cero zxing, cero canvas — SOLO
 * jsQR vendido (puro JS) + aritmética de píxeles. El contenido fue MOVIDO
 * byte a byte de `identidad-qr.ts` SIN cambiar comportamiento (refactor
 * ADITIVO declarado por el kit §A.2 — "preferible: mover a módulo puro nuevo
 * `qr-pixeles.ts` re-exportado por identidad-qr — cero diffs en consumidores").
 * identidad-qr.ts re-exporta TODO lo que aquí vive: los consumidores
 * existentes (runner.ts, qa-qr-identidad.ts, tests) no cambian ni una línea.
 *
 * Motivo del módulo: el WORKER de sondeo (`sondeo-qr.worker.ts`) importa de
 * aquí las primitivas S1/S2 del ladder presupuestado. Mantener este archivo
 * libre de zxing-wasm y de DOM es lo que hace seguro el bundling del worker
 * (corrección #3 del dictamen: zxing-wasm PROHIBIDO en el worker — la red de
 * seguridad in-pool lo conserva; jsQR vendido es puro JS, worker-safe).
 *
 * RED LINES heredadas (kit e63m §3 + e64 §7 — vigentes byte a byte):
 * · Payload EXACTO jamás fuzzy (llave opaca — jamás prefijos, red line 10).
 * · jsQR 1.4.0 VENDIDO byte-idéntico al de #72 (vendor/jsQR.js).
 * · Jamás throw: un intento que falla = null (el caller decide).
 */
import jsQR from "./vendor/jsQR.js";

/** Fuente de píxeles RGBA — la MISMA forma que devuelve getImageData
 *  (canal a canal, 4 bytes por píxel, fila por fila). */
export interface PixelesQr {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Bandas del ladder — fracciones EXACTAS del banco (#72 bench.html). */
export interface EspecieBanda {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  escala: number;
}

export const BANDAS_BASE: EspecieBanda[] = [
  { id: "A", x0: 0.0, y0: 0.0, x1: 1.0, y1: 1.0, escala: 1 }, // imagen completa
  { id: "B", x0: 0.0, y0: 0.0, x1: 0.45, y1: 0.25, escala: 1 }, // banda top-left
  { id: "C", x0: 0.08, y0: 0.05, x1: 0.38, y1: 0.2, escala: 1 }, // banda ajustada
  { id: "C1.5", x0: 0.08, y0: 0.05, x1: 0.38, y1: 0.2, escala: 1.5 }, // reintento up-escalado
];

export const BANDA_A = BANDAS_BASE[0]!; // floor del tier de rotación (A completa)

// ─── Núcleo puro: UN intento de decode sobre UNA banda ──────────────────────
/** Semántica EXACTA del intentoDecode del banco: banda fuente redondeada
 *  (sw/sh), destino = banda × escala (dw/dh), jsQR con attemptBoth, payload
 *  EXACTO tal cual sale. escala=1 → copia 1:1 (idéntica al drawImage del
 *  banco); escala>1 → remuestreo bilinear (misma intención del smoothing
 *  del banco — única diferencia microscópica vs drawImage del navegador,
 *  declarada en el REPORTE: C1.5 es el 4.º intento del ladder, el floor del
 *  tier de rotación es A a escala 1 EXACTO). */
export function intentoSobrePixeles(cv: PixelesQr, esp: EspecieBanda): string | null {
  try {
    const sx = Math.round(cv.width * esp.x0);
    const sy = Math.round(cv.height * esp.y0);
    const sw = Math.max(1, Math.round(cv.width * (esp.x1 - esp.x0)));
    const sh = Math.max(1, Math.round(cv.height * (esp.y1 - esp.y0)));
    const dw = Math.max(1, Math.round(sw * esp.escala));
    const dh = Math.max(1, Math.round(sh * esp.escala));
    const data = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const di = (y * dw + x) * 4;
        if (esp.escala === 1) {
          // Copia 1:1 EXACTA de la banda (el drawImage del banco con
          // destino = tamaño fuente es idéntico píxel a píxel).
          const sxi = Math.min(cv.width - 1, sx + x);
          const syi = Math.min(cv.height - 1, sy + y);
          const si = (syi * cv.width + sxi) * 4;
          data[di] = cv.data[si]!;
          data[di + 1] = cv.data[si + 1]!;
          data[di + 2] = cv.data[si + 2]!;
          data[di + 3] = cv.data[si + 3]!;
        } else {
          // Remuestreo bilinear del up-escalado (mismas fracciones/rounding).
          const fx = Math.min(cv.width - 1, Math.max(0, (x + 0.5) * (sw / dw) - 0.5 + sx));
          const fy = Math.min(cv.height - 1, Math.max(0, (y + 0.5) * (sh / dh) - 0.5 + sy));
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const x1 = Math.min(cv.width - 1, x0 + 1);
          const y1 = Math.min(cv.height - 1, y0 + 1);
          const tx = fx - x0;
          const ty = fy - y0;
          const i00 = (y0 * cv.width + x0) * 4;
          const i10 = (y0 * cv.width + x1) * 4;
          const i01 = (y1 * cv.width + x0) * 4;
          const i11 = (y1 * cv.width + x1) * 4;
          for (let c = 0; c < 4; c++) {
            const arriba = cv.data[i00 + c]! * (1 - tx) + cv.data[i10 + c]! * tx;
            const abajo = cv.data[i01 + c]! * (1 - tx) + cv.data[i11 + c]! * tx;
            data[di + c] = arriba * (1 - ty) + abajo * ty;
          }
        }
      }
    }
    const res = jsQR(data, dw, dh, { inversionAttempts: "attemptBoth" });
    return res ? res.data : null;
  } catch {
    return null; // un intento jamás tumba el ladder
  }
}

/** Rotación EXACTA de 90° horaria (permutación de píxeles — para múltiplos
 *  de 90° el canvasRotado del banco es la MISMA permutación, sin
 *  interpolación). Rotaciones compuestas: siempre DESDE la fuente (el banco
 *  rota el canvas de trabajo original para cada grados). */
function rotar90Pixeles(src: PixelesQr): PixelesQr {
  const w = src.width;
  const h = src.height;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      // dst(x' = h-1-y, y' = x) — dst width = h, dst height = w.
      const di = (x * h + (h - 1 - y)) * 4;
      data[di] = src.data[si]!;
      data[di + 1] = src.data[si + 1]!;
      data[di + 2] = src.data[si + 2]!;
      data[di + 3] = src.data[si + 3]!;
    }
  }
  return { data, width: h, height: w };
}

export function rotarPixeles(src: PixelesQr, grados: number): PixelesQr {
  let actual = src;
  for (let k = 0; k < grados / 90; k++) actual = rotar90Pixeles(actual);
  return actual;
}

// ─── FIX DICTAMEN-e73-implementacion-v1 §2/§3.1 — BARRIDO CEÑIDO movido ─────
// El barrido jsQR (barridoQrDePixeles + sus helpers privados + BARRIDO_VENTANAS
// + QR_RECORTE_LADO) se MOVIÓ de identidad-qr.ts SIN cambiar comportamiento
// (misma doctrina §A.2 del kit e73: módulo puro worker-safe re-exportado —
// cero diffs en consumidores). Motivo: el WORKER de sondeo necesita el S3
// como import ESTÁTICO — el grafo completo del bundle queda jsQR-only
// (cero identidad-qr → cero scanner-core/logger/zxing/process.env en el
// worker emitido; verificado por el smoke del gate — jamás verde falso).
// identidad-qr.ts RE-EXPORTA lo público (barridoQrDePixeles · BARRIDO_VENTANAS
// · QR_RECORTE_LADO) — qa-qr-identidad, runner.ts y tests no cambian.

/** Fracciones de ventana del barrido ceñido (doc hermano §1: grilla por
 *  cuadrante × fracciones — el QR de campo mide ~5-8% del ancho y la
 *  ventana ganadora lo llena al 38-55%). e64-qr T-1.3: 0.08 y 0.32 cubren
 *  los EXTREMOS del rango (QR chico ~5% del ancho / QR grande ~8%+).
 *  Cada fracción es del ANCHO del canvas de trabajo. */
export const BARRIDO_VENTANAS: readonly number[] = [0.08, 0.11, 0.14, 0.19, 0.25, 0.32];

// ─── e71 (Opt-2) — RECORTE de la esquina estándar (kit e71-consolidación) ───
/** Lado del RECORTE de la esquina estándar del QR (kit: «aprox 600x600 px»):
 *  el QR del E-14 vive en la esquina superior-izquierda (las bandas B/C del
 *  ladder lo apuntan) — un recorte cuadrado de ESA esquina lo contiene con
 *  contexto de sobra y se lee en UNA pasada. El kit midió los barridos
 *  completos hasta ~15 s; sobre el recorte el tier completo es <500 ms. */
export const QR_RECORTE_LADO = 600;

// ─── e63n (T-PRE) — BARRIDO CEÑIDO (grilla de ventanas por cuadrante) ──────
/** Cuadrantes del barrido EN ORDEN (doc hermano §1: TL→TR→BL→BR). La
 *  frontera cae en floor(lado/2) — las ventanas NUNCA cruzan cuadrantes. */
export interface Cuadrante {
  id: string;
  x0: number; // fracción del ancho donde empieza
  y0: number; // fracción del alto donde empieza
  x1: number; // fracción del ancho donde termina
  y1: number; // fracción del alto donde termina
}
export const CUADRANTES: Cuadrante[] = [
  { id: "TL", x0: 0, y0: 0, x1: 0.5, y1: 0.5 },
  { id: "TR", x0: 0.5, y0: 0, x1: 1, y1: 0.5 },
  { id: "BL", x0: 0, y0: 0.5, x1: 0.5, y1: 1 },
  { id: "BR", x0: 0.5, y0: 0.5, x1: 1, y1: 1 },
];

/** Límites EN PÍXELES de un cuadrante (frontera en floor — micro-decisión
 *  declarada: sin solapes entre cuadrantes, coberturas exactas). */
export function limitesDeCuadrante(
  pix: PixelesQr,
  q: Cuadrante,
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.round(pix.width * q.x0),
    y0: Math.round(pix.height * q.y0),
    x1: Math.round(pix.width * q.x1),
    y1: Math.round(pix.height * q.y1),
  };
}

/** Ventana cuadrada CLAMPADA a la imagen (T-PRE — la usa el barrido y el
 *  filo del cuadrante de T-1.0): clampea origen y lado, JAMÁS inventa
 *  píxeles (copia fila a fila del buffer fuente). null si el lado pedido
 *  excede la imagen (nada que decodificar ahí). */
export function ventanaDePixeles(
  pix: PixelesQr,
  x: number,
  y: number,
  lado: number,
): PixelesQr | null {
  const ladoX = Math.min(lado, pix.width);
  const ladoY = Math.min(lado, pix.height);
  if (ladoX < 1 || ladoY < 1) return null;
  const x0 = Math.min(Math.max(0, Math.round(x)), pix.width - ladoX);
  const y0 = Math.min(Math.max(0, Math.round(y)), pix.height - ladoY);
  const data = new Uint8ClampedArray(ladoX * ladoY * 4);
  for (let yy = 0; yy < ladoY; yy++) {
    const si = ((y0 + yy) * pix.width + x0) * 4;
    data.set(
      pix.data.subarray(si, si + ladoX * 4),
      yy * ladoX * 4,
    );
  }
  return { data, width: ladoX, height: ladoY };
}

/** UN intento jsQR sobre UNA ventana (attemptBoth — la inversión la cubre
 *  aquí, no en el tier zxing). Jamás throw (red line e64 §7-4). */
export function jsQrDeVentana(win: PixelesQr): string | null {
  try {
    const res = jsQR(win.data, win.width, win.height, {
      inversionAttempts: "attemptBoth",
    });
    return res ? res.data : null;
  } catch {
    return null;
  }
}

/** Lado EN PÍXELES de la ventana de UNA fracción (micro-decisión declarada:
 *  fracción del ANCHO — el doc hermano H-6 mide el QR «~5-8% del ancho» y
 *  calibra las fracciones contra esa magnitud). */
export function ladoDeVentana(pix: PixelesQr, fraccion: number): number {
  return Math.max(16, Math.round(pix.width * fraccion));
}

/**
 * BARRIDO CEÑIDO jsQR (doc hermano §1.3): grilla de ventanas cuadradas por
 * cuadrante [TL→TR→BL→BR] × BARRIDO_VENTANAS × paso 0.5 (solape de media
 * ventana — micro-decisión declarada), jsQR attemptBoth por ventana,
 * early-exit al primer payload. Puro, sin reló (acotado por nº de
 * ventanas — el reló de 4 s es del tier zxing). T-1.0 del e64 añadió la
 * celda final anclada al filo inferior-derecho de cada cuadrante (doc
 * hermano H-5 — la franja de hasta `paso` px que la condición `+ lado <=`
 * dejaba descubierta).
 */
export function barridoQrDePixeles(pix: PixelesQr): string | null {
  for (const q of CUADRANTES) {
    const lim = limitesDeCuadrante(pix, q);
    for (const fraccion of BARRIDO_VENTANAS) {
      const lado = ladoDeVentana(pix, fraccion);
      const paso = Math.max(1, Math.round(lado * 0.5));
      for (let y = lim.y0; y + lado <= lim.y1; y += paso) {
        for (let x = lim.x0; x + lado <= lim.x1; x += paso) {
          const win = ventanaDePixeles(pix, x, y, lado);
          if (!win) continue;
          const payload = jsQrDeVentana(win);
          if (payload != null) return payload;
        }
      }
      // e64-qr T-1.0 — celda final del cuadrante: la condición `+ lado <=`
      // deja una franja descubierta de hasta `paso` px en el filo
      // derecho/inferior (doc hermano H-5); este anclaje la cubre (el clamp
      // de ventanaDePixeles ya existe — jamás inventa píxeles).
      const winFilo = ventanaDePixeles(pix, lim.x1 - lado, lim.y1 - lado, lado);
      const payloadFilo = winFilo ? jsQrDeVentana(winFilo) : null;
      if (payloadFilo != null) return payloadFilo;
    }
  }
  return null;
}
