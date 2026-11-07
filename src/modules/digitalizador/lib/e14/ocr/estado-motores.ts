/**
 * estado-motores.ts (POST-F3 · mapa v2.3) — la información del motor que el
 * router-ocr.ts resolvía ANTES de leer, ahora sale de la TELEMETRÍA de la
 * cascada (EventoLectura — ítem 3.6) y de la CONFIGURACIÓN (orden de motores
 * = datos, §3.4). Los consumidores históricos (panel-perfil, motor-ocr,
 * metricas) siguen encontrando su API aquí — sin priors inflables.
 *
 * El router MORÍA (§4.1): decidía antes de leer; la cascada decide DESPUÉS
 * contra invariantes del acta. Lo que sobrevive es la OBSERVACIÓN.
 */
import type { EventoLectura } from "@jg-stevan/scanner-core/obs-base/eventos-lectura";
import { leerFlags } from "../flags";

/** Motores del mundo nuevo (los wrappers históricos mueren en 3.2). */
export type MotorOcr = "rapidocr" | "tesseract";

export interface PerfilMinimo {
  tier: "ALTO" | "MEDIO" | "BAJO" | (string & {});
  /** benchmark de CPU (0-1000) — informativo. */
  benchmark: unknown;
  /** Señales del perfil-dispositivo (runtime/sync/async/gpu/forma) — la
   *  resolución del mundo nuevo SOLO usa el tier; se aceptan completas para
   *  que el panel no cambie su adaptador. */
  runtime?: unknown;
  sync?: unknown;
  async?: unknown;
  gpu?: unknown;
  forma?: unknown;
}

/** Igual forma que ResolucionMotor del router (los consumidores no cambian). */
export interface ResolucionMotor {
  motor: MotorOcr;
  motivo: string;
  origen: "flag-off" | "override-manual" | "configuracion" | "telemetria-presion";
  requiereSondaCarga: boolean;
  condicionesUpgrade: string[];
}

// ─── telemetría viva (la cascada emite; aquí se acumula) ────────────────────
// Los agregados históricos del router quedaron como fixture del paquete
// (tests/fixtures/agregados-router.json — 3.10): mismos umbrales, nueva fuente.
const FALLOS_PARA_DEGRADAR = 2;
const VENTANA_PRESION_MS = 3 * 60_000;

let eventos: EventoLectura[] = [];
let ultimoAceptado: EventoLectura | null = null;

/** Sink de la cascada — cablear en DepsOcrCascada.onEvento. */
export function registrarEventoLectura(e: EventoLectura): void {
  try {
    eventos.push(e);
    if (eventos.length > 500) eventos = eventos.slice(-500);
    if (e.aceptada) ultimoAceptado = e;
  } catch {
    /* la telemetría jamás tumba */
  }
}

/** ¿Hubo fallos seguidos recientes? (mismo umbral/ventana que el router). */
export function presionReciente(ahora = Date.now()): boolean {
  // La ventana es de performance.now() en la cascada — aquí se aproxima por
  // recuento de eventos consecutivos sin aceptación (conservador).
  let fallosSeguidos = 0;
  for (let i = eventos.length - 1; i >= 0; i--) {
    if (eventos[i]!.aceptada) break;
    fallosSeguidos++;
    if (fallosSeguidos >= FALLOS_PARA_DEGRADAR) return true;
  }
  return false;
}

/** Estadísticas por motor (lo que la ventana §6.7 necesita medir). */
export function estadisticasMotores(): Record<string, { intentos: number; aceptadas: number; msTotal: number }> {
  const out: Record<string, { intentos: number; aceptadas: number; msTotal: number }> = {};
  for (const e of eventos) {
    const m = (out[e.motor] ??= { intentos: 0, aceptadas: 0, msTotal: 0 });
    m.intentos++;
    m.msTotal += e.ms;
    if (e.aceptada) m.aceptadas++;
  }
  return out;
}

/** El motor que aceptó la lectura más reciente (null = aún nada aceptado). */
export function motorAceptanteReciente(): string | null {
  return ultimoAceptado?.motor ?? null;
}

/** Compatibilidad con la vista del panel — la MISMA forma de MotorOcrVivo. */
export interface MotorOcrVivo {
  motor: string;
  modelos: string;
  origen: string;
  motivo: string;
}

/** Qué motor corre AHORA: la CONFIGURACIÓN manda (orden = datos, §3.4). */
export function motorOcrActual(): MotorOcrVivo | null {
  try {
    const f = leerFlags();
    const override = (f.ocrMotor as string | null | undefined) ?? null;
    if (override === "tesseract-spa-best-psm4" || override === "tesseract") {
      return { motor: "tesseract", modelos: "spa-best-psm4", origen: "override-manual", motivo: "El dueño fijó Tesseract a mano (D6)." };
    }
    // Default del mundo nuevo: RapidOCR v4 (la red de seguridad de siempre).
    // El orden de motores es configuración — ver crearIntento1/ORDEN_DEFAULT
    // en el paquete (ocr/motor.ts).
    return {
      motor: "rapidocr",
      modelos: "v4",
      origen: presionReciente() ? "telemetria-presion" : "configuracion",
      motivo: presionReciente()
        ? "Fallos consecutivos recientes en la telemetría de la cascada."
        : "Orden configurado: RapidOCR v4 (producción de siempre).",
    };
  } catch {
    return null;
  }
}

/** El motor que el ORDEN CONFIGURADO correría en este dispositivo (panel). */
export function resolverMotor(
  perfil: PerfilMinimo | null,
  ops?: { overrideManual?: MotorOcr | null; presionReciente?: boolean },
): ResolucionMotor | null {
  if (!perfil) return null;
  const presion = ops?.presionReciente ?? presionReciente();
  if (ops?.overrideManual) {
    return {
      motor: ops.overrideManual,
      motivo: "Override manual del dueño (D6) — la configuración manda.",
      origen: "override-manual",
      requiereSondaCarga: false,
      condicionesUpgrade: [],
    };
  }
  if (presion) {
    return {
      motor: "rapidocr",
      motivo: `Presión reciente en la telemetría (≥ ${FALLOS_PARA_DEGRADAR} fallos consecutivos) — el motor de siempre.`,
      origen: "telemetria-presion",
      requiereSondaCarga: false,
      condicionesUpgrade: ["La presión se limpia sola con la próxima lectura aceptada"],
    };
  }
  return {
    motor: "rapidocr",
    motivo: `Orden configurado para tier ${perfil.tier}: RapidOCR v4 — la cascada valida después de cada intento (mapa v2.3 §FASE 3).`,
    origen: "configuracion",
    requiereSondaCarga: false,
    condicionesUpgrade: [],
  };
}
