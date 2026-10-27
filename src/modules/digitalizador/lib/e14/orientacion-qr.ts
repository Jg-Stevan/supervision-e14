/**
 * KIT e14-orientacion-qr-v1 — QR-BRÚJULA de orientación (el cuadrante del QR
 * manda). Evidencia del bench v8.3 del dueño (4 fotos reales: 2 JPG 8MP de
 * Galaxy A56 con papel arrugado/blotchy + 2 HEIC; corrida 26/10 en el
 * navegador, worker real de producción):
 *
 *   · jsQR sobre el warp (1600→1100→750+inv): 0/4 — el QR queda ~110 px y el
 *     papel arrugado NO es una homografía (jsQR modela planos; ZXing también
 *     falla a esa escala).
 *   · RESCATE hi-res (re-decode ≤6000 px + crops PARALELOGRAMO guiados por el
 *     QUAD + escala ×1.5/×2 + binarizadores G/L + θ fina ±10° con ZXing
 *     tryHarder): 4/4 — incluidas la arrugada y la blotchy.
 *   · Rotación derivada del CUADRANTE del QR 4/4 correcta: el hogar del QR en
 *     el E-14 es la esquina TL del acta derecha; foto girada α CW ⇒ QR en
 *     TL(α=0) · TR(α=90) · BR(α=180) · BL(α=270) del warp SIN rotar ⇒
 *     corrección = rot 0 / 270 / 180 / 90.
 *   · El payload queda como identidad OPACA (misma red line 10 del e63m):
 *     bench cruzó 160922 ≡ durazno4 (mismo payload = misma página del kit
 *     745) — dedupe/paginación gratis.
 *   · Costo: 1.3–5.1 s SOLO cuando jsQR falla (dominado por el re-decode del
 *     JPG; el round-robin de esquinas lo baja a ~3 intentos típicos). Y el
 *     premio: cuando la brújula decide, el sondeo OCR del probe (budget
 *     12 s, D56) NO corre.
 *
 * DISEÑO (reutiliza la infraestructura QR existente — cero dependencias
 * nuevas):
 *   · zxing-wasm 3.1.6 YA está en el repo (e63n/e64) con wasm LOCAL en
 *     public/wasm/ — este módulo usa el MISMO loader perezoso
 *     (moduloZxingDe de identidad-qr.ts, exportado ADITIVO).
 *   · jsQR 1.4.0 VENDIDO (masiva/vendor — red line 9) para el intento sobre
 *     el warp (barato) y como intento extra del rescate.
 *   · loadImageMemo/canvasCon (SPRINT-A) — el re-decode de fotoOriginal pega
 *     al LRU compartido del pipeline (HIT, sin decode doble).
 *   · anillo D62 (ganadorPersistente) ORDENA las esquinas: la rotación
 *     ganadora reciente del lote manda el primer cuadrante a probar
 *     (bench: el orden fijo por forma del warp erró 4/4; con anillo el
 *     rescate típico cae a ~3 intentos).
 *   · round-robin de esquinas (lección del bench: 9 intentos se quemaban en
 *     la esquina equivocada): RONDA 1 = {1.5G, 2G} × esquinas — RONDA 2 =
 *     variantes restantes {L, jsQR@2, θ ±10°} × esquinas.
 *   · ORDEN base +180° (tiempos del run v8.3 del dueño): el hogar efectivo
 *     del QR cayó +180° de la regla H/W en 4/4 (vert→BR · horiz→TR); probar
 *     la predicción primero quemó 6–8 intentos (QR-HR 5.1/4.5 s vs 1.4/1.3
 *     s de los que cayeron al 1.º). Base INVERTIDO del bench v8.4:
 *     vert ? [BR,TL,BL,TR] : [TR,BL,TL,BR] — con el anillo D62 POR ENCIMA
 *     (campo > prior): rescate típico ~2–3 intentos (~1.3 s vs 3.1 s media).
 *
 * CONTRATO (mismo espíritu e64 §7):
 *   · JAMÁS throw: cualquier fallo = null = el caller cae al sondeo OCR de
 *     siempre (comportamiento de HOY byte a byte).
 *   · Payload OPACA: no se parsea, no se invierte, no se compara por
 *     prefijos (solo guard de longitud ≥ 8 contra basura).
 *   · Traza en línea PROPIA `[e14] orientacion-qr …` (D51: solo AÑADIR —
 *     los instrumentos del dueño parsean por prefijo; la línea del probe
 *     `[e14] orientacion …` NO cambia de forma).
 *   · Kill-switch: flags.qrBrujulaOrientacion (default true; OFF = byte-
 *     idéntico a hoy).
 *   · Rot≠0 se registra en el ANILLO D62 (mismo contrato: desenlace
 *     aplicado; alimenta el orden del sondeo y de las esquinas).
 *
 * PURO-orquestación sobre image-utils + identidad-qr (sin sesión OCR nueva,
 * sin worker nuevo — corre en el main thread igual que la capa 0 QR).
 */

import type { Quad } from "@jg-stevan/scanner-core/types";
import type { Binarizer } from "zxing-wasm/reader";
import { canvasCon, loadImageMemo } from "./image-utils";
import { logger } from "../logger";
import { moduloZxingDe, qrCorto } from "./masiva/identidad-qr";
import { anilloGanadorRegistrar, ganadorPersistente } from "./orientacion";
import jsQR from "./masiva/vendor/jsQR.js";

/** Rotación a aplicar (misma unión que el Rotacion local de orientacion.ts —
 *  estructuralmente compatible con rotarDataUrl). */
export type RotacionQr = 0 | 90 | 180 | 270;

/** Cuadrante de la imagen SIN rotar donde cayó el QR. */
export type CuadranteQr = "TL" | "TR" | "BR" | "BL";

/** Desenlace de la brújula. null del orquestador = no decidió (cae al sondeo). */
export interface BrujulaQr {
  rot: RotacionQr; // rotación A APLICAR (0 = no rota — pero el QR LEYÓ)
  cuadrante: CuadranteQr; // dónde estaba el QR en la imagen sin rotar
  via: "jsQR-warp" | "zxing-hr"; // qué eslabón leyó
  payload: string; // OPACA (red line 10) — identidad/dedupe
  ms: number;
  intentos: string[]; // etiqueta de CADA intento (calibración con datos)
}

/** Hogar del QR del E-14 (esquina TL del acta derecha) → rotación a aplicar
 *  cuando el QR aparece en ESE cuadrante del warp/quad sin rotar. */
const ROT_POR_CUADRANTE: Record<CuadranteQr, RotacionQr> = {
  TL: 0,
  TR: 270,
  BR: 180,
  BL: 90,
};

/** Índice del cuadrante en el orden del quad [TL, TR, BR, BL] — la MISMA
 *  convención del core (bboxActaEnPx/comentarios del bridge: TL,TR,BR,BL en
 *  fracciones) y del cropParal del bench. */
const IDX_POR_CUADRANTE: Record<CuadranteQr, 0 | 1 | 2 | 3> = {
  TL: 0,
  TR: 1,
  BR: 2,
  BL: 3,
};

/** Cuadrante desde un punto normalizado (0-1) — fórmula del bench v8-2/v8.3. */
function cuadranteDesdePunto(fx: number, fy: number): CuadranteQr {
  return `${fy < 0.5 ? "T" : "B"}${fx < 0.5 ? "L" : "R"}` as CuadranteQr;
}

/** Rotación desde el cuadrante (pura — testeable). */
export function rotDesdeCuadranteQr(cuad: CuadranteQr): RotacionQr {
  return ROT_POR_CUADRANTE[cuad];
}

/** KIT flujo-dueno-v1 (K2 — brief Agente B, sub-commit 2) — rotación DESDE
 *  el centroide normalizado del QR (pura — testeable). Export ADITIVO que
 *  ENCAPSULA el mapeo validado del bench para los callers del warp de
 *  ingesta: centroide (0-1) → cuadrante (cuadranteDesdePunto, fórmula
 *  v8-2/v8.3) → rotación (ROT_POR_CUADRANTE — v8.3 4/4: el hogar del QR del
 *  E-14 es la esquina TL; foto girada α CW ⇒ QR en TL(0)/TR(90)/BR(180)/
 *  BL(270) del warp SIN rotar ⇒ corrección 0/270/180/90).
 *
 *  POR QUÉ AQUÍ NO VIVEN la base-invertido v8.4 ni el anillo D62: ambas
 *  ordenan INTENTOS del RESCATE hi-res (cropParal por esquinas del quad
 *  + ganadorPersistente que reordena qué cuadrante se prueba primero) —
 *  maquinaria para cuando la UBICACIÓN del QR es DESCONOCIDA. En el warp
 *  de ingesta la ubicación ES conocida (jsQR location / cornerPoints de
 *  BarcodeDetector) → el mapeo directo validado 4/4 es el correcto; un
 *  rescue no existe en ese camino (mismo alcance del pre-scan e107). El
 *  anillo TAMPOCO se alimenta desde aquí (decisión documentada: la rotación
 *  de ingesta no es desenlace de sondeo — no reordena ladders ajenos).
 *  REUTILIZA (no re-implementa) cuadranteDesdePunto + ROT_POR_CUADRANTE. */
export function rotacionDesdeCentroide(fx: number, fy: number): RotacionQr {
  return rotDesdeCuadranteQr(cuadranteDesdePunto(fx, fy));
}

// ─── Copia MEJORADA del warp solo para el QR (bench v8.2 — verbatim) ────────
/** Gris + estiramiento de contraste por percentiles (p5–p95). Ayuda a los QR
 *  térmicos de bajo contraste (papel arrugado, foto oscura). Barato: una
 *  pasada sobre ≤1600 px. */
const QR_WARP_LADO = 1600;

function canvasQrEnh(src: HTMLCanvasElement): HTMLCanvasElement {
  const s = Math.min(1, QR_WARP_LADO / Math.max(src.width, src.height));
  const c = canvasCon(
    Math.max(1, Math.round(src.width * s)),
    Math.max(1, Math.round(src.height * s)),
  );
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const im = ctx.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4)
    hist[(d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) >> 8]++;
  const total = d.length / 4;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= total * 0.05) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]!;
    if (acc >= total * 0.05) {
      hi = v;
      break;
    }
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.max(
      0,
      Math.min(
        255,
        (((d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) >> 8) - lo) * 255 / span,
      ),
    );
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
    d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

/** Tipo de location de jsQR (el vendor .d.ts NO lo declara — cast local, el
 *  archivo .js queda INTOCABLE, red line 9). */
interface QrLocation {
  topLeftCorner: { x: number; y: number };
  bottomRightCorner: { x: number; y: number };
}

/** Canvas reescalado por factor (bench escalaCanvas — verbatim). */
function escalaCanvas(src: HTMLCanvasElement, f: number): HTMLCanvasElement {
  const c = canvasCon(
    Math.max(1, Math.round(src.width * f)),
    Math.max(1, Math.round(src.height * f)),
  );
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// ─── PASO 2 — RESCATE hi-res guiado por el QUAD (bench v8.3 — verbatim) ─────
/** Lado mayor MÁXIMO del canvas de rescate (bench canvasQrAlta: 6000 puede
 *  exceder el área de canvas móvil → degradar 4800 → 3600). */
const LADOS_ALTA = [6000, 4800, 3600] as const;

/** Canvas de alta resolución de fotoOriginal (bench canvasQrAlta — adaptado a
 *  dataURL con el LRU compartido: HIT del decode del pipeline). Prueba de
 *  memoria incluida (getImageData 1×1 al centro). */
async function canvasQrAlta(fotoOriginal: string): Promise<HTMLCanvasElement | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImageMemo(fotoOriginal);
  } catch {
    return null;
  }
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  if (!w || !h) return null;
  for (const LADO of LADOS_ALTA) {
    try {
      const s = Math.min(1, LADO / Math.max(w, h));
      const c = canvasCon(
        Math.max(1, Math.round(w * s)),
        Math.max(1, Math.round(h * s)),
      );
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1); // prueba de memoria
      return c;
    } catch {
      /* siguiente tamaño */
    }
  }
  return null;
}

/** Geometría del crop paralelogramo (bench v8.3 GEO — verbatim): back = margen
 *  hacia atrás SOLO en U (fracción del lado corto) · ss = span del lado corto
 *  · sl = span del lado largo. Lab 26/10: el margen NO debe pasar del borde
 *  en V (arrancar sobre la mesa MUERE el decode); el ensamble de
 *  binarizadores/escalas cubre la fase del muestreo; θ fina cubre el papel
 *  inclinado ~10° (tryRotate de ZXing solo gira en pasos de 90°). */
const GEO = { back: 0.04, ss: 0.4, sl: 0.2 } as const;

/** Recorte PARALELOGRAMO de la esquina idx del quad sobre el canvas src
 *  (bench cropParal — PORT verbatim, TS). idx en orden [TL, TR, BR, BL]. */
function cropParal(
  src: HTMLCanvasElement,
  quad: Quad,
  idx: 0 | 1 | 2 | 3,
  thetaDeg: number,
): HTMLCanvasElement | null {
  const P = quad.map((p: { x: number; y: number }) => ({
    x: p.x * src.width,
    y: p.y * src.height,
  }));
  const xN = [1, 0, 1, 2][idx]!;
  const yN = [3, 2, 3, 0][idx]!; // vecinos warp-x / warp-y
  const U = { x: P[xN]!.x - P[idx]!.x, y: P[xN]!.y - P[idx]!.y };
  const V = { x: P[yN]!.x - P[idx]!.x, y: P[yN]!.y - P[idx]!.y };
  const lenU = Math.hypot(U.x, U.y);
  const lenV = Math.hypot(V.x, V.y);
  if (lenU < 8 || lenV < 8) return null;
  const corto = Math.min(lenU, lenV);
  const lu = (lenU <= lenV ? GEO.ss : GEO.sl) * lenU;
  const lv = (lenV <= lenU ? GEO.ss : GEO.sl) * lenV;
  const back = GEO.back * corto; // solo en U
  const su = lu + back;
  const sv = lv;
  const outW = Math.max(64, Math.min(2400, Math.round(su)));
  const outH = Math.max(64, Math.min(2400, Math.round(sv)));
  const th = (thetaDeg || 0) * (Math.PI / 180);
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const uN = { x: U.x / lenU, y: U.y / lenU };
  const vN = { x: V.x / lenV, y: V.y / lenV };
  const uR = { x: uN.x * ct - uN.y * st, y: uN.x * st + uN.y * ct };
  const vR = { x: vN.x * ct - vN.y * st, y: vN.x * st + vN.y * ct };
  const S = { x: P[idx]!.x - uR.x * back, y: P[idx]!.y - uR.y * back };
  const c = canvasCon(outW, outH);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH); // fuera de foto → blanco
  const ax = (uR.x * su) / outW;
  const ay = (uR.y * su) / outW; // M = [ax cx; ay cy]
  const cx = (vR.x * sv) / outH;
  const cy = (vR.y * sv) / outH;
  const det = ax * cy - ay * cx;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return null;
  const ia = cy / det;
  const ic = -cx / det;
  const ib = -ay / det;
  const id = ax / det; // T = A⁻¹
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(ia, ib, ic, id, -(ia * S.x + ic * S.y), -(ib * S.x + id * S.y));
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/** UN intento ZXing sobre UN canvas (bench zxLee — adaptado al loader local
 *  e64: readBarcodesFromImageData + wasm public/wasm/). tryHarder/tryRotate/
 *  tryInvert ON (el bench v8.3 los midió ganadores); tryDownscale ON ídem. */
async function zxLee(
  c: HTMLCanvasElement,
  etiqueta: string,
  intentos: string[],
  binarizador: Binarizer,
): Promise<{ payload: string } | null> {
  try {
    const mod = await moduloZxingDe();
    if (!mod) {
      intentos.push(`${etiqueta}!sin-zxing`);
      return null;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const hits = await mod.readBarcodesFromImageData(img, {
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      binarizer: binarizador,
      formats: ["QRCode"],
    });
    const hit = (hits || []).find((r) => r && r.text && r.text.length >= 8);
    intentos.push(`${etiqueta}${hit ? "✓" : "✗"}`);
    return hit ? { payload: hit.text } : null;
  } catch {
    intentos.push(`${etiqueta}!err`);
    return null;
  }
}

/** UN intento jsQR ×2 sobre UN canvas (quinto intento del ensamble — el
 *  up-escalado ×2 a veces lo despierta donde ZXing no llegó). */
function jsQrDe(
  c: HTMLCanvasElement,
  etiqueta: string,
  intentos: string[],
): { payload: string } | null {
  try {
    const escala = escalaCanvas(c, 2);
    const ctx = escala.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, escala.width, escala.height);
    const q = jsQR(img.data, escala.width, escala.height, {
      inversionAttempts: "attemptBoth",
    });
    const ok = q && q.data && q.data.length >= 8;
    intentos.push(`${etiqueta}${ok ? "✓" : "✗"}`);
    return ok ? { payload: q!.data } : null;
  } catch {
    intentos.push(`${etiqueta}!err`);
    return null;
  }
}

/** Ensamble del rescate (bench PASO1/PASO2 → round-robin): RONDA 1 = {1.5G,
 *  2G} por esquina (los 4 ganadores del bench viven aquí) · RONDA 2 = el
 *  resto {1.5L, 2L, jsQR@2, θ ±10° @2G/@1.5G}. Early-exit al primer payload. */
const RONDA1: [number, Binarizer][] = [
  [1.5, "GlobalHistogram"],
  [2, "GlobalHistogram"],
];
const RONDA2: [number, Binarizer][] = [
  [1.5, "LocalAverage"],
  [2, "LocalAverage"],
];

/** Etiqueta corta del binarizador para los intentos (solo G/L se usan — los
 *  otros dos del unión no entran al ensamble). */
function tagBin(b: Binarizer): string {
  return b === "GlobalHistogram" ? "G" : "L";
}

/** Forma del warp SIN rotar — la MISMA regla H/W del bench (vert = H ≥ W,
 *  bench v8.3 línea «geo.acta.height >= geo.acta.width»). loadImageMemo es
 *  LRU compartido: si warpQrJsQrAsync ya decodificó fotoOcr esto es HIT
 *  (~1 ms, sin decode doble). JAMÁS lanza (default vertical = caso E-14). */
async function vertDelWarp(fotoOcr: string): Promise<boolean> {
  try {
    const img = await loadImageMemo(fotoOcr);
    const w = img.naturalWidth || 0;
    const h = img.naturalHeight || 0;
    if (!w || !h) return true;
    return h >= w;
  } catch {
    return true;
  }
}

/** Orden de esquinas del rescate (tiempos del run v8.3 del dueño): el hogar
 *  efectivo del QR cayó +180° de la regla H/W en 4/4 (160903/durazno4: BR
 *  real vs TL predicho · 160922/durazno1: TR real vs BL predicho) — la
 *  predicción primera quemó 6–8 intentos. Base INVERTIDO (bench v8.4,
 *  índices [TL,TR,BR,BL]: vert ? [2,0,3,1] : [1,3,0,2]): PRIMERO la esquina
 *  del caso probable (+180° de la apuesta H/W), SEGUNDO la apuesta original,
 *  al final los perdedores 90/270. El ganador persistente D62 (rotación
 *  reciente del lote — señal de CAMPO real) manda CUANDO EXISTE: su esquina
 *  va primera, el resto conserva el orden base. */
function ordenEsquinas(ganador: RotacionQr | null, vert: boolean): (0 | 1 | 2 | 3)[] {
  const base: CuadranteQr[] = vert ? ["BR", "TL", "BL", "TR"] : ["TR", "BL", "TL", "BR"];
  if (ganador !== null && ganador !== 0) {
    const primero = base.find((q) => ROT_POR_CUADRANTE[q] === ganador);
    if (primero) {
      return [IDX_POR_CUADRANTE[primero], ...base.filter((q) => q !== primero).map((q) => IDX_POR_CUADRANTE[q])];
    }
  }
  return base.map((q) => IDX_POR_CUADRANTE[q]);
}

/** El orquestador resuelve los decodes UNA vez y llama a los helpers puros —
 *  loadImageMemo es async; el intento del warp se re-escribe async acá. Cada
 *  escala queda reportada en `intentos` (calibración con datos — paridad del
 *  bench: jsQR@1600✗ · jsQR@1100✗ · jsQR@750+inv✗). */
async function warpQrJsQrAsync(
  fotoOcr: string,
  intentos: string[],
): Promise<{
  payload: string;
  cuadrante: CuadranteQr;
} | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImageMemo(fotoOcr);
  } catch {
    return null;
  }
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  if (!w || !h) return null;
  // Base ya capada a 1600 (sin canvas intermedio full-res: el warp de
  // producción llega grande — se escala DIRECTO al pintar).
  const s0 = Math.min(1, QR_WARP_LADO / Math.max(w, h));
  const base = canvasQrEnh(
    canvasDe(img, Math.max(1, Math.round(w * s0)), Math.max(1, Math.round(h * s0))),
  );
  const ESCALAS: [number, "dontInvert" | "attemptBoth"][] = [
    [1600, "dontInvert"],
    [1100, "dontInvert"],
    [750, "attemptBoth"],
  ];
  for (const [LADO, inv] of ESCALAS) {
    const s = Math.min(1, LADO / Math.max(base.width, base.height));
    const c = s < 1 ? escalaCanvas(base, s) : base;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const q = jsQR(data.data, c.width, c.height, { inversionAttempts: inv });
    const etiqueta = `jsQR@${LADO}${inv === "attemptBoth" ? "+inv" : ""}`;
    if (q && q.data && q.data.length >= 8) {
      const L = (q as unknown as { location?: QrLocation }).location;
      if (!L) {
        intentos.push(`${etiqueta}!sin-loc`); // sin location no hay cuadrante
        continue; // siguiente escala
      }
      intentos.push(`${etiqueta}✓`);
      const fx = (L.topLeftCorner.x + L.bottomRightCorner.x) / 2 / c.width;
      const fy = (L.topLeftCorner.y + L.bottomRightCorner.y) / 2 / c.height;
      return { payload: q.data, cuadrante: cuadranteDesdePunto(fx, fy) };
    }
    intentos.push(`${etiqueta}✗`);
  }
  return null;
}

/** Canvas desde <img> (decode ya resuelto). */
function canvasDe(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = canvasCon(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (ctx) ctx.drawImage(img, 0, 0);
  return c;
}

/**
 * QR-BRÚJULA de orientación (§2): intenta leer el QR sobre el warp SIN rotar
 * (jsQR, barato) y, si no lee, corre el RESCATE hi-res guiado por el quad
 * (ZXing). El cuadrante del hit manda la rotación. Devuelve null si NADA
 * leyó (el caller cae al sondeo OCR de siempre — comportamiento de HOY) o
 * ante CUALQUIER fallo (jamás throw).
 *
 * @param fotoOcr      warp sin rotar (la MISMA fuente que lee el sondeo)
 * @param fotoOriginal dataURL crudo (para el rescate hi-res; decode LRU HIT)
 * @param quad         quad normalizado [TL,TR,BR,BL] en fracciones 0-1
 */
export async function brujulaQrOrientacion(
  fotoOcr: string,
  fotoOriginal: string,
  quad: Quad,
): Promise<BrujulaQr | null> {
  const t0 = performance.now();
  const intentos: string[] = [];
  try {
    // PASO 1 — warp (barato). Hit → rotación inmediata.
    const warp = await warpQrJsQrAsync(fotoOcr, intentos);
    if (warp) {
      const rot = ROT_POR_CUADRANTE[warp.cuadrante];
      if (rot !== 0) anilloGanadorRegistrar(rot); // D62 T1.4 — mismo contrato
      const ms = Math.round(performance.now() - t0);
      logger.info(
        `[e14] orientacion-qr via=jsQR-warp cuadrante=${warp.cuadrante} rot=${rot} aplicado=${rot !== 0 ? 1 : 0} ms=${ms} intentos=${intentos.length} payload=${qrCorto(warp.payload)}`,
      );
      return { rot, cuadrante: warp.cuadrante, via: "jsQR-warp", payload: warp.payload, ms, intentos };
    }
    // PASO 2 — rescate hi-res guiado por el quad.
    const alta = await canvasQrAlta(fotoOriginal);
    if (!alta) {
      intentos.push("HR:sin-canvas");
    } else {
      const orden = ordenEsquinas(ganadorPersistente(), await vertDelWarp(fotoOcr));
      const CUADS: CuadranteQr[] = ["TL", "TR", "BR", "BL"];
      // PASO 1 (round-robin): {1.5G, 2G} por esquina — los 4 ganadores del
      // bench viven aquí; el orden de esquinas lo manda el anillo D62.
      // PASO 2 (solo si nada): variantes restantes {1.5L, 2L, jsQR@2,
      // θ ±10° @2G/@1.5G} — tryRotate de ZXing solo cubre pasos de 90° y el
      // papel llega torcido ~10° (lab 26/10).
      let acierto: { payload: string; idx: 0 | 1 | 2 | 3 } | null = null;
      for (const ronda of [RONDA1, RONDA2] as const) {
        for (const idx of orden) {
          for (const [f, bin] of ronda) {
            if (acierto) break;
            const c1 = cropParal(alta, quad, idx, 0);
            if (!c1) continue;
            const hit = await zxLee(
              escalaCanvas(c1, f),
              `ZX-HR·c${idx}${CUADS[idx]}@${f}${tagBin(bin)}`,
              intentos,
              bin,
            );
            if (hit) acierto = { payload: hit.payload, idx };
          }
          if (acierto) break;
          if (ronda === RONDA2) {
            // variantes finas por esquina (solo en ronda 2 — baratas y tardías)
            const c0 = cropParal(alta, quad, idx, 0);
            if (c0) {
              const j = jsQrDe(c0, `jsQR-HR·c${idx}${CUADS[idx]}@2`, intentos);
              if (j) acierto = { payload: j.payload, idx };
            }
            for (const [th, f, bin] of [
              [-10, 2, "GlobalHistogram"],
              [10, 2, "GlobalHistogram"],
              [-10, 1.5, "GlobalHistogram"],
              [10, 1.5, "GlobalHistogram"],
            ] as const) {
              if (acierto) break;
              const cT = cropParal(alta, quad, idx, th);
              if (!cT) continue;
              const hit = await zxLee(
                escalaCanvas(cT, f),
                `ZX-HR·c${idx}${CUADS[idx]}r${th}@${f}${tagBin(bin)}`,
                intentos,
                bin,
              );
              if (hit) acierto = { payload: hit.payload, idx };
            }
          }
        }
        if (acierto) break;
      }
      // liberar el canvas grande (§2.1 — sin retener memoria)
      alta.width = 0;
      alta.height = 0;
      if (acierto) {
        const cuad = CUADS[acierto.idx];
        const rot = ROT_POR_CUADRANTE[cuad];
        if (rot !== 0) anilloGanadorRegistrar(rot); // D62 T1.4
        const ms = Math.round(performance.now() - t0);
        logger.info(
          `[e14] orientacion-qr via=zxing-hr cuadrante=${cuad} rot=${rot} aplicado=${rot !== 0 ? 1 : 0} ms=${ms} intentos=${intentos.length} payload=${qrCorto(acierto.payload)}`,
        );
        return { rot, cuadrante: cuad, via: "zxing-hr", payload: acierto.payload, ms, intentos };
      }
    }
    // NADA leyó → la red de seguridad es el sondeo OCR de siempre.
    const ms = Math.round(performance.now() - t0);
    logger.info(
      `[e14] orientacion-qr sin-payload (cae al sondeo OCR de siempre) ms=${ms} intentos=${intentos.length} ${intentos.join(" · ")}`,
    );
    return null;
  } catch (e) {
    // §5: la brújula jamás tumba el pipeline — el sondeo de siempre decide.
    logger.warn(
      `[e14] orientacion-qr error (cae al sondeo de siempre): ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}
