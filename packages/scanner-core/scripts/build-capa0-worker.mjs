/**
 * KIT e14-capa0-qr-worker-v1 — build del WORKER de capa 0 (BUILD ÚNICO 3.7).
 *
 * Emite `public/scanner/capa0-qr.worker.js` (IIFE clásica) desde
 * `workers/capa0-qr.worker.ts` del PAQUETE — el .ts NO se deja al bundler de
 * la app (lección DICTAMEN-e73 §3.1). Ambas apps corren ESTE script y copian
 * el MISMO artefacto: la paridad del worker deja de ser promesa.
 *
 * Uso (desde la raíz de CADA app):
 *   bun packages/scanner-core/scripts/build-capa0-worker.mjs
 *   # o, con destino explícito:
 *   bun packages/scanner-core/scripts/build-capa0-worker.mjs --out public/scanner
 */
import { build } from "bun";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const PAQUETE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --out <dir> (default: public/scanner de la app que llama, buscada desde cwd)
const args = process.argv.slice(2);
let outDir = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) outDir = resolve(args[i + 1]);
}
if (!outDir) outDir = resolve(process.cwd(), "public", "scanner");

const resultado = await build({
  entrypoints: [join(PAQUETE, "workers", "capa0-qr.worker.ts")],
  outdir: outDir,
  naming: "capa0-qr.worker.js",
  format: "iife",
  target: "browser",
  minify: true,
});

if (!resultado.success) {
  console.error("BUILD FALLIDO:", resultado.logs);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const bytes = await Bun.file(join(outDir, "capa0-qr.worker.js")).size;
console.log(`OK capa0-qr.worker.js emitido (${(bytes / 1024).toFixed(1)} KB) → ${outDir}`);
