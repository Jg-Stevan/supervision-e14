"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FormularioTipo, PaginaActa } from "../../domain/acta";
import type { Mesa, Puesto } from "../../domain/types";

/**
 * HEADER TÉCNICO del visor (kit stitch-visor-actas-v1 — diseño Stitch):
 *
 * - Desktop (≥lg): barra h-14 con breadcrumb del catálogo
 *   `PAÍS (código) > ZONA n > PUESTO`, navegador de mesas
 *   `◀ MESA n (i/N) ▶` con dropdown de salto directo, píldora ORIGEN
 *   (TRANSMISIÓN/DELEGADOS — cambia el formulario del visor), píldora
 *   PÁGINA (dropdown 1..n) y cierre ✕.
 * - Móvil (<lg): caja con el título del puesto + chips táctiles
 *   TRANSMISIÓN (toggle de formulario) · MESA n (siguiente) · PÁG n DE m
 *   (siguiente página) — los tres con la estética pill del diseño móvil.
 *
 * Tipografía mono en TODO el header (datos técnicos — kit Stitch).
 */

const ETIQUETA_TIPO: Record<FormularioTipo, string> = {
  TRANSMISION: "TRANSMISIÓN",
  DELEGADOS: "DELEGADOS",
};

function BotonChevronMesa({
  onClick,
  deshabilitado,
  titulo,
  children,
}: {
  onClick: () => void;
  deshabilitado?: boolean;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      className="inline-flex size-7 items-center justify-center rounded-[4px] px-1.5 py-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-brand-emerald focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function ActaHeader({
  puesto,
  mesas,
  indiceMesa,
  totalMesas,
  puedeAnterior,
  puedeSiguiente,
  onMesaAnterior,
  onMesaSiguiente,
  onSeleccionarMesa,
  tipo,
  onCambiarTipo,
  paginas,
  paginaActiva,
  onCambiarPagina,
  onCerrar,
}: {
  puesto: Puesto;
  /** Mesas CON acta del puesto (dropdown de salto directo). */
  mesas: Mesa[];
  indiceMesa: number;
  totalMesas: number;
  puedeAnterior: boolean;
  puedeSiguiente: boolean;
  onMesaAnterior: () => void;
  onMesaSiguiente: () => void;
  onSeleccionarMesa: (mesaId: string) => void;
  tipo: FormularioTipo;
  onCambiarTipo: (tipo: FormularioTipo) => void;
  paginas: PaginaActa[];
  paginaActiva: number;
  onCambiarPagina: (pagina: number) => void;
  onCerrar: () => void;
}) {
  const mesaActual = mesas[Math.max(0, indiceMesa - 1)];
  const cajaSelector =
    "flex items-center bg-[#0e1714] border border-brand-border hover:border-emerald-500/50 rounded transition-colors shadow-sm";

  return (
    <>
      {/* ── DESKTOP: barra técnica ─────────────────────────────────────── */}
      <header
        className="hidden h-14 shrink-0 items-center justify-between gap-3 border-b border-brand-border bg-brand-panel px-4 z-20 lg:flex"
        data-purpose="primary-navbar"
      >
        {/* Jerarquía + navegador de mesas */}
        <div className="flex min-w-0 items-center gap-3">
          <nav
            aria-label="Jerarquía del puesto"
            className="flex items-center font-mono text-xs font-medium tracking-wider text-emerald-400/90"
          >
            <span className="cursor-pointer hover:text-emerald-300">
              {puesto.pais} ({puesto.codigoPais})
            </span>
            <span className="mx-1.5 font-sans text-gray-500" aria-hidden>
              &gt;
            </span>
            <span className="cursor-pointer hover:text-emerald-300">
              ZONA {puesto.zona}
            </span>
            <span className="mx-1.5 font-sans text-gray-500" aria-hidden>
              &gt;
            </span>
            <span className="truncate text-emerald-200">{puesto.puesto}</span>
          </nav>

          {/* Navegador de mesas: ◀ MESA n (i/N) ▼ ▶ */}
          <div className="relative flex items-center font-mono">
            <div className={cajaSelector}>
              <BotonChevronMesa
                onClick={onMesaAnterior}
                deshabilitado={!puedeAnterior}
                titulo="Mesa anterior"
              >
                <ChevronLeft className="size-3" aria-hidden />
              </BotonChevronMesa>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-(--primary)"
                    title="Saltar a una mesa"
                  >
                    <span className="tracking-wider">
                      MESA {mesaActual?.id ?? "—"}
                    </span>
                    <span className="text-[10px] font-normal text-gray-500">
                      ({Math.max(1, indiceMesa)}/{totalMesas})
                    </span>
                    <ChevronDown className="ml-0.5 size-3 text-gray-400" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="scroll-visor max-h-72 border-brand-border bg-[#0e1714] font-mono text-xs text-gray-200"
                >
                  <DropdownMenuLabel className="text-[10px] tracking-wider text-gray-500">
                    MESAS CON ACTA
                  </DropdownMenuLabel>
                  {mesas.map((mesa, indice) => (
                    <DropdownMenuItem
                      key={`${puesto.id}::${mesa.id}`}
                      onSelect={() => onSeleccionarMesa(mesa.id)}
                      className={cn(
                        "gap-2 font-bold tracking-wider",
                        mesa.id === mesaActual?.id && "text-brand-emerald"
                      )}
                    >
                      MESA {mesa.id}
                      <span className="ml-auto text-[10px] font-normal text-gray-500">
                        {indice + 1}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <BotonChevronMesa
                onClick={onMesaSiguiente}
                deshabilitado={!puedeSiguiente}
                titulo="Mesa siguiente"
              >
                <ChevronRight className="size-3" aria-hidden />
              </BotonChevronMesa>
            </div>
          </div>
        </div>

        {/* Estado + navegación de formulario + cierre */}
        <div className="flex shrink-0 items-center gap-2">
          {/* ORIGEN — cambia el formulario del visor */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded border border-emerald-500/60 bg-[#0e1714] px-3 py-1 font-mono text-xs text-emerald-300 shadow-sm transition-colors hover:border-emerald-400 focus-visible:outline-2 focus-visible:outline-(--primary)"
                title="Cambiar origen del formulario"
              >
                <svg
                  className="size-3.5 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                  ORIGEN:
                </span>
                <span className="font-bold">{ETIQUETA_TIPO[tipo]}</span>
                {tipo === "TRANSMISION" && (
                  <span
                    className="size-1.5 animate-pulse rounded-full bg-emerald-400"
                    aria-hidden
                  />
                )}
                <ChevronDown className="ml-0.5 size-3 text-gray-400" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-brand-border bg-[#0e1714] font-mono text-xs text-gray-200"
            >
              {(Object.keys(ETIQUETA_TIPO) as FormularioTipo[]).map((valor) => (
                <DropdownMenuItem
                  key={valor}
                  onSelect={() => onCambiarTipo(valor)}
                  className={cn(
                    "font-bold tracking-wider",
                    valor === tipo && "text-brand-emerald"
                  )}
                >
                  {ETIQUETA_TIPO[valor]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* PÁGINA — dropdown 1..n del formulario activo */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded border border-brand-border bg-[#0e1714] px-2.5 py-1 font-mono text-xs text-emerald-300 shadow-sm transition-colors hover:border-emerald-500/50 focus-visible:outline-2 focus-visible:outline-(--primary)"
                title="Cambiar página del formulario"
              >
                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                  PÁGINA:
                </span>
                <span className="font-bold">
                  {paginaActiva} de {Math.max(1, paginas.length)}
                </span>
                <ChevronDown className="ml-0.5 size-3 text-gray-400" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-brand-border bg-[#0e1714] font-mono text-xs text-gray-200"
            >
              {paginas.map((pagina) => (
                <DropdownMenuItem
                  key={pagina.numero}
                  onSelect={() => onCambiarPagina(pagina.numero)}
                  className={cn(
                    "font-bold tracking-wider",
                    pagina.numero === paginaActiva && "text-brand-emerald"
                  )}
                >
                  Página {pagina.numero}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Cierre del workspace */}
          <div className="ml-1 border-l border-brand-border pl-2">
            <button
              type="button"
              onClick={onCerrar}
              title="Cerrar vista de auditoría"
              aria-label="Cerrar vista de auditoría"
              className="rounded p-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-(--primary)"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* ── MÓVIL: título del puesto + chips táctiles ──────────────────── */}
      <header className="shrink-0 border-b border-[#1b2b24] bg-[#09110e]/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
        <div className="mx-auto w-full max-w-lg space-y-2.5">
          <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#162922] bg-[#0b1613] px-4 py-2.5">
            <span className="truncate font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
              {puesto.puesto}
            </span>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar vista de auditoría"
              className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-(--primary)"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* TIPO — toggle del formulario (pill activo verde) */}
            <button
              type="button"
              onClick={() =>
                onCambiarTipo(tipo === "TRANSMISION" ? "DELEGADOS" : "TRANSMISION")
              }
              className="shrink-0 rounded-xl bg-emerald-400 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-black shadow-sm transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-(--primary)"
              title="Cambiar origen del formulario"
            >
              {ETIQUETA_TIPO[tipo]}
            </button>
            {/* MESA — tap = siguiente mesa */}
            <button
              type="button"
              onClick={onMesaSiguiente}
              disabled={!puedeSiguiente}
              className="flex flex-1 items-center justify-center rounded-xl border border-[#162922] bg-[#0b1613] px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-100 transition-colors hover:border-emerald-500/40 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-50"
              title={puedeSiguiente ? "Siguiente mesa" : "Última mesa"}
            >
              MESA {mesaActual?.id ?? "—"}
              <MoreHorizontal className="ml-1 size-3 text-gray-500" aria-hidden />
            </button>
            {/* PÁG — tap = siguiente página */}
            <button
              type="button"
              onClick={() =>
                onCambiarPagina(paginaActiva < paginas.length ? paginaActiva + 1 : 1)
              }
              disabled={paginas.length <= 1}
              className="flex flex-1 items-center justify-center rounded-xl border border-[#162922] bg-[#0b1613] px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-100 transition-colors hover:border-emerald-500/40 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-50"
              title="Cambiar página"
            >
              PÁG {paginaActiva} DE {Math.max(1, paginas.length)}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
