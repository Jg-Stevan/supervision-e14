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
    sanea: (v) => (v === null || typeof v === "string" ? v : undefined),
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
  { clave: "ocrMotorAdaptativo", sanea: booleano },
  {
    clave: "ocrMotor",
    sanea: (v) =>
      v === "ppocrv5" || v === "tesseract-best-psm4" || v === "tesseract-spa-best-psm4"
        ? v
        : undefined,
  },
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
