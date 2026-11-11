/**
 * Guardarraíl anti-relleno (auditoría 2026-11-11, fase 5 / T5.2).
 *
 * Espejo del T5.1 de digielect14: el acta DEMO del motor se colaba en las
 * actas REALES del digitalizador (título «ROMA - CONSULADO», candidatos con
 * votos, jurados con nombre y barcode inventado) y las fotos reales de la
 * jornada seguían en el árbol. Este test congela el fallback honesto y las
 * dos retiradas:
 *
 *  1. COMPORTAMIENTO — sin clasificación, `construirActa` y
 *     `actaTimeoutWatchdog` producen «ACTA SIN IDENTIFICAR», ubicación «—»,
 *     `candidatos: []` y sin `codigoBarras`.
 *  2. FILESYSTEM — `assets/actas-demo/` no existe y ningún archivo bajo
 *     `src/` menciona el nombre de archivo real de la jornada.
 *  3. FUENTE — `acta-factory.ts` y `runner-watchdog.ts` no mencionan
 *     `ACTA_MOCK`.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { OpcionesEscaneo } from "../bridge";
import { construirActa } from "../acta-factory";
import { actaTimeoutWatchdog } from "../masiva/runner-watchdog";

const RAIZ = process.cwd();

/** Nombre de archivo real retirado, armado por partes: este guardián no
 *  puede reintroducir el literal que vigila (el criterio V2 lo busca en
 *  TODO el árbol, tests incluidos). */
const NOMBRE_FOTO_RETIRADA = ["2026", "1028"].join("");

const OPCIONES: OpcionesEscaneo = {
  objetivo: null,
  intento: 1,
  maxIntentos: 4,
  fuente: "ARCHIVO",
};

function actaSinClasificacion() {
  return construirActa(OPCIONES, {}, {
    score: 7.5,
    status: "ADVERTENCIA",
    rechazo: null,
  });
}

/** Archivos .ts/.tsx/.json bajo una raíz, excluyendo node_modules y tests
 *  (el criterio V2 de la auditoría también excluye `__tests__`). */
function archivosFuente(raizRelativa: string): string[] {
  const salida: string[] = [];
  const visitar = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      if (entrada === "node_modules" || entrada === "__tests__") continue;
      const ruta = join(dir, entrada);
      const info = statSync(ruta);
      if (info.isDirectory()) {
        visitar(ruta);
      } else if (
        /\.(ts|tsx|json)$/.test(entrada) &&
        !/\.test\.(ts|tsx)$/.test(entrada)
      ) {
        salida.push(ruta);
      }
    }
  };
  visitar(join(RAIZ, raizRelativa));
  return salida;
}

describe("T5.2 — fallback honesto (supervision-e14)", () => {
  test("construirActa sin clasificación: título/ubicación honestos, cero candidatos", () => {
    const acta = actaSinClasificacion();
    expect(acta.titulo).toBe("ACTA SIN IDENTIFICAR");
    expect(acta.ubicacion.departamento).toBe("—");
    expect(acta.ubicacion.municipio).toBe("—");
    expect(acta.ubicacion.zona).toBe("—");
    expect(acta.ubicacion.puesto).toBe("—");
    expect(acta.candidatos).toEqual([]);
    expect(acta.codigoBarras).toBeUndefined();
    expect(acta.firmas.every((f) => f.nombre === "—")).toBe(true);
  });

  test("actaTimeoutWatchdog: misma honestidad que la fábrica", () => {
    const acta = actaTimeoutWatchdog("fila-1");
    expect(acta.titulo).toBe("ACTA SIN IDENTIFICAR");
    expect(acta.ubicacion.departamento).toBe("—");
    expect(acta.candidatos).toEqual([]);
    expect(acta.codigoBarras).toBeUndefined();
    expect(acta.firmas.map((f) => f.nombre)).toEqual(["—", "—", "—"]);
  });

  test("las fotos reales del lote demo ya no viven en el árbol", () => {
    expect(
      existsSync(join(RAIZ, "src/modules/digitalizador/assets/actas-demo")),
    ).toBe(false);
  });

  test("ningún archivo bajo src/ menciona el nombre real de la foto retirada", () => {
    const infractores = archivosFuente("src")
      .filter((archivo) =>
        readFileSync(archivo, "utf-8").includes(NOMBRE_FOTO_RETIRADA),
      )
      .map((archivo) => relative(RAIZ, archivo).replace(/\\/g, "/"));
    expect(infractores).toEqual([]);
  });

  test("acta-factory.ts y runner-watchdog.ts no mencionan ACTA_MOCK", () => {
    for (const ruta of [
      "src/modules/digitalizador/lib/e14/acta-factory.ts",
      "src/modules/digitalizador/lib/e14/masiva/runner-watchdog.ts",
    ]) {
      expect(readFileSync(join(RAIZ, ruta), "utf-8")).not.toContain("ACTA_MOCK");
    }
  });
});
