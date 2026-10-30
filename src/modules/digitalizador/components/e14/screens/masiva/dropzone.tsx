"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — DROPZONE (R6: SPLIT move-only de
 * MasivaView.tsx — reporte 03b M-2, verbatim): el overlay GLOBAL de
 * drag & drop (estilo DeepSeek) y la zona de carga manual. Los props
 * conservan los nombres de las variables originales para que el JSX
 * movido quede verbatim.
 */
import type { RefObject } from "react";

import { StitchStackIcon } from "../../icons";

/** Overlay global mientras se arrastran archivos sobre la ventana
 *  (listener global de la vista — el counter de enter/leave vive en el
 *  orquestador y llega por ref). */
export function OverlayDragGlobal({
  dragCounterRef,
  setIsDraggingGlobal,
  agregarFiles,
}: {
  dragCounterRef: RefObject<number>;
  setIsDraggingGlobal: (v: boolean) => void;
  agregarFiles: (files: File[]) => void;
}) {
  return (
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
  );
}

/** Zona de carga manual (input file + botón + chips de guardado/sondeo QR). */
export function ZonaCarga({
  inputRef,
  agregarFiles,
  guardando,
  sondeadas,
  conPayload,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  agregarFiles: (files: File[]) => void;
  guardando: number;
  sondeadas: number;
  conPayload: number;
}) {
  return (
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
  );
}
