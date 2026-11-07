/**
 * F-HEIC-TOPE — `dimensionesHeic` lee el tamaño de un HEIC SIN decodificarlo,
 * caminando ISO-BMFF hasta `meta → iprp → ipco → ispe`. Es el guardabarros que
 * evita despachar a libheif un archivo de 50 MP que no termina nunca (medido:
 * 12 MP tarda 6 913 ms; 50 MP muere en el watchdog de 120 s del puente).
 *
 * El test NO usa un HEIC real: se arma el contenedor byte a byte. Así queda
 * determinístico, corre en el entorno `node` del harness del motor (sin DOM) y
 * prueba lo que de verdad importa: que las dimensiones se lean bien Y que ante
 * la duda devuelva null — porque un falso positivo rechazaría el acta de un
 * puesto que funciona.
 */
import { describe, test, expect } from "bun:test";
import { dimensionesHeic, HEIC_TOPE_MP_DEFECTO } from "../image-processor";

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const tipo = (t: string): number[] => [...t].map((c) => c.charCodeAt(0));

/** Caja con contenido ya serializado. */
const caja = (t: string, cuerpo: number[]): number[] => [...u32(8 + cuerpo.length), ...tipo(t), ...cuerpo];

/** `ispe`: versión+flags (4) + ancho (4) + alto (4). */
const ispe = (w: number, h: number): number[] => caja("ispe", [0, 0, 0, 0, ...u32(w), ...u32(h)]);

const ftypHeic = (): number[] => caja("ftyp", [...tipo("heic"), ...u32(0), ...tipo("mif1"), ...tipo("heic")]);

const heic = (ListaDeIspe: Array<[number, number]>): Uint8Array => {
  const ipco = caja("ipco", ListaDeIspe.flatMap(([w, h]) => ispe(w, h)));
  const iprp = caja("iprp", ipco);
  const meta = caja("meta", [0, 0, 0, 0, ...iprp]); // full box: versión+flags antes de los hijos
  return new Uint8Array([...ftypHeic(), ...meta]);
};

describe("dimensionesHeic — olfateo del contenedor ISO-BMFF", () => {
  test("lee la imagen primaria del contenedor", () => {
    expect(dimensionesHeic(heic([[4032, 3024]]))).toEqual({ ancho: 4032, alto: 3024 });
  });

  test("toma la MAYOR cuando el contenedor trae miniatura además", () => {
    // Orden inverso al tamaño: la miniatura aparece primero en ipco en los
    // archivos reales (es el ítem auxiliar), y aún así no debe mandar.
    const bytes = heic([[512, 384], [4032, 3024], [1920, 1080]]);
    expect(dimensionesHeic(bytes)).toEqual({ ancho: 4032, alto: 3024 });
  });

  test("un 12 MP real queda DEBAJO del tope default (no se rechaza nada)", () => {
    const d = dimensionesHeic(heic([[4032, 3024]]))!;
    expect((d.ancho * d.alto) / 1e6).toBeLessThan(HEIC_TOPE_MP_DEFECTO);
  });

  test("un 50 MP pasa el tope default (ese es el archivo que colgaba el decode)", () => {
    const d = dimensionesHeic(heic([[8160, 6120]]))!;
    expect((d.ancho * d.alto) / 1e6).toBeGreaterThan(HEIC_TOPE_MP_DEFECTO);
  });

  test("respeta la caja de 64 bits (largesize)", () => {
    const ipco = caja("ipco", ispe(4032, 3024));
    const iprp = caja("iprp", ipco);
    const cuerpoMeta = [0, 0, 0, 0, ...iprp]; // versión+flags antes de los hijos
    // size(=1) + 'meta' + largesize de 64 bits (palabra alta en ceros) + cuerpo
    const conLargesize = [...u32(1), ...tipo("meta"), 0, 0, 0, 0, ...u32(16 + cuerpoMeta.length), ...cuerpoMeta];
    const bytes = new Uint8Array([...ftypHeic(), ...conLargesize]);
    expect(dimensionesHeic(bytes)).toEqual({ ancho: 4032, alto: 3024 });
  });

  test("null si no es ISO-BMFF (JPEG): el guardabarros no interfiere en la ruta buena", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...u32(16), ...tipo("JFIF"), ...new Array(300).fill(0)]);
    expect(dimensionesHeic(jpeg)).toBeNull();
  });

  test("null si el `ftyp` está pero no hay `meta` legible (nunca rechazar a ciegas)", () => {
    const bytes = new Uint8Array([...ftypHeic(), ...new Array(64).fill(0)]);
    expect(dimensionesHeic(bytes)).toBeNull();
  });

  test("null con una caja cuyo tamaño desborda el buffer (archivo podrido)", () => {
    const ipco = caja("ipco", ispe(4032, 3024));
    const iprp = caja("iprp", ipco);
    const meta = [...u32(99999), ...tipo("meta"), 0, 0, 0, 0, ...iprp];
    expect(dimensionesHeic(new Uint8Array([...ftypHeic(), ...meta]))).toBeNull();
  });

  test("null si el ispe declare dimensiones fuera de rango físico", () => {
    expect(dimensionesHeic(heic([[2, 2]]))).toBeNull();
    expect(dimensionesHeic(heic([[99999, 99999]]))).toBeNull();
  });

  test("null con un buffer corto (menos de la cabecera ftyp)", () => {
    expect(dimensionesHeic(new Uint8Array([0, 0, 0, 8, ...tipo("ftyp")]))).toBeNull();
  });
});
