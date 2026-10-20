"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  IdCard,
  Send,
  X,
} from "lucide-react";
import { cn } from "cn";
import type {
  ActaMesa,
  FormularioTipo,
  PaginaActa,
} from "../../domain/acta";
import type { Puesto } from "../../domain/types";

/**
 * Header del visor de actas (kit SUP-4 §2.2): breadcrumb del puesto,
 * navegador de mesas < MESA n/N > (solo mesas con acta), chip de
 * credencial + hora de carga, toggle DELEGADOS/TRANSMISIÓN, conmutador de
 * páginas con badge de estado y chip de motivo + cierre.
 *
 * Header flexible (T6.2): flex-wrap con gap-y-2 — los 3 grupos se apilan
 * en filas propias cuando no caben. Sin sombras (D14).
 */

function BadgePagina({ estado, pulsante }: { estado: PaginaActa["estado"]; pulsante: boolean }) {
  if (estado === "VALIDA") {
    return <Check className="size-3 text-(--success)" aria-label="Válida" />;
  }
  if (estado === "ADVERTENCIA") {
    return (
      <AlertTriangle
        className={cn("size-3 text-(--danger)", pulsante && "animate-pulse")}
        aria-label="Advertencia"
      />
    );
  }
  return <Clock className="size-3 text-muted-foreground" aria-label="Pendiente" />;
}

export function ActaHeader({
  puesto,
  indiceMesa,
  totalMesas,
  puedeAnterior,
  puedeSiguiente,
  onMesaAnterior,
  onMesaSiguiente,
  tipo,
  onCambiarTipo,
  paginas,
  paginaActiva,
  onCambiarPagina,
  acta,
  onCerrar,
}: {
  puesto: Puesto;
  indiceMesa: number;
  totalMesas: number;
  puedeAnterior: boolean;
  puedeSiguiente: boolean;
  onMesaAnterior: () => void;
  onMesaSiguiente: () => void;
  tipo: FormularioTipo;
  onCambiarTipo: (tipo: FormularioTipo) => void;
  paginas: PaginaActa[];
  paginaActiva: number;
  onCambiarPagina: (pagina: number) => void;
  acta: ActaMesa | null;
  onCerrar: () => void;
}) {
  const claseChevronMesa =
    "inline-flex size-8 items-center justify-center rounded-[4px] text-muted-foreground hover:text-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--border) bg-(--surface-lowest) px-4 py-3 md:px-6">
      {/* IZQ: breadcrumb + navegador de mesas + credencial + hora */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <nav
          aria-label="Ubicación del acta"
          className="label-caps flex min-w-0 items-center gap-1 text-(--outline-strong)"
        >
          <span className="truncate">
            {puesto.pais.toUpperCase()} ({puesto.codigoPais})
          </span>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <span className="shrink-0">ZONA {puesto.zona}</span>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{puesto.puesto.toUpperCase()}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {/* Navegador de mesas (solo mesas con acta — T3.3) */}
          <div className="flex items-center gap-0.5 rounded-[4px] border border-(--border) bg-(--card) px-1 py-0.5">
            <button
              type="button"
              className={claseChevronMesa}
              onClick={onMesaAnterior}
              disabled={!puedeAnterior}
              aria-label="Mesa anterior"
              title="Mesa anterior"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="headline-md px-1 font-bold text-(--primary)" aria-live="polite">
              MESA {indiceMesa}/{totalMesas}
            </span>
            <button
              type="button"
              className={claseChevronMesa}
              onClick={onMesaSiguiente}
              disabled={!puedeSiguiente}
              aria-label="Mesa siguiente"
              title="Mesa siguiente"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <span className="font-data rounded-[4px] border border-(--border) bg-(--surface) px-2 py-1 text-[11px] text-foreground">
            ID: {acta?.id ?? "—"}
          </span>
          {acta && (
            <span className="font-data text-[11px] text-muted-foreground">
              {acta.horaCarga}
            </span>
          )}
        </div>
      </div>

      {/* CENTRO: toggle de formulario + conmutador de páginas */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Formulario del acta"
          className="flex items-center gap-0.5 rounded-[4px] border border-(--border) bg-(--background) p-0.5"
        >
          {(
            [
              { tipo: "DELEGADOS", etiqueta: "Delegados", Icono: IdCard },
              { tipo: "TRANSMISION", etiqueta: "Transmisión", Icono: Send },
            ] as const
          ).map(({ tipo: valor, etiqueta, Icono }) => (
            <button
              key={valor}
              type="button"
              onClick={() => onCambiarTipo(valor)}
              aria-pressed={tipo === valor}
              className={cn(
                "label-caps inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-(--primary)",
                tipo === valor
                  ? "border-(--primary) bg-[#003912] text-(--primary)"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icono className="size-3.5" aria-hidden />
              {etiqueta}
            </button>
          ))}
        </div>

        {paginas.length > 0 && (
          <div
            role="group"
            aria-label="Páginas del formulario"
            className="flex items-center gap-1.5"
          >
            {paginas.map((pagina) => {
              const activa = pagina.numero === paginaActiva;
              const errorActiva = activa && pagina.estado === "ADVERTENCIA";
              return (
                <button
                  key={pagina.numero}
                  type="button"
                  onClick={() => onCambiarPagina(pagina.numero)}
                  aria-pressed={activa}
                  aria-label={`Página ${pagina.numero} — ${
                    pagina.estado === "VALIDA"
                      ? "válida"
                      : pagina.estado === "ADVERTENCIA"
                        ? "advertencia"
                        : "pendiente"
                  }`}
                  className={cn(
                    "label-caps inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-(--primary)",
                    errorActiva
                      ? "animate-pulse border-[#410004] bg-[#410004]/20 font-bold text-(--error-text)"
                      : activa
                        ? "border-(--outline-variant) bg-(--card) text-(--muted-foreground)"
                        : "border-(--border) bg-(--card) text-muted-foreground opacity-70 hover:opacity-100"
                  )}
                >
                  Página {pagina.numero}
                  <BadgePagina estado={pagina.estado} pulsante={errorActiva} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* DER: chip de motivo + cierre */}
      <div className="ml-auto flex items-center gap-2">
        {acta?.motivo && (
          <span className="label-caps inline-flex items-center gap-1.5 rounded-full border border-[#410004] bg-[#410004]/20 px-3 py-1 text-(--error-text)">
            <AlertTriangle className="size-3.5" aria-hidden />
            Motivo: {acta.motivo}
          </span>
        )}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar visor de actas"
          title="Cerrar (Escape)"
          className="inline-flex size-9 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}
