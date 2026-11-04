"use client";

/**
 * KIT carga-masiva-redesign-v1 — MÉTRICAS DE LOTE PARA LA VISTA (diseño
 * «CARGA MASIVA»: SESIÓN INICIO/FIN · DURACIÓN · VELOCIDAD PROMEDIO ·
 * LOTE #N). SOLO-LECTURA del módulo de métricas (e14-metricas-corrida-v1,
 * D34): corrida mostrada = la VIVA o la última cerrada del historial IDB;
 * tiempos por fila = actas de ESA corrida (RAM de la viva, IDB de la cerrada
 * — metricasDeCorrida). Jamás inventa: sin datos → null y la UI pinta «—» /
 * omite la píldora de tiempo.
 *
 * EL NÚMERO DEL ACTA ES SU MURO, NO EL PIPELINE (2026-11-03): la píldora y la
 * velocidad promedio leen `muroMs` (despacho → desenlace: pre-OCR + pipeline
 * + thumb + persist + envío + residual). `totalMs` quedó como fallback de
 * compatibilidad porque ES UN SUBCONJUNTO: le falta el muro pre-OCR (la
 * escalera QR — 10-20 s/acta medida con el sidecar rápido) y todo lo
 * posterior al OCR. Donde solo hay `totalMs` el número es parcial y viejo.
 */

import { useEffect, useMemo, useState } from "react";

import {
  corridaVivaEstado,
  listarCorridasMetricas,
  metricasDeCorrida,
  suscribirseMetricas,
  type CorridaMetrica,
  type MetricaActa,
} from "@/modules/digitalizador/lib/e14/masiva/metricas";

export interface MetricasLote {
  /** Corrida mostrada (viva o última cerrada) — inicio/fin/id REALES. */
  corrida: CorridaMetrica | null;
  /** Ordinal 1-based de la corrida en el historial («LOTE #N»). 0 = sin datos. */
  ordenLote: number;
  /** Media del MURO real del acta (muroMs) en la corrida mostrada. null = sin datos. */
  latenciaMediaMs: number | null;
  /** Número de actas con tiempo real detrás de la media (transparencia). */
  latenciaMuestras: number;
  /** Muro REAL por fila (MetricaActa.id ≡ fila.id) para la píldora de
   *  tiempo de cada tarjeta de la bandeja. Fila sin medir = SIN clave (la
   *  píldora no se pinta — jamás un 0 inventado). */
  msPorFila: Map<string, number>;
}

/** El tiempo del acta completa: su muro (despacho → desenlace). `totalMs`
 *  solo como fallback de historiales previos a que se midiera el muro. */
function msActa(a: MetricaActa): number | null {
  return a.muroMs ?? a.totalMs;
}

export function useMetricasLote(): MetricasLote {
  const [tick, setTick] = useState(0);
  const [corridas, setCorridas] = useState<CorridaMetrica[]>([]);
  const [actasMostradas, setActasMostradas] = useState<MetricaActa[]>([]);

  // Señal de vida de las métricas (mismo canal del InformeCorrida) — cada
  // notificación re-lee el historial (IDB) y decide qué corrida mostrar.
  useEffect(() => suscribirseMetricas(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    let vivo = true;
    void listarCorridasMetricas().then((cs) => {
      if (vivo) setCorridas(cs);
    });
    return () => {
      vivo = false;
    };
  }, [tick]);

  // Corrida mostrada: la VIVA (con sus actas de RAM) o la última CERRADA del
  // historial (sus actas viven en IDB — lectura perezosa, fire-and-forget).
  const corridaMostrada = useMemo(() => {
    const viva = corridaVivaEstado();
    if (viva.corridaId) {
      const info = corridas.find((c) => c.id === viva.corridaId) ?? null;
      if (info) return info;
    }
    // El historial llega DESC por inicio → [0] es la última (viva abierta
    // sin actas aún, o la última cerrada).
    return corridas[0] ?? null;
  }, [corridas]);

  useEffect(() => {
    if (!corridaMostrada) {
      setActasMostradas([]);
      return;
    }
    const viva = corridaVivaEstado();
    if (viva.corridaId === corridaMostrada.id) {
      setActasMostradas([...viva.actas]); // RAM — en vivo
      return;
    }
    let vivo = true;
    void metricasDeCorrida(corridaMostrada.id).then((as) => {
      if (vivo) setActasMostradas(as);
    });
    return () => {
      vivo = false;
    };
  }, [corridaMostrada]);

  return useMemo(() => {
    const ordenLote = corridaMostrada
      ? corridas.length - corridas.findIndex((c) => c.id === corridaMostrada.id)
      : 0;
    const conTiempo = actasMostradas.filter((a) => msActa(a) != null);
    const latenciaMediaMs = conTiempo.length
      ? Math.round(
          conTiempo.reduce((s, a) => s + (msActa(a) ?? 0), 0) / conTiempo.length,
        )
      : null;
    const msPorFila = new Map<string, number>();
    for (const a of actasMostradas) {
      const ms = msActa(a);
      if (ms != null) msPorFila.set(a.id, ms);
    }
    return {
      corrida: corridaMostrada,
      ordenLote,
      latenciaMediaMs,
      latenciaMuestras: conTiempo.length,
      msPorFila,
    };
  }, [corridaMostrada, corridas, actasMostradas]);
}

// ─── Formateadores locales del header (es-CO, cero dependencias) ────────────

/** Hora local "HH:MM:SS" (el diseño del header trae segundos). */
export function hhmmss(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** "02:20 (2m 20s)" — el formato del diseño para la tarjeta DURACIÓN. */
export function fmtDuracionReloj(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s - mm * 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")} (${mm}m ${ss}s)`;
}

/** "2.5 s/acta" — la velocidad promedio del diseño (media del muro del acta).
 *  OJO: con pool >1 los muros se solapan, así que NO es el ritmo del lote;
 *  ese sigue siendo DURACIÓN ÷ n actas (tarjeta del header). */
export function fmtVelocidad(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s/acta`;
}

/** "20 s" — la píldora de tiempo por acta de la tarjeta (diseño). */
export function fmtTiempoActa(ms: number | null | undefined): string | null {
  if (ms == null) return null; // sin dato real → la píldora NO se pinta
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}
