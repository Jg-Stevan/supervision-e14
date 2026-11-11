/**
 * ocr-cascada.ts — cascada OCR por defecto de ESTA app (decisión del dueño
 * 2026-11-11): el motor de D, Tesseract `fast` (spa 4.0.0_fast) como intento 1
 * → GATE (clasificador REAL de producción) → si la cabecera no sale AUTO,
 * RapidOCR PP-OCRv4 escalonado 1280 → 1920 → rescate por ROIs.
 *
 * Reglas (kit e14-ocr-cascada-v1 §1 — las mismas de D):
 *  · Entre motores decide el GATE: el texto de Tesseract vale SOLO por el
 *    nivel AUTO que produce; JAMÁS entra a `elegirMejor` (conf Tess vs
 *    RapidOCR no es comparable).
 *  · `elegirMejor` solo recibe pasadas RapidOCR (1280 | 1920 | ROI).
 *  · JAMÁS tumba: fallo de Tess o del gate → RapidOCR de siempre; fallo de un
 *    ROI → ese ROI se descarta.
 *  · Presupuesto: el timeout EXISTENTE del pipeline manda; vencido ⇒ no se
 *    abre ninguna etapa nueva. Con el veredicto ya bloqueado (`corte`) el
 *    intento 1 va directo por la pasada rápida: un acta condenada no paga
 *    Tesseract.
 *
 * La cascada es la del PAQUETE (`orquestacion/cascada.ts`); aquí solo se
 * inyectan las dependencias reales. El sidecar nativo queda FUERA: cuando
 * está instalado y responde, el runner corre su escalonado nativo ANTES de
 * llegar acá (aceleración opcional, nunca requisito).
 */
import { clasificarCabecera } from "@jg-stevan/scanner-core/dominio/clasificador";
import { cargarDivipol } from "@jg-stevan/scanner-core/dominio/divipol";
import {
  correrCascadaOcr,
  type DepsOcrCascada,
  type PasadaCascada,
} from "@jg-stevan/scanner-core/orquestacion/cascada";
import type {
  EventoLectura,
  SinkLectura,
} from "@jg-stevan/scanner-core/obs-base/eventos-lectura";
import { loadImageMemo, canvasCon } from "./image-utils";
import {
  DET_CAP_PROD,
  DET_CAP_RAPIDO,
  rapidOcrInit,
  rapidOcrReconocer,
  type EsperaOcrSink,
} from "./ocr/rapidocr";
import { tessReconocer } from "./ocr/tesseract";

export interface OcrCascadaSalida {
  texto: string;
  conf: number;
  detMs: number;
  recMs: number;
}

export interface OcrCascadaCfg {
  /** Presupuesto del pipeline (timeout EXISTENTE — sin presupuestos nuevos). */
  presupuestoMs: number;
  /** performance.now del INICIO del pipeline (base del presupuesto). */
  inicioMs: number;
  esperaSink?: EsperaOcrSink;
  /** Telemetría por etapa: la cascada emite por motor y por gate. */
  onEvento?: SinkLectura;
  /** Veredicto ya bloqueado (rechazo temprano): no se paga Tesseract. */
  corte?: boolean;
  /** Tope de la 1.ª pasada RapidOCR (1280 por defecto). */
  detCapPrimera?: number;
}

/** Recorte de UN ROI del warp para el rescate — franja [y0, y1] re-escalada
 *  a cap 1920 → JPEG 0.92 (entrada de OCR). null = se descarta, jamás lanza. */
async function recortarRoiDataUrl(
  foto: string,
  y0Frac: number,
  y1Frac: number,
): Promise<string | null> {
  try {
    const img = await loadImageMemo(foto);
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !H) return null;
    const y0 = Math.round(Math.max(0, Math.min(1, y0Frac)) * H);
    const y1 = Math.round(Math.max(0, Math.min(1, y1Frac)) * H);
    const hSrc = Math.max(1, y1 - y0);
    const escala = Math.min(1, DET_CAP_PROD / Math.max(W, hSrc));
    const wDst = Math.max(1, Math.round(W * escala));
    const hDst = Math.max(1, Math.round(hSrc * escala));
    const canvas = canvasCon(wDst, hDst);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, y0, W, hSrc, 0, 0, wDst, hDst);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

/** Pasada Tesseract fast — su texto vale SOLO por el GATE. null = fallo. */
async function tessParaGate(
  foto: string,
  cfg: OcrCascadaCfg,
  onProgress: (p: number) => void,
): Promise<PasadaCascada | null> {
  const restante = cfg.presupuestoMs - (performance.now() - cfg.inicioMs);
  try {
    const r = await tessReconocer(foto, restante, onProgress);
    return { texto: r.texto, conf: r.conf, cap: "tess", motor: "tesseract" };
  } catch {
    return null;
  }
}

/** OCR de un pipeline con la cascada por defecto: Tess fast → gate →
 *  RapidOCR v4 escalonado. El caller consume SOLO el texto elegido. */
export async function reconocerOcrCascada(
  fotoOcr: string,
  onProgress: (p: number) => void,
  cfg: OcrCascadaCfg,
): Promise<OcrCascadaSalida> {
  const base = await cargarDivipol();
  const detCapPrimera = cfg.detCapPrimera ?? DET_CAP_RAPIDO;
  // La sesión WASM se inicializa SOLO si Tesseract no cierra la lectura: con
  // el acta fácil (Tess + gate AUTO) no se paga la init de RapidOCR.
  let rtProm: ReturnType<typeof rapidOcrInit> | null = null;
  const rapid = async (foto: string, cap: number): Promise<PasadaCascada> => {
    const rt = await (rtProm ??= rapidOcrInit());
    return rapidOcrReconocer(rt, foto, onProgress, {
      detCap: cap,
      esperaSink: cfg.esperaSink,
    }).then((r) => ({
      texto: r.texto,
      conf: r.confMedia,
      cap,
      motor: "rapidocr" as const,
      msDet: r.msDet,
      msRec: r.msRec,
      nBoxes: r.nBoxes,
      nLineas: r.lineas.length,
      msRunRec: r.msRunRec,
    }));
  };
  const rapidPrimera = (foto: string): Promise<PasadaCascada> => rapid(foto, detCapPrimera);
  const deps: DepsOcrCascada = {
    intento1: async (foto) => {
      if (cfg.corte === true) return rapidPrimera(foto);
      const p = await tessParaGate(foto, cfg, onProgress);
      return p ?? rapidPrimera(foto);
    },
    // Tesseract NO comparte espacio de conf con RapidOCR: si el intento 1
    // cayó a la rápida, su pasada se declara `motor: "rapidocr"` y la
    // cascada la reusa (nunca se paga dos veces la misma pasada).
    mismoMotorIntento1: false,
    ocr1280: rapidPrimera,
    ocr1920: (foto) => rapid(foto, DET_CAP_PROD),
    ocrRoi: (roiDataUrl) => rapid(roiDataUrl, DET_CAP_PROD),
    recortarRoi: recortarRoiDataUrl,
    clasificarNivel: (texto) => clasificarCabecera(texto, base).nivel,
    presupuestoVencido: () =>
      cfg.corte === true ||
      performance.now() - cfg.inicioMs >= cfg.presupuestoMs,
    onEvento: cfg.onEvento
      ? (e) => {
          try {
            cfg.onEvento?.(e as EventoLectura);
          } catch {
            /* la telemetría jamás tumba la lectura */
          }
        }
      : undefined,
  };
  const s = await correrCascadaOcr(fotoOcr, deps);
  // Métricas de la pasada ELEGIDA (0 = n/d honesto: Tesseract no separa).
  return {
    texto: s.texto,
    conf: s.conf,
    detMs: s.detMs ?? 0,
    recMs: s.recMs ?? 0,
  };
}
