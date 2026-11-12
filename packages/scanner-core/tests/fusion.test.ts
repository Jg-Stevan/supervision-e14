/**
 * Motor de fusión de evidencia acta ↔ DIVIPOL — escenarios de la tarea
 * «TAREA-AGENTE-fusion-divipol» §3.9 (D89).
 *
 * Corre contra la COPIA del catálogo que usa el resto del contrato
 * (`tests/fixtures/divipol.json`, misma base DIVIPOL servida por la app), así
 * los números no dependen de la red. Los pesos/umbrales son los calibrados
 * (§3.4/§3.5) y NO se ajustan acá para «hacer pasar» un caso.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { DivipolBase } from "../src/dominio/divipol";
import { fusionar } from "../src/dominio/fusion";
import type { CampoLeido, LecturaActa } from "../src/dominio/fusion-tipos";
import { normalizarNombreFusion, permutacionesCodigo, similitudDice } from "../src/dominio/normalizar";

const base = JSON.parse(
  readFileSync(new URL("./fixtures/divipol.json", import.meta.url), "utf8"),
) as DivipolBase;

function campo(valor: string, calidad: CampoLeido["calidad"] = "legible"): CampoLeido {
  return { valor, calidad };
}

const ilegible = (): CampoLeido => ({ valor: "", calidad: "ilegible" });

// Lectura «completa» de Frankfurt (pág. 2): la base de los escenarios 1 y 3.
function frankfurt(extra: LecturaActa = {}): LecturaActa {
  return {
    departamento: campo("88 - CONSULADOS"),
    paisCodigo: campo("120"),
    paisNombre: campo("ALEMANIA"),
    puesto: campo("02"),
    mesa: campo("001"),
    lugar: campo("Frankfurt Consulado"),
    ...extra,
  };
}

describe("fusión · escenarios §3.9", () => {
  test("1 · Frankfurt completo sin ZONA → AUTO (207 pts, gap ≥ 8)", () => {
    const r = fusionar(frankfurt(), base);
    expect(r.nivel).toBe("AUTO");
    expect(r.mejor).not.toBeNull();
    const s = r.mejor!.stand;
    expect([s.departamento.codigo, s.municipio.codigo, s.zona.codigo, s.puesto.codigo]).toEqual([
      "88",
      "120",
      "15",
      "02",
    ]);
    expect(s.puesto.nombre).toBe("Frankfurt Consulado");
    // Suma exacta de §3.4 con depto+país (código 40 · nombre 35 · único 15 ·
    // acuerdo 8) + puesto 20 + lugar 30/único 25 + acuerdo 8 + mesa 20.
    // El documento estimó gap 103; con el catálogo COMPLETO el subcampeón es
    // la casilla del mismo consulado con prefijo de día («MARTES FRANKFURT
    // CONSULADO», nombre casi idéntico) y el gap real es 46 — se asserta la
    // condición de AUTO (≥ 8), no la cifra del simulador.
    expect(r.mejor!.puntos).toBe(207);
    expect(r.gap).toBeGreaterThanOrEqual(8);
    expect(r.mejor!.grupos).toBeGreaterThanOrEqual(2);
    expect(r.mejor!.mesaResuelta).toBe(1);
    expect(r.mejor!.evidencias).toContainEqual({
      campo: "pais",
      leido: "120",
      via: "EXACTA",
      puntos: 40,
    });
    expect(r.mejor!.evidencias).toContainEqual({
      campo: "mesa",
      leido: "001",
      via: "RESTRICCIÓN",
      puntos: 20,
    });
  });

  test("2 · El Cairo con PAÍS muerto → AUTO amplio por lugar + zona + puesto", () => {
    const r = fusionar(
      {
        departamento: campo("88 - CONSULADOS"),
        paisCodigo: ilegible(),
        paisNombre: ilegible(),
        zona: campo("05"),
        puesto: campo("02"),
        mesa: campo("001"),
        lugar: campo("El Cairo - Consulado"),
      },
      base,
    );
    expect(r.nivel).toBe("AUTO");
    const s = r.mejor!.stand;
    expect([s.municipio.codigo, s.zona.codigo, s.puesto.codigo]).toEqual(["335", "05", "02"]);
    expect(r.mejor!.mesaResuelta).toBe(1);
    expect(r.gap).toBeGreaterThanOrEqual(8);
    expect(r.mejor!.grupos).toBeGreaterThanOrEqual(2);
    // La cascada reporta el hueco y que la corroboración lo cubrió.
    expect(r.rescates.some((x) => x.startsWith("PAÍS (código) ilegible"))).toBe(true);
    expect(r.rescates.some((x) => x.includes("corroboración cruzada"))).toBe(true);
  });

  test("3 · mesa «0I2» → permutación a 012 (válida en Frankfurt, con penalización)", () => {
    const r = fusionar(frankfurt({ mesa: campo("0I2") }), base);
    expect(r.nivel).toBe("AUTO");
    expect(r.mejor!.mesaValida).toBe(true);
    expect(r.mejor!.mesaResuelta).toBe(12);
    expect(r.mejor!.evidencias).toContainEqual({
      campo: "mesa",
      leido: "0I2",
      via: "PERMUTACIÓN",
      puntos: 16,
    });
  });

  test("4 · caja de ubicación ilegible → MANUAL (no se adivina)", () => {
    const r = fusionar(
      {
        departamento: ilegible(),
        paisCodigo: ilegible(),
        paisNombre: ilegible(),
        zona: ilegible(),
        puesto: ilegible(),
        mesa: ilegible(),
        lugar: ilegible(),
      },
      base,
    );
    expect(r.nivel).toBe("MANUAL");
    expect(r.mejor).toBeNull();
    expect(r.avisos).toContainEqual(
      expect.objectContaining({ tipo: "info", codigo: "SIN_CANDIDATOS" }),
    );
    expect(r.rescates.some((x) => x.includes("revisión humana"))).toBe(true);
  });

  test("5 · mesa fuera de rango del ganador → −45 y aviso de error", () => {
    const r = fusionar(
      {
        departamento: campo("88 - CONSULADOS"),
        paisCodigo: campo("335"),
        paisNombre: campo("EGIPTO"),
        zona: campo("05"),
        puesto: campo("02"),
        mesa: campo("004"),
        lugar: campo("El Cairo - Consulado"),
      },
      base,
    );
    expect(r.avisos).toContainEqual(
      expect.objectContaining({ tipo: "error", codigo: "MESA_FUERA_RANGO" }),
    );
    expect(r.mejor!.stand.puesto.codigo).toBe("02");
    expect(r.mejor!.mesaResuelta).toBeNull();
    expect(r.mejor!.evidencias).toContainEqual({
      campo: "mesa",
      leido: "004",
      via: "FUERA DE RANGO",
      puntos: -45,
    });
    // 104 (país) + 6 depto + 14 zona + 20 puesto + 30/25 lugar + 8 acuerdo − 45.
    expect(r.mejor!.puntos).toBe(156);
  });

  test("6 · lugar repetido en el catálogo → alerta; el nombre solo no da AUTO", () => {
    const r = fusionar({ lugar: campo("PUESTO CABECERA MUNICIPAL") }, base);
    expect(r.nivel).not.toBe("AUTO");
    expect(r.avisos).toContainEqual(
      expect.objectContaining({ tipo: "alerta", codigo: "LUGAR_AMBIGUO" }),
    );
    // 667 puestos comparten el nombre y empatan en la cima: sin hipótesis
    // arbitraria, pero con alternativas para el panel de revisión.
    expect(r.mejor).toBeNull();
    expect(r.alternativas.length).toBe(6);
    expect(r.alternativas.every((c) => c.puntos > 0)).toBe(true);
  });

  test("7 · verpag pág. 1 vs barcode pág. 2 → aviso de ERROR de discrepancia", () => {
    const r = fusionar(
      frankfurt({ verpag: campo("Ver: 01 Pag: 1 de 2"), barcode: campo("710007453020202") }),
      base,
    );
    expect(r.pagina.consistente).toBe(false);
    expect(r.pagina.valor).toBe(1); // la PRIMERA fuente fija el valor (§3.8)
    expect(r.pagina.fuentes.length).toBe(2);
    expect(r.avisos).toContainEqual(
      expect.objectContaining({ tipo: "error", codigo: "PAGINA_DISCREPANTE" }),
    );
  });

  test("8 · d9 = 2 → tipo como HIPÓTESIS + aviso de ambigüedad", () => {
    const r = fusionar(frankfurt({ barcode: campo("710007452010102") }), base);
    expect(r.barcode).not.toBeNull();
    expect(r.barcode!.d9).toBe("2");
    expect(r.barcode!.plausible).toBe(true);
    expect(r.barcode!.tipoHipotesis).toEqual({
      valor: "CONSUL/EMBAJADOR",
      certeza: "ambigua",
      alternativas: ["CONSUL/EMBAJADOR", "DELEGADOS"],
    });
    expect(r.avisos).toContainEqual(
      expect.objectContaining({ tipo: "alerta", codigo: "TIPO_AMBIGUO" }),
    );
  });
});

describe("normalización OCR de la fusión (§3.3)", () => {
  test("I↔L unificada a I + palabras ruido fuera", () => {
    expect(normalizarNombreFusion("El Cairo - Consulado")).toBe("CAIRO CONSUIADO");
    expect(normalizarNombreFusion("CALRO")).toBe("CAIRO");
  });

  test("Dice con padding: idénticos = 1 y el orden de palabras pesa", () => {
    expect(similitudDice("CAIRO CONSUIADO", "CAIRO CONSUIADO")).toBe(1);
    expect(similitudDice("CAIRO", "CONSUIADO")).toBeLessThan(0.55);
  });

  test("permutaciones letra→dígito y confundibles, con tope de 64", () => {
    expect(permutacionesCodigo("0I2")).toContain("012");
    expect(permutacionesCodigo("0I2")[0]).toBe("0I2"); // la vía EXACTA se distingue afuera
    expect(permutacionesCodigo("3333").length).toBe(64);
    // Un código de más de 6 caracteres no es un código de ubicación.
    expect(permutacionesCodigo("710003993010102")).toEqual(["710003993010102"]);
  });
});
