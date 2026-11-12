"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import {
  Activity,
  Bell,
  Cpu,
  Flag,
  Inbox,
  LogOut,
  Menu,
  Settings,
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
import { cn } from "@/lib/utils";
import { SUPERVISOR } from "../data/mock-repository";
// KIT recepcion-actas-v1 (D28): el badge del sidebar cuenta las llegadas
// EN VIVO (origen carga-masiva o puente-local) que ocurren fuera de la vista
// Recepción.
import { esLlegadaViva, suscribirseRecepcion } from "../data/recepcion-log";
// E2E local — el sondeo del hub vive en el SHELL (no en la vista): si viviera
// en Recepción, cambiar de vista cortaría el feed del celular. C-24 — el chip
// Online del header también lee su estado (último sondeo) para el semáforo.
import {
  estadoHubLocal,
  iniciarHubLocal,
  suscribirseHubLocal,
  type EstadoHubLocal,
} from "../data/hub-local";
import { Esqueleto } from "./esqueleto";
import { DatosProvider, useDatos, useDatosAcciones } from "./datos-provider";
// R4-M7 — espejo de la sesión en location.hash (D11: espejo, NO router).
import { escribirHashParcial, leerEstadoHash } from "./espejo-url";
import { VistaMonitor } from "./monitor-global";
import { VistaAnomalias } from "./vista-anomalias";
// Ronda C — la recepción volvió: métricas r5 (KPI TOTAL, RITMO, FLUJO…).
import { VistaRecepcion } from "./vista-recepcion";
// 0.2/H-2 + 0.6 — vista CONFIGURACIÓN: token de lectura del hub (localStorage
// del supervisor, jamás en el bundle) + aviso «Privacidad y retención».
import { VistaAjustes } from "./vista-ajustes";
// KIT carga-masiva-supervision-v1 (D27) — la vista CARGA MASIVA es el módulo
// digitalizador trasplantado (src/modules/digitalizador/**). ÚNICO seam de
// UI supervision→digitalizador: la vista recibe `onVerEnMonitor` para
// aterrizar un acta publicada en el visor (props, sin contexto cruzado).
import { MasivaView as VistaCargaMasiva } from "@/modules/digitalizador/components/e14/screens/MasivaView";
// KIT perfil-recursos-v1 — perfil de recursos del dispositivo (módulo
// perfil-dispositivo): detección de gama/forma + panel de diagnóstico.
// El provider monta UNA vez en el shell; la vista y el chip del header
// consumen por el hook. (Paridad de tier con la capa de MASIVA §4.4.)
import {
  PerfilProvider,
  usePerfilRecursos,
} from "@/modules/perfil-dispositivo/perfil-provider";
import { VistaPerfil } from "@/modules/perfil-dispositivo/components/panel-perfil";
import { tonoTier } from "@/modules/perfil-dispositivo/lib/clasificador";
import { etiquetaForma } from "@/modules/perfil-dispositivo/lib/senales";
// R2 — mapa tono→token único (§B2 #8).
import { colorDeTono } from "@/shared/ui/tono";

/** Vistas del shell (D11): cambio por estado interno — NO rutas nuevas
 * (el export estático sigue siendo trivial: una sola página).
 *
 * Ronda «reloj real» (pedido del dueño): «recepción debe ser el mismo que
 * monitor global, ese se reemplaza (el de recepción)» — la vista de
 * RECEPCIÓN quedó dormida y su lugar lo ocupó el visor del MONITOR GLOBAL.
 *
 * Ronda C (petición del dueño: «¿por qué se desactivó recepción?»): la
 * vista VUELVE VIVA — revestida con las métricas del diseño r5 (R1–R7:
 * KPI TOTAL, RITMO/throughput, FLUJO 60 s, pausar feed, latencia media,
 * hora dual REC/ORIGEN).
 *
 * D82 — «Centro de notificaciones» y «Generar informes» se BORRARON (no se
 * dormitan): eran 554 líneas inalcanzables. El dato de notificaciones sí
 * sigue vivo en el repositorio (las anomalías y la carga masiva generan
 * entradas) — lo que falta es la vista que las muestre. Ver docs/DEUDA.md. */
export type VistaId =
  | "monitor"
  | "recepcion"
  | "carga-masiva"
  | "anomalias"
  | "perfil"
  | "ajustes";

interface ItemNav {
  Icono: LucideIcon;
  etiqueta: string;
  vista?: VistaId;
  /** Ítem deshabilitado con tooltip (Carga Masiva — fuera de alcance). */
  deshabilitado?: boolean;
  tooltip?: string;
  /** Clave del badge dinámico (contadores del store, kit T4/T5/T6).
   * KIT recepcion-actas-v1 (D28): "recepcion" = llegadas fuera de la vista. */
  badgeDe?: "anomalias" | "recepcion";
}

/** Ítems del sidebar. */
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
    Icono: Flag,
    etiqueta: "Revisión de anomalías",
    vista: "anomalias",
    badgeDe: "anomalias",
  },
  // KIT perfil-recursos-v1 — diagnóstico de recursos del dispositivo
  // (gama baja/media/alta · PC/móvil): detección + plan recomendado.
  { Icono: Cpu, etiqueta: "Perfil del dispositivo", vista: "perfil" },
  // 0.2/H-2 + 0.6 — token de lectura del hub + aviso de privacidad.
  { Icono: Settings, etiqueta: "Configuración", vista: "ajustes" },
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
  badges: {
    anomalias: number;
    recepcion: number;
  };
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
        {ITEMS_NAV.map((item) => {
          const badge =
            item.badgeDe === "anomalias"
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
 * D11 — el shell elige la vista por estado, no por ruta (el export estático
 * sigue siendo una sola página). Vista desconocida ⇒ monitor.
 */
function VistaActual({
  vista,
  onVerEnMonitor,
}: {
  vista: VistaId;
  onVerEnMonitor?: ComponentProps<typeof VistaCargaMasiva>["onVerEnMonitor"];
}) {
  switch (vista) {
    case "anomalias":
      return <VistaAnomalias />;
    case "carga-masiva":
      return <VistaCargaMasiva onVerEnMonitor={onVerEnMonitor} />;
    case "recepcion":
      // Ronda C — recepción viva (R1–R7 del diseño r5).
      return <VistaRecepcion onVerEnMonitor={onVerEnMonitor} />;
    case "perfil":
      // KIT perfil-recursos-v1 — diagnóstico del dispositivo.
      return <VistaPerfil />;
    case "ajustes":
      // 0.2/H-2 + 0.6 — token de lectura + privacidad/retención.
      return <VistaAjustes />;
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
  const { perfil } = usePerfilRecursos();
  if (!perfil.listo || perfil.tier === "PENDIENTE" || !perfil.senales) return null;
  // R2 — mapa tono→token único (src/shared/ui/tono.ts, §B2 #8): reemplaza el
  // ternario duplicado. Equivalencia exacta en el dominio real: tonoTier()
  // jamás devuelve "neutral" para ALTO/MEDIO/BAJO (test de paridad lo fija).
  const color = colorDeTono(tonoTier(perfil.tier));
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

/**
 * C-24 — chip ONLINE honesto del header (semáforo, documentado):
 *  · ROJO — sin red (`navigator.onLine === false`) O el último sondeo al hub
 *    FALLÓ (`ultimoError` != null o autodetenido `detenido`): la conectividad
 *    extremo a extremo NO está confirmada.
 *  · ÁMBAR — hay red, pero el sondeo del hub AÚN NO CORRIÓ (hub prendido y
 *    sin primera sync): no se puede afirmar nada — no verde prematuro.
 *  · VERDE — hay red y nada fallando. Con el hub APAGADO la red manda (el
 *    apagón del puente es decisión del dueño, no un fallo de red; la tarjeta
 *    «Hub local» muestra su propio estado). Semántica simple verde/ámbar/rojo.
 */
/** C-24 — suscripción al estado de red del navegador (`online`/`offline`).
 *  Viva a nivel de módulo para `useSyncExternalStore`: el estado de red
 *  existe FUERA de React y este es su contrato canónico — sin setState
 *  síncrono dentro del efecto (lint react-hooks/set-state-in-effect). */
function suscribirseARed(alCambiar: () => void): () => void {
  window.addEventListener("online", alCambiar);
  window.addEventListener("offline", alCambiar);
  return () => {
    window.removeEventListener("online", alCambiar);
    window.removeEventListener("offline", alCambiar);
  };
}

function ChipNotificaciones() {
  // P-28 (plan 2026-11-12) — D82: el DATO de notificaciones sigue vivo en el
  // provider (las anomalías y la carga masiva generan entradas; el flujo del
  // visor lanza toasts) pero desde que el centro de notificaciones se BORRÓ
  // con D82 no había ni una UI que lo renderizara. Decisión P-28:
  // RENDERIZAR — no retirar el estado con ADR, porque las acciones del
  // producto lo producen de verdad (registrarRescaneo/validez → notificación).
  // El chip mínimo que honra el dato: badge de NO leídas + panel flotante con
  // las últimas (no leídas primero), marcar leída por ítem y todas de una.
  // Coherente con D89-sup: mismo panel en modo demo que gobierna el banner.
  const { notificaciones, notificacionesNoLeidas } = useDatos();
  const { marcarNotificacionLeida, marcarTodasLeidas } = useDatosAcciones();
  const [abierto, setAbierto] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [abierto]);

  // No leídas primero, luego la más reciente; tope 8 (el resto queda en el
  // provider). Lista corta, pero con techo de scroll por respeto a la regla
  // de listas largas (max-h + overflow) — la semilla puede crecer en sesiones
  // largas de demo.
  const visibles = [...notificaciones]
    .sort((a, b) => Number(a.leida) - Number(b.leida) || b.fecha - a.fecha)
    .slice(0, 8);

  return (
    <div ref={cajaRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="relative inline-flex size-11 items-center justify-center rounded-[4px] text-foreground hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)"
        aria-label={
          notificacionesNoLeidas > 0
            ? `Notificaciones: ${notificacionesNoLeidas} sin leer — abrir panel`
            : "Notificaciones — abrir panel"
        }
        aria-expanded={abierto}
        title={
          notificacionesNoLeidas > 0
            ? `${notificacionesNoLeidas} notificación(es) sin leer`
            : "Notificaciones"
        }
      >
        <Bell className="size-5" aria-hidden />
        {notificacionesNoLeidas > 0 && (
          <span
            className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-(--danger) px-1 text-[9px] font-bold leading-4 text-white"
            aria-hidden
          >
            {notificacionesNoLeidas > 9 ? "9+" : notificacionesNoLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="region"
          aria-label="Panel de notificaciones"
          className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-[4px] border border-(--outline-variant) bg-card shadow-none"
        >
          <div className="flex items-center justify-between border-b border-(--outline-variant) px-3 py-2">
            <span className="label-caps text-muted-foreground">
              NOTIFICACIONES {notificacionesNoLeidas > 0 ? `· ${notificacionesNoLeidas} SIN LEER` : ""}
            </span>
            {notificacionesNoLeidas > 0 && (
              <button
                type="button"
                onClick={() => marcarTodasLeidas()}
                className="label-caps text-(--primary) hover:underline"
              >
                MARCAR TODAS
              </button>
            )}
          </div>
          {visibles.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              Sin notificaciones todavía.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-(--outline-variant) overflow-y-auto">
              {visibles.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.leida) marcarNotificacionLeida(n.id);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-(--accent)",
                      n.leida ? "opacity-70" : "bg-(--amber)/5"
                    )}
                    title={n.leida ? "Leída" : "Marcar como leída"}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="label-caps text-muted-foreground">
                        {n.tipo.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {etiquetaRelativa(n.fecha)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "body-md",
                        n.leida ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {n.texto}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Etiqueta relativa SOLO para el panel abierto: el chip en el prerender
 *  estático jamás muestra horas (evita mismatch de hidratación; el panel solo
 *  existe tras un click del usuario). */
function etiquetaRelativa(fecha: number): string {
  const s = Math.max(0, Math.round((Date.now() - fecha) / 1000));
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

function ChipOnline() {
  const [hub, setHub] = useState<EstadoHubLocal>(() => estadoHubLocal());
  // C-24 — `navigator.onLine` vía useSyncExternalStore (React 19);
  // `getServerSnapshot` neutro (true): el SSR pinta «Online» y el primer
  // render del cliente corrige sin cascada (el chip no decide nada: el
  // estado real lo manda el sondeo al hub).
  const enLinea = useSyncExternalStore(
    suscribirseARed,
    () => navigator.onLine,
    () => true,
  );
  useEffect(() => {
    const desuscribir = suscribirseHubLocal(() => setHub(estadoHubLocal()));
    return desuscribir;
  }, []);
  const sondeoFallo = hub.ultimoError !== null || hub.detenido;
  const sondeoPendiente = hub.activo && hub.ultimaSyncTs === null;
  const tono = !enLinea || sondeoFallo ? "danger" : sondeoPendiente ? "warning" : "success";
  const etiqueta = !enLinea ? "Offline" : "Online";
  const detalle = !enLinea
    ? "Sin conexión de red"
    : sondeoFallo
      ? `Con red, pero el último sondeo al hub falló${
          hub.detenido ? ` (${hub.fallosSeguidos} fallos seguidos)` : ""
        }`
      : sondeoPendiente
        ? "Con red — esperando el primer sondeo al hub"
        : "Con red y sondeo del hub sin fallos";
  return (
    <span
      className={cn(
        "label-caps flex items-center gap-1.5",
        tono === "danger" && "text-(--danger)",
        tono === "warning" && "text-(--warning)",
        tono === "success" && "text-(--success)"
      )}
      title={`${etiqueta}: ${detalle}`}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-2 shrink-0 rounded-full",
          tono === "danger" && "bg-(--danger)",
          tono === "warning" && "bg-(--warning)",
          tono === "success" && "bg-(--success)"
        )}
      />
      {etiqueta}
    </span>
  );
}

export function SupervisionShell() {
  return (
    <PerfilProvider>
      <DatosProvider>
        <ShellInterno />
      </DatosProvider>
    </PerfilProvider>
  );
}

function ShellInterno() {
  const { anomaliasAbiertas, cargando } = useDatos();
  // R4-C6 — abrirVisor vive en el contexto de ACCIONES (el visor ya no
  // viaja en el valor de datos).
  const { abrirVisor } = useDatosAcciones();
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

  // E2E local — reanuda el sondeo del hub si el dueño lo dejó encendido
  // (localStorage). Con el hub apagado es un no-op, y en GitHub Pages también:
  // nunca se inicia un fetch que no existe.
  useEffect(() => {
    iniciarHubLocal();
  }, []);

  useEffect(() => {
    return suscribirseRecepcion((entrada) => {
      // C-16 — `null` = purga del log (reset del hub): no es una llegada, el
      // badge de llegadas nuevas no cuenta.
      if (!entrada || !esLlegadaViva(entrada.origen)) return; // la semilla no cuenta
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

  // R4-M7 — restauración de la VISTA desde el espejo hash, UNA vez al
  // montar (ref anti-doble-invoke). D11 intacto: no hay router ni escucha
  // de hashchange — el hash se LEE aquí y se ESPEJA en cada cambio.
  // setState diferido a microtask (misma regla de lint que C8: nada de
  // setState sincrónico en el cuerpo del effect); el primer frame pinta
  // monitor y el cambio cae pre-útil si el hash traía otra vista.
  const vistaRestauradaRef = useRef(false);
  useEffect(() => {
    if (vistaRestauradaRef.current) return;
    vistaRestauradaRef.current = true;
    const { vista: vistaDelHash } = leerEstadoHash();
    if (!vistaDelHash) return;
    queueMicrotask(() => setVista(vistaDelHash));
  }, []);

  // R4-M7 — espejo de escritura de la vista (merge con las otras claves).
  useEffect(() => {
    escribirHashParcial({ vista });
  }, [vista]);

  const elegirVista = (v: VistaId) => {
    setVista(v);
    if (v === "recepcion") setRecepcionesNuevas(0); // D28 — leídas al abrir
    setMenuAbierto(false); // el overlay cede el paso a la vista elegida
  };

  return (
    // C-18 — el shell ocupa EXACTAMENTE el viewport (h-dvh) y NO hace scroll
    // de documento: cada vista hace scroll INTERNO (main: min-h-0 +
    // overflow-y-auto — mismo patrón del shell del móvil).
    <div className="h-dvh overflow-hidden bg-background">
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
            anomalias: anomaliasAbiertas,
            recepcion: recepcionesNuevas,
          }}
        />
      </div>

      {/* El contenido ocupa TODO el ancho (la sidebar ya no es fija). */}
      <div className="flex h-full min-h-0 flex-col">
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
            {/* P-28 (D82) — el dato de notificaciones por fin tiene UI. */}
            <ChipNotificaciones />
            <ChipGamaHeader onAbrir={() => elegirVista("perfil")} />
            {/* C-24 — Online honesto: refleja red + último sondeo al hub. */}
            <ChipOnline />
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

        {/* Auditoría 2026-11-11 (#4) — el panel corre sobre estados
            SEMBRADOS: el rótulo es persistente y no descartable (G3=A). */}
        <div
          role="status"
          className="sticky top-12 z-20 flex items-center justify-center border-b border-(--amber)/50 bg-(--amber)/10 px-3 py-1.5 text-center"
        >
          <span className="label-caps text-(--amber)">
            PANEL EN MODO DEMO — estados sembrados localmente; sin conexión
            con el digitalizador real
          </span>
        </div>

        {/* C-18 — zona de scroll INTERNA: el documento no scrollea; la
            vista activa scrollea aquí dentro (min-h-0 es la clave del flex). */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          {cargando && vista !== "monitor" ? (
            <div className="space-y-4 p-4 md:p-6">
              <Esqueleto className="h-11 w-full max-w-md" />
              <Esqueleto className="h-96 w-full" />
            </div>
          ) : (
            <VistaActual
              vista={vista}
              onVerEnMonitor={(puestoId, mesaId, tipo, pagina) => {
                // D27 — VER EN MONITOR: aterriza el acta publicada en el
                // visor (cambia a MONITOR y abre el acta de esa mesa).
                // T9 (KIT VISOR-MONITOR-GLOBAL-v1): el modo «limpio» quedó
                // ABSORBIDO — el visor unificado ya es limpio y su única
                // acción es REPORTAR ANOMALIA; aterrizaje idéntico al resto.
                // C-17 — el TIPO y la PÁGINA del sobre viajan al visor
                // (abrir el formulario/página correctos); fallback
                // "TRANSMISION" SOLO para filas antiguas que no lo traigan
                // (datos-provider respeta opciones.tipo y defaulta igual,
                // aquí se hace explícito).
                elegirVista("monitor");
                abrirVisor(puestoId, mesaId, {
                  tipo: tipo ?? "TRANSMISION",
                  ...(pagina !== undefined && pagina > 0 ? { pagina } : {}),
                });
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
