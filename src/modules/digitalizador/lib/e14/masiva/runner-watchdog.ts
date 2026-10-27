"use client";

/**
 * SPLIT del runner (refactor/runner-logger-v1, C1 — movimiento puro): la
 * INFRAESTRUCTURA del watchdog D65 vive aquí — carrera del intento,
 * detección del veredicto-timeout, matar/re-crear workers y el acta de
 * colgaje-fuera-del-bridge + el vocabulario de etapa al morir (T1.4).
 * runner.ts (orquestador) importa estos símbolos; este archivo NUNCA
 * importa de otros runner-*.ts. Constantes ANCLADAS por QA
 * (WATCHDOG_MS/INTENTOS/GRACIA/RELECTURA_TOPE — qa-watchdog-relectura y
 * qa-qr-identidad las grepean en runner.ts) permanecen en runner.ts.
 */
import { getScannerWorker, warmUpScannerWorker } from "@jg-stevan/scanner-core/detector-client";
// D65 (T1): soltar el runtime OCR al matar los workers del intento vencido.
// KIT e14-gama-adaptativa-v1 (D74): re-warm del OCR tras el kill — sin él,
// el reintento pagaba sesión+calor completos (~27 s fríos medidos).
import { rapidOcrPrecalentar, rapidOcrReiniciar } from "../ocr/rapidocr";
import { flagsMasivaEfectivos } from "../gama";
// D65 (T1.3): semilla para el acta de timeout del watchdog — la MISMA que el
// bridge usa en SU acta de timeout (solo lectura de la forma; cero criterios).
import { ACTA_MOCK } from "../seed";
import type { Acta, EtapaAnalisis } from "../types";

/** Espejo del DETALLE_TIMEOUT del bridge (constante PRIVADA allí): el string
 *  ES el veredicto visible de siempre y SOLO sale de sus rutas de timeout —
 *  el watchdog lo usa para detectar el vencimiento del intento. */
const DETALLE_TIMEOUT = "TIEMPO DE PROCESADO EXCEDIDO";

/** D65 (T1.4) — etapaAlMorir: vocabulario del kit para la TRAZA (aquí la
 *  primera etapa se llama "decodificando", no "preparando"; mismo bucket).
 *  Sin señal → null (jamás inventar). */
function etapaDeSenal(
  senal: { etapa: EtapaAnalisis; fraccion: number } | null,
): string | null {
  if (!senal) return null;
  switch (senal.etapa) {
    case "OCR":
      return "ocr";
    case "CALIDAD":
      return "verificacion";
    case "DETECTANDO":
      return senal.fraccion <= 0.5 ? "decodificando" : "deteccion";
    default:
      return "deteccion"; // RECORTANDO / REALZANDO — cola del encuadre
  }
}

/** D65 (T1) — desenlace del INTENTO clasificado por la carrera: "acta"
 *  (el bridge resolvió), "error" (el bridge rechazó — fila ERROR de siempre)
 *  o "tope" (venció el watchdog — el pipeline sigue en vuelo y se ABANDONA:
 *  sus workers ya van a ser muertos y re-creados). NUNCA inventa acta. */
type DesenlaceIntento =
  | { tipo: "acta"; acta: Acta }
  | { tipo: "error"; error: unknown }
  | { tipo: "tope" };

function correrIntento(
  pipeline: Promise<Acta>,
  topeMs: number,
): Promise<DesenlaceIntento> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ tipo: "tope" }), topeMs);
    pipeline.then(
      (acta) => {
        clearTimeout(timer);
        resolve({ tipo: "acta", acta });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ tipo: "error", error });
      },
    );
  });
}

/** D65 (T1) — ¿el acta es el veredicto-timeout del bridge? (score 0 +
 *  ILEGIBLE/TIEMPO DE PROCESADO EXCEDIDO — el detalle SOLO sale de sus
 *  rutas de timeout; un rechazo REAL del gate jamás lo lleva). */
function esVeredictoTimeout(acta: Acta): boolean {
  return (
    acta.rechazo?.tipo === "ILEGIBLE" && acta.rechazo.detalle === DETALLE_TIMEOUT
  );
}

/** D65 (T1.2) — matar y re-crear los workers del intento vencido:
 *  · DETECCIÓN (OpenCV del core): dispose() rechaza lo en vuelo y termina el
 *    worker → getScannerWorker() lo sustituye por uno fresco (self-healing
 *    público del core); warmUpScannerWorker() arranca la recarga de OpenCV.
 *    El intento ABANDONADO muere rápido (sus promesas en vuelo rechazan) —
 *    deja de competir por CPU con el reintento.
 *  · OCR (RapidOCR/ONNX): soltar sesiones + singleton fuera → el reintento
 *    re-crea el runtime (rapidOcrReiniciar — best-effort, jamás lanza).
 *  Nada de esto toca criterios/score del veredicto: es infraestructura. */
async function matarYRecrearWorkers(): Promise<void> {
  try {
    getScannerWorker()?.dispose();
  } catch {
    /* worker ya muerto — el self-healing lo re-crea */
  }
  try {
    warmUpScannerWorker();
  } catch {
    /* la detección del reintento lo crea on-demand */
  }
  try {
    await rapidOcrReiniciar();
  } catch {
    /* jamás lanza — cinturón */
  }
  // KIT e14-gama-adaptativa-v1 (D74) — RE-WARM del OCR tras el kill:
  // rapidOcrReiniciar() deja el runtime FRÍO (prewarmHecho=null — el
  // pre-warm de MASIVA al montar se pierde) y el reintento pagaba la
  // sesión + calor completos (~27 s fríos medidos, kit e14-prowarm-ocr-v1).
  // Con el flag adaptativo ON el calor se re-dispara fire-and-forget EN
  // PARALELO con el re-arranque del worker OpenCV — el reintento encuentra
  // el OCR caliente (rapidOcrInit es singleton: la inferencia dummy no
  // duplica sesiones, solo compite levemente con el arranque — compra
  // clara frente a 27 s fríos). Flag OFF ⇒ byte-idéntico a hoy.
  if (flagsMasivaEfectivos().masivaAdaptativoGama) {
    try {
      void rapidOcrPrecalentar();
    } catch {
      /* jamás lanza — el reintento ya tiene su propio init */
    }
  }
}

/** D65 (T1.3) — veredicto del watchdog agotado SIN acta del bridge (colgaje
 *  FUERA del bridge — origen/pre-proceso, que su timeout no ve): la MISMA
 *  forma del acta de timeout del bridge (score 0, ILEGBILE/TIEMPO DE
 *  PROCESADO EXCEDIDO — nada inventado: es el veredicto de «murió el
 *  procesado» de siempre). Sin esto la cola se congelaba para siempre. */
function actaTimeoutWatchdog(filaId: string): Acta {
  return {
    id: `acta-watchdog-${filaId}`,
    titulo: ACTA_MOCK.titulo,
    // MISMA forma de ubicación del bridge (ACTA_MOCK plano + mesa seed 001 —
    // ver construirActa del bridge: numeroMesa "001" sin objetivo).
    ubicacion: {
      departamento: ACTA_MOCK.departamento,
      municipio: ACTA_MOCK.municipio,
      zona: ACTA_MOCK.zona,
      puesto: ACTA_MOCK.puesto,
      mesa: "001",
    },
    tipo: ACTA_MOCK.tipo,
    pagina: { index: 1, total: 2 },
    candidatos: ACTA_MOCK.candidatos.map((c) => ({ ...c })),
    firmas: [
      {
        nombre: ACTA_MOCK.firmas[0].nombre,
        jurado: ACTA_MOCK.firmas[0].jurado,
        estado: "OK",
      },
      {
        nombre: ACTA_MOCK.firmas[1].nombre,
        jurado: ACTA_MOCK.firmas[1].jurado,
        estado: "NO_DETECTADO", // RECHAZADA — misma regla de firmas del bridge
      },
      {
        nombre: ACTA_MOCK.firmas[2].nombre,
        jurado: ACTA_MOCK.firmas[2].jurado,
        estado: "OK",
      },
    ],
    codigoBarras: ACTA_MOCK.codigoBarras,
    score: 0,
    status: "RECHAZADA",
    rechazo: { tipo: "ILEGIBLE", detalle: DETALLE_TIMEOUT },
    intento: 1, // semántica de PRIMERA captura (el watchdog NO es re-captura)
    maxIntentos: 4,
    fuente: "ARCHIVO",
    motor: "canvas",
    rotation: 0,
    filtro: "bw",
    recortada: false,
    recorteLado: null,
  };
}

export { actaTimeoutWatchdog, correrIntento, esVeredictoTimeout, etapaDeSenal, matarYRecrearWorkers };
