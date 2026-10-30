/// <reference types="next/image-types/global" />

/**
 * R1 — shim de tipos para imports estáticos de imágenes.
 *
 * `next-env.d.ts` (que referencía next/image-types/global) está gitignoreado
 * y solo se genera al correr `next typegen` / `next build` / `next dev`. Sin
 * él, `bunx tsc --noEmit` falla con TS2307 en los imports de .jpg/.png
 * (src/modules/digitalizador/assets y src/modules/supervision/data/actas-reales).
 * Esta referencia habilita los mismos `declare module "*.png"` etc. sin
 * depender de correr Next; es idempotente con el next-env.d.ts que genere
 * el tooling (misma fuente de declaraciones).
 */
