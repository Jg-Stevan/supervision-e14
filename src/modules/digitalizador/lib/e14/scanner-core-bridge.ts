/**
 * RealCoreBridge — el motor REAL del repo (`./core/`, SPEC-fase-logica §5).
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
 *
 * ── R7b — PARTICIÓN DEL BRIDGE (docs/revision-v1/03a-digitalizador-nucleo
 *    §7; movimientos move-only, un commit por módulo) ─────────────────────
 * Este archivo queda como FACHADA del núcleo: aquí viven la clase
 * RealCoreBridge, el RECORTE manual (pipelineRecorte) y TODO lo público
 * (RealCoreBridge, OpcionesEscaneoConTimeout, marcoPerdonadoPorLectura — los
 * re-exporta desde ./pipeline, así que get-bridge.ts, masiva/runner.ts y
 * __tests__/gate.test.ts siguen importando de aquí SIN cambios).
 * FASE F (plan post-v2.3): el pipeline L2 (ARCHIVO/CÁMARA) se movió
 * MOVE-ONLY a ./pipeline (correrPipelineL2) — cero cambios de decisión.
 * Lo auxiliar vive ahora en módulos por responsabilidad:
 *   · gate.ts                    (R7a/M3)  — desenlace unificado (criterio)
 *   · calidad.ts                 (R7b/M1)  — medición del acta + score §4.1
 *   · ocr-escalonado-runner.ts   (R7b/M2)  — runner RapidOCR + banda dirigida
 *   · sim-assets.ts              (R7b/M5a) — assets SIM + ciclo/caché §G/§D3
 *   · acta-factory.ts            (R7b/M5b) — construirActa/firmas/capturarFrame
 *   · auditoria.ts               (R7b/M4)  — payload del registro del desenlace
 *   · qr-zxing.ts                (R7b/M10) — loader zxing-wasm (antes en masiva/)
 *   · vendor/jsQR.js(.d.ts)      (R7b/M10-fin) — jsQR vendido byte-idéntico
 *                                (git mv de masiva/vendor — 0 imports estáticos
 *                                núcleo→masiva; qr-pixeles.ts lo consume vía
 *                                ../vendor, dirección correcta masiva→núcleo)
 *   · pipeline-comun.ts          (R7c/M6-fin) — los CUERPOS gemelos restantes
 *                                de los 2 pipelines (banda dirigida, esquinas
 *                                e71, señales de texto, evidencia-borde, cola
 *                                del log de auditoría D51 y payload del
 *                                diagnóstico) — diferencias del sitio EXPLÍCITAS
 *                                como campos tipados (patrón EntradaDesenlace)
 * PENDIENTE (dueño): el import DINÁMICO de rescate
 * scanner-core-bridge→masiva/identidad-qr (decodificarQrDeCapture, e64-qr
 * T-2.1 — moverlo exige arrastrar la cadena completa de tiers QR de masiva;
 * lazy intencional, no es inversión de símbolos estática). RESUELTO en R10
 * (M10-fin, ola 4): el decodificador llega INYECTADO por
 * `OpcionesEscaneo.decodificadorQrCam` (tipo DecodificadorQrCam en types.ts
 * — patrón R8 store-api); el bridge ya NO importa masiva (ver bloque
 * e64-qr T-2.1 del pipeline). Los cuerpos gemelos de los pipelines quedaron
 * unificados en pipeline-comun.ts (M6-fin, R7c) — ver mapa arriba.
 */
import {
  detectDocumentEdgesDetail,
  processImage,
} from "@jg-stevan/scanner-core/core/image-processor";
import type { OrigenQuad } from "@jg-stevan/scanner-core/core/image-processor";
import { ocrTextIsValid } from "@jg-stevan/scanner-core/core/ocr";
// KIT e14-motor-rapidocr-v1 (PROD-2 §3): motor de OCR de producción — módulo
// compartido con el informe (singleton de sesión ÚNICO, pitfall §9.6). El
// requestOcr del core SOLO vive en motores.ts (celda «actual» de la matriz —
// instrumento congelado, pitfall §9.2).
import { defaultQuad } from "@jg-stevan/scanner-core/core/types";
// (R7b M5b: PageQuality viaja con construirActa — acta-factory.ts.)
import type { PageFilter, Quad } from "@jg-stevan/scanner-core/core/types";
// (R7b M5b: ACTA_MOCK viaja con construirActa — acta-factory.ts.)
import { cargarDivipol } from "@jg-stevan/scanner-core/dominio/divipol";
import {
  clasificarCabecera,
  PATRON_CABECERA,
  tituloYUbicacionDe,
  type ClasificacionE14,
} from "@jg-stevan/scanner-core/dominio/clasificador";
// KIT e14-optimizacion-v1 (T1): los decodes del bridge pasan por el memo
// FIFO tope 2 de image-utils — misma imagen, una sola decodificación por
// dataURL del acta en vuelo. (R7b M1/M2: loadImageMemo ya solo se consume
// DENTRO de calidad.ts y ocr-escalonado-runner.ts — import local a cada uno.)
import { procesadaVaciaDataUrl } from "./image-utils";
// KIT identificacion-codigo-v1 (FASE F, Task 120): marcas fiduciales de
// esquina sobre el crop ya enderezado — señal «sin recortar» que ve los
// recortes SUPERIORES que faltaSeccionInferior (kit 118, solo inferior) no ve.
// (R7c M6-fin: ESQUINAS_OK/cuatroEsquinasFaltan/ladoEsquinaFaltante/
// trazaEsquinas viajan con la medición de esquinas y el veto e71 —
// pipeline-comun.ts los consume; el bridge ya no los importa directo.)
// GUARD-BORDE Rev. 2 (SPEC-e14-guard-borde §2-§3, D1/D3): la verificación de
// completitud vive en helper ÚNICO (completitud.ts) — «la geometría sospecha,
// la tinta condena» — usado por AMBOS pipelines (escaneo y recorte, AC11).
import { verificarCompletitud } from "@jg-stevan/scanner-core/dominio/completitud";
// KIT e14-gate-v2 (FASE G2): marcador OBLIGATORIO de votos — helper ÚNICO
// compartido con el guard de completitud (motorTinta, cero duplicación).
import { medirZonaVotos } from "@jg-stevan/scanner-core/dominio/marcadores";
// R7a — M3 (revisión 03a-digitalizador-nucleo): DESENLACE unificado del gate.
// pipelineRecorte() delega en este módulo PURO (transcripción literal de las
// ramas gemelas — pitfall §9.9): mismo orden de caps, mismo gate, mismos
// tokens; el log de auditoría queda EN EL CALLER con el resultado
// estructurado (SalidaDesenlace). (FASE F: pipeline() vive en ./pipeline.)
import {
  evaluarGate as evaluarGateCriterio,
  resolverDesenlace,
  type ResultadoGate,
} from "./gate";
// R7b (M1) — medición de CALIDAD y mapeo a score MOVIDOS a calidad.ts
// (partición §7 del reporte 03a — helpers libres sin estado de módulo).
// (R7c M6-fin: contrasteEfectivoDe/esquinasDeActa/scoreDeCalidad las consume
// pipeline-comun.ts — el bridge mide calidad y arma el InfoCrop del sitio.)
import { calidadDeActa, type InfoCrop } from "./calidad";
// R7b (M5a) — assets y fetch de la SIMULACIÓN MOVIDOS a sim-assets.ts
// (partición §7 del reporte 03a): tabla ACTAS_SIM, ciclo rotativo §G-2,
// caché por índice y fetch por chip §D3 viajan con su estado de módulo.
import { fetchActaSimPorScore, fetchActaSimulada } from "./sim-assets";
import type { Acta, DiagnosticoActa, ProgresoAnalisis } from "./types";
import type { E14Bridge } from "./bridge";
// FASE F (plan post-v2.3): el pipeline L2 vive en ./pipeline — el bridge lo
// orquesta desde escanearActa y RE-EXPORTA lo público (los importadores
// históricos de este módulo no cambian: get-bridge, masiva/prefacta,
// masiva/runner y __tests__/gate.test.ts).
import {
  correrPipelineL2,
  TIMEOUT_MS,
  type EntradaPipeline,
  type OpcionesEscaneoConTimeout,
} from "./pipeline";
export { decodeArchivoMemo, marcoPerdonadoPorLectura } from "./pipeline";
export type { OpcionesEscaneoConTimeout } from "./pipeline";
// R7b (M2) — runner del OCR ESCALONADO + banda dirigida MOVIDOS a
// ocr-escalonado-runner.ts (partición §7 del reporte 03a): el bridge solo
// orquesta (reconocerRapidOcr queda para reconocerTexto — mismo contrato).
// (R7c M6-fin: ocrBanda la consume bandaDirigidaSiFalta — pipeline-comun.ts.)
import { reconocerRapidOcr, reconocerRapidOcrEscalonado } from "./ocr-escalonado-runner";
// Espera del turno OCR global, acumulada POR ACTA (ver EsperaOcrSink en
// rapidocr). Solo el TIPO: se borra al compilar — cero dependencia runtime.
import type { EsperaOcrSink } from "./ocr/rapidocr";
// R7b (M5b) — fábrica del ACTA MOVIDA a acta-factory.ts (partición §7 del
// reporte 03a): construirActa/firmasPorStatus eran métodos privados (el
// contador de id era this.contador) — ahora funciones libres con contador de
// módulo (equivalencia documentada en la cabecera de acta-factory.ts);
// ParcialPipeline (acumulador) y capturarFrame (grab §5) viajan con ella.
import {
  capturarFrame,
  construirActa,
  firmasPorStatus,
  type ParcialPipeline,
} from "./acta-factory";
// KIT e14-orientacion-auto-v1 (T-A2/A3): probe de orientación por confianza
// de rec + anclas (§2.1) — corre ANTES del OCR completo en AMBOS pipelines
// (escaneo y pipelineRecorte). SIM OMITIDO (guard — chips 8.2/7.0/4.3
// intactos, §2.2); JAMÁS lanza (catch interno — el pipeline no depende, §5).
import { probeOrientacion, rotarDataUrl } from "./orientacion";
// WAVE2 A1 — tipo del resultado del probe (para el diag de la mini descartada por el fallo seguro).
import type { ProbeOrientacion } from "./orientacion";
// (R7b M2: los caps del det-preprocess DET_CAP_PROD/DET_CAP_RAPIDO y la
// decisión/elegir del módulo PURO (anclasDe/elegirMejor/necesitaSegunda)
// viven ahora en ocr-escalonado-runner.ts — el runner es su único
// consumidor en producción; el módulo puro sigue testeable headless — bun.)
// R7c (M6-fin) — los CUERPOS GEMELOS restantes de pipeline()/pipelineRecorte()
// viven en pipeline-comun.ts (una implementación; diferencias del sitio
// explícitas como campos tipados — patrón EntradaDesenlace de R7a): banda
// dirigida, esquinas e71, señales de texto, evidencia-borde, cola del log de
// auditoría (formato D51 congelado) y payload del diagnóstico.
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
// KIT e14-observabilidad-v1 (A1-C7, cambio QUIRÚRGICO): emisión perf
// del desenlace — lazy import + catch total (el rastreo jamás rompe
// el pipeline, §2.4), mapea SOLO campos ya en scope (§9.10: tiempos/
// gate/ocrValido leídos de diag — nada re-evaluado). El actaId sale
// SIEMPRE hasheado (FNV-1a dentro de emitirPerfDeActa, §2.5).
import { logger } from "../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)


// SPRINT-A (perf/decode-once-v1) A5: el export precargarDecodeArchivo fue
// eliminado — DEAD desde D66 (el prefetch del runner se re-apuntó a
// asegurarMaestro; 0 anclas en scripts/, 0 usos en src). La memo interna
// decodeArchivoMemo vive ahora en ./pipeline (FASE F) y este módulo la
// re-exporta para masiva/prefacta.ts.

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
const DETALLE_TIMEOUT = "TIEMPO DE PROCESADO EXCEDIDO";
// (R7a) Los copies/techos del DESENLACE (DETALLE_ILEGIBLE · DETALLE_GENERICO ·
// DETALLE_INCOMPLETA(+_ESCANEO) · DETALLE_SIN_VOTOS · DETALLE_BAJO ·
// TECHO_SIN_SENAL · TECHO_ESCUDO_FONDO) viven AHORA en lib/e14/gate.ts
// (desenlace unificado, M3) — importados arriba. El bridge conserva SOLO los
// que aún consume en rutas propias: DETALLE_TIMEOUT (watchdogs de abajo);
// DETALLE_ILEGIBLE viajó con el pipeline (./pipeline — el detalle vive hoy
// en gate.ts) y TECHO_SIN_SENAL (scoreDeCalidad). Los comentarios/valores
// originales viajaron íntegros.

// R7c (M6-fin): senalDeContenido vive en pipeline-comun.ts (era gemela ×2 —
// R7a §10.2; el módulo común la consume dentro de caracterizarLectura).

// GUARD-BORDE Rev. 2 (D1/D3): la función esActaCompleta del guard del PR #33
// (geometría: esquina al filo ≤0.001/≥0.999 o área <30% → INCOMPLETA) VIVIÓ
// aquí y hoy vive en ./completitud (verificarCompletitud) — la geometría
// pasó de CONDENAR a SER SOSPECHA: la condena exige tinta impresa cortada al
// filo del recorte (tabla de decisión §2 del spec). Historia completa del
// guard y su calibración: comentario del helper + CHANGES 0-decimoquinto.
// PATRON_CABECERA vive ahora en ./clasificador (§4.5: se mantiene como
// constante para traza/log — ya NO decide sola el estado del gate).





function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}




// R7c (M6-fin): fmtClasif vive en pipeline-comun.ts (solo lo consumían los
// 2 logs de auditoría — ahora compone la cola común trazaDesenlaceComun).



export class RealCoreBridge implements E14Bridge {
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
          construirActa(opciones, parcial, {
            score: 0,
            status: "RECHAZADA",
            rechazo: { tipo: "ILEGIBLE", detalle: DETALLE_TIMEOUT },
          }),
        );
        // KIT e14-masiva-ux-v1 (T4): presupuesto OPCIONAL por llamada —
        // MASIVA pasa su presupuesto del watchdog (WATCHDOG_MS del runner);
        // el default manda en el flujo individual (120_000 desde e67).
      }, opciones.timeoutMs ?? TIMEOUT_MS);

      correrPipelineL2(opciones, entrada, parcial, emitir).then(
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
          firmas: firmasPorStatus(acta.firmas, "RECHAZADA"),
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
   *  conocidos). Reusa los helpers del pipeline L2 — conRampa (bridge),
   *  PATRON_CABECERA (clasificador) y scoreDeCalidad (calidad.ts, vía
   *  pipeline-comun.ts desde R7c M6-fin) — y el mapeo §4.1 + gate §4.2
   *  idénticos. */
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
    const ms = { proceso: 0, procesoBw: 0, procesoOcr: 0, calidad: 0, ocr: 0, total: 0 };
    const inicio = performance.now();
    // Espera del turno OCR de ESTE recorte — mismo instrumento del escaneo
    // (ver `EsperaOcrSink`), sink propio por pipeline.
    const esperaOcr: EsperaOcrSink = { ms: 0 };
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
    // D45 — pared individual de CADA warp (misma doctrina de la zona
    // principal): el core serializa → la 2.ª pared acumula la cola. Cuando
    // pOcr === pBw (filtro ya-original) el segundo cronómetro queda a 0.
    let tProcesoBw = 0;
    let tProcesoOcr = 0;
    const pBw = processImage(fotoOriginal, quad, filtro, rotacion, { manual: true }).then((r) => {
      tProcesoBw = performance.now();
      return r;
    });
    const pOcr =
      filtro === "original"
        ? pBw
        : processImage(fotoOriginal, quad, "original", rotacion, { manual: true })
            .catch(() => null)
            .then((r) => {
              tProcesoOcr = performance.now();
              return r;
            });
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
    // D45 — subs del muro (guard > 0 al exportar — jamás inventar).
    if (tProcesoBw > 0) ms.procesoBw = Math.round(tProcesoBw - tProceso);
    if (tProcesoOcr > 0) ms.procesoOcr = Math.round(tProcesoOcr - tProceso);
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
      const probe = await probeOrientacion(fotoOcr, { esperaSink: esperaOcr });
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
        esperaSink: esperaOcr,
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
    // R7c (M6-fin): UNA implementación en pipeline-comun (×2 — pitfall §9.9);
    // el recorte pasa simular: false (no hay SIM en esta ruta).
    texto = await bandaDirigidaSiFalta({
      texto,
      fotoProcesada,
      simular: false,
      ms,
      esperaSink: esperaOcr,
    });
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
    // R7c (M6-fin): la medición vive en pipeline-comun (mismo criterio ×2);
    // el recorte mide SIEMPRE real → simular: false (sin ESQUINAS_OK).
    const { esquinas, ladoEsquina, trazaEsq } = await medirEsquinasSitio({
      fotoProcesada,
      simular: false,
    });
    const verificacion = await verificarCompletitud(quad, fotoProcesada, esquinas);
    // e71 (P10) — VETO 4/4 FIDUCIALES (mismo criterio del escaneo — helper
    // ÚNICO cuatroEsquinasFaltan, pitfall §9.9): las 4 marcas ausentes →
    // `completa` false. En el RECORTE MANUAL el veto NO rechaza (doctrina
    // Q2 del kit esquinas-suaves: el operador VIO el papel) — degrada al
    // escudo-manual (techo 7.9) vía vetoIncompleta/escudoManual de abajo;
    // diag.gate.completa SÍ reporta false (kit P10 — coherencia del
    // informe con la medición física).
    // R7c (M6-fin): criterio único vetoCuatroEsquinas — el recorte siempre
    // mide real → aplica: true (el escaneo pasa su guard SIM).
    // KIT e14-velocidad-5s-v1 — las SEÑALES de lectura se SUBEN sobre el veto:
    // el perdón 4/4 necesita `pisoPerfecto` y `recortada`. `caracterizarLectura`
    // es PURA y síncrona (misma entrada → misma salida) y `clasificarCabecera`
    // solo depende de `texto`, ya en vuelo: moverlas no cambia ningún valor y
    // las awaits del sitio (divipol → marcadores) conservan su orden relativo.
    const clasificacion = clasificarCabecera(texto, await cargarDivipol());
    // (faltaSeccion no se desestructura aquí: el recorte no tiene perdón de
    // marco — solo el escaneo lo consulta vía marcoPerdonadoPorLectura.)
    const { lazoPerdonado, recortada, ocrLegible, senalActa, senal, pisoPerfecto, scoreBase } =
      caracterizarLectura({ texto, clasificacion, esquinas, ladoEsquina, calidad });
    const completa =
      verificacion.completa &&
      !vetoCuatroEsquinas({ esquinas, aplica: true, pisoPerfecto, recortada });
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
    // KIT actas-vivas-paginas-v1 (FASE C): la clasificación y las señales de
    // lectura se calcularon ARRIBA (KIT e14-velocidad-5s-v1 — el perdón 4/4 las
    // necesita antes del veto); acá solo se consumen.
    // (KIT consenso-frankfurt-v1 FASE 2: las esquinas se miden ANTES del
    // guard — arriba; aquí solo consume ladoEsquina/trazaEsq.)
    // KIT e14-lectura-perdona-lazo-v1 (§4-B): MISMO perdón del escaneo — la
    // LECTURA perdona al lazo (falso positivo margen corto/sombra); la señal
    // de secciones NUNCA se perdona. Mismo criterio en AMBOS pipelines
    // (pitfall §9.9 del kit score-lectura — helper único).
    // (el score BASE muta después con los caps — `score = desenlace.score`;
    // scoreVisual queda capturado ANTES, misma convención del escaneo.)
    let score = scoreBase;
    const marcadores = await medirZonaVotos(fotoProcesada);
    // KIT actas-vivas-paginas-v1 (FASE C): gate de votos SOLO P1 — la pág 2
    // (constancias) NO tiene zona de votos. Página desconocida → se mide
    // (conservador). Log: votos=skip-pag2 cuando aplique.
    // (R7a: el `marcadoresOk` que vivía aquí nace ahora DENTRO de
    // resolverDesenlace — gate.ts — y regresa como `desenlace.marcadoresOk`.)
    const votosSkipPag2 = clasificacion.pagina?.index === 2;
    // KIT e14-diagnostico-autoenvio-v1 (§3-A): score visual ANTES de los caps
    // del sitio (misma convención que el escaneo). ORDEN del merge (kit
    // e14-diag-campos-aditivos-v1 §4-A.3): scoreDeCalidad → scoreVisual → C3.
    const scoreVisual = scoreBase;
    // R7a (M3) — DESENLACE unificado (mismo criterio del escaneo, pitfall
    // §9.9): C3 (piso/techo lectura) → caps del sitio (escudo-fondo D10 ·
    // escudo-manual Q2 · recortada) → gate (INCOMPLETA · SIN_VOTOS G2 ·
    // evaluarGate §4) → caps post-gate 6.4 → sustitución BAJO §D3 →
    // techosDiag, TODO en resolverDesenlace (gate.ts — transcripción literal
    // de esta rama). Las diferencias legítimas del recorte entran EXPLÍCITAS:
    // sin chip SIM (scoreSimulado null), vetoIncompleta/escudoManual según
    // `manual` (Q2 — el recorte MANUAL degrada el veto a escudo) y copy
    // INCOMPLETA de cámara SIEMPRE (rama manual sin cambios: F2.4).
    const desenlace = resolverDesenlace({
      score,
      levelCalidad: calidad.level,
      nivelLectura: senal.nivel,
      senalActa,
      ocrTexto: texto,
      clasificacion,
      intento: acta.intento,
      maxIntentos: acta.maxIntentos,
      scoreSimulado: null,
      completa,
      vetoIncompleta,
      escudoManual,
      fondo: verificacion.fondo,
      recortada,
      origenEscaneo: false,
      votosSkipPag2,
      hayVotos: marcadores.hayVotos,
    });
    score = desenlace.score;
    const marcadoresOk = desenlace.marcadoresOk;
    const rechazoFinal: Acta["rechazo"] = desenlace.rechazo;

    // §3c (GUARD-BORDE): log de auditoría del guard — SOLO con sospecha
    // geométrica (AC8). Mismos campos que el pipeline de escaneo.
    // KIT e14-esquinas-suaves-v1 (Q1): token `perdon=` añadido AL FINAL del
    // segmento (tokens NUEVOS solo al final — líneas `senal=`/`level:`
    // intocables byte a byte).
    // R7c (M6-fin): el segmento vive UNA vez en pipeline-comun (evidencia-
    // BordeDe — era ×2 con la misma fórmula; aquí la verificación es no-null).
    const evidenciaBordeRecorte = evidenciaBordeDe(verificacion);
    // KIT e14-diagnostico-autoenvio-v1 (C1/§6-B): techos con las MISMAS
    // condiciones que aplicaron los caps (orden real) — sitio recorte.
    // R7a (M3): la lista nace AHORA en resolverDesenlace (gate.ts) — mismas
    // condiciones y MISMO orden que los caps que aplicó, escudo-manual
    // incluido (antes duplicado aquí y en pipeline() — pitfall §9.9).
    const techosDiag: string[] = desenlace.techosDiag;
    // C1: registro del desenlace junto al log (§9.6). Guard extra §9.2: un
    // recorte de un acta SIMULACION tampoco adjunta (doble guard con el store).
    let diag: DiagnosticoActa | null = null;
    if (acta.fuente !== "SIMULACION") {
      try {
        // R7b (M4) + R7c (M6-fin): payload del desenlace UNA vez en
        // pipeline-comun (construirDiagnosticoSitio) — diferencias de ESTE
        // sitio explícitas (actaId = acta.id — identidad conservada; SIN
        // gateMarco — la clave viaja AUSENTE como hoy; decode/detect
        // null/null — esta ruta no los mide).
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
            actaId: acta.id, // el acta existe — identidad conservada (spread)
            intento: acta.intento,
            maxIntentos: acta.maxIntentos,
            gateMarco: undefined, // el recorte NO traía la clave (ver auditoria.ts)
            fondo: verificacion.fondo,
            filtro,
            // D61 — esta ruta (recorte manual del editor) NO mide decode/detect
            // (su `ms` local no los trae) — null honesto, jamás inventar.
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
    // para ambos sitios (formato D51 CONGELADO). El head conserva los tokens
    // propios del recorte (sin decode/detect). Los extras del sitio entran
    // tipados: evidenciaSitio = evidencia-borde + manual + escudo-manual.
    logger.info(
      `[e14] recorte ${acta.fuente} total=${Math.round(ms.total)}ms ` +
        `(proceso=${Math.round(ms.proceso)} calidad=${Math.round(ms.calidad)} ` +
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
          evidenciaSitio: `${evidenciaBordeRecorte}${manual ? " manual=1" : ""}${escudoManual ? " escudo-manual=1" : ""}`,
          quad,
          quadOrigen,
          pisoPerfecto,
          score,
          filtro,
          ocrIn,
          confOcr,
          detOcr,
          recOcr,
          senal,
          desenlace,
          infoCrop,
          calidad,
          ocrLegible,
          extrasSim: "", // el recorte no tiene SIM (siempre real)
          extrasDeteccion: "", // esta ruta no corre detección
          diag,
        }),
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
      status: desenlace.status,
      rechazo: rechazoFinal,
      clasificacion: desenlace.clasificacion ?? undefined,
      firmas: firmasPorStatus(acta.firmas, desenlace.status),
    };
    const titUbi = tituloYUbicacionDe(desenlace.clasificacion ?? null);
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
   *
   * R7a (M3): el CRITERIO vive ahora en gate.ts (export `evaluarGate`) y los
   * pipelines llegan a él vía resolverDesenlace. Este método se conserva como
   * SEAM de caracterización (__tests__/gate.test.ts lo compara contra el
   * módulo puro — misma entrada → misma salida) y punto de anclaje para la
   * partición R7b. SIN llamadores en producción.
   */
  private evaluarGate(
    score: number,
    ocrTexto: string,
    clasificacion: ClasificacionE14,
    intento: number,
    maxIntentos: number,
  ): ResultadoGate {
    return evaluarGateCriterio(score, ocrTexto, clasificacion, intento, maxIntentos);
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

  horaEnvio(): string {
    const d = new Date();
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
  }

  horaHistorial(): string {
    const d = new Date();
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  }
}
