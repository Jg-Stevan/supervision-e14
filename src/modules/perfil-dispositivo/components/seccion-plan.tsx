"use client";

/**
 * KIT perfil-recursos-v1 — SECCIÓN "Plan de recursos recomendado".
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): la tabla catálogo
 * D6-safe (muestra, no configura) con scroll interno acotado.
 */
import { ListChecks } from "lucide-react";
import { usePerfilRecursos } from "../perfil-provider";

export function SeccionPlan() {
  const { plan } = usePerfilRecursos();

  return (
    <section className="rounded-[4px] border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <ListChecks className="size-4 shrink-0 text-(--primary)" aria-hidden />
        <h3 className="label-caps text-foreground">Plan de recursos recomendado</h3>
        <span className="body-md text-muted-foreground">
          — catálogo para este dispositivo (la app muestra; el dueño decide · D6)
        </span>
      </header>
      <div className="max-h-96 overflow-auto scroll-panel">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="label-caps px-4 py-2 text-muted-foreground">Parámetro</th>
              <th className="label-caps px-4 py-2 text-muted-foreground">Base</th>
              <th className="label-caps px-4 py-2 text-(--primary)">Recomendado</th>
              <th className="label-caps px-4 py-2 text-muted-foreground">Por qué</th>
            </tr>
          </thead>
          <tbody>
            {plan.filas.map((f) => (
              <tr key={f.parametro} className="border-b border-border/60 last:border-0 hover:bg-(--hover-row)">
                <td className="body-md px-4 py-2.5 font-semibold text-foreground">{f.parametro}</td>
                <td className="body-md px-4 py-2.5 font-data text-muted-foreground">{f.base}</td>
                <td className="body-md px-4 py-2.5 font-data text-(--primary)">{f.recomendado}</td>
                <td className="body-md max-w-[360px] px-4 py-2.5 text-muted-foreground">{f.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
