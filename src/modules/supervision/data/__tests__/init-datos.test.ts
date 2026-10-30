/**
 * initSupervisionDatos() tras C1 (R3) — inicialización explícita, sin
 * efecto de import.
 *
 * C1 (reporte 02a 🔴-3): antes, `mock-repository.ts:226` sembraba los
 * 949 puestos AL IMPORTAR el módulo y `CARGAR_CATALOGO()` lanzaba si el
 * catálogo desviaba → white-screen. Desde C1:
 * · importar `mock-repository` NO carga nada ni puede lanzar (la prueba
 *   es esta misma suite: importar el módulo aquí y en
 *   mock-determinismo.test.ts no rompe nada);
 * · `initSupervisionDatos()` siembra EXPLÍCITAMENTE y devuelve Result;
 * · las lecturas del repo siembran perezosamente (`asegurarDatos()`) —
 *   compatibilidad con datos-provider (zona R4, adopción explícita
 *   pendiente: documentado en pr.md).
 *
 * Nota honesta: bun reutiliza la instancia de módulo entre archivos de
 * test (sin `isolate`), así que NO se puede re-ejecutar el import para
 * "demostrar" el no-lanzamiento en el mismo proceso — la garantía real
 * es que el módulo no tiene ningún statement top-level que lance y que
 * `initSupervisionDatos` captura el fallo del catálogo como Result.
 */
import { describe, expect, test } from "bun:test";

import {
  initSupervisionDatos,
  mockSupervisionRepository,
} from "@/modules/supervision/data/mock-repository";

describe("initSupervisionDatos — Result explícito e idempotente (C1)", () => {
  test("siembra el catálogo completo: 949 puestos · 67 países · 3.670 mesas", () => {
    const resultado = initSupervisionDatos();
    expect(resultado).toEqual({
      ok: true,
      puestos: 949,
      paises: 67,
      mesas: 3_670,
    });
  });

  test("segunda llamada: idempotente (memoizada — D12)", () => {
    const primera = initSupervisionDatos();
    const segunda = initSupervisionDatos();
    expect(segunda).toEqual(primera);
  });

  test("el repo queda servible tras la inicialización (compat datos-provider)", async () => {
    const puestos = await mockSupervisionRepository.getPuestos();
    expect(puestos.length).toBe(949);
    const notificaciones = await mockSupervisionRepository.getNotificaciones();
    expect(notificaciones.length).toBe(7); // semillas T5 intactas
    const anomalias = await mockSupervisionRepository.getAnomalias();
    expect(anomalias.length).toBe(7); // semillas T6 intactas
  }, 20_000);
});
