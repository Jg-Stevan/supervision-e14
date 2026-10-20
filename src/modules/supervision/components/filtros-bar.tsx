"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EstadoGlobal, FiltrosPuestos, Puesto } from "../domain/types";

const ESTADOS: { valor: EstadoGlobal; etiqueta: string }[] = [
  { valor: "COMPLETO", etiqueta: "COMPLETO" },
  { valor: "CRITICO", etiqueta: "CRÍTICO" },
  { valor: "PENDIENTE", etiqueta: "PENDIENTE" },
  { valor: "NO_INICIADO", etiqueta: "NO INICIADO" },
];

/** Select mock con una sola opción (kit §2.4). */
const OPCION_FECHA = "Domingo, 14 Jun";

const VALOR_TODOS = "TODOS";

interface FiltrosBarProps {
  puestos: Puesto[];
  filtros: FiltrosPuestos;
  onFiltros: (filtros: FiltrosPuestos) => void;
}

function Trigger({
  etiqueta,
  label,
  children,
}: {
  etiqueta: string | undefined;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <SelectTrigger
      aria-label={label}
      className="h-11 w-full border-border bg-(--input) font-data text-[13px] shadow-none data-[placeholder]:text-muted-foreground"
    >
      {children ?? <SelectValue placeholder={etiqueta} />}
    </SelectTrigger>
  );
}

export function FiltrosBar({ puestos, filtros, onFiltros }: FiltrosBarProps) {
  const paises = useMemo(
    () =>
      Array.from(
        new Map(puestos.map((p) => [p.codigoPais, p.pais])).entries()
      ).sort((a, b) => a[0].localeCompare(b[0])),
    [puestos]
  );
  const zonas = useMemo(
    () => Array.from(new Set(puestos.map((p) => p.zonaId))).sort(),
    [puestos]
  );
  const nombresPuesto = useMemo(
    () => Array.from(new Set(puestos.map((p) => p.puesto))).sort(),
    [puestos]
  );

  const set = (parcial: Partial<FiltrosPuestos>) =>
    onFiltros({ ...filtros, ...parcial });

  return (
    <div
      role="search"
      aria-label="Filtros de la tabla maestra"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    >
      <Select
        value={filtros.pais ?? VALOR_TODOS}
        onValueChange={(v) => set({ pais: v === VALOR_TODOS ? undefined : v })}
      >
        <Trigger etiqueta="País" label="Filtrar por país" />
        <SelectContent className="border-border bg-popover">
          <SelectItem value={VALOR_TODOS} className="h-11">País: todos</SelectItem>
          {paises.map(([codigo, nombre]) => (
            <SelectItem key={codigo} value={codigo} className="h-11">
              {codigo} - {nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filtros.fecha ?? OPCION_FECHA}
        onValueChange={(v) => set({ fecha: v })}
      >
        <Trigger etiqueta="Fecha" label="Filtrar por fecha" />
        <SelectContent className="border-border bg-popover">
          <SelectItem value={OPCION_FECHA} className="h-11">{OPCION_FECHA}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filtros.zona ?? VALOR_TODOS}
        onValueChange={(v) => set({ zona: v === VALOR_TODOS ? undefined : v })}
      >
        <Trigger etiqueta="Zona" label="Filtrar por zona" />
        <SelectContent className="border-border bg-popover">
          <SelectItem value={VALOR_TODOS} className="h-11">Zona: todas</SelectItem>
          {zonas.map((zona) => (
            <SelectItem key={zona} value={zona} className="h-11">
              {zona}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filtros.puesto ?? VALOR_TODOS}
        onValueChange={(v) =>
          set({ puesto: v === VALOR_TODOS ? undefined : v })
        }
      >
        <Trigger etiqueta="Puesto" label="Filtrar por puesto" />
        <SelectContent className="border-border bg-popover">
          <SelectItem value={VALOR_TODOS} className="h-11">Puesto: todos</SelectItem>
          {nombresPuesto.map((nombre) => (
            <SelectItem key={nombre} value={nombre} className="h-11">
              {nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filtros.estado ?? VALOR_TODOS}
        onValueChange={(v) =>
          set({ estado: v === VALOR_TODOS ? undefined : (v as EstadoGlobal) })
        }
      >
        <Trigger etiqueta="Estado" label="Filtrar por estado" />
        <SelectContent className="border-border bg-popover">
          <SelectItem value={VALOR_TODOS} className="h-11">Estado: todos</SelectItem>
          {ESTADOS.map(({ valor, etiqueta }) => (
            <SelectItem key={valor} value={valor} className="h-11">
              {etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={filtros.busqueda ?? ""}
          onChange={(e) => set({ busqueda: e.target.value })}
          placeholder="Buscar por ID o Nombre..."
          aria-label="Búsqueda rápida"
          className="h-11 border-border bg-(--input) pl-9 font-data text-[13px] shadow-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
