"use client";

import type { EventoActa, NivelEventoActa } from "../../domain/acta";

/**
 * Timeline vertical del acta (kit SUP-4 §2.2 / T5.5): línea border-l
 * outline-variant, puntos de color por nivel, evento más reciente ARRIBA
 * (el orden del array — los eventos nuevos se insertan al frente).
 *
 * Colores del punto (kit T5.5): CRITICO → error, ALERTA →
 * secondary-fixed-dim (#e9c400), NEUTRAL → outline (#869583), APROBADA →
 * primary (color nuevo permitido por el kit).
 */

const COLOR_PUNTO: Record<NivelEventoActa, string> = {
  CRITICO: "var(--danger)",
  ALERTA: "#e9c400", // secondary-fixed-dim (kit §2.1) — no es token del tema
  NEUTRAL: "var(--outline-strong)",
  APROBADA: "var(--primary)",
};

export function ActaHistorial({ eventos }: { eventos: EventoActa[] }) {
  return (
    <div className="space-y-2">
      <p className="label-caps text-muted-foreground">
        Historial y trazabilidad
      </p>
      {eventos.length === 0 ? (
        <p className="body-md text-muted-foreground">Sin eventos registrados.</p>
      ) : (
        <ol className="ml-1.5 border-l border-(--outline-variant) pl-4">
          {eventos.map((evento, indice) => (
            <li key={`${evento.hora}-${evento.titulo}-${indice}`} className="relative pb-4 last:pb-0">
              {/* Punto sobre la línea (borde = fondo de la sidebar, D14). */}
              <span
                className="absolute top-1 -left-[22px] size-2.5 rounded-full border-2 border-(--card)"
                style={{ backgroundColor: COLOR_PUNTO[evento.nivel] }}
                aria-hidden
              />
              <p className="font-data text-[11px] text-(--outline-strong)">
                {evento.hora}
              </p>
              <p className="label-caps mt-0.5 text-foreground">{evento.titulo}</p>
              <p className="mt-0.5 text-[11px] leading-4 normal-case text-muted-foreground">
                {evento.detalle}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
