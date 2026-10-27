/**
 * KIT e63m-capa0-qr-identidad-v1 — CAPA 0: IDENTIDAD QR PRE-OCR (F1/F2).
 *
 * El QR del E-14 es DATO LEÍDO, no imagen: dos fotos del MISMO papel
 * producen el MISMO payload byte-a-byte aunque el dhash no pueda separarlas
 * (banco #72 — GO medido del dueño: 88.2% decode, 0 colisiones, re-encodes
 * dhash 8-33 agrupan por payload EXACTO; la separación criptográfica del
 * peligro dhash: par estilo G2/G4 con prefijo de 21 chars común y payload
 * DISTINTO no agrupa — sin zona de falso positivo). Esta capa corre ANTES de
 * despachar OCR en el runner (punto ÚNICO §1.2): gemela por QR = reutiliza
 * el desenlace del original y el OCR (24-39 s) JAMÁS se paga.
 *
 * Con este GO, la Etapa 3 del plan e63g-e63h (§2.1 matcher rotación-
 * invariante / §2.2 re-chequeo) queda SUSTITUIDA por e63m. El dhash NO se
 * toca (HAMMING_MAX=6 byte-idéntico — dedup.ts intacto).
 *
 * ─── KIT e64-qr-v1 · T-PRE — RECONSTRUCCIÓN DECLARADA ───────────────────
 * El kit e64 y su doc hermano (INSTRUCCIONES-qr-diagnostico-y-rescate-v1,
 * §1 «Mapa del sistema QR — arquitectura REAL verificada línea a línea»)
 * presuponen el estado e63n (`9e45dc9`) que NUNCA llegó al remoto (main
 * real f8ec6a9 = e63m; el commit no existe ni en ramas ni en PRs — API
 * verificada). Esta superficie de e63n se reconstruye aquí con la ÚNICA
 * fuente disponible (doc hermano §1) y queda declarada en
 * docs/REPORTE-e64-qr-v1.md §desviaciones:
 *   2. ladderBaseDePixeles     — A (100%) → B (top-left 45%×25%) →
 *                                C (8-38%×5-20%) → C1.5 (C up-escalado ×1.5)
 *   3. barridoQrDePixeles      — grilla de ventanas cuadradas por cuadrante
 *                                [TL→TR→BL→BR] × BARRIDO_VENTANAS
 *                                [0.11,0.14,0.19,0.25] × paso 0.5 — jsQR
 *                                attemptBoth por ventana
 *   4. barridoQrZxingDePixeles — misma grilla, zxing-wasm 3.1.6,
 *                                binarizadores GlobalHistogram→LocalAverage,
 *                                presupuesto 4 000 ms
 *                                (ZXING_BARRIDO_PRESUPUESTO_MS), wasm
 *                                servido LOCAL desde public/wasm/
 *                                zxing_reader.wasm vía
 *                                setZXingModuleOverrides({ locateFile })
 *                                con base `${NEXT_PUBLIC_BASE_PATH}/wasm/`
 *   5. tier ROTACIÓN           — A rotada 90°→180°→270° (última)
 *   → early-exit al primer payload · JAMÁS throw · trazaQr
 *     `[e14] qr-capa0 tier=base|barrido|zxing|rotacion90|…|null ms=…`
 * Los contratos e63m quedan equivalentes: ladderQrDePixeles (base +
 * rotación — el QA headless 48/48 lo ejercita), espera APLAZADA acotada,
 * qrCorto, vendor jsQR byte-idéntico.
 *
 * RED LINES (kit e63m §3 + e64 §7):
 * · 5 — Dedup jamás inventa: la llave es la IGUALDAD EXACTA de payload
 *   (sin umbrales, sin fuzzy, sin prefijos). Fallback sagrado:
 *   reutilizarResultado→false→pipeline completo. PROCESAR IGUAL manda.
 * · 10 — qrPayload es llave OPACA: NO se parsea, NO se invierte, NO se
 *   compara por prefijos (el prefijo de 21 chars es observación
 *   estructural del banco, jamás lógica de decisión).
 * · 9 — jsQR 1.4.0 VENDIDO byte-idéntico al de #72 (vendor/jsQR.js);
 *   BarcodeDetector nativo PROHIBIDO (determinismo entre máquinas).
 * · e64 §7-4 — La CAPA 0 jamás throw hacia el runner/pipeline: cualquier
 *   falla = null = flujo normal.
 * · e64 §7-6 — Sin timers globales: promesas acotadas + parámetros
 *   inyectables (el presupuesto del barrido zxing es reló local).
 */
// (jsQR vivía aquí — desde el FIX DICTAMEN-e73 §3.1 TODO el decode jsQR puro
// vive en qr-pixeles.ts; este módulo ya no lo importa directamente.)
import type { Binarizer, ReaderOptions } from "zxing-wasm/reader";
import type { EstadoEntrada } from "./tipos";
import { canvasCon, decodeImagenLru } from "../image-utils"; // SPRINT-A A1/A3 — decode-once LRU + factory de canvas
import { logger } from "../../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)
// ─── KIT e73-sondeo-qr-precoz-v1 (§A.2) — refactor puro ADITIVO ───────────
// El núcleo puro de píxeles (PixelesQr · EspecieBanda · BANDAS_BASE/BANDA_A ·
// intentoSobrePixeles · rotar90/rotarPixeles) vive en qr-pixeles.ts
// (módulo NUEVO worker-safe: cero DOM, cero zxing — solo jsQR vendido) y se
// RE-EXPORTA aquí — cero diffs en consumidores (runner.ts, puente, QA y
// tests siguen importando de este módulo). El contenido fue MOVIDO sin
// cambiar comportamiento (los tiers que lo consumen — ladderBase/ladderQr/
// rotación — ejercitan el mismo código: qa-qr-identidad verde).
// FIX DICTAMEN-e73-implementacion-v1 §3.1: el BARRIDO jsQR completo
// (barridoQrDePixeles · BARRIDO_VENTANAS · QR_RECORTE_LADO · Cuadrante/
// CUADRANTES · limitesDeCuadrante · ventanaDePixeles · jsQrDeVentana ·
// ladoDeVentana) se MOVIÓ TAMBIÉN al módulo puro — mismo trato sin cambio
// de comportamiento — para que el WORKER de sondeo importe el S3 de forma
// ESTÁTICA y su bundle quede jsQR-only (cero identidad-qr → cero
// scanner-core/logger/zxing/process.env en el worker emitido).
import {
  barridoQrDePixeles,
  BANDA_A,
  BANDAS_BASE,
  BARRIDO_VENTANAS,
  CUADRANTES,
  intentoSobrePixeles,
  jsQrDeVentana,
  ladoDeVentana,
  limitesDeCuadrante,
  QR_RECORTE_LADO,
  rotarPixeles,
  ventanaDePixeles,
  type PixelesQr,
} from "./qr-pixeles";
export {
  barridoQrDePixeles,
  BANDA_A,
  BANDAS_BASE,
  BARRIDO_VENTANAS,
  intentoSobrePixeles,
  QR_RECORTE_LADO,
  rotarPixeles,
} from "./qr-pixeles";
export type { EspecieBanda, PixelesQr } from "./qr-pixeles";

// ─── Constantes NUEVAS del kit e63m §1.1 (separadas de las existentes) ──────
/** Lado largo MÁXIMO del canvas de trabajo (kit §1.1 — igual que el banco:
 *  el thumb 320 del dhash es DEMASIADO PEQUEÑO para el QR). */
export const QR_LADO_LARGO = 2048;
/** Ladder BASE en orden (kit §1.1 — byte-idéntico al banco): A imagen
 *  completa → B banda top-left → C banda ajustada → C×1.5 up-escalado. */
export const QR_INTENTOS_BASE: readonly string[] = BANDAS_BASE.map((b) => b.id);
/** Tier de rotación (kit §1.1): SOLO si el ladder base falla — A completa
 *  @90°→@180°→@270° (evidencia del banco: el QR CAMBIA de esquina al rotar
 *  — durazno1 solo decodifica con A@90°; repetir bandas finas sobre el
 *  rotado no sirve, la imagen completa sí). */
export const QR_ROTACIONES: readonly number[] = [90, 180, 270];
/** Espera acotada del caso «original en vuelo» (kit §1.1/§1.2.4): intervalo
 *  × intentos = techo efectivo de 15 s. Re-chequeo SOLO-LECTURA del estado
 *  del original; sin timers globales. */
export const QR_ESPERA_INTERVALO_MS = 1_500;
export const QR_ESPERA_INTENTOS = 10;

// ─── e63n (T-PRE) — constantes del tier ZXING ──────────────────────────────
// (BARRIDO_VENTANAS y TODO el barrido jsQR viven en qr-pixeles.ts desde el
// FIX DICTAMEN-e73 §3.1 — re-exportados arriba; el tier zxing de este
// archivo los consume vía el import del módulo puro.)
/** Presupuesto de reló del barrido zxing (doc hermano §1: 4 000 ms — el
 *  barrido jsQR NO tiene reló: es puro y acotado por nº de ventanas). */
const ZXING_BARRIDO_PRESUPUESTO_MS = 4_000; // SPRINT-A A5: de-export (vivo solo aquí)
/** Binarizadores del barrido zxing en orden (doc hermano §1:
 *  GlobalHistogram→LocalAverage — el banco #77 midió GlobalHistogram ganando
 *  en blur y LocalAverage en nítidas). */
const ZXING_BINARIZADORES: readonly Binarizer[] = [ // SPRINT-A A5: de-export (vivo solo aquí)
  "GlobalHistogram",
  "LocalAverage",
];
/** El E-14 usa QR — restringir el simbolismo acelera cada ventana del
 *  barrido (micro-decisión declarada: el formato es dato del dominio). */
const ZXING_FORMATO = "QRCode" as const; // SPRINT-A A5: de-export (vivo solo aquí)

// (QR_RECORTE_LADO vive en qr-pixeles.ts desde el FIX DICTAMEN-e73 §3.1 —
// re-exportado arriba; decodificarQrDeRecorte lo consume vía ese import.)

/** Estado del original para la espera acotada — EstadoEntrada + AUSENTE
 *  (la fila fue quitada/vaciada mientras se esperaba). */
export type EstadoOriginalQr = EstadoEntrada | "AUSENTE";

// ─── Núcleo puro del decode: vive en qr-pixeles.ts (KIT e73 §A.2) ───────
// intentoSobrePixeles (banda → jsQR attemptBoth, puro) y rotar90/rotarPixeles
// (permutación exacta) se movieron SIN cambiar comportamiento al módulo puro
// worker-safe — re-exportados arriba (cero diffs en consumidores).
/**
 * Ladder BASE sobre píxeles (T-PRE — refactor del bucle del kit §1.1):
 * A imagen completa → B banda top-left → C banda ajustada → C1.5
 * up-escalado, early-exit al primer payload. El tier de ROTACIÓN NO está
 * aquí (quedó en ladderQrDePixeles — e63m/QA intacto — y en la cadena
 * completa decodificarQrDePixeles como ÚLTIMO tier, doc hermano §1).
 * Puro — testeable headless.
 */
export function ladderBaseDePixeles(pix: PixelesQr): string | null {
  for (const esp of BANDAS_BASE) {
    const payload = intentoSobrePixeles(pix, esp);
    if (payload != null) return payload; // early-exit al primer payload
  }
  return null;
}

/**
 * Ladder COMPLETO e63m sobre píxeles (kit §1.1): base A→B→C→C1.5 con
 * early-exit al primer payload; tier de rotación SOLO si el base falla
 * (A@90→A@180→A@270, early-exit ídem). null si nada decodifica. Puro —
 * el QA headless lo ejercita con matrices QR reales (contrato e63m
 * byte-equivalente: mismo conjunto de intentos en el mismo orden).
 */
export function ladderQrDePixeles(pix: PixelesQr): string | null {
  const base = ladderBaseDePixeles(pix);
  if (base != null) return base;
  for (const grados of QR_ROTACIONES) {
    const payload = intentoSobrePixeles(rotarPixeles(pix, grados), BANDA_A);
    if (payload != null) return payload;
  }
  return null;
}

// ─── e63n (T-PRE) — BARRIDO CEÑIDO: vive en qr-pixeles.ts ──────────────────
// (FIX DICTAMEN-e73 §3.1 — barridoQrDePixeles + Cuadrante/CUADRANTES +
// limitesDeCuadrante + ventanaDePixeles + jsQrDeVentana + ladoDeVentana se
// movieron SIN cambiar comportamiento al módulo puro worker-safe;
// barridoQrDePixeles y BARRIDO_VENTANAS se re-exportan arriba. El tier
// zxing de ESTE archivo (barridoQrZxingDePixeles) consume las mismas
// primitivas vía el import del módulo puro. El QA qa-qr-identidad valida
// la celda filo en AMBOS barridos: el jsQR (qr-pixeles.ts) y el zxing
// (este archivo).)

// ─── e64-qr T-1.1 · NITIDEZ (unsharp 3×3) ──────────────────────────────
/** Máscara de enfoque sobre RGBA: salida = clamp(orig + k·(orig − blur3×3)).
 *  Motivo (doc hermano R-1): el remuestreo a ≤2048 suaviza módulos de ~3-8 px
 *  — jsQR binariza mejor con filos (evidencia banco #77: motion blur en el
 *  filo del decode). Pura, sin DOM, sin throw: bordes intactos (y,x ∈
 *  [1,extremo-1] — el marco de 1 px no aporta al decode, el QR nunca vive
 *  pegado al filo ABSOLUTO de la foto). Uint8ClampedArray clampea solo. */
export const NITIDEZ_K = 0.6;

export function nitidezQrDePixeles(pix: PixelesQr): PixelesQr {
  const { data, width: w, height: h } = pix;
  const out = new Uint8ClampedArray(data); // orig + delta acumulado
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        // blur 3×3 (sin separables — 9 lecturas, ventana local)
        let suma = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) suma += data[i + (dy * w + dx) * 4 + c]!;
        const blur = suma / 9;
        out[i + c] = data[i + c]! + NITIDEZ_K * (data[i + c]! - blur);
      }
    }
  }
  return { data: out, width: w, height: h };
}

// ─── e64-qr T-1.2 · BINARIZADA (umbral local adaptativo) ───────────────────
/** Blanco-negro puro con umbral LOCAL (ventana integral — patrón EXACTO del
 *  que ya usa marcasEsquina en src/lib/e14/integridad.ts:74-100, con luma
 *  8 bits + Float64 en vez de 6 bits + Uint32: aquí SÍ se necesita el rango
 *  completo para el delta): fotos con sombra o iluminación dura donde el
 *  binarizado interno de jsQR falla. Salida RGBA 0/255 — jsQR la consume
 *  igual (attemptBoth la invierte si hace falta). Pura, sin DOM, sin throw. */
export const BINARIZADA_VENTANA = 0.025; // fracción del lado menor (mín 24 px)
export const BINARIZADA_DELTA = 12;      // holgura sobre la media local

export function binarizadaQrDePixeles(pix: PixelesQr): PixelesQr {
  const { data, width: w, height: h } = pix;
  // luma 8 bits (redondeo una vez)
  const luma = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++)
    luma[p] = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
  // imagen integral (W+1)×(H+1) Float64 — luma 8 bits no desborda
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += luma[y * w + x]!;
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1]! + fila;
    }
  }
  const lado = Math.max(24, Math.round(Math.min(w, h) * BINARIZADA_VENTANA));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - lado);
    const y1 = Math.min(h - 1, y + lado);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - lado);
      const x1 = Math.min(w - 1, x + lado);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const suma =
        integral[(y1 + 1) * iw + x1 + 1]! - integral[y0 * iw + x1 + 1]! -
        integral[(y1 + 1) * iw + x0]! + integral[y0 * iw + x0]!;
      const media = suma / area;
      const v = luma[y * w + x]! < media - BINARIZADA_DELTA ? 0 : 255;
      const i = (y * w + x) * 4;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

// ─── e63n (T-PRE) — tier ZXING (zxing-wasm 3.1.6, wasm LOCAL) ──────────────
/** Módulo zxing-wasm/reader cacheado — undefined = aún no intentado ·
 *  null = la carga falló (degrada a solo-jsQR) · módulo = listo. */
type ModZxing = typeof import("zxing-wasm/reader");
let modZxing: ModZxing | null | undefined;

/**
 * Carga DIFERIDA del módulo zxing (doc hermano §1: `import("zxing-wasm/
 * reader")` + wasm servido LOCAL desde public/wasm/ vía
 * setZXingModuleOverrides({ locateFile }) con base
 * `${NEXT_PUBLIC_BASE_PATH ?? ""}/wasm/`). Una sola tentativa por sesión
 * (caché); falla → null CON traza de indisponibilidad (T-0.1 del e64 —
 * doc hermano F-0.2) y el pipeline degrada a solo-jsQR. Jamás throw.
 *
 * KIT e14-orientacion-qr-v1 — EXPORTADO ADITIVO: la brújula QR de
 * orientación REUTILIZA este loader (mismo módulo, MISMA instancia de wasm
 * en caché — cero costo extra de memoria/bundle). El contrato no cambia:
 * caché de una tentativa, jamás throw.
 */
export async function moduloZxingDe(): Promise<ModZxing | null> {
  if (modZxing !== undefined) return modZxing;
  try {
    const mod = await import("zxing-wasm/reader");
    mod.setZXingModuleOverrides({
      locateFile: (archivo: string) =>
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/wasm/${archivo}`,
    });
    modZxing = mod;
  } catch {
    // e64-qr T-0.1 — el fallo del wasm/glue era SILENCIOSO (doc hermano
    // H-3): sin esta traza era imposible distinguir «QR ilegible» de
    // «wasm no cargó» (deploy sin BUILD_STATIC=1, basePath equivocado,
    // red bloqueada). El pipeline NO se rompe: degrada a solo-jsQR.
    logger.warn(
      `[e14] qr-capa0 zxing INDISPONIBLE (wasm/glue no cargó) — rescate degrada a solo-jsQR`,
    );
    modZxing = null;
  }
  return modZxing;
}

/** e64-qr T-0.1 — Estado del módulo zxing para diagnóstico (doc hermano
 *  F-0.2): "no-intentado" = aún sin intentar · "indisponible" = la carga
 *  falló (rescate degrada a solo-jsQR) · "listo" = wasm cargado. SOLO-
 *  LECTURA: jamás muta el estado, jamás dispara la carga. */
export function estadoZxingQr(): "no-intentado" | "indisponible" | "listo" {
  return modZxing === undefined
    ? "no-intentado"
    : modZxing === null
      ? "indisponible"
      : "listo";
}

/** Opciones del barrido por ventana (micro-decisión declarada: el barrido
 *  lanza ~700-2300 ventanas — cada una debe ser BARATA; la rotación y la
 *  inversión ya las cubren el tier rotación y jsQR attemptBoth). */
const OPCIONES_ZXING_VENTANA = (
  binarizador: Binarizer,
): ReaderOptions => ({
  formats: [ZXING_FORMATO],
  binarizer: binarizador,
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: false,
});

/** UN intento zxing sobre UNA ventana con UN binarizador. null si el
 *  módulo no está, si no hay ImageData (entorno headless — degrada
 *  honesto) o si nada lee. Jamás throw. */
async function zxingDeVentana(
  win: PixelesQr,
  binarizador: Binarizer,
): Promise<string | null> {
  try {
    const mod = await moduloZxingDe();
    if (!mod || typeof ImageData === "undefined") return null;
    const img = new ImageData(win.width, win.height);
    img.data.set(win.data); // copia por ventana — despreciable vs el decode
    const resultados = await mod.readBarcodesFromImageData(
      img,
      OPCIONES_ZXING_VENTANA(binarizador),
    );
    return resultados[0]?.text ?? null;
  } catch {
    return null;
  }
}

/**
 * BARRIDO CEÑIDO zxing (doc hermano §1.4): la MISMA grilla del barrido
 * jsQR con los binarizadores GlobalHistogram→LocalAverage por ventana y
 * presupuesto de reló 4 000 ms (ZXING_BARRIDO_PRESUPUESTO_MS — chequeo
 * `performance.now() > limite` por ventana; al vencer devuelve null SIN
 * exhaustar). Módulo indisponible → null inmediato (solo-jsQR).
 */
export async function barridoQrZxingDePixeles(
  pix: PixelesQr,
): Promise<string | null> {
  const mod = await moduloZxingDe();
  if (!mod || typeof ImageData === "undefined") return null;
  const limite = performance.now() + ZXING_BARRIDO_PRESUPUESTO_MS;
  for (const q of CUADRANTES) {
    const lim = limitesDeCuadrante(pix, q);
    for (const fraccion of BARRIDO_VENTANAS) {
      const lado = ladoDeVentana(pix, fraccion);
      const paso = Math.max(1, Math.round(lado * 0.5));
      for (let y = lim.y0; y + lado <= lim.y1; y += paso) {
        for (let x = lim.x0; x + lado <= lim.x1; x += paso) {
          if (performance.now() > limite) return null; // presupuesto vencido
          const win = ventanaDePixeles(pix, x, y, lado);
          if (!win) continue;
          for (const binarizador of ZXING_BINARIZADORES) {
            const payload = await zxingDeVentana(win, binarizador);
            if (payload != null) return payload;
          }
        }
      }
      // e64-qr T-1.0 — celda final del cuadrante (hueco del filo, doc
      // hermano H-5): anclada al filo inferior-derecho, MISMA grilla, los
      // DOS binarizadores y el chequeo de presupuesto intacto.
      if (performance.now() > limite) return null; // presupuesto vencido
      const winFilo = ventanaDePixeles(pix, lim.x1 - lado, lim.y1 - lado, lado);
      if (winFilo) {
        for (const binarizador of ZXING_BINARIZADORES) {
          const payloadFilo = await zxingDeVentana(winFilo, binarizador);
          if (payloadFilo != null) return payloadFilo;
        }
      }
    }
  }
  return null;
}

// ─── Trazas (doc hermano §1 — «Trazas existentes») ──────────────────────────
/** Traza EXACTA del formato e63n: `[e14] qr-capa0 tier=<tier> ms=<ms>
 *  payload=<8 chars…>`. Solo-observabilidad: jamás decide nada. */
function trazaQr(tier: string, payload: string, t0: number): void {
  logger.info(
    `[e14] qr-capa0 tier=${tier} ms=${Date.now() - t0} payload=${qrCorto(payload)}`,
  );
}

// ─── e71 (Opt-2) — tier RECORTE (esquina estándar, SIN barrido) ─────────────
/** Decodifica el QR de la esquina estándar en UNA pasada (kit Opt-2: «en
 *  lugar de barrer la imagen completa, recortar la esquina del QR… y pasarle
 *  ese recorte»): recorte superior-izquierda de QR_RECORTE_LADO px (clampado
 *  — imágenes menores devuelven la imagen COMPLETA; ventanaDePixeles jamás
 *  inventa píxeles) → jsQR (attemptBoth) → zxing (los DOS binarizadores,
 *  MISMO contrato del barrido: QRCode-only, tryHarder/rotate/invert false).
 *  null si nada lee. Jamás throw (red line e64 §7-4). El wrapper DOM
 *  (decodificarQrDeCapture) consume el tier vía decodificarQrDePixeles. */
export async function decodificarQrDeRecorte(
  pix: PixelesQr,
): Promise<string | null> {
  const recorte = ventanaDePixeles(pix, 0, 0, QR_RECORTE_LADO);
  if (!recorte) return null;
  const js = jsQrDeVentana(recorte);
  if (js != null) return js;
  for (const binarizador of ZXING_BINARIZADORES) {
    const payload = await zxingDeVentana(recorte, binarizador);
    if (payload != null) return payload;
  }
  return null;
}

/**
 * CADENA COMPLETA de decode sobre píxeles (doc hermano §1 + e64 Fase 1 —
 * el orden REAL): ladderBase → barrido jsQR → barrido NITIDEZ (T-1.1) →
 * barrido BINARIZADA (T-1.2) → barrido zxing → tier rotación, early-exit
 * al primer payload, `null` si nada decodifica. Async SOLO por el tier
 * zxing (wasm). La traza `tier=` sale por cada desenlace (también null —
 * T-0.3 del e64 la usa para verificar la versión desplegada). JAMÁS throw
 * (todas las sub-llamadas ya son a prueba de throw).
 *
 * KIT e14-gama-adaptativa-v1 (D74) — `opciones.presupuestoMs` (ADITIVO,
 * default null = byte-idéntico a hoy): presupuesto de reló de PARED de la
 * cadena. Los 3 barridos jsQR pesados (~15 s acumulados sin QR — el peor
 * caso SYNC documentado abajo) se SALTAN si el reló ya venció y la cadena
 * sigue directo al barrido zxing (con SU presupuesto propio de 4 s) y a
 * las rotaciones (baratas). En gama BAJO/MEDIO esto acota el bloqueo del
 * hilo UI sin perder la cobertura de rescate. La detección de pasada NO
 * depende de esta cadena (es solo capa 0 — el OCR va río abajo).
 */
export async function decodificarQrDePixeles(
  pix: PixelesQr,
  opciones: { presupuestoMs?: number | null } = {},
): Promise<string | null> {
  const t0 = Date.now();
  const presupuestoMs =
    typeof opciones.presupuestoMs === "number" && opciones.presupuestoMs > 0
      ? opciones.presupuestoMs
      : null;
  const vencido = () => presupuestoMs !== null && Date.now() - t0 > presupuestoMs;
  const base = ladderBaseDePixeles(pix);
  if (base != null) {
    trazaQr("base", base, t0);
    return base;
  }
  // e71 (Opt-2) — tier RECORTE (ANTES de cualquier barrido completo): UNA
  // lectura jsQR + zxing sobre la esquina estándar del E-14 (<500 ms). Si el
  // QR vive donde el formulario lo pone (el caso de campo), los barridos
  // completos (~15 s) JAMÁS corren. Fallback sagrado: el barrido de SIEMPRE
  // sigue detrás — los QR fuera de la esquina estándar (actas rotadas u
  // encuadres raros) conservan SU rescate, cero pérdida de cobertura.
  const recorte = await decodificarQrDeRecorte(pix);
  if (recorte != null) {
    trazaQr("recorte-600", recorte, t0);
    return recorte;
  }
  // KIT e14-gama-adaptativa-v1 — guard de presupuesto por tier pesado (las
  // líneas `const barrido/nitido/binarizada = barridoQrDePixeles(...)` se
  // conservan byte-idénticas — ancla source-scan qa-qr-identidad §T-1).
  if (!vencido()) {
    const barrido = barridoQrDePixeles(pix);
    if (barrido != null) {
      trazaQr("barrido", barrido, t0);
      return barrido;
    }
  } else {
    logger.info(
      `[e14] qr-capa0 presupuesto=${presupuestoMs}ms vencido tras recorte — salta barridos jsQR (gama adaptativa)`,
    );
  }
  // e64-qr T-1.1 — tier NITIDEZ: barrido sobre la imagen enfocada (doc
  // hermano R-1 — el remuestreo a 2048 suaviza los módulos; convolución
  // ~25 ms a 2048² + barrido acotado por nº de ventanas).
  if (!vencido()) {
    const nitido = barridoQrDePixeles(nitidezQrDePixeles(pix));
    if (nitido != null) {
      trazaQr("barrido-nitido", nitido, t0);
      return nitido;
    }
  }
  // e64-qr T-1.2 — tier BINARIZADA: barrido sobre el blanco-negro con
  // umbral LOCAL (doc hermano R-2 — sombra/iluminación dura donde el
  // binarizado interno de jsQR falla; imagen integral O(1) por píxel).
  if (!vencido()) {
    const binarizada = barridoQrDePixeles(binarizadaQrDePixeles(pix));
    if (binarizada != null) {
      trazaQr("barrido-binarizado", binarizada, t0);
      return binarizada;
    }
  }
  const zxing = await barridoQrZxingDePixeles(pix);
  if (zxing != null) {
    trazaQr("zxing", zxing, t0);
    return zxing;
  }
  for (const grados of QR_ROTACIONES) {
    const payload = intentoSobrePixeles(rotarPixeles(pix, grados), BANDA_A);
    if (payload != null) {
      trazaQr(`rotacion${grados}`, payload, t0);
      return payload;
    }
  }
  logger.info(`[e14] qr-capa0 tier=null ms=${Date.now() - t0}`);
  return null;
}

// ─── Wrapper DOM (vía del banco — producción) ───────────────────────────────
/** dataURL del capture → píxeles del canvas de trabajo (lado largo ≤
 *  `ladoLargo` — default QR_LADO_LARGO=2048, MISMA receta del
 *  canvasDeTrabajo del banco, byte-idéntico en semántica; e64-qr T-1.4 le
 *  añade el segundo parámetro OPCIONAL para el rescate — la firma existente
 *  no cambia para los callers actuales). null/jamás-throw: un fallo de
 *  render es sin-payload (fallback limpio).
 *  SPRINT-A (perf/decode-once-v1) A1: el decode pega al LRU compartido del
 *  pipeline (`decodeImagenLru` con maxDim = MISMA escala min(1,
 *  ladoLargo/ladoMayor) — el canvas pre-escalado se deriva del MISMO decode
 *  que luego reusan origen/preProceso/OCR); antes decodificaba la dataURL
 *  en un <img> privado (y OTRA vez para el rescate 4096). */
async function pixelesDeCapture(
  dataUrl: string,
  ladoLargo: number = QR_LADO_LARGO,
): Promise<PixelesQr | null> {
  try {
    const fuente = await decodeImagenLru(dataUrl, { maxDim: ladoLargo });
    let cv: HTMLCanvasElement;
    if (fuente instanceof HTMLCanvasElement) {
      cv = fuente; // canvas pre-escalado del LRU (maxDim aplicado)
    } else {
      const img = fuente as HTMLImageElement;
      cv = canvasCon(img.naturalWidth, img.naturalHeight); // SPRINT-A A3 — factory
      const ctx0 = cv.getContext("2d");
      if (!ctx0) return null;
      ctx0.drawImage(img, 0, 0);
    }
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
    return { data: imgData.data, width: cv.width, height: cv.height };
  } catch {
    return null; // QR_NO_DECODE_IMAGEN → sin-payload (fallback limpio, igual que antes)
  }
}

/** e64-qr T-1.4 — lado largo del RESCATE (SOLO si la cadena a 2048 falla):
 *  fotos ≥12 MP — el downscale a 2048 es la pérdida dominante y el QR
 *  nativo puede tener el doble de px por módulo. 4096²×4 = 64 MB puntual
 *  (aceptable UNA vez, jamás camino por defecto). */
export const QR_LADO_LARGO_RESCATE = 4096;

/**
 * API del kit §1.1 — decodificar el QR de UN capture (dataURL de la vía
 * fileToCaptureDataUrl): canvas de trabajo ≤2048 → CADENA COMPLETA e63n+e64
 * (decodificarQrDePixeles) → si falla TODO y el original EXCEDE 2048, UN
 * rescate a resolución nativa ≤4096 (T-1.4: ladder base + barrido jsQR —
 * SIN zxing: presupuesto de reló y memoria). Devuelve {payload} o null.
 * JAMÁS throw hacia el runner (kit §1.1 — cualquier falla = sin-payload =
 * pipeline normal intacto).
 *
 * e64-qr T-2.1 — `opciones.tiers` (ADAPTACIÓN DECLARADA del kit FASE 2):
 * · "completos" (default — MASIVA): la cadena entera + rescate.
 * · "base" (CÁMARA): SOLO ladderBaseDePixeles — techo ~0.5 s. El flujo de
 *   escaneo individual tiene timeout 15 s y la cadena completa (~15-17 s
 *   para sin-QR: barridos + zxing + rescate, bloques SYNC en el hilo UI)
 *   convertiría cada disparo sin QR en RECHAZADA-TIEMPO (regresión
 *   prohibida) y congelaría la vista. La señal de cámara es ADITIVA: el QR
 *   de una acta EN MANO bien encuadrada cae en el tier base; el rescate
 *   pesado queda en masiva (timeout 120 s), donde ya está presupuestado.
 */
export async function decodificarQrDeCapture(
  dataUrl: string,
  opciones: {
    tiers?: "completos" | "base";
    // KIT e14-gama-adaptativa-v1 (D74) — ADITIVOS con default = comportamiento
    // de hoy (los callers existentes sin estas claves quedan byte-idénticos):
    /** Lado largo del canvas de trabajo (default QR_LADO_LARGO=2048). */
    ladoLargo?: number;
    /** Rescate hi-res 4096 permitido (default true). */
    rescate4096?: boolean;
    /** Presupuesto de la cadena completa (default null = sin reló). */
    presupuestoMs?: number | null;
  } = {},
): Promise<{ payload: string } | null> {
  const tiers = opciones.tiers ?? "completos";
  const ladoLargo =
    typeof opciones.ladoLargo === "number" && opciones.ladoLargo >= 256
      ? Math.round(opciones.ladoLargo)
      : QR_LADO_LARGO;
  const rescateOn = opciones.rescate4096 !== false;
  try {
    const pix = await pixelesDeCapture(dataUrl, ladoLargo);
    if (!pix) return null;
    if (tiers === "base") {
      const baseRapida = ladderBaseDePixeles(pix);
      return baseRapida != null ? { payload: baseRapida } : null;
    }
    const payload = await decodificarQrDePixeles(pix, {
      presupuestoMs: opciones.presupuestoMs ?? null,
    });
    if (payload != null) return { payload };
    // KIT e14-gama-adaptativa-v1 — rescate 4096 OMITIDO en gama BAJO (64 MB
    // puntual donde los abortos por memoria dominan — D74). Con flag OFF/
    // ALTO/MEDIO rescateOn=true ⇒ byte-idéntico a hoy.
    if (!rescateOn) {
      logger.info(`[e14] qr-capa0 rescate4096 OMITIDO (gama adaptativa)`);
      return null;
    }
    // e64-qr T-1.4 — RESCATE a resolución mayor (ADAPTACIÓN DECLARADA: el
    // snippet del kit usa `>=` con comentario «ya era ≥4096», internamente
    // inconsistente — pix YA viene clampeado a 2048, así que `>= QR_LADO_
    // LARGO` es precisamente el caso donde el rescate SÍ aporta píxeles
    // REALES; se implementa el INTENT de R-4: rescate SOLO si el canvas de
    // trabajo quedó clampeado (original > 2048) — sobre un original ≤2048
    // el 4096 sería upscale inútil, jamás inventa detalle).
    if (Math.max(pix.width, pix.height) < QR_LADO_LARGO) return null;
    const tRescate = Date.now();
    const pixGrande = await pixelesDeCapture(dataUrl, QR_LADO_LARGO_RESCATE);
    if (!pixGrande) return null;
    const base = ladderBaseDePixeles(pixGrande);
    if (base != null) {
      trazaQr("rescate4096", base, tRescate);
      return { payload: base };
    }
    const barrido = barridoQrDePixeles(pixGrande);
    if (barrido != null) {
      trazaQr("rescate4096-barrido", barrido, tRescate);
      return { payload: barrido };
    }
    return null;
  } catch {
    return null; // fallback limpio — la capa 0 jamás tumba el pipeline
  }
}

// ─── Espera acotada del caso «original en vuelo» (kit e63m §1.2.4) ──────────
/**
 * Espera APLAZADA: re-chequeo SOLO-LECTURA del estado del original cada
 * QR_ESPERA_INTERVALO_MS hasta QR_ESPERA_INTENTOS (techo efectivo 15 s —
 * sin timers globales; DEDUP_CINTA_CIERTA=2 intacto). Devuelve "reutiliza"
 * cuando el original aterriza con desenlace final (LISTA/DUPLICADA) y
 * "techo" cuando vence el techo O el original sale del vuelo por otra
 * puerta (ERROR / PENDIENTE / AUSENTE — esperar sería en balde: el
 * reproceso completo honesto manda). Los parámetros son inyectables SOLO
 * para el QA headless (timers cortos); en producción corren los default
 * del kit.
 */
export async function esperarDesenlaceQr(
  estadoDe: () => EstadoOriginalQr,
  intervaloMs: number = QR_ESPERA_INTERVALO_MS,
  maxIntentos: number = QR_ESPERA_INTENTOS,
): Promise<"reutiliza" | "techo"> {
  for (let i = 0; i < maxIntentos; i++) {
    await new Promise((r) => setTimeout(r, intervaloMs));
    const estado = estadoDe();
    if (estado === "LISTA" || estado === "DUPLICADA") return "reutiliza";
    if (estado === "ERROR" || estado === "PENDIENTE" || estado === "AUSENTE") {
      return "techo";
    }
    // PROCESANDO → sigue en vuelo: la espera continúa (el techo manda).
  }
  return "techo";
}

/** Prefijo corto del payload para trazas/informe (8 chars + «…») — SOLO
 *  cosmética: la decisión vive SIEMPRE en la igualdad EXACTA (red line 10). */
export function qrCorto(payload: string): string {
  return `${payload.slice(0, 8)}…`;
}
