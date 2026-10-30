"use client";

import { AlertTriangle, Check, Clock, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { EstadoDelegado, Mesa } from "../domain/types";
import { StatusBadge } from "./status-badge";

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
 * D43 — columnas fijas de la sub-tabla (misma técnica que la matriz):
 * anchos estables y proporcionales, suman 100. La columna Acción reserva
 * 20% para caber «REINSPECCIONAR» (w-36) + «VER ACTA» sin apretujones.
 */
const COLUMNAS_MESAS = [
  { ancho: "8%", align: "left" }, // Mesa
  { ancho: "22%", align: "left" }, // Delegados
  { ancho: "26%", align: "left" }, // Transmisión
  { ancho: "12%", align: "left" }, // Estado mesa
  { ancho: "12%", align: "left" }, // Última carga
  { ancho: "20%", align: "left" }, // Acción
] as const;

/**
 * Sub-tabla de mesas de un puesto expandido (kit SUP-1 §2.4).
 * Fondo hundido (surface-lowest).
 *
 * KIT SUP-3 T4: la acción REINSPECCIONAR tiene ESTADO real (mock):
 * spinner ~2.5 s → resuelve el alerta "Rescaneo", recalcula mesa y
 * puesto, agrega notificación + toast (el store lo hace; aquí solo se
 * desencadena y se muestra el estado de carga).
 *
 * KIT monitor-jornada-v1 — retiro del botón NOTIFICAR (pedido del dueño:
 * «en el momento no se está utilizando»): la única acción de mesa es
 * REINSPECCIONAR, y SOLO se pinta cuando `accionSugerida ===
 * "reinspeccionar"` (mesas con alerta de rescaneo). Para el resto de
 * mesas la columna Acción muestra únicamente el botón fantasma VER ACTA.
 * El campo `accionSugerida` del dominio queda intacto (dato, no UI).
 *
 * KIT SUP-4 T3.4: botón fantasma VER ACTA (FileText) por fila — abre el
 * visor en TRANSMISIÓN página 1; deshabilitado en mesas sin transmisión
 * (NO_INICIADO) con title "Sin transmisión".
 */
export function MesasSubtable({
  mesas,
  puestoId,
  mesaEnAccionId,
  onReinspeccionar,
  onAbrirVisor,
}: {
  mesas: Mesa[];
  puestoId: string;
  /** Mesa con acción en curso (spinner en SU botón). */
  mesaEnAccionId: string | null;
  onReinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
  /** R4-C6 — VER ACTA por props (callback estable): la sub-tabla no se
   * suscribe al contexto y el flujo del visor no la re-renderiza. */
  onAbrirVisor: (puestoId: string, mesaId: string) => void;
}) {
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
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
        <colgroup>
          {COLUMNAS_MESAS.map((columna, indice) => (
            <col key={indice} style={{ width: columna.ancho }} />
          ))}
        </colgroup>
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
          {mesas.map((mesa) => {
            const enAccion = mesaEnAccionId === mesa.id;
            const esReinspeccion = mesa.accionSugerida === "reinspeccionar";
            return (
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
                      alerta={mesa.transmision.p1.alerta}
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
                  <span className="flex items-center gap-1.5">
                    {/* Retiro NOTIFICAR (kit monitor-jornada-v1): la acción
                        de mesa SOLO existe para rescaneos pendientes. */}
                    {esReinspeccion && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={enAccion || mesaEnAccionId !== null}
                        className="label-caps h-11 w-36 border border-(--danger) px-3 text-(--danger) shadow-none hover:bg-(--danger)/10 disabled:opacity-70"
                        onClick={() => void onReinspeccionar(puestoId, mesa.id)}
                      >
                        {enAccion ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Procesando…
                          </>
                        ) : (
                          "Reinspeccionar"
                        )}
                      </Button>
                    )}
                    {/* KIT SUP-4 — VER ACTA (punto de entrada 1/3). */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      disabled={mesa.estadoMesa === "NO_INICIADO"}
                      title={
                        mesa.estadoMesa === "NO_INICIADO"
                          ? "Sin transmisión"
                          : "Ver acta"
                      }
                      aria-label={`Ver acta de la mesa ${mesa.id}`}
                      onClick={() => onAbrirVisor(puestoId, mesa.id)}
                    >
                      <FileText className="size-4" aria-hidden />
                    </Button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
