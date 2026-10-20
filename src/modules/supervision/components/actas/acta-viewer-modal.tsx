"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { cn } from "cn";
import { useDatos } from "../datos-provider";
import { actaAprobada } from "../../domain/acta";
import { ActaHeader } from "./acta-header";
import { ActaToolbar } from "./acta-toolbar";
import { DocumentoE14 } from "./documento-e14";
import { ActaAcciones } from "./acta-acciones";
import { ActaHistorial } from "./acta-historial";

/**
 * VISOR DE ACTAS (kit SUP-4 §2.2 / T3-T5): modal por estado (D17 — NO es
 * una ruta; el export estático no cambia). Se monta desde el store del
 * módulo (datos-provider) y solo existe mientras `visorActa` no es null.
 *
 * - Cierre: ✕, tecla Escape y clic en el scrim (clic dentro del panel NO
 *   cierra). Al cerrar el componente interno SE DESMONTA, con lo que
 *   zoom/rotación/contraste/pantalla completa vuelven a su estado inicial
 *   en el siguiente uso (T3.1) — sin effect de reset.
 * - Canvas: toolbar flotante (T4), flechas laterales de página, documento
 *   sintético centrado con zoom/rotación/contraste por CSS y caption
 *   inferior. Skeleton del papel durante la carga (~400 ms).
 * - Sidebar (w-80): acciones del supervisor, observaciones, historial y
 *   nota de auditoría. <1024px se apila (T6.1).
 * - Sin sombras en TODO el modal: jerarquía = borde 1px + capas tonales +
 *   scrim (D14/D17).
 */

type ContrasteModo = "NORMAL" | "ALTO" | "NEGATIVO";

const ZOOM_INICIAL = 0.8;
const ZOOM_PASO = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const PAPEL_ANCHO = 794;
const PAPEL_ALTO = 1123;

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
    cerrarVisor,
    navegarMesa,
    cambiarTipo,
    cambiarPagina,
  } = useDatos();

  // Estado local de UI del canvas (vive SOLO con el modal abierto).
  const [zoom, setZoom] = useState(ZOOM_INICIAL);
  const [rotacion, setRotacion] = useState(0);
  const [contraste, setContraste] = useState<ContrasteModo>("NORMAL");
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const acercar = useCallback(
    () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_PASO) * 100) / 100)),
    []
  );
  const alejar = useCallback(
    () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_PASO) * 100) / 100)),
    []
  );
  const rotar = useCallback(() => setRotacion((r) => (r + 90) % 360), []);
  const ciclarContraste = useCallback(() => {
    setContraste((c) =>
      c === "NORMAL" ? "ALTO" : c === "ALTO" ? "NEGATIVO" : "NORMAL"
    );
  }, []);

  if (!visorActa) return null;

  const puesto = puestos.find((p) => p.id === visorActa.puestoId);
  const mesasDelPuesto = mesasPorPuesto[visorActa.puestoId] ?? [];
  const mesa = mesasDelPuesto.find((m) => m.id === visorActa.mesaId);
  const mesasConActa = mesasDelPuesto.filter((m) => m.estadoMesa !== "NO_INICIADO");
  const indiceMesa = mesasConActa.findIndex((m) => m.id === visorActa.mesaId) + 1;
  const totalMesas = mesasConActa.length;

  const paginas = actaActual?.formularios[visorActa.tipo] ?? [];
  const paginaActiva = Math.min(visorActa.pagina, Math.max(1, paginas.length));
  const pagina = paginas.find((p) => p.numero === paginaActiva);
  const aprobada = actaActual ? actaAprobada(actaActual) : false;

  // Caja de layout = bounding box exacta del papel escalado + rotado
  // (giros de 90° intercambian ancho/alto — el scroll del canvas es fiel).
  const rotado = rotacion % 180 !== 0;
  const cajaAncho = Math.round((rotado ? PAPEL_ALTO : PAPEL_ANCHO) * zoom);
  const cajaAlto = Math.round((rotado ? PAPEL_ANCHO : PAPEL_ALTO) * zoom);

  const puedePaginaAnterior = paginaActiva > 1;
  const puedePaginaSiguiente = paginaActiva < paginas.length;
  const totalPaginas = paginas.length;

  const textoCaption =
    actaActual && actaActual.version > 1
      ? `VERSIÓN ${actaActual.version} — RECIBIDA ${actaActual.horaCarga}`
      : paginas.length > 0
        ? `PÁGINA ${paginaActiva} DE ${totalPaginas} — ${
            visorActa.tipo === "TRANSMISION"
              ? "FORMULARIO TRANSMISIÓN (E-14)"
              : "ACTA DE DELEGADOS"
          }`
        : null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        pantallaCompleta ? "p-0" : "p-4 md:p-6"
      )}
    >
      {/* Scrim: clic fuera cierra; aria-hidden (T6.5). */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={cerrarVisor}
        aria-hidden
      />

      {/* PANEL — sin sombras: borde 1px + capas tonales + scrim (D14/D17). */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Visor de acta E-14"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex flex-col overflow-y-auto rounded-[4px] border border-(--border) bg-(--card) outline-none lg:overflow-hidden",
          pantallaCompleta
            ? "h-full w-full max-w-none rounded-none"
            : "mx-auto h-[90vh] max-w-[1400px]"
        )}
      >
        {puesto && (
          <ActaHeader
            puesto={puesto}
            indiceMesa={Math.max(1, indiceMesa)}
            totalMesas={totalMesas}
            puedeAnterior={indiceMesa > 1}
            puedeSiguiente={indiceMesa < totalMesas}
            onMesaAnterior={() => navegarMesa(-1)}
            onMesaSiguiente={() => navegarMesa(1)}
            tipo={visorActa.tipo}
            onCambiarTipo={cambiarTipo}
            paginas={paginas}
            paginaActiva={paginaActiva}
            onCambiarPagina={cambiarPagina}
            acta={actaActual}
            onCerrar={cerrarVisor}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ── VISOR ──────────────────────────────────────────────────── */}
          <section
            aria-label="Documento del acta"
            className="relative flex min-h-[40vh] flex-1 flex-col bg-(--surface-lowest) lg:min-h-0 lg:overflow-hidden"
          >
            {/* Toolbar flotante (permite wrap a 375px — T6.3) */}
            <div className="absolute inset-x-0 top-4 z-20 flex justify-center px-4">
              <ActaToolbar
                zoom={zoom}
                onZoomMas={acercar}
                onZoomMenos={alejar}
                onRotar={rotar}
                onContraste={ciclarContraste}
                pantallaCompleta={pantallaCompleta}
                onPantallaCompleta={() => setPantallaCompleta((v) => !v)}
              />
            </div>

            {/* Overlay: acta validada (§2.3) — bajo la toolbar en pantallas
                angostas, en la esquina a partir de lg. */}
            {aprobada && (
              <span className="label-caps absolute top-20 left-4 z-10 inline-flex items-center gap-1.5 rounded-[4px] border border-(--primary) bg-(--primary)/10 px-2.5 py-1.5 text-(--primary) lg:top-4">
                <Check className="size-3.5" aria-hidden />
                Acta validada
              </span>
            )}

            {/* Flechas laterales (navegan páginas del formulario activo) */}
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva - 1)}
              disabled={!puedePaginaAnterior}
              title={`Página anterior (Pág ${Math.max(1, paginaActiva - 1)})`}
              aria-label="Página anterior"
              className="absolute top-1/2 left-3 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-[4px] border border-(--border) bg-(--background)/80 text-muted-foreground hover:text-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva + 1)}
              disabled={!puedePaginaSiguiente}
              title={`Página siguiente (Pág ${Math.min(
                Math.max(totalPaginas, 1),
                paginaActiva + 1
              )})`}
              aria-label="Página siguiente"
              className="absolute top-1/2 right-3 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-[4px] border border-(--border) bg-(--background)/80 text-muted-foreground hover:text-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            {/* Canvas: documento centrado, overflow-auto (zoom/rotación) */}
            <div className="min-h-0 flex-1 overflow-auto">
              {actaCargando || !actaActual ? (
                actaCargando ? (
                  /* Skeleton del papel (patrón vida-v1) mientras llega el
                     acta por el repositorio (~400 ms). */
                  <div
                    className="flex min-h-full min-w-full items-center justify-center p-6"
                    aria-busy="true"
                    aria-label="Cargando acta"
                  >
                    <div
                      className="w-full max-w-[620px] animate-pulse rounded-[4px] border border-(--border) bg-(--card) p-6"
                      aria-hidden
                    >
                      <div className="h-8 w-2/3 rounded-[4px] bg-(--surface-high)" />
                      <div className="mt-4 h-16 w-full rounded-[4px] bg-(--surface-high)" />
                      <div className="mt-6 space-y-3">
                        {Array.from({ length: 7 }, (_, i) => (
                          <div
                            key={i}
                            className="h-3 rounded-[4px] bg-(--surface-high)"
                            style={{ width: `${88 - i * 7}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* null nunca debería pasar por los puntos de entrada
                     (los botones se deshabilitan), pero si pasa → inline. */
                  <div className="flex min-h-full min-w-full items-center justify-center p-6">
                    <p className="label-caps text-muted-foreground">
                      Sin transmisión
                    </p>
                  </div>
                )
              ) : (
                mesa && (
                  <div className="flex min-h-full min-w-full items-center justify-center p-6">
                    <div
                      className="relative shrink-0"
                      style={{ width: cajaAncho, height: cajaAlto }}
                    >
                      <div
                        className="absolute top-1/2 left-1/2"
                        style={{
                          transform: `translate(-50%, -50%) scale(${zoom}) rotate(${rotacion}deg)`,
                          filter: filtroDeContraste(contraste),
                        }}
                      >
                        <DocumentoE14
                          tipo={visorActa.tipo}
                          pagina={paginaActiva}
                          mesa={mesa}
                          acta={actaActual}
                          puesto={puesto!}
                        />
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Caption inferior flotante */}
            {textoCaption && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
                <p className="label-caps pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-[4px] border border-(--border) bg-(--input)/90 px-3 py-1.5 backdrop-blur">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      pagina?.estado === "ADVERTENCIA"
                        ? "animate-pulse bg-(--danger)"
                        : "border border-(--outline-strong)"
                    )}
                    aria-hidden
                  />
                  <span className="truncate text-(--outline-strong)">
                    {textoCaption}
                  </span>
                </p>
              </div>
            )}
          </section>

          {/* ── SIDEBAR DE ACCIONES ────────────────────────────────────── */}
          <aside className="flex w-full shrink-0 flex-col gap-5 border-t border-(--border) bg-(--card) p-5 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
            <ActaAcciones
              accionEnCurso={accionActaEnCurso}
              onAprobar={aprobarActaVisor}
              onRescanear={confirmarRescanVisor}
            />
            {actaActual && <ActaHistorial eventos={actaActual.historial} />}
            <footer className="mt-auto flex items-start gap-2 border-t border-(--border) pt-3">
              <Info
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-[9px] leading-4 tracking-wider text-muted-foreground uppercase">
                Esta acción quedará registrada en la auditoría.
              </p>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );
}
