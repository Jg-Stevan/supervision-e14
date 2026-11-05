/**
 * e14-core-vendorizado-v1 · el chequeo que SÍ corre en CI.
 *
 * `core/` es copia local del motor (ver `core/LEEME.md`). `core/CONTRATO.json`
 * fija el md5 de cada módulo; si alguien edita el motor sin regenerar el
 * contrato y sin propagar la edición al repo hermano (`digielect14`), este test
 * se pone rojo. La comparación byte a byte contra el hermano la hace
 * `bun scripts/qa-core-vendorizado.ts` cuando los dos checkouts están en disco.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

// __tests__ → core → e14 → lib → digitalizador → modules → src → raíz.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..", "..");
const CORE = join(RAIZ, "src", "modules", "digitalizador", "lib", "e14", "core");
const contrato = JSON.parse(readFileSync(join(CORE, "CONTRATO.json"), "utf8")) as {
  origen: { repo: string; commit: string; version: string };
  compartidos: string[];
  modulos: Record<string, string>;
};

// md5 del CONTENIDO, con los finales de línea normalizados: CONTRATO.json se
// commitea en LF y un `.gitattributes` con `eol=lf` no impide que un editor
// regrabe CRLF en el árbol de trabajo.
const md5 = (ruta: string): string =>
  createHash("md5")
    .update(readFileSync(ruta, "utf8").replace(/\r\n/g, "\n"))
    .digest("hex");

describe("contrato del core vendorizado", () => {
  test("procedencia declarada: origen, commit y versión del paquete", () => {
    expect(contrato.origen.repo).toBe("Jg-Stevan/web-scanner");
    expect(contrato.origen.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(contrato.origen.version).toBe("0.4.1");
  });

  test("cada módulo pesa lo que declara el contrato", () => {
    for (const [nombre, hash] of Object.entries(contrato.modulos)) {
      expect(md5(join(CORE, nombre)), nombre).toBe(hash);
    }
  });

  test("el contrato cubre exactamente los módulos del árbol", () => {
    const delArbol = readdirSync(CORE)
      .filter((f) => f.endsWith(".ts"))
      .sort();
    expect(Object.keys(contrato.modulos).sort()).toEqual(delArbol);
  });

  test("los seis módulos del negocio compartido están en el contrato", () => {
    expect(contrato.compartidos.sort()).toEqual(
      ["codec.ts", "detector-client.ts", "image-modes.ts", "image-processor.ts", "ocr.ts", "types.ts"].sort(),
    );
  });
});
