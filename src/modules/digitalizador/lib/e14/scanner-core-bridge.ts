/**
 * RealCoreBridge — el motor REAL de @jg-stevan/scanner-core (SPEC-fase-logica §5).
 * FASE LÓGICA L2: fuente ARCHIVO completa —
 *   fileToCaptureDataUrl → detectDocumentEdges → processImage →
 *   evaluateQuality → requestOcr → mapeo §4 → Acta.
 * FASE LÓGICA L3 (§5 CAMARA): la fuente CÁMARA reusa EL MISMO pipeline con
 *   dos entradas —
 *   · `archivo` (foto ya capturada por ZSL / captureSmart / cámara nativa
 *     iOS — la ruta del spec §7: "la foto entra al mismo pipeline (como
 *     ARCHIVO, L2)");
 *   · `frameActual` (video con stream vivo, último recurso) → grab síncrono
 *     a canvas a RESOLUCIÓN DEL STREAM → dataUrl → pipeline. El grab debe
 *     ocurrir ANTES de que React desmonte el visor (el stream se detiene al
 *     cambiar a ANALIZANDO), por eso se hace en el arranque síncrono de
 *     escanearActa.
 * Mapeo de score §4.1 (techos por level), gate de legibilidad §4.2 (el OCR
 * manda sobre el score: ILEGIBLE calca la rechazada v2) y timeout global de
 * 15 s que RESUELVE un acta RECHAZADA (nunca congela la UI ni revienta el
 * flujo de toasts del store). Etiquetas de etapa idénticas por fuente.
 * FASE LÓGICA L5 (§7.5): `recortar` — re-ejecuta §5 sobre `fotoOriginal` con
 * el QUAD MANUAL (F5-MANUAL del core: `manual: true` respeta el quad al
 * píxel, sin refine) → fotoProcesada nueva → evaluateQuality + gate OCR →
 * acta ACTUALIZADA. El rescate D20 NO consume intento (fuente/intento/
 * maxIntentos/paginación se preservan por spread del acta de entrada).
 *
 * Lo que sigue simulado (votos/firmas/ubicación) se rellena del seed exacto
 * (§0: no se presenta como extraído).
 *
 * UX-REAL F1 (SPEC-ux-real-bn-editor §F1, D35): SIMULACIÓN también pasa por
 * este pipeline — la fuente carga el acta E-14 REAL incluida (§1) y la trata
 * EXACTAMENTE como un `archivo` de IMPORTAR (mismo File → fileToCaptureDataUrl
 * → F-IMPORT: EXIF/12MP). El mock de la fase gráfica se retiró.
 */
import {
  detectDocumentEdgesDetail,
  evaluateQuality,
  fileToCaptureDataUrl,
  processImage,
} from "@jg-stevan/scanner-core/image-processor";
import type { OrigenQuad } from "@jg-stevan/scanner-core/image-processor";
// KIT e14-masiva-ux-v1 (T1): mecanismo de warm-up del worker OpenCV que ya
// expone el core (el mismo que ScanView.tsx:757 invoca al montar) — la
// detección al importar espera al worker en vez de caer al Sobel de una.
import {
  getScannerWorker,
  warmUpScannerWorker,
} from "@jg-stevan/scanner-core/detector-client";
import { ocrTextIsValid } from "@jg-stevan/scanner-core/ocr";
// KIT e14-motor-rapidocr-v1 (PROD-2 §3): motor de OCR de producción — módulo
// compartido con el informe (singleton de sesión ÚNICO, pitfall §9.6). El
// requestOcr del core SOLO vive en motores.ts (celda «actual» de la matriz —
// instrumento congelado, pitfall §9.2).
import { defaultQuad } from "@jg-stevan/scanner-core/types";
import type {
  PageFilter,
  PageQuality,
  Quad,
} from "@jg-stevan/scanner-core/types";
import { ACTA_MOCK } from "./seed";
import { statusDeScore } from "./types";
import { cargarDivipol } from "./divipol";
import {
  clasificarCabecera,
  faltaSeccionInferior,
  PATRON_CABECERA,
  tituloYUbicacionDe,
  tipoDeBanda,
  type ClasificacionE14,
} from "./clasificador";
// KIT e14-optimizacion-v1 (T1): los 4 decodes del bridge (calidad ×2,
// esquinas, banda) pasan por el memo FIFO tope 2 de image-utils — misma
// imagen, una sola decodificación por dataURL del acta en vuelo.
import { loadImageMemo, procesadaVaciaDataUrl } from "./image-utils";
// KIT identificacion-codigo-v1 (FASE F, Task 120): marcas fiduciales de
// esquina sobre el crop ya enderezado — señal «sin recortar» que ve los
// recortes SUPERIORES que faltaSeccionInferior (kit 118, solo inferior) no ve.
import {
  ESQUINAS_OK,
  cuatroEsquinasFaltan,
  ladoEsquinaFaltante,
  marcasEsquina,
  trazaEsquinas,
  type EsquinasActa,
} from "./integridad";
// GUARD-BORDE Rev. 2 (SPEC-e14-guard-borde §2-§3, D1/D3): la verificación de
// completitud vive en helper ÚNICO (completitud.ts) — «la geometría sospecha,
// la tinta condena» — usado por AMBOS pipelines (escaneo y recorte, AC11).
import { verificarCompletitud, type ResultadoCompletitud } from "./completitud";
// KIT e14-gate-v2 (FASE G2): marcador OBLIGATORIO de votos — helper ÚNICO
// compartido con el guard de completitud (motorTinta, cero duplicación).
import { medirZonaVotos } from "./marcadores";
// D63-C — KIT e63c-quad-gate-escaneo-v1: detector del MARCO IMPRESO del E-14
// para el gate de escaneos (T2) — fotos y SIM jamás lo invocan (guards).
import { evaluarMarcoImpreso, type MarcoEscaneo, type MarcoImpreso } from "./marco-escaneo";
// KIT e14-score-lectura-v1: señal de LECTURA del score v2 (módulo puro — §4-A).
import {
  PISO_LECTURA_FUERTE,
  TECHO_LECTURA_DEBIL,
  lazoPerdonadoPorLectura,
  senalDeLectura,
  type NivelLectura,
} from "./senal-lectura";
// §1 (SPEC-ux-real-bn-editor): acta E-14 real del dueño (Galaxy A56 5G) —
// import estático: Next resuelve el basePath /web-scanner del deploy estático.
// REFRESCO 2026-10-21 (lote JPG.rar del dueño): el contenido del asset es
// AHORA la mejor foto del lote nuevo (1152×2048, nítida/flat — elegida por
// VLM + métricas Laplaciano: lap-var 3203, la más alta del lote).
import actaSimUrl from "@/modules/digitalizador/assets/acta-e14-real.jpg";
// §G-1 (SPEC-camara-funcional): las 3 actas del dueño para la SIMULACIÓN de
// scores — [0] óptima (pipeline COMPLETO con detect+warp+bw) · [1] intermedia
// (as-is, §D6 Rev. 3) · [2] baja (as-is, §D7 Rev. 3). Los flags viajan en la
// tabla ACTAS_SIM de abajo (§D8).
// REFRESCO 2026-10-21 (lote JPG.rar): contenidos nuevos del dueño — [0] la
// nítida/plana del lote (lap-var 3203, WhatsApp 1152×2048) · [1] la media
// (1800×2400, lap-var 632, leve perspectiva) · [2] la borrosa (1800×2400,
// lap-var 281, arrugas + firmas cargadas). Extras [3]/[4] para el ciclo
// rotativo (§G): la de arrugas pronunciadas y la de sombra lateral.
import actaSimIntermediaUrl from "@/modules/digitalizador/assets/acta-sim-intermedia.jpg";
import actaSimBajaUrl from "@/modules/digitalizador/assets/acta-sim-baja.jpg";
import actaSimExtra1Url from "@/modules/digitalizador/assets/acta-sim-extra-1.jpg";
import actaSimExtra2Url from "@/modules/digitalizador/assets/acta-sim-extra-2.jpg";
import type { Acta, ActaFirma, ActaStatus, DiagnosticoActa, ProgresoAnalisis } from "./types";
import type { E14Bridge, OpcionesEscaneo } from "./bridge";
// KIT e14-motor-rapidocr-v1 (PROD-2 §3): adaptador del motor de producción.
import { rapidOcrInit, rapidOcrReconocer } from "./ocr/rapidocr";
// KIT e14-orientacion-auto-v1 (T-A2/A3): probe de orientación por confianza
// de rec + anclas (§2.1) — corre ANTES del OCR completo en AMBOS pipelines
// (escaneo y pipelineRecorte). SIM OMITIDO (guard — chips 8.2/7.0/4.3
// intactos, §2.2); JAMÁS lanza (catch interno — el pipeline no depende, §5).
import { probeOrientacion, rotarDataUrl } from "./orientacion";
// KIT e14-orientacion-qr-v1 — la brújula QR decide la rotación por el
// cuadrante del QR (bench v8.3: 4/4); el sondeo OCR queda como red de
// seguridad cuando el QR no lee. leerFlags = kill-switch del dueño (§D).
import { brujulaQrOrientacion, type BrujulaQr } from "./orientacion-qr";
import { leerFlags } from "./flags";
// WAVE2 A1 — tipo del resultado del probe (para el diag de la mini descartada por el fallo seguro).
import type { ProbeOrientacion } from "./orientacion";
// KIT e14-ocr-escalonado-v1 (§2): caps del det-preprocess (op4) expuestos por
// el motor + decisión/elegir del módulo PURO nuevo (testable headless — bun).
import { DET_CAP_PROD, DET_CAP_RAPIDO } from "./ocr/rapidocr";
import { anclasDe, elegirMejor, necesitaSegunda } from "./ocr-escalonado";
// KIT e14-diagnostico-autoenvio-v1 (C1): registro del DESENLACE montado justo
// donde hoy se escribe el log de auditoría (UNA sola fuente de verdad — §9.6).
import { construirDiagnostico } from "./diagnostico";
import { canvasCon } from "./image-utils"; // SPRINT-A A3 — factory de canvas
import { logger } from "../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)

/** KIT e14-masiva-tiempos-v1 (PR-2, prefetch): memo de decode POR INSTANCIA
 *  de File (WeakMap — GC-friendly, no retiene blobs). El mismo File JAMÁS
 *  se decodifica dos veces: el prefetch del runner MASIVA
 *  (precargarDecodeArchivo) oculta el decode de N+1 tras el OCR de N y el
 *  pipeline de N+1 golpea la memo (~0 ms — AC-P1). TRANSPARENTE para todos
 *  los flujos existentes: misma promesa, mismo resultado; si el decode
 *  falla, la entrada sale de la memo y el siguiente intento re-decodifica
 *  (comportamiento de hoy — kit AC-P2 «jamás bloquea»). */
const decodeMemo = new WeakMap<File, Promise<string>>();

function decodeArchivoMemo(file: File): Promise<string> {
  let p = decodeMemo.get(file);
  if (!p) {
    p = fileToCaptureDataUrl(file);
    decodeMemo.set(file, p);
    void p.catch(() => {
      if (decodeMemo.get(file) === p) decodeMemo.delete(file);
    });
  }
  return p;
}

// SPRINT-A (perf/decode-once-v1) A5: el export precargarDecodeArchivo fue
// eliminado — DEAD desde D66 (el prefetch del runner se re-apuntó a
// asegurarMaestro; 0 anclas en scripts/, 0 usos en src). La memo interna
// decodeArchivoMemo sigue viva (el pipeline la usa).

/** Timeout de seguridad global §5 (worker colgado en gama baja).
 *  KIT e67-watchdog-rescate-v1 (M-e67-0 / cambio A): 15_000 → 120_000 — el
 *  plan del dueño pedía subirlo (asumía 30 s; el default REAL era 15 s desde
 *  el split del repo — desviación documentada en el REPORTE). Evidencia:
 *  un ARCHIVO real terminó VÁLIDO a los ~53.5 s y el watchdog de 15 s ya lo
 *  había rechazado (resultado descartado en silencio). 120 s da colchón
 *  frente al peor caso observado (53.5 s + 36 líneas OCR) sin esperar de
 *  más a un colgaje real. MASIVA no cambia: pasa su propio presupuesto
 *  (OpcionesEscaneoConTimeout.timeoutMs — WATCHDOG_MS del runner). El
 *  RECORTE manual conserva su RECORTE_TIMEOUT_MS propio (ruta distinta). */
const TIMEOUT_MS = 120_000;
/** KIT e14-recorte-manual-v1 (T1): presupuesto del RECORTE manual — el warp
 *  del editor mide 14–17.4 s en el equipo del dueño (OCR solo: 9.8–14.3 s),
 *  al borde del límite de 15 s del escaneo. El timeout SIGUE RECHAZANDO
 *  (gate/score intactos — §5); lo único que cambia es qué foto muestra el
 *  acta resultante: el recorte ya horneado (parcial), no la foto vieja. */
const RECORTE_TIMEOUT_MS = 30_000;
/** KIT e14-recorte-manual-v1 (T1): lo que el pipeline del RECORTE ya horneó
 *  cuando el presupuesto vence — campos del return normal que SOLO dependen
 *  del warp (etapa 1). Vacío = el warp no alcanzó → acta vieja (igual a hoy). */
type ParcialRecorte = {
  fotoProcesada?: string;
  procesadaVacia?: boolean;
  quadDetectado?: Quad;
  rotation?: number;
};
/** KIT e14-masiva-ux-v1 (T1): tope de cada espera del warm-up del worker
 *  OpenCV en la detección (1ª espera antes del intento + 1ª antes del
 *  reintento — §3-T1). Vencido el tope se continúa como hoy (fallback
 *  Sobel): la espera JAMÁS bloquea el pipeline más de 5 s por paso. */
const TOPE_ESPERA_WORKER_MS = 5_000;
/** Techos/labels del mapeo §4 y el gate §4.2. */
const DETALLE_ILEGIBLE = "CÓDIGO DE BARRAS Y CABECERA NO DETECTADOS";
const DETALLE_TIMEOUT = "TIEMPO DE PROCESADO EXCEDIDO";
const DETALLE_GENERICO = "SCORE INSUFICIENTE PARA TRANSMISIÓN";
// §F-5 (SPEC-camara-funcional): detalle del rechazo por acta INCOMPLETA —
// la captura corta el papel aunque la cabecera sea legible.
const DETALLE_INCOMPLETA = "EL ACTA ESTÁ CORTADA EN EL ENCUADRE — ALÉJATE UN POCO Y CAPTURA EL ACTA COMPLETA";
// KIT e63d-escaneo-ya-recortado-v1 (F3.4): copy del rechazo INCOMPLETA para
// ARCHIVO/escaneo — «aléjate un poco» no tiene sentido para un archivo
// subido (no hay cámara que alejar). Mismo tipo de rechazo, copy del medio.
const DETALLE_INCOMPLETA_ESCANEO =
  "EL ESCANEO PARECE CORTADO — REPITE EL ESCANEO INCLUYENDO EL ACTA COMPLETA";
// KIT e14-gate-v2 (FASE G2): detalle del rechazo por el MARCADOR
// OBLIGATORIO de votos fallido — copy CORTO y descriptivo (decisión del
// dueño: SIN guía de cámara). El rechazo directo regresa el flujo a
// captura (comportamiento existente de RECHAZADA).
const DETALLE_SIN_VOTOS = "ACTA SIN VOTOS VISIBLES";
// §D1 (SPEC-e14-score-ocr): modelo del score por RECONOCIMIENTO — techo de
// una foto SIN SEÑAL de contenido del acta (bolsa de papas, pared, borrosa
// total): por debajo de RECHAZADA (6.5) → «score bajo» garantizado. El
// detalle es el rechazo determinista §D3 (repetir, NUNCA RH en 1ª ronda).
const TECHO_SIN_SENAL = 4.9;
const DETALLE_BAJO = "NO SE RECONOCE INFORMACIÓN DEL ACTA — REPITA LA FOTO";
// D10 (SPEC-e14-guard-borde): techo del ESCUDO anti-fondo — el recorte trae
// fondo/sombra al filo (franjas ≥85% oscuras, NO tinta cortada): el acta pasa
// al gate pero NUNCA ÓPTIMA (statusDeScore: ≥8 sería ÓPTIMA — el operador
// puede preferir repetir porque el recorte trae fondo). Sin copy nuevo.
const TECHO_ESCUDO_FONDO = 7.9;

/**
 * §D1 (SPEC-e14-score-ocr): SEÑAL DE CONTENIDO del acta — se calcula DESPUÉS
 * del OCR + clasificación. El score del dueño mide el RECONOCIMIENTO («el
 * score se basa en el reconocimiento del acta por ocr y que el acta esté
 * completa»), no solo las métricas fotográficas. Señales: cabecera E-14 o
 * alguna lectura cruda del clasificador (MESA/tipo). `ocrTextIsValid` NO es
 * señal (la bolsa de papas lo pasa con texto ficticio del empaque).
 */
function senalDeContenido(texto: string, clasificacion: ClasificacionE14): boolean {
  const p = clasificacion.parciales;
  return (
    PATRON_CABECERA.test(texto) ||
    p?.cabecera === true ||
    (p?.mesa != null && Number.isFinite(p.mesa)) ||
    p?.tipo != null
  );
}

// GUARD-BORDE Rev. 2 (D1/D3): la función esActaCompleta del guard del PR #33
// (geometría: esquina al filo ≤0.001/≥0.999 o área <30% → INCOMPLETA) VIVIÓ
// aquí y hoy vive en ./completitud (verificarCompletitud) — la geometría
// pasó de CONDENAR a SER SOSPECHA: la condena exige tinta impresa cortada al
// filo del recorte (tabla de decisión §2 del spec). Historia completa del
// guard y su calibración: comentario del helper + CHANGES 0-decimoquinto.
// PATRON_CABECERA vive ahora en ./clasificador (§4.5: se mantiene como
// constante para traza/log — ya NO decide sola el estado del gate).

/** §D8.3 (SPEC-e14-score-ocr Rev. 3): quad IDENTIDAD — «el recorte es la
 *  foto entera». Con sinRecorte la detección de bordes NO corre y el quad
 *  (fracciones 0-1 de la foto) cubre TODO el encuadre: se imprime en el log
 *  como hoy (traza de auditoría) y alimenta el editor (recorte manual real
 *  sobre la foto completa) y revelar/filtros (mismo quad). */
const QUAD_IDENTITY: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/**
 * Grab del <video> a RESOLUCIÓN DEL STREAM (§5 CAMARA): canvas de
 * videoWidth×videoHeight → JPEG 0.92. Síncrono (~10 ms) — se llama ANTES de
 * que el visor se desmonte, mientras el stream sigue vivo.
 */
function capturarFrame(video: HTMLVideoElement): string | null {
  try {
    const canvas = canvasCon(video.videoWidth, video.videoHeight); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

/** Entrada del pipeline: File (ARCHIVO o foto CÁMARA) o dataUrl ya crudo.
 *  §D8.2 (SPEC-e14-score-ocr Rev. 3): el flag «sin recorte automático» viaja
 *  con el ASSET de SIMULACIÓN dentro de la entrada (parámetro interno
 *  privado — OpcionesEscaneo queda INTACTO, nada público nuevo). */
type EntradaPipeline = { archivo: File; sinRecorte?: boolean } | { dataUrl: string };

/**
 * SIMULACIÓN = pipeline real sobre el acta E-14 incluida (D35).
 * §G-2 (SPEC-camara-funcional): ciclo determinista de las 3 actas del dueño
 * (óptima → intermedia → baja → óptima…) — cada disparo consume el índice
 * actual y avanza el contador de módulo. Mismo camino que IMPORTAR: File →
 * fileToCaptureDataUrl (F-IMPORT: EXIF/12MP). Caché POR ÍNDICE a nivel de
 * módulo para no re-descargar un acta ya servida en el ciclo.
 * §D8.1 (SPEC-e14-score-ocr Rev. 3): flag «sin recorte» por ENTRADA — el
 * flag viaja con el ASSET, no con el chip (el ciclo rotativo §G lo hereda
 * automáticamente): [0] óptima = pipeline completo (hoy) · [1] b/n as-is ·
 * [2] borrosa as-is.
 */
interface ActaSim {
  src: typeof actaSimUrl;
  nombre: string;
  sinRecorte: boolean;
}
const ACTAS_SIM: readonly ActaSim[] = [
  { src: actaSimUrl, nombre: "acta-e14-real.jpg", sinRecorte: false },
  { src: actaSimIntermediaUrl, nombre: "acta-sim-intermedia.jpg", sinRecorte: true },
  { src: actaSimBajaUrl, nombre: "acta-sim-baja.jpg", sinRecorte: true },
  { src: actaSimExtra1Url, nombre: "acta-sim-extra-1.jpg", sinRecorte: true },
  { src: actaSimExtra2Url, nombre: "acta-sim-extra-2.jpg", sinRecorte: true },
];
let actaSimIdx = 0;
interface EntradaSim {
  archivo: File;
  sinRecorte: boolean;
}
const actasSimCache: EntradaSim[] = [];
async function fetchActaSimulada(): Promise<EntradaSim> {
  const idx = actaSimIdx;
  actaSimIdx = (actaSimIdx + 1) % ACTAS_SIM.length;
  const cache = actasSimCache[idx];
  if (cache) return cache;
  // ACTAS_SIM[idx].src es StaticImageData — .src.src ya resuelve el basePath
  // /web-scanner del deploy estático (en dev: /_next/static/media/...).
  const res = await fetch(ACTAS_SIM[idx].src.src);
  if (!res.ok) throw new Error("SIMULACIÓN: no se pudo cargar la imagen incluida");
  // File con nombre real del asset (.jpg — evita el camino HEIC).
  const entrada: EntradaSim = {
    archivo: new File([await res.blob()], ACTAS_SIM[idx].nombre, {
      type: "image/jpeg",
    }),
    sinRecorte: ACTAS_SIM[idx].sinRecorte,
  };
  actasSimCache[idx] = entrada;
  return entrada;
}

/**
 * §D3 (SPEC-e14-simulacion-scores): asset FIJO por score de chip — mapeo
 * determinista dueño (la completa = óptima · la cortada = intermedio · la
 * borrosa = bajo): 8.2 → acta-e14-real.jpg · 7.0 → acta-sim-intermedia.jpg ·
 * 4.3 → acta-sim-baja.jpg. Reutiliza la MISMA caché por índice del ciclo
 * rotativo (§G del PR #33, que queda INTACTO — esta vía solo cambia QUÉ
 * índice se sirve: el del chip, nunca el contador rotativo). El flag
 * sinRecorte del asset viaja con la entrada (§D8.1).
 */
function indiceActaPorScore(score: number): number {
  if (score >= 8) return 0; // ÓPTIMA [8.2] → la acta completa, nítida
  if (score >= 6.5) return 1; // MEDIO [7.0] → la b/n del dueño, as-is (Rev. 3)
  return 2; // BAJA [4.3] → la borrosa del dueño, as-is (Rev. 3)
}
async function fetchActaSimPorScore(score: number): Promise<EntradaSim> {
  const idx = indiceActaPorScore(score);
  const cache = actasSimCache[idx];
  if (cache) return cache;
  const res = await fetch(ACTAS_SIM[idx].src.src);
  if (!res.ok) throw new Error("SIMULACIÓN: no se pudo cargar la imagen incluida");
  const entrada: EntradaSim = {
    archivo: new File([await res.blob()], ACTAS_SIM[idx].nombre, {
      type: "image/jpeg",
    }),
    sinRecorte: ACTAS_SIM[idx].sinRecorte,
  };
  actasSimCache[idx] = entrada;
  return entrada;
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

// §X (SPEC-score-legible): piso de legibilidad por contraste.
// §G3 (KIT e14-gate-v2): el PISO de identificación (=10) ELIMINADO — la
// identificación AUTO de la cabecera ya NO fuerza 10/10. El fallo del
// 2026-10-16 (acta SIN votos 10/10 y auto-enviada) nació aquí: el piso se
// aplicaba AL FINAL y mandaba sobre todos los techos. El score llega a 10
// SOLO por métricas reales; los votos los cuida el gate de marcadores
// (./marcadores) y la identificación sigue alimentando SOLO la
// clasificación AUTO del gate (evaluarGate — intocable).
const PISO_CONTRASTE_LEGIBLE = 80; // ≈ excellentQuality().contrast=84 del core

/** §X.1 (SPEC-score-legible): contraste efectivo — una foto de documento
 *  (papel blanco ~85 % del encuadre) tiene dispersión global de luminancia
 *  BAJA POR DISEÑO aunque la tinta sea nítida (evidencia §0.2: metricas=
 *  {sharpness:80 brightness:95 contrast:22} → 6.7 MODERADA de un acta
 *  clasificada AUTO). El contraste global del CRUDO no es evidencia de
 *  ilegibilidad cuando el OCR leyó texto válido → piso de acta legible.
 *  El OCR manda (principio §4.2 extendido).
 *  KIT e14-score-lectura-v1 (C2): el spread de TINTA del papel
 *  (`contrastPapel` — p95−p5 del recorte a hi-res) entra al max: rescata
 *  actas borrosas-pero-legibles SIN depender del binario del OCR. El piso
 *  existente QUEDA dentro del max (pitfall §9.6 — quitarlo es regresión
 *  silenciosa en actas con tinta débil). */
function contrasteEfectivoDe(q: PageQualityV2, ocrLegible: boolean): number {
  return Math.max(q.contrast, q.contrastPapel, ocrLegible ? PISO_CONTRASTE_LEGIBLE : 0);
}

/** Mapeo §4.1: PageQuality del core → score 0-10 (1 decimal) con techos por
 *  level. §X (SPEC-score-legible): recibe señales de legibilidad — OCR válido
 *  y clasificación AUTO (identificación completa). §D1 (SPEC-e14-score-ocr):
 *  `conSenal` extiende el paquete — SIN señal de contenido del acta el score
 *  no describe una digitalización → techo 4.9 («score bajo»). */
function scoreDeCalidad(
  q: PageQualityV2,
  senales?: {
    ocrLegible: boolean;
    identificada: boolean;
    conSenal?: boolean;
    pisoPerfecto?: boolean;
  },
): number {
  const contrasteEf = contrasteEfectivoDe(q, senales?.ocrLegible ?? false);
  // KIT e14-score-lectura-v1 (B2/C1): la nitidez del score v2 es la HI-RES
  // (mediana de 9 tiles del Laplaciano a ~1000px — §4-B1). El 0 del fallback
  // sin señal (degradación §5) cae a la del core (W=120) por el ||.
  const sharpnessV2 = q.sharpnessHi || q.sharpness;
  const bruto = (sharpnessV2 * 0.4 + q.brightness * 0.3 + contrasteEf * 0.3) / 10;
  let score10 = Math.round(bruto * 10) / 10;
  // KIT e14-luz-sim-puntos-v1 (T-D): piso de LECTURA PERFECTA — lectura
  // FUERTE con ≥8/10 anclas + nitidez hi-res ≥90 + tinta de papel ≥75 =
  // evidencia dura de acta bien capturada; el BRILLO bajo (interior/vidrio/
  // sombra) deja de castigar. Va ANTES de los caps (lección §G3: el piso
  // JAMÁS vence a los techos — recortada/incompleta/sin-votos/sin-senal
  // siguen mandando después; aquí el único cap posterior posible es
  // fair/poor y las condiciones ya lo excluyen por construcción).
  if (senales?.pisoPerfecto) score10 = 10;
  let level = q.level;
  if (sharpnessV2 !== q.sharpness || contrasteEf !== q.contrast) {
    // Fuente: packages/scanner-core/src/image-processor.ts evaluateQuality —
    // fórmula y umbrales del level DUPLICADAS aquí (packages/ es intocable,
    // regla de oro) SOLO para recalcular el techo con las señales v2 (§3
    // paso 2 del kit: misma fórmula/umbrales 80/62/45, solo cambia la
    // entrada — sharpnessV2 + contrasteEfectivo).
    const scoreCore = sharpnessV2 * 0.45 + q.brightness * 0.25 + contrasteEf * 0.3;
    level =
      scoreCore >= 80 ? "excellent" : scoreCore >= 62 ? "good" : scoreCore >= 45 ? "fair" : "poor";
  }
  if (level === "fair") score10 = Math.min(score10, 7.9); // techo ADVERTENCIA
  if (level === "poor") score10 = Math.min(score10, 6.4); // techo RECHAZADA
  // §D1 (SPEC-e14-score-ocr): techo SIN SEÑAL de contenido (AUTO exige tipo
  // leído → implica señal — no colisionan). Fórmulas/techos existentes BYTE
  // A BYTE intactos (§7 prohibido).
  if (senales && !senales.conSenal) score10 = Math.min(score10, TECHO_SIN_SENAL);
  // §G3 (KIT e14-gate-v2): SIN piso por identificación — los techos de
  // arriba y las métricas reales deciden el score; `identificada` (el
  // parámetro sigue llegando) alimenta SOLO la clasificación AUTO del gate
  // (evaluarGate), NUNCA el score.
  return score10;
}

// ── KIT e14-visor-accion-y-score-v1 (FASE S §S.1) ──────────────────────
/** Diagnóstico del recorte de `calidadDeActa` (out-param — mismo patrón del
 *  acumulador `parcial` del pipeline): dimensiones del bbox REAL usado (px)
 *  y si se activó el fallback al frame completo. Alimenta `crop=` en los 2
 *  logs de auditoría (fallback → `crop=full`). */
interface InfoCrop {
  w: number;
  h: number;
  fallback: boolean;
}

/** Margen del bbox: +3% del PROPIO bbox por lado (clamp [0,1]) — evita
 *  tinta al filo falsa por píxel (§S.1.1). */
const MARGEN_BBOX_PCT = 0.03;
/** Bbox degenerado: lado < 8 px REALES (o NaN/∞) → fallback al frame
 *  completo (§S.1.1 — comportamiento de hoy). */
const BBOX_MIN_PX = 8;
/** Cap del canvas del recorte: lado más largo ≤ 2000 px — NUNCA upscalar
 *  (§S.1.1; evaluateQuality baja a W=120 igual — costo: un drawImage). */
const CROP_LADO_MAX = 2000;

// ── KIT e14-score-lectura-v1 (C1 — nitidez de ALTA resolución) ──────────
/** Lado largo del canvas de análisis hi-res (§3): costo <80 ms; el cap
 *  CROP_LADO_MAX=2000 ya limita el recorte de origen (solo DOWNSCALE —
 *  pitfall §9.1: NUNCA getImageData de la foto 12MP completa). */
const HI_RES_LADO = 1000;
/** MISMA normalización del core (evaluateQuality: σ(Laplaciano)×2.2 cap
 *  100 — cambio solo de resolución, pitfall del kit §4-B1). */
const LAP_NORM = 2.2;
/** Spread de tinta del documento legible típico (§3): papel ~220 − tinta
 *  ~60 = 160 → 100. Normaliza contrastPapel. */
const PAPER_SPREAD_NORM = 160;

/** KIT e14-score-lectura-v1 (§4-B1): PageQuality del core EXTENDIDO con las
 *  2 señales hi-res del recorte. El tipo del core es INTOCABLE (pitfall
 *  §9.7 — nunca modificar el paquete ni redeclarar el import). */
interface PageQualityV2 extends PageQuality {
  /** min(100, mediana de σ(Laplaciano) de 9 tiles 3×3 × 2.2) a ~1000px. */
  sharpnessHi: number;
  /** min(100, (p95−p5 del histograma de luminancia del recorte) × 100/160). */
  contrastPapel: number;
}

/** Señales hi-res del recorte (§4-B1): Laplaciano 4-vecinos sobre gris;
 *  MEDIANA (no promedio — pitfall §9.3: un reflejo especular inflaría el
 *  promedio con su filo) de la varianza de 9 tiles 3×3;
 *  sharpnessHi = min(100, σ_mediana×LAP_NORM). Histograma 256 bins del MISMO
 *  gris para p5/p95 (percentiles por barrido acumulado — pitfall §9.2:
 *  NUNCA sort de ~10⁶ píxeles); contrastPapel = min(100, (p95−p5)×100/160).
 *  Un solo getImageData (willReadFrequently ya existe). Cualquier fallo →
 *  0/0 (el score v2 degrada al comportamiento actual — §5 del kit). */
function senalHiResDeCanvas(
  origen: HTMLCanvasElement | HTMLImageElement,
  wSrc: number,
  hSrc: number,
): { sharpnessHi: number; contrastPapel: number } {
  try {
    const lado = Math.max(wSrc, hSrc);
    if (!lado || !Number.isFinite(lado)) return { sharpnessHi: 0, contrastPapel: 0 };
    // Solo DOWNSCALE (§4-B1/pitfall §9.1): el recorte ya vive a ≤2000px, se
    // deriva a ≤1000; si es más chico se queda tal cual (nunca upscale).
    const escala = Math.min(1, HI_RES_LADO / lado);
    const w = Math.max(1, Math.round(wSrc * escala));
    const h = Math.max(1, Math.round(hSrc * escala));
    const cv = canvasCon(w, h); // SPRINT-A A3 — factory
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { sharpnessHi: 0, contrastPapel: 0 };
    ctx.drawImage(origen, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    // Gris único (luminancia BT.601 como el core) + histograma 256 bins.
    const gris = new Uint8ClampedArray(w * h);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < gris.length; i++, p += 4) {
      const g = ((data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000) | 0;
      gris[i] = g;
      hist[g]++;
    }
    // Laplaciano 4-vecinos por tile (3×3 rejilla) → varianza → mediana.
    const tw = Math.max(1, Math.floor(w / 3));
    const th = Math.max(1, Math.floor(h / 3));
    const vars: number[] = [];
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        const x0 = tx * tw;
        const y0 = ty * th;
        const x1 = tx === 2 ? w : x0 + tw;
        const y1 = ty === 2 ? h : y0 + th;
        let sum = 0;
        let sumSq = 0;
        let n = 0;
        for (let y = y0 + 1; y < y1 - 1; y++) {
          for (let x = x0 + 1; x < x1 - 1; x++) {
            const i = y * w + x;
            const lap = gris[i - 1] + gris[i + 1] + gris[i - w] + gris[i + w] - 4 * gris[i];
            sum += lap;
            sumSq += lap * lap;
            n++;
          }
        }
        if (n > 0) vars.push(sumSq / n - (sum / n) * (sum / n));
      }
    }
    // Mediana de ≤9 varianzas (sort trivial — el pitfall §9.2 es del
    // histograma de PÍXELES, no de estos 9 valores).
    vars.sort((a, b) => a - b);
    const medianaVar = vars.length > 0 ? vars[Math.floor(vars.length / 2)] : 0;
    const sharpnessHi = Math.min(100, Math.sqrt(Math.max(0, medianaVar)) * LAP_NORM);
    // p5/p95 por barrido acumulado del histograma (SIN sort — pitfall §9.2).
    const total = w * h;
    let acc = 0;
    let p5 = 0;
    let p95 = 255;
    for (let b = 0; b < 256; b++) {
      acc += hist[b];
      if (acc >= total * 0.05) {
        p5 = b;
        break;
      }
    }
    acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += hist[b];
      if (acc >= total * 0.95) {
        p95 = b;
        break;
      }
    }
    const contrastPapel = Math.min(100, ((p95 - p5) * 100) / PAPER_SPREAD_NORM);
    return { sharpnessHi, contrastPapel };
  } catch {
    return { sharpnessHi: 0, contrastPapel: 0 };
  }
}

/** Bbox del acta en PÍXELES REALES desde el QUAD normalizado 0-1 (misma
 *  convención que ya consumen processImage y verificarCompletitud — TL,TR,BR,
 *  BL en fracciones; NO se inventa conversión nueva). Bbox = min/max de x e y
 *  de los 4 puntos + margen. null si degenerado (NaN/∞ o lado < BBOX_MIN_PX). */
function bboxActaEnPx(
  quad: Quad,
  w: number,
  h: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) {
    return null;
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * MARGEN_BBOX_PCT;
  const padY = (maxY - minY) * MARGEN_BBOX_PCT;
  const x0 = Math.max(0, minX - padX);
  const x1 = Math.min(1, maxX + padX);
  const y0 = Math.max(0, minY - padY);
  const y1 = Math.min(1, maxY + padY);
  const sx = Math.round(x0 * w);
  const sy = Math.round(y0 * h);
  const sw = Math.round((x1 - x0) * w);
  const sh = Math.round((y1 - y0) * h);
  if (sw < BBOX_MIN_PX || sh < BBOX_MIN_PX) return null;
  return { sx, sy, sw, sh };
}

/** FASE S (§S.0 — diagnóstico cerrado): el score ya NO mide la MESA — mide
 *  el ACTA. `evaluateQuality` del core (paquete INTOCABLE) baja a W=120 sobre
 *  TODO el encuadre: el acta vertical deja el papel en ~25-40% del cuadro y
 *  la mesa oscura manda en el promedio (brightness 24-34 → peor métrica →
 *  chip LUMINOSIDAD → 7.0-7.7 ADVERTENCIA en actas perfectas; la MISMA acta
 *  sin fondo da 9.0). Helper: decodifica `fotoOriginal`, recorta el bbox del
 *  quad (+3% por lado, clamp [0,1]) a canvas (cap 2000 px el lado largo —
 *  nunca upscalar) y evalúa ESE recorte (ImageSource acepta
 *  HTMLCanvasElement — core image-processor). Fallback conservador: bbox
 *  degenerado o cualquier fallo de decode/canvas → `evaluateQuality(
 *  fotoOriginal)` como hoy (frame completo). SIM sinRecorte (quad identidad):
 *  bbox = frame completo → mismo camino; los chips SIM siguen INYECTADOS
 *  (8.2/7.0/4.3 — §D3, no-regresión dura AC-S2). */
async function calidadDeActa(
  fotoOriginal: string,
  quad: Quad,
  info?: InfoCrop,
): Promise<PageQualityV2> {
  const marcarFallback = () => {
    if (info) {
      info.fallback = true;
      info.w = 0;
      info.h = 0;
    }
  };
  try {
    const img = await loadImageMemo(fotoOriginal);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("sin dimensiones");
    const bbox = bboxActaEnPx(quad, w, h);
    if (!bbox) throw new Error("bbox degenerado");
    const escala = Math.min(1, CROP_LADO_MAX / Math.max(bbox.sw, bbox.sh));
    const cw = Math.max(1, Math.round(bbox.sw * escala));
    const ch = Math.max(1, Math.round(bbox.sh * escala));
    const canvas = canvasCon(cw, ch); // SPRINT-A A3 — factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("sin ctx");
    ctx.drawImage(img, bbox.sx, bbox.sy, bbox.sw, bbox.sh, 0, 0, cw, ch);
    if (info) {
      info.fallback = false;
      info.w = bbox.sw;
      info.h = bbox.sh;
    }
    const calidad = await evaluateQuality(canvas);
    // KIT e14-score-lectura-v1 (C1): señales hi-res del MISMO recorte ya
    // dibujado (downscale a 1000px — un solo getImageData, <80 ms §3).
    const extra = senalHiResDeCanvas(canvas, cw, ch);
    return { ...calidad, ...extra };
  } catch {
    marcarFallback();
    const q = await evaluateQuality(fotoOriginal);
    // Fallback (§4-B1): señales hi-res del FRAME vía el MISMO helper (el
    // drawImage del helper ya escala a 1000 — nunca getImageData de 12MP);
    // si falla también → 0/0: el score v2 degrada al comportamiento actual.
    try {
      const img = await loadImageMemo(fotoOriginal);
      const extra = senalHiResDeCanvas(img, img.naturalWidth, img.naturalHeight);
      return { ...q, ...extra };
    } catch {
      return { ...q, sharpnessHi: 0, contrastPapel: 0 };
    }
  }
}

/**
 * KIT identificacion-codigo-v1 (FASE F): marcas fiduciales de esquina sobre
 * la FOTOPROCESADA (el warp del core ya la enderezó y recortó al acta — el
 * mismo contenido que evalúa calidadDeActa; ADAPTACIÓN documentada: el kit
 * dice «crop ya enderezado, mismo input que calidadDeActa» y fotoProcesada
 * ES ese crop sin duplicar lógica de recorte).
 * Devuelve null cuando NO se pudo medir (decode fallido / sin foto): la
 * política del repo es «sin señal honesta no se condena» — null JAMÁS marca
 * recorte (mismo espíritu que página desconocida en faltaSeccionInferior).
 */
async function esquinasDeActa(foto: string | undefined): Promise<EsquinasActa | null> {
  if (!foto) return null;
  try {
    const img = await loadImageMemo(foto);
    const canvas = canvasCon(img.naturalWidth, img.naturalHeight); // SPRINT-A A3 — factory
    if (!canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return marcasEsquina(canvas);
  } catch {
    return null;
  }
}

/**
 * KIT consenso-frankfurt-v1 (FASE 4, §5): segunda pasada OCR DIRIGIDA del
 * sello de la banda — el sello TRANSMISIÓN es BLANCO-sobre-negro y tesseract
 * (psm6, página completa) NO lo lee: 0 menciones en la captura de Frankfurt
 * 746 (§0-F4). Recorta la franja de la banda (x 22-88% · y 3-13% — la banda
 * vive bajo el encabezado), la INVIERTE (255-lum → tinta oscura sobre claro,
 * la geometría del sello se vuelve legible) y la escala ×2 antes del OCR
 * del core. Corre UNA sola vez y SOLO cuando `tipoDeBanda(texto)` es null
 * (presupuesto ~1-3 s, dentro del TIMEOUT_MS de 15 s del core — si venció,
 * se descarta igual). NO re-OCR del acta completa. Fallo → "" (sin banda
 * nueva: la cascada sigue con el d9 del consenso — nunca condena).
 */
// SPRINT-A (perf/decode-once-v1) A4: las dead stores ultimoOcrConf/Det/Rec
// (PROD-2 §4-C5) fueron eliminadas — se escribían 9× y NUNCA se leían
// (knip + review 23-oct; sin anclas en scripts/qa-*.ts). La traza real del
// motor vive en las líneas ocr=rapidocr de los pipelines, que capturan
// conf/det/rec de ocrEsc directamente (confOcr/detOcr/recOcr — vivas).
/** Motor de producción (PROD-2): RapidOCR PP-OCRv4 sobre el recorte original.
 *  Mismo contrato que requestOcr: texto + progreso 0→1. Sin fallback de motor
 *  (pitfall §9.3): el fallo sigue el mismo camino controlado de hoy (§5 del
 *  kit — texto vacío → gate decide). */
async function reconocerRapidOcr(
  dataUrl: string,
  onProgress?: (p: number) => void,
): Promise<string> {
  const rt = await rapidOcrInit(); // singleton de sesión (pre-warm en bg)
  const r = await rapidOcrReconocer(rt, dataUrl, onProgress);
  return r.texto;
}

/** OCR principal de un pipeline — KIT e14-ocr-escalonado-v1 (§2): 1.ª pasada
 *  con det cap RÁPIDO (1280, ~0.44× del det) → si la lectura sale débil,
 *  re-OCR completo a 1920 y QUEDARSE CON EL MEJOR (anclas de ANCLAS_LECTURA,
 *  luego conf — NUNCA automáticamente la 2.ª, §2.4). Sesión ÚNICA (§2.1): el
 *  cap es del preprocess (op4), no del modelo — el singleton no cambia.
 *  · SIM: OMITIDO (§3) — flujo de hoy a 1920, UNA pasada, 0 trazas (chips
 *    8.2/7.0/4.3 intactos por construcción).
 *  · Presupuesto (§3): el timeout EXISTENTE del pipeline manda — si la 1.ª
 *    pasada lo consume, NO hay 2.ª (sin presupuestos nuevos).
 *  · Progreso (§3): la 2.ª pasada reusa el MISMO emit de OCR (ANALIZANDO no
 *    se queda colgado).
 *  · Traza (§2.5) en línea PROPIA — append-only, parseable por el rastreador
 *    (sin línea en SIM):
 *      [e14] ocr-escalonado pasada1=1280 lectura=DEBIL reocr=1 elegido=1920 anclas1=2 anclas2=9 ms1=8200 ms2=14100
 *      [e14] ocr-escalonado pasada1=1280 lectura=FUERTE reocr=0 elegido=1280 anclas1=7 ms1=8200
 *  El downstream (banda condicional, clasificación, gate, diagnostico)
 *  consume SOLO el texto elegido (§2.4) — el caller recibe el texto ya
 *  resuelto y las métricas de la pasada elegida (SPRINT-A A4: la referencia
 *  a ultimoOcr* fue removida con sus dead stores). */
interface OcrEscalonadoSalida {
  texto: string;
  conf: number | null;
  detMs: number;
  recMs: number;
}

/** Pasada con métricas para elegirMejor (§2.4) — el ganador viaja por
 *  REFERENCIA con su cap (1280|1920) para la traza elegido=. */
interface PasadaEscalonada {
  texto: string;
  conf: number;
  detMs: number;
  recMs: number;
  cap: number;
}

async function reconocerRapidOcrEscalonado(
  fotoOcr: string,
  onProgress: (p: number) => void,
  escalonado: {
    /** true → SIM: flujo de hoy a 1920, una pasada, 0 trazas (§3). */
    simular: boolean;
    /** Presupuesto del pipeline (timeout EXISTENTE, §3 — sin nuevos). */
    presupuestoMs: number;
    /** performance.now del INICIO del pipeline (base del presupuesto). */
    inicioMs: number;
  },
): Promise<OcrEscalonadoSalida> {
  const rt = await rapidOcrInit(); // sesión ÚNICA (§2.1 — pre-warm en bg)
  if (escalonado.simular) {
    // SIM: EXACTAMENTE el flujo de hoy (det 1920, una pasada, 0 trazas).
    const r = await rapidOcrReconocer(rt, fotoOcr, onProgress);
    return { texto: r.texto, conf: r.confMedia, detMs: r.msDet, recMs: r.msRec };
  }
  // 1.ª pasada — det cap RÁPIDO (1280) → cls → rec (igual que hoy, §2.2).
  const t1 = performance.now();
  const r1 = await rapidOcrReconocer(rt, fotoOcr, onProgress, { detCap: DET_CAP_RAPIDO });
  const ms1 = Math.round(performance.now() - t1);
  const senal1 = senalDeLectura(r1.texto);
  // §2.3 decisión + §3 presupuesto (el timeout existente manda): vencido →
  // NO hay 2.ª (mismo desenlace que hoy: el timeout del pipeline resuelve).
  const tocaSegunda =
    necesitaSegunda(r1.texto) &&
    performance.now() - escalonado.inicioMs < escalonado.presupuestoMs;
  let elegido: PasadaEscalonada = {
    texto: r1.texto,
    conf: r1.confMedia,
    detMs: r1.msDet,
    recMs: r1.msRec,
    cap: DET_CAP_RAPIDO,
  };
  let ms2: number | null = null;
  let anclas2: number | null = null;
  if (tocaSegunda) {
    // 2.ª pasada — det cap PROD (1920) → cls → rec (§2.4); MISMO emit de
    // progreso (§3). Elegir el MEJOR — NUNCA automáticamente la 2.ª.
    const t2 = performance.now();
    const r2 = await rapidOcrReconocer(rt, fotoOcr, onProgress, { detCap: DET_CAP_PROD });
    ms2 = Math.round(performance.now() - t2);
    anclas2 = anclasDe(r2.texto);
    const ganadora = elegirMejor(
      { texto: r1.texto, conf: r1.confMedia, detMs: r1.msDet, recMs: r1.msRec, cap: DET_CAP_RAPIDO },
      { texto: r2.texto, conf: r2.confMedia, detMs: r2.msDet, recMs: r2.msRec, cap: DET_CAP_PROD },
    );
    elegido = ganadora; // MISMA referencia — la ganadora trae sus métricas
  }
  // Traza propia (§2.5 — línea PROPIA, append-only; SIN línea en SIM).
  logger.info(
    `[e14] ocr-escalonado pasada1=${DET_CAP_RAPIDO} lectura=${senal1.nivel} ` +
      `reocr=${ms2 != null ? 1 : 0} elegido=${elegido.cap} anclas1=${anclasDe(r1.texto)}` +
      (ms2 != null
        ? ` anclas2=${anclas2} ms1=${ms1} ms2=${ms2}`
        : ` ms1=${ms1}`),
  );
  return { texto: elegido.texto, conf: elegido.conf, detMs: elegido.detMs, recMs: elegido.recMs };
}

async function ocrBanda(fotoProcesada: string): Promise<string> {
  try {
    const img = await loadImageMemo(fotoProcesada);
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !H) return "";
    const x0 = Math.round(W * 0.22);
    const y0 = Math.round(H * 0.03);
    const w = Math.max(1, Math.round(W * 0.88) - x0);
    const h = Math.max(1, Math.round(H * 0.13) - y0);
    const canvas = canvasCon(w * 2, h * 2); // escala ×2 (§5) — SPRINT-A A3 factory
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "";
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w * 2, h * 2);
    const d = ctx.getImageData(0, 0, w * 2, h * 2);
    // INVERTIDO (§5): el sello es blanco-sobre-negro → 255-lum por canal.
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 255 - d.data[i];
      d.data[i + 1] = 255 - d.data[i + 1];
      d.data[i + 2] = 255 - d.data[i + 2];
    }
    ctx.putImageData(d, 0, 0);
    // KIT e14-motor-rapidocr-v1 (PROD-2 §2-C3): la banda pasa al ÚNICO motor
    // de producción — el canvas invertido ×2 ya es polaridad normal y
    // RapidOCR lo lee (campos 6/6 en Frankfurt incluyen lo que aporta la
    // banda). Escape hatch documentado (§5): revert puntual de C3.
    return await reconocerRapidOcr(canvas.toDataURL("image/jpeg", 0.9));
  } catch {
    return ""; // fallo de decode/canvas/OCR → sin banda nueva (nunca condena)
  }
}

/** KIT e14-masiva-ux-v1 (T1): ¿el worker OpenCV está listo para detectar?
 *  Si no, espera su warm-up con TOPE (warmUpScannerWorker/waitReady del
 *  core — nunca tumba el pipeline: false = continuar como hoy, fallback
 *  Sobel manda). SSR/worker muerto → false inmediato. */
async function esperarWorkerCaliente(topeMs: number): Promise<boolean> {
  try {
    const cliente = getScannerWorker();
    if (cliente?.isReady) return true;
    warmUpScannerWorker(); // crea/reanima el worker si no existe (idempotente)
    const activo = getScannerWorker();
    if (!activo) return false;
    return await Promise.race([
      activo.waitReady(),
      new Promise<boolean>((res) => setTimeout(() => res(false), topeMs)),
    ]);
  } catch {
    return false;
  }
}

/** KIT e14-masiva-ux-v1 (T4): opciones con presupuesto de timeout OPCIONAL.
 *  Intersección LOCAL — el kit §1 prohíbe tocar `bridge.ts` (casa de
 *  OpcionesEscaneo): el default 15_000 sigue mandando (escaneo individual
 *  INTACTO) y MASIVA pasa 120_000. La bivariance de métodos TS admite el
 *  método con el parámetro más ancho (class implements E14Bridge sigue
 *  compilando; los callers pasan la variable tipada — sin excess-check).
 *  e67 (M-e67-0): el default real era 15_000 — ahora TIMEOUT_MS = 120_000
 *  (cambio A del kit; el comentario T4 conservaba el valor histórico). */
export type OpcionesEscaneoConTimeout = OpcionesEscaneo & {
  /** Presupuesto total del pipeline para ESTA llamada (ms). Ausente =
   *  TIMEOUT_MS (120_000 desde e67 — 15_000 antes). */
  timeoutMs?: number;
  /** e67-watchdog-rescate-v1 (cambio B — RESCATE post-timeout): el pipeline
   *  NO se cancela al vencer el presupuesto — sigue vivo y su desenlace
   *  llega DESPUÉS del acta RECHAZADA de timeout. Antes ese resultado
   *  válido se DESCARTABA en silencio (`if (vencido) return`). Ahora viaja
   *  por ESTE callback (SOLO se dispara tras un vencimiento — idempotente:
   *  si el pipeline gana la carrera jamás se llama). El receptor decide:
   *  el store individual rescata actas válidas (OPTIMA/ADVERTENCIA) y
   *  revierte el rechazo; MASIVA no lo pasa (undefined → no-op byte a
   *  byte — el watchdog D65 del runner manda igual). Firmas intactas.
   *  `tiempoRealMs` = ms reales del pipeline completo (dato, jamás inventado). */
  onRescateTardio?: (acta: Acta, tiempoRealMs: number) => void;
  /** PARCHES P1/P2 del plan masiva (brief Agente A — kit de parches sobre
   *  `5d08dd6`): true SOLO cuando el caller es el runner MASIVA
   *  (`opcionesMasiva` del runner). La brújula QR (e14-orientacion-qr-v1)
   *  queda OMITIDA en masiva: su payload ya NO se consume allí (guard qrCam
   *  de arriba — `if (!esMasiva && !parcial.qrCam)`) y su rescate ZXing
   *  cuesta 1.3–5.1 s en CADA foto donde jsQR falla (bench v8.3 del kit).
   *  La rotación en masiva queda cubierta por: deskew D63-B (pre-proceso
   *  escaneos) + probe de orientación e66/e70 (origenSenales — corre en el
   *  else-if de abajo cuando la brújula no decidió) + rescate WAVE3 §B.
   *  El flujo individual y SIM quedan byte-idénticos (campo ausente =
   *  falsy). Intersección LOCAL — `bridge.ts` INTOCABLE (kit §1), mismo
   *  patrón de `timeoutMs`/`OpcionesEscaneoConTimeout`. */
  desdeMasiva?: boolean;
};

/** Resultado del gate §4 (evaluarGate) — status + rechazo + clasificación. */
interface ResultadoGate {
  status: ActaStatus;
  rechazo: Acta["rechazo"];
  clasificacion: ClasificacionE14 | null;
}

/** Traza §4.6: clasif={dep:88,mun:335,zon:05,std:02,mesa:001,tipo:T,nivel:AUTO}. */
function fmtClasif(c: ClasificacionE14 | null): string {
  if (!c) return "sin-clasificar";
  const tipo = c.tipo === "TRANSMISION" ? "T" : c.tipo === "DELEGADOS" ? "D" : "-";
  // KIT actas-vivas-paginas-v1 (FASE B): página en la traza de auditoría —
  // «pag:2/2» leída · «pag:?» DESCONOCIDA (el hueco irá al primer libre).
  const pag = c.pagina ? `${c.pagina.index}/${c.pagina.total}` : "?";
  // KIT identificacion-codigo-v1 (Task 120): consenso del código + avisos de
  // los cruces en la traza de auditoría (cod:crudo · av:A+B+C).
  const cod = c.codigoUnico ? `,cod:${c.codigoUnico.crudo}` : "";
  const av = c.avisos?.length ? `,av:${c.avisos.join("+")}` : "";
  return (
    `dep:${c.departamento?.codigo ?? "?"},mun:${c.municipio?.codigo ?? "?"},` +
    `zon:${c.zona?.codigo ?? "?"},std:${c.puesto?.codigo ?? "?"},` +
    `mesa:${c.mesa !== null ? String(c.mesa).padStart(3, "0") : "?"},` +
    `pag:${pag},tipo:${tipo},nivel:${c.nivel}${cod}${av}`
  );
}

/**
 * Emite progreso INTERPOLADO mientras una espera real del core está en vuelo
 * (decode/detect/proceso no exponen avance interno; el OCR sí lo reporta
 * real). La fracción se cap al 95% para que la resolución de la etapa
 * siempre produzca un salto visible en ANALIZANDO.
 */
function conRampa<T>(
  promesa: Promise<T>,
  msEstimados: number,
  evento: (fraccion: number) => ProgresoAnalisis,
  emitir: (p: ProgresoAnalisis) => void,
): Promise<T> {
  const inicio = performance.now();
  // FIX (auditoría 2-a #7): autolímite del ramp — si la promesa envuelta
  // cuelga SIN resolver (worker OpenCV muerto), el intervalo seguía
  // disparando indefinidamente (un timer fugado por pipeline colgado; el
  // timeout externo recupera la UI pero no el timer). 20× el estimado es
  // inalcanzable en operación normal y cubre el peor caso real.
  let ticks = 0;
  const maxTicks = Math.ceil((msEstimados * 20) / 140);
  const timer = setInterval(() => {
    if (++ticks > maxTicks) {
      clearInterval(timer);
      return;
    }
    const f = Math.min(1, (performance.now() - inicio) / msEstimados);
    emitir(evento(f * 0.95));
  }, 140);
  return promesa.then(
    (valor) => {
      clearInterval(timer);
      return valor;
    },
    (error) => {
      clearInterval(timer);
      throw error;
    },
  );
}

/** KIT e63d-escaneo-ya-recortado-v1 (F0.2) · hotfix e63d-rev2 (kit e63e ANEXO A
 *  caso 4): la LECTURA perdona al marco «cortado» de un ESCANEO — mismo patrón
 *  que lazoPerdonadoPorLectura (tabla §3-A del kit). El perdón exige el trío
 *  COMPLETO: veredicto cortado + lectura FUERTE + secciones presentes
 *  (faltaSeccionInferior false). Cualquier otro caso → false: la mutilación
 *  real (falta una sección) y la lectura débil/media jamás se perdonan —
 *  «la lectura perdona al marco, NO al contenido faltante». completo/ceñido/
 *  no-encontrado nunca bloquean por construcción (el perdón no aplica).
 *
 *  REV.2 — el gate F0.2 rev.1 (d671c29) tenía la polaridad INVERTIDA: el
 *  ternario del bridge negaba el trío (`!(FUERTE && !faltaSeccion)`), con lo
 *  cual el caso P2 (cortado+FUERTE+secciones) quedaba RECHAZADA INCOMPLETA y
 *  los MEDIA/DEBIL/SIN pasaban el gate del marco — exacto al revés de la
 *  doctrina (comentario del sitio, REPORTE-e63d §F0.2 y tabla §3-A).
 *  Exportado (patrón D-5) para el QA headless del kit e63e §4.2. */
export function marcoPerdonadoPorLectura(
  veredicto: MarcoImpreso,
  nivelLectura: NivelLectura,
  faltaSeccion: boolean,
): boolean {
  return veredicto === "cortado" && nivelLectura === "FUERTE" && !faltaSeccion;
}

/** e64-qr T-2.1 — acumulador del pipeline: lo conocido al vencer el timeout
 *  + la señal de la CAPA 0 QR de cámara (ADITIVA — el QR jamás afecta
 *  score/status/gate/OCR; llave OPACA, red line 10). qrCam:
 *  undefined = el decodificador no terminó (timeout — los campos viajan
 *  AUSENTES, jamás inventar) · null = corrió y terminó en null
 *  ("sin-payload") · {payload} = leído ("leido"). */
interface ParcialPipeline {
  fotoOriginal?: string;
  qrCam?: { payload: string } | null;
}

export class RealCoreBridge implements E14Bridge {
  private contador = 0;

  async escanearActa(opciones: OpcionesEscaneoConTimeout): Promise<Acta> {
    // Resolución de la entrada (L3 §5 CAMARA + F1 SIMULACIÓN):
    //  · CAMARA + archivo (ZSL/captureSmart/iOS) → MISMO pipeline que ARCHIVO.
    //  · CAMARA sin archivo + frameActual (video vivo) → grab síncrono.
    //  · SIMULACIÓN sin archivo (D35) → el acta E-14 incluida, EXACTAMENTE
    //    como un archivo de IMPORTAR (la foto real del dueño, EXIF incluido).
    //  · Sin entrada → error explícito (el guard del store ya avisó).
    let entrada: EntradaPipeline | null = null;
    if (opciones.archivo) {
      entrada = { archivo: opciones.archivo };
    } else if (opciones.fuente === "CAMARA") {
      const video = opciones.frameActual;
      const dataUrl = video && video.readyState >= 2 && video.videoWidth
        ? capturarFrame(video)
        : null;
      if (!dataUrl) {
        throw new Error("SIN CAPTURA PARA ANALIZAR (fuente CÁMARA)");
      }
      entrada = { dataUrl };
    } else if (opciones.fuente === "SIMULACION") {
      // SIMULACIÓN = pipeline real sobre el acta E-14 incluida (D35).
      // Mismo camino que IMPORTAR: File → fileToCaptureDataUrl (F-IMPORT: EXIF/12MP).
      // §D3 (SPEC-e14-simulacion-scores): con `simular` el asset es el FIJO de
      // la banda del chip (determinista) — el ciclo rotativo §G queda intacto
      // para el disparo normal de la fuente. §D8.2 (Rev. 3): el flag
      // sinRecorte del asset viaja con la entrada (parámetro interno privado).
      const sim =
        opciones.simular && opciones.scoreSimulado != null
          ? await fetchActaSimPorScore(opciones.scoreSimulado)
          : await fetchActaSimulada();
      entrada = { archivo: sim.archivo, sinRecorte: sim.sinRecorte };
    } else {
      throw new Error("SIN IMAGEN PARA ANALIZAR (fuente ARCHIVO)");
    }

    // Acumulador de lo que ya se tiene (el acta de timeout rellena lo que
    // alcance a conocer — p. ej. fotoOriginal si el decode alcanzó a correr).
    const parcial: ParcialPipeline = {};
    let vencido = false; // tras el timeout no se emite más progreso (§5)
    const emitir = (p: ProgresoAnalisis) => {
      if (!vencido) opciones.onProgreso?.(p);
    };

    // e67 (cambio B): reloj del rescate — ms REALES del pipeline completo
    // (el callback de rescate viaja con este dato, jamás inventado).
    const tInicioEscaneo = performance.now();
    return new Promise<Acta>((resolve, reject) => {
      const timer = setTimeout(() => {
        vencido = true;
        // §5: el timeout NO rechaza la Promise — resuelve un acta RECHAZADA
        // controlada (el toast crit sale del flujo normal del store).
        resolve(
          this.construirActa(opciones, parcial, {
            score: 0,
            status: "RECHAZADA",
            rechazo: { tipo: "ILEGIBLE", detalle: DETALLE_TIMEOUT },
          }),
        );
        // KIT e14-masiva-ux-v1 (T4): presupuesto OPCIONAL por llamada —
        // MASIVA pasa su presupuesto del watchdog (WATCHDOG_MS del runner);
        // el default manda en el flujo individual (120_000 desde e67).
      }, opciones.timeoutMs ?? TIMEOUT_MS);

      this.pipeline(opciones, entrada, parcial, emitir).then(
        (acta) => {
          if (vencido) {
            // e67 (cambio B) — RESCATE post-timeout: el pipeline siguió
            // vivo tras el vencimiento y terminó con un desenlace REAL
            // (gate/score del pipeline, no del watchdog). Ya no se
            // descarta en silencio: viaja por onRescateTardio para que el
            // receptor valide y revierta el rechazo si es válido. Sin
            // callback (MASIVA) → no-op, comportamiento de siempre.
            opciones.onRescateTardio?.(
              acta,
              Math.round(performance.now() - tInicioEscaneo),
            );
            return;
          }
          clearTimeout(timer);
          resolve(acta);
        },
        (error) => {
          if (vencido) {
            // e67: el pipeline TARDÍO falló — traza honesta; el acta
            // queda RECHAZADA por tiempo (correcto, caso C del kit).
            logger.info("[e14] pipeline falló tras timeout", {
              mensaje: error instanceof Error ? error.message : String(error),
            });
            return;
          }
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("ERROR DE PIPELINE"));
        },
      );
    });
  }

  /** Pipeline §5 (ARCHIVO y CAMARA comparten etapas y mapeo; ms por etapa en consola). */
  private async pipeline(
    opciones: OpcionesEscaneo,
    entrada: EntradaPipeline,
    parcial: ParcialPipeline,
    emitir: (p: ProgresoAnalisis) => void,
  ): Promise<Acta> {
    const ms = { decode: 0, detect: 0, proceso: 0, calidad: 0, ocr: 0, total: 0 };
    const inicio = performance.now();

    // 1) Entrada → data URL crudo (F-IMPORT del core: HEIC/EXIF/12MP seguros;
    //    en CAMARA sin archivo el dataUrl ya vino del grab del <video>).
    emitir({ etapa: "DETECTANDO", progreso: 0 });
    const fotoOriginal =
      "archivo" in entrada
        ? await conRampa(
            // KIT e14-masiva-tiempos-v1 (PR-2): decode con memo POR FILE —
            // el prefetch del runner MASIVA comparte esta instancia → HIT.
            decodeArchivoMemo(entrada.archivo),
            700,
            (f) => ({ etapa: "DETECTANDO", progreso: f * 0.5 }),
            emitir,
          )
        : entrada.dataUrl;
    ms.decode = performance.now() - inicio;
    parcial.fotoOriginal = fotoOriginal;

    // e64-qr T-2.1 — CAPA 0 QR también en cámara (kit FASE 2 / hermano C-1):
    // el MISMO decodificador de masiva (import DINÁMICO — el bundle crítico
    // del escaneo no engorda), señal ADITIVA — jamás afecta score/gate/OCR
    // ni consume intento. Se lanza EN PARALELO al pipeline (el tier base
    // resuelve en ~0.3-0.5 s — mucho antes del OCR) y se ESPETA donde el
    // acta se construye. tiers "base" — ADAPTACIÓN DECLARADA: la cadena
    // completa (~15-17 s sin-QR, bloques sync) rompería el timeout 15 s del
    // flujo individual; el rescate pesado queda en masiva (timeout 120 s).
    // GUARD (D63-C): `origenActa` viaja SOLO en entradas de MASIVA — allí la
    // capa 0 del runner (cadena COMPLETA a nivel registro, no acta) manda y
    // la señal base-only del bridge sería redundante y doble-costo: OMITIDA.
    // El catch es el fallback silencioso del kit: sin la señal, el flujo de
    // cámara sigue intacto.
    const esMasiva = opciones.origenActa != null;
    const qrCamPromesa: Promise<ParcialPipeline["qrCam"]> = esMasiva
      ? Promise.resolve(undefined) // la capa 0 del runner manda en masiva
      : (async () => {
          try {
            const { decodificarQrDeCapture } = await import("./masiva/identidad-qr");
            return await decodificarQrDeCapture(fotoOriginal, { tiers: "base" });
          } catch {
            return null; // sin-payload — el flujo de cámara sigue intacto
          }
        })();
    const aterrizarQrCam = async (): Promise<void> => {
      // idempotente y acotada (el tier base tiene techo propio ~0.5 s)
      parcial.qrCam = await qrCamPromesa;
    };

    // 2) Detección de bordes (worker OpenCV → fallback Sobel del core).
    //    §D8.3 (SPEC-e14-score-ocr Rev. 3): con sinRecorte la detección NO
    //    corre — «el recorte es la foto entera»: QUAD_IDENTITY (se imprime
    //    en el log como hoy, traza de auditoría). SOLO alcanzable desde la
    //    rama SIMULACIÓN (ARCHIVO/CÁMARA corren detect byte a byte, AC15).
    const sinRecorte = "archivo" in entrada && entrada.sinRecorte === true;
    // D63-C — KIT e63c-quad-gate-escaneo-v1: origen del archivo (detector
    // D63-A) viaja en opciones SOLO para MASIVA — SIM y el flujo individual
    // JAMÁS lo traen (guard doble del kit T3: nada de escaneos les aplica).
    const origenActa = opciones.origenActa ?? null;
    // KIT e63d-escaneo-ya-recortado-v1 (F2.1): un ESCANEO es rectangular por
    // construcción — la detección de quad es una herramienta de FOTOS (papel
    // sobre fondo). En un escaneo ceñido el único rectángulo fuerte es el
    // MARCO IMPRESO del formulario: dejar que el worker «lo encuentre» =
    // re-recortar el escaneo (fallo A del plan: P1 → cabecera fuera →
    // recortada=1 → techo 7.9). Identidad DESDE EL INICIO (sin worker, sin
    // Sobel, sin espera fría) — el deskew D63-B ya endereza la rotación y el
    // marco D63-C gobierna el gate. La detección sigue byte a byte para
    // fotos (identidad ya es la convención de sinRecorte que consume el
    // editor — plan F2.4).
    const escaneoIdentidad = origenActa === "escaneo" && !sinRecorte;
    let quad: Quad;
    // KIT e14-quad-sobel-v1 (P1 §4-B): quién fabricó el quad de verdad —
    // "worker" (la cascada ganó) o "sobel" (el fallback, incluido el catch del
    // propio Sobel con rect por defecto). null SOLO si ni siquiera corrió una
    // detección (n/d jamás miente — misma filosofía del T-A).
    let quadOrigen: OrigenQuad | "pagina-completa" | null = null;
    // KIT e14-masiva-ux-v1 (T1): trazabilidad del arreglo en el log — si
    // corrió el reintento (§3-T1.2). Solo AÑADIR campos al final del
    // formato (los instrumentos del dueño lo parsean).
    let detectReintento = false;
    const tDetect = performance.now();
    if (sinRecorte) {
      quad = QUAD_IDENTITY;
    } else if (escaneoIdentidad) {
      // KIT e63d (F2.1): página completa SIN correr detección — el paso
      // entero se omite (detect medio ≈ 0 ms en escaneos; el informe
      // DETECCION contará quadOrigen "pagina-completa" por la vía normal).
      // La clase entera de quads falsos queda eliminada POR CONSTRUCCIÓN,
      // no por parche.
      quad = QUAD_IDENTITY;
    } else {
      try {
        // T1.1: worker frío → esperar su warm-up con tope de 5 s (mecanismo
        // del core — el mismo que ScanView invoca al montar). Si a los 5 s
        // no está listo, continuar como hoy (no bloquear más).
        await esperarWorkerCaliente(TOPE_ESPERA_WORKER_MS);
        let detalle = await conRampa(
          detectDocumentEdgesDetail(fotoOriginal),
          900,
          (f) => ({ etapa: "DETECTANDO", progreso: 0.5 + f * 0.4 }),
          emitir,
        );
        // T1.2: el fallback Sobel FABRICÓ el quad (worker frío/ocupado) →
        // esperar de nuevo (tope 5 s) y reintentar UNA sola vez. Si el
        // reintento viene del worker, manda ese quad; si no, conservar el
        // quad original (comportamiento actual — kit §3-T1.2).
        if (detalle.origen === "sobel") {
          const caliente = await esperarWorkerCaliente(TOPE_ESPERA_WORKER_MS);
          if (caliente) {
            detectReintento = true;
            try {
              const reintento = await detectDocumentEdgesDetail(fotoOriginal);
              if (reintento.origen === "worker") detalle = reintento;
            } catch {
              /* reintento falló → quad original (kit §3-T1.2) */
            }
          }
        }
        quad = detalle.quad;
        quadOrigen = detalle.origen;
        // D63-C (T1): en ESCANEOS sin quad real — el worker falló y sobel
        // fabricó (un escaneo plano sin bordes no tiene quad que encontrar;
        // evidencia: 3/8 del informe cayeron a sobel) — la PÁGINA COMPLETA
        // es el acta: sin warp de perspectiva (la rotación recta ya la trajo
        // D63-B). Las FOTOS no cambian (T1.3: quad sobel de siempre).
        // KIT e63d (F0.1): generalizado a TODO escaneo — un quad del worker
        // sobre un escaneo es un re-recorte en potencia (el marco impreso es
        // el único rectángulo fuerte y warp-earlo corta el escaneo). Hoy es
        // camino MUERTO para escaneos (F2.1 ya no corre detección para
        // ellos) — queda como defensa en profundidad: si la detección
        // volviera a correr para un escaneo, el desenlace sigue siendo
        // página completa.
        if (origenActa === "escaneo") {
          quad = QUAD_IDENTITY;
          quadOrigen = "pagina-completa";
        }
      } catch {
        // El core SIEMPRE devuelve Quad; una EXCEPCIÓN aquí = imagen no
        // detectable → RECHAZADA ILEGIBLE inmediata (§5 paso 1, spec §7.5).
        // El piso escénico D16 de ANALIZANDO completa la animación solo.
        await aterrizarQrCam(); // e64-qr T-2.1: la señal QR viaja si terminó
        return this.construirActa(opciones, parcial, {
          score: 0,
          status: "RECHAZADA",
          rechazo: { tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE },
        });
      }
    }
    ms.detect = performance.now() - tDetect;
    emitir({ etapa: "DETECTANDO", progreso: 1 });

    // GUARD-BORDE Rev. 2 (§3b, D1/D3/D4): la señal de ACTA COMPLETA ya NO se
    // decide aquí con la geometría (el falso positivo del dueño: quad al filo
    // con la imagen perfecta — score 6.4). El cálculo se MUEVE a DESPUÉS del
    // paso 3 (recorte): la condena exige analizar la TINTA del recorte al
    // filo («la geometría sospecha, la tinta condena»). Helper ÚNICO
    // verificarCompletitud (AC11) — con `simular` la verificación SE OMITE
    // (completa = true forzado): la foto del chip MEDIO ES una acta cortada a
    // propósito y jamás debe caer INCOMPLETA desde un chip (AC3/AC6 de
    // simulacion-scores; AC7 del guard).

    // 3) Recorte + realce (warp real INTER_CUBIC + filtro default "bw").
    //    §D8.3 (SPEC-e14-score-ocr Rev. 3): con sinRecorte se OMITE
    //    processImage — fotoProcesada = fotoOriginal (sin warp, sin filtro
    //    "bw", sin realce: la b/n del dueño YA trae su filtro · la borrosa
    //    queda original), motor "canvas" (solo traza) y el acta nace con
    //    filtro "original" (veracidad en el editor — al elegir B/N aplica
    //    sobre la foto completa). Los ramps RECORTANDO/REALZANDO se
    //    CONSERVAN (misma animación de ANALIZANDO — la etapa resuelve al
    //    instante). El editor (recortar/cambiarFiltro) sigue operando normal
    //    con quadDetectado = identidad.
    emitir({ etapa: "RECORTANDO", progreso: 0.2 });
    const tProceso = performance.now();
    let fotoProcesada: string;
    let filtroActa: PageFilter;
    let motor: "worker" | "canvas";
    // KIT e14-ocr-lee-original-v1 (PROD-1 §4.1): variante de ENTRADA del OCR +
    // traza de su origen (§4.4). "original" = crudo del warp (warp sin realce,
    // misma geometría que la bw — §3 del kit) · "original-as-is" = SIM (la
    // original YA es la entrada) · "bw-fallback" = la variante nueva falló y
    // el OCR lee la bw (comportamiento de hoy — §5: el pipeline JAMÁS muere
    // por la variante nueva, pitfall §9.6).
    let fotoOcr: string;
    let ocrIn: "original" | "original-as-is" | "bw-fallback";
    if (sinRecorte) {
      fotoProcesada = fotoOriginal;
      filtroActa = "original";
      motor = "canvas";
      // PROD-1 (§4.1): SIM as-is — la entrada del OCR YA era la original:
      // cero llamadas nuevas (chips SIM 8.2/7.0/4.3 intactos por construcción).
      fotoOcr = fotoOriginal;
      ocrIn = "original-as-is";
      emitir({ etapa: "REALZANDO", progreso: 1 });
    } else {
      // PROD-1 (§4.1): DOS variantes bajo la MISMA conRampa — bw para
      // MOSTRAR/GUARDAR (hoy) y "original" (warp sin realce) para LEER.
      // .catch(() => null) DENTRO del Promise.all (aclaración final del kit):
      // si processImage("original") rechaza, Promise.all NO rechaza — decide
      // con el resultado null → bw-fallback (§5). El pipeline NUNCA muere por
      // la variante nueva.
      const [resultado, resultadoOcr] = await conRampa(
        Promise.all([
          // Fuente: apps/scanner-lab/src/components/scanner/CameraView.tsx L602-604
          // (captura arranca en B/N adaptativo) + types.ts L50 (default del
          // producto) — D36: e14 no tiene ajustes → el default fijo es "bw".
          processImage(fotoOriginal, quad, "bw"),
          // PROD-1: la misma geometría (mismo warp, MISMA convención
          // POST-warp — pitfall §9.5), solo cambia el filtro final.
          processImage(fotoOriginal, quad, "original").catch(() => null),
        ]),
        // msEstimados 1400→2200 (§4.1): el segundo warp (~0.6-1.3 s, §1.4)
        // se cubre con la MISMA rampa (el core serializa en su worker).
        2200,
        // RECORTANDO .2→.6 (warp) → REALZANDO .4→1 (enhance), interpolado.
        (f) =>
          f < 0.55
            ? { etapa: "RECORTANDO", progreso: 0.2 + (f / 0.55) * 0.4 }
            : { etapa: "REALZANDO", progreso: 0.4 + ((f - 0.55) / 0.45) * 0.6 },
        emitir,
      );
      ms.proceso = performance.now() - tProceso;
      emitir({ etapa: "REALZANDO", progreso: 1 });
      fotoProcesada = resultado.processed;
      filtroActa = "bw";
      motor = resultado.precision?.engine ?? "canvas";
      // PROD-1 (§4.1) — entrada del OCR, con fallback que JAMÁS rompe el
      // pipeline: fotoOcr queda = fotoProcesada (comportamiento de hoy).
      fotoOcr = fotoProcesada;
      ocrIn = "original";
      if (resultadoOcr?.processed) {
        fotoOcr = resultadoOcr.processed;
      } else {
        ocrIn = "bw-fallback";
      }
    }
    // KIT e14-orientacion-auto-v1 (T-A2): probe de orientación DESPUÉS de fijar
    // fotoOcr (tras el warp, §2.1) y ANTES del OCR completo y de TODA medición
    // downstream (esquinas/completitud/visor ven el acta YA derecha). SIM:
    // OMITIDO (§2.2 — mismo guard del banda/esquinas; chips 8.2/7.0/4.3
    // intactos). sinRecorte solo existe en SIM en esta base → cubierto por el
    // MISMO guard. Al aplicar se giran fotoOcr Y fotoProcesada (re-encode
    // JPEG q0.92, §2.1 paso 4) para que el acta visible/guardada quede
    // derecha; JAMÁS lanza (catch interno — el pipeline no depende, §5).
    // D57 — KIT e14-instrumentos-espera-v1 (T2): coste del probe persistido
    // en el diagnóstico (aditivo — la traza de consola D51 ya existe; esto la
    // vuelve permanente en la ficha). null si el probe no corrió (SIM o error).
    let probeMsOrientacion: number | null = null;
    // WAVE2 A1 — sub-decisión de la miniatura descartada por el fallo seguro
    // (datos para calibración wave 3 — jamás cambia la decisión de HOY).
    let probeMiniOrientacion: ProbeOrientacion["orientacionProbeMini"] | null =
      null;
    // e66 (P4) → e70 (P4.1) — REVERSA PARCIAL del skip ciego por EXIF: el
    // EXIF de cámara dice cómo estaba el TELÉFONO, no cómo quedó el acta
    // (evidencia del dueño: 3 fotos landscape CON EXIF rechazadas score 4.9,
    // anclas 0 y cabeceraE14 false — el core horneó la orientación del
    // sensor, el acta física estaba de lado). La omisión del sondeo ahora
    // exige CONFIRMACIÓN de la detección previa (modo confirmar del probe):
    // quad del WORKER (el fallback sobel fabricó la geometría — «el quad se
    // detectó mal» del criterio) + lectura a 0° con anclas >= 3 Y conf >=
    // 0.7 (la pasada 0° del probe ES la primera pasada rápida del criterio:
    // det cap rápido + rec — las sanas pagan det+rec0 y se saltan las
    // challengers 90/180/270; las dudosas sondean 0/90/180/270 completas y
    // el MARGEN decide la rotación antes del OCR principal). SIM jamás
    // sondea (mismo guard §2.2 de siempre — SIM nunca trae origenSenales).
    // Flujos individual/video sin la señal → rama de abajo (probe de
    // siempre); recorte manual (pipelineRecorte) INTACTO (sin señal ahí).
    // KIT e14-orientacion-qr-v1 (T-A) — QR-BRÚJULA PRIMERO: el cuadrante del
    // QR (hogar del E-14: TL del acta derecha) manda la rotación SIN OCR
    // (bench v8.3 del dueño: 4/4 con fotos arrugadas/blotchy donde jsQR
    // sobre el warp daba 0/4 — el rescate hi-res guiado por el quad con
    // ZXing rescató TODAS). El sondeo OCR de abajo SOLO corre si la brújula
    // NO decidió (red de seguridad — comportamiento de HOY byte a byte).
    // Kill-switch: flags.qrBrujulaOrientacion (OFF = byte-idéntico a hoy).
    // Guards: SIM jamás (§2.2 — chips 8.2/7.0/4.3 intactos) · sinRecorte no
    // tiene warp/quad real (SIM-only en esta base → cubierto igualmente).
    let brujula: BrujulaQr | null = null;
    // PARCHES P1/P2 (brief Agente A): `desdeMasiva` OMITE la brújula QR en
    // el runner MASIVA (su payload no se consume allí — guard qrCam de
    // arriba; la rotación queda en manos de deskew D63-B + probe e66/e70).
    // Guards SIM/sinRecorte/flag intactos — flujo individual byte-idéntico
    // (el kill-switch global `qrBrujulaOrientacion` NO cambia de sentido).
    if (
      // El campo viaja en la intersección LOCAL (mismo patrón del cast de
      // `timeoutMs` en la etapa OCR de abajo — pipeline recibe la base).
      !(opciones as OpcionesEscaneoConTimeout).desdeMasiva &&
      !opciones.simular &&
      !sinRecorte &&
      leerFlags().qrBrujulaOrientacion
    ) {
      brujula = await brujulaQrOrientacion(fotoOcr, fotoOriginal, quad);
      if (brujula) {
        if (brujula.rot !== 0) {
          // Misma aplicación del probe (T-A2 §2.1 paso 4): se giran fotoOcr Y
          // fotoProcesada (re-encode q0.92) para que el acta visible/guardada
          // quede derecha. rotarDataUrl JAMÁS lanza (catch interno, §5).
          fotoOcr = await rotarDataUrl(fotoOcr, brujula.rot);
          fotoProcesada = await rotarDataUrl(fotoProcesada, brujula.rot);
        }
        // e64-qr T-2.1 — señal de identidad ADITIVA SOLO para flujos
        // NO-masiva (cámara/individual): si la capa base no leyó y la
        // brújula sí, el payload OPACA viaja como qrCam (mismo contrato de
        // construirActa — SOLO presencia, red line 10). MASIVA intacto (la
        // capa 0 del runner manda — guard del bloque qrCam de arriba).
        if (!esMasiva && !parcial.qrCam) {
          parcial.qrCam = { payload: brujula.payload };
        }
      }
    }
    if (
      brujula === null &&
      !opciones.simular &&
      opciones.origenSenales === "exif-camara"
    ) {
      const probe = await probeOrientacion(fotoOcr, {
        confirmar: { quadWorker: quadOrigen === "worker" },
      });
      if (probe != null) probeMsOrientacion = probe.ms; // D57 T2
      probeMiniOrientacion = probe?.orientacionProbeMini ?? null; // WAVE2 A1 — la mini que el fallo seguro descartó
      if (probe?.aplicado) {
        fotoOcr = await rotarDataUrl(fotoOcr, probe.rot);
        fotoProcesada = await rotarDataUrl(fotoProcesada, probe.rot);
      }
    } else if (brujula === null && !opciones.simular) {
      const probe = await probeOrientacion(fotoOcr);
      if (probe != null) probeMsOrientacion = probe.ms; // D57 T2
      probeMiniOrientacion = probe?.orientacionProbeMini ?? null; // WAVE2 A1 — la mini que el fallo seguro descartó
      if (probe?.aplicado) {
        fotoOcr = await rotarDataUrl(fotoOcr, probe.rot);
        fotoProcesada = await rotarDataUrl(fotoProcesada, probe.rot);
      }
    }
    // KIT consenso-frankfurt-v1 (FASE 2, §3): esquinas fiduciales ANTES del
    // guard — la marca presente es PRUEBA POSITIVA de que el papel está
    // entero dentro del cuadro (ANALISIS §5.1) → verificarCompletitud la
    // consulta y perdona la sospecha geométrica (§0-F2: Frankfurt 746 al
    // filo condenaba INCOMPLETA 6.4 falso). UNA sola medición (helper único
    // esquinasDeActa — §4.4); SOLO fuera de SIM (assets de la demo sin
    // marcas calibradas — chips 8.2/7.0/4.3 intactos, MISMO guard del kit
    // identificacion-codigo-v1). <80×120 → null (n/d — jamás condena).
    const esquinas = opciones.simular ? ESQUINAS_OK : await esquinasDeActa(fotoProcesada);
    const ladoEsquina = esquinas ? ladoEsquinaFaltante(esquinas) : null;
    const trazaEsq = opciones.simular ? "sim" : trazaEsquinas(esquinas);
    // GUARD-BORDE Rev. 2 (§3b): la verificación de completitud corre DESPUÉS
    // del paso 3 — fotoProcesada ya existe (la tinta al filo se mide SOBRE el
    // recorte, no sobre la foto cruda). Helper ÚNICO (D3/AC11). El análisis
    // SOLO arranca si la geometría sospecha (D4: quad sano → costo cero) y
    // vuela EN PARALELO con CALIDAD/OCR: se espera justo antes del gate
    // (presupuesto propio <30 ms p95 — §3d/AC9). Con `simular` NO corre
    // (completa = true forzado — AC7). Nota sinRecorte: SOLO alcanzable desde
    // la rama SIMULACIÓN (AC15 score-ocr) → también cubierto por el skip.
    // FASE 2 (§3): recibe las esquinas — 4 fiduciales presentes → la
    // sospecha geométrica NO condena (papel entero demostrado).
    // KIT e63d (F2.3): verificarCompletitud NO corre para ESCANEOS — hoy
    // corría y su `completa` se descartaba (el marco lo pisa SIEMPRE para
    // escaneos: evaluarMarcoImpreso jamás devuelve null). El guard de fotos
    // mide tinta al filo del warp — un escaneo no tiene warp (identidad) y
    // su gate es el MARCO (D63-C). Menos trabajo muerto, misma decisión.
    // EFECTO DECLARADO (plan §4): el escudo anti-fondo (fondo → techo 7.9,
    // L1461) tampoco aplica a escaneos — es un guard del WARP (fondo/sombra
    // incluida por el encuadre), sin premisa en identidad. El veredicto del
    // escaneo lo gobiernan marco + lectura + marcadores (honestos).
    const verificacion: Promise<ResultadoCompletitud> | null =
      opciones.simular || origenActa === "escaneo"
        ? null
        : verificarCompletitud(quad, fotoProcesada, esquinas);
    // §D4 (SPEC-e14-score-ocr): visor nunca vacío — tinta de la PROCESADA
    // (muestreo 64×64): un warp sin tinta (quad degenerado sobre superficie
    // lisa → blanco puro del B/N adaptativo) marca el acta para que REVISIÓN
    // muestre la ORIGINAL con su nota. Con tinta (aunque poca, p. ej. la
    // borrosa B/N) se muestra la procesada como hoy — sin regresión.
    const procesadaVacia = await procesadaVaciaDataUrl(fotoProcesada);

    // 4) Calidad de la página (Laplaciano + contraste + brillo).
    //    KIT visor-accion-score-v1 (FASE S): se evalúa el RECORTE del acta
    //    (bbox del quad), NO el encuadre completo — la mesa oscura alrededor
    //    ya no hunde el brillo global (§S.0; fallback al frame como hoy).
    emitir({ etapa: "CALIDAD", progreso: 0 });
    const tCalidad = performance.now();
    const infoCrop: InfoCrop = { w: 0, h: 0, fallback: false };
    const calidad = await calidadDeActa(fotoOriginal, quad, infoCrop);
    ms.calidad = performance.now() - tCalidad;
    emitir({ etapa: "CALIDAD", progreso: 1 });

    // 5) OCR sobre la variante de ENTRADA del OCR (PROD-1 §4.1: el recorte
    //    SIN filtro — regla del dueño; la bw pasa a ser SOLO la imagen de
    //    presentación/guardado). KIT e14-ocr-escalonado-v1 (§2): OCR
    //    ESCALONADO — 1.ª pasada det 1280 → re-OCR 1920 SOLO si la lectura
    //    sale débil, el MEJOR manda (el gate JAMÁS ve un texto degradado si
    //    el 1920 lo salva); SIM: flujo de hoy a 1920, 0 trazas (§3). Motor
    //    RapidOCR PP-OCRv4 (PROD-2 §2-C2); progreso REAL por lotes de rec
    //    (§2-C4) — la 2.ª pasada reusa el MISMO emit (§3).
    const tOcr = performance.now();
    const onProgresoOcr = (p: number): void => {
      emitir({ etapa: "OCR", progreso: Math.min(1, Math.max(0, p)) });
    };
    // §3 presupuesto: el timeout EXISTENTE del pipeline manda (masiva pasa
    // 120_000 por OpcionesEscaneoConTimeout; default 15 s).
    const cfgOcr = {
      simular: opciones.simular === true,
      presupuestoMs: (opciones as OpcionesEscaneoConTimeout).timeoutMs ?? TIMEOUT_MS,
      inicioMs: inicio,
    };
    const ocrEsc = await reconocerRapidOcrEscalonado(fotoOcr, onProgresoOcr, cfgOcr);
    let texto = ocrEsc.texto;
    ms.ocr = performance.now() - tOcr;
    // PROD-2 (§4.2): conf/det/rec de la pasada ELEGIDA (SPRINT-A A4: la
    // captura vive aquí — la dead store ultimoOcr* fue eliminada).
    const confOcr = ocrEsc.conf;
    const detOcr = ocrEsc.detMs;
    const recOcr = ocrEsc.recMs;
    emitir({ etapa: "OCR", progreso: 1 });
    // KIT consenso-frankfurt-v1 (FASE 4, §5): banda dirigida — si el OCR
    // completo no leyó la banda (sello blanco-sobre-negro, §0-F4), SEGUNDA
    // pasada OCR del crop invertido ×2. UNA sola vez, ANTES de
    // clasificarCabecera; el tiempo se suma a ms.ocr (es OCR). SIM: OMITIDO
    // (AC6 — cero llamadas a ocrBanda en SIM; guard opciones.simular).
    if (!opciones.simular && tipoDeBanda(texto) === null) {
      const tBanda = performance.now();
      texto += "\n" + (await ocrBanda(fotoProcesada));
      ms.ocr += performance.now() - tBanda;
    }
    ms.total = performance.now() - inicio;

    // (motor/filtroActa calculados en el paso 3 — §D8.3: as-is → "canvas"/"original")

    // 6) Mapeo §4 → status/score/rechazo + clasificación de cabecera
    //    (SPEC-cabecera-clasificacion §4: RECHAZADA solo por CALIDAD;
    //    cabecera sin clasificar → EN_REVISION_HUMANA con panel, NUNCA rechazo).
    //    §X (SPEC-score-legible): la clasificación se calcula PRIMERO (barata:
    //    regex + divipol cacheada) y alimenta el score — el OCR y la
    //    identificación manda sobre las métricas globales del crudo.
    const clasificacion = clasificarCabecera(texto, await cargarDivipol());
    // (KIT consenso-frankfurt-v1 FASE 2: las esquinas se miden ANTES del
    // guard — arriba; aquí solo consume ladoEsquina/trazaEsq.)
    // KIT actas-vivas-paginas-v1 (FASE C): RECORTADA por OCR de secciones —
    // P1 sin «SUMA TOTAL» / P≥2 sin «FIRMA» (faltaSeccionInferior);
    // página DESCONOCIDA nunca condena. Techo 7.9 = ADVERTENCIA (NO
    // rechazo — conservador en campo). FASE F: OR con la señal de esquinas.
    // KIT e14-lectura-perdona-lazo-v1 (§4-B): la LECTURA perdona al lazo — un
    // fiducial faltante cuyo lado está demostrado dentro por el OCR es falso
    // positivo (margen corto/sombra). La señal de secciones NUNCA se perdona.
    // En SIM esquinas=ESQUINAS_OK (L955) → helper false → recortada idéntica a
    // hoy (chips 8.2/7.0/4.3 intactos — §2 del kit).
    const faltaSeccion = faltaSeccionInferior(texto, clasificacion.pagina);
    const lazoPerdonado = lazoPerdonadoPorLectura(esquinas, texto, faltaSeccion);
    const recortada = faltaSeccion || (ladoEsquina !== null && !lazoPerdonado);
    const ocrLegible = ocrTextIsValid(texto);
    // §D1 (SPEC-e14-score-ocr): señal de CONTENIDO del acta — alimenta el
    // score (techo 4.9 sin señal) y el desenlace §D3 (rechazo BAJO).
    const senalActa = senalDeContenido(texto, clasificacion);
    // KIT e14-luz-sim-puntos-v1 (T-D): `senal` se sube aquí (antes vivía
    // tras scoreDeCalidad) — es PURA (misma entrada → misma salida) y el
    // piso-10 necesita las anclas dentro del scoreDeCalidad. El bloque C3
    // de abajo queda idéntico leyendo esta misma const.
    const senal = senalDeLectura(texto, clasificacion.parciales);
    // KIT e14-luz-sim-puntos-v1 (T-D): LAS 4 condiciones de §4.1. Todas o
    // ninguna (conservador — G3).
    const pisoPerfecto =
      senal.nivel === "FUERTE" &&
      senal.anclas >= 8 &&
      calidad.sharpnessHi >= 90 &&
      calidad.contrastPapel >= 75;
    let score = scoreDeCalidad(calidad, {
      ocrLegible,
      identificada: clasificacion.nivel === "AUTO",
      conSenal: senalActa,
      pisoPerfecto,
    });
    // KIT e14-diagnostico-autoenvio-v1 (§3-A): score visual = bruto de
    // scoreDeCalidad ANTES de los caps del sitio (escudo-fondo/recortada/
    // incompleta/sin-votos) — el `final` es el que imprime el log.
    // ORDEN del merge (kit e14-diag-campos-aditivos-v1 §4-A.3):
    // scoreDeCalidad → scoreVisual → bloque C3 → inyección SIM → caps.
    const scoreVisual = score;
    // KIT e14-score-lectura-v1 (C3): ajuste por LECTURA — el OCR manda (§3):
    // FUERTE (mesa+4 anclas o 6) sube el score a ≥8.5 (el piso vence al techo
    // fair pero NUNCA al poor — level del core "poor" es evidencia física
    // dura); DEBIL techo 5.9; MEDIA no toca. El texto es el POST-banda
    // (ocrBanda ya sumó — pitfall §9.8; SIN llamada OCR nueva — costo 0).
    // Va EXACTAMENTE aquí (§4-B3): tras scoreDeCalidad y ANTES de la
    // inyección SIM (pitfall §9.5 — los chips 8.2/7.0/4.3 mandan) y de los
    // caps posteriores (escudo fondo/recortada/gate siguen MANDANDO —
    // pitfall §9.4). Mismo criterio en el pipelineRecorte (pitfall §9.9).
    // KIT e14-luz-sim-puntos-v1 (T-D): la declaración de `senal` se SUBIÓ
    // (ahora vive antes de scoreDeCalidad — el piso-10 necesita las anclas
    // dentro del score). Este bloque C3 queda byte a byte leyendo esa const.
    if (senal.nivel === "FUERTE" && calidad.level !== "poor") {
      score = Math.max(score, PISO_LECTURA_FUERTE);
    } else if (senal.nivel === "DEBIL") {
      score = Math.min(score, TECHO_LECTURA_DEBIL);
    }
    // §D3 (SPEC-e14-simulacion-scores): inyección determinista del chip —
    // reemplaza el calculado DESPUÉS de scoreDeCalidad y ANTES del gate.
    // §G3 (KIT e14-gate-v2): SIN re-aplicación del piso de identificada
    // (la constante ya no existe) — el chip manda: 8.2 → OPTIMA por
    // statusDeScore (auto-envío normal) · 7.0 → ADVERTENCIA · 4.3 →
    // RECHAZADA (§D4). Nada se fuerza a mano: `evaluarGate` decide.
    if (opciones.simular && opciones.scoreSimulado != null) {
      score = opciones.scoreSimulado;
    }
    // §F-2 (SPEC-camara-funcional) + GUARD-BORDE Rev. 2: acta INCOMPLETA →
    // resolución por la vía de rechazo SIN tocar evaluarGate (el veto sigue
    // VIVIENDO FUERA del gate — §7 score-ocr intocado, D6/AC10). La decisión
    // del guard llega aquí: la sospecha geométrica SOLO condena con tinta
    // cortada al filo del recorte (D1 — el falso positivo del quad al filo
    // con imagen perfecta queda curado). El resto del pipeline corrió igual
    // (recorte/calidad/OCR) para que REVISIÓN muestre la imagen y el
    // operador entienda el problema.
    const verificacionResuelta = verificacion ? await verificacion : null;
    // D63-C (T2): gate de ESCANEOS por MARCO IMPRESO del formulario — el
    // guard de fotos («contenido al filo = cortada») queda NI UNA LÍNEA
    // distinto para fotos/SIM (el marco solo consulta `origenActa ===
    // "escaneo"`, que SIM/fotos jamás traen — kit T2.4/T3). Veredicto:
    // completo → no bloquea · cortado → INCOMPLETA como hoy (el scanner SÍ
    // cortó la hoja — honesto) · no-encontrado → no bloquea (lectura/score
    // deciden como siempre). El RECT del marco alimenta la región de la
    // zona de votos (el marco ES el borde del acta — mismo sistema de
    // referencia que las fracciones ZONA_* de marcadores.ts).
    const marcoEscaneo: MarcoEscaneo | null =
      origenActa === "escaneo" && !opciones.simular ? await evaluarMarcoImpreso(fotoProcesada) : null;
    // KIT e63d-escaneo-ya-recortado-v1 (F0.2): la LECTURA perdona al marco
    // (mismo patrón que lazoPerdonadoPorLectura del kit lectura-perdona-lazo).
    // Un marco «cortado» en un escaneo CEÑIDO demuestra un corte GEOMÉTRICO
    // de la hoja, no pérdida de CONTENIDO (el marco vive insertado ~2%:
    // cortar EN el marco no pierde ni un dato). La lectura FUERTE + secciones
    // presentes = contenido probado → el veredicto del marco no condena.
    // El gate sigue HONESTO: falta una sección inferior o lectura débil/media
    // → «cortado» sigue condenando (la lectura perdona al marco, NO al
    // contenido faltante — plan §3/§4). "ceñido" (F3) nunca bloquea por
    // construcción (≠ "cortado"). senal (L1368) y faltaSeccion (L1357) ya
    // están calculadas aquí — costo cero.
    let completa = opciones.simular ? true : (verificacionResuelta?.completa ?? true);
    if (marcoEscaneo) {
      // e63d F0.2 · rev.2: el perdón (tabla §3-A) decide si el marco cortado
      // condena — rev.1 negaba el trío (bug ANEXO A caso 4, ver helper).
      completa =
        marcoEscaneo.veredicto === "cortado"
          ? marcoPerdonadoPorLectura(marcoEscaneo.veredicto, senal.nivel, faltaSeccion)
          : true;
    }
    // e71 (P10) — VETO 4/4 FIDUCIALES (kit e71-consolidación): la medición
    // de integridad encontró LAS 4 esquinas ausentes (traza
    // `esquinas=FALTA_tl+tr+bl+br`) → el papel NO está demostrado entero y
    // el gate NO puede ser completa. Va DESPUÉS del perdón del marco (la
    // lectura perdona al marco impreso, pero NUNCA a la ausencia total de
    // fiduciales — evidencia física manda). En SIM esquinas=ESQUINAS_OK →
    // el veto es inalcanzable (guard explícito, chips 8.2/7.0/4.3 intactos).
    if (!opciones.simular && cuatroEsquinasFaltan(esquinas)) {
      completa = false;
    }
    // GATE-MARCADORES (KIT e14-gate-v2, FASE G2) — marcador OBLIGATORIO de
    // votos, FUERA de evaluarGate (MISMO patrón del veto INCOMPLETA: D6/
    // AC10). Fallo del 2026-10-16: acta sin votos llegó OPTIMA y se
    // auto-envió sin que nadie mirara la zona de votos. Medición sobre
    // fotoProcesada (<30 ms p95, motor compartido motorTinta —
    // marcadores.ts). Corre TAMBIÉN en `simular` (default del dueño —
    // calibración: los 3 assets SIM pasan la zona 8.83-57.5% ≫ 0.8%, la
    // demo no se rompe · docs/REPORTE-gate-marcadores-v2.md). INCOMPLETA
    // manda primero: el veto de votos SOLO condena actas completas sin
    // tinta en la zona de votos.
    // D63-C: con RECT del marco impreso (escaneos «completo») la zona se
    // mide RELATIVA AL FORMULARIO — las fracciones fijas ZONA_* asumen el
    // recorte = acta (falso SIN_VOTOS en página-completa con márgenes).
    const marcadores = await medirZonaVotos(fotoProcesada, marcoEscaneo?.rect ?? undefined);
    // KIT actas-vivas-paginas-v1 (FASE C): gate de votos SOLO P1 — la pág 2
    // (constancias) NO tiene zona de votos (hoy pasaba por la tinta de las
    // líneas impresas: de la suerte). Página desconocida → se mide
    // (conservador). Log: votos=skip-pag2 cuando aplique.
    const votosSkipPag2 = clasificacion.pagina?.index === 2;
    const marcadoresOk = completa ? (votosSkipPag2 ? true : marcadores.hayVotos) : true;
    // D10 — escudo anti-fondo: franja(s) ≥85% oscura(s) al filo = fondo/sombra
    // incluida por el warp (NO tinta cortada) → el acta pasa al gate con
    // TECHO 7.9 (nunca ÓPTIMA — statusDeScore: ≥8; el recorte trae fondo y el
    // operador puede preferir repetir) sin copy nuevo. SOLO actas completas
    // (la condenada por tinta no llega al gate).
    if (completa && verificacionResuelta?.fondo) {
      score = Math.min(score, TECHO_ESCUDO_FONDO);
    }
    // KIT actas-vivas-paginas-v1 (FASE C): acta RECORTADA (OCR de secciones)
    // → techo 7.9 — ADVERTENCIA, NO rechazo (conservador en campo). Cap
    // DESPUÉS de la inyección SIM (mismo sitio que el escudo de fondo — el
    // recorte físico manda sobre cualquier score).
    if (recortada) {
      score = Math.min(score, TECHO_ESCUDO_FONDO);
    }
    const gate: ResultadoGate = !completa
      ? {
          // intento < maxIntentos → RECHAZADA · al AGOTAR → contingencia
          // automática C4 (EN_REVISION_HUMANA con el MISMO rechazo).
          status:
            opciones.intento >= opciones.maxIntentos
              ? ("EN_REVISION_HUMANA" as ActaStatus)
              : ("RECHAZADA" as ActaStatus),
          // KIT e63d (F3.4): el copy del rechazo depende del ORIGEN — para
          // escaneos el mensaje de cámara («aléjate») es absurdo: se pide
          // repetir el ESCANEO. Fotos/cámara conservan el copy de siempre
          // byte a byte. (pipelineRecorte —rama manual— sin cambios: F2.4.)
          rechazo: {
            tipo: "INCOMPLETA",
            detalle:
              origenActa === "escaneo" ? DETALLE_INCOMPLETA_ESCANEO : DETALLE_INCOMPLETA,
          },
          clasificacion: null,
        }
      : !marcadoresOk
        ? {
            // KIT e14-gate-v2 (G2): rechazo DIRECTO por marcador
            // obligatorio fallido — mismo desenlace por intentos que
            // INCOMPLETA (repetir; al AGOTAR, contingencia C4 con el
            // MISMO rechazo SIN_VOTOS — un impreso sin votos no puede
            // quedarse en bucle infinito). Copy CORTO, sin guía.
            status:
              opciones.intento >= opciones.maxIntentos
                ? ("EN_REVISION_HUMANA" as ActaStatus)
                : ("RECHAZADA" as ActaStatus),
            rechazo: { tipo: "SIN_VOTOS", detalle: DETALLE_SIN_VOTOS },
            clasificacion: null,
          }
        : this.evaluarGate(score, texto, clasificacion, opciones.intento, opciones.maxIntentos);
    if (!completa) score = Math.min(score, 6.4);
    // Cap del veto de votos (mismo patrón del INCOMPLETA): RECHAZADA
    // implica <6.5 (statusDeScore) — el score queda coherente con el status.
    if (completa && !marcadoresOk) score = Math.min(score, 6.4);

    // §D3 (SPEC-e14-score-ocr): desenlace «SCORE BAJO» determinista — sin
    // señal de contenido, el rechazo se sustituye por BAJO SEA CUAL SEA el
    // status (el status lo sigue decidiendo el gate/los intentos: al agotar,
    // contingencia C4 con su rechazo BAJO real). Con señal, nada cambia
    // (INCOMPLETA/ILEGIBLE/GENERICO como hoy). Mismo patrón que INCOMPLETA:
    // FUERA de evaluarGate (§7 prohibido tocarlo).
    const rechazoFinal: Acta["rechazo"] = senalActa
      ? gate.rechazo
      : { tipo: "BAJO", detalle: DETALLE_BAJO };

    const evidenciaSim =
      opciones.simular && opciones.scoreSimulado != null ? ` sim=${opciones.scoreSimulado}` : "";
    // §D8.3: traza de auditoría del as-is (solo cuando sinRecorte).
    const evidenciaAsis = sinRecorte ? " recorte=as-is" : "";
    // §3c (GUARD-BORDE) — log de auditoría del guard: SOLO cuando hubo
    // sospecha geométrica se añaden los campos nuevos (AC8: sin sospecha el
    // log queda como hoy). `borde=` lados sospechosos ("S|E"), `tintaFilo=`
    // condena, `franja=` densidades de tinta en % por lado sospechoso (mismo
    // orden que borde) y `fondo=` escudo D10.
    // KIT e14-esquinas-suaves-v1 (Q1): token `perdon=` añadido AL FINAL del
    // segmento (tokens NUEVOS solo al final — la línea `senal=` queda byte a
    // byte; perdón por PAR fiducial del lado — Q1).
    const evidenciaBorde =
      verificacionResuelta && verificacionResuelta.sospecha
        ? ` borde=${verificacionResuelta.sospecha}` +
          ` tintaFilo=${verificacionResuelta.tintaFilo}` +
          ` franja=[${verificacionResuelta.densidades.map((d) => d.toFixed(1)).join(",")}]` +
          ` fondo=${verificacionResuelta.fondo}` +
          (verificacionResuelta.perdonLado ? ` perdon=${verificacionResuelta.perdonLado}` : "")
        : "";
    // FASE S (§S.1.5): crop= bbox real usado por calidadDeActa (px) — WxH;
    // `full` si el fallback al frame completo se activó (diagnóstico en campo).
    const cropLog = infoCrop.fallback ? "full" : `${infoCrop.w}x${infoCrop.h}`;
    // KIT e14-diagnostico-autoenvio-v1 (C1/§6-B): techos capturados con las
    // MISMAS condiciones que ya aplicaron los caps — orden real de aplicación
    // (techo-fair/poor/sin-senal de scoreDeCalidad → escudo-fondo → recortada
    // → incompleta → sin-votos). Los de lectura-DEBIL/piso-FUERTE llegan con
    // score-lectura (PR #13, §8 — campos aditivos).
    const techosDiag: string[] = [];
    if (calidad.level === "fair") techosDiag.push("techo-fair:7.9");
    if (calidad.level === "poor") techosDiag.push("techo-poor:6.4");
    if (!senalActa) techosDiag.push(`sin-senal:${TECHO_SIN_SENAL}`);
    // KIT e14-diag-campos-aditivos-v1 (§8 score-lectura): ajustes de LECTURA
    // del score v2 — NO son caps: observabilidad del ajuste (piso sube,
    // techo baja). Condición espejo exacta del C3 (L1050-1055) — el C3
    // aplica DESPUÉS de scoreDeCalidad y ANTES de los caps del sitio.
    if (senal.nivel === "FUERTE" && calidad.level !== "poor")
      techosDiag.push("piso-lectura-FUERTE:8.5");
    if (senal.nivel === "DEBIL") techosDiag.push("lectura-DEBIL:5.9");
    if (completa && verificacionResuelta?.fondo)
      techosDiag.push(`escudo-fondo:${TECHO_ESCUDO_FONDO}`);
    if (recortada) techosDiag.push(`recortada:${TECHO_ESCUDO_FONDO}`);
    if (!completa) techosDiag.push("incompleta:6.4");
    if (completa && !marcadoresOk) techosDiag.push("sin-votos:6.4");
    // C1: el registro nace junto al log (todo en scope — §9.6). SIM nunca
    // (§9.2). Observación PASIVA: si falla, el desenlace NO se toca (§9.7).
    let diag: DiagnosticoActa | null = null;
    if (!opciones.simular) {
      try {
        diag = construirDiagnostico({
          actaId: "", // se parcha con el id REAL tras construirActa
          intento: opciones.intento,
          maxIntentos: opciones.maxIntentos,
          status: gate.status,
          rechazo: rechazoFinal,
          scoreVisual,
          scoreFinal: score,
          techos: techosDiag,
          metricas: {
            sharpness: calidad.sharpness,
            // KIT e14-diag-campos-aditivos-v1: métricas v2 REALES (§3).
            sharpnessHi: calidad.sharpnessHi,
            brightness: calidad.brightness,
            contrast: calidad.contrast,
            contrastPapel: calidad.contrastPapel,
            contrasteEfectivo: contrasteEfectivoDe(calidad, ocrLegible),
          },
          level: calidad.level,
          lecturaChars: texto.length,
          // KIT e14-diag-campos-aditivos-v1: la señal del C3 — MISMA
          // instancia, sin recálculo (pitfall §9.10).
          senalLectura: { nivel: senal.nivel, anclas: senal.anclas },
          senalActa,
          ocrValido: ocrTextIsValid(texto),
          gate: {
            completa,
            // D63-C (T2.3): veredicto del marco impreso (null en fotos/SIM).
            gateMarco: marcoEscaneo?.veredicto ?? null,
            fondo: verificacionResuelta?.fondo ?? false,
            recortada,
            ladoEsquina: ladoEsquina ?? null,
            votos: {
              densidadPct: marcadores.densidadVotosPct,
              skipPag2: votosSkipPag2,
              ok: marcadoresOk,
            },
            procesadaVacia,
            clasifNivel: gate.clasificacion?.nivel ?? "—",
          },
          captura: {
            motor,
            filtro: filtroActa,
            crop: { w: infoCrop.w, h: infoCrop.h, fallback: infoCrop.fallback },
            quad,
            quadOrigen,
          },
          tiempos: {
            procesoMs: ms.proceso,
            calidadMs: ms.calidad,
            ocrMs: ms.ocr,
            totalMs: ms.total,
            // D61 — KIT e14-tiempos-ocultos-v1 (T2): decode/detect YA se medían
            // (ms.decode/ms.detect de este pipeline, hoy en la traza de consola)
            // — ahora PERSISTEN. null honesto si la fase no corrió (video-grab
            // sin archivo → decode=0; sinRecorte → detect=0) — jamás inventar.
            decodeMs: ms.decode > 0 ? Math.round(ms.decode) : null,
            detectMs: ms.detect > 0 ? Math.round(ms.detect) : null,
          },
        });
      } catch {
        diag = null;
      }
    }
    // D57 — KIT e14-instrumentos-espera-v1 (T2): orientacionProbeMs al
    // diagnóstico — asignación DEFENSIVA (jamás lanza; sin diagnóstico → se
    // omite — kit §4-T2). ADITIVO: no toca score/status/gate/tiempos.
    if (diag != null && probeMsOrientacion != null) {
      diag.orientacionProbeMs = probeMsOrientacion;
    }
    // WAVE2 A1 — sub-decisión de la miniatura descartada por el fallo seguro
    // (asignación DEFENSIVA — jamás lanza; sin diagnóstico o sin mini → se
    // omite — jamás inventar). Datos de calibración wave 3.
    if (diag != null && probeMiniOrientacion != null) {
      diag.orientacionProbeMini = probeMiniOrientacion;
    }
    logger.info(
      `[e14] pipeline ${opciones.fuente}/${"archivo" in entrada ? "file" : "video-grab"} ` +
        `total=${Math.round(ms.total)}ms ` +
        `(decode=${Math.round(ms.decode)} detect=${Math.round(ms.detect)} ` +
        `proceso=${Math.round(ms.proceso)} calidad=${Math.round(ms.calidad)} ` +
        `ocr=${Math.round(ms.ocr)} motor=${motor} ocrValido=${ocrTextIsValid(texto)} ` +
        `cabeceraE14=${PATRON_CABECERA.test(texto)} completa=${completa} ` +
        `senal=${senalActa} vacia=${procesadaVacia} votos=${votosSkipPag2 ? "skip-pag2" : `${marcadores.densidadVotosPct.toFixed(1)}%`}${marcadoresOk ? "" : " SIN_VOTOS"}${recortada ? " recortada=1" : ""}${ladoEsquina ? ` lado=${ladoEsquina}` : ""}${lazoPerdonado ? " lazo=perdonado" : ""} esquinas=${trazaEsq}${evidenciaAsis}${evidenciaBorde} ` +
        // KIT e14-luz-sim-puntos-v1 (T-D): piso-10 aplicado (grep-able).
        `quad=[${quad.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}] piso10=${pisoPerfecto ? 1 : 0}${quadOrigen ? ` origen=${quadOrigen}` : ""} ` +
        `score=${score} filtro=${filtroActa} ocrIn=${ocrIn} ` +
        // KIT e14-motor-rapidocr-v1 (PROD-2 §4.2): token grep-able del motor
        // de producción, junto al ocrIn= del PROD-1 (conf/det/rec del OCR
        // principal — capturados antes de la banda).
        `ocr=rapidocr conf=${confOcr != null ? confOcr.toFixed(2) : "?"} det=${Math.round(detOcr)}ms rec=${Math.round(recOcr)}ms ` +
        // KIT e14-score-lectura-v1 (REBASE): señal de lectura v2 en la traza.
        `lectura=${senal.nivel} anclas=${senal.anclas} piso=${score >= 8.5 && senal.nivel === "FUERTE"} ` +
        `clasif={${fmtClasif(gate.clasificacion)}} ` +
        `crop=${cropLog} ` +
        `metricas={sharpness:${calidad.sharpness} brightness:${calidad.brightness} ` +
        `contrast:${calidad.contrast} contEff:${contrasteEfectivoDe(calidad, ocrLegible)} ` +
        `level:${calidad.level}})${evidenciaSim}${diag ? " diag=1" : ""}` +
        // KIT e14-masiva-ux-v1 (T1.3): quién fabricó el quad EN la detección
        // del pipeline + si corrió el reintento post-Sobel (campos AÑADIDOS
        // al final — formato previo intacto).
        `${quadOrigen ? ` detectOrigen=${quadOrigen}` : ""}${detectReintento ? " detectReintento=1" : ""}` +
        // KIT e63f-autoenvio-v1 (F0): balde fino del no-AUTO — token ADITIVO
        // AL FINAL (contrato D51). Ausente si AUTO o sin motivo de los
        // listados (puesto-lugar/tipo/mesa-registro/ruta).
        `${gate.clasificacion?.clasifDebil ? ` ClasifDebil=${gate.clasificacion.clasifDebil}` : ""}`,
    );

    // KIT e14-diagnostico-autoenvio-v1 (C1): adjuntar el registro con el id
    // REAL del acta (el id nace en construirActa — parche post-hoc).
    await aterrizarQrCam(); // e64-qr T-2.1: la señal QR ya aterrizó (corrió en paralelo al OCR)
    const acta = this.construirActa(opciones, parcial, {
      fotoProcesada,
      procesadaVacia,
      // KIT actas-vivas-paginas-v1 (FASE C): el acta lleva la bandera del
      // OCR de secciones para la píldora de REVISIÓN.
      recortada,
      // KIT identificacion-codigo-v1 (FASE F): LADO de la esquina faltante
      // (píldora «ACTA RECORTADA · SUP-IZQ») — null si vino SOLO del OCR
      // de secciones o 4/4 presentes.
      recorteLado: ladoEsquina,
      quadDetectado: quad,
      calidad,
      ocrTexto: texto,
      motor,
      // §D8.3 (SPEC-e14-score-ocr Rev. 3): as-is nace "original" (veracidad
      // en el editor — el acta NO pasó por filtro); pipeline normal "bw".
      filtro: filtroActa,
      score,
      status: gate.status,
      rechazo: rechazoFinal,
      clasificacion: gate.clasificacion,
    });
    if (diag) {
      diag.actaId = acta.id;
      acta.diagnostico = diag;
      // KIT e14-observabilidad-v1 (A1-C7, cambio QUIRÚRGICO): emisión perf
      // del desenlace — lazy import + catch total (el rastreo jamás rompe
      // el pipeline, §2.4), mapea SOLO campos ya en scope (§9.10: tiempos/
      // gate/ocrValido leídos de diag — nada re-evaluado). El actaId sale
      // SIEMPRE hasheado (FNV-1a dentro de emitirPerfDeActa, §2.5).
      void import("./obs/captura")
        .then((m) =>
          m.emitirPerfDeActa({
            actaId: acta.id,
            status: acta.status,
            intento: acta.intento,
            tiempos: {
              procesoMs: diag.tiempos.procesoMs,
              calidadMs: diag.tiempos.calidadMs,
              ocrMs: diag.tiempos.ocrMs,
              totalMs: diag.tiempos.totalMs,
            },
            scoreVisual,
            scoreFinal: score,
            gate: gate.status,
            ocrValido: diag.ocrValido,
          }),
        )
        .catch(() => {});
    }
    return acta;
  }

  /**
   * L5 (§7.5) — RECORTE MANUAL (rescate D20): re-ejecuta el pipeline §5 sobre
   * `fotoOriginal` con el quad del editor (F5-MANUAL: `manual: true` respeta
   * el quad al píxel, sin refine) y devuelve el acta ACTUALIZADA. El acta
   * conserva IDENTIDAD (fuente/intento/maxIntentos/paginación/título…) — el
   * rescate NO es una captura nueva, no consume intento. Timeout 15 s igual
   * que escanearActa: resuelve un acta RECHAZADA ILEGIBLE controlada.
   * F4/D37: `rotacionOverride` (4º parámetro) hornea la rotación LOCAL del
   * editor — el retorno de pipelineRecorte fija `rotation: rotacionUsada`.
   * KIT e14-esquinas-suaves-v1 (Q2): `manual` (6º parámetro, default false)
   * marca el recorte del EDITOR (decisión CON VISTA — escudo-manual: la tinta
   * al filo del crop manual nunca RECHAZA). Solo lo pasa el store
   * (aplicarRecorte); mejorarResolución conserva el default (conservador).
   */
  recortar(
    acta: Acta,
    quad: Quad,
    onProgreso?: (p: ProgresoAnalisis) => void,
    rotacionOverride?: number,
    // KIT e14-quad-sobel-v1 (P1 §4-B): origen del quad cuando la detección
    // corrió (mejorarResolución). El recorte MANUAL del editor (store) no lo
    // pasa — el quad lo puso el usuario, ninguna detección corrió → undefined
    // → token ausente (n/d no miente).
    quadOrigen?: OrigenQuad | "pagina-completa" | null,
    // KIT e14-esquinas-suaves-v1 (Q2): recorte del editor = decisión CON VISTA.
    manual = false,
  ): Promise<Acta> {
    const fotoOriginal = acta.fotoOriginal;
    if (!fotoOriginal) {
      return Promise.reject(new Error("SIN FOTO ORIGINAL PARA RECORTAR"));
    }
    const rotacion = rotacionOverride ?? acta.rotation ?? 0;
    // KIT e14-recorte-manual-v1 (T1): acumulador del recorte YA HORNEADO —
    // pipelineRecorte lo llena apenas el warp completa (patrón `parcial` del
    // escaneo §5, A7); el timeout lo usa para que el acta RECHAZADA por
    // tiempo muestre EL RECORTE NUEVO del dueño y no la foto anterior. Si el
    // warp no alcanzó, parcial queda vacío → comportamiento actual.
    const parcial: ParcialRecorte = {};
    let vencido = false; // tras el timeout no se emite más progreso (§5)
    const emitir = (p: ProgresoAnalisis) => {
      if (!vencido) onProgreso?.(p);
    };

    return new Promise<Acta>((resolve, reject) => {
      const timer = setTimeout(() => {
        vencido = true;
        // §5: el timeout NO rechaza la Promise — resuelve el acta RECHAZADA
        // controlada (el toast sale del flujo normal del store).
        // KIT e14-recorte-manual-v1 (T1): `...parcial` trae el recorte ya
        // horneado si el warp alcanzó a correr — el dueño ve SU recorte
        // (puede re-aplicar/reintentar), no la foto anterior. Gate y score
        // INTACTOS: sigue RECHAZADA ILEGIBLE por tiempo.
        resolve({
          ...acta,
          ...parcial,
          score: 0,
          status: "RECHAZADA",
          rechazo: { tipo: "ILEGIBLE", detalle: DETALLE_TIMEOUT },
          firmas: this.firmasPorStatus(acta.firmas, "RECHAZADA"),
          // FIX (auditoría 2-a #8): el invariante del gate (RECHAZADA ⇒
          // clasificación descartada) también en el timeout del recorte —
          // el spread conservaba una clasificación AUTO previa (p. ej. de
          // un acta ADVERTENCIA que se re-recortaba) y el título/historial
          // mostraban mesa/tipo/página de una identificación que el propio
          // gate acaba de descartar (undefined = sin clasificación, mismo
          // convenio del contrato Acta).
          clasificacion: undefined,
        });
      }, RECORTE_TIMEOUT_MS);

      void this.pipelineRecorte(acta, fotoOriginal, quad, rotacion, emitir, quadOrigen, manual, parcial).then(
        (actaNueva) => {
          if (vencido) return; // ya resolvió el timeout: el resultado se descarta
          clearTimeout(timer);
          resolve(actaNueva);
        },
        (error) => {
          if (vencido) return;
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("ERROR DE PIPELINE"));
        },
      );
    });
  }

  /**
   * KIT camara-visor-v1 (G3 — upgrade silencioso del lab L1789-1842):
   * RE-PROCESA el acta con una foto NUEVA a máxima resolución (la toma
   * full-res del sensor que aterrizó en segundo plano tras el disparo
   * rápido por escalera). REUTILIZA el pipeline existente (mismo patrón de
   * `recortar`: re-proceso sin consumir intento — el acta conserva
   * identidad de captura: fuente/intento/maxIntentos/paginación) con dos
   * diferencias obligatorias frente al recorte: (1) el QUAD se RE-DETECTA
   * sobre la foto nueva (los quads son normalizados 0-1 y el aspecto del
   * sensor 4:3 ≠ preview 16:9 — re-usar el quad del preview desplazaría el
   * warp; el lab hace exactamente esto con applyAutoQuad) y (2) la
   * `fotoOriginal` del acta queda REEMPLAZADA por la nueva. El gate se
   * re-evalúa COMPLETO (pipelineRecorte: completitud + marcadores + OCR +
   * clasificación — helper único §4.4).
   */
  async mejorarResolucion(
    acta: Acta,
    fotoNueva: string,
    onProgreso?: (p: ProgresoAnalisis) => void,
  ): Promise<Acta> {
    // 1) Detección del quad sobre la foto NUEVA (worker OpenCV → fallback
    //    Sobel del core — MISMA vía del pipeline de escaneo). Si no detecta
    //    (imagen sin bordes), quad identidad: la foto entera es el acta —
    //    degradación honesta (§0: sin datos reales no se inventa).
    //    KIT e14-quad-sobel-v1 (P1 §4-B): el origen viaja con el quad — y en
    //    el catch el origen es null (ni siquiera corrió el Sobel — n/d no
    //    miente, misma filosofía del T-A).
    let quad: Quad;
    let quadOrigen: OrigenQuad | "pagina-completa" | null = null;
    try {
      const detalle = await detectDocumentEdgesDetail(fotoNueva);
      quad = detalle.quad;
      quadOrigen = detalle.origen;
    } catch {
      quad = defaultQuad();
    }
    // 2) Pipeline de RECORTE existente sobre la foto nueva (calidad + OCR +
    //    gate completo, timeout 15 s igual que recortar). El acta conservada
    //    es la ORIGINAL del disparo (identidad); su fotoOriginal pasa a ser
    //    la full-res que aterrizó.
    const actaBase: Acta = { ...acta, fotoOriginal: fotoNueva };
    return this.recortar(actaBase, quad, onProgreso, undefined, quadOrigen);
  }

  /** Pipeline §5 del RECORTE (sin decode/detección: la foto y el quad ya son
   *  conocidos). Reusa los helpers del pipeline L2 (conRampa, scoreDeCalidad,
   *  PATRON_CABECERA) y el mapeo §4.1 + gate §4.2 idénticos. */
  private async pipelineRecorte(
    acta: Acta,
    fotoOriginal: string,
    quad: Quad,
    rotacion: number,
    emitir: (p: ProgresoAnalisis) => void,
    // KIT e14-quad-sobel-v1 (P1 §4-B): origen del quad — null/undefined si la
    // detección NO corrió (recorte manual del editor, catch de mejorar).
    quadOrigen: OrigenQuad | "pagina-completa" | null = null,
    // KIT e14-esquinas-suaves-v1 (Q2): true SOLO desde el editor del store
    // (aplicarRecorte) — activa el ESCUDO-MANUAL del gate (abajo).
    manual = false,
    // KIT e14-recorte-manual-v1 (T1): acumulador del recorte horneado — el
    // timeout de recortar() resuelve con él (patrón `parcial` del escaneo).
    parcial: ParcialRecorte,
  ): Promise<Acta> {
    const ms = { proceso: 0, calidad: 0, ocr: 0, total: 0 };
    const inicio = performance.now();
    // F2/D36: el recorte conserva el filtro del acta (default del producto "bw").
    const filtro: PageFilter = acta.filtro ?? "bw";

    // 1) Recorte + realce (warp real INTER_CUBIC + filtro del acta, F5-MANUAL).
    //    KIT e14-ocr-lee-original-v1 (PROD-1 §4.2): MISMO patrón del escaneo —
    //    DOS variantes bajo la MISMA conRampa: la del filtro del acta
    //    (MOSTRAR/GUARDAR) y "original" para LEER. Si el acta YA está en
    //    "original", la procesada ES la entrada del OCR (UNA sola llamada —
    //    pitfall §9.4: NO duplicar el warp; la promesa se comparte).
    //    .catch(() => null): la variante nueva jamás rechaza el rescate
    //    (fallback bw-fallback §5). msEstimados 1400→2200 (2.º warp, §1.4).
    emitir({ etapa: "RECORTANDO", progreso: 0.2 });
    const tProceso = performance.now();
    const pBw = processImage(fotoOriginal, quad, filtro, rotacion, { manual: true });
    const pOcr =
      filtro === "original"
        ? pBw
        : processImage(fotoOriginal, quad, "original", rotacion, { manual: true }).catch(
            () => null,
          );
    const [resultado, resultadoOcr] = await conRampa(
      Promise.all([pBw, pOcr]),
      2200,
      // RECORTANDO .2→.6 (warp) → REALZANDO .4→1 (enhance), interpolado.
      (f) =>
        f < 0.55
          ? { etapa: "RECORTANDO", progreso: 0.2 + (f / 0.55) * 0.4 }
          : { etapa: "REALZANDO", progreso: 0.4 + ((f - 0.55) / 0.45) * 0.6 },
      emitir,
    );
    ms.proceso = performance.now() - tProceso;
    emitir({ etapa: "REALZANDO", progreso: 1 });
    // KIT e14-orientacion-auto-v1 (T-A3): let — el probe puede reemplazarla
    // por la YA derecha (§2.1 paso 4); el horneado `parcial` de abajo consume
    // la final.
    let fotoProcesada = resultado.processed;
    // KIT e14-recorte-manual-v1 (T1): el warp COMPLETÓ — horneado al
    // acumulador (el timeout de recortar() ya puede mostrar este recorte
    // aunque calidad/OCR/gate no alcancen dentro del presupuesto).
    parcial.fotoProcesada = fotoProcesada;
    parcial.quadDetectado = quad;
    parcial.rotation = rotacion;
    // PROD-1 (§4.2): entrada del OCR con fallback idéntico al escaneo (§5).
    // Con filtro "original" la procesada ES la entrada (ocrIn=original — reuse).
    let fotoOcr = fotoProcesada;
    let ocrIn: "original" | "bw-fallback" = "original";
    if (resultadoOcr?.processed) {
      fotoOcr = resultadoOcr.processed;
    } else {
      ocrIn = "bw-fallback";
    }
    // KIT e14-orientacion-auto-v1 (T-A3): MISMO probe del escaneo (§2.1) —
    // en recorte MANUAL el usuario puede no haber corregido la rotación.
    // Aquí no hay SIM (el recorte siempre es real). Al aplicar se giran
    // fotoOcr Y fotoProcesada y el acumulador `parcial` (horneado temprano,
    // kit recorte-manual) se actualiza con la YA derecha.
    // D57 — KIT e14-instrumentos-espera-v1 (T2): MISMO instrumento del escaneo
    // — coste del probe persistido en el diagnóstico (aditivo, defensivo).
    let probeMsOrientacion: number | null = null;
    // WAVE2 A1 — sub-decisión de la miniatura descartada por el fallo seguro
    // (datos para calibración wave 3 — jamás cambia la decisión de HOY).
    let probeMiniOrientacion: ProbeOrientacion["orientacionProbeMini"] | null =
      null;
    {
      const probe = await probeOrientacion(fotoOcr);
      if (probe != null) probeMsOrientacion = probe.ms; // D57 T2
      probeMiniOrientacion = probe?.orientacionProbeMini ?? null; // WAVE2 A1 — la mini que el fallo seguro descartó
      if (probe?.aplicado) {
        fotoOcr = await rotarDataUrl(fotoOcr, probe.rot);
        fotoProcesada = await rotarDataUrl(fotoProcesada, probe.rot);
        parcial.fotoProcesada = fotoProcesada;
      }
    }
    // §D4 (SPEC-e14-score-ocr): tinta de la procesada re-recortada — mismo
    // criterio del pipeline (un crop sobre zona sin tinta → ORIGINAL).
    const procesadaVacia = await procesadaVaciaDataUrl(fotoProcesada);
    // KIT e14-recorte-manual-v1 (T1): la tinta del recorte ya se midió —
    // también al acumulador (ReviewView decide el swap de display con esto;
    // el swap permanece — T3 solo cambia el aviso bajo la tarjeta).
    parcial.procesadaVacia = procesadaVacia;

    // 2) Calidad de la página.
    //    KIT visor-accion-score-v1 (FASE S): MISMO cambio que el escaneo —
    //    el quad del editor está en coordenadas de `fotoOriginal` (misma
    //    unidad): el score mide el RECORTE pedido, no la mesa (§S.0).
    emitir({ etapa: "CALIDAD", progreso: 0 });
    const tCalidad = performance.now();
    const infoCrop: InfoCrop = { w: 0, h: 0, fallback: false };
    const calidad = await calidadDeActa(fotoOriginal, quad, infoCrop);
    ms.calidad = performance.now() - tCalidad;
    emitir({ etapa: "CALIDAD", progreso: 1 });

    // 3) OCR sobre la variante de ENTRADA del OCR (PROD-1 §4.2: recorte SIN
    //    filtro con fallback idéntico al escaneo; gate §4.2). KIT
    //    e14-ocr-escalonado-v1 (§2): MISMO OCR ESCALONADO del escaneo — el
    //    manual también merece el ahorro (§2). El recorte NO tiene SIM
    //    (siempre real; guard fuente SIMULACION = mismo del diag §9.2).
    //    Motor RapidOCR (PROD-2 §2-C2); progreso real por lotes (§2-C4).
    const tOcr = performance.now();
    const ocrEsc = await reconocerRapidOcrEscalonado(
      fotoOcr,
      (p) => {
        emitir({ etapa: "OCR", progreso: Math.min(1, Math.max(0, p)) });
      },
      {
        simular: acta.fuente === "SIMULACION",
        // §3 presupuesto: el timeout EXISTENTE del recorte manda
        // (RECORTE_TIMEOUT_MS — T1 recorte-manual); sin presupuestos nuevos.
        presupuestoMs: RECORTE_TIMEOUT_MS,
        inicioMs: inicio,
      },
    );
    let texto = ocrEsc.texto;
    ms.ocr = performance.now() - tOcr;
    // PROD-2 (§4.2): conf/det/rec de la pasada ELEGIDA, antes de la banda.
    const confOcr = ocrEsc.conf;
    const detOcr = ocrEsc.detMs;
    const recOcr = ocrEsc.recMs;
    emitir({ etapa: "OCR", progreso: 1 });
    // KIT consenso-frankfurt-v1 (FASE 4, §5): banda dirigida — MISMO helper
    // del escaneo (§4.4); el recorte no tiene SIM (siempre real).
    if (tipoDeBanda(texto) === null) {
      const tBanda = performance.now();
      texto += "\n" + (await ocrBanda(fotoProcesada));
      ms.ocr += performance.now() - tBanda;
    }
    ms.total = performance.now() - inicio;

    const motor = resultado.precision?.engine ?? "canvas";

    // 4) Mapeo §4 → status/score/rechazo + clasificación (idéntico al
    //    escaneo — helper ÚNICO evaluarGate, §4.4: AMBOS pipelines con el
    //    MISMO criterio). §X (SPEC-score-legible): clasificación primero,
    //    score con señales de legibilidad.
    // §F-3 (SPEC-camara-funcional) + GUARD-BORDE Rev. 2 (D3/AC11): el quad
    // del editor está en coordenadas de `fotoOriginal` → la MISMA regla de
    // completitud ANTES del gate — el helper ÚNICO verificarCompletitud
    // (geometría sospecha, tinta condena: el rescate de un encuadre apretado
    // con filo limpio ya NO muere por geometría sola). El rescate NO sirve
    // de bypass: si el papel está cortado EN VERDAD (tinta al filo), ningún
    // crop lo completa; si el acta SÍ está entera (detección falló por
    // sombra), el recorte manual la rescata legítimamente.
    // KIT consenso-frankfurt-v1 (FASE 2, §3): esquinas ANTES del guard — la
    // marca presente es PRUEBA POSITIVA de papel entero (ANALISIS §5.1) →
    // verificarCompletitud la consulta y perdona la sospecha geométrica
    // (§0-F2). UNA sola medición (helper único esquinasDeActa — §4.4).
    // <80×120 → null (n/d — jamás condena).
    const esquinas = await esquinasDeActa(fotoProcesada);
    const ladoEsquina = esquinas ? ladoEsquinaFaltante(esquinas) : null;
    const trazaEsq = trazaEsquinas(esquinas);
    const verificacion = await verificarCompletitud(quad, fotoProcesada, esquinas);
    // e71 (P10) — VETO 4/4 FIDUCIALES (mismo criterio del escaneo — helper
    // ÚNICO cuatroEsquinasFaltan, pitfall §9.9): las 4 marcas ausentes →
    // `completa` false. En el RECORTE MANUAL el veto NO rechaza (doctrina
    // Q2 del kit esquinas-suaves: el operador VIO el papel) — degrada al
    // escudo-manual (techo 7.9) vía vetoIncompleta/escudoManual de abajo;
    // diag.gate.completa SÍ reporta false (kit P10 — coherencia del
    // informe con la medición física).
    const completa =
      verificacion.completa && !cuatroEsquinasFaltan(esquinas);
    // KIT e14-esquinas-suaves-v1 (Q2): ESCUDO-MANUAL — `!completa` en un recorte
    // MANUAL no rechaza: techo 7.9 (patrón del escudo D10). El operador VIO el
    // papel; a lo sumo su crop cortó un poco de impresión y lo decide mirando.
    // SIN_VOTOS y BAJO siguen mandando (contenido, no esquinas). Solo recorte:
    // el escaneo conserva el veto completo (conservador en campo — Q1 lo relaja).
    const vetoIncompleta = !completa && !manual;
    const escudoManual = !completa && manual;
    // GATE-MARCADORES (KIT e14-gate-v2, FASE G2) en el recorte — mismo
    // marcador obligatorio y MISMO criterio que el escaneo (helper ÚNICO,
    // §4.4): el recorte re-evalúa TODO el gate, los votos incluidos. Sin
    // excepción: un recorte que deja la zona de votos fuera → SIN_VOTOS
    // (vuelve a captura) — el recorte NUNCA rescata un acta sin votos.
    // KIT actas-vivas-paginas-v1 (FASE C): clasificación ANTES de
    // medirZonaVotos (solo depende de texto — ya está en vuelo): el gate de
    // votos necesita la página (solo P1 tiene zona) y el recorte OCR de
    // secciones se calcula de paso.
    const clasificacion = clasificarCabecera(texto, await cargarDivipol());
    // (KIT consenso-frankfurt-v1 FASE 2: las esquinas se miden ANTES del
    // guard — arriba; aquí solo consume ladoEsquina/trazaEsq.)
    // KIT actas-vivas-paginas-v1 (FASE C): RECORTADA por OCR de secciones —
    // mismas señales que el escaneo (helper ÚNICO §4.4). FASE F: OR esquinas.
    // KIT e14-lectura-perdona-lazo-v1 (§4-B): MISMO perdón del escaneo — la
    // LECTURA perdona al lazo (falso positivo margen corto/sombra); la señal
    // de secciones NUNCA se perdona. Mismo criterio en AMBOS pipelines
    // (pitfall §9.9 del kit score-lectura — helper único).
    const faltaSeccion = faltaSeccionInferior(texto, clasificacion.pagina);
    const lazoPerdonado = lazoPerdonadoPorLectura(esquinas, texto, faltaSeccion);
    const recortada = faltaSeccion || (ladoEsquina !== null && !lazoPerdonado);
    const marcadores = await medirZonaVotos(fotoProcesada);
    // KIT actas-vivas-paginas-v1 (FASE C): gate de votos SOLO P1 — la pág 2
    // (constancias) NO tiene zona de votos. Página desconocida → se mide
    // (conservador). Log: votos=skip-pag2 cuando aplique.
    const votosSkipPag2 = clasificacion.pagina?.index === 2;
    // KIT e14-esquinas-suaves-v1 (Q2): con escudo-manual el gate de votos
    // SIGUE corriendo (un rescate sin votos no pasa) — solo el veto del guard
    // se degrada a techo; el veto por marcador obligatorio queda INTACTO.
    const marcadoresOk = vetoIncompleta ? true : (votosSkipPag2 ? true : marcadores.hayVotos);
    const ocrLegible = ocrTextIsValid(texto);
    // §D1 (SPEC-e14-score-ocr): señal de contenido — mismo criterio §4.4
    // (helper único, AMBOS pipelines con el MISMO criterio).
    const senalActa = senalDeContenido(texto, clasificacion);
    // KIT e14-luz-sim-puntos-v1 (T-D): `senal` se sube aquí (antes vivía
    // tras scoreDeCalidad) — es PURA (misma entrada → misma salida) y el
    // piso-10 necesita las anclas dentro del scoreDeCalidad. El bloque C3
    // de abajo queda idéntico leyendo esta misma const.
    const senal = senalDeLectura(texto, clasificacion.parciales);
    // KIT e14-luz-sim-puntos-v1 (T-D): LAS 4 condiciones de §4.1. Todas o
    // ninguna (conservador — G3).
    const pisoPerfecto =
      senal.nivel === "FUERTE" &&
      senal.anclas >= 8 &&
      calidad.sharpnessHi >= 90 &&
      calidad.contrastPapel >= 75;
    let score = scoreDeCalidad(calidad, {
      ocrLegible,
      identificada: clasificacion.nivel === "AUTO",
      conSenal: senalActa,
      pisoPerfecto,
    });
    // KIT e14-diagnostico-autoenvio-v1 (§3-A): score visual ANTES de los caps
    // del sitio (misma convención que el escaneo). ORDEN del merge (kit
    // e14-diag-campos-aditivos-v1 §4-A.3): scoreDeCalidad → scoreVisual → C3.
    const scoreVisual = score;
    // KIT e14-score-lectura-v1 (C3): MISMO ajuste por LECTURA del escaneo
    // (§4-B3 — mismo criterio en re-análisis, pitfall §9.9). El texto es el
    // POST-banda (consenso-frankfurt FASE 4); SIN llamada OCR nueva. Va
    // ANTES de los caps posteriores: escudo fondo/recortada/gate siguen
    // MANDANDO (pitfall §9.4 — una recortada con lectura FUERTE se queda ≤7.9).
    // KIT e14-luz-sim-puntos-v1 (T-D): misma subida de `senal` del escaneo
    // (§4.4 del kit — EXACTAMENTE el mismo patrón en pipelineRecorte).
    if (senal.nivel === "FUERTE" && calidad.level !== "poor") {
      score = Math.max(score, PISO_LECTURA_FUERTE);
    } else if (senal.nivel === "DEBIL") {
      score = Math.min(score, TECHO_LECTURA_DEBIL);
    }
    // D10 — escudo anti-fondo (mismo criterio del escaneo): el rescate trae
    // fondo/sombra al filo → gate con TECHO 7.9 (nunca ÓPTIMA), sin copy.
    if (completa && verificacion.fondo) {
      score = Math.min(score, TECHO_ESCUDO_FONDO);
    }
    // KIT e14-esquinas-suaves-v1 (Q2): escudo-MANUAL — el acta pasa al gate
    // con TECHO 7.9 (ADVERTENCIA como máximo; el operador decide si repetir).
    // Colocado JUNTO al escudo-fondo (antes del cap de `recortada`; los caps
    // del sitio mandan sobre el piso-10 — §G3; orden de caps pitfall G3:
    // techo fair/poor → sin-señal → piso-10 → escudo-fondo → escudo-manual
    // → recortada → incompleta → sin-votos).
    if (escudoManual) {
      score = Math.min(score, TECHO_ESCUDO_FONDO);
    }
    // KIT actas-vivas-paginas-v1 (FASE C): acta RECORTADA → techo 7.9 —
    // ADVERTENCIA, NO rechazo (mismo criterio del escaneo, helper ÚNICO §4.4).
    if (recortada) {
      score = Math.min(score, TECHO_ESCUDO_FONDO);
    }
    const gate: ResultadoGate = vetoIncompleta
      ? {
          status:
            acta.intento >= acta.maxIntentos
              ? ("EN_REVISION_HUMANA" as ActaStatus)
              : ("RECHAZADA" as ActaStatus),
          rechazo: { tipo: "INCOMPLETA", detalle: DETALLE_INCOMPLETA },
          clasificacion: null,
        }
      : !marcadoresOk
        ? {
            // KIT e14-gate-v2 (G2): rechazo directo SIN_VOTOS — mismo
            // desenlace por intentos que INCOMPLETA (contingencia C4 al
            // AGOTAR, con el MISMO rechazo). Copy CORTO, sin guía.
            status:
              acta.intento >= acta.maxIntentos
                ? ("EN_REVISION_HUMANA" as ActaStatus)
                : ("RECHAZADA" as ActaStatus),
            rechazo: { tipo: "SIN_VOTOS", detalle: DETALLE_SIN_VOTOS },
            clasificacion: null,
          }
        : this.evaluarGate(score, texto, clasificacion, acta.intento, acta.maxIntentos);
    // KIT e14-esquinas-suaves-v1 (Q2): cap del veto SOLO cuando el veto es
    // REAL (vetoIncompleta) — con escudo-manual el cap 7.9 ya aplicó arriba.
    if (vetoIncompleta) score = Math.min(score, 6.4);
    if (completa && !marcadoresOk) score = Math.min(score, 6.4);
    // §D3 (SPEC-e14-score-ocr): sustitución BAJO sin señal — igual que el
    // escaneo (el recorte de una foto sin acta no fabrica señal).
    const rechazoFinal: Acta["rechazo"] = senalActa
      ? gate.rechazo
      : { tipo: "BAJO", detalle: DETALLE_BAJO };

    // §3c (GUARD-BORDE): log de auditoría del guard — SOLO con sospecha
    // geométrica (AC8). Mismos campos que el pipeline de escaneo.
    // KIT e14-esquinas-suaves-v1 (Q1): token `perdon=` añadido AL FINAL del
    // segmento (tokens NUEVOS solo al final — líneas `senal=`/`level:`
    // intocables byte a byte).
    const evidenciaBordeRecorte =
      verificacion.sospecha
        ? ` borde=${verificacion.sospecha}` +
          ` tintaFilo=${verificacion.tintaFilo}` +
          ` franja=[${verificacion.densidades.map((d) => d.toFixed(1)).join(",")}]` +
          ` fondo=${verificacion.fondo}` +
          (verificacion.perdonLado ? ` perdon=${verificacion.perdonLado}` : "")
        : "";
    // FASE S (§S.1.5): crop= bbox real usado por calidadDeActa (px) — WxH;
    // `full` si el fallback al frame completo se activó (diagnóstico en campo).
    const cropLog = infoCrop.fallback ? "full" : `${infoCrop.w}x${infoCrop.h}`;
    // KIT e14-diagnostico-autoenvio-v1 (C1/§6-B): techos con las MISMAS
    // condiciones que aplicaron los caps (orden real) — sitio recorte.
    const techosDiag: string[] = [];
    if (calidad.level === "fair") techosDiag.push("techo-fair:7.9");
    if (calidad.level === "poor") techosDiag.push("techo-poor:6.4");
    if (!senalActa) techosDiag.push(`sin-senal:${TECHO_SIN_SENAL}`);
    // KIT e14-diag-campos-aditivos-v1 (§8 score-lectura): ajustes de LECTURA
    // del score v2 — NO son caps: observabilidad del ajuste (piso sube,
    // techo baja). Condición espejo exacta del C3 del recorte (L1503-1508) —
    // mismo criterio en AMBOS pipelines (pitfall §9.9 score-lectura).
    if (senal.nivel === "FUERTE" && calidad.level !== "poor")
      techosDiag.push("piso-lectura-FUERTE:8.5");
    if (senal.nivel === "DEBIL") techosDiag.push("lectura-DEBIL:5.9");
    if (completa && verificacion.fondo)
      techosDiag.push(`escudo-fondo:${TECHO_ESCUDO_FONDO}`);
    // KIT e14-esquinas-suaves-v1 (Q2): techo del escudo-manual (7.9) — junto
    // al escudo-fondo, MISMO orden de aplicación de los caps.
    if (escudoManual) techosDiag.push("escudo-manual:7.9");
    if (recortada) techosDiag.push(`recortada:${TECHO_ESCUDO_FONDO}`);
    // KIT e14-esquinas-suaves-v1 (Q2): el token `incompleta:6.4` SOLO con el
    // veto real (un recorte manual incompleto NO es INCOMPLETA — es escudo).
    if (vetoIncompleta) techosDiag.push("incompleta:6.4");
    if (completa && !marcadoresOk) techosDiag.push("sin-votos:6.4");
    // C1: registro del desenlace junto al log (§9.6). Guard extra §9.2: un
    // recorte de un acta SIMULACION tampoco adjunta (doble guard con el store).
    let diag: DiagnosticoActa | null = null;
    if (acta.fuente !== "SIMULACION") {
      try {
        diag = construirDiagnostico({
          actaId: acta.id, // el acta existe — identidad conservada (spread)
          intento: acta.intento,
          maxIntentos: acta.maxIntentos,
          status: gate.status,
          rechazo: rechazoFinal,
          scoreVisual,
          scoreFinal: score,
          techos: techosDiag,
          metricas: {
            sharpness: calidad.sharpness,
            // KIT e14-diag-campos-aditivos-v1: métricas v2 REALES (§3).
            sharpnessHi: calidad.sharpnessHi,
            brightness: calidad.brightness,
            contrast: calidad.contrast,
            contrastPapel: calidad.contrastPapel,
            contrasteEfectivo: contrasteEfectivoDe(calidad, ocrLegible),
          },
          level: calidad.level,
          lecturaChars: texto.length,
          // KIT e14-diag-campos-aditivos-v1: la señal del C3 del recorte —
          // MISMA instancia, sin recálculo (pitfall §9.10).
          senalLectura: { nivel: senal.nivel, anclas: senal.anclas },
          senalActa,
          ocrValido: ocrTextIsValid(texto),
          gate: {
            completa,
            fondo: verificacion.fondo,
            recortada,
            ladoEsquina: ladoEsquina ?? null,
            votos: {
              densidadPct: marcadores.densidadVotosPct,
              skipPag2: votosSkipPag2,
              ok: marcadoresOk,
            },
            procesadaVacia,
            clasifNivel: gate.clasificacion?.nivel ?? "—",
          },
          captura: {
            motor,
            filtro,
            crop: { w: infoCrop.w, h: infoCrop.h, fallback: infoCrop.fallback },
            quad,
            quadOrigen,
          },
          tiempos: {
            procesoMs: ms.proceso,
            calidadMs: ms.calidad,
            ocrMs: ms.ocr,
            totalMs: ms.total,
            // D61 — KIT e14-tiempos-ocultos-v1 (T2): esta ruta (recorte manual
            // del editor) NO mide decode/detect (su `ms` local solo trae
            // proceso/calidad/ocr/total) — null honesto, jamás inventar.
            decodeMs: null,
            detectMs: null,
          },
        });
      } catch {
        diag = null;
      }
    }
    // D57 — KIT e14-instrumentos-espera-v1 (T2): orientacionProbeMs al
    // diagnóstico — asignación DEFENSIVA (jamás lanza; sin diagnóstico → se
    // omite — kit §4-T2). ADITIVO: no toca score/status/gate/tiempos.
    if (diag != null && probeMsOrientacion != null) {
      diag.orientacionProbeMs = probeMsOrientacion;
    }
    // WAVE2 A1 — sub-decisión de la miniatura descartada por el fallo seguro
    // (asignación DEFENSIVA — jamás lanza; sin diagnóstico o sin mini → se
    // omite — jamás inventar). Datos de calibración wave 3.
    if (diag != null && probeMiniOrientacion != null) {
      diag.orientacionProbeMini = probeMiniOrientacion;
    }
    logger.info(
      `[e14] recorte ${acta.fuente} total=${Math.round(ms.total)}ms ` +
        `(proceso=${Math.round(ms.proceso)} calidad=${Math.round(ms.calidad)} ` +
        `ocr=${Math.round(ms.ocr)} motor=${motor} ocrValido=${ocrTextIsValid(texto)} ` +
        `cabeceraE14=${PATRON_CABECERA.test(texto)} completa=${completa} ` +
        `senal=${senalActa} vacia=${procesadaVacia} votos=${votosSkipPag2 ? "skip-pag2" : `${marcadores.densidadVotosPct.toFixed(1)}%`}${marcadoresOk ? "" : " SIN_VOTOS"}${recortada ? " recortada=1" : ""}${ladoEsquina ? ` lado=${ladoEsquina}` : ""}${lazoPerdonado ? " lazo=perdonado" : ""} esquinas=${trazaEsq}${evidenciaBordeRecorte}${manual ? " manual=1" : ""}${escudoManual ? " escudo-manual=1" : ""} ` +
        // KIT e14-luz-sim-puntos-v1 (T-D): piso-10 aplicado (grep-able).
        `quad=[${quad.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}] piso10=${pisoPerfecto ? 1 : 0}${quadOrigen ? ` origen=${quadOrigen}` : ""} ` +
        `score=${score} filtro=${filtro} ocrIn=${ocrIn} ` +
        // KIT e14-motor-rapidocr-v1 (PROD-2 §4.2): token grep-able del motor.
        `ocr=rapidocr conf=${confOcr != null ? confOcr.toFixed(2) : "?"} det=${Math.round(detOcr)}ms rec=${Math.round(recOcr)}ms ` +
        // KIT e14-score-lectura-v1 (REBASE): señal de lectura v2 en la traza.
        `lectura=${senal.nivel} anclas=${senal.anclas} piso=${score >= 8.5 && senal.nivel === "FUERTE"} ` +
        `clasif={${fmtClasif(gate.clasificacion)}} ` +
        `crop=${cropLog} ` +
        `metricas={sharpness:${calidad.sharpness} brightness:${calidad.brightness} ` +
        `contrast:${calidad.contrast} contEff:${contrasteEfectivoDe(calidad, ocrLegible)} ` +
        `level:${calidad.level}})${diag ? " diag=1" : ""}` +
        // KIT e63f-autoenvio-v1 (F0): balde fino del no-AUTO — token ADITIVO
        // AL FINAL (contrato D51). Ausente si AUTO o sin motivo de los
        // listados (puesto-lugar/tipo/mesa-registro/ruta).
        `${gate.clasificacion?.clasifDebil ? ` ClasifDebil=${gate.clasificacion.clasifDebil}` : ""}`,
    );

    // Acta ACTUALIZADA: identidad intacta (spread), campos reales nuevos y
    // rechazo LIMPIO si el rescate mejora el estado (D20). F4/D37: la
    // rotación usada queda HORNEADA (rotation) — la respeta el PDF §6 y un
    // eventual re-recorte/filtrado.
    // §1.3 (SPEC-titulo-ubicacion): el recorte re-corre el gate → clasificación
    // AUTO nueva → título/ubicación reales. ADAPTACIÓN de nombre: el spec llama
    // `resultado` a esta constante, pero ese identificador ya vive arriba (el
    // `conRampa` del paso 1) → `actaActualizada` (misma forma, cero lógica nueva).
    const actaActualizada: Acta = {
      ...acta,
      fotoProcesada,
      procesadaVacia,
      // KIT actas-vivas-paginas-v1 (FASE C): bandera del OCR de secciones,
      // re-evaluada en cada re-proceso (la más reciente manda).
      recortada,
      // KIT identificacion-codigo-v1 (FASE F): LADO de la esquina faltante,
      // re-evaluado en cada re-proceso (null = vino SOLO del OCR de
      // secciones o 4/4 presentes).
      recorteLado: ladoEsquina,
      quadDetectado: quad,
      rotation: rotacion,
      ocrTexto: texto,
      metricas: {
        sharpness: calidad.sharpness,
        brightness: calidad.brightness,
        contrast: calidad.contrast,
      },
      motor,
      score,
      status: gate.status,
      rechazo: rechazoFinal,
      clasificacion: gate.clasificacion ?? undefined,
      firmas: this.firmasPorStatus(acta.firmas, gate.status),
    };
    const titUbi = tituloYUbicacionDe(gate.clasificacion ?? null);
    if (titUbi) {
      actaActualizada.titulo = titUbi.titulo;
      actaActualizada.ubicacion = titUbi.ubicacion;
    }
    // KIT e14-diagnostico-autoenvio-v1 (C1): el desenlace del RECORTE viaja
    // en el acta actualizada (el store decide ZIP/registro — C3).
    if (diag) actaActualizada.diagnostico = diag;
    // KIT e14-recorte-manual-v1 (T3): recorte MANUAL con foto SIN TINTA —
    // el acta carga el flag y REVISIÓN cambia el aviso bajo la tarjeta a
    // «TU RECORTE SE APLICÓ — …». El swap de display permanece (§D4) y el
    // umbral de tinta NO se toca (image-utils intacto — prohibido §2-T3.3).
    if (manual && procesadaVacia) actaActualizada.recorteManualSinTinta = true;
    return actaActualizada;
  }

  /**
   * Gate §4.2 REVISADO (SPEC-cabecera-clasificacion §4 + §7.2 SPEC-rediseno-
   * revision) — helper ÚNICO para AMBOS pipelines (escaneo y recorte, §4.4):
   *  1. RECHAZADA SOLO por CALIDAD (score < 6.5 vía statusDeScore, §4.1) —
   *     la tarjeta «ACTA NO RECONOCIDA» queda reservada a este caso. Al
   *     AGOTAR intentos la contingencia es AUTOMÁTICA (C4, sin botón manual).
   *  2. Calidad suficiente + clasificación AUTO → status por score (OPTIMA/
   *     ADVERTENCIA) como hoy + clasificación persistida (Fase B al envío).
   *  3. Calidad suficiente + SUGERIDA/MANUAL (incluye OCR sin texto, §4.3) →
   *     EN_REVISION_HUMANA: la pantalla distingue por intento (§7.3 — «repetir-
   *     primero» antes de agotar; contingencia con panel al agotar).
   * PATRON_CABECERA ya NO decide el estado (§4.5) — solo traza en el log.
   * §X (SPEC-score-legible): la clasificación llega calculada desde el
   * pipeline — alimenta el score (piso por identificación).
   */
  private evaluarGate(
    score: number,
    ocrTexto: string,
    clasificacion: ClasificacionE14,
    intento: number,
    maxIntentos: number,
  ): ResultadoGate {
    if (score >= 6.5) {
      if (clasificacion.nivel === "AUTO") {
        return { status: statusDeScore(score), rechazo: null, clasificacion };
      }
      // SUGERIDA/MANUAL: la CONTINGENCIA (panel) llega SOLO al agotar intentos;
      // antes, el acta viaja como EN_REVISION_HUMANA «repetir-primero» (§7.3 —
      // la pantalla distingue por intento; el estado no cambia).
      return { status: "EN_REVISION_HUMANA", rechazo: null, clasificacion };
    }
    // score < 6.5 — rechazo por CALIDAD. Al AGOTAR intentos: contingencia
    // automática (C4) — el sistema escala solo, sin botón manual.
    if (intento >= maxIntentos) {
      return {
        status: "EN_REVISION_HUMANA",
        rechazo: ocrTextIsValid(ocrTexto)
          ? { tipo: "GENERICO", detalle: DETALLE_GENERICO }
          : { tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE },
        clasificacion: null,
      };
    }
    return {
      status: "RECHAZADA",
      rechazo: ocrTextIsValid(ocrTexto)
        ? { tipo: "GENERICO", detalle: DETALLE_GENERICO }
        : { tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE },
      clasificacion: null,
    };
  }

  /**
   * F2 (§F2.2, D36) — FILTRO: re-procesa la foto con el filtro elegido,
   * IGUAL que setFilterOnPage del core (apps/scanner-lab/src/components/
   * scanner/…/store.ts L644-669): SOLO processImage — sin re-OCR, sin
   * re-calidad (el gate ya resolvió). Devuelve el acta con fotoProcesada y
   * filtro actualizados. Sin timeout: es un ÚNICO processImage con fallback
   * canvas (misma exposición al cuelgue que tiene el lab aquí — documentado
   * en worklog como ADAPTACIÓN de la opción «timeout 15 s» del spec).
   */
  async revelar(acta: Acta, filtro: PageFilter): Promise<Acta> {
    const fotoOriginal = acta.fotoOriginal;
    if (!fotoOriginal) {
      throw new Error("SIN FOTO ORIGINAL PARA FILTRAR");
    }
    // Fuente: apps/scanner-lab/…/store.ts L644-669 (setFilterOnPage) —
    // processImage(original, quad, filter, rotation, { manual }).
    const resultado = await processImage(
      fotoOriginal,
      acta.quadDetectado ?? defaultQuad(),
      filtro,
      acta.rotation ?? 0,
      { manual: true },
    );
    return { ...acta, fotoProcesada: resultado.processed, filtro };
  }

  /**
   * F-OCR del lab (EditorView.tsx L1360-1395): corre requestOcr sobre la
   * imagen PROCESADA del acta y devuelve el texto crudo.
   * KIT e14-ocr-lee-original-v1 (PROD-1 §4.3): coherencia con la regla del
   * producto — el re-OCR manual del editor aplica la MISMA regla: lee el
   * RECORTE SIN filtro ("original", el crudo del warp) cuando hay
   * fotoOriginal + quadDetectado; fallback a la procesada (comportamiento de
   * hoy). NOTA (documentada): el texto del editor puede diferir del histórico
   * — ES la regla nueva del producto, NO un bug (en impresas con sello el
   * crudo colapsa chars — §1.2 del kit, esperado).
   * ADAPTACIÓN documentada: el lab elige imagen con prioridad
   * `preview ?? procesada-fresca ?? original` (L1373-1376) porque tiene
   * previewCache; en e14 la procesada SIEMPRE está fresca (todo cambio pasa
   * por el pipeline) → se usa fotoProcesada directa. El guard `previewLoading`
   * (L1364-1370) NO aplica (no hay preview en e14) → omitido. Sin timeout
   * extra (igual que el lab L1379 — requestOcr se gobierna solo).
   */
  async reconocerTexto(acta: Acta): Promise<string> {
    const fotoProcesada = acta.fotoProcesada;
    if (!fotoProcesada) {
      throw new Error("SIN FOTO PROCESADA PARA RECONOCER TEXTO");
    }
    // PROD-1 (§4.3): regla del producto en el re-OCR del editor — recorte
    // "original" con el quad horneado (misma convención POST-warp); el catch
    // cae al fallback de abajo (comportamiento de hoy, §5 del kit).
    if (acta.fotoOriginal && acta.quadDetectado) {
      try {
        const r = await processImage(
          acta.fotoOriginal,
          acta.quadDetectado,
          "original",
          acta.rotation ?? 0,
        );
        // PROD-2 (§2-C2): el re-OCR del editor pasa por el ÚNICO motor.
        return reconocerRapidOcr(r.processed);
      } catch {
        /* cae al fallback de abajo */
      }
    }
    return reconocerRapidOcr(fotoProcesada); // comportamiento de hoy (fallback)
  }

  /** Firmas coherentes con el estado (misma regla del mock/§7.5):
   *  ADVERTENCIA → firma 2 TENUE · RECHAZADA → NO_DETECTADO · resto OK. */
  private firmasPorStatus(firmas: ActaFirma[], status: ActaStatus): ActaFirma[] {
    if (firmas.length < 2) return firmas;
    const estadoFirma2: ActaFirma["estado"] =
      status === "ADVERTENCIA" ? "TENUE" : status === "RECHAZADA" ? "NO_DETECTADO" : "OK";
    return firmas.map((f, i) => (i === 1 ? { ...f, estado: estadoFirma2 } : { ...f }));
  }

  /** Acta final: seed SOLO cuando la clasificación no está resuelta (§1) + campos reales §3.1. */
  private construirActa(
    opciones: OpcionesEscaneo,
    parcial: ParcialPipeline,
    campos: {
      fotoProcesada?: string;
      /** §D4 (SPEC-e14-score-ocr): la procesada salió sin tinta. */
      procesadaVacia?: boolean;
      /** KIT actas-vivas-paginas-v1 (FASE C): OCR de secciones detectó el
       *  recorte del papel (faltaSeccionInferior). */
      recortada?: boolean;
      /** KIT identificacion-codigo-v1 (FASE F): LADO de la esquina fiducial
       *  faltante (píldora «ACTA RECORTADA · SUP-IZQ») — null cuando el
       *  recorte vino SOLO del OCR de secciones o 4/4 presentes. */
      recorteLado?: string | null;
      quadDetectado?: Quad;
      calidad?: PageQuality;
      ocrTexto?: string;
      motor?: "worker" | "canvas";
      /** §D8.3 (SPEC-e14-score-ocr Rev. 3): filtro del acta al nacer —
       *  "original" cuando el asset sim corrió as-is, "bw" (default del
       *  producto) en el pipeline normal. */
      filtro?: PageFilter;
      score: number;
      status: ActaStatus;
      rechazo: Acta["rechazo"];
      /** Clasificación de cabecera (SPEC-cabecera-clasificacion §4/§6). */
      clasificacion?: ClasificacionE14 | null;
    },
  ): Acta {
    const numeroMesa = opciones.objetivo
      ? opciones.objetivo.mesaId.replace(/\D/g, "").padStart(3, "0")
      : "001";
    this.contador += 1;

    // Firmas coherentes con el estado (misma regla del mock §7.5):
    // ADVERTENCIA → firma 2 TENUE · RECHAZADA → NO_DETECTADO · resto OK.
    const estadoFirma2: ActaFirma["estado"] =
      campos.status === "ADVERTENCIA" ? "TENUE" : campos.status === "RECHAZADA" ? "NO_DETECTADO" : "OK";

    // §1.2 (SPEC-titulo-ubicacion): clasificación AUTO → el acta nace con
    // título/ubicación REALES; sin ella se conserva el seed (no se inventa).
    const titUbi = tituloYUbicacionDe(campos.clasificacion ?? null);
    return {
      id: `acta-${Date.now()}-${this.contador}`,
      titulo: titUbi?.titulo ?? ACTA_MOCK.titulo,
      ubicacion: titUbi?.ubicacion ?? {
        departamento: ACTA_MOCK.departamento,
        municipio: ACTA_MOCK.municipio,
        zona: ACTA_MOCK.zona,
        puesto: ACTA_MOCK.puesto,
        mesa: numeroMesa,
      },
      tipo: ACTA_MOCK.tipo,
      // §6: página REAL del «Ver/Pag/de» cuando la clasificación la leyó.
      // KIT actas-vivas-paginas-v1 (FASE B): la página viaja COMO VENGA de
      // la clasificación (null incluido — DESCONOCIDA: el chip muestra
      // «PÁG - DE -» y el hueco va al primer libre; el default P1 mintió
      // con la pág 2 del Frankfurt, bug del dueño 16-oct). Sin
      // clasificación → objetivo seed (hoy).
      pagina: campos.clasificacion
        ? campos.clasificacion.pagina
        : {
            index: opciones.objetivo?.pagina ?? 1,
            total: 2,
          },
      candidatos: ACTA_MOCK.candidatos.map((c) => ({ ...c })),
      firmas: [
        { nombre: ACTA_MOCK.firmas[0].nombre, jurado: ACTA_MOCK.firmas[0].jurado, estado: "OK" },
        { nombre: ACTA_MOCK.firmas[1].nombre, jurado: ACTA_MOCK.firmas[1].jurado, estado: estadoFirma2 },
        { nombre: ACTA_MOCK.firmas[2].nombre, jurado: ACTA_MOCK.firmas[2].jurado, estado: "OK" },
      ],
      codigoBarras: ACTA_MOCK.codigoBarras,
      score: campos.score,
      status: campos.status,
      rechazo: campos.rechazo,
      intento: opciones.intento,
      maxIntentos: opciones.maxIntentos,

      // ----- Campos reales (§3.1) -----
      fuente: opciones.fuente,
      fotoOriginal: parcial.fotoOriginal,
      fotoProcesada: campos.fotoProcesada,
      procesadaVacia: campos.procesadaVacia,
      recortada: campos.recortada ?? false,
      recorteLado: campos.recorteLado ?? null,
      ocrTexto: campos.ocrTexto,
      metricas: campos.calidad
        ? {
            sharpness: campos.calidad.sharpness,
            brightness: campos.calidad.brightness,
            contrast: campos.calidad.contrast,
          }
        : undefined,
      motor: campos.motor ?? "canvas",
      quadDetectado: campos.quadDetectado,
      rotation: 0,
      // F2/D36: default del producto (types.ts L50 del core) — toda captura
      // nace en B/N adaptativo (Fuente: CameraView.tsx L602-604 del lab).
      // §D8.3 (Rev. 3): EXCEPTO los assets sim as-is, que nacen "original".
      filtro: campos.filtro ?? ("bw" as PageFilter),
      // SPEC-cabecera-clasificacion §6: clasificación de cabecera (AUTO →
      // archivada al envío; SUGERIDA/MANUAL → panel de corrección §5).
      clasificacion: campos.clasificacion ?? undefined,
      // e64-qr T-2.1 — señal de la CAPA 0 QR de cámara (ADITIVA AL FINAL,
      // contrato D57): qrCam definido = el decodificador corrió ("leido" con
      // payload / "sin-payload" con null); undefined (timeout — el
      // instrumento no terminó) = los campos viajan AUSENTES (jamás
      // inventar). SOLO presencia — jamás contenido (red line 10).
      ...(parcial.qrCam
        ? { qrPayload: parcial.qrCam.payload, qrEstado: "leido" as const }
        : parcial.qrCam !== undefined
          ? { qrEstado: "sin-payload" as const }
          : {}),
    };
  }

  horaEnvio(): string {
    const d = new Date();
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
  }

  horaHistorial(): string {
    const d = new Date();
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  }
}
