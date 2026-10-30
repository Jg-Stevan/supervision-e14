/**
 * INVARIANTES DEL CATÁLOGO DIVIPOLA exterior (R3 — red de tests C1,
 * reporte docs/revision-v1/02a-supervision-dominio-datos.md §2 y §8):
 * · 949 puestos · 67 países (municipios) · Σ 3.670 mesas;
 * · depto "88" = CONSULADOS en TODOS los registros;
 * · idEnlace únicos y congruentes con sus segmentos;
 * · registros de control (§2.1): primera punta / ancla Roma / última punta.
 *
 * PARIDAD: los números se verifican contra la ÚNICA fuente legítima en
 * código (`divipola-exterior.json`, 8 campos sin `nivel`) pasada por el
 * validador estricto del dominio (`domain/divipola.ts:78-181`).
 *
 * REGLA D21/D22: el MAESTRO `divipola-puestos.json` JAMÁS se importa en
 * código — este test tampoco (verificado con Grep; solo el derivado
 * exterior entra aquí).
 */
import { describe, expect, test } from "bun:test";

import datosBrutos from "@/modules/supervision/data/divipola-exterior.json";
import {
  validarCatalogoDivipola,
  type RegistroDivipolaJson,
} from "@/modules/supervision/domain/divipola";

// ─── Números esperados del kit (SUP-5 §2.4 / D21) ───────────────────────────

const ESPERADO_REGISTROS = 949;
const ESPERADO_PAISES = 67;
const ESPERADO_MESAS = 3_670;

/** Registros de control (divipola-adapter.ts:41-44): las 3 puntas del
 * archivo ordenado + el ancla demo Roma (§2.3). */
const CONTROL_PRIMERO = "88_115_005_02"; // Accra Consulado (GHANA)
const ANCLA_ROMA = "88_495_010_02"; // Roma - Consulado (ITALIA, 8 mesas)
const CONTROL_ULTIMO = "88_815_065_86"; // SABADO SAN CRISTÓBAL (VENEZUELA)

/** Catálogo validado UNA vez para toda la suite (puro dominio, sin I/O). */
const REGISTROS: RegistroDivipolaJson[] = validarCatalogoDivipola(
  datosBrutos as unknown[]
);

describe("catálogo DIVIPOLA exterior — invariantes del kit (§2.4)", () => {
  test("el derivado exterior pasa la validación estructural estricta", () => {
    // validarCatalogoDivipola lanza si un solo registro falla: llegar aquí
    // YA prueba campos exactos, anchos fijos y congruencia idEnlace.
    expect(REGISTROS.length).toBe(ESPERADO_REGISTROS);
  });

  test("949 puestos — exacto (kit §2.4)", () => {
    expect(REGISTROS.length).toBe(949);
  });

  test("67 países (municipios únicos) — exacto", () => {
    const paises = new Set(REGISTROS.map((r) => r.nombreMunicipio));
    expect(paises.size).toBe(ESPERADO_PAISES);
  });

  test("Σ totalMesas = 3.670 — exacto", () => {
    const mesas = REGISTROS.reduce((suma, r) => suma + r.totalMesas, 0);
    expect(mesas).toBe(ESPERADO_MESAS);
  });

  test('depto "88" = CONSULADOS en TODOS los registros (exterior)', () => {
    const ajenos = REGISTROS.filter((r) => r.codigoDepartamento !== "88");
    expect(ajenos).toEqual([]);
  });

  test("idEnlace únicos: 949 claves distintas (join D22)", () => {
    const ids = REGISTROS.map((r) => r.idEnlace);
    expect(new Set(ids).size).toBe(ESPERADO_REGISTROS);
  });

  test("totalMesas entre 1 y 159 (rango exterior documentado, §2.1)", () => {
    const fuera = REGISTROS.filter((r) => r.totalMesas < 1 || r.totalMesas > 159);
    expect(fuera).toEqual([]);
  });

  test("ancla demo Roma 88_495_010_02 con totalMesas: 8 (§2.3)", () => {
    const roma = REGISTROS.find((r) => r.idEnlace === ANCLA_ROMA);
    expect(roma?.nombre).toBe("Roma - Consulado");
    expect(roma?.nombreMunicipio).toBe("ITALIA");
    expect(roma?.totalMesas).toBe(8);
  });

  test("registros de control: primera y última punta del orden por idEnlace", () => {
    const ordenados = [...REGISTROS].sort((a, b) =>
      a.idEnlace < b.idEnlace ? -1 : a.idEnlace > b.idEnlace ? 1 : 0
    );
    expect(ordenados[0].idEnlace).toBe(CONTROL_PRIMERO);
    expect(ordenados[ordenados.length - 1].idEnlace).toBe(CONTROL_ULTIMO);
  });
});
