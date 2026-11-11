/**
 * estado-motores.ts (POST-F3 · mapa v2.3) — la información del motor sale de
 * la CONFIGURACIÓN (una cascada fija, decisión del dueño 2026-11-11) y de la
 * TELEMETRÍA de la cascada (EventoLectura — ítem 3.6). El router murió: no
 * hay elección de motor ni override que respetar. Lo que sobrevive es la
 * OBSERVACIÓN.
 */
import type { EventoLectura } from "@jg-stevan/scanner-core/obs-base/eventos-lectura";

export interface PerfilMinimo {
  tier: "ALTO" | "MEDIO" | "BAJO" | (string & {});
  /** benchmark de CPU (0-1000) — informativo. */
  benchmark: unknown;
  /** Señales del perfil-dispositivo (runtime/sync/async/gpu/forma) — se
   *  aceptan completas para que el panel no cambie su adaptador. */
  runtime?: unknown;
  sync?: unknown;
  async?: unknown;
  gpu?: unknown;
  forma?: unknown;
}

/** Motor del orden por defecto — descriptivo (el panel lo muestra tal cual). */
export interface ResolucionMotor {
  motor: string;
  motivo: string;
  origen: "configuracion" | "telemetria-presion";
  requiereSondaCarga: boolean;
  condicionesUpgrade: string[];
}

const MOTOR_POR_DEFECTO = "Tesseract fast → RapidOCR v4";

// ─── telemetría viva (la cascada emite; aquí se acumula) ────────────────────
// Los agregados históricos del router quedaron como fixture del paquete
// (tests/fixtures/agregados-router.json — 3.10): mismos umbrales, nueva fuente.
const FALLOS_PARA_DEGRADAR = 2;

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
export function presionReciente(): boolean {
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

/** Qué motor corre AHORA: la cascada por defecto, sin elección de motor. */
export function motorOcrActual(): MotorOcrVivo | null {
  return {
    motor: "tesseract+rapidocr",
    modelos: "spa-4.0.0-fast → PP-OCRv4",
    origen: "configuracion",
    motivo: "Cascada por defecto: Tesseract fast y, si el gate no cierra, RapidOCR v4 escalonado.",
  };
}

/** El motor que el ORDEN CONFIGURADO correría en este dispositivo (panel). */
export function resolverMotor(perfil: PerfilMinimo | null): ResolucionMotor | null {
  if (!perfil) return null;
  if (presionReciente()) {
    return {
      motor: MOTOR_POR_DEFECTO,
      motivo: `Presión reciente en la telemetría (≥ ${FALLOS_PARA_DEGRADAR} fallos consecutivos): la cascada sigue igual, el gate decide después de cada intento.`,
      origen: "telemetria-presion",
      requiereSondaCarga: false,
      condicionesUpgrade: ["La presión se limpia sola con la próxima lectura aceptada"],
    };
  }
  return {
    motor: MOTOR_POR_DEFECTO,
    motivo: `Cascada por defecto para tier ${perfil.tier}: Tesseract fast primero y RapidOCR v4 escalonado si el gate no cierra.`,
    origen: "configuracion",
    requiereSondaCarga: false,
    condicionesUpgrade: [],
  };
}
