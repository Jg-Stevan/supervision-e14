/**
 * VALIDADOR domain/divipola.ts — fixtures corruptos y mensajes (R3 — red
 * de tests C1, reporte 02a §3 «Validación del adaptador es ejemplar»).
 *
 * El validador es la puerta del catálogo: ESTOS tests son el guard que
 * el adaptador deja de ser en runtime (C1 — los conteos del kit pasan a
 * TEST). Se fija el CONTRATO DE MENSAJES (con índice y valores recibidos)
 * porque la cuarentena D25 y la consola del demo los muestran verbatim.
 *
 * Fixtures construidos desde un registro VÁLIDO canónico (§2.1) — sin
 * tocar ningún JSON real.
 */
import { describe, expect, test } from "bun:test";

import {
  ErrorValidacionDivipola,
  validarCatalogoDivipola,
  validarRegistroDivipola,
  zonaParaUI,
  type RegistroDivipolaJson,
} from "@/modules/supervision/domain/divipola";

/** Registro válido canónico (forma EXACTA del derivado — 8 campos). */
const VALIDO: Record<string, unknown> = {
  idEnlace: "88_495_010_02",
  codigoDepartamento: "88",
  codigoMunicipio: "495",
  nombreMunicipio: "ITALIA",
  codigoZona: "010",
  codigoPuesto: "02",
  nombre: "Roma - Consulado",
  totalMesas: 8,
};

function variante(cambios: Record<string, unknown>): unknown {
  return { ...VALIDO, ...cambios };
}

function mensajeDe(bruto: unknown, indice = 0): string {
  try {
    validarRegistroDivipola(bruto, indice);
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorValidacionDivipola);
    return (error as Error).message;
  }
  throw new Error("se esperaba ErrorValidacionDivipola y no se lanzó");
}

describe("validarRegistroDivipola — registro válido (§2.1)", () => {
  test("acepta el registro canónico y lo devuelve idéntico", () => {
    const esperado: RegistroDivipolaJson = {
      idEnlace: "88_495_010_02",
      codigoDepartamento: "88",
      codigoMunicipio: "495",
      nombreMunicipio: "ITALIA",
      codigoZona: "010",
      codigoPuesto: "02",
      nombre: "Roma - Consulado",
      totalMesas: 8,
    };
    expect(validarRegistroDivipola(VALIDO, 0)).toEqual(esperado);
  });
});

describe("validarRegistroDivipola — campos EXACTOS (sin extras ni faltantes)", () => {
  test("campo extra → error que lista esperados y recibidos", () => {
    const mensaje = mensajeDe(variante({ nivel: "EXTERIOR" }));
    expect(mensaje).toContain("registro [0]");
    expect(mensaje).toContain("campos exactos");
    expect(mensaje).toContain("nivel");
  });

  test("campo faltante → error", () => {
    const sinNombre = { ...VALIDO } as Record<string, unknown>;
    delete sinNombre.nombre;
    const mensaje = mensajeDe(sinNombre);
    expect(mensaje).toContain("campos exactos");
  });
});

describe("validarRegistroDivipola — códigos STRING con ancho fijo (2/3/3/2)", () => {
  test("código como NUMBER (495) → error «debe ser 3 dígitos como string»", () => {
    const mensaje = mensajeDe(variante({ codigoMunicipio: 495 }));
    expect(mensaje).toContain("codigoMunicipio");
    expect(mensaje).toContain("3 dígitos como string");
    expect(mensaje).toContain("495");
  });

  test("ancho incorrecto («4955») → error", () => {
    const mensaje = mensajeDe(variante({ codigoMunicipio: "4955" }));
    expect(mensaje).toContain("codigoMunicipio");
  });

  test("ancho de depto («8») → error de 2 dígitos", () => {
    const mensaje = mensajeDe(variante({ codigoDepartamento: "8" }));
    expect(mensaje).toContain("codigoDepartamento");
    expect(mensaje).toContain("2 dígitos como string");
  });

  test("zona y puesto con ancho incorrecto → error", () => {
    expect(mensajeDe(variante({ codigoZona: "1" }))).toContain("codigoZona");
    expect(mensajeDe(variante({ codigoPuesto: "002" }))).toContain(
      "codigoPuesto"
    );
  });
});

describe("validarRegistroDivipola — congruencia idEnlace ↔ segmentos (D22)", () => {
  test("idEnlace incongruente → error con esperado y recibido", () => {
    const mensaje = mensajeDe(
      variante({ idEnlace: "88_495_010_09", codigoPuesto: "02" })
    );
    expect(mensaje).toContain("incongruente");
    expect(mensaje).toContain("88_495_010_09");
    expect(mensaje).toContain('esperado "88_495_010_02"');
  });
});

describe("validarRegistroDivipola — totalMesas y nombres", () => {
  test("totalMesas 0 / fraccional / string → «entero ≥ 1»", () => {
    expect(mensajeDe(variante({ totalMesas: 0 }))).toContain("entero ≥ 1");
    expect(mensajeDe(variante({ totalMesas: 1.5 }))).toContain("entero ≥ 1");
    expect(mensajeDe(variante({ totalMesas: "8" }))).toContain("entero ≥ 1");
  });

  test("nombreMunicipio vacío y nombre vacío → error", () => {
    expect(mensajeDe(variante({ nombreMunicipio: "  " }))).toContain(
      "nombreMunicipio vacío"
    );
    expect(mensajeDe(variante({ nombre: "" }))).toContain("nombre vacío");
  });
});

describe("validarRegistroDivipola — forma del dato", () => {
  test("null / array / string → «no es un objeto»", () => {
    expect(mensajeDe(null)).toContain("no es un objeto");
    expect(mensajeDe([VALIDO])).toContain("no es un objeto");
    expect(mensajeDe("88_495_010_02")).toContain("no es un objeto");
  });

  test("el índice del registro culpable va en el mensaje", () => {
    expect(mensajeDe(variante({ totalMesas: 0 }), 731)).toContain(
      "registro [731]"
    );
  });
});

describe("validarCatalogoDivipola — unicidad de idEnlace (D22)", () => {
  test("duplicado → error con AMBOS índices", () => {
    try {
      validarCatalogoDivipola([VALIDO, variante({ nombre: "Otra sede" })]);
      throw new Error("no se lanzó");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorValidacionDivipola);
      const mensaje = (error as Error).message;
      expect(mensaje).toContain("duplicado");
      expect(mensaje).toContain("88_495_010_02");
      expect(mensaje).toContain("[1]");
      expect(mensaje).toContain("[0]");
    }
  });

  test("catálogo sin duplicados pasa completo", () => {
    const registros = validarCatalogoDivipola([
      VALIDO,
      variante({
        idEnlace: "88_335_005_02",
        codigoMunicipio: "335",
        nombreMunicipio: "EGIPTO",
        codigoZona: "005",
        nombre: "El Cairo - Consulado",
      }),
    ]);
    expect(registros.length).toBe(2);
  });
});

describe("zonaParaUI — «sin ceros a la izquierda» (§2.1)", () => {
  test('"010" → "10" · "000" → "0" · "123" → "123"', () => {
    expect(zonaParaUI("010")).toBe("10");
    expect(zonaParaUI("000")).toBe("0");
    expect(zonaParaUI("123")).toBe("123");
  });
});
