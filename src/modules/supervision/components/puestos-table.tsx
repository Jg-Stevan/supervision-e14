"use client";

import { memo, useCallback, useState } from "react";
import { ChevronDown, Eye } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { Mesa, Puesto } from "../domain/types";
import { colorDeEstado, StatusBadge } from "./status-badge";
import { MesasSubtable } from "./mesas-subtable";
import { useDatos } from "./datos-provider";

const ENCABEZADOS = [
  "País",
  "Zona",
  "Puesto",
  "# Mesas",
  // D10 — abreviado (kit SUP-2 §2 lo permite): la cabecera completa
  // «Hora cierre Colombia» (158px) obligaba a scroll horizontal a 1440px.
  "Cierre COL",
  "Hora actual",
  "Tiempo",
  "E-14 deleg.",
  "E-14 transm.",
  "Estado global",
] as const;

/**
 * D43 — columnas FIJAS y alineadas (fix «no están alineadas ni ordenadas»):
 * con `table-layout: auto` el navegador reparte el sobrante según el
 * contenido de cada fila → País/Puesto se inflaban con espacio muerto,
 * las columnas de tiempo se comprimían y el ancho de UNA columna cambiaba
 * cuando los datos vivos cambiaban (las filas "bailaban"). Con
 * `table-fixed` + <colgroup> cada columna recibe un % estable del ancho
 * de la tabla y la alineación del encabezado y de las celdas queda
 * definida en UN solo lugar (`align`), sin divergencias.
 *
 * Los % se calibraron contra el contenido real más largo de cada columna
 * (p. ej. «83 - MIERCOLES ACCRA CONSULADO», badge «NO INICIADO» + 👁) y
 * suman exactamente 100. Bajo 1200px la tabla hace scroll horizontal en
 * su contenedor (min-w) en vez de aplastar columnas.
 */
const COLUMNAS = [
  { ancho: "15%", align: "left" }, // País
  { ancho: "4.5%", align: "left" }, // Zona
  { ancho: "18.5%", align: "left" }, // Puesto
  { ancho: "7%", align: "right" }, // # Mesas (encabezado Y celda a la derecha)
  { ancho: "8%", align: "left" }, // Cierre COL
  { ancho: "8.5%", align: "left" }, // Hora actual
  { ancho: "6%", align: "left" }, // Tiempo
  { ancho: "9.5%", align: "right" }, // E-14 deleg.
  { ancho: "9.5%", align: "right" }, // E-14 transm.
  { ancho: "13.5%", align: "right" }, // Estado global
] as const;

// D10 — px-1.5 compacta el padding horizontal (override del px-2 de ui/table
// vía tailwind-merge): a 1440px con sidebar de 256px las 10 columnas caben
// sin scroll horizontal (hallazgo de auditoría SUP-2 §2).
const TH =
  "label-caps sticky top-0 z-10 h-12 border-b border-border bg-card text-muted-foreground whitespace-nowrap px-1.5";

/**
 * Mini barra de progreso 4px (track #242e2e, relleno del color de estado).
 * D43 — `w-full` (antes min-w-24): con columnas fijas la barra SIEMPRE
 * llena su celda y la etiqueta % queda shrink-0 alineada al borde derecho
 * donde termina el encabezado — todas las filas comparten el mismo borde.
 */
function MiniProgreso({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex w-full items-center gap-1.5">
      <div
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-(--border)"
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
      <span className="body-md w-9 shrink-0 text-right">{pct}%</span>
    </div>
  );
}

/** D42 — KIT e14-monitor-memo-v1: array vacío ESTABLE — `?? []` creaba una
 *  identidad nueva por fila por render y rompía el memo de PuestoRow. */
const MESAS_VACIAS: Mesa[] = [];

interface PuestosTableProps {
  puestos: Puesto[];
  /** Mesas del store del shell (kit SUP-3 T4 — ya no se piden al repo
   * directamente desde la fila: los datos viven en el store cliente). */
  mesasPorPuesto: Record<string, Mesa[]>;
  /** Fila expandida por defecto (Italia, primera del mock). */
  expandidoInicialId?: string;
  mesaEnAccionId: string | null;
  onReinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
}

export function PuestosTable({
  puestos,
  mesasPorPuesto,
  expandidoInicialId,
  mesaEnAccionId,
  onReinspeccionar,
}: PuestosTableProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(
    () => new Set(expandidoInicialId ? [expandidoInicialId] : [])
  );

  // D42 — toggle ESTABLE (useCallback): el onToggle por fila ya no cambia
  // de identidad en cada render del padre → el memo de PuestoRow aplica.
  const toggle = useCallback(
    (id: string) =>
      setExpandidos((prev) => {
        const siguiente = new Set(prev);
        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);
        return siguiente;
      }),
    []
  );

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

        D43 — table-fixed + colgroup: anchos de columna deterministas
        (ver COLUMNAS); min-w evita aplastar columnas bajo 1200px.
      */}
      <table className="w-full min-w-[1200px] table-fixed border-collapse bg-card text-sm">
        <colgroup>
          {COLUMNAS.map((columna, indice) => (
            <col key={indice} style={{ width: columna.ancho }} />
          ))}
        </colgroup>
        <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-border">
          {ENCABEZADOS.map((encabezado, indice) => (
            <TableHead
              key={encabezado}
              className={cn(
                TH,
                COLUMNAS[indice].align === "right" && "text-right"
              )}
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
            mesas={mesasPorPuesto[puesto.id] ?? MESAS_VACIAS}
            abierto={expandidos.has(puesto.id)}
            onToggle={toggle}
            mesaEnAccionId={mesaEnAccionId}
            onReinspeccionar={onReinspeccionar}
          />
        ))}
      </table>
    </div>
  );
}

/** D42 — KIT e14-monitor-memo-v1: PuestoRow va MEMOIZADO. Con el contexto
 *  de datos memoizado (D42 en datos-provider) y props estables (toggle
 *  estable, MESAS_VACIAS estable), una fila solo re-renderiza cuando SUS
 *  datos cambiaron — el re-render completo de 949 filas por tecla/tick
 *  desaparece. */
const PuestoRow = memo(function PuestoRow({
  puesto,
  mesas,
  abierto,
  onToggle,
  mesaEnAccionId,
  onReinspeccionar,
}: {
  puesto: Puesto;
  mesas: Mesa[];
  abierto: boolean;
  onToggle: (id: string) => void;
  mesaEnAccionId: string | null;
  onReinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
}) {
  const acento = colorDeEstado(puesto.estadoGlobal);
  const { abrirVisorDePuesto } = useDatos();
  // KIT SUP-4 T3.4 — el 👁 abre el visor en la primera mesa CON acta del
  // puesto; deshabilitado si el puesto no tiene ninguna (todas
  // NO_INICIADO).
  const tieneActa = mesas.some((m) => m.estadoMesa !== "NO_INICIADO");
  return (
    <Collapsible
      open={abierto}
      onOpenChange={(v) => v !== abierto && onToggle(puesto.id)}
      asChild
    >
      <tbody>
        <CollapsibleTrigger asChild>
          <TableRow
            className="h-12 cursor-pointer border-b border-border hover:bg-(--hover-row)"
            style={{ borderLeft: `4px solid ${acento}` }}
            aria-expanded={abierto}
          >
            <TableCell className="body-md px-1.5 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
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
            <TableCell className="body-md px-1.5">{puesto.zona}</TableCell>
            <TableCell
              className="body-md px-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
              title={puesto.puesto}
            >
              {puesto.puesto}
            </TableCell>
            <TableCell className="body-md px-1.5 text-right">
              {puesto.numeroMesas}
            </TableCell>
            <TableCell className="body-md px-1.5 whitespace-nowrap">
              {puesto.horaCierreColombia}
            </TableCell>
            <TableCell className="body-md px-1.5">
              <span className="inline-block rounded-[4px] border border-(--success) px-1.5 py-0.5 whitespace-nowrap">
                {puesto.horaActualLocal}
              </span>
            </TableCell>
            <TableCell className="body-md px-1.5 whitespace-nowrap text-muted-foreground">
              {puesto.diferenciaTiempo}
            </TableCell>
            <TableCell className="text-right px-1.5">
              <MiniProgreso pct={puesto.pctDelegado} color={acento} />
            </TableCell>
            <TableCell className="text-right px-1.5">
              <MiniProgreso pct={puesto.pctTransmision} color={acento} />
            </TableCell>
            <TableCell className="text-right px-1.5">
              <span className="flex items-center justify-end gap-1">
                <StatusBadge estado={puesto.estadoGlobal} />
                {/* KIT SUP-4 — 👁 abre el visor (punto de entrada 3/3).
                    stopPropagation: la fila completa es el trigger del
                    Collapsible y el clic NO debe expandir/colapsar. */}
                <button
                  type="button"
                  disabled={!tieneActa}
                  title={tieneActa ? "Ver acta del puesto" : "Sin acta"}
                  aria-label={`Ver acta del puesto ${puesto.puesto}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    abrirVisorDePuesto(puesto.id);
                  }}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
                >
                  <Eye className="size-4" aria-hidden />
                </button>
              </span>
            </TableCell>
          </TableRow>
        </CollapsibleTrigger>

        <CollapsibleContent asChild>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableCell colSpan={ENCABEZADOS.length} className="p-0">
              <MesasSubtable
                mesas={mesas}
                puestoId={puesto.id}
                mesaEnAccionId={mesaEnAccionId}
                onReinspeccionar={onReinspeccionar}
              />
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </tbody>
    </Collapsible>
  );
});
