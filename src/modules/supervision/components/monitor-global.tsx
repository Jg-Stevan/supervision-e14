"use client";

import { useMemo, useState } from "react";
import { FiltrosBar } from "./filtros-bar";
import { KpiCard, type TonoKpi } from "./kpi-card";
import { PuestosTable } from "./puestos-table";
import { ResumenChips } from "./resumen-chips";
import { EsqueletoMonitor } from "./esqueleto";
import { useDatos } from "./datos-provider";
import type { EstadoGlobal, FiltrosPuestos } from "../domain/types";

/**
 * Vista Monitor Global (SUP-1 §3-T4 + kit SUP-3 T3): coordinador cliente
 * que consume el store del shell (datos-provider). VIVA: skeletons en la
 * primera carga, ticker de sincronización, KPI cards clickeables (filtro
 * de estado toggle) y tabla con transiciones en vivo. El estado inicial
 * (D6) NUNCA muta: 20/5/1/4/10 exactos al cargar.
 */
export function VistaMonitor() {
  const {
    cargando,
    puestos,
    mesasPorPuesto,
    resumen,
    segundosDesdeSync,
    mesaEnAccionId,
    reinspeccionar,
    notificar,
  } = useDatos();
  const [filtros, setFiltros] = useState<FiltrosPuestos>({});

  const filtrados = useMemo(() => {
    const q = filtros.busqueda?.trim().toLowerCase() ?? "";
    return puestos.filter((puesto) => {
      if (filtros.pais && puesto.codigoPais !== filtros.pais) return false;
      if (filtros.zona && puesto.zonaId !== filtros.zona) return false;
      if (filtros.puesto && puesto.puesto !== filtros.puesto) return false;
      if (filtros.estado && puesto.estadoGlobal !== filtros.estado) return false;
      if (q) {
        const texto = [
          puesto.id,
          puesto.codigoPais,
          puesto.pais,
          puesto.zona,
          puesto.puesto,
        ]
          .join(" ")
          .toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [puestos, filtros]);

  /** T3 — clic en KPI de estado = toggle del filtro equivalente. */
  const alternarFiltroEstado = (estado: EstadoGlobal) =>
    setFiltros((prev) => ({
      ...prev,
      estado: prev.estado === estado ? undefined : estado,
    }));

  if (cargando) {
    return (
      <div className="p-4 md:p-6">
        <EsqueletoMonitor />
      </div>
    );
  }

  const kpis: {
    titulo: string;
    valor: number;
    tono: TonoKpi;
    estado?: EstadoGlobal;
  }[] = [
    { titulo: "Total puestos", valor: resumen.total, tono: "neutral" },
    {
      titulo: "Completo",
      valor: resumen.completo,
      tono: "success",
      estado: "COMPLETO",
    },
    { titulo: "Crítico", valor: resumen.critico, tono: "danger", estado: "CRITICO" },
    {
      titulo: "Pendiente",
      valor: resumen.pendiente,
      tono: "warning",
      estado: "PENDIENTE",
    },
    {
      titulo: "No iniciado",
      valor: resumen.noIniciado,
      tono: "neutral",
      estado: "NO_INICIADO",
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <section
        aria-label="Resumen global del sistema"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        {kpis.map(({ titulo, valor, tono, estado }) => (
          <KpiCard
            key={titulo}
            titulo={titulo}
            valor={valor}
            tono={tono}
            onClick={estado ? () => alternarFiltroEstado(estado) : undefined}
            activo={estado !== undefined && filtros.estado === estado}
          />
        ))}
      </section>

      <section className="space-y-4" aria-label="Monitor global">
        <FiltrosBar puestos={puestos} filtros={filtros} onFiltros={setFiltros} />
        <ResumenChips
          resumen={resumen}
          sincronizadoHace={`Sincronizado hace ${segundosDesdeSync}s`}
        />
        <PuestosTable
          puestos={filtrados}
          mesasPorPuesto={mesasPorPuesto}
          expandidoInicialId={filtrados[0]?.id}
          mesaEnAccionId={mesaEnAccionId}
          onReinspeccionar={reinspeccionar}
          onNotificar={notificar}
        />
      </section>
    </div>
  );
}
