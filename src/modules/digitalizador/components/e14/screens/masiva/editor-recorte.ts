/**
 * KIT VISOR-MASIVA-v1 (T4 — pedido N2 del mantenedor) — EDITOR DE RECORTE /
 * PERSPECTIVA del modal de revisión masiva. Helper LOCAL de la carpeta
 * masiva (el kit §1 lo permite: «modal-revisor.tsx y helpers de su
 * carpeta»); el motor `src/lib/e14/**` NO se toca — solo se CONSUME
 * (`loadImageMemo`, `canvasCon`, `analizarPixeles`: mismos decodes LRU del
 * pipeline, cero decodes duplicados).
 *
 * · `QuadPct` — 4 esquinas en % de la foto (0–100). Es el estado del
 *   editor del modal: 8 handles visibles (4 esquinas libres 2D + 2 de alto
 *   + 2 de ancho DERIVADOS de las esquinas — mover un handle de borde
 *   mueve las dos esquinas de ese borde).
 * · `hornearRecorteCuadrilatero` — APLICAR: warp proyectivo (homografía
 *   exacta, render por franjas afines con yield) del cuadrilátero →
 *   rectángulo. Canvas puro + JPEG dataURL 0.92 — misma disciplina de
 *   `recortarDataUrl` (el QUÉ pasa al aplicar no cambia: canvas →
 *   fotoProcesada + EDITADA).
 * · `detectarBordesDocumento` — DETECCIÓN AUTOMÁTICA: heurística de
 *   luminancia (umbral de Otsu + polaridad papel/fondo) sobre la imagen ya
 *   cargada (muestreo 220px). SOLO PROPONE el quad — el supervisor revisa,
 *   corrige y confirma con APLICAR. Falla honesta → `null` (el modal
 *   muestra el hint y deja los puntos como estaban).
 *
 * Sin servicios externos, sin librerías nuevas, sin persistencia (§0-5).
 */

/** Punto en % del área de la foto (0–100). */
export interface PuntoPct {
  x: number;
  y: number;
}

/** Cuadrilátero de recorte en % (esquinas: top-left, top-right, bottom-right,
 * bottom-left — el orden del polígono que dibuja el editor). */
export interface QuadPct {
  tl: PuntoPct;
  tr: PuntoPct;
  br: PuntoPct;
  bl: PuntoPct;
}

/** Quad inicial del editor: margen del 10% — los 8 handles nacen visibles y
 * el supervisor ajusta desde ahí (o pide DETECCIÓN AUTOMÁTICA). */
export const QUAD_POR_DEFECTO: QuadPct = {
  tl: { x: 10, y: 10 },
  tr: { x: 90, y: 10 },
  br: { x: 90, y: 90 },
  bl: { x: 10, y: 90 },
};

export const clampPct = (v: number): number => Math.min(100, Math.max(0, v));

/** Encode de un canvas vía toBlob (memoria-seguro en iOS) → data URL.
 *  Finding 4 (informe-arquitectura-fluidez-2026-11-02 §4): el editor
 *  horneaba a PNG (2-4× el peso del JPEG q0.9 del pipeline) y ese string
 *  inflado viajaba a IDB como fotoProcesada (RAM + GC + writes). Ahora
 *  sale JPEG 0.92 — mismo pipeline (canvas → toBlob → dataURL), el peso
 *  de la foto procesada vuelve a la escala del resto (fotos opacas: el
 *  canal alfa del PNG no aporta nada aquí). */
function encodeJpeg(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (!b || b.size === 0) {
          reject(new Error("toBlob vacío"));
          return;
        }
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result ?? ""));
        fr.onerror = () => reject(new Error("FileReader falló"));
        fr.readAsDataURL(b);
      }, "image/jpeg", 0.92);
    } catch (e) {
      reject(e instanceof Error ? e : new Error("toBlob falló"));
    }
  });
}

/** P0.5 (finding 3 — informe-arquitectura-fluidez-2026-11-02 §4): ceder el
 *  hilo principal UN instante entre franjas del warp — `scheduler.yield()`
 *  (continuación user-visible) si existe; setTimeout 0 como fallback
 *  universal. Es lo que permite que el spinner del modal ANIME durante el
 *  bake (antes: 1-4 s de freeze síncrono por APLICAR/ROTAR). */
function cederUI(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } })
    .scheduler;
  if (typeof s?.yield === "function") return s.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Álgebra del warp proyectivo ────────────────────────────────────────────

/** Gauss-Jordan 8×8 con pivoteo parcial (sistema de la homografía).
 *  null = matriz singular (quad degenerado — la llamada lanza y el modal
 *  deja la foto como está, honesto). */
function resolver8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let f = col + 1; f < n; f++) {
      if (Math.abs(M[f][col]) > Math.abs(M[piv][col])) piv = f;
    }
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    const tmp = M[col];
    M[col] = M[piv];
    M[piv] = tmp;
    const d = M[col][col];
    for (let f = 0; f < n; f++) {
      if (f === col) continue;
      const k = M[f][col] / d;
      if (k === 0) continue;
      for (let c = col; c <= n; c++) M[f][c] -= k * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/** Homografía h que mapea PUNTOS DEL DESTINO (rect 0..W × 0..H) → FUENTE
 *  (quad en px naturales): cada píxel de salida consulta su píxel fuente.
 *  h33 = 1; 8 incógnitas resueltas por DLT de 4 correspondencias. */
function homografiaDestAQuad(
  dest: Array<{ x: number; y: number }>,
  src: Array<{ x: number; y: number }>,
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const u = dest[i].x;
    const v = dest[i].y;
    const x = src[i].x;
    const y = src[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const s = resolver8x8(A, b);
  if (!s) return null;
  return [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
}

/** Aplica la homografía h al punto (u,v) del destino → punto fuente. */
function aplicarH(
  h: number[],
  u: number,
  v: number,
): { x: number; y: number } {
  const w = h[6] * u + h[7] * v + 1;
  return {
    x: (h[0] * u + h[1] * v + h[2]) / w,
    y: (h[3] * u + h[4] * v + h[5]) / w,
  };
}

/** Afín (fuente→destino) ajustada a 3 pares de puntos — cada franja del
 *  render aproxima la homografía local con UNA affine (error O(alto de
 *  franja × perspectiva), invisible con franjas de ≤ 6px). Devuelve
 *  [a, b, c, d, e, f] para ctx.transform(a,b,c,d,e,f). */
function afinDe3(
  p: Array<{ x: number; y: number }>,
  q: Array<{ x: number; y: number }>,
): number[] | null {
  const p1x = p[0].x - p[2].x;
  const p1y = p[0].y - p[2].y;
  const p2x = p[1].x - p[2].x;
  const p2y = p[1].y - p[2].y;
  const det = p1x * p2y - p2x * p1y;
  if (Math.abs(det) < 1e-9) return null;
  const q1x = q[0].x - q[2].x;
  const q1y = q[0].y - q[2].y;
  const q2x = q[1].x - q[2].x;
  const q2y = q[1].y - q[2].y;
  const a = (q1x * p2y - q2x * p1y) / det;
  const c = (q2x * p1x - q1x * p2x) / det;
  const b = (q1y * p2y - q2y * p1y) / det;
  const d = (q2y * p1x - q1y * p2x) / det;
  return [
    a,
    b,
    c,
    d,
    q[2].x - a * p[2].x - c * p[2].y,
    q[2].y - b * p[2].x - d * p[2].y,
  ];
}

/**
 * APLICAR del editor — hornea el recorte PERSPECTIVA: el cuadrilátero
 * `quad` (% de la foto) se warpea a un rectángulo limpio (homografía
 * exacta renderizada por franjas afines) y sale JPEG dataURL (0.92 —
 * finding 4 del informe 2), igual que `recortarDataUrl`. El flujo del
 * modal (fotoProcesada + chip EDITADA) no cambia: solo CÓMO se marca el
 * área.
 * P0.5 (finding 3): el bucle de franjas CEDE el hilo cada FRANJAS_POR_LOTE
 * (y al cerrar presupuesto de ~12 ms) — el freeze de 1-4 s por APLICAR
 * desaparece: el spinner anima y el modal responde durante el bake.
 */
export async function hornearRecorteCuadrilatero(
  url: string,
  quad: QuadPct,
): Promise<{ url: string }> {
  const { loadImageMemo, canvasCon } = await import(
    "@/modules/digitalizador/lib/e14/image-utils"
  );
  const img = await loadImageMemo(url);
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!natW || !natH) throw new Error("imagen sin dimensiones");
  const px = (p: PuntoPct) => ({
    x: (clampPct(p.x) / 100) * natW,
    y: (clampPct(p.y) / 100) * natH,
  });
  const q = { tl: px(quad.tl), tr: px(quad.tr), br: px(quad.br), bl: px(quad.bl) };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  // Salida = tamaño medio de los pares de lados opuestos (tope 4096 — RAM).
  const W = Math.max(2, Math.min(4096, Math.round((dist(q.tl, q.tr) + dist(q.bl, q.br)) / 2)));
  const H = Math.max(2, Math.min(4096, Math.round((dist(q.tl, q.bl) + dist(q.tr, q.br)) / 2)));
  const h = homografiaDestAQuad(
    [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: H },
      { x: 0, y: H },
    ],
    [q.tl, q.tr, q.br, q.bl],
  );
  if (!h) throw new Error("quad degenerado");
  const cv = canvasCon(W, H);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("sin contexto 2d");
  ctx.imageSmoothingQuality = "high";
  // Render por franjas: la homografía de cada franja se aproxima con una
  // affine (3 pares) — con franjas de ≤ 6px el error es sub-pixel. Solape
  // de 1px anti-costuras.
  const dy = Math.max(2, Math.ceil(H / 240));
  // P0.5 — yield por franjas (presupuesto de frame: main < 10 ms/task).
  const FRANJAS_POR_LOTE = 8;
  let franjasDesdeCeda = 0;
  for (let y = 0; y < H; y += dy) {
    if (franjasDesdeCeda >= FRANJAS_POR_LOTE) {
      await cederUI();
      franjasDesdeCeda = 0;
    }
    franjasDesdeCeda += 1;
    const y2 = Math.min(H, y + dy);
    const s00 = aplicarH(h, 0, y);
    const s10 = aplicarH(h, W, y);
    const s01 = aplicarH(h, 0, y2);
    const m = afinDe3(
      [s00, s10, s01],
      [
        { x: 0, y },
        { x: W, y },
        { x: 0, y: y2 },
      ],
    );
    if (!m) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, W, y2 - y + 1);
    ctx.clip();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  return { url: await encodeJpeg(cv) };
}

// ─── DETECCIÓN AUTOMÁTICA (solo propone) ───────────────────────────────────

/** Mediana de un arreglo no vacío (los extremos por fila/columna pueden
 *  traer ruido de 1px — la mediana lo absorbe sin inventar nada). */
function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Umbral global de Otsu sobre el histograma de 256 bins del gris. */
function otsu(gris: Float32Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gris.length; i++) {
    const v = Math.min(255, Math.max(0, Math.round(gris[i])));
    hist[v] += 1;
  }
  const total = gris.length;
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaB = 0;
  let wB = 0;
  let mejor = 128;
  let mejorVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumaB += t * hist[t];
    const mB = sumaB / wB;
    const mF = (suma - sumaB) / wF;
    const varEntre = wB * wF * (mB - mF) * (mB - mF);
    if (varEntre > mejorVar) {
      mejorVar = varEntre;
      mejor = t;
    }
  }
  return mejor;
}

/**
 * DETECCIÓN AUTOMÁTICA — propone los 4 esquinas del documento con una
 * heurística de bordes en cliente (umbral de Otsu + polaridad papel/fondo
 * + bandas de extremos con mediana). SOLO PROPONE: el modal deja los
 * puntos editables y el supervisor confirma con APLICAR. Si el área
 * detectada es absurda (muy chica, llena, cóncava o sin papel en alguna
 * banda) devuelve `null` — el modal muestra el hint honesto y conserva
 * los puntos del supervisor.
 */
export async function detectarBordesDocumento(
  url: string,
): Promise<QuadPct | null> {
  try {
    const { analizarPixeles } = await import(
      "@/modules/digitalizador/lib/e14/image-utils"
    );
    const { data, ancho: w, alto: h } = await analizarPixeles(url, 220);
    if (w < 24 || h < 24) return null;
    const gris = new Float32Array(w * h);
    for (let i = 0, p = 0; i < gris.length; i++, p += 4) {
      gris[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    const umbral = otsu(gris);
    // Polaridad: el papel (documento) casi siempre es MÁS CLARO que el
    // fondo, pero se decide por dato — media del centro vs media del anillo
    // exterior (sin supuestos fijos).
    let sumaCentro = 0;
    let nCentro = 0;
    let sumaBorde = 0;
    let nBorde = 0;
    const rx = w * 0.12;
    const ry = h * 0.12;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = gris[y * w + x];
        if (x < rx || x > w - rx || y < ry || y > h - ry) {
          sumaBorde += v;
          nBorde += 1;
        } else {
          sumaCentro += v;
          nCentro += 1;
        }
      }
    }
    if (!nCentro || !nBorde) return null;
    const papelEsClaro = sumaCentro / nCentro >= sumaBorde / nBorde;
    const esPapel = (v: number) =>
      papelEsClaro ? v >= umbral : v < umbral;

    // Bandas de extremos (2–16% de cada lado) — medianas de los bordes del
    // papel por fila/columna → 4 esquinas (soportan perspectiva inclinada).
    const izqTop: number[] = [];
    const derTop: number[] = [];
    const izqBot: number[] = [];
    const derBot: number[] = [];
    const topIzq: number[] = [];
    const topDer: number[] = [];
    const botIzq: number[] = [];
    const botDer: number[] = [];
    const fTopA = Math.round(h * 0.02);
    const fTopB = Math.min(h - 1, Math.round(h * 0.16));
    const fBotA = Math.max(0, Math.round(h * 0.84));
    const fBotB = Math.min(h - 1, Math.round(h * 0.98));
    for (let y = fTopA; y <= fTopB; y++) {
      let primero = -1;
      let ultimo = -1;
      for (let x = 0; x < w; x++) {
        if (esPapel(gris[y * w + x])) {
          if (primero < 0) primero = x;
          ultimo = x;
        }
      }
      if (primero >= 0) {
        izqTop.push(primero);
        derTop.push(ultimo);
      }
    }
    for (let y = fBotA; y <= fBotB; y++) {
      let primero = -1;
      let ultimo = -1;
      for (let x = 0; x < w; x++) {
        if (esPapel(gris[y * w + x])) {
          if (primero < 0) primero = x;
          ultimo = x;
        }
      }
      if (primero >= 0) {
        izqBot.push(primero);
        derBot.push(ultimo);
      }
    }
    const cIzqA = Math.round(w * 0.02);
    const cIzqB = Math.min(w - 1, Math.round(w * 0.16));
    const cDerA = Math.max(0, Math.round(w * 0.84));
    const cDerB = Math.min(w - 1, Math.round(w * 0.98));
    for (let x = cIzqA; x <= cIzqB; x++) {
      let primero = -1;
      let ultimo = -1;
      for (let y = 0; y < h; y++) {
        if (esPapel(gris[y * w + x])) {
          if (primero < 0) primero = y;
          ultimo = y;
        }
      }
      if (primero >= 0) {
        topIzq.push(primero);
        botIzq.push(ultimo);
      }
    }
    for (let x = cDerA; x <= cDerB; x++) {
      let primero = -1;
      let ultimo = -1;
      for (let y = 0; y < h; y++) {
        if (esPapel(gris[y * w + x])) {
          if (primero < 0) primero = y;
          ultimo = y;
        }
      }
      if (primero >= 0) {
        topDer.push(primero);
        botDer.push(ultimo);
      }
    }
    if (
      !izqTop.length || !derTop.length || !izqBot.length || !derBot.length ||
      !topIzq.length || !topDer.length || !botIzq.length || !botDer.length
    ) {
      return null; // sin papel en alguna banda — no se inventa nada
    }
    const pctX = (v: number) => (v / w) * 100;
    const pctY = (v: number) => (v / h) * 100;
    const quad: QuadPct = {
      tl: { x: pctX(mediana(izqTop)), y: pctY(mediana(topIzq)) },
      tr: { x: pctX(mediana(derTop)), y: pctY(mediana(topDer)) },
      br: { x: pctX(mediana(derBot)), y: pctY(mediana(botDer)) },
      bl: { x: pctX(mediana(izqBot)), y: pctY(mediana(botIzq)) },
    };
    // ── Sanidad del área propuesta (nada absurdo pasa a la UI) ──
    const v = [quad.tl, quad.tr, quad.br, quad.bl];
    for (const p of v) {
      if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
    }
    // Área por shoelace (%² del frame de 100×100).
    let area2 = 0;
    for (let i = 0, j = 3; i < 4; j = i++) {
      area2 += v[j].x * v[i].y - v[i].x * v[j].y;
    }
    const areaPct = Math.abs(area2) / 2 / 100; // % del frame
    if (areaPct < 8 || areaPct > 99) return null;
    // Convexo y sin bordes cruzados: productos cruzados del mismo signo.
    let signo = 0;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const cx = v[i].x - v[j].x;
      const cy = v[i].y - v[j].y;
      const nx = v[(i + 1) % 4].x - v[i].x;
      const ny = v[(i + 1) % 4].y - v[i].y;
      const cruz = cx * ny - cy * nx;
      const s = cruz > 0 ? 1 : cruz < 0 ? -1 : 0;
      if (s === 0) return null;
      if (signo === 0) signo = s;
      else if (s !== signo) return null;
    }
    return quad;
  } catch {
    return null; // fallo honesto — el modal conserva los puntos
  }
}
