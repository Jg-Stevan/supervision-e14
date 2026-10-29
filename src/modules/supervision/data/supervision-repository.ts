/**
 * Punto de intercambio de datos del módulo de supervisión E-14.
 *
 * Punto de intercambio: en la integración al digitalizador se reemplaza
 * mockSupervisionRepository por la implementación real. Nada más cambia.
 *
 * KIT SUP-3 (T2 / D12): la interfaz pasa a ASYNC (el repositorio real del
 * digitalizador será async — se adelanta el contrato) y añade las
 * mutaciones de T4 y la transición de vida de T3. Sin backend: la única
 * implementación sigue siendo el mock.
 */

import type { ActaMesa, FormularioTipo } from "../domain/acta";
import type {
  Anomalia,
  FiltrosPuestos,
  Mesa,
  Notificacion,
  Puesto,
  ResumenGlobal,
  TransicionVida,
} from "../domain/types";

export interface SupervisionRepository {
  getResumen(): Promise<ResumenGlobal>;
  getPuestos(filtros?: FiltrosPuestos): Promise<Puesto[]>;
  getMesasDePuesto(puestoId: string): Promise<Mesa[]>;
  /** Semillas del demo (T5): 6-8 notificaciones coherentes. */
  getNotificaciones(): Promise<Notificacion[]>;
  /** Semillas del demo (T6): 5 abiertas + histórico revisado. */
  getAnomalias(): Promise<Anomalia[]>;
  /** T4 — REINSPECCIONAR: resuelve el alerta "Rescaneo" de una mesa
   * (latencia simulada ~2.5 s), recalcula mesa y puesto. Devuelve la mesa
   * actualizada + la notificación generada; null si no aplica. */
  resolverRescaneo(
    puestoId: string,
    mesaId: string
  ): Promise<{ mesa: Mesa; notificacion: Notificacion } | null>;
  /** T3 — una transición de vida (mesa EN_PROCESO → COMPLETO), con
   * preferencia por la que COMPLETA su puesto (KPIs en vivo). */
  aplicarTransicionVida(): Promise<TransicionVida | null>;

  // ── KIT SUP-4 (actas-v1) ────────────────────────────────────────────────
  /** T1 — el acta de una mesa (null = mesa sin transmisión). Latencia
   * ~400 ms igual que el resto. Firma (puestoId, mesaId) igual que
   * resolverRescaneo: los ids de mesa NO son únicos entre puestos. */
  getActaDeMesa(puestoId: string, mesaId: string): Promise<ActaMesa | null>;
  /** T5 — APROBAR Y MARCAR COMO VÁLIDA (spinner ~2.5 s). Devuelve el acta
   * actualizada + la notificación generada; null si el acta no existe. */
  aprobarActa(
    actaId: string,
    observacion: string
  ): Promise<{ acta: ActaMesa; notificacion: Notificacion; anomalia?: Anomalia } | null>;
  /** T5 — CONFIRMAR RESCANEO (spinner ~2.5 s, versión 1→2). La
   * observación es obligatoria para ambas acciones (T5.2). */
  confirmarRescanActa(
    actaId: string,
    observacion: string
  ): Promise<{ acta: ActaMesa; notificacion: Notificacion } | null>;
  /** KIT stitch-visor-actas-v1 — REPORTAR ANOMALÍA desde el panel de
   * auditoría del visor (spinner ~2.5 s). Registra el evento CRÍTICO en el
   * historial del acta, abre una anomalía en el monitor y genera la
   * notificación; null si el acta no existe. La observación (motivo) es
   * obligatoria. */
  reportarAnomaliaActa(
    actaId: string,
    observacion: string
  ): Promise<{ acta: ActaMesa; notificacion: Notificacion } | null>;

  // ── KIT carga-masiva-supervision-v1 (D27) ───────────────────────────────
  /** CARGA MASIVA — registra la llegada de una acta del digitalizador:
   * actualiza las partes de la mesa según el formulario/páginas recibidas
   * (TRANSMISION pág n → transmisión pn ok · DELEGADOS → delegados ok),
   * recalcula mesa + puesto y genera la notificación del evento. El ACTA
   * (fotos/encabezado) vive en `actas-runtime.ts` — este método solo mueve
   * el ESTADO del monitor. null si el puesto/mesa no existen. */
  registrarCargaMasiva(
    puestoId: string,
    mesaId: string,
    formulario: FormularioTipo,
    paginas: number[]
  ): Promise<{ mesa: Mesa; notificacion: Notificacion } | null>;
}
