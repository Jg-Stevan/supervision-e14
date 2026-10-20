"use client";

import { cn } from "cn";

/**
 * Summary/KPI card (kit SUP-1 §2.3): título label-caps + stats-number +
 * top-border 2px del color de estado. Sin sombras.
 *
 * KIT SUP-3 T3: las cards con estado son CLICKEABLES (aplican/quitan su
 * filtro de estado) — accesibles como botón (aria-pressed), hover con
 * cambio de bg (nunca sombra). "Total puestos" no tiene estado → no es
 * clickeable.
 */

export type TonoKpi = "success" | "warning" | "danger" | "neutral";

const VAR_TONO: Record<TonoKpi, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  neutral: "var(--neutral-state)",
};

export function KpiCard({
  titulo,
  valor,
  tono,
  onClick,
  activo = false,
}: {
  titulo: string;
  valor: number;
  tono: TonoKpi;
  /** Presente = card clickeable (filtro de estado, kit T3). */
  onClick?: () => void;
  /** Filtro de estado activo (visual del toggle). */
  activo?: boolean;
}) {
  const color = VAR_TONO[tono];
  const apagado = tono === "neutral";
  const clase = cn(
    "rounded-[4px] border border-border border-t-2 bg-card px-4 py-3 text-left",
    onClick &&
      "hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)",
    activo && "bg-(--accent)"
  );
  const contenido = (
    <>
      <p className="label-caps text-muted-foreground">{titulo}</p>
      <p
        className={cn("stats-number", apagado && "text-muted-foreground")}
        style={apagado ? undefined : { color }}
      >
        {valor}
      </p>
    </>
  );

  if (!onClick) {
    return (
      <div className={clase} style={{ borderTopColor: color }}>
        {contenido}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={clase}
      style={{ borderTopColor: color }}
      onClick={onClick}
      aria-pressed={activo}
      aria-label={`${titulo}: ${valor}. ${activo ? "Quitar filtro" : "Filtrar por este estado"}`}
    >
      {contenido}
    </button>
  );
}
