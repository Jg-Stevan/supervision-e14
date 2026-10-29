/**
 * Carga + validación estricta del derivado exterior DIVIPOLA
 * (kit SUP-5 §3-T2 / D21).
 *
 * ÚNICO archivo que consume el catálogo en código: importa el derivado
 * exterior VERBATIM (`divipola-exterior.json`, 8 campos sin `nivel`),
 * valida con `domain/divipola.ts`, agrega `nivel: "EXTERIOR"`, ordena por
 * `idEnlace` y expone `CARGAR_CATALOGO()` (memoizado — la prep del catálogo
 * es una sola vez; el contrato async del repositorio se mantiene con
 * promesas igual que hoy, D12).
 *
 * El MAESTRO del catálogo (34 deptos · 14.438 puestos) NUNCA se importa
 * aquí: solo vive en el repo como base del join futuro del
 * digitalizador/carga masiva (D22).
 *
 * Reglas del kit verificadas al cargar (§2.4 — cualquier desviación
 * aborta con `BLOQUEADA: …`):
 * - 949 registros · 67 países (municipios) · 3.670 mesas totales;
 * - guardrail > 1.500 registros (la UI no tiene paginación);
 * - los 3 registros de control (primero / ancla Roma / último);
 * - el ancla demo `88_495_010_02` Roma con totalMesas: 8.
 */

import datosBrutos from "./divipola-exterior.json";
import {
  ErrorValidacionDivipola,
  validarCatalogoDivipola,
  type PuestoDivipola,
} from "../domain/divipola";

// ─── Números esperados del kit (§2.4) ───────────────────────────────────────

const ESPERADO_REGISTROS = 949;
const ESPERADO_PAISES = 67;
const ESPERADO_MESAS = 3_670;
/** Guardrail: la UI no tiene paginación y no se inventa una (§2.4). */
const LIMITE_REGISTROS = 1_500;

// ─── Registros de control (§2.1 — las 3 puntas del archivo ordenado) ────────

const CONTROL_PRIMERO = "88_115_005_02"; // Accra Consulado (GHANA)
/** ANCLA DEMO (§2.3): Roma — conserva el estado demo completo del kit. */
export const ID_ENLACE_ROMA = "88_495_010_02";
const CONTROL_ULTIMO = "88_815_065_86"; // SABADO SAN CRISTÓBAL (VENEZUELA)

/** Catálogo validado en memoria (una sola prep — D12). */
let CATALOGO: PuestoDivipola[] | null = null;

function fallar(motivo: string): never {
  throw new ErrorValidacionDivipola(`BLOQUEADA: validación del catálogo (${motivo})`);
}

/**
 * Catálogo DIVIPOLA exterior canónico: `PuestoDivipola[]` ordenado por
 * `idEnlace`, con `nivel: "EXTERIOR"`. Lanza `ErrorValidacionDivipola`
 * con `BLOQUEADA: …` si la validación estricta o los números esperados
 * del kit fallan (en dev aborta — §2.1).
 */
export function CARGAR_CATALOGO(): PuestoDivipola[] {
  if (CATALOGO) return CATALOGO;

  // 1) Validación estricta registro a registro + idEnlace únicos (§2.1).
  const registros = validarCatalogoDivipola(datosBrutos as unknown[]);

  // 2) Guardrail de tamaño (§2.4).
  if (registros.length > LIMITE_REGISTROS) {
    fallar(`catálogo demasiado grande para el monitor: ${registros.length} > ${LIMITE_REGISTROS}`);
  }

  // 3) Números esperados (§2.4) — el reporte los confirma.
  const paises = new Set(registros.map((r) => r.nombreMunicipio));
  const mesas = registros.reduce((suma, r) => suma + r.totalMesas, 0);
  if (registros.length !== ESPERADO_REGISTROS) {
    fallar(`registros: ${registros.length} ≠ ${ESPERADO_REGISTROS}`);
  }
  if (paises.size !== ESPERADO_PAISES) {
    fallar(`países: ${paises.size} ≠ ${ESPERADO_PAISES}`);
  }
  if (mesas !== ESPERADO_MESAS) {
    fallar(`mesas totales: ${mesas} ≠ ${ESPERADO_MESAS}`);
  }

  // 4) Registros de control (§2.1): las 3 puntas + ancla Roma (§2.3).
  const porId = new Map(registros.map((r) => [r.idEnlace, r]));
  const primero = porId.get(CONTROL_PRIMERO);
  const ancla = porId.get(ID_ENLACE_ROMA);
  const ultimo = porId.get(CONTROL_ULTIMO);
  if (!primero || !ancla || !ultimo) {
    fallar(
      `registros de control ausentes (primero: ${Boolean(primero)}, ancla: ${Boolean(ancla)}, último: ${Boolean(ultimo)})`
    );
  }
  if (ancla.totalMesas !== 8) {
    fallar(`ancla Roma ${ID_ENLACE_ROMA} con totalMesas ${ancla.totalMesas} ≠ 8`);
  }

  // 5) Canónico final: nivel "EXTERIOR" en todos + orden por idEnlace (§2.1).
  CATALOGO = registros
    .map((r) => ({ ...r, nivel: "EXTERIOR" as const }))
    .sort((a, b) => (a.idEnlace < b.idEnlace ? -1 : a.idEnlace > b.idEnlace ? 1 : 0));

  return CATALOGO;
}
