/**
 * KIT e14-masiva-tiempos-v1 (PR-1, T-dedup): dedup por hash perceptual —
 * dhash 64-bit. D65 — KIT e14-progreso-watchdog-dedup-v1 (T2): DEDUP v2
 * POR CONTENIDO con orientación EXIF NORMALIZADA.
 *
 * Por qué v2 (evidencia del kit, informe 20261020-122235): los gemelos
 * heic/jpg de la misma foto NO matcheaban — hipótesis con evidencia
 * indirecta: el dhash v1 se calculaba sobre bitmaps con orientación EXIF
 * distinta entre el decode HEIC (core) y el JPG (vía thumb/<img>). Cada
 * par gemelo reprocesado costaba ~80 s dobles — y 3 gemelos se COLGARON
 * (175 s c/u). T2.1: normalizar la orientación del bitmap ANTES del hash
 * con el mecanismo del kit — createImageBitmap(..., { imageOrientation:
 * "from-image" }) — para que ambas fuentes produzcan el bitmap canónico.
 *
 * Prohibido (kit T2.4) deduplicar por nombre de archivo o fecha — SOLO
 * contenido (el dhash). Conservador: cualquier fallo (decode, hash) →
 * null → la fila NUNCA se marca (procesa normal — jamás inventar).
 */
import { fileToCaptureDataUrl } from "@jg-stevan/scanner-core/image-processor";
import { canvasCon } from "../image-utils"; // SPRINT-A A3 — factory de canvas

/** D65 (T2.2) — umbral del kit, documentado: DEDUP_HAMMING_MAX = 6 (de 64
 *  bits). Distancia ≤ umbral → reutilizarResultado EXACTAMENTE como hoy
 *  (sin auto-procesar, D45 intacto). Distancia mayor → se procesa normal,
 *  JAMÁS forzar match. Gemelas reales caen 0-2; fotos distintas >12.
 *  (Antes HAMMING_MAX — mismo valor, nombre literal del kit.) */
export const DEDUP_HAMMING_MAX = 6;

/** Fuente del dhash: un bitmap ya decodificado y REORIENTADO (ImageBitmap)
 *  o el <img> del fallback (navegadores sin createImageBitmap+opciones). */
type FuenteBitmap = ImageBitmap | HTMLImageElement;

/**
 * D65 (T2.1) — decode con orientación EXIF NORMALIZADA: el mecanismo del
 * kit, createImageBitmap(..., { imageOrientation: "from-image" }). Ambas
 * fuentes (JPG/PNG/WebP/página-PDF directo del File; HEIC vía la conversión
 * del core) deben producir el bitmap reorientado. Fallback <img> vía object
 * URL (los navegadores modernos ya aplican EXIF al <img>).
 */
async function bitmapNormalizado(fuente: Blob): Promise<FuenteBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(fuente, { imageOrientation: "from-image" });
    } catch {
      /* formato no decodable nativo → cae al <img> (comportamiento de v1) */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fuente);
    img.onload = () => {
      URL.revokeObjectURL(url); // ya decodificado — revocar es seguro
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("DHASH_NO_DECODE"));
    };
    img.src = url;
  });
}

/**
 * dhash 64-bit clásico (horizontal gradient) desde el BITMAP NORMALIZADO:
 * canvas 9×8 en grises → bit=1 cuando gray[x] > gray[x+1] → 8 bits × 8 filas
 * = 64 bits → hex 16. La escala del master es irrelevante (el drawImage a
 * 9×8 la absorbe). Cierra el ImageBitmap al salir (RAM — un bitmap de 12 MP
 * son ~48 MB). Cualquier fallo → null (jamás tumba el encolado).
 */
function dhashDeBitmap(fuente: FuenteBitmap): string | null {
  try {
    const W = 9;
    const H = 8;
    const canvas = canvasCon(W, H); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(fuente as CanvasImageSource, 0, 0, W, H);
    if (typeof ImageBitmap !== "undefined" && fuente instanceof ImageBitmap) {
      fuente.close(); // D65 — RAM: el bitmap normalizado ya no hace falta
    }
    const { data } = ctx.getImageData(0, 0, W, H);
    // Grises fila por fila (RGBA).
    const gris: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        gris[y * W + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
    }
    let hex = "";
    for (let y = 0; y < H; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        byte = (byte << 1) | (gris[y * W + x] > gris[y * W + x + 1] ? 1 : 0);
      }
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * dhash de una dataURL (PNG/JPG — EXIF ya horneado o ausente): decode vía
 * bitmapNormalizado → dhash. Mantenida por compatibilidad con quien la
 * consumía; D65 el dhash de la COLA vive en dhashDeArchivo.
 */
export async function dhash64DeDataUrl(dataUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return dhashDeBitmap(await bitmapNormalizado(blob));
  } catch {
    return null;
  }
}

/** Distancia de Hamming entre dos hashes hex 64-bit (longitudes distintas → 64). */
export function hamming64(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/**
 * D65 (T2) — dhash DEDUP v2 de UN archivo de la cola, por CONTENIDO:
 *  · JPG/PNG/WebP/página-PDF (D60) → decode DIRECTO del File original con
 *    EXIF aplicado (createImageBitmap from-image, T2.1). Aquí estaba el
 *    descuadre de v1: el JPG podía llegar al thumb SIN rotar (decode
 *    intermedio con EXIF distinta al del HEIC) → hashes que no cuadraban.
 *  · HEIC/HEIF → el navegador NO decoda HEIC: la MISMA conversión del core
 *    que consume TODO el pipeline (fileToCaptureDataUrl — orientación ya
 *    horneada en el JPEG de salida), luego el mismo bitmap normalizado
 *    (mismo camino de decode que el resto, cero ramas nuevas).
 *  Cualquier fallo → null (la fila procesa normal — conservador).
 */
export async function dhashDeArchivo(file: File): Promise<string | null> {
  try {
    const esHeic =
      /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
    const fuente: Blob = esHeic
      ? await (await fetch(await fileToCaptureDataUrl(file))).blob()
      : file;
    return dhashDeBitmap(await bitmapNormalizado(fuente));
  } catch {
    return null;
  }
}

// ─── e65-dedup-enviadas-v1 — CAPA BYTES (SHA-256 exacto) ───────────────────
/** e65 (D-e65-1) — SHA-256 hex (64) de los BYTES del File: dedup EXACTO de
 *  contenido (mismo archivo → mismo hash). crypto.subtle NATIVO: cero
 *  dependencias nuevas (§0.3 kit cola — package.json/bun.lock intactos),
 *  ~50-200 ms para 8-18 MB. Fallo (subtle ausente / file raro / arrayBuffer
 *  lanzando) → null — CONSERVADOR: la fila procesa normal, jamás tumba el
 *  encolado. RED LINE RL-e65-1: hashBytes es SOLO llave de dedup — JAMÁS
 *  identidad del acta, JAMÁS viaja al envío, JAMÁS al informe de contenido
 *  (igualdad EXACTA del hex completo — RL-e65-5, sin prefijos). */
export async function hashBytesDeArchivo(file: File): Promise<string | null> {
  try {
    if (typeof crypto?.subtle?.digest !== "function") return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
