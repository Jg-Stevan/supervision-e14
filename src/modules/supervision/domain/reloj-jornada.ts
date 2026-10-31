/**
 * RELOJ REAL de la jornada — pedido del dueño (ronda «reloj real»):
 *
 *   «reloj real, cambia el estado del puesto, local es colombia país es
 *   el q emite»
 *
 * Semántica:
 * - LOCAL = Colombia (America/Bogota): la semana electoral se ancla a la
 *   fecha de HOY en Colombia y el reloj del supervisor es el de Bogotá.
 * - PAÍS = el que emite: cada puesto vive la hora REAL de su país (zona
 *   IANA de domain/zonas-emisor) y cierra la digitalización a las
 *   4:00 p. m. HORA LOCAL de ese país (kit monitor-jornada-v1).
 * - El estado del puesto CAMBIA con el reloj: antes de las 16:00 del país
 *   emisor es NO INICIADO; al cerrar arranca la digitalización (un puesto
 *   normalmente dura ~1 hora); > 1 hora es amarillo (pendiente) y > 3
 *   horas rojo CRÍTICO (umbral del dueño, domain/tiempo-cierre).
 *
 * El instante de cierre se deriva con `Intl.DateTimeFormat` (stdlib, sin
 * librerías): ancla iterativa que ubica 16:00 LOCAL del país en la fecha
 * de su jornada de la semana actual. El día de jornada sale del prefijo
 * real del catálogo (domain/jornada): LUNES…SABADO; base = DOMINGO.
 *
 * Frontera de dominio: sin dependencias de librerías ni de CSS.
 */

import { CIERRE_LOCAL_MIN } from "./tiempo-cierre";
import type { DiaJornada } from "./jornada";

/** Zona del supervisor (LOCAL): Colombia. La semana electoral es suya. */
export const ZONA_LOCAL = "America/Bogota";

/** Minutos del día en la zona dada para el instante `t`. */
export interface PartesLocales {
  anio: number;
  mes: number;
  dia: number;
  min: number;
}

/** Cache de formateadores Intl por zona (módulo — barato y estable). */
const FORMATADORES = new Map<string, Intl.DateTimeFormat>();

function formateadorDeZona(zona: string): Intl.DateTimeFormat {
  let fmt = FORMATADORES.get(zona);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    FORMATADORES.set(zona, fmt);
  }
  return fmt;
}

/** Y/M/D + minutos del día LOCALES de la zona en el instante dado. */
export function partesDeZona(zona: string, t: number): PartesLocales {
  const mapa: Record<string, string> = {};
  for (const p of formateadorDeZona(zona).formatToParts(new Date(t))) {
    mapa[p.type] = p.value;
  }
  return {
    anio: Number(mapa.year),
    mes: Number(mapa.month),
    dia: Number(mapa.day),
    min: (Number(mapa.hour) % 24) * 60 + Number(mapa.minute),
  };
}

/**
 * Instante (epoch ms) en el que SON `minutosDelDia` hora LOCAL del país
 * en la fecha dada. Ancla iterativa: parte del mediodía UTC de esa fecha
 * y corrige con la diferencia observada (1-2 pasadas — la fecha anclada
 * al mediodía difiere a lo sumo ±1 día, y el ajuste de hora no la mueve
 * salvo transición DST, que se re-corrige en la pasada final).
 */
export function instanteDeLocal(
  zona: string,
  anio: number,
  mes: number,
  dia: number,
  minutosDelDia: number
): number {
  let t = Date.UTC(anio, mes - 1, dia, 12, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const p = partesDeZona(zona, t);
    const deltaDias = Math.round(
      (Date.UTC(anio, mes - 1, dia) - Date.UTC(p.anio, p.mes - 1, p.dia)) /
        86_400_000
    );
    if (deltaDias !== 0) {
      t += deltaDias * 86_400_000;
      continue;
    }
    t += (minutosDelDia - p.min) * 60_000;
    const p2 = partesDeZona(zona, t);
    const delta2 = Math.round(
      (Date.UTC(anio, mes - 1, dia) - Date.UTC(p2.anio, p2.mes - 1, p2.dia)) /
        86_400_000
    );
    if (delta2 !== 0) t += delta2 * 86_400_000;
    return t;
  }
  return t;
}

/** Índice del día de jornada dentro de la semana (LUNES=0 … DOMINGO=6). */
const INDICE_DIA: Record<DiaJornada, number> = {
  LUNES: 0,
  MARTES: 1,
  MIERCOLES: 2,
  JUEVES: 3,
  VIERNES: 4,
  SABADO: 5,
  DOMINGO: 6,
};

/** Fecha (Y/M/D en UTC de referencia) del LUNES de la semana actual de
 * COLOMBIA — el marco temporal del supervisor («local es colombia»). */
function lunesDeLaSemanaActual(ahora: number): { anio: number; mes: number; dia: number } {
  const hoy = partesDeZona(ZONA_LOCAL, ahora);
  const dow = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia)).getUTCDay();
  const desdeLunes = (dow + 6) % 7; // LUNES=0 … DOMINGO=6
  const lunes = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia) - desdeLunes * 86_400_000;
  const ref = new Date(lunes);
  return { anio: ref.getUTCFullYear(), mes: ref.getUTCMonth() + 1, dia: ref.getUTCDate() };
}

/** Cache de instantes de cierre — clave zona|dia|semanaISO (el instante
 * no cambia dentro de la semana; el re-minuto solo resta). */
const CIERRES = new Map<string, number>();

/**
 * Instante del cierre de la digitalización del puesto: 4:00 p. m. HORA
 * LOCAL del país emisor, en la FECHA de su día de jornada de la semana
 * electoral actual (la semana de HOY en Colombia).
 */
export function instanteCierreDeJornada(
  zona: string,
  dia: DiaJornada,
  ahora: number
): number {
  const lunes = lunesDeLaSemanaActual(ahora);
  const semanaISO = Date.UTC(lunes.anio, lunes.mes - 1, lunes.dia);
  const clave = `${zona}|${dia}|${semanaISO}`;
  const cacheado = CIERRES.get(clave);
  if (cacheado !== undefined) return cacheado;
  const fecha = new Date(semanaISO + INDICE_DIA[dia] * 86_400_000);
  const instante = instanteDeLocal(
    zona,
    fecha.getUTCFullYear(),
    fecha.getUTCMonth() + 1,
    fecha.getUTCDate(),
    CIERRE_LOCAL_MIN
  );
  CIERRES.set(clave, instante);
  return instante;
}

/**
 * Minutos REALES transcurridos desde el cierre del puesto (negativos =
 * aún no son las 4:00 p. m. del país emisor → NO INICIADO).
 */
export function minutosDesdeCierreReal(
  zona: string,
  dia: DiaJornada,
  ahora: number
): number {
  return Math.round((ahora - instanteCierreDeJornada(zona, dia, ahora)) / 60_000);
}

/** "h:mm AM/PM" — reloj humano a partir de partes locales. */
function relojDePartes(p: PartesLocales): string {
  const h24 = Math.floor(p.min / 60);
  const mm = String(p.min % 60).padStart(2, "0");
  const sufijo = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${sufijo}`;
}

/** "h:mm AM/PM" — la hora ACTUAL del país emisor (avanza con el reloj). */
export function relojDeZona(zona: string, ahora: number): string {
  return relojDePartes(partesDeZona(zona, ahora));
}

/** "h:mm AM/PM" — la hora de COLOMBIA en el instante dado (LOCAL). */
export function relojColombia(ahora: number): string {
  return relojDeZona(ZONA_LOCAL, ahora);
}

/** "h:mm:ss AM/PM" — reloj Colombia con segundos (chip vivo del monitor). */
export function relojColombiaConSegundos(ahora: number): string {
  const d = new Date(ahora);
  const fmt = (opt: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA_LOCAL, ...opt }).format(d);
  const h24 = Number(fmt({ hourCycle: "h23", hour: "2-digit" }));
  const mm = fmt({ minute: "2-digit" });
  const ss = fmt({ second: "2-digit" });
  const sufijo = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")} ${sufijo}`;
}

/**
 * «Cierre COL» REAL: la hora de COLOMBIA en la que cierra el puesto
 * (4:00 p. m. local del país emisor, convertida al huso de Bogotá).
 */
export function cierreColombiaDe(
  zona: string,
  dia: DiaJornada,
  ahora: number
): string {
  return relojDeZona(ZONA_LOCAL, instanteCierreDeJornada(zona, dia, ahora));
}

/** Día de jornada EN CURSO según la fecha de HOY en Colombia. */
export function diaJornadaHoy(ahora: number): DiaJornada {
  const hoy = partesDeZona(ZONA_LOCAL, ahora);
  const dow = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia)).getUTCDay();
  const orden: DiaJornada[] = [
    "DOMINGO",
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
  ];
  return orden[dow];
}
