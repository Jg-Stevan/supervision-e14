/**
 * Carga + validación estricta del derivado exterior DIVIPOLA
 * (kit SUP-5 §3-T2 / D21).
 *
 * C1 (reporte 02a 🔴-3 / arranque sin white-screen): este módulo NUNCA
 * lanza — el adaptador devuelve un RESULT (`ok | BLOQUEADA con motivo`):
 * - `prepararCatalogoDivipola(brutos)` — PURA, testeable con fixtures;
 * - `cargarCatalogoDivipola()` — memoizada (D12) sobre el JSON real.
 *
 * Qué BLOQUEA y qué ADVIERTE tras C1:
 * - BLOQUEA (estructural, §2.1 + §2.4): registros malformados, idEnlace
 *   duplicados/incongruentes y guardrail de tamaño > 1.500 (la UI no
 *   tiene paginación);
 * - ADVIERTE (conteos del kit §2.4): 949 / 67 países / 3.670 mesas,
 *   registros de control y ancla Roma=8 — una desviación ADVERTIRÁ y
 *   PERMITIRÁ ARRANCAR (los conteos quedan como TEST, no como guard de
 *   runtime: data/__tests__/catalogo-divipola.test.ts).
 *
 * El MAESTRO del catálogo (34 deptos · 14.438 puestos) NUNCA se importa
 * aquí: solo vive en el repo como base del join futuro del
 * digitalizador/carga masiva (D22).
 */

import datosBrutos from "./divipola-exterior.json";
import {
  ErrorValidacionDivipola,
  validarCatalogoDivipola,
  type PuestoDivipola,
  type RegistroDivipolaJson,
} from "../domain/divipola";

// ─── Números esperados del kit (§2.4) — TEST, no guard de runtime (C1) ──────

const ESPERADO_REGISTROS = 949;
const ESPERADO_PAISES = 67;
const ESPERADO_MESAS = 3_670;
/** Guardrail ESTRUCTURAL (sigue bloqueando): la UI no tiene paginación. */
const LIMITE_REGISTROS = 1_500;

// ─── Registros de control (§2.1 — las 3 puntas del archivo ordenado) ────────

const CONTROL_PRIMERO = "88_115_005_02"; // Accra Consulado (GHANA)
/** ANCLA DEMO (§2.3): Roma — conserva el estado demo completo del kit. */
export const ID_ENLACE_ROMA = "88_495_010_02";
const CONTROL_ULTIMO = "88_815_065_86"; // SABADO SAN CRISTÓBAL (VENEZUELA)

/** Resultado de la prep del catálogo (C1): ok, o BLOQUEADA con motivo —
 * jamás una excepción. */
export type ResultadoCatalogo =
  | { ok: true; catalogo: PuestoDivipola[] }
  | { ok: false; motivo: string };

function bloquear(motivo: string): ResultadoCatalogo {
  return { ok: false, motivo: `BLOQUEADA: validación del catálogo (${motivo})` };
}

/**
 * Prep PURA del catálogo (testeable con fixtures — C1):
 * 1) validación estructural estricta registro a registro + idEnlace únicos;
 * 2) guardrail estructural de tamaño (> 1.500 → BLOQUEADA);
 * 3) conteos del kit (949/67/3.670) + registros de control + ancla Roma →
 *    SOLO advertencia en consola (desviación ≠ arranque roto, C1);
 * 4) canónico: nivel "EXTERIOR" en todos + orden por idEnlace (§2.1).
 */
export function prepararCatalogoDivipola(brutos: unknown[]): ResultadoCatalogo {
  // 1) Validación estructural (§2.1).
  let registros: RegistroDivipolaJson[];
  try {
    registros = validarCatalogoDivipola(brutos);
  } catch (error) {
    const detalle =
      error instanceof ErrorValidacionDivipola
        ? error.message
        : `error inesperado: ${String(error)}`;
    return bloquear(detalle);
  }

  // 2) Guardrail de tamaño (§2.4) — estructural: sigue BLOQUEANDO.
  if (registros.length > LIMITE_REGISTROS) {
    return bloquear(
      `catálogo demasiado grande para el monitor: ${registros.length} > ${LIMITE_REGISTROS}`
    );
  }

  // 3) Conteos esperados del kit (§2.4) — DESVIACIÓN = advertencia (C1):
  //    arrancar vale más que el KPI perfecto; el guard vive en los tests.
  const advertir = (motivo: string) =>
    console.warn(
      `[supervision] catálogo DIVIPOLA desviado del kit §2.4 — ${motivo} (el guard de conteos es TEST, no runtime — C1)`
    );
  const paises = new Set(registros.map((r) => r.nombreMunicipio));
  const mesas = registros.reduce((suma, r) => suma + r.totalMesas, 0);
  if (registros.length !== ESPERADO_REGISTROS) {
    advertir(`registros: ${registros.length} ≠ ${ESPERADO_REGISTROS}`);
  }
  if (paises.size !== ESPERADO_PAISES) {
    advertir(`países: ${paises.size} ≠ ${ESPERADO_PAISES}`);
  }
  if (mesas !== ESPERADO_MESAS) {
    advertir(`mesas totales: ${mesas} ≠ ${ESPERADO_MESAS}`);
  }

  // 4) Registros de control (§2.1/§2.3) — misma política: advertir.
  const porId = new Map(registros.map((r) => [r.idEnlace, r]));
  const primero = porId.get(CONTROL_PRIMERO);
  const ancla = porId.get(ID_ENLACE_ROMA);
  const ultimo = porId.get(CONTROL_ULTIMO);
  if (!primero || !ancla || !ultimo) {
    advertir(
      `registros de control ausentes (primero: ${Boolean(primero)}, ancla: ${Boolean(ancla)}, último: ${Boolean(ultimo)})`
    );
  }
  if (ancla && ancla.totalMesas !== 8) {
    advertir(`ancla Roma ${ID_ENLACE_ROMA} con totalMesas ${ancla.totalMesas} ≠ 8`);
  }

  // 5) Canónico final: nivel "EXTERIOR" en todos + orden por idEnlace (§2.1).
  const catalogo = registros
    .map((r) => ({ ...r, nivel: "EXTERIOR" as const }))
    .sort((a, b) => (a.idEnlace < b.idEnlace ? -1 : a.idEnlace > b.idEnlace ? 1 : 0));

  return { ok: true, catalogo };
}

/** Result memoizado (una sola prep — D12). El fallo TAMBIÉN se memoiza:
 * el derivado es estático, reintentar no cambiaría nada. */
let RESULTADO: ResultadoCatalogo | null = null;

/**
 * Catálogo DIVIPOLA exterior canónico como RESULT: `ok` con el
 * `PuestoDivipola[]` ordenado por `idEnlace` (nivel "EXTERIOR"), o
 * `BLOQUEADA: …` con el motivo exacto — sin lanzar (C1). Los
 * consumidores que NO pueden arrancar sin catálogo deciden con el
 * motivo (cuarentena D25, initSupervisionDatos del mock).
 */
export function cargarCatalogoDivipola(): ResultadoCatalogo {
  if (!RESULTADO) {
    RESULTADO = prepararCatalogoDivipola(datosBrutos as unknown[]);
    if (!RESULTADO.ok) console.error(RESULTADO.motivo);
  }
  return RESULTADO;
}
