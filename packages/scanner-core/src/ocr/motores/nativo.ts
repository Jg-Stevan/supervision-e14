/**
 * KIT e14-ocr-nativo-v1 — cliente del SIDE CAR nativo (`native/servidor.py`).
 *
 * El det+rec de RapidOCR es el paso más caro del pipeline (el informe lo mide
 * en 17.3 s de 25.3 s totales, 68 %). En el navegador corre en WASM-SIMD con
 * 2-4 hilos; en CPU nativa con onnxruntime sobre los mismos .onnx y el mismo
 * pre/post tarda ~4 s. Este módulo es el ÚNICO punto donde la app pregunta si
 * hay un motor nativo a mano.
 *
 * Doctrina (misma del ledger-remoto): el sidecar es una ACELERACIÓN, jamás un
 * requisito. `null` = «sigue como hoy» en TODOS los casos — flag apagado, no
 * responde, timeout, respuesta rara. No lanza, no condiciona el gate, no toca
 * el score: el texto que devuelve tiene la MISMA forma que el del motor WASM
 * (líneas aceptadas unidas con \n + conf media POST `TEXT_SCORE`).
 *
 * Solo localhost (el validator de la tabla de flags lo garantiza): los
 * recortes de acta son datos sensibles y quien edite flags.json no puede
 * apuntar el OCR a un servidor arbitrario (criterio SEC-10).
 */

import { logger } from "../../dominio/logger";

// 3.3: la URL del sidecar entra por CONFIGURACIÓN (S: leerFlags().ocrNativoUrl
// — validador SEC-10: solo localhost). D la hereda apagada (null) hasta que
// su dueño la cablee — doctrina: el sidecar es ACELERACIÓN, jamás requisito.
let urlNativo: string | null = null;
/** Fija la URL del sidecar nativo (null/string vacío = apagado). */
export function configurarNativo(url: string | null): void {
  urlNativo = url && url.length > 0 ? url : null;
}

export interface OcrNativoSalida {
  texto: string;
  conf: number;
  detMs: number;
  recMs: number;
  nLineas: number;
  nBoxes: number;
}

/** Revalidación del sondeo de salud: barato (1 GET) y con memoria, para que un
 *  sidecar apagado no le cobre un timeout a cada acta. */
const SALUD_TTL_MS = 15_000;
const SALUD_TIMEOUT_MS = 1_200;
/** Techo de UNA pasada de OCR nativo. El pipeline ya tiene su propio
 *  presupuesto (watchdog de gama); esto solo evita que un sidecar colgado
 *  congele la captura — al vencer, la acta cae al WASM en la misma corrida. */
const OCR_TIMEOUT_MS = 45_000;

let salud: { url: string; ok: boolean; ms: number } | null = null;
/** Lo que el sidecar declaró en /salud (motor real cargado), para el reporte. */
let info: { url: string; motor: string | null; sesiones: number } | null = null;
/** El último /salud COMPLETO que vimos, tal cual lo contestó el proceso. Lo
 *  pinta la tarjeta del acelerador (KIT e14-sidecar-instalable-v1) — necesita
 *  el `pid` para distinguir «mi sidecar» de «el que quedó colgado de antes». */
export interface SaludNativo {
  url: string;
  ok: boolean;
  motor: string | null;
  sesiones: number;
  version: string | null;
  pid: number | null;
  /** ms de la ida y vuelta de la sonda (0 = ni siquiera contestó). */
  ms: number;
}
let ultimoSalud: SaludNativo | null = null;

function urlBase(): string | null {
  const u = urlNativo;
  if (!u || typeof u !== "string") return null;
  return u.replace(/\/+$/, "");
}

/** Dónde estamos esperando encontrar el sidecar (null = flag apagado en esta
 *  compilación). Lo muestra la tarjeta para que el visitante sepa qué puerto
 *  tiene que estar escuchando — el `--puerto` del .exe es configurable y el
 *  default del exe NO tiene por qué coincidir con el del flag. */
export function urlLadoNativo(): string | null {
  return urlBase();
}

async function conTimeout<T>(hacer: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), ms);
  try {
    return await hacer(control.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** ¿El lado nativo está disponible? cachea el veredicto SALUD_TTL_MS. */
export async function ladoNativoDisponible(): Promise<boolean> {
  const url = urlBase();
  if (!url) {
    salud = null;
    info = null;
    ultimoSalud = null;
    return false;
  }
  const ahora = performance.now();
  if (salud && salud.url === url && ahora - salud.ms < SALUD_TTL_MS) return salud.ok;
  let ok = false;
  let motor: string | null = null;
  let sesiones = 0;
  let version: string | null = null;
  let pid: number | null = null;
  let ms = 0;
  const tSonda = ahora;
  try {
    const res = await conTimeout(
      (signal) => fetch(`${url}/salud`, { cache: "no-store", signal }),
      SALUD_TIMEOUT_MS,
    );
    ms = Math.round(performance.now() - tSonda);
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      ok = j?.ok === true;
      motor = typeof j?.motor === "string" ? j.motor : null;
      sesiones = Number(j?.sesiones) || 0;
      version = typeof j?.version === "string" ? j.version : null;
      pid = Number.isFinite(Number(j?.pid)) && Number(j?.pid) > 0 ? Number(j?.pid) : null;
    }
  } catch {
    ok = false;
  }
  salud = { url, ok, ms: ahora };
  info = ok ? { url, motor, sesiones } : null;
  ultimoSalud = { url, ok, motor, sesiones, version, pid, ms };
  logger.info(`[e14-nativo] sidecar ${url} ${ok ? `DISPONIBLE motor=${motor} pid=${pid} ${ms}ms` : "no disponible"}`);
  return ok;
}

/** El último /salud completo (null = todavía no sondemos, o flag apagado). No
 *  sondéa: lo llama la UI después de await-ladoNativoDisponible() o para pintar
 *  lo que ya sabe sin cobrarle un fetch más al usuario. */
export function saludNativo(): SaludNativo | null {
  return ultimoSalud;
}

/** Tira la memoria del sondeo. La usa el botón «REINTENTAR» de la tarjeta: sin
 *  esto, darle justo después de arrancar el sidecar releería un `ok:false` con
 *  hasta SALUD_TTL_MS de vida y la tarjeta no se movería — el clásico «ya lo
 *  instalé y no se entera». */
export function invalidarSondaNativo(): void {
  salud = null;
  info = null;
  ultimoSalud = null;
}

/** POOL que el sidecar declaró para sí (`--sesiones N`) en el último sondeo;
 *  0 = sin sondeo bueno o sidecar que no lo anuncia. Lo consume el relé de
 *  `prefacta.ts`: el ancho del cuello lo fija quien tiene los núcleos, en vez
 *  de una flag nueva que el dueño tenga que recordar al arrancar el sidecar. */
export function sesionesLadoNativo(): number {
  return info?.sesiones ?? 0;
}

/** Una pasada det+rec en el sidecar. `null` = usar el motor WASM (siempre
 *  seguro: el caller reintenta con el camino de siempre). */
export async function ocrNativo(dataUrl: string, cap: number): Promise<OcrNativoSalida | null> {
  const url = urlBase();
  if (!url) return null;
  try {
    const res = await conTimeout(
      (signal) =>
        fetch(`${url}/ocr`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imagen: dataUrl, cap }),
          signal,
        }),
      OCR_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (typeof j.texto !== "string" || typeof j.conf !== "number") return null;
    salud = { url, ok: true, ms: performance.now() }; // una lectura buena revalida el sondeo
    return {
      texto: j.texto,
      conf: j.conf,
      detMs: Number(j.detMs) || 0,
      recMs: Number(j.recMs) || 0,
      nLineas: Number(j.nLineas) || 0,
      nBoxes: Number(j.nBoxes) || 0,
    };
  } catch {
    return null;
  }
}

/** Identidad del motor para el reporte de la corrida (`motorOcr`). */
export function motorNativoActivo(): boolean {
  return salud?.ok === true && urlBase() !== null;
}

// ─── FASE 2 — ACTA COMPLETA (quad + warp + b/n + orientación + OCR en una ida)

/** Lo que `/acta` resuelve: el MISMO set de artefactos que el pipeline JS
 *  produce entre DETECCIÓN y OCR (ambas variantes de la imagen ya enderezadas,
 *  el texto y el payload del QR). `quad` viene NORMALIZADO (0..1 sobre la foto
 *  decodificada por el sidecar) — el JS lo proyecta sobre SU copia del
 *  original, así que ambos decodificadores no tienen por qué coincidir en
 *  píxeles. */
export interface ActaNativa {
  procesada: string;
  texto: string;
  conf: number;
  detMs: number;
  recMs: number;
  nLineas: number;
  nBoxes: number;
  quad: [number, number][] | null;
  quadOrigen: string;
  rot: number;
  qr: string | null;
  ancho: number;
  alto: number;
  totalMs: number;
}

/** Techo del acta-completa: el sidecar hace 4 cosas (warp, sonda, b/n, OCR) —
 *  más holgado que el de una sola pasada de OCR. Al vencer, null → el pipeline
 *  JS corre de principio a fin como hoy. */
const ACTA_TIMEOUT_MS = 90_000;

/** El acta entera en el sidecar. `null` = no respondió / respondió mal → el
 *  caller usa el camino WASM de siempre (jamás lanza). */
export async function actaNativa(dataUrl: string, cap = 1280): Promise<ActaNativa | null> {
  const url = urlBase();
  if (!url) return null;
  try {
    const res = await conTimeout(
      (signal) =>
        fetch(`${url}/acta`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imagen: dataUrl, cap }),
          signal,
        }),
      ACTA_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (
      typeof j.procesada !== "string" ||
      typeof j.texto !== "string" ||
      typeof j.conf !== "number"
    ) {
      return null;
    }
    salud = { url, ok: true, ms: performance.now() };
    const q = j.quad;
    return {
      procesada: j.procesada,
      texto: j.texto,
      conf: j.conf,
      detMs: Number(j.detMs) || 0,
      recMs: Number(j.recMs) || 0,
      nLineas: Number(j.nLineas) || 0,
      nBoxes: Number(j.nBoxes) || 0,
      quad:
        Array.isArray(q) && q.length === 4
          ? (q as [number, number][])
          : null,
      quadOrigen: typeof j.quadOrigen === "string" ? j.quadOrigen : "nativo",
      rot: Number(j.rot) || 0,
      qr: typeof j.qr === "string" ? j.qr : null,
      ancho: Number(j.ancho) || 0,
      alto: Number(j.alto) || 0,
      totalMs: Number(j.totalMs) || 0,
    };
  } catch {
    return null;
  }
}

/** Qué sidecar corrió realmente (null = el OCR fue WASM) — para el campo
 *  aditivo `ocrNativo` del informe de métricas. */
export function resumenNativo(): { url: string; motor: string | null } | null {
  return motorNativoActivo() ? info : null;
}
