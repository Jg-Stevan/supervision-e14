/**
 * Validador ÚNICO D25 (a)/(b) del join con el catálogo DIVIPOLA (M13 —
 * reporte 02a §5-3 / 00-MASTER-REVIEW M13): el loader estático
 * (`actas-reales.ts`) y el runtime de carga masiva (`actas-runtime.ts`)
 * duplicaban la misma validación con la misma redacción de motivo — y ya
 * podían divergir. Desde M13 ambos llaman ESTA función.
 *
 * Devuelve el MOTIVO de BLOQUEADA (cuarentena D25: lo que falla no se
 * publica — §0-5) o null si el join pasa:
 * · (a) `idEnlace` existe en el catálogo;
 * · (b) `mesa` ≤ `totalMesas` del puesto.
 *
 * La redacción de los mensajes es CONTRATO: queda verbatim en el log de
 * recepción y en la bandeja de cuarentena — los tests la congelan.
 *
 * C1: el catálogo llega por `cargarCatalogoDivipola()` (Result — jamás
 * lanza); si el catálogo no está disponible, (a) falla con el motivo y
 * nada se publica.
 */

import type { PuestoDivipola } from "../domain/divipola";
import { cargarCatalogoDivipola } from "./divipola-adapter";

let INDICE: Map<string, PuestoDivipola> | null = null;
let FALLO_CATALOGO = "";

/** Índice memoizado idEnlace → registro (el derivado es estático — D12). */
function indiceDeCatalogo(): Map<string, PuestoDivipola> | null {
  if (INDICE) return INDICE;
  if (FALLO_CATALOGO) return null;
  const resultado = cargarCatalogoDivipola();
  if (!resultado.ok) {
    FALLO_CATALOGO = resultado.motivo;
    return null;
  }
  INDICE = new Map(resultado.catalogo.map((r) => [r.idEnlace, r]));
  return INDICE;
}

/**
 * Valida el join (a)/(b) de una acta contra el catálogo: motivo
 * `BLOQUEADA` (sin prefijo — el llamador cuarentena con su formato) o
 * null si pasa.
 */
export function validarJoinDivipola(
  idEnlace: string,
  mesa: string
): string | null {
  const indice = indiceDeCatalogo();
  if (!indice) {
    return `(a) catálogo DIVIPOLA no disponible (${FALLO_CATALOGO || "BLOQUEADA"})`;
  }
  const registro = indice.get(idEnlace);
  if (!registro) {
    return `(a) idEnlace "${idEnlace}" ausente en el catálogo DIVIPOLA`;
  }
  const numeroMesa = Number(mesa);
  if (
    !Number.isInteger(numeroMesa) ||
    numeroMesa < 1 ||
    numeroMesa > registro.totalMesas
  ) {
    return `(b) mesa ${mesa} fuera de rango (totalMesas: ${registro.totalMesas})`;
  }
  return null;
}
