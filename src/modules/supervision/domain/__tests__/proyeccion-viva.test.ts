/**
 * PROYECCIÓN EN VIVA bajo el RELOJ REAL (ronda «reloj real») — pruebas.
 *
 * Fija el contrato del dueño:
 *  · el ESTADO del puesto cambia con el reloj real: NO INICIADO antes de
 *    las 16:00 del país emisor · PENDIENTE en curso · CRITICO > 3 hrs;
 *  · un COMPLETO jamás se degrada ni cambia su horario sembrado;
 *  · el ancla Roma (relojFijo) queda intacta (kit §4.9);
 *  · un puesto que aún no cierra muestra pcts en 0 (no ha recibido nada);
 *  · `ahora === 0` (SSR/pre-hidratación) devuelve el puesto intacto;
 *  · la identidad es estable si nada visible cambió (memo de filas).
 *
 * Determinista: epochs fijos alrededor del cierre de una zona fija.
 */
import { describe, expect, test } from "bun:test";

import { proyectarPuesto, estadoGlobalEnVivo } from "../proyeccion-viva";
import { instanteCierreDeJornada } from "../reloj-jornada";
import type { Puesto } from "../types";

const ZONA = "Asia/Tokyo";
const CIERRE = instanteCierreDeJornada(ZONA, "DOMINGO", Date.UTC(2026, 5, 21, 12, 0, 0));

function puestoBase(overrides: Partial<Puesto> = {}): Puesto {
  return {
    id: "88_489_001_01",
    codigoPais: "489",
    pais: "JAPON",
    zonaId: "001",
    zona: "1",
    puesto: "01 - Tokio - Consulado",
    numeroMesas: 2,
    horaCierreColombia: "1:00 AM",
    horaActualLocal: "5:00 PM",
    minutosDesdeCierre: 60,
    diferenciaTiempo: "1-2 hrs",
    pctDelegado: 40,
    pctTransmision: 30,
    estadoGlobal: "PENDIENTE",
    zonaEmisor: ZONA,
    diaJornada: "DOMINGO",
    ...overrides,
  };
}

describe("estadoGlobalEnVivo — el estado cambia con el reloj", () => {
  test("min < 0 → NO_INICIADO (aún no son las 16:00 del emisor)", () => {
    expect(estadoGlobalEnVivo("PENDIENTE", -5)).toBe("NO_INICIADO");
    expect(estadoGlobalEnVivo("CRITICO", -300)).toBe("NO_INICIADO");
  });

  test("0 ≤ min < 180 → PENDIENTE (en curso; el color fino lo da el TIEMPO)", () => {
    expect(estadoGlobalEnVivo("PENDIENTE", 0)).toBe("PENDIENTE");
    expect(estadoGlobalEnVivo("CRITICO", 90)).toBe("PENDIENTE");
    expect(estadoGlobalEnVivo("NO_INICIADO", 179)).toBe("PENDIENTE");
  });

  test("min ≥ 180 → CRITICO (umbral del dueño)", () => {
    expect(estadoGlobalEnVivo("PENDIENTE", 180)).toBe("CRITICO");
    expect(estadoGlobalEnVivo("NO_INICIADO", 2_000)).toBe("CRITICO");
  });

  test("COMPLETO jamás se degrada", () => {
    expect(estadoGlobalEnVivo("COMPLETO", -500)).toBe("COMPLETO");
    expect(estadoGlobalEnVivo("COMPLETO", 999)).toBe("COMPLETO");
  });
});

describe("proyectarPuesto — reloj real por puesto", () => {
  test("antes del cierre: NO INICIADO + pcts en 0 (no ha recibido nada)", () => {
    const proyectado = proyectarPuesto(puestoBase(), CIERRE - 30 * 60_000);
    expect(proyectado.estadoGlobal).toBe("NO_INICIADO");
    expect(proyectado.minutosDesdeCierre).toBe(-30);
    expect(proyectado.diferenciaTiempo).toBe("NO INICIADO");
    expect(proyectado.pctDelegado).toBe(0);
    expect(proyectado.pctTransmision).toBe(0);
    expect(proyectado.horaActualLocal).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  test("90 min después del cierre: PENDIENTE + pcts sembrados intactos", () => {
    const proyectado = proyectarPuesto(puestoBase(), CIERRE + 90 * 60_000);
    expect(proyectado.estadoGlobal).toBe("PENDIENTE");
    expect(proyectado.minutosDesdeCierre).toBe(90);
    expect(proyectado.pctDelegado).toBe(40);
    expect(proyectado.pctTransmision).toBe(30);
  });

  test("200 min después del cierre: CRITICO automático", () => {
    const proyectado = proyectarPuesto(puestoBase(), CIERRE + 200 * 60_000);
    expect(proyectado.estadoGlobal).toBe("CRITICO");
    expect(proyectado.minutosDesdeCierre).toBe(200);
    expect(proyectado.diferenciaTiempo).toBe("> 3 hrs");
  });

  test("COMPLETO: historia sembrada intacta pero CIERRE COL real del emisor", () => {
    const base = puestoBase({
      estadoGlobal: "COMPLETO",
      minutosDesdeCierre: 75,
      horaCierreColombia: "1:00 AM",
      horaActualLocal: "2:15 AM",
    });
    const proyectado = proyectarPuesto(base, Date.UTC(2026, 5, 21, 12, 0, 0));
    // Estado, pcts y transcurrido sembrados SIN cambios (historia):
    expect(proyectado.estadoGlobal).toBe("COMPLETO");
    expect(proyectado.minutosDesdeCierre).toBe(75);
    expect(proyectado.pctDelegado).toBe(40);
    // Cierre COL REAL de Tokio (16:00 JST = 2:00 AM COL) y hora local
    // coherente con la historia (cierre real + 75 min = 5:15 PM JST):
    expect(proyectado.horaCierreColombia).toBe("2:00 AM");
    expect(proyectado.horaActualLocal).toBe("5:15 PM");
    // Segunda llamada: identidad estable (cierre ya alineado).
    expect(proyectarPuesto(proyectado, Date.UTC(2026, 5, 21, 12, 0, 0))).toBe(proyectado);
  });

  test("ancla relojFijo (Roma): jamás se proyecta (kit §4.9)", () => {
    const roma = puestoBase({
      relojFijo: true,
      horaActualLocal: "7:08 PM",
      minutosDesdeCierre: 188,
      estadoGlobal: "CRITICO",
    });
    expect(proyectarPuesto(roma, CIERRE + 5 * 60_000)).toBe(roma);
  });

  test("ahora === 0 (SSR): sin proyección, puesto sembrado intacto", () => {
    const base = puestoBase();
    expect(proyectarPuesto(base, 0)).toBe(base);
  });

  test("identidad estable si nada visible cambió (memo de filas)", () => {
    const ahora = CIERRE + 120 * 60_000;
    const proyectado = proyectarPuesto(puestoBase(), ahora);
    expect(proyectarPuesto(proyectado, ahora + 20_000)).toBe(proyectado);
  });

  test("la hora mostrada es la REAL del país emisor (no la sembrada)", () => {
    const proyectado = proyectarPuesto(
      puestoBase({ horaActualLocal: "3:33 AM" }),
      CIERRE + 61 * 60_000
    );
    // 16:00 JST + 61 min = 17:01 → "5:01 PM".
    expect(proyectado.horaActualLocal).toBe("5:01 PM");
  });
});
