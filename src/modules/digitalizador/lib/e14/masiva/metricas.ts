"use client";

/**
 * KIT e14-metricas-corrida-v1 (D34 — pedido literal del dueño 2026-10-28):
 * «quiero saber cuánto tardó en procesarse cada acta (individual) para saber
 * cuáles están tardando más… en el mismo masiva un informe de cómo se está
 * comportando la carga masiva, cuánto está tardando, en qué está tardando
 * para tener datos reales y poder diagnosticar bien los fallos».
 *
 * DISEÑO:
 * · OBSERVADOR PASIVO — el pipeline NUNCA cambia por esto (§0 del masiva).
 *   El runner llama en 4 puntos (corrida inicia/fin + desenlace LISTA/ERROR)
 *   con datos QUE YA TIENE EN SCOPE — cero re-lecturas, cero coste nuevo.
 * · PERSISTENCIA PROPIA — IDB SEPARADA `e14-masiva-metricas-v1` (filas de
 *   NÚMEROS, jamás Blob/dataURL — lección L7). Sobrevive recargas y
 *   reinicios de envíos (D33 NO la toca: comparar corridas es el punto).
 * · HONESTIDAD — solo se estampa lo medido (jamás inventar, RED LINE 2):
 *   etapa ausente = campo ausente. La copia DUPLICADA reporta su propio
 *   totalMs (≈0, guard e72) — jamás el OCR heredado de la original.
 * · PRIVACIDAD — el informe es LOCAL del dueño (export manual); fila id +
 *   nombre de archivo SON suyos. Sin telemetría nueva al obs (el canal
 *   obs/ tiene sus reglas de privacidad — actaIdHash — y otro propósito).
 *
 * Contratos reutilizados:
 * · Patrón IDB = abrirCola()/abrirHistorico() (singleton + onupgradeneeded
 *   + rechazo claro). Fallo de IDB → fire-and-forget conservador (kit §3):
 *   el espejo en RAM de la corrida VIVA sigue funcionando para la UI.
 */

// KIT ocr-router-v1 fase 4 — el informe se AUTO-IDENTIFICA: el tier §4.4
// aplicado por la capa adaptativa (gama.ts) y la resolución EN VIVO del
// motor OCR (rapidocr.ts — decisión del router + modelos REALES + origen +
// motivo). Observador pasivo igual que el resto del kit: getters de módulo
// que jamás lanzan, cero coste nuevo, el pipeline NUNCA cambia por esto.
import { planGamaActual } from "../gama";
import { motorOcrActual } from "../ocr/rapidocr";

const DB_NOMBRE = "e14-masiva-metricas-v1";
const DB_VERSION = 1;
const STORE_ACTAS = "actas"; // keyPath "id" — una fila por desenlace (re-put idempotente)
const STORE_CORRIDAS = "corridas"; // keyPath "id" — un registro por corrida
const INDEX_CORRIDA = "porCorrida"; // índice de actas por corridaId
/** Techo de historia: las corridas más viejas se podan (actas incluidas). */
const MAX_CORRIDAS = 30;

// ─── Tipos públicos (contrato del informe) ──────────────────────────────────

/** Desglose de etapas de UNA acta — SOLO campos medidos (jamás 0 inventado;
 *  el 0 de ocrMs de la copia SÍ es un dato — guard e72 — y viaja como tal). */
export interface EtapasMetrica {
  /** D61 — decode del archivo a master (0 = precalentada, dato real). */
  decodeMs?: number;
  /** D61 — detección de página del core. */
  detectMs?: number;
  /** KIT e14-etapas-preocr-v1 (D43) — proceso del bridge: warp INTER_CUBIC ×2
   *  (variante "bw" para mostrar + "original" para leer) + realce. YA se medía
   *  (diagnostico.tiempos.procesoMs — bridge ms.proceso) — ahora VIAJA al
   *  informe. 0 = fase omitida (sinRecorte, SIM-only) → se omite. */
  procesoMs?: number;
  /** KIT e14-etapas-preocr-v1 (D43) — calidad del recorte (Laplaciano +
   *  contraste + brillo). ídem — bridge ms.calidad. */
  calidadMs?: number;
  /** KIT e14-etapas-preocr-v1 (D43) — probe de orientación (mini-OCR 0°,
   *  challengers 90/180/270 si duda). Ya viajaba en
   *  diagnostico.orientacionProbeMs (D57) — ahora TAMBIÉN como etapa del
   *  informe. Ausente = el probe no corrió (SIM/error). */
  orientacionProbeMs?: number;
  /** KIT e14-etapas-preocr-v1 (D43) — PRE-OCR runner-side: el MURO entre el
   *  fin de la espera de cola y el arranque del pipeline del bridge (capa-0
   *  QR + decisiones dedup + origen + deskew + master del intento; los
   *  reintentos del watchdog re-pagan origen/deskew/master → se ACUMULAN).
   *  Hoy es invisible (ni esperaMs ni totalMs lo capturan) — evidencia del
   *  informe 2026-10-30: 6-10 s/acta sin dueño entre decode+detect y ocr.
   *  Incluye la espera APLAZADA por gemela si hubo (tiempo mural honesto).
   *  La matanza/re-creación de workers ENTRE intentos no es pre-OCR (costo
   *  del watchdog) y no se cuenta. Ausente = la fila jamás llegó al bridge
   *  (YA-ENVIADA/copias tempranas — su métrica no pasa por este hook). */
  preOcrMs?: number;
  /** OCR puro (2 pasadas sumadas — el total del reconocedor). */
  ocrMs?: number;
  /** D61 — persistencia del desenlace en IDB. */
  persistMs?: number;
  /** D61 — envío (SHA-256 + POST/reintentos). 0 = baseline local. */
  envioMs?: number;
  /** Sondeo QR de ingesta (worker e73 — fila.sondeoQrMs). */
  sondeoQrMs?: number;
  /** D35 — miniatura de la bandeja (post-pipeline, cosmético — runner.ts
   *  cronometra hacerThumb). Medido para decidir su destino con datos
   *  reales; NO compite por «cuello» (igual que el sondeo). */
  thumbMs?: number;
}

/** Una fila terminada — la unidad del informe por acta. */
export interface MetricaActa {
  id: string; // id de la fila (re-put idempotente — último desenlace gana)
  corridaId: string;
  nombre: string; // nombre del archivo (dueño local — sin hash)
  tsFin: number; // epoch del desenlace
  /** totalMs del pipeline (diagnostico.tiempos.totalMs — contrato: jamás
   *  incluye espera de cola). null = desenlace sin pipeline (copia sin
   *  tiempos / ERROR temprano) — la fila pinta «—» en el informe. */
  totalMs: number | null;
  etapas: EtapasMetrica;
  /** ENVIADA | OPTIMA | ADVERTENCIA | RECHAZADA | DUPLICADA | ERROR … */
  desenlace: string;
  enviadaAuto: boolean;
  score: number | null;
  /** Etapa dominante del trabajo (máx de etapas de TRABAJO — la espera de
   *  cola y el sondeo no son «cuello» del pipeline). null = sin etapas. */
  cuello: string | null;
  esperaMs: number | null; // en cola (t0 − agregadaEn — el dato e66 propio)
  dedup?: string; // marca de dedup de la fila (qr/ya-enviada/v2/…)
  error?: string | null; // motivo corto del ERROR (estado ERROR)
  /** true = la fila nació copiada (reutilizarResultado — jamás pagó OCR). */
  copia: boolean;
}

/** Una corrida = un PROCESAR (o su rearranque) hasta que el bucle drena o
 *  se pausa. El informe muestra la ÚLTIMA + el historial (podado a 30). */
export interface CorridaMetrica {
  id: string; // uuid
  inicio: number;
  fin: number | null; // null = EN CURSO (pausa/recarga la cierra honesta)
  nActas: number; // desenlaces registrados de esta corrida
}

// ─── IDB (mismo patrón de cola.ts/historico.ts) ─────────────────────────────

let dbSingleton: IDBDatabase | null = null;

function abrirMetricas(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbSingleton) {
      resolve(dbSingleton);
      return;
    }
    if (typeof indexedDB === "undefined") {
      reject(new Error("SIN_INDEXEDDB"));
      return;
    }
    const rq = indexedDB.open(DB_NOMBRE, DB_VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE_ACTAS)) {
        const s = db.createObjectStore(STORE_ACTAS, { keyPath: "id" });
        s.createIndex(INDEX_CORRIDA, "corridaId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CORRIDAS)) {
        db.createObjectStore(STORE_CORRIDAS, { keyPath: "id" });
      }
    };
    rq.onsuccess = () => {
      dbSingleton = rq.result;
      rq.result.onclose = () => {
        dbSingleton = null;
      };
      resolve(rq.result);
    };
    rq.onerror = () => reject(rq.error ?? new Error("IDB_METRICAS_ABRIR"));
  });
}

async function put(store: string, valor: unknown): Promise<void> {
  const db = await abrirMetricas();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(valor);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB_METRICAS_PUT"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB_METRICAS_PUT_ABORTADA"));
  });
}

// ─── Estado en RAM (corrida viva + espejo para la UI sin re-lecturas) ────────

let corridaIdViva: string | null = null;
/** Espejo de la corrida VIVA — la UI suscrita recibe updates al instante. */
let actasVivas: MetricaActa[] = [];
const suscritos = new Set<() => void>();

function notificar(): void {
  for (const cb of suscritos) {
    try {
      cb();
    } catch {
      /* un suscriptor muerto jamás tumba el canal (kit §3) */
    }
  }
}

// ─── Cuello (PURO — exportado para QA/UI) ────────────────────────────────────

/** Etapa dominante de TRABAJO: máx de decode/detect/proceso/calidad/
 *  orientacionProbe/preOcr/ocr/persist/envio (D43 — las etapas pre-OCR
 *  nuevas SON trabajo del camino crítico: compiten igual que el OCR).
 *  La espera de cola, el sondeo y el thumb NO compiten por «cuello» (el
 *  sondeo es paralelo a la ingesta; el thumb es post-pipeline cosmético).
 *  null = sin etapas de trabajo medidas. */
export function cuelloDeEtapas(e: EtapasMetrica): string | null {
  let mejor: string | null = null;
  let maxMs = 0;
  for (const [k, v] of Object.entries(e)) {
    if (k === "sondeoQrMs" || k === "thumbMs") continue;
    if (typeof v === "number" && v > maxMs) {
      maxMs = v;
      mejor = k.replace(/Ms$/, "");
    }
  }
  return mejor;
}

// ─── API del runner (4 puntos de hook — todos fire-and-forget) ───────────────

/** Hook 1 — iniciarRunner(): abre corrida. Devuelve el id (el runner NO lo
 *  necesita — el módulo lo guarda). Si una corrida quedó abierta (recarga/
 *  pausa sin finally), se cierra honesta AHÍ (fin = ahora) antes de abrir. */
export function iniciarCorridaMetrica(): void {
  void (async () => {
    try {
      if (corridaIdViva) {
        const abierta = await leerCorrida(corridaIdViva);
        if (abierta && abierta.fin == null) {
          await put(STORE_CORRIDAS, { ...abierta, fin: Date.now() });
        }
      }
      const corrida: CorridaMetrica = {
        id: `corrida-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        inicio: Date.now(),
        fin: null,
        nActas: 0,
      };
      corridaIdViva = corrida.id;
      actasVivas = [];
      await put(STORE_CORRIDAS, corrida);
      await podarCorridasViejas();
      notificar();
    } catch {
      /* conservador — el pipeline manda, la métrica es huésped */
    }
  })();
}

/** Hook 2 — desenlace LISTA real del pipeline (runner): estampa el acta con
 *  el desglose de etapas QUE YA EXISTE en acta.diagnostico.tiempos. */
export function registrarMetricaDesenlace(args: {
  filaId: string;
  nombre: string;
  acta: {
    status: string;
    score?: number;
    enviadoAutomaticamente?: string | null;
    diagnostico?: {
      /** D57 — probe de orientación (top-level del diagnóstico, fuera de
       *  tiempos). KIT e14-etapas-preocr-v1: sube al informe como etapa. */
      orientacionProbeMs?: number;
      tiempos?: {
        totalMs?: number;
        procesoMs?: number;
        calidadMs?: number;
        ocrMs?: number;
        esperaMs?: number | null;
        decodeMs?: number | null;
        detectMs?: number | null;
        persistMs?: number;
        envioMs?: number;
      } | null;
    } | null;
  };
  sondeoQrMs?: number;
  /** D35 — ms de hacerThumb del desenlace LISTA (runner mide el await).
   *  Ausente = sin medición (rutas DUPLICADA/ERROR temprano). */
  thumbMs?: number;
  /** KIT e14-etapas-preocr-v1 (D43) — muro pre-OCR del runner (capa-0 QR +
   *  origen + deskew + master → ver EtapasMetrica.preOcrMs). Ausente = la
   *  fila jamás despachó el bridge (jamás inventar). */
  preOcrMs?: number;
  dedup?: string;
}): void {
  void (async () => {
    try {
      if (!corridaIdViva) return; // sin corrida viva → sin métrica (honesto)
      const t = args.acta.diagnostico?.tiempos ?? null;
      const etapas: EtapasMetrica = {};
      if (typeof t?.decodeMs === "number") etapas.decodeMs = t.decodeMs;
      if (typeof t?.detectMs === "number") etapas.detectMs = t.detectMs;
      // KIT e14-etapas-preocr-v1 (D43) — las etapas OCULTAS suben al informe:
      // proceso/calidad ya se medían en el bridge (ms.proceso/ms.calidad) y el
      // probe viajaba solo en diagnostico.orientacionProbeMs (D57). Guard > 0:
      // 0 = fase omitida (sinRecorte/SIM) — se omite, jamás inventar trabajo.
      if (typeof t?.procesoMs === "number" && t.procesoMs > 0) etapas.procesoMs = t.procesoMs;
      if (typeof t?.calidadMs === "number" && t.calidadMs > 0) etapas.calidadMs = t.calidadMs;
      if (
        typeof args.acta.diagnostico?.orientacionProbeMs === "number" &&
        args.acta.diagnostico.orientacionProbeMs > 0
      ) {
        etapas.orientacionProbeMs = args.acta.diagnostico.orientacionProbeMs;
      }
      if (typeof args.preOcrMs === "number") etapas.preOcrMs = args.preOcrMs;
      if (typeof t?.ocrMs === "number") etapas.ocrMs = t.ocrMs;
      if (typeof t?.persistMs === "number") etapas.persistMs = t.persistMs;
      if (typeof t?.envioMs === "number") etapas.envioMs = t.envioMs;
      if (typeof args.sondeoQrMs === "number") etapas.sondeoQrMs = args.sondeoQrMs;
      if (typeof args.thumbMs === "number") etapas.thumbMs = args.thumbMs;
      const m: MetricaActa = {
        id: args.filaId,
        corridaId: corridaIdViva,
        nombre: args.nombre,
        tsFin: Date.now(),
        totalMs: typeof t?.totalMs === "number" ? t.totalMs : null,
        etapas,
        desenlace: args.acta.status,
        enviadaAuto: args.acta.enviadoAutomaticamente != null,
        score: typeof args.acta.score === "number" ? args.acta.score : null,
        cuello: cuelloDeEtapas(etapas),
        esperaMs: typeof t?.esperaMs === "number" ? t.esperaMs : null,
        dedup: args.dedup,
        copia: false,
      };
      await persistirActa(m);
    } catch {
      /* conservador — fire-and-forget */
    }
  })();
}

/** Hook 2b — copia DUPLICADA (reutilizarResultado): la copia jamás pagó
 *  pipeline — su totalMs propio (≈0, guard e72) y ocrMs=0 EXPLÍCITO viajan
 *  como datos reales; las demás etapas quedan FUERA (heredadas de la
 *  original — no son trabajo de esta fila). */
export function registrarMetricaCopia(args: {
  filaId: string;
  nombre: string;
  status: string;
  score?: number;
  totalMs: number | null;
  esperaMs: number | null;
  ocrMs?: number;
  dedup?: string;
}): void {
  void (async () => {
    try {
      if (!corridaIdViva) return;
      const etapas: EtapasMetrica = {};
      if (typeof args.ocrMs === "number") etapas.ocrMs = args.ocrMs;
      const m: MetricaActa = {
        id: args.filaId,
        corridaId: corridaIdViva,
        nombre: args.nombre,
        tsFin: Date.now(),
        totalMs: args.totalMs,
        etapas,
        desenlace: args.status,
        enviadaAuto: false, // e66 — la copia jamás es envío propio
        score: typeof args.score === "number" ? args.score : null,
        cuello: cuelloDeEtapas(etapas),
        esperaMs: args.esperaMs,
        dedup: args.dedup,
        copia: true,
      };
      await persistirActa(m);
    } catch {
      /* conservador */
    }
  })();
}

/** Hook 3 — desenlace ERROR (catch del runner): la fila murió SIN pipeline
 *  completo — totalMs null (jamás inventar) + motivo corto. */
export function registrarMetricaError(args: {
  filaId: string;
  nombre: string;
  error: string;
  sondeoQrMs?: number;
}): void {
  void (async () => {
    try {
      if (!corridaIdViva) return;
      const etapas: EtapasMetrica = {};
      if (typeof args.sondeoQrMs === "number") etapas.sondeoQrMs = args.sondeoQrMs;
      const m: MetricaActa = {
        id: args.filaId,
        corridaId: corridaIdViva,
        nombre: args.nombre,
        tsFin: Date.now(),
        totalMs: null,
        etapas,
        desenlace: "ERROR",
        enviadaAuto: false,
        score: null,
        cuello: null,
        esperaMs: null,
        error: args.error,
        copia: false,
      };
      await persistirActa(m);
    } catch {
      /* conservador */
    }
  })();
}

/** Hook 4 — finally del bucle: cierra la corrida (drenada o pausada). */
export function cerrarCorridaMetrica(): void {
  void (async () => {
    try {
      if (!corridaIdViva) return;
      const c = await leerCorrida(corridaIdViva);
      if (c && c.fin == null) {
        await put(STORE_CORRIDAS, { ...c, fin: Date.now(), nActas: actasVivas.length });
      }
      corridaIdViva = null;
      notificar();
    } catch {
      /* conservador */
    }
  })();
}

// ─── Lectura para la UI / export ─────────────────────────────────────────────

async function leerCorrida(id: string): Promise<CorridaMetrica | null> {
  const db = await abrirMetricas();
  return new Promise((resolve, reject) => {
    const rq = db.transaction(STORE_CORRIDAS, "readonly").objectStore(STORE_CORRIDAS).get(id);
    rq.onsuccess = () => resolve((rq.result as CorridaMetrica) ?? null);
    rq.onerror = () => reject(rq.error ?? new Error("IDB_METRICAS_GET"));
  });
}

async function persistirActa(m: MetricaActa): Promise<void> {
  const i = actasVivas.findIndex((a) => a.id === m.id);
  if (i >= 0) actasVivas[i] = m;
  else actasVivas.push(m);
  await put(STORE_ACTAS, m);
  // nActas de la corrida viva al día (el informe histórico lo lee del store)
  if (corridaIdViva === m.corridaId) {
    try {
      const c = await leerCorrida(m.corridaId);
      if (c) await put(STORE_CORRIDAS, { ...c, nActas: Math.max(c.nActas, actasVivas.length) });
    } catch {
      /* el nActas es cosmético — la fila ya persistió */
    }
  }
  notificar();
}

/** Historial de corridas (desc por inicio, cap 30 ya garantizado por poda). */
export async function listarCorridasMetricas(): Promise<CorridaMetrica[]> {
  try {
    const db = await abrirMetricas();
    return await new Promise((resolve, reject) => {
      const rq = db
        .transaction(STORE_CORRIDAS, "readonly")
        .objectStore(STORE_CORRIDAS)
        .getAll();
      rq.onsuccess = () =>
        resolve(
          (rq.result as CorridaMetrica[]).sort((a, b) => b.inicio - a.inicio),
        );
      rq.onerror = () => reject(rq.error ?? new Error("IDB_METRICAS_CORRIDAS"));
    });
  } catch {
    return [];
  }
}

/** Actas de UNA corrida (desde IDB — para corridas históricas). */
export async function metricasDeCorrida(corridaId: string): Promise<MetricaActa[]> {
  try {
    const db = await abrirMetricas();
    return await new Promise((resolve, reject) => {
      const rq = db
        .transaction(STORE_ACTAS, "readonly")
        .objectStore(STORE_ACTAS)
        .index(INDEX_CORRIDA)
        .getAll(corridaId);
      rq.onsuccess = () => resolve((rq.result as MetricaActa[]) ?? []);
      rq.onerror = () => reject(rq.error ?? new Error("IDB_METRICAS_ACTAS"));
    });
  } catch {
    return [];
  }
}

/** Suscripción de UI — devuelve el des-suscriptor. */
export function suscribirseMetricas(cb: () => void): () => void {
  suscritos.add(cb);
  return () => suscritos.delete(cb);
}

/** Estado VIVO de la corrida en curso (o la última si ya cerró) — RAM. */
export function corridaVivaEstado(): { corridaId: string | null; actas: MetricaActa[] } {
  return { corridaId: corridaIdViva, actas: actasVivas };
}

/** Botón escoba del informe — borra TODO el historial de métricas. */
export async function limpiarMetricas(): Promise<void> {
  try {
    const db = await abrirMetricas();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_ACTAS, STORE_CORRIDAS], "readwrite");
      tx.objectStore(STORE_ACTAS).clear();
      tx.objectStore(STORE_CORRIDAS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IDB_METRICAS_CLEAR"));
    });
    corridaIdViva = null;
    actasVivas = [];
    notificar();
  } catch {
    /* conservador */
  }
}

/** Export JSON (informe completo — corridas + actas) para el dueño. */
export async function exportarInformeMetricas(): Promise<string> {
  const [corridas, db] = await Promise.all([
    listarCorridasMetricas(),
    abrirMetricas().catch(() => null),
  ]);
  let actas: MetricaActa[] = [];
  if (db) {
    actas = await new Promise((resolve) => {
      const rq = db.transaction(STORE_ACTAS, "readonly").objectStore(STORE_ACTAS).getAll();
      rq.onsuccess = () => resolve((rq.result as MetricaActa[]) ?? []);
      rq.onerror = () => resolve([]);
    });
  }
  // KIT ocr-router-v1 fase 4 — AUTO-IDENTIFICACIÓN del informe (cierra el
  // hueco de evidencia del A/B real del dueño 2026-10-28: dos informes con
  // el mismo kit donde era imposible saber qué motor corrió en cada uno).
  // ADITIVO AL FINAL (patrón D57 — mismo criterio de hangResumen/enviosDetalle):
  // los informes previos no cambian de forma; quien lee el JSON viejo no se
  // entera. Ausencia = honesta (sin detección de gama / motor no iniciado).
  //  · gama: tier §4.4 aplicado por la capa adaptativa + efectivo (si hubo
  //    degradación reactiva en la corrida).
  //  · motorOcr: decisión del router + modelos que REALMENTE cargaron
  //    (pueden diferir si la sonda de carga de v5 falló ⇒ v4) + origen y
  //    motivo. Ausente = el motor OCR no inició en esta sesión.
  let gama: { tier: string; tierEfectivo: string } | null = null;
  try {
    const g = planGamaActual();
    gama = { tier: g.tier, tierEfectivo: g.tierEfectivo };
  } catch {
    gama = null;
  }
  const motor = motorOcrActual(); // getter puro del módulo — jamás lanza
  return JSON.stringify(
    {
      generado: new Date().toISOString(),
      kit: "e14-metricas-corrida-v1 (D34)",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      nucleos: typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? null : null,
      corridas,
      actas,
      ...(gama && { gama }),
      ...(motor && { motorOcr: motor }),
    },
    null,
    2,
  );
}

// ─── Poda (techo de historia) ────────────────────────────────────────────────

async function podarCorridasViejas(): Promise<void> {
  const corridas = await listarCorridasMetricas();
  const viejas = corridas.slice(MAX_CORRIDAS);
  if (!viejas.length) return;
  const db = await abrirMetricas();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_ACTAS, STORE_CORRIDAS], "readwrite");
    const actasStore = tx.objectStore(STORE_ACTAS);
    for (const c of viejas) {
      actasStore.index(INDEX_CORRIDA).getAllKeys(c.id).onsuccess = function () {
        for (const k of this.result) actasStore.delete(k);
      };
      tx.objectStore(STORE_CORRIDAS).delete(c.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB_METRICAS_PODA"));
  });
}
