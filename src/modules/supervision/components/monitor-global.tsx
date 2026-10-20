"use client";

import { useMemo, useState } from "react";
import { FiltrosBar } from "./filtros-bar";
import { PuestosTable } from "./puestos-table";
import { ResumenChips } from "./resumen-chips";
import type { FiltrosPuestos, Puesto, ResumenGlobal } from "../domain/types";

/**
 * Coordinador cliente del Monitor Global (kit §3-T4): posee el estado de
 * filtros y los aplica con useMemo sobre los datos del repositorio. El
 * resumen de estado es global (no cambia con los filtros).
 */
export function MonitorGlobal({
  puestos,
  resumen,
}: {
  puestos: Puesto[];
  resumen: ResumenGlobal;
}) {
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

  return (
    <section className="space-y-4" aria-label="Monitor global">
      <FiltrosBar puestos={puestos} filtros={filtros} onFiltros={setFiltros} />
      <ResumenChips resumen={resumen} />
      <PuestosTable puestos={filtrados} expandidoInicialId={puestos[0]?.id} />
    </section>
  );
}
