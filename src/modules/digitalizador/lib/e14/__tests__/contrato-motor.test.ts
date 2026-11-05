/**
 * CONTRATO DE PARIDAD con `digielect14` (el digitalizador móvil por puesto).
 *
 * Los dos repos comparten el motor de OCR (el MISMO código, vendorizado en
 * `core/` de cada repo — ver `core/LEEME.md`,
 * mismo `tesseract.js` con el mismo `spa.traineddata`, mismas ONNX PP-OCRv4 y
 * la misma base DIVIPOL) y comparten el NEGOCIO que decide el resultado de un
 * acta: `clasificador.ts`, `completitud.ts` y `divipol.ts`. Este test corre
 * SUS PROPIAS copias de esas funciones contra un golden generado por el repo
 * hermano (`scripts/gen-contrato-motor.ts` de `digielect14`) y las 21 cabeceras
 * SINTÉTICAS que ahí viven.
 *
 * Para qué sirve en la práctica:
 *   · si aquí se cambia una ancla, un umbral o el registro de kits y el resultado
 *     de alguna cabecera real cambia, este test pone rojo;
 *   · el golden es el MISMO archivo byte a byte en los dos repos, así que un
 *     cambio de negocio hecho en un solo repo deja rojo el otro — es el recordatorio
 *     de que el negocio se sincroniza, no se bifurca.
 *
 * El golden se regenera en `digielect14` y se copia aquí tal cual (no se edita a
 * mano, y NO se escribe un generador propio: la fuente de verdad única evita que
 * cada repo "arregle" su esperado hacia su propio comportamiento).
 *
 * Fixtures: textos OCR fabricados + `/e14/divipol.json` público del repo. Ninguna
 * acta ni informe real.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, describe, it } from "bun:test";

import {
  clasificarCabecera,
  claveDeMesa,
  claveDePuesto,
  faltaSeccionInferior,
  nombreExportacion,
  tituloYUbicacionDe,
  tipoPaginaDe,
} from "../clasificador";
import type { ClasificacionE14 } from "../clasificador";
import type { DivipolBase } from "../divipol";
import { statusDeScore, type ActaStatus } from "../types";

interface DescriptorGolden {
  id: string;
  nota: string;
  ocr: string;
  esperado: ClasificacionE14;
  derivados: Record<string, unknown>;
}

const GOLDEN = JSON.parse(
  readFileSync(new URL("./__fixtures__/contrato-motor.json", import.meta.url), "utf8"),
) as {
  version: number;
  divipolMd5: string;
  estados: Array<{ score: number; status: ActaStatus }>;
  descriptores: DescriptorGolden[];
};

const DIVIPOL_CRUDO = readFileSync(
  new URL("../../../../../../public/e14/divipol.json", import.meta.url),
  "utf8",
);
const BASE = JSON.parse(DIVIPOL_CRUDO) as DivipolBase;

function derivadosDe(d: DescriptorGolden): Record<string, unknown> {
  const c = clasificarCabecera(d.ocr, BASE);
  return {
    claveMesa: claveDeMesa(c),
    clavePuesto: claveDePuesto(c),
    nombre: nombreExportacion(c),
    tipoPagina: c.tipo ? tipoPaginaDe(c.tipo) : null,
    tituloUbicacion: tituloYUbicacionDe(c),
    faltaSeccionInferior: faltaSeccionInferior(d.ocr, c.pagina),
  };
}

describe("contrato de motor · base DIVIPOL", () => {
  it("la base del repo es la misma sobre la que se generó el golden", () => {
    expect(createHash("md5").update(DIVIPOL_CRUDO, "utf8").digest("hex")).toBe(GOLDEN.divipolMd5);
  });

  it("el golden está en la versión del contrato que este test sabe leer", () => {
    expect(GOLDEN.version).toBe(1);
    expect(GOLDEN.descriptores.length).toBeGreaterThanOrEqual(10);
  });
});

describe("contrato de motor · clasificación (misma entrada ⇒ mismo resultado que el móvil)", () => {
  // Cada descriptor se auto-mide con performance.now() y cuesta 392-602 ms solo;
  // con el default de 5 s un pico de carga de la máquina lo hacía TIMED OUT sin
  // que el contrato cambiara (rojo falso — medido en el hermano, 2026-11-04).
  for (const d of GOLDEN.descriptores) {
    it(`${d.id} — ${d.nota}`, () => {
      expect(clasificarCabecera(d.ocr, BASE)).toEqual(d.esperado);
      expect(derivadosDe(d)).toEqual(d.derivados);
    }, 30_000);
  }
});

describe("contrato de motor · escalera score→status", () => {
  it("los cantos 8 y 6.5 siguen siendo OPTIMA/ADVERTENCIA/RECHAZADA", () => {
    expect(GOLDEN.estados.map(({ score }) => ({ score, status: statusDeScore(score) }))).toEqual(
      GOLDEN.estados,
    );
  });
});
