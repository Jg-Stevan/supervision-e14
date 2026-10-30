"use client";

// ─── KIT carga-masiva-supervision-v1 (D27) — MODAL DE REVISIÓN ──────────────
// ABRIR de la bandeja: aquí no existe la vista REVISIÓN del digitalizador
// individual (vive en su propio repo) — la revisión es un modal propio que
// muestra la foto procesada, los datos reconocidos y el desenlace de la
// publicación en el monitor (VER EN MONITOR cuando aterrizó en el catálogo).
//
// ─── KIT editor-masiva-v1 — MODAL DE REVISIÓN CON EDITOR ────────────────────
// ABRIR de la bandeja: modal propio del módulo (D27) + EDITOR para las actas
// SIN envío automático (pedido del dueño): RECORTAR (arrastre sobre la foto,
// horneado por canvas) y ROTAR (90° por toque) — las que SÍ se enviaron auto
// solo mejoran su VISOR: zoom con la rueda del mouse / pellizco con los
// dedos / arrastre (VisorZoom del dashboard — mismo primitivo, misma UX).
// Persistencia: editarActaActual parchea el acta abierta en vivo; al cerrar,
// sincronizarAlVolver (store masiva) re-persiste en IDB + thumb fresco + fila.
//
// R6: SPLIT move-only de MasivaView.tsx (reporte 03b M-2) — código verbatim.
import { useEffect, useRef, useState } from "react";

import {
  joinDeActa,
  useE14Store,
  type PublicacionActa,
} from "@/modules/digitalizador/store/store-e14";
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
import {
  LoaderIcon,
  RefreshIcon,
  StitchCropIcon,
  StitchRotateIcon,
} from "../../icons";
import { filaInfo, pildoraEstadoActa } from "./helpers";
import { PublicacionChip } from "./publicacion-chip";
import type { PropsMasivaView } from "./orquestador";

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

export function ModalRevisor({
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
