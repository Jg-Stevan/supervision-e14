/**
 * E3 (Ola E) — equivalencia de `marcasEsquina` con la lectura por REGIONES.
 *
 * La ruta nueva lee SOLO las 4 regiones de esquina (expandidas por 2·sMax)
 * en vez del canvas completo. La tesis es que el resultado es IDÉNTICO: toda
 * ventana evaluada (núcleo y anillo) queda contenida en su región, así que el
 * clamp de la media coincide con el de la imagen.
 *
 * El stub de canvas implementa solo lo que la función usa: `getImageData`
 * sobre un buffer real (los píxeles de la "foto" son datos, no una imagen
 * sintética de medición — este test verifica IGUALDAD de dos rutas, no
 * precisión sobre actas).
 */
import { describe, expect, it } from "bun:test";
import { marcasEsquina } from "../src/dominio/integridad";

type Pixel = readonly [number, number, number];

const BLANCO: Pixel = [255, 255, 255];
const NEGRO: Pixel = [10, 10, 10];

function canvasDe(
  w: number,
  h: number,
  pinta: (x: number, y: number) => Pixel,
): HTMLCanvasElement {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = pinta(x, y);
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: (x: number, y: number, sw: number, sh: number) => {
        const out = new Uint8ClampedArray(sw * sh * 4);
        for (let yy = 0; yy < sh; yy += 1) {
          for (let xx = 0; xx < sw; xx += 1) {
            const s = ((y + yy) * w + (x + xx)) * 4;
            const d = (yy * sw + xx) * 4;
            out[d] = px[s]!;
            out[d + 1] = px[s + 1]!;
            out[d + 2] = px[s + 2]!;
            out[d + 3] = px[s + 3]!;
          }
        }
        return { data: out };
      },
    }),
  } as unknown as HTMLCanvasElement;
}

/** Acta con las 4 marcas fiduciales (cuadrado de ~3 %W en §0-F1): permite
 *  omitir una para simular un recorte de esa esquina. */
function actaConMarcas(w: number, h: number, omitir?: "tl" | "tr" | "bl" | "br") {
  const lado = Math.max(8, Math.round(w * 0.03));
  const marcas = {
    tl: { x0: Math.round(w * 0.04), y0: Math.round(h * 0.025) },
    tr: { x0: Math.round(w * 0.965) - lado, y0: Math.round(h * 0.025) },
    bl: { x0: Math.round(w * 0.04), y0: Math.round(h * 0.975) - lado },
    br: { x0: Math.round(w * 0.965) - lado, y0: Math.round(h * 0.975) - lado },
  } as const;
  return canvasDe(w, h, (x, y) => {
    for (const k of ["tl", "tr", "bl", "br"] as const) {
      if (k === omitir) continue;
      const m = marcas[k];
      if (x >= m.x0 && x < m.x0 + lado && y >= m.y0 && y < m.y0 + lado) return NEGRO;
    }
    return BLANCO;
  });
}

function ambasRutas(c: HTMLCanvasElement) {
  return {
    completa: marcasEsquina(c),
    regiones: marcasEsquina(c, { porRegiones: true }),
  };
}

describe("E3 · marcasEsquina por regiones == canvas completo", () => {
  it("4 marcas presentes → idéntico (y todas presentes)", () => {
    const c = actaConMarcas(600, 900);
    const { completa, regiones } = ambasRutas(c);
    expect(completa).toEqual({ tl: true, tr: true, bl: true, br: true });
    expect(regiones).toEqual(completa);
  });

  it("esquina recortada → idéntico (y esa esquina falsa)", () => {
    for (const omitir of ["tl", "tr", "bl", "br"] as const) {
      const { completa, regiones } = ambasRutas(actaConMarcas(600, 900, omitir));
      expect(completa).not.toBeNull();
      expect(completa![omitir]).toBe(false);
      expect(regiones).toEqual(completa);
    }
  });

  it("texto/barras oscuras: el anillo las descarta en ambas rutas", () => {
    const c = canvasDe(600, 900, (x, y) => {
      // "renglones" oscuros de 3 px en el tercio superior e inferior.
      const renglon = y % 24 < 3 && (y < 90 || y > 810);
      return renglon && x > 100 && x < 500 ? NEGRO : BLANCO;
    });
    const { completa, regiones } = ambasRutas(c);
    expect(completa).toEqual({ tl: false, tr: false, bl: false, br: false });
    expect(regiones).toEqual(completa);
  });

  it("ruido determinista: ambas rutas devuelven lo mismo", () => {
    let semilla = 123456789;
    const rnd = () => {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
      return semilla % 256;
    };
    const c = canvasDe(400, 600, () => {
      const v = rnd();
      return [v, v, v] as const;
    });
    const { completa, regiones } = ambasRutas(c);
    expect(regiones).toEqual(completa);
  });

  it("canvas por debajo del mínimo → null en ambas rutas", () => {
    expect(marcasEsquina(canvasDe(79, 300, () => BLANCO))).toBeNull();
    expect(marcasEsquina(canvasDe(300, 119, () => BLANCO), { porRegiones: true })).toBeNull();
  });
});
