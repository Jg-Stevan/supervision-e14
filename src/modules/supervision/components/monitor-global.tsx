"use client";

import { useMemo, useState } from "react";
import { FiltrosBar } from "./filtros-bar";
import { KpiCard, type TonoKpi } from "./kpi-card";
import { PuestosTable } from "./puestos-table";
import { ResumenChips } from "./resumen-chips";
import { EsqueletoMonitor } from "./esqueleto";
import { useDatos, useDatosAcciones, useDatosTicker, resumenDePuestos } from "./datos-provider";
import { tramoDeMinutos } from "../domain/tiempo-cierre";
import type { EstadoGlobal, FiltrosPuestos } from "../domain/types";

/**
 * Vista Monitor Global (SUP-1 §3-T4 + kit SUP-3 T3): coordinador cliente
 * que consume el store del shell (datos-provider). VIVA: skeletons en la
 * primera carga, ticker de sincronización, KPI cards clickeables (filtro
 * de estado toggle) y tabla con transiciones en vivo. El estado inicial
 * (D6) NUNCA muta: 20/5/1/4/10 exactos al cargar.
 *
 * KIT monitor-jornada-v1: el select FECHA lista la semana electoral real
 * (lun 15 → dom 21 de junio de 2026). Elegir un día filtra la matriz Y
 * los KPIs — cada jornada se supervisa aislada, sin mezclar puestos de
 * días distintos (pedido del dueño). La regla de resumen es la MISMA
 * derivación del store (resumenDePuestos) sobre el conjunto del día.
 */
export function VistaMonitor() {
  const {
    cargando,
    puestos,
    mesasPorPuesto,
    mesaEnAccionId,
  } = useDatos();
  // R4-C6 — las acciones viven en SU contexto (el visor/acciones ya no
  // viaja en el valor grande). abrirVisor/abrirVisorDePuesto se pasan como
  // props estables a la matriz: las filas no se suscriben a contexto.
  const { reinspeccionar, abrirVisor, abrirVisorDePuesto } = useDatosAcciones();
  // D42 — KIT e14-monitor-memo-v1: los segundos del ticker viven en su
  // contexto hoja — este componente (y las 949 filas) ya NO re-renderiza
  // cada 5 s; solo el chip del ticker lo hace.
  const { segundos: segundosDesdeSync } = useDatosTicker();
  // Pedido del dueño: la vista abre en la jornada del LUNES (primer día
  // de la semana electoral) — KPIs, resumen y matriz cargan SOLO ese día
  // («no cargue todos los puestos de todos los días»). «Todos los días»
  // sigue disponible a mano desde el select FECHA.
  const [filtros, setFiltros] = useState<FiltrosPuestos>({ fecha: "LUNES" });

  // Conjunto del DÍA (solo filtro de fecha): alimenta KPIs y resumen —
  // los otros filtros (país/zona/puesto/búsqueda/estado toggle) siguen
  // afectando SOLO la matriz, como hoy.
  const puestosDelDia = useMemo(
    () =>
      filtros.fecha
        ? puestos.filter((puesto) => puesto.diaJornada === filtros.fecha)
        : puestos,
    [puestos, filtros.fecha]
  );
  const resumenDelDia = useMemo(
    () => resumenDePuestos(puestosDelDia),
    [puestosDelDia]
  );

  const filtrados = useMemo(() => {
    const q = filtros.busqueda?.trim().toLowerCase() ?? "";
    return puestosDelDia.filter((puesto) => {
      if (filtros.pais && puesto.codigoPais !== filtros.pais) return false;
      if (filtros.zona && puesto.zonaId !== filtros.zona) return false;
      if (filtros.puesto && puesto.puesto !== filtros.puesto) return false;
      if (filtros.estado && puesto.estadoGlobal !== filtros.estado) return false;
      // Filtros de COLUMNA (encabezados de «Cierre COL» y «Tiempo»):
      // valor exacto de cierre en hora COL y tramo del transcurrido.
      if (filtros.cierreCol && puesto.horaCierreColombia !== filtros.cierreCol)
        return false;
      if (
        filtros.tiempo &&
        tramoDeMinutos(puesto.minutosDesdeCierre).id !== filtros.tiempo
      )
        return false;
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
  }, [puestosDelDia, filtros]);

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
    { titulo: "Total puestos", valor: resumenDelDia.total, tono: "neutral" },
    {
      titulo: "Completo",
      valor: resumenDelDia.completo,
      tono: "success",
      estado: "COMPLETO",
    },
    { titulo: "Crítico", valor: resumenDelDia.critico, tono: "danger", estado: "CRITICO" },
    {
      titulo: "Pendiente",
      valor: resumenDelDia.pendiente,
      tono: "warning",
      estado: "PENDIENTE",
    },
    {
      titulo: "No iniciado",
      valor: resumenDelDia.noIniciado,
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
          resumen={resumenDelDia}
          sincronizadoHace={`Sincronizado hace ${segundosDesdeSync}s`}
        />
        <PuestosTable
          puestos={filtrados}
          puestosBase={puestosDelDia}
          filtros={filtros}
          onFiltroColumna={(parcial) =>
            setFiltros((prev) => ({ ...prev, ...parcial }))
          }
          mesasPorPuesto={mesasPorPuesto}
          expandidoInicialId={filtrados[0]?.id}
          mesaEnAccionId={mesaEnAccionId}
          onReinspeccionar={reinspeccionar}
          onAbrirVisor={abrirVisor}
          onAbrirVisorDePuesto={abrirVisorDePuesto}
        />
      </section>
    </div>
  );
}
