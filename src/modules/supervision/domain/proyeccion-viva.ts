/**
 * PROYECCIÓN EN VIVO del puesto bajo el RELOJ REAL — pedido del dueño:
 *   «reloj real, cambia el estado del puesto, local es colombia país es
 *   el q emite»
 *
 * La semilla (mock-repository) conserva mesas/actas/pcts deterministas y
 * el horario COMPLETO del ancla Roma (kit §4.9). Todo puesto NO completo
 * se PROYECTA sobre el reloj real; los COMPLETOS alinean su «Cierre COL»
 * al huso real del emisor y conservan su historia sembrada coherente.
 *
 * - Hora actual = hora REAL del país emisor (avanza en vivo).
 * - «Cierre COL» = 4:00 p. m. local del país emisor convertida a Bogotá.
 * - TIEMPO = minutos reales desde ese cierre → tramo NO INICIADO / <1 /
 *   1-2 / 2-3 / >3 (clasificaciones del dueño).
 * - ESTADO GLOBAL en vivo (cambia con el reloj, jamás degrada):
 *     · COMPLETO  → sembrado/mesas completas (queda al fondo, verde).
 *     · min < 0   → NO_INICIADO (aún no son las 16:00 del país emisor).
 *     · min ≥ 180 → CRITICO (umbral del dueño, UMBRAL_CRITICO_MIN).
 *     · resto     → PENDIENTE (en curso; el color fino lo da el TIEMPO).
 * - Coherencia de recepción: un puesto que AÚN NO CIERRA no ha recibido
 *   nada → sus pcts se muestran en 0 (la subtabla conserva la semilla —
 *   límite del demo documentado en ESTADO-SESION.md).
 *
 * Pura y determinista respecto a `ahora` (epoch ms); `ahora === 0`
 * (snapshot de servidor / pre-hidratación) devuelve el puesto intacto.
 */

import type { Puesto } from "./types";
import { UMBRAL_CRITICO_MIN, tramoDeMinutos } from "./tiempo-cierre";
import {
  cierreColombiaDe,
  instanteCierreDeJornada,
  minutosDesdeCierreReal,
  relojDeZona,
} from "./reloj-jornada";

/**
 * Estado global EN VIVO por el reloj real (nunca degrada un COMPLETO —
 * regla §8d: 100 % visible ⟺ COMPLETO verde queda intacto).
 */
export function estadoGlobalEnVivo(
  sembrado: Puesto["estadoGlobal"],
  minutosDesdeCierre: number
): Puesto["estadoGlobal"] {
  if (sembrado === "COMPLETO") return "COMPLETO";
  if (minutosDesdeCierre < 0) return "NO_INICIADO";
  if (minutosDesdeCierre >= UMBRAL_CRITICO_MIN) return "CRITICO";
  return "PENDIENTE";
}

/**
 * Puesto proyectado sobre el reloj real. Si nada visible cambió respecto
 * a la proyección anterior, devuelve EL MISMO objeto (identidad estable
 * → el memo de las filas de la matriz evita re-renders inútiles).
 *
 * Los COMPLETOS conservan su HISTORIA sembrada (transcurrido y hora local
 * coherentes entre sí — 16:00 + t) PERO con el «Cierre COL» REAL de su
 * país emisor («país es el q emite»: la conversión a Bogotá manda para
 * TODOS los puestos). El ancla Roma (relojFijo) queda congelada al 100 %
 * (kit §4.9 — valores exactos del mockup).
 */
export function proyectarPuesto(puesto: Puesto, ahora: number): Puesto {
  // Snapshot de servidor / primer frame pre-hidratación: sin reloj.
  if (ahora === 0) return puesto;
  // Ancla Roma: horario completo del mockup, jamás se recalcula.
  if (puesto.relojFijo) return puesto;

  const cierreCol = cierreColombiaDe(puesto.zonaEmisor, puesto.diaJornada, ahora);

  // COMPLETO: estado/pcts/tiempo sembrados intactos (historia congelada,
  // regla §8d); solo su CIERRE COL se alinea al huso real del emisor y la
  // hora local se mantiene coherente con ese cierre + transcurrido.
  if (puesto.estadoGlobal === "COMPLETO") {
    if (cierreCol === puesto.horaCierreColombia) return puesto;
    const instante = instanteCierreDeJornada(
      puesto.zonaEmisor,
      puesto.diaJornada,
      ahora
    );
    return {
      ...puesto,
      horaCierreColombia: cierreCol,
      horaActualLocal: relojDeZona(
        puesto.zonaEmisor,
        instante + puesto.minutosDesdeCierre * 60_000
      ),
    };
  }

  const minutos = minutosDesdeCierreReal(
    puesto.zonaEmisor,
    puesto.diaJornada,
    ahora
  );
  const estado = estadoGlobalEnVivo(puesto.estadoGlobal, minutos);
  if (
    minutos === puesto.minutosDesdeCierre &&
    estado === puesto.estadoGlobal &&
    cierreCol === puesto.horaCierreColombia &&
    // Hora de país solo cambia cada minuto:
    relojDeZona(puesto.zonaEmisor, ahora) === puesto.horaActualLocal
  ) {
    return puesto;
  }
  return {
    ...puesto,
    minutosDesdeCierre: minutos,
    diferenciaTiempo: tramoDeMinutos(minutos).etiqueta,
    horaActualLocal: relojDeZona(puesto.zonaEmisor, ahora),
    horaCierreColombia: cierreCol,
    // Honestidad de recepción: sin cierre no hay actas recibidas.
    pctDelegado: minutos < 0 ? 0 : puesto.pctDelegado,
    pctTransmision: minutos < 0 ? 0 : puesto.pctTransmision,
    estadoGlobal: estado,
  };
}
