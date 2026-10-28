"use client";

/**
 * KIT e14-metricas-corrida-v1 (D34) — INFORME DE CARGA MASIVA (pedido
 * literal del dueño: «un informe de cómo se está comportando la carga
 * masiva, cuánto está tardando, en qué está tardando para tener datos
 * reales y poder diagnosticar bien los fallos»).
 *
 * · Datos: metricas.ts (IDB e14-masiva-metricas-v1 + espejo RAM de la
 *   corrida viva). Sobrevive recargas y el REINICIAR ENVÍOS (D33 —
 *   comparar corridas ES el punto).
 * · Vista: corrida seleccionada (default: la VIVA o la última cerrada) —
 *   clic en el historial para mirar una anterior.
 * · Honesto: etapa sin dato no aparece (jamás inventar); acta sin
 *   pipeline (ERROR temprano) pinta totalMs «—».
 * · Cero ruido cuando no hay corridas: el panel NO se renderiza.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  corridaVivaEstado,
  exportarInformeMetricas,
  listarCorridasMetricas,
  limpiarMetricas,
  metricasDeCorrida,
  suscribirseMetricas,
  type CorridaMetrica,
  type MetricaActa,
} from "@/modules/digitalizador/lib/e14/masiva/metricas";

type EtapaKey = "decodeMs" | "detectMs" | "ocrMs" | "persistMs" | "envioMs";

/** Etapas de TRABAJO en orden de presentación (la espera de cola y el
 *  sondeo —ingesta, paralelo al pipeline— van aparte como info). */
const ETAPAS_TRABAJO: { key: EtapaKey; label: string }[] = [
  { key: "decodeMs", label: "DECODE" },
  { key: "detectMs", label: "DETECCIÓN" },
  { key: "ocrMs", label: "OCR" },
  { key: "persistMs", label: "PERSISTENCIA" },
  { key: "envioMs", label: "ENVÍO" },
];

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} m ${Math.round(s - m * 60)} s`;
}

function fmtFechaRelativa(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${d.toLocaleDateString()} ${hh}:${mm}`;
}

function percentil(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

const COLOR_DESENLACE: Record<string, string> = {
  ENVIADA: "text-[#10b981] border-[#10b981]/40 bg-[#10b981]/10",
  OPTIMA: "text-[#10b981] border-[#10b981]/40 bg-[#10b981]/10",
  ADVERTENCIA: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  RECHAZADA: "text-rose-400 border-rose-400/40 bg-rose-400/10",
  DUPLICADA: "text-sky-400 border-sky-400/40 bg-sky-400/10",
  ERROR: "text-rose-400 border-rose-500/50 bg-rose-500/15",
};

function ChipDesenlace({ d }: { d: string }) {
  const c = COLOR_DESENLACE[d] ?? "text-slate-300 border-slate-700 bg-slate-800/50";
  return (
    <span className={`px-1.5 py-0.5 rounded-md border font-mono text-[9px] font-bold uppercase tracking-wider ${c}`}>
      {d}
    </span>
  );
}

export default function InformeCorrida() {
  const [corridas, setCorridas] = useState<CorridaMetrica[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [actas, setActas] = useState<MetricaActa[]>([]);
  const [abierto, setAbierto] = useState(true);
  const [escobaArmada, setEscobaArmada] = useState(false);
  const [tick, setTick] = useState(0); // re-render del reloj EN CURSO

  const viva = corridaVivaEstado();

  const recargar = useCallback(async () => {
    const cs = await listarCorridasMetricas();
    setCorridas(cs);
    // Default de vista: la VIVA (si hay) o la más reciente cerrada.
    const objetivo = viva.corridaId ?? seleccionada ?? cs[0]?.id ?? null;
    if (objetivo) {
      if (objetivo === viva.corridaId) {
        setSeleccionada(objetivo);
        setActas([...viva.actas]);
      } else {
        setSeleccionada(objetivo);
        setActas(await metricasDeCorrida(objetivo));
      }
    } else {
      setSeleccionada(null);
      setActas([]);
    }
  }, [viva.corridaId, seleccionada]);

  // Carga inicial + suscripción al canal de métricas (updates en vivo).
  useEffect(() => {
    void recargar();
    const off = suscribirseMetricas(() => {
      // Corrida viva → espejo RAM al instante; cerrada → relectura IDB.
      const lv = corridaVivaEstado();
      if (lv.corridaId) {
        setSeleccionada(lv.corridaId);
        setActas([...lv.actas]);
        void listarCorridasMetricas().then(setCorridas);
      } else {
        void recargar();
      }
    });
    return off;
  }, []);

  // Desarme de la escoba (mismo patrón 2 toques de VACIAR/REINICIAR).
  useEffect(() => {
    if (!escobaArmada) return;
    const t = window.setTimeout(() => setEscobaArmada(false), 3000);
    return () => window.clearTimeout(t);
  }, [escobaArmada]);

  // Reloj de la corrida EN CURSO (1 s — barato, solo mientras viva).
  useEffect(() => {
    if (!viva.corridaId) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [viva.corridaId]);

  const seleccionadaInfo = useMemo(
    () => corridas.find((c) => c.id === seleccionada) ?? null,
    [corridas, seleccionada],
  );

  const agg = useMemo(() => {
    const porDesenlace = new Map<string, number>();
    for (const a of actas) porDesenlace.set(a.desenlace, (porDesenlace.get(a.desenlace) ?? 0) + 1);

    const sumas = new Map<EtapaKey, number>();
    let trabajoTotal = 0;
    let sondeoSum = 0;
    let sondeoN = 0;
    let thumbSum = 0;
    let thumbN = 0;
    let esperaSum = 0;
    let esperaN = 0;
    const totales: number[] = [];
    const ocrs: number[] = [];
    for (const a of actas) {
      for (const [k, v] of Object.entries(a.etapas)) {
        if (k === "sondeoQrMs") {
          sondeoSum += v;
          sondeoN += 1;
          continue; // ingesta paralela — NO compite por el trabajo del pipeline
        }
        if (k === "thumbMs") {
          thumbSum += v;
          thumbN += 1;
          continue; // D35 — cosmético post-pipeline: línea propia, no barra
        }
        sumas.set(k as EtapaKey, (sumas.get(k as EtapaKey) ?? 0) + v);
        trabajoTotal += v;
      }
      if (a.esperaMs != null) {
        esperaSum += a.esperaMs;
        esperaN += 1;
      }
      if (a.totalMs != null) totales.push(a.totalMs);
      if (a.etapas.ocrMs != null && a.etapas.ocrMs > 0) ocrs.push(a.etapas.ocrMs);
    }
    totales.sort((a, b) => a - b);
    ocrs.sort((a, b) => a - b);
    const lentas = [...actas]
      .sort((a, b) => (b.totalMs ?? -1) - (a.totalMs ?? -1))
      .slice(0, 5);
    const fallos = actas.filter((a) => a.desenlace === "ERROR");
    return {
      porDesenlace,
      sumas,
      trabajoTotal,
      sondeoSum,
      sondeoN,
      thumbSum,
      thumbN,
      esperaSum,
      esperaN,
      p50Total: percentil(totales, 50),
      p95Total: percentil(totales, 95),
      p50Ocr: percentil(ocrs, 50),
      p95Ocr: percentil(ocrs, 95),
      lentas,
      fallos,
    };
  }, [actas]);

  const wallCorrida = seleccionadaInfo
    ? (seleccionadaInfo.fin ?? Date.now()) - seleccionadaInfo.inicio
    : null;
  const enCurso = seleccionadaInfo?.fin == null;
  void tick; // reloj — el valor solo dispara el re-render

  if (!corridas.length) return null; // cero ruido sin datos

  const exportar = () => {
    void exportarInformeMetricas().then((json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe-masiva-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <section
      aria-label="Informe de carga masiva"
      className="rounded-2xl border border-slate-800 bg-[#0c1219]"
    >
      {/* ——— cabecera ——— */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label={abierto ? "Colapsar informe" : "Expandir informe"}
          className="min-h-[44px] px-2 -ml-2 rounded-xl font-mono text-[11px] font-black uppercase tracking-wider text-white flex items-center gap-2 hover:bg-white/5 transition cursor-pointer"
        >
          <span className={`text-[#10b981] transition-transform ${abierto ? "rotate-90" : ""}`}>▶</span>
          INFORME DE CARGA
        </button>
        <span
          className={`px-2 py-0.5 rounded-md border font-mono text-[10px] font-bold uppercase tracking-wider ${
            enCurso
              ? "border-[#10b981]/50 text-[#10b981] bg-[#10b981]/10"
              : "border-slate-700 text-slate-300 bg-slate-800/40"
          }`}
          role="status"
        >
          {enCurso && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse mr-1.5 align-middle" />}
          {enCurso ? `EN CURSO · ${fmtMs(wallCorrida)}` : `COMPLETADA · ${fmtMs(wallCorrida)}`}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {seleccionadaInfo ? fmtFechaRelativa(seleccionadaInfo.inicio) : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={exportar}
            aria-label="Exportar informe JSON"
            title="Descarga el informe completo (corridas + actas) en JSON"
            className="min-h-[44px] px-3 rounded-xl border border-slate-800 bg-[#10161f] text-slate-300 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-slate-600 hover:text-white transition cursor-pointer"
          >
            EXPORTAR JSON
          </button>
          <button
            type="button"
            onClick={() => {
              if (!escobaArmada) {
                setEscobaArmada(true);
                return;
              }
              setEscobaArmada(false);
              void limpiarMetricas().then(() => recargar());
            }}
            aria-label={escobaArmada ? "Confirmar borrar todo el historial de métricas" : "Borrar historial de métricas"}
            title="Borra TODO el historial de métricas (las actas enviadas NO se tocan)"
            className={`min-h-[44px] px-3 rounded-xl border font-mono text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
              escobaArmada
                ? "border-red-500 text-red-400 bg-red-500/20 animate-pulse"
                : "border-slate-800 bg-[#10161f] text-slate-500 hover:border-slate-600 hover:text-white"
            }`}
          >
            {escobaArmada ? "¿SEGURO?" : "LIMPIAR"}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="px-4 py-3 flex flex-col gap-4">
          {/* ——— KPIs ——— */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="ACTAS" valor={String(actas.length)} />
            <Kpi label="TRABAJO PIPELINE" valor={fmtMs(agg.trabajoTotal)} />
            <Kpi label="OCR P50 / P95" valor={`${fmtMs(agg.p50Ocr)} / ${fmtMs(agg.p95Ocr)}`} />
            <Kpi
              label="DESENLACES"
              valor={[...agg.porDesenlace.entries()].map(([d, n]) => `${d} ${n}`).join(" · ") || "—"}
              small
            />
          </div>

          {/* ——— etapas (barras del presupuesto del pipeline) ——— */}
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              ¿EN QUÉ SE VA EL TIEMPO? — sumas de la corrida (trabajo pipeline {fmtMs(agg.trabajoTotal)})
            </p>
            {ETAPAS_TRABAJO.filter(({ key }) => (agg.sumas.get(key) ?? 0) > 0).map(({ key, label }) => {
              const ms = agg.sumas.get(key) ?? 0;
              const pct = agg.trabajoTotal > 0 ? Math.round((ms / agg.trabajoTotal) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-2" role="row">
                  <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
                  <div className="flex-1 h-3.5 rounded-md bg-[#10161f] overflow-hidden" role="presentation">
                    <div
                      className="h-full rounded-md bg-[#10b981]/70"
                      style={{ width: `${Math.max(2, pct)}%` }}
                      aria-hidden
                    />
                  </div>
                  <span className="w-40 shrink-0 text-right font-mono text-[10px] text-slate-300" role="cell">
                    {fmtMs(ms)} · {pct}%
                  </span>
                </div>
              );
            })}
            {agg.sondeoN > 0 && (
              <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                + SONDEO QR (ingesta, paralelo al pipeline): {fmtMs(agg.sondeoSum)} en {agg.sondeoN} acta(s)
              </p>
            )}
            {agg.esperaN > 0 && (
              <p className="font-mono text-[10px] text-slate-500">
                + ESPERA EN COLA: {fmtMs(agg.esperaSum)} en {agg.esperaN} acta(s) (no es trabajo — es turno)
              </p>
            )}
            {agg.thumbN > 0 && (
              <p className="font-mono text-[10px] text-slate-500">
                + THUMBS DE BANDEJA (post-pipeline): {fmtMs(agg.thumbSum)} en {agg.thumbN} acta(s)
              </p>
            )}
            {agg.trabajoTotal === 0 && (
              <p className="font-mono text-[10px] text-slate-500">Sin etapas de trabajo registradas aún.</p>
            )}
          </div>

          {/* ——— actas más lentas ——— */}
          {agg.lentas.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                ACTAS MÁS LENTAS (top {agg.lentas.length} — las demás van en el export)
              </p>
              <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                {agg.lentas.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#10161f] px-2.5 py-1.5"
                  >
                    <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-200" title={a.nombre}>
                      {a.nombre}
                    </span>
                    {a.copia && (
                      <span className="px-1.5 py-0.5 rounded-md border border-sky-400/40 text-sky-400 bg-sky-400/10 font-mono text-[9px] font-bold uppercase">
                        COPIA
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[11px] font-bold text-white">{fmtMs(a.totalMs)}</span>
                    {a.cuello && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-amber-400/40 text-amber-400 bg-amber-400/10 font-mono text-[9px] font-bold uppercase tracking-wider">
                        {a.cuello}
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-slate-400">{a.score != null ? a.score.toFixed(1) : "—"}</span>
                    <ChipDesenlace d={a.desenlace} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ——— fallos ——— */}
          {agg.fallos.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-rose-400">
                FALLOS ({agg.fallos.length})
              </p>
              <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                {agg.fallos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5"
                  >
                    <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-200" title={a.nombre}>
                      {a.nombre}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-rose-300">{a.error ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ——— historial de corridas ——— */}
          {corridas.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                HISTORIAL ({corridas.length} corridas — p50 pipeline {fmtMs(agg.p50Total)} · p95 {fmtMs(agg.p95Total)} de la vista actual)
              </p>
              <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                {corridas.slice(0, 10).map((c) => {
                  const activa = c.id === seleccionada;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSeleccionada(c.id);
                          void metricasDeCorrida(c.id).then(setActas);
                        }}
                        aria-label={`Ver corrida de ${fmtFechaRelativa(c.inicio)}`}
                        className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition cursor-pointer text-left ${
                          activa
                            ? "border-[#10b981]/60 text-white bg-[#10b981]/10"
                            : "border-slate-800 text-slate-400 bg-[#10161f] hover:border-slate-600 hover:text-white"
                        }`}
                      >
                        <span className="flex-1">{fmtFechaRelativa(c.inicio)}</span>
                        <span>{c.nActas} ACTAS</span>
                        <span>{fmtMs((c.fin ?? Date.now()) - c.inicio)}</span>
                        {c.fin == null && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, valor, small }: { label: string; valor: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#10161f] px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`font-mono font-bold text-white truncate ${small ? "text-[10px]" : "text-sm"}`} title={valor}>
        {valor}
      </p>
    </div>
  );
}
