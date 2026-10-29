/**
 * Tipos compartidos del VISOR DE ACTAS (kit stitch-visor-actas-v1 —
 * diseño Stitch). El MODO del panel lateral deriva del estado del acta:
 *
 * - "auditoria": acta ya PUBLICADA/APROBADA → trazabilidad + anomalías.
 * - "envio-automatico": formulario TRANSMISIÓN pendiente → el sistema
 *   publica sola (solo cabe RECHAZAR/REESCANEAR).
 * - "ingreso-manual": formulario DELEGADOS pendiente → el supervisor
 *   ACEPTA o RECHAZA.
 */
export type ModoPanel = "auditoria" | "envio-automatico" | "ingreso-manual";
