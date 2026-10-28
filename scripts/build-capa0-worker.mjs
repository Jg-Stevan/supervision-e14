/**
 * KIT e14-capa0-qr-worker-v1 (D40) — build del WORKER de capa 0.
 *
 * Genera `public/scanner/capa0-qr.worker.js` (IIFE clásica) desde
 * `src/modules/digitalizador/lib/e14/masiva/capa0-qr.worker.ts` — MISMO
 * patrón de emisión del sondeo worker (sondeo-qr.worker.js): el .ts NO se
 * deja al bundler de la app (Turbopack emitía el .ts crudo como asset —
 * FIX DICTAMEN-e73-implementacion-v1 §3.1).
 *
 * Uso: `bun scripts/build-capa0-worker.mjs`
 * Smoke del resultado (gate): el bundle NO contiene zxing/logger/process.env
 * (red line e73 §I — el grafo del worker es jsQR-only).
 */
import { build } from "bun";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const resultado = await build({
  entrypoints: [join(RAIZ, "src/modules/digitalizador/lib/e14/masiva/capa0-qr.worker.ts")],
  outdir: join(RAIZ, "public/scanner"),
  naming: "capa0-qr.worker.js",
  format: "iife",
  target: "browser",
  minify: true,
});

if (!resultado.success) {
  console.error("BUILD FALLIDO:", resultado.logs);
  process.exit(1);
}
const bytes = await Bun.file(join(RAIZ, "public/scanner/capa0-qr.worker.js")).size;
console.log(`OK capa0-qr.worker.js emitido (${(bytes / 1024).toFixed(1)} KB)`);
