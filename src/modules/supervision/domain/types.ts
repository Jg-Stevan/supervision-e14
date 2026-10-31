/**
 * Tipos de dominio del módulo de supervisión E-14 (kit SUP-1 §3-T2).
 *
 * Este módulo se trasplantará al monorepo del digitalizador: estos tipos son
 * el contrato de dominio y no dependen de ninguna librería externa.
 */

import type { DiaJornada } from "./jornada";

/** Estado global de un puesto de votación. */
export type EstadoGlobal = "COMPLETO" | "CRITICO" | "PENDIENTE" | "NO_INICIADO";

/** Estado de una mesa dentro de un puesto. */
export type EstadoMesa = "COMPLETO" | "EN_PROCESO" | "INCOMPLETO" | "NO_INICIADO";

/** Estado de un delegado (P1/P2) o de una transmisión: hecho o pendiente. */
export type EstadoDelegado = "ok" | "pendiente";

/** Acción sugerida sobre una mesa. */
export type AccionMesa = "reinspeccionar" | "notificar";

/**
 * Puesto de votación en el exterior (fila de la tabla maestra).
 *
 * KIT SUP-5 (D21/D22): la fuente es el catálogo DIVIPOLA exterior — el
 * `id` ES el `idEnlace` divipola (clave de join con el digitalizador) y
 * los códigos llegan reales del catálogo, como strings, sin transformar.
 */
export interface Puesto {
  /**
   * idEnlace DIVIPOLA (p. ej. "88_495_010_02") — clave única de join
   * `<dept>_<mun>_<zona>_<puesto>` (D22). Re-ancla mesas, actas y
   * anomalías; el demo viejo usaba ids "puesto-499".
   */
  id: string;
  /**
   * Código divipola del municipio; en exterior = código del país
   * (p. ej. "495" Italia). "88" = CONSULADOS (departamento).
   */
  codigoPais: string;
  /** Nombre del país — nombreMunicipio del catálogo (p. ej. "ITALIA"). */
  pais: string;
  /** Código de zona divipola, 3 dígitos (p. ej. "010"). */
  zonaId: string;
  /** Valor de zona mostrado en la tabla (sin ceros — p. ej. "10"). */
  zona: string;
  /**
   * Puesto mostrado: "<codigoPuesto> - <nombre real del catálogo>"
   * (p. ej. "02 - Roma - Consulado") — nombre tal cual viene (§2.3).
   */
  puesto: string;
  /** Mesas reales del puesto (totalMesas del catálogo; 1 a 159). */
  numeroMesas: number;
  /** Hora de cierre en hora de Colombia (p. ej. "9:00 AM"). */
  horaCierreColombia: string;
  /**
   * Hora actual local del puesto (p. ej. "7:08 PM") — la hora del PAÍS
   * del puesto de digitalización. Coherente por construcción con el
   * cierre de 4:00 p. m. local y el tiempo transcurrido (16:00 + t).
   */
  horaActualLocal: string;
  /**
   * Minutos transcurridos desde el cierre (4:00 p. m. HORA LOCAL del
   * país del puesto de digitalización) — alimenta la columna «Tiempo»
   * (señalización por color) y su filtro por tramos (ver
   * domain/tiempo-cierre). `diferenciaTiempo` es su etiqueta derivada.
   */
  minutosDesdeCierre: number;
  /** Diferencia de tiempo reportada (p. ej. "> 3 hrs", "—"). */
  diferenciaTiempo: string;
  /** Porcentaje de delegados completados (0-100). */
  pctDelegado: number;
  /** Porcentaje de transmisión completada (0-100). */
  pctTransmision: number;
  estadoGlobal: EstadoGlobal;
  /**
   * Zona horaria IANA del PAÍS EMISOR del acta (ronda «reloj real»:
   * «local es colombia, país es el q emite»). Alimenta el reloj real:
   * hora actual, cierre 4:00 p. m. local y estado por tiempo — ver
   * domain/reloj-jornada y domain/proyeccion-viva.
   */
  zonaEmisor: string;
  /**
   * Ancla con horario CONGELADO del mockup (kit §4.9 — Roma): su hora,
   * tiempo y estado son los exactos del mockup y NO siguen el reloj real
   * (true solo en la ancla de práctica).
   */
  relojFijo?: boolean;
  /**
   * Día de la jornada electoral en el que VOTA el puesto (kit
   * monitor-jornada-v1). Derivado del prefijo real del catálogo DIVIPOLA
   * («LUNES LISBOA…», «SABADO LISBOA…»); los puestos base sin prefijo son
   * la jornada de cierre del DOMINGO (día de elecciones en Colombia).
   */
  diaJornada: DiaJornada;
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
  /**
   * Día de la jornada electoral seleccionado (kit monitor-jornada-v1).
   * undefined = todos los días (sin filtro).
   */
  fecha?: DiaJornada;
  /** Identificador de zona exacto. */
  zona?: string;
  /** Puesto exacto (p. ej. "02 - Roma"). */
  puesto?: string;
  estado?: EstadoGlobal;
  /** Búsqueda rápida: coincide con id, código, nombre, zona o puesto. */
  busqueda?: string;
  /**
   * Filtro de COLUMNA «Cierre COL»: valor exacto de la hora de cierre en
   * hora de Colombia (p. ej. "9:00 AM"). undefined = todos.
   */
  cierreCol?: string;
  /**
   * Filtro de COLUMNA «Tiempo»: id del tramo de transcurrido desde el
   * cierre (ver TRAMOS_TIEMPO — p. ej. ">3"). undefined = todos.
   */
  tiempo?: string;
}

// ─── KIT INSTRUCCIONES-sup-e14-vida-v1 (SUP-3) — tipos nuevos ──────────────

/** Tipo de notificación del Centro de Notificaciones (T5). */
export type TipoNotificacion =
  | "rescaneo"
  | "retraso"
  | "transmision"
  | "sistema";

/** Notificación del demo (T5). Se sembrada en el mock; las acciones de T4
 * agregan más. `fecha` = epoch ms; la vista muestra timestamp relativo. */
export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  texto: string;
  fecha: number;
  /** Punto de no-leída (badge del sidebar = contador de no leídas). */
  leida: boolean;
}

/** Tipo de anomalía (T6) — catálogo del kit. */
export type TipoAnomalia =
  | "Rescaneo"
  | "Mesa incompleta"
  | "Transmisión caída"
  | "Desfase de hora";

export type SeveridadAnomalia = "critica" | "alta" | "media";

/** Anomalía del demo (T6): 5 abiertas sembradas (badge dinámico real). */
export interface Anomalia {
  id: string;
  tipo: TipoAnomalia;
  puestoId: string;
  puesto: string;
  /** Mesa afectada, si aplica. */
  mesaId?: string;
  severidad: SeveridadAnomalia;
  fecha: number;
  /** Abierta (false) o revisada (true). Badge = abiertas restantes. */
  revisada: boolean;
}

/** Resultado de UNA transición de vida (T3): mesa EN_PROCESO → COMPLETO. */
export interface TransicionVida {
  puestoId: string;
  mesaId: string;
  /** Estado del puesto tras recalcular (COMPLETO solo si completó). */
  puestoEstado: EstadoGlobal;
  /** true si el puesto completó y los KPIs deben moverse en vivo. */
  puestoCompletado: boolean;
}
