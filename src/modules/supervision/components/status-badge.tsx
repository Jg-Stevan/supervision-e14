import { Check, Clock, Minus, Zap, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { EstadoGlobal, EstadoMesa } from "../domain/types";

/**
 * Badge de estado (kit §2.1): fondo = color al 10% de opacidad + borde 1px
 * del color + icono + texto. PROHIBIDO rellenar la fila completa con color:
 * eso se hace con la barra de acento vertical 4px de la fila.
 */

type Estado = EstadoGlobal | EstadoMesa;

interface EstiloEstado {
  color: string;
  etiqueta: string;
  Icono: LucideIcon;
}

const ESTILOS: Record<Estado, EstiloEstado> = {
  COMPLETO: { color: "var(--success)", etiqueta: "COMPLETO", Icono: Check },
  CRITICO: { color: "var(--danger)", etiqueta: "CRÍTICO", Icono: Zap },
  PENDIENTE: { color: "var(--warning)", etiqueta: "PENDIENTE", Icono: Clock },
  NO_INICIADO: {
    color: "var(--neutral-state)",
    etiqueta: "NO INICIADO",
    Icono: Minus,
  },
  EN_PROCESO: { color: "var(--warning)", etiqueta: "EN PROCESO", Icono: Clock },
  INCOMPLETO: { color: "var(--danger)", etiqueta: "INCOMPLETO", Icono: Zap },
};

/** Color de estado en formato var(...) para reusar en barras/acento. */
export function colorDeEstado(estado: Estado): string {
  return ESTILOS[estado].color;
}

export function StatusBadge({
  estado,
  className,
}: {
  estado: Estado;
  className?: string;
}) {
  const { color, etiqueta, Icono } = ESTILOS[estado];
  return (
    <span
      className={cn(
        "label-caps inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-2 py-1",
        className
      )}
      style={{
        color,
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <Icono className="size-3" aria-hidden />
      {etiqueta}
    </span>
  );
}
