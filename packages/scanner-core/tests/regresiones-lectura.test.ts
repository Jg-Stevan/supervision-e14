/**
 * Harness 3.10 — BACKLOG de regresiones de LECTURA (fase E post-v2.3).
 *
 * Cada bug de lectura visto en producción se convierte en un fixture JSON en
 * `fixtures/regresiones-lectura/` y queda como test permanente del paquete:
 * la entrada es el TEXTO que el OCR produjo (no la foto — el wasm no corre en
 * node) y lo esperado es la clasificación correcta. Ver el LEEME de la carpeta
 * para el formato y las reglas de privacidad.
 *
 * El backlog es continuo: hoy puede estar vacío; el harness verde con cero
 * fixtures es el estado sano, no un hueco.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { clasificarCabecera, type ClasificacionE14 } from "../src/dominio/clasificador";
import type { DivipolBase } from "../src/dominio/divipol";

const BASE = JSON.parse(
  readFileSync(new URL("../../../public/e14/divipol.json", import.meta.url), "utf8"),
) as DivipolBase;

const DIR = new URL("./fixtures/regresiones-lectura/", import.meta.url);

interface Regresion {
  /** ID estable — prefijo R-AAAA-MM-DD y slug corto. */
  id: string;
  /** Qué bug de producción reproduce y qué lectura se espera. */
  nota: string;
  /** Texto EXACTO que produjo el OCR (conserva el misread que disparó el bug). */
  ocr: string;
  esperado: ClasificacionE14;
}

function cargar(): Regresion[] {
  const archivos = readdirSync(DIR)
    .filter((n) => n.endsWith(".json"))
    .sort();
  return archivos.map((n) => {
    const r = JSON.parse(readFileSync(new URL(n, DIR), "utf8")) as Regresion;
    if (!r.id || !r.ocr || !r.esperado) {
      throw new Error(`regresión ${n}: faltan id/ocr/esperado (ver LEEME.md)`);
    }
    return r;
  });
}

describe("harness 3.10 · regresiones de lectura", () => {
  const regresiones = cargar();

  test("el backlog se puede leer (id/ocr/esperado en cada fixture)", () => {
    expect(regresiones.every((r) => r.id.length > 0 && r.ocr.length > 0)).toBe(true);
  });

  for (const r of regresiones) {
    test(`${r.id} — ${r.nota}`, () => {
      expect(clasificarCabecera(r.ocr, BASE)).toEqual(r.esperado);
    });
  }
});
