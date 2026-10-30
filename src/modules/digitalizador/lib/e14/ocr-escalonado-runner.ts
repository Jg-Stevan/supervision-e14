/**
 * ocr-escalonado-runner.ts — R7b (M2): runner del OCR ESCALONADO (motor RapidOCR).
 *
 * MOVIDO verbatim de `scanner-core-bridge.ts` (partición move-only,
 * docs/revision-v1/03a-digitalizador-nucleo.md §7 paso M2 — el reporte lo
 * sitúa en ocr/, pero el contrato de R7b restringe la escritura a la RAÍZ
 * de lib/e14/; nombre consistente con ocr-escalonado.ts, el módulo puro de
 * decisión que este runner consume):
 *   · reconocerRapidOcr — motor de producción (PROD-2) sobre el recorte
 *   · reconocerRapidOcrEscalonado — 1.ª pasada 1280 → re-OCR 1920 → elegir
 *     el MEJOR (kit e14-ocr-escalonado-v1 §2) + traza propia (§2.5)
 *   · OcrEscalonadoSalida / PasadaEscalonada — contratos del runner
 *   · ocrBanda — segunda pasada OCR DIRIGIDA del sello de la banda
 *     (kit consenso-frankfurt-v1 FASE 4 §5 — invertida ×2, escada ×2)
 * El bridge (pipeline ×2 + reconocerTexto) los consume vía import; la
 * fachada no re-exporta nada de aquí (0 consumidores fuera del bridge hoy).
 */
// KIT e14-motor-rapidocr-v1 (PROD-2 §3): adaptador del motor de producción.
import { rapidOcrInit, rapidOcrReconocer, DET_CAP_PROD, DET_CAP_RAPIDO } from "./ocr/rapidocr";
// KIT e14-score-lectura-v1: señal de LECTURA (nivel) para la traza §2.5.
import { senalDeLectura } from "./senal-lectura";
// KIT e14-ocr-escalonado-v1 (§2): decisión/elegir del módulo PURO (testable).
import { anclasDe, elegirMejor, necesitaSegunda } from "./ocr-escalonado";
// SPRINT-A A1/A3 — decode-once LRU + factory de canvas (los 4 decodes del
// pipeline: calidad ×2, esquinas, banda — misma imagen, un solo decode).
import { loadImageMemo, canvasCon } from "./image-utils";
import { logger } from "../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)

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
export async function reconocerRapidOcr(
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
export interface OcrEscalonadoSalida {
  texto: string;
  conf: number | null;
  detMs: number;
  recMs: number;
}

/** Pasada con métricas para elegirMejor (§2.4) — el ganador viaja por
 *  REFERENCIA con su cap (1280|1920) para la traza elegido=. */
export interface PasadaEscalonada {
  texto: string;
  conf: number;
  detMs: number;
  recMs: number;
  cap: number;
}

export async function reconocerRapidOcrEscalonado(
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

export async function ocrBanda(fotoProcesada: string): Promise<string> {
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
