"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  FileText,
  Flag,
  LogOut,
  Menu,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "cn";
import { SUPERVISOR } from "../data/mock-repository";
import { StatusDot } from "./status-dot";
import { DatosProvider, useDatos } from "./datos-provider";
import { VistaMonitor } from "./monitor-global";
import { VistaNotificaciones } from "./vista-notificaciones";
import { VistaAnomalias } from "./vista-anomalias";
import { VistaInformes } from "./vista-informes";

/** Vistas del shell (D11): cambio por estado interno — NO rutas nuevas
 * (el export estático sigue siendo trivial: una sola página). */
type VistaId = "monitor" | "notificaciones" | "anomalias" | "informes";

interface ItemNav {
  Icono: LucideIcon;
  etiqueta: string;
  vista?: VistaId;
  /** Ítem deshabilitado con tooltip (Carga Masiva — fuera de alcance). */
  deshabilitado?: boolean;
  tooltip?: string;
  /** Clave del badge dinámico (contadores del store, kit T4/T5/T6). */
  badgeDe?: "notificaciones" | "anomalias";
}

const ITEMS_NAV: ItemNav[] = [
  { Icono: Activity, etiqueta: "Monitor global", vista: "monitor" },
  {
    Icono: Upload,
    etiqueta: "Carga masiva",
    deshabilitado: true,
    tooltip: "Se conectará al digitalizador (fase de integración)",
  },
  {
    Icono: Bell,
    etiqueta: "Centro de notificaciones",
    vista: "notificaciones",
    badgeDe: "notificaciones",
  },
  { Icono: FileText, etiqueta: "Generar informes", vista: "informes" },
  {
    Icono: Flag,
    etiqueta: "Revisión de anomalías",
    vista: "anomalias",
    badgeDe: "anomalias",
  },
];

const CLASE_ITEM =
  "label-caps flex h-11 w-full items-center gap-3 rounded-[4px] px-3 text-left text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)";

function ItemNavBoton({
  item,
  activo,
  badge,
  onSelect,
}: {
  item: ItemNav;
  activo: boolean;
  badge?: number;
  onSelect?: () => void;
}) {
  const { Icono, etiqueta } = item;
  return (
    <button
      type="button"
      className={cn(
        CLASE_ITEM,
        activo && "border-l-2 border-(--primary) bg-(--accent) text-foreground",
        item.deshabilitado && "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground"
      )}
      aria-current={activo ? "page" : undefined}
      aria-disabled={item.deshabilitado || undefined}
      onClick={item.deshabilitado ? undefined : onSelect}
    >
      <Icono
        className={cn("size-4 shrink-0", activo && "text-(--primary)")}
        aria-hidden
      />
      <span className="flex-1 leading-4">{etiqueta}</span>
      {/* T5/T6: badge = contador dinámico (sin número si es 0). */}
      {typeof badge === "number" && badge > 0 && (
        <span className="font-data rounded-[4px] border border-border bg-(--surface) px-1.5 py-0.5 text-[10px] leading-4 font-semibold normal-case tracking-normal text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

function BloqueLogo({ onCerrar }: { onCerrar?: () => void }) {
  return (
    <div className="relative border-b border-border px-4 py-4">
      <p className="headline-lg">E-14</p>
      <p className="label-caps mt-1 text-muted-foreground">
        Módulo de monitoreo y auditoría
      </p>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar menú de navegación"
          className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
        >
          <X className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Contenido de navegación (kit T1): la sidebar flotante conserva su
 * contenido actual (logo, ítems, badges, CERRAR SESIÓN). Los ítems con
 * vista cambian el estado del shell; Carga Masiva sigue deshabilitada con
 * el tooltip del kit; el resto de tooltips "Próximamente" desaparecen
 * porque ahora SÍ navegan.
 */
function ContenidoNav({
  vista,
  onVista,
  badges,
}: {
  vista: VistaId;
  onVista: (v: VistaId) => void;
  badges: { notificaciones: number; anomalias: number };
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
        {ITEMS_NAV.map((item) => {
          const badge =
            item.badgeDe === "notificaciones"
              ? badges.notificaciones
              : item.badgeDe === "anomalias"
                ? badges.anomalias
                : undefined;
          const boton = (
            <ItemNavBoton
              key={item.etiqueta}
              item={item}
              activo={item.vista === vista}
              badge={badge}
              onSelect={item.vista ? () => onVista(item.vista as VistaId) : undefined}
            />
          );
          if (!item.tooltip) return boton;
          return (
            <Tooltip key={item.etiqueta}>
              <TooltipTrigger asChild>{boton}</TooltipTrigger>
              <TooltipContent side="right" className="font-data text-xs">
                {item.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <div className="mt-auto">
        <Separator />
        <div className="p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className={CLASE_ITEM}>
                <LogOut className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 leading-4">Cerrar sesión</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-data text-xs">
              Próximamente
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

function VistaActual({ vista }: { vista: VistaId }) {
  switch (vista) {
    case "notificaciones":
      return <VistaNotificaciones />;
    case "anomalias":
      return <VistaAnomalias />;
    case "informes":
      return <VistaInformes />;
    default:
      return <VistaMonitor />;
  }
}

/**
 * Shell del módulo (kit SUP-3 T1 / D14): la sidebar YA NO es fija en
 * ningún viewport — por defecto OCULTA y el contenido ocupa todo el
 * ancho. El botón ☰ del header (siempre visible) la abre como panel
 * flotante ENCIMA del contenido, anclado a la izquierda, con scrim
 * rgba(0,0,0,0.5) y borde derecho 1px outline-variant (sin sombras).
 * Cierre: ✕, Escape y clic en el scrim. Móvil y desktop comparten el
 * MISMO overlay (unificado, sin duplicar).
 */
export function SupervisionShell() {
  return (
    <DatosProvider>
      <ShellInterno />
    </DatosProvider>
  );
}

function ShellInterno() {
  const { notificacionesNoLeidas, anomaliasAbiertas, cargando } = useDatos();
  const [vista, setVista] = useState<VistaId>("monitor");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape cierra el overlay (kit T1) + bloqueo de scroll de fondo.
  useEffect(() => {
    if (!menuAbierto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrevio;
    };
  }, [menuAbierto]);

  const elegirVista = (v: VistaId) => {
    setVista(v);
    setMenuAbierto(false); // el overlay cede el paso a la vista elegida
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Scrim del overlay (clic fuera cierra — kit T1). Sin sombras: la
          separación es el borde derecho 1px outline-variant + scrim. */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setMenuAbierto(false)}
          aria-hidden
        />
      )}

      {/* Panel flotante anclado a la izquierda, altura completa, ENCIMA */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto border-r border-(--outline-variant) bg-card outline-none",
          !menuAbierto && "hidden"
        )}
      >
        <BloqueLogo onCerrar={() => setMenuAbierto(false)} />
        <ContenidoNav
          vista={vista}
          onVista={elegirVista}
          badges={{
            notificaciones: notificacionesNoLeidas,
            anomalias: anomaliasAbiertas,
          }}
        />
      </div>

      {/* El contenido ocupa TODO el ancho (la sidebar ya no es fija). */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-border bg-card px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] text-foreground hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)"
              aria-label="Abrir menú de navegación"
              aria-expanded={menuAbierto}
              onClick={() => setMenuAbierto(true)}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <h1 className="headline-md truncate">
              SISTEMA DE MONITOREO ELECTORAL E-14
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <span className="label-caps flex items-center gap-1.5 text-(--success)">
              <StatusDot />
              Online
            </span>
            <span className="hidden items-center gap-2 md:flex">
              <span className="label-caps text-muted-foreground">
                {SUPERVISOR.nombre}
              </span>
              <span className="body-md text-muted-foreground">
                ID: {SUPERVISOR.id}
              </span>
            </span>
          </div>
        </header>

        <main className="flex-1">
          {cargando && vista !== "monitor" ? (
            <div className="space-y-4 p-4 md:p-6">
              <div className="h-11 w-full max-w-md animate-pulse rounded-[4px] bg-(--surface)" aria-hidden />
              <div className="h-96 w-full animate-pulse rounded-[4px] bg-(--surface)" aria-hidden />
            </div>
          ) : (
            <VistaActual vista={vista} />
          )}
        </main>
      </div>
    </div>
  );
}
