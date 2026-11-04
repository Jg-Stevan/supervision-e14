"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ACORDEÓN MÓVIL de la sidebar del visor (plan M1 — diseño
 * `visor_actas_mobile`): en móvil (< 768px) las secciones ACCIONES DEL
 * SUPERVISOR e HISTORIAL Y TRAZABILIDAD van colapsadas al fondo con header
 * `EXPANDIR ∨` / `OCULTAR ∨` (chevron rota 180°); en desktop se muestran
 * siempre abiertas y SIN header (la sección habla por sí sola, kit SUP-4).
 *
 * Sin <details> nativo: el estado lo maneja React (el visor re-renderiza
 * con el zoom — un atributo `open` controlado por render lo reabriría).
 * Accesible: botón con aria-expanded + región con aria-labelledby.
 * Punto de corte: components/consulta-viewport (patrón use-mobile).
 */
export function AcordeonSeccion({
  titulo,
  icono,
  esMovil,
  children,
}: {
  titulo: string;
  icono: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Media query del cliente (useEsMovil — consulta-viewport del módulo). */
  esMovil: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const idTitulo = useId();
  const Icono = icono;
  if (!esMovil) return <>{children}</>;
  return (
    <section className="rounded-[4px] border border-(--border) bg-(--surface-lowest)">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idTitulo}
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center justify-between p-3.5 text-left label-caps text-(--primary) transition-colors hover:bg-(--surface-high) focus-visible:outline-2 focus-visible:outline-(--primary)"
      >
        <span className="flex items-center gap-1.5">
          <Icono className="size-3.5" aria-hidden />
          {titulo}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] normal-case tracking-wider text-muted-foreground">
          {abierta ? "OCULTAR" : "EXPANDIR"}
          <ChevronDown
            className={cn(
              "size-4 text-(--primary) transition-transform duration-200",
              abierta && "rotate-180"
            )}
            aria-hidden
          />
        </span>
      </button>
      {abierta && (
        <div
          id={idTitulo}
          className="border-t border-(--border) p-3.5 [&>div:first-child]:pt-0"
        >
          {children}
        </div>
      )}
    </section>
  );
}
