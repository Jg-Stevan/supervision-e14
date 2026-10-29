"use client";

/**
 * KIT perfil-recursos-v1 — VISTA "Perfil del dispositivo" (composición).
 *
 * Refactor perfil-dev-v1: la vista es SOLO composición — cabecera
 * (RE-DETECTAR / COPIAR JSON) + KPIs + secciones organizadas por
 * responsabilidad:
 * · seccion-recursos   → tarjetas de señales (CPU/RAM/GPU/red/…)
 * · seccion-autonomia  → D38 plan aplicado + selector de motor OCR
 * · seccion-plan       → catálogo D6-safe recomendado
 * · seccion-evidencia  → el porqué auditable del tier
 *
 * Pantalla de diagnóstico que hace VISIBLE lo que la app detecta. Se
 * monta SOLO en modo desarrollador (KIT perfil-dev-v1 — D43): el público
 * general no ve nada técnico del pipeline.
 */
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { usePerfilRecursos } from "../perfil-provider";
import { tonoTier } from "../lib/clasificador";
import { etiquetaForma } from "../lib/senales";
import {
  diagnosticoJson,
  resolverMotorDelDispositivo,
} from "../lib/diagnostico";
import { KpiPerfil } from "./piezas";
import { SeccionRecursos } from "./seccion-recursos";
import { SeccionAutonomia } from "./seccion-autonomia";
import { SeccionPlan } from "./seccion-plan";
import { SeccionEvidencia } from "./seccion-evidencia";

export function VistaPerfil() {
  const { perfil, plan, refrescar, midiendo } = usePerfilRecursos();
  const s = perfil.senales;
  const tono = tonoTier(perfil.tier);
  const forma = s ? etiquetaForma(s.forma) : "—";

  const copiar = () => {
    try {
      // El rechazo de clipboard es ASYNC — se maneja en .catch (el
      // try/catch solo protege la llamada síncrona).
      navigator.clipboard
        .writeText(
          diagnosticoJson(perfil, plan, resolverMotorDelDispositivo(perfil)),
        )
        .then(() => toast.success("Diagnóstico copiado al portapapeles (JSON)"))
        .catch(() => toast.error("El navegador denegó el portapapeles — usa RE-DETECTAR y revisa aquí"));
    } catch {
      toast.error("No se pudo copiar el diagnóstico");
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Cabecera de la vista */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="headline-md">PERFIL DEL DISPOSITIVO</h2>
          <p className="body-md mt-0.5 text-muted-foreground">
            Recursos detectados en este equipo — la app los usa para adaptar y
            aprovechar (kit perfil-recursos-v1)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refrescar}
            disabled={midiendo}
            className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary) disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", midiendo && "animate-spin")} aria-hidden />
            {midiendo ? "MIDIENDO…" : "RE-DETECTAR"}
          </button>
          <button
            type="button"
            onClick={copiar}
            className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
          >
            <Copy className="size-4" aria-hidden />
            COPIAR JSON
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiPerfil
          titulo="Gama del dispositivo"
          valor={perfil.listo ? perfil.tier : "…"}
          sub={
            perfil.listo
              ? perfil.tierInferido
                ? "tier inferido (sin RAM informada)"
                : "según señales del navegador"
              : "detectando…"
          }
          tono={tono}
        />
        <KpiPerfil
          titulo="Dispositivo"
          valor={perfil.listo ? forma : "…"}
          sub={s ? `${s.sync.os} · ${s.sync.navegador}` : "detectando…"}
          tono="neutral"
        />
        <KpiPerfil
          titulo="Confianza de la detección"
          valor={perfil.listo ? `${perfil.confianzaPct}%` : "…"}
          sub={
            perfil.listo
              ? `señales decisivas presentes (${perfil.confianza})`
              : "detectando…"
          }
          tono={perfil.confianzaPct >= 83 ? "success" : perfil.confianzaPct >= 50 ? "warning" : "danger"}
        />
        <KpiPerfil
          titulo="Benchmark"
          valor={perfil.benchmark.ejecutado && perfil.benchmark.score !== null ? String(perfil.benchmark.score) : "—"}
          sub={perfil.benchmark.nota}
          tono={
            perfil.benchmark.score === null
              ? "neutral"
              : perfil.benchmark.score >= 750
                ? "success"
                : perfil.benchmark.score >= 350
                  ? "warning"
                  : "danger"
          }
        />
      </div>

      {/* Secciones del diagnóstico */}
      <SeccionRecursos />
      <SeccionAutonomia />
      <SeccionPlan />
      <SeccionEvidencia />
    </div>
  );
}
