"use client";

import { Check, Clock, Zap } from "lucide-react";
import type { ResumenGlobal } from "../domain/types";

/**
 * Barra "RESUMEN DE ESTADO" con chips de tint 10% (kit SUP-1 §2.4).
 * KIT SUP-3 T3: añade el ticker "Sincronizado hace Xs" (mono) — la vida
 * del dashboard corre DESPUÉS de cargar; el estado inicial (D6) intacto.
 */
export function ResumenChips({
  resumen,
  sincronizadoHace,
}: {
  resumen: ResumenGlobal;
  /** Texto del ticker (p. ej. "Sincronizado hace 15s"). */
  sincronizadoHace?: string;
}) {
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
      <div className="flex flex-wrap items-center gap-3">
        <p className="label-caps text-muted-foreground">Resumen de estado</p>
        {sincronizadoHace && (
          <p
            className="font-data text-[11px] text-muted-foreground"
            role="status"
            aria-live="off"
          >
            {sincronizadoHace}
          </p>
        )}
      </div>
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
