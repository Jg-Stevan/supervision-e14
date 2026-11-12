"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ActaMesa,
  FormularioTipo,
  PaginaActa,
} from "../../domain/acta";
import type { Puesto } from "../../domain/types";

/**
 * Header del visor de actas (KIT VISOR-MONITOR-GLOBAL-v1 §4-T2 — diseño
 * del mantenedor, imagen de referencia EGIPTO (335) → El Cairo):
 *
 * - DESKTOP (≥768px), 1 fila: breadcrumb `PAÍS (código) › ZONA n › PUESTO`,
 *   nav de mesas `‹ MESA 001 (1/12) ∨ ›` — chevrons + DROPDOWN nativo que
 *   lista las mesas con acta (salto directo, T2.1), píldora dropdown
 *   `⟲ ORIGEN: TRANSMISIÓN ● ∨` con el punto del estado del formulario
 *   activo y los formularios disponibles dentro del dropdown (T2.2),
 *   dropdown `PÁGINA: 1 de 2 ∨` con el estado de cada página como punto
 *   DENTRO de las opciones (T2.3) y ✕ a la derecha (T2.4: sin chips de
 *   hora de carga ni motivo — esa info sigue en el historial).
 * - MÓVIL (<768px, V1-06): cabecera compacta con título puesto-lugar +
 *   fila de 3 chips TAPPABLES (tipo alterna, mesa avanza, página avanza
 *   cíclica) + cierre — sin cambios de T1/T2 salvo lo que rompía.
 *
 * Dropdowns NATIVOS (mismo patrón del select PÁGINA previo): select
 * `appearance-none opacity-0` superpuesto al label — el navegador pinta la
 * lista (sin libs nuevas, §1) y el foco/teclado quedan intactos. Limitación
 * honesta de <option>: el punto de estado viaja como GLIFO (● válida ·
 * ▲ advertencia · ○ pendiente) dentro del texto de la opción — el color
 * real solo existe en el punto del valor activo (D-10, docs/adr/README.md).
 *
 * Sin sombras (D14).
 */

/** GLIFOS de estado para <option> (native select no colorea por opción). */
const GLIFO_ESTADO: Record<PaginaActa["estado"], string> = {
  VALIDA: "●",
  ADVERTENCIA: "▲",
  PENDIENTE: "○",
};

function PuntoEstado({ estado }: { estado: PaginaActa["estado"] }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        estado === "VALIDA" && "bg-(--success)",
        estado === "ADVERTENCIA" &&
          "animate-pulse bg-(--danger)",
        estado === "PENDIENTE" && "border border-(--outline-strong)"
      )}
      role="img"
      aria-label={
        estado === "VALIDA"
          ? "Válida"
          : estado === "ADVERTENCIA"
            ? "Advertencia"
            : "Pendiente"
      }
    />
  );
}

/** Estado de un FORMULARIO completo a partir de sus páginas (T2.2):
 *  cualquier ADVERTENCIA manda · si no, cualquier PENDIENTE · si no, TODO
 *  válido → VALIDA. Sin páginas → PENDIENTE. */
function estadoDeFormulario(
  acta: ActaMesa | null,
  tipo: FormularioTipo
): PaginaActa["estado"] {
  const paginas = acta?.formularios[tipo] ?? [];
  if (paginas.length === 0) return "PENDIENTE";
  if (paginas.some((p) => p.estado === "ADVERTENCIA")) return "ADVERTENCIA";
  if (paginas.some((p) => p.estado === "PENDIENTE")) return "PENDIENTE";
  return "VALIDA";
}

const TIPOS: readonly {
  tipo: FormularioTipo;
  etiqueta: string;
}[] = [
  { tipo: "DELEGADOS", etiqueta: "Delegados" },
  { tipo: "TRANSMISION", etiqueta: "Transmisión" },
] as const;

export function ActaHeader({
  puesto,
  mesaId,
  indiceMesa,
  totalMesas,
  mesasConActaIds,
  puedeAnterior,
  puedeSiguiente,
  onMesaAnterior,
  onMesaSiguiente,
  onIrAMesa,
  tipo,
  onCambiarTipo,
  paginas,
  paginaActiva,
  onCambiarPagina,
  acta,
  onCerrar,
}: {
  puesto: Puesto;
  /** V1-05 — id REAL de la mesa abierta (ej. «001») para `MESA 001 (1/12)`. */
  mesaId: string;
  indiceMesa: number;
  totalMesas: number;
  /** T2.1 — ids de las mesas CON acta (en orden — opciones del dropdown). */
  mesasConActaIds: string[];
  puedeAnterior: boolean;
  puedeSiguiente: boolean;
  onMesaAnterior: () => void;
  onMesaSiguiente: () => void;
  /** T2.1 — salto DIRECTO a una mesa con acta (delta resuelto por el padre). */
  onIrAMesa: (mesaId: string) => void;
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

  const totalPaginas = paginas.length;
  const tipoActivo = TIPOS.find((t) => t.tipo === tipo);
  const estadoFormularioActivo = estadoDeFormulario(acta, tipo);

  // ── V1-06 — cabecera compacta MÓVIL (diseño visor_actas_mobile) ────────
  const bloqueMovil = (
    <div className="flex w-full flex-col gap-2.5 md:hidden">
      {/* Fila 1: título puesto-lugar + cierre */}
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps truncate text-(--primary)">
          {puesto.puesto.toUpperCase()}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar visor de actas"
          title="Cerrar (Escape)"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {/* Fila 2: chips TRANSMISIÓN (alterna) · MESA (avanza) · PÁG (avanza) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            onCambiarTipo(tipo === "TRANSMISION" ? "DELEGADOS" : "TRANSMISION")
          }
          aria-pressed
          title="Alternar entre Transmisión y Delegados"
          className="label-caps inline-flex min-h-[36px] flex-1 items-center justify-center rounded-[4px] bg-(--primary) px-2 py-1.5 text-(--acta-aprobada) transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-(--primary)"
        >
          {tipoActivo?.etiqueta ?? tipo}
        </button>
        <button
          type="button"
          onClick={() => (puedeSiguiente ? onMesaSiguiente() : onMesaAnterior())}
          disabled={!puedeSiguiente && !puedeAnterior}
          title="Siguiente mesa con acta"
          className="label-caps inline-flex min-h-[36px] flex-1 items-center justify-center rounded-[4px] border border-(--border) bg-(--card) px-2 py-1.5 text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-50"
        >
          MESA {mesaId}
        </button>
        <button
          type="button"
          onClick={() =>
            onCambiarPagina(
              totalPaginas > 0 && paginaActiva < totalPaginas
                ? paginaActiva + 1
                : 1
            )
          }
          disabled={totalPaginas === 0}
          title="Siguiente página"
          className="label-caps inline-flex min-h-[36px] flex-1 items-center justify-center rounded-[4px] border border-(--border) bg-(--card) px-2 py-1.5 text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-50"
        >
          PÁG {paginaActiva} DE {Math.max(totalPaginas, 1)}
        </button>
      </div>
    </div>
  );

  return (
    <header className="border-b border-(--border) bg-(--surface-lowest) px-4 py-3 md:px-6">
      {bloqueMovil}

      {/* ── DESKTOP (≥768px) — header de la imagen: breadcrumb + mesa ∨ +
          ORIGEN ∨ + PÁGINA ∨ + ✕ (T2) ──────────────────────────────────── */}
      <div className="hidden w-full flex-wrap items-center gap-x-3 gap-y-2 md:flex">
        {/* IZQ: breadcrumb + navegador de mesas (chevrons + dropdown T2.1) */}
        <div className="flex min-w-0 items-center gap-3">
          <nav
            aria-label="Ubicación del acta"
            className="label-caps flex min-w-0 items-center gap-1 text-(--outline-strong)"
          >
            <span className="truncate font-bold text-foreground">
              {puesto.pais.toUpperCase()} ({puesto.codigoPais})
            </span>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
            <span className="shrink-0">ZONA {puesto.zona}</span>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
            <span className="truncate text-(--success)">
              {puesto.puesto.toUpperCase()}
            </span>
          </nav>

          {/* T2.1 — `‹ MESA 001 (1/12) ∨ ›`: los chevrons navegan mesas con
              acta (como hoy) y el dropdown nativo lista las mesas con acta
              del puesto (salto directo → onIrAMesa). */}
          <div
            className="flex items-center gap-0.5 rounded-[4px] border border-(--border) bg-(--card) px-1 py-0.5"
            role="group"
            aria-label="Navegación de mesas"
          >
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
            <span className="relative inline-flex items-center">
              <span
                className="headline-md px-1 font-bold text-(--primary)"
                aria-live="polite"
              >
                MESA {mesaId}{" "}
                <span className="text-muted-foreground">
                  ({indiceMesa}/{totalMesas})
                </span>
              </span>
              <select
                value={mesaId}
                onChange={(e) => onIrAMesa(e.target.value)}
                aria-label="Seleccionar mesa con acta"
                className="absolute inset-0 cursor-pointer appearance-none opacity-0 focus-visible:outline-2 focus-visible:outline-(--primary)"
              >
                {mesasConActaIds.map((id) => (
                  <option key={id} value={id}>
                    MESA {id}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none size-3 text-muted-foreground"
                aria-hidden
              />
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
        </div>

        {/* CENTRO: píldora dropdown ORIGEN (T2.2) + dropdown PÁGINA (T2.3) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* T2.2 — `⟲ ORIGEN: TRANSMISIÓN ● ∨`: UNA píldora dropdown
              (el toggle de 2 botones se retira). El punto muestra el estado
              del formulario ACTIVO; las opciones llevan el glifo de SU
              estado (limitación honesta del <option> nativo). */}
          <div className="flex items-center gap-1.5 rounded-[4px] border border-(--primary)/60 bg-(--background) px-2.5 py-1.5">
            <RefreshCw className="size-3.5 shrink-0 text-(--primary)" aria-hidden />
            <span className="label-caps text-muted-foreground">Origen:</span>
            <span className="relative inline-flex items-center gap-1.5">
              {/* Auditoría del kit §3.1 — valor BLANCO MONO (font-data =
                  JetBrains Mono; label-caps ya da el peso/caps). */}
              <span className="label-caps font-data text-foreground">
                {tipoActivo?.etiqueta ?? tipo}
              </span>
              <PuntoEstado estado={estadoFormularioActivo} />
              <select
                value={tipo}
                onChange={(e) => onCambiarTipo(e.target.value as FormularioTipo)}
                aria-label="Seleccionar formulario del acta"
                className="absolute inset-0 cursor-pointer appearance-none opacity-0 focus-visible:outline-2 focus-visible:outline-(--primary)"
              >
                {TIPOS.map(({ tipo: valor, etiqueta }) => (
                  <option key={valor} value={valor}>
                    {GLIFO_ESTADO[estadoDeFormulario(acta, valor)]} {etiqueta}
                  </option>
                ))}
              </select>
            </span>
            <ChevronDown
              className="pointer-events-none size-3 text-muted-foreground"
              aria-hidden
            />
          </div>

          {/* T2.3 — `PÁGINA: 1 de 2 ∨` (sin badge junto al label; el estado
              de cada página va como punto DENTRO de las opciones). */}
          {totalPaginas > 0 && (
            <div className="flex items-center gap-1.5 rounded-[4px] border border-(--border) bg-(--card) px-2.5 py-1.5">
              <span className="label-caps text-muted-foreground">Página:</span>
              <span className="relative inline-flex items-center">
                {/* Auditoría del kit §3.1 — valor BLANCO MONO (antes teal). */}
                <span className="label-caps font-data text-foreground">
                  {paginaActiva} de {totalPaginas}
                </span>
                <select
                  value={paginaActiva}
                  onChange={(e) => onCambiarPagina(Number(e.target.value))}
                  aria-label="Seleccionar página del formulario"
                  className="absolute inset-0 cursor-pointer appearance-none opacity-0 focus-visible:outline-2 focus-visible:outline-(--primary)"
                >
                  {paginas.map((pagina) => (
                    <option key={pagina.numero} value={pagina.numero}>
                      {GLIFO_ESTADO[pagina.estado]} {pagina.numero} de{" "}
                      {totalPaginas}
                    </option>
                  ))}
                </select>
              </span>
              <ChevronDown
                className="pointer-events-none size-3 text-muted-foreground"
                aria-hidden
              />
            </div>
          )}
        </div>

        {/* DER: solo el cierre (T2.4 — chips de hora y motivo retirados; la
            hora de carga y el motivo siguen visibles en el HISTORIAL). */}
        <div className="ml-auto flex items-center gap-2">
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
      </div>
    </header>
  );
}
