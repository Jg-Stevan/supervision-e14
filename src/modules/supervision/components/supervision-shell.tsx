"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  FileText,
  Flag,
  LogOut,
  Menu,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "cn";
import { SUPERVISOR } from "../data/mock-repository";
import { StatusDot } from "./status-dot";

interface ItemNav {
  Icono: LucideIcon;
  etiqueta: string;
  activo?: boolean;
  badge?: string;
}

const ITEMS_NAV: ItemNav[] = [
  { Icono: Activity, etiqueta: "Monitor global", activo: true },
  { Icono: Upload, etiqueta: "Carga masiva" },
  {
    Icono: Bell,
    etiqueta: "Centro de notificaciones",
    badge: "RESCANEO 0",
  },
  { Icono: FileText, etiqueta: "Generar informes" },
  {
    Icono: Flag,
    etiqueta: "Revisión de anomalías",
    badge: "Anomalía 5",
  },
];

const CLASE_ITEM =
  "label-caps flex h-11 w-full items-center gap-3 rounded-[4px] px-3 text-left text-muted-foreground hover:bg-(--accent) hover:text-foreground";

function ItemNavBoton({ item }: { item: ItemNav }) {
  const { Icono, etiqueta, activo, badge } = item;
  return (
    <button
      type="button"
      className={cn(
        CLASE_ITEM,
        activo &&
          "border-l-2 border-(--primary) bg-(--accent) text-foreground"
      )}
      aria-current={activo ? "page" : undefined}
    >
      <Icono
        className={cn("size-4 shrink-0", activo && "text-(--primary)")}
        aria-hidden
      />
      <span className="flex-1 leading-4">{etiqueta}</span>
      {badge && (
        <span className="font-data rounded-[4px] border border-border bg-(--surface) px-1.5 py-0.5 text-[10px] leading-4 font-semibold normal-case tracking-normal text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

function BloqueLogo() {
  return (
    <div className="border-b border-border px-4 py-4">
      <p className="headline-lg">E-14</p>
      <p className="label-caps mt-1 text-muted-foreground">
        Módulo de monitoreo y auditoría
      </p>
    </div>
  );
}

/**
 * Contenido de navegación (compartido por la sidebar fija y el drawer).
 * Solo MONITOR GLOBAL está activo; el resto no navega (tooltip
 * "Próximamente", kit §0-9).
 */
function ContenidoNav() {
  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
        {ITEMS_NAV.map((item) => {
          if (item.activo) {
            return <ItemNavBoton key={item.etiqueta} item={item} />;
          }
          return (
            <Tooltip key={item.etiqueta}>
              <TooltipTrigger asChild>
                <ItemNavBoton item={item} />
              </TooltipTrigger>
              <TooltipContent side="right" className="font-data text-xs">
                Próximamente
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

/**
 * Shell del módulo (kit §3-T3): sidebar 256px fija en ≥1024px, drawer
 * (Sheet) en móvil vía botón ☰ del header, header sticky de 48px.
 */
export function SupervisionShell({ children }: { children: ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar fija ≥1024px */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-border bg-card lg:flex">
        <BloqueLogo />
        <ContenidoNav />
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-border bg-card px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] text-foreground hover:bg-(--accent) lg:hidden"
                  aria-label="Abrir menú de navegación"
                >
                  <Menu className="size-5" aria-hidden />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 border-border bg-card p-0 shadow-none"
              >
                <SheetTitle className="sr-only">Navegación</SheetTitle>
                <div className="flex h-full flex-col overflow-y-auto">
                  <BloqueLogo />
                  <ContenidoNav />
                </div>
              </SheetContent>
            </Sheet>
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

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
