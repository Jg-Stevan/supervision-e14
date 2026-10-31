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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
// KIT visor-masiva-redesign-v1: lote DEMO (6 fotos REALES del dueño) — entra
// por agregarFiles (misma puerta de siempre, pipeline completo sin atajos).
import { fetchActasDemo } from "@/modules/digitalizador/lib/e14/actas-demo";
// Traza de la siembra demo (mismo logger del módulo — D51 formato congelado).
import { logger } from "@/modules/digitalizador/lib/logger";
// KIT visor-masiva-redesign-v1 — MOSTRAR ORIGINAL: el acta ENVIADA duerme su
// foto original fuera (cleanup §3 de e68), pero el REGISTRO conserva el
// archivo original (lo consume REINTENTAR/PROCESAR IGUAL) — el visor lo
// materializa on-demand para alternar procesada ↔ cruda.
import { leerRegistro } from "@/modules/digitalizador/lib/e14/masiva/cola";
// D34 — KIT e14-metricas-corrida-v1: informe de comportamiento de la carga
// (corrida viva + historial + export JSON) — datos reales para diagnosticar.
import InformeCorrida from "../InformeCorrida";
// R6 — SPLIT move-only (reporte 03b M-2): helpers/píldoras puras ahora viven
// en masiva/helpers.tsx (verbatim — sin cambio de lógica).
import { esDuplicada } from "./helpers";
// R6 — SPLIT move-only: los bloques de la vista ahora viven en masiva/*
// (fila, bandeja, progreso, dropzone) — verbatim, sin cambio de lógica.
import { BandejaFiltros, BandejaFilas } from "./bandeja";
import { ProgresoLote } from "./progreso-lote";
import { OverlayDragGlobal, ZonaCarga } from "./dropzone";
// KIT carga-masiva-redesign-v1 (diseño «CARGA MASIVA»): barra del módulo con
// métricas de sesión + sidebar (motor OCR + informe/telemetría).
import { BarraLote } from "./barra-lote";
import { MotorOcr } from "./motor-ocr";
import { InformeLote } from "./informe-lote";
import { fmtVelocidad, useMetricasLote } from "./metricas-vista";
// R6 — SPLIT move-only: modal de revisión (con editor) vive en masiva/
// (verbatim — sin cambio de lógica); PublicacionChip lo consume el modal.
import { ModalRevisor } from "./modal-revisor";

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
    // KIT aceptar-revision-masiva-v1 — ACEPTAR ACTA del modal (diseño 3):
    // envío real de la fila abierta con la maquinaria del lote.
    enviarActaAbierta,
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

  // ── KIT visor-masiva-redesign-v1 — NAVEGACIÓN ENTRE IMÁGENES PROCESADAS ──
  // Los chevrons del visor recorren las filas LISTAS de la bandeja (las
  // imágenes que ya tienen desenlace, en su orden). Cada salto persiste el
  // acta abierta (sincronizarAlVolver — misma plomería del cierre) y carga
  // la vecina por la puerta de ABRIR (abrirActa: auto-pausa + IDB).
  // NOTA de identidad (fix auditoría 2-c C4 del store): la fila vive en
  // espacio "masiva-*" y el acta en "acta-*" — la fila abierta ACTUAL se
  // resuelve con origenAbierto (el store la estampa en ABRIR), JAMÁS
  // comparando actaAbierta.id contra ids de fila.
  const origenAbierto = useMasivaStore((s) => s.origenAbierto);
  const idsNavegables = useMemo(
    () => filas.filter((f) => f.estado === "LISTA").map((f) => f.id),
    [filas],
  );
  const posNavegacion = useMemo(() => {
    if (!origenAbierto) return null;
    const idx = idsNavegables.indexOf(origenAbierto);
    return idx >= 0
      ? { index: idx + 1, total: idsNavegables.length }
      : null;
  }, [idsNavegables, origenAbierto]);
  const navegarActa = useCallback(
    async (direccion: -1 | 1) => {
      if (!origenAbierto) return;
      const idx = idsNavegables.indexOf(origenAbierto);
      if (idx < 0) return;
      const destino = idsNavegables[idx + direccion];
      if (!destino) return;
      await sincronizarAlVolver();
      await abrirActa(destino);
    },
    [origenAbierto, idsNavegables, sincronizarAlVolver, abrirActa],
  );

  // MOSTRAR ORIGINAL — materialización on-demand del archivo ORIGINAL del
  // registro (Blob/File que duerme en IDB — el mismo que consume REINTENTAR).
  // Solo-lectura: no toca el acta ni el registro (jamás re-persiste).
  // NOTA de identidad: el modal pregunta por el acta ABIERTA — el registro
  // se resuelve con origenAbierto (espacio "masiva-*"; el acta vive en
  // "acta-*" — prefijos distintos, jamás comparar directo).
  const cargarOriginal = useCallback(async (_actaId: string): Promise<string | null> => {
    try {
      const idRegistro = useMasivaStore.getState().origenAbierto;
      if (!idRegistro) return null;
      const registro = await leerRegistro(idRegistro);
      const archivo = registro.archivo;
      if (!(archivo instanceof Blob)) return null;
      return await new Promise<string | null>((resolve) => {
        const fr = new FileReader();
        fr.onload = () =>
          resolve(typeof fr.result === "string" ? fr.result : null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(archivo);
      });
    } catch {
      return null; // registro ausente/IDB caído → el toggle degrada honesto
    }
  }, []);

  // ── KIT visor-masiva-redesign-v1 — SEMBRADO DEL LOTE DEMO (preview) ──
  // reiniciarEnvios (cola + ledger — mismo corte del dueño) → las 6 fotos
  // REALES entran como Files → pre-scan QR + runner de siempre.
  const [demoSembrando, setDemoSembrando] = useState(false);
  const sembrarDemo = useCallback(async () => {
    if (demoSembrando || corriendo) return;
    setDemoSembrando(true);
    try {
      await reiniciarEnvios();
      const archivos = await fetchActasDemo();
      await agregarFiles(archivos);
      await prescanYIniciar();
    } catch (error) {
      // ingesta fallida — la bandeja queda como está; la traza queda viva
      // (mismo gesto del adaptador: la publicación jamás muere en silencio).
      logger.info(`[e14] demo: siembra falló (${String(error)})`);
    } finally {
      setDemoSembrando(false);
    }
  }, [demoSembrando, corriendo, reiniciarEnvios, agregarFiles]);

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

  // R6 — FIX (reporte 03b §M-2, «~12 filter() por render»): sondeadas,
  // conPayload, pendientes, duplicadas, terminadas, yaEnviadas,
  // advertenciasPend, enviadas, enCola y errores eran 10 filter() + 2 más
  // re-ejecutados en CADA render (la vista re-renderiza por señal de vida,
  // throttle 250 ms). Mismo resultado en UNA pasada memoizada — la
  // dependencia es estrecha: solo cambia cuando cambia `filas`.
  // KIT e73 (§E): sondeadas/conPayload alimentan el chip del sondeo QR.
  const conteos = useMemo(() => {
    let sondeadas = 0;
    let conPayload = 0;
    let pendientes = 0;
    let duplicadas = 0;
    let terminadas = 0;
    let yaEnviadas = 0;
    let advertenciasPend = 0;
    let enviadas = 0;
    let enCola = 0;
    let errores = 0;
    for (const f of filas) {
      if (f.sondeoQrMs != null) sondeadas++;
      if (f.sondeoQrTier != null) conPayload++;
      switch (f.estado) {
        case "PENDIENTE":
          // FIX M13: las temps no cuentan como PENDIENTES (mueren al
          // aterrizar sus ids reales).
          if (!f.id.startsWith("masiva-temp-")) pendientes++;
          break;
        case "DUPLICADA":
          // KIT e14-masiva-tiempos-v1 (PR-1): las DUPLICADAS son cola también
          // (su procesamiento es la copia rápida).
          duplicadas++;
          break;
        case "LISTA":
          terminadas++;
          if (f.statusActa === "ADVERTENCIA") advertenciasPend++;
          // KIT e14-masiva-ux-v1 (T3.4): conteos del encabezado del lote.
          else if (f.statusActa === "ENVIADA") {
            if (f.envioEnCola) enCola++;
            else enviadas++;
          }
          break;
        case "YA-ENVIADA":
          // e65: la YA-ENVIADA está terminada (cero pipeline) — contador
          // T-7 de la línea de resumen.
          terminadas++;
          yaEnviadas++;
          break;
        case "ERROR":
          terminadas++;
          errores++;
          break;
      }
    }
    return {
      sondeadas,
      conPayload,
      pendientes,
      duplicadas,
      terminadas,
      yaEnviadas,
      advertenciasPend,
      enviadas,
      enCola,
      errores,
    };
  }, [filas]);
  const {
    sondeadas,
    conPayload,
    pendientes,
    duplicadas,
    terminadas,
    yaEnviadas,
    advertenciasPend,
    enviadas,
    enCola,
    errores,
  } = conteos;
  const hayCola = filas.length > 0;

  // KIT carga-masiva-redesign-v1 — header del diseño: métricas de la corrida
  // (SESIÓN/DURACIÓN/LATENCIA/LOTE — SOLO-LECTURA de metricas.ts) y TASA DE
  // ÉXITO = enviadas reales sobre terminadas con desenlace (LISTA +
  // YA-ENVIADA + ERROR). null = sin terminadas — la barra no la pinta.
  const metricasLote = useMetricasLote();
  const tasaExito =
    terminadas > 0
      ? Math.round(((enviadas + yaEnviadas) / terminadas) * 100)
      : null;

  const visibles = useMemo(
    () =>
      filtro === "TODAS"
        ? filas
        : filas.filter((f) =>
            filtro === "ERROR" ? f.estado === "ERROR" : f.statusActa === filtro,
          ),
    [filas, filtro],
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

  // R6 — FIX O(n²) (reporte 03b §M-2): `filas.find((f) => f.id === progreso.id)`
  // por render → Map id→fila precalculado.
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const activa = progreso ? (porId.get(progreso.id) ?? null) : null;
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

  // R6 — FIX O(n²) (reporte 03b §M-2): `colaVida.indexOf(f.id)` POR FILA en
  // el render de la bandeja — con un zip de 500 entradas son ~250k
  // comparaciones por señal de vida (throttle 250 ms). Map de posiciones
  // (1-based; PRIMERA aparición — misma semántica que indexOf) precalculado
  // en O(n).
  const posicionesCola = useMemo(() => {
    const pos = new Map<string, number>();
    for (let i = 0; i < colaVida.length; i++) {
      const id = colaVida[i];
      if (!pos.has(id)) pos.set(id, i + 1);
    }
    return pos;
  }, [colaVida]);
  const totalCola = colaVida.length;

  // R6 — FIX O(n²) (reporte 03b §M-2): `filas.find((o) => o.id === f.dupOf)`
  // por fila DUPLICADA en el render → Map id→nombre precalculado.
  const nombrePorId = useMemo(
    () => new Map(filas.map((f) => [f.id, f.nombre])),
    [filas],
  );

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
      className="relative flex flex-1 min-h-0 flex-col overflow-y-auto bg-[#04090b]"
      style={{
        backgroundImage: "radial-gradient(rgba(0, 229, 153, 0.03) 1px, transparent 0)",
        backgroundSize: "32px 32px",
      }}
      aria-label="MASIVA — carga masiva de actas"
    >
      {/* ---------- OVERLAY DRAG & DROP GLOBAL (ESTILO DEEPSEEK) ---------- */}
      {isDraggingGlobal && (
        <OverlayDragGlobal
          dragCounterRef={dragCounterRef}
          setIsDraggingGlobal={setIsDraggingGlobal}
          agregarFiles={agregarFiles}
        />
      )}

      {/* ---------- HEADER DEL MÓDULO (sticky — diseño «CARGA MASIVA»):
          barra con métricas de sesión REALES (corrida de metricas.ts). Los
          BOTONES de acción NO viven aquí: el diseño los manda al SIDEBAR. ---------- */}
      <header className="sticky top-0 z-30 w-full border-b border-[#112b2a]/80 bg-[#04090b]/95 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1360px]">
          <BarraLote
            terminadas={terminadas}
            total={filas.length}
            corriendo={corriendo}
            pendientes={pendientes}
            hayCola={hayCola}
            tasaExito={tasaExito}
            velocidad={fmtVelocidad(metricasLote.latenciaMediaMs)}
            gama={gama}
            metricas={metricasLote}
          />
        </div>
      </header>

      {/* ---------- CUERPO DE LA VISTA (SCROLL PRINCIPAL) — diseño «CARGA
          MASIVA»: sidebar de carga/acciones/motor/telemetría (izquierda) +
          cola de resultados (derecha) ---------- */}
      <div className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-4 pb-24">
        {/* ---------- FALLBACK IDB ---------- */}
        {!colaDisponible && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-amber-400/60 bg-amber-400/10 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400"
          >
            TU NAVEGADOR NO SOPORTA LA COLA — IMPORTA DE A UNA EN ESCANEAR
          </p>
        )}
        {colaDisponible && avisoCola && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-amber-400/60 bg-amber-400/10 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400"
          >
            {avisoCola}
          </p>
        )}

        <div className="flex w-full flex-col items-start gap-4 pt-1 lg:flex-row">
          {/* ───── SIDEBAR (diseño: ELEGIR FOTOS + PROCESAR COLA + VACIAR/
                  REINICIAR + MOTOR OCR + INFORME & TELEMETRÍA) ───── */}
          <aside
            className="glow-border-emerald flex w-full shrink-0 flex-col gap-3 rounded-lg border border-[#112b2a] bg-gradient-to-b from-[#061214] to-[#040c0e] p-4 lg:w-[268px]"
            aria-label="Carga y acciones de la cola"
          >
            {/* ---------- ZONA DE CARGA (input + botón manual + hint) ---------- */}
            <ZonaCarga
              inputRef={inputRef}
              agregarFiles={agregarFiles}
              guardando={guardando}
              sondeadas={sondeadas}
              conPayload={conPayload}
            />

            {/* ---------- ACCIONES DE LA COLA (lógica intacta — llegada al
                    sidebar por diseño) ---------- */}
            {corriendo ? (
              <button
                type="button"
                onClick={pausar}
                aria-label="Pausar la cola"
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/15 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/25 active:scale-[0.98]"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
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
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded border border-[#00e599]/40 bg-[#0a3a32] font-mono text-[11px] font-black uppercase tracking-wider text-[#00e599] shadow-[0_0_12px_rgba(0,229,153,0.15)] transition hover:bg-[#0c2f29] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <span
                  className="h-2 w-2 rounded-full border border-[#00e599] bg-black"
                  aria-hidden
                />
                PROCESAR COLA
                {pendientes + duplicadas > 0 && (
                  <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-extrabold">
                    {pendientes + duplicadas}
                  </span>
                )}
              </button>
            )}

            <div className="grid w-full grid-cols-2 gap-2">
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
                className={`min-h-[40px] rounded border px-2 font-mono text-[10px] font-bold uppercase tracking-wider transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                  vaciarArmado
                    ? "animate-pulse border-red-500 bg-red-500/20 text-red-400"
                    : "border-[#112b2a] bg-[#071214] text-gray-400 hover:border-[#1b3f3e] hover:bg-[#0b191c] hover:text-white"
                }`}
              >
                {vaciarArmado ? "¿SEGURO?" : "VACIAR"}
              </button>

              {/* D33 — KIT e14-reiniciar-envios-v1: reset COMPLETO (cola +
                  ledger de enviadas). El VACIAR respeta el ledger POR DISEÑO
                  (RL-e65b-5) — este es el corte explícito para re-probar el
                  MISMO lote y medir. 2 toques — nunca accidental. */}
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
                className={`min-h-[40px] truncate rounded border px-2 font-mono text-[10px] font-bold uppercase tracking-wider transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                  resetArmado
                    ? "animate-pulse border-red-500 bg-red-500/20 text-red-400"
                    : "border-[#112b2a] bg-[#071214] text-gray-400 hover:border-[#1b3f3e] hover:bg-[#0b191c] hover:text-white"
                }`}
              >
                {resetArmado ? "¿SEGURO?" : "REINICIAR"}
              </button>
            </div>

            {/* KIT visor-masiva-redesign-v1 — botón DEMO del preview: siembra
                el lote real del dueño (6 fotos) y arranca el pipeline. */}
            <button
              type="button"
              onClick={() => void sembrarDemo()}
              disabled={demoSembrando || corriendo}
              aria-label="Sembrar el lote demo de 6 fotos reales y procesarlo"
              title="Siembra el lote demo (6 fotos reales) y procesa la cola"
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {demoSembrando ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
              ) : (
                <span className="h-2 w-2 rounded-full border border-amber-400" aria-hidden />
              )}
              {demoSembrando ? "SEMBRANDO…" : "DEMO ×6"}
            </button>

            {/* KIT e107-prescan-qr-cola-v1 (§D.3): banner del pre-scan —
                fase "boot" → «Preparando lector…»; al "fin" desaparece (el %
                por-fila de la Fase 3 es el sistema de siempre). */}
            {prescan.corriendo && (
              <div
                className="w-full rounded border border-[#00e599]/40 bg-[#04090b]/95 px-3.5 py-2"
                role="status"
                aria-live="polite"
                aria-label={
                  prescan.fase === "boot"
                    ? "Preparando lector de códigos QR"
                    : `Sondeando QR: ${prescan.listo} de ${prescan.total}`
                }
              >
                <p className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-wider text-[#00e599]">
                  {prescan.fase === "boot"
                    ? "PREPARANDO LECTOR…"
                    : `SONDEANDO QR… ${prescan.listo}/${prescan.total}`}
                </p>
                <p className="whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-gray-400">
                  {`${prescan.leidos} leídos · los no leídos pasan al OCR`}
                </p>
              </div>
            )}

            {/* ---------- MOTOR OCR (diseño — selector REAL tess best/pp) ---------- */}
            <MotorOcr />

            {/* ---------- INFORME & TELEMETRÍA (diseño — datos reales) ---------- */}
            <InformeLote
              metricas={metricasLote}
              enviadas={enviadas + yaEnviadas}
              enCola={enCola}
            />
          </aside>

          {/* ───── COLUMNA DERECHA: cola de resultados (filtros + filas +
                  informe de corrida) ───── */}
          <div className="min-w-0 w-full flex-1 space-y-3">
            {/* ---------- BARRA DE PROGRESO DEL LOTE + AVISO HEIC (fila activa) ---------- */}
            <ProgresoLote
              hayCola={hayCola}
              terminadas={terminadas}
              total={filas.length}
              filaActiva={filaActiva}
              progreso={progreso}
              corriendo={corriendo}
              pendientes={pendientes}
            />

            {/* ---------- BANDEJA: FILTROS + LOTE ---------- */}
            {hayCola && (
              <BandejaFiltros
                filtro={filtro}
                setFiltro={setFiltro}
                enviadas={enviadas}
                enCola={enCola}
                pendientes={pendientes}
                duplicadas={duplicadas}
                yaEnviadas={yaEnviadas}
                errores={errores}
                advertenciasPend={advertenciasPend}
                enviandoLote={enviandoLote}
                corriendo={corriendo}
                enviarLote={enviarLote}
              />
            )}

            {/* ---------- BANDEJA: FILAS (SIN RESTRICCIÓN RÍGIDA DE ALTURA PARA SCROLL FLUIDO) ---------- */}
            {hayCola && (
              <BandejaFilas
                visibles={visibles}
                visiblesOrdenadas={visiblesOrdenadas}
                progreso={progreso}
                posicionesCola={posicionesCola}
                totalCola={totalCola}
                nombrePorId={nombrePorId}
                recienListas={recienListas}
                msPorFila={metricasLote.msPorFila}
                procesarIgual={procesarIgual}
                abrirActa={abrirActa}
                reintentar={reintentar}
                quitar={quitar}
              />
            )}

            {/* ---------- D34 — INFORME DE CARGA (se oculta solo sin datos) ---------- */}
            <InformeCorrida />
          </div>
        </div>
      </div>

      {/* ── D27 — modal de revisión (ABRIR) + publicación en el monitor ── */}
      <ModalRevisor
        acta={revisorAbierto ? actaAbierta : null}
        publicacion={publicacionAbierta}
        onVerEnMonitor={onVerEnMonitor}
        onCerrar={cerrarRevisor}
        posNavegacion={posNavegacion}
        onNavegar={(d) => void navegarActa(d)}
        cargarOriginal={cargarOriginal}
        onAceptar={() => enviarActaAbierta()}
      />
    </section>
  );
}
