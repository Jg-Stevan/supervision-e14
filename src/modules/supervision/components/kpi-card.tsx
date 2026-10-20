import { cn } from "cn";

/**
 * Summary/KPI card (kit §2.3): título label-caps + stats-number +
 * top-border 2px del color de estado. Sin sombras.
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
}: {
  titulo: string;
  valor: number;
  tono: TonoKpi;
}) {
  const color = VAR_TONO[tono];
  const apagado = tono === "neutral";
  return (
    <div
      className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
      style={{ borderTopColor: color }}
    >
      <p className="label-caps text-muted-foreground">{titulo}</p>
      <p
        className={cn("stats-number", apagado && "text-muted-foreground")}
        style={apagado ? undefined : { color }}
      >
        {valor}
      </p>
    </div>
  );
}
