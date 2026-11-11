/**
 * OpcionesPlan (FASE 2 — punto de inversión §3.1 del mapa v2.3, con la
 * corrección D3: 6 consumidores en D).
 *
 * El paquete NO conoce `adaptacion/plan.ts` (D) ni `gama.ts` (S): todo lo
 * adaptativo que afecta la LECTURA se lee de aquí. La app anfitriona
 * inyecta sus valores reales en su archivo de configuración:
 *   · digielect14: adaptacion/plan + flags (presupuestoProbeOrientacionEfectivo,
 *     numThreadsOcrEfectivos, probeMiniLado, qrBrujulaWarpPases, planAdaptativo().tier)
 *   · supervision-e14: gama/flagsMasivaEfectivos + flags (ocrThreadsTope, tier)
 *
 * Sin inyección: los DEFAULTS HISTÓRICOS (byte-idénticos al comportamiento
 * de hoy con adaptación OFF — plan.ts de D: PROBE_ORIENTACION_DEFAULT_MS
 * 12_000, esperaWorker 5_000; flags.ts de D: probeMiniLado 1280,
 * qrBrujulaWarpPases 0, ocrRec* {480,40,6,false,false,14,14,7}).
 */
export interface OpcionesPlan {
  /** Hilos efectivos del OCR (D: numThreadsOcrEfectivos — COOP+plan;
   *  S: min(flagsMasivaEfectivos().ocrThreadsTope, hardwareConcurrency)).
   *  Default 1: conservador — sin certificar crossOriginIsolated no se
   *  activan threads (la app que los tiene LOS INYECTA). */
  topeThreadsOcr: () => number;
  /** Presupuesto del probe de orientación en ms (default 12_000). */
  presupuestoProbeOrientacion: () => number;
  /** Lado de la miniatura del probe (default 1280). */
  ladoMiniProbe: () => number;
  /** Pases de warp de la brújula QR (default 0). */
  pasesBrujulaWarp: () => number;
  /** Tier del dispositivo (null = sin plan → presupuesto unificado). */
  tier: () => "ALTO" | "MEDIO" | "BAJO" | null;
  /** Knobs del tensor del rec (defaults históricos de flags.ts de D). */
  knobsRec: () => {
    anchoMax: number;
    alto: number;
    lote: number;
    suave: boolean;
    wFija: boolean;
    cabecera: number;
    pie: number;
    bordesRescate: number;
  };
  /** E3 — UN solo `getImageData` por lote del tensor (atlas contiguo en vez
   *  de una lectura por canvas). Default ausente = comportamiento de hoy:
   *  N lecturas. La app la inyecta desde su flag `ocrTensorAtlas`. */
  atlasTensorOcr?: () => boolean;
}

const DEFAULTS: OpcionesPlan = {
  topeThreadsOcr: () => 1,
  presupuestoProbeOrientacion: () => 12_000,
  ladoMiniProbe: () => 1280,
  pasesBrujulaWarp: () => 0,
  tier: () => null,
  knobsRec: () => ({
    anchoMax: 480,
    alto: 40,
    lote: 6,
    suave: false,
    wFija: false,
    cabecera: 14,
    pie: 14,
    bordesRescate: 7,
  }),
};

/** Plan vivo del paquete (los consumidores leen de aquí). */
export const opcionesPlan: OpcionesPlan = { ...DEFAULTS };

/** Inyecta los valores reales de la app (parcial — el resto queda default). */
export function configurarPlan(parcial: Partial<OpcionesPlan>): void {
  Object.assign(opcionesPlan, parcial);
}
