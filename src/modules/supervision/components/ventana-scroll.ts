/**
 * P-25 (plan 2026-11-12) — VENTANA DE FILAS del monitor (§5.4, DEUDA P1).
 *
 * El monitor monta ~949 <tbody> (uno por puesto, kit §2.4) — ~14k componentes;
 * la «virtualización barata» vigente es CSS (`content-visibility:auto`), que
 * skipa el PINTADO pero no el DOM ni el re-render del árbol. La regla del
 * plan: MEDIR primero, VIRTUALIZAR sin paginar (regla heredada: JAMÁS
 * paginación), manteniendo la fila semántica <tbody>/<tr> y la accesibilidad
 * R4-C7.
 *
 * Este módulo es la LÓGICA PURA de la ventana (testeable sin DOM):
 *  · `alturasDeFilas` — altura de cada fila: la REAL medida de los abiertos
 *    (el subdetalle de mesas es mucho más alto que una fila cerrada) y la
 *    estimación 49 px de los cerrados (la misma de contain-intrinsic-size:
 *    h-12 + borde).
 *  · `rangoVisible` — índices [desde, hasta) visibles ± margen, con SUMAS
 *    PREFIJAS + búsqueda binaria (O(log n) por scroll — el cálculo NO escala
 *    con el catálogo).
 *
 * El render mantiene el tamaño honesto del scroll con DOS espaciadores
 * <tbody aria-hidden> (superior/inferior) que suman las alturas de las filas
 * FUERA de la ventana: el scrollbar refleja el catálogo completo, la ventana
 * solo monta ~30-40 filas (criterio de cierre: DOM < ~50 filas montadas).
 */

/** Estimación de fila CERRADA (la misma de contain-intrinsic-size: h-12 48px
 *  + borde 1px = 49 px). Los CERRADOS sin medición usan esto. */
export const ALTURA_CERRADA = 49;
/** Estimación de fila ABIERTA hasta la primera medición real (el subdetalle
 *  de mesas: cabecera + filas de mesa). Se corrige sola al medir. */
export const ALTURA_ABIERTA_ESTIMADA = 320;

/** Alturas por índice de fila: reales (medidas) para los abiertos, estimación
 *  para el resto. Pura, sin DOM. */
export function alturasDeFilas(
  total: number,
  abiertos: ReadonlySet<number>,
  alturasReales: ReadonlyMap<number, number>,
  alturaCerrada: number = ALTURA_CERRADA,
  alturaAbiertaEstimada: number = ALTURA_ABIERTA_ESTIMADA,
): number[] {
  const alturas = new Array<number>(total);
  for (let i = 0; i < total; i++) {
    const real = abiertos.has(i) ? alturasReales.get(i) : undefined;
    alturas[i] =
      typeof real === "number" && real > 0
        ? real
        : abiertos.has(i)
          ? alturaAbiertaEstimada
          : alturaCerrada;
  }
  return alturas;
}

/** Rango [desde, hasta) de filas que cubren el scrollport ± margen, con sumas
 *  prefijas + búsqueda binaria. Pura. `total === 0` → [0, 0). */
export function rangoVisible(
  alturas: readonly number[],
  scrollTop: number,
  alturaViewport: number,
  margen: number,
): { desde: number; hasta: number } {
  const total = alturas.length;
  if (total === 0) return { desde: 0, hasta: 0 };

  // Sumas prefijas: prefijo[i] = altura acumulada ANTES de la fila i.
  const prefijo = new Array<number>(total + 1);
  prefijo[0] = 0;
  for (let i = 0; i < total; i++) prefijo[i + 1] = prefijo[i] + alturas[i];
  const totalAltura = prefijo[total];

  /** Primer índice cuya fila TERMINA después de `y` px (búsqueda binaria). */
  const indiceEn = (y: number): number => {
    const yClamp = Math.max(0, Math.min(y, totalAltura - 1));
    let lo = 0;
    let hi = total - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefijo[mid + 1] <= yClamp) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const desde = Math.max(0, indiceEn(scrollTop) - margen);
  const hasta = Math.min(total, indiceEn(scrollTop + Math.max(1, alturaViewport)) + 1 + margen);
  return { desde, hasta };
}

/** Altura de los espaciadores: la suma de las alturas de las filas FUERA de
 *  la ventana (superior: [0, desde) · inferior: [hasta, total)). Pura. */
export function alturaDeEspaciador(
  alturas: readonly number[],
  desde: number,
  hasta: number,
): { arriba: number; abajo: number } {
  let arriba = 0;
  for (let i = 0; i < Math.min(desde, alturas.length); i++) arriba += alturas[i];
  let abajo = 0;
  for (let i = Math.max(0, hasta); i < alturas.length; i++) abajo += alturas[i];
  return { arriba, abajo };
}
