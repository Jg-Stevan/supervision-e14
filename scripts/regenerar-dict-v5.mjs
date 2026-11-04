/**
 * regenerar-dict-v5.mjs — FIX dict-ppocrv5-v2: dict correcto para el rec v5.
 *
 * PROBLEMA: public/models/rapidocr/latin_dict.txt (185 chars) era el dict
 * latino v3/v4 — NO corresponde a latin_PP-OCRv5_rec_mobile.onnx (SHA256
 * b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a), que
 * tiene C=504 clases de salida: blank(0) + 502 chars + espacio(503).
 * Con el dict viejo el CTC decodifica corrido (garbage con conf ≥0.9)
 * → 0 anclas → «sin señal» → score 4.9 → RECHAZADA (lote real 6/6,
 * corrida 2026-11-03 02:23 — el bench no lo detectó porque midió DÍGITOS,
 * que alinean de casualidad en el prefijo ASCII del charset).
 *
 * SOLUCIÓN: el propio ONNX trae el charset embebido (metadato protobuf
 * «character», convención RapidOCR: blank=0 · chars 1..502 · espacio=503).
 * Este script lo extrae y escribe latin_dict_v2.txt (502 líneas, 1.ª = «!»).
 * El ctcDecode del repo (blank-first: dict[mejor-1], else espacio) queda
 * INTACTO — solo cambia el archivo (renombrado: /models/* va immutable).
 *
 * Uso:  bun scripts/regenerar-dict-v5.mjs
 * Idempotente: mismo ONNX ⇒ misma salida byte a byte.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ONNX = "public/models/rapidocr/rec_v5_latin.onnx";
const SALIDA = "public/models/rapidocr/latin_dict_v2.txt";

if (!existsSync(ONNX)) {
  console.error(`BLOQUEADA: no existe ${ONNX} — correr desde la raíz del repo.`);
  process.exit(1);
}

const buf = readFileSync(ONNX);
const ancla = Buffer.from("character\x12"); // key protobuf «character» + tag field 2 (string)
const i = buf.indexOf(ancla);
if (i < 0) {
  console.error("BLOQUEADA: el ONNX no trae metadato «character» — export distinto al esperado.");
  process.exit(1);
}

// longitud varint tras el ancla (convención protobuf)
let len = 0, shift = 0, j = i + ancla.length;
for (;;) {
  const b = buf[j];
  len |= (b & 0x7f) << shift;
  j++;
  if (!(b & 0x80)) break;
  shift += 7;
}
const chars = buf.slice(j, j + len).toString("utf-8").split("\n");
if (chars[chars.length - 1] === "") chars.pop(); // \n final del metadato

// VALIDACIONES — cualquier desviación aborta (convención BLOQUEADA del repo)
if (chars.length !== 502) {
  console.error(`BLOQUEADA: se esperaban 502 chars, salieron ${chars.length}.`);
  process.exit(1);
}
if (chars[0] !== "!" || chars.some((c) => c.length === 0)) {
  console.error("BLOQUEADA: charset inesperado (1.ª entrada ≠ «!» o hay entradas vacías).");
  process.exit(1);
}

writeFileSync(SALIDA, chars.join("\n") + "\n", "utf-8");
console.log(`OK: ${SALIDA} · ${chars.length} chars · 1.ª=${JSON.stringify(chars[0])} · última=${JSON.stringify(chars[501])}`);
console.log("El ctcDecode de rapidocr.ts queda intacto (blank-first). Siguiente: commit + deploy — /models/* immutable exige el nombre nuevo para cache-bust.");
