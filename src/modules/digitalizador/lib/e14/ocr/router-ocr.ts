/**
 * KIT ocr-router-v1 — ROUTER de motor OCR por dispositivo (referencia del
 * benchmark ronda 1-2, lista para soltar en supervision-e14).
 *
 * DECISIÓN FUNDAMENTADA (results/metrics.json, 9 motores, 6 actas E-14):
 * · Tesseract spa-best + psm 4 → RAM pico ~67 MB · 94,4 % dígitos impresos ·
 *   2,2 s/pág · descarga 13,5 MB. El único viable en gama baja.
 * · PP-OCRv5 mobile latin (ONNX) → RAM pico ~487 MB (buffers del detector) ·
 *   100 % dígitos impresos · 3,25 s/pág · 97,6 solo-impreso (> VLM cloud 94,4) ·
 *   inmune a rotación 1,5° (5/5 vs 3-4/5 de Tesseract).
 * · Tesseract fast: descartado como default (83,3 % dígitos por ahorrar 11 MB).
 * · EasyOCR/docTR: no existen en web o no caben (2,2 GB / ~1 GB).
 *
 * D6 (mismo espíritu que gama.ts — KIT e14-gama-adaptativa-v1):
 * · Kill-switch ÚNICO: flag `ocrMotorAdaptativo` (default ON). OFF ⇒ Tesseract
 *   (comportamiento actual) en TODOS los dispositivos.
 * · El override MANUAL del dueño MANDA: si `ocrMotor` existe en
 *   `e14-flags-overrides`, el router NO decide.
 * · Nunca cambia criterios/score/reglas de negocio — SOLO qué motor corre.
 * · El consumidor (worker OCR) decide si adopta la recomendación; este módulo
 *   solo RESUELVE y REGISTRA evidencia.
 *
 * SIN dependencias. Paridad de tipos con perfil-dispositivo
 * (src/modules/perfil-dispositivo — estructura mínima): acepta el
 * `PerfilRecursos` real del kit tal cual.
 *
 * Evidencia completa: docs/ESTRATEGIA-ocr-router-v1.md (este repo).
 */

// ─── dominio ────────────────────────────────────────────────────────────────

/** Los motores elegibles. «tesseract-best-psm4» = el MOTOR BASE de este
 *  repo (aquí, modelos v4 de RapidOCR — ver motorADeModelos en rapidocr.ts);
 *  «ppocrv5» = precisión; «tesseract-spa-best-psm4» = Tesseract REAL del
 *  benchmark (spa-best + psm 4 vía tesseract.js — fase 5b): jamás sale del
 *  modo automático, SOLO por override manual del dueño. */
export type MotorOcr = "tesseract-best-psm4" | "ppocrv5" | "tesseract-spa-best-psm4";

/** Estructura mínima que cumple `PerfilRecursos` de perfil-dispositivo. */
export interface PerfilMinimo {
  tier: "ALTO" | "MEDIO" | "BAJO" | "PENDIENTE";
  benchmark: { ejecutado: boolean; score: number | null };
  runtime: { wasmSimd: boolean };
  sync: { memoriaGB: number | null; saveData: boolean | null; redTipo: string | null };
  async: { storageLibreMB: number | null };
  gpu?: { renderer: string | null } | null;
  forma?: "celular" | "tablet" | "escritorio" | "desconocido";
}

export interface ResolucionMotor {
  motor: MotorOcr;
  /** El PORQUÉ auditable (se puede mostrar en el panel). */
  motivo: string;
  /** true = exigir sonda de carga real (inferencia de prueba) antes de usar. */
  requiereSondaCarga: boolean;
  /** Origen de la decisión (auditoría). */
  origen:
    | "flag-off"
    | "override-manual"
    | "gobernador-presion"
    | "sonda-cpu"
    | "sonda-carga-previa"
    | "tier"
    | "medio-elegible-upgrade";
  /** Condiciones pendientes para el upgrade a v5 (catálogo para la UI). */
  condicionesUpgrade: string[];
}

// ─── constantes ─────────────────────────────────────────────────────────────

/** Flag revocable (mismo patrón que masivaAdaptativoGama). */
export const FLAG_MOTOR_ADAPTATIVO = "ocrMotorAdaptativo";
/** Clave de la sonda de carga cacheada. */
export const CLAVE_SONDA_CARGA = "ocr-router-sonda-carga-v1";
/** Días sin reintentar el upgrade tras un fallo de carga. */
export const DIAS_NO_REINTENTAR = 7;
/** Umbral de la sonda de CPU (misma calibración 0-1000 de perfil-dispositivo). */
export const SONDA_MINIMA_V5 = 750;
export const SONDA_TAPIR_TESSERACT = 350;

// ─── sonda de carga real (la prueba que el deviceMemory no puede dar) ───────

export interface SondaCargaCacheada {
  motor: MotorOcr;
  ok: boolean;
  ms: number;
  /** Epoch ms de cuándo se probó. */
  probadoEn: number;
}

function leerSondaCarga(): SondaCargaCacheada | null {
  try {
    const crudo = localStorage.getItem(CLAVE_SONDA_CARGA);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Partial<SondaCargaCacheada> | null;
    if (!dato || typeof dato.ok !== "boolean" || typeof dato.probadoEn !== "number") return null;
    return dato as SondaCargaCacheada;
  } catch {
    return null;
  }
}

function guardarSondaCarga(dato: SondaCargaCacheada): void {
  try {
    localStorage.setItem(CLAVE_SONDA_CARGA, JSON.stringify(dato));
  } catch {
    /* storage lleno/bloqueado — la sonda vive solo en memoria */
  }
}

/** true si hubo un fallo de carga de v5 dentro de la ventana de castigo. */
export function v5EnCastigo(now = Date.now()): boolean {
  const s = leerSondaCarga();
  if (!s) return false;
  if (s.ok) return false;
  const dias = (now - s.probadoEn) / 86_400_000;
  return dias < DIAS_NO_REINTENTAR;
}

// ─── fase 5 (selector-motor-v1) — el castigo visible y administrable ───────

/** Estado del castigo para la UI (null = sin castigo vigente). El override
 *  MANUAL del dueño NO lo consulta (paso 1 de la cadena manda) — solo
 *  informa al modo automático y le da al dueño la decisión de limpiarlo. */
export function infoCastigoV5(
  now = Date.now(),
): { probadoHaceMs: number; msRestantes: number } | null {
  try {
    const s = leerSondaCarga();
    if (!s || s.ok) return null;
    const probadoHaceMs = Math.max(0, now - s.probadoEn);
    const ventanaMs = DIAS_NO_REINTENTAR * 86_400_000;
    if (probadoHaceMs >= ventanaMs) return null;
    return { probadoHaceMs, msRestantes: ventanaMs - probadoHaceMs };
  } catch {
    return null;
  }
}

/** El dueño limpia el castigo para reintentar la sonda YA (D6: la app
 *  muestra y escribe SOLO lo que el dueño pide — el castigo es una política
 *  del modo automático, no una valla para el dueño). Jamás lanza. */
export function limpiarCastigoV5(): void {
  try {
    localStorage.removeItem(CLAVE_SONDA_CARGA);
  } catch {
    /* storage bloqueado — el castigo expira solo */
  }
}

/**
 * Ejecuta la sonda de carga real de PP-OCRv5 y la persiste.
 * `cargarYInferir` la provee el consumidor (p. ej. ocr/rapidocr.ts):
 *   1) crear sesión ONNX con det_v5_mobile.onnx + rec_v5_latin.onnx
 *   2) inferir una imagen sintética 200×60 con texto (canvas)
 *   3) resolver true si hubo ≥ 1 caja con texto, false si excepción/timeout.
 * RECOMENDACIÓN: timeout ~8 s (carga 0,2 s + inferencia tiny en gama alta;
 * en térmica adversa 8 s sobra) y correrla en idle o tras el primer OCR.
 */
export async function ejecutarSondaCarga(
  cargarYInferir: () => Promise<boolean>,
  timeoutMs = 8000,
): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  let ok = false;
  try {
    ok = await Promise.race([
      cargarYInferir(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  } catch {
    ok = false;
  }
  const ms = Date.now() - t0;
  guardarSondaCarga({ motor: "ppocrv5", ok, ms, probadoEn: Date.now() });
  return { ok, ms };
}

// ─── resolutor (función pura — jamás lanza) ─────────────────────────────────

export interface OpcionesRouter {
  /** Estado del flag `ocrMotorAdaptativo` (default ON). */
  flagOn?: boolean;
  /** Motor fijado por el dueño en e14-flags-overrides (`ocrMotor`). */
  overrideManual?: MotorOcr | null;
  /** true si el gobernador reactivo detectó presión en los últimos 3 min. */
  presionReciente?: boolean;
  /** Ahora (inyectable para tests). */
  ahora?: number;
}

export function resolverMotor(perfil: PerfilMinimo, ops: OpcionesRouter = {}): ResolucionMotor {
  try {
    const flagOn = ops.flagOn ?? true;

    // 0) flag OFF ⇒ byte-idéntico a hoy (Tesseract) en todos los dispositivos.
    if (!flagOn) {
      return { motor: "tesseract-best-psm4", motivo: `Flag ${FLAG_MOTOR_ADAPTATIVO}=OFF — motor base.`, requiereSondaCarga: false, origen: "flag-off", condicionesUpgrade: [] };
    }
    // 1) el override manual del dueño MANDA.
    if (ops.overrideManual) {
      return { motor: ops.overrideManual, motivo: "Override manual del dueño (e14-flags-overrides).", requiereSondaCarga: ops.overrideManual === "ppocrv5", origen: "override-manual", condicionesUpgrade: [] };
    }
    // 2) gobernador reactivo: presión reciente ⇒ degradar preventivamente.
    if (ops.presionReciente) {
      return { motor: "tesseract-best-psm4", motivo: "Presión reciente (fallos/OOM en 3 min) — degradación preventiva por sesión.", requiereSondaCarga: false, origen: "gobernador-presion", condicionesUpgrade: [] };
    }
    // 3) castigo por sonda de carga fallida: no reintentar por 7 días.
    if (v5EnCastigo(ops.ahora)) {
      return { motor: "tesseract-best-psm4", motivo: `La sonda de carga de PP-OCRv5 falló hace < ${DIAS_NO_REINTENTAR} días — se mantiene Tesseract.`, requiereSondaCarga: false, origen: "sonda-carga-previa", condicionesUpgrade: ["Reintentar la sonda cuando expire la ventana de castigo"] };
    }
    // 4) la sonda de CPU DECIDE (v2): es la señal que corrige señales mentirosas.
    const score = perfil.benchmark.ejecutado ? perfil.benchmark.score : null;
    if (score !== null && score < SONDA_TAPIR_TESSERACT) {
      return { motor: "tesseract-best-psm4", motivo: `Sonda de CPU ${score}/1000 < ${SONDA_TAPIR_TESSERACT}: el dispositivo se declara ${perfil.tier} pero rinde bajo — Tesseract sin excepción.`, requiereSondaCarga: false, origen: "sonda-cpu", condicionesUpgrade: [] };
    }

    const esIOS = perfil.sync.memoriaGB === null && !!perfil.gpu?.renderer && /Apple/i.test(perfil.gpu.renderer);
    const sondaAlta = score !== null && score >= SONDA_MINIMA_V5;

    // 5) BAJO ⇒ Tesseract. 94,4 % dígitos con ~67 MB — lo único que cabe.
    if (perfil.tier === "BAJO") {
      return { motor: "tesseract-best-psm4", motivo: "Gama BAJO (§4.4): PP-OCRv5 pide ~487 MB (OOM seguro); Tesseract best + psm 4 da 94,4 % con ~67 MB.", requiereSondaCarga: false, origen: "tier", condicionesUpgrade: [] };
    }

    // 6) ALTO con SIMD ⇒ PP-OCRv5 (100 % dígitos, inmune a rotación), con sonda.
    if (perfil.tier === "ALTO" && perfil.runtime.wasmSimd) {
      return { motor: "ppocrv5", motivo: "Gama ALTO + WASM SIMD: 100 % de campos impresos y robustez a rotación; correr en worker con sonda de carga.", requiereSondaCarga: true, origen: "tier", condicionesUpgrade: [] };
    }
    if (perfil.tier === "ALTO" && !perfil.runtime.wasmSimd) {
      return { motor: "tesseract-best-psm4", motivo: "Gama ALTO pero sin WASM SIMD: el runtime ONNX correría lento — Tesseract es aquí también el más rápido.", requiereSondaCarga: false, origen: "tier", condicionesUpgrade: ["Habilitar COOP/COEP (hilos/SIMD) y re-evaluar"] };
    }

    // 7) MEDIO ⇒ base Tesseract + upgrade opt-in CUANDO el dispositivo lo demuestre.
    const condiciones: string[] = [];
    const esIOSRuta = esIOS;
    if (!perfil.runtime.wasmSimd) condiciones.push("WASM SIMD no disponible (requisito duro)");
    if (!sondaAlta) condiciones.push(`Sonda de CPU < ${SONDA_MINIMA_V5}/1000 (medir en idle)`);
    if ((perfil.async.storageLibreMB ?? Infinity) < 200) condiciones.push("Storage libre < 200 MB para los modelos v5");
    if (esIOSRuta) condiciones.push("iOS: vía GPU Apple + sonda ≥ 750 (la inferencia §4.4 por heap nunca aplica en Safari)");
    if (sondaAlta && perfil.runtime.wasmSimd) {
      return { motor: "tesseract-best-psm4", motivo: "Gama MEDIO con condiciones de upgrade cumplidas: Tesseract por defecto y tarjeta «Activar OCR de precisión» (descarga v5 solo en wifi + sonda de carga).", requiereSondaCarga: false, origen: "medio-elegible-upgrade", condicionesUpgrade: esIOSRuta ? ["iOS: requerir sonda de carga antes de fijar v5"] : [] };
    }
    return { motor: "tesseract-best-psm4", motivo: "Gama MEDIO: Tesseract best + psm 4 (94,4 %, ~67 MB) como base segura; upgrade a v5 opt-in.", requiereSondaCarga: false, origen: "tier", condicionesUpgrade: condiciones };
  } catch {
    // Jamás lanza: ante cualquier imprevisto, el motor seguro.
    return { motor: "tesseract-best-psm4", motivo: "Fallo interno del router — motor seguro por defecto.", requiereSondaCarga: false, origen: "tier", condicionesUpgrade: [] };
  }
}

// ─── gobernador reactivo (patrón reportarPresionGama de gama.ts) ────────────

const VENTANA_PRESION_MS = 3 * 60_000;
const FALLOS_PARA_DEGRADAR = 2;
let eventosPresion: number[] = [];

/** El consumidor (worker OCR) lo llama en cada fallo/OOM/kill del motor v5. */
export function reportarPresionMotor(motor: MotorOcr, ahora = Date.now()): boolean {
  try {
    if (motor !== "ppocrv5") return false;
    eventosPresion = eventosPresion.filter((t) => ahora - t < VENTANA_PRESION_MS);
    eventosPresion.push(ahora);
    return eventosPresion.length >= FALLOS_PARA_DEGRADAR;
  } catch {
    return false;
  }
}

export function presionReciente(ahora = Date.now()): boolean {
  try {
    eventosPresion = eventosPresion.filter((t) => ahora - t < VENTANA_PRESION_MS);
    return eventosPresion.length >= FALLOS_PARA_DEGRADAR;
  } catch {
    return false;
  }
}

/** Reset (tests / cambio de sesión). */
export function reiniciarPresion(): void {
  eventosPresion = [];
}
