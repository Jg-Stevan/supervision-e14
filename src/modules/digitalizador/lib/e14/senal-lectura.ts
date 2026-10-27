/**
 * KIT e14-score-lectura-v1 — señal de LECTURA para el score v2 ("la lectura
 * manda"). El score deja de medir solo "¿se ve bien?" y responde
 * "¿se va a LEER bien?" (principio «el OCR manda» §X SPEC-score-legible,
 * elevado a regla — decisión del dueño §0 del kit).
 *
 * FUENTE: ANCLAS_ESTRUCTURALES de src/lib/e14/informe/analisis-texto.ts
 * (rama informe-telemetria-ocr). Esa rama NO está mergeada en esta base
 * (main 5feea02) → COPIA LOCAL DOCUMENTADA (instrumento de medición, no GT).
 * Diferencia honesta con el instrumento del informe: aquí la ancla
 * «TRANSMISIÓN» se sustituye por «KIT nnn» (el kit §4-A la define así — la
 * banda del sello no es típica en la lectura del acta y el kit del consenso
 * ya la cubre aparte). `norm()` es IDÉNTICA byte a byte a la del informe
 * (pitfall §9.10: mismo plegado — si el informe se mergea primero, los
 * números del reporte cuadran).
 *
 * PURO (sin DOM) — testeable headless con bun (§6.2 del kit).
 * Sin llamada OCR nueva: consume el texto YA leído por el pipeline
 * (POST-banda — consenso-frankfurt FASE 4 suma `ocrBanda` antes del score,
 * pitfall §9.8). Costo 0 en tiempo de OCR.
 */

export type NivelLectura = "FUERTE" | "MEDIA" | "DEBIL";

export interface SenalLectura {
  nivel: NivelLectura;
  chars: number;
  anclas: number;
}

/** Piso de lectura FUERTE (§3): lectura con mesa+anclas = acta útil; banca
 *  por encima de ADVERTENCIA (statusDeScore: ≥8 → OPTIMA/auto-envío normal,
 *  el gate sigue decidiendo). El piso vence al techo fair (el OCR manda)
 *  pero NUNCA al techo poor ni a los caps posteriores (escudo/recortada/gate). */
export const PISO_LECTURA_FUERTE = 8.5;

/** Techo de lectura DEBIL (§3): casi-nada leído = no merece zona OPTIMA/
 *  ADVERTENCIA alta; RECHAZADA/BAJO honesto. */
export const TECHO_LECTURA_DEBIL = 5.9;

/** Las 10 regex estructurales SIN valores del acta (mismo espíritu del
 *  instrumento del informe — §4-A del kit, copia local documentada). */
export const ANCLAS_LECTURA: [string, RegExp][] = [
  ["cabecera E-14", /E\s*-\s*14/i],
  ["REGISTRADURÍA", /REGISTRADUR[IÍ]A/i],
  ["CONSULADO n", /CONSULADO[::\s.]*\d|CONSULADOS/i],
  ["PAÍS n", /PA[IÍ]S[::\s.]*\d/i],
  ["ZONA n", /ZONA[::\s.]*\d+/i],
  ["PUESTO n", /PUESTO[::\s.]*\d+/i],
  ["MESA nnn", /MESA[::\s.]*\d+/i],
  ["Ver Pag n de n", /Ver\.?\s*:?\s*\d+\s*Pag\.?\s*:?\s*\d+\s*de\s*\d+/i],
  ["KIT nnn", /KIT[::\s.]*\d+/i],
  ["código 1D 15d", /\b\d{15}\b/],
];

/** Plegado IDÉNTICO al del informe (informe/analisis-texto.ts, pitfall §9.10):
 *  upper → NFD sin diacríticos → [^A-Z0-9]+ → " " → trim. */
export function norm(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Señal de lectura del acta (§3 del kit):
 *  FUERTE = (mesa leída Y anclas ≥ 4) o anclas ≥ 6
 *  MEDIA  = cabecera E-14 leída o anclas ≥ 2 o chars ≥ 150
 *  DEBIL  = resto.
 *  `parciales` viene de `clasificarCabecera(...).parciales` (mesa del
 *  consenso — cuando la cabecera no la leyó, el registro/consenso la trae). */
export function senalDeLectura(
  texto: string,
  parciales?: { mesa?: number | null; cabecera?: boolean },
): SenalLectura {
  const chars = norm(texto).replace(/ /g, "").length;
  const anclas = ANCLAS_LECTURA.filter(([, re]) => re.test(texto)).length;
  const mesaLeida =
    (parciales?.mesa != null && Number.isFinite(parciales.mesa)) ||
    /MESA[::\s.]*\d+/i.test(texto);
  const nivel: NivelLectura =
    (mesaLeida && anclas >= 4) || anclas >= 6
      ? "FUERTE"
      : /E\s*-\s*14/i.test(texto) || anclas >= 2 || chars >= 150
        ? "MEDIA"
        : "DEBIL";
  return { nivel, chars, anclas };
}

/** KIT e14-lectura-perdona-lazo-v1 — ¿es el lazo (esquinas fiduciales) un falso
 *  positivo según la LECTURA? «La lectura manda» (kit e14-score-lectura-v1)
 *  aplicada al gate: un fiducial faltante cuyo LADO está demostrado dentro del
 *  recorte por el OCR es falso positivo (margen corto del warp / sombra al
 *  filo). Evidencia de campo (ZIP mesa-001, 2026-10-17): acta COMPLETA —KIT 399
 *  y SUMA TOTAL leídos, sharpness 100— bloqueada SOLO por lazo inf-izq → cap
 *  7.9 → ADVERTENCIA. El pie leído ES la prueba de que el fondo está dentro.
 *
 *  Regla (§3 del kit): por CADA esquina faltante, evidencia de SU lado —
 *  tope (tl/tr): /E\s*-\s*14/i o /\b\d{15}\b/ · fondo (bl/br): !faltaSeccion
 *  (P1: SUMA TOTAL; P≥2: FIRMA) Y /KIT[::\s.]*\d+/i. Perdón = TODAS la tienen.
 *  faltaSeccionInferior (tinta ausente) NUNCA se perdona — eso no es un lazo.
 *
 *  PURO (sin DOM, sin imports) — testeable headless con bun (§6 del kit). */
export function lazoPerdonadoPorLectura(
  esquinas: { tl: boolean; tr: boolean; bl: boolean; br: boolean } | null,
  texto: string,
  faltaSeccion: boolean,
): boolean {
  if (!esquinas) return false;
  const faltan = (["tl", "tr", "bl", "br"] as const).filter((k) => !esquinas[k]);
  if (faltan.length === 0) return false;
  const topeDentro = /E\s*-\s*14/i.test(texto) || /\b\d{15}\b/.test(texto);
  // KIT e14-esquinas-suaves-v1 (Q4): pieDentro = !faltaSeccion SIN exigir
  // /KIT nnn/. La sección impresa del pie (SUMA TOTAL P1 / FIRMA P≥2) YA ES la
  // prueba de que el fondo está dentro — exigir además el KIT leído condenaba
  // actas cuyo kit solo llega por CÓDIGO/REGISTRO (kitFuente≠PIE: el sello de
  // la banda no siempre imprime legible). faltaSeccionInferior sigue siendo
  // innegociable (señal de tinta — NUNCA se perdona, §3 del kit lazo).
  const pieDentro = !faltaSeccion;
  return faltan.every((k) => (k === "tl" || k === "tr" ? topeDentro : pieDentro));
}
