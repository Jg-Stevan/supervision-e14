/**
 * Capa shared (R2) — tabla ÚNICA de flags del contrato §4.2 con su whitelist
 * de saneo (reporte 04 §B2 #11, quick-win 9 de la misión R2).
 *
 * HOY la whitelist vive DUPLICADA a mano («DOBLE whitelist — cada puerta su
 * línea», el comentario lo admite) y ya DESINCRONIZÓ:
 *
 *   · flags.ts:113-156 (sanearFlags — puerta de flags.json remoto)
 *     → 18 claves: las de la tabla, MENOS capa0QrWorker.
 *   · obs/politica.ts:109-173 (leerOverridesFlags — puerta localStorage)
 *     → 15 claves: las de la tabla, MENOS sondeoQrPresupuestoMs,
 *       sondeoQrCortocircuito, prescanQrCola y qrBrujulaOrientacion.
 *
 * La tabla de abajo es la UNIÓN (19 claves) con el saneo EXACTO de cada
 * clave (mismas condiciones, mismos clamps, extraído verbatim de las dos
 * copias). flags.ts y politica.ts derivan de aquí (misma función
 * `sanearConEsquema`) — fin del treadmill «nueva flag ⇒ 2 whitelists a
 * mano». Los DELTAS ADITIVOS que la unificación introduce (cada puerta
 * pasa a aceptar las claves que le faltaban) están fijados como
 * expected-diff en el test de paridad y documentados en pr.md — jamás
 * RECHAZAN algo que antes se aceptaba.
 *
 * `shared/` NUNCA importa de `modules/`: los valores son boolean | number |
 * string | null (el cast a Partial<FlagsApp> vive en los consumidores).
 * Jamás lanza (no-objeto → {} — mismo guard de las 2 copias).
 */

export type ValorFlag = boolean | number | string | null;

export interface DescriptorFlag {
  /** Clave del contrato §4.2. */
  clave: string;
  /** Saneo exacto: devuelve el valor válido o undefined (ausente). */
  sanea: (v: unknown) => ValorFlag | undefined;
}

function booleano(v: unknown): ValorFlag | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** SEC-10 (INFORME-PRUEBAS-Y-AUDITORIA) — `endpointReportes` es el futuro
 *  gancho de envío de reportes (D1, default null, hoy sin consumidor). Si
 *  algún día se cablea, un string arbitrario sería un canal de exfiltración
 *  configurable por quien edite flags.json/localStorage. Whitelist: solo
 *  null, "" (override vacío) o RUTA same-origin — jamás una URL absoluta. */
export function endpointReportesValido(v: unknown): ValorFlag | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return v === "" || /^\/[A-Za-z0-9\-._~/?=&%]*$/.test(v) ? v : undefined;
}

/** KIT e14-ocr-nativo-v1 — mismo criterio SEC-10 aplicado al sidecar: quien
 *  edita flags.json/localStorage NO puede apuntar el OCR a un servidor
 *  arbitrario (los recortes de actas son datos sensibles). Se acepta SOLO
 *  null o un http:// a 127.0.0.1/localhost con puerto opcional y sin ruta,
 *  query ni credenciales. */
export function urlSidecarLocalValida(v: unknown): ValorFlag | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?\/?$/.test(v) ? v : undefined;
}

/** typeof number && Number.isFinite → clamp redondeado a [min, max]
 *  (mismas expresiones de flags.ts:120-122/131,144-148 y politica.ts:122-124,
 *  147-152: NaN/Infinity quedan rechazados). */
function numeroClampeado(min: number, max: number) {
  return (v: unknown): ValorFlag | undefined =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : undefined;
}

/** Orden FIJO de la tabla — es el orden de inserción del objeto saneado
 *  (irrelevante para los spreads de leerFlags; solo cambia el orden de las
 *  claves en el JSON guardado por guardarOverridesFlags). */
export const ESQUEMA_FLAGS: readonly DescriptorFlag[] = [
  { clave: "poolWorkers", sanea: (v) => (v === 1 || v === 2 ? v : undefined) },
  { clave: "thumbsOn", sanea: booleano },
  { clave: "colaPersistente", sanea: booleano },
  { clave: "ocrThreadsTope", sanea: numeroClampeado(1, 8) },
  { clave: "telemetriaSalud", sanea: booleano },
  {
    clave: "endpointReportes",
    sanea: endpointReportesValido,
  },
  { clave: "sondeoQrPrecoz", sanea: booleano },
  { clave: "sondeoQrPresupuestoMs", sanea: numeroClampeado(500, 30_000) },
  { clave: "sondeoQrCortocircuito", sanea: booleano },
  { clave: "hangEnCurso", sanea: booleano },
  { clave: "prescanQrCola", sanea: booleano },
  { clave: "qrBrujulaOrientacion", sanea: booleano },
  { clave: "masivaSondeoCrudo", sanea: booleano },
  { clave: "prescanQrPresupuestoMs", sanea: numeroClampeado(1000, 30_000) },
  { clave: "prescanWarpLado", sanea: numeroClampeado(256, 4032) },
  { clave: "masivaAdaptativoGama", sanea: booleano },
  { clave: "capa0QrWorker", sanea: booleano },
  // Decisión del mantenedor 2026-11-11 — cascada OCR por defecto (Tesseract fast
  // → gate → RapidOCR v4 escalonado). false = escalonado de siempre.
  { clave: "ocrCascada", sanea: booleano },
  // KIT ocr-ep-webgpu-v1 — DÓNDE se multiplica el OCR (mismos modelos ONNX, no
  // otro motor): "auto" = WebGPU con adapter real · "wasm" = camino de siempre
  // · "webgpu" = forzar el intento (con reintento automático al wasm).
  {
    clave: "ocrEp",
    sanea: (v) => (v === "auto" || v === "wasm" || v === "webgpu" ? v : undefined),
  },
  // KIT e75-qr-zoom-zbar-v1 (merge origin/main post-Ola 0) — kill-switch del
  // mantenedor: false = cadena de capa 0 byte-idéntica a hoy. Booleano, misma
  // semántica que tenía en las 2 whitelists manuales (flags.ts + politica.ts).
  { clave: "qrZoomTl", sanea: booleano },
  // KIT e14-qr-previo-rapido-v1 — kill-switch del mantenedor: false = la capa 0
  // paga el worker + el rescate zxing sin intento previo (byte-idéntico a
  // gpu5b). Booleano.
  { clave: "qrPrevioRapido", sanea: booleano },
  // KIT e14-probe-mini768-v1 — lado mayor de la miniatura del sondeo de
  // orientación. 320 = hoy (byte-idéntico). Saneo: número entero dentro de
  // [320, 1280] — fuera de rango o no-numérico ⇒ undefined (default del mantenedor).
  { clave: "probeMiniLado", sanea: numeroClampeado(320, 1280) },
  // KIT qr-postprevio-corta-v1 — kill-switch del mantenedor: false = tras un previo
  // que no leyó nada, la capa 0 corre la cadena LARGA de hoy (byte-idéntico).
  // Booleano.
  { clave: "qrCapa0PostPrevioCorta", sanea: booleano },
  // KIT ocr-sin-cls-v1 — true = el cls de 180° por línea de hoy (byte-idéntico).
  // false = se omite el run del clasificador (la sesión se sigue creando).
  { clave: "ocrCls", sanea: booleano },
  // KIT ocr-cola-global-v1 — true (default) = un turno por corrida ORT, la cola
  // que hace seguro el pool 2. false = las inferencias de dos actas pueden
  // solaparse (el COLGAJE de gpu8/gpu13). Booleano.
  { clave: "ocrColaGlobal", sanea: booleano },
  // KIT e14-proceso-lado-v1 — lado mayor de salida del warp+enhance del lote.
  // Default 1920; 4032 = el default anterior. Saneo: número entero dentro de
  // [1024, 4032] — fuera de rango o no-numérico ⇒ undefined (default del mantenedor).
  { clave: "procesoLadoMayor", sanea: numeroClampeado(1024, 4032) },
  // R1.2 — KIT qr-cache-negativa-v1 — kill-switch del mantenedor: false = la capa
  // 0 paga el ladder SIEMPRE (byte-idéntico a hoy). Booleano.
  { clave: "qrCacheNegativa", sanea: booleano },
  // KIT auto-envio-umbral-v1 — palanca del mantenedor: "optima" (default, solo
  // OPTIMA se autoenvía) | "advertencia" (extiende el auto-envío a ADVERTENCIA
  // con clasificación AUTO — el join del monitor sigue exigiendo AUTO).
  {
    clave: "autoEnvioUmbral",
    sanea: (v) => (v === "optima" || v === "advertencia" ? v : undefined),
  },
  // KIT e14-ocr-nativo-v1 — kill-switch del mantenedor: null (default) = WASM de
  // siempre. Solo localhost (validator), por la misma razón SEC-10 que
  // `endpointReportes`.
  { clave: "ocrNativoUrl", sanea: urlSidecarLocalValida },
  // KIT e14-ocr-nativo-v1 (FASE 2) — acta COMPLETA en el sidecar. Solo tiene
  // sentido con `ocrNativoUrl` vivo; sin sidecar el pipeline JS corre igual.
  { clave: "actaNativa", sanea: booleano },
  // Auditoría 2026-11-11 (#3) — lote DEMO solo en desarrollo.
  { clave: "loteDemoLocal", sanea: booleano },
  // Auditoría 2026-11-11 (#4) — ancla DEMO del panel de supervisión.
  { clave: "anclaDemoSupervision", sanea: booleano },
  // KIT fusion-evidencia-divipol-v1 (D89-dig) — kill-switch del motor de
  // fusión de evidencia; booleano, default OFF (T-11, espejo del PR #158).
  { clave: "fusion_evidencia", sanea: booleano },
];

/** Whitelist de claves que la puerta flags.json (sanearFlags) tenía
 *  históricamente — SIN capa0QrWorker (politica.ts la añadó primero).
 *  Exportada para el expected-diff del test. */
export const CLAVES_FLAGS_JSON_HISTORICAS = ESQUEMA_FLAGS.map((d) => d.clave).filter(
  (c) => c !== "capa0QrWorker",
);

/** Whitelist de claves que la puerta localStorage (leerOverridesFlags) tenía
 *  históricamente — SIN sondeoQrPresupuestoMs, sondeoQrCortocircuito,
 *  prescanQrCola ni qrBrujulaOrientacion. Exportada para el expected-diff. */
export const CLAVES_OVERRIDES_HISTORICAS = ESQUEMA_FLAGS.map((d) => d.clave).filter(
  (c) =>
    c !== "sondeoQrPresupuestoMs" &&
    c !== "sondeoQrCortocircuito" &&
    c !== "prescanQrCola" &&
    c !== "qrBrujulaOrientacion",
);

/** Saneo con la tabla ÚNICA: solo claves conocidas y tipos válidos (jamás
 *  confiar en lo que llega por red/archivo). no-objeto → {}. MISMO guard y
 *  MISMO resultado por clave que las 2 whitelists manuales que reemplaza
 *  (test de paridad). */
export function sanearConEsquema(o: unknown): Record<string, ValorFlag> {
  const limpio: Record<string, ValorFlag> = {};
  if (typeof o !== "object" || o === null) return limpio;
  const registro = o as Record<string, unknown>;
  for (const { clave, sanea } of ESQUEMA_FLAGS) {
    const v = sanea(registro[clave]);
    if (v !== undefined) limpio[clave] = v;
  }
  return limpio;
}
