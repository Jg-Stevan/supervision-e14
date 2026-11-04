"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Acciones del supervisor (KIT VISOR-MONITOR-GLOBAL-v1 §4-T1):
 *
 * - **REPORTAR ANOMALIA** es la ÚNICA acción del visor del monitor (pedido
 *   explícito del dueño — supersede la Opción B híbrida del plan §4-D2).
 *   Crea un registro `Anomalia` REAL (tipo/severidad/mesa) + notificación +
 *   evento en el historial (lógica `reportarAnomaliaVisor` del store, sin
 *   cambios, incl. `Anomalia.detalle`).
 * - APROBAR y CONFIRMAR RESCANEO salen de la UI; su lógica queda DORMIDA
 *   en el store (`aprobarActaVisor` / `confirmarRescanVisor` en
 *   datos-provider — mismos efectos enlazados D19/T5.7). `reinspeccionar`
 *   de la subtabla de mesas NO vive aquí (fuera del visor, intacto).
 * - V1-02: hint `OPCIONAL SI ES INVALIDA` junto al label — el motivo es
 *   OBLIGATORIO para reportar (acción que invalida): borde error + mensaje
 *   inline «Ingrese el motivo de la decisión», sin toast.
 *
 * Patrón vida-v1 (D19): spinner 2.5 s (lo maneja el store) → resolución →
 * notificación + toast + efectos enlazados.
 */

export type AccionActa = "reportar";

export function ActaAcciones({
  accionEnCurso,
  onReportar,
  sinTitulo,
}: {
  accionEnCurso: AccionActa | null;
  /** T1 — REPORTAR ANOMALIA (crea la anomalía real en el sistema). */
  onReportar: (observacion: string) => Promise<void>;
  /** Oculta el título (el acordeón móvil ya lo muestra — plan M1). */
  sinTitulo?: boolean;
}) {
  const [observacion, setObservacion] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const ocupado = accionEnCurso !== null;

  const ejectuar = async () => {
    // El motivo es OBLIGATORIO para reportar (regla `exigeMotivo` de V1-02:
    // toda acción que invalida lo exige — reportar es la única que queda).
    if (!observacion.trim()) {
      setErrorMotivo(true);
      return;
    }
    setErrorMotivo(false);
    await onReportar(observacion.trim());
    // Acción resuelta: la caja queda limpia para la siguiente decisión.
    setObservacion("");
  };

  return (
    <div className="space-y-3">
      {!sinTitulo && (
        <p className="label-caps text-muted-foreground">
          Acciones del supervisor
        </p>
      )}

      {/* REPORTAR ANOMALIA — botón hazard ÚNICO del panel (diseño
          visor_de_actas del dueño; T1 del kit VISOR-MONITOR-GLOBAL-v1). */}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void ejectuar()}
        className={cn(
          "label-caps flex w-full items-center justify-center gap-2 rounded-[4px] border border-(--danger)/60 bg-(--hazard-bg) py-2.5 text-(--danger) transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-(--primary)",
          !ocupado && "hover:border-(--danger) hover:bg-(--hazard-bg-hover)"
        )}
      >
        {ocupado ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reportando…
          </>
        ) : (
          <>
            <TriangleAlert className="size-4" aria-hidden />
            Reportar anomalía
          </>
        )}
      </button>

      {/* OBSERVACIONES — V1-02: OPCIONAL SI ES INVALIDA (hint del diseño
          visor_de_actas junto al label; móvil conserva el texto completo —
          cabe en su fila). Obligatoria para reportar. */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor="acta-observaciones"
            className="label-caps block text-muted-foreground"
          >
            Observaciones
          </label>
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/80">
            Opcional si es inválida
          </span>
        </div>
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
