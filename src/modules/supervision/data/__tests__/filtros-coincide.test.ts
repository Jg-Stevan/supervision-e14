/**
 * CONTRATO DE FILTROS del repo tras M3 (R3) — reporte 02a 🔴-1.
 *
 * `FiltrosPuestos.cierreCol/tiempo` (types.ts:140-145) estaban declarados
 * pero NO implementados en `coincide()` (mock-repository.ts:683-705):
 * quien pasara el contrato completo obtenía SILENCIOSAMENTE otro
 * resultado. Desde M3 `coincide()` los implementa con la MISMA semántica
 * que la referencia de la capa vista (monitor-global.tsx:68-72):
 * · cierreCol → igualdad exacta de `horaCierreColombia`;
 * · tiempo    → `tramoDeMinutos(minutosDesdeCierre).id`.
 *
 * ADOPCIÓN PENDIENTE (R4): el único consumidor (datos-provider) sigue
 * llamando `getPuestos()` SIN filtros y monitor-global re-filtra en
 * cliente; el contrato del repo queda sano — el lado UI es de R4 (pr.md).
 */
import { describe, expect, test } from "bun:test";

import {
  mockSupervisionRepository,
} from "@/modules/supervision/data/mock-repository";
import { TRAMOS_TIEMPO, tramoDeMinutos } from "@/modules/supervision/domain/tiempo-cierre";
import type { FiltrosPuestos, Puesto } from "@/modules/supervision/domain/types";

/** Referencia verbatim de monitor-global.tsx:68-72 (capa vista, zona R4). */
function refMonitores(p: Puesto, filtros: FiltrosPuestos): boolean {
  if (filtros.cierreCol && p.horaCierreColombia !== filtros.cierreCol) return false;
  if (
    filtros.tiempo &&
    tramoDeMinutos(p.minutosDesdeCierre).id !== filtros.tiempo
  ) {
    return false;
  }
  return true;
}

describe("coincide() — cierreCol (M3: antes ignorado)", () => {
  test("filtro por hora de cierre COL: exacto y NO vacío", async () => {
    const todos = await mockSupervisionRepository.getPuestos();
    const filtrados = await mockSupervisionRepository.getPuestos({
      cierreCol: "9:00 AM",
    });
    expect(filtrados.length).toBeGreaterThan(0);
    expect(filtrados.length).toBeLessThan(todos.length);
    expect(filtrados.every((p) => p.horaCierreColombia === "9:00 AM")).toBe(true);
    // Paridad con la referencia de la capa vista (monitor-global).
    const esperados = todos.filter((p) =>
      refMonitores(p, { cierreCol: "9:00 AM" })
    );
    expect(filtrados.map((p) => p.id)).toEqual(esperados.map((p) => p.id));
  }, 20_000);
});

describe("coincide() — tiempo (M3: antes ignorado)", () => {
  test("filtro por tramo '>3': todos con transcurrido ≥ 180 min", async () => {
    const filtrados = await mockSupervisionRepository.getPuestos({ tiempo: ">3" });
    expect(filtrados.length).toBeGreaterThan(0);
    expect(
      filtrados.every((p) => tramoDeMinutos(p.minutosDesdeCierre).id === ">3")
    ).toBe(true);
  }, 20_000);

  test("filtro por tramo '<1': todos con transcurrido < 60 min", async () => {
    const filtrados = await mockSupervisionRepository.getPuestos({ tiempo: "<1" });
    expect(filtrados.length).toBeGreaterThan(0);
    expect(
      filtrados.every((p) => tramoDeMinutos(p.minutosDesdeCierre).id === "<1")
    ).toBe(true);
  }, 20_000);

  test("los 4 tramos PARTICIONAN el catálogo (suma = 949, sin solapes)", async () => {
    let suma = 0;
    for (const tramo of TRAMOS_TIEMPO) {
      const filtrados = await mockSupervisionRepository.getPuestos({
        tiempo: tramo.id,
      });
      expect(
        filtrados.every((p) => tramoDeMinutos(p.minutosDesdeCierre).id === tramo.id)
      ).toBe(true);
      suma += filtrados.length;
    }
    expect(suma).toBe(949);
  }, 30_000);

  test("id de tramo desconocido → 0 resultados (sin crash)", async () => {
    const filtrados = await mockSupervisionRepository.getPuestos({ tiempo: "4-5" });
    expect(filtrados).toEqual([]);
  }, 20_000);
});

describe("coincide() — combinación y compatibilidad (M3)", () => {
  test("combinación cierreCol + tiempo = intersección (paridad con la vista)", async () => {
    const todos = await mockSupervisionRepository.getPuestos();
    const filtros: FiltrosPuestos = { cierreCol: "10:00 AM", tiempo: "1-2" };
    const filtrados = await mockSupervisionRepository.getPuestos(filtros);
    const esperados = todos.filter((p) => refMonitores(p, filtros));
    expect(filtrados.map((p) => p.id)).toEqual(esperados.map((p) => p.id));
  }, 20_000);

  test("sin filtros y con filtros vacíos → los 949 (sin regresión)", async () => {
    const sinFiltros = await mockSupervisionRepository.getPuestos();
    const vacios = await mockSupervisionRepository.getPuestos({});
    expect(sinFiltros.length).toBe(949);
    expect(vacios.length).toBe(949);
  }, 20_000);
});
