import { KpiCard } from "@/modules/supervision/components/kpi-card";
import { MonitorGlobal } from "@/modules/supervision/components/monitor-global";
import { SupervisionShell } from "@/modules/supervision/components/supervision-shell";
import { mockSupervisionRepository } from "@/modules/supervision/data/mock-repository";

/**
 * Monitor Global (kit §2.4). Server Component: pide los datos al
 * repositorio (mock) y compone shell + KPIs + Monitor Global. La
 * interactividad vive en los componentes cliente del módulo.
 */
export default function PaginaMonitorGlobal() {
  const repo = mockSupervisionRepository;
  const resumen = repo.getResumen();
  const puestos = repo.getPuestos();

  return (
    <SupervisionShell>
      <div className="space-y-4 p-4 md:p-6">
        <section
          aria-label="Resumen global del sistema"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
        >
          <KpiCard titulo="Total puestos" valor={resumen.total} tono="neutral" />
          <KpiCard titulo="Completo" valor={resumen.completo} tono="success" />
          <KpiCard titulo="Crítico" valor={resumen.critico} tono="danger" />
          <KpiCard titulo="Pendiente" valor={resumen.pendiente} tono="warning" />
          <KpiCard
            titulo="No iniciado"
            valor={resumen.noIniciado}
            tono="neutral"
          />
        </section>

        <MonitorGlobal puestos={puestos} resumen={resumen} />
      </div>
    </SupervisionShell>
  );
}
