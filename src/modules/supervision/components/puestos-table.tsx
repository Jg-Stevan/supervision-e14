"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";
import type { Mesa, Puesto } from "../domain/types";
import { mockSupervisionRepository } from "../data/mock-repository";
import { colorDeEstado, StatusBadge } from "./status-badge";
import { MesasSubtable } from "./mesas-subtable";

const ENCABEZADOS = [
  "País",
  "Zona",
  "Puesto",
  "# Mesas",
  "Hora cierre Colombia",
  "Hora actual",
  "Tiempo",
  "E-14 deleg.",
  "E-14 transm.",
  "Estado global",
] as const;

const TH =
  "label-caps sticky top-0 z-10 h-12 border-b border-border bg-card text-muted-foreground whitespace-nowrap";

/** Mini barra de progreso 4px (track #242e2e, relleno del color de estado). */
function MiniProgreso({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div
        className="h-1 flex-1 overflow-hidden rounded-full bg-(--border)"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="body-md w-10 text-right">{pct}%</span>
    </div>
  );
}

interface PuestosTableProps {
  puestos: Puesto[];
  /** Fila expandida por defecto (Italia, primera del mock). */
  expandidoInicialId?: string;
}

export function PuestosTable({ puestos, expandidoInicialId }: PuestosTableProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(
    () => new Set(expandidoInicialId ? [expandidoInicialId] : [])
  );

  const toggle = (id: string) =>
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  if (puestos.length === 0) {
    return (
      <div className="rounded-[4px] border border-border bg-card px-4 py-8 text-center">
        <p className="body-md text-muted-foreground">
          Ningún puesto coincide con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100dvh-21rem)] min-h-[320px] overflow-auto rounded-[4px] border border-border">
      {/*
        <table> directo (sin el wrapper de shadcn): su contenedor con
        overflow-x-auto crearía un scrollport propio y rompería el sticky
        del encabezado dentro de esta región de scroll.
      */}
      <table className="w-full border-collapse bg-card text-sm">
        <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-border">
          {ENCABEZADOS.map((encabezado, indice) => (
            <TableHead
              key={encabezado}
              className={cn(TH, indice >= 7 && "text-right")}
            >
              {encabezado}
            </TableHead>
          ))}
        </TableRow>
        </TableHeader>

        {/*
          Un <tbody> por puesto: cada tbody es el raíz de un Collapsible
          (asChild) para poder expandir/colapsar sin romper la semántica de
          tabla (el raíz por defecto de Radix sería un <div> dentro de la
          tabla). Expansión controlada: Italia abierta por defecto (kit §2.4).
        */}
        {puestos.map((puesto) => (
          <PuestoRow
            key={puesto.id}
            puesto={puesto}
            mesas={mockSupervisionRepository.getMesasDePuesto(puesto.id)}
            abierto={expandidos.has(puesto.id)}
            onToggle={() => toggle(puesto.id)}
          />
        ))}
      </table>
    </div>
  );
}

function PuestoRow({
  puesto,
  mesas,
  abierto,
  onToggle,
}: {
  puesto: Puesto;
  mesas: Mesa[];
  abierto: boolean;
  onToggle: () => void;
}) {
  const acento = colorDeEstado(puesto.estadoGlobal);
  return (
    <Collapsible open={abierto} onOpenChange={(v) => v !== abierto && onToggle()} asChild>
      <tbody>
        <CollapsibleTrigger asChild>
          <TableRow
            className="h-12 cursor-pointer border-b border-border hover:bg-(--hover-row)"
            style={{ borderLeft: `4px solid ${acento}` }}
            aria-expanded={abierto}
          >
            <TableCell className="body-md font-medium whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5">
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    abierto && "rotate-180"
                  )}
                  aria-hidden
                />
                {puesto.codigoPais} - {puesto.pais}
              </span>
            </TableCell>
            <TableCell className="body-md">{puesto.zona}</TableCell>
            <TableCell className="body-md whitespace-nowrap">
              {puesto.puesto}
            </TableCell>
            <TableCell className="body-md text-right">{puesto.numeroMesas}</TableCell>
            <TableCell className="body-md whitespace-nowrap">
              {puesto.horaCierreColombia}
            </TableCell>
            <TableCell className="body-md">
              <span className="inline-block rounded-[4px] border border-(--success) px-2 py-0.5 whitespace-nowrap">
                {puesto.horaActualLocal}
              </span>
            </TableCell>
            <TableCell className="body-md whitespace-nowrap text-muted-foreground">
              {puesto.diferenciaTiempo}
            </TableCell>
            <TableCell className="text-right">
              <MiniProgreso pct={puesto.pctDelegado} color={acento} />
            </TableCell>
            <TableCell className="text-right">
              <MiniProgreso pct={puesto.pctTransmision} color={acento} />
            </TableCell>
            <TableCell className="text-right">
              <StatusBadge estado={puesto.estadoGlobal} />
            </TableCell>
          </TableRow>
        </CollapsibleTrigger>

        <CollapsibleContent asChild>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableCell colSpan={ENCABEZADOS.length} className="p-0">
              <MesasSubtable mesas={mesas} />
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </tbody>
    </Collapsible>
  );
}
