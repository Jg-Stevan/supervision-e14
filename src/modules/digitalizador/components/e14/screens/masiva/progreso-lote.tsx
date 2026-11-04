"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — BARRA DE PROGRESO DEL LOTE + aviso HEIC de
 * la fila activa (R6: SPLIT move-only de MasivaView.tsx — reporte 03b M-2,
 * verbatim; único token cambiado: `filas.length` → prop `total`).
 *
 * KIT carga-masiva-redesign-v1 — fila superior de la columna derecha del
 * diseño («PROCESANDO 6/6 … COLA QUIETA»): misma plomería, paleta nueva.
 *
 * P0.2 (informe-arquitectura-fluidez-2026-11-02 §3 A4/A5 + §6.2) — BARRERA
 * DE RENDER: este componente es HOJA y se suscribe por su cuenta a la señal
 * de vida (`progreso` del store masiva) — un tick de vida re-renderiza SOLO
 * esta barra (y la fila activa de la bandeja), no el orquestador entero.
 * `filaActiva` sigue llegando por props (derivada del enCursoId + porId del
 * orquestador — misma pareja store que hoy).
 */
import { memo } from "react";

import { useMasivaStore } from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import { etiquetaVida } from "./helpers";

export const ProgresoLote = memo(function ProgresoLote({
  hayCola,
  terminadas,
  total,
  filaActiva,
  corriendo,
  pendientes,
}: {
  hayCola: boolean;
  terminadas: number;
  total: number;
  filaActiva: FilaMasiva | null;
  corriendo: boolean;
  pendientes: number;
}) {
  // P0.2 — suscripción propia de la señal de vida (hoja — presupuesto de
  // render por tick: 1 componente). Mismo objeto del store que hoy viajaba
  // por props; la fórmula de pantalla no cambia.
  const progreso = useMasivaStore((s) => s.progreso);
  return (
    <>
{/* ---------- BARRA DE PROGRESO DEL LOTE ---------- */}
{hayCola && (
  <div className="flex items-center justify-between gap-3">
    <p className="truncate font-mono text-[11px] font-bold uppercase tracking-wider text-gray-200">
      PROCESANDO {terminadas}/{total}
      {filaActiva && progreso && (
        <span className="font-medium text-gray-400">
          {" "}
          — {filaActiva.nombre} · {etiquetaVida(progreso)}
        </span>
      )}
    </p>
    <p className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
      {corriendo ? "COLA ACTIVA" : pendientes > 0 ? `${pendientes} EN COLA` : "COLA QUIETA"}
    </p>
  </div>
)}

{/* Aviso HEIC */}
{filaActiva && /\.(heic|heif)$/i.test(filaActiva.nombre) && (
  <p
    role="status"
    aria-live="polite"
    className="rounded border border-amber-400/60 bg-amber-400/10 px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400"
  >
    CONVIRTIENDO HEIC… LA CONVERSIÓN PUEDE TARDAR UNOS SEGUNDOS
  </p>
)}
    </>
  );
});
