"use client";

/**
 * KIT perfil-recursos-v1 — PIEZAS de UI del perfil (primitivas del kit).
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): las piezas visuales
 * que comparten las secciones de la vista, SIN lógica de dominio.
 *
 * Estilo del kit SUP-1: superficies oscuras, bordes 1px (sin sombras),
 * label-caps para títulos, font-data para datos, radius 4px.
 */
import {
  CheckCircle2,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

/** KPI de la cabecera: número grande con tinte superior por tono. */
export function KpiPerfil({
  titulo,
  valor,
  sub,
  tono,
}: {
  titulo: string;
  valor: string;
  sub: string;
  tono: "success" | "warning" | "danger" | "neutral";
}) {
  const color =
    tono === "success"
      ? "var(--success)"
      : tono === "warning"
        ? "var(--warning)"
        : tono === "danger"
          ? "var(--danger)"
          : "var(--neutral-state)";
  return (
    <div
      className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
      style={{ borderTopColor: color }}
    >
      <p className="label-caps text-muted-foreground">{titulo}</p>
      <p
        className={cn("stats-number", tono === "neutral" && "text-muted-foreground")}
        style={tono === "neutral" ? undefined : { color }}
      >
        {valor}
      </p>
      <p className="body-md mt-0.5 text-muted-foreground">{sub}</p>
    </div>
  );
}

/** Tarjeta de recurso: icono + título + filas de datos (dl/dt/dd). */
export function Tarjeta({
  Icono,
  titulo,
  children,
  className,
}: {
  Icono: LucideIcon;
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // min-w-0: como ítem del grid, su mínimo automático NO puede
        // superar el track — el renderer largo de la GPU trunca en vez de
        // desbordar la página en pantallas chicas.
        "min-w-0 rounded-[4px] border border-border bg-card p-4",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <Icono className="size-4 shrink-0 text-(--primary)" aria-hidden />
        <h3 className="label-caps text-foreground">{titulo}</h3>
      </header>
      <dl className="mt-3 space-y-2">{children}</dl>
    </section>
  );
}

/** Fila dato → valor (truncate honesto con title). */
export function Fila({ k, v, titulo }: { k: string; v: string; titulo?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="body-md shrink-0 text-muted-foreground">{k}</dt>
      <dd
        className="body-md min-w-0 truncate text-right font-data text-foreground"
        title={titulo ?? v}
      >
        {v}
      </dd>
    </div>
  );
}

/** Sí/No con icono (capacidades del runtime). */
export function SiNo({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span
      className={cn(
        "body-md inline-flex items-center gap-1 font-data",
        ok ? "text-(--success)" : "text-(--neutral-state)",
      )}
    >
      {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
      {texto}
    </span>
  );
}

// ─── formatos compartidos ───────────────────────────────────────────────────

export function fmtMB(v: number | null): string {
  if (v === null) return "no informado";
  return v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`;
}

export function fmtN(v: number | null, sufijo: string): string {
  return v === null ? "no informado" : `${v} ${sufijo}`;
}
