/**
 * Declaración de tipos del VENDOR jsQR@1.4.0 (jsQR.js — UMD webpack, MIT).
 * El archivo .js es BYTE-IDÉNTICO al vendido en #72 (tools/bench-qr-identidad/
 * jsQR.js — npm tarball dist/jsQR.js): solo agrega los tipos que el bundler
 * necesita para `import jsQR from "./vendor/jsQR.js"` (el UMD hace
 * `module.exports = factory()["default"]` → el default ES la función).
 * PROHIBIDO tocar el .js (red line 9 del kit e63m).
 */
declare function jsQR(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  providedOptions?: {
    /** "attemptBoth" — el valor del kit (banco #72): prueba normal E invertida. */
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth";
  },
): { data: string; version: number } | null;

export default jsQR;
