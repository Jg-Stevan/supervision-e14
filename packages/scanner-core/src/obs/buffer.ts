/**
 * Puente core→obs-base (mapa v2.3): `core/image-processor.ts` (copia LITERAL
 * md5-fijada del origen vendorizado) lazy-importa `../obs/buffer` e
 * `../obs/identidad` para el PRE-WARNING del HEIC (T3). El core NO se toca
 * (una línea cambiada rompe el CONTRATO.json) — este shim mantiene el
 * specifier vivo y apunta al bloque base del paquete (misma instancia que
 * el logger y las apps).
 */
export * from "../obs-base/buffer";
