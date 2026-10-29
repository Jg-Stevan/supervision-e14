"use client";

/**
 * KIT perfil-recursos-v1 — SECCIÓN "Evidencia del tier".
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): el PORQUÉ auditable
 * del tier (mismas reglas §4.4 que la capa adaptativa).
 */
import {
  CheckCircle2,
  CircleAlert,
  Gauge,
  Info,
} from "lucide-react";
import { usePerfilRecursos } from "../perfil-provider";

export function SeccionEvidencia() {
  const { perfil } = usePerfilRecursos();

  return (
    <section className="rounded-[4px] border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Gauge className="size-4 shrink-0 text-(--primary)" aria-hidden />
        <h3 className="label-caps text-foreground">Evidencia del tier</h3>
        <span className="body-md text-muted-foreground">
          — por qué es {perfil.tier === "PENDIENTE" ? "…" : perfil.tier} (mismas reglas §4.4 que la capa adaptativa)
        </span>
      </header>
      <ul className="max-h-96 space-y-0 overflow-y-auto scroll-panel">
        {perfil.evidencia.map((e) => (
          <li key={e.clave} className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-0">
            {e.veredicto === "favorable" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--success)" aria-hidden />
            ) : e.veredicto === "debil" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-(--danger)" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-(--neutral-state)" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="body-md text-foreground">
                <span className="font-semibold">{e.etiqueta}</span>
                {e.valor !== null && (
                  <span className="font-data text-muted-foreground"> · {e.valor}</span>
                )}
              </p>
              <p className="body-md text-muted-foreground">{e.detalle}</p>
            </div>
          </li>
        ))}
        {perfil.evidencia.length === 0 && (
          <li className="px-4 py-3">
            <p className="body-md text-muted-foreground">Detectando señales…</p>
          </li>
        )}
      </ul>
    </section>
  );
}
