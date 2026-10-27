/**
 * KIT e14-masiva-ux-v1 (T2): clasificación y extracción de archivos para la
 * cola MASIVA — imágenes sueltas (con o sin MIME), HEIC/HEIF (el decode ya
 * lo resuelve `fileToCaptureDataUrl` del core DENTRO del pipeline — misma
 * vía que ScanView) y comprimidos .zip/.rar (extracción client-side, sin
 * red). Módulo PURO (sin React) — el store lo consume desde `agregarFiles`.
 *
 * D47: los imports de fflate/node-unrar-js son DIFERIDOS (`await import(...)`)
 * SOLO cuando llega un comprimido — impacto ~0 en el bundle inicial y en el
 * LCP de Vercel (kit §3-T2.1). El wasm de unrar viaja dentro del paquete npm
 * (se le pasa `wasmBinary` explícito — el locateFile del emscripten no sirve
 * en el bundle: `public/**` y `src/assets/**` son intocables, kit §0.3).
 *
 * D60 (KIT e14-pdf-masiva-v1): los PDF entran a la cola — se renderizan
 * PÁGINA A PÁGINA client-side (pdf.js) y CADA página se encola como una
 * `File` JPEG más → el pipeline real, el gate, el dedup, la persistencia y
 * la REVISIÓN funcionan SIN cambios (la página viaja por la misma vía que
 * las extraídas de un .zip). `pdfjs-dist` se importa DEFERIDO (D47, mismo
 * patrón) y su worker viaja como asset del paquete npm vía
 * `new URL(..., import.meta.url)` — NADA en `public/**` ni `src/assets/**`.
 */

import { canvasCon, decodeImagenLruDeBlob } from "../image-utils"; // SPRINT-A A1/A3 — decode-once LRU + factory de canvas
// KIT e14-gama-adaptativa-v1 (D74): el lado mayor EFECTIVO del master lo da
// el plan de gama (BAJO 3072 · resto 4032).
import { planGamaActual } from "../gama";

/** Entradas de comprimido que son imágenes (por extensión — kit T2.2). */
const EXT_IMAGEN = /\.(jpe?g|png|webp|bmp|gif|avif|heic|heif)$/i;
/** Entradas anidadas: NO se extraen (guard ARCHIVO_ANIDADO). */
const EXT_COMPRIMIDO_ANIDADO = /\.(zip|rar)$/i;
/** Tope de imágenes extraídas por comprimido (kit T2.2). */
const TOPE_POR_COMPRIMIDO = 500;

/** D60 — Tope de páginas renderizadas por PDF (un E-14 real es 1-2 páginas). */
const TOPE_PAGINAS_PDF = 30;
/** D60 — Longitud objetivo del borde largo del render (px) — el det trabaja
 *  a 1920; 2400 da margen para el realce sin inflar memoria. */
const PDF_LARGO_OBJETIVO = 2400;
/** D60 — Escala máxima del render (viewport×escala ≥ origen nunca más de 4×). */
const PDF_ESCALA_MAX = 4;

// ---------- D66 — KIT e14-decode-unico-precalor-v1 (T1/T2): maestro único ----------

/** D66 (T1-R4) — ESCALA DE TRABAJO ACTUAL, documentada y SIN CAMBIO: es la
 *  `IMPORT_MAX_LONG_SIDE` del F-IMPORT del core (@jg-stevan/scanner-core
 *  0.4.0, image-processor.js L140) — idéntica a `PROCESSED_MAX_LONG_SIDE`
 *  (L35): 4032×3024 ≈ 12.2 MP. Todo el pipeline (fotoOriginal capturada,
 *  fotoProcesada, REVISIÓN) vive a ESA escala hoy; el master nace a la MISMA
 *  escala para que los píxeles que llegan a detección/OCR sean los de siempre
 *  (mismo cap — solo cambia UNA re-encode intermedia q0.90, gate del dueño
 *  ±0.3). Prohibido mover este número sin un kit propio (mueve scores).
 *  KIT e14-gama-adaptativa-v1 (D74) — ÚNICA excepción registrada: en gama
 *  BAJO adaptativa el master de MASIVA nace a 3072 (pico de bitmap −42 %
 *  donde los abortos por memoria dominan; el det trabaja a 1280/1920 y la
 *  resolución de OCR/QR se conserva) — flag-gated vía ladoMaestroEfectivo()
 *  y revocable con masivaAdaptativoGama=false o override manual. */
const MAESTRO_LADO_MAYOR = 4032;

/** KIT e14-gama-adaptativa-v1 (D74) — lado mayor EFECTIVO del master de la
 *  cola (ver comentario de MAESTRO_LADO_MAYOR). Flag OFF/ALTO/MEDIO ⇒ 4032
 *  byte-idéntico a hoy. */
function ladoMaestroEfectivo(): number {
  return Math.min(MAESTRO_LADO_MAYOR, planGamaActual().maestroLadoMayor);
}
/** D66 (T3.2) — calidad del JPEG del master (kit literal «q≈0.90»). */
const MAESTRO_JPEG_CALIDAD = 0.9;

/** D66 (T2/T4) — quién fabricó el master: el decodificador NATIVO del
 *  navegador (createImageBitmap sobre el blob original) o la ruta wasm
 *  (heic2any — el mismo motor que el F-HEIC del core, import diferido D47). */
export type OrigenDecode = "nativo" | "wasm";

/** D66 (T1.5/T3.1) — el MASTER: un solo decodificado a escala de trabajo del
 *  que thumb/quad/OCR se derivan (vía el pipeline normal — el bridge recibe
 *  ESTE archivo). `archivo` es el JPEG del master listo para la cola; el
 *  bitmap vivo JAMÁS se retiene (T3.2: el master reposa como blob). */
export interface MaestroImagen {
  archivo: File;
  ancho: number;
  alto: number;
  origenDecode: OrigenDecode;
  /** ms SOLO del decodificado a master (T4 — separado de procesoMs). */
  decodeMs: number;
}

/** ¿El blob declara HEIC/HEIF (MIME o extensión)? Los «.jpg» con contenido
 *  HEIC (típico de mensajería) los detecta el FALLO del decode nativo —
 *  misma cascada del F-IMPORT del core. */
function pareceHeic(blob: Blob, nombre?: string): boolean {
  if (blob.type === "image/heic" || blob.type === "image/heif") return true;
  return !!nombre && /\.(heic|heif)$/i.test(nombre);
}

/** Fuente decodificada → File JPEG del master (canvas fuera — la RAM muere
 *  con él). Falla el encode → null (la fila cae a la ruta de siempre —
 *  honesto).
 *  SPRINT-A (perf/decode-once-v1) A1: la fuente ahora es el <img> del LRU
 *  compartido (antes ImageBitmap con close() en finally) — MISMA geometría
 *  (escala min(1, MAESTRO_LADO_MAYOR/lado), blit 1:1 en el caso común) y el
 *  suavizado default del navegador (el createImageBitmap sin resizeWidth/Height
 *  tampoco reescalaba: resizeQuality era inerte). El <img> no se cierra: la
 *  eviction del LRU (tope 2) lo libera — el GC hace el resto. */
async function bitmapAMaestro(
  fuente: HTMLImageElement,
  origenDecode: OrigenDecode,
  t0: number,
  nombreBase: string,
): Promise<MaestroImagen | null> {
  try {
    const lado = Math.max(fuente.naturalWidth, fuente.naturalHeight) || 1;
    // KIT e14-gama-adaptativa-v1 (D74): escala contra el lado EFECTIVO (3072
    // en BAJO adaptativa — ver ladoMaestroEfectivo).
    const escala = Math.min(1, ladoMaestroEfectivo() / lado);
    const ancho = Math.max(1, Math.round(fuente.naturalWidth * escala));
    const alto = Math.max(1, Math.round(fuente.naturalHeight * escala));
    const canvas = canvasCon(ancho, alto); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(fuente, 0, 0, ancho, alto);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", MAESTRO_JPEG_CALIDAD),
    );
    if (!blob) return null;
    return {
      archivo: new File([blob], nombreBase, { type: "image/jpeg" }),
      ancho,
      alto,
      origenDecode,
      decodeMs: Math.max(1, Math.round(Date.now() - t0)),
    };
  } finally {
    /* <img> del LRU — sin close(): la eviction del decode-once lo libera */
  }
}

/**
 * D66 (T1.2/T1.5 + T2) — `maestroDeImagen`: UN decodificado a la escala de
 * trabajo (4032 — constante documentada arriba, R4 sin cambio) que
 * alimenta la cola. T2: HEIC intenta NATIVO primero (feature-detect
 * con validación de dimensiones sanas — `origenDecode:"nativo"`); si el
 * navegador no decodifica HEIC → ruta wasm de RESERVA con heic2any
 * (`origenDecode:"wasm"` — import DEFERIDO D47, motor idéntico al F-HEIC
 * del core; el fallback JAMÁS se asume disponible ni se borra). Devuelve
 * null ante CUALQUIER fallo o cancelación — la fila cae a la ruta de
 * SIEMPRE (jamás bloquea el pipeline; honestidad del kit).
 *
 * SPRINT-A (perf/decode-once-v1) A1: el decode pega al LRU COMPARTIDO del
 * pipeline (`decodeImagenLruDeBlob`) — antes eran createImageBitmap privados
 * {imageOrientation:"from-image", resizeQuality:"high"}. EXIF intacto (el
 * navegador aplica from-image al <img> por defecto), geometría y calidad
 * JPEG intactas; el master precalentado + el decode de origen/preProceso del
 * MISMO File comparten UN decode.
 *
 * `senalCancelacion` (T3.4): el precalor la pasa para abortar entre etapas
 * (fila quitada/cola vaciada → null sin consumir CPU del encode).
 */
export async function maestroDeImagen(
  entrada: Blob,
  opciones?: {
    nombre?: string;
    senalCancelacion?: () => boolean;
  },
): Promise<MaestroImagen | null> {
  const cancelado = () => opciones?.senalCancelacion?.() ?? false;
  const t0 = Date.now();
  // Nombre del master: el del original con .jpg (la identidad visual de la
  // bandeja sigue viniendo del registro — este File solo alimenta al bridge).
  const nombreBase = `${(opciones?.nombre ?? "acta").replace(/\.[a-z0-9]{2,5}$/i, "")}.jpg`;
  const esHeic = pareceHeic(entrada, opciones?.nombre);

  // 1) NATIVO primero (T2.1) — para TODO (JPG incluido): el decode del
  //    LRU compartido (EXIF from-image vía <img> — misma orientación que
  //    el F-IMPORT del core).
  try {
    const fuente = await decodeImagenLruDeBlob(entrada);
    const img = fuente as HTMLImageElement;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      throw new Error("DIMENSIONES_INVALIDAS");
    }
    if (cancelado()) {
      return null;
    }
    return await bitmapAMaestro(img, "nativo", t0, nombreBase);
  } catch {
    /* sin decode nativo (HEIC en Chrome/Windows, blob roto) → reserva */
  }
  if (cancelado()) return null;

  // 2) Reserva wasm (T2.2) — SOLO si el formato lo justifica (HEIC/HEIF o un
  //    "jpg" que resultó ser HEIC: el nativo falló). heic2any = el MISMO
  //    motor del F-HEIC del core (0.0.4) con import DEFERIDO (D47). Un no-HEIC
  //    que falló el nativo (blob corrupto) NO paga wasm: fallback honesto.
  if (!esHeic) return null;
  try {
    const { default: heic2any } = await import("heic2any");
    if (cancelado()) return null;
    const convertido = await heic2any({
      blob: entrada,
      toType: "image/jpeg",
      quality: 0.92,
    });
    const jpeg = Array.isArray(convertido) ? convertido[0] : convertido;
    if (!(jpeg instanceof Blob)) return null;
    const fuente = await decodeImagenLruDeBlob(jpeg);
    const img = fuente as HTMLImageElement;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      return null;
    }
    if (cancelado()) {
      return null;
    }
    return await bitmapAMaestro(img, "wasm", t0, nombreBase);
  } catch {
    return null; // decode imposible — la ruta de siempre lo resolverá (o ERROR)
  }
}

/**
 * ¿El archivo entra a la cola como imagen? El MISMO criterio de ScanView
 * (F-IMPORT L602-607 — copiado, no inventado): MIME image/* o extensión
 * conocida. HEIC de Android llega con MIME vacío → la extensión manda.
 */
export function pareceImagenMasiva(archivo: File): boolean {
  return (
    archivo.type.startsWith("image/") ||
    /\.(heic|heif|jpe?g|png|webp|bmp|gif|avif)$/i.test(archivo.name)
  );
}

/** D60 — ¿el archivo es un PDF? MIME oficial o extensión (algunos navegadores
 *  entregan application/octet-stream). */
export function parecePdfMasiva(archivo: File): boolean {
  return archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
}

/** Guard del kit T2.2 que NO invalida el lote (viajan junto a las imágenes
 *  extraídas — el store los convierte en filas ERROR con motivo corto).
 *  D60 añade LIMITE_PAGINAS_PDF (una fila por PDF que exceda el tope). */
export type MotivoExtraccion =
  | "PROTEGIDO_O_CORRUPTO"
  | "ARCHIVO_ANIDADO"
  | "LIMITE_500_POR_COMPRIMIDO"
  | "LIMITE_PAGINAS_PDF";

export interface ErrorExtraccion {
  nombre: string;
  motivo: MotivoExtraccion;
}

/** ADAPTACIÓN documentada (REPORTE §desviaciones): la firma del kit era
 *  `Promise<File[]>`, pero sus PROPIOS guards (anidado dentro del lote +
 *  límite 500 con encolado parcial) exigen devolver también las filas de
 *  error — File[] solo no puede materializarlos. Los errores de contraseña/
 *  corrupción SÍ lanzan (motivo como message — el store crea la fila). */
export interface ResultadoExtraccion {
  archivos: File[];
  errores: ErrorExtraccion[];
}

/** Basename plano para la bandeja (las entradas traen rutas internas). */
function nombreDeEntrada(ruta: string): string {
  return ruta.split("/").pop() ?? ruta;
}

/** File desde una entrada extraída (mismo contenido, nombre plano).
 *  `.slice()` → copia con ArrayBuffer propio (el typing estricto de TS 5.7
 *  no acepta la vista genérica como BlobPart). */
function archivoDeEntrada(nombre: string, datos: Uint8Array): File {
  return new File([datos.slice().buffer as ArrayBuffer], nombre, {
    lastModified: Date.now(),
  });
}

/** Punto de entrada (kit T2.2): .zip → fflate · .rar → node-unrar-js ·
 *  lo demás NO debería llegar aquí (el store clasifica antes). */
export async function extraerArchivo(archivo: File): Promise<ResultadoExtraccion> {
  if (/\.zip$/i.test(archivo.name)) return extraerZip(archivo);
  if (/\.rar$/i.test(archivo.name)) return extraerRar(archivo);
  throw new Error("FORMATO_NO_SOPORTADO");
}

/** D60 — PDF → páginas JPEG en la cola (MISMA vía que las extraídas de un
 *  .zip: ids reales, temps, cadenaDedup, IDB, runner, thumb — TODO heredado).
 *  Render página a página client-side con pdf.js (import DEFERIDO — D47);
 *  el worker viaja como asset del PROPIO paquete npm vía
 *  `new URL(..., import.meta.url)` (mismo mecanismo del unrar.wasm — NADA en
 *  public/). Contrato idéntico a zip/rar: PROTEGIDO_O_CORRUPTO /
 *  SIN_PAGINAS / PDF_WORKER_NO_CARGO lanzan (el store crea la fila ERROR)
 *  y LIMITE_PAGINAS_PDF viaja en `errores` (patrón LIMITE_500). */
export async function extraerPdf(archivo: File): Promise<ResultadoExtraccion> {
  // D47: pdfjs-dist SOLO cuando llega un PDF — bundle inicial y LCP intactos.
  const pdfjs = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    throw new Error("PDF_WORKER_NO_CARGO");
  }

  // getDocument: contraseña (PasswordException) o parse/corrupción → el
  // motivo ya es conocido por la bandeja (fila ERROR corta) — ídem zip/rar.
  // ADAPTACIÓN v6 (REPORTE §desviaciones): el destroy vive en el LOADING
  // TASK (PDFDocumentProxy ya no lo expone) — memoria disciplinada ídem.
  let carga: ReturnType<typeof pdfjs.getDocument>;
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    carga = pdfjs.getDocument({ data: await archivo.arrayBuffer() });
    doc = await carga.promise;
  } catch {
    throw new Error("PROTEGIDO_O_CORRUPTO");
  }

  const base = archivo.name.replace(/\.pdf$/i, "");
  const archivos: File[] = [];
  const errores: ErrorExtraccion[] = [];
  try {
    if (doc.numPages === 0) throw new Error("SIN_PAGINAS");
    // Render SECUENCIAL (1 página en memoria a la vez) — un PDF de 30 no
    // revienta la pestaña; canvas/ctx los libera el GC del bucle.
    const n = Math.min(doc.numPages, TOPE_PAGINAS_PDF);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const escala = Math.min(
        PDF_LARGO_OBJETIVO / Math.max(v1.width, v1.height),
        PDF_ESCALA_MAX
      );
      const viewport = page.getViewport({ scale: escala });
      // Firma v6 (RenderParameters.canvas requerido): canvasCon da el lienzo;
      // willReadFrequently NO aplica — render, no lectura (D60 §T2.8).
      const canvas = canvasCon(Math.round(viewport.width), Math.round(viewport.height)); // SPRINT-A A3 — factory
      // Firma v6 (RenderParameters.canvas requerido — ctx interno de pdf.js;
      // willReadFrequently NO aplica: render, no lectura — D60 §T2.8).
      await page.render({ canvas, viewport }).promise;
      // blob null → página saltada (sin inventar). El nombre conserva la
      // identidad del E-14 oficial: `E14_XXX_...-P1.jpg`.
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.92)
      );
      if (blob) {
        archivos.push(
          new File([blob], `${base}-P${i}.jpg`, {
            type: "image/jpeg",
            lastModified: archivo.lastModified,
          })
        );
      }
      page.cleanup();
    }
    if (doc.numPages > TOPE_PAGINAS_PDF) {
      // Más páginas que el tope: lo renderizado se encola + UNA fila ERROR.
      errores.push({ nombre: archivo.name, motivo: "LIMITE_PAGINAS_PDF" });
    }
    if (!archivos.length && !errores.length) throw new Error("SIN_PAGINAS");
    return { archivos, errores };
  } finally {
    await carga.destroy(); // memoria disciplinada — salga como salga (v6)
  }
}

/** ZIP con fflate (sync, ~8 KB). Contraseña/corrupto → unzipSync lanza →
 *  el guard del kit convierte en fila ERROR PROTEGIDO_O_CORRUPTO. */
async function extraerZip(archivo: File): Promise<ResultadoExtraccion> {
  const { unzipSync } = await import("fflate");
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    // fflate no descifra: zip protegido/corrupto/truncado cae aquí.
    throw new Error("PROTEGIDO_O_CORRUPTO");
  }
  const archivos: File[] = [];
  const errores: ErrorExtraccion[] = [];
  for (const [ruta, datos] of Object.entries(entradas)) {
    if (ruta.endsWith("/")) continue; // directorio
    if (EXT_COMPRIMIDO_ANIDADO.test(ruta)) {
      // Kit T2.2: anidado NO se extrae — fila ERROR (por entrada).
      errores.push({ nombre: nombreDeEntrada(ruta), motivo: "ARCHIVO_ANIDADO" });
      continue;
    }
    if (!EXT_IMAGEN.test(ruta)) continue; // sin extensión de imagen → descartada (no es error)
    if (archivos.length >= TOPE_POR_COMPRIMIDO) {
      // Kit T2.2: primeras 500 encoladas + UNA fila ERROR de límite.
      errores.push({ nombre: archivo.name, motivo: "LIMITE_500_POR_COMPRIMIDO" });
      break;
    }
    archivos.push(archivoDeEntrada(nombreDeEntrada(ruta), datos));
  }
  if (!archivos.length && !errores.length) throw new Error("SIN_IMAGENES_DENTRO");
  return { archivos, errores };
}

/** RAR con node-unrar-js (wasm MIT). El wasmBinary viaja EXPLÍCITO desde el
 *  propio paquete (asset de node_modules resuelto por el bundler — ver
 *  cabecera del módulo). Contraseña/corrupto → fila ERROR (kit T2.2). */
async function extraerRar(archivo: File): Promise<ResultadoExtraccion> {
  const [{ createExtractorFromData }, wasmBinario] = await Promise.all([
    import("node-unrar-js"),
    fetchWasmUnrar(),
  ]);
  let extractor: Awaited<ReturnType<typeof createExtractorFromData>>;
  try {
    extractor = await createExtractorFromData({
      wasmBinary: wasmBinario,
      data: await archivo.arrayBuffer(),
    });
  } catch {
    throw new Error("PROTEGIDO_O_CORRUPTO");
  }
  const archivos: File[] = [];
  const errores: ErrorExtraccion[] = [];
  let protegiDoAvisado = false;
  try {
    const extraidos = extractor.extract({});
    for (const entrada of extraidos.files) {
      const cabecera = entrada.fileHeader;
      if (cabecera.flags.directory) continue;
      if (cabecera.flags.encrypted) {
        // Entrada cifrada: el guard del kit manda (una fila por archivo).
        if (!protegiDoAvisado) {
          protegiDoAvisado = true;
          errores.push({ nombre: archivo.name, motivo: "PROTEGIDO_O_CORRUPTO" });
        }
        continue;
      }
      if (EXT_COMPRIMIDO_ANIDADO.test(cabecera.name)) {
        errores.push({
          nombre: nombreDeEntrada(cabecera.name),
          motivo: "ARCHIVO_ANIDADO",
        });
        continue;
      }
      if (!EXT_IMAGEN.test(cabecera.name)) continue; // descartada (no es error)
      const datos = entrada.extraction;
      if (!datos) continue; // entrada fallida (raro) — sin inventar motivos
      if (archivos.length >= TOPE_POR_COMPRIMIDO) {
        errores.push({ nombre: archivo.name, motivo: "LIMITE_500_POR_COMPRIMIDO" });
        break;
      }
      archivos.push(archivoDeEntrada(nombreDeEntrada(cabecera.name), datos));
    }
  } catch (err) {
    const razon = (err as { reason?: string })?.reason ?? "";
    // Contraseña del archivo entero / cabecera cifrada / RAR corrupto.
    if (archivos.length === 0) throw new Error("PROTEGIDO_O_CORRUPTO");
    // Extracción PARCIAL: lo conseguido se encola + fila del fallo.
    errores.push({ nombre: archivo.name, motivo: "PROTEGIDO_O_CORRUPTO" });
    void razon;
  }
  if (!archivos.length && !errores.length) throw new Error("SIN_IMAGENES_DENTRO");
  return { archivos, errores };
}

/** Bytes del unrar.wasm del PROPIO paquete npm (sin red, sin public/).
 *  `new URL(..., import.meta.url)` es el mecanismo de assets estáticos de
 *  los bundlers (webpack/turbopack emiten el archivo junto al chunk).
 *  FIX (auditoría 2-c #14): un fallo del fetch (404/red/caída del asset)
 *  se reporta con SU PROPIO motivo — antes viajaba como
 *  PROTEGIDO_O_CORRUPTO (falso e irreproducible para el dueño). */
async function fetchWasmUnrar(): Promise<ArrayBuffer> {
  const url = new URL("node-unrar-js/esm/js/unrar.wasm", import.meta.url);
  let respuesta: Response;
  try {
    respuesta = await fetch(url);
  } catch {
    throw new Error("WASM_NO_CARGO");
  }
  if (!respuesta.ok) throw new Error("WASM_NO_CARGO");
  return await respuesta.arrayBuffer();
}
