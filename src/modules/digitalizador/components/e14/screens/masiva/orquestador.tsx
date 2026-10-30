"use client";

/**
 * KIT e14-carga-masiva-v1 (T4): vista MASIVA — desktop-first, UNA vista con
 * todo adentro (kit §6). Sueltas/seleccionas N fotos → cola persistente
 * (IndexedDB) → runner secuencial con el MISMO pipeline real de siempre →
 * bandeja de resultados con estados, envío automático de ÓPTIMAS y
 * revisión del resto (ABRIR → modal de revisión propio del módulo).
 * Copy corto del repo (mono, uppercase, sin guías — D1/gate-v2). Sin toasts
 * (redesign-stitch D2): píldoras/banner. Listas largas: max-h + overflow-y-auto.
 *
 * KIT carga-masiva-supervision-v1 (D27): vista embebida en el dashboard de
 * SUPERVISION (módulo digitalizador trasplantado). Los envíos se PUBLICAN
 * en el monitor vía el adaptador (store/store-e14.ts → actas-runtime); el
 * modal de revisión añade VER EN MONITOR para aterrizar el acta publicada
 * en el visor del dashboard (seam por props — sin contexto cruzado).
 *
 * R6 (SPLIT — reporte 03b M-2): este archivo es el ORQUESTADOR de la vista
 * tras el split move-only de MasivaView.tsx; helpers/píldoras en helpers.tsx,
 * modal en modal-revisor.tsx, chip en publicacion-chip.tsx. La ruta pública
 * `screens/MasivaView.tsx` queda como barrel de compatibilidad.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cerrarActaMasiva,
  useE14Store,
} from "@/modules/digitalizador/store/store-e14";
import {
  refrescarEnviosTrasDrenaje,
  useMasivaStore,
} from "@/modules/digitalizador/lib/e14/masiva/store";
import { rapidOcrPrecalentar } from "@/modules/digitalizador/lib/e14/ocr/rapidocr";
// KIT e107-prescan-qr-cola-v1 (§D.3): el botón PROCESAR COLA delega en el
// pre-scan QR (fases 1-2 del dueño) y el orquestador llama iniciar() con la
// lista ya filtrada (flag OFF ⇒ iniciar() byte-idéntico — kill-switch).
import { prescanYIniciar, usePrescanQrEstado } from "@/modules/digitalizador/lib/e14/masiva/prescan-qr";
// KIT e14-gama-adaptativa-v1 (D74): chip de gama adaptada — el tier detectado
// consume presupuestos de recursos en BAJO/MEDIO (transparencia del dueño).
import { planGamaActual, refrescarPlanGama, type PlanGama } from "@/modules/digitalizador/lib/e14/gama";
// D34 — KIT e14-metricas-corrida-v1: informe de comportamiento de la carga
// (corrida viva + historial + export JSON) — datos reales para diagnosticar.
import InformeCorrida from "../InformeCorrida";
// R6 — SPLIT move-only (reporte 03b M-2): helpers/píldoras puras ahora viven
// en masiva/helpers.tsx (verbatim — sin cambio de lógica).
import { esDuplicada, etiquetaVida, FILTROS } from "./helpers";
// R6 — SPLIT move-only: fila de la bandeja (cuerpo del map) en masiva/fila.tsx.
import { FilaMasivaVista } from "./fila";
// R6 — SPLIT move-only: modal de revisión (con editor) y chip de publicación
// ahora viven en masiva/ (verbatim — sin cambio de lógica).
import { ModalRevisor } from "./modal-revisor";
import { PublicacionChip } from "./publicacion-chip";
import { StitchStackIcon } from "../../icons";

/** Seam de UI (D27): props que el shell de supervision entrega a la vista.
 * `onVerEnMonitor` aterriza un acta publicada en el visor del dashboard
 * (cambia a MONITOR y abre el modal del acta de esa mesa). Opcional: sin
 * ella, el modal de revisión funciona igual (solo sin el salto al monitor). */
export interface PropsMasivaView {
  onVerEnMonitor?: (
    puestoId: string,
    mesaId: string,
    tipo?: "TRANSMISION" | "DELEGADOS"
  ) => void;
}

export function MasivaView({ onVerEnMonitor }: PropsMasivaView) {
  const filas = useMasivaStore((s) => s.filas);
  const corriendo = useMasivaStore((s) => s.corriendo);
  const progreso = useMasivaStore((s) => s.progreso);
  const filtro = useMasivaStore((s) => s.filtro);
  const guardando = useMasivaStore((s) => s.guardando);
  const colaDisponible = useMasivaStore((s) => s.colaDisponible);
  const avisoCola = useMasivaStore((s) => s.avisoCola);
  const enviandoLote = useMasivaStore((s) => s.enviandoLote);
  // KIT e73 (§E): contadores del chip del sondeo QR en ingesta (SOLO-LECTURA
  // — derivados de las filas; jamás tocan la cola ni el runner).
  const sondeadas = filas.filter((f) => f.sondeoQrMs != null).length;
  const conPayload = filas.filter((f) => f.sondeoQrTier != null).length;
  // KIT e107-prescan-qr-cola-v1 (§D.3): estado del banner del pre-scan
  // («SONDEANDO QR… k/N») — SOLO-LECTURA, como el chip del sondeo e73.
  const prescan = usePrescanQrEstado();
  const {
    cargarFilas,
    sincronizarAlVolver,
    agregarFiles,
    pausar,
    abrirActa,
    quitar,
    vaciar,
    reiniciarEnvios, // D33 — KIT e14-reiniciar-envios-v1
    enviarLote,
    setFiltro,
    procesarIgual,
    reintentar, // D59 — KIT e14-info-acta-filas-v1 (T4)
  } = useMasivaStore.getState();

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const dragCounterRef = useRef(0);
  const [vaciarArmado, setVaciarArmado] = useState(false);
  // D33 — KIT e14-reiniciar-envios-v1: armado del botón REINICIAR ENVÍOS
  // (2 toques — el borrado del ledger NUNCA es accidental).
  const [resetArmado, setResetArmado] = useState(false);

  // ── D27 — modal de revisión (ABRIR): el adaptador carga el acta de IDB
  // (abrirActaMasiva) y esta vista la muestra. Al cerrar, sincronizarAlVolver
  // re-persiste (thumb/ledger e65b) ANTES de limpiar actaActual.
  const actaAbierta = useE14Store((s) => s.actaActual);
  const publicaciones = useE14Store((s) => s.publicaciones);
  const publicacionAbierta = actaAbierta
    ? publicaciones[actaAbierta.id]
    : undefined;
  const [revisorAbierto, setRevisorAbierto] = useState(false);
  useEffect(() => {
    if (actaAbierta) setRevisorAbierto(true);
  }, [actaAbierta]);
  const cerrarRevisor = () => {
    setRevisorAbierto(false);
    void sincronizarAlVolver().finally(() => cerrarActaMasiva());
  };

  // Al montar: cargarFilas() (incluye recuperarCola — zombis fuera) +
  // sincronizarAlVolver() al regresar de REVISIÓN (kit §6). Acciones de
  // zustand estables → deps correctas.
  useEffect(() => {
    void cargarFilas().then(() => sincronizarAlVolver());
  }, [cargarFilas, sincronizarAlVolver]);

  // KIT e14-prowarm-ocr-v1 (T2): pre-warm del OCR al montar MASIVA — el dueño
  // prepara la cola y el wasm queda caliente ANTES de pulsar PROCESAR.
  // Fire-and-forget: sin UI, sin toasts (D2), sin estados (§0.7).
  useEffect(() => {
    void rapidOcrPrecalentar();
  }, []);

  // KIT e14-gama-adaptativa-v1 (D74): plan de gama para el chip — el sync
  // manda al montar y `refrescarPlanGama()` re-clasifica con la versión
  // COMPLETA (batería + storage — puede BAJAR el tier). Fire-and-forget.
  const [gama, setGama] = useState<PlanGama>(() => planGamaActual());
  useEffect(() => {
    void refrescarPlanGama().then(setGama);
  }, []);

  // Confirmación inline de 2 toques — se desarma sola (kit §6, sin window.confirm).
  // D33: el desarme cubre AMBOS armados (VACIAR y REINICIAR ENVÍOS).
  useEffect(() => {
    if (!vaciarArmado && !resetArmado) return;
    const t = window.setTimeout(() => {
      setVaciarArmado(false);
      setResetArmado(false);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [vaciarArmado, resetArmado]);

  // Listener global de drag & drop (estilo DeepSeek / Slack):
  // Permite arrastrar archivos desde el explorador y soltarlos en cualquier
  // parte de la ventana mientras el módulo MASIVA está activo.
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        dragCounterRef.current++;
        setIsDraggingGlobal(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingGlobal(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingGlobal(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        void agregarFiles(Array.from(e.dataTransfer.files));
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [agregarFiles]);

  // KIT e14-masiva-ux-v1 (T3.2): reconciliar filas «EN COLA» contra la
  // conexión actual — tanto al montar (el toggle pudo usarse en REVISIÓN o
  // la app recargarse: online=true + hashSha256 "EN COLA" ⇒ el drenaje ya
  // ocurrió en el store principal, la fila solo pinta tarde) como en el
  // toggle offline→online con la vista viva. Idempotente (solo toca filas
  // con hashSha256 === "EN COLA" que sigan así en IDB).
  const online = useE14Store((s) => s.online);
  useEffect(() => {
    if (online) void refrescarEnviosTrasDrenaje();
  }, [online]);

  const pendientes = filas.filter(
    (f) => f.estado === "PENDIENTE" && !f.id.startsWith("masiva-temp-"),
  ).length;
  // KIT e14-masiva-tiempos-v1 (PR-1): las DUPLICADAS son cola también (su
  // procesamiento es la copia rápida) — habilitan PROCESAR igual que las
  // PENDIENTES y se cuentan aparte en la línea de conteos. FIX M13: las
  // temps no cuentan como PENDIENTES (mueren al aterrizar sus ids reales).
  const duplicadas = filas.filter((f) => f.estado === "DUPLICADA").length;
  const terminadas =
    filas.filter(
      (f) =>
        f.estado === "LISTA" || f.estado === "ERROR" || f.estado === "YA-ENVIADA",
    ).length; // e65: la YA-ENVIADA está terminada (cero pipeline)
  // e65-dedup-enviadas-v1 (T-7): contador de la línea de resumen.
  const yaEnviadas = filas.filter((f) => f.estado === "YA-ENVIADA").length;
  const advertenciasPend = filas.filter(
    (f) => f.estado === "LISTA" && f.statusActa === "ADVERTENCIA",
  ).length;
  const hayCola = filas.length > 0;

  // KIT e14-masiva-ux-v1 (T3.4): conteos del encabezado del lote — el dueño
  // ve de un vistazo si «se pudo enviar» y qué queda pendiente.
  const enviadas = filas.filter(
    (f) => f.estado === "LISTA" && f.statusActa === "ENVIADA" && !f.envioEnCola,
  ).length;
  const enCola = filas.filter(
    (f) => f.estado === "LISTA" && f.statusActa === "ENVIADA" && f.envioEnCola,
  ).length;
  const errores = filas.filter((f) => f.estado === "ERROR").length;

  const visibles =
    filtro === "TODAS"
      ? filas
      : filas.filter((f) =>
          filtro === "ERROR" ? f.estado === "ERROR" : f.statusActa === filtro,
        );

  // KIT e64v — Cambio B: duplicadas AL FINAL de la bandeja. SOLO orden de
  // RENDER (useMemo): el array del store JAMÁS se reordena — es la fuente
  // de verdad de la cola (e63g watchdog, espera APLAZADA, persistencia,
  // orden de envío). filter preserva el orden de llegada dentro de cada
  // grupo; el render usa key=id → React reordena por clave sin re-montar.
  const visiblesOrdenadas = useMemo(() => {
    const originales = visibles.filter((f) => !esDuplicada(f));
    const duplicadas = visibles.filter((f) => esDuplicada(f));
    return [...originales, ...duplicadas];
  }, [visibles]);

  const activa = progreso ? filas.find((f) => f.id === progreso.id) : null;
  const filaActiva = activa && activa.estado === "PROCESANDO" ? activa : null;

  // D65 (T3.3): cola REAL del runner (MISMA orden que siguientePendiente:
  // PENDIENTE/DUPLICADA sin temps por agregadaEn) + la fila EN CURSO al
  // frente → «EN COLA #N de M» honesto (N = posición 1-based; M = total por
  // procesar + en curso). DUPLICADA también va en cola (su procesamiento es
  // la copia rápida — el runner la toma igual).
  const enCursoId = progreso?.id ?? null;
  const colaVida = useMemo(() => {
    const ordenadas = filas
      .filter(
        (f) =>
          (f.estado === "PENDIENTE" || f.estado === "DUPLICADA") &&
          !f.id.startsWith("masiva-temp-"),
      )
      .sort((a, b) => a.agregadaEn - b.agregadaEn)
      .map((f) => f.id);
    return enCursoId ? [enCursoId, ...ordenadas] : ordenadas;
  }, [filas, enCursoId]);

  // D65 (T3.3): destello 100% verde al LISTAR («un instante, luego pasa al
  // estado normal»). Transitorio en memoria — nada a IDB. La 1.ª pasada
  // (montaje/recarga: LISTA restauradas de IDB) NO destella (sin % fantasma).
  const [recienListas, setRecienListas] = useState<Set<string>>(() => new Set());
  const listasVistosRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const listas = new Set(filas.filter((f) => f.estado === "LISTA").map((f) => f.id));
    if (listasVistosRef.current === null) {
      listasVistosRef.current = listas;
      return;
    }
    const nuevas: string[] = [];
    for (const id of listas) {
      if (!listasVistosRef.current.has(id)) nuevas.push(id);
    }
    listasVistosRef.current = listas;
    if (!nuevas.length) return;
    setRecienListas((prev) => {
      const next = new Set(prev);
      for (const id of nuevas) next.add(id);
      return next;
    });
    // Sin cleanup: cada timer se limpia solo al disparar (1.2 s).
    for (const id of nuevas) {
      window.setTimeout(() => {
        setRecienListas((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 1200);
    }
  }, [filas]);

  return (
    <section
      className="flex-1 min-h-0 overflow-y-auto bg-[#090d12] relative flex flex-col"
      aria-label="MASIVA — carga masiva de actas"
    >
      {/* ---------- OVERLAY DRAG & DROP GLOBAL (ESTILO DEEPSEEK) ---------- */}
      {isDraggingGlobal && (
        <div
          className="fixed inset-0 z-50 bg-[#090d12]/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center border-4 border-dashed border-[#10b981] animate-in fade-in duration-150 pointer-events-auto shadow-2xl"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current--;
            if (dragCounterRef.current <= 0) {
              dragCounterRef.current = 0;
              setIsDraggingGlobal(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = 0;
            setIsDraggingGlobal(false);
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
              void agregarFiles(Array.from(e.dataTransfer.files));
            }
          }}
        >
          <div className="w-24 h-24 rounded-3xl bg-[#10b981]/15 border-2 border-[#10b981] flex items-center justify-center text-[#10b981] mb-6 shadow-2xl shadow-[#10b981]/30 animate-bounce">
            <StitchStackIcon className="w-12 h-12" />
          </div>
          <h2 className="font-mono text-2xl md:text-3xl font-black text-white uppercase tracking-wider mb-3">
            SUELTA LOS ARCHIVOS AQUÍ
          </h2>
          <p className="font-mono text-xs md:text-sm text-slate-300 max-w-md uppercase tracking-wider mb-5">
            Se agregarán directamente a la cola de digitalización E-14
          </p>
          <div className="flex flex-wrap gap-2 justify-center font-mono text-[11px] text-slate-300 uppercase tracking-widest bg-slate-900/80 px-5 py-2.5 rounded-full border border-slate-700/80 shadow-md">
            <span>FOTOS (JPG/PNG)</span> • <span>PDF</span> • <span>ZIP</span> • <span>RAR</span> • <span>HEIC</span>
          </div>
        </div>
      )}

      {/* ---------- HEADER FIJO / STICKY SUPERIOR CON BOTÓN PROCESAR COLA ---------- */}
      <header className="sticky top-0 z-30 w-full bg-[#090d12]/92 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3 shadow-lg shadow-black/40">
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Título + estado visual */}
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#10b981]/15 border border-[#10b981]/40 flex items-center justify-center text-[#10b981] shrink-0">
              <StitchStackIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              {/* KIT e14-gama-adaptativa-v1 — flex-wrap: en móvil el chip de
                  gama ENVUELVE a la línea siguiente (jamás tapa el título ni
                  desborda sobre los botones de la derecha). */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="font-mono text-sm md:text-base font-black tracking-wider text-white uppercase truncate">
                  CARGA MASIVA
                </h1>
                {hayCola && (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full border border-slate-800 bg-[#10161f] font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {terminadas}/{filas.length}
                  </span>
                )}
                {/* KIT e14-gama-adaptativa-v1 (D74) — chip SOLO con
                    adaptaciones activas (BAJO/MEDIO + flag ON): transparencia
                    del dueño (el espíritu D6 — detectar Y reportar). Con el
                    detalle completo en el title (ajustes aplicados + cómo
                    desactivar). `hidden sm:inline-flex` — MISMO patrón del
                    contador {terminadas}/{filas}: en móvil (<640 px) la fila
                    de acciones derecha ya ocupa el ancho y el chip no cabe
                    sin tapar el título/botón (verificado en 390 px); desde sm
                    sí hay sitio. El detalle del plan SIEMPRE queda en la
                    traza `[e14] gama plan …` de consola. */}
                {gama.activo && (
                  <span
                    className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300 whitespace-nowrap"
                    title={`Gama ${gama.tier} detectada${gama.tierInferido ? " (inferida)" : ""} — modo adaptado (KIT e14-gama-adaptativa-v1 · D74): ${gama.ajustes.join(" · ")}. Desactivable con el flag masivaAdaptativoGama=false.`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-1" />
                    GAMA {gama.tier} · ADAPTADO
                  </span>
                )}
              </div>
              <p className="font-mono text-[9px] md:text-[10px] tracking-wider text-slate-400 uppercase truncate">
                {corriendo ? (
                  <span className="text-[#10b981] font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping" />
                    PROCESANDO EN COLA…
                  </span>
                ) : pendientes > 0 ? (
                  `${pendientes} PENDIENTES DE ENVÍO`
                ) : hayCola ? (
                  "COLA COMPLETADA"
                ) : (
                  "ARRASTRA ARCHIVOS O SELECCIONA"
                )}
              </p>
            </div>
          </div>

          {/* Acciones principales fijas: PROCESAR / PAUSAR + VACIAR */}
          <div className="relative flex items-center gap-2 shrink-0">
            {corriendo ? (
              <button
                type="button"
                onClick={pausar}
                aria-label="Pausar la cola"
                className="min-h-[44px] px-4 rounded-xl border border-amber-500/50 bg-amber-500/15 text-amber-300 font-mono text-[11px] font-bold uppercase tracking-wider hover:bg-amber-500/25 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                PAUSAR
              </button>
            ) : (
              <button
                type="button"
                // KIT e107 (§D.3): el clic pasa por el pre-scan QR —
                // prescanYIniciar llama iniciar() con la lista filtrada
                // (flag OFF/abort honesto ⇒ byte-idéntico al de hoy).
                onClick={() => void prescanYIniciar()}
                disabled={!colaDisponible || (pendientes === 0 && duplicadas === 0) || prescan.corriendo}
                aria-label="Procesar la cola"
                className="min-h-[44px] px-4 md:px-5 rounded-xl bg-[#10b981] hover:bg-[#059669] text-[#090d12] font-mono text-[11px] md:text-xs font-black uppercase tracking-wider shadow-md shadow-[#10b981]/25 hover:shadow-[#10b981]/40 active:scale-[0.98] transition cursor-pointer disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-[#090d12]" />
                PROCESAR COLA
                {pendientes + duplicadas > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-[#090d12]/20 font-extrabold text-[10px]">
                    {pendientes + duplicadas}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!vaciarArmado) {
                  setVaciarArmado(true);
                  return;
                }
                setVaciarArmado(false);
                void vaciar();
              }}
              disabled={!hayCola || corriendo}
              aria-label={
                vaciarArmado ? "Confirmar vaciar toda la cola" : "Vaciar toda la cola"
              }
              className={`min-h-[44px] px-3 rounded-xl border font-mono text-[10px] md:text-[11px] font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                vaciarArmado
                  ? "border-red-500 text-red-400 bg-red-500/20 animate-pulse"
                  : "border-slate-800 bg-[#10161f] text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              {vaciarArmado ? "¿SEGURO?" : "VACIAR"}
            </button>

            {/* D33 — KIT e14-reiniciar-envios-v1: reset COMPLETO (cola + ledger
                de enviadas). El VACIAR de arriba respeta el ledger POR DISEÑO
                (RL-e65b-5) — este es el corte explícito que pidió el dueño
                para re-probar el MISMO lote y medir. 2 toques — nunca
                accidental; disabled si la cola corre (doble guard en store). */}
            <button
              type="button"
              onClick={() => {
                if (!resetArmado) {
                  setResetArmado(true);
                  return;
                }
                setResetArmado(false);
                void reiniciarEnvios();
              }}
              disabled={corriendo}
              aria-label={
                resetArmado
                  ? "Confirmar reiniciar envíos: borra la cola y el historial de enviadas"
                  : "Reiniciar envíos: borra la cola y el historial de enviadas"
              }
              title="Borra la cola y el historial de enviadas — re-procesa el mismo lote desde cero"
              className={`min-h-[44px] px-3 rounded-xl border font-mono text-[10px] md:text-[11px] font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                resetArmado
                  ? "border-red-500 text-red-400 bg-red-500/20 animate-pulse"
                  : "border-slate-800 bg-[#10161f] text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              {resetArmado ? "¿SEGURO?" : "REINICIAR ENVÍOS"}
            </button>

            {/* KIT e107-prescan-qr-cola-v1 (§D.3): banner del pre-scan —
                hermano visual del chip «Sondeo QR» de e73 (overlay sobre el
                header, SIN mover el layout). fase "boot" → «Preparando
                lector…»; al "fin" desaparece (el % por-fila de la Fase 3 es
                el sistema de siempre — cero trabajo extra). */}
            {prescan.corriendo && (
              <div
                className="absolute right-0 top-full mt-2 z-40 min-w-[230px] rounded-xl border border-[#10b981]/40 bg-[#090d12]/95 px-3.5 py-2 shadow-lg shadow-black/40 backdrop-blur-md"
                role="status"
                aria-live="polite"
                aria-label={
                  prescan.fase === "boot"
                    ? "Preparando lector de códigos QR"
                    : `Sondeando QR: ${prescan.listo} de ${prescan.total}`
                }
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#10b981] whitespace-nowrap">
                  {prescan.fase === "boot"
                    ? "PREPARANDO LECTOR…"
                    : `SONDEANDO QR… ${prescan.listo}/${prescan.total}`}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  {`${prescan.leidos} leídos · los no leídos pasan al OCR`}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- CUERPO DE LA VISTA (SCROLL PRINCIPAL) ---------- */}
      <div className="w-full max-w-6xl mx-auto px-4 py-5 flex flex-col gap-4 pb-24">
        {/* ---------- FALLBACK IDB ---------- */}
        {!colaDisponible && (
          <p
            role="alert"
            className="rounded-xl border border-amber-400/60 bg-amber-400/10 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400"
          >
            TU NAVEGADOR NO SOPORTA LA COLA — IMPORTA DE A UNA EN ESCANEAR
          </p>
        )}
        {colaDisponible && avisoCola && (
          <p
            role="alert"
            className="rounded-xl border border-amber-400/60 bg-amber-400/10 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400"
          >
            {avisoCola}
          </p>
        )}

        {/* ---------- ZONA DE CARGA (input + botón manual + hint) ---------- */}
        <div className="rounded-2xl border-2 border-dashed border-slate-800 bg-[#10161f] hover:border-slate-700 px-4 py-6 text-center transition-all">
          <input
            ref={inputRef}
            id="masiva-archivos"
            type="file"
            multiple
            accept="image/*,.heic,.heif,.zip,.rar,.pdf"
            className="sr-only"
            onChange={(e) => {
              void agregarFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-label="Elegir fotos de actas para la cola"
              className="min-h-[44px] inline-flex items-center gap-2 px-6 rounded-xl bg-[#10b981]/15 border border-[#10b981]/50 font-mono text-xs font-bold uppercase tracking-wider text-[#10b981] hover:bg-[#10b981]/25 transition cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <StitchStackIcon className="w-4 h-4" />
              ELEGIR FOTOS O ARCHIVOS
            </button>
            <p className="font-mono text-[11px] tracking-wider text-slate-400 uppercase mt-1">
              SUELTA ARCHIVOS EN CUALQUIER PARTE DE ESTA PANTALLA
            </p>
            <span className="font-mono text-[9px] text-slate-400 uppercase tracking-widest">
              SOPORTA MÚLTIPLES FOTOS, PDF, ZIP O RAR
            </span>
          </div>

          {guardando > 0 && (
            <p
              className="mt-3 inline-block rounded-full border border-slate-700 bg-slate-800 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300"
              role="status"
              aria-live="polite"
            >
              GUARDANDO {guardando}…
            </p>
          )}

          {/* KIT e73-sondeo-qr-precoz-v1 (§E — deseado): chip del SONDEO QR en
              ingesta — N leídos / M con payload (en vivo, junto al progreso de
              ingesta; SIN tocar la lógica de la cola — SOLO-LECTURA del store). */}
          {sondeadas > 0 && (
            <p
              className="mt-3 inline-block rounded-full border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#10b981]"
              role="status"
              aria-label={`Sondeo QR: ${sondeadas} leídos, ${conPayload} con payload`}
            >
              SONDEO QR {conPayload}/{sondeadas}
            </p>
          )}
        </div>

        {/* ---------- BARRA DE PROGRESO DEL LOTE ---------- */}
        {hayCola && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#10161f] border border-slate-800 px-3.5 py-2.5 shadow-xs">
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300 truncate">
              PROCESANDO {terminadas}/{filas.length}
              {filaActiva && progreso && (
                <span className="text-slate-400 font-medium">
                  {" "}
                  — {filaActiva.nombre} · {etiquetaVida(progreso)}
                </span>
              )}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400 shrink-0">
              {corriendo ? "COLA ACTIVA" : pendientes > 0 ? `${pendientes} EN COLA` : "COLA QUIETA"}
            </p>
          </div>
        )}

        {/* Aviso HEIC */}
        {filaActiva && /\.(heic|heif)$/i.test(filaActiva.nombre) && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-xl border border-amber-400/60 bg-amber-400/10 px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400"
          >
            CONVIRTIENDO HEIC… LA CONVERSIÓN PUEDE TARDAR UNOS SEGUNDOS
          </p>
        )}

        {/* ---------- BANDEJA: FILTROS + LOTE ---------- */}
        {hayCola && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por estado">
            {FILTROS.map(({ valor, label }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                aria-pressed={filtro === valor}
                className={`min-h-[44px] px-3 py-1 rounded-full border font-mono text-[10px] font-bold uppercase tracking-wider transition ${
                  filtro === valor
                    ? "border-[#10b981] text-[#10b981] bg-[#10b981]/15"
                    : "border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-slate-400"
              aria-label={`Conteos: ${enviadas} enviadas, ${enCola} en cola, ${pendientes} pendientes, ${duplicadas} duplicadas, ${yaEnviadas} ya enviadas, ${errores} errores`}
            >
              ENVIADAS {enviadas} · EN COLA {enCola} · PENDIENTES {pendientes}
              {duplicadas > 0 && <> · DUPLICADAS {duplicadas}</>}
              {yaEnviadas > 0 && <> · YA ENVIADAS {yaEnviadas}</>} · ERRORES {errores}
            </span>
            {(advertenciasPend > 0 || enviandoLote) && !corriendo && (
              <button
                type="button"
                disabled={enviandoLote}
                onClick={() => void enviarLote("ADVERTENCIA")}
                aria-label={`Enviar ${advertenciasPend} actas con advertencia`}
                className="ml-auto min-h-[44px] px-3.5 rounded-full border border-amber-400/60 text-amber-400 bg-amber-400/10 font-mono text-[10px] font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {enviandoLote ? "ENVIANDO…" : `ENVIAR ADVERTENCIAS (${advertenciasPend})`}
              </button>
            )}
          </div>
        )}

        {/* ---------- D34 — INFORME DE CARGA (se oculta solo sin datos) ---------- */}
        <InformeCorrida />

        {/* ---------- BANDEJA: FILAS (SIN RESTRICCIÓN RÍGIDA DE ALTURA PARA SCROLL FLUIDO) ---------- */}
        {hayCola && (
          <ul className="flex flex-col gap-2 pr-1" aria-label="Bandeja de resultados">
            {visiblesOrdenadas.map((f) => (
              <FilaMasivaVista
                key={f.id}
                f={f}
                progreso={progreso}
                colaVida={colaVida}
                recienListas={recienListas}
                filas={filas}
                procesarIgual={procesarIgual}
                abrirActa={abrirActa}
                reintentar={reintentar}
                quitar={quitar}
              />
            ))}
            {visibles.length === 0 && (
              <li className="rounded-xl border border-brand-borderdim bg-brand-surface/40 px-3 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-gray-400">
                SIN FILAS CON ESE FILTRO
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ── D27 — modal de revisión (ABRIR) + publicación en el monitor ── */}
      <ModalRevisor
        acta={revisorAbierto ? actaAbierta : null}
        publicacion={publicacionAbierta}
        onVerEnMonitor={onVerEnMonitor}
        onCerrar={cerrarRevisor}
      />
    </section>
  );
}
