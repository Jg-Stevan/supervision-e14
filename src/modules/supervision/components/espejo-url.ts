/**
 * R4-M7 — ESPEJO de `location.hash` para la navegación por estado del
 * shell (reporte 02-b §2 / D11).
 *
 * D11 se MANTIENE: no hay router, no hay rutas nuevas y NO se escucha
 * `hashchange` — el hash es un ESPEJO de escritura de la sesión (vista,
 * filtros del monitor, visor de actas) con restauración 1 VEZ al montar.
 * Editar el hash a mano a mitad de sesión no navega (se re-escribe en el
 * siguiente cambio de estado); compartir/copiar la URL sí reproduce la
 * sesión al abrir (el caso de uso del dueño: pegar un enlace en el canal
 * de sala de mando).
 *
 * Serialización compacta (solo claves NO-default):
 *   #vista=recepcion&dia=SABADO&pais=499&visor=88_495_010_02::001
 *
 * · vista   — omitida si es "monitor" (default).
 * · dia     — día de jornada; "todas" = sin filtro de día; omitido = LUNES
 *             (el default del dueño al abrir el monitor).
 * · pais/zona/puesto/estado/cierre/tiempo/q — filtros de FiltrosBar y de
 *             columna; presentes solo si están aplicados.
 * · visor   — `puestoId::mesaId` (mesa opcional); `tipo` solo si es
 *             DELEGADOS; `pag` solo si > 1.
 *
 * Escritura: `history.replaceState` (el espejo no ensucia el historial).
 * Todo con guard de SSR (`typeof window`): las funciones no tocan nada en
 * servidor.
 */

import type { FormularioTipo } from "../domain/acta";
import type { DiaJornada } from "../domain/jornada";
import type { FiltrosPuestos } from "../domain/types";
import type { VistaId } from "./supervision-shell";

/**
 * Lista espejo de las vistas del shell (supervision-shell.tsx `VistaId`).
 * Locales a propósito para no crear un ciclo de importación runtime; si se
 * agrega una vista al shell, añadirla aquí (el switch de VistaActual cae a
 * monitor para las desconocidas — falla segura).
 */
const VISTAS_VALIDAS: readonly string[] = [
  "monitor",
  "recepcion",
  "carga-masiva",
  "notificaciones",
  "anomalias",
  "informes",
  "perfil",
];

const DIAS_VALIDOS: readonly string[] = [
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
];

const ESTADOS_VALIDOS: readonly string[] = [
  "COMPLETO",
  "CRITICO",
  "PENDIENTE",
  "NO_INICIADO",
];

const TIPOS_VALIDOS: readonly string[] = ["TRANSMISION", "DELEGADOS"];

/** Valor canónico del filtro "sin día" en el hash (vs. clave ausente =
 * default LUNES del monitor). */
const DIA_TODAS = "todas";

/** Claves de filtro que el espejo escribe/lee (mapa filtro → clave). */
const CLAVES_FILTRO = [
  ["pais", "pais"],
  ["zona", "zona"],
  ["puesto", "puesto"],
  ["estado", "estado"],
  ["cierreCol", "cierre"],
  ["tiempo", "tiempo"],
  ["busqueda", "q"],
] as const;

/** Valores admitidos por clave (los foráneos NO se restauran — el espejo
 *  jamás inventa estado). */
const VALIDEZ_FILTRO: Partial<Record<keyof FiltrosPuestos, readonly string[]>> = {
  estado: ESTADOS_VALIDOS,
};

export interface EspejoHash {
  /** Vista restaurada (ausente = monitor). */
  vista?: VistaId;
  /** Filtros presentes en el hash. `fecha: undefined` explícito = "todas". */
  filtros: Partial<FiltrosPuestos>;
  /** Visor de actas a restaurar (ausente = cerrado). */
  visor?: {
    puestoId: string;
    mesaId: string | null;
    tipo?: FormularioTipo;
    pagina?: number;
  };
}

/** Lee el espejo del hash (SSR-safe: objeto vacío en servidor). */
export function leerEstadoHash(): EspejoHash {
  if (typeof window === "undefined") return { filtros: {} };
  const bruto = window.location.hash.replace(/^#/, "");
  const espejo: EspejoHash = { filtros: {} };
  if (!bruto) return espejo;
  const params = new URLSearchParams(bruto);

  const vista = params.get("vista");
  if (vista && (VISTAS_VALIDAS as readonly string[]).includes(vista)) {
    espejo.vista = vista as VistaId;
  }

  const dia = params.get("dia");
  if (dia === DIA_TODAS) {
    espejo.filtros.fecha = undefined; // "todas" — explícito, no default
  } else if (dia && (DIAS_VALIDOS as readonly string[]).includes(dia)) {
    espejo.filtros.fecha = dia as DiaJornada;
  }
  for (const [filtro, clave] of CLAVES_FILTRO) {
    const valor = params.get(clave);
    if (!valor) continue;
    const validos = VALIDEZ_FILTRO[filtro];
    if (validos && !(validos as readonly string[]).includes(valor)) continue;
    // Frontera de parseo: los valores del hash llegan como string crudo.
    (espejo.filtros as Record<string, string>)[filtro] = valor;
  }

  const visor = params.get("visor");
  if (visor) {
    const [puestoId, mesaId = null] = visor.split("::");
    if (puestoId) {
      espejo.visor = { puestoId, mesaId: mesaId || null };
      const tipo = params.get("tipo");
      if (tipo && (TIPOS_VALIDOS as readonly string[]).includes(tipo)) {
        espejo.visor.tipo = tipo as FormularioTipo;
      }
      const pag = Number(params.get("pag"));
      if (Number.isInteger(pag) && pag > 1) espejo.visor.pagina = pag;
    }
  }
  return espejo;
}

export interface ParcialHash {
  /** string = escribir · null = quitar · undefined = no tocar. */
  vista?: string | null;
  /** Objeto = reflejar estos filtros · null = quitar todas las claves. */
  filtros?: Partial<FiltrosPuestos> | null;
  /** Estado del visor · null = cerrado (quitar claves). */
  visor?: {
    puestoId: string;
    mesaId: string | null;
    tipo: FormularioTipo;
    pagina: number;
  } | null;
}

/**
 * Escribe UNA parte del espejo (leer-hash → mezclar → replaceState): cada
 * dueño (shell/monitor/provider) actualiza solo sus claves sin pisar las
 * de los otros. No ensucia el historial.
 */
export function escribirHashParcial(parcial: ParcialHash): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  if (parcial.vista !== undefined) {
    if (parcial.vista === null || parcial.vista === "monitor") {
      params.delete("vista");
    } else {
      params.set("vista", parcial.vista);
    }
  }

  if (parcial.filtros !== undefined) {
    if (parcial.filtros === null) {
      params.delete("dia");
      for (const [, clave] of CLAVES_FILTRO) params.delete(clave);
    } else {
      const filtros = parcial.filtros;
      // dia: default LUNES → omitir · "todas" (undefined explícito) →
      // dia=todas · resto → el día tal cual.
      if ("fecha" in filtros && filtros.fecha === undefined) {
        params.set("dia", DIA_TODAS);
      } else if (filtros.fecha === "LUNES") {
        params.delete("dia");
      } else if (filtros.fecha) {
        params.set("dia", filtros.fecha);
      }
      for (const [filtro, clave] of CLAVES_FILTRO) {
        const valor = filtros[filtro];
        if (valor) params.set(clave, valor);
        else params.delete(clave);
      }
    }
  }

  if (parcial.visor !== undefined) {
    if (parcial.visor === null) {
      params.delete("visor");
      params.delete("tipo");
      params.delete("pag");
    } else {
      const visor = parcial.visor;
      params.set(
        "visor",
        visor.mesaId ? `${visor.puestoId}::${visor.mesaId}` : visor.puestoId
      );
      if (visor.tipo === "DELEGADOS") params.set("tipo", visor.tipo);
      else params.delete("tipo");
      if (visor.pagina > 1) params.set("pag", String(visor.pagina));
      else params.delete("pag");
    }
  }

  const cadena = params.toString();
  const url = cadena
    ? `${window.location.pathname}${window.location.search}#${cadena}`
    : `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", url);
}
