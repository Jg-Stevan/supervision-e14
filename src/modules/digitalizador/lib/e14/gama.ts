/**
 * KIT e14-gama-adaptativa-v1 — capa ADAPTATIVA de gama para el módulo MASIVA.
 *
 * PROBLEMA (evidencia del repo): todo el pipeline masiva está calibrado con
 * el peor caso del dueño (PC de escritorio): WATCHDOG_MS=75 s, master 4032,
 * pool 2 workers, barridos QR sin presupuesto de reló, dhash FULL 12 MP en
 * main thread, progreso a 4 Hz. En dispositivos de gama BAJA/MEDIA esto
 * produce: hard-kills falsos del watchdog (cada uno = workers muertos +
 * re-OCR completo), abortos por memoria (picos 4032²+4096²), hambruna de
 * CPU en la ingesta (run 4: 14 hard-kills/2 min del sondeo — store.ts) y
 * jank de UI en bandejas grandes.
 *
 * DISEÑO (respeta D6 — «la app JAMÁS se auto-configura»):
 * · El tier YA se detecta (obs/dispositivo.ts §4.4) pero NADIE lo consume.
 *   Este módulo lo CONSUME de forma ACOTADA y REVOCABLE:
 *   1. Kill-switch ÚNICO: flag `masivaAdaptativoGama` (default ON) — OFF ⇒
 *      byte-idéntico a hoy en TODOS los dispositivos.
 *   2. El override MANUAL del dueño MANDA: si una clave existe en
 *      `e14-flags-overrides` (localStorage), la capa adaptativa NO la toca
 *      (flagsMasivaEfectivos filtra por clave).
 *   3. ALTO ⇒ plan MEDIO unificado (gama-medio-unificada-v1 — presupuestos
 *      de recursos, jamás calidad) + pool 2 solo con hilos WASM reales.
 *      BAJO ⇒ ajustes de la tabla (suelo anti-OOM — jamás se unifica).
 * · La decisión D74 lo registra como excepción BOUNDADA al espíritu D6:
 *   nunca cambia criterios/score/reglas de negocio — SOLO presupuestos de
 *   recursos (memoria/CPU/reló). Con flag OFF todo vuelve a hoy.
 *
 * D38 (KIT e14-recursos-autonomos-v1) — de adaptativa a AUTÓNOMA:
 * · AMPLIFICACIÓN ALTO (aprovechar al máximo): en tier ALTO con hilos WASM
 *   reales (crossOriginIsolated — COOP/COEP vía _headers de Cloudflare,
 *   D37) el pool sube a 2 workers (el premiso e71 «dos OCR se reparten el
 *   mismo CPU» era válido mono-hilo; con pthreads reales el segundo worker
 *   amortiza el arranque frío y el carril QR corre sin desplazar OCR).
 *   Sin aislamiento ⇒ plan MEDIO unificado sin pool extra (honesto: sin
 *   ganancia medida mono-hilo).
 * · GOBERNADOR REACTIVO (auto-tuning bajo presión): matarYRecrearWorkers()
 *   reporta cada hard-kill del watchdog (reportarPresionGama). ≥2 kills en
 *   3 min ⇒ degradación PREVENTIVA de un escalón (ALTO→MEDIO, MEDIO→BAJO)
 *   durante 3 min desde el último evento (self-healing: expira sola). El
 *   kill `masivaAdaptativoGama=false` la desactiva también; el tier REAL
 *   jamás se pisa (plan.tier) — solo los presupuestos (tierEfectivo).
 *
 * TABLA DE AJUSTES (BAJO = cualquier señal débil §4.4; MEDIO = resto):
 *
 *   Parámetro               | BASE  | MEDIO | BAJO
 *   ------------------------|-------|-------|------
 *   poolWorkers             | flag  | flag  | 1
 *   ocrThreadsTope          | flag  | flag  | 2
 *   prescanWarpLado         | flag  | 2560  | 1920
 *   prescanQrPresupuestoMs  | flag  | 5000  | 6000
 *   precalorCola (masters)  | 3     | 2     | 1
 *   maestroLadoMayor        | 4032  | 4032  | 3072
 *   watchdogMs              | 75000 | 90000 | 105000
 *   progresoMs (throttle)   | 250   | 350   | 500
 *   qrLadoLargo (capa 0)    | 2048  | 2048  | 1600
 *   rescate QR 4096         | sí    | sí    | no
 *   presupuesto cadena QR   | —     | 8000  | 5000
 *   dhash visual en ingesta | sí    | sí    | no
 *
 *   KIT gama-medio-unificada-v1: ALTO corre ESTE plan MEDIO (presupuestos
 *   unificados) + pool 2 solo con hilos WASM reales (COOP/COEP). Evidencia
 *   informes 2026-10-30: escritorio MEDIO limpio tras R1 (QR −42 %, cero
 *   regresión) vs móvil ALTO con presupuesto null (QR 13,3 s) + OOM
 *   (INVALID SESSION) pagando el warp prescan 4032 (12 MP) en el carril
 *   paralelo. BAJO conserva SUS protecciones (suelo anti-OOM — jamás se
 *   unifica). El gobernador reactivo queda intacto (MEDIO→BAJO sigue
 *   degradando; ALTO→MEDIO pasa a ser innocuo).
 *
 * Notas de cada ajuste (el porqué vive TAMBIÉN en el consumidor):
 * · poolWorkers 1 en BAJO: dos OCR en paralelo se reparten el mismo CPU en
 *   2-4 núcleos — NO hay ganancia y la UI sí sufre (runner.ts cabecera e71).
 * · ocrThreadsTope 2 en BAJO: deja un núcleo libre para el hilo UI.
 * · prescanWarpLado 1920/2560: el coste del warpPerspective escala con los
 *   píxeles de SALIDA (4032 ≈ 12 MP; 1920 ≈ 2.7 MP) — el remedio REAL ya
 *   documentado de los hard-kill «warp» (KIT e14-prescan-warp-lado-v1).
 * · prescanQrPresupuestoMs mayor en BAJO (6000): el hard-kill por LENTITUD
 *   cuesta más que la espera (kill = respawn frío de OpenCV + re-do).
 * · maestroLadoMayor 3072 en BAJO: pico de bitmap −42 % (3072² ≈ 38 MB vs
 *   4032² ≈ 65 MB RGBA) donde los abortos por memoria son el riesgo
 *   dominante. El det trabaja a 1280/1920 — la resolución de OCR/QR se
 *   conserva. MUERE scores ±margen → kit propio registrado (D74) y solo en
 *   BAJO; el dueño lo revierte con el flag o con un override manual.
 * · watchdogMs mayor en BAJO/MEDIO: el p95 real de gama baja puede rozar el
 *   75 s calibrado en PC — un kill falso paga re-OCR completo (coste doble).
 * · progresoMs mayor: menos re-renders de la bandeja a 4 Hz (runner-vida).
 * · qrLadoLargo 1600 + rescate 4096 OFF + presupuesto de cadena en BAJO:
 *   la capa 0 SIN QR media ~15-17 s SYNC en el hilo UI (identidad-qr.ts) —
 *   con presupuesto la cadena salta temprano al tier zxing/rotaciones.
 * · dhashIngesta OFF en BAJO: el decode FULL 12 MP (~48 MB) del dhash de
 *   ingesta compite con el sondeo worker y el hilo UI (evidencia run 4);
 *   el dedup sigue por bytes (SHA-256), payload QR (capa 0) e identidad
 *   impresa 13 dígitos (capa 2 post-OCR).
 *
 * Tier: SYNC usa las señales instantáneas del navigator (deviceMemory,
 * núcleos, saveData, heapLimit, red); `refrescarPlanGama()` re-clasifica con
 * la versión COMPLETA de obtenerDispositivo() (batería + storage) — llamada
 * al montar MASIVA. Sin navigator (SSR/tests) ⇒ plan BASE inerte.
 *
 * SIN dependencias nuevas (kit §0.3). Jamás lanza (try/catch total — la
 * capa adaptativa jamás tumba el pipeline).
 */
import { leerFlags } from "./flags";
import { leerOverridesFlags } from "./obs/politica";
import { calcularTier, obtenerDispositivo } from "./obs/dispositivo";
import type { FlagsApp, Tier } from "./obs/tipos";
import { logger } from "../logger";

/** Señales sincrónicas del navigator (null honesto donde no hay dato). */
interface SeñalesGama {
  nucleos: number;
  memoriaGB: number | null;
  saveData: boolean;
  heapLimitMB: number | null;
  redTipo: string | null;
  redWifi: boolean;
  /** D38 — aislamiento COOP/COEP activo (SharedArrayBuffer disponible):
   *  los wasm (OCR/QR) pueden usar hilos reales — habilita la amplificación
   *  ALTO (pool 2). En GH Pages (sin _headers) queda false ⇒ base. */
  wasmHilos: boolean;
}

/** Plan EFECTIVO de gama — los consumidores leen SUS campos aquí. */
export interface PlanGama {
  tier: Tier;
  tierInferido: boolean;
  /** "sync" = señales del navigator; "completa" = obtenerDispositivo
   *  (batería + storage — puede BAJAR el tier). */
  fuente: "sync" | "completa";
  nucleos: number;
  memoriaGB: number | null;
  saveData: boolean;
  /** true = adaptaciones ACTIVAS (flag ON — con flag ON los tres tiers son
   *  activos: ALTO/MEDIO comparten el plan unificado, BAJO el suelo). */
  activo: boolean;
  /** D38 — tier con el que se compusieron los presupuestos (real, o un
   *  escalón abajo si el gobernador reactivo está activo). El tier REAL
   *  sigue en `tier` — jamás se pisa. */
  tierEfectivo: Tier;
  /** D38 — amplificación ALTO activa (pool 2 con hilos WASM reales). */
  amplificado: boolean;
  /** D38 — degradación preventiva del gobernador reactivo (null = normal). */
  reactivo: { motivo: string; hasta: number } | null;
  /** Override de FLAGS consumidos vía leerFlags() — filtrado por el override
   *  manual del dueño dentro de flagsMasivaEfectivos(). */
  flagsOverride: Partial<FlagsApp>;
  /** Precalor: masters PRECALORADOS máximos en memoria (precalor.ts). */
  precalorCola: number;
  /** Lado mayor del master (archivos.ts — base 4032). */
  maestroLadoMayor: number;
  /** Presupuesto de CADA intento del watchdog (runner.ts — base 75 s). */
  watchdogMs: number;
  /** Throttle del progreso de la bandeja (runner-vida.ts — base 250). */
  progresoMs: number;
  /** Lado largo del canvas de la CAPA 0 QR (identidad-qr.ts — base 2048). */
  qrLadoLargo: number;
  /** Rescate hi-res 4096 (64 MB puntual) de la CAPA 0 permitido. */
  qrRescate4096: boolean;
  /** Presupuesto de reló de la CADENA completa de la capa 0 (null = sin
   *  presupuesto — byte-idéntico a hoy). */
  qrPresupuestoMs: number | null;
  /** dhash visual de la INGESTA activo (store.ts cadenaDedup). */
  dhashIngesta: boolean;
  /** Etiquetas legibles de los ajustes aplicados (UI/diagnóstico). */
  ajustes: string[];
}

/** Base byte-idéntica a hoy (flag OFF / sin navigator). Con flag ON ningún
 *  tier cae aquí: ALTO = plan MEDIO unificado (gama-medio-unificada-v1). */
function planBase(tier: Tier, tierInferido: boolean, fuente: PlanGama["fuente"], señales: SeñalesGama): PlanGama {
  return {
    tier,
    tierEfectivo: tier,
    tierInferido,
    fuente,
    nucleos: señales.nucleos,
    memoriaGB: señales.memoriaGB,
    saveData: señales.saveData,
    activo: false,
    amplificado: false,
    reactivo: null,
    flagsOverride: {},
    precalorCola: 3,
    maestroLadoMayor: 4032,
    watchdogMs: 75_000,
    progresoMs: 250,
    qrLadoLargo: 2048,
    qrRescate4096: true,
    qrPresupuestoMs: null,
    dhashIngesta: true,
    ajustes: [],
  };
}

/** Componer el plan del tier EFECTIVO (flag ON — decidido AQUÍ). El tier
 *  llega ya degradado por el gobernador reactivo si applies (D38). */
function componerPlan(
  tier: Tier,
  tierInferido: boolean,
  fuente: PlanGama["fuente"],
  señales: SeñalesGama,
): PlanGama {
  const base = planBase(tier, tierInferido, fuente, señales);
  let flags: FlagsApp;
  try {
    flags = leerFlags();
  } catch {
    return base; // sin flags ⇒ sin adaptación (jamás inventar)
  }
  if (!flags.masivaAdaptativoGama) return base;

  /** KIT gama-medio-unificada-v1 — MEDIO es el plan UNIFICADO de ALTO/MEDIO:
   *  ajustes SUAVES que conservan la calidad (master 4032, QR 2048, rescate
   *  4096 y dhash son idénticos en BASE/MEDIO — solo cambian presupuestos
   *  de recursos, D74). Evidencia 2026-10-30: escritorio MEDIO limpio tras
   *  R1; móvil ALTO con presupuesto null pagó QR 13,3 s + OOM. */
  const planMedioUnificado = (): PlanGama => ({
    ...base,
    activo: true,
    flagsOverride: {
      prescanWarpLado: 2560,
      prescanQrPresupuestoMs: 5000,
    },
    precalorCola: 2,
    watchdogMs: 90_000,
    progresoMs: 350,
    qrPresupuestoMs: 8000,
    ajustes: [
      "warp prescan 2560",
      "prescan 5 s",
      "watchdog 90 s",
      "precalor 2",
      "cadena QR 8 s",
      "progreso 350 ms",
    ],
  });

  // D38 — AMPLIFICACIÓN ALTO: el ÚNICO extra de ALTO es pool 2 con hilos
  // WASM reales (COOP/COEP — el 2º worker amortiza el arranque frío y el
  // carril QR corre sin desplazar OCR). Sin aislamiento ⇒ plan MEDIO
  // unificado sin pool extra (honesto: sin ganancia medida mono-hilo).
  if (tier === "ALTO") {
    const medio = planMedioUnificado();
    if (!señales.wasmHilos)
      return { ...medio, ajustes: [...medio.ajustes, "ALTO = MEDIO (unificada)"] };
    return {
      ...medio,
      amplificado: true,
      flagsOverride: { ...medio.flagsOverride, poolWorkers: 2 },
      ajustes: [...medio.ajustes, "pool 2 (hilos WASM ✓)", "ALTO = MEDIO + amplificación"],
    };
  }

  if (tier === "BAJO") {
    return {
      ...base,
      activo: true,
      flagsOverride: {
        poolWorkers: 1,
        ocrThreadsTope: 2,
        prescanWarpLado: 1920,
        prescanQrPresupuestoMs: 6000,
      },
      precalorCola: 1,
      maestroLadoMayor: 3072,
      watchdogMs: 105_000,
      progresoMs: 500,
      qrLadoLargo: 1600,
      qrRescate4096: false,
      qrPresupuestoMs: 5000,
      dhashIngesta: false,
      ajustes: [
        "pool 1",
        "OCR 2 hilos",
        "warp prescan 1920",
        "prescan 6 s",
        "watchdog 105 s",
        "master 3072",
        "precalor 1",
        "QR 1600 · sin rescate 4096",
        "cadena QR 5 s",
        "dhash ingesta omitido",
        "progreso 500 ms",
      ],
    };
  }
  // MEDIO — el plan unificado (ver planMedioUnificado arriba).
  return planMedioUnificado();
}

// ─── D38 — gobernador reactivo (presión observada → degradación preventiva) ──

/** Ventana de observación y duración de la degradación (3 min c/u). */
const PRESION_VENTANA_MS = 180_000;
const PRESION_UMBRAL = 2;
const PRESION_DURACION_MS = 180_000;

/** Timestamps de hard-kills recientes (solo el sitio real: matarYRecrearWorkers). */
let eventosPresion: number[] = [];
let presionHasta = 0;
let presionMotivo = "";

/** Hook del watchdog (runner-watchdog.matarYRecrearWorkers): cada hard-kill
 *  es la señal más cara del pipeline (workers muertos + re-OCR completo).
 *  ≥2 en la ventana ⇒ presupuestos de un escalón menor durante 3 min desde
 *  el último evento (self-healing — expira sola). Jamás lanza. */
export function reportarPresionGama(): void {
  try {
    const ahora = Date.now();
    eventosPresion = eventosPresion.filter((t) => ahora - t < PRESION_VENTANA_MS);
    eventosPresion.push(ahora);
    if (eventosPresion.length >= PRESION_UMBRAL && presionHasta < ahora + PRESION_DURACION_MS) {
      presionHasta = ahora + PRESION_DURACION_MS;
      presionMotivo = `${eventosPresion.length} hard-kills del watchdog en ${PRESION_VENTANA_MS / 1000} s`;
      logger.warn(`[e14] gama REACTIVA: ${presionMotivo} — presupuestos de un escalón menor por 3 min (auto-recupera)`);
    }
  } catch {
    /* jamás lanza */
  }
}

function presionActiva(): boolean {
  return Date.now() < presionHasta;
}

/** Un escalón abajo (ALTO→MEDIO, MEDIO→BAJO; BAJO no baja más). */
function degradarTier(t: Tier): Tier {
  return t === "ALTO" ? "MEDIO" : "BAJO";
}

// ─── Medición + caché de tier ───────────────────────────────────────────────

function señalesSync(): SeñalesGama | null {
  try {
    if (typeof navigator === "undefined") return null;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string; saveData?: boolean; type?: string };
    };
    const p = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };
    const heap = p.memory?.jsHeapSizeLimit;
    return {
      nucleos:
        typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0
          ? nav.hardwareConcurrency
          : 1,
      memoriaGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      saveData: nav.connection?.saveData === true,
      heapLimitMB: typeof heap === "number" ? Math.round(heap / 1048576) : null,
      redTipo: nav.connection?.effectiveType ?? null,
      redWifi: nav.connection?.type === "wifi",
      wasmHilos:
        typeof SharedArrayBuffer !== "undefined" &&
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    };
  } catch {
    return null;
  }
}

/** Caché del tier SYNC (las señales del navigator no cambian en la sesión). */
let cacheSync: { señales: SeñalesGama; tier: Tier; tierInferido: boolean } | null = null;
/** Caché del tier COMPLETO (batería + storage — refrescarPlanGama). */
let cacheCompleta: { tier: Tier; tierInferido: boolean } | null = null;

function tierSyncDe(señales: SeñalesGama): { tier: Tier; tierInferido: boolean } {
  // MISMAS reglas §4.4 — las señales async (batería/storage) llegan como
  // null (no condenan): la clasificación SYNC es conservadora — un BAJO por
  // batería/storage baja a MEDIO hasta que refrescarPlanGama() lo refine.
  return calcularTier({
    memoriaGB: señales.memoriaGB,
    nucleos: señales.nucleos,
    saveData: señales.saveData,
    bateriaNivel: null,
    bateriaCargando: null,
    storageLibreMB: null,
    redTipo: señales.redTipo,
    redWifi: señales.redWifi,
    heapLimitMB: señales.heapLimitMB,
  });
}

/** Plan del MOMENTO (sync — los consumidores lo leen en caliente). Cachea el
 *  TIER, no el plan: los flips del flag `masivaAdaptativoGama` del dueño se
 *  respetan EN VIVO sin recargar. D38: compone con el tier EFECTIVO (el
 *  real, o un escalón abajo si el gobernador reactivo está activo). Jamás
 *  lanza. */
export function planGamaActual(): PlanGama {
  try {
    const señales = cacheSync?.señales ?? señalesSync();
    if (!señales) {
      // SSR/node/tests — plan BASE inerte (byte-idéntico a hoy).
      return planBase("MEDIO", false, "sync", {
        nucleos: 1,
        memoriaGB: null,
        saveData: false,
        heapLimitMB: null,
        redTipo: null,
        redWifi: false,
        wasmHilos: false,
      });
    }
    if (!cacheSync) {
      const t = tierSyncDe(señales);
      cacheSync = { señales, ...t };
    }
    const real = cacheCompleta ?? { tier: cacheSync.tier, tierInferido: cacheSync.tierInferido };
    // D38 — gobernador reactivo: presupuestos de un escalón menor mientras
    // dure la presión; el tier REAL jamás se pisa (reporte honesto en UI).
    let tierEfectivo = real.tier;
    let reactivo: PlanGama["reactivo"] = null;
    try {
      if (leerFlags().masivaAdaptativoGama && presionActiva() && real.tier !== "BAJO") {
        tierEfectivo = degradarTier(real.tier);
        reactivo = { motivo: presionMotivo, hasta: presionHasta };
      }
    } catch {
      /* sin flags ⇒ sin reactivo */
    }
    const plan = componerPlan(tierEfectivo, real.tierInferido, cacheCompleta ? "completa" : "sync", señales);
    plan.tier = real.tier;
    plan.tierEfectivo = tierEfectivo;
    plan.reactivo = reactivo;
    return plan;
  } catch {
    // Cinturón: la capa adaptativa JAMÁS tumba nada — plan base.
    return planBase("MEDIO", false, "sync", {
      nucleos: 1,
      memoriaGB: null,
      saveData: false,
      heapLimitMB: null,
      redTipo: null,
      redWifi: false,
      wasmHilos: false,
    });
  }
}

/** Re-clasificación COMPLETA (batería + storage — §4.4 entero): puede BAJAR
 *  el tier (BAJO por batería<20 % sin cargar o storage<500 MB). Fire-and-
 *  forget desde MASIVA al montar; idempotente. Jamás lanza. */
export async function refrescarPlanGama(): Promise<PlanGama> {
  try {
    if (typeof navigator === "undefined") return planGamaActual();
    const snap = await obtenerDispositivo();
    cacheCompleta = { tier: snap.tier, tierInferido: snap.tierInferido };
    const plan = planGamaActual();
    logger.info(
      `[e14] gama plan tier=${plan.tier}${plan.tierInferido ? " (inferido)" : ""} efectivo=${plan.tierEfectivo}${plan.reactivo ? " [REACTIVA]" : ""}${plan.amplificado ? " [AMPLIFICADO]" : ""} fuente=${plan.fuente} adaptativo=${plan.activo ? `ON (${plan.ajustes.join(", ")})` : "OFF"}`,
    );
    return plan;
  } catch {
    return planGamaActual();
  }
}

/** Flags EFECTIVOS de la corrida: leerFlags() + el override adaptativo del
 *  plan — JAMÁS sobre claves que el dueño puso manualmente en
 *  `e14-flags-overrides` (D6: el override MANUAL manda). Sustituye a
 *  leerFlags() SOLO en los puntos de consumo del pipeline masiva/OCR
 *  listados en la decisión D74. Jamás lanza. */
export function flagsMasivaEfectivos(): FlagsApp {
  const flags = leerFlags();
  try {
    const plan = planGamaActual();
    if (!flags.masivaAdaptativoGama || !plan.activo) return flags;
    const claves = Object.keys(plan.flagsOverride);
    if (claves.length === 0) return flags;
    let manuales: Set<string>;
    try {
      manuales = new Set(Object.keys(leerOverridesFlags()));
    } catch {
      manuales = new Set();
    }
    const aplicables: Partial<FlagsApp> = {};
    for (const clave of claves) {
      if (manuales.has(clave)) continue; // la mano del dueño MANDA (D6)
      (aplicables as Record<string, unknown>)[clave] =
        (plan.flagsOverride as Record<string, unknown>)[clave];
    }
    if (Object.keys(aplicables).length === 0) return flags;
    return { ...flags, ...aplicables };
  } catch {
    return flags; // jamás lanza — flags de siempre
  }
}

/** Prueba interna (tests): reset de las cachés de tier y del gobernador. */
export function __resetGamaParaTest(): void {
  cacheSync = null;
  cacheCompleta = null;
  eventosPresion = [];
  presionHasta = 0;
  presionMotivo = "";
}
