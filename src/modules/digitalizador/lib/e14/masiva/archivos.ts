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
 *  D60 añade LIMITE_PAGINAS_PDF (una fila por PDF que exceda el tope).
 *  R5 (M-1 de 03b-digitalizador-masiva) añade los tres topes de bytes:
 *  TOPE_BYTES_ENTRADA / RATIO_SOSPECHOSO / TOPE_BYTES_COMPRIMIDO — rechazos
 *  TRAZABLES por entrada (o del comprimido entero), jamás tumban la cola. */
export type MotivoExtraccion =
  | "PROTEGIDO_O_CORRUPTO"
  | "ARCHIVO_ANIDADO"
  | "LIMITE_500_POR_COMPRIMIDO"
  | "LIMITE_PAGINAS_PDF"
  | "TOPE_BYTES_ENTRADA"
  | "RATIO_SOSPECHOSO"
  | "TOPE_BYTES_COMPRIMIDO";

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

/** File desde las PARTES descomprimidas de una entrada (nombre plano).
 *  R5 (M-1): SIN copia manual — antes era `datos.slice()` (duplicaba el
 *  buffer de cada entrada; con cientos de fotos eran cientos de copias).
 *  El constructor de File YA copia los bytes una vez por especificación
 *  (BlobPart se copia al blob) — el slice extra duplicaba ese costo. Los
 *  chunks que entrega fflate por `ondata` son copias independientes
 *  (fflate 0.8.3 hace `slc()` interno antes del callback — nunca son vistas
 *  reutilizable) y node-unrar-js materializa buffers propios; el cast
 *  DOCUMENTA ese contrato (jamás SharedArrayBuffer) sin transformar nada
 *  en runtime. */
function archivoDePartes(nombre: string, partes: Uint8Array[]): File {
  return new File(partes as Uint8Array<ArrayBuffer>[], nombre, {
    lastModified: Date.now(),
  });
}

// ---------- R5 — GUARD de comprimidos (M-1: zip bomb / RAM desbocada) ----------

/** R5 (M-1 de 03b-digitalizador-masiva, recomendación #4) — Topes de bytes
 *  para zip/rar. Hoy el comprimido se descomprimía COMPLETO en RAM antes de
 *  filtrar (unzipSync → Record<string,Uint8Array>) y el tope de 500 solo
 *  contaba ARCHIVOS: un zip de 500×100 MB (o 1 entrada de GB) revientaba la
 *  pestaña antes del tope. Doctrina del conservador: ante duda, RECHAZAR la
 *  entrada con traza (fila ERROR trazable) es mejor que consumir RAM — la
 *  cola jamás se tumba (los rechazos viajan como filas, patrón kit T2.2).
 *
 *  Los tres topes son tuneables por llamada (OpcionesGuardaR5 — el default
 *  es la constante de abajo) para que el dueño los ajuste sin tocar código
 *  y para que los tests puedan ejercitarlos con fixtures chicas. */
export interface OpcionesGuardaR5 {
  /** Techo ACUMULADO de bytes descomprimidos por comprimido (default 2 GB). */
  topeBytesComprimido?: number;
  /** Techo de bytes descomprimidos POR ENTRADA (default 128 MB). */
  topeBytesEntrada?: number;
  /** Ratio descomprimido/comprimido sospechoso (default 100). */
  ratioSospechoso?: number;
}

/** R5 — Techo acumulado por comprimido: 2 GB (propuesta de la misión +
 *  M-1). Una carga real de 500 fotos (el tope) × ~4 MB vive holgada; lo que
 *  excede esto ya no es una carga de actas. */
const TOPE_BYTES_COMPRIMIDO_DEFAULT = 2 * 1024 ** 3;
/** R5 — Techo por entrada: 128 MB. Una foto real de acta (4032² JPEG/HEIC)
 *  vive entre 1-6 MB; 128 MB da margen ×20 para cámaras enormes y corta
 *  cualquier entrada que pretenda hincharse sola. */
const TOPE_BYTES_ENTRADA_DEFAULT = 128 * 1024 ** 2;
/** R5 — Ratio descomprimido/comprimido sospechoso (>100). Los formatos de
 *  foto reales (JPEG/HEIC/WEBP/PNG/GIF) ya viajan comprimidos: ratio ≈ 1.
 *  >100 significa contenido fabricado para hincharse (zip bomb). Caso borde
 *  documentado: un BMP escaneado de página casi vacía puede pasar de 100 en
 *  condiciones legítimas — ante duda se rechaza con traza (doctrina) y el
 *  dueño puede subir el umbral vía OpcionesGuardaR5. */
const RATIO_SOSPECHOSO_DEFAULT = 100;
/** R5 — Piso de bytes descomprimidos para que el ratio decida: debajo de
 *  1 MB el riesgo de RAM es trivial (el techo acumulado cubre el volumen)
 *  y así no se rechazan entradas chicas legítimas por ruido de cabecera. */
const RATIO_PISO_DESCOMPRIMIDO = 1024 * 1024;
/** R5 — Trozo de empuje al stream de fflate: define la granularidad con la
 *  que se ABORTA la extracción (64 KB comprimidos × ratio 100 ≈ 6.4 MB de
 *  pico transitorio por callback — la peor mentira de cabecera queda acotada
 *  a un solo chunk antes del corte). */
const CHUNK_PUSH_ZIP = 1 << 16;

/** Veredicto de contabilización de un chunk/entrada REAL descomprimido.
 *  RETENER: sigue normal · DESCARTAR: la entrada perdió su guard en vuelo
 *  (fila ya dejada — el caller tira sus chunks y sigue con el resto) ·
 *  ABORTAR: techo acumulado reventado (fila ya dejada — el caller CORTA
 *  todo el comprimido; lo extraído viaja parcial). */
type VeredictoContabilidad = "RETENER" | "DESCARTAR" | "ABORTAR";

/** R5 — Portero de extracción: UNA instancia por comprimido; decide por
 *  entrada (anidado → extensión → límite 500 → techo/ratio de cabecera) y
 *  lleva la contabilidad acumulada de bytes descomprimidos REALES (también
 *  los de entradas descartadas en vuelo: la RAM transitoria es RAM igual).
 *  Misma semántica EXACTA para zip y para rar — guarda el contrato del kit
 *  T2.2: anidado y límite dejan SU fila; no-imagen se descarta en silencio;
 *  nada de esto lanza (jamás tumba la cola — los throws quedan reservados a
 *  comprimido ilegible/protegido/corrupto, como desde siempre). */
function crearPortero(
  nombreComprimido: string,
  errores: ErrorExtraccion[],
  opciones?: OpcionesGuardaR5,
) {
  const topeTotal = opciones?.topeBytesComprimido ?? TOPE_BYTES_COMPRIMIDO_DEFAULT;
  const topeEntrada = opciones?.topeBytesEntrada ?? TOPE_BYTES_ENTRADA_DEFAULT;
  const ratioMax = opciones?.ratioSospechoso ?? RATIO_SOSPECHOSO_DEFAULT;
  let aceptados = 0;
  let bytesAcumulados = 0;
  let limiteAlcanzado = false;
  let techoReventado = false;
  // Estado de la entrada EN VUELO (reset en cada clasificar).
  let nombreEntradaActual = "";
  let bytesEntradaActual = 0;
  let rechazadaActual = false;
  return {
    /** ¿Se alcanzó el tope de 500 archivos? (la fila ya fue dejada). */
    lleno: () => limiteAlcanzado,
    /** ¿Reventó el techo acumulado? (la fila ya fue dejada). */
    reventado: () => techoReventado,
    /** Clasifica una entrada por cabecera/ruta → ¿se extrae? Los rechazos
     *  por entrada dejan SU fila (trazable). `tamComp`/`tamDesc` vienen de
     *  la cabecera (undefined en zips «streamed» → los guards reales
     *  actúan en contabilizar). */
    clasificar(
      nombreEntrada: string,
      tamComp: number | undefined,
      tamDesc: number | undefined,
    ): boolean {
      nombreEntradaActual = nombreDeEntrada(nombreEntrada);
      bytesEntradaActual = 0;
      rechazadaActual = false;
      if (limiteAlcanzado) return false; // tras el límite: SILENCIO (≡ break de siempre)
      if (EXT_COMPRIMIDO_ANIDADO.test(nombreEntrada)) {
        errores.push({ nombre: nombreEntradaActual, motivo: "ARCHIVO_ANIDADO" });
        return false;
      }
      if (!EXT_IMAGEN.test(nombreEntrada)) return false; // no-imagen: descartada sin fila (≡ hoy)
      if (aceptados >= TOPE_POR_COMPRIMIDO) {
        limiteAlcanzado = true;
        errores.push({ nombre: nombreComprimido, motivo: "LIMITE_500_POR_COMPRIMIDO" });
        return false;
      }
      // R5 (M-1): techo por entrada y ratio DECLARADOS (cabeceras honestas
      // — una bomba con cabecera mentirosa la caza contabilizar en vuelo).
      if (tamDesc !== undefined && tamDesc > topeEntrada) {
        errores.push({ nombre: nombreEntradaActual, motivo: "TOPE_BYTES_ENTRADA" });
        return false;
      }
      if (
        tamComp !== undefined &&
        tamDesc !== undefined &&
        tamDesc >= RATIO_PISO_DESCOMPRIMIDO &&
        tamComp >= 1 &&
        tamDesc / tamComp > ratioMax
      ) {
        errores.push({ nombre: nombreEntradaActual, motivo: "RATIO_SOSPECHOSO" });
        return false;
      }
      aceptados++;
      return true;
    },
    /** Contabiliza bytes descomprimidos REALES (chunks del stream o entradas
     *  materializadas). `comprimidosEntrada` ≈ bytes comprimidos consumidos
     *  por la entrada en vuelo (aproximación ±1 chunk — ver extraerZip). */
    contabilizar(bytes: number, comprimidosEntrada: number): VeredictoContabilidad {
      bytesAcumulados += bytes; // TODO lo materializado cuenta (también lo descartado)
      if (techoReventado) return "ABORTAR";
      if (bytesAcumulados > topeTotal) {
        techoReventado = true;
        errores.push({ nombre: nombreComprimido, motivo: "TOPE_BYTES_COMPRIMIDO" });
        return "ABORTAR";
      }
      bytesEntradaActual += bytes;
      if (rechazadaActual) return "DESCARTAR";
      if (bytesEntradaActual > topeEntrada) {
        // La cabecera MINTIÓ (descompresa más de lo declarado): fila + descarte.
        rechazadaActual = true;
        errores.push({ nombre: nombreEntradaActual, motivo: "TOPE_BYTES_ENTRADA" });
        return "DESCARTAR";
      }
      if (
        bytesEntradaActual >= RATIO_PISO_DESCOMPRIMIDO &&
        comprimidosEntrada >= 1 &&
        bytesEntradaActual / comprimidosEntrada > ratioMax
      ) {
        rechazadaActual = true;
        errores.push({ nombre: nombreEntradaActual, motivo: "RATIO_SOSPECHOSO" });
        return "DESCARTAR";
      }
      return "RETENER";
    },
  };
}

/** Punto de entrada (kit T2.2): .zip → fflate · .rar → node-unrar-js ·
 *  lo demás NO debería llegar aquí (el store clasifica antes). R5: acepta
 *  `opciones` (OpcionesGuardaR5) para tunar los topes — el store y el resto
 *  de los callers siguen llamando con UN solo argumento (defaults). */
export async function extraerArchivo(
  archivo: File,
  opciones?: OpcionesGuardaR5,
): Promise<ResultadoExtraccion> {
  if (/\.zip$/i.test(archivo.name)) return extraerZip(archivo, opciones);
  if (/\.rar$/i.test(archivo.name)) return extraerRar(archivo, opciones);
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

  // D35 (UX-1 — REPORTE línea digielect14): el catch único traga tres
  // motivos DISTINTOS y todos acababan en PROTEGIDO_O_CORRUPTO en falso —
  // el dueño perseguía «corruptos» que eran archivos ilegibles del disco.
  // Orden de diagnóstico honesto:
  //  · arrayBuffer() falla (NotReadableError) → ARCHIVO_ILEGIBLE (bloqueado
  //    por otro proceso, permisos, USB extraído — el contenido ni se vio).
  //  · PasswordException de pdf.js → PDF_PROTEGIDO (tiene contraseña).
  //  · parse/corrupción → PROTEGIDO_O_CORRUPTO (motivo de siempre).
  // ADAPTACIÓN v6 (REPORTE §desviaciones): el destroy vive en el LOADING
  // TASK (PDFDocumentProxy ya no lo expone) — memoria disciplinada ídem.
  let bytesPdf: ArrayBuffer;
  try {
    bytesPdf = await archivo.arrayBuffer();
  } catch {
    throw new Error("ARCHIVO_ILEGIBLE");
  }
  let carga: ReturnType<typeof pdfjs.getDocument>;
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    carga = pdfjs.getDocument({ data: bytesPdf });
    doc = await carga.promise;
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "PasswordException") {
      throw new Error("PDF_PROTEGIDO");
    }
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

/** ZIP con fflate en STREAMING (R5, M-1). Antes `unzipSync` descomprimía
 *  TODO el archivo a un `Record<string, Uint8Array>` (incluidos adjuntos
 *  ajenos y bombas) ANTES de filtrar; ahora `Unzip` empuja el stream por
 *  trozos (CHUNK_PUSH_ZIP) y CADA entrada se clasifica por cabecera
 *  (portero) antes de retener un byte — lo rechazado jamás se descomprime.
 *  Cabeceras mentirosas / zips «streamed» (sin tamaños en cabecera local):
 *  contabilidad REAL en vuelo (techo por entrada + ratio + techo
 *  acumulado) corta el stream. Contraseña/corrupto → PROTEGIDO_O_CORRUPTO
 *  (igual que siempre); si ya había imágenes extraídas, viajan PARCIALES +
 *  una fila (mismo trato que el rar desde siempre — jamás tumba la cola). */
async function extraerZip(
  archivo: File,
  opciones?: OpcionesGuardaR5,
): Promise<ResultadoExtraccion> {
  const { Unzip, UnzipInflate } = await import("fflate");
  // D35 (UX-1): lectura de disco ≠ corrupción del zip (ver extraerPdf).
  let bytesZip: ArrayBuffer;
  try {
    bytesZip = await archivo.arrayBuffer();
  } catch {
    throw new Error("ARCHIVO_ILEGIBLE");
  }
  const archivos: File[] = [];
  const errores: ErrorExtraccion[] = [];
  const portero = crearPortero(archivo.name, errores, opciones);

  // Los callbacks de fflate son SÍNCRONOS dentro de push(): UNA entrada en
  // vuelo a la vez. `partesEnVuelo === null` → descartar chunks (entrada
  // omitida, rechazada en vuelo o aborto).
  let partesEnVuelo: Uint8Array[] | null = null;
  let nombreEnVuelo = "";
  let comprimidosEmpujados = 0; // bytes de zip empujados al stream
  let inicioComprimidoEntrada = 0; // marca por entrada → ratio incremental
  let corrupto = false; // fflate reportó error de stream (ondata con err)
  let entradasVistas = 0; // ¿se PARSEÓ siquiera una entrada? (diagnóstico honesto)
  const abortado = () => portero.lleno() || portero.reventado() || corrupto;

  const uz = new Unzip();
  uz.register(UnzipInflate); // STORED (0) lo resuelve Unzip de fábrica
  uz.onfile = (f) => {
    if (abortado()) return; // tras un aborto no se arranca NADA más
    entradasVistas++;
    if (f.name.endsWith("/")) return; // directorio
    nombreEnVuelo = nombreDeEntrada(f.name);
    inicioComprimidoEntrada = comprimidosEmpujados;
    if (!portero.clasificar(f.name, f.size, f.originalSize)) {
      // Omitida (anidado/no-imagen/límite/techo/ratio de cabecera): NO se
      // arranca — jamás se descomprime. fflate retiene sus bytes
      // COMPRIMIDOS en su buffer interno hasta descartar el stream: acotado
      // por el tamaño del zip, que ya está en RAM. Sin costo de CPU.
      partesEnVuelo = null;
      return;
    }
    partesEnVuelo = [];
    f.ondata = (err, chunk, final) => {
      if (err) {
        corrupto = true; // método de compresión desconocido / stream roto
        return;
      }
      if (chunk && chunk.length) {
        const veredicto = portero.contabilizar(
          chunk.length,
          // Aproximación del comprimido de la entrada: bytes empujados desde
          // su cabecera (±1 chunk + cabeceras — irrelevante al piso de 1 MB
          // y al umbral de ratio 100).
          Math.max(1, comprimidosEmpujados - inicioComprimidoEntrada),
        );
        if (veredicto === "ABORTAR") {
          partesEnVuelo = null;
          return; // el bucle de empuje corta tras este trozo
        }
        if (veredicto === "DESCARTAR") {
          partesEnVuelo = null; // RAM plana: el resto de la entrada se tira
        } else if (partesEnVuelo) {
          partesEnVuelo.push(chunk);
        }
      }
      if (final && partesEnVuelo) {
        if (partesEnVuelo.length) {
          archivos.push(archivoDePartes(nombreEnVuelo, partesEnVuelo));
        }
        partesEnVuelo = null;
      }
    };
    f.start();
  };

  // Empuje por trozos: cada push procesa ≤64 KB comprimidos y deja revisar
  // las señales de aborto entre trozos (un push único no es interrumpible).
  const datos = new Uint8Array(bytesZip);
  for (let i = 0; i < datos.length && !abortado(); i += CHUNK_PUSH_ZIP) {
    const fin = Math.min(i + CHUNK_PUSH_ZIP, datos.length);
    comprimidosEmpujados += fin - i;
    try {
      uz.push(datos.subarray(i, fin), fin >= datos.length);
    } catch {
      // fflate lanza al parsear/inflar corrupto (≡ unzipSync de siempre).
      if (!archivos.length && !errores.length) throw new Error("PROTEGIDO_O_CORRUPTO");
      // Extracción PARCIAL: lo conseguido se encola + fila del fallo.
      errores.push({ nombre: archivo.name, motivo: "PROTEGIDO_O_CORRUPTO" });
      return { archivos, errores };
    }
  }
  if (corrupto) {
    // err() reportado en ondata (método de compresión desconocido —
    // unzipSync tampoco podía con esto): mismo trato que el catch de arriba.
    if (!archivos.length && !errores.length) throw new Error("PROTEGIDO_O_CORRUPTO");
    errores.push({ nombre: archivo.name, motivo: "PROTEGIDO_O_CORRUPTO" });
    return { archivos, errores };
  }
  if (!archivos.length && !errores.length) {
    // Diagnóstico honesto (mismo espíritu del D35 del PDF): un zip donde ni
    // siquiera se PARSEÓ una entrada es basura/corrupto (unzipSync también
    // lanzaba) → PROTEGIDO_O_CORRUPTO. Un zip VÁLIDO sin fotos dentro es
    // SIN_IMAGENES_DENTRO (motivo de siempre).
    throw new Error(entradasVistas === 0 ? "PROTEGIDO_O_CORRUPTO" : "SIN_IMAGENES_DENTRO");
  }
  return { archivos, errores };
}

/** RAR con node-unrar-js (wasm MIT). El wasmBinary viaja EXPLÍCITO desde el
 *  propio paquete (asset de node_modules resuelto por el bundler — ver
 *  cabecera del módulo). Contraseña/corrupto → fila ERROR (kit T2.2).
 *  R5 (M-1): el generador de extract() ya era perezoso, pero extraía
 *  TAMBIÉN lo no-imagen y no topaba bytes. Ahora el PREDICADO `files`
 *  corre POR CABECERA (packSize/unpSize) ANTES de extraer cada entrada —
 *  lo rechazado jamás se descomprime (readFile(skip=true) lo salta) y la
 *  contabilidad acumulada corta el generador al reventar el techo. Mismos
 *  topes y motivo que zip (portero compartido). */
async function extraerRar(
  archivo: File,
  opciones?: OpcionesGuardaR5,
): Promise<ResultadoExtraccion> {
  const [{ createExtractorFromData }, wasmBinario] = await Promise.all([
    import("node-unrar-js"),
    fetchWasmUnrar(),
  ]);
  // D35 (UX-1): lectura de disco ≠ corrupción del rar (ver extraerPdf).
  let bytesRar: ArrayBuffer;
  try {
    bytesRar = await archivo.arrayBuffer();
  } catch {
    throw new Error("ARCHIVO_ILEGIBLE");
  }
  let extractor: Awaited<ReturnType<typeof createExtractorFromData>>;
  try {
    extractor = await createExtractorFromData({
      wasmBinary: wasmBinario,
      data: bytesRar,
    });
  } catch {
    throw new Error("PROTEGIDO_O_CORRUPTO");
  }
  const archivos: File[] = [];
  const errores: ErrorExtraccion[] = [];
  const portero = crearPortero(archivo.name, errores, opciones);
  let protegiDoAvisado = false;
  try {
    const extraidos = extractor.extract({
      // R5: el predicado corre por cabecera, ANTES de extraer cada entrada.
      files: (cabecera) => {
        if (portero.lleno()) return false; // tras el límite: silencio (≡ break)
        if (cabecera.flags.directory) return false;
        if (cabecera.flags.encrypted) {
          // Entrada cifrada: el guard del kit manda (UNA fila por archivo).
          if (!protegiDoAvisado) {
            protegiDoAvisado = true;
            errores.push({ nombre: archivo.name, motivo: "PROTEGIDO_O_CORRUPTO" });
          }
          return false;
        }
        return portero.clasificar(cabecera.name, cabecera.packSize, cabecera.unpSize);
      },
    });
    for (const entrada of extraidos.files) {
      // Corte honesto: límite/techo ya dejaron su fila — dejar de tirar del
      // generador (el wasm deja de descomprimir en cuanto se abandona).
      if (portero.lleno() || portero.reventado()) break;
      const datos = entrada.extraction;
      // 'skipped' = rechazada por el portero (predicado) — sin datos, sin fila.
      if (!datos || typeof datos === "string") continue;
      const veredicto = portero.contabilizar(datos.length, entrada.fileHeader.packSize);
      if (veredicto === "ABORTAR") break; // techo acumulado: fila ya dejada
      if (veredicto === "DESCARTAR") continue; // cabecera mintió: fila ya dejada
      archivos.push(archivoDePartes(nombreDeEntrada(entrada.fileHeader.name), [datos]));
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
