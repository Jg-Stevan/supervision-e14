/**
 * KIT perfil-recursos-v1 — contrato de dominio del PERFIL DE RECURSOS.
 *
 * PROPÓSITO: que la app IDENTIFIQUE los recursos reales del dispositivo
 * (gama baja/media/alta · celular/tablet/escritorio) para APROVECHARLOS.
 *
 * Relación con el kit e14-gama-adaptativa-v1 (D74):
 * · El tier es PARIDAD con §4.4 (obs/dispositivo.ts): mismas reglas BAJO/
 *   MEDIO/ALTO para que el chip de Carga Masiva y este panel NUNCA
 *   discrepen. Las señales NUEVAS (GPU, WASM, benchmark, forma) son
 *   EVIDENCIA — nunca condenan ni elevan el tier v1.
 * · D6: este módulo DETECTA y RECOMIENDA — jamás configura la app por su
 *   cuenta. El único enforcement sigue siendo la capa adaptativa de MASIVA
 *   (gama.ts) con su flag revocable. El plan recomendado es un CATÁLOGO
 *   que los consumidores adoptan acotadamente.
 *
 * Null HONESTO donde el navegador no da el dato (iOS: deviceMemory,
 * batería, performance.memory — jamás inventar).
 */

/** Tier del dispositivo. "PENDIENTE" = sin medir (SSR / primer pase). */
export type Tier = "ALTO" | "MEDIO" | "BAJO" | "PENDIENTE";

/** Factor de forma del dispositivo (computador o celular — petición del dueño). */
export type FactorForma = "escritorio" | "tablet" | "celular" | "desconocido";

/** Confianza del tier = proporción de señales decisivas DISPONIBLES. */
export type Confianza = "alta" | "media" | "baja" | "pendiente";

/** Veredicto de una señal en la evidencia del tier. */
export type Veredicto = "favorable" | "debil" | "inconcluso";

/** Una fila de evidencia (el PORQUÉ del tier — auditable en pantalla). */
export interface SenalEvidencia {
  clave: string;
  etiqueta: string;
  valor: string | null;
  veredicto: Veredicto;
  detalle: string;
}

/** Señales sincrónicas del navigator/performance (primer pase, sin await). */
export interface SenalesSync {
  nucleos: number | null;
  memoriaGB: number | null;
  heapLimiteMB: number | null;
  heapUsadoMB: number | null;
  redTipo: string | null;
  redDownlinkMbps: number | null;
  saveData: boolean | null;
  redWifi: boolean | null;
  touchMax: number | null;
  pantallaW: number | null;
  pantallaH: number | null;
  dpr: number | null;
  ua: string;
  os: string;
  navegador: string;
  plataforma: string | null;
}

/** Capacidades del GPU (WebGL) — relevantes para ONNX/Canvas pesado. */
export interface CapacidadGpu {
  disponible: boolean;
  renderer: string | null;
  vendedor: string | null;
  webgl2: boolean;
  webgpu: boolean;
  maxTexturaLado: number | null;
}

/** Capacidades del runtime (WASM/JS) — relevantes para OCR/QR rápido. */
export interface CapacidadesRuntime {
  wasmBasico: boolean;
  wasmSimd: boolean;
  wasmHilos: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  offscreenCanvas: boolean;
  serviceWorker: boolean;
}

/** Señales async (batería + storage — segundo pase al montar). */
export interface SenalesAsync {
  bateriaNivel: number | null;
  bateriaCargando: boolean | null;
  storageTotalMB: number | null;
  storageUsadoMB: number | null;
  storageLibreMB: number | null;
}

/** Resultado del micro-benchmark (EVIDENCIA — no decide el tier v1). */
export interface BenchmarkResultado {
  ejecutado: boolean;
  /** Score normalizado 0..1000 (1000 ≈ PC de referencia del kit). */
  score: number | null;
  cpuOpsMs: number | null;
  memMBs: number | null;
  rasterMs: number | null;
  duracionMs: number | null;
  nota: string;
}

/** Todas las señales de un pase de detección. */
export interface RecursoSenales {
  sync: SenalesSync;
  async: SenalesAsync;
  gpu: CapacidadGpu;
  runtime: CapacidadesRuntime;
  forma: FactorForma;
}

/** Perfil completo consumible por la UI y los módulos. */
export interface PerfilRecursos {
  /** false = todavía en SSR / primer pase — la UI muestra esqueleto. */
  listo: boolean;
  tier: Tier;
  /** true = tier deducido sin deviceMemory (iOS) por núcleos + heap. */
  tierInferido: boolean;
  confianza: Confianza;
  /** Porcentaje 0..100 de señales decisivas presentes. */
  confianzaPct: number;
  evidencia: SenalEvidencia[];
  senales: RecursoSenales | null;
  benchmark: BenchmarkResultado;
}

/** Una fila del plan de recursos recomendado (tabla del panel). */
export interface FilaRecomendacion {
  parametro: string;
  base: string;
  recomendado: string;
  nota: string;
}

/** Plan de recursos SUGERIDO para este dispositivo (catálogo D6-safe).
 *  Los valores numéricos son consumibles por módulos (MASIVA, supervisión)
 *  de forma ACOTADA y REVOCABLE — cada consumidor decide, el override
 *  manual del dueño siempre manda. */
export interface PlanRecursos {
  tier: Tier;
  forma: FactorForma;
  filas: FilaRecomendacion[];
  /* — valores consumibles — */
  poolWorkers: number;
  ocrThreads: number;
  masterLadoMayor: number;
  precalorCola: number;
  qrLadoLargo: number;
  cacheThumbsMB: number;
  preloadModelos: boolean;
  animaciones: "reducidas" | "normales" | "completas";
  /** Hilos WASM aprovechables HOY (requiere crossOriginIsolated). */
  hilosWasmActivos: boolean;
  /** Sincronización de datos SOLO en wifi (red débil/saveData). */
  sincronizarSoloWifi: boolean;
}
