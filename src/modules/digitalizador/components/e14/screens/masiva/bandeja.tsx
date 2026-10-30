"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — BANDEJA (R6: SPLIT move-only de
 * MasivaView.tsx — reporte 03b M-2, verbatim): la fila de FILTROS + conteos
 * (BandejaFiltros) y la lista de filas (BandejaFilas). Los props conservan
 * los nombres de las variables originales para que el JSX movido quede
 * verbatim. Quedan separados porque `<InformeCorrida />` vive entre ambos
 * en el orquestador (orden de la vista intacto).
 */
import type { FiltroMasiva } from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import { FILTROS } from "./helpers";
import { FilaMasivaVista, type ProgresoFilaVista } from "./fila";

/** Filtros + línea de conteos + botón ENVIAR ADVERTENCIAS. */
export function BandejaFiltros({
  filtro,
  setFiltro,
  enviadas,
  enCola,
  pendientes,
  duplicadas,
  yaEnviadas,
  errores,
  advertenciasPend,
  enviandoLote,
  corriendo,
  enviarLote,
}: {
  filtro: FiltroMasiva;
  setFiltro: (filtro: FiltroMasiva) => void;
  enviadas: number;
  enCola: number;
  pendientes: number;
  duplicadas: number;
  yaEnviadas: number;
  errores: number;
  advertenciasPend: number;
  enviandoLote: boolean;
  corriendo: boolean;
  enviarLote: (estado: "ADVERTENCIA") => void;
}) {
  return (
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
  );
}

/** Lista de filas (orden e64v: originales primero, duplicadas al final). */
export function BandejaFilas({
  visibles,
  visiblesOrdenadas,
  progreso,
  posicionesCola,
  totalCola,
  nombrePorId,
  recienListas,
  procesarIgual,
  abrirActa,
  reintentar,
  quitar,
}: {
  visibles: FilaMasiva[];
  visiblesOrdenadas: FilaMasiva[];
  progreso: ProgresoFilaVista | null;
  /** Posición 1-based en la cola de vida (Map precalculado en el orquestador
   *  — R6: mata el `colaVida.indexOf` O(n²) del render). */
  posicionesCola: Map<string, number>;
  totalCola: number;
  /** Map id→nombre (precalculado en el orquestador — R6: mata el
   *  `filas.find((o) => o.id === f.dupOf)` O(n²) del render). */
  nombrePorId: Map<string, string>;
  recienListas: Set<string>;
  procesarIgual: (id: string) => void;
  abrirActa: (id: string) => void;
  reintentar: (id: string) => void;
  quitar: (id: string) => void;
}) {
  return (
  <ul className="flex flex-col gap-2 pr-1" aria-label="Bandeja de resultados">
    {visiblesOrdenadas.map((f) => (
      <FilaMasivaVista
        key={f.id}
        f={f}
        progreso={progreso}
        posicionesCola={posicionesCola}
        totalCola={totalCola}
        nombrePorId={nombrePorId}
        recienListas={recienListas}
        procesarIgual={procesarIgual}
        abrirActa={abrirActa}
        reintentar={reintentar}
        quitar={quitar}
      />
    ))}
    {visibles.length === 0 && (
      <li className="rounded-xl border border-brand-borderdim bg-brand-surface/40 px-3 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-gray-400">
        SIN FILAS CON ESE FILTRO
      </li>
    )}
  </ul>
  );
}
