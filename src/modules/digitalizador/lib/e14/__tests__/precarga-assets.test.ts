/**
 * P-23 (plan 2026-11-12) — contrato de la PRECARGA de assets OCR.
 *
 *  1) LA LISTA ES UN CONTRATO A DOS BANDAS: `RUTAS_PRECARGA_OCR` debe ser
 *     EXACTAMENTE el destino de `scripts/assets.lock.json` sin el prefijo
 *     `public/` — un modelo nuevo en el lockfile sin precarga paga la
 *     descarga en la primera captura; una ruta muerta en la lista es un 404
 *     silencioso en cada arranque.
 *  2) `puedeDescargarAhora` codifica la regla P-23: soloWifi respeta la
 *     recomendación del perfil (wifi o 4g), sin red jamás descarga.
 *  3) La doctrina aceleradora: fire-and-forget — el módulo no puede bloquear
 *     ni condicionar el lote (se fija por import, como la tarjeta del
 *     sidecar).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BACKOFF_PRECARGA_MS,
  RUTAS_PRECARGA_OCR,
  TECHO_INTENTOS_PRECARGA,
  puedeDescargarAhora,
} from "../precarga-assets";

const RAIZ = join(import.meta.dir, "../../../../../../");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("precarga-assets — contrato P-23", () => {
  test("la lista es EXACTAMENTE el lockfile sin el prefijo public/", () => {
    const lock = JSON.parse(leer("scripts/assets.lock.json")) as {
      archivos: Array<{ destino: string }>;
    };
    const esperadas = lock.archivos.map((a) => a.destino.replace(/^public\//, "/"));
    expect([...RUTAS_PRECARGA_OCR].sort()).toEqual([...esperadas].sort());
    expect(RUTAS_PRECARGA_OCR.length).toBe(esperadas.length);
  });

  test("todas las rutas son same-origin (jamás un URL absoluto — SEC-10)", () => {
    for (const ruta of RUTAS_PRECARGA_OCR) {
      expect(ruta.startsWith("/")).toBe(true);
      expect(ruta).not.toMatch(/^https?:\/\//);
    }
  });

  test("puedeDescargarAhora — la regla soloWifi del perfil", () => {
    // sin red jamás descarga (pase lo que pase con el resto)
    expect(puedeDescargarAhora(false, false, "4g", true)).toBe(false);
    expect(puedeDescargarAhora(true, false, "4g", true)).toBe(false);
    // recomendación OFF → cualquier red sirve
    expect(puedeDescargarAhora(false, true, "3g", null)).toBe(true);
    // recomendación ON → wifi o red buena
    expect(puedeDescargarAhora(true, true, "3g", true)).toBe(true);
    expect(puedeDescargarAhora(true, true, "4g", null)).toBe(true);
    // recomendación ON y red débil → NO (difiere con reintentos)
    expect(puedeDescargarAhora(true, true, "3g", null)).toBe(false);
    expect(puedeDescargarAhora(true, true, "slow-2g", false)).toBe(false);
  });

  test("techo y backoff documentados (difiere, no desiste a la primera)", () => {
    expect(TECHO_INTENTOS_PRECARGA).toBeGreaterThanOrEqual(2);
    expect(BACKOFF_PRECARGA_MS).toBeGreaterThanOrEqual(15_000);
  });

  test("la precarga es fire-and-forget: no importa el runner ni el store", () => {
    const fuente = leer(
      "src/modules/digitalizador/lib/e14/precarga-assets.ts",
    );
    for (const prohibido of ["runner", "store-e14", "cola"]) {
      expect(fuente).not.toMatch(new RegExp(`from [^"]*${prohibido}`));
    }
    expect(fuente).toMatch(/export function programarPrecargaAssetsOcr/);
  });
});
