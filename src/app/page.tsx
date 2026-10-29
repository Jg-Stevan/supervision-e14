import { SupervisionShell } from "@/modules/supervision/components/supervision-shell";

/**
 * Monitor Global (kit SUP-1 §2.4 / kit SUP-3 D11). La página solo monta el
 * shell: TODO el dato vive en el store cliente del módulo (datos-provider,
 * carga async del mock con skeletons — kit SUP-3 T2/T3).
 */
export default function PaginaMonitorGlobal() {
  return <SupervisionShell />;
}
