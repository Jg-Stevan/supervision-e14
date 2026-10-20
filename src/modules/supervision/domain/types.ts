/**
 * Tipos de dominio del módulo de supervisión E-14 (kit SUP-1 §3-T2).
 *
 * Este módulo se trasplantará al monorepo del digitalizador: estos tipos son
 * el contrato de dominio y no dependen de ninguna librería externa.
 */

/** Estado global de un puesto de votación. */
export type EstadoGlobal = "COMPLETO" | "CRITICO" | "PENDIENTE" | "NO_INICIADO";

/** Estado de una mesa dentro de un puesto. */
export type EstadoMesa = "COMPLETO" | "EN_PROCESO" | "INCOMPLETO" | "NO_INICIADO";

/** Estado de un delegado (P1/P2) o de una transmisión: hecho o pendiente. */
export type EstadoDelegado = "ok" | "pendiente";

/** Acción sugerida sobre una mesa. */
export type AccionMesa = "reinspeccionar" | "notificar";

/** Puesto de votación en el exterior (fila de la tabla maestra). */
export interface Puesto {
  id: string;
  /** Código del país en el sistema E-14 (p. ej. "499"). */
  codigoPais: string;
  pais: string;
  /** Identificador de la zona. */
  zonaId: string;
  /** Valor de zona mostrado en la tabla. */
  zona: string;
  /** Puesto (p. ej. "02 - Roma"). */
  puesto: string;
  numeroMesas: number;
  /** Hora de cierre en hora de Colombia (p. ej. "9:00 AM"). */
  horaCierreColombia: string;
  /** Hora actual local del puesto (p. ej. "7:08 PM"). */
  horaActualLocal: string;
  /** Diferencia de tiempo reportada (p. ej. "> 3 hrs", "—"). */
  diferenciaTiempo: string;
  /** Porcentaje de delegados completados (0-100). */
  pctDelegado: number;
  /** Porcentaje de transmisión completada (0-100). */
  pctTransmision: number;
  estadoGlobal: EstadoGlobal;
}

/** Parte (P1 o P2) de la transmisión de una mesa, con alerta opcional. */
export interface ParteTransmision {
  estado: EstadoDelegado;
  /** Alerta sobre esta parte (p. ej. "Rescaneo"). */
  alerta?: string;
}

/** Mesa de un puesto (sub-tabla de la fila expandida). */
export interface Mesa {
  id: string;
  /** Estado de los delegados P1/P2. */
  delegados: { p1: EstadoDelegado; p2: EstadoDelegado };
  /** Estado de la transmisión P1/P2 (+ alerta por parte). */
  transmision: { p1: ParteTransmision; p2: ParteTransmision };
  estadoMesa: EstadoMesa;
  /** Texto de última carga (p. ej. "Hace 12 min"); null = "—". */
  ultimaCarga: string | null;
  accionSugerida: AccionMesa;
}

/** Resumen global del sistema (KPIs). */
export interface ResumenGlobal {
  total: number;
  completo: number;
  critico: number;
  pendiente: number;
  noIniciado: number;
}

/** Supervisor de la sesión (header). */
export interface Supervisor {
  nombre: string;
  id: string;
}

/** Filtros aplicables sobre los puestos (kit §2.4). */
export interface FiltrosPuestos {
  /** Código de país exacto (p. ej. "499"). */
  pais?: string;
  /** Fecha del calendario electoral (select mock). */
  fecha?: string;
  /** Identificador de zona exacto. */
  zona?: string;
  /** Puesto exacto (p. ej. "02 - Roma"). */
  puesto?: string;
  estado?: EstadoGlobal;
  /** Búsqueda rápida: coincide con id, código, nombre, zona o puesto. */
  busqueda?: string;
}
