"use client";

import { useState } from "react";
import { AlertTriangle, CheckCheck, Clock, Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
// R4 — CLASE_CHIP único (reporte 02-b §5.1: duplicado ×3).
import { CLASE_CHIP } from "@/shared/ui/tono";
import { useDatos, useDatosAcciones } from "./datos-provider";
import { Esqueleto } from "./esqueleto";
import { tiempoRelativo } from "./tiempo";
import type { TipoNotificacion } from "../domain/types";

/**
 * Vista Centro de Notificaciones (kit SUP-3 T5): lista con semillas
 * coherentes, punto de no-leída, marcar leída (clic), marcar todas,
 * filtro Todas/No leídas y badge dinámico en el sidebar (lo pinta el
 * shell desde el store).
 */

const ICONOS_TIPO: Record<
  TipoNotificacion,
  { Icono: typeof AlertTriangle; clase: string; etiqueta: string }
> = {
  rescaneo: { Icono: AlertTriangle, clase: "text-(--danger)", etiqueta: "Rescaneo" },
  retraso: { Icono: Clock, clase: "text-(--warning)", etiqueta: "Retraso" },
  transmision: { Icono: Zap, clase: "text-(--danger)", etiqueta: "Transmisión" },
  sistema: { Icono: Info, clase: "text-muted-foreground", etiqueta: "Sistema" },
};

type Filtro = "todas" | "no-leidas";

export function VistaNotificaciones() {
  const { cargando, notificaciones, notificacionesNoLeidas } = useDatos();
  // R4-C6 — las acciones viven en SU contexto (ya no viajan en el valor
  // grande de datos).
  const { marcarNotificacionLeida, marcarTodasLeidas } = useDatosAcciones();
  const [filtro, setFiltro] = useState<Filtro>("todas");

  if (cargando) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        {Array.from({ length: 5 }, (_, i) => (
          <Esqueleto key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const visibles =
    filtro === "no-leidas"
      ? notificaciones.filter((n) => !n.leida)
      : notificaciones;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline-md">Centro de notificaciones</h2>
        <Button
          variant="outline"
          size="sm"
          className="label-caps h-11 border shadow-none hover:bg-transparent"
          onClick={marcarTodasLeidas}
          disabled={notificacionesNoLeidas === 0}
        >
          <CheckCheck className="size-4" aria-hidden />
          Marcar todas como leídas
        </Button>
      </header>

      <div className="flex items-center gap-2" role="group" aria-label="Filtro de notificaciones">
        <button
          type="button"
          className={cn(CLASE_CHIP, filtro === "todas" && "border-(--primary) bg-(--accent) text-foreground")}
          aria-pressed={filtro === "todas"}
          onClick={() => setFiltro("todas")}
        >
          Todas
        </button>
        <button
          type="button"
          className={cn(CLASE_CHIP, filtro === "no-leidas" && "border-(--primary) bg-(--accent) text-foreground")}
          aria-pressed={filtro === "no-leidas"}
          onClick={() => setFiltro("no-leidas")}
        >
          No leídas
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-[4px] border border-border bg-card px-4 py-8 text-center">
          <p className="body-md text-muted-foreground">
            No hay notificaciones {filtro === "no-leidas" ? "sin leer" : ""}.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[4px] border border-border bg-card" aria-label="Lista de notificaciones">
          {visibles.map((n) => {
            const { Icono, clase, etiqueta } = ICONOS_TIPO[n.tipo];
            return (
              <li key={n.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => marcarNotificacionLeida(n.id)}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)",
                    !n.leida && "bg-(--surface-lowest)"
                  )}
                  aria-label={`${n.leida ? "Leída" : "No leída"}. ${etiqueta}. ${n.texto}. Marcar como leída`}
                >
                  <Icono className={cn("mt-0.5 size-4 shrink-0", clase)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("body-md block", !n.leida && "font-semibold")}>
                      {n.texto}
                    </span>
                    <span className="font-data text-[11px] text-muted-foreground">
                      {etiqueta} · {tiempoRelativo(n.fecha)}
                    </span>
                  </span>
                  {/* Punto de no-leída (desaparece al marcar). */}
                  {!n.leida && (
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-(--primary)"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
