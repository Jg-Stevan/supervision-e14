import { Check, Clock, Zap } from "lucide-react";
import type { ResumenGlobal } from "../domain/types";

/** Barra "RESUMEN DE ESTADO" con chips de tint 10% (kit §2.4). */
export function ResumenChips({ resumen }: { resumen: ResumenGlobal }) {
  const chips = [
    {
      Icono: Zap,
      etiqueta: "CRÍTICO",
      valor: resumen.critico,
      color: "var(--danger)",
    },
    {
      Icono: Clock,
      etiqueta: "PENDIENTE",
      valor: resumen.pendiente,
      color: "var(--warning)",
    },
    {
      Icono: Check,
      etiqueta: "COMPLETO",
      valor: resumen.completo,
      color: "var(--success)",
    },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-border bg-card px-4 py-3">
      <p className="label-caps text-muted-foreground">Resumen de estado</p>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map(({ Icono, etiqueta, valor, color }) => (
          <span
            key={etiqueta}
            className="label-caps inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1"
            style={{
              color,
              borderColor: color,
              backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
            }}
          >
            <Icono className="size-3" aria-hidden />
            {etiqueta}: <span className="font-data font-semibold">{valor}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
