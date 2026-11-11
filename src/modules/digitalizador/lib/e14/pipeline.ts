/**
 * Pipeline L2 — ARCHIVO y CÁMARA (FASE F del plan post-v2.3).
 *
 * Extracción MOVE-ONLY del cuerpo de `RealCoreBridge.pipeline()` que vivía en
 * scanner-core-bridge.ts: cero cambios de decisión (mismo orden de etapas,
 * mismos helpers, mismos tokens de log D51). El bridge queda como fachada —
 * la clase, el RECORTE manual y el timeout de `escanearActa` — y re-exporta
 * lo público de este módulo (`decodeArchivoMemo`, `marcoPerdonadoPorLectura`,
 * `OpcionesEscaneoConTimeout`, `TIMEOUT_MS`).
 *
 * Etapas (§5): decode → detección → recorte+realce → orientación → calidad →
 * OCR escalonado → banda dirigida → mapeo §4/gate → acta.
 */
import {
  detectDocumentEdgesDetail,
  fileToCaptureDataUrl,
  processImage,
} from "@jg-stevan/scanner-core/core/image-processor";
import type { OrigenQuad } from "@jg-stevan/scanner-core/core/image-processor";
// KIT e14-masiva-ux-v1 (T1): warm-up del worker OpenCV que ya expone el core.
import {
  getScannerWorker,
  warmUpScannerWorker,
} from "@jg-stevan/scanner-core/core/detector-client";
import { ocrTextIsValid } from "@jg-stevan/scanner-core/core/ocr";
import type { PageFilter, Quad } from "@jg-stevan/scanner-core/core/types";
import { cargarDivipol } from "@jg-stevan/scanner-core/dominio/divipol";
import {
  clasificarCabecera,
  PATRON_CABECERA,
} from "@jg-stevan/scanner-core/dominio/clasificador";
// KIT e14-optimizacion-v1 (T1): memo FIFO tope 2 de image-utils.
import { procesadaVaciaDataUrl } from "./image-utils";
// GUARD-BORDE Rev. 2 (D1/D3): helper ÚNICO de completitud.
import {
  verificarCompletitud,
  type ResultadoCompletitud,
} from "@jg-stevan/scanner-core/dominio/completitud";
// KIT e14-gate-v2 (FASE G2): marcador OBLIGATORIO de votos.
import { medirZonaVotos } from "@jg-stevan/scanner-core/dominio/marcadores";
// D63-C — KIT e63c: detector del MARCO IMPRESO (solo escaneos).
import {
  evaluarMarcoImpreso,
  type MarcoEscaneo,
  type MarcoImpreso,
} from "./marco-escaneo";
import type { NivelLectura } from "@jg-stevan/scanner-core/dominio/senal-lectura";
import { DETALLE_ILEGIBLE, resolverDesenlace } from "./gate";
import { calidadDeActa, type InfoCrop } from "./calidad";
import type { Acta, DiagnosticoActa, ProgresoAnalisis } from "./types";
import type { OpcionesEscaneo } from "./bridge";
import { reconocerRapidOcrEscalonado } from "./ocr-escalonado-runner";
// FASE C del plan post-v2.3 (medición §6.7): telemetría de lectura por acta.
import {
  colectorLectura,
  type EventoLectura,
} from "@jg-stevan/scanner-core/obs-base/eventos-lectura";
import { registrarEventoLectura } from "./ocr/estado-motores";
import type { EsperaOcrSink } from "./ocr/rapidocr";
import type { ActaNativa } from "./ocr/nativo";
import { construirActa, type ParcialPipeline } from "./acta-factory";
import {
  probeOrientacion,
  rotarDataUrl,
  type ProbeOrientacion,
} from "./orientacion";
import {
  brujulaQrOrientacion,
  type BrujulaQr,
} from "@jg-stevan/scanner-core/geom/orientacion-qr";
import { leerFlags } from "./flags";
import {
  bandaDirigidaSiFalta,
  caracterizarLectura,
  conRampa,
  construirDiagnosticoSitio,
  evidenciaBordeDe,
  medirEsquinasSitio,
  trazaDesenlaceComun,
  vetoCuatroEsquinas,
} from "./pipeline-comun";
import { logger } from "../logger";


// KIT e14-proceso-lado-v1 — tope del lienzo de SALIDA del warp+enhance del
// lote. `processImage` ya sabe hacer esto (`opts.maxLongSide`, default
// PROCESSED_MAX_LONG_SIDE=4032): con cap < 4032 decodifica el JPEG YA
// RESIZEADO (DCT ≈ ½ por octava, sin materializar los 12 MP) y el homografía
// INTER_CUBIC + el enhance (modelo de sombras, Bradley, despeckle) corren
// sobre ESE lienzo. Es el ítem CPU más pesado del lote medido — bench `gpu18`
// (2026-11-03, WebGPU, 1 worker): `procesoBwMs` 34,5 s de 144,7 s de muro,
// ~5,8 s por acta, y con el pool en 2 (`gpu19`) los dos warps se serializan en
// UN solo worker OpenCV ⇒ es EL cuello. El quad son FRACCIONES 0-1 ⇒ bajar la
// fuente NO cambia la geometría (invariante WYSIWYG del core, F3-A). Default
// 4032 = sin opts = camino de hoy byte-idéntico.
type OptsProceso = { maxLongSide?: number };

function optsProceso(): OptsProceso | undefined {
  try {
    const v = leerFlags().procesoLadoMayor;
    if (typeof v === "number" && v >= 1024 && v < 4032) return { maxLongSide: v };
  } catch {
    /* flags sin leer ⇒ el default del core (4032) */
  }
  return undefined;
}

/** KIT e14-masiva-tiempos-v1 (PR-2, prefetch): memo de decode POR INSTANCIA
 *  de File (WeakMap — GC-friendly, no retiene blobs). El mismo File JAMÁS
 *  se decodifica dos veces: el prefetch del runner MASIVA
 *  (precargarDecodeArchivo) oculta el decode de N+1 tras el OCR de N y el
 *  pipeline de N+1 golpea la memo (~0 ms — AC-P1). TRANSPARENTE para todos
 *  los flujos existentes: misma promesa, mismo resultado; si el decode
 *  falla, la entrada sale de la memo y el siguiente intento re-decodifica
 *  (comportamiento de hoy — kit AC-P2 «jamás bloquea»). */
const decodeMemo = new WeakMap<File, Promise<string>>();

/** KIT e14-ocr-nativo-v1 (FASE 2): exportado para el prefetch del runner
 *  MASIVA (masiva/prefacta.ts) — el acta-completa viaja al sidecar sobre LA
 *  MISMA decodificación que el pipeline usará como `fotoOriginal` (memo por
 *  instancia → un solo decode, fotogramas idénticos por construcción). */
export function decodeArchivoMemo(file: File): Promise<string> {
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
export const TIMEOUT_MS = 120_000;

/** KIT e14-masiva-ux-v1 (T1): tope de cada espera del warm-up del worker
 *  OpenCV en la detección (1ª espera antes del intento + 1ª antes del
 *  reintento — §3-T1). Vencido el tope se continúa como hoy (fallback
 *  Sobel): la espera JAMÁS bloquea el pipeline más de 5 s por paso. */
const TOPE_ESPERA_WORKER_MS = 5_000;

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

/** KIT e14-ocr-nativo-v1 (FASE 2): los 4 pares normalizados que devuelve el
 *  sidecar ([TL,TR,BR,BL], mismo orden que `orderPoints` del worker y
 *  `_ordena_pts` del nativo) en el `Quad` del core. `null` = el sidecar no
 *  encontró papel (manda `quad: null` cuando su cascada falla) → el llamador
 *  usa QUAD_IDENTITY, igual que hoy con un plano sin bordes. */
function quadDesdeNativo(q: [number, number][] | null): Quad | null {
  if (!q || q.length !== 4) return null;
  const [tl, tr, br, bl] = q;
  return [
    { x: tl[0], y: tl[1] },
    { x: tr[0], y: tr[1] },
    { x: br[0], y: br[1] },
    { x: bl[0], y: bl[1] },
  ];
}

/** Entrada del pipeline: File (ARCHIVO o foto CÁMARA) o dataUrl ya crudo.
 *  §D8.2 (SPEC-e14-score-ocr Rev. 3): el flag «sin recorte automático» viaja
 *  con el ASSET de SIMULACIÓN dentro de la entrada (parámetro interno
 *  privado — OpcionesEscaneo queda INTACTO, nada público nuevo). */
export type EntradaPipeline = { archivo: File; sinRecorte?: boolean } | { dataUrl: string };

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

/** Pipeline §5 (ARCHIVO y CAMARA comparten etapas y mapeo; ms por etapa en consola). */
export async function correrPipelineL2(
  opciones: OpcionesEscaneoConTimeout,
  entrada: EntradaPipeline,
  parcial: ParcialPipeline,
  emitir: (p: ProgresoAnalisis) => void,
): Promise<Acta> {
    const ms = { decode: 0, detect: 0, proceso: 0, procesoBw: 0, procesoOcr: 0, calidad: 0, ocr: 0, total: 0 };
    const inicio = performance.now();
    // Espera del turno OCR global de ESTA acta (probe + pasadas + banda).
    // Un sink POR PIPELINE, no de módulo: con pool 2 la espera de la vecina
    // jamás debe facturarse aquí.
    const esperaOcr: EsperaOcrSink = { ms: 0 };

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
    // el MISMO decodificador de masiva, señal ADITIVA — jamás afecta
    // score/gate/OCR ni consume intento. Se lanza EN PARALELO al pipeline
    // (el tier base resuelve en ~0.3-0.5 s — mucho antes del OCR) y se
    // ESPETA donde el acta se construye. tiers "base" — ADAPTACIÓN DECLARADA:
    // la cadena completa (~15-17 s sin-QR, bloques sync) rompería el timeout
    // 15 s del flujo individual; el rescate pesado queda en masiva (timeout
    // 120 s).
    // GUARD (D63-C): `origenActa` viaja SOLO en entradas de MASIVA — allí la
    // capa 0 del runner (cadena COMPLETA a nivel registro, no acta) manda y
    // la señal base-only del bridge sería redundante y doble-costo: OMITIDA.
    // El catch es el fallback silencioso del kit: sin la señal, el flujo de
    // cámara sigue intacto.
    // R10 — M10-fin (fin de la ÚLTIMA dependencia invertida núcleo→masiva):
    // el decodificador ya NO se importa aquí (antes: import DINÁMICO de
    // masiva/identidad-qr — PENDIENTE heredado de R7b); llega INYECTADO en
    // `opciones.decodificadorQrCam` (patrón R8 store-api — frontera
    // bridge.ts/types.ts). El runner MASIVA lo inyecta SIEMPRE: filas con
    // `origen=null` (duda honesta del detector D63-A) caen en esta rama hoy
    // y su señal viaja al veto ya-enviada post-OCR del runner (H1) — la
    // inyección de la MISMA función preserva ese comportamiento byte a byte;
    // el cableado del flujo individual/CÁMARA vive en su repo anfitrión.
    // Sin decodificador → null (la MISMA conducta del catch de abajo: sin
    // señal, el flujo de cámara sigue intacto).
    const esMasiva = opciones.origenActa != null;
    const decodificadorQrCam = opciones.decodificadorQrCam;
    const qrCamPromesa: Promise<ParcialPipeline["qrCam"]> = esMasiva
      ? Promise.resolve(undefined) // la capa 0 del runner manda en masiva
      : (async () => {
          try {
            if (!decodificadorQrCam) return null; // R10 — sin señal inyectada: flujo intacto
            return await decodificadorQrCam(fotoOriginal, { tiers: "base" });
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
    // KIT e14-ocr-nativo-v1 (FASE 2): el sidecar YA corrió detect → warp →
    // sonda de orientación → b/n → QR → OCR sobre SU decodificación del mismo
    // archivo (el runner MASIVA dispara el prefetch al tomar la fila). Si la
    // ida resolvió, el pipeline CONSUME esos artefactos y se omite el trabajo
    // duplicado — los tres pasos más caros del WASM. Lo que el JS conserva
    // INTACTO sobre su propia copia de la foto: calidad, esquinas fiduciales,
    // completitud, marcadores, score, gate, dedup y envío — la DECISIÓN sigue
    // siendo del producto, nunca del sidecar. `null` (flag apagado, sidecar
    // mudo, timeout, JSON raro, SIM o escaneo) = byte-idéntico a hoy. El coste
    // del await cae en DETECCIÓN: es el mismo trabajo, hecho en otro sitio.
    const nat: ActaNativa | null =
      opciones.actaNativa && !sinRecorte && !opciones.simular && origenActa !== "escaneo"
        ? await opciones.actaNativa
        : null;
    if (sinRecorte) {
      quad = QUAD_IDENTITY;
    } else if (escaneoIdentidad) {
      // KIT e63d (F2.1): página completa SIN correr detección — el paso
      // entero se omite (detect medio ≈ 0 ms en escaneos; el informe
      // DETECCION contará quadOrigen "pagina-completa" por la vía normal).
      // La clase entera de quads falsos queda eliminada POR CONSTRUCCIÓN,
      // no por parche.
      quad = QUAD_IDENTITY;
    } else if (nat) {
      // KIT FASE 2: el quad llega NORMALIZADO (0..1) desde el sidecar — mismo
      // sistema de referencia del worker (fracciones sobre la foto, clampRect →
      // toFractions) y MISMO orden de puntos [TL,TR,BR,BL] (orderPoints del
      // worker y _ordena_pts del nativo son la misma convención). Normalizado
      // es además INDEPENDIENTE del tamaño: el sidecar y el navegador pueden
      // decodificar el JPEG con alturas distintas sin desalinearse.
      // `quad: null` = la cascada nativa no encontró papel (igual que el
      // "sobel" de abajo en un plano sin bordes) → el recorte es la foto entera.
      const quadNat = quadDesdeNativo(nat.quad);
      if (quadNat) {
        quad = quadNat;
        quadOrigen = nat.quadOrigen === "sobel" ? "sobel" : "worker";
      } else {
        quad = QUAD_IDENTITY;
        quadOrigen = "pagina-completa";
      }
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
        return construirActa(opciones, parcial, {
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
    } else if (nat) {
      // KIT FASE 2: el acta ya viene recortada, enderezada y en b/n del
      // sidecar (misma cascada de quad, mismo shrink 3.5 px, mismo warp
      // INTER_CUBIC con tope 4032, mismo Bradley+despeckle). Los DOS warps del
      // worker WASM — el de presentación y el de lectura — no se pagan.
      // `fotoOcr` queda = la procesada SOLO a efectos de traza: el texto ya
      // vino del recorte SIN realce del sidecar (regla del dueño, la misma
      // variante "original") y el det+rec del navegador no corre.
      fotoProcesada = nat.procesada;
      filtroActa = "bw";
      motor = "worker";
      fotoOcr = nat.procesada;
      ocrIn = "original";
      emitir({ etapa: "RECORTANDO", progreso: 1 });
      emitir({ etapa: "REALZANDO", progreso: 1 });
      // Línea PROPIA (el formato del log `pipeline` es congelado D51 — nada de
      // tokens nuevos en la cola): trazabilidad de lo que el sidecar hizo.
      logger.info(
        `[e14-nativo] acta servida rot=${nat.rot} quad=${nat.quad ? nat.quadOrigen : "pagina-completa"} ` +
          `lineas=${nat.nLineas} boxes=${nat.nBoxes} conf=${nat.conf.toFixed(3)} ` +
          `nativo=${Math.round(nat.totalMs)}ms ${nat.alto}x${nat.ancho}`,
      );
    } else {
      // PROD-1 (§4.1): DOS variantes bajo la MISMA conRampa — bw para
      // MOSTRAR/GUARDAR (hoy) y "original" (warp sin realce) para LEER.
      // .catch(() => null) DENTRO del Promise.all (aclaración final del kit):
      // si processImage("original") rechaza, Promise.all NO rechaza — decide
      // con el resultado null → bw-fallback (§5). El pipeline NUNCA muere por
      // la variante nueva.
      // D45 — pared individual de CADA warp (el core SERIALIZA: la 2.ª
      // pared acumula la cola de la 1.ª — su coste propio es la DIFERENCIA
      // entre ambas). Observador pasivo: mismas promesas, solo cronómetro.
      let tProcesoBw = 0;
      let tProcesoOcr = 0;
      const [resultado, resultadoOcr] = await conRampa(
        Promise.all([
          // Fuente: apps/scanner-lab/src/components/scanner/CameraView.tsx L602-604
          // (captura arranca en B/N adaptativo) + types.ts L50 (default del
          // producto) — D36: e14 no tiene ajustes → el default fijo es "bw".
          processImage(fotoOriginal, quad, "bw", undefined, optsProceso()).then((r) => {
            tProcesoBw = performance.now();
            return r;
          }),
          // PROD-1: la misma geometría (mismo warp, MISMA convención
          // POST-warp — pitfall §9.5), solo cambia el filtro final.
          processImage(fotoOriginal, quad, "original", undefined, optsProceso())
            .catch(() => null)
            .then((r) => {
              tProcesoOcr = performance.now();
              return r;
            }),
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
      // D45 — subs del muro (guard > 0 al exportar — jamás inventar).
      if (tProcesoBw > 0) ms.procesoBw = Math.round(tProcesoBw - tProceso);
      if (tProcesoOcr > 0) ms.procesoOcr = Math.round(tProcesoOcr - tProceso);
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
      // KIT FASE 2: el sidecar ya enderezó la página (su `rot`) — sondear dos
      // veces no cambia el acta, la cuesta.
      !nat &&
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
      nat === null &&
      !opciones.simular &&
      opciones.origenSenales === "exif-camara"
    ) {
      const probe = await probeOrientacion(fotoOcr, {
        confirmar: { quadWorker: quadOrigen === "worker" },
        esperaSink: esperaOcr,
      });
      if (probe != null) probeMsOrientacion = probe.ms; // D57 T2
      probeMiniOrientacion = probe?.orientacionProbeMini ?? null; // WAVE2 A1 — la mini que el fallo seguro descartó
      if (probe?.aplicado) {
        fotoOcr = await rotarDataUrl(fotoOcr, probe.rot);
        fotoProcesada = await rotarDataUrl(fotoProcesada, probe.rot);
      }
    } else if (brujula === null && nat === null && !opciones.simular) {
      const probe = await probeOrientacion(fotoOcr, { esperaSink: esperaOcr });
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
    // R7c (M6-fin): la medición vive en pipeline-comun (mismo criterio ×2 —
    // pitfall §9.9); la diferencia del sitio (SIM → ESQUINAS_OK/traza sim)
    // entra explícita como campo tipado.
    const { esquinas, ladoEsquina, trazaEsq } = await medirEsquinasSitio({
      fotoProcesada,
      simular: opciones.simular === true,
    });
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
    // EFECTO DECLARADO (plan §4): el escudo anti-fondo (fondo → techo 7.9 —
    // vive en gate.ts/resolverDesenlace) tampoco aplica a escaneos — es un
    // guard del WARP (fondo/sombra incluida por el encuadre), sin premisa en
    // identidad. El veredicto del escaneo lo gobiernan marco + lectura +
    // marcadores (honestos).
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
      esperaSink: esperaOcr,
    };
    // KIT FASE 2: con acta del sidecar el det+rec YA corrió allí sobre el
    // recorte sin realce (misma variante de entrada, mismo TEXT_SCORE de
    // aceptación → el MISMO formato de texto que el motor WASM). El escalonado
    // del navegador no se paga; la pasada elegida es la que el sidecar hizo.
    // Cualquier fallo del prefetch dejó `nat = null` → la línea de abajo, byte
    // a byte como hoy.
    // FASE C (medición §6.7) — telemetría de ESTA lectura: un colector por
    // acta (su resumen viaja al perf) y el panel de motores observa los
    // mismos eventos. SIM no emite (chips 8.2/7.0/4.3 intactos por
    // construcción) y sin divipol no hay gate: JAMÁS se inventa un nivel.
    const colector = opciones.simular === true ? null : colectorLectura();
    const baseLectura = colector ? await cargarDivipol() : null;
    const clasificarNivelLectura = baseLectura
      ? (t: string): EventoLectura["validacion"] => {
          try {
            return clasificarCabecera(t, baseLectura).nivel;
          } catch {
            return "MANUAL";
          }
        }
      : undefined;
    const sinkLectura = colector
      ? (e: EventoLectura): void => {
          colector.sink(e);
          registrarEventoLectura(e);
        }
      : undefined;
    const ocrEsc = nat
      ? { texto: nat.texto, conf: nat.conf, detMs: nat.detMs, recMs: nat.recMs }
      : await reconocerRapidOcrEscalonado(fotoOcr, onProgresoOcr, {
          ...cfgOcr,
          onEvento: sinkLectura,
          clasificarNivel: clasificarNivelLectura,
        });
    if (nat && sinkLectura && clasificarNivelLectura) {
      // El sidecar hizo la ÚNICA pasada del acta (det+rec nativo a cap PROD):
      // se registra tal cual — motor "nativo" para no confundir su ms con el
      // del WASM (misma familia PP-OCR, coste muy distinto).
      sinkLectura({
        paso: "1920",
        motor: "nativo",
        validacion: clasificarNivelLectura(nat.texto),
        aceptada: true,
        ms: Math.round(nat.detMs + nat.recMs),
      });
    }
    const resumenLectura = colector?.resumen();
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
    // R7c (M6-fin): UNA implementación en pipeline-comun (×2 — pitfall §9.9);
    // el guard SIM del sitio entra explícito.
    texto = await bandaDirigidaSiFalta({
      texto,
      fotoProcesada,
      simular: opciones.simular === true,
      ms,
      esperaSink: esperaOcr,
    });
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
    // En SIM esquinas=ESQUINAS_OK → helper false → recortada idéntica a
    // hoy (chips 8.2/7.0/4.3 intactos — §2 del kit).
    // R7c (M6-fin): la COMPOSICIÓN de señales vive UNA vez en pipeline-comun
    // (caracterizarLectura — pitfall §9.9: era ×2 con las mismas fórmulas);
    // el caller conserva las awaits del sitio (divipol/marcadores) y el
    // scoreVisual = scoreBase ANTES de resolverDesenlace.
    const { faltaSeccion, lazoPerdonado, recortada, ocrLegible, senalActa, senal, pisoPerfecto, scoreBase } =
      caracterizarLectura({ texto, clasificacion, esquinas, ladoEsquina, calidad });
    let score = scoreBase;
    // KIT e14-diagnostico-autoenvio-v1 (§3-A): score visual = bruto de
    // scoreDeCalidad ANTES de los caps del sitio (escudo-fondo/recortada/
    // incompleta/sin-votos) — el `final` es el que imprime el log.
    // ORDEN del merge (kit e14-diag-campos-aditivos-v1 §4-A.3):
    // scoreDeCalidad → scoreVisual → bloque C3 → inyección SIM → caps.
    const scoreVisual = score;
    // R7a (M3): el C3 (piso/techo de LECTURA — kit e14-score-lectura-v1) y la
    // inyección SIM (§D3 — los chips 8.2/7.0/4.3 mandan, pitfall §9.5) viven
    // AHORA dentro de resolverDesenlace (lib/e14/gate.ts) — UNA implementación
    // para AMBOS pipelines (pitfall §9.9). El desenlace completo se resuelve
    // más abajo, tras las mediciones asíncronas (verificación/marco/votos):
    // las esperas no alteran el score (observaciones puras) y el orden de
    // aplicación de caps/gate se conserva byte a byte.
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
    // construcción (≠ "cortado"). senal y faltaSeccion ya están calculadas
    // aquí (caracterizarLectura — pipeline-comun.ts) — costo cero.
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
    // R7c (M6-fin): criterio único vetoCuatroEsquinas — la diferencia del
    // sitio (SIM del escaneo vs recorte siempre real) entra como `aplica`.
    // KIT e14-velocidad-5s-v1: el perdón entra por `pisoPerfecto`/`recortada`
    // (regla en perdonFaltaFiduciales, compartida con el repo del celular —
    // evidencia (foto real de la jornada): 9 anclas, sharpness 100,
    // recortada:false y RECHAZADA 6.4 por 0/4 fiduciales).
    if (vetoCuatroEsquinas({ esquinas, aplica: !opciones.simular, pisoPerfecto, recortada })) {
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
    // R7a (M3) — DESENLACE unificado: caps del sitio (escudo-fondo D10 ·
    // recortada) → gate (INCOMPLETA · SIN_VOTOS G2 · evaluarGate §4) → caps
    // post-gate 6.4 → sustitución BAJO §D3 → techosDiag, TODO en
    // resolverDesenlace (gate.ts — transcripción literal de esta rama; las
    // diferencias legítimas con pipelineRecorte entran EXPLÍCITAS: escudo-
    // manual=false, copy INCOMPLETA por origen, chip SIM).
    const desenlace = resolverDesenlace({
      score,
      levelCalidad: calidad.level,
      nivelLectura: senal.nivel,
      senalActa,
      ocrTexto: texto,
      clasificacion,
      intento: opciones.intento,
      maxIntentos: opciones.maxIntentos,
      scoreSimulado: opciones.simular ? (opciones.scoreSimulado ?? null) : null,
      completa,
      vetoIncompleta: !completa,
      escudoManual: false,
      fondo: verificacionResuelta?.fondo ?? false,
      recortada,
      origenEscaneo: origenActa === "escaneo",
      votosSkipPag2,
      hayVotos: marcadores.hayVotos,
    });
    score = desenlace.score;
    const marcadoresOk = desenlace.marcadoresOk;
    const rechazoFinal: Acta["rechazo"] = desenlace.rechazo;

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
    // R7c (M6-fin): el segmento vive UNA vez en pipeline-comun (evidencia-
    // BordeDe — era ×2 con la misma fórmula; null → "" como hoy).
    const evidenciaBorde = evidenciaBordeDe(verificacionResuelta);
    // KIT e14-diagnostico-autoenvio-v1 (C1/§6-B): techos capturados con las
    // MISMAS condiciones que ya aplicaron los caps — orden real de aplicación
    // (techo-fair/poor/sin-senal de scoreDeCalidad → escudo-fondo → recortada
    // → incompleta → sin-votos). Los de lectura-DEBIL/piso-FUERTE llegan con
    // score-lectura (PR #13, §8 — campos aditivos).
    // R7a (M3): la lista nace AHORA en resolverDesenlace (gate.ts) — mismas
    // condiciones y MISMO orden que los caps que aplicó (antes duplicado aquí
    // y en pipelineRecorte — pitfall §9.9).
    const techosDiag: string[] = desenlace.techosDiag;
    // C1: el registro nace junto al log (todo en scope — §9.6). SIM nunca
    // (§9.2). Observación PASIVA: si falla, el desenlace NO se toca (§9.7).
    let diag: DiagnosticoActa | null = null;
    if (!opciones.simular) {
      try {
        // R7b (M4) + R7c (M6-fin): payload del desenlace UNA vez en
        // pipeline-comun (construirDiagnosticoSitio) — las ~35 líneas de
        // campos idénticos de los 2 call-sites viven allí; las diferencias
        // de ESTE sitio entran explícitas (actaId "" se parcha luego;
        // gateMarco D63-C; decode/detect medidos). SIM nunca (§9.2).
        diag = construirDiagnosticoSitio({
          desenlace,
          rechazoFinal,
          scoreVisual,
          scoreFinal: score,
          techosDiag,
          calidad,
          texto,
          ocrLegible,
          senal,
          senalActa,
          completa,
          recortada,
          ladoEsquina,
          marcadores,
          marcadoresOk,
          votosSkipPag2,
          procesadaVacia,
          motor,
          infoCrop,
          quad,
          quadOrigen,
          ms,
          sitio: {
            actaId: "", // se parcha con el id REAL tras construirActa
            intento: opciones.intento,
            maxIntentos: opciones.maxIntentos,
            // D63-C (T2.3): veredicto del marco impreso (null en fotos/SIM).
            gateMarco: marcoEscaneo?.veredicto ?? null,
            fondo: verificacionResuelta?.fondo ?? false,
            filtro: filtroActa,
            // D61 — decode/detect YA se medían (traza de consola) — ahora
            // PERSISTEN. null honesto si la fase no corrió (video-grab sin
            // archivo → decode=0; sinRecorte → detect=0) — jamás inventar.
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
    // Lo que ESTA acta esperó el turno OCR (FIFO del singleton ORT). NO es
    // trabajo: `ocrMs` lo incluye, así que compite con él, no con las barras
    // de trabajo del informe. Guard > 0 = ausente cuando no esperó o cuando
    // el OCR fue del sidecar nativo (sin cola que esperar) — jamás inventar.
    if (diag != null && esperaOcr.ms > 0) {
      diag.tiempos.ocrEsperaMs = Math.round(esperaOcr.ms);
    }
    // WAVE2 A1 — sub-decisión de la miniatura descartada por el fallo seguro
    // (asignación DEFENSIVA — jamás lanza; sin diagnóstico o sin mini → se
    // omite — jamás inventar). Datos de calibración wave 3.
    if (diag != null && probeMiniOrientacion != null) {
      diag.orientacionProbeMini = probeMiniOrientacion;
    }
    // R7c (M6-fin): la COLA del log (del token votos= hasta ClasifDebil) se
    // compone en pipeline-comun (trazaDesenlaceComun) — UNA implementación
    // para ambos sitios: el orden de los tokens comunes (formato D51 —
    // CONGELADO, solo añadir al final) queda garantizado por el compilador
    // (los extras del sitio entran tipados: evidenciaSitio/extrasSim/
    // extrasDeteccion). El head conserva los tokens propios del escaneo
    // (decode/detect) — es la parte genuinamente distinta.
    logger.info(
      `[e14] pipeline ${opciones.fuente}/${"archivo" in entrada ? "file" : "video-grab"} ` +
        `total=${Math.round(ms.total)}ms ` +
        `(decode=${Math.round(ms.decode)} detect=${Math.round(ms.detect)} ` +
        `proceso=${Math.round(ms.proceso)} calidad=${Math.round(ms.calidad)} ` +
        `ocr=${Math.round(ms.ocr)} motor=${motor} ocrValido=${ocrTextIsValid(texto)} ` +
        `cabeceraE14=${PATRON_CABECERA.test(texto)} completa=${completa} ` +
        `senal=${senalActa} vacia=${procesadaVacia} ` +
        trazaDesenlaceComun({
          votosSkipPag2,
          densidadVotosPct: marcadores.densidadVotosPct,
          marcadoresOk,
          recortada,
          ladoEsquina,
          lazoPerdonado,
          trazaEsq,
          evidenciaSitio: `${evidenciaAsis}${evidenciaBorde}`,
          quad,
          quadOrigen,
          pisoPerfecto,
          score,
          filtro: filtroActa,
          ocrIn,
          confOcr,
          detOcr,
          recOcr,
          senal,
          desenlace,
          infoCrop,
          calidad,
          ocrLegible,
          extrasSim: evidenciaSim,
          // KIT e14-masiva-ux-v1 (T1.3): quién fabricó el quad EN la detección
          // del pipeline + si corrió el reintento post-Sobel (campos AÑADIDOS
          // al final — formato previo intacto).
          extrasDeteccion:
            `${quadOrigen ? ` detectOrigen=${quadOrigen}` : ""}${detectReintento ? " detectReintento=1" : ""}`,
          diag,
        }),
    );

    // KIT e14-diagnostico-autoenvio-v1 (C1): adjuntar el registro con el id
    // REAL del acta (el id nace en construirActa — parche post-hoc).
    await aterrizarQrCam(); // e64-qr T-2.1: la señal QR ya aterrizó (corrió en paralelo al OCR)
    const acta = construirActa(opciones, parcial, {
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
      status: desenlace.status,
      rechazo: rechazoFinal,
      clasificacion: desenlace.clasificacion,
    });
    if (diag) {
      diag.actaId = acta.id;
      // FASE C3 (§6.7) — el resumen de lectura viaja con el acta: el informe
      // de la corrida lo exporta por acta (mismo dato que PerfActa.lectura).
      if (resumenLectura) diag.resumenLectura = resumenLectura;
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
            gate: desenlace.status,
            ocrValido: diag.ocrValido,
            lectura: resumenLectura,
          }),
        )
        .catch(() => {});
    }
    return acta;
  }
