/**
 * FASE 2 — WRAPPER: probe del paquete + lo adaptativo de S.
 * Presupuesto: 12 s literal (PROBE_BUDGET_MS de S — igual al default
 * del paquete). LadoMini: flags.probeMiniLado con fallback 320 del kit
 * e14-probe-mini768-v1 (S), no el 1280 de D.
 */
import { configurarPlan } from "@jg-stevan/scanner-core/dominio/plan";
import { leerFlags } from "./flags";

configurarPlan({
  presupuestoProbeOrientacion: () => 12_000,
  ladoMiniProbe: () => {
    try {
      const v = leerFlags().probeMiniLado;
      return typeof v === "number" && Number.isFinite(v) ? v : 320;
    } catch {
      return 320;
    }
  },
});

export * from "@jg-stevan/scanner-core/geom/orientacion";
