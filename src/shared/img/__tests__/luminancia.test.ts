/**
 * Test de PARIDAD R2 — src/shared/img/luminancia.ts contra las 6
 * implementaciones del §B2 #7 (referencias incrustadas; los sitios
 * originales no se editan — adopción pendiente del dueño en los puntos
 * BT.709 y en los hot loops enteros).
 */
import { describe, expect, test } from "bun:test";

import { luma, lumaBT709 } from "@/shared/img/luminancia";

/** Pixel RGBA sintético: 8 píxeles con R/G/B variados (A constante). */
function pixeles(): Uint8ClampedArray {
  const pares: Array<[number, number, number]> = [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [128, 128, 128],
    [200, 60, 30],
    [10, 240, 130],
  ];
  const data = new Uint8ClampedArray(pares.length * 4);
  pares.forEach(([r, g, b], p) => {
    data[p * 4] = r;
    data[p * 4 + 1] = g;
    data[p * 4 + 2] = b;
    data[p * 4 + 3] = 255;
  });
  return data;
}

describe("paridad luma BT.601 (canónica)", () => {
  test("≡ completitud.ts:194 ≡ image-utils.ts:254 (misma expresión float)", () => {
    // Referencias verbatim de los 2 sitios float BT.601.
    const data = pixeles();
    for (let p = 0; p < data.length / 4; p += 1) {
      const i = p * 4;
      // completitud.ts:194
      const refCompletitud = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // image-utils.ts:254 (idéntica)
      const refImageUtils = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      expect(luma(data, i)).toBe(refCompletitud);
      expect(luma(data, i)).toBe(refImageUtils);
    }
  });

  test("relación con la variante entera ÷1000|0 documentada (bridge:533)", () => {
    // scanner-core-bridge.ts:533 NO se extrae (hot loop con histograma); el
    // test fija su RELACIÓN con la canónica: mismos pesos, error entero ≤ 1.
    const data = pixeles();
    for (let p = 0; p < data.length / 4; p += 1) {
      const i = p * 4;
      const refBridge = ((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000) | 0;
      expect(Math.abs(luma(data, i) - refBridge)).toBeLessThanOrEqual(1);
    }
  });

  test("HALLAZGO fuera de alcance: la variante >>8 (orientacion-qr.ts:160,186) NO es una luma 0..255 — queda documentada, no unificada", () => {
    // (R·299 + G·587 + B·114) >> 8 divide por 256 (no por 1000): para blanco
    // puro da 996 — fuera del histograma de 256 bins (Uint32Array descarta
    // el write). Es el comportamiento VIGENTE del módulo (no se toca — zona
    // de otro agente / cambiarlo alteraría la ecualización); el test lo
    // congela como evidencia para el dueño.
    const blanco = new Uint8ClampedArray([255, 255, 255, 255]);
    expect((blanco[0] * 299 + blanco[1] * 587 + blanco[2] * 114) >> 8).toBeGreaterThan(255);
  });

  test("puros: negro → 0 · blanco → 255", () => {
    const negro = new Uint8ClampedArray([0, 0, 0, 255]);
    const blanco = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(luma(negro, 0)).toBe(0);
    expect(luma(blanco, 0)).toBeCloseTo(255, 6);
  });
});

describe("lumaBT709 — PENDIENTE DEL DUEÑO (integridad.ts:82 · qr-pixeles.ts:355)", () => {
  test("≡ expresión float de qr-pixeles.ts:355 (redondeo aparte)", () => {
    const data = pixeles();
    for (let p = 0; p < data.length / 4; p += 1) {
      const i = p * 4;
      // Referencia qr-pixeles.ts:355 — Math.round(0.2126r + 0.7152g + 0.0722b).
      const refQrPixeles = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      expect(Math.round(lumaBT709(data, i))).toBe(refQrPixeles);
    }
  });

  test("EXPECTED-DIFF documentado: 601 y 709 NO coinciden (decisión pendiente, no unificar sin medir)", () => {
    const rojo = new Uint8ClampedArray([255, 0, 0, 255]);
    const verde = new Uint8ClampedArray([0, 255, 0, 255]);
    const azul = new Uint8ClampedArray([0, 0, 255, 255]);
    // Pesos distintos → valores distintos en los 3 canales puros.
    expect(lumaBT709(rojo, 0)).not.toBe(luma(rojo, 0)); // 54.2 vs 76.2
    expect(lumaBT709(verde, 0)).not.toBe(luma(verde, 0)); // 182.4 vs 149.7
    expect(lumaBT709(azul, 0)).not.toBe(luma(azul, 0)); // 18.4 vs 29.1
  });
});
