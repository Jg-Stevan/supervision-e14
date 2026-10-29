/**
 * KIT e14-observabilidad-v1 (A1-C7) — flags de la app (leerFlags/refrescar
 * Flags del contrato §4.3). Cadena de prioridad:
 *
 *   DEFAULTS ← public/flags.json (remoto, cacheado 24 h, offline-safe)
 *            ← overrides localStorage (MÁXIMA prioridad — el kill switch
 *              MANUAL del dueño, D6: la app JAMÁS se auto-configura).
 *
 * flags.json es un archivo ESTÁTICO en public/ (hoy NO existe → «sin-
 * endpoint»): el dueño lo puede desplegar/editar sin tocar el código —
 * same-origin con NEXT_PUBLIC_BASE_PATH (mismo patrón PUBLIC_BASE del core).
 *
 * SIN dependencias nuevas: fetch nativo + reintentos exponenciales.
 */
import { leerOverridesFlags } from "./obs/politica";
import type { FlagsApp } from "./obs/tipos";

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const REFRESH_MS = 24 * 60 * 60 * 1000;
const REINTENTO_BASE_MS = 60_000;
const REINTENTO_TOPE_MS = REFRESH_MS;

/** Defaults del contrato §4.2 (poolWorkers 1 — D31 KIT e14-carril-qr-
 *  paralelo-v1: el OCR es wasm mono-hilo, DOS en paralelo se reparten el
 *  mismo CPU sin ganancia y la UI sufre (cabecera runner.ts); el slot
 *  liberado lo ocupa el CARRIL QR del prescan en paralelo con la corrida ·
 *  thumbsOn true · ocrThreadsTope 4 · telemetriaSalud true ·
 *  endpointReportes null — sin backend, D1 · colaPersistente true — ANEXO
 *  cola-persistente-v1: la masiva SOLO se elimina con vaciar() del dueño;
 *  false = MODO PRUEBAS e64p · sondeoQrPrecoz true + sondeoQrPresupuestoMs
 *  2500 — KIT e73-sondeo-qr-precoz-v1 §D: sondeo QR en INGESTA, kill-switch
 *  del dueño · hangEnCurso true — KIT e14-obs-hang-atribucion-v1 §D: sensor
 *  hang-en-curso, kill-switch del dueño). El override manual del dueño
 *  (e14-flags-overrides / flags.json `poolWorkers: 2`) restaura el pool
 *  doble de e71 — whitelist politica.ts intacta. */
export const FLAGS_DEFAULT: FlagsApp = {
  poolWorkers: 1,
  thumbsOn: true,
  ocrThreadsTope: 4,
  telemetriaSalud: true,
  endpointReportes: null,
  colaPersistente: true,
  sondeoQrPrecoz: true,
  sondeoQrPresupuestoMs: 2500,
  // D36 — cortocircuito del sondeo bajo hambruna de CPU (≥3 hard-kills/min,
  // la señal YA medida en e14-sondeo-burst-v1): el worker NO es zombi, está
  // compitiendo con el OCR por CPU y el bucle kill→respawn→re-boot wasm
  // ALARGA el pipeline que el sondeo quería ayudar. Pausar 30 s es MENOS
  // trabajo (compatible con §I «jamás extender presupuesto» — aquí se
  // reduce carga); la dedup NO se pierde (capa0-qr + dhash + payload
  // in-pool cubren las mismas gemelas). Kill-switch del dueño: false =
  // comportamiento de siempre byte-idéntico.
  sondeoQrCortocircuito: true,
  hangEnCurso: true,
  // KIT e107-prescan-qr-cola-v1 (§D.4): pre-scan QR en «PROCESAR COLA» —
  // kill-switch del dueño (flag OFF ⇒ prescanYIniciar = iniciar()
  // byte-idéntico, sin instanciar worker ni emitir estado).
  prescanQrCola: true,
  // KIT e14-orientacion-qr-v1 (§D): QR-brújula de orientación — el cuadrante
  // del QR manda la rotación y el rescate hi-res (ZXing) solo corre si
  // jsQR@warp falla (bench v8.3: 4/4 con fotos arrugadas/blotchy donde
  // jsQR 0/4). Kill-switch del dueño: OFF = sondeo OCR de siempre byte a
  // byte (el probe D56 queda como red de seguridad).
  qrBrujulaOrientacion: true,
  // KIT flujo-dueno-v1 (K2 — brief Agente B) — kill-switch del dueño.
  // masivaSondeoCrudo default TRUE = camino de hoy (el sondeo crudo e73
  // alimenta el dedup temprano; OFF solo para la corrida de control del
  // dueño).
  masivaSondeoCrudo: true,
  // KIT e14-prescan-warp-lado-v1 — válvulas del dueño para el pre-scan
  // (defaults = comportamiento de hoy byte-idéntico: presupuesto 4000 +
  // salida de warp hasta 4032). prescanWarpLado 1920 es el remedio REAL de
  // los hard-kill «warp» en equipos lentos: el coste del warpPerspective
  // escala con los píxeles de SALIDA (4032 ≈ 12MP; 1920 ≈ 2.7MP) y el
  // worker ya aceptaba msg.maxWarpLongSide (detection-worker.js) sin
  // consumidor — la QR se lee igual a 1920 (el core lee QR a 1280/1920).
  prescanQrPresupuestoMs: 4000,
  prescanWarpLado: 4032,
  // KIT e14-gama-adaptativa-v1 (D74) — capa adaptativa de GAMA para el
  // pipeline masiva+OCR: el tier detectado (obs/dispositivo §4.4 — BAJO/
  // MEDIO/ALTO) aplica SOLO presupuestos de recursos (pool/threads/warp/
  // prescan/watchdog/master/QR/dhash — tabla completa en gama.ts) en
  // BAJO/MEDIO. El override MANUAL del dueño manda clave a clave (D6: la
  // app jamás pisa una mano explícita) y `false` = byte-idéntico a hoy en
  // TODOS los dispositivos (kill-switch único).
  masivaAdaptativoGama: true,
  // KIT e14-capa0-qr-worker-v1 (D40) — la CAPA 0 QR del runner (decode del
  // blob + ladder + barridos jsQR + nitidez + binarizada + rotaciones +
  // rescate) corre en WORKER dedicado jsQR-only (capa0-qr.worker.js): el
  // peor caso SIN QR (~15-17 s SYNC en el hilo UI, documentado en
  // identidad-qr.ts) deja de congelar la bandeja — justo en gama baja,
  // donde el cortocircuito D36 pausa el sondeo y `qrPrevio` no llega. El
  // tier zxing (wasm — red line del worker e73) queda en MAIN como
  // SOLO-rescate si el worker no leyó nada (cobertura EXACTA a la cadena
  // de hoy). Kill-switch del dueño: false = byte-idéntico a hoy (cadena
  // completa en main con SU presupuesto de gama).
  capa0QrWorker: true,
  // KIT ocr-router-v1 (docs/ESTRATEGIA-ocr-router-v1.md) — ROUTER de motor
  // OCR por dispositivo (PR #10): BAJO/MEDIO = Tesseract best+psm4 ·
  // ALTO+SIMD = PP-OCRv5 con sonda de carga. `ocrMotorAdaptativo` false =
  // Tesseract en TODOS los dispositivos (kill-switch único, byte-idéntico a
  // hoy). `ocrMotor` no-null = override MANUAL del dueño (D6): el router NO
  // decide.
  ocrMotorAdaptativo: true,
  ocrMotor: null,
  // KIT autonomia-ui-v1 (D44) — autonomía de UI/ARRANQUE por dispositivo:
  // animaciones reducidas en tier BAJO + precarga del motor OCR en idle
  // (cuando el plan la recomienda — planRecomendado().preloadModelos).
  // false = byte-idéntico a hoy (kill-switch del dueño).
  uiAdaptativaGama: true,
};

/** Último flags.json bueno (null = nunca llegó). */
let remotosCacheados: Partial<FlagsApp> | null = null;

/** Saneo del JSON remoto/overrides: solo claves conocidas y tipos válidos
 *  (jamás confiar en lo que llega por red/archivo). */
export function sanearFlags(o: unknown): Partial<FlagsApp> {
  if (typeof o !== "object" || o === null) return {};
  const p = o as Partial<FlagsApp>;
  const limpio: Partial<FlagsApp> = {};
  if (p.poolWorkers === 1 || p.poolWorkers === 2) limpio.poolWorkers = p.poolWorkers;
  if (typeof p.thumbsOn === "boolean") limpio.thumbsOn = p.thumbsOn;
  if (typeof p.colaPersistente === "boolean") limpio.colaPersistente = p.colaPersistente;
  if (typeof p.ocrThreadsTope === "number" && Number.isFinite(p.ocrThreadsTope)) {
    limpio.ocrThreadsTope = Math.max(1, Math.min(8, Math.round(p.ocrThreadsTope)));
  }
  if (typeof p.telemetriaSalud === "boolean") limpio.telemetriaSalud = p.telemetriaSalud;
  if (p.endpointReportes === null || typeof p.endpointReportes === "string") {
    limpio.endpointReportes = p.endpointReportes;
  }
  // KIT e73-sondeo-qr-precoz-v1 (§D) — whitelist aditiva (claves conocidas;
  // el saneo sigue rechazando desconocidas). Tipo inválido → default (ausente).
  if (typeof p.sondeoQrPrecoz === "boolean") limpio.sondeoQrPrecoz = p.sondeoQrPrecoz;
  if (typeof p.sondeoQrPresupuestoMs === "number" && Number.isFinite(p.sondeoQrPresupuestoMs)) {
    limpio.sondeoQrPresupuestoMs = Math.max(500, Math.min(30_000, Math.round(p.sondeoQrPresupuestoMs)));
  }
  // D36 — whitelist aditiva (booleano).
  if (typeof p.sondeoQrCortocircuito === "boolean") limpio.sondeoQrCortocircuito = p.sondeoQrCortocircuito;
  // KIT e14-obs-hang-atribucion-v1 (§D) — whitelist aditiva (booleano).
  if (typeof p.hangEnCurso === "boolean") limpio.hangEnCurso = p.hangEnCurso;
  // KIT e107-prescan-qr-cola-v1 (§D.4) — whitelist aditiva (booleano).
  if (typeof p.prescanQrCola === "boolean") limpio.prescanQrCola = p.prescanQrCola;
  // KIT e14-orientacion-qr-v1 (§D) — whitelist aditiva (booleano).
  if (typeof p.qrBrujulaOrientacion === "boolean") limpio.qrBrujulaOrientacion = p.qrBrujulaOrientacion;
  // KIT flujo-dueno-v1 (K2 — brief Agente B) — whitelist aditiva (booleano).
  if (typeof p.masivaSondeoCrudo === "boolean") limpio.masivaSondeoCrudo = p.masivaSondeoCrudo;
  // KIT e14-prescan-warp-lado-v1 — whitelist aditiva (números con clamp).
  if (typeof p.prescanQrPresupuestoMs === "number" && Number.isFinite(p.prescanQrPresupuestoMs)) {
    limpio.prescanQrPresupuestoMs = Math.max(1000, Math.min(30_000, Math.round(p.prescanQrPresupuestoMs)));
  }
  if (typeof p.prescanWarpLado === "number" && Number.isFinite(p.prescanWarpLado)) {
    limpio.prescanWarpLado = Math.max(256, Math.min(4032, Math.round(p.prescanWarpLado)));
  }
  // KIT e14-gama-adaptativa-v1 — whitelist aditiva (booleano).
  if (typeof p.masivaAdaptativoGama === "boolean") limpio.masivaAdaptativoGama = p.masivaAdaptativoGama;
  // KIT ocr-router-v1 — whitelist aditiva (booleano + enum del motor).
  if (typeof p.ocrMotorAdaptativo === "boolean") limpio.ocrMotorAdaptativo = p.ocrMotorAdaptativo;
  if (p.ocrMotor === "ppocrv5" || p.ocrMotor === "tesseract-best-psm4" || p.ocrMotor === "tesseract-spa-best-psm4") limpio.ocrMotor = p.ocrMotor;
  // KIT autonomia-ui-v1 (D44) — whitelist aditiva (booleano).
  if (typeof p.uiAdaptativaGama === "boolean") limpio.uiAdaptativaGama = p.uiAdaptativaGama;
  return limpio;
}

/** leerFlags() del contrato — SYNC: defaults ← remotos cacheados (si el
 *  refresco ya llegó) ← overrides (máxima prioridad). Nunca lanza. */
export function leerFlags(): FlagsApp {
  let flags: FlagsApp = { ...FLAGS_DEFAULT };
  try {
    if (remotosCacheados) flags = { ...flags, ...remotosCacheados };
    const overrides = sanearFlags(leerOverridesFlags());
    flags = { ...flags, ...overrides };
  } catch {
    /* silencioso — defaults */
  }
  return flags;
}

/** Un intento de refresco (fetch de flags.json). Distinción honesta para
 *  el contrato: "sin-endpoint" (404 — no está servido), null (fallo de
 *  RED/parseo — el caller clasifica "error") o el JSON saneado. */
async function intentarFetch(): Promise<Partial<FlagsApp> | "sin-endpoint" | null> {
  try {
    if (typeof fetch !== "function") return "sin-endpoint";
    const res = await fetch(`${PUBLIC_BASE}/flags.json`, { cache: "no-store" });
    if (!res.ok) return "sin-endpoint";
    return sanearFlags(await res.json());
  } catch {
    return null; // offline / cuerpo corrupto → "error" (fallback al cache)
  }
}

let refreshProgramado = false;
let reintentoMs = REINTENTO_BASE_MS;
let timerRefresh: number | null = null;

/** Programar el próximo intento: 24 h tras un éxito; backoff exponencial
 *  (1m → 2m → 4m … cap 24 h) tras un fallo — offline-safe. Idempotente. */
function programarProximo(ms: number): void {
  if (refreshProgramado || typeof window === "undefined") return;
  refreshProgramado = true;
  timerRefresh = window.setTimeout(() => {
    refreshProgramado = false;
    void refrescarFlags();
  }, ms);
  if (timerRefresh !== null && typeof timerRefresh === "object" && "unref" in timerRefresh) {
    (timerRefresh as { unref: () => void }).unref?.();
  }
}

/** refrescarFlags() del contrato — «ok" | "sin-endpoint" | "error"»:
 *  · "sin-endpoint": no hay flags.json servido (404/ausente — el estado
 *    actual del repo). Defaults + overrides mandan.
 *  · "ok": remotos cacheados (leerFlags los aplica ya).
 *  · "error": fallo de red — fallback al último cacheado (o defaults).
 *  Con éxito reprograma el refresco a 24 h; con fallo, backoff. */
export async function refrescarFlags(): Promise<"ok" | "sin-endpoint" | "error"> {
  try {
    if (typeof window === "undefined") return "sin-endpoint";
    const remotos = await intentarFetch();
    if (remotos === "sin-endpoint") {
      // No hay flags.json servido (estado normal hoy) → 24 h y listo.
      programarProximo(REFRESH_MS);
      return "sin-endpoint";
    }
    if (remotos && Object.keys(remotos).length > 0) {
      remotosCacheados = remotos;
      reintentoMs = REINTENTO_BASE_MS;
      programarProximo(REFRESH_MS);
      return "ok";
    }
    // fallo de RED (o cuerpo corrupto) → "error" + backoff — el último
    // bueno queda cacheado (offline-safe, contrato §4.3).
    programarProximo(reintentoMs);
    reintentoMs = Math.min(REINTENTO_TOPE_MS, reintentoMs * 2);
    return "error";
  } catch {
    // fallo de red: backoff y re-intentar — el último bueno queda cacheado
    programarProximo(reintentoMs);
    reintentoMs = Math.min(REINTENTO_TOPE_MS, reintentoMs * 2);
    return "error";
  }
}

/** Prueba interna (tests): reset del estado del módulo. */
export function __resetFlagsParaTest(): void {
  remotosCacheados = null;
  refreshProgramado = false;
  reintentoMs = REINTENTO_BASE_MS;
  if (timerRefresh !== null && typeof timerRefresh === "object" && "unref" in timerRefresh) {
    clearTimeout(timerRefresh as unknown as ReturnType<typeof setTimeout>);
  }
  timerRefresh = null;
}
