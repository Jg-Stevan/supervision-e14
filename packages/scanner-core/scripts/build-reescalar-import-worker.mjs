/**
 * build-reescalar-import-worker.mjs — E2 (Ola E).
 *
 * Emite `public/scanner/reescalar-import.worker.js` (IIFE clásica) desde
 * `workers/reescalar-import.worker.ts`. Misma lección DICTAMEN-e73 §3.1: el
 * .ts NO se deja al bundler de la app — Turbopack lo copia CRUDO como asset
 * de `static/media`, el navegador no puede ejecutarlo y el fallback se cae en
 * silencio.
 *
 * Uso desde la raíz de la app:
 *   bun packages/scanner-core/scripts/build-reescalar-import-worker.mjs
 */
import { build } from "bun";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const PAQUETE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
let outDir = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) outDir = resolve(args[i + 1]);
}
if (!outDir) outDir = resolve(process.cwd(), "public", "scanner");

const resultado = await build({
  entrypoints: [join(PAQUETE, "workers", "reescalar-import.worker.ts")],
  outdir: outDir,
  naming: "reescalar-import.worker.js",
  format: "iife",
  target: "browser",
  minify: true,
});

if (!resultado.success) {
  console.error("BUILD FALLIDO:", resultado.logs);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const bytes = await Bun.file(join(outDir, "reescalar-import.worker.js")).size;
console.log(`OK reescalar-import.worker.js emitido (${(bytes / 1024).toFixed(1)} KB) → ${outDir}`);
