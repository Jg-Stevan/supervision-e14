/**
 * Helpers de imagen (canvas puro, sin dependencias) — COPIA LITERAL del lab
 * (apps/scanner-lab/src/components/scanner/EditorView.tsx L163–L224, SPEC
 * §7.5 mapa de copia: `rotateProcessedDataUrl` para "ROTAR 90°" de REVISIÓN).
 *
 * F-ROT-RAPID — rota una data URL en múltiplos de 90° SIN reprocesar el
 * pipeline (warp+enhance). Matemáticamente equivalente: el warp ya ocurrió y
 * el realce es conmutativo con rotaciones de 90°. e14 usa la rotación
 * horneada en `Acta.rotation` para el PDF (§6: el adaptador ya la pasa al
 * ScanDocument).
 */

/** Encode PNG de un canvas vía toBlob (memoria-seguro en iOS) → data URL. */
function encodePngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (!b || b.size === 0) {
          reject(new Error("toBlob vacío"));
          return;
        }
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result ?? ""));
        fr.onerror = () => reject(new Error("FileReader falló"));
        fr.readAsDataURL(b);
      }, "image/png");
    } catch (e) {
      reject(e instanceof Error ? e : new Error("toBlob falló"));
    }
  });
}

import { loadImage } from "@jg-stevan/scanner-core/image-processor";

/** KIT e14-optimizacion-v1 (T1): memo de decodificación tope 2 — la
 *  MISMA dataURL del acta en vuelo se decodifica UNA vez aunque 4-5 etapas
 *  del pipeline la pidan (tinta/vacía/completitud/banda/calidad). Tope 2 =
 *  solo el acta en vuelo: RAM acotada (lección L7 de hidratación/RAM), el
 *  acta siguiente desaloja a la anterior automáticamente. Determinismo: la
 *  imagen devuelta es el MISMO decode que haría loadImage — cero cambio de
 *  comportamiento.
 *  SPRINT-A (perf/decode-once-v1) A1: DELEGA al LRU compartido
 *  (`decodeImagenLru`) — MISMO contrato (decode una vez, tope 2, mismo
 *  <img> de vuelta) pero la caché ahora es UNA para todo el pipeline (QR
 *  capa 0, origen, preProceso, maestro, OCR, tinta, calidad): la misma
 *  fuente ya no se decodifica dos veces por vivir en dos memos. */
export async function loadImageMemo(url: string): Promise<HTMLImageElement> {
  return (await decodeImagenLru(url)) as HTMLImageElement;
}

// ─── SPRINT-A (perf/decode-once-v1) A1 — LRU de decodes COMPARTIDO ───────────
// El pipeline masivo decodificaba la MISMA imagen 4-7 veces por acta (QR capa
// 0 → clasificarOrigen → preProcesoEscaneo → maestro → OCR → tinta → thumbs),
// cada módulo con su propio loadImage → drawImage → getImageData (~30-40% del
// CPU pre-OCR). `decodeImagenLru` es el decode ÚNICO compartido: MISMO patrón
// literal de `loadImageMemo` (tope 2 — RAM acotada a la acta en vuelo, lección
// L7) con dos mejoras documentadas: (1) recencia real (un HIT re-ordena —
// loadImageMemo era FIFO de inserción) y (2) dedup de decodes EN VUELO para
// que dos pasos concurrentes del pool (Opt-3, 2 workers) peguen al MISMO
// decode. La fuente devuelta es HTMLImageElement (NUNCA ImageBitmap: un
// bitmap desalojado y .close() envenenaría al otro worker del pool — el <img>
// desalojado sigue válido para quien ya lo sostiene y el GC hace el resto).

/** LRU tope 2: url → imagen decodificada (EXIF respetado: el navegador
 *  aplica image-orientation:from-image al <img> por defecto). */
const lruDecodes = new Map<string, HTMLImageElement>();
/** Dedup de decodes en vuelo: url → promesa compartida (pool 2 workers). */
const decodesEnVuelo = new Map<string, Promise<HTMLImageElement>>();
/** Canvases derivados pre-escalados: `${url}|${maxDim}` → canvas (los
 *  consumidores que piden maxDim — QR capa 0, análisis — comparten SU
 *  canvas; el full-res base vive solo en lruDecodes). Tope 2, misma RAM
 *  acotada: el canvas es copia, el img base manda. */
const lruCanvasEscalado = new Map<string, HTMLCanvasElement>();
/** URLs blob: creadas por decodeImagenLruDeBlob (para revocar al desalojar —
 *  sin esto el object URL retiene los bytes del File en RAM indefinidamente). */
const blobsConUrl = new Map<string, Blob>();

/** Núcleo del LRU: decode único de `url` (dataURL, blob: URL o http(s) —
 *  MISMO decode que haría `loadImage`, cero cambio de comportamiento). */
async function decodeLru(url: string): Promise<HTMLImageElement> {
  const hit = lruDecodes.get(url);
  if (hit) {
    // Recencia real: re-insertar al final (loadImageMemo era FIFO — SPRINT-A
    // A1 lo upgradea; mismo tope 2, misma disciplina de RAM).
    lruDecodes.delete(url);
    lruDecodes.set(url, hit);
    return hit;
  }
  const enVuelo = decodesEnVuelo.get(url);
  if (enVuelo) return enVuelo;
  const promesa = loadImage(url)
    .then((img) => {
      lruDecodes.set(url, img);
      while (lruDecodes.size > 2) {
        const masVieja = lruDecodes.keys().next().value;
        if (masVieja === undefined) break;
        lruDecodes.delete(masVieja);
        // Disciplina de RAM (lección L7): los object URL de blob: creados
        // aquí se revocan al desalojar (el <img> ya decodificado NO se
        // invalida — revocar solo libera los bytes del File).
        if (blobsConUrl.has(masVieja)) {
          try {
            URL.revokeObjectURL(masVieja);
          } catch {
            /* URL ya revocada — noop */
          }
          blobsConUrl.delete(masVieja);
        }
      }
      return img;
    })
    .finally(() => {
      decodesEnVuelo.delete(url);
    });
  decodesEnVuelo.set(url, promesa);
  return promesa;
}

/**
 * SPRINT-A A1 — decode-once LRU compartido por TODO el pipeline.
 * Devuelve la imagen decodificada (caché LRU tope 2 + dedup en vuelo) o, si
 * `opciones.maxDim` se pide y la fuente excede ese lado largo, un canvas
 * pre-escalado derivado del MISMO decode (escala = min(1, maxDim/ladoMayor)
 * — idéntica a la receta de `pixelesDeCapture` del QR y `canvasDeTrabajo`
 * del banco; el canvas derivado también se cachea por `${url}|${maxDim}`).
 * El formato de la moneda entre módulos NO cambia: los dataURL siguen
 * viajando igual — el LRU es interno.
 */
export async function decodeImagenLru(
  url: string,
  opciones?: { maxDim?: number },
): Promise<CanvasImageSource> {
  const img = await decodeLru(url);
  const maxDim = opciones?.maxDim;
  if (!maxDim || Math.max(img.naturalWidth, img.naturalHeight) <= maxDim) {
    return img; // sin escala pedida (o la fuente ya es menor) — decode puro
  }
  const clave = `${url}|${maxDim}`;
  const hitCv = lruCanvasEscalado.get(clave);
  if (hitCv) return hitCv;
  const escala = Math.min(1, maxDim / (Math.max(img.naturalWidth, img.naturalHeight) || 1));
  const cv = canvasCon(
    Math.max(1, Math.round(img.naturalWidth * escala)),
    Math.max(1, Math.round(img.naturalHeight * escala)),
  ); // SPRINT-A A3 — factory
  const ctx = cv.getContext("2d");
  if (ctx) {
    // SIN imageSmoothingQuality explícito: el default del navegador es la
    // receta que ya usaban pixelesDeCapture (QR) y bitmapAMaestro — fidelidad
    // byte-idéntica del reescalado (SPRINT-A A1).
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
  }
  lruCanvasEscalado.set(clave, cv);
  while (lruCanvasEscalado.size > 2) {
    const masViejo = lruCanvasEscalado.keys().next().value;
    if (masViejo === undefined) break;
    lruCanvasEscalado.delete(masViejo);
  }
  return cv;
}

/**
 * SPRINT-A A1 — puente Blob→LRU para los consumidores que reciben el
 * File/Blob original (maestro de captura, clasificarOrigen, preProceso).
 * Un object URL POR INSTANCIA de blob (WeakMap — URL.createObjectURL es
 * barato y SIN decode; el decode real pega al LRU compartido). La misma
 * instancia de File dentro de un intento (origen → preProceso → maestro)
 * comparte UN decode; la revocación vive en la eviction del LRU.
 */
export function decodeImagenLruDeBlob(
  blob: Blob,
  opciones?: { maxDim?: number },
): Promise<CanvasImageSource> {
  let url = blobUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    blobUrls.set(blob, url);
    blobsConUrl.set(url, blob);
  }
  return decodeImagenLru(url, opciones);
}
const blobUrls = new WeakMap<Blob, string>();

// ─── SPRINT-A (perf/decode-once-v1) A3 — factory de canvas + análisis ───────

/** Factory de canvas: `document.createElement("canvas")` con dimensiones en
 *  una línea. Migración MECÁNICA de los ~26 createElement de la zona
 *  image/pipeline (regla del kit: cero cambio de algoritmo — los bloques con
 *  semántica especial, offscreen/willReadFrequently, la conservan con
 *  comentario; el contexto lo pide cada caller porque sus atributos difieren
 *  y getContext solo honra el primero). */
export function canvasCon(ancho: number, alto: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = ancho;
  cv.height = alto;
  return cv;
}

/** Decode (LRU compartido A1) → escala a `maxDim` → getImageData, en un solo
 *  paso — la receta repetida del QR capa 0 y de los detectores de análisis
 *  (antes: cada módulo hacía su propio decode → drawImage → getImageData). */
export async function analizarPixeles(
  fuente: string,
  maxDim: number,
): Promise<{ data: Uint8ClampedArray; ancho: number; alto: number }> {
  const src = await decodeImagenLru(fuente, { maxDim });
  let cv: HTMLCanvasElement;
  if (src instanceof HTMLCanvasElement) {
    cv = src; // canvas pre-escalado del LRU (maxDim aplicado)
  } else {
    const img = src as HTMLImageElement;
    cv = canvasCon(img.naturalWidth, img.naturalHeight);
    const c0 = cv.getContext("2d");
    if (c0) c0.drawImage(img, 0, 0);
  }
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("sin contexto 2d");
  const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
  return { data: imgData.data, ancho: cv.width, alto: cv.height };
}

/**
 * §D4 (SPEC-e14-score-ocr) — cobertura de TINTA de la foto PROCESADA.
 * El realce por defecto es B/N adaptativo (Bradley-Roth + despeckle del
 * core): binario — tinta ≈ 0, papel ≈ 255. Un warp de un quad degenerado
 * sobre una superficie LISA queda blanco puro → «sin tinta» → REVISIÓN
 * muestra la ORIGINAL («el operador SIEMPRE ve lo que capturó»).
 *
 * Muestreo barato en canvas 64×64 SIN suavizado (nearest): el promedio de
 * área DILUYE las líneas de tinta finas hasta luma ~240 y mataría la señal
 * (un acta real cabe entera en 64 px: cada muestra cubre ~600 px originales).
 * % de píxeles oscuros (luma < 128) < 0.5% → vacía. Con tinta — aunque sea
 * poca, p. ej. la borrosa B/N — NO está vacía (se muestra la procesada).
 * Ante cualquier error del decode NO se afirma «vacía» (conservador).
 */
const TINTA_LADO = 64;
const TINTA_LUMA_OSCURA = 128;
const TINTA_FRACCION_MINIMA = 0.005;

export async function procesadaVaciaDataUrl(url: string): Promise<boolean> {
  try {
    const img = await loadImageMemo(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return false;
    const canvas = canvasCon(TINTA_LADO, TINTA_LADO); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, TINTA_LADO, TINTA_LADO);
    const { data } = ctx.getImageData(0, 0, TINTA_LADO, TINTA_LADO);
    let oscuras = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma < TINTA_LUMA_OSCURA) oscuras += 1;
    }
    return oscuras / (TINTA_LADO * TINTA_LADO) < TINTA_FRACCION_MINIMA;
  } catch {
    return false;
  }
}

/**
 * Rota una data URL `deg` grados (múltiplos de 90) con canvas puro.
 * El lab devuelve también miniatura/w/h para su carrusel; e14 solo consume
 * `url` (los demás campos se conservan por fidelidad de la copia).
 */
export async function rotateProcessedDataUrl(
  url: string,
  deg: number
): Promise<{ url: string; thumb: string; w: number; h: number }> {
  const img = await loadImageMemo(url);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error("imagen sin dimensiones");
  const swapped = deg % 180 !== 0;
  const cw = swapped ? h : w;
  const ch = swapped ? w : h;
  const canvas = canvasCon(cw, ch); // SPRINT-A A3 — factory
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin contexto 2d");
  ctx.imageSmoothingQuality = "high";
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  const tW = 160;
  const tH = Math.max(1, Math.round((ch / cw) * tW));
  const tCanvas = canvasCon(tW, tH); // SPRINT-A A3 — factory
  const tCtx = tCanvas.getContext("2d");
  if (tCtx) {
    tCtx.imageSmoothingQuality = "high";
    tCtx.drawImage(canvas, 0, 0, tW, tH);
  }
  const [urlOut, thumb] = await Promise.all([
    encodePngDataUrl(canvas),
    Promise.resolve(tCanvas.toDataURL("image/jpeg", 0.8)),
  ]);
  return { url: urlOut, thumb, w: cw, h: ch };
}
