import { cn } from "@/lib/utils";

/**
 * Esqueleto de carga del módulo (kit SUP-3 T3). shadcn no trae Skeleton
 * instalado y el whitelist del kit no permite tocar components/ui — un
 * placeholder `animate-pulse` del propio módulo (tokens intactos, sin
 * sombras).
 */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[4px] bg-(--surface)", className)}
    />
  );
}

/** Esqueleto del Monitor Global: 5 KPIs + filtros + barra + tabla (T3). */
export function EsqueletoMonitor() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando monitor global">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Esqueleto key={i} className="h-[86px] border border-border" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Esqueleto key={i} className="h-11" />
        ))}
      </div>
      <Esqueleto className="h-12" />
      <Esqueleto className="h-96 border border-border" />
    </div>
  );
}
