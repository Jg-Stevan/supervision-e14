/**
 * KIT e14-observabilidad-v1 (A1-C7) — flags de la app (leerFlags/refrescar
 * Flags del contrato §4.3). Cadena de prioridad:
 *
 *   DEFAULTS ← public/flags.json (remoto, cacheado 24 h, offline-safe)
 *            ← overrides localStorage (MÁXIMA prioridad — el kill switch
 *              MANUAL del mantenedor, D6: la app JAMÁS se auto-configura).
 *
 * flags.json es un archivo ESTÁTICO en public/ (hoy NO existe → «sin-
 * endpoint»): el mantenedor lo puede desplegar/editar sin tocar el código —
 * same-origin con NEXT_PUBLIC_BASE_PATH (mismo patrón PUBLIC_BASE del core).
 *
 * SIN dependencias nuevas: fetch nativo + reintentos exponenciales.
 */
import { leerOverridesFlags, leerOverridesFlagsRaw } from "./obs/politica";
import type { FlagsApp } from "./obs/tipos";
// R2 — PUBLIC_BASE único (src/shared/env.ts, era const local §B2 #10).
import { PUBLIC_BASE } from "@/shared/env";
// R2 — tabla ÚNICA de flags + whitelist de saneo (§B2 #11): sanearFlags y
// leerOverridesFlags derivan del MISMO esquema (fin de la doble whitelist).
import { sanearConEsquema } from "@/shared/e14/flags-schema";

const REFRESH_MS = 24 * 60 * 60 * 1000;
const REINTENTO_BASE_MS = 60_000;
const REINTENTO_TOPE_MS = REFRESH_MS;

/** Defaults del contrato §4.2 (poolWorkers 2 — el D31 KIT e14-carril-qr-
 *  paralelo-v1 la bajó a 1 porque «el OCR es wasm mono-hilo, DOS en paralelo
 *  se reparten el mismo CPU sin ganancia y la UI sufre (cabecera runner.ts)».
 *  Con el EP WebGPU y la cola ORT global ese motivo se cayó: el GPU es UN
 *  device y la cola lo serializa sin pérdida, así que el segundo slot ahora
 *  SOLO suma el trabajo que sí es CPU (warp, decode, QR) — medido gpu17 vs
 *  gpu18: −28 s de muro. El carril QR del prescan sigue existiendo, ahora con
 *  dos actas que lo aprovechan ·
 *  thumbsOn true · ocrThreadsTope 4 · telemetriaSalud true ·
 *  endpointReportes null — sin backend, D1 · colaPersistente true — ANEXO
 *  cola-persistente-v1: la masiva SOLO se elimina con vaciar() del mantenedor;
 *  false = MODO PRUEBAS e64p · sondeoQrPrecoz true + sondeoQrPresupuestoMs
 *  2500 — KIT e73-sondeo-qr-precoz-v1 §D: sondeo QR en INGESTA, kill-switch
 *  del mantenedor · hangEnCurso true — KIT e14-obs-hang-atribucion-v1 §D: sensor
 *  hang-en-curso, kill-switch del mantenedor). El override manual del mantenedor
 *  (e14-flags-overrides / flags.json) sigue intacto y manda sobre estos
 *  defaults — `{"poolWorkers":1}` devuelve al pool simple de e71. */
export const FLAGS_DEFAULT: FlagsApp = {
  // KIT ocr-cola-global-v1 / gpu17: DOS actas en paralelo valen −28 s de muro
  // (gpu17 116,4 s con pool 2 vs gpu18 144,7 s con pool 1, mismo build). El
  // precio era el COLGAJE del singleton ORT (gpu8/gpu13), y lo paga la cola
  // global de abajo — van JUNTAS, no se sube una sin la otra.
  poolWorkers: 2,
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
  // in-pool cubren las mismas gemelas). Kill-switch del mantenedor: false =
  // comportamiento de siempre byte-idéntico.
  sondeoQrCortocircuito: true,
  hangEnCurso: true,
  // KIT e107-prescan-qr-cola-v1 (§D.4): pre-scan QR en «PROCESAR COLA» —
  // kill-switch del mantenedor (flag OFF ⇒ prescanYIniciar = iniciar()
  // byte-idéntico, sin instanciar worker ni emitir estado).
  prescanQrCola: true,
  // KIT e14-orientacion-qr-v1 (§D): QR-brújula de orientación — el cuadrante
  // del QR manda la rotación y el rescate hi-res (ZXing) solo corre si
  // jsQR@warp falla (bench v8.3: 4/4 con fotos arrugadas/blotchy donde
  // jsQR 0/4). Kill-switch del mantenedor: OFF = sondeo OCR de siempre byte a
  // byte (el probe D56 queda como red de seguridad).
  qrBrujulaOrientacion: true,
  // KIT flujo-dueno-v1 (K2 — brief Agente B) — kill-switch del mantenedor.
  // masivaSondeoCrudo default TRUE = camino de hoy (el sondeo crudo e73
  // alimenta el dedup temprano; OFF solo para la corrida de control del
  // mantenedor).
  masivaSondeoCrudo: true,
  // KIT e14-prescan-warp-lado-v1 — válvulas del mantenedor para el pre-scan
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
  // BAJO/MEDIO. El override MANUAL del mantenedor manda clave a clave (D6: la
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
  // de hoy). Kill-switch del mantenedor: false = byte-idéntico a hoy (cadena
  // completa en main con SU presupuesto de gama).
  capa0QrWorker: true,
  // Decisión del mantenedor 2026-11-11 — la cascada de D pasa a ser el motor por
  // defecto de S: Tesseract `fast` (spa 4.0.0_fast) como intento 1 → GATE de
  // producción (clasificarCabecera + divipol) → si no hay AUTO, RapidOCR
  // PP-OCRv4 escalonado 1280→1920→ROI. false = escalonado RapidOCR de
  // siempre byte a byte (kill-switch del mantenedor); SIM nunca la corre.
  ocrCascada: true,
  // KIT e75-qr-zoom-zbar-v1 — tier ZOOM TL re-escalado + zbar-wasm en la capa
  // 0 (recorta la banda TL 50%×30% del ORIGINAL a píxeles nativos y la pasa
  // por zxing→zbar ANTES del rescate 4096): el lab de 12 imágenes reales
  // midió 3 páginas del escáner que la cadena completa no leyó NI a 4000 px
  // full-frame y 2 actas que SOLO zbar vio. Kill-switch del mantenedor: false =
  // cadena de hoy byte-idéntica.
  qrZoomTl: true,
  // R1.2 — KIT qr-cache-negativa-v1 — cuando la cadena COMPLETA de capa 0
  // termina null SIN presupuesto vencido, el hecho se recuerda por SHA-256
  // de los bytes (session Map + registro.qrSinPayload) y las siguientes
  // corridas del MISMO archivo saltan el ladder (2-3 ms). El informe midió
  // ~110 s de ladder inútil sobre 3 actas sin QR × 2 corridas. "PROCESAR
  // IGUAL" (forzarDedupOff) JAMÁS consulta ni escribe. Kill-switch del
  // mantenedor: false = byte-idéntico a hoy.
  qrCacheNegativa: true,
  // KIT auto-envio-umbral-v1 — palanca del mantenedor para el objetivo «la mayoría
  // de actas se envían automáticamente si son elegibles y el OCR las
  // reconoce»: "optima" (default) = solo OPTIMA se autoenvía (hoy);
  // "advertencia" = también se autoenvían las ADVERTENCIA (6.5-7.9) con
  // clasificación AUTO (join divipol completo — el mismo gate que el monitor
  // ya exige en publicarDesdeActa). Todos los vetos anti-duplicado (H1
  // ledger, remoto, dedup) corren idéntico. Override: flags.json o
  // localStorage e14-flags-overrides {"autoEnvioUmbral":"advertencia"}.
  autoEnvioUmbral: "optima",
  // KIT e14-ocr-nativo-v1 — sidecar nativo del det+rec. Default ACTIVADO
  // (decisión del mantenedor, 2026-11-03): con `python native/servidor.py --puerto
  // 8765` levantado, el det+rec corre fuera del navegador. Cualquier fallo (no
  // responde, timeout, JSON inválido) hace caer al motor de siempre en MISMA
  // pasada — el sidecar es una aceleración, nunca un requisito. Apagar:
  // override localStorage e14-flags-overrides {"ocrNativoUrl":null}.
  ocrNativoUrl: "http://127.0.0.1:8765",
  // KIT e14-ocr-nativo-v1 (FASE 2) — acta COMPLETA en el sidecar (det+rec en
  // una sola ida). Sin sidecar, el pipeline JS de siempre.
  actaNativa: true,
  // KIT ocr-ep-webgpu-v1 — dónde se MULTIPLICA el OCR (los mismos modelos).
  // "auto" (default) = WebGPU si hay adapter real (no fallback) y si no, wasm.
  // El mantenedor lo fija a "wasm" para volver al camino de siempre SIN descargar
  // el wasm JSEP (28 MB) y a "webgpu" para forzar el intento (si falla, se
  // reintenta solo el wasm — nunca tumba la cola). Override: flags.json o
  // localStorage e14-flags-overrides {"ocrEp":"wasm"}.
  ocrEp: "auto",
  // KIT e14-qr-previo-rapido-v1 — pase BARATO (≤2 s) antes de pagar el worker
  // de la capa 0 + su rescate zxing en main. Lee el mismo payload; si no lee,
  // la cadena de hoy corre intacta. Override: {"qrPrevioRapido":false}.
  qrPrevioRapido: true,
  // KIT e14-probe-mini768-v1 — lado mayor de la MINIATURA del sondeo de
  // orientación. El fallo seguro (miniaturaConfiada) NO cambia de umbrales: la
  // mini manda solo con evidencia fuerte (corte sana/confirmada, o rotación
  // aplicada con ≥2 anclas y conf ≥0.6). A 320 la miniatura «sub-leía» y casi
  // SIEMPRE devolvía al sondeo completo (medido gpu9: 4,5 s/acta, escala>320 en
  // todas); a 768 la MISMA evidencia se alcanza en el lienzo barato.
  // Override: {"probeMiniLado":320} = hoy byte-idéntico.
  // KIT e14-probe-mini768-v1 (bench `gpu16`, 2026-11-03) — 768 → 1280: a 768
  // las tiras verticales del E-14 dan líneas de ~250 px que el rec submuestrea
  // a 480 (LEE MAL ⇒ el probe «sub-lee», no confirma y cae al sondeo completo
  // de 3 589 px: 6-10 s por acta). El det YA va capped a DET_CAP_RAPIDO=1280 y
  // el rec a REC_WMAX=480, así que un lienzo de 1280 entrega PRÁCTICAMENTE los
  // MISMO pixels por línea que el original: mismo veredicto (medido: los 6
  // veredicios y los 6 scores del lote coinciden con gpu15) y el probe decide
  // en la miniatura. Override: {"probeMiniLado":768} = el default anterior.
  probeMiniLado: 1280,
  // KIT qr-postprevio-corta-v1 — el pase caro de la capa 0 SOLO aporta lo que
  // el previo no vio: los píxeles extra del lienzo a 2048 (ladder base +
  // recorte TL). Los barridos jsQR/zxing, las rotaciones y el rescate 4096 ya
  // los pagó el previo a 1600 / en píxeles nativos (bench gpu12: la acta SIN
  // QR costaba 15,7 s con esa escalera entera). Cadena NO completa ⇒ la caché
  // negativa R1.2 no registra (honesto). Override:
  // {"qrCapa0PostPrevioCorta":false} = cadena de hoy byte-idéntica.
  qrCapa0PostPrevioCorta: true,
  // KIT ocr-sin-cls-v1 — clasificador de 180° POR LÍNEA de RapidOCR. La
  // orientación de página ya la deciden quad+probe antes del rec; el cls solo
  // voltea líneas sueltas (1,2-1,9 s por acta medidos en gpu12 + el compile del
  // pipeline cls en la sonda). true = hoy byte-idéntico.
  // Override: {"ocrCls":false}.
  ocrCls: true,
  // KIT ocr-cola-global-v1 — UN cliente ORT a la vez (det/cls/rec del reconocer,
  // det del probe y lote de rec del probe). Con poolWorkers=2 dos actas llaman
  // al MISMO singleton y el lote se CUELGA tras un `det run OK` (benches gpu8 y
  // gpu13): el GPU es UN device, serializar no le quita nada y libera a la otra
  // acta para el trabajo CPU (warp, decode, QR). Es el PEaje obligatorio de
  // poolWorkers 2: sin ella el lote se CUELGA (gpu8/gpu13).
  // Override: {"ocrColaGlobal":false} = rutas sin cola (el default histórico).
  ocrColaGlobal: true,
  // KIT e14-proceso-lado-v1 — lado mayor de SALIDA del warp+enhance del lote.
  // Bajarlo recorta el coste ∝ píxeles del ítem CPU más pesado (5,8 s/acta
  // medidos en gpu18) porque el core redimensiona DURANTE el decode del JPEG y
  // warpea/enhancea sobre ese lienzo; el quad son fracciones ⇒ la geometría del
  // recorte no cambia. Curva medida en el lote demo (pool 2, perfil caliente,
  // sonda YA fuera del muro): 4032 → 91,8 s · 2048 → 77,8 s · 1920 → 58,8-62,3 s
  // · 1600 → 74,3 s (la curva se aplana: bajar de 1920 ya NO paga). Los seis
  // desenlaces y los seis scores de 1920 son IDÉNTICOS a los de 4032 y el blob
  // guardado se revisó a ojo: recorte, sombras fuera y letra leíble (~165 ppp
  // sobre el lado largo de un A4 = la de un escáner de mesa).
  // Override: {"procesoLadoMayor":4032} = el default anterior, byte a byte.
  procesoLadoMayor: 1920,
  // D98-sup (plan de cierre 2026-11-12, C-2) — sustituye al hallazgo #3 de la
  // auditoría 2026-11-11: el lote DEMO (fixtures sintéticas acta-sim-*.jpg —
  // SEC-10: jamás actas reales) es PÚBLICO y este flag es su KILL-SWITCH, el
  // único candado junto al aviso permanente role="status" del orquestador;
  // SIN gate de NODE_ENV. false esconde el botón DEMO ×4.
  // Override: {"loteDemoLocal":false} en localStorage/flags.json.
  loteDemoLocal: true,
  // Auditoría 2026-11-11 (#4) — ancla DEMO del panel de supervisión: el
  // acta real de Roma mesa 001 y las notificaciones/anomalías sembradas
  // SOLO existen con este flag + el banner DEMO visible. Default false.
  // Override: {"anclaDemoSupervision":true} en localStorage/flags.json.
  anclaDemoSupervision: false,
  // KIT fusion-evidencia-divipol-v1 (D89-dig): motor de FUSIÓN de evidencia
  // acta ↔ DIVIPOL (país/consulado + zona + puesto + mesa + lugar, con
  // corroboración de ≥2 grupos). Default OFF: apagado, el pipeline no invoca
  // el motor y el comportamiento queda byte a byte el de hoy. La clave va en
  // snake_case por ser el literal del kill-switch aprobado en la tarea.
  // Espejo del PR #158 de dig (T-11, plan 2026-11-12).
  fusion_evidencia: false,
};

/** Último flags.json bueno (null = nunca llegó). */
let remotosCacheados: Partial<FlagsApp> | null = null;

// P0.4 (informe-arquitectura-fluidez-2026-11-02 §3 B2) — MEMO de leerFlags
// por ÉPOCA: planGamaActual()/flagsMasivaEfectivos() piden flags POR SEÑAL de
// progreso OCR (20-40 por acta, ANTES del throttle de vida) y cada llamada
// pagaba spread×2 + localStorage.getItem + JSON.parse + saneo del esquema.
// La época es barata y honesta: el STRING crudo de overrides (cualquier
// mutación externa — DevTools, otra pestaña, guardarOverridesFlags — cambia
// la clave y fuerza recomputar) + la REFERENCIA de los remotos (refrescarFlags
// la reemplaza al traer un flags.json nuevo). El coste en caliente queda en
// 1 getItem + comparación de string.
let memoFlags: {
  rawOverrides: string | null;
  remotosRef: Partial<FlagsApp> | null;
  flags: FlagsApp;
} | null = null;

/** Única salida de esta función: SIEMPRE devuelve un objeto nuevo (los
 *  consumidores pueden mutar su copia sin pisar la cache — contrato de
 *  siempre: leerFlags jamás devuelve una referencia compartida). */
function computarFlags(): FlagsApp {
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

/** Saneo del JSON remoto/overrides: solo claves conocidas y tipos válidos
 *  (jamás confiar en lo que llega por red/archivo).
 *
 *  R2 (§B2 #11) — DERIVA de la tabla única `sanearConEsquema` (src/shared/
 *  e14/flags-schema.ts): mismas condiciones y clamps por clave que la
 *  whitelist manual que reemplaza. DELTA ADITIVO documentado (test de
 *  paridad lo fija): la tabla es la UNIÓN de las 2 whitelists históricas →
 *  flags.json ahora también puede traer `capa0QrWorker` (antes solo por el
 *  override localStorage de politica.ts). Nada que antes se aceptaba se
 *  rechaza. */
export function sanearFlags(o: unknown): Partial<FlagsApp> {
  // R2 (§B2 #11) — DERIVA de la tabla única. KIT e75-qr-zoom-zbar-v1 añadió
  // `qrZoomTl` a la whitelist manual histórica: vive ahora en la tabla
  // ESQUEMA_FLAGS de src/shared/e14/flags-schema.ts (misma semántica: booleano).
  return sanearConEsquema(o) as Partial<FlagsApp>;
}

/** leerFlags() del contrato — SYNC: defaults ← remotos cacheados (si el
 *  refresco ya llegó) ← overrides (máxima prioridad). Nunca lanza.
 *  P0.4 — memo por época (ver memoFlags): mismo RESULTADO de siempre, sin
 *  el parseo+saneo de localStorage en cada señal de vida del runner. */
export function leerFlags(): FlagsApp {
  const rawOverrides = leerOverridesFlagsRaw();
  if (
    memoFlags &&
    memoFlags.remotosRef === remotosCacheados &&
    memoFlags.rawOverrides === rawOverrides
  ) {
    return { ...memoFlags.flags };
  }
  const flags = computarFlags();
  memoFlags = { rawOverrides, remotosRef: remotosCacheados, flags };
  return { ...flags };
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
  memoFlags = null; // P0.4 — la memo vive con el estado del módulo
  if (timerRefresh !== null && typeof timerRefresh === "object" && "unref" in timerRefresh) {
    clearTimeout(timerRefresh as unknown as ReturnType<typeof setTimeout>);
  }
  timerRefresh = null;
}
