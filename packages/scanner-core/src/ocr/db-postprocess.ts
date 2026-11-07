/**
 * db-postprocess.ts — R7c (M8): postproceso DB de detección como MÓDULO PURO
 * (sin estado de módulo — todas las funciones son puras y las constantes,
 * const). Transcripción LITERAL desde `ocr/rapidocr.ts` (patrón R7a: el
 * original vive inline dentro de `inferDet`, función async de ORT con
 * canvas — NO invocable headless; este módulo nace en el commit de TESTS
 * como transcripción byte a byte y el cableado de `inferDet` llega en el
 * commit de refactor inmediato. Origen citado línea a línea).
 *
 * Origen (rapidocr.ts en la base de R7c, commit 710f8c6):
 *   · OpsDet                  — L590-601
 *   · mapearAFuente           — L671-690
 *   · constants DB_* y MIN_*  — L694-699 (TEXT_SCORE se queda: es del rec)
 *   · interface Rect          — L702-709
 *   · convexHull              — L711-733
 *   · minAreaRect             — L735-778
 *   · boxScoreFast            — L780-823
 *   · esquinasRect            — L825-860
 *   · ordenarCajas            — L862-879
 *   · pasos 1-4 del postproceso (dentro de inferDet) — L1078-1166
 *
 * RapidOCR PP-OCRv4 en el navegador — puerto fiel de rapidocr_onnxruntime
 * 1.4.4. SIN OpenCV (el build vendored del repo es un binding custom sin
 * minAreaRect): el postproceso de detección (DB) es JS puro —
 * binarización 0.3 → dilate 2×2 → CCL 4-conectividad → convex hull →
 * min-area rect por barrido de aristas → box_score_fast → unclip →
 * esquinas TL,TR,BR,BL → mapeo inverso a coords de la fuente.
 *
 * PURO: sin DOM, sin ORT, sin timers, sin estado de módulo — misma entrada
 * `pred` (Float32Array de la salida del det) → misma salida. Testeable
 * headless con bun (los helpers se exportan para la caracterización/QA).
 */

// ─── Pre-det: registro de ops para mapear de vuelta (tipo compartido con
//     preDet, que vive en rapidocr.ts y produce este registro) ───────────────

export interface OpsDet {
  w: number; // ancho final detIn
  h: number;
  /** ratio acumulado op1×op2 por eje (escala main.py preprocess). */
  ratioW: number;
  ratioH: number;
  /** padding superior del letterbox (px del espacio post-op2). */
  padTop: number;
  /** ratio del det-preprocess final (round32 sobre el padded) por eje. */
  ratioWDet: number;
  ratioHDet: number;
}

/** Mapea puntos del detIn a coords de la FUENTE (inversa de las ops; clamp
 *  a bordes y redondeo — convención _get_origin_points del paquete). */
export function mapearAFuente(
  p: { x: number; y: number },
  ops: OpsDet,
  srcW: number,
  srcH: number,
): { x: number; y: number } {
  // inversa secuencial: det-preprocess final (round32 sobre el padded) →
  // letterbox (−padTop) → main preprocess (op1×op2). Clamp a bordes + round
  // (convención _get_origin_points del paquete).
  const xPostPad = p.x / ops.ratioWDet;
  const yPostPad = p.y / ops.ratioHDet - ops.padTop;
  const x = xPostPad / ops.ratioW;
  const y = yPostPad / ops.ratioH;
  return {
    x: Math.max(0, Math.min(srcW, Math.round(x))),
    y: Math.max(0, Math.min(srcH, Math.round(y))),
  };
}

// ─── Post det (DBPostProcess en JS puro) ────────────────────────────────────

export const DB_THRESH = 0.3;
export const DB_BOX_THRESH = 0.5;
export const DB_MAX_CANDIDATES = 1000;
export const DB_UNCLIP_RATIO = 1.6;
export const MIN_SIDE_DESCARTAR = 3;
export const MIN_SIDE_TRAS_UNCLIP = 5;

interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** ángulo del eje mayor (rad, dirección d̂). */
  theta: number;
}

/** Convex hull (monotone chain) de un conjunto de puntos. */
export function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** min-area rect por barrido de aristas del hull (proyectar sobre el eje de
 *  cada arista y su perpendicular; quedarse con el área mínima). */
export function minAreaRect(hull: { x: number; y: number }[]): Rect | null {
  if (hull.length < 2) return null;
  let mejor: Rect | null = null;
  let mejorArea = Infinity;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len; // eje de la arista
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of hull) {
      const u = q.x * ux + q.y * uy;
      const v = -q.x * uy + q.y * ux; // perpendicular n̂ = (−uy, ux)
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (area < mejorArea) {
      mejorArea = area;
      mejor = {
        cx: ((maxU + minU) / 2) * ux + ((maxV + minV) / 2) * -uy,
        cy: ((maxU + minU) / 2) * uy + ((maxV + minV) / 2) * ux,
        w,
        h,
        theta: Math.atan2(uy, ux),
      };
    }
  }
  return mejor;
}

/** box_score_fast: media de `pred` dentro del quad (bbox + máscara por
 *  punto-en-polígono, scanline por cruce de aristas). */
export function boxScoreFast(pred: Float32Array, w: number, h: number, box: { x: number; y: number }[]): number {
  let xmin = w - 1;
  let xmax = 0;
  let ymin = h - 1;
  let ymax = 0;
  for (const q of box) {
    xmin = Math.max(0, Math.min(xmin, Math.floor(q.x)));
    xmax = Math.min(w - 1, Math.max(xmax, Math.ceil(q.x)));
    ymin = Math.max(0, Math.min(ymin, Math.floor(q.y)));
    ymax = Math.min(h - 1, Math.max(ymax, Math.ceil(q.y)));
  }
  if (xmax < xmin || ymax < ymin) return 0;
  let suma = 0;
  let cuenta = 0;
  for (let y = ymin; y <= ymax; y++) {
    // intersecciones de la scanline y con las aristas del polígono
    const xs: number[] = [];
    for (let i = 0; i < box.length; i++) {
      const a = box[i];
      const b = box[(i + 1) % box.length];
      if (a.y === b.y) continue;
      const yMin = Math.min(a.y, b.y);
      const yMax = Math.max(a.y, b.y);
      if (y + 0.5 >= yMin && y + 0.5 < yMax) {
        xs.push(a.x + ((y + 0.5 - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(xmin, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(xmax, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) {
        if (x >= xs[k] && x <= xs[k + 1]) {
          suma += pred[y * w + x];
          cuenta++;
        }
      }
    }
  }
  return cuenta === 0 ? 0 : suma / cuenta;
}

/** Esquinas de un rect expandido (centro + ángulo), ordenadas TL,TR,BR,BL
 *  (convención get_mini_boxes: sort por x, pares por y). */
export function esquinasRect(r: Rect): { x: number; y: number }[] {
  const cos = Math.cos(r.theta);
  const sin = Math.sin(r.theta);
  const nx = -sin;
  const ny = cos;
  const hw = r.w / 2;
  const hh = r.h / 2;
  const pts = [
    { x: r.cx + hw * cos + hh * nx, y: r.cy + hw * sin + hh * ny },
    { x: r.cx + hw * cos - hh * nx, y: r.cy + hw * sin - hh * ny },
    { x: r.cx - hw * cos + hh * nx, y: r.cy - hw * sin + hh * ny },
    { x: r.cx - hw * cos - hh * nx, y: r.cy - hw * sin - hh * ny },
  ];
  pts.sort((a, b) => a.x - b.x);
  let tl: { x: number; y: number };
  let bl: { x: number; y: number };
  let tr: { x: number; y: number };
  let br: { x: number; y: number };
  if (pts[0].y <= pts[1].y) {
    tl = pts[0];
    bl = pts[1];
  } else {
    tl = pts[1];
    bl = pts[0];
  }
  if (pts[2].y <= pts[3].y) {
    tr = pts[2];
    br = pts[3];
  } else {
    tr = pts[3];
    br = pts[2];
  }
  return [tl, tr, br, bl];
}

/** sorted_boxes estándar PaddleOCR: por y superior; solapamiento vertical
 *  (< 10 px) → por x (insert estabilizado del original). */
export function ordenarCajas(boxes: { x: number; y: number }[][]): { x: number; y: number }[][] {
  const sorted = boxes.slice().sort((a, b) => a[0].y - b[0].y || a[0].x - b[0].x);
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i; j >= 0; j--) {
      if (
        Math.abs(sorted[j + 1][0].y - sorted[j][0].y) < 10 &&
        sorted[j + 1][0].x < sorted[j][0].x
      ) {
        const tmp = sorted[j];
        sorted[j] = sorted[j + 1];
        sorted[j + 1] = tmp;
      } else break;
    }
  }
  return sorted;
}

/**
 * Postproceso DB COMPLETO (pasos 1-4 de `inferDet`, transcripción literal):
 * binarizar > 0.3 → dilate 2×2 → CCL 4-conectividad (máx 1000 componentes)
 * → hull/rect/score/unclip → esquinas TL,TR,BR,BL mapeadas a la FUENTE.
 *
 * `pred` = salida plana del det (dims [1,1,ph,pw] — el caller pasa
 * `out.data` con `pw = out.dims[3]`, `ph = out.dims[2]`); `ops` = registro
 * de preDet; `srcW/srcH` = dimensiones de la imagen FUENTE. Devuelve las
 * cajas ORDENADAS (ordenarCajas) y el nº de rects candidatos (antes del
 * filtro de mapeo — `nBoxes` del log/telemetría es este valor).
 */
export function dbPostprocess(
  pred: Float32Array,
  pw: number,
  ph: number,
  ops: OpsDet,
  srcW: number,
  srcH: number,
): { boxesFuente: { x: number; y: number }[][]; nBoxes: number } {
  // 1) binarizar > 0.3
  const bitmap = new Uint8Array(pw * ph);
  for (let i = 0; i < bitmap.length; i++) bitmap[i] = pred[i] > DB_THRESH ? 1 : 0;

  // 2) dilate 2×2 (max local con kernel [[1,1],[1,1]] — crece derecha/abajo)
  const dil = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const fila = y * pw;
    const filaPrev = Math.max(0, y - 1) * pw;
    for (let x = 0; x < pw; x++) {
      const xPrev = Math.max(0, x - 1);
      const v = Math.max(
        bitmap[fila + x],
        bitmap[filaPrev + x],
        bitmap[fila + xPrev],
        bitmap[filaPrev + xPrev],
      );
      dil[fila + x] = v;
    }
  }

  // 3) CCL 4-conectividad (BFS, máx 1000 componentes)
  const labels = new Int32Array(pw * ph); // 0 = no visitado
  let nComp = 0;
  const rects: Rect[] = [];
  const stack = new Int32Array(pw * ph);
  const coords: number[] = [];
  for (let y = 0; y < ph && nComp < DB_MAX_CANDIDATES; y++) {
    for (let x = 0; x < pw && nComp < DB_MAX_CANDIDATES; x++) {
      const idx = y * pw + x;
      if (dil[idx] === 0 || labels[idx] !== 0) continue;
      nComp++;
      let sp = 0;
      stack[sp++] = idx;
      labels[idx] = nComp;
      coords.length = 0;
      while (sp > 0) {
        const cur = stack[--sp];
        const cy = (cur / pw) | 0;
        const cx = cur - cy * pw;
        coords.push(cx, cy);
        // vecinos (4-con)
        if (cx > 0 && dil[cur - 1] === 1 && labels[cur - 1] === 0) {
          labels[cur - 1] = nComp;
          stack[sp++] = cur - 1;
        }
        if (cx < pw - 1 && dil[cur + 1] === 1 && labels[cur + 1] === 0) {
          labels[cur + 1] = nComp;
          stack[sp++] = cur + 1;
        }
        if (cy > 0 && dil[cur - pw] === 1 && labels[cur - pw] === 0) {
          labels[cur - pw] = nComp;
          stack[sp++] = cur - pw;
        }
        if (cy < ph - 1 && dil[cur + pw] === 1 && labels[cur + pw] === 0) {
          labels[cur + pw] = nComp;
          stack[sp++] = cur + pw;
        }
      }
      const nPx = coords.length / 2;
      if (nPx < 10) continue; // ruido (findContours de <10 px tampoco aporta)
      // submuestreo si > 20000 px
      const stride = nPx > 20000 ? Math.ceil(nPx / 20000) : 1;
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k < nPx; k += stride) pts.push({ x: coords[k * 2], y: coords[k * 2 + 1] });
      const hull = convexHull(pts);
      const rect = minAreaRect(hull);
      if (!rect) continue;
      const sside = Math.min(rect.w, rect.h);
      if (sside < MIN_SIDE_DESCARTAR) continue;
      // esquinas del rect (pre-unclip) para el score
      const esq = esquinasRect(rect);
      const score = boxScoreFast(pred, pw, ph, esq);
      if (score < DB_BOX_THRESH) continue;
      // unclip (rect es exacto): d = área·ratio / perímetro; w += 2d, h += 2d
      const perim = 2 * (rect.w + rect.h);
      const dUnclip = (rect.w * rect.h * DB_UNCLIP_RATIO) / perim;
      const wU = rect.w + 2 * dUnclip;
      const hU = rect.h + 2 * dUnclip;
      if (Math.min(wU, hU) < MIN_SIDE_TRAS_UNCLIP) continue;
      rects.push({ cx: rect.cx, cy: rect.cy, w: wU, h: hU, theta: rect.theta });
    }
  }

  // 4) esquinas TL,TR,BR,BL + mapeo a coords de la FUENTE
  const boxesFuente = rects
    .map((r) => esquinasRect(r).map((p) => mapearAFuente(p, ops, srcW, srcH)))
    .filter((b) => b.every((p) => p.x >= 0 && p.y >= 0));
  return { boxesFuente: ordenarCajas(boxesFuente), nBoxes: rects.length };
}
