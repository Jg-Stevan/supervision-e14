/**
 * TIEMPO transcurrido desde el cierre del puesto — regla de negocio del
 * vault §01 (kit monitor-jornada-v1): la votación y la digitalización del
 * E-14 en consulados cierran a las 4:00 p. m. HORA LOCAL del país del
 * puesto de digitalización. La columna «Tiempo» de la matriz muestra el
 * transcurrido desde ese cierre, señalizado por color según las
 * CLASIFICACIONES del dueño (ronda «reloj real»):
 *
 *   < 0      → NO INICIADO (gris) — aún no son las 16:00 del país emisor
 *   < 1 hr   → ok (verde)      · digitalización al día (~1 hr normal)
 *   1-3 hrs  → alerta (ámbar)  · «toca estar pendiente del puesto»
 *   > 3 hrs  → crítico (rojo)  · «toca estar más atento» — umbral dueño
 *
 * Con el reloj real (domain/reloj-jornada) los minutos SON reales: el
 * tramo y el color cambian solos conforme avanza el reloj.
 *
 * Frontera de dominio: sin dependencias de librerías ni de CSS.
 */

/** Cierre de la jornada de digitalización: 4:00 p. m. hora local. */
export const CIERRE_LOCAL_MIN = 16 * 60;

/**
 * Umbral del dueño (feedback sobre la matriz del monitor): un puesto con
 * «más de 3 horas transcurridas» desde el cierre de sus mesas y que aún
 * no completa la digitalización pasa a estado CRÍTICO. Fuente ÚNICA del
 * umbral — alimenta el tramo «> 3 hrs» (columna «Tiempo»), la derivación
 * automática del estado en el mock (mock-repository) y el orden de
 * urgencia por defecto de la matriz.
 */
export const UMBRAL_CRITICO_MIN = 180;

/**
 * Severidad de señalización del tiempo transcurrido. "inicial" = NO
 * INICIADO (el puesto aún no cierra — antes de las 4:00 p. m. del país
 * emisor): gris, sin urgencia de digitalización.
 */
export type SeveridadTiempo = "inicial" | "ok" | "alerta" | "critico";

/** Un tramo de tiempo transcurrido desde el cierre (4:00 p. m. local). */
export interface TramoTiempo {
  /** Id canónico para el filtro de columna (p. ej. "1-2"). */
  id: string;
  /** Etiqueta de la matriz (p. ej. "1-2 hrs"). */
  etiqueta: string;
  /** Límite inferior en minutos (inclusivo). */
  minMin: number;
  /** Límite superior en minutos (exclusivo; Infinity = tramo abierto). */
  maxMin: number;
  severidad: SeveridadTiempo;
}

/**
 * Tramos canónicos en orden — alimenta la columna «Tiempo» y su filtro.
 * El PRIMER tramo es el NO INICIADO (minutos negativos: aún no cierra el
 * puesto en su país emisor — clasificación del dueño); los puestos de
 * jornadas FUTURAS de la semana (días por venir) caen aquí con valores
 * muy negativos, y la severidad gris los mantiene fuera de la urgencia.
 */
export const TRAMOS_TIEMPO: readonly TramoTiempo[] = [
  {
    id: "no-iniciado",
    etiqueta: "NO INICIADO",
    minMin: Number.NEGATIVE_INFINITY,
    maxMin: 0,
    severidad: "inicial",
  },
  { id: "<1", etiqueta: "< 1 hr", minMin: 0, maxMin: 60, severidad: "ok" },
  { id: "1-2", etiqueta: "1-2 hrs", minMin: 60, maxMin: 120, severidad: "alerta" },
  { id: "2-3", etiqueta: "2-3 hrs", minMin: 120, maxMin: UMBRAL_CRITICO_MIN, severidad: "alerta" },
  {
    id: ">3",
    etiqueta: "> 3 hrs",
    minMin: UMBRAL_CRITICO_MIN,
    maxMin: Number.POSITIVE_INFINITY,
    severidad: "critico",
  },
];

/**
 * Tramo por minutos transcurridos desde el cierre local 4:00 p. m.
 * Acepta negativos (NO INICIADO — aún no son las 16:00 del emisor).
 */
export function tramoDeMinutos(minutos: number): TramoTiempo {
  const hallado = TRAMOS_TIEMPO.find(
    (tramo) => minutos >= tramo.minMin && minutos < tramo.maxMin
  );
  // Cualquier minutos (también negativos) cae en algún tramo: el primero
  // es abierto por abajo y el último por arriba.
  return hallado as TramoTiempo;
}

/** Tramo por id canónico (filtro de columna); undefined si no existe. */
export function tramoDeId(id: string): TramoTiempo | undefined {
  return TRAMOS_TIEMPO.find((tramo) => tramo.id === id);
}

/**
 * "9:00 AM" → 540 — parsea el reloj del mockup ("h:mm AM/PM") a minutos
 * del día; NaN si no cuadra. Usado para ordenar opciones del filtro de
 * «Cierre COL» cronológicamente (no lexicográficamente).
 */
export function minutosDeReloj(reloj: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(reloj.trim());
  if (!m) return Number.NaN;
  let horas = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") horas += 12;
  return horas * 60 + Number(m[2]);
}
