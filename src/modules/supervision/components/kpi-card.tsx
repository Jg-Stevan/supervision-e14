"use client";

// R2 — KpiCard vive en src/shared/ui/kpi-card.tsx (§B2 #8 — «mover sin
// cambiar»): este archivo queda como re-export temporal para que sus
// consumidores (monitor-global.tsx, vista-recepcion.tsx) no cambien.
// El mapa tono→token vive en src/shared/ui/tono.ts.
export { KpiCard } from "@/shared/ui/kpi-card";
export type { TonoKpi } from "@/shared/ui/kpi-card";
