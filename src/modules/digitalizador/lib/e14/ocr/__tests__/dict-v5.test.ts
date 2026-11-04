/**
 * TESTS DE CARACTERIZACIÓN — dict-ppocrv5-v2 (fix del dict del rec v5).
 *
 * FIJAN el contrato del charset del motor PP-OCRv5 latin:
 * `latin_PP-OCRv5_rec_mobile.onnx` (SHA256 b20bd37c…) tiene C=504 clases de
 * salida en convención RapidOCR blank-first — blank(0) + 502 chars (1..502)
 * + espacio (503, cae por el else del ctcDecode de rapidocr.ts).
 *
 * El dict anterior (latin_dict.txt, 185 chars) era el dict latino v3/v4: le
 * faltaban 319 entradas (incluidos `\` y `^`, que corren TODO el bloque
 * posterior) → CTC decodificado corrido (garbage con conf ≥0.9) → 0 anclas
 * → «sin señal» → score 4.9 → RECHAZADA (lote real 6/6, corrida
 * 2026-11-03 02:23). El bench de dígitos no lo detectó: 0-9 alinea de
 * casualidad en el prefijo del charset.
 *
 * Este test ABORTA si: (a) se re-vende un ONNX rec_v5 distinto sin
 * regenerar el dict (guard SHA256), (b) el dict se edita a mano y pierde
 * el alineamiento blank-first, (c) rapidocr.ts deja de apuntar al dict v2
 * (cache-bust obligatorio — /models/* immutable 1 año, public/_headers D39).
 *
 * Regeneración: `bun scripts/regenerar-dict-v5.mjs` (extrae el charset
 * embebido en el metadato protobuf «character» del propio ONNX).
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dir, "../../../../../../..");
const ONNX_REC_V5 = join(RAIZ, "public/models/rapidocr/rec_v5_latin.onnx");
const DICT_V2 = join(RAIZ, "public/models/rapidocr/latin_dict_v2.txt");
const RAPIDOCR_TS = join(RAIZ, "src/modules/digitalizador/lib/e14/ocr/rapidocr.ts");

/** SHA256 del export rec_v5 vendido — el dict v2 es válido SOLO para este binario. */
const SHA256_REC_V5 = "b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a";

function cargarDictV2(): string[] {
  return readFileSync(DICT_V2, "utf-8")
    .split("\n")
    .filter((l) => l.length > 0);
}

describe("dict-ppocrv5-v2 — charset del rec PP-OCRv5 latin", () => {
  test("el ONNX rec_v5 vendido es el export esperado (guard SHA256)", () => {
    const hash = createHash("sha256").update(readFileSync(ONNX_REC_V5)).digest("hex");
    expect(hash).toBe(SHA256_REC_V5);
  });

  test("el dict v2 tiene 502 entradas, sin vacías y sin espacio (clase 503 va por el else del ctcDecode)", () => {
    const dict = cargarDictV2();
    expect(dict.length).toBe(502);
    expect(dict.some((c) => c.trim().length === 0)).toBe(false);
    expect(dict).not.toContain(" ");
  });

  test("alineación blank-first verificada: clase n decodifica dict[n-1] al glifo real", () => {
    const dict = cargarDictV2();
    // verdades observadas contra el ONNX (metadato «character», 502 chars):
    expect(dict[24]).toBe("9"); // clase 25 → '9'  (el prefijo que alineaba «de casualidad»)
    expect(dict[32]).toBe("A"); // clase 33 → 'A'
    expect(dict[64]).toBe("a"); // clase 65 → 'a'  (el dict viejo la corrida +2: salía 'c')
    expect(dict[501].length).toBeGreaterThan(0); // última clase ≠ vacía ('𝜓')
    // cobertura que el dict de 185 rompía y las actas E-14 sí usan:
    expect(dict).toContain("Í"); // «PAÍS»
    expect(dict).toContain("Ó"); // «VOTACIÓN»
    expect(dict).toContain("¿"); // «¿HUBO RECUENTO DE VOTOS?»
    expect(dict).toContain("ñ"); // «AÑO»/nombres
  });

  test("rapidocr.ts apunta al dict v2 — cache-bust obligatorio (/models/* immutable, D39)", () => {
    const src = readFileSync(RAPIDOCR_TS, "utf-8");
    expect(src).toContain('dict: "/models/rapidocr/latin_dict_v2.txt"');
    expect(src).not.toContain('dict: "/models/rapidocr/latin_dict.txt"');
  });
});
