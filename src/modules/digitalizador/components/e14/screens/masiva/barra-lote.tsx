"use client";

/**
 * KIT carga-masiva-redesign-v1 — BARRA DEL MÓDULO (diseño «CARGA MASIVA»,
 * ModuleHeader): icono-tarjeta + título + pill 6/6 + chip GAMA (adaptativa
 * D74, real) + badge PROGRESO GENERAL; sublínea de estado (COLA …/TASA DE
 * ÉXITO/VELOCIDAD PROMEDIO) y tarjetas técnicas de la derecha (SESIÓN
 * INICIO/FIN · DURACIÓN · ESTADO con mini barra). Datos REALES:
 * · conteos de la cola (orquestador), plan de gama (e14-gama-adaptativa-v1)
 * · métricas de corrida (useMetricasLote — metricas.ts, IDB+RAM).
 * Los BOTONES de acción NO viven aquí: el diseño los manda al sidebar.
 */

import type { PlanGama } from "@/modules/digitalizador/lib/e14/gama";
import {
  fmtDuracionReloj,
  hhmmss,
  type MetricasLote,
} from "./metricas-vista";

export function BarraLote({
  terminadas,
  total,
  corriendo,
  pendientes,
  hayCola,
  tasaExito,
  velocidad,
  gama,
  metricas,
}: {
  terminadas: number;
  total: number;
  corriendo: boolean;
  pendientes: number;
  hayCola: boolean;
  /** 0..100 — enviadas+yaEnviadas sobre terminadas (null = sin terminadas). */
  tasaExito: number | null;
  /** Velocidad promedio REAL ("2.5 s/acta" o "—") — metricas de la corrida. */
  velocidad: string;
  gama: PlanGama;
  metricas: MetricasLote;
}) {
  const pctGeneral =
    total > 0 ? Math.min(100, Math.round((terminadas / total) * 100)) : 0;
  const corrida = metricas.corrida;
  const duracionMs = corrida ? (corrida.fin ?? Date.now()) - corrida.inicio : null;

  return (
    <div className="flex flex-col justify-between gap-3 pt-1 md:flex-row md:items-center">
      {/* Lado izquierdo: icono, título y badges principales */}
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[#112b2a] bg-[#071214] text-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.12)]">
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
            />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-extrabold tracking-wider text-white">
              CARGA MASIVA
            </span>
            {hayCola && (
              <span className="rounded-full border border-[#112b2a] bg-[#0b191c] px-2 py-0.5 font-mono text-[10px] font-bold text-gray-300">
                {terminadas}/{total}
              </span>
            )}
            {gama.activo && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-800/60 bg-[#1e1a06] px-2 py-0.5 text-[9px] font-semibold text-amber-300"
                title={`Gama ${gama.tier} detectada${gama.tierInferido ? " (inferida)" : ""} — modo adaptado (KIT e14-gama-adaptativa-v1 · D74): ${gama.ajustes.join(" · ")}.`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
                GAMA {gama.tier} · ADAPTADO
              </span>
            )}
            {hayCola && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00e599]/40 bg-[#061e19] px-2.5 py-0.5 text-[9px] font-bold tracking-wider text-[#00e599]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#00e599] shadow-[0_0_8px_#10b981]"
                  aria-hidden
                />
                PROGRESO GENERAL: {pctGeneral}%
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold tracking-wider text-gray-500">
            {corriendo ? (
              <span className="flex items-center gap-1.5 font-bold text-[#00e599]">
                <span
                  className="h-1.5 w-1.5 animate-ping rounded-full bg-[#00e599]"
                  aria-hidden
                />
                PROCESANDO EN COLA…
              </span>
            ) : pendientes > 0 ? (
              <span>{pendientes} PENDIENTES DE ENVÍO</span>
            ) : hayCola ? (
              <span className="font-bold text-[#00e599]">COLA COMPLETADA</span>
            ) : (
              <span>ARRASTRA ARCHIVOS O SELECCIONA</span>
            )}
            {hayCola && tasaExito != null && (
              <>
                <span aria-hidden>·</span>
                <span>
                  TASA DE ÉXITO:{" "}
                  <strong className="font-mono font-bold text-gray-200">
                    {tasaExito}%
                  </strong>
                </span>
              </>
            )}
            {hayCola && velocidad !== "—" && (
              <>
                <span aria-hidden>·</span>
                <span>
                  VELOCIDAD PROMEDIO:{" "}
                  <strong className="font-mono font-bold text-gray-200">
                    {velocidad}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lado derecho: bloques de métricas técnicas y tiempos de ejecución */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
        {corrida && (
          <>
            <div className="flex items-center gap-2 rounded border border-[#112b2a] bg-[#071214] px-2.5 py-1.5 text-gray-300">
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                SESIÓN
              </span>
              <div className="flex items-center gap-1.5 font-bold tracking-wide text-gray-300">
                <span>
                  INICIO: <span className="text-gray-200">{hhmmss(corrida.inicio)}</span>
                </span>
                <span className="text-gray-600" aria-hidden>
                  |
                </span>
                <span>
                  FIN:{" "}
                  <span className="text-gray-200">
                    {corrida.fin != null ? hhmmss(corrida.fin) : "…"}
                  </span>
                </span>
              </div>
            </div>
            {duracionMs != null && (
              <div className="flex items-center gap-2 rounded border border-[#112b2a] bg-[#071214] px-2.5 py-1.5 text-gray-300">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  DURACIÓN
                </span>
                <span className="font-bold tracking-wider text-[#00e599]">
                  {fmtDuracionReloj(duracionMs)}
                </span>
              </div>
            )}
          </>
        )}
        {/* Mini barra de estado (diseño — hidden sm en móvil estrecho). */}
        <div className="hidden min-w-[110px] flex-col justify-center rounded border border-[#00e599]/30 bg-[#061d19] px-2.5 py-1.5 sm:flex">
          <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-[#00e599]">
            <span>ESTADO</span>
            <span>{pctGeneral}%</span>
          </div>
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-[#0b2823]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pctGeneral}
            aria-label={`Progreso general del lote: ${pctGeneral}%`}
          >
            <div
              className="h-full rounded-full bg-[#00e599] shadow-[0_0_8px_#10b981] transition-all"
              style={{ width: `${pctGeneral}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
