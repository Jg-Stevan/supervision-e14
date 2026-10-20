"use client";

import { useState } from "react";
import { BadgeCheck, Loader2, RotateCcw } from "lucide-react";
import { cn } from "cn";

/**
 * Acciones del supervisor (kit SUP-4 §2.2 / T5): los 2 botones del mockup
 * + textarea OBSERVACIONES.
 *
 * Validación de motivo (T5.2): textarea vacío → NO se ejecuta nada, el
 * borde pasa a error y aparece el mensaje inline. Sin toast en ese caso.
 * Patrón vida-v1 (D19): spinner 2.5 s (lo maneja el store) → resolución →
 * notificación + toast + efectos enlazados.
 */

export function ActaAcciones({
  accionEnCurso,
  onAprobar,
  onRescanear,
}: {
  accionEnCurso: "aprobar" | "rescanear" | null;
  onAprobar: (observacion: string) => Promise<void>;
  onRescanear: (observacion: string) => Promise<void>;
}) {
  const [observacion, setObservacion] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const ocupado = accionEnCurso !== null;

  const ejectuar = async (accion: "aprobar" | "rescanear") => {
    if (!observacion.trim()) {
      setErrorMotivo(true);
      return;
    }
    setErrorMotivo(false);
    if (accion === "aprobar") await onAprobar(observacion.trim());
    else await onRescanear(observacion.trim());
    // Acción resuelta: la caja queda limpia para la siguiente decisión.
    setObservacion("");
  };

  return (
    <div className="space-y-3">
      <p className="label-caps text-muted-foreground">
        Acciones del supervisor
      </p>

      {/* APROBAR Y MARCAR COMO VÁLIDA */}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void ejectuar("aprobar")}
        className={cn(
          "label-caps flex w-full items-center justify-center gap-2 rounded-[4px] bg-(--primary) py-2.5 text-[#003912] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-(--primary)",
          !ocupado && "hover:bg-(--primary)/90"
        )}
      >
        {accionEnCurso === "aprobar" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Procesando…
          </>
        ) : (
          <>
            <BadgeCheck className="size-4" aria-hidden />
            Aprobar y marcar como válida
          </>
        )}
      </button>

      {/* CONFIRMAR RESCANEO */}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void ejectuar("rescanear")}
        className="label-caps flex w-full items-center justify-center gap-2 rounded-[4px] border border-[#410004] bg-[#410004]/10 py-2.5 text-(--error-text) transition-transform active:scale-[0.98] hover:bg-[#410004]/20 focus-visible:outline-2 focus-visible:outline-(--primary)"
      >
        {accionEnCurso === "rescanear" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Procesando…
          </>
        ) : (
          <>
            <RotateCcw className="size-4" aria-hidden />
            Confirmar rescaneo
          </>
        )}
      </button>

      {/* OBSERVACIONES — motivo obligatorio (T5.2) */}
      <div className="space-y-1.5">
        <label
          htmlFor="acta-observaciones"
          className="label-caps block text-muted-foreground"
        >
          Observaciones
        </label>
        <textarea
          id="acta-observaciones"
          value={observacion}
          onChange={(e) => {
            setObservacion(e.target.value);
            if (errorMotivo) setErrorMotivo(false);
          }}
          placeholder="Ingrese el motivo de la decisión..."
          aria-invalid={errorMotivo || undefined}
          aria-describedby={errorMotivo ? "acta-observaciones-error" : undefined}
          className={cn(
            "h-[88px] w-full resize-none rounded-[4px] border bg-(--input) p-2.5 body-md text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-(--primary)",
            errorMotivo ? "border-(--danger)" : "border-(--border)"
          )}
        />
        {errorMotivo && (
          <p
            id="acta-observaciones-error"
            className="text-[11px] text-(--danger)"
            role="alert"
          >
            Ingrese el motivo de la decisión
          </p>
        )}
      </div>
    </div>
  );
}
