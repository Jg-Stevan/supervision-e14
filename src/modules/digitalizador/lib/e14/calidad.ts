/**
 * calidad.ts — R7b (M1): medición de CALIDAD del acta y mapeo a score.
 *
 * MOVIDO verbatim de `scanner-core-bridge.ts` (partición move-only,
 * docs/revision-v1/03a-digitalizador-nucleo.md §7 paso M1): helpers libres
 * sin estado de módulo — medición del ACTA (no de la mesa) y mapeo
 * PageQuality → score 0-10 con techos. El bridge (pipeline ×2) los consume
 * vía import; la fachada no re-exporta nada de aquí (0 consumidores fuera
 * del bridge hoy).
 *
 * Contenido (sin cambios de lógica, comentarios íntegros):
 *   · contrasteEfectivoDe / PISO_CONTRASTE_LEGIBLE — §X.1 piso de legibilidad
 *   · scoreDeCalidad — mapeo §4.1 (techos fair/poor/sin-senal + piso PERFECTA)
 *   · InfoCrop — out-param del recorte de calidadDeActa (§S.1)
 *   · senalHiResDeCanvas — nitidez/contraste hi-res del recorte (§4-B1)
 *   · bboxActaEnPx — bbox del acta en px reales desde el quad
 *   · calidadDeActa — evaluateQuality sobre el RECORTE del acta (§S.0)
 *   · esquinasDeActa — marcas fiduciales de esquina (kit identificacion §F)
 */
import { evaluateQuality } from "@jg-stevan/scanner-core/image-processor";
import type { PageQuality, Quad } from "@jg-stevan/scanner-core/types";
import { loadImageMemo, canvasCon } from "./image-utils";
import { marcasEsquina, type EsquinasActa } from "./integridad";
import { TECHO_SIN_SENAL } from "./gate";

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
export function contrasteEfectivoDe(q: PageQualityV2, ocrLegible: boolean): number {
  return Math.max(q.contrast, q.contrastPapel, ocrLegible ? PISO_CONTRASTE_LEGIBLE : 0);
}

/** Mapeo §4.1: PageQuality del core → score 0-10 (1 decimal) con techos por
 *  level. §X (SPEC-score-legible): recibe señales de legibilidad — OCR válido
 *  y clasificación AUTO (identificación completa). §D1 (SPEC-e14-score-ocr):
 *  `conSenal` extiende el paquete — SIN señal de contenido del acta el score
 *  no describe una digitalización → techo 4.9 («score bajo»). */
export function scoreDeCalidad(
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
export interface InfoCrop {
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
export interface PageQualityV2 extends PageQuality {
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
        const y1 = tx === 2 ? h : y0 + th;
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
export async function calidadDeActa(
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
export async function esquinasDeActa(foto: string | undefined): Promise<EsquinasActa | null> {
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
