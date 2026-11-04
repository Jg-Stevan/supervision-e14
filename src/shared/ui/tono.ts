/**
 * Capa shared (R2) — mapa tono→token CSS (kit SUP-1 §2.1).
 *
 * Home único del mapa tono→`var(--…)` duplicado ×3 (reporte 04 §B2 #8):
 *
 * · supervision/components/kpi-card.tsx:17-22 — VAR_TONO (Record completo,
 *   con "neutral" → var(--neutral-state)). FUENTE CANÓNICA (la más completa).
 * · perfil-dispositivo/components/panel-perfil.tsx:85-92 — ternario
 *   equivalente (KpiPerfil). Adopción pendiente (archivo de otro agente).
 * · supervision/components/supervision-shell.tsx:318-323 — ternario
 *   equivalente SIN "neutral" (solo success/warning/danger; el caso neutral
 *   es inalcanzable: tonoTier() jamás lo devuelve para ALTO/MEDIO/BAJO —
 *   test de paridad lo fija). Migrado a colorDeTono() en el commit R2.
 *
 * «Mover sin cambiar»: mismos 4 tokens, cero dependencias.
 */
export type Tono = "success" | "warning" | "danger" | "neutral";

/** Mapa canónico — idéntico a VAR_TONO de kpi-card.tsx:17-22. */
export const VAR_TONO: Record<Tono, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  neutral: "var(--neutral-state)",
};

/** Color (token CSS) de un tono — reemplaza los ternarios duplicados. */
export function colorDeTono(tono: Tono): string {
  return VAR_TONO[tono];
}

/**
 * R4 — chip de filtro/píldora de las vistas (reporte 02-b §5.1: duplicado
 * ×3). Clase COMPLETA idéntica a las copias de vista-recepcion /
 * vista-anomalias / vista-notificaciones (h-11 = 44px de toque).
 */
export const CLASE_CHIP =
  "label-caps inline-flex h-11 items-center gap-1.5 rounded-[4px] border px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)";
