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
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  cerrarActaMasiva,
  joinDeActa,
  useE14Store,
  type PublicacionActa,
} from "@/modules/digitalizador/store/store-e14";
import {
  refrescarEnviosTrasDrenaje,
  useMasivaStore,
  type EtapaVidaKit,
  type FiltroMasiva,
} from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import { rapidOcrPrecalentar } from "@/modules/digitalizador/lib/e14/ocr/rapidocr";
// KIT e107-prescan-qr-cola-v1 (§D.3): el botón PROCESAR COLA delega en el
// pre-scan QR (fases 1-2 del dueño) y el orquestador llama iniciar() con la
// lista ya filtrada (flag OFF ⇒ iniciar() byte-idéntico — kill-switch).
import { prescanYIniciar, usePrescanQrEstado } from "@/modules/digitalizador/lib/e14/masiva/prescan-qr";
// KIT e14-gama-adaptativa-v1 (D74): chip de gama adaptada — el tier detectado
// consume presupuestos de recursos en BAJO/MEDIO (transparencia del dueño).
import { planGamaActual, refrescarPlanGama, type PlanGama } from "@/modules/digitalizador/lib/e14/gama";
import type { Acta } from "@/modules/digitalizador/lib/e14/types";
// KIT editor-masiva-v1: horneado de ROTAR/RECORTAR por canvas (misma
// disciplina de siempre — canvas puro, dataURL out).
import {
  recortarDataUrl,
  rotateProcessedDataUrl,
} from "@/modules/digitalizador/lib/e14/image-utils";
// KIT visor-gestos-v1 (compartido con el visor del dashboard): zoom con
// rueda del mouse / pellizco táctil / arrastre — primitivo puro de UI.
import {
  VisorZoom,
  type VisorZoomHandle,
} from "@/modules/supervision/components/actas/visor-zoom";
// D34 — KIT e14-metricas-corrida-v1: informe de comportamiento de la carga
// (corrida viva + historial + export JSON) — datos reales para diagnosticar.
import InformeCorrida from "./InformeCorrida";
import {
  CheckIcon,
  LoaderIcon,
  RefreshIcon,
  StitchCropIcon,
  StitchRotateIcon,
  StitchStackIcon,
} from "../icons";

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

/** Píldora de estado de una fila — paleta de estado del repo
 *  (ReviewView L222-225: verde/ámbar/rojo, mono uppercase). */
function pildoraDe(f: FilaMasiva): { label: string; clases: string } {
  switch (f.estado) {
    case "PENDIENTE":
      return { label: "PENDIENTE", clases: "border-brand-borderdim text-gray-400" };
    // KIT e14-masiva-tiempos-v1 (PR-1): gemela por hash — SOLO visual (al
    // procesar reutiliza el resultado de la original; PROCESAR IGUAL fuerza).
    case "DUPLICADA":
      return { label: "DUPLICADA", clases: "border-gray-500/60 text-gray-300 bg-white/5" };
    case "PROCESANDO":
      return { label: "PROCESANDO", clases: "border-brand-borderdim text-gray-200 bg-white/5" };
    case "ERROR":
      return { label: "ERROR", clases: "border-red-500/60 text-red-400 bg-red-500/10" };
    // e65-dedup-enviadas-v1 (T-7, D-e65-2): nació YA-ENVIADA — SOLO-VISUAL
    // (cero OCR, cero envío; PROCESAR IGUAL fuerza el reproceso completo).
    case "YA-ENVIADA":
      return { label: "YA ENVIADA", clases: "border-emerald-500/60 text-emerald-300 bg-emerald-500/10" };
    case "LISTA": {
      const s = f.statusActa;
      if (s === "ENVIADA") {
        // KIT e14-masiva-ux-v1 (T3.3): la fila DISTINGUE envío real vs en
        // cola por offline, y auto vs manual. Paleta de estado del repo.
        if (f.envioEnCola)
          return { label: "EN COLA", clases: "border-amber-400/60 text-amber-400 bg-amber-400/10" };
        return f.enviadaAuto
          ? { label: "ENVIADA AUTO", clases: "border-brand-green/60 text-brand-green bg-brand-green/10" }
          : { label: "ENVIADA", clases: "border-brand-green/60 text-brand-green bg-brand-green/10" };
      }
      if (s === "OPTIMA")
        return { label: "ÓPTIMA", clases: "border-brand-green/60 text-brand-green" };
      if (s === "ADVERTENCIA")
        return { label: "ADVERTENCIA", clases: "border-amber-400/60 text-amber-400 bg-amber-400/10" };
      if (s === "RECHAZADA")
        return { label: "RECHAZADA", clases: "border-red-500/60 text-red-400 bg-red-500/10" };
      if (s === "EN_REVISION_HUMANA")
        return { label: "REVISIÓN HUMANA", clases: "border-amber-400/60 text-amber-400" };
      // e66 (P2): la gemela confirmada ya NO hereda ENVIADA/OPTIMA — su
      // desenlace es DUPLICADA (el envío real vive SOLO en la original).
      // El fondo azul de la FILA lo pinta esDuplicada (kit e64v, intacto).
      if (s === "DUPLICADA")
        return { label: "DUPLICADA", clases: "border-blue-400/60 text-blue-300 bg-blue-950/40" };
      return { label: "LISTA", clases: "border-brand-borderdim text-gray-400" };
    }
  }
}

/** KIT e64v — UNA sola definición de «duplicada» (compartida por el color
 *  azul y el orden de la bandeja — kit §3): la fila heredó desenlace de
 *  otra vía la maquinaria reutilizarResultado — referencia al original
 *  (`dupOf`) PRESENTE y desenlace heredado YA CONFIRMADO (estado final
 *  LISTA con statusActa). Una dup APLAZADA (estado DUPLICADA, original
 *  en vuelo) aún no confirmó → JAMÁS azul (kit §1). Tokens sin-match o
 *  ausentes no llegan aquí: sin dupOf la fila es ORIGINAL por definición
 *  (el token `dedup` vive solo en RegistroMasiva — no en la fila liviana). */
function esDuplicada(f: FilaMasiva): boolean {
  return f.dupOf != null && f.estado === "LISTA" && f.statusActa != null;
}

/** KIT e64v — etiqueta del chip azul: refleja el DESENLACE HEREDADO (jamás
 *  inventa — kit §1): ENVIADA real → texto exacto «Ya enviada»; cualquier
 *  otro desenlace → la etiqueta del estado ACTUAL (misma píldora, misma
 *  fuente de verdad). EN COLA (ENVIADA con envío offline pendiente) NO es
 *  «ya enviada» — honestidad del repo (jamás inventar). */
function etiquetaDupDe(f: FilaMasiva): string {
  if (f.statusActa === "ENVIADA" && !f.envioEnCola) return "Ya enviada";
  return pildoraDe(f).label;
}

const FILTROS: { valor: FiltroMasiva; label: string }[] = [
  { valor: "TODAS", label: "TODAS" },
  { valor: "OPTIMA", label: "ÓPTIMA" },
  { valor: "ADVERTENCIA", label: "ADVERTENCIA" },
  { valor: "RECHAZADA", label: "RECHAZADA" },
  { valor: "EN_REVISION_HUMANA", label: "EN RH" },
  { valor: "ERROR", label: "ERROR" },
];

/** Etiqueta de vida de la fila activa: FASE + el % ÚNICO del proceso
 *  COMPLETO del acta (cambio pedido por el dueño: UN solo % por acta que
 *  NO se reinicia entre fases — antes cada fase tenía su número y el OCR
 *  escalonado con 2 pasadas lo hacía retroceder 95→50→95). El % viene del
 *  runner (`fracGlobal`, monotónico); la fase es solo contexto. */
function etiquetaVida(p: { etapa: EtapaVidaKit; fracGlobal?: number }): string {
  const pct =
    p.fracGlobal != null
      ? `${Math.min(99, Math.max(0, Math.round(p.fracGlobal * 100)))}%`
      : "…";
  switch (p.etapa) {
    case "preparando":
      return `PREPARANDO · ${pct}`;
    case "deteccion":
      return `DETECCIÓN · ${pct}`;
    case "verificacion":
      return `VERIFICANDO · ${pct}`;
    case "ocr":
      return `OCR · ${pct}`;
  }
}

/** % ÚNICO del PROCESO COMPLETO del acta (0% a 100%) — pedido del dueño:
 *  un solo número por acta, sin reinicios por fase. `fracGlobal` lo computa
 *  el runner (monotónico, todas las fases sumadas). LISTA = 100 · ERROR = 0 ·
 *  fila PROCESANDO sin señal viva (zombi de recarga) = 20 como hoy. */
function porcentajeProcesoActa(
  f: FilaMasiva,
  esActiva: boolean,
  progreso: { fracGlobal?: number } | null,
): number {
  if (f.estado === "LISTA") return 100;
  if (f.estado === "ERROR") return 0;
  if (!esActiva) return f.estado === "PROCESANDO" ? 20 : 0;
  if (progreso?.fracGlobal != null) {
    return Math.min(99, Math.max(1, Math.round(progreso.fracGlobal * 100)));
  }
  return 20;
}

// ─── KIT carga-masiva-supervision-v1 (D27) — MODAL DE REVISIÓN ──────────────
// ABRIR de la bandeja: aquí no existe la vista REVISIÓN del digitalizador
// individual (vive en su propio repo) — la revisión es un modal propio que
// muestra la foto procesada, los datos reconocidos y el desenlace de la
// publicación en el monitor (VER EN MONITOR cuando aterrizó en el catálogo).

function pildoraEstadoActa(acta: Acta): { label: string; clases: string } {
  switch (acta.status) {
    case "ENVIADA":
      return { label: "ENVIADA", clases: "border-emerald-500/60 text-emerald-300 bg-emerald-500/10" };
    case "OPTIMA":
      return { label: "ÓPTIMA", clases: "border-emerald-500/60 text-emerald-300" };
    case "ADVERTENCIA":
      return { label: "ADVERTENCIA", clases: "border-amber-400/60 text-amber-400 bg-amber-400/10" };
    case "RECHAZADA":
      return { label: "RECHAZADA", clases: "border-red-500/60 text-red-400 bg-red-500/10" };
    case "EN_REVISION_HUMANA":
      return { label: "REVISIÓN HUMANA", clases: "border-amber-400/60 text-amber-400" };
    case "DUPLICADA":
      return { label: "DUPLICADA", clases: "border-blue-400/60 text-blue-300 bg-blue-950/40" };
  }
}

function filaInfo(etiqueta: string, valor: string): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-slate-800 bg-[#090d12] px-2.5 py-2">
      <span className="font-mono text-[8px] uppercase tracking-widest text-slate-500">
        {etiqueta}
      </span>
      <span
        className="truncate font-mono text-[11px] font-bold uppercase tracking-wider text-slate-200"
        title={valor}
      >
        {valor}
      </span>
    </div>
  );
}

/** Desenlace de la publicación en el monitor (D27) — honestidad ante todo:
 * publicada · cuarentena D25 · sin join (sin clasificación AUTO) · en vuelo. */
function PublicacionChip({ publicacion }: { publicacion?: PublicacionActa }) {
  if (!publicacion) return null;
  if (publicacion.estado === "publicando") {
    return (
      <p
        className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400"
        role="status"
        aria-live="polite"
      >
        PUBLICANDO EN EL MONITOR…
      </p>
    );
  }
  if (publicacion.estado === "publicada") {
    return (
      <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
        PUBLICADA EN EL MONITOR · {publicacion.clave}
      </p>
    );
  }
  if (publicacion.estado === "bloqueada") {
    return (
      <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
        CUARENTENA (D25) — {publicacion.motivo ?? "validación fallida"}
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-slate-800 bg-[#090d12] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
      SIN PUBLICAR EN EL MONITOR — SOLO REGISTRO LOCAL (SIN CLASIFICACIÓN AUTO)
    </p>
  );
}

// ─── KIT editor-masiva-v1 — MODAL DE REVISIÓN CON EDITOR ────────────────────
// ABRIR de la bandeja: modal propio del módulo (D27) + EDITOR para las actas
// SIN envío automático (pedido del dueño): RECORTAR (arrastre sobre la foto,
// horneado por canvas) y ROTAR (90° por toque) — las que SÍ se enviaron auto
// solo mejoran su VISOR: zoom con la rueda del mouse / pellizco con los
// dedos / arrastre (VisorZoom del dashboard — mismo primitivo, misma UX).
// Persistencia: editarActaActual parchea el acta abierta en vivo; al cerrar,
// sincronizarAlVolver (store masiva) re-persiste en IDB + thumb fresco + fila.

/** Rectángulo de recorte en % del área de la foto (0–100 — mapea a píxeles
 * naturales al aplicar; el drag llega saneado y el clamp lo respalda). */
interface RectPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mínimo % en CADA eje para habilitar APLICAR (evita recortes absurdos). */
const RECT_MIN_PCT = 3;

function ModalRevisor({
  acta,
  publicacion,
  onVerEnMonitor,
  onCerrar,
}: {
  acta: Acta | null;
  publicacion?: PublicacionActa;
  onVerEnMonitor?: PropsMasivaView["onVerEnMonitor"];
  onCerrar: () => void;
}) {
  useEffect(() => {
    if (!acta) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [acta, onCerrar]);

  // ── Editor (estado local del modal — el acta vive en useE14Store) ──────
  const foto = acta?.fotoProcesada ?? acta?.fotoOriginal ?? null;
  const editable = Boolean(acta && !acta.enviadoAutomaticamente && foto);
  const [editandoRecorte, setEditandoRecorte] = useState(false);
  const [rect, setRect] = useState<RectPct | null>(null);
  const [ocupado, setOcupado] = useState<null | "rotando" | "recortando">(null);
  const [editada, setEditada] = useState(false);
  const fotoPreEdicionRef = useRef<string | null>(null);
  const visorRef = useRef<VisorZoomHandle>(null);
  const zonaRecorteRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ x: number; y: number } | null>(null);

  // Reset del editor al cambiar de acta abierta (abrir otra fila / cerrar).
  useEffect(() => {
    setEditandoRecorte(false);
    setRect(null);
    setOcupado(null);
    setEditada(false);
    fotoPreEdicionRef.current = null;
  }, [acta?.id]);

  /** ROTAR 90° horario — hornea la foto por canvas y parchea el acta. */
  const rotarFoto = async () => {
    if (!acta || !foto || ocupado) return;
    if (!fotoPreEdicionRef.current) fotoPreEdicionRef.current = foto;
    setEditandoRecorte(false);
    setRect(null);
    setOcupado("rotando");
    try {
      const r = await rotateProcessedDataUrl(foto, 90);
      useE14Store.getState().editarActaActual({ fotoProcesada: r.url });
      setEditada(true);
    } catch {
      /* horneado fallido — la foto queda como está (honesto, sin humo) */
    } finally {
      setOcupado(null);
    }
  };

  /** APLICAR recorte — mapea el rect % → píxeles naturales y hornea. */
  const aplicarRecorte = async () => {
    if (!acta || !foto || !rect || ocupado) return;
    const img = zonaRecorteRef.current?.querySelector("img");
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    if (rect.w < RECT_MIN_PCT || rect.h < RECT_MIN_PCT) return;
    const natRect = {
      x: (rect.x / 100) * img.naturalWidth,
      y: (rect.y / 100) * img.naturalHeight,
      w: (rect.w / 100) * img.naturalWidth,
      h: (rect.h / 100) * img.naturalHeight,
    };
    if (!fotoPreEdicionRef.current) fotoPreEdicionRef.current = foto;
    setOcupado("recortando");
    try {
      const r = await recortarDataUrl(foto, natRect);
      useE14Store.getState().editarActaActual({ fotoProcesada: r.url });
      setEditada(true);
      setEditandoRecorte(false);
      setRect(null);
    } catch {
      /* horneado fallido — la foto queda como está (honesto, sin humo) */
    } finally {
      setOcupado(null);
    }
  };

  /** DESHACER — devuelve la foto del momento ANTES de la primera edición. */
  const deshacerEdicion = () => {
    const original = fotoPreEdicionRef.current;
    if (!original || ocupado) return;
    useE14Store.getState().editarActaActual({ fotoProcesada: original });
    setEditada(false);
    fotoPreEdicionRef.current = null;
    setEditandoRecorte(false);
    setRect(null);
  };

  // ── Dibujo del rectángulo de recorte (puntero = mouse o dedo) ──────────
  const pctDePuntero = (e: React.PointerEvent): { x: number; y: number } | null => {
    const zona = zonaRecorteRef.current;
    if (!zona) return null;
    const r = zona.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const onRecorteDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (ocupado) return;
    const p = pctDePuntero(e);
    if (!p) return;
    // Captura fail-safe (pointerIds sintéticos/automation pueden fallar —
    // el gesto de recorte jamás se aborta por eso).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura el arrastre sigue dentro del overlay — suficiente */
    }
    arrastreRef.current = p;
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onRecorteMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const inicio = arrastreRef.current;
    if (!inicio) return;
    const p = pctDePuntero(e);
    if (!p) return;
    setRect({
      x: Math.min(inicio.x, p.x),
      y: Math.min(inicio.y, p.y),
      w: Math.abs(p.x - inicio.x),
      h: Math.abs(p.y - inicio.y),
    });
  };
  const onRecorteUp = () => {
    arrastreRef.current = null;
  };

  if (!acta) return null;
  const join = joinDeActa(acta);
  const pildora = pildoraEstadoActa(acta);
  const ubic = acta.ubicacion;
  const rectValido = Boolean(rect && rect.w >= RECT_MIN_PCT && rect.h >= RECT_MIN_PCT);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Revisión de acta ${acta.titulo}`}
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#10161f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-mono text-xs font-black uppercase tracking-wider text-white">
              REVISIÓN DE ACTA
            </h2>
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {acta.titulo}
            </p>
          </div>
          {editada && (
            <span className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-400">
              EDITADA
            </span>
          )}
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${pildora.clases}`}
          >
            {pildora.label}
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar revisión del acta"
            className="min-h-[44px] min-w-[44px] rounded-lg font-mono text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {foto ? (
            editandoRecorte ? (
              /* MODO RECORTAR — foto estática (sin zoom): el arrastre dibuja
                 el área; el mapeo % → píxeles naturales queda 1:1. */
              <div className="flex flex-col gap-2">
                <div
                  ref={zonaRecorteRef}
                  className="relative mx-auto max-w-full overflow-hidden rounded-xl border-2 border-dashed border-[#10b981]/70 bg-white"
                >
                  <img
                    src={foto}
                    alt={`Foto del acta ${acta.titulo} — marcando área de recorte`}
                    className="block max-h-[44vh] max-w-full select-none"
                    draggable={false}
                  />
                  {/* Overlay de arrastre — cubre EXACTAMENTE la foto (el
                      wrapper la abraza; touch-none: el dedo dibuja, no hace
                      scroll). pointer-events auto solo aquí. */}
                  <div
                    className="absolute inset-0 cursor-crosshair touch-none"
                    onPointerDown={onRecorteDown}
                    onPointerMove={onRecorteMove}
                    onPointerUp={onRecorteUp}
                    onPointerCancel={onRecorteUp}
                    aria-hidden
                  />
                  {rect && rect.w > 0.5 && rect.h > 0.5 && (
                    <div
                      className="pointer-events-none absolute border-2 border-dashed border-[#10b981]"
                      style={{
                        left: `${rect.x}%`,
                        top: `${rect.y}%`,
                        width: `${rect.w}%`,
                        height: `${rect.h}%`,
                        boxShadow: "0 0 0 9999px rgba(5, 10, 15, 0.62)",
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {rectValido
                      ? "ÁREA MARCADA — APLICAR PARA RECORTAR"
                      : "ARRASTRA SOBRE LA FOTO PARA MARCAR EL ÁREA"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoRecorte(false);
                        setRect(null);
                      }}
                      disabled={!!ocupado}
                      className="min-h-[44px] rounded-xl border border-slate-800 bg-[#090d12] px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-40"
                    >
                      CANCELAR
                    </button>
                    <button
                      type="button"
                      onClick={() => void aplicarRecorte()}
                      disabled={!rectValido || !!ocupado}
                      className="min-h-[44px] rounded-xl bg-[#10b981] px-3.5 font-mono text-[10px] font-black uppercase tracking-wider text-[#090d12] shadow-md shadow-[#10b981]/25 transition hover:bg-[#059669] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
                    >
                      {ocupado === "recortando" ? "RECORTANDO…" : "APLICAR"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* VISOR — KIT visor-gestos-v1: zoom con la RUEDA del mouse
                 (ancla en el cursor), PELLIZCO con 2 dedos, arrastre para
                 mover y doble clic/toque (ajustar ↔ acercar). fitKey = la
                 foto: tras rotar/recortar re-ajusta sola. */
              <div className="relative h-[44vh] shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-[#0a0e13] sm:h-[52vh]">
                <VisorZoom
                  ref={visorRef}
                  fitKey={foto}
                  ariaLabel="Foto del acta — zoom con la rueda del mouse o pellizco con los dedos"
                  className="h-full w-full"
                >
                  <img
                    src={foto}
                    alt={`Foto procesada del acta ${acta.titulo}`}
                    draggable={false}
                    onLoad={() => visorRef.current?.ajustar()}
                    className="block max-h-[50vh] max-w-[76vw] select-none rounded-xl border border-slate-800 bg-white sm:max-w-[46vw]"
                  />
                </VisorZoom>
                <p className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
                  <span className="rounded-full border border-slate-800 bg-[#090d12]/90 px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-slate-400 backdrop-blur">
                    ZOOM: RUEDA DEL MOUSE O PELLIZCO · MOVER: ARRASTRA · DOBLE TOQUE: AJUSTAR
                  </span>
                </p>
              </div>
            )
          ) : (
            <p className="rounded-lg border border-slate-800 bg-[#090d12] px-3 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-slate-400">
              SIN FOTO PROCESADA EN MEMORIA
            </p>
          )}

          {/* EDITOR — SOLO actas sin envío automático (pedido del dueño):
              recortar y rotar la foto; las enviadas auto van tal cual. */}
          {editable && !editandoRecorte && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-[#090d12] px-2.5 py-2">
              <span className="mr-auto font-mono text-[9px] uppercase tracking-widest text-slate-500">
                {ocupado
                  ? "PROCESANDO EDICIÓN…"
                  : "EDITAR FOTO (SIN ENVÍO AUTOMÁTICO)"}
              </span>
              {ocupado && (
                <span
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#10b981]"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                  {ocupado === "rotando" ? "ROTANDO" : "RECORTANDO"}
                </span>
              )}
              <button
                type="button"
                onClick={() => void rotarFoto()}
                disabled={!!ocupado}
                title="Rotar 90° horario (hornea la foto)"
                aria-label="Rotar la foto 90 grados"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-700 px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-brand-green hover:text-brand-green disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <StitchRotateIcon className="w-3.5 h-3.5" />
                ROTAR
              </button>
              <button
                type="button"
                onClick={() => {
                  setRect(null);
                  setEditandoRecorte(true);
                }}
                disabled={!!ocupado}
                title="Recortar un área de la foto"
                aria-label="Recortar la foto"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-700 px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-brand-green hover:text-brand-green disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <StitchCropIcon className="w-3.5 h-3.5" />
                RECORTAR
              </button>
              {editada && (
                <button
                  type="button"
                  onClick={deshacerEdicion}
                  disabled={!!ocupado}
                  title="Devolver la foto a como estaba antes de editar"
                  aria-label="Deshacer las ediciones de la foto"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-400/50 px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400 transition hover:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  DESHACER
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {ubic?.departamento && filaInfo("DEPARTAMENTO", ubic.departamento)}
            {ubic?.municipio && filaInfo("MUNICIPIO / PAÍS", ubic.municipio)}
            {ubic?.zona && filaInfo("ZONA", ubic.zona)}
            {ubic?.puesto && filaInfo("PUESTO", ubic.puesto)}
            {ubic?.mesa && filaInfo("MESA", ubic.mesa)}
            {acta.tipo && filaInfo("FORMULARIO", acta.tipo)}
            {filaInfo(
              "PÁGINA",
              acta.pagina ? `${acta.pagina.index}/${acta.pagina.total}` : "-/-",
            )}
            {filaInfo("SCORE", `${acta.score.toFixed(1)} / 10`)}
            {filaInfo("INTENTO", `${acta.intento} DE ${acta.maxIntentos}`)}
            {acta.codigoBarras && filaInfo("CÓDIGO", acta.codigoBarras)}
            {join && filaInfo("IDENLACE (D22)", join.idEnlace)}
            {acta.hashSha256 &&
              filaInfo(
                "HASH",
                acta.hashSha256 === "EN COLA"
                  ? "EN COLA"
                  : `${acta.hashSha256.slice(0, 12)}…`,
              )}
          </div>

          {acta.rechazo && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-red-300">
              {acta.rechazo.tipo} — {acta.rechazo.detalle}
            </p>
          )}

          <PublicacionChip publicacion={publicacion} />
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {acta.enviadoAutomaticamente
              ? `ENVIADA AUTO · ${acta.enviadoAutomaticamente}`
              : "SIN ENVÍO AUTOMÁTICO"}
          </p>
          <div className="flex items-center gap-2">
            {publicacion?.estado === "publicada" && join && onVerEnMonitor && (
              <button
                type="button"
                onClick={() => onVerEnMonitor(join.idEnlace, join.mesa, join.tipo)}
                className="min-h-[44px] rounded-xl bg-[#10b981] px-4 font-mono text-[11px] font-black uppercase tracking-wider text-[#090d12] shadow-md shadow-[#10b981]/25 transition hover:bg-[#059669] active:scale-[0.98]"
              >
                VER EN MONITOR
              </button>
            )}
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-[44px] rounded-xl border border-slate-800 bg-[#090d12] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              CERRAR
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
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
            {visiblesOrdenadas.map((f) => {
              const pildora = pildoraDe(f);
              const esActiva = progreso?.id === f.id && f.estado === "PROCESANDO";
              // KIT e64v — Cambio A: gemela CONFIRMADA (desenlace heredado)
              // → fila azul. La dup aplazada aún no confirma → sin azul.
              const esDup = esDuplicada(f);
              // D65 (T3.3) — señal de vida de la fila (barra h-1 discreta):
              const enColaVida = f.estado === "PENDIENTE" || f.estado === "DUPLICADA";
              const posCola = enColaVida ? colaVida.indexOf(f.id) + 1 : 0;
              const pctProceso = porcentajeProcesoActa(f, Boolean(esActiva), progreso);
              // % SOLO si es dato REAL (OCR del reconocedor) — kit T3 honestidad.
              const ocrPct =
                esActiva && progreso?.etapa === "ocr" && progreso.ocrFraccion != null
                  ? Math.min(100, Math.max(0, Math.round(progreso.ocrFraccion * 100)))
                  : null;
              return (
                <li
                  key={f.id}
                  className={`rounded-2xl border px-3.5 py-3 transition-all ${
                    esDup
                      ? // KIT e64v — Cambio A: specs dark del kit (bg/borde azul).
                        // El repo es dark-only (paleta oscura hardcodeada — sin
                        // variante `dark:`): los tokens dark aplican directos.
                        "bg-blue-950/60 border-blue-800 hover:border-blue-700"
                      : `bg-[#10161f] ${
                          esActiva ? "border-[#10b981]/60 ring-1 ring-[#10b981]/60 shadow-md shadow-[#10b981]/10" : "border-slate-800 hover:border-slate-700"
                        }`
                  }`}
                >
                  <div className="flex items-center gap-3">
                  {/* Thumb 40px (o cuadrado pendiente) */}
                  {f.thumb ? (
                    <img
                      src={f.thumb}
                      alt={`Miniatura de ${f.nombre}`}
                      className="w-11 h-11 rounded-xl object-cover bg-[#090d12] border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="w-11 h-11 rounded-xl bg-[#090d12] border border-slate-800 flex items-center justify-center text-slate-500 shrink-0"
                    >
                      <StitchStackIcon className="w-5 h-5" />
                    </div>
                  )}

                  {/* Nombre + estado/motivo */}
                  <div className="min-w-0 flex-1">
                    {/* D59 — KIT e14-info-acta-filas-v1 (T4): línea de título
                        ENCIMA del nombre con la info reconocida del acta
                        (idea del dueño, mockup Stitch corregido — paleta del
                        repo: brand-green mono). Fila sin infoTitulo queda
                        EXACTAMENTE como hoy (cero regresión); null = sin
                        datos → no se pinta nada (jamás inventar). */}
                    {f.infoTitulo && (
                      <p
                        className="font-mono text-[11px] font-bold uppercase tracking-wider text-brand-green truncate"
                        title={f.infoTitulo}
                      >
                        {f.infoTitulo}
                      </p>
                    )}
                    <p
                      className={`font-mono text-[11px] font-bold uppercase truncate ${
                        f.estado === "ERROR" ? "text-red-300" : "text-white"
                      }`}
                    >
                      {f.nombre}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span
                        className={`px-2 py-0.5 rounded-full border font-mono text-[9px] font-bold uppercase tracking-wider ${pildora.clases}`}
                      >
                        {pildora.label}
                      </span>
                      {/* KIT e64v — Cambio A: chip azul de la gemela CONFIRMADA.
                          Etiqueta SIEMPRE visible (el color jamás es el único
                          portador de información — accesibilidad/daltonismo);
                          refleja el desenlace heredado (jamás inventa — kit §1).
                          Convive con QR chip / ≡ original / YA ENVIADA (flex-wrap
                          del contenedor — red line 5). Icono: CheckIcon propio
                          del repo (el icono del kit era opcional y lucide no
                          existe en el repo — sistema de diseño propio manda). */}
                      {esDup && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300 font-mono text-[9px] font-bold tracking-wider"
                          aria-label={`Gemela confirmada — ${etiquetaDupDe(f)}`}
                        >
                          <CheckIcon className="w-3 h-3" strokeWidth={2.5} />
                          {etiquetaDupDe(f)}
                        </span>
                      )}
                      {/* D66 — KIT e14-decode-unico-precalor-v1 (T3.5): mini-señal
                          PREPARADA — la fila PENDIENTE ya tiene master esperando
                          (el precalor trabajó en la espera; D45 intacto: la fila
                          NO procesa sola). Chip pequeñito y nada más — sin % ni
                          promesas. Flag transitorio (muere con la recarga). */}
                      {f.estado === "PENDIENTE" && f.precalentada === true && (
                        <span
                          className="px-1.5 py-0.5 rounded-full border border-brand-green/40 text-brand-green/90 font-mono text-[9px] font-bold uppercase tracking-wider"
                          title="El precalor ya decodificó esta fila (master listo)"
                        >
                          PREPARADA
                        </span>
                      )}
                      {/* e64-qr T-0.2 — chip del estado de la CAPA 0 QR (solo
                          presencia, JAMÁS payload — red line 10). QR ✗ solo en
                          LISTA: en PENDIENTE/PROCESANDO aún no hay veredicto
                          (honestidad del kit). Resuelve la mitad de los
                          reportes «no lee»: el dueño VERÁ cuándo sí leyó. */}
                      {f.qrEstado === "leido" && (
                        <span
                          className="rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-300/90"
                          aria-label="QR leído"
                        >
                          QR ✓
                        </span>
                      )}
                      {f.qrEstado === "sin-payload" && f.estado === "LISTA" && (
                        <span
                          className="rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400"
                          aria-label="QR no decodificado"
                        >
                          QR ✗
                        </span>
                      )}
                      {/* KIT e14-masiva-tiempos-v1 (PR-1): la DUPLICADA señala
                          a su original — transparencia total del dedup. */}
                      {f.estado === "DUPLICADA" && f.dupOf && (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-400 truncate">
                          ≡ {filas.find((o) => o.id === f.dupOf)?.nombre ?? "OTRA FILA"}
                        </span>
                      )}
                      {/* e65-dedup-enviadas-v1 (T-7): chip YA ENVIADA — la
                          fila nació con contenido ya enviado (bytes/dhash);
                          cero OCR, cero envío. JUNTO al chip DUPLICADA. */}
                      {f.estado === "YA-ENVIADA" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/60 text-emerald-300 bg-emerald-500/10">
                          YA ENVIADA
                        </span>
                      )}
                      {f.estado === "ERROR" && f.error && (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-red-400/80 truncate">
                          {f.error}
                        </span>
                      )}
                      {f.motivo && f.statusActa === "RECHAZADA" && (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-red-400/80">
                          {f.motivo}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* % del proceso · score · página · nivel (div:nth-of-type(3)) */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-gray-400">
                    <span
                      className={`font-mono text-[10px] sm:text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1.5 transition-all ${
                        esActiva || f.estado === "PROCESANDO"
                          ? "border-[#10b981]/60 bg-[#10b981]/15 text-[#10b981] shadow-xs"
                          : f.estado === "LISTA"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : f.estado === "ERROR"
                              ? "border-red-500/40 bg-red-500/10 text-red-400"
                              : "border-slate-800 bg-[#090d12] text-slate-400"
                      }`}
                      title={`Progreso del proceso del acta: ${pctProceso}%`}
                    >
                      {(esActiva || f.estado === "PROCESANDO") && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping shrink-0" />
                      )}
                      {pctProceso}%
                    </span>
                    {typeof f.score === "number" && (
                      <span className="text-gray-200 font-bold hidden md:inline" title="Score de calidad">
                        {f.score.toFixed(1)}
                      </span>
                    )}
                    <span className="hidden sm:inline">{f.pagina ?? "-/-"}</span>
                    {f.nivel && (
                      <span
                        className={`hidden sm:inline px-1.5 py-0.5 rounded border ${
                          f.nivel === "AUTO"
                            ? "border-brand-green/50 text-brand-green"
                            : "border-brand-borderdim text-gray-500"
                        }`}
                      >
                        {f.nivel}
                      </span>
                    )}
                  </div>

                  {/* Acciones por fila */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* KIT e14-masiva-tiempos-v1 (PR-1): rescate del kit §2 —
                        reprocesar la gemela COMPLETA por si el dhash la
                        confundió (fotos distintas parecidas en thumb).
                        e65 (T-7): también sobre YA-ENVIADA — ÚNICO escape del
                        dueño para estampar QR/OCR en una fila ya enviada. */}
                    {(f.estado === "DUPLICADA" || f.estado === "YA-ENVIADA") && (
                      <button
                        type="button"
                        onClick={() => void procesarIgual(f.id)}
                        aria-label={`Reprocesar ${f.nombre} completo aunque esté duplicada`}
                        className="min-h-[44px] px-2.5 rounded-lg border border-amber-400/50 text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                      >
                        PROCESAR IGUAL
                      </button>
                    )}
                    {f.estado === "LISTA" && (
                      <button
                        type="button"
                        onClick={() => void abrirActa(f.id)}
                        aria-label={`Abrir ${f.nombre} en revisión`}
                        className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-brand-border text-gray-300 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-brand-green hover:text-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/60"
                      >
                        ABRIR
                      </button>
                    )}
                    {/* D59 — KIT e14-info-acta-filas-v1 (T4): «REINTENTAR» del
                        mockup en filas ERROR — re-encola (PENDIENTE) para que
                        PROCESAR la procese; SIN_ARCHIVO_ORIGINAL si el
                        registro no trae el archivo original (honesto). */}
                    {f.estado === "ERROR" && (
                      <button
                        type="button"
                        onClick={() => void reintentar(f.id)}
                        aria-label={`Reintentar ${f.nombre}: re-encolar para procesar`}
                        className="min-h-[44px] px-2.5 rounded-lg border border-red-500/40 text-red-300 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                      >
                        REINTENTAR
                      </button>
                    )}
                    <button
                      type="button"
                      // FIX (auditoría 2-b #15): QUITAR fuera de la fila en
                      // PROCESO — el desenlace de la foto activa ya está en
                      // vuelo (el runner descarta el resultado de una fila
                      // quitada, pero el botón mentía sobre lo que hace).
                      disabled={f.estado === "PROCESANDO"}
                      onClick={() => void quitar(f.id)}
                      aria-label={`Quitar ${f.nombre} de la cola`}
                      className="min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-red-400 font-mono text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                    >
                      QUITAR
                    </button>
                  </div>
                  </div>

                  {/* D65 (T3.3) — BARRA DE VIDA (h-1, tipografía discreta — no
                      compite con los chips): EN COLA → vacía + «#N de M»;
                      PROCESANDO preparando/detección/verificación → animada
                      SIN número; OCR con fracción REAL → determinada + %;
                      LISTA → 100% verde un instante (transitorio); ERROR →
                      roja. aria-live SOLO en el texto de etapa (los cambios
                      de % van en un hermano sin aria-live — kit T3.5).
                      SPRINT-B (B2): re-cableada del bloque original D65
                      (perdido en el zip 4f9c871 — AUDITORIA-REGRESION
                      #1/#2). Plomería intacta: recienListas/enColaVida/
                      posCola/colaVida + ocrPct (honesto, solo dato real). */}
                  {(enColaVida || esActiva || f.estado === "ERROR" || (f.estado === "LISTA" && recienListas.has(f.id))) && (
                    <div className="mt-2">
                      {esActiva && ocrPct != null ? (
                        <div
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={ocrPct}
                          aria-label={`OCR ${ocrPct}%`}
                          className="h-1 rounded-full bg-white/10 overflow-hidden"
                        >
                          <div className="h-full bg-brand-green" style={{ width: `${ocrPct}%` }} />
                        </div>
                      ) : esActiva ? (
                        <div className="h-1 rounded-full bg-brand-green/40 animate-pulse" aria-hidden />
                      ) : f.estado === "ERROR" ? (
                        <div className="h-1 rounded-full bg-red-500/40" aria-hidden />
                      ) : f.estado === "LISTA" ? (
                        <div className="h-1 rounded-full bg-brand-green" aria-hidden />
                      ) : (
                        <div className="h-1 rounded-full bg-white/5" aria-hidden />
                      )}
                      {(enColaVida || (esActiva && progreso)) && (
                        <p className="mt-1 font-mono text-[11px] tabular-nums tracking-wider text-gray-400 uppercase truncate">
                          <span aria-live="polite">
                            {enColaVida
                              ? `EN COLA #${posCola} DE ${colaVida.length}`
                              : progreso
                                ? etiquetaVida({ etapa: progreso.etapa })
                                : ""}
                          </span>
                          {ocrPct != null && <span> {ocrPct}%</span>}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );

            })}
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
