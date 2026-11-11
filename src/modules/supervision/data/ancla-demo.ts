/**
 * Auditoría 2026-11-11 (#4) — ANCLA DEMO del panel de supervisión.
 *
 * El panel servía estados SEMBRADOS (acta real de Roma mesa 001, 7
 * notificaciones, 7 anomalías) como si fueran datos vivos: sin banner y sin
 * interruptor, cualquiera podía confundir el demo con producción. Este
 * módulo centraliza la ÚNICA pregunta «¿el ancla está activa?»:
 *
 *   · default FALSE (flag `anclaDemoSupervision`): el panel arranca vacío,
 *     sin ancla y con el banner DEMO visible — nada sembrado se presenta
 *     como real.
 *   · con el flag ON el demo completo se siembra, y el banner sigue visible
 *     (el estado SIEMPRE se rotula).
 *
 * `configurarAnclaDemo` es la vía de los TESTS (fija el valor sin tocar
 * localStorage ni el memo de leerFlags). `null` vuelve a consultar el flag.
 */
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";

let forzada: boolean | null = null;

/** ¿Está activo el ancla DEMO? (flag + override de test; nunca lanza). */
export function anclaDemoActiva(): boolean {
  if (forzada !== null) return forzada;
  try {
    return leerFlags().anclaDemoSupervision === true;
  } catch {
    return false;
  }
}

/** Fija (`true`/`false`) o libera (`null`) el ancla para tests. */
export function configurarAnclaDemo(valor: boolean | null): void {
  forzada = valor;
}
