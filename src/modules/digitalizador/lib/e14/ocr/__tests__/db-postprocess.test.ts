/**
 * R7c — TESTS DE CARACTERIZACIÓN del postproceso DB de detección
 * (db-postprocess.ts — transcripción literal del bloque "Post det
 * (DBPostProcess en JS puro)" + pasos 1-4 de `inferDet` de ocr/rapidocr.ts).
 *
 * FIJAN el comportamiento observable ANTES de que `inferDet` (rapidocr.ts)
 * delegue en el módulo puro (patrón R7a: tests commiteados ANTES del
 * refactor; orden garantizado por git log). El original NO es invocable
 * headless (vive inline en una función async de ORT con canvas) — la
 * transcripción es byte a byte con origen citado en la cabecera del módulo
 * y el cableado se verifica con diff + tsc (mismo residual honesto que R7a
 * declaró para los logs del pipeline).
 *
 * Casos de borde incluidos: descarte por ruido (<10 px), por lado mínimo
 * (MIN_SIDE_DESCARTAR), por score (DB_BOX_THRESH), tope de candidatos
 * (DB_MAX_CANDIDATES), orden de cajas (sorted_boxes + solapamiento <10 px),
 * mapeo inverso (ratios + padTop + clamp) y pureza (sin mutación,
 * determinismo).
 */

import { describe, expect, test } from "bun:test";
import {
  DB_MAX_CANDIDATES,
  DB_THRESH,
  boxScoreFast,
  convexHull,
  dbPostprocess,
  esquinasRect,
  mapearAFuente,
  minAreaRect,
  ordenarCajas,
  type OpsDet,
} from "../db-postprocess";

// ── fixtures ─────────────────────────────────────────────────────────────

const OPS_IDENTIDAD: OpsDet = {
  w: 64,
  h: 64,
  ratioW: 1,
  ratioH: 1,
  padTop: 0,
  ratioWDet: 1,
  ratioHDet: 1,
};

/** pred plano pw×ph con un bloque rectángulo [col0..col1]×[fila0..fila1]
 *  al valor `v` (resto 0). */
function predConBloque(
  pw: number,
  ph: number,
  col0: number,
  col1: number,
  fila0: number,
  fila1: number,
  v: number,
): Float32Array {
  const pred = new Float32Array(pw * ph);
  for (let y = fila0; y <= fila1; y++) {
    for (let x = col0; x <= col1; x++) pred[y * pw + x] = v;
  }
  return pred;
}

// ── convexHull ───────────────────────────────────────────────────────────

describe("caracterización · db-postprocess (transcripción del DBPostProcess de rapidocr)", () => {
  describe("convexHull (monotone chain)", () => {
    test("cuadrado con punto interior → solo las 4 esquinas (orden lower+upper)", () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 2, y: 2 }, // interior — no aporta
      ];
      expect(convexHull(pts)).toEqual([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]);
    });

    test("menos de 3 puntos → copia de la entrada (misma forma, otra referencia)", () => {
      const pts = [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ];
      const hull = convexHull(pts);
      expect(hull).toEqual(pts);
      expect(hull).not.toBe(pts);
    });

    test("no muta la entrada", () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 2 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ];
      const copia = structuredClone(pts);
      convexHull(pts);
      expect(pts).toEqual(copia);
    });
  });

  // ── minAreaRect ────────────────────────────────────────────────────────

  describe("minAreaRect (barrido de aristas)", () => {
    test("cuadrado alineado a ejes → centro, lados y theta=0 exactos", () => {
      const rect = minAreaRect([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]);
      expect(rect).toEqual({ cx: 2, cy: 2, w: 4, h: 4, theta: 0 });
    });

    test("rombo 45° → w=h=√2, theta=-π/4, centro (1,1)", () => {
      const rect = minAreaRect([
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ]);
      expect(rect).not.toBeNull();
      expect(rect!.w).toBeCloseTo(Math.SQRT2, 10);
      expect(rect!.h).toBeCloseTo(Math.SQRT2, 10);
      expect(rect!.theta).toBeCloseTo(-Math.PI / 4, 10);
      expect(rect!.cx).toBeCloseTo(1, 10);
      expect(rect!.cy).toBeCloseTo(1, 10);
    });

    test("hull < 2 puntos → null · 2 puntos → rect degenerado de altura 0", () => {
      expect(minAreaRect([{ x: 1, y: 1 }])).toBeNull();
      const rect = minAreaRect([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ]);
      expect(rect).toEqual({ cx: 2, cy: 0, w: 4, h: 0, theta: 0 });
    });
  });

  // ── boxScoreFast ───────────────────────────────────────────────────────

  describe("boxScoreFast (media dentro del quad)", () => {
    const predUniforme = new Float32Array(100).fill(0.8);

    test("quad 3×3 dentro de pred uniforme 0.8 → 0.8 (celdas [2,5)×[2,5))", () => {
      const score = boxScoreFast(predUniforme, 10, 10, [
        { x: 2, y: 2 },
        { x: 5, y: 2 },
        { x: 5, y: 5 },
        { x: 2, y: 5 },
      ]);
      expect(score).toBeCloseTo(0.8, 7); // 0.8 en Float32 ≈ 0.8000000119
    });

    test("quad fuera del pred (bordes clampados a la imagen) → 0", () => {
      const score = boxScoreFast(predUniforme, 10, 10, [
        { x: 20, y: 20 },
        { x: 25, y: 20 },
        { x: 25, y: 25 },
        { x: 20, y: 25 },
      ]);
      expect(score).toBe(0);
    });

    test("quad degenerado (un solo punto repetido) → 0 (sin celdas)", () => {
      const p = { x: 3, y: 3 };
      expect(boxScoreFast(predUniforme, 10, 10, [p, p, p, p])).toBe(0);
    });
  });

  // ── esquinasRect ───────────────────────────────────────────────────────

  describe("esquinasRect (convención get_mini_boxes)", () => {
    test("orden TL,TR,BR,BL para theta=0", () => {
      expect(esquinasRect({ cx: 5, cy: 6, w: 4, h: 2, theta: 0 })).toEqual([
        { x: 3, y: 5 },
        { x: 7, y: 5 },
        { x: 7, y: 7 },
        { x: 3, y: 7 },
      ]);
    });
  });

  // ── ordenarCajas ───────────────────────────────────────────────────────

  describe("ordenarCajas (sorted_boxes estándar)", () => {
    const caja = (x: number, y: number) => [
      { x, y },
      { x: x + 10, y },
      { x: x + 10, y: y + 10 },
      { x, y: y + 10 },
    ];

    test("orden principal por y superior, empate por x", () => {
      const ordenadas = ordenarCajas([caja(50, 100), caja(20, 100), caja(0, 10)]);
      expect(ordenadas.map((b) => b[0])).toEqual([
        { x: 0, y: 10 },
        { x: 20, y: 100 },
        { x: 50, y: 100 },
      ]);
    });

    test("solapamiento vertical < 10 px → orden por x (insert estabilizado)", () => {
      const A = caja(200, 100); // y=100, x=200
      const B = caja(50, 105); // y=105 (Δy=5 <10), x=50
      const ordenadas = ordenarCajas([A, B]);
      expect(ordenadas[0][0]).toEqual({ x: 50, y: 105 });
      expect(ordenadas[1][0]).toEqual({ x: 200, y: 100 });
    });

    test("sin solapamiento (Δy ≥ 10) → NO reordena por x", () => {
      const A = caja(200, 100);
      const B = caja(50, 115);
      const ordenadas = ordenarCajas([A, B]);
      expect(ordenadas[0][0]).toEqual({ x: 200, y: 100 });
      expect(ordenadas[1][0]).toEqual({ x: 50, y: 115 });
    });
  });

  // ── mapearAFuente ──────────────────────────────────────────────────────

  describe("mapearAFuente (inversa de las ops + clamp)", () => {
    test("ops identidad → redondeo del punto", () => {
      expect(mapearAFuente({ x: 10.4, y: 10.6 }, OPS_IDENTIDAD, 64, 64)).toEqual({ x: 10, y: 11 });
    });

    test("ratios del det-preprocess y del preprocess + padTop → inversa secuencial", () => {
      const ops: OpsDet = {
        w: 64,
        h: 64,
        ratioW: 0.5,
        ratioH: 0.5,
        padTop: 4,
        ratioWDet: 0.5,
        ratioHDet: 0.5,
      };
      // xPostPad = 10/0.5 = 20 · yPostPad = 10/0.5 − 4 = 16 · ÷ratio → (40, 32)
      expect(mapearAFuente({ x: 10, y: 10 }, ops, 128, 128)).toEqual({ x: 40, y: 32 });
    });

    test("clamp a los bordes de la FUENTE (0..srcW / 0..srcH)", () => {
      expect(mapearAFuente({ x: -10, y: 500 }, OPS_IDENTIDAD, 64, 64)).toEqual({ x: 0, y: 64 });
    });
  });

  // ── dbPostprocess (pasos 1-4, end-to-end sobre pred sintético) ─────────

  describe("dbPostprocess end-to-end (pred sintético)", () => {
    test("bloque 20×10 al 0.9 → 1 caja con esquinas EXACTAS (dilate+unclip)", () => {
      // blob cols 20-39, filas 20-29 → dilate: cols 20-40, filas 20-30 (21×11 px)
      // rect geométrico: cx=30 cy=25 w=20 h=10 (ancho = max−min, NO nº píxeles)
      // score 180/220 = 0.818 ≥ 0.5 · unclip d=(200·1.6)/60=5.333 → 30.67×20.67
      const pred = predConBloque(64, 64, 20, 39, 20, 29, 0.9);
      const { boxesFuente, nBoxes } = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(nBoxes).toBe(1);
      expect(boxesFuente).toEqual([
        [
          { x: 15, y: 15 },
          { x: 45, y: 15 },
          { x: 45, y: 35 },
          { x: 15, y: 35 },
        ],
      ]);
    });

    test("pred vacío (todo 0) → 0 cajas · nBoxes=0", () => {
      const { boxesFuente, nBoxes } = dbPostprocess(
        new Float32Array(64 * 64),
        64,
        64,
        OPS_IDENTIDAD,
        64,
        64,
      );
      expect(boxesFuente).toEqual([]);
      expect(nBoxes).toBe(0);
    });

    test("ruido: blob 2×2 → dilate 3×3 = 9 px < 10 → descartado", () => {
      const pred = predConBloque(64, 64, 30, 31, 30, 31, 0.9);
      const { boxesFuente, nBoxes } = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(nBoxes).toBe(0);
      expect(boxesFuente).toEqual([]);
    });

    test("bloque mínimo que SOBREVIVE: 3×4 al 0.9 (dilate 4×5 px → rect 3×4, score 0.72)", () => {
      const pred = predConBloque(64, 64, 30, 32, 30, 33, 0.9);
      const { boxesFuente, nBoxes } = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(nBoxes).toBe(1);
      expect(boxesFuente).toEqual([
        [
          { x: 29, y: 29 },
          { x: 34, y: 29 },
          { x: 34, y: 35 },
          { x: 29, y: 35 },
        ],
      ]);
    });

    test("DB_BOX_THRESH: blob grande al 0.4 (binariza > 0.3, score 0.33 < 0.5) → descartado", () => {
      const pred = predConBloque(64, 64, 20, 29, 20, 29, 0.4);
      const { boxesFuente, nBoxes } = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(nBoxes).toBe(0);
      expect(boxesFuente).toEqual([]);
    });

    test("MIN_SIDE_DESCARTAR: línea 1×10 (rect dilate 10×1, sside=1 < 3) → descartada", () => {
      const pred = predConBloque(64, 64, 20, 29, 20, 20, 0.9);
      const { boxesFuente, nBoxes } = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(nBoxes).toBe(0);
      expect(boxesFuente).toEqual([]);
    });

    test("dos bloques separados → 2 cajas ordenadas por y superior (ordenarCajas)", () => {
      const pred = predConBloque(64, 64, 20, 39, 5, 14, 0.9);
      for (let y = 40; y <= 49; y++) {
        for (let x = 20; x <= 39; x++) pred[y * 64 + x] = 0.9;
      }
      const { boxesFuente, nBoxes } = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(nBoxes).toBe(2);
      expect(boxesFuente).toEqual([
        [
          { x: 15, y: 0 }, // y TL: 10−10.333 = −0.333 → round −0 → clamp 0
          { x: 45, y: 0 },
          { x: 45, y: 20 },
          { x: 15, y: 20 },
        ],
        [
          { x: 15, y: 35 },
          { x: 45, y: 35 },
          { x: 45, y: 55 },
          { x: 15, y: 55 },
        ],
      ]);
    });

    test("mapeo inverso con ratioWDet/HDet=0.5 → coords de la fuente al doble", () => {
      const pred = predConBloque(64, 64, 20, 39, 20, 29, 0.9);
      const ops: OpsDet = { ...OPS_IDENTIDAD, ratioWDet: 0.5, ratioHDet: 0.5 };
      const { boxesFuente } = dbPostprocess(pred, 64, 64, ops, 128, 128);
      expect(boxesFuente).toEqual([
        [
          { x: 29, y: 29 },
          { x: 91, y: 29 },
          { x: 91, y: 71 },
          { x: 29, y: 71 },
        ],
      ]);
    });

    test("padTop del letterbox se invierte (resta antes del ratio principal)", () => {
      const pred = predConBloque(64, 64, 20, 39, 25, 34, 0.9); // blob 5 filas más abajo
      const ops: OpsDet = { ...OPS_IDENTIDAD, padTop: 5 };
      const { boxesFuente } = dbPostprocess(pred, 64, 64, ops, 64, 64);
      // idéntico al caso base: la −padTop compensa el desplazamiento del blob
      expect(boxesFuente).toEqual([
        [
          { x: 15, y: 15 },
          { x: 45, y: 15 },
          { x: 45, y: 35 },
          { x: 15, y: 35 },
        ],
      ]);
    });

    test(`tope de candidatos: rejilla de 1024 blobs → nBoxes=${DB_MAX_CANDIDATES}`, () => {
      // blobs 4×4 al 0.9 con paso 8 → 32×32 = 1024 componentes > 1000
      const pw = 256;
      const ph = 256;
      const pred = new Float32Array(pw * ph);
      for (let by = 0; by < 32; by++) {
        for (let bx = 0; bx < 32; bx++) {
          for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) pred[(by * 8 + y) * pw + bx * 8 + x] = 0.9;
          }
        }
      }
      const ops: OpsDet = { ...OPS_IDENTIDAD, w: 256, h: 256 };
      const { boxesFuente, nBoxes } = dbPostprocess(pred, pw, ph, ops, 256, 256);
      expect(nBoxes).toBe(DB_MAX_CANDIDATES);
      expect(boxesFuente.length).toBe(DB_MAX_CANDIDATES);
    });

    test("pureza: no muta `pred` · misma entrada dos veces → salida idéntica", () => {
      const pred = predConBloque(64, 64, 20, 39, 20, 29, 0.9);
      const copia = new Float32Array(pred);
      const a = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      const b = dbPostprocess(pred, 64, 64, OPS_IDENTIDAD, 64, 64);
      expect(pred).toEqual(copia);
      expect(a).toEqual(b);
    });

    test("constante del umbral de binarización expuesta (0.3 — documentación QA)", () => {
      expect(DB_THRESH).toBe(0.3);
    });
  });
});
