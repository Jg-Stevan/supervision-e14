"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
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
  Terminal,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "cn";
import { SUPERVISOR } from "../data/mock-repository";
// KIT recepcion-actas-v1 (D28): el badge del sidebar cuenta las llegadas
// EN VIVO (origen carga-masiva) que ocurren fuera de la vista Recepción.
import { suscribirseRecepcion } from "../data/recepcion-log";
import { StatusDot } from "./status-dot";
import { DatosProvider, useDatos } from "./datos-provider";
import { VistaMonitor } from "./monitor-global";
import { VistaAnomalias } from "./vista-anomalias";
import { VistaRecepcion } from "./vista-recepcion";
// KIT carga-masiva-supervision-v1 (D27) — la vista CARGA MASIVA es el módulo
// digitalizador trasplantado (src/modules/digitalizador/**). ÚNICO seam de
// UI supervision→digitalizador: la vista recibe `onVerEnMonitor` para
// aterrizar un acta publicada en el visor (props, sin contexto cruzado).
import { MasivaView as VistaCargaMasiva } from "@/modules/digitalizador/components/e14/screens/MasivaView";
// KIT perfil-recursos-v1 — perfil de recursos del dispositivo (módulo
// perfil-dispositivo): detección de gama/forma + panel de diagnóstico.
// El provider monta UNA vez en el shell; la vista y el chip del header
// consumen por el hook. (Paridad de tier con la capa de MASIVA §4.4.)
// D43 — la vista SOLO es alcanzable en MODO DESARROLLADOR (perfil-dev-v1):
// la app sale al público y nada técnico debe ser visible sin él.
import {
  PerfilProvider,
  usePerfilRecursos,
} from "@/modules/perfil-dispositivo/perfil-provider";
import { VistaPerfil } from "@/modules/perfil-dispositivo/components/vista-perfil";
import {
  GESTO_TOQUES,
  GESTO_VENTANA_MS,
  ModoDevProvider,
  useModoDesarrollador,
} from "@/modules/perfil-dispositivo/modo-desarrollador";
import { tonoTier } from "@/modules/perfil-dispositivo/lib/clasificador";
import { etiquetaForma } from "@/modules/perfil-dispositivo/lib/senales";

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
 * dormidas queda intacto en el repo ("llegada la integración con el
 * digitalizador, reactivar debe costar editar esta lista").
 */
export const MODULOS_INACTIVOS: readonly VistaId[] = [
  "notificaciones",
  "informes",
];

/**
 * D43 (KIT perfil-dev-v1) — módulos SOLO DESARROLLADOR: visibles únicamente
 * con el modo desarrollador ACTIVO (gesto: 5 toques sobre el logo E-14 del
 * menú · o abrir la app con ?dev=1). La app sale al público: el diagnóstico
 * del dispositivo (señales, benchmark, router OCR, overrides) es material
 * técnico y NO se le muestra al usuario final. Mismo espíritu que D20 —
 * el código queda intacto; ocultar/ mostrar = esta lista + el modo.
 */
export const MODULOS_SOLO_DEV: readonly VistaId[] = [
  "perfil",
];

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
    // D27 — activada: el digitalizador (módulo masiva) vive en este repo.
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
  devVisible,
  onSelect,
}: {
  item: ItemNav;
  activo: boolean;
  badge?: number;
  /** D43 — true si el ítem solo existe en modo desarrollador (muestra DEV). */
  devVisible?: boolean;
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
      {/* D43 — marca discreta del ítem solo-desarrollador (solo lo ve el
          dueño con el modo activo — el público jamás renderiza esto). */}
      {devVisible && (
        <span className="font-data rounded-[4px] border border-(--primary)/40 bg-(--primary)/10 px-1 py-0.5 text-[9px] leading-4 font-semibold uppercase text-(--primary)">
          DEV
        </span>
      )}
      {/* T5/T6: badge = contador dinámico (sin número si es 0). */}
      {typeof badge === "number" && badge > 0 && (
        <span className="font-data rounded-[4px] border border-border bg-(--surface) px-1.5 py-0.5 text-[10px] leading-4 font-semibold normal-case tracking-normal text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

function BloqueLogo({
  onCerrar,
  onToqueLogo,
}: {
  onCerrar?: () => void;
  /** D43 — el logo E-14 recibe el gesto (5 toques seguidos) que alterna
   *  el MODO DESARROLLADOR. Sin gesto registrado: es un clic normal sin
   *  efecto — el público no descubre nada (el texto no sugiere interacción
   *  más allá del title discreto). */
  onToqueLogo?: () => void;
}) {
  return (
    <div className="relative border-b border-border px-4 py-4">
      <button
        type="button"
        onClick={onToqueLogo}
        title="Modo desarrollador: 5 toques seguidos aquí (o abrir con ?dev=1)"
        aria-label="Logo E-14 — alternar modo desarrollador (5 toques seguidos)"
        className="block w-full rounded-[4px] text-left focus-visible:outline-2 focus-visible:outline-(--primary)"
      >
        <p className="headline-lg">E-14</p>
        <p className="label-caps mt-1 text-muted-foreground">
          Módulo de monitoreo y auditoría
        </p>
      </button>
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
  badges: {
    notificaciones: number;
    anomalias: number;
    recepcion: number;
  };
}) {
  // D20 — filtro del sidebar: fuera las entradas de módulos inactivos
  // (su badge dinámico desaparece con ellas; el de anomalías queda).
  // D43 — filtro de módulos SOLO DEV: sin modo desarrollador, la entrada
  // del perfil NO existe para el público (y el chip GAMA tampoco — ver
  // ChipGamaHeader). Con el modo activo, vuelve CON su marca DEV.
  const { activo: devActivo, desactivar: desactivarDev } = useModoDesarrollador();
  const itemsVisibles = ITEMS_NAV.filter(
    (item) =>
      item.vista === undefined ||
      (!MODULOS_INACTIVOS.includes(item.vista) &&
        (devActivo || !MODULOS_SOLO_DEV.includes(item.vista)))
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
              devVisible={
                item.vista !== undefined && MODULOS_SOLO_DEV.includes(item.vista)
              }
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
        {/* D43 — gestor del modo desarrollador: SOLO existe con el modo
            activo (el público jamás lo ve). Un clic lo apaga y si se
            estaba mirando el perfil, la vista cae al monitor. */}
        {devActivo && (
          <div className="p-3 pb-0">
            <button
              type="button"
              onClick={() => {
                desactivarDev();
                toast.success("Modo desarrollador DESACTIVADO");
              }}
              aria-label="Desactivar modo desarrollador"
              className="label-caps flex h-11 w-full items-center gap-3 rounded-[4px] border border-(--primary)/40 px-3 text-left text-(--primary) hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)"
            >
              <Terminal className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 leading-4">Modo desarrollador</span>
              <span className="font-data rounded-[4px] border border-(--primary)/40 bg-(--primary)/10 px-1.5 py-0.5 text-[10px] leading-4 font-semibold text-(--primary)">
                ON
              </span>
            </button>
          </div>
        )}
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
 * D20 — las vistas de los módulos inactivos son INALCANZABLES (sin
 * entrada en el sidebar y sin rutas — D11): ninguna referencia activa a
 * sus componentes (T1.3); sus archivos quedan dormidos en el repo. Si
 * llegaran por estado (imposible hoy), caen al monitor.
 */
function VistaActual({
  vista,
  onVerEnMonitor,
}: {
  vista: VistaId;
  onVerEnMonitor?: ComponentProps<typeof VistaCargaMasiva>["onVerEnMonitor"];
}) {
  // D43 — el perfil es SOLO desarrollador: si llegara por estado sin el
  // modo activo (imposible hoy — el sidebar lo oculta y elegirVista
  // rechaza), cae al monitor. Mismo patrón D20 de vistas dormidas.
  const { activo: devActivo } = useModoDesarrollador();
  switch (vista) {
    case "anomalias":
      return <VistaAnomalias />;
    case "recepcion":
      // D28 — log de recepción: mismo seam por props del masiva (D27).
      return <VistaRecepcion onVerEnMonitor={onVerEnMonitor} />;
    case "carga-masiva":
      return <VistaCargaMasiva onVerEnMonitor={onVerEnMonitor} />;
    case "perfil":
      // KIT perfil-recursos-v1 — diagnóstico del dispositivo (solo dev).
      return devActivo ? <VistaPerfil /> : <VistaMonitor />;
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
/**
 * Chip de gama del header (KIT perfil-recursos-v1): el supervisor SIEMPRE
 * ve qué recursos tiene entre manos — `GAMA {tier} · {forma}` — y un clic
 * lo lleva al panel completo. Se monta DESPUÉS de la hidratación (el perfil
 * arranca PENDIENTE en SSR — cero mismatch) y abre la vista `perfil`.
 */
function ChipGamaHeader({ onAbrir }: { onAbrir: () => void }) {
  // D43 — el chip GAMA es una referencia técnica (abre el diagnóstico):
  // SOLO se muestra en modo desarrollador. El público ve un header limpio.
  const { activo: devActivo } = useModoDesarrollador();
  const { perfil } = usePerfilRecursos();
  if (!devActivo) return null;
  if (!perfil.listo || perfil.tier === "PENDIENTE" || !perfil.senales) return null;
  const color =
    tonoTier(perfil.tier) === "success"
      ? "var(--success)"
      : tonoTier(perfil.tier) === "warning"
        ? "var(--warning)"
        : "var(--danger)";
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="font-data inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-border bg-(--surface) px-2.5 text-[11px] font-semibold tracking-wide text-foreground hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)"
      title={`Gama ${perfil.tier} detectada${perfil.tierInferido ? " (inferida)" : ""} · dispositivo: ${perfil.senales.forma} — abrir el perfil del dispositivo`}
      aria-label={`Gama ${perfil.tier} · ${etiquetaForma(perfil.senales.forma)} — abrir perfil del dispositivo`}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      GAMA {perfil.tier} · {etiquetaForma(perfil.senales.forma)}
    </button>
  );
}

export function SupervisionShell() {
  return (
    <PerfilProvider>
      {/* D43 — el MODO DESARROLLADOR envuelve el shell: apagado, el módulo
          perfil-dispositivo no existe en la UI (nav + chip + vista). */}
      <ModoDevProvider>
        <DatosProvider>
          <ShellInterno />
        </DatosProvider>
      </ModoDevProvider>
    </PerfilProvider>
  );
}

function ShellInterno() {
  const { notificacionesNoLeidas, anomaliasAbiertas, cargando, abrirVisor } =
    useDatos();
  // D43 — modo desarrollador: sin él, el módulo perfil-dispositivo NO
  // existe en la UI (entrada del sidebar, chip GAMA y vista).
  const {
    activo: devActivo,
    activar: activarDev,
    desactivar: desactivarDev,
  } = useModoDesarrollador();
  const [vista, setVista] = useState<VistaId>("monitor");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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

  // D43 — si el modo desarrollador se apaga mientras se miraba el perfil,
  // la vista cae al monitor (el módulo deja de existir — paridad con D20).
  useEffect(() => {
    if (!devActivo && vista === "perfil") setVista("monitor");
  }, [devActivo, vista]);

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

  // D43 — GESTO del logo: 5 toques seguidos (≤ 2,5 s entre toques) alternan
  // el modo desarrollador. Un solo clic queda sin efecto alguno — el
  // público no descubre nada; el dueño sí tiene una puerta sin teclado.
  const toquesRef = useRef<number[]>([]);
  const toqueLogo = () => {
    const ahora = Date.now();
    const toques = toquesRef.current.filter((t) => ahora - t <= GESTO_VENTANA_MS);
    toques.push(ahora);
    toquesRef.current = toques;
    if (toques.length < GESTO_TOQUES) return;
    toquesRef.current = []; // el gesto se consume
    if (devActivo) {
      desactivarDev();
      toast.success("Modo desarrollador DESACTIVADO — la app queda en vista pública");
    } else {
      activarDev();
      toast.success("Modo desarrollador ACTIVADO — «Perfil del dispositivo» visible");
    }
  };

  const elegirVista = (v: VistaId) => {
    // D43 — defensa en profundidad: el perfil es inalcanzable sin modo
    // desarrollador (el filtro del sidebar ya lo oculta; esto lo remata).
    if (v === "perfil" && !devActivo) return;
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
        <BloqueLogo
          onCerrar={() => setMenuAbierto(false)}
          onToqueLogo={toqueLogo}
        />
        <ContenidoNav
          vista={vista}
          onVista={elegirVista}
          badges={{
            notificaciones: notificacionesNoLeidas,
            anomalias: anomaliasAbiertas,
            recepcion: recepcionesNuevas,
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
            <ChipGamaHeader onAbrir={() => elegirVista("perfil")} />
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
    </div>
  );
}
