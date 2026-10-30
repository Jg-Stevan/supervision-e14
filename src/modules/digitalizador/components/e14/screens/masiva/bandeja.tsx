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
import {
  esDuplicada,
  etiquetaDupDe,
  etiquetaVida,
  FILTROS,
  pildoraDe,
  porcentajeProcesoActa,
} from "./helpers";
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
    {visiblesOrdenadas.map((f) => {
      // R6-perf: derivados por fila en O(1) → props PRIMITIVOS para la fila
      // memoizada. Una señal de vida (throttle 250 ms) solo cambia los
      // primitivos de la fila ACTIVA — las demás filas comparan iguales y
      // saltan el re-render (antes re-renderizaban TODAS en cada tick).
      const esActiva = progreso?.id === f.id && f.estado === "PROCESANDO";
      const pildora = pildoraDe(f);
      const esDup = esDuplicada(f);
      const enColaVida = f.estado === "PENDIENTE" || f.estado === "DUPLICADA";
      // KIT e64v — Cambio A: gemela CONFIRMADA (desenlace heredado) → fila
      // azul. La dup aplazada aún no confirma → sin azul.
      return (
        <FilaMasivaVista
          key={f.id}
          f={f}
          esActiva={esActiva}
          pildoraLabel={pildora.label}
          pildoraClases={pildora.clases}
          esDup={esDup}
          etiquetaDup={esDup ? etiquetaDupDe(f) : null}
          pctProceso={porcentajeProcesoActa(f, esActiva, esActiva ? progreso : null)}
          // % SOLO si es dato REAL (OCR del reconocedor) — kit T3 honestidad.
          ocrPct={
            esActiva && progreso?.etapa === "ocr" && progreso.ocrFraccion != null
              ? Math.min(100, Math.max(0, Math.round(progreso.ocrFraccion * 100)))
              : null
          }
          vidaTexto={esActiva && progreso ? etiquetaVida({ etapa: progreso.etapa }) : ""}
          posCola={enColaVida ? (posicionesCola.get(f.id) ?? 0) : 0}
          totalCola={totalCola}
          recienLista={recienListas.has(f.id)}
          nombreOriginal={f.dupOf != null ? (nombrePorId.get(f.dupOf) ?? null) : null}
          procesarIgual={procesarIgual}
          abrirActa={abrirActa}
          reintentar={reintentar}
          quitar={quitar}
        />
      );
    })}
    {visibles.length === 0 && (
      <li className="rounded-xl border border-brand-borderdim bg-brand-surface/40 px-3 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-gray-400">
        SIN FILAS CON ESE FILTRO
      </li>
    )}
  </ul>
  );
}
