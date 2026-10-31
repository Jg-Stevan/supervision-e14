"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — BARRA DE PROGRESO DEL LOTE + aviso HEIC de
 * la fila activa (R6: SPLIT move-only de MasivaView.tsx — reporte 03b M-2,
 * verbatim; único token cambiado: `filas.length` → prop `total`).
 *
 * KIT carga-masiva-redesign-v1 — fila superior de la columna derecha del
 * diseño («PROCESANDO 6/6 … COLA QUIETA»): misma plomería, paleta nueva.
 */
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import { etiquetaVida } from "./helpers";
import type { ProgresoFilaVista } from "./fila";

export function ProgresoLote({
  hayCola,
  terminadas,
  total,
  filaActiva,
  progreso,
  corriendo,
  pendientes,
}: {
  hayCola: boolean;
  terminadas: number;
  total: number;
  filaActiva: FilaMasiva | null;
  progreso: ProgresoFilaVista | null;
  corriendo: boolean;
  pendientes: number;
}) {
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
}
