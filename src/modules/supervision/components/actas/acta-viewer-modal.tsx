"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { cn } from "cn";
import { useDatos, useDatosAcciones } from "../datos-provider";
import { actaAprobada } from "../../domain/acta";
import type { FotoActa } from "../../domain/acta";
import { cargarActasReales } from "../../data/actas-reales/actas-reales";
import { ActaHeader } from "./acta-header";
import { ActaToolbar } from "./acta-toolbar";
import { DocumentoE14 } from "./documento-e14";
import { ActaAcciones } from "./acta-acciones";
import { ActaHistorial } from "./acta-historial";
import {
  VisorZoom,
  type VisorZoomHandle,
} from "./visor-zoom";

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
 *   centrado con zoom/rotación/contraste y caption inferior. KIT
 *   visor-gestos-v1: el zoom vive en VisorZoom — RUEDA DEL MOUSE (ancla en
 *   el cursor), PELLIZCO TÁCTIL (2 dedos), arrastre para desplazar y doble
 *   clic/toque (ajustar ↔ acercar); los botones de la toolbar operan por
 *   ref. Ajuste inicial automático (contain) por página/foto (fitKey).
 *   Skeleton del papel durante la carga (~400 ms).
 * - Sidebar (w-80): acciones del supervisor, observaciones, historial y
 *   nota de auditoría. <1024px se apila (T6.1).
 * - Sin sombras en TODO el modal: jerarquía = borde 1px + capas tonales +
 *   scrim (D14/D17).
 * - SUP-6 (D23): si la página visible tiene FOTO REAL del digitalizador,
 *   el papel del canvas es la imagen (misma toolbar/zoom/rotación/contraste
 *   por CSS; la caja usa las dimensiones de la foto) con caption de 2
 *   líneas (etiqueta impresa + impresión verbatim). Sin foto → sintético
 *   D18 tal cual. El módulo NO mira votos (§0-1).
 */

type ContrasteModo = "NORMAL" | "ALTO" | "NEGATIVO";

/** KIT visor-gestos-v1: ancho base de la foto real (el ALTO sale del aspect
 * ratio intrínseco ~1:3). El AJUSTE INICIAL (contain) lo escala para entrar
 * completo — ver VisorZoom. */
const FOTO_ANCHO_BASE = 460;

function filtroDeContraste(modo: ContrasteModo): string | undefined {
  if (modo === "ALTO") return "contrast(1.5)";
  if (modo === "NEGATIVO") return "invert(1)";
  return undefined;
}

/** Compuerta: nada del visor existe mientras no hay mesa abierta. */
export function ActaViewerModal() {
  // R4-C6 — el estado del visor vive en el contexto de ACCIONES.
  const { visorActa } = useDatosAcciones();
  if (!visorActa) return null;
  return <VisorAbierto />;
}

function VisorAbierto() {
  // R4-C6 — el visor consume AMBOS contextos: datos (puestos, mesas) y
  // acciones (estado del visor + acciones). Ninguna fila lo hace.
  const { puestos, mesasPorPuesto } = useDatos();
  const {
    visorActa,
    actaActual,
    actaCargando,
    accionActaEnCurso,
    aprobarActaVisor,
    confirmarRescanVisor,
    cerrarVisor,
    navegarMesa,
    cambiarTipo,
    cambiarPagina,
  } = useDatosAcciones();

  // Estado local de UI del canvas (vive SOLO con el modal abierto).
  // KIT visor-gestos-v1: la escala REAL vive dentro de VisorZoom — aquí solo
  // el espejo para la toolbar (% y deshabilitar botones en los límites).
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);
  const [contraste, setContraste] = useState<ContrasteModo>("NORMAL");
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
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

  // ── SUP-6 (D23): foto real de la página visible (si la hay) ────────────
  const fotoActiva: FotoActa | null =
    actaActual?.fotos?.[visorActa.tipo]?.[paginaActiva - 1] ?? null;
  const impresion = actaActual?.impresion;
  const esActaReal = Boolean(fotoActiva && impresion);
  // Etiqueta/barcode impresos del formulario visible: primero el ACTA en
  // memoria (impresion.etiquetaFormulario/barcode — viaja con las actas del
  // RUNTIME de carga masiva, D27), luego el manifest estático (D24 — el
  // loader es memoizado en módulo: consultar aquí es gratis).
  const registroReal =
    cargarActasReales().actas[`${visorActa.puestoId}::${visorActa.mesaId}`];
  const etiquetaReal =
    impresion?.etiquetaFormulario ??
    registroReal?.etiquetasImpresas[visorActa.tipo];
  const barcodeReal = impresion?.barcode ?? registroReal?.barcodesImpresos[visorActa.tipo];

  // KIT visor-gestos-v1: el alto base de la foto sale del aspect ratio —
  // el AJUSTE (contain) y la escala los maneja VisorZoom (sin caja de
  // scroll: transform translate·scale·rotate + límites de offset).
  const fotoAltoBase = fotoActiva
    ? Math.round((fotoActiva.alto / fotoActiva.ancho) * FOTO_ANCHO_BASE)
    : 0;
  // Re-ajuste al cambiar página/formulario/mesa (aspect ratio distinto).
  const fitKey = `${visorActa.puestoId}::${visorActa.mesaId}::${visorActa.tipo}::${paginaActiva}`;

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
            {/* Toolbar flotante (permite wrap a 375px — T6.3). KIT
                visor-gestos-v1: los botones operan por REF sobre VisorZoom
                (una sola fuente de verdad de la escala); el % es espejo. */}
            <div className="absolute inset-x-0 top-4 z-20 flex justify-center px-4">
              <ActaToolbar
                zoom={zoom}
                onZoomMas={acercar}
                onZoomMenos={alejar}
                onAjustar={ajustar}
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

            {/* Canvas — KIT visor-gestos-v1 (VisorZoom): ajuste inicial
                automático, RUEDA = zoom anclado al cursor, PELLIZCO = zoom
                con 2 dedos, arrastre = desplazar, doble clic/toque = ajustar
                ↔ acercar. Rotación/contraste viajan como props (el padre las
                maneja); la escala vive dentro del componente. */}
            <div className="min-h-0 flex-1">
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
              ) : fotoActiva ? (
                /* SUP-6 (D23): la foto real es el "papel" del canvas —
                   rotación/contraste por CSS viajan como props del VisorZoom
                   (D18); documento-e14.tsx NO se toca. Sin cifras de
                   votación en la UI (§0-1): la imagen se muestra tal cual. */
                <VisorZoom
                  ref={visorRef}
                  rotacion={rotacion}
                  filtro={filtroDeContraste(contraste)}
                  onZoomChange={setZoom}
                  fitKey={fitKey}
                  ariaLabel="Documento del acta — zoom con la rueda del mouse o pellizco con los dedos"
                  className="h-full w-full"
                >
                  {/* La foto real se muestra tal cual (D23) — asset
                      importado estáticamente del módulo (D24);
                      next/image está prohibido por el kit §0-3 */}
                  <img
                    src={fotoActiva.src}
                    width={FOTO_ANCHO_BASE}
                    height={fotoAltoBase}
                    alt={`Acta real E-14 ${etiquetaReal ?? visorActa.tipo} — página ${paginaActiva}, escaneo del digitalizador (encabezado impreso ubicado; sin lectura de votos)`}
                    draggable={false}
                    className="block select-none rounded-[4px] border border-(--border) bg-white"
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

            {/* Caption inferior flotante — con FOTO REAL (D23/T5.2):
                línea 1 = ACTA REAL · etiqueta impresa · PÁG n/total;
                línea 2 = impresión verbatim + barcode en mono.
                Sin cifras de votación (§0-1). */}
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
                  {esActaReal && impresion ? (
                    <span className="min-w-0">
                      <span className="block truncate text-(--outline-strong)">
                        {`ACTA REAL · ${etiquetaReal ?? visorActa.tipo} · PÁG ${paginaActiva}/${totalPaginas}`}
                      </span>
                      <span className="block truncate font-normal text-muted-foreground">
                        {`CONSULADO ${impresion.consulado} · PAÍS ${impresion.pais} · ZONA ${impresion.zona} · PUESTO ${impresion.puesto} · MESA ${impresion.mesa} · LUGAR ${impresion.lugar}`}
                        {barcodeReal && (
                          <span className="font-mono"> · {barcodeReal}</span>
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="truncate text-(--outline-strong)">
                      {textoCaption}
                    </span>
                  )}
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
