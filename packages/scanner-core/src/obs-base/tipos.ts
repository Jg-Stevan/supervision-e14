/**
 * Contrato BASE de eventos del bloque obs (ítem 3.6, costura ①).
 * Las líneas 1-122 son BYTE-IDÉNTICAS en digielect14 y supervision-e14
 * (verificado con diff — es el contrato compartido del evento):
 * TipoEvento, Tier, Breadcrumb, ErrorEvento, PerfActa, SaludSnapshot,
 * UsoContador, HangEvento, PoliticaDatos, EventoObs, ErroresAgrupados.
 * Lo que NO está aquí (FlagsApp, ReporteSesion, HangPorOp, EnvioDetalle)
 * diverge POR DISEÑO (tipos de producto — cada app tipifica lo suyo) y
 * vive en el obs/tipos.ts de CADA app, que re-exporta esta base.
 */
/**
 * KIT e14-observabilidad-v1 — contratos del módulo obs.
 * SOLO tipos: cero lógica runtime. Fuente de verdad: README-KITS.md §4.
 */
export type TipoEvento = "error" | "warn" | "perf" | "salud" | "uso" | "hang"; // ANEXO Agente C: "hang" NUEVO AL FINAL (contrato D57: append-only)
export type Tier = "ALTO" | "MEDIO" | "BAJO";

export interface Breadcrumb {
  t: number; // epoch ms
  tipo: "click" | "vista" | "cola" | "store" | "red";
  detalle: string; // aria-label / data-accion / transición — SIN contenido de actas
}

export interface ErrorEvento {
  mensaje: string; // truncado 500
  stack: string; // truncado 2000
  tipo: string; // constructor del error
  archivo: string | null; // primer frame del stack dentro de src/
  digest: string; // FNV-1a 8 hex (digestDe)
  breadcrumbs: Breadcrumb[]; // últimos 30 al momento del fallo
}

export interface PerfActa {
  actaIdHash: string; // FNV-1a — JAMÁS el id plano
  status: string;
  intento: number;
  tiempos: Record<string, number>;
  scoreVisual: number;
  scoreFinal: number;
  gate: string;
  ocrValido: boolean;
}

export interface SaludSnapshot {
  memoriaMB: number | null; // performance.memory?.usedJSHeapSize / 1048576
  nucleos: number;
  memoriaGB: number | null; // navigator.deviceMemory (null en iOS)
  bateria: { nivel: number | null; cargando: boolean | null }; // null en iOS
  red: { tipo: string | null; downlinkMbps: number | null; saveData: boolean };
  storageLibreMB: number | null;
  tier: Tier;
  tierInferido: boolean;
  /** KIT e14-obs-hang-atribucion-v1 (§F v1.1) — Date.now() al CAPTURAR. Sin
   *  ts, las narrativas de memoria (picos/GC/recuperación) son indatables
   *  (dictamen 1045/1048: baterías 0.74 → 0.54 → 0.53 = horas de span, no un
   *  ciclo de una corrida). AUSENTE en eventos legacy — jamás inventar. */
  ts?: number;
}

export interface UsoContador {
  dia: string; // "2026-10-23" (hora local)
  vista: string;
  accion: string;
  n: number;
}

/** ANEXO AGENTE C (REPARTE-3-AGENTES-v1, Pieza 2) — evento de CONGELÓN del
 *  main thread. PRIVACIDAD dura (qa-obs-privacidad): solo DURACIONES y
 *  momentos — jamás contenido de actas. breadcrumbs = los últimos 30 al
 *  momento del congelón (Breadcrumb ya es sin-contenido por contrato). */
export interface HangEvento {
  fuente: "drift" | "longtask" | "hang-en-curso"; // drift = gap del intervalo 500 ms · longtask = PerformanceObserver · hang-en-curso = marca del WAL drenada al arranque (KIT e14-obs-hang-atribucion-v1 §C — la duración real murió con la página: duracionMs = umbralMs, mínimo demostrable §1; resumenHangsDe ya filtra typeof duracionMs === "number" y el mínimo es honesto para cuenta/mayor/total)
  duracionMs: number; // gap REAL medido (kit: captura el gap real) o duración de la task
  umbralMs: number; // umbral que disparó el registro (3 000 drift · 50 longtask)
  breadcrumbs: Breadcrumb[]; // contexto de navegación alrededor (sin contenido)
  /** §G.4 — ORDEN-WAVE3-add-envio-individual-v1 (obs-envio-individual-v1):
   *  estado de VISIBILIDAD al momento de la detección (AL FINAL — D57).
   *  En background el SO congela los timers: el gap NO es congelón (fantasma
   *  real del informe 1230: 117 s de pantalla bloqueada contaban como hang).
   *  Eventos legacy sin el campo → tratar como visible (`?? true`). */
  visible: boolean;
  /** KIT e14-obs-hang-atribucion-v1 (D58) — última operación REGISTRADA al
   *  detectarse el hang (§A — vocabulario append-only). Ausente = sin
   *  registro (eventos legacy / nada marcado — jamás inventar). */
  op?: string;
  /** Edad de la marca al emitir (ms) — el sesgo es parte del dato. */
  opEdadMs?: number;
  // ─── KIT e14-obs-hang-atribucion-v1 (§C.6) — SOLO fuente "hang-en-curso" ───
  /** epoch ms del último beat ANTES del silencio (marca del WAL). */
  inicio?: number;
  /** epoch ms en que el worker cruzó el umbral (marca del WAL). */
  detectadoEn?: number;
  /** Arranque NUEVO − inicio: cuánto tardó la sesión nueva en descubrir
   *  la marca sobreviviente (el sesgo es parte del dato). */
  gapHastaReinicioMs?: number;
  /** Sesión de ORIGEN (la que colgó) — la del evento es la NUEVA que
   *  descubre la marca (appendEvento sella con identidad actual). */
  sesionOrigen?: string;
  /** appVersion de ORIGEN (la que colgó). */
  appVersionOrigen?: string;
}

export interface PoliticaDatos {
  metadatos: boolean; // default TRUE
  textoOcr: boolean; // default FALSE
  miniaturas: boolean; // default FALSE
  saludEnVivo: boolean; // default TRUE (solo corre con modo dev ON)
}

export interface EventoObs {
  id: string; // crypto.randomUUID()
  ts: number;
  tipo: TipoEvento;
  sesion: string; // UUID por sesión
  dispositivo: string; // UUID persistente
  appVersion: string;
  datos: ErrorEvento | PerfActa | SaludSnapshot | UsoContador | HangEvento | Record<string, unknown>;
}

export interface ErroresAgrupados {
  digest: string;
  severidad: "error" | "warn";
  tipo: string;
  mensaje: string;
  archivo: string | null;
  veces: number;
  primera: number;
  ultima: number;
  versiones: string[];
  breadcrumbsRecientes: Breadcrumb[]; // del evento más reciente
}

