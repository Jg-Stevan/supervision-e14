/**
 * M13 (R3) — dedupe de la validación D25 y de las reglas de derivación.
 *
 * · `validarJoinDivipola` (data/validacion-d25.ts): ÚNICO validador del
 *   join (a)/(b) contra el catálogo — antes duplicado con la MISMA
 *   redacción de motivo en actas-reales.ts:249-267 ≈
 *   actas-runtime.ts:126-178. La redacción es CONTRATO (log de recepción
 *   y bandeja de cuarentena la muestran verbatim) — aquí se congela.
 * · `delegadosAcreditados` (n/16) y `ciudadDePuesto`: export canónico en
 *   domain/acta.ts — vivían en data/actas-mock.ts:58,271 y RE-definidas
 *   en components/actas/documento-e14.tsx:31-45 (el lado documento-e14 lo
 *   adopta R4; la referencia verbatim de abajo congela la paridad).
 */
import { describe, expect, test } from "bun:test";

import { validarJoinDivipola } from "@/modules/supervision/data/validacion-d25";
import {
  delegadosAcreditados,
  ciudadDePuesto,
} from "@/modules/supervision/domain/acta";
import {
  delegadosAcreditados as delegadosAcreditadosMock,
  ciudadDePuesto as ciudadDePuestoMock,
} from "@/modules/supervision/data/actas-mock";
import type { Mesa, Puesto } from "@/modules/supervision/domain/types";

const ROMA = "88_495_010_02"; // 8 mesas
const CAIRO = "88_335_005_02"; // 1 mesa
const INEXISTENTE = "99_999_999_99";

describe("validarJoinDivipola — puertas (a)/(b) de D25 (motivo o null)", () => {
  test("join válido → null (Roma 001 y 008 dentro de sus 8 mesas)", () => {
    expect(validarJoinDivipola(ROMA, "001")).toBeNull();
    expect(validarJoinDivipola(ROMA, "008")).toBeNull();
    expect(validarJoinDivipola(CAIRO, "001")).toBeNull();
  });

  test("(a) idEnlace ausente — redacción CONGELADA (contrato del log)", () => {
    expect(validarJoinDivipola(INEXISTENTE, "001")).toBe(
      `(a) idEnlace "${INEXISTENTE}" ausente en el catálogo DIVIPOLA`
    );
  });

  test("(b) mesa fuera de rango — redacción CONGELADA con totalMesas real", () => {
    expect(validarJoinDivipola(ROMA, "009")).toBe(
      "(b) mesa 009 fuera de rango (totalMesas: 8)"
    );
    expect(validarJoinDivipola(CAIRO, "002")).toBe(
      "(b) mesa 002 fuera de rango (totalMesas: 1)"
    );
  });

  test("(b) también para mesa 0, negativa y no numérica (NaN)", () => {
    expect(validarJoinDivipola(ROMA, "0")).toContain("(b) mesa 0 fuera de rango");
    expect(validarJoinDivipola(ROMA, "-1")).toContain(
      "(b) mesa -1 fuera de rango"
    );
    expect(validarJoinDivipola(ROMA, "abc")).toContain(
      "(b) mesa abc fuera de rango"
    );
  });
});

describe("delegadosAcreditados — regla n/16 canónica (domain/acta.ts)", () => {
  function mesaCon(p1: Mesa["delegados"]["p1"], p2: Mesa["delegados"]["p1"]): Mesa {
    return {
      id: "001",
      delegados: { p1, p2 },
      transmision: {
        p1: { estado: "ok" },
        p2: { estado: "ok" },
      },
      estadoMesa: "EN_PROCESO",
      ultimaCarga: null,
      accionSugerida: "notificar",
    };
  }

  test("2 partes ok → 16 · 1 → 8 · 0 → 0 (kit §2.3)", () => {
    expect(delegadosAcreditados(mesaCon("ok", "ok"))).toBe(16);
    expect(delegadosAcreditados(mesaCon("ok", "pendiente"))).toBe(8);
    expect(delegadosAcreditados(mesaCon("pendiente", "ok"))).toBe(8);
    expect(delegadosAcreditados(mesaCon("pendiente", "pendiente"))).toBe(0);
  });

  /** Referencia verbatim de documento-e14.tsx:31-35 (adopción pendiente R4). */
  const refDocumentoE14 = (mesa: Mesa): number => {
    const ok =
      (mesa.delegados.p1 === "ok" ? 1 : 0) + (mesa.delegados.p2 === "ok" ? 1 : 0);
    return ok * 8;
  };

  test("paridad con la copia local de documento-e14 (R4 la adoptará)", () => {
    const casos: Mesa[] = [
      mesaCon("ok", "ok"),
      mesaCon("ok", "pendiente"),
      mesaCon("pendiente", "pendiente"),
    ];
    for (const mesa of casos) {
      expect(delegadosAcreditados(mesa)).toBe(refDocumentoE14(mesa));
    }
  });
});

describe("ciudadDePuesto — etiqueta del encabezado canónica (domain/acta.ts)", () => {
  function puestoCon(puesto: string): Puesto {
    return {
      id: "88_495_010_02",
      codigoPais: "495",
      pais: "ITALIA",
      zonaId: "010",
      zona: "10",
      puesto,
      numeroMesas: 8,
      horaCierreColombia: "9:00 AM",
      horaActualLocal: "7:08 PM",
      minutosDesdeCierre: 188,
      diferenciaTiempo: "> 3 hrs",
      pctDelegado: 0,
      pctTransmision: 0,
      estadoGlobal: "CRITICO",
      diaJornada: "DOMINGO",
    };
  }

  test('"02 - Roma - Consulado" → "ROMA" · sin ciudad → el puesto en mayúsculas', () => {
    expect(ciudadDePuesto(puestoCon("02 - Roma - Consulado"))).toBe("ROMA");
    expect(ciudadDePuesto(puestoCon("02 - Roma"))).toBe("ROMA");
    expect(ciudadDePuesto(puestoCon("CONSULADO"))).toBe("CONSULADO");
  });

  /** Referencia verbatim de documento-e14.tsx:38-40 (adopción pendiente R4). */
  const refDocumentoE14 = (puesto: Puesto): string => {
    const partes = puesto.puesto.split(" - ");
    return (partes.length > 1 ? partes[1] : puesto.puesto).toUpperCase();
  };

  test("paridad con la copia local de documento-e14 (R4 la adoptará)", () => {
    for (const nombre of ["02 - Roma - Consulado", "02 - Roma", "CONSULADO"]) {
      expect(ciudadDePuesto(puestoCon(nombre))).toBe(
        refDocumentoE14(puestoCon(nombre))
      );
    }
  });
});

describe("re-export de actas-mock — misma función, cero duplicación", () => {
  test("el re-export es el MISMO código que el canónico del dominio", () => {
    expect(delegadosAcreditadosMock).toBe(delegadosAcreditados);
    expect(ciudadDePuestoMock).toBe(ciudadDePuesto);
  });
});
