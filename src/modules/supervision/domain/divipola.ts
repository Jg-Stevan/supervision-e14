/**
 * Tipos canónicos + validación del catálogo DIVIPOLA
 * (kit SUP-5 "divipola-v1" §2.1 / D21-D22).
 *
 * El catálogo es el INPUT OBLIGATORIO del kit: el maestro (620 KB,
 * 14.438 puestos) vive en el repo como base del join futuro con el
 * digitalizador (NUNCA se importa en código), y el derivado exterior
 * (`data/divipola-exterior.json`) es la única fuente que consume el
 * adaptador. Este archivo define la forma canónica y la validación
 * ESTRICTA — con código propio, sin librerías (§0-5).
 *
 * Convención `idEnlace` (D22): `<dept>_<mun>_<zona>_<puesto>`, observada en
 * los archivos reales del digitalizador. Los códigos van SIEMPRE como
 * strings preservados (nunca number) para que el join futuro case sin
 * transformar.
 */

/** Registro canónico de un puesto de votación DIVIPOLA (target del adaptador). */
export interface PuestoDivipola {
  /** "88_495_010_02" — clave única de join con el digitalizador (D22). */
  idEnlace: string;
  /** Código de departamento, 2 dígitos. "88" = CONSULADOS (exterior). */
  codigoDepartamento: string;
  /** Código de municipio, 3 dígitos; en exterior = código de país (ej. "495" Italia). */
  codigoMunicipio: string;
  /** Nombre del municipio; en exterior = nombre del país (ej. "ITALIA"). */
  nombreMunicipio: string;
  /** Código de zona, 3 dígitos ("010") — la UI lo muestra como "ZONA 10". */
  codigoZona: string;
  /** Código de puesto, 2 dígitos ("02"). */
  codigoPuesto: string;
  /** Nombre real del puesto, tal cual viene ("Roma - Consulado"). */
  nombre: string;
  /** Mesas reales del puesto (entero ≥ 1; va de 1 a 159 en exterior). */
  totalMesas: number;
  /** Nivel del puesto — el derivado exterior vale "EXTERIOR" en todos
   * (lo agrega el adaptador; el JSON no lo trae). */
  nivel: "EXTERIOR" | "NACIONAL";
}

/** Registro EXACTO del JSON derivado (8 campos, sin `nivel` — el adaptador
 * lo agrega en memoria al validar). */
export type RegistroDivipolaJson = Omit<PuestoDivipola, "nivel">;

/** Los 8 campos exactos del derivado (sin extras, sin faltantes — §2.1). */
const CAMPOS_ESPERADOS = [
  "idEnlace",
  "codigoDepartamento",
  "codigoMunicipio",
  "nombreMunicipio",
  "codigoZona",
  "codigoPuesto",
  "nombre",
  "totalMesas",
] as const;

/** Códigos numéricos como STRINGS con ancho fijo (nunca number — §2.1). */
const RE_CODIGO_2 = /^\d{2}$/; // codigoDepartamento, codigoPuesto
const RE_CODIGO_3 = /^\d{3}$/; // codigoMunicipio, codigoZona

/** Error de validación del catálogo con el índice del registro culpable. */
export class ErrorValidacionDivipola extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorValidacionDivipola";
  }
}

/**
 * Valida UN registro del derivado (estricto — §2.1):
 * - objeto plano con EXACTAMENTE los 8 campos (sin extras, sin faltantes);
 * - códigos como strings de dígitos con ancho fijo (2/3/3/2);
 * - `idEnlace` congruente con sus 4 segmentos;
 * - `totalMesas` number entero ≥ 1;
 * - `nombre` y `nombreMunicipio` no vacíos.
 * Cualquier fallo → `ErrorValidacionDivipola` con el índice del registro.
 */
export function validarRegistroDivipola(
  bruto: unknown,
  indice: number
): RegistroDivipolaJson {
  const donde = `registro [${indice}]`;
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    throw new ErrorValidacionDivipola(`${donde}: no es un objeto`);
  }
  const registro = bruto as Record<string, unknown>;
  const claves = Object.keys(registro).sort();
  const esperadas = [...CAMPOS_ESPERADOS].sort();
  if (
    claves.length !== esperadas.length ||
    claves.some((c, i) => c !== esperadas[i])
  ) {
    throw new ErrorValidacionDivipola(
      `${donde}: campos exactos ${esperadas.join(",")} — recibidos ${claves.join(",") || "(ninguno)"}`
    );
  }

  const textoDe = (campo: string, re: RegExp, etiqueta: string): string => {
    const valor = registro[campo];
    if (typeof valor !== "string" || !re.test(valor)) {
      throw new ErrorValidacionDivipola(
        `${donde}: ${campo} debe ser ${etiqueta} como string — recibido ${JSON.stringify(valor ?? null)}`
      );
    }
    return valor;
  };

  const codigoDepartamento = textoDe("codigoDepartamento", RE_CODIGO_2, "2 dígitos");
  const codigoMunicipio = textoDe("codigoMunicipio", RE_CODIGO_3, "3 dígitos");
  const codigoZona = textoDe("codigoZona", RE_CODIGO_3, "3 dígitos");
  const codigoPuesto = textoDe("codigoPuesto", RE_CODIGO_2, "2 dígitos");

  const idEnlace = registro.idEnlace;
  if (typeof idEnlace !== "string" || idEnlace.length === 0) {
    throw new ErrorValidacionDivipola(`${donde}: idEnlace debe ser string no vacío`);
  }
  const esperado = `${codigoDepartamento}_${codigoMunicipio}_${codigoZona}_${codigoPuesto}`;
  if (idEnlace !== esperado) {
    throw new ErrorValidacionDivipola(
      `${donde}: idEnlace "${idEnlace}" incongruente con sus segmentos (esperado "${esperado}")`
    );
  }

  const nombreMunicipio = registro.nombreMunicipio;
  const nombre = registro.nombre;
  if (
    typeof nombreMunicipio !== "string" ||
    nombreMunicipio.trim().length === 0
  ) {
    throw new ErrorValidacionDivipola(`${donde}: nombreMunicipio vacío`);
  }
  if (typeof nombre !== "string" || nombre.trim().length === 0) {
    throw new ErrorValidacionDivipola(`${donde}: nombre vacío`);
  }

  const totalMesas = registro.totalMesas;
  if (
    typeof totalMesas !== "number" ||
    !Number.isInteger(totalMesas) ||
    totalMesas < 1
  ) {
    throw new ErrorValidacionDivipola(
      `${donde}: totalMesas debe ser entero ≥ 1 — recibido ${JSON.stringify(totalMesas ?? null)}`
    );
  }

  return {
    idEnlace,
    codigoDepartamento,
    codigoMunicipio,
    nombreMunicipio: nombreMunicipio as string,
    codigoZona,
    codigoPuesto,
    nombre: nombre as string,
    totalMesas,
  };
}

/**
 * Valida el catálogo COMPLETO (estricto — §2.1): cada registro por
 * `validarRegistroDivipola` + `idEnlace` ÚNICO en todo el catálogo
 * (duplicado → error con ambos índices).
 */
export function validarCatalogoDivipola(
  brutos: unknown[]
): RegistroDivipolaJson[] {
  const vistos = new Map<string, number>();
  const registros: RegistroDivipolaJson[] = [];
  for (let indice = 0; indice < brutos.length; indice++) {
    const registro = validarRegistroDivipola(brutos[indice], indice);
    const duplicadoEn = vistos.get(registro.idEnlace);
    if (duplicadoEn !== undefined) {
      throw new ErrorValidacionDivipola(
        `registro [${indice}]: idEnlace "${registro.idEnlace}" duplicado (ya visto en [${duplicadoEn}])`
      );
    }
    vistos.set(registro.idEnlace, indice);
    registros.push(registro);
  }
  return registros;
}

/** Zona en formato de UI: "010" → "10" (sin ceros a la izquierda — §2.1). */
export function zonaParaUI(codigoZona: string): string {
  const sinCeros = codigoZona.replace(/^0+/, "");
  return sinCeros.length === 0 ? "0" : sinCeros;
}
