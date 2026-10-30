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
// R7b (M10) movió el loader zxing a ../qr-zxing (fin de la dependencia
// invertida núcleo→masiva). R8: este módulo solo lo CONSUME — el re-export
// temporal se retiró (runner.ts importa qrCorto directo de ../qr-zxing).
import { moduloZxingDe, qrCorto } from "../qr-zxing";
// KIT e75-qr-zoom-zbar-v1 — zbar-wasm (tier de rescate del ZOOM TL, main):
// carga diferida LOCAL /wasm/ + filtro QR — MISMA doctrina del tier zxing.
import { estadoZbarQr, zbarDePixeles } from "./zbar-qr";
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
  binarizadaQrDePixeles, // D40 — movida al módulo puro (abajo re-exportada)
  CUADRANTES,
  intentoSobrePixeles,
  jsQrDeVentana,
  ladderBaseDePixeles, // D40 — movida al módulo puro (abajo re-exportada)
  ladoDeVentana,
  limitesDeCuadrante,
  nitidezQrDePixeles, // D40 — movida al módulo puro (abajo re-exportada)
  // R1.1 — KIT qr-presupuesto-real-v1: guard del barrido POR CUADRANTE y POR
  // FRACCIÓN (la llamada barridoQrDePixeles(pix) queda byte-idéntica — el
  // guard se inyecta módulo-scoped ANTES de las 3 llamadas de la cadena).
  activarGuardBarrido,
  QR_RECORTE_LADO,
  QR_ROTACIONES, // D40 — movida al módulo puro (abajo re-exportada)
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
// D40 — KIT e14-capa0-qr-worker-v1: NITIDEZ/BINARIZADA se MOVIERON al módulo
// puro (qr-pixeles.ts, byte a byte) para que el worker de capa 0 las importe
// de forma ESTÁTICA sin arrastrar zxing/logger/DOM. Re-exportadas aquí —
// cero diffs en consumidores (runner, qa-qr-identidad, tests).
export {
  binarizadaQrDePixeles,
  BINARIZADA_DELTA,
  BINARIZADA_VENTANA,
  nitidezQrDePixeles,
  NITIDEZ_K,
} from "./qr-pixeles";
export type { EspecieBanda, PixelesQr } from "./qr-pixeles";

// ─── Constantes NUEVAS del kit e63m §1.1 (separadas de las existentes) ──────
/** Lado largo MÁXIMO del canvas de trabajo (kit §1.1 — igual que el banco:
 *  el thumb 320 del dhash es DEMASIADO PEQUEÑO para el QR). */
export const QR_LADO_LARGO = 2048;
// D40 — KIT e14-capa0-qr-worker-v1: las ROTACIONES y el LADDER BASE son
// puros (BANDAS_BASE + intentoSobrePixeles — cero DOM/zxing/logger): viven
// en qr-pixeles.ts (byte a byte) y se re-exportan aquí — el worker de capa 0
// los importa estáticamente sin arrastrar este módulo (misma doctrina e73).
/** Ladder BASE en orden (kit §1.1 — byte-idéntico al banco): A imagen
 *  completa → B banda top-left → C banda ajustada → C×1.5 up-escalado. */
export const QR_INTENTOS_BASE: readonly string[] = BANDAS_BASE.map((b) => b.id);
/** Tier de rotación (kit §1.1): SOLO si el ladder base falla — A completa
 *  @90°→@180°→@270° (evidencia del banco: el QR CAMBIA de esquina al rotar
 *  — durazno1 solo decodifica con A@90°; repetir bandas finas sobre el
 *  rotado no sirve, la imagen completa sí). */
export { QR_ROTACIONES } from "./qr-pixeles"; // D40 — movida al módulo puro (byte a byte)
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
export { ladderBaseDePixeles } from "./qr-pixeles"; // D40 — movida al módulo puro (byte a byte)

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

// ─── e64-qr T-1.1/T-1.2 · NITIDEZ + BINARIZADA: viven en qr-pixeles.ts ─────
// (D40 — KIT e14-capa0-qr-worker-v1: movidas byte a byte al módulo puro
// worker-safe con la MISMA doctrina del FIX DICTAMEN-e73 §3.1; re-exportadas
// arriba — cero diffs en consumidores. Este módulo las importa del puro y
// la cadena completa de abajo las consume igual que siempre.)


// ─── e63n (T-PRE) — tier ZXING (zxing-wasm 3.1.6, wasm LOCAL) ──────────────
// R7b (M10): el loader (moduloZxingDe + su caché + estadoZxingQr + el tipo
// ModZxing) vive en ../qr-zxing (importado arriba — misma instancia única
// de wasm).

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

// ─── KIT e75-qr-zoom-zbar-v1 — tier ZOOM TL re-escalado + zbar ────────────────
/** Fracción del ANCHO del recorte TL del tier zoom (lab lab-e14: banda
 *  50%×30% — contiene el QR de los escaneos E-14 y 5 de 6 fotos). */
export const QR_ZOOM_FRAC_ANCHO = 0.5;
/** Fracción del ALTO del recorte TL del tier zoom (lab: 30%). */
export const QR_ZOOM_FRAC_ALTO = 0.3;
/** Lado largo destino del zoom PRIMARIO (lab: 1024 — píxeles NATIVOS del QR
 *  en tiras de escáner; en fotos 12MP baja la banda 2000×900 a 1024×460). */
export const QR_ZOOM_LADO = 1024;
/** Lado largo destino del zoom ALT (lab: 640 — zbar leyó 1 acta SOLO a esta
 *  escala: el remuestreo distinto cambia los módulos que el finder ve). */
export const QR_ZOOM_LADO_ALT = 640;

/**
 * Píxeles del recorte TL re-escalado DESDE el ORIGINAL (el corazón del kit
 * e75 — la evidencia del lab: 3 páginas del escáner NO leídas por la cadena
 * completa ni siquiera a 1600/2400/4000 px full-frame SÍ se leen cuando el
 * QR conserva píxeles nativos: escalar la página COMPLETA a 2048 encoge los
 * módulos ~3×; recortar la banda y escalar SOLO la banda los conserva).
 *
 * Receta EXACTA del lab (docs/REPORTE-e75 §5 — medida píxel a píxel):
 * fetch(dataURL)→blob→createImageBitmap + OffscreenCanvas (fallback
 * HTMLCanvasElement). DESVIACIÓN DECLARADA verificada en el banco: la MISMA
 * banda dibujada desde <img>+HTMLCanvasElement difiere de la de
 * ImageBitmap+OffscreenCanvas en ~0.1% de píxeles (el navegador usa un
 * resampler distinto según el origen) y en el acta marginal p4 ESO decide la
 * lectura de zbar (img→null · bitmap→LEE). La receta del lab es la que
 * ganó: bitmap SIEMPRE, a resolución NATIVA del original (close()
 * inmediato — gama baja).
 *
 * Source-rect TL (QR_ZOOM_FRAC_ANCHO × QR_ZOOM_FRAC_ALTO, redondeado,
 * mínimo 1 px — jamás inventa píxeles) → destino escalado con
 * s = min(1, lado/max(sw,sh)) — NUNCA up-escala más allá de nativo
 * (upscale inventa detalle, R-4 del e64) → ImageData RGBA.
 * imageSmoothingQuality "medium" = la receta MEDIDA del lab.
 * null/jamás-throw (red line e64 §7-4).
 */
async function pixelesZoomTlDeCapture(
  dataUrl: string,
  ladoDestino: number,
): Promise<PixelesQr | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    const respuesta = await fetch(dataUrl);
    if (!respuesta.ok) return null;
    bitmap = await createImageBitmap(await respuesta.blob());
    const sw = Math.max(1, Math.round(bitmap.width * QR_ZOOM_FRAC_ANCHO));
    const sh = Math.max(1, Math.round(bitmap.height * QR_ZOOM_FRAC_ALTO));
    if (sw < 1 || sh < 1) return null;
    const escala = Math.min(1, ladoDestino / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * escala));
    const dh = Math.max(1, Math.round(sh * escala));
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null =
      null;
    if (typeof OffscreenCanvas !== "undefined") {
      const oc = new OffscreenCanvas(dw, dh);
      ctx = oc.getContext("2d", { willReadFrequently: true });
    } else {
      const cv = canvasCon(dw, dh);
      ctx = cv.getContext("2d", { willReadFrequently: true });
    }
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(bitmap, 0, 0, sw, sh, 0, 0, dw, dh);
    const imgData = ctx.getImageData(0, 0, dw, dh);
    return { data: imgData.data, width: dw, height: dh };
  } catch {
    return null; // un fallo de render es sin-payload (fallback limpio)
  } finally {
    try {
      bitmap?.close(); // libera el decode RGBA completo (gama baja)
    } catch {
      /* noop */
    }
  }
}

/**
 * TIER ZOOM TL re-escalado + zbar (kit e75) — corre DESPUÉS de la cadena
 * completa (worker o main) SIN lectura y ANTES del rescate 4096 (costo
 * ~6-50 ms vs segundos — barato primero, doc lab §3). Orden MEDIDO:
 *
 *   1. zoom@1024 → zxing (GlobalHistogram→LocalAverage, MISMO contrato del
 *      barrido: QRCode-only, tryHarder/rotate/invert false) → zbar-wasm
 *      (filtro QR — lab: 6/7 zxing + rescate p2 SOLO zbar).
 *   2. zoom@640 → zbar (lab: p4 SOLO zbar@640; zxing@640 no añade NADA
 *      sobre zbar@640 — unión del lab §4 — y el tier se mantiene mínimo).
 *
 * Early-exit al primer payload · trazas `tier=zoom1024-zxing|zoom1024-zbar|
 * zoom640-zbar` · null si nada lee · JAMÁS throw (todas las sub-llamadas ya
 * son a prueba de throw). Main thread SOLO (wasm — red line e73).
 */
export async function decodificarQrZoomZbarDeCapture(
  dataUrl: string,
): Promise<string | null> {
  const t0 = Date.now();
  const pix1024 = await pixelesZoomTlDeCapture(dataUrl, QR_ZOOM_LADO);
  logger.info(
    `[e14] qr-capa0 zoom-e75 pix1024=${pix1024 ? `${pix1024.width}x${pix1024.height}` : "null"} ms=${Date.now() - t0}`,
  );
  if (pix1024) {
    for (const binarizador of ZXING_BINARIZADORES) {
      const payload = await zxingDeVentana(pix1024, binarizador);
      if (payload != null) {
        trazaQr("zoom1024-zxing", payload, t0);
        return payload;
      }
    }
    const payloadZ = await zbarDePixeles(pix1024);
    logger.info(
      `[e14] qr-capa0 zoom-e75 zbar1024=${payloadZ ? "LEE" : "null"} estado=${estadoZbarQr()} ms=${Date.now() - t0}`,
    );
    if (payloadZ != null) {
      trazaQr("zoom1024-zbar", payloadZ, t0);
      return payloadZ;
    }
  }
  const pix640 = await pixelesZoomTlDeCapture(dataUrl, QR_ZOOM_LADO_ALT);
  if (pix640) {
    const payloadZ2 = await zbarDePixeles(pix640);
    logger.info(
      `[e14] qr-capa0 zoom-e75 zbar640=${payloadZ2 ? "LEE" : "null"} pix640=${pix640.width}x${pix640.height} ms=${Date.now() - t0}`,
    );
    if (payloadZ2 != null) {
      trazaQr("zoom640-zbar", payloadZ2, t0);
      return payloadZ2;
    }
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
  // R1.1 — KIT qr-presupuesto-real-v1: el guard de reló se INYECTA al barrido
  // (activarGuardBarrido — chequeo POR CUADRANTE y POR FRACCIÓN dentro de
  // barridoQrDePixeles): el presupuesto deja de saltarse a sí mismo al
  // arrancar un barrido con el reló a punto de vencer. Con presupuesto null
  // (gama BASE/ALTO) vencido() es siempre false ⇒ byte-idéntico a hoy.
  activarGuardBarrido(vencido);
  try {
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
    // R1.1 — guard POR ROTACIÓN (antes corrían las 3 SIEMPRE — 3 rotaciones
    // de frame completo + 3 intentos jsQR A con el presupuesto vencido).
    for (const grados of QR_ROTACIONES) {
      if (vencido()) break;
      const payload = intentoSobrePixeles(rotarPixeles(pix, grados), BANDA_A);
      if (payload != null) {
        trazaQr(`rotacion${grados}`, payload, t0);
        return payload;
      }
    }
    logger.info(`[e14] qr-capa0 tier=null ms=${Date.now() - t0}`);
    return null;
  } finally {
    activarGuardBarrido(null); // R1.1 — el guard muere con la cadena
  }
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
    // D40 — KIT e14-capa0-qr-worker-v1 (aditivo, default false = byte-idéntico):
    // SOLO el tier zxing (recorte + barrido) — el rescate de main cuando el
    // worker de capa 0 ya agotó TODOS los tiers jsQR (base/recorte/barridos/
    // nitidez/binarizada/rotaciones/rescate) sin leer nada. Sin re-pagar
    // trabajo: la cobertura queda EXACTA a la cadena de hoy.
    soloZxing?: boolean;
    // KIT e75-qr-zoom-zbar-v1 (aditivo, default true = MEJORA del dueño):
    // tier ZOOM TL re-escalado + zbar DESPUÉS de la cadena completa SIN
    // lectura y ANTES del rescate 4096 (barato ~6-50 ms vs segundos).
    // `false` = cadena de hoy byte-idéntica (kill-switch flag qrZoomTl).
    zoomTl?: boolean;
  } = {},
): Promise<{ payload: string } | null> {
  const tiers = opciones.tiers ?? "completos";
  const ladoLargo =
    typeof opciones.ladoLargo === "number" && opciones.ladoLargo >= 256
      ? Math.round(opciones.ladoLargo)
      : QR_LADO_LARGO;
  const rescateOn = opciones.rescate4096 !== false;
  const t0 = Date.now();
  // R1.1 — KIT qr-presupuesto-real-v1: el presupuesto de la cadena TAMBIÉN
  // manda sobre el RESCATE 4096 (re-decode a 16 MP + ladder + barrido —
  // el bloque más caro de toda la capa 0). Con presupuesto null ⇒ inerte.
  const presupuestoCapture =
    typeof opciones.presupuestoMs === "number" && opciones.presupuestoMs > 0
      ? opciones.presupuestoMs
      : null;
  const vencidoCapture = () =>
    presupuestoCapture !== null && Date.now() - t0 > presupuestoCapture;
  try {
    const pix = await pixelesDeCapture(dataUrl, ladoLargo);
    if (!pix) return null;
    if (tiers === "base") {
      const baseRapida = ladderBaseDePixeles(pix);
      return baseRapida != null ? { payload: baseRapida } : null;
    }
    // D40 — modo soloZxing: el worker (jsQR-only) ya corrió la cadena
    // completa sin leer nada. Aquí SOLO el tier que el worker no puede
    // cargar (red line e73: zxing JAMÁS en el worker): recorte-600 con los
    // DOS binarizadores + barrido zxing completo (presupuesto propio 4 s).
    if (opciones.soloZxing) {
      const recorteZ = ventanaDePixeles(pix, 0, 0, QR_RECORTE_LADO);
      if (recorteZ) {
        for (const binarizador of ZXING_BINARIZADORES) {
          const payloadZ = await zxingDeVentana(recorteZ, binarizador);
          if (payloadZ != null) {
            trazaQr("recorte-600-zxing", payloadZ, t0);
            return { payload: payloadZ };
          }
        }
      }
      const zxingZ = await barridoQrZxingDePixeles(pix);
      if (zxingZ != null) {
        trazaQr("zxing", zxingZ, t0);
        return { payload: zxingZ };
      }
      // KIT e75-qr-zoom-zbar-v1 — el worker agotó jsQR y el zxing full-frame
      // no leyó: el ZOOM TL (píxeles nativos del QR) + zbar es el rescate
      // RESTANTE antes de declarar null (lab: 3 páginas leídas SOLO aquí).
      if (opciones.zoomTl !== false) {
        const zoomZ = await decodificarQrZoomZbarDeCapture(dataUrl);
        if (zoomZ != null) return { payload: zoomZ };
      }
      logger.info(`[e14] qr-capa0 soloZxing tier=null ms=${Date.now() - t0}`);
      return null;
    }
    const payload = await decodificarQrDePixeles(pix, {
      presupuestoMs: opciones.presupuestoMs ?? null,
    });
    if (payload != null) return { payload };
    // KIT e75-qr-zoom-zbar-v1 — tier ZOOM TL re-escalado + zbar (ANTES del
    // rescate 4096: ~6-50 ms vs segundos — barato primero). La evidencia del
    // lab: 3 páginas del escáner no leídas NI a 1600/2400/4000 px full-frame
    // SÍ se leen con el recorte re-escalado (píxeles nativos del QR).
    if (opciones.zoomTl !== false) {
      const zoomPayload = await decodificarQrZoomZbarDeCapture(dataUrl);
      if (zoomPayload != null) return { payload: zoomPayload };
    }
    // KIT e14-gama-adaptativa-v1 — rescate 4096 OMITIDO en gama BAJO (64 MB
    // puntual donde los abortos por memoria dominan — D74). Con flag OFF/
    // ALTO/MEDIO rescateOn=true ⇒ byte-idéntico a hoy.
    if (!rescateOn) {
      logger.info(`[e14] qr-capa0 rescate4096 OMITIDO (gama adaptativa)`);
      return null;
    }
    // R1.1 — guard de reló del rescate: vencido el presupuesto de la cadena,
    // el re-decode a 16 MP + barrido a 4096 (≈4× el costo del 2048) ya no
    // entra — el null honesto sube (la identidad la resolverá el OCR/capa 2).
    if (vencidoCapture()) {
      logger.info(
        `[e14] qr-capa0 rescate4096 OMITIDO (presupuesto=${presupuestoCapture}ms vencido — R1.1)`,
      );
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
    activarGuardBarrido(vencidoCapture); // R1.1 — el barrido 4096 también responde al reló
    try {
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
    } finally {
      activarGuardBarrido(null); // R1.1
    }
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

// R7b (M10): qrCorto vive en ../qr-zxing (importado arriba — mismo
// formateador de trazas, SOLO cosmético: red line 10 intacta).
