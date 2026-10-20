/**
 * Punto de intercambio de datos del módulo de supervisión E-14 (kit SUP-1 §3-T2).
 *
 * Punto de intercambio: en la integración al digitalizador se reemplaza
 * mockSupervisionRepository por la implementación real. Nada más cambia.
 */

import type {
  FiltrosPuestos,
  Mesa,
  Puesto,
  ResumenGlobal,
} from "../domain/types";

export interface SupervisionRepository {
  getResumen(): ResumenGlobal;
  getPuestos(filtros?: FiltrosPuestos): Puesto[];
  getMesasDePuesto(puestoId: string): Mesa[];
}
