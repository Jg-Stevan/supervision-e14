"use client";

import { GitCommitHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventoActa, NivelEventoActa } from "../../domain/acta";

/**
 * HISTORIAL Y TRAZABILIDAD (kit stitch-visor-actas-v1 — diseño Stitch):
 * timeline vertical con línea continua, puntos de color por nivel y
 * hora en mono — el evento más reciente ARRIBA (orden del array).
 *
 * Colores del punto (semántica Stitch): APROBADA/PUBLICADO → emerald,
 * ALERTA → amber, CRITICO → red, NEUTRAL → gray.
 */

const TONO_PUNTO: Record<NivelEventoActa, string> = {
  APROBADA: "bg-emerald-500",
  ALERTA: "bg-amber-500",
  CRITICO: "bg-brand-red",
  NEUTRAL: "bg-gray-500",
};

const TONO_HORA: Record<NivelEventoActa, string> = {
  APROBADA: "text-gray-400",
  ALERTA: "text-amber-400/90",
  CRITICO: "text-brand-red",
  NEUTRAL: "text-gray-500",
};

export function ActaHistorial({
  eventos,
  titulo = "HISTORIAL Y TRAZABILIDAD",
  mostrarCabecera = true,
  /** Clase del halo de los puntos (el fondo cambia entre panel y móvil). */
  claseHalo = "ring-brand-panel",
}: {
  eventos: EventoActa[];
  /** Etiqueta del encabezado (el panel de auditoría usa la del kit). */
  titulo?: string;
  /** Móvil: el collapsible ya trae su propio encabezado — sin cabecera. */
  mostrarCabecera?: boolean;
  claseHalo?: string;
}) {
  return (
    <div>
      {/* Encabezado con estado de sesión (diseño Stitch) */}
      {mostrarCabecera && (
        <div className="mb-3 flex items-center justify-between border-b border-brand-border pb-1.5">
          <span className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400/90">
            <GitCommitHorizontal className="size-4" aria-hidden />
            {titulo}
          </span>
          <span className="font-mono text-[10px] tracking-wider text-gray-500">
            SESIÓN ACTIVA
          </span>
        </div>
      )}

      {eventos.length === 0 ? (
        <p className="font-mono text-[11px] text-gray-500">
          Sin eventos registrados.
        </p>
      ) : (
        <ol
          className="relative space-y-5 pl-6 text-xs before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-brand-border-light"
          aria-label="Trazabilidad del acta"
        >
          {eventos.map((evento, indice) => (
            <li
              key={`${evento.hora}-${evento.titulo}-${indice}`}
              className="relative"
            >
              <span
                className={cn(
                  "absolute -left-6 top-1 size-2.5 rounded-full ring-4",
                  TONO_PUNTO[evento.nivel],
                  claseHalo
                )}
                aria-hidden
              />
              <div
                className={cn(
                  "font-mono text-[11px]",
                  TONO_HORA[evento.nivel]
                )}
              >
                {evento.hora}
              </div>
              <div className="mt-0.5 font-bold uppercase tracking-tight text-gray-200">
                {evento.titulo}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                {evento.detalle}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
