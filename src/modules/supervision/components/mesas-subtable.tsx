"use client";

import { toast } from "sonner";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { AccionMesa, EstadoDelegado, Mesa } from "../domain/types";
import { StatusBadge } from "./status-badge";

const MENSAJE_DEMO = "Función de demostración — sin backend";

const ETIQUETAS_ACCION: Record<AccionMesa, string> = {
  reinspeccionar: "Reinspeccionar",
  notificar: "Notificar",
};

function ChipParte({
  etiqueta,
  estado,
  alerta,
}: {
  etiqueta: string;
  estado: EstadoDelegado;
  alerta?: string;
}) {
  const ok = estado === "ok";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "body-md inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5",
          ok
            ? "border-border text-foreground"
            : "border-border text-muted-foreground"
        )}
      >
        {etiqueta}
        {ok ? (
          <Check className="size-3 text-(--success)" aria-label="Completo" />
        ) : (
          <Clock className="size-3 text-(--warning)" aria-label="Pendiente" />
        )}
      </span>
      {alerta && (
        <span className="body-md inline-flex items-center gap-1 rounded-[4px] border border-(--danger) px-1.5 py-0.5 text-(--danger)">
          <AlertTriangle className="size-3" aria-hidden />
          {alerta}
        </span>
      )}
    </span>
  );
}

/**
 * Sub-tabla de mesas de un puesto expandido (kit §2.4).
 * Fondo hundido (surface-lowest). Acciones → toast de demostración.
 */
export function MesasSubtable({ mesas }: { mesas: Mesa[] }) {
  if (mesas.length === 0) {
    return (
      <div className="bg-(--surface-lowest) px-4 py-4">
        <p className="body-md text-muted-foreground">
          Sin detalle de mesas para este puesto en los datos demo.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-(--surface-lowest) px-4 py-3 md:px-6">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">
          Detalle de mesas del puesto seleccionado
        </caption>
        <thead>
          <tr>
            {[
              "Mesa",
              "Delegados",
              "Transmisión",
              "Estado mesa",
              "Última carga",
              "Acción",
            ].map((encabezado) => (
              <th
                key={encabezado}
                scope="col"
                className="label-caps border-b border-border pb-2 text-muted-foreground"
              >
                {encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mesas.map((mesa) => (
            <tr key={mesa.id} className="border-b border-border last:border-b-0">
              <td className="body-md py-2.5 pr-4">{mesa.id}</td>
              <td className="py-2.5 pr-4">
                <span className="flex items-center gap-1.5">
                  <ChipParte etiqueta="P1" estado={mesa.delegados.p1} />
                  <ChipParte etiqueta="P2" estado={mesa.delegados.p2} />
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <span className="flex items-center gap-1.5">
                  <ChipParte
                    etiqueta="P1"
                    estado={mesa.transmision.p1.estado}
                  />
                  <ChipParte
                    etiqueta="P2"
                    estado={mesa.transmision.p2.estado}
                    alerta={mesa.transmision.p2.alerta}
                  />
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <StatusBadge estado={mesa.estadoMesa} />
              </td>
              <td className="body-md py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                {mesa.ultimaCarga ?? "—"}
              </td>
              <td className="py-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "label-caps h-11 border px-3 shadow-none hover:bg-transparent",
                    mesa.accionSugerida === "reinspeccionar"
                      ? "border-(--danger) text-(--danger) hover:bg-(--danger)/10"
                      : "border-(--warning) text-(--warning) hover:bg-(--warning)/10"
                  )}
                  onClick={() => toast(MENSAJE_DEMO)}
                >
                  {ETIQUETAS_ACCION[mesa.accionSugerida]}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
