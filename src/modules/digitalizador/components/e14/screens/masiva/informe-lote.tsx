"use client";

/**
 * KIT carga-masiva-redesign-v1 — INFORME & TELEMETRÍA (diseño «CARGA MASIVA»,
 * tarjeta del sidebar): resumen compacto de la corrida (LATENCIA MEDIA ·
 * INTEGRIDAD SHA-256 · ID LOTE) + botón TELEMETRÍA (JSON) — el MISMO export
 * del InformeCorrida (exportarInformeMetricas). Datos REALES y honestos:
 * · LATENCIA MEDIA — media de totalMs de la corrida viva (metricas-vista).
 * · INTEGRIDAD SHA-256 — estado del LEDGER de enviadas: VÁLIDA cuando hay
 *   enviadas y ninguna quedó «EN COLA» (offline); EN COLA k si hay pendientes
 *   de drenaje; — sin enviadas. (El SHA-256 por acta vive en el ledger e65b.)
 * · ID LOTE — ordinal de la corrida en el historial (#LOTE-N; el id REAL
 *   completo viaja en el title).
 */

import { exportarInformeMetricas } from "@/modules/digitalizador/lib/e14/masiva/metricas";
import { fmtVelocidad, type MetricasLote } from "./metricas-vista";

export function InformeLote({
  metricas,
  enviadas,
  enCola,
}: {
  metricas: MetricasLote;
  enviadas: number;
  enCola: number;
}) {
  const integridad =
    enviadas > 0 ? (enCola > 0 ? `EN COLA ${enCola}` : "VÁLIDA") : "—";
  const integridadClase =
    enviadas <= 0
      ? "text-gray-200 font-bold"
      : enCola > 0
        ? "font-semibold text-amber-400"
        : "font-semibold text-[#00e599]";
  const corrida = metricas.corrida;

  const exportar = () => {
    void exportarInformeMetricas().then((json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe-masiva-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="w-full space-y-2 border-t border-[#112b2a]/60 pt-2.5 text-left">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#00e599] shadow-[0_0_8px_#10b981]"
            aria-hidden
          />
          <span className="text-gray-300">INFORME & TELEMETRÍA</span>
        </span>
        {metricas.ordenLote > 0 && (
          <span
            className="rounded border border-[#00e599]/30 bg-[#061e19] px-1.5 py-0.5 font-mono text-[9px] text-[#00e599]"
            title={corrida ? `Corrida real: ${corrida.id}` : undefined}
          >
            LOTE #{metricas.ordenLote}
          </span>
        )}
      </div>
      <div className="space-y-1 rounded border border-[#112b2a] bg-[#061214] p-2 font-mono text-[9px]">
        <div className="flex items-center justify-between text-gray-400">
          <span>LATENCIA MEDIA:</span>
          <span className="font-bold text-gray-200" title={metricas.latenciaMuestras > 0 ? `${metricas.latenciaMuestras} actas medidas` : undefined}>
            {fmtVelocidad(metricas.latenciaMediaMs)}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>INTEGRIDAD SHA-256:</span>
          <span className={integridadClase}>{integridad}</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>ID LOTE:</span>
          <span
            className="max-w-[90px] truncate text-gray-300"
            title={corrida ? corrida.id : undefined}
          >
            {metricas.ordenLote > 0 ? `#LOTE-${metricas.ordenLote}` : "—"}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={exportar}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#00e599]/40 bg-[#061e19] px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.12)] transition-all hover:bg-[#0c2f29] active:scale-[0.98]"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
        TELEMETRÍA (JSON)
      </button>
    </div>
  );
}
