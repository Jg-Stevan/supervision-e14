"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Bell,
  Cpu,
  FileText,
  Flag,
  Inbox,
  LogOut,
  Menu,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SUPERVISOR } from "../data/mock-repository";
// KIT recepcion-actas-v1 (D28): el badge del sidebar cuenta las llegadas
// EN VIVO (origen carga-masiva) que ocurren fuera de la vista Recepción.
import { suscribirseRecepcion } from "../data/recepcion-log";
// KIT puente-remoto-v1: poller del hub de actas del digitalizador — trae
// las actas publicadas remotamente y las inyecta por publicarActaMasiva.
import { usePuenteRemoto, type EstadoPuenteRemoto } from "./use-puente-remoto";
import { StatusDot } from "./status-dot";
import { DatosProvider, useDatos } from "./datos-provider";
import { VistaMonitor } from "./monitor-global";
import { VistaAnomalias } from "./vista-anomalias";
import { VistaRecepcion } from "./vista-recepcion";
import { VistaCargaMasiva } from "./vista-carga-masiva";
// Reactivadas (D20): las vistas NOTIFICACIONES e INFORMES están COMPLETAS
// en este repo (componente + lógica del store) — hoy SÍ navegan.
import { VistaNotificaciones } from "./vista-notificaciones";
import { VistaInformes } from "./vista-informes";
// NOTA de trasplante (sandbox): el PERFIL DEL DISPOSITIVO (módulo
// perfil-dispositivo) sigue vivo en el repo completo del proyecto y queda
// DORMIDO vía MODULOS_INACTIVOS (D20). La CARGA MASIVA fue REACTIVADA con
// una vista NATIVA (vista-carga-masiva) sobre el seam real
// publicarActaMasiva — el pipeline OCR/QR completo del digitalizador
// sigue en el repo completo; reactivarlo = traer sus módulos.
// reactivar PERFIL = traer su módulo y quitar su id de la lista.

/** Vistas del shell (D11): cambio por estado interno — NO rutas nuevas
 * (el export estático sigue siendo trivial: una sola página).
 *
 * KIT SUP-5 (D20): "notificaciones" e "informes" quedan DORMIDAS — sus
 * componentes y su lógica en el store permanecen intactos e inalcanzables
 * (ver MODULOS_INACTIVOS); reactivar la entrada = editar esa lista. */
type VistaId =
  | "monitor"
  | "recepcion"
  | "carga-masiva"
  | "notificaciones"
  | "anomalias"
  | "informes"
  | "perfil";

/**
 * D20 — Retiro TEMPORAL de módulos (no borrado): las entradas cuyo
 * `vista` figure aquí se filtran del sidebar. El código de las vistas
 * dormidas queda intacto en el repo («llegada la integración con el
 * digitalizador, reactivar debe costar editar esta lista» — hoy la
 * promesa es CIERTA: VistaActual ya sabe renderizar cualquier vista
 * activable; solo perfil espera su módulo).
 *
 * NOTIFICACIONES, INFORMES y CARGA MASIVA fueron REACTIVADAS: sus vistas
 * viven y funcionan en este repo (centro de notificaciones con badge real,
 * informes con descarga .md/.csv y la cola masiva nativa sobre el seam
 * publicarActaMasiva).
 */
export const MODULOS_INACTIVOS: readonly VistaId[] = ["perfil"];

interface ItemNav {
  Icono: LucideIcon;
  etiqueta: string;
  vista?: VistaId;
  /** Ítem deshabilitado con tooltip (Carga Masiva — fuera de alcance). */
  deshabilitado?: boolean;
  tooltip?: string;
  /** Clave del badge dinámico (contadores del store, kit T4/T5/T6).
   * KIT recepcion-actas-v1 (D28): "recepcion" = llegadas fuera de la vista. */
  badgeDe?: "notificaciones" | "anomalias" | "recepcion";
}

/** Ítems del sidebar. Los DORMIDOS (D20) siguen declarados aquí — se
 * filtran al renderizar por MODULOS_INACTIVOS; así reactivar es una
 * edición de la lista, no de la navegación. */
const ITEMS_NAV: ItemNav[] = [
  { Icono: Activity, etiqueta: "Monitor global", vista: "monitor" },
  {
    Icono: Inbox,
    etiqueta: "Recepción de actas",
    // D28 — log EN VIVO de las actas que van llegando (masiva + ingesta).
    vista: "recepcion",
    badgeDe: "recepcion",
  },
  {
    Icono: Upload,
    etiqueta: "Carga masiva",
    // D27 — REACTIVADA: vista nativa (vista-carga-masiva) sobre el seam
    // real publicarActaMasiva; recepción (D28) y monitor consumen en vivo.
    vista: "carga-masiva",
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
  // KIT perfil-recursos-v1 — diagnóstico de recursos del dispositivo
  // (gama baja/media/alta · PC/móvil): detección + plan recomendado.
  { Icono: Cpu, etiqueta: "Perfil del dispositivo", vista: "perfil" },
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
 * vista cambian el estado del shell; los módulos dormidos (D20) se
 * filtran; CERRAR SESIÓN pide confirmación antes de cerrar.
 */
/**
 * KIT puente-remoto-v1 — bloque compacto de estado del PUENTE REMOTO en
 * el footer del sidebar (mismo lenguaje que los badges: label-caps,
 * font-data, borde/fondo oscuros del kit). Clic = sincronizar AHORA +
 * abrir la vista Recepción (donde aterrizan las llegadas).
 */
function BloquePuenteRemoto({
  puente,
  onVerRecepcion,
}: {
  puente: EstadoPuenteRemoto & { sincronizarAhora: () => void };
  onVerRecepcion: () => void;
}) {
  const { conectado, sincronizando, nuevas } = puente;
  return (
    <button
      type="button"
      onClick={() => {
        puente.sincronizarAhora();
        onVerRecepcion();
      }}
      title="Puente remoto — clic para sincronizar ahora"
      aria-label={`Puente remoto: ${conectado ? "en vivo" : "sin conexión"}. Clic para sincronizar ahora y abrir Recepción`}
      className="mb-2 flex w-full cursor-pointer items-center gap-2.5 rounded-[4px] border border-border bg-(--surface) px-3 py-2 text-left hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)"
    >
      {/* Punto de estado: verde + pulse si conectado, rojo si no. */}
      <span
        aria-hidden
        className={cn(
          "inline-block size-2 shrink-0 rounded-full",
          conectado ? "animate-pulse bg-emerald-400" : "bg-red-400"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="label-caps block leading-4 text-muted-foreground">
          Puente remoto
        </span>
        <span
          className={cn(
            "font-data block text-[10px] leading-4 font-semibold",
            conectado ? "text-emerald-400" : "text-red-400"
          )}
        >
          {sincronizando
            ? "SINCRONIZANDO…"
            : conectado
              ? "EN VIVO"
              : "SIN CONEXIÓN"}
        </span>
      </span>
      {/* Llegadas de la última sync (como el badge de los ítems). */}
      {nuevas > 0 && (
        <span className="font-data shrink-0 rounded-[4px] border border-border bg-card px-1.5 py-0.5 text-[10px] leading-4 font-semibold normal-case tracking-normal text-emerald-400">
          +{nuevas} nuevas
        </span>
      )}
    </button>
  );
}

function ContenidoNav({
  vista,
  onVista,
  badges,
  puente,
  onCerrarSesion,
}: {
  vista: VistaId;
  onVista: (v: VistaId) => void;
  badges: {
    notificaciones: number;
    anomalias: number;
    recepcion: number;
  };
  /** KIT puente-remoto-v1 — estado del poller para el bloque del footer. */
  puente: EstadoPuenteRemoto & { sincronizarAhora: () => void };
  onCerrarSesion: () => void;
}) {
  // D20 — filtro del sidebar: fuera las entradas de módulos inactivos
  // (su badge dinámico desaparece con ellas; el de anomalías queda).
  const itemsVisibles = ITEMS_NAV.filter(
    (item) =>
      item.vista === undefined || !MODULOS_INACTIVOS.includes(item.vista)
  );
  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
        {itemsVisibles.map((item) => {
          const badge =
            item.badgeDe === "notificaciones"
              ? badges.notificaciones
              : item.badgeDe === "anomalias"
                ? badges.anomalias
                : item.badgeDe === "recepcion"
                  ? badges.recepcion
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
          {/* KIT puente-remoto-v1 — estado del hub del digitalizador;
              clic = sincronizar ahora + abrir Recepción. */}
          <BloquePuenteRemoto puente={puente} onVerRecepcion={() => onVista("recepcion")} />
          {/* Sesión local de demo (sin backend): confirmar → pantalla de
              sesión cerrada → volver a entrar remonta TODO el store. Al
              integrar autenticación real (p. ej. NextAuth), reemplazar el
              estado del shell por la sesión del proveedor. */}
          <button
            type="button"
            className={CLASE_ITEM}
            onClick={onCerrarSesion}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 leading-4">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * D20 — las vistas de los módulos inactivos caen al monitor (sus
 * componentes viven en el repo completo del proyecto). Las ACTIVAS —
 * incluidas notificaciones e informes, reactivadas — renderizan aquí.
 */
function VistaActual({
  vista,
  onVerEnMonitor,
}: {
  vista: VistaId;
  onVerEnMonitor?: (
    puestoId: string,
    mesaId: string,
    tipo?: import("../domain/acta").FormularioTipo,
  ) => void;
}) {
  switch (vista) {
    case "anomalias":
      return <VistaAnomalias />;
    case "recepcion":
      // D28 — log de recepción: mismo seam por props del masiva (D27).
      return <VistaRecepcion onVerEnMonitor={onVerEnMonitor} />;
    case "notificaciones":
      return <VistaNotificaciones />;
    case "informes":
      return <VistaInformes />;
    case "carga-masiva":
      // D27 — REACTIVADA: el productor nativo sobre publicarActaMasiva;
      // VER EN MONITOR aterriza el acta publicada en el visor (mismo seam).
      return <VistaCargaMasiva onVerEnMonitor={onVerEnMonitor} />;
    default:
      // monitor + los módulos dormidos (imposible alcanzarlos hoy).
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
 *
 * SESIÓN (demo sin backend): cerrar sesión pide confirmación, muestra la
 * pantalla de sesión cerrada y, al volver a entrar, REMONTA el store
 * (key=ciclo) — los datos en memoria se restablecen, mismo contrato de
 * memoria de sesión (§0-5) que una recarga.
 */
export function SupervisionShell() {
  const [sesionActiva, setSesionActiva] = useState(true);
  /** Cada «volver a entrar» incrementa el ciclo → DatosProvider remonta
   * limpio (carga inicial, badges, ticker y suscripciones desde cero). */
  const [cicloSesion, setCicloSesion] = useState(0);

  if (!sesionActiva) {
    return (
      <PantallaSesionCerrada
        onVolver={() => {
          setCicloSesion((c) => c + 1);
          setSesionActiva(true);
        }}
      />
    );
  }

  return (
    <DatosProvider key={cicloSesion}>
      <ShellInterno onCerrarSesion={() => setSesionActiva(false)} />
    </DatosProvider>
  );
}

/** Pantalla post-logout: confirmación visual del cierre con la identidad
 * del supervisor y reingreso manual (sin backend no hay formulario de
 * credenciales — al integrar auth real, esta pantalla lo reemplaza). */
function PantallaSesionCerrada({ onVolver }: { onVolver: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <main className="w-full max-w-sm rounded-[4px] border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-(--surface)">
          <LogOut className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <p className="headline-lg">Sesión cerrada</p>
        <p className="body-md mt-2 text-muted-foreground">
          Cerraste la sesión de{" "}
          <span className="font-data text-foreground">
            {SUPERVISOR.nombre} · {SUPERVISOR.id}
          </span>{" "}
          en este dispositivo. Los datos en memoria se restablecen al volver
          a entrar.
        </p>
        <Button className="mt-6 w-full" onClick={onVolver}>
          Volver a entrar
        </Button>
      </main>
    </div>
  );
}

function ShellInterno({ onCerrarSesion }: { onCerrarSesion: () => void }) {
  const { notificacionesNoLeidas, anomaliasAbiertas, cargando, abrirVisor } =
    useDatos();
  const [vista, setVista] = useState<VistaId>("monitor");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // KIT puente-remoto-v1 — productor remoto: al montar (800 ms) repuebla
  // TODO el histórico del hub; luego polling cada 8 s (visible + sin
  // ciclo en curso). Publica vía publicarActaMasiva → monitor/recepción.
  const puente = usePuenteRemoto();
  // CERRAR SESIÓN: confirmación antes de ejecutar (evita cierres por
  // clic accidental en la sidebar flotante).
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  // D28 — llegadas mientras el supervisor NO está mirando la recepción
  // (badge del sidebar; se anula al abrir la vista).
  const [recepcionesNuevas, setRecepcionesNuevas] = useState(0);
  const vistaRef = useRef<VistaId>(vista);

  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);

  useEffect(() => {
    return suscribirseRecepcion((entrada) => {
      if (entrada.origen !== "carga-masiva") return; // la semilla no cuenta
      if (vistaRef.current === "recepcion") return;
      setRecepcionesNuevas((n) => n + 1);
    });
  }, []);

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
    if (v === "recepcion") setRecepcionesNuevas(0); // D28 — leídas al abrir
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
          onCerrarSesion={() => {
            setMenuAbierto(false);
            setConfirmarSalir(true);
          }}
          badges={{
            notificaciones: notificacionesNoLeidas,
            anomalias: anomaliasAbiertas,
            recepcion: recepcionesNuevas,
          }}
          puente={puente}
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
            <VistaActual
              vista={vista}
              onVerEnMonitor={(puestoId, mesaId, tipo) => {
                // D27 — VER EN MONITOR: aterriza el acta publicada en el
                // visor (cambia a MONITOR y abre el acta de esa mesa).
                elegirVista("monitor");
                abrirVisor(puestoId, mesaId, tipo ? { tipo } : undefined);
              }}
            />
          )}
        </main>
      </div>

      {/* Confirmación de cierre de sesión (dialog modal accesible). */}
      <AlertDialog open={confirmarSalir} onOpenChange={setConfirmarSalir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cerrará la sesión de {SUPERVISOR.nombre} (ID: {SUPERVISOR.id})
              en este dispositivo. Los datos en memoria se restablecerán al
              volver a entrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onCerrarSesion}>
              Cerrar sesión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
