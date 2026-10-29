"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModoPanel } from "./tipos-visor";

/**
 * OBSERVACIONES + ACCIONES DEL SUPERVISOR (kit stitch-visor-actas-v1 —
 * diseño Stitch): textarea de motivo + botones según el MODO del panel:
 *
 * - "auditoria"      → REPORTAR ANOMALIA (rojo, AlertTriangle)
 * - "envio-automatico" → RECHAZAR (REESCANEAR) (rojo)
 * - "ingreso-manual"   → ACEPTAR ACTA (verde sólido, texto negro)
 *                        + RECHAZAR (REESCANEAR) (rojo)
 *
 * Validación del motivo (T5.2 adaptada al kit Stitch): obligatorio para
 * RECHAZAR y REPORTAR ANOMALÍA (el motivo es la decisión); OPCIONAL para
 * ACEPTAR — el diseño lo dice: «OPCIONAL SI ES VÁLIDA». Patrón vida-v1:
 * spinner 2.5 s lo maneja el store (accionEnCurso) → toast + efectos.
 */

const NOTA_AUDITORIA = (
  <div className="border-t border-brand-border/40 pt-2 mt-2">
    <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-gray-500">
      <Info className="size-3.5 shrink-0 text-gray-400" aria-hidden />
      <span>ESTA ACCIÓN QUEDARÁ REGISTRADA EN LA AUDITORÍA.</span>
    </div>
  </div>
);

export function PanelDecision({
  modo,
  accionEnCurso,
  onAprobar,
  onRescanear,
  onReportarAnomalia,
  inputId,
}: {
  modo: ModoPanel;
  accionEnCurso: "aprobar" | "rescanear" | "anomalia" | null;
  onAprobar: (observacion: string) => Promise<void>;
  onRescanear: (observacion: string) => Promise<void>;
  onReportarAnomalia: (observacion: string) => Promise<void>;
  /** id único del textarea (por si el panel aparece dos veces — móvil). */
  inputId: string;
}) {
  const [observacion, setObservacion] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const ocupado = accionEnCurso !== null;

  const ejectuar = async (accion: "aprobar" | "rescanear" | "anomalia") => {
    // Motivo OPCIONAL solo al ACEPTAR (acta válida — kit Stitch
    // «opcional si es válida»); obligatorio en rechazo/anomalía.
    const motivoOpcional = accion === "aprobar";
    if (!motivoOpcional && !observacion.trim()) {
      setErrorMotivo(true);
      return;
    }
    setErrorMotivo(false);
    const motivo = observacion.trim();
    if (accion === "aprobar") await onAprobar(motivo);
    else if (accion === "rescanear") await onRescanear(motivo);
    else await onReportarAnomalia(motivo);
    // Acción resuelta: la caja queda limpia para la siguiente decisión.
    setObservacion("");
  };

  const textarea = (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="font-mono text-xs font-bold uppercase tracking-wider text-gray-400"
        >
          OBSERVACIONES
        </label>
        <span className="font-mono text-[10px] uppercase tracking-tight text-gray-500">
          OPCIONAL SI ES VÁLIDA
        </span>
      </div>
      <textarea
        id={inputId}
        value={observacion}
        onChange={(e) => {
          setObservacion(e.target.value);
          if (errorMotivo) setErrorMotivo(false);
        }}
        placeholder="Ingrese el motivo de la decisión..."
        rows={4}
        aria-invalid={errorMotivo || undefined}
        aria-describedby={errorMotivo ? `${inputId}-error` : undefined}
        className={cn(
          "w-full resize-none rounded border bg-[#080d0b] p-3 font-sans text-xs text-gray-200 placeholder-gray-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500",
          errorMotivo
            ? "border-brand-red focus:border-brand-red"
            : "border-brand-border focus:border-emerald-500"
        )}
      />
      {errorMotivo && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1 font-mono text-[10px] text-brand-red"
        >
          Ingrese el motivo de la decisión
        </p>
      )}
    </div>
  );

  // ── MODO AUDITORÍA: ACCIONES primero, observaciones después (diseño) ──
  if (modo === "auditoria") {
    return (
      <div className="space-y-6">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-400">
            <ShieldCheck className="size-4 text-emerald-400" aria-hidden />
            <span>ACCIONES DEL SUPERVISOR</span>
          </div>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejectuar("anomalia")}
            className="flex w-full items-center justify-center gap-2 rounded border border-red-900/60 bg-[#1b0d0e] px-4 py-2.5 font-bold uppercase tracking-wider text-brand-red transition-colors hover:bg-[#281315] hover:text-red-300 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-60"
          >
            {accionEnCurso === "anomalia" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Procesando…
              </>
            ) : (
              <>
                <AlertTriangle className="size-3.5" strokeWidth={2} aria-hidden />
                <span>Reportar anomalia</span>
              </>
            )}
          </button>
        </div>
        {textarea}
        {NOTA_AUDITORIA}
      </div>
    );
  }

  // ── MODOS DE INGRESO: observaciones primero, decisiones después ──────
  return (
    <div className="space-y-6">
      {textarea}
      <div>
        <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-400">
          <ShieldCheck className="size-4 text-emerald-400" aria-hidden />
          <span>ACCIONES DEL SUPERVISOR</span>
        </div>
        {modo === "ingreso-manual" && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejectuar("aprobar")}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded bg-emerald-500 px-4 py-2.5 font-mono font-bold uppercase tracking-wider text-black shadow-lg transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-60"
          >
            {accionEnCurso === "aprobar" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Procesando…
              </>
            ) : (
              <>
                <Check className="size-4" strokeWidth={2} aria-hidden />
                <span>ACEPTAR ACTA</span>
              </>
            )}
          </button>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void ejectuar("rescanear")}
          className="flex w-full items-center justify-center gap-2 rounded border border-red-900/60 bg-[#1b0d0e] px-4 py-2.5 font-bold uppercase tracking-wider text-brand-red transition-colors hover:bg-[#281315] hover:text-red-300 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-60"
        >
          {accionEnCurso === "rescanear" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Procesando…
            </>
          ) : (
            <>
              <AlertTriangle className="size-3.5" strokeWidth={2} aria-hidden />
              <span>Rechazar (reescanear)</span>
            </>
          )}
        </button>
      </div>
      {NOTA_AUDITORIA}
    </div>
  );
}
