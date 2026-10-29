"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  GitCommitHorizontal,
  Info,
  PencilLine,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDatos } from "../datos-provider";
import { actaAprobada, puntajeDePagina } from "../../domain/acta";
import type { FotoActa } from "../../domain/acta";
import type { ModoPanel } from "./tipos-visor";
import { cargarActasReales } from "../../data/actas-reales/actas-reales";
import { ActaHeader } from "./acta-header";
import { ActaToolbar } from "./acta-toolbar";
import { DocumentoE14 } from "./documento-e14";
import { PanelVerificacion } from "./panel-verificacion";
import { PanelDecision } from "./panel-decision";
import { ActaHistorial } from "./acta-historial";
import { VisorZoom, type VisorZoomHandle } from "./visor-zoom";

/**
 * VISOR DE ACTAS — REDISEÑO STITCH (kit stitch-visor-actas-v1): modal por
 * estado (D17 — NO es una ruta) que reproduce los 4 diseños del kit
 * Stitch («visor de actas»):
 *
 * - Desktop: header técnico con breadcrumb + navegador de mesas + píldoras
 *   ORIGEN/PÁGINA + cierre; canvas de papel milimetrado con toolbar
 *   flotante (zoom · rotar · contraste · pantalla completa · SCORE) y
 *   flechas laterales de página; tira de metadatos al pie; sidebar de
 *   380px con el panel según el MODO del acta.
 * - Móvil: header apilado (puesto + chips táctiles), toolbar en barra,
 *   visor negro con chevrones redondos, nota de metadatos y dos secciones
 *   PLEGABLES (ACCIONES DEL SUPERVISOR · HISTORIAL Y TRAZABILIDAD).
 *
 * MODOS DEL PANEL (derivados del estado del acta — sin controles nuevos):
 * - acta APROBADA/PUBLICADA      → "auditoria" (REPORTAR ANOMALIA +
 *                                  observaciones + HISTORIAL Y TRAZABILIDAD)
 * - TRANSMISIÓN pendiente        → "envio-automatico" (verificación del
 *                                  identificador + RECHAZAR REESCANEAR +
 *                                  EDITAR/MOSTRAR ORIGINAL)
 * - DELEGADOS pendiente          → "ingreso-manual" (plegable de datos +
 *                                  ACEPTAR ACTA / RECHAZAR + EDITAR)
 *
 * Canvas: zoom/rotación/contraste viven en VisorZoom (gestos: rueda,
 * pellizco, arrastre, doble toque). SUP-6: si la página trae FOTO REAL del
 * digitalizador, MOSTRAR ORIGINAL la muestra tal cual (el módulo NO mira
 * votos, §0-1); el resto cae al documento sintético D18.
 */

type ContrasteModo = "NORMAL" | "ALTO" | "NEGATIVO";

/** Ancho base de la foto real (el ALTO sale del aspect ratio intrínseco). */
const FOTO_ANCHO_BASE = 460;

function filtroDeContraste(modo: ContrasteModo): string | undefined {
  if (modo === "ALTO") return "contrast(1.5)";
  if (modo === "NEGATIVO") return "invert(1)";
  return undefined;
}

/** Compuerta: nada del visor existe mientras no hay mesa abierta. */
export function ActaViewerModal() {
  const { visorActa } = useDatos();
  if (!visorActa) return null;
  return <VisorAbierto />;
}

function VisorAbierto() {
  const {
    visorActa,
    actaActual,
    actaCargando,
    accionActaEnCurso,
    puestos,
    mesasPorPuesto,
    aprobarActaVisor,
    confirmarRescanVisor,
    reportarAnomaliaVisor,
    abrirVisor,
    cerrarVisor,
    navegarMesa,
    cambiarTipo,
    cambiarPagina,
  } = useDatos();

  // Estado local de UI del canvas (vive SOLO con el modal abierto): la
  // escala REAL vive en VisorZoom — aquí solo el espejo para la toolbar.
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);
  const [contraste, setContraste] = useState<ContrasteModo>("NORMAL");
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  /** MOSTRAR ORIGINAL: la foto real del escaneo en vez de los datos. */
  const [mostrarOriginal, setMostrarOriginal] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const visorRef = useRef<VisorZoomHandle>(null);

  // Escape cierra + bloqueo de scroll de fondo + foco al panel (T6.5).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarVisor();
    };
    document.addEventListener("keydown", onKeyDown);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrevio;
    };
  }, [cerrarVisor]);

  const acercar = useCallback(() => visorRef.current?.acercar(), []);
  const alejar = useCallback(() => visorRef.current?.alejar(), []);
  const ajustar = useCallback(() => visorRef.current?.ajustar(), []);
  const rotar = useCallback(() => setRotacion((r) => (r + 90) % 360), []);
  const ciclarContraste = useCallback(() => {
    setContraste((c) =>
      c === "NORMAL" ? "ALTO" : c === "ALTO" ? "NEGATIVO" : "NORMAL"
    );
  }, []);

  /** EDITAR: lleva el foco al identificador del panel de verificación. */
  const editarIdentificador = useCallback(() => {
    const input = document.getElementById("verificacion-identificador");
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
    toast.info("Ajusta el identificador en VERIFICACIÓN DE IDENTIFICADOR");
  }, []);

  if (!visorActa) return null;

  const puesto = puestos.find((p) => p.id === visorActa.puestoId);
  const mesasDelPuesto = mesasPorPuesto[visorActa.puestoId] ?? [];
  const mesa = mesasDelPuesto.find((m) => m.id === visorActa.mesaId);
  const mesasConActa = mesasDelPuesto.filter(
    (m) => m.estadoMesa !== "NO_INICIADO"
  );
  const indiceMesa =
    mesasConActa.findIndex((m) => m.id === visorActa.mesaId) + 1;
  const totalMesas = mesasConActa.length;

  const paginas = actaActual?.formularios[visorActa.tipo] ?? [];
  const paginaActiva = Math.min(visorActa.pagina, Math.max(1, paginas.length));
  const pagina = paginas.find((p) => p.numero === paginaActiva);
  const aprobada = actaActual ? actaAprobada(actaActual) : false;

  // MODO del panel (derivado — sin controles nuevos en la UI).
  const modo: ModoPanel = aprobada
    ? "auditoria"
    : visorActa.tipo === "TRANSMISION"
      ? "envio-automatico"
      : "ingreso-manual";

  // ── SUP-6: foto real de la página visible (si la hay) ──────────────────
  const fotoActiva: FotoActa | null =
    actaActual?.fotos?.[visorActa.tipo]?.[paginaActiva - 1] ?? null;
  const impresion = actaActual?.impresion;
  const mostrarFoto = Boolean(fotoActiva) && mostrarOriginal;

  // Etiqueta/barcode impresos: primero el acta en memoria (runtime de carga
  // masiva), luego el manifest estático del ancla El Cairo.
  const registroReal = cargarActasReales().actas[
    `${visorActa.puestoId}::${visorActa.mesaId}`
  ];
  const etiquetaReal =
    impresion?.etiquetaFormulario ??
    registroReal?.etiquetasImpresas[visorActa.tipo];
  const barcodeReal =
    impresion?.barcode ?? registroReal?.barcodesImpresos[visorActa.tipo];
  const identificador =
    barcodeReal ?? actaActual?.id.replace("#", "") ?? "—";

  // SCORE de la página visible (kit Stitch — badge de la toolbar).
  const score = puntajeDePagina(pagina);

  // KIT visor-gestos-v1: re-ajuste al cambiar página/formulario/mesa/vista.
  const fitKey = `${visorActa.puestoId}::${visorActa.mesaId}::${visorActa.tipo}::${paginaActiva}::${mostrarFoto ? "foto" : "datos"}`;

  const puedePaginaAnterior = paginaActiva > 1;
  const puedePaginaSiguiente = paginaActiva < paginas.length;

  // Etiqueta impresa del formulario visible (footer del canvas).
  const etiquetaFormulario =
    etiquetaReal ??
    (visorActa.tipo === "DELEGADOS" ? "CÓNSUL/EMBAJADOR" : "TRANSMISIÓN");

  const textoCaption =
    actaActual && actaActual.version > 1
      ? `VERSIÓN ${actaActual.version} — RECIBIDA ${actaActual.horaCarga}`
      : paginas.length > 0
        ? `PÁGINA ${paginaActiva} DE ${paginas.length} — ${
            visorActa.tipo === "TRANSMISION"
              ? "FORMULARIO TRANSMISIÓN (E-14)"
              : "ACTA DE DELEGADOS"
          }`
        : null;

  // Tira de metadatos del canvas (diseño Stitch).
  const tiraMetadatos = (
    <>
      <span className="inline-block size-2 shrink-0 rounded-full border border-emerald-400 bg-emerald-500/30" aria-hidden />
      <div className="flex flex-wrap items-center justify-center gap-1.5 font-medium tracking-wide text-gray-300">
        <span>{etiquetaFormulario}</span>
        <span aria-hidden>·</span>
        <span>
          PÁG {paginaActiva}/{Math.max(1, paginas.length)}
        </span>
        <span className="text-gray-600" aria-hidden>
          |
        </span>
        <span aria-hidden>·</span>
        <span className="font-normal text-gray-400">
          PAÍS {puesto?.codigoPais} - {puesto?.pais}
        </span>
        <span className="font-normal text-gray-400">
          MESA {mesa?.id ?? "—"}
        </span>
        <span aria-hidden>·</span>
        <span className="font-normal text-gray-400">{puesto?.puesto}</span>
      </div>
    </>
  );

  // Botones EDITAR / MOSTRAR ORIGINAL (solo en modos de ingreso — diseño).
  const accionesCanvas =
    modo !== "auditoria" ? (
      <>
        {/* Desktop: flotantes sobre el canvas, al pie */}
        <div className="absolute bottom-14 left-1/2 z-20 hidden -translate-x-1/2 gap-2 lg:flex">
          <button
            type="button"
            onClick={editarIdentificador}
            className="flex items-center gap-2 rounded border border-emerald-500/60 bg-[#0d1613]/90 px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 shadow-lg backdrop-blur transition-colors hover:bg-[#12201c] focus-visible:outline-2 focus-visible:outline-(--primary)"
          >
            <PencilLine className="size-3.5" aria-hidden />
            <span>EDITAR</span>
          </button>
          <button
            type="button"
            onClick={() => setMostrarOriginal((v) => !v)}
            disabled={!fotoActiva}
            title={
              fotoActiva
                ? "Ver el escaneo original del digitalizador"
                : "Esta página no tiene foto real del escaneo"
            }
            className="flex items-center gap-2 rounded border border-brand-border-light bg-[#0d1613]/90 px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-gray-300 shadow-lg backdrop-blur transition-colors hover:bg-[#12201c] hover:text-white focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
          >
            <Eye className="size-3.5" aria-hidden />
            <span>{mostrarOriginal ? "MOSTRAR DATOS" : "MOSTRAR ORIGINAL"}</span>
          </button>
        </div>
        {/* Móvil: fila estática bajo el documento */}
        <div className="flex justify-center gap-2 px-3 pb-2 lg:hidden">
          <button
            type="button"
            onClick={editarIdentificador}
            className="flex items-center gap-1.5 rounded border border-emerald-500/60 bg-[#0d1613]/90 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-[#12201c]"
          >
            <PencilLine className="size-3.5" aria-hidden />
            <span>EDITAR</span>
          </button>
          <button
            type="button"
            onClick={() => setMostrarOriginal((v) => !v)}
            disabled={!fotoActiva}
            className="flex items-center gap-1.5 rounded border border-brand-border-light bg-[#0d1613]/90 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-[#12201c] disabled:opacity-40"
          >
            <Eye className="size-3.5" aria-hidden />
            <span>{mostrarOriginal ? "MOSTRAR DATOS" : "MOSTRAR ORIGINAL"}</span>
          </button>
        </div>
      </>
    ) : null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        pantallaCompleta ? "p-0" : "p-0 lg:p-4 xl:p-6"
      )}
    >
      {/* Scrim: clic fuera cierra; aria-hidden (T6.5). */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={cerrarVisor}
        aria-hidden
      />

      {/* PANEL — borde 1px + capas tonales (kit Stitch: bg #070b0a). */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Visor de acta E-14"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative z-10 m-auto flex h-full w-full flex-col overflow-hidden border border-brand-border bg-brand-darkbg text-gray-200 shadow-2xl outline-none",
          !pantallaCompleta && "lg:h-[min(94vh,940px)] lg:max-w-[1500px] lg:rounded-md"
        )}
      >
        {puesto && (
          <ActaHeader
            puesto={puesto}
            mesas={mesasConActa}
            indiceMesa={Math.max(1, indiceMesa)}
            totalMesas={totalMesas}
            puedeAnterior={indiceMesa > 1}
            puedeSiguiente={indiceMesa < totalMesas}
            onMesaAnterior={() => navegarMesa(-1)}
            onMesaSiguiente={() => navegarMesa(1)}
            onSeleccionarMesa={(mesaId) =>
              abrirVisor(puesto.id, mesaId, { tipo: visorActa.tipo, pagina: 1 })
            }
            tipo={visorActa.tipo}
            onCambiarTipo={cambiarTipo}
            paginas={paginas}
            paginaActiva={paginaActiva}
            onCambiarPagina={cambiarPagina}
            onCerrar={cerrarVisor}
          />
        )}

        <div className="scroll-visor flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* ── CANVAS DEL DOCUMENTO ──────────────────────────────────── */}
          <main
            aria-label="Documento del acta"
            className="grid-paper-bg relative flex min-h-[430px] shrink-0 flex-col bg-brand-canvas sm:min-h-[500px] lg:min-h-0 lg:flex-1 lg:overflow-hidden"
            data-purpose="document-viewer-canvas"
          >
            {/* Toolbar flotante (desktop) / barra (móvil) */}
            <div className="absolute inset-x-0 top-4 z-20 hidden justify-center px-4 lg:flex">
              <ActaToolbar
                zoom={zoom}
                onZoomMas={acercar}
                onZoomMenos={alejar}
                onAjustar={ajustar}
                onRotar={rotar}
                onContraste={ciclarContraste}
                pantallaCompleta={pantallaCompleta}
                onPantallaCompleta={() => setPantallaCompleta((v) => !v)}
                score={score}
                variante="flotante"
              />
            </div>
            <div className="lg:hidden">
              <ActaToolbar
                zoom={zoom}
                onZoomMas={acercar}
                onZoomMenos={alejar}
                onAjustar={ajustar}
                onRotar={rotar}
                onContraste={ciclarContraste}
                pantallaCompleta={pantallaCompleta}
                onPantallaCompleta={() => setPantallaCompleta((v) => !v)}
                score={score}
                variante="barra"
              />
            </div>

            {/* Flechas laterales de página (desktop rectangulares) */}
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva - 1)}
              disabled={!puedePaginaAnterior}
              title="Página anterior"
              aria-label="Página anterior"
              className="absolute left-4 top-1/2 z-10 hidden h-14 w-9 -translate-y-1/2 items-center justify-center rounded border border-brand-border-light bg-[#0d1613]/80 text-gray-400 shadow-lg transition-colors hover:bg-[#12201c] hover:text-emerald-400 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40 lg:flex"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva + 1)}
              disabled={!puedePaginaSiguiente}
              title="Página siguiente"
              aria-label="Página siguiente"
              className="absolute right-4 top-1/2 z-10 hidden h-14 w-9 -translate-y-1/2 items-center justify-center rounded border border-brand-border-light bg-[#0d1613]/80 text-gray-400 shadow-lg transition-colors hover:bg-[#12201c] hover:text-emerald-400 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40 lg:flex"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            {/* Flechas redondas (móvil — diseño Stitch) */}
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva - 1)}
              disabled={!puedePaginaAnterior}
              aria-label="Página anterior"
              className="absolute left-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700/80 bg-black/75 text-zinc-300 shadow-lg transition-all hover:border-emerald-500 hover:text-white active:scale-95 disabled:opacity-30 lg:hidden"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva + 1)}
              disabled={!puedePaginaSiguiente}
              aria-label="Página siguiente"
              className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700/80 bg-black/75 text-zinc-300 shadow-lg transition-all hover:border-emerald-500 hover:text-white active:scale-95 disabled:opacity-30 lg:hidden"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            {/* Documento — zoom/gestos en VisorZoom */}
            <div className="h-[380px] sm:h-[460px] lg:h-auto lg:min-h-0 lg:flex-1">
              {actaCargando || !actaActual ? (
                actaCargando ? (
                  <div
                    className="flex min-h-full min-w-full items-center justify-center p-6"
                    aria-busy="true"
                    aria-label="Cargando acta"
                  >
                    <div
                      className="w-full max-w-[620px] animate-pulse rounded border border-brand-border bg-brand-panel p-6"
                      aria-hidden
                    >
                      <div className="h-8 w-2/3 rounded bg-brand-border-light" />
                      <div className="mt-4 h-16 w-full rounded bg-brand-border-light" />
                      <div className="mt-6 space-y-3">
                        {Array.from({ length: 7 }, (_, i) => (
                          <div
                            key={i}
                            className="h-3 rounded bg-brand-border-light"
                            style={{ width: `${88 - i * 7}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-full min-w-full items-center justify-center p-6">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      Sin transmisión
                    </p>
                  </div>
                )
              ) : mostrarFoto && fotoActiva ? (
                <VisorZoom
                  ref={visorRef}
                  rotacion={rotacion}
                  filtro={filtroDeContraste(contraste)}
                  onZoomChange={setZoom}
                  fitKey={fitKey}
                  ariaLabel="Escaneo original del acta — zoom con la rueda del mouse o pellizco con los dedos"
                  className="h-full w-full"
                >
                  <img
                    src={fotoActiva.src}
                    width={FOTO_ANCHO_BASE}
                    height={Math.round(
                      (fotoActiva.alto / fotoActiva.ancho) * FOTO_ANCHO_BASE
                    )}
                    alt={`Escaneo original del acta E-14 ${
                      etiquetaReal ?? visorActa.tipo
                    } — página ${paginaActiva} (se muestra, no se interpreta)`}
                    draggable={false}
                    className="block select-none rounded border border-zinc-800/80 bg-white"
                  />
                </VisorZoom>
              ) : (
                mesa && (
                  <VisorZoom
                    ref={visorRef}
                    rotacion={rotacion}
                    filtro={filtroDeContraste(contraste)}
                    onZoomChange={setZoom}
                    fitKey={fitKey}
                    ariaLabel="Documento del acta — zoom con la rueda del mouse o pellizco con los dedos"
                    className="h-full w-full"
                  >
                    <DocumentoE14
                      tipo={visorActa.tipo}
                      pagina={paginaActiva}
                      mesa={mesa}
                      acta={actaActual}
                      puesto={puesto!}
                    />
                  </VisorZoom>
                )
              )}
            </div>

            {/* EDITAR / MOSTRAR ORIGINAL (modos de ingreso) */}
            {accionesCanvas}

            {/* Tira de metadatos — desktop flotante */}
            {textoCaption && (
              <footer
                className="absolute bottom-3 left-1/2 z-10 hidden w-[94%] max-w-4xl -translate-x-1/2 items-center justify-center space-x-3 rounded border border-brand-border-light bg-[#0b1310]/95 px-4 py-2 text-center font-mono text-[11px] shadow-2xl backdrop-blur lg:flex"
                data-purpose="document-metadata-footer"
              >
                {tiraMetadatos}
              </footer>
            )}
            {/* Nota de metadatos — móvil (fila estática del card) */}
            <div className="border-t border-[#182721] bg-[#080e0c] p-2.5 font-mono text-[10px] leading-tight text-zinc-400 lg:hidden">
              <div className="flex items-center font-semibold tracking-wider text-zinc-300">
                <span
                  className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-400"
                  aria-hidden
                />
                {etiquetaFormulario} · PÁG {paginaActiva}/
                {Math.max(1, paginas.length)} - {puesto?.pais}
              </div>
              {actaActual && actaActual.version > 1 && (
                <div className="mt-0.5">{textoCaption}</div>
              )}
            </div>
          </main>

          {/* ── MÓVIL: secciones plegables (ACCIONES · HISTORIAL) ─────── */}
          <div className="space-y-3 p-3 lg:hidden">
            {/* ACCIONES DEL SUPERVISOR */}
            <section
              aria-label="Panel de acciones del supervisor"
              className="overflow-hidden rounded-xl border border-[#16251f] bg-[#09110e] shadow-lg transition-all"
            >
              <Collapsible defaultOpen={modo !== "auditoria" ? false : true}>
                <CollapsibleTrigger className="group flex w-full cursor-pointer list-none select-none items-center justify-between p-3.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400/90 transition-colors hover:bg-[#101c17] focus-visible:outline-2 focus-visible:outline-(--primary)">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden />
                    <span>Acciones del supervisor</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-normal text-zinc-500">
                    <span className="font-mono text-emerald-400/80 group-data-[state=open]:hidden">
                      EXPANDIR
                    </span>
                    <span className="hidden font-mono text-emerald-400/80 group-data-[state=open]:inline">
                      OCULTAR
                    </span>
                    <ChevronDown
                      className="size-4 text-emerald-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
                      aria-hidden
                    />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3 border-t border-[#16251f]/60 p-3.5 pt-0">
                  <div className="pt-3">
                    <PanelDecision
                      modo={modo}
                      accionEnCurso={accionActaEnCurso}
                      onAprobar={aprobarActaVisor}
                      onRescanear={confirmarRescanVisor}
                      onReportarAnomalia={reportarAnomaliaVisor}
                      inputId="acta-observaciones-movil"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>

            {/* HISTORIAL Y TRAZABILIDAD */}
            <section
              aria-label="Historial y trazabilidad"
              className="overflow-hidden rounded-xl border border-[#16251f] bg-[#09110e] shadow-lg transition-all"
            >
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full cursor-pointer list-none select-none items-center justify-between p-3.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400/90 transition-colors hover:bg-[#101c17] focus-visible:outline-2 focus-visible:outline-(--primary)">
                  <span className="flex items-center gap-1.5">
                    <GitCommitHorizontal
                      className="size-3.5 text-emerald-400"
                      aria-hidden
                    />
                    <span>Historial y trazabilidad</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-normal text-zinc-500">
                    <span className="font-mono text-emerald-400/80 group-data-[state=open]:hidden">
                      EXPANDIR
                    </span>
                    <span className="hidden font-mono text-emerald-400/80 group-data-[state=open]:inline">
                      OCULTAR
                    </span>
                    <ChevronDown
                      className="size-4 text-emerald-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
                      aria-hidden
                    />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 border-t border-[#16251f]/60 p-3.5 pt-0">
                  <div className="pt-3">
                    {actaActual ? (
                      <ActaHistorial
                        eventos={actaActual.historial}
                        mostrarCabecera={false}
                        claseHalo="ring-[#09110e]"
                      />
                    ) : (
                      <p className="font-mono text-[11px] text-gray-500">
                        Sin eventos registrados.
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-1.5 border-t border-[#172620] pt-2 font-mono text-[10px] text-zinc-500">
                      <Info className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                      <span>ESTA ACCIÓN QUEDARÁ REGISTRADA EN LA AUDITORÍA.</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>
          </div>

          {/* ── SIDEBAR DE ACCIONES (desktop — diseño Stitch) ─────────── */}
          <aside
            className="scroll-visor hidden w-[380px] shrink-0 flex-col border-l border-brand-border bg-brand-panel p-5 lg:flex"
            data-purpose="supervisor-auditor-panel"
          >
            {modo === "auditoria" ? (
              <div className="flex flex-1 flex-col gap-6">
                <PanelDecision
                  modo="auditoria"
                  accionEnCurso={accionActaEnCurso}
                  onAprobar={aprobarActaVisor}
                  onRescanear={confirmarRescanVisor}
                  onReportarAnomalia={reportarAnomaliaVisor}
                  inputId="acta-observaciones"
                />
                {actaActual && (
                  <ActaHistorial eventos={actaActual.historial} />
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <PanelVerificacion
                  modo={modo}
                  identificador={identificador}
                  pais={`${puesto?.pais ?? "—"} (${puesto?.codigoPais ?? "—"})`}
                  zona={`Zona ${puesto?.zona ?? "—"}`}
                  puesto={puesto?.puesto ?? "—"}
                  mesa={`Mesa ${mesa?.id ?? "—"}`}
                  tipo={visorActa.tipo}
                  onCambiarTipo={cambiarTipo}
                  pagina={paginaActiva}
                  totalPaginas={paginas.length}
                  onCambiarPagina={cambiarPagina}
                  inputId="verificacion-identificador"
                />
                {/* Las decisiones bajan al pie del panel (diseño Stitch) */}
                <div className="mt-auto space-y-6 border-t border-brand-border pt-4">
                  <PanelDecision
                    modo={modo}
                    accionEnCurso={accionActaEnCurso}
                    onAprobar={aprobarActaVisor}
                    onRescanear={confirmarRescanVisor}
                    onReportarAnomalia={reportarAnomaliaVisor}
                    inputId="acta-observaciones"
                  />
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
