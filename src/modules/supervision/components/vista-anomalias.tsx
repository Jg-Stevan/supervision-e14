"use client";

import { useState } from "react";
import { Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
// R4 — CLASE_CHIP único (reporte 02-b §5.1: duplicado ×3).
import { CLASE_CHIP } from "@/shared/ui/tono";
import { useDatos, useDatosAcciones } from "./datos-provider";
import { Esqueleto } from "./esqueleto";
import { tiempoRelativo } from "./tiempo";
import type { SeveridadAnomalia } from "../domain/types";

/**
 * Vista Revisión de Anomalías (kit SUP-3 T6): 5 abiertas sembradas (el
 * badge "Anomalía 5" del mockup es ahora contador dinámico real),
 * marcar revisada por fila y filtro por estado.
 */

const CLASE_SEVERIDAD: Record<SeveridadAnomalia, string> = {
  critica: "border-(--danger) text-(--danger)",
  alta: "border-(--warning) text-(--warning)",
  media: "border-border text-muted-foreground",
};

const ETIQUETA_SEVERIDAD: Record<SeveridadAnomalia, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
};

type Filtro = "abiertas" | "todas" | "revisadas";

export function VistaAnomalias() {
  const { cargando, anomalias, anomaliasAbiertas } = useDatos();
  // R4-C6 — las acciones del visor viven en SU contexto (ya no viajan en
  // el valor grande de datos).
  const { marcarAnomaliaRevisada, abrirVisorDeAnomalia } = useDatosAcciones();
  const [filtro, setFiltro] = useState<Filtro>("abiertas");

  if (cargando) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        {Array.from({ length: 5 }, (_, i) => (
          <Esqueleto key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const visibles = anomalias.filter((a) =>
    filtro === "abiertas" ? !a.revisada : filtro === "revisadas" ? a.revisada : true
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h2 className="headline-md">Revisión de anomalías</h2>
        <p className="body-md mt-1 text-muted-foreground">
          {anomaliasAbiertas} abierta{anomaliasAbiertas === 1 ? "" : "s"} de {anomalias.length} registradas
        </p>
      </header>

      <div className="flex items-center gap-2" role="group" aria-label="Filtro de anomalías">
        <button
          type="button"
          className={cn(CLASE_CHIP, filtro === "abiertas" && "border-(--primary) bg-(--accent) text-foreground")}
          aria-pressed={filtro === "abiertas"}
          onClick={() => setFiltro("abiertas")}
        >
          Abiertas
        </button>
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
          className={cn(CLASE_CHIP, filtro === "revisadas" && "border-(--primary) bg-(--accent) text-foreground")}
          aria-pressed={filtro === "revisadas"}
          onClick={() => setFiltro("revisadas")}
        >
          Revisadas
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-[4px] border border-border bg-card px-4 py-8 text-center">
          <p className="body-md text-muted-foreground">
            No hay anomalías en este filtro.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[4px] border border-border bg-card" aria-label="Lista de anomalías">
          {visibles.map((a) => (
            <li
              key={a.id}
              className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="body-md block">
                  {a.tipo}
                  {a.mesaId ? ` — Mesa ${a.mesaId}` : ""} ({a.puesto})
                </span>
                <span className="font-data text-[11px] text-muted-foreground">
                  {tiempoRelativo(a.fecha)}
                </span>
              </span>
              <span
                className={cn(
                  "label-caps rounded-[4px] border px-2 py-1",
                  CLASE_SEVERIDAD[a.severidad]
                )}
              >
                {ETIQUETA_SEVERIDAD[a.severidad]}
              </span>
              {/* KIT SUP-4 T3.4 — VER ACTA (punto de entrada 2/3): aterriza
                  en PÁGINA 2 cuando la advertencia de la anomalía es de
                  página 2 (lo decide el store). Sin mesa vinculada →
                  deshabilitado. */}
              <Button
                variant="ghost"
                size="sm"
                className="label-caps h-11 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground disabled:opacity-40"
                disabled={!a.mesaId}
                title={a.mesaId ? "Ver acta" : "Sin mesa vinculada"}
                aria-label={`Ver acta: ${a.tipo}${a.mesaId ? ` Mesa ${a.mesaId}` : ""} (${a.puesto})`}
                onClick={() => abrirVisorDeAnomalia(a)}
              >
                <FileText className="size-4" aria-hidden />
                Ver acta
              </Button>
              {a.revisada ? (
                <span className="label-caps inline-flex items-center gap-1.5 rounded-[4px] border border-(--success) px-2 py-1 text-(--success)">
                  <Check className="size-3" aria-hidden />
                  Revisada
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="label-caps h-11 border shadow-none hover:bg-transparent"
                  onClick={() => marcarAnomaliaRevisada(a.id)}
                  aria-label={`Marcar revisada: ${a.tipo} ${a.mesaId ? `Mesa ${a.mesaId}` : ""} (${a.puesto})`}
                >
                  Marcar revisada
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
