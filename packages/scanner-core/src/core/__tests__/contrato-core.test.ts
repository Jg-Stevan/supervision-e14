/**
 * Version CANONICA de contrato-core.test.ts (decision D5 del mapa v2.3).
 *
 * Fusion explicita de las dos versiones que vivian en los repos:
 *  · digielect14 (61 L, vitest): 4 casos — procedencia, md5 por modulo,
 *    cobertura exacta del arbol, compartidos presentes en modulos.
 *  · supervision-e14 (58 L, bun:test): mismos casos + lista EXPLICITA de
 *    los 6 modulos del negocio compartido (mas fuerte que "length > 0").
 * La canonica toma el cuerpo de S (lista explicita) y anade el caso de D
 * (cada compartido definido en modulos). Desde FASE 0 este test valida el
 * PAQUETE: el motor tiene una sola copia y este contrato la protege de
 * ediciones accidentales ("si el motor diverge, dos puestos leen un acta
 * distinto"). Los md5 siguen siendo los del origen vendorizado
 * (web-scanner · feba267 · v0.4.1) — copia literal verificada.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

// __tests__ → core → src → raiz del paquete.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CORE = join(RAIZ, "src", "core");
const contrato = JSON.parse(readFileSync(join(CORE, "CONTRATO.json"), "utf8")) as {
  origen: { repo: string; commit: string; version: string };
  compartidos: string[];
  modulos: Record<string, string>;
};

// md5 del CONTENIDO, con los finales de linea normalizados (mismo criterio
// que el contrato vendorizado original).
const md5 = (ruta: string): string =>
  createHash("md5")
    .update(readFileSync(ruta, "utf8").replace(/\r\n/g, "\n"))
    .digest("hex");

describe("contrato del core del paquete", () => {
  test("procedencia declarada: origen, commit y version del motor", () => {
    expect(contrato.origen.repo).toBe("Jg-Stevan/web-scanner");
    expect(contrato.origen.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(contrato.origen.version).toBe("0.4.1");
  });

  test("cada modulo pesa lo que declara el contrato", () => {
    for (const [nombre, hash] of Object.entries(contrato.modulos)) {
      expect(md5(join(CORE, nombre)), nombre).toBe(hash);
    }
  });

  test("el contrato cubre exactamente los modulos del arbol", () => {
    const delArbol = readdirSync(CORE)
      .filter((f) => f.endsWith(".ts"))
      .sort();
    expect(Object.keys(contrato.modulos).sort()).toEqual(delArbol);
  });

  test("los seis modulos del negocio compartido estan en el contrato", () => {
    expect(contrato.compartidos.sort()).toEqual(
      ["codec.ts", "detector-client.ts", "image-modes.ts", "image-processor.ts", "ocr.ts", "types.ts"].sort(),
    );
  });

  // caso D (D5): cada compartido nombrado existe en modulos
  test("los modulos compartidos con el hermano son los que el contrato nombra", () => {
    expect(contrato.compartidos.length).toBeGreaterThan(0);
    for (const f of contrato.compartidos) {
      expect(contrato.modulos[f], f).toBeDefined();
    }
  });
});
