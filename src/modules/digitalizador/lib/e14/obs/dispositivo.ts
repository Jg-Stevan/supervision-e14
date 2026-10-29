/**
 * KIT e14-observabilidad-v1 (A1-C5) — dispositivo + tier + muestreo de
 * salud. D6 (REGLA DE ORO §2.1): lo adaptativo v1 = DETECTAR el tier y
 * reportarlo — la app NUNCA cambia reglas de negocio sola.
 *
 * · obtenerDispositivo() — snapshot SaludSnapshot + os/ua (ligero, sin
 *   librerías): nucleos/memoriaGB/batería/red/storage/memoriaMB, con null
 *   HONESTO donde el navegador no da el dato (iOS: deviceMemory, batería y
 *   performance.memory — jamás inventar).
 * · tier — reglas §4.4: BAJO por cualquier señal débil (con el dato
 *   presente); ALTO con deviceMemory real ≥4 Y núcleos ≥6 Y red 4g/wifi Y
 *   !saveData; MEDIO el resto. Sin deviceMemory (iOS) → INFERIR por
 *   núcleos + heapSizeLimit + UA y marcar tierInferido.
 * · iniciarMuestreoSalud / detenerMuestreoSalud — timer 5 min SOLO si
 *   modo dev ON && politica.saludEnVivo (verificación en CADA tick — si
 *   el modo dev se apaga, el timer se auto-detiene). Muestra inmediata al
 *   iniciar. CERO costo con modo dev OFF: ni timer ni listeners.
 */
import { appendEvento } from "./buffer";
import { idDispositivo, idSesion, appVersion } from "./identidad";
import { leerModoDev, leerPolitica } from "./politica";
import { leerFlags } from "../flags";
import type { SaludSnapshot, Tier } from "./tipos";

const INTERVALO_SALUD_MS = 5 * 60 * 1000;

// ─── lecturas del navegador (cada una con null honesto) ────────────────────

function nucleosDel(n: Navigator): number {
  return typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0
    ? n.hardwareConcurrency
    : 1;
}

function memoriaGBDe(n: Navigator): number | null {
  const m = (n as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof m === "number" ? m : null;
}

function memoriaMBDe(): number | null {
  const p = performance as Performance & { memory?: { usedJSHeapSize?: number } };
  const used = p.memory?.usedJSHeapSize;
  return typeof used === "number" ? Math.round(used / 1048576) : null;
}

/** heapSizeLimit en MB (solo Chromium) — para el tier INFERIDO de iOS. */
function heapLimitMB(): number | null {
  const p = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };
  const limit = p.memory?.jsHeapSizeLimit;
  return typeof limit === "number" ? Math.round(limit / 1048576) : null;
}

async function bateriaDe(n: Navigator): Promise<{ nivel: number | null; cargando: boolean | null }> {
  try {
    const nav = n as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (typeof nav.getBattery !== "function") return { nivel: null, cargando: null }; // iOS/Safari
    const b = await nav.getBattery();
    return { nivel: b.level, cargando: b.charging };
  } catch {
    return { nivel: null, cargando: null };
  }
}

function redDe(n: Navigator): { tipo: string | null; downlinkMbps: number | null; saveData: boolean; wifi: boolean } {
  const c = (n as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; saveData?: boolean; type?: string };
  }).connection;
  return {
    tipo: c?.effectiveType ?? null,
    downlinkMbps: typeof c?.downlink === "number" ? c.downlink : null,
    saveData: c?.saveData === true,
    wifi: c?.type === "wifi",
  };
}

/** §G.2 — ORDEN-WAVE3-add-envio-individual-v1 (obs-envio-individual-v1):
 *  wrapper PÚBLICO de redDe(navigator) — la red del MOMENTO (tipo + downlink
 *  estimado). La consume el sello de envío (store.ts registrarEnvio G.1 /
 *  runner.ts parche D61) para estampar envioRedTipo/envioDownlinkMbps en el
 *  diagnóstico. null HONESTO en node/SSR y sin navigator.connection
 *  (iOS/Safari — jamás inventar). try/catch total (el sello jamás lanza). */
export function redActual(): { tipo: string | null; downlinkMbps: number | null } | null {
  try {
    if (typeof navigator === "undefined") return null;
    const nav = navigator as Navigator & { connection?: unknown };
    if (!nav.connection) return null;
    const r = redDe(nav);
    return { tipo: r.tipo, downlinkMbps: r.downlinkMbps };
  } catch {
    return null;
  }
}

async function storageLibreMB(): Promise<number | null> {
  try {
    if (!navigator.storage || typeof navigator.storage.estimate !== "function") return null;
    const e = await navigator.storage.estimate();
    if (typeof e.quota !== "number" || typeof e.usage !== "number") return null;
    return Math.round((e.quota - e.usage) / 1048576);
  } catch {
    return null;
  }
}

/** OS por UA — ligero y honesto ("desconocido" si no hay match). Orden
 *  importa: Android UA contiene "Linux"; iPadOS viejo se declara iOS. */
export function osDeUA(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "desconocido";
}

// ─── tier (D6 — SOLO detectar, §4.4) ───────────────────────────────────────

/** Entrada explícita (PURA — testeada con tabla de casos). */
export interface EntradaTier {
  memoriaGB: number | null;
  nucleos: number;
  saveData: boolean;
  bateriaNivel: number | null; // 0..1
  bateriaCargando: boolean | null;
  storageLibreMB: number | null;
  redTipo: string | null; // effectiveType: slow-2g|2g|3g|4g
  redWifi: boolean;
  heapLimitMB: number | null;
}

/** Reglas §4.4: BAJO por CUALQUIER señal débil (solo con dato presente);
 *  ALTO exige deviceMemory real — sin él (iOS) se INFERE por núcleos +
 *  heap y tierInferido=true. MEDIO el resto. Jamás lanza. */
export function calcularTier(e: EntradaTier): { tier: Tier; tierInferido: boolean } {
  // BAJO — cualquiera condena (con el dato presente; null no condena)
  if (e.memoriaGB !== null && e.memoriaGB < 2) return { tier: "BAJO", tierInferido: false };
  if (e.nucleos <= 2) return { tier: "BAJO", tierInferido: false };
  if (e.saveData) return { tier: "BAJO", tierInferido: false };
  if (e.bateriaNivel !== null && e.bateriaNivel < 0.2 && e.bateriaCargando === false) {
    return { tier: "BAJO", tierInferido: false };
  }
  if (e.storageLibreMB !== null && e.storageLibreMB < 500) return { tier: "BAJO", tierInferido: false };

  // ALTO — con deviceMemory real: regla exacta del kit
  if (e.memoriaGB !== null) {
    const redOk = e.redTipo === "4g" || e.redWifi;
    if (e.memoriaGB >= 4 && e.nucleos >= 6 && redOk && !e.saveData) {
      return { tier: "ALTO", tierInferido: false };
    }
    return { tier: "MEDIO", tierInferido: false };
  }

  // INFERIDO (sin deviceMemory — iOS): cores + heapLimit (+ UA ya evaluado
  // arriba: el BAJO por núcleos salió antes). El umbral de heap 2048 MB
  // separa los iOS con RAM holgada (límite de heap crece con RAM real).
  const heapOk = e.heapLimitMB !== null && e.heapLimitMB >= 2048;
  if (e.nucleos >= 6 && heapOk) return { tier: "ALTO", tierInferido: true };
  return { tier: "MEDIO", tierInferido: true };
}

/** Snapshot completo (contrato §4.3). */
export async function obtenerDispositivo(): Promise<SaludSnapshot & { os: string; ua: string }> {
  const ua = navigator.userAgent;
  const nucleos = nucleosDel(navigator);
  const memoriaGB = memoriaGBDe(navigator);
  const bateria = await bateriaDe(navigator);
  const red = redDe(navigator);
  const storageLibre = await storageLibreMB();
  const { tier, tierInferido } = calcularTier({
    memoriaGB,
    nucleos,
    saveData: red.saveData,
    bateriaNivel: bateria.nivel,
    bateriaCargando: bateria.cargando,
    storageLibreMB: storageLibre,
    redTipo: red.tipo,
    redWifi: red.wifi,
    heapLimitMB: heapLimitMB(),
  });
  return {
    memoriaMB: memoriaMBDe(),
    nucleos,
    memoriaGB,
    bateria: { nivel: bateria.nivel, cargando: bateria.cargando },
    red: { tipo: red.tipo, downlinkMbps: red.downlinkMbps, saveData: red.saveData },
    storageLibreMB: storageLibre,
    tier,
    tierInferido,
    os: osDeUA(ua),
    ua,
  };
}

// ─── muestreo de salud (5 min, SOLO con modo dev + política) ───────────────

let timerSalud: number | null = null;

function condicionesOk(): boolean {
  try {
    // A1-C7: el flag telemetriaSalud del dueño completa el guard del C5
    // (default true → idéntico sin overrides; D6: nunca se auto-configura).
    return leerModoDev() && leerPolitica().saludEnVivo && leerFlags().telemetriaSalud;
  } catch {
    return false;
  }
}

async function tickSalud(): Promise<void> {
  try {
    const snap = await obtenerDispositivo();
    await appendEvento({
      tipo: "salud",
      ts: Date.now(),
      sesion: idSesion(),
      dispositivo: idDispositivo(),
      appVersion: appVersion(),
      // KIT e14-obs-hang-atribucion-v1 (§F v1.1) — `ts` en CADA muestra:
      // sin timestamp las narrativas de memoria (picos/GC/recuperación)
      // son indatables (dictamen 1045/1048 — las baterías lo demostraron).
      datos: { ...snap, ts: Date.now() } as SaludSnapshot,
    });
  } catch {
    /* silencioso — la salud jamás rompe la app */
  }
}

/** Idempotente: timer SOLO si las condiciones están vivas (cero costo con
 *  modo dev OFF: ni timer). Re-verifica en CADA tick — si el modo dev se
 *  apaga, el timer se auto-detiene. Re-encender = llamar de nuevo. */
export function iniciarMuestreoSalud(): void {
  try {
    if (typeof window === "undefined") return;
    if (timerSalud !== null) return; // idempotente
    if (!condicionesOk()) return; // OFF → sin timer (kit: cero costo)
    void tickSalud(); // muestra inmediata al iniciar
    timerSalud = window.setInterval(() => {
      if (!condicionesOk()) {
        detenerMuestreoSalud();
        return;
      }
      void tickSalud();
    }, INTERVALO_SALUD_MS);
  } catch {
    /* silencioso */
  }
}

export function detenerMuestreoSalud(): void {
  try {
    if (timerSalud !== null) {
      window.clearInterval(timerSalud);
      timerSalud = null;
    }
  } catch {
    /* silencioso */
  }
}
