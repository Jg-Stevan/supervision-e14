/**
 * acta-factory.ts — R7b (M5b): construcción del ACTA y captura de frame.
 *
 * MOVIDO verbatim de `scanner-core-bridge.ts` (partición move-only,
 * docs/revision-v1/03a-digitalizador-nucleo.md §7 paso M5 — acta-factory).
 * ÚNICO cambio estructural declarado: `construirActa` y `firmasPorStatus`
 * eran métodos privados de RealCoreBridge y pasan a funciones libres; el
 * contador de id `this.contador` (SOLO se leía/escribía dentro de
 * construirActa — evidencia: grep `this.contador` → 2 sitios, ambos en ese
 * método) se vuelve estado de MÓDULO aquí (`contadorActa`). Comportamiento
 * idéntico: en producción existe UNA sola instancia del bridge (get-bridge
 * singleton CompositeBridge(new RealCoreBridge())) y los tests de R7a
 * instancian RealCoreBridge sin llamar construirActa (gate.test.ts solo
 * ejercita evaluarGate/marcoPerdonadoPorLectura).
 *
 * Contenido (sin cambios de lógica, comentarios íntegros):
 *   · ParcialPipeline — acumulador del pipeline (e64-qr T-2.1; lo consumen
 *     el bridge y construirActa — por eso viaja con la fábrica)
 *   · capturarFrame — grab síncrono del <video> a dataUrl (§5 CAMARA)
 *   · firmasPorStatus — firmas coherentes con el estado (mock §7.5)
 *   · construirActa — acta final: seed SOLO si la clasificación no está
 *     resuelta (§1) + campos reales §3.1 + señal QR (red line 10)
 */
import { canvasCon } from "./image-utils"; // SPRINT-A A3 — factory de canvas
import { ACTA_MOCK } from "./seed";
import { tituloYUbicacionDe, type ClasificacionE14 } from "./clasificador";
import type { PageFilter, PageQuality, Quad } from "@jg-stevan/scanner-core/types";
import type { Acta, ActaFirma, ActaStatus } from "./types";
import type { OpcionesEscaneo } from "./bridge";

/** Contador de id del acta (`acta-<Date.now()>-<n>`) — era `RealCoreBridge
 *  #contador`; ver cabecera del módulo (M5b) para la equivalencia. */
let contadorActa = 0;

/** e64-qr T-2.1 — acumulador del pipeline: lo conocido al vencer el timeout
 *  + la señal de la CAPA 0 QR de cámara (ADITIVA — el QR jamás afecta
 *  score/status/gate/OCR; llave OPACA, red line 10). qrCam:
 *  undefined = el decodificador no terminó (timeout — los campos viajan
 *  AUSENTES, jamás inventar) · null = corrió y terminó en null
 *  ("sin-payload") · {payload} = leído ("leido"). */
export interface ParcialPipeline {
  fotoOriginal?: string;
  qrCam?: { payload: string } | null;
}

/**
 * Grab del <video> a RESOLUCIÓN DEL STREAM (§5 CAMARA): canvas de
 * videoWidth×videoHeight → JPEG 0.92. Síncrono (~10 ms) — se llama ANTES de
 * que el visor se desmonte, mientras el stream sigue vivo.
 */
export function capturarFrame(video: HTMLVideoElement): string | null {
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

/** Firmas coherentes con el estado (misma regla del mock/§7.5):
 *  ADVERTENCIA → firma 2 TENUE · RECHAZADA → NO_DETECTADO · resto OK. */
export function firmasPorStatus(firmas: ActaFirma[], status: ActaStatus): ActaFirma[] {
  if (firmas.length < 2) return firmas;
  const estadoFirma2: ActaFirma["estado"] =
    status === "ADVERTENCIA" ? "TENUE" : status === "RECHAZADA" ? "NO_DETECTADO" : "OK";
  return firmas.map((f, i) => (i === 1 ? { ...f, estado: estadoFirma2 } : { ...f }));
}

/** Acta final: seed SOLO cuando la clasificación no está resuelta (§1) + campos reales §3.1. */
export function construirActa(
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
  contadorActa += 1;

  // Firmas coherentes con el estado (misma regla del mock §7.5):
  // ADVERTENCIA → firma 2 TENUE · RECHAZADA → NO_DETECTADO · resto OK.
  const estadoFirma2: ActaFirma["estado"] =
    campos.status === "ADVERTENCIA" ? "TENUE" : campos.status === "RECHAZADA" ? "NO_DETECTADO" : "OK";

  // §1.2 (SPEC-titulo-ubicacion): clasificación AUTO → el acta nace con
  // título/ubicación REALES; sin ella se conserva el seed (no se inventa).
  const titUbi = tituloYUbicacionDe(campos.clasificacion ?? null);
  return {
    id: `acta-${Date.now()}-${contadorActa}`,
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

