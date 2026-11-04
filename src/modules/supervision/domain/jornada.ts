/**
 * Calendario canónico de la JORNADA ELECTORAL en el exterior — segunda
 * vuelta presidencial de Colombia 2026 (kit monitor-jornada-v1).
 *
 * Contexto (vault §01 «Digitalización en el Exterior»): la votación en
 * consulados NO dura un día — son SIETE días consecutivos (lunes a
 * domingo de la semana electoral), con conteo y digitalización del E-14
 * día a día (cierre 4:00 p. m. hora local). El domingo es la jornada de
 * cierre, que coincide con el día de elecciones en Colombia.
 *
 * Fuente de verdad del DÍA: el catálogo DIVIPOLA exterior trae el día
 * EN el nombre del puesto («LUNES LISBOA - CONSULADO», «SABADO LISBOA -
 * CONSULADO», …). Los puestos SIN prefijo de día (253) son la jornada de
 * cierre del domingo: 2.181 mesas vs 1.489 lun-sáb (números exactos del
 * catálogo, §README del vault «Mesas y volumen electoral 2026»).
 *
 * Este módulo no depende de ninguna librería (frontera de dominio).
 */

/** Días de la jornada electoral en el exterior (orden del calendario). */
export type DiaJornada =
  | "LUNES"
  | "MARTES"
  | "MIERCOLES"
  | "JUEVES"
  | "VIERNES"
  | "SABADO"
  | "DOMINGO";

/** Un día de la jornada con sus etiquetas listas para la UI. */
export interface DiaCalendario {
  /** Id canónico (coincide con el prefijo del catálogo DIVIPOLA). */
  id: DiaJornada;
  /** Etiqueta larga para el dropdown ("Lunes 15 de junio"). */
  etiqueta: string;
  /** Etiqueta corta para espacio reducido ("Lun 15 jun"). */
  etiquetaCorta: string;
  /** Fecha ISO del calendario electoral (2026 — ancla del demo). */
  iso: string;
  /** true en la jornada de cierre (domingo — día de elecciones en CO). */
  esCierre: boolean;
}

/**
 * Semana electoral de la segunda vuelta 2026: lunes 15 → domingo 21 de
 * junio de 2026 (elecciones en Colombia el domingo 21 — ancla del
 * escenario «ubicados una semana antes», pedido del dueño).
 */
export const DIAS_JORNADA: readonly DiaCalendario[] = [
  { id: "LUNES", etiqueta: "Lunes 15 de junio", etiquetaCorta: "Lun 15 jun", iso: "2026-06-15", esCierre: false },
  { id: "MARTES", etiqueta: "Martes 16 de junio", etiquetaCorta: "Mar 16 jun", iso: "2026-06-16", esCierre: false },
  { id: "MIERCOLES", etiqueta: "Miércoles 17 de junio", etiquetaCorta: "Mié 17 jun", iso: "2026-06-17", esCierre: false },
  { id: "JUEVES", etiqueta: "Jueves 18 de junio", etiquetaCorta: "Jue 18 jun", iso: "2026-06-18", esCierre: false },
  { id: "VIERNES", etiqueta: "Viernes 19 de junio", etiquetaCorta: "Vie 19 jun", iso: "2026-06-19", esCierre: false },
  { id: "SABADO", etiqueta: "Sábado 20 de junio", etiquetaCorta: "Sáb 20 jun", iso: "2026-06-20", esCierre: false },
  { id: "DOMINGO", etiqueta: "Domingo 21 de junio", etiquetaCorta: "Dom 21 jun", iso: "2026-06-21", esCierre: true },
];

/** Días en orden canónico (solo ids — útil para derivaciones). */
const DIAS_POR_ORDEN: readonly DiaJornada[] = DIAS_JORNADA.map((d) => d.id);

/**
 * Día de jornada a partir del nombre REAL del puesto del catálogo.
 * Los puestos diurnos traen el prefijo literal («LUNES ACCRA…»,
 * «SABADO LISBOA…» — sin tildes, como viene del DIVIPOLA); los puestos
 * base sin prefijo son la jornada de cierre del DOMINGO.
 */
export function diaDeNombrePuesto(nombre: string): DiaJornada {
  const normalizado = nombre.trim().toUpperCase();
  for (const dia of DIAS_POR_ORDEN) {
    if (dia === "DOMINGO") continue; // jamás prefijo: «Santo Domingo» es base
    if (normalizado.startsWith(`${dia} `)) return dia;
  }
  return "DOMINGO";
}

/** Definición de calendario de un día (null si el id no existe). */
export function diaCalendario(id: DiaJornada): DiaCalendario {
  const hallado = DIAS_JORNADA.find((d) => d.id === id);
  // El id sale de la unión DiaJornada — siempre existe en el calendario.
  return hallado as DiaCalendario;
}
