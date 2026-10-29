"use client";

/**
 * KIT perfil-recursos-v1 — SECCIÓN "Plan de recursos recomendado".
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): la tabla catálogo
 * D6-safe (muestra, no configura) con scroll interno acotado.
 *
 * KIT autonomia-ui-v1 (D44) — columna ESTADO: cada fila muestra su estado
 * REAL (derivado de planGamaActual + flagsMasivaEfectivos + overrides del
 * dueño — jamás del texto de la recomendación):
 *   ● AUTOMÁTICO  — la capa adaptativa lo aplica ahora (revocable).
 *   ● BASE        — el base ya es lo óptimo para este equipo.
 *   ◉ TU OVERRIDE — el dueño fijó la clave a mano (D6: su mano manda).
 *   ○ SUGERENCIA  — catálogo sin consumidor todavía (no fingir autonomía).
 * El estado se resuelve EN MONTAJE (no en render) para hydration-safe con
 * el export estático — mismas reglas que la sección Autonomía.
 */
import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { cn } from "cn";
import { usePerfilRecursos } from "../perfil-provider";
import { estadosPlan, type EstadoFila } from "../lib/autonomia";

/** Píldora del estado (misma gramática visual que la marca «DEV»). */
function PillEstado({ e }: { e: EstadoFila }) {
  const label =
    e.estado === "auto"
      ? "● automático"
      : e.estado === "override"
        ? "◉ tu override"
        : e.estado === "sugerencia"
          ? "○ sugerencia"
          : "● base";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-data text-[10px] uppercase tracking-wider",
        e.estado === "auto" && "border-(--success)/40 bg-(--success)/10 text-(--success)",
        e.estado === "override" && "border-(--warning)/40 bg-(--warning)/10 text-(--warning)",
        (e.estado === "base" || e.estado === "sugerencia") &&
          "border-(--outline-variant) text-muted-foreground",
        e.estado === "sugerencia" && "border-dashed",
      )}
      title={`${e.detalle} — aplicado ahora: ${e.aplicado}`}
    >
      {label}
    </span>
  );
}

export function SeccionPlan() {
  const { plan } = usePerfilRecursos();
  // D44 — estado real por fila: null = SSR/primer render (celdas «—»,
  // determinista); se resuelve EN MONTAJE y se re-resuelve con cada plan
  // (re-detección, cambio de override/castigo).
  const [estados, setEstados] = useState<Record<string, EstadoFila> | null>(null);
  useEffect(() => {
    setEstados(estadosPlan(plan));
  }, [plan]);

  return (
    <section className="rounded-[4px] border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <ListChecks className="size-4 shrink-0 text-(--primary)" aria-hidden />
        <h3 className="label-caps text-foreground">Plan de recursos recomendado</h3>
        <span className="body-md text-muted-foreground">
          — la app decide y aplica (D44); tu override manual manda (D6)
        </span>
      </header>
      <div className="max-h-96 overflow-auto scroll-panel">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="label-caps px-4 py-2 text-muted-foreground">Parámetro</th>
              <th className="label-caps px-4 py-2 text-muted-foreground">Base</th>
              <th className="label-caps px-4 py-2 text-muted-foreground">Recomendado</th>
              <th className="label-caps px-4 py-2 text-muted-foreground">Estado</th>
              <th className="label-caps px-4 py-2 text-muted-foreground">Por qué</th>
            </tr>
          </thead>
          <tbody>
            {plan.filas.map((f) => {
              const e = estados?.[f.clave] ?? null;
              return (
                <tr
                  key={f.parametro}
                  className="border-b border-border/60 last:border-0 hover:bg-(--hover-row)"
                >
                  <td className="body-md px-4 py-2.5 font-semibold text-foreground">{f.parametro}</td>
                  <td className="body-md px-4 py-2.5 font-data text-muted-foreground">{f.base}</td>
                  <td className="body-md px-4 py-2.5 font-data text-(--primary)">{f.recomendado}</td>
                  <td className="px-4 py-2.5">
                    {e ? (
                      <PillEstado e={e} />
                    ) : (
                      <span className="body-md font-data text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="body-md max-w-[320px] px-4 py-2.5 text-muted-foreground">{f.nota}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
