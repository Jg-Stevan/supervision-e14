"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GitCommitHorizontal,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDatos, useDatosAcciones } from "../datos-provider";
import { actaAprobada, scoreDePagina } from "../../domain/acta";
import type { FotoActa } from "../../domain/acta";
import { cargarActasReales } from "../../data/actas-reales/actas-reales";
import { actaVisibleEnMonitor } from "../../data/actas-runtime";
import { ActaHeader } from "./acta-header";
import { ActaToolbar } from "./acta-toolbar";
import { DocumentoE14 } from "./documento-e14";
import { ActaAcciones } from "./acta-acciones";
import { ActaHistorial } from "./acta-historial";
import { AcordeonSeccion } from "./acordeon-seccion";
import { useEsMovil } from "../consulta-viewport";
import {
  VisorZoom,
  type VisorZoomHandle,
} from "./visor-zoom";

/**
 * VISOR DE ACTAS (KIT VISOR-MONITOR-GLOBAL-v1): modal por estado (D17 — NO
 * es una ruta; el export estático no cambia). Se monta desde el store del
 * módulo (datos-provider) y solo existe mientras `visorActa` no es null.
 *
 * - **T9 — UN SOLO DISEÑO**: la variante `modoMonitor` (aterrizaje limpio
 *   desde VER EN MONITOR de masiva) queda ABSORBIDA — el diseño estándar ya
 *   es limpio y su única acción es REPORTAR ANOMALIA (T1). Todas las
 *   entradas (fila de mesa, tarjeta de anomalía, 👁 de puesto, VER EN
 *   MONITOR) comparten el mismo visor. El módulo digitalizador NO se toca.
 * - Cierre: ✕, tecla Escape (fuera de pantalla completa nativa) y clic en
 *   el scrim (clic dentro del panel NO cierra). Al cerrar el componente
 *   interno SE DESMONTA, con lo que zoom/rotación/contraste/pantalla
 *   completa vuelven a su estado inicial en el siguiente uso — sin effect
 *   de reset.
 * - Canvas (T4): toolbar flotante, flechas laterales de página, documento
 *   centrado con zoom/rotación/contraste y CAPTION-BAR inferior (T6).
 *   KIT visor-gestos-v1: el zoom vive en VisorZoom — RUEDA DEL MOUSE
 *   (ancla en el cursor), PELLIZCO TÁCTIL (2 dedos), arrastre para
 *   desplazar y doble clic/toque (ajustar ↔ acercar — el AJUSTE ya no
 *   tiene botón, T3.1); los botones de la toolbar operan por ref. Ajuste
 *   inicial automático (contain) por página/foto (fitKey) y re-fit por
 *   ResizeObserver (pantalla completa incluida). Skeleton durante la
 *   carga (~400 ms).
 * - **T4 — PANTALLA COMPLETA REAL de la imagen**: ⛶ pide Fullscreen API
 *   nativa sobre la sección del documento; si el navegador la concede, el
 *   documento ocupa TODA la ventana (ESC nativo sincronizado por el evento
 *   `fullscreenchange`). Fallback honesto (iframe/sin soporte): modal sin
 *   chrome — header, sidebar y caption ocultos, solo canvas + toolbar +
 *   VER ORIGINAL. Zoom/gestos/flechas siguen operando dentro.
 * - Sidebar (w-80, T1): REPORTAR ANOMALIA como ÚNICA acción, observaciones
 *   con hint, nota de auditoría e historial con SESIÓN ACTIVA (T7).
 *   <1024px se apila; <768px acordeones (AcordeonSeccion).
 * - Sin sombras en TODO el modal: jerarquía = borde 1px + capas tonales +
 *   scrim (D14/D17).
 * - SUP-6 (D23): si la página visible tiene FOTO REAL del digitalizador,
 *   el papel del canvas es la imagen (misma toolbar/zoom/rotación/
 *   contraste por CSS; la caja usa las dimensiones de la foto) con la
 *   impresión verbatim en la caption-bar. Sin foto → sintético D18 tal
 *   cual. El módulo NO mira votos (§0-1).
 * - T8 — VISIBILIDAD: las entradas del monitor quedan gateadas por
 *   `actaVisibleEnMonitor` (data/actas-runtime.ts); el visor en sí no
 *   cambia contadores (T5.7/D19).
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
    reportarAnomaliaVisor,
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
  // T4 — pantalla completa REAL de la imagen (nativa con fallback modal).
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  // Plan V2 — VER ORIGINAL: muestra la foto del digitalizador TAL CUAL
  // (sin rotación ni contraste aplicados por el supervisor en esta sesión).
  const [verOriginal, setVerOriginal] = useState(false);
  // Plan M1 — acordeones móviles de la sidebar (el estado vive en cada
  // AcordeonSeccion; aquí solo el punto de corte).
  const esMovil = useEsMovil();
  const panelRef = useRef<HTMLDivElement>(null);
  // T4 — la sección del DOCUMENTO es el elemento que va a pantalla completa.
  const canvasRef = useRef<HTMLElement>(null);
  const visorRef = useRef<VisorZoomHandle>(null);

  // Escape cierra (fuera de fullscreen nativa: ESC sale de fullscreen y el
  // evento `fullscreenchange` sincroniza el estado — el siguiente ESC
  // cierra el visor) + bloqueo de scroll de fondo + foco al panel (T6.5).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) cerrarVisor();
    };
    document.addEventListener("keydown", onKeyDown);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrevio;
      // T4 — si el visor se cierra con fullscreen nativa activa, salir.
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
          /* el navegador ya la retiró — nada que hacer */
        });
      }
    };
  }, [cerrarVisor]);

  // T4.1 — sincronizar `pantallaCompleta` con el estado REAL del navegador
  // (incluye la salida por ESC nativo y cambios externos).
  useEffect(() => {
    const onFullscreenChange = () => {
      setPantallaCompleta(document.fullscreenElement === canvasRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // T4.1 — activar: Fullscreen API nativa PRIMERO; si falta o es rechazada
  // (p. ej. iframe sin permiso) → fallback honesto en el modal (sin chrome).
  const activarPantallaCompleta = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && typeof canvas.requestFullscreen === "function") {
      canvas
        .requestFullscreen()
        .then(() => {
          /* el evento `fullscreenchange` confirma el estado */
        })
        .catch(() => setPantallaCompleta(true)); // fallback sin chrome
    } else {
      setPantallaCompleta(true); // fallback sin chrome (sin API nativa)
    }
  }, []);

  // T4.1 — salir: nativa (el evento sincroniza) o fallback directo.
  const salirPantallaCompleta = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => setPantallaCompleta(false));
    } else {
      setPantallaCompleta(false);
    }
  }, []);

  const alternarPantallaCompleta = useCallback(() => {
    if (pantallaCompleta) salirPantallaCompleta();
    else activarPantallaCompleta();
  }, [pantallaCompleta, activarPantallaCompleta, salirPantallaCompleta]);

  const acercar = useCallback(() => visorRef.current?.acercar(), []);
  const alejar = useCallback(() => visorRef.current?.alejar(), []);
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
  // T8 — mesas CON acta visible (regla ÚNICA: sembradas demo + runtime
  // PUBLICADA; BLOQUEADA/SIN_JOIN/rechazadas quedan fuera).
  const mesasConActa = mesasDelPuesto.filter((m) =>
    actaVisibleEnMonitor(visorActa.puestoId, m.id, m)
  );
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
  // Etiqueta/barcode impresos del formulario visible: POR FORMULARIO desde
  // el registro (manifiesto estático D24 + RUNTIME de carga masiva D27 —
  // loader memoizado en módulo: consultar aquí es gratis); fallback al
  // encabezado a nivel de acta solo sin registro (ver U-1 más abajo).
  const registroReal =
    cargarActasReales().actas[`${visorActa.puestoId}::${visorActa.mesaId}`];
  // D35 (2026-11-08 — anonimizar): la ranura ESTÁTICA del manifest existe
  // para esta página (el loader metadata-only la publica en null). Con
  // ranura y sin foto → placeholder «foto retirada (D35)» en vez del
  // sintético D18 (el supervisor debe SABER que había foto y se retiró —
  // no un reemplazo silencioso). Las páginas sin ranura (p. ej. la
  // TRANSMISIÓN de Roma, nunca publicada con foto) siguen 100 % sintéticas.
  const ranuraD35 = (() => {
    const ranuras = registroReal?.fotos[visorActa.tipo];
    return Array.isArray(ranuras) && paginaActiva - 1 < ranuras.length;
  })();
  const esActaReal = Boolean((fotoActiva || ranuraD35) && impresion);
  // U-1 (INFORME-PRUEBAS-Y-AUDITORIA) — la etiqueta/barcode del FORMULARIO
  // VISIBLE manda. El registro (manifiesto estático D24 + runtime D27)
  // indexa POR formulario (etiquetasImpresas/barcodesImpresos); `impresion`
  // es a nivel de ACTA (el encabezado del ÚLTIMO formulario publicado —
  // fusionarActaRuntime:813) y mentía al alternar TRANSMISIÓN/CÓNSUL en el
  // conmutador del visor. Orden: registro por-formulario → impresion (solo
  // si no hay registro para la clave, actas 100% runtime sin manifiesto).
  const etiquetaReal = registroReal
    ? registroReal.etiquetasImpresas[visorActa.tipo]
    : impresion?.etiquetaFormulario;
  const barcodeReal = registroReal
    ? registroReal.barcodesImpresos[visorActa.tipo] || undefined
    : impresion?.barcode;

  // KIT visor-gestos-v1: el alto base de la foto sale del aspect ratio —
  // el AJUSTE (contain) y la escala los maneja VisorZoom (sin caja de
  // scroll: transform translate·scale·rotate + límites de offset).
  const fotoAltoBase = fotoActiva
    ? Math.round((fotoActiva.alto / fotoActiva.ancho) * FOTO_ANCHO_BASE)
    : 0;
  // Re-ajuste al cambiar página/formulario/mesa (aspect ratio distinto).
  // Plan V2: alternar ORIGINAL/PROCESADA también re-ajusta (misma foto,
  // transforms distintos — el contain recalcula sobre la vista cruda).
  const fitKey = `${visorActa.puestoId}::${visorActa.mesaId}::${visorActa.tipo}::${paginaActiva}::${
    verOriginal ? "original" : "procesada"
  }`;

  const puedePaginaAnterior = paginaActiva > 1;
  const puedePaginaSiguiente = paginaActiva < paginas.length;
  const totalPaginas = paginas.length;

  // Plan V1 — SCORE de la página visible: el score REAL del OCR que viaja
  // con la foto (carga masiva) manda; sin foto real, se deriva por regla
  // del estado de la página (VALIDA 10 · ADVERTENCIA 6 · PENDIENTE —).
  const scoreActivo: number | null | undefined =
    fotoActiva?.score ?? (pagina ? scoreDePagina(pagina) : null);

  // ── T6 — CAPTION-BAR (dos tramos, como la imagen) ───────────────────────
  const etiquetaTipo =
    visorActa.tipo === "TRANSMISION"
      ? "FORMULARIO TRANSMISIÓN (E-14)"
      : "ACTA DE DELEGADOS";
  // Izquierda: la VERSIÓN (mesa rescaneada) manda sobre la etiqueta —
  // semántica actual de textoCaption conservada; sin ella, etiqueta real
  // impresa (CÓNSUL/EMBAJADOR de El Cairo) o fallback por tipo + PÁG n/N.
  const captionIzquierda =
    actaActual && actaActual.version > 1
      ? `VERSIÓN ${actaActual.version} — RECIBIDA ${actaActual.horaCarga}`
      : paginas.length > 0
        ? `${etiquetaReal ?? etiquetaTipo} · PÁG ${paginaActiva}/${totalPaginas}`
        : etiquetaTipo;
  // Derecha: con FOTO REAL, la impresión verbatim disponible (D23 —
  // CONSULADO/PAÍS/ZONA/PUESTO/MESA/LUGAR) truncada con ellipsis y `title`
  // completo; el BARCODE va en segmento MONO aparte (T6 — como el diseño;
  // auditoría del kit: se recuperó el font-data que traía la píldora vieja).
  // Sin foto real, el texto del catálogo.
  const captionDerechaBase = esActaReal && impresion
    ? `CONSULADO ${impresion.consulado} · PAÍS ${impresion.pais} · ZONA ${impresion.zona} · PUESTO ${impresion.puesto} · MESA ${impresion.mesa} · LUGAR ${impresion.lugar}`
    : `PAÍS ${puesto?.codigoPais ?? "—"} · ${(puesto?.pais ?? "").toUpperCase()} MESA ${visorActa.mesaId ?? mesa?.id ?? "—"} · ${(puesto?.puesto ?? "").toUpperCase()}`;
  const captionDerechaBarcode =
    esActaReal && impresion && barcodeReal
      ? barcodeReal.replace(/\*/g, "")
      : null;
  // `title` nativo = texto completo (base + barcode).
  const captionDerecha = captionDerechaBarcode
    ? `${captionDerechaBase} · ${captionDerechaBarcode}`
    : captionDerechaBase;

  // T2.1 — salto DIRECTO desde el dropdown de mesas: delta de índices sobre
  // la MISMA lista que usan los chevrons (navegarMesa del store). Función
  // plana (sin hook tras el early-return defensivo — reglas de hooks).
  const irAMesa = (mesaIdDestino: string) => {
    const destino = mesasConActa.findIndex((m) => m.id === mesaIdDestino);
    if (destino < 0) return;
    const delta = destino + 1 - Math.max(1, indiceMesa);
    if (delta !== 0) navegarMesa(delta);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        pantallaCompleta ? "p-0" : "p-4 md:p-6"
      )}
    >
      {/* Scrim: clic fuera cierra; aria-hidden (T6.5). En fullscreen nativa
          el documento cubre TODO el viewport (el scrim queda debajo). */}
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
          "relative flex flex-col overflow-y-auto rounded-[8px] border border-(--border) bg-(--card) outline-none lg:overflow-hidden" /* T-06: tarjeta del visor 8px */,
          pantallaCompleta
            ? "h-full w-full max-w-none border-0 rounded-none"
            : "mx-auto h-[90vh] max-w-[1400px]"
        )}
      >
        {/* T9 — UN SOLO diseño: header completo para TODAS las entradas.
            En pantalla completa se retira del flujo (fallback: sin chrome;
            nativa: cubierta por el documento a pantalla completa). */}
        {!pantallaCompleta &&
          (puesto ? (
            <ActaHeader
              puesto={puesto}
              mesaId={visorActa.mesaId ?? mesa?.id ?? "—"}
              indiceMesa={Math.max(1, indiceMesa)}
              totalMesas={totalMesas}
              mesasConActaIds={mesasConActa.map((m) => m.id)}
              puedeAnterior={indiceMesa > 1}
              puedeSiguiente={indiceMesa < totalMesas}
              onMesaAnterior={() => navegarMesa(-1)}
              onMesaSiguiente={() => navegarMesa(1)}
              onIrAMesa={irAMesa}
              tipo={visorActa.tipo}
              onCambiarTipo={cambiarTipo}
              paginas={paginas}
              paginaActiva={paginaActiva}
              onCambiarPagina={cambiarPagina}
              acta={actaActual}
              onCerrar={cerrarVisor}
            />
          ) : (
            <header className="flex items-center justify-end border-b border-(--border) bg-(--surface-lowest) px-4 py-2.5">
              <button
                type="button"
                onClick={cerrarVisor}
                aria-label="Cerrar visor de actas"
                title="Cerrar (Escape)"
                className="inline-flex size-9 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
              >
                <X className="size-5" aria-hidden />
              </button>
            </header>
          ))}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ── VISOR — T4: esta sección es el elemento de fullscreen ── */}
          <section
            ref={canvasRef}
            aria-label="Documento del acta"
            className="relative flex min-h-[40vh] flex-1 flex-col bg-(--surface-lowest) lg:min-h-0 lg:overflow-hidden"
          >
            {/* Toolbar flotante (permite wrap a 375px — T6.3). KIT
                visor-gestos-v1: los botones operan por REF sobre VisorZoom
                (una sola fuente de verdad de la escala); el % es espejo.
                T3: sin AJUSTAR — doble clic/toque ajusta (VisorZoom). */}
            <div className="absolute inset-x-0 top-4 z-20 flex justify-center px-4">
              <ActaToolbar
                zoom={zoom}
                score={scoreActivo}
                onZoomMas={acercar}
                onZoomMenos={alejar}
                onRotar={rotar}
                onContraste={ciclarContraste}
                pantallaCompleta={pantallaCompleta}
                onPantallaCompleta={alternarPantallaCompleta}
              />
            </div>

            {/* Overlay: acta validada (§2.3) — bajo la toolbar en pantallas
                angostas, en la esquina a partir de lg. */}
            {aprobada && !pantallaCompleta && (
              <span className="label-caps absolute top-20 left-4 z-10 inline-flex items-center gap-1.5 rounded-[4px] border border-(--primary) bg-(--primary)/10 px-2.5 py-1.5 text-(--primary) lg:top-4">
                <Check className="size-3.5" aria-hidden />
                Acta validada
              </span>
            )}

            {/* Flechas laterales (navegan páginas del formulario activo)
                — plan M2: píldora vertical del diseño (h-14 w-9), visibles
                también en pantalla completa (T4.3) y en móvil. */}
            <button
              type="button"
              onClick={() => cambiarPagina(paginaActiva - 1)}
              disabled={!puedePaginaAnterior}
              title={`Página anterior (Pág ${Math.max(1, paginaActiva - 1)})`}
              aria-label="Página anterior"
              className="absolute top-1/2 left-3 z-10 inline-flex h-14 w-9 -translate-y-1/2 items-center justify-center rounded-[4px] border border-(--border) bg-(--background)/80 text-muted-foreground hover:text-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
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
              className="absolute top-1/2 right-3 z-10 inline-flex h-14 w-9 -translate-y-1/2 items-center justify-center rounded-[4px] border border-(--border) bg-(--background)/80 text-muted-foreground hover:text-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
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
                     (gate T8), pero si pasa → inline. */
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
                   votación en la UI (§0-1): la imagen se muestra tal cual.
                   Plan V2: VER ORIGINAL muestra el escaneo CRUDO (sin los
                   ajustes de esta sesión — rotación 0, sin filtro). */
                <VisorZoom
                  ref={visorRef}
                  rotacion={verOriginal ? 0 : rotacion}
                  filtro={verOriginal ? undefined : filtroDeContraste(contraste)}
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
              ) : ranuraD35 ? (
                /* D35 — la página TIENE ranura real en el manifest pero la
                   foto fue retirada (anonimización 2026-11-08): placeholder
                   explícito + metadatos; jamás un reemplazo silencioso. */
                <div
                  className="flex min-h-full min-w-full items-center justify-center p-6"
                  role="status"
                  aria-label="Foto retirada del repositorio por la decisión D35"
                >
                  <div className="w-full max-w-[460px] rounded-[4px] border border-dashed border-(--outline-strong) bg-(--card) px-5 py-6 text-center">
                    <EyeOff
                      className="mx-auto size-5 text-muted-foreground"
                      aria-hidden
                    />
                    <p className="label-caps mt-2 text-foreground">
                      Foto retirada (D35)
                    </p>
                    <p className="body-md mt-2 text-muted-foreground">
                      La foto real de esta página se eliminó del repositorio
                      el 2026-11-08 (decisión D35 de anonimización). El panel
                      conserva el encabezado impreso y los metadatos de la
                      mesa; la imagen solo vive —si existe— en el hub
                      autenticado del puente.
                    </p>
                    {impresion && (
                      <p className="font-data mt-3 text-[11px] text-muted-foreground">
                        CONSULADO {impresion.consulado} · {impresion.pais} ·
                        MESA {impresion.mesa} · {impresion.lugar}
                      </p>
                    )}
                  </div>
                </div>
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

            {/* T5 — VER ORIGINAL / MOSTRAR PROCESADA (pill centrada
                inferior, diseño del dueño; en fullscreen sube a bottom-4
                porque la caption-bar no existe ahí). Solo con FOTO REAL —
                el documento sintético D18 no tiene original que ver. */}
            {fotoActiva && (
              <div
                className={cn(
                  "absolute inset-x-0 z-20 flex justify-center px-4",
                  pantallaCompleta ? "bottom-4" : "bottom-14"
                )}
              >
                <button
                  type="button"
                  onClick={() => setVerOriginal((v) => !v)}
                  aria-pressed={verOriginal}
                  className="label-caps inline-flex items-center gap-2 rounded-[4px] border border-(--border) bg-(--input)/90 px-3.5 py-1.5 font-mono text-(--primary) backdrop-blur transition-colors hover:border-(--primary)/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
                >
                  {verOriginal ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                  {verOriginal ? "Mostrar procesada" : "Ver original"}
                </button>
              </div>
            )}

            {/* T6 — CAPTION-BAR full-width (barra inferior del canvas, NO
                pill flotante): punto de estado + etiqueta · PÁG │ ubicación
                (o impresión verbatim D23 con foto real). En pantalla
                completa se oculta (solo imagen + toolbar + VER ORIGINAL,
                T4.2). Sin cifras de votación (§0-1). */}
            {actaActual && !pantallaCompleta && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-(--border) bg-(--surface-lowest)/95 backdrop-blur">
                <div className="flex w-full items-center gap-2 px-4 py-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      pagina?.estado === "ADVERTENCIA" &&
                        "animate-pulse bg-(--danger)",
                      pagina?.estado === "VALIDA" && "bg-(--success)",
                      (pagina?.estado ?? "PENDIENTE") === "PENDIENTE" &&
                        "border border-(--outline-strong)"
                    )}
                    aria-hidden
                  />
                  <span className="label-caps shrink-0 truncate text-(--outline-strong)">
                    {captionIzquierda}
                  </span>
                  <span
                    className="h-4 w-px shrink-0 bg-(--border)"
                    aria-hidden
                  />
                  <span
                    className="label-caps pointer-events-auto min-w-0 truncate font-normal text-muted-foreground"
                    title={captionDerecha}
                  >
                    {captionDerechaBase}
                    {captionDerechaBarcode && (
                      <span className="font-data"> · {captionDerechaBarcode}</span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ── SIDEBAR DE ACCIONES (T9 — presente en TODAS las entradas;
              T4 — oculta en pantalla completa). Plan M1: en móvil las 2
              secciones van en acordeones EXPANDIR/OCULTAR
              (AcordeonSeccion); en desktop quedan apiladas tal cual. ──── */}
          {!pantallaCompleta && (
            <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-(--border) bg-(--card) p-5 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
            <AcordeonSeccion
              titulo="Acciones del supervisor"
              icono={ShieldCheck}
              esMovil={esMovil}
            >
              {/* T1 — REPORTAR ANOMALIA es la ÚNICA acción (la lógica de
                  aprobar/rescan queda DORMIDA en el store). */}
              <ActaAcciones
                accionEnCurso={
                  accionActaEnCurso === "reportar" ? "reportar" : null
                }
                onReportar={reportarAnomaliaVisor}
                sinTitulo={esMovil}
              />
            </AcordeonSeccion>
            {actaActual && (
              <AcordeonSeccion
                titulo="Historial y trazabilidad"
                icono={GitCommitHorizontal}
                esMovil={esMovil}
              >
                <ActaHistorial
                  eventos={actaActual.historial}
                  zonaEmisor={puesto?.zonaEmisor}
                  pais={puesto?.pais}
                  sinTitulo={esMovil}
                />
              </AcordeonSeccion>
            )}
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
          )}
        </div>
      </div>
    </div>
  );
}
