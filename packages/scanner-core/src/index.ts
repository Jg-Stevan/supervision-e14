/**
 * @jg-stevan/scanner-core — núcleo de lectura E-14.
 *
 * Barrel MÍNIMO: contrato + funciones puras del dominio. Los motores (OCR,
 * QR, workers) se importan por subpath para no arrastrar WASM a los bundles
 * que solo necesitan tipos o decisiones puras:
 *   import { correrCascadaOcr } from "@jg-stevan/scanner-core/orquestacion/cascada";
 */
export * from "./dominio/types";
export * from "./dominio/senal-lectura";
export * from "./dominio/ocr-escalonado";
export * from "./dominio/bridge";
export * from "./dominio/entorno";
export { crearGetBridge } from "./dominio/get-bridge";
