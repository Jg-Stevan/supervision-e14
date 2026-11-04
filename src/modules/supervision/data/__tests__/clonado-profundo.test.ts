/**
 * CLONADO PROFUNDO en la frontera del repo tras M11 (R3) — reporte 02a
 * 🟡-1: `getMesasDePuesto` devolvía `{...m}` con `delegados` y
 * `transmision` (p1/p2 + alerta) ALIASADOS al singleton, y `clonarActa`
 * no clonaba `fotos` (ni `impresion`) — un mutador externo corrompía el
 * estado global / el documento histórico SIN RASTRO.
 *
 * Método: leer → mutar a fondo lo recibido → releer y comparar contra el
 * snapshot previo a la mutación. Si algún nivel sigue aliasado, la
 * relectura sale corrompida y el test lo delata.
 */
import { describe, expect, test } from "bun:test";

import { mockSupervisionRepository } from "@/modules/supervision/data/mock-repository";
import { ID_ENLACE_ROMA } from "@/modules/supervision/data/divipola-adapter";
import type { ActaMesa, FotoActa } from "@/modules/supervision/domain/acta";
import type { Mesa } from "@/modules/supervision/domain/types";

/** Snapshot inmutable para comparar tras la mutación. */
const clon = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

describe("getMesasDePuesto — clonado profundo (M11)", () => {
  test("mutar lo recibido a fondo NO corrompe el estado del repo", async () => {
    const primera = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_ROMA);
    expect(primera.length).toBe(8);
    const snapshot: Mesa[] = clon(primera);

    // Mutación PROFUNDA del objeto recibido (todos los niveles aliasables).
    const mutada = primera[0];
    mutada.delegados.p1 = "pendiente";
    mutada.delegados = { p1: "pendiente", p2: "pendiente" };
    mutada.transmision.p1.estado = "pendiente";
    mutada.transmision.p1 = { estado: "pendiente" };
    mutada.transmision.p2.alerta = "CORRUMPIDO";
    mutada.transmision.p2 = { estado: "pendiente" };
    mutada.estadoMesa = "COMPLETO";
    mutada.accionSugerida = "notificar";

    const releida = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_ROMA);
    expect(releida).toEqual(snapshot);
  }, 20_000);

  test("dos lecturas consecutivas son objetos independientes entre sí", async () => {
    const a = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_ROMA);
    const b = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_ROMA);
    const snapshotB: Mesa[] = clon(b);
    a[0].transmision.p2.alerta = "SOLO EN A";
    a[0].delegados.p1 = "pendiente";
    expect(b).toEqual(snapshotB);
  }, 20_000);
});

describe("getActaDeMesa — clonarActa profundo incluyendo fotos/impresión (M11)", () => {
  test("mutar acta + fotos + impresión NO corrompe el acta en caché", async () => {
    const acta = await mockSupervisionRepository.getActaDeMesa(ID_ENLACE_ROMA, "001");
    expect(acta).not.toBeNull();
    // El ancla Roma trae fotos reales (D44) + encabezado impreso verbatim.
    expect(acta?.fotos?.DELEGADOS?.length).toBeGreaterThan(0);
    expect(acta?.impresion).toBeDefined();
    const snapshot = clon(acta) as ActaMesa;

    // Mutación PROFUNDA: historial, formularios, fotos e impresión.
    const foto = acta?.fotos?.DELEGADOS?.[0] as FotoActa;
    acta!.historial[0].hora = "99:99 LOCAL";
    acta!.formularios.TRANSMISION[1].estado = "PENDIENTE";
    acta!.formularios.DELEGADOS[0].numero = 99;
    foto.archivo = "CORRUMPIDO.png";
    foto.alto = -1;
    acta!.impresion!.pais = "CORRUMPIDO";

    const releida = await mockSupervisionRepository.getActaDeMesa(ID_ENLACE_ROMA, "001");
    expect(releida).toEqual(snapshot);
  }, 20_000);

  test("fotos del acta: los objetos FotoActa NO están aliasados al loader", async () => {
    const a = await mockSupervisionRepository.getActaDeMesa(ID_ENLACE_ROMA, "001");
    const snapshot = clon(a) as ActaMesa;
    const foto = a?.fotos?.DELEGADOS?.[0] as FotoActa;
    expect(foto.archivo).toBeTruthy();
    foto.archivo = "ALIAS-TEST.png";
    const b = await mockSupervisionRepository.getActaDeMesa(ID_ENLACE_ROMA, "001");
    expect((b?.fotos?.DELEGADOS?.[0] as FotoActa).archivo).toBe(
      (snapshot.fotos!.DELEGADOS![0] as FotoActa).archivo
    );
    expect(b).toEqual(snapshot);
  }, 20_000);
});
