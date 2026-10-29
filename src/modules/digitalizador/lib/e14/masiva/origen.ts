/** KIT e63a-origen-escaneo-v1 (D63-A): detector heurístico del ORIGEN del
 *  archivo MASIVA — «escaneo» (scanner/PDF de página plana) vs «foto»
 *  (cámara). Evidencia: informe prod 20261020-122235 — las 8 páginas de PDF
 *  escaneadas cayeron 4× BAJO 4.9 / 2× INCOMPLETA / 1× ADVERTENCIA con quad
 *  sobel en 3/8: el pipeline está afinado para FOTOS y no había forma de
 *  SABER cuál archivo era cuál. Este módulo SOLO INSTRUMENTA (kit §0):
 *  alimenta las trazas (T2) y el informe (T3) para calibrar D63-B (deskew)
 *  y D63-C (quad/gate de escaneo). JAMÁS decide score/gate/veredictos.
 *
 *  Señales (kit T1 — conservador):
 *  1. EXIF de cámara (Make/Model/DateTimeOriginal — los escaneos no traen).
 *     Contenedor HEIC/HEIF (ftyp) → señal de cámara: un escaneo jamás llega
 *     en HEIC (es formato de cámara Apple; el pipeline lo convierte antes).
 *  2. Bordes de página blancos y uniformes: franja periférica del bitmap con
 *     luminosidad alta y varianza baja (una foto nunca tiene marco blanco
 *     limpio).
 *  3. Ratio de hoja compatible con carta/A4/oficio (±tolerancia generosa).
 *
 *  Regla de decisión (kit T1 + e63d F1.2): «escaneo» si sin-EXIF Y
 *  tinta-al-filo simétrica (ceñido) O borde-blanco con forma de hoja
 *  (clásica O alargada E-14) O forma E-14 sin borde blanco; «foto» si EXIF
 *  de cámara; null en cualquier duda (forma de foto estándar sin blanco ni
 *  tinta al filo, pantalla absurda, sin bitmap). El guard clásico
 *  (borde-blanco con forma absurda) sigue en null, no en escaneo.
 *  Fallar (decode sin canvas, bytes raros, excepción) → null — el detector
 *  JAMÁS tumba el pipeline (misma filosofía del thumb cosmético). */

/** Origen del archivo. null = sin veredicto (duda honesta — jamás inventar). */
export type OrigenActa = "escaneo" | "foto" | null;

import { canvasCon, decodeImagenLruDeBlob } from "../image-utils"; // SPRINT-A A1/A3 — decode-once LRU + factory de canvas

/** Veredicto del detector + señales auditables (traza de POR QUÉ decidió). */
export interface OrigenVeredicto {
  origen: OrigenActa;
  senales: string | null;
}

/** Bitmap pequeño (decodificado a BITMAP_LADO de ancho) para el análisis de
 *  bordes. Solo lo que el detector necesita: dimensiones + RGBA. */
export interface OrigenBitmap {
  ancho: number;
  alto: number;
  rgba: Uint8ClampedArray;
}

// ---------- Constantes de umbral (nombradas y comentadas — kit T1) ----------

/** El EXIF vive al inicio del archivo — leer este prefijo alcanza de sobra. */
const EXIF_SLICE_BYTES = 262_144;

/** Ancho del bitmap de análisis (decode barato; el alto sale proporcional).
 *  El master real NUNCA pasa por aquí (solo lectura de píxeles pequeña). */
const BITMAP_LADO = 256;

/** Grosor de la franja periférica analizada (fracción del lado menor). */
const BORDE_FRACCION = 0.06;

/** Bordes blancos: luminosidad media de la franja ≥ este valor (BT.601). */
const BLANCO_MEDIA_MIN = 235;

/** …y uniformes: desviación estándar de la franja ≤ este valor (varianza
 *  baja — un scanner deja el margen parejo; una foto, textura y ruido). */
const BLANCO_DESV_MAX = 14;

/** Ratio de hoja plausible: carta 0.773 · A4 0.707 · oficio 0.607 (portrait
 *  o landscape — se mide min/max para aceptar ambos). Tolerancia generosa. */
const RATIO_HOJA_MIN = 0.58;
const RATIO_HOJA_MAX = 0.87;

/** KIT e63d-escaneo-ya-recortado-v1 (F1): banda del E-14 REAL — el formulario
 *  es alargado (ratio ≈ 0.31: actas impresas de sangre, no carta). HOY cae
 *  fuera del guard (0.58–0.87) → los escaneos del E-14 caen null aunque
 *  traigan borde-blanco, y sin borde-blanco ni se consideran. La relajación
 *  del guard es SOLO para la forma del E-14 (calibración declarada en el
 *  REPORTE): la banda clásica SIN borde-blanco NO se relaja — una imagen
 *  sin-EXIF con forma de foto estándar (WhatsApp 4:3/16:9) sigue en null
 *  honesto (pipeline foto, desenlaces intactos — invariancia de la Fase E). */
const RATIO_E14_MIN = 0.22;
const RATIO_E14_MAX = 0.45;

/** (F1.1) Grosor de la franja de FILO analizada por lado (~1.5% del lado
 *  menor): el contenido pegado al filo de un escaneo ceñido vive ahí. */
const FILO_FRACCION = 0.015;

/** (F1.1) Tinta = luminancia BT.601 por debajo de este umbral (mismo
 *  criterio que UMBRAL_TINTA_MARCO de marco-escaneo.ts — trazo impreso). */
const UMBRAL_TINTA_FILO = 150;

/** (F1.1) Fracción mínima de tinta de un lado del filo para contar como
 *  «contenido al filo» (≥25%: texto/marco cortado — un filo con polvo o
 *  sombra tenue no alcanza). */
const FILO_TINTA_MIN = 0.25;

/** (F1.1 — calibración declarada en el REPORTE) El lado del filo cuenta SOLO
 *  si es MIXTO: tinta ≥25% Y papel claro ≥10%. La firma del plan es
 *  «contenido pegado al filo» = trazo impreso CORTADO sobre papel (mezcla
 *  tinta+papel). Un fondo oscuro UNIFORME (mesa/sombra incluida en la foto)
 *  no tiene papel en la franja → NO cuenta (protege las fotos sin-EXIF con
 *  fondo oscuro — la banda clásica queda null como hoy). */
const FILO_CLARO_MIN = 0.1;

/** Papel = luminancia ≥ este valor (blanco del papel impreso). */
const UMBRAL_CLARO_FILO = 200;

/** Luminancia BT.601 de un píxel RGBA (el orden del canal es fijo en ImageData). */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Señal de EXIF de cámara sobre el prefijo del archivo (kit T1.1).
 *  - JPEG: camina los segmentos hasta SOS; en APP1 "Exif\0\0" parsea el TIFF
 *    y busca Make (0x010F) / Model (0x0110) / DateTimeOriginal (0x9003 vía
 *    ExifIFD 0x8769). La sola Orientation NO cuenta (los escaneos también la
 *    pueden traer) — solo las tres etiquetas de cámara mandan.
 *  - Contenedor HEIC/HEIF (ftyp): señal "heic" — formato de cámara Apple,
 *    jamás de scanner (conservador a favor de «foto»: peor caso marca foto
 *    una foto, nunca marca escaneo un error).
 *  - Cualquier otra cosa (PNG, WEBP, bytes raros) → null (el bitmap decide). */
export function senalExifCamara(bytes: Uint8Array): "exif-camara" | "heic" | null {
  try {
    // ftyp (ISO-BMFF): "ftyp" en bytes 4..7, brand en 8..11.
    if (
      bytes.length > 12 &&
      bytes[4] === 0x66 && // f
      bytes[5] === 0x74 && // t
      bytes[6] === 0x79 && // y
      bytes[7] === 0x70 //    p
    ) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      const esHeif =
        brand.startsWith("heic") ||
        brand.startsWith("heix") ||
        brand.startsWith("hevc") ||
        brand.startsWith("heim") ||
        brand.startsWith("heis") ||
        brand.startsWith("mif1") ||
        brand.startsWith("msf1");
      return esHeif ? "heic" : null;
    }
    // JPEG: SOI + caminata de segmentos.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xff) break;
      const marker = bytes[off + 1];
      // Markers sin longitud (SOI/RSTn/TEM).
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      if (marker === 0xda) break; // SOS: fin de los metadatos previos
      const len = (bytes[off + 2] << 8) | bytes[off + 3];
      if (len < 2) break;
      if (
        marker === 0xe1 &&
        off + 10 <= bytes.length &&
        bytes[off + 4] === 0x45 && // E
        bytes[off + 5] === 0x78 && // x
        bytes[off + 6] === 0x69 && // i
        bytes[off + 7] === 0x66 && // f
        bytes[off + 8] === 0x00 &&
        bytes[off + 9] === 0x00
      ) {
        const tiff = bytes.subarray(off + 10, Math.min(off + 2 + len, bytes.length));
        return tiffTieneCamara(tiff) ? "exif-camara" : null;
      }
      off += 2 + len;
    }
    return null;
  } catch {
    return null; // bytes raros → sin señal (duda honesta)
  }
}

/** ¿El TIFF del APP1 trae etiquetas de cámara? (Make/Model/DateTimeOriginal). */
function tiffTieneCamara(tiff: Uint8Array): boolean {
  if (tiff.length < 8) return false;
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49; // "II" — sino "MM"
  const u16 = (o: number) => (littleEndian ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]);
  const u32 = (o: number) =>
    littleEndian
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;
  if (u16(2) !== 42) return false; // magic TIFF
  const hayEtiqueta = (ifdOff: number, tags: number[]): boolean => {
    if (ifdOff <= 0 || ifdOff + 2 > tiff.length) return false;
    const n = u16(ifdOff);
    for (let i = 0; i < n; i++) {
      const e = ifdOff + 2 + i * 12;
      if (e + 12 > tiff.length) return false;
      const tag = u16(e);
      if (tags.includes(tag)) {
        // ASCII/corto con valor presente — cuenta aunque el parser no lo lea.
        const conteo = u32(e + 4);
        if (conteo > 0) return true;
      }
    }
    return false;
  };
  const ifd0 = u32(4);
  // Make / Model viven en IFD0; DateTimeOriginal en el ExifIFD (0x8769).
  if (hayEtiqueta(ifd0, [0x010f, 0x0110])) return true;
  if (ifd0 + 2 <= tiff.length) {
    const n = u16(ifd0);
    for (let i = 0; i < n; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > tiff.length) return false;
      if (u16(e) === 0x8769) {
        const exifIfd = u32(e + 8);
        return hayEtiqueta(exifIfd, [0x9003]); // DateTimeOriginal
      }
    }
  }
  return false;
}

/** Análisis de la franja periférica (kit T1.2): media y desviación estándar
 *  de la luminancia del borde del bitmap. */
function lumaBordes(b: OrigenBitmap): { media: number; desv: number } {
  const t = Math.max(2, Math.round(Math.min(b.ancho, b.alto) * BORDE_FRACCION));
  let suma = 0;
  let suma2 = 0;
  let n = 0;
  for (let y = 0; y < b.alto; y++) {
    for (let x = 0; x < b.ancho; x++) {
      const enBorde = x < t || x >= b.ancho - t || y < t || y >= b.alto - t;
      if (!enBorde) continue;
      const i = (y * b.ancho + x) * 4;
      const L = luma(b.rgba[i], b.rgba[i + 1], b.rgba[i + 2]);
      suma += L;
      suma2 += L * L;
      n++;
    }
  }
  if (n === 0) return { media: 0, desv: 0 };
  const media = suma / n;
  const desv = Math.sqrt(Math.max(0, suma2 / n - media * media));
  return { media, desv };
}

/** KIT e63d (F1.1) — señal PURA de ESCANEO CEÑIDO: fracción de tinta en la
 *  franja exterior ~1.5% por lado; ≥2 lados OPUESTOS con tinta ≥25% →
 *  «contenido pegado al filo de forma simétrica» = firma de escaneo ceñido
 *  (la hoja ES el borde de la imagen). Una FOTO de papel sobre mesa casi
 *  nunca tiene tinta al filo en dos lados opuestos (el papel flota sobre el
 *  fondo); una captura de pantalla plana SÍ puede — y le conviene el camino
 *  escaneo (página plana, identidad, sin guard de fotos). Lados contados:
 *  top/bottom/left/right de la franja exterior de FILO_FRACCION. */
export function tintaAlFiloSimetrica(b: OrigenBitmap): boolean {
  const t = Math.max(1, Math.round(Math.min(b.ancho, b.alto) * FILO_FRACCION));
  const tintaLado = (esFila: boolean, principal: number, desde: number, hasta: number): number => {
    const total = esFila ? b.ancho : b.alto;
    let oscuros = 0;
    let n = 0;
    for (let i = desde; i < hasta; i++) {
      const px = esFila ? (principal * b.ancho + i) * 4 : (i * b.ancho + principal) * 4;
      const L = luma(b.rgba[px], b.rgba[px + 1], b.rgba[px + 2]);
      if (L < UMBRAL_TINTA_FILO) oscuros++;
      n++;
    }
    return n === 0 ? 0 : oscuros / total;
  };
  // Fracción de tinta por lado: máximo de las filas/columnas de la franja
  // de cada lado (una sola línea de marco cortada basta — el contenido NO
  // necesita llenar todo el grosor de la franja).
  const maxFranja = (
    esFila: boolean,
    principalDesde: number,
    principalHasta: number,
    desde: number,
    hasta: number,
  ): number => {
    let max = 0;
    for (let p = principalDesde; p < principalHasta; p++) {
      const f = tintaLado(esFila, p, desde, hasta);
      if (f > max) max = f;
    }
    return max;
  };
  const top = maxFranja(true, 0, t, 0, b.ancho);
  const bottom = maxFranja(true, b.alto - t, b.alto, 0, b.ancho);
  const left = maxFranja(false, 0, t, 0, b.alto);
  const right = maxFranja(false, b.ancho - t, b.ancho, 0, b.alto);
  // Fracción de PAPEL (claro) de la franja de cada lado — el lado MIXTO
  // (tinta sobre papel) es contenido cortado; el uniforme oscuro es fondo.
  const claroFranja = (
    esFila: boolean,
    principalDesde: number,
    principalHasta: number,
    desde: number,
    hasta: number,
  ): number => {
    let claros = 0;
    let n = 0;
    for (let p = principalDesde; p < principalHasta; p++) {
      for (let i = desde; i < hasta; i++) {
        const px = esFila ? (p * b.ancho + i) * 4 : (i * b.ancho + p) * 4;
        const L = luma(b.rgba[px], b.rgba[px + 1], b.rgba[px + 2]);
        if (L >= UMBRAL_CLARO_FILO) claros++;
        n++;
      }
    }
    return n === 0 ? 0 : claros / n;
  };
  const topClaro = claroFranja(true, 0, t, 0, b.ancho);
  const bottomClaro = claroFranja(true, b.alto - t, b.alto, 0, b.ancho);
  const leftClaro = claroFranja(false, 0, t, 0, b.alto);
  const rightClaro = claroFranja(false, b.ancho - t, b.ancho, 0, b.alto);
  const alFilo = (tinta: number, claro: number): boolean =>
    tinta >= FILO_TINTA_MIN && claro >= FILO_CLARO_MIN;
  const vertical = alFilo(top, topClaro) && alFilo(bottom, bottomClaro);
  const horizontal = alFilo(left, leftClaro) && alFilo(right, rightClaro);
  return vertical || horizontal;
}

/** Decisión (kit T1 + KIT e63d F1.2) — SOLO de señales, jamás de score/gate:
 *  «foto» si EXIF de cámara · «escaneo» si sin-EXIF Y cualquiera de:
 *  (1) tinta-al-filo simétrica (escaneo CEÑIDO — firma del plan),
 *  (2) borde-blanco + forma de hoja (clásico — ahora también la forma
 *      alargada del E-14, antes condenada por ratio-fuera),
 *  (3) forma alargada E-14 sin borde blanco (relajación del guard — el
 *      escáner cortó ceñido con margen no-blanco; SOLO banda E-14: la banda
 *      clásica sin blanco sigue null para no tocar WhatsApp sin-EXIF).
 *  · null en cualquier duda (sin bitmap, forma de foto estándar sin blanco
 *    ni tinta-al-filo, borde blanco con forma absurda). */
export function clasificarOrigen(
  bitmap: OrigenBitmap | null,
  exifSenal: "exif-camara" | "heic" | null,
): OrigenVeredicto {
  if (exifSenal != null) return { origen: "foto", senales: exifSenal };
  if (bitmap == null) return { origen: null, senales: "sin-exif+sin-bitmap" };
  const { media, desv } = lumaBordes(bitmap);
  const blanco = media >= BLANCO_MEDIA_MIN && desv <= BLANCO_DESV_MAX;
  const ratio = Math.min(bitmap.ancho, bitmap.alto) / Math.max(bitmap.ancho, bitmap.alto);
  const ratioClasico = ratio >= RATIO_HOJA_MIN && ratio <= RATIO_HOJA_MAX;
  const ratioE14 = ratio >= RATIO_E14_MIN && ratio <= RATIO_E14_MAX;
  const senalRatio = ratioClasico ? "ratio-hoja" : ratioE14 ? "ratio-e14" : "ratio-fuera";
  // (1) CEÑIDO — la firma del plan: contenido al filo en ≥2 lados opuestos.
  if (tintaAlFiloSimetrica(bitmap)) {
    return { origen: "escaneo", senales: `sin-exif+tinta-al-filo+${senalRatio}` };
  }
  // (2) CLÁSICO — borde blanco uniforme + forma de hoja (carta/A4/oficio O
  // forma alargada del E-14: un escaneo CON márgenes ya no cae por ratio).
  if (blanco && (ratioClasico || ratioE14)) {
    return { origen: "escaneo", senales: `sin-exif+borde-blanco+${senalRatio}` };
  }
  // (3) RELAJACIÓN E-14 — forma alargada sin borde blanco (el escáner cortó
  // ceñido y la franja no pasó el test de blanco uniforme).
  if (ratioE14) {
    return { origen: "escaneo", senales: `sin-exif+${senalRatio}` };
  }
  if (blanco) return { origen: null, senales: `sin-exif+borde-blanco+${senalRatio}` };
  return { origen: null, senales: `sin-exif+borde-no-blanco+${senalRatio}` };
}

/** Bitmap de análisis: decode directo del navegador a BITMAP_LADO de ancho
 *  (createImageBitmap reescala en el mismo decode — el alto sale
 *  proporcional). Cualquier fallo (HEIC sin conversión, canvas caído) → null
 *  — el detector es cosmético, jamás tumba el desenlace.
 *  SPRINT-A (perf/decode-once-v1) A1: el decode pega al LRU COMPARTIDO del
 *  pipeline (`decodeImagenLruDeBlob`) — antes era un createImageBitmap
 *  privado {resizeWidth: BITMAP_LADO}. Geometría replicada: ancho EXACTO
 *  BITMAP_LADO (resizeWidth no clampea — también upscale), alto proporcional;
 *  el reescalado ocurre ahora en el drawImage con el suavizado default del
 *  navegador (mismo que usaba el bitmap nativo por defecto). El análisis es
 *  cosmético (D63-A: jamás tumba el pipeline) y el decode full-res se
 *  comparte con preProceso/maestro del MISMO File. */
async function bitmapDeArchivo(archivo: Blob): Promise<OrigenBitmap | null> {
  try {
    const fuente = await decodeImagenLruDeBlob(archivo);
    const img = fuente as HTMLImageElement;
    const canvas = canvasCon(
      BITMAP_LADO,
      Math.max(1, Math.round((img.naturalHeight * BITMAP_LADO) / (img.naturalWidth || 1))),
    ); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const captura = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { ancho: canvas.width, alto: canvas.height, rgba: captura.data };
  } catch {
    return null;
  }
}

/** Punto ÚNICO que llama el runner (kit §1: una vez por fila, al inicio del
 *  pipeline). EXIF primero (si es de cámara no hace falta decode); el
 *  análisis de bordes solo corre cuando la duda existe. TODO guardado: el
 *  peor desenlace posible es un origen null (duda honesta). */
export async function clasificarOrigenDeArchivo(archivo: Blob): Promise<OrigenVeredicto> {
  try {
    const bytes = new Uint8Array(await archivo.slice(0, EXIF_SLICE_BYTES).arrayBuffer());
    const exif = senalExifCamara(bytes);
    if (exif != null) return clasificarOrigen(null, exif);
    const bitmap = await bitmapDeArchivo(archivo);
    return clasificarOrigen(bitmap, null);
  } catch {
    return { origen: null, senales: null };
  }
}
