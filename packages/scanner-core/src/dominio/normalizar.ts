/**
 * Normalización tolerante a OCR del motor de fusión acta ↔ DIVIPOL
 * (TAREA-AGENTE-fusion-divipol §3.3, D89).
 *
 * Módulo PROPIO y no una variante de `clasificador.ts` a propósito: la fusión
 * exige tres semánticas que el clasificador NO tiene — unificar I↔L hacia `I`,
 * descartar palabras ruido (`EL|LA|LOS|LAS|DE|DEL|Y`) y comparar con Dice
 * SOBRE TRIGRAMAS CON PADDING. Cambiar `normalizarNombre`/`similitud` movería
 * el golden del contrato (D80) y el contrato del motor se comparte byte a byte
 * con supervision-e14; acá se implementan aparte y el clasificador queda
 * intacto. Sin dependencias externas.
 */

/** Palabras que el OCR inventa/arrastra y que no discriminan un nombre. */
const PALABRAS_RUIDO = new Set(["EL", "LA", "LOS", "LAS", "DE", "DEL", "Y"]);

/**
 * Nombre comparable: NFKD → sin diacríticos → MAYÚSCULAS → no-alfanumérico a
 * espacio → colapsar espacios → sin palabras ruido → L→I.
 *
 * La equivalencia I↔L se unifica hacia `I` (no hacia `L`) para que el error
 * real «CALRO» vs «CAIRO» y «EI» vs «EL» caigan en la MISMA cadena: ambos
 * bandos pasan por la misma función, así que la dirección es indiferente,
 * pero se documenta para que nadie «arregle» una sola mitad.
 */
export function normalizarNombreFusion(s: string): string {
  const plano = (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  if (!plano) return "";
  return plano
    .split(" ")
    .filter((p) => p && !PALABRAS_RUIDO.has(p))
    .join(" ")
    .replaceAll("L", "I");
}

/** Código comparable: MAYÚSCULAS y solo caracteres alfanuméricos (el OCR
 *  mete guiones, puntos y espacios entre dígitos). La traducción letra→dígito
 *  NO se aplica acá: es una VÍA de evidencia (permutación), no una limpieza. */
export function normalizarCodigoFusion(crudo: string): string {
  return (crudo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Mapa letra→dígito para códigos borrosos (§3.3 — mismas familias que el
 *  informe de OCR, ampliadas respecto del mapa del clasificador). */
const MAPA_LETRA_A_DIGITO: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  U: "0",
  I: "1",
  L: "1",
  J: "1",
  Z: "2",
  E: "3",
  A: "4",
  S: "5",
  G: "6",
  T: "7",
  B: "8",
  P: "9",
};

/** Dígitos de la misma familia visual (§3.3), en ambas direcciones: la tabla
 *  del documento lista pares y acá se cierra la simetría para que la
 *  permutación no dependa del lado que se leyó. */
const DIGITOS_CONFUNDIBLES: Record<string, readonly string[]> = {
  "0": ["8"],
  "1": ["7"],
  "3": ["8", "9"],
  "5": ["6"],
  "8": ["0", "3", "6"],
  "9": ["4"],
  "4": ["9"],
  "6": ["5", "8"],
  "7": ["1"],
};

/** Tope duro de combinaciones por código (§3.3: máximo 64) y largo máximo. */
const MAX_PERMUTACIONES = 64;
const MAX_LARGO_CODIGO = 6;

/**
 * Permutaciones acotadas de un código borroso (§3.3): cada carácter puede ser
 * él mismo, su equivalente letra→dígito o un dígito confundible. Devuelve el
 * código original como PRIMER elemento (la vía EXACTA se distingue afuera) y
 * nunca más de 64 combinaciones; códigos de más de 6 caracteres no se
 * expanden (un código de 15 dígitos no es un código de ubicación).
 */
export function permutacionesCodigo(crudo: string): string[] {
  const codigo = normalizarCodigoFusion(crudo);
  if (!codigo) return [];
  if (codigo.length > MAX_LARGO_CODIGO) return [codigo];
  let combos: string[] = [""];
  for (const c of codigo) {
    const opciones = new Set<string>([c]);
    const digito = MAPA_LETRA_A_DIGITO[c] ?? (/[0-9]/.test(c) ? c : null);
    if (digito) {
      opciones.add(digito);
      for (const d of DIGITOS_CONFUNDIBLES[digito] ?? []) opciones.add(d);
    }
    const siguiente: string[] = [];
    for (const prefijo of combos) {
      for (const o of opciones) {
        if (siguiente.length >= MAX_PERMUTACIONES) break;
        siguiente.push(prefijo + o);
      }
      if (siguiente.length >= MAX_PERMUTACIONES) break;
    }
    combos = siguiente;
  }
  return combos;
}

/** Trigramas de un nombre YA normalizado, con padding `"  " + s + " "` para
 *  que el inicio y el final pesen igual que el medio (§3.3). */
function trigramasConPadding(s: string): Set<string> {
  const out = new Set<string>();
  const t = `  ${s} `;
  for (let i = 0; i <= t.length - 3; i += 1) out.add(t.slice(i, i + 3));
  return out;
}

/**
 * Similitud Dice sobre trigramas con padding (§3.3): 2·|A∩B| / (|A|+|B|).
 * Espera cadenas YA normalizadas con `normalizarNombreFusion` (la fusión
 * precomputa los nombres del catálogo una sola vez — normalizar dentro del
 * comparador multiplicaría el costo por cada par).
 */
export function similitudDice(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const A = trigramasConPadding(a);
  const B = trigramasConPadding(b);
  let interseccion = 0;
  for (const t of A) if (B.has(t)) interseccion += 1;
  return (2 * interseccion) / (A.size + B.size);
}

/** Trigramas expuestos para el índice invertido del motor (pruning: dos
 *  nombres con Dice > 0 comparten al menos un trigrama con padding). */
export function trigramasDeNombre(s: string): Set<string> {
  return trigramasConPadding(s);
}
