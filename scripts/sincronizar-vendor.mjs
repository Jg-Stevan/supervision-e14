/**
 * sincronizar-vendor.mjs — materializa `public/vendor/onnxruntime/` desde el
 * paquete `onnxruntime-web` que ya instaló el gestor de dependencias.
 *
 * PROBLEMA: esos 6 archivos (66 MB) son copia exacta de
 * `node_modules/onnxruntime-web/dist/` y estaban COMMITEADOS. El repo pesaba
 * ~66 MB más por binarios que cualquier clon ya descarga al hacer
 * `bun install`, y además se volvían obsoletos en cuanto subía la versión de
 * ORT (el `.wasm` viejo servido con la librería nueva = fallo en runtime del
 * OCR, no en el build).
 *
 * SOLUCIÓN: el vendor se genera, no se versiona. Este script copia los
 * artefactos que el navegador necesita en build/dev y falla duro si el
 * paquete instalado no coincide con el que declara `package.json`.
 *
 * Uso:  bun scripts/sincronizar-vendor.mjs
 * (corre solo: `predev` y `prebuild` — ver package.json)
 * Idempotente: bytes iguales ⇒ no reescribe; `next build` vuelve a copiar
 * `public/` a `out/` y por eso el export sigue trayendo el wasm.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = join(RAIZ, "node_modules", "onnxruntime-web");
const DESTINO = join(RAIZ, "public", "vendor", "onnxruntime");

// Los 3 pares que consume rapidocr.ts vía `ort.env.wasm.wasmPaths`:
//   · simd-threaded         → EP wasm con hilos (gama baja/media, sin WebGPU)
//   · …jsep                 → EP WebGPU (gama alta; el `.wasm` es el grande)
//   · …asyncify             → worker proxy del EP wasm (`ort.env.wasm.proxy`)
// `jspi` NO va: el export estático no puede depender de SharedArrayBuffer
// sin COOP/COEP, y GitHub Pages no los sirve.
const ARCHIVOS = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];

if (!existsSync(ORIGEN)) {
  console.error("BLOQUEADA: no hay node_modules/onnxruntime-web — corre `bun install` primero.");
  process.exit(1);
}

// La versión instalada tiene que ser la declarada: un `.wasm` de otra versión
// mezclado con la librería JS falla en runtime del OCR, silencioso en el build.
const esperada = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf-8")).dependencies[
  "onnxruntime-web"
];
const instalada = JSON.parse(readFileSync(join(ORIGEN, "package.json"), "utf-8")).version;
if (esperada !== instalada) {
  console.error(
    `BLOQUEADA: onnxruntime-web instalado ${instalada} ≠ declarado ${esperada} en package.json — ` +
      "hace falta `bun install` con el lockfile del repo.",
  );
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true });
let copiados = 0;
let omitidos = 0;
for (const nombre of ARCHIVOS) {
  const src = join(ORIGEN, "dist", nombre);
  if (!existsSync(src)) {
    console.error(
      `BLOQUEADA: ${nombre} no está en onnxruntime-web/dist — la distribución de ORT cambió; ` +
        "revisa qué variante necesita ahora el pipeline antes de desplegar.",
    );
    process.exit(1);
  }
  const dst = join(DESTINO, nombre);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) {
    omitidos++;
    continue;
  }
  copyFileSync(src, dst);
  copiados++;
}

const totalMB = (
  ARCHIVOS.reduce((acc, n) => acc + statSync(join(DESTINO, n)).size, 0) / 1048576
).toFixed(1);
console.log(
  `OK vendor/onnxruntime v${instalada} · ${ARCHIVOS.length} archivos · ${totalMB} MB (${copiados} copiados, ${omitidos} ya estaban)`,
);
