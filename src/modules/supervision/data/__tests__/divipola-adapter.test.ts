/**
 * ADAPTADOR DIVIPOLA tras C1 (R3) — Result en vez de throw.
 *
 * C1 (reporte 02a 🔴-3): `CARGAR_CATALOGO()` lanzaba (y `mock-repository`
 * la llamaba AL IMPORTAR el módulo) → cualquier desviación del catálogo
 * era un white-screen en el arranque. Desde C1:
 * · `prepararCatalogoDivipola` es PURA y devuelve Result (testeable aquí
 *   con fixtures, sin tocar el JSON real);
 * · los conteos del kit (949/67/3.670) y los registros de control son
 *   ADVERTENCIA, no guard de runtime (el guard vive en
 *   catalogo-divipola.test.ts);
 * · SOLO lo estructural BLOQUEA: registros malformados, idEnlace
 *   duplicados/incongruentes, guardrail de tamaño > 1.500.
 */
import { describe, expect, test } from "bun:test";

import {
  cargarCatalogoDivipola,
  prepararCatalogoDivipola,
  ID_ENLACE_ROMA,
} from "@/modules/supervision/data/divipola-adapter";

/** Registro válido canónico (8 campos — §2.1). */
function registroValido(i: number): Record<string, unknown> {
  const mun = String((i % 999) + 1).padStart(3, "0");
  const puesto = String((i % 99) + 1).padStart(2, "0");
  return {
    idEnlace: `88_${mun}_010_${puesto}`,
    codigoDepartamento: "88",
    codigoMunicipio: mun,
    nombreMunicipio: `PAIS ${i}`,
    codigoZona: "010",
    codigoPuesto: puesto,
    nombre: `Puesto ${i}`,
    totalMesas: 1,
  };
}

/** Captura console.warn sin filtrar el ruido al resto de la suite. */
function conWarnCapturado<T>(fn: () => T): { resultado: T; warns: string[] } {
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (...partes: unknown[]) => {
    warns.push(partes.map(String).join(" "));
  };
  try {
    return { resultado: fn(), warns };
  } finally {
    console.warn = original;
  }
}

describe("prepararCatalogoDivipola — Result, jamás throw (C1)", () => {
  test("estructura corrupta → ok:false con motivo BLOQUEADA (no lanza)", () => {
    const { resultado } = conWarnCapturado(() =>
      prepararCatalogoDivipola([
        registroValido(0),
        registroValido(1),
        { ...registroValido(2), totalMesas: 0 }, // estructural: entero ≥ 1
      ])
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("se esperaba BLOQUEADA");
    expect(resultado.motivo.startsWith("BLOQUEADA: validación del catálogo (")).toBe(true);
    expect(resultado.motivo).toContain("registro [2]");
    expect(resultado.motivo).toContain("entero ≥ 1");
  });

  test("idEnlace duplicado → ok:false BLOQUEADA (estructural, D22)", () => {
    const duplicado = registroValido(3);
    const { resultado } = conWarnCapturado(() =>
      prepararCatalogoDivipola([registroValido(0), duplicado, duplicado])
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("se esperaba BLOQUEADA");
    expect(resultado.motivo).toContain("duplicado");
  });

  test("guardrail de tamaño > 1.500 → ok:false BLOQUEADA (estructural, §2.4)", () => {
    const demasiados = Array.from({ length: 1_501 }, (_, i) => registroValido(i));
    const { resultado } = conWarnCapturado(() =>
      prepararCatalogoDivipola(demasiados)
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("se esperaba BLOQUEADA");
    expect(resultado.motivo).toContain("demasiado grande");
    expect(resultado.motivo).toContain("1501 > 1500");
  });
});

describe("prepararCatalogoDivipola — conteos del kit: ADVERTIR y arrancar (C1)", () => {
  test("catálogo pequeño estructuralmente válido → ok:true con advertencias", () => {
    const { resultado, warns } = conWarnCapturado(() =>
      prepararCatalogoDivipola([registroValido(0), registroValido(1)])
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("se esperaba ok");
    expect(resultado.catalogo.length).toBe(2);
    expect(resultado.catalogo.every((r) => r.nivel === "EXTERIOR")).toBe(true);
    // Desviación de conteos → advertencia (el guard es TEST desde C1).
    expect(warns.some((w) => w.includes("registros: 2 ≠ 949"))).toBe(true);
    expect(warns.some((w) => w.includes("países: 2 ≠ 67"))).toBe(true);
    expect(warns.some((w) => w.includes("mesas totales: 2 ≠ 3670"))).toBe(true);
    // Registros de control ausentes → advertencia, no bloqueo.
    expect(warns.some((w) => w.includes("registros de control ausentes"))).toBe(true);
  });

  test("catálogo vacío estructuralmente válido → ok:true vacío (arranca en 0)", () => {
    const { resultado, warns } = conWarnCapturado(() =>
      prepararCatalogoDivipola([])
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("se esperaba ok");
    expect(resultado.catalogo).toEqual([]);
    expect(warns.some((w) => w.includes("registros: 0 ≠ 949"))).toBe(true);
  });

  test("ancla Roma desviada (totalMesas ≠ 8) → advertencia con el id", () => {
    const { resultado, warns } = conWarnCapturado(() =>
      prepararCatalogoDivipola([
        { ...registroValido(0), idEnlace: ID_ENLACE_ROMA, codigoMunicipio: "495", codigoPuesto: "02", nombreMunicipio: "ITALIA", nombre: "Roma - Consulado", totalMesas: 4 },
      ])
    );
    expect(resultado.ok).toBe(true);
    expect(
      warns.some((w) => w.includes(`ancla Roma ${ID_ENLACE_ROMA}`) && w.includes("≠ 8"))
    ).toBe(true);
  });
});

describe("cargarCatalogoDivipola — JSON real: ok:true y memoizado (D12)", () => {
  test("el derivado exterior real pasa y queda canónico", () => {
    const primera = cargarCatalogoDivipola();
    expect(primera.ok).toBe(true);
    if (!primera.ok) throw new Error("se esperaba ok con el JSON real");
    expect(primera.catalogo.length).toBe(949);
    expect(primera.catalogo.every((r) => r.nivel === "EXTERIOR")).toBe(true);
    const ids = primera.catalogo.map((r) => r.idEnlace);
    expect([...ids].sort().join()).toEqual(ids.join()); // ordenado por idEnlace
    // Memoizada: misma instancia (una sola prep).
    expect(cargarCatalogoDivipola()).toBe(primera);
  });
});
