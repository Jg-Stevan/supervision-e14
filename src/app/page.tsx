import { SupervisionShell } from "@/modules/supervision/components/supervision-shell";

/**
 * Monitor Global (kit SUP-1 §2.4 / kit SUP-3 D11). La página solo monta el
 * shell: TODO el dato vive ahora en el store cliente del módulo
 * (datos-provider, carga async del mock con skeletons — kit SUP-3 T2/T3),
 * porque las acciones de T4 y la vida de T3 mutan el estado sin recargar.
 * No se necesita Suspense de servidor (la carga es client-side).
 */
export default function PaginaMonitorGlobal() {
  return <SupervisionShell />;
}
