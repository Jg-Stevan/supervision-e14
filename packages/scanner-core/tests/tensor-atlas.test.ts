/**
 * E3 (Ola E) — equivalencia del ATLAS del tensor del rec/cls.
 *
 * Con `atlasTensorOcr` ON, `tensorDeCanvases` pinta el lote entero en un único
 * lienzo y hace UNA lectura; con OFF hace una lectura por canvas (la ruta de
 * hoy). El tensor float32 resultante tiene que ser BYTE-IDÉNTICO: la ruta del
 * atlas solo cambia DÓNDE se lee, no qué se lee.
 *
 * Stub mínimo de canvas (drawImage 1:1 + getImageData sobre el buffer real) y
 * de `ort.Tensor` — este test compara dos rutas del mismo código, no mide
 * precisión del motor.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { configurarPlan } from "../src/dominio/plan";
import { tensorDeCanvases } from "../src/ocr/rapidocr";

class LienzoFake {
  private _w = 0;
  private _h = 0;
  pix = new Uint8ClampedArray(0);
  private ctx: Record<string, unknown> | null = null;

  get width() {
    return this._w;
  }
  set width(v: number) {
    this._w = v;
    this.redimensionar();
  }
  get height() {
    return this._h;
  }
  set height(v: number) {
    this._h = v;
    this.redimensionar();
  }

  private redimensionar(): void {
    this.pix = new Uint8ClampedArray(Math.max(0, this._w) * Math.max(0, this._h) * 4);
  }

  getContext(): Record<string, unknown> {
    if (this.ctx) return this.ctx;
    // Arrow functions: `this` sigue siendo el lienzo (método, no callback).
    this.ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: (src: LienzoFake, dx: number, dy: number, dw?: number, dh?: number) => {
        const sw = src.width;
        const sh = src.height;
        // El test solo ejercita la rama nearest: copias 1:1.
        if ((dw !== undefined && dw !== sw) || (dh !== undefined && dh !== sh)) {
          throw new Error("stub: solo copias 1:1");
        }
        for (let y = 0; y < sh; y += 1) {
          for (let x = 0; x < sw; x += 1) {
            const s = (y * sw + x) * 4;
            const tx = dx + x;
            const ty = dy + y;
            if (tx < 0 || ty < 0 || tx >= this._w || ty >= this._h) continue;
            const d = (ty * this._w + tx) * 4;
            this.pix[d] = src.pix[s]!;
            this.pix[d + 1] = src.pix[s + 1]!;
            this.pix[d + 2] = src.pix[s + 2]!;
            this.pix[d + 3] = src.pix[s + 3]!;
          }
        }
      },
      getImageData: (x: number, y: number, w: number, h: number) => {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy += 1) {
          for (let xx = 0; xx < w; xx += 1) {
            const s = ((y + yy) * this._w + (x + xx)) * 4;
            const d = (yy * w + xx) * 4;
            out[d] = this.pix[s]!;
            out[d + 1] = this.pix[s + 1]!;
            out[d + 2] = this.pix[s + 2]!;
            out[d + 3] = this.pix[s + 3]!;
          }
        }
        return { data: out };
      },
    };
    return this.ctx;
  }
}

class TensorFake {
  constructor(
    readonly type: string,
    readonly data: Float32Array,
    readonly dims: number[],
  ) {}
}

const ort = { Tensor: TensorFake } as unknown as Parameters<typeof tensorDeCanvases>[0];

function lienzoCon(w: number, h: number, semilla: number): LienzoFake {
  const c = new LienzoFake();
  c.width = w;
  c.height = h;
  let s = semilla;
  for (let i = 0; i < c.pix.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    c.pix[i] = s % 256;
    c.pix[i + 1] = (s >> 8) % 256;
    c.pix[i + 2] = (s >> 16) % 256;
    c.pix[i + 3] = 255;
  }
  return c;
}

const LIENZOS = [lienzoCon(40, 30, 7), lienzoCon(25, 50, 11), lienzoCon(61, 20, 13)];

function activarAtlas(on: boolean): void {
  configurarPlan({ atlasTensorOcr: () => on });
}

describe("E3 · atlas del tensor == una lectura por canvas", () => {
  beforeAll(() => {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => new LienzoFake(),
    };
  });
  beforeEach(() => activarAtlas(false));
  afterAll(() => {
    configurarPlan({ atlasTensorOcr: undefined });
  });

  it("lote nearest: el tensor es idéntico byte a byte", () => {
    const canvases = LIENZOS as unknown as HTMLCanvasElement[];
    activarAtlas(false);
    const sin = tensorDeCanvases(ort, canvases, 100, 16) as unknown as TensorFake;
    activarAtlas(true);
    const con = tensorDeCanvases(ort, canvases, 100, 16) as unknown as TensorFake;
    expect(con.dims).toEqual(sin.dims);
    expect(Array.from(con.data)).toEqual(Array.from(sin.data));
  });

  it("lote de una sola línea: también idéntico", () => {
    const canvases = [LIENZOS[1]!] as unknown as HTMLCanvasElement[];
    activarAtlas(false);
    const sin = tensorDeCanvases(ort, canvases, 80, 12) as unknown as TensorFake;
    activarAtlas(true);
    const con = tensorDeCanvases(ort, canvases, 80, 12) as unknown as TensorFake;
    expect(Array.from(con.data)).toEqual(Array.from(sin.data));
  });

  it("atlas apagado por defecto: plan sin la opción no usa el atlas", () => {
    configurarPlan({ atlasTensorOcr: undefined });
    const canvases = LIENZOS as unknown as HTMLCanvasElement[];
    const t = tensorDeCanvases(ort, canvases, 100, 16) as unknown as TensorFake;
    expect(t.dims).toEqual([3, 3, 16, 100]);
  });
});
