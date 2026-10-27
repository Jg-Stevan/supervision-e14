/**
 * KIT e63k-capa2-identidad-v1 (F1) — CAPA 2 de dedup: IDENTIDAD IMPRESA.
 *
 * Evidencia de campo (consola del dueño, lote 21-oct — kit §0): el par
 * 3992/3993-P2 (misma mesa, mismos votos, formularios DISTINTOS — delegados
 * vs transmisión) cayó con hamming=6, EXACTAMENTE en el borde de
 * DEDUP_HAMMING_MAX=6 → la marca pre-OCR lo mandó a DUPLICADA y REUTILIZÓ
 * el desenlace de la otra ⇒ documento perdido. El kit e63h ya documentó
 * «gemelas reales caen 0-2; fotos distintas >12» — la marca pre-OCR SOLO es
 * CIERTA en la cinta baja.
 *
 * Esta capa NO toca dedup.ts ni el umbral (RED LINE 1): define la identidad
 * del acta desde el código 1D IMPRESO consensuado (clasificacion.codigoUnico,
 * gramática completa codigoUnicoE14 — el campo ya existe en el repo) y deja
 * que el runner decida la banda 3..6 POST-OCR.
 *
 * RED LINE 2 (kit §4): identidad SOLO desde codigoUnico (consenso). PROHIBIDO
 * un regex suelto sobre el texto cuando el consenso falló — una lectura
 * errada fabricaría identidad falsa ⇒ falso dedup. Sin serie → null (honesto).
 */
import { codigoUnicoE14 } from "../clasificador";
import type { Acta } from "../types";

export interface IdentidadActa {
  /** Crudo 15 dígitos (consenso validado). */
  serie: string;
  /** crudo.slice(0, 11) — 7100+KIT+TIPO+VER (el papel físico). */
  identidadFormulario: string;
  /** crudo.slice(0, 13) — formulario+PAG (LA CLAVE DEL DEDUP). */
  identidadActa: string;
  /** Bloque PP del código. */
  paginaSerie: number;
}

/**
 * Identidad de UN acta desde su serie impresa consensuada. Re-valida el crudo
 * contra la gramática completa (defensa contra registros viejos — si el
 * consenso ya nació validado, esto es un no-op). null = sin lectura
 * consensuada (honesto — la fila procesa normal, RED LINE 3).
 */
export function identidadDeActa(
  acta: Acta | null | undefined,
): IdentidadActa | null {
  const crudo = acta?.clasificacion?.codigoUnico?.crudo;
  if (!crudo) return null;
  const parsed = codigoUnicoE14(crudo); // re-validación defensiva (registros viejos)
  if (!parsed) return null;
  return {
    serie: parsed.crudo,
    identidadFormulario: parsed.crudo.slice(0, 11),
    identidadActa: parsed.crudo.slice(0, 13),
    paginaSerie: parsed.pagina,
  };
}

/** e63k: la marca pre-OCR SOLO es cierta en la cinta baja (gemelas reales
 *  0-2, kit e63h §0; el FP 3992/3993 cayó en 6). La banda 3..6 la decide la
 *  capa 2. Clave del dedup = identidadActa (13 dígitos, INCLUYE PAG): P1 y
 *  P2 del mismo formulario son actas DISTINTAS (nunca se deduplican entre
 *  sí); dos fotos del MISMO papel comparten la clave completa. */
export const DEDUP_CINTA_CIERTA = 2;
