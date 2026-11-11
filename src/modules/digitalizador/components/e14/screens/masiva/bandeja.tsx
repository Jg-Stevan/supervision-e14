"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — BANDEJA (R6: SPLIT move-only de
 * MasivaView.tsx — reporte 03b M-2, verbatim): la fila de FILTROS + conteos
 * (BandejaFiltros) y la lista de filas (BandejaFilas). Los props conservan
 * los nombres de las variables originales para que el JSX movido quede
 * verbatim. Quedan separados porque `<InformeCorrida />` vive entre ambos
 * en el orquestador (orden de la vista intacto).
 *
 * KIT carga-masiva-redesign-v1 — paleta del diseño «CARGA MASIVA» en los
 * chips de filtro (#00e599 activo sobre #061d19) y hilo de TIEMPOS reales
 * (msPorFila — MetricaActa de la corrida) hacia la fila memoizada como
 * prop primitivo (tiempoTexto) — misma disciplina R6-perf.
 */
import { memo } from "react";

import type { FiltroMasiva } from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import {
  esDuplicada,
  etiquetaDupDe,
  FILTROS,
  pildoraDe,
} from "./helpers";
import { fmtTiempoActa } from "./metricas-vista";
import { FilaMasivaVista } from "./fila";

/** Filtros + línea de conteos + botón ENVIAR ADVERTENCIAS.
 *  P0.2 (informe 2 §6.2): memo — props primitivos + acciones estables; el
 *  orquestador re-renderiza por otras señales (gama, drag, avisos) sin que
 *  los conteos cambien y esta barra ya no paga reconciliación.
 *  C-14 — copys honestos: «PUBLICADAS» (no «ENVIADAS») porque la publicación
 *  es LOCAL — monitor en memoria de sesión + ledger IDB (D8, export
 *  estático): nada sale por red desde la masiva. */
export const BandejaFiltros = memo(function BandejaFiltros({
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
  <div className="flex flex-wrap items-center justify-between gap-3" role="group" aria-label="Filtrar por estado">
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTROS.map(({ valor, label }) => (
        <button
          key={valor}
          type="button"
          onClick={() => setFiltro(valor)}
          aria-pressed={filtro === valor}
          className={`min-h-[36px] rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
            filtro === valor
              ? "border-[#00e599] bg-[#061d19] text-[#00e599]"
              : "border-[#112b2a] bg-[#071214] text-gray-400 hover:border-[#1b3f3e] hover:text-gray-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-gray-400"
        aria-label={`Conteos: ${enviadas} publicadas, ${enCola} en cola, ${pendientes} pendientes, ${duplicadas} duplicadas, ${yaEnviadas} ya publicadas, ${errores} errores`}
      >
        <span>
          PUBLICADAS <strong className="font-bold text-white">{enviadas}</strong>
        </span>
        <span className="text-gray-600" aria-hidden>·</span>
        <span>
          EN COLA <strong className="font-bold text-white">{enCola}</strong>
        </span>
        <span className="text-gray-600" aria-hidden>·</span>
        <span>
          PENDIENTES <strong className="font-bold text-white">{pendientes}</strong>
        </span>
        {duplicadas > 0 && (
          <>
            <span className="text-gray-600" aria-hidden>·</span>
            <span>
              DUPLICADAS <strong className="font-bold text-white">{duplicadas}</strong>
            </span>
          </>
        )}
        {yaEnviadas > 0 && (
          <>
            <span className="text-gray-600" aria-hidden>·</span>
            <span>
              YA PUBLICADAS <strong className="font-bold text-white">{yaEnviadas}</strong>
            </span>
          </>
        )}
        <span className="text-gray-600" aria-hidden>·</span>
        <span>
          ERRORES <strong className="font-bold text-white">{errores}</strong>
        </span>
      </span>
      {(advertenciasPend > 0 || enviandoLote) && !corriendo && (
        <button
          type="button"
          disabled={enviandoLote}
          onClick={() => void enviarLote("ADVERTENCIA")}
          aria-label={`Enviar ${advertenciasPend} actas con advertencia`}
          className="min-h-[36px] rounded-full border border-amber-400/60 bg-amber-400/10 px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviandoLote ? "ENVIANDO…" : `ENVIAR ADVERTENCIAS (${advertenciasPend})`}
        </button>
      )}
    </div>
  </div>
  );
});

/** Lista de filas (orden e64v: originales primero, duplicadas al final).
 *  P0.2 (informe 2 §3 A4/A5 + §6.2): SIN la señal de vida por props — cada
 *  FilaMasivaVista se suscribe por su cuenta (barrera de render); el propio
 *  componente es memo: solo re-renderiza cuando cambian filas/filtros/maps
 *  de derivados (transiciones de fila), ya no por tick de vida. */
export const BandejaFilas = memo(function BandejaFilas({
  visibles,
  visiblesOrdenadas,
  posicionesCola,
  totalCola,
  nombrePorId,
  recienListas,
  msPorFila,
  procesarIgual,
  abrirActa,
  reintentar,
  quitar,
}: {
  visibles: FilaMasiva[];
  visiblesOrdenadas: FilaMasiva[];
  /** Posición 1-based en la cola de vida (Map precalculado en el orquestador
   *  — R6: mata el `colaVida.indexOf` O(n²) del render). */
  posicionesCola: Map<string, number>;
  totalCola: number;
  /** Map id→nombre (precalculado en el orquestador — R6: mata el
   *  `filas.find((o) => o.id === f.dupOf)` O(n²) del render). */
  nombrePorId: Map<string, string>;
  recienListas: Set<string>;
  /** Map fila.id → totalMs REAL (metricas de la corrida viva — metricas-vita;
   *  SOLO-LECTURA, el pill de tiempo del diseño). */
  msPorFila: Map<string, number>;
  procesarIgual: (id: string) => void;
  abrirActa: (id: string) => void;
  reintentar: (id: string) => void;
  quitar: (id: string) => void;
}) {
  return (
  <ul className="flex flex-col gap-2.5 pr-1" aria-label="Bandeja de resultados">
    {visiblesOrdenadas.map((f) => {
      // R6-perf: derivados por fila en O(1) → props primitivos para la fila
      // memoizada. La VIDA (esActiva/%/etapa) la resuelve CADA FILA con su
      // suscripción propia (P0.2) — aquí ya no se consulta el progreso.
      const pildora = pildoraDe(f);
      const esDup = esDuplicada(f);
      const enColaVida = f.estado === "PENDIENTE" || f.estado === "DUPLICADA";
      // KIT e64v — Cambio A: gemela CONFIRMADA (desenlace heredado) → fila
      // azul. La dup aplazada aún no confirma → sin azul.
      return (
        <FilaMasivaVista
          key={f.id}
          f={f}
          pildoraLabel={pildora.label}
          pildoraClases={pildora.clases}
          esDup={esDup}
          etiquetaDup={esDup ? etiquetaDupDe(f) : null}
          posCola={enColaVida ? (posicionesCola.get(f.id) ?? 0) : 0}
          totalCola={totalCola}
          recienLista={recienListas.has(f.id)}
          nombreOriginal={f.dupOf != null ? (nombrePorId.get(f.dupOf) ?? null) : null}
          // Tiempo REAL del pipeline (diseño — pill "20 s"); "" = sin dato.
          tiempoTexto={fmtTiempoActa(msPorFila.get(f.id)) ?? ""}
          procesarIgual={procesarIgual}
          abrirActa={abrirActa}
          reintentar={reintentar}
          quitar={quitar}
        />
      );
    })}
    {visibles.length === 0 && (
      <li className="rounded-lg border border-[#112b2a] bg-[#071214]/40 px-3 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-gray-400">
        SIN FILAS CON ESE FILTRO
      </li>
    )}
  </ul>
  );
});
