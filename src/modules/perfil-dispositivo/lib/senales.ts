/**
 * KIT perfil-recursos-v1 — recolectores de señales del dispositivo.
 *
 * Todo colector: null HONESTO donde el navegador no da el dato, try/catch
 * total (la detección JAMÁS tumba la app) y cero dependencias nuevas.
 *
 * Señales cubiertas (lo pedido por el dueño — "identificar los recursos"):
 * · CPU: hardwareConcurrency · heap (Chromium) · deviceMemory (Chromium)
 * · GPU: renderer/vendedor reales vía WEBGL_debug_renderer_info, WebGL2,
 *   WebGPU, MAX_TEXTURE_SIZE (relevante para ONNX-web y canvas pesado)
 * · Runtime: WASM básico/SIMD (sondeo de bytes), hilos WASM (SAB +
 *   Atomics + crossOriginIsolated), OffscreenCanvas, ServiceWorker
 * · Red: effectiveType, downlink, saveData, wifi
 * · Energía: batería (async — no existe en iOS/Safari)
 * · Storage: quota/usage/libre (async)
 * · Forma: celular/tablet/escritorio por UA + touch + diagonal de pantalla
 * · Pantalla: resolución lógica/física, DPR
 */
import type {
  CapacidadGpu,
  CapacidadesRuntime,
  FactorForma,
  SenalesAsync,
  SenalesSync,
} from "../domain/tipos";

// ─── helpers de entorno ─────────────────────────────────────────────────────

/** true SOLO en navegador (SSR/export estático incluidos). */
export function hayEntornoNavegador(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof window !== "undefined";
  } catch {
    return false;
  }
}

/** Ceder el hilo entre fases (para el benchmark y pases async). */
export function cederHilo(ms = 0): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── OS + navegador por UA (ligero, sin librerías — paridad dispositivo.ts) ─

export function osDeUA(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "desconocido";
}

export function navegadorDeUA(ua: string): string {
  // Orden importa: Edge/Opera/Samsung contienen "Chrome" en su UA.
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "desconocido";
}

// ─── señales SYNC (primer pase — el provider las usa al montar) ─────────────

export function recolectarSync(): SenalesSync {
  const vacio: SenalesSync = {
    nucleos: null,
    memoriaGB: null,
    heapLimiteMB: null,
    heapUsadoMB: null,
    redTipo: null,
    redDownlinkMbps: null,
    saveData: null,
    redWifi: null,
    touchMax: null,
    pantallaW: null,
    pantallaH: null,
    dpr: null,
    ua: "",
    os: "desconocido",
    navegador: "desconocido",
    plataforma: null,
  };
  try {
    if (!hayEntornoNavegador()) return vacio;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: {
        effectiveType?: string;
        downlink?: number;
        saveData?: boolean;
        type?: string;
      };
      userAgentData?: { platform?: string };
    };
    const perf = performance as Performance & {
      memory?: { jsHeapSizeLimit?: number; usedJSHeapSize?: number };
    };
    const ua = nav.userAgent ?? "";
    const conn = nav.connection;
    return {
      nucleos:
        typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0
          ? nav.hardwareConcurrency
          : null,
      memoriaGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      heapLimiteMB:
        typeof perf.memory?.jsHeapSizeLimit === "number"
          ? Math.round((perf.memory.jsHeapSizeLimit as number) / 1048576)
          : null,
      heapUsadoMB:
        typeof perf.memory?.usedJSHeapSize === "number"
          ? Math.round((perf.memory.usedJSHeapSize as number) / 1048576)
          : null,
      redTipo: conn?.effectiveType ?? null,
      redDownlinkMbps: typeof conn?.downlink === "number" ? conn.downlink : null,
      saveData: typeof conn?.saveData === "boolean" ? conn.saveData : null,
      redWifi: conn?.type === "wifi",
      touchMax: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : null,
      pantallaW: window.screen?.width ?? null,
      pantallaH: window.screen?.height ?? null,
      dpr: window.devicePixelRatio ?? null,
      ua,
      os: osDeUA(ua),
      navegador: navegadorDeUA(ua),
      plataforma: nav.userAgentData?.platform ?? null,
    };
  } catch {
    return vacio;
  }
}

// ─── GPU (WebGL) ────────────────────────────────────────────────────────────

export function sondearGpu(): CapacidadGpu {
  const vacio: CapacidadGpu = {
    disponible: false,
    renderer: null,
    vendedor: null,
    webgl2: false,
    webgpu: false,
    maxTexturaLado: null,
  };
  try {
    if (!hayEntornoNavegador()) return vacio;
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 ?? canvas.getContext("webgl");
    if (!gl) return { ...vacio, webgl2: gl2 !== null };
    type CtxGl = WebGLRenderingContext & {
      getExtension: (n: string) => (Record<string, number> & { loseContext?: () => void }) | null;
      getParameter: (p: number) => unknown;
    };
    const glx = gl as unknown as CtxGl;
    let renderer: string | null = null;
    let vendedor: string | null = null;
    try {
      const ext = glx.getExtension?.("WEBGL_debug_renderer_info");
      if (ext) {
        renderer = (glx.getParameter?.(ext.UNMASKED_RENDERER_WEBGL) as string) ?? null;
        vendedor = (glx.getParameter?.(ext.UNMASKED_VENDOR_WEBGL) as string) ?? null;
      }
      if (!renderer) {
        renderer = (glx.getParameter?.(glx.RENDERER) as string) ?? null;
        vendedor = vendedor ?? (glx.getParameter?.(glx.VENDOR) as string) ?? null;
      }
    } catch {
      /* algunos navegadores ocultan el renderer — null honesto */
    }
    let maxTexturaLado: number | null = null;
    try {
      const t = glx.getParameter?.(glx.MAX_TEXTURE_SIZE);
      if (typeof t === "number") maxTexturaLado = t;
    } catch {
      /* null honesto */
    }
    // Liberar el contexto: el sondeo no debe dejar GPU viva.
    try {
      glx.getExtension("WEBGL_lose_context")?.loseContext?.();
    } catch {
      /* no crítico */
    }
    let webgpu = false;
    try {
      webgpu = "gpu" in navigator;
    } catch {
      webgpu = false;
    }
    return {
      disponible: true,
      renderer,
      vendedor,
      webgl2: gl2 !== null,
      webgpu,
      maxTexturaLado,
    };
  } catch {
    return vacio;
  }
}

// ─── runtime (WASM/JS) ──────────────────────────────────────────────────────

/** Módulo WASM mínimo (cabecera válida). */
const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
/** Módulo con la instrucción SIMD v128.const i32x4 — sondeo estándar. */
const WASM_SIMD = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
  8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export function sondearRuntime(): CapacidadesRuntime {
  const vacio: CapacidadesRuntime = {
    wasmBasico: false,
    wasmSimd: false,
    wasmHilos: false,
    crossOriginIsolated: false,
    sharedArrayBuffer: false,
    offscreenCanvas: false,
    serviceWorker: false,
  };
  try {
    if (!hayEntornoNavegador()) return vacio;
    let wasmBasico = false;
    let wasmSimd = false;
    try {
      wasmBasico = WebAssembly.validate(WASM_MAGIC);
    } catch {
      wasmBasico = false;
    }
    try {
      wasmSimd = WebAssembly.validate(WASM_SIMD);
    } catch {
      wasmSimd = false;
    }
    const sab = typeof SharedArrayBuffer !== "undefined";
    const coi =
      typeof window.crossOriginIsolated === "boolean" ? window.crossOriginIsolated : false;
    const atomics = typeof Atomics !== "undefined";
    return {
      wasmBasico,
      wasmSimd,
      // Hilos WASM reales = SAB + Atomics + aislamiento COOP/COEP.
      wasmHilos: wasmBasico && sab && atomics && coi,
      crossOriginIsolated: coi,
      sharedArrayBuffer: sab,
      offscreenCanvas: typeof (window as { OffscreenCanvas?: unknown }).OffscreenCanvas !== "undefined",
      serviceWorker: "serviceWorker" in navigator,
    };
  } catch {
    return vacio;
  }
}

// ─── señales ASYNC (batería + storage — segundo pase) ───────────────────────

export async function recolectarAsync(): Promise<SenalesAsync> {
  const vacio: SenalesAsync = {
    bateriaNivel: null,
    bateriaCargando: null,
    storageTotalMB: null,
    storageUsadoMB: null,
    storageLibreMB: null,
  };
  try {
    if (!hayEntornoNavegador()) return vacio;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    let bateriaNivel: number | null = null;
    let bateriaCargando: boolean | null = null;
    try {
      if (typeof nav.getBattery === "function") {
        const b = await nav.getBattery();
        bateriaNivel = b.level;
        bateriaCargando = b.charging;
      }
    } catch {
      /* iOS/Safari — null honesto */
    }
    let storageTotalMB: number | null = null;
    let storageUsadoMB: number | null = null;
    let storageLibreMB: number | null = null;
    try {
      if (navigator.storage && typeof navigator.storage.estimate === "function") {
        const e = await navigator.storage.estimate();
        if (typeof e.quota === "number") storageTotalMB = Math.round(e.quota / 1048576);
        if (typeof e.usage === "number") storageUsadoMB = Math.round(e.usage / 1048576);
        if (typeof e.quota === "number" && typeof e.usage === "number") {
          storageLibreMB = Math.round((e.quota - e.usage) / 1048576);
        }
      }
    } catch {
      /* null honesto */
    }
    return { bateriaNivel, bateriaCargando, storageTotalMB, storageUsadoMB, storageLibreMB };
  } catch {
    return vacio;
  }
}

// ─── factor de forma (computador o celular — petición del dueño) ────────────

/** Diagonal estimada de la pantalla física en pulgadas (aprox honesta). */
function diagonalPulgadas(w: number | null, h: number | null, dpr: number | null): number | null {
  try {
    if (w === null || h === null) return null;
    const escala = dpr ?? 1;
    const wPx = w * escala;
    const hPx = h * escala;
    const px96 = Math.sqrt(wPx * wPx + hPx * hPx) / 96; // 96 px CSS = 1 in aprox
    return Math.round(px96 * 10) / 10;
  } catch {
    return null;
  }
}

export function detectarForma(sync: SenalesSync): FactorForma {
  try {
    const ua = sync.ua ?? "";
    const touch = sync.touchMax ?? 0;
    const esTabletUA = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    // iPadOS moderno se declara "Macintosh" pero con multitouch real.
    const macConTouch = /Macintosh/i.test(ua) && touch > 1;
    if (esTabletUA || macConTouch) return "tablet";
    if (/iPhone|iPod|Windows Phone|Mobile/i.test(ua)) return "celular";
    const diag = diagonalPulgadas(sync.pantallaW, sync.pantallaH, sync.dpr);
    // Muchos puntos de touch + pantalla chica = celular sin UA claro.
    if (touch >= 5 && diag !== null && diag < 8) return "celular";
    if (diag !== null) {
      if (diag < 8) return "celular";
      if (diag < 12) return "tablet";
    }
    return "escritorio";
  } catch {
    return "desconocido";
  }
}

/** Etiqueta corta del factor de forma (chips del header/panel). */
export function etiquetaForma(forma: FactorForma): string {
  switch (forma) {
    case "escritorio":
      return "PC";
    case "tablet":
      return "TABLET";
    case "celular":
      return "MÓVIL";
    default:
      return "—";
  }
}
