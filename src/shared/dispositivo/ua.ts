/**
 * Capa shared (R2) — OS/navegador por UA + lecturas null-honest del
 * navigator (reporte 04 §B2 #2, quick-win 5 de la misión R2).
 *
 * Home único de los colectores duplicados en 3 copias:
 *   · digitalizador/lib/e14/obs/dispositivo.ts:29-116 (nucleosDel/memoriaGBDe/
 *     memoriaMBDe/heapLimitMB/bateriaDe/redDe/storageLibreMB/osDeUA/redActual)
 *   · perfil-dispositivo/lib/senales.ts:29-64 (hayEntornoNavegador/osDeUA/
 *     navegadorDeUA)
 *   · digitalizador/lib/e14/gama.ts:312-338 (señalesSync — inline, no export)
 *
 * COPIAS VERBATIM («mover sin cambiar» — doctrina qr-pixeles/DICTAMEN-e73
 * §3.1). Canónica elegida = la MÁS COMPLETA (decisión de la misión R2):
 *
 * · osDeUA → variante de senales.ts (detecta CrOS → "ChromeOS" ANTES de
 *   Linux). La variante de dispositivo.ts devolvía "Linux" para el mismo UA
 *   — divergencia documentada en §B3 #2 y fijada como expected-diff en el
 *   test de paridad. La adopción en dispositivo.ts/senales.ts/gama.ts queda
 *   PENDIENTE (no es parte de los re-exports declarados de la misión).
 * · nucleosDe → variante null-honest (null cuando hardwareConcurrency no es
 *   un número > 0 — senales.ts:105-108). La variante "con defecto" de
 *   dispositivo.ts:29-33 / gama.ts:322-325 (null → 1) se conserva como
 *   nucleosDeConDefecto porque su adopción NO debe cambiar comportamiento
 *   (condena BAJO por nucleos ≤ 2 — ver src/shared/dispositivo/tier.ts).
 *
 * Regla del repo: null HONESTO donde el navegador no da el dato, try/catch
 * total, cero dependencias. shared/ NUNCA importa de modules/.
 */

/** true SOLO en navegador (SSR/export estático incluidos). COPIA verbatim
 *  de perfil-dispositivo/lib/senales.ts:30-36. */
export function hayEntornoNavegador(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof window !== "undefined";
  } catch {
    return false;
  }
}

/** OS por UA — CANÓNICA (variante senales.ts:45-53, la más completa):
 *  detecta ChromeOS antes de Linux (el UA de CrOS contiene "Linux"). Orden
 *  importa: Android UA contiene "Linux"; iPadOS viejo se declara iOS.
 *  "desconocido" si no hay match — jamás inventar. */
export function osDeUA(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "desconocido";
}

/** Navegador por UA — COPIA verbatim de senales.ts:55-64. Orden importa:
 *  Edge/Opera/Samsung contienen "Chrome" en su UA. */
export function navegadorDeUA(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "desconocido";
}

/** Núcleos de CPU — variante NULL-HONEST (canónica): null si el navegador
 *  no informa hardwareConcurrency (expresión inline de senales.ts:105-108;
 *  gama.ts:322-325 usa la otra semántica → ver nucleosDeConDefecto). */
export function nucleosDe(n: Navigator): number | null {
  return typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0
    ? n.hardwareConcurrency
    : null;
}

/** Núcleos de CPU — variante CON DEFECTO 1 (COPIA verbatim de
 *  dispositivo.ts:29-33 `nucleosDel`; gama.ts la replica inline). El
 *  default 1 condena BAJO por nucleos ≤ 2 — semántica que obs/dispositivo
 *  necesita hasta que el dueño resuelva el borde (§B3 #1). */
export function nucleosDeConDefecto(n: Navigator): number {
  return typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0
    ? n.hardwareConcurrency
    : 1;
}

/** deviceMemory en GB (solo Chromium) — COPIA verbatim de
 *  dispositivo.ts:35-38. iOS/Safari → null honesto. */
export function memoriaGBDe(n: Navigator): number | null {
  const m = (n as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof m === "number" ? m : null;
}

/** Heap usado en MB (solo Chromium) — COPIA verbatim de
 *  dispositivo.ts:40-44. Sin performance.memory → null honesto. */
export function memoriaMBDe(): number | null {
  const p = performance as Performance & { memory?: { usedJSHeapSize?: number } };
  const used = p.memory?.usedJSHeapSize;
  return typeof used === "number" ? Math.round(used / 1048576) : null;
}

/** heapSizeLimit en MB (solo Chromium) — para el tier INFERIDO de iOS.
 *  COPIA verbatim de dispositivo.ts:46-51. */
export function heapLimitMB(): number | null {
  const p = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };
  const limit = p.memory?.jsHeapSizeLimit;
  return typeof limit === "number" ? Math.round(limit / 1048576) : null;
}

export interface LecturaBateria {
  nivel: number | null;
  cargando: boolean | null;
}

/** Batería (async; no existe en iOS/Safari) — COPIA verbatim de
 *  dispositivo.ts:53-64 (bateriaDe). try/catch total → null honesto. */
export async function bateriaDe(n: Navigator): Promise<LecturaBateria> {
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

export interface LecturaRed {
  tipo: string | null;
  downlinkMbps: number | null;
  saveData: boolean;
  wifi: boolean;
}

/** Red del navigator — COPIA verbatim de dispositivo.ts:66-76 (redDe).
 *  Sin navigator.connection (iOS/Safari) → tipo/downlink null, saveData
 *  false (neutral), wifi false. */
export function redDe(n: Navigator): LecturaRed {
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

/** §G.2 (obs-envio-individual-v1): wrapper PÚBLICO de redDe(navigator) —
 *  la red del MOMENTO (tipo + downlink estimado). COPIA verbatim de
 *  dispositivo.ts:84-94 (redActual). null HONESTO en node/SSR y sin
 *  navigator.connection. try/catch total (el sello jamás lanza). */
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

/** Storage libre en MB (async) — COPIA verbatim de dispositivo.ts:96-105
 *  (storageLibreMB). Sin storage.estimate o sin quota/usage → null honesto. */
export async function storageLibreMB(): Promise<number | null> {
  try {
    if (!navigator.storage || typeof navigator.storage.estimate !== "function") return null;
    const e = await navigator.storage.estimate();
    if (typeof e.quota !== "number" || typeof e.usage !== "number") return null;
    return Math.round((e.quota - e.usage) / 1048576);
  } catch {
    return null;
  }
}
