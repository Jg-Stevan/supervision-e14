/** KIT e63b-deskew-escaneo-v1 (D63-B): pre-proceso de ESCANEOS — deskew +
 *  limpieza suave de blanco ANTES de quad/OCR. Evidencia: los escaneos
 *  llegan a veces inclinados (skew de scanner 0.5–3°) y grisáceos y el OCR
 *  pierde lectura con ambos; las FOTOS no necesitan esto (su corrección es
 *  el warp del quad — un deskew extra podría rotar dos veces).
 *
 *  REGLA DE ORO (kit §0): SOLO actúa cuando `origen === "escaneo"` (detector
 *  de D63-A). Fotos y origen-null pasan BYTE-IDÉNTICOS (ni decode extra).
 *
 *  Tareas del kit:
 *  · T1 detección de ángulo — perfiles de proyección sobre la BANDA DEL
 *    ENCABEZADO del acta (top 30% — NO la página completa, costo), búsqueda
 *    grueso-fina 0.5°→0.1° dentro de ±10° (fuera NO es skew: captura
 *    torcida → no se corrige aquí, la tratará el quad/gate de D63-C).
 *  · T2 deskew selectivo — solo escaneo Y |ángulo| ≥ 0.3° Y ≤ 10°: rotar el
 *    master con resample de alta calidad (canvas imageSmoothingQuality
 *    "high"). El quad y el OCR consumen el master ya enderezado (el runner
 *    alimenta al bridge con el archivo transformado — bridge INTACTO).
 *  · T3 limpieza suave de blanco — solo escaneo y histograma SIN blanco
 *    puro (percentil 99.5 < BLANCO_PURO_MIN): normalización lineal del
 *    punto blanco por canal, ganancia tope GAIN_MAX. PROHIBIDO tocar
 *    sombras oscuras (no hay binarización, no hay contraste agresivo —
 *    solo devolver el blanco).
 *  · T4 nada más — sin score, sin reintentos, sin veredictos. Si el
 *    escaneo sigue débil → se rechaza como siempre (honestidad).
 *
 *  Partes PURAS (sin DOM — overnight 3B-B2a: dejaron de ser export, su
 *  único consumidor es preProcesoEscaneo en este mismo módulo). Partes DOM
 *  (decode/rotación/encode): solo corren en el navegador — el humo de bun
 *  cubre la matemática; el desenlace real lo valida el dueño con sus
 *  escaneos. */

import type { OrigenActa } from "./origen";
import { canvasCon, decodeImagenLruDeBlob } from "../image-utils"; // SPRINT-A A1/A3 — decode-once LRU + factory de canvas

// ---------- Constantes (nombradas y comentadas — kit §2) ----------

/** Fuera de ±10° NO es skew (captura torcida) — no se corrige aquí (kit T1). */
const SKEW_MAX_GRADOS = 10;

/** Menor a 0.3° el deskew no paga su costo (kit T2: umbral de aplicación). */
const SKEW_MIN_GRADOS = 0.3;

/** Búsqueda del ángulo grueso-fina (kit T1: pasos de 0.1° dentro de ±10° —
 *  el barrido fino 0.1° corre en la ventana ganadora del barrido grueso). */
const PASO_GRUESO_GRADOS = 0.5;
const PASO_FINO_GRADOS = 0.1;

/** La banda del encabezado del acta: top 30% del bitmap (kit T1 — la página
 *  completa es costo y las líneas del encabezado mandan el ángulo). */
const BANDA_CABECERA_FRACCION = 0.3;

/** Tinta = luminancia BT.601 por debajo de este umbral (píxel de texto/línea). */
const UMBRAL_TINTA = 128;

/** Con menos tinta que esto en la banda no hay perfil confiable → null. */
const TINTA_MIN_PIXELES = 200;

/** Ancho del bitmap de ANÁLISIS (decode del master aparte — el master real
 *  NUNCA se reescala; «la escala del master» está fuera de zona). */
const ANALISIS_ANCHO = 512;

/** Blanco puro: el percentil 99.5 de luma debe alcanzar este valor; si no,
 *  el fondo es grisáceo de scanner → limpieza (kit T3). */
const BLANCO_PURO_MIN = 245;

/** Percentil que define el punto blanco del histograma (robusto a tinta). */
const PERCENTIL_BLANCO = 0.995;

/** Ganancia máxima de la normalización — un scan MUY oscuro no se fuerza
 *  (kit T3: prohibido el contraste agresivo; solo devolver el blanco). */
const GAIN_MAX = 1.25;

/** Calidad del re-encode del master transformado (misma q del pipeline PDF
 *  D60 — el archivo solo cambia cuando algo se corrigió). */
const CALIDAD_SALIDA = 0.92;

/** Resultado del pre-proceso. `archivo` es EL MISMO File recibido cuando
 *  nada aplicó (identidad byte-idéntica — memo de decode del pipeline
 *  intacta, AC de fotos/rectos); un File JPEG nuevo cuando se corrigió. */
export interface PreProcesoEscaneo {
  archivo: File;
  aplicado: boolean;
  skewGrados: number | null;
  deskewMs: number | null;
  limpiezaMs: number | null;
  limpieza: "blanco" | "no";
  /** Decode del master + análisis (fuera de los tiempos del bridge). */
  decodeMs: number | null;
  /** deskewMs + limpiezaMs (presupuesto del kit §3.3: ≤ 1 s). */
  totalMs: number;
}

// ---------- Partes PURAS (sin DOM — internas del módulo) ----------

/** T1 — ángulo de skew por varianza del perfil de proyección horizontal de
 *  la banda del encabezado (kit T1). Para cada θ, los píxeles de tinta se
 *  acumulan en filas desplazadas y' = y − x·tan(θ); el θ cuyo perfil tiene
 *  los picos más altos (Σ bin² mayor = líneas alineadas) es el skew con
 *  signo. Convenio: rotar el master por −skewGrados lo endereza.
 *  Devuelve el ángulo dentro de ±SKEW_MAX_GRADOS (con signo, 1 decimal) o
 *  null (banda sin tinta suficiente / bitmap vacío). */
function detectarSkew(
  ancho: number,
  alto: number,
  rgba: Uint8ClampedArray,
  bandaFraccion = BANDA_CABECERA_FRACCION,
): number | null {
  if (ancho <= 0 || alto <= 0 || rgba.length < ancho * alto * 4) return null;
  const altoBanda = Math.max(4, Math.round(alto * bandaFraccion));
  // Máscara de tinta de la banda (coordenadas x,y de cada píxel oscuro).
  const tintas: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < altoBanda; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const L = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (L < UMBRAL_TINTA) tintas.push({ x, y });
    }
  }
  if (tintas.length < TINTA_MIN_PIXELES) return null; // duda honesta
  const tanMax = Math.tan((SKEW_MAX_GRADOS * Math.PI) / 180);
  const filas = altoBanda + Math.ceil(ancho * tanMax) + 2;
  /** Σ bin² del perfil desplazado por θ (líneas alineadas → picos altos). */
  const score = (grados: number): number => {
    const tan = Math.tan((grados * Math.PI) / 180);
    const bins = new Float64Array(filas);
    for (const t of tintas) {
      const yp = Math.round(t.y - t.x * tan) + Math.ceil(ancho * Math.abs(tan));
      if (yp >= 0 && yp < filas) bins[yp] += 1;
    }
    let s = 0;
    for (const v of bins) s += v * v;
    return s;
  };
  // Grueso: ±10° paso 0.5° → Fino: ventana ganadora paso 0.1° (kit T1).
  let mejor = 0;
  let mejorScore = -1;
  for (let g = -SKEW_MAX_GRADOS; g <= SKEW_MAX_GRADOS + 1e-9; g += PASO_GRUESO_GRADOS) {
    const s = score(g);
    if (s > mejorScore) {
      mejorScore = s;
      mejor = g;
    }
  }
  // Kit T1: «fuera de ese rango NO es skew, es captura torcida» — si el mejor
  // del barrido pegó en el BORDE del dominio, el ángulo real queda fuera y
  // NO se corrige aquí (la tratará el quad/gate de D63-C).
  if (Math.abs(mejor) >= SKEW_MAX_GRADOS) return null;
  let finura = mejor;
  let finuraScore = mejorScore;
  const desde = Math.max(-SKEW_MAX_GRADOS, mejor - PASO_GRUESO_GRADOS);
  const hasta = Math.min(SKEW_MAX_GRADOS, mejor + PASO_GRUESO_GRADOS);
  for (let g = desde; g <= hasta + 1e-9; g += PASO_FINO_GRADOS) {
    const s = score(g);
    if (s > finuraScore) {
      finuraScore = s;
      finura = g;
    }
  }
  const redondeado = Math.round(finura * 10) / 10;
  if (Math.abs(redondeado) > SKEW_MAX_GRADOS) return null;
  return redondeado;
}

/** T3 — punto blanco del histograma por canal (percentil PERCENTIL_BLANCO).
 *  El histograma se toma del bitmap de ANÁLISIS (mismo contenido, costo bajo). */
function puntoBlanco(rgba: Uint8ClampedArray): { r: number; g: number; b: number } {
  const hists = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    hists[0][rgba[i]]++;
    hists[1][rgba[i + 1]]++;
    hists[2][rgba[i + 2]]++;
    n++;
  }
  const umbral = Math.max(1, Math.floor(n * (1 - PERCENTIL_BLANCO)));
  const percentil = (h: Uint32Array): number => {
    let acc = 0;
    for (let v = 255; v >= 0; v--) {
      acc += h[v];
      if (acc >= umbral) return v;
    }
    return 255;
  };
  return { r: percentil(hists[0]), g: percentil(hists[1]), b: percentil(hists[2]) };
}

/** T3 — normalización lineal del punto blanco POR CANAL (in-place): escala
 *  cada canal para que su punto blanco llegue a 255. PROHIBIDO tocar las
 *  sombras: la ganancia está TOPEADA a GAIN_MAX y es una sola multiplicación
 *  lineal (sin binarización, sin curvas, sin contraste agresivo — kit T3.2).
 *  Devuelve la ganancia aplicada (máx de los canales, para la traza). */
function normalizarPuntoBlanco(rgba: Uint8ClampedArray, wp: { r: number; g: number; b: number }): number {
  const gain = (v: number) => (v > 0 ? Math.min(GAIN_MAX, 255 / v) : 1);
  const gr = gain(wp.r);
  const gg = gain(wp.g);
  const gb = gain(wp.b);
  if (gr === 1 && gg === 1 && gb === 1) return 1;
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = Math.min(255, rgba[i] * gr);
    rgba[i + 1] = Math.min(255, rgba[i + 1] * gg);
    rgba[i + 2] = Math.min(255, rgba[i + 2] * gb);
  }
  return Math.max(gr, gg, gb);
}

// ---------- Parte DOM (solo navegador — decode/rotación/encode) ----------

/** Decode del master a escala real (createImageBitmap). null si falla
 *  (formato raro — el pre-proceso jamás tumba el pipeline).
 *  SPRINT-A (perf/decode-once-v1) A1: el decode pega al LRU COMPARTIDO del
 *  pipeline (`decodeImagenLruDeBlob`) — antes era un createImageBitmap
 *  privado a escala real. El File del intento ya fue decodificado por
 *  clasificarOrigen (mismo blob, MISMO object URL) → HIT sin re-decode;
 *  el <img> del LRU se dibuja 1:1 al canvas del master (blit, mismo
 *  resultado) y la RAM queda acotada por la eviction del LRU (tope 2). */
async function decodeMaster(archivo: Blob): Promise<{ canvas: HTMLCanvasElement; decodeMs: number } | null> {
  const t0 = Date.now();
  try {
    const fuente = await decodeImagenLruDeBlob(archivo);
    const img = fuente as HTMLImageElement;
    const canvas = canvasCon(img.naturalWidth, img.naturalHeight); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(img, 0, 0);
    return { canvas, decodeMs: Date.now() - t0 };
  } catch {
    return null;
  }
}

/** Copia de ANÁLISIS a ANALISIS_ANCHO de ancho (alto proporcional) para el
 *  ángulo y el histograma — el master real queda intacto. */
function bitmapDeAnalisis(canvas: HTMLCanvasElement): { ancho: number; alto: number; rgba: Uint8ClampedArray } | null {
  try {
    const escala = Math.min(1, ANALISIS_ANCHO / canvas.width);
    const w = Math.max(1, Math.round(canvas.width * escala));
    const h = Math.max(1, Math.round(canvas.height * escala));
    const c = canvasCon(w, h); // SPRINT-A A3 — factory
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, w, h);
    return { ancho: w, alto: h, rgba: ctx.getImageData(0, 0, w, h).data };
  } catch {
    return null;
  }
}

/** Rotación del master por −grados (resample de alta calidad — kit T2.1).
 *  El lienzo se expande para no cortar esquinas. */
function rotarCanvas(canvas: HTMLCanvasElement, grados: number): HTMLCanvasElement {
  const rad = (grados * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w2 = Math.ceil(canvas.width * cos + canvas.height * sin);
  const h2 = Math.ceil(canvas.width * sin + canvas.height * cos);
  const salida = canvasCon(w2, h2); // SPRINT-A A3 — factory
  const ctx = salida.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas; // sin ctx → sin rotación (honesto)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(w2 / 2, h2 / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return salida;
}

/** Re-encode del master corregido a JPEG q CALIDAD_SALIDA. */
async function canvasAJpeg(canvas: HTMLCanvasElement, nombre: string): Promise<File | null> {
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD_SALIDA));
    if (!blob) return null;
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return null;
  }
}

/** Punto ÚNICO que llama el runner (kit §1: el bloque de pre-proceso, antes
 *  del pipeline). Solo escaneos; fotos/null pasan byte-idénticos. Cualquier
 *  fallo → el archivo ORIGINAL sin tocar (trazas null — honestidad). */
export async function preProcesoEscaneo(archivo: File, origen: OrigenActa): Promise<PreProcesoEscaneo> {
  const nulo: PreProcesoEscaneo = {
    archivo,
    aplicado: false,
    skewGrados: null,
    deskewMs: null,
    limpiezaMs: null,
    limpieza: "no",
    decodeMs: null,
    totalMs: 0,
  };
  // Kit T2.1/T3.1: SOLO escaneos (las fotos JAMÁS — su corrección es el quad).
  if (origen !== "escaneo") return nulo;
  try {
    const master = await decodeMaster(archivo);
    if (!master) return nulo;
    const analisis = bitmapDeAnalisis(master.canvas);
    if (!analisis) return nulo;
    // T1 — ángulo (banda del encabezado, búsqueda 0.5°→0.1°).
    const tDeskew0 = Date.now();
    const skew = detectarSkew(analisis.ancho, analisis.alto, analisis.rgba);
    const hayQueRotar =
      skew != null && Math.abs(skew) >= SKEW_MIN_GRADOS && Math.abs(skew) <= SKEW_MAX_GRADOS;
    // T3 — histograma del bitmap de análisis (mismo contenido, costo bajo).
    const tLimpieza0 = Date.now();
    const wp = puntoBlanco(analisis.rgba);
    const necesitaLimpieza = Math.min(wp.r, wp.g, wp.b) < BLANCO_PURO_MIN;
    if (!hayQueRotar && !necesitaLimpieza) {
      // Recto y limpio → el archivo ORIGINAL (identidad + memo intactas).
      return {
        ...nulo,
        skewGrados: skew,
        limpieza: "no",
        decodeMs: master.decodeMs,
      };
    }
    let canvas = master.canvas;
    if (hayQueRotar && skew != null) canvas = rotarCanvas(canvas, -skew);
    let limpiezaMs: number | null = null;
    if (necesitaLimpieza) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        normalizarPuntoBlanco(img.data, wp);
        ctx.putImageData(img, 0, 0);
        limpiezaMs = Date.now() - tLimpieza0;
      }
    }
    const nombre = archivo.name;
    const salida = await canvasAJpeg(canvas, nombre);
    if (!salida) return { ...nulo, skewGrados: skew, limpieza: necesitaLimpieza ? "blanco" : "no" };
    return {
      archivo: salida,
      aplicado: true,
      skewGrados: skew,
      deskewMs: hayQueRotar ? Date.now() - tDeskew0 : null,
      limpiezaMs,
      limpieza: necesitaLimpieza ? "blanco" : "no",
      decodeMs: master.decodeMs,
      totalMs: (hayQueRotar ? Date.now() - tDeskew0 : 0) + (limpiezaMs ?? 0),
    };
  } catch {
    return nulo; // el pre-proceso jamás tumba el pipeline (honestidad)
  }
}
