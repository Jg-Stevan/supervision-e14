/**
 * Contrato MotorOcr puro (FASE 3 del mapa v2.3 — SIN router).
 *
 * El router decidía ANTES de leer con priors inflables; el contrato de los
 * motores NO decide nada: describe lo que un motor sabe hacer. La decisión
 * vive en la CASCADA (orquestacion/cascada.ts), que valida DESPUÉS de cada
 * intento contra invariantes del acta (DIVIPOLA válido, formato de
 * candidatos, sumas — senal-lectura + clasificador).
 *
 * Opciones del contrato (mapa §FASE 3): { topeThreads, sink, precalentamiento,
 * onVuelo? } — todo lo que el router leía del entorno entra por aquí.
 */
import type { EsperaOcrSink } from "./rapidocr";

/** Lectura de un motor: texto + conf normalizada 0-1 (espacio PROPIO del
 *  motor — entre motores NO es comparable; decide el gate, no la conf). */
export interface LecturaMotor {
  texto: string;
  conf: number;
}

/** Opciones de una corrida del motor. */
export interface OpcionesCorrida {
  /** Presupuesto restante del pipeline (ms) — el motor lo respeta o falla. */
  presupuestoMs?: number;
  /** Progreso 0-1 ( ANALIZANDO vivo ). */
  onProgreso?: (p: number) => void;
  /** Acumulador de espera de cola (pool≥2 — ver rapidocr.conTurnoOcr). */
  esperaSink?: EsperaOcrSink;
}

/** Un motor OCR del paquete (rapidocr, tesseract, nativo del sidecar). */
export interface MotorOcr {
  /** Nombre estable para telemetría/config ("rapidocr" | "tesseract" | "nativo"). */
  nombre: string;
  /** Init perezosa (descarga/compile). true = listo. */
  init(): Promise<boolean>;
  /** Pre-warm fire-and-forget (opcional). */
  precalentar?(): void;
  /** Reconocer — null = fallo (el caller cae al siguiente eslabón). */
  reconocer(dataUrl: string, opts?: OpcionesCorrida): Promise<LecturaMotor | null>;
  /** Soltar recursos (APLICAR AHORA / watchdog). */
  reiniciar(): Promise<void>;
}

/** Configuración de la cascada por MOTOR (3.4 — orden y presupuesto son
 *  DATOS, no código: S "rápido primero" para lotes; D "fuerte primero"
 *  para cámara — sin bifurcar el motor). */
export interface PresupuestoMotor {
  /** Timeout del intento completo de este motor (ms). */
  timeoutMs: number;
  /** Intentos que la cascada puede pagar en este motor. */
  intentos: number;
  /** false = la cascada NO lo abre (kill-switch del dueño). */
  habilitado?: boolean;
}

export type OrdenMotores = Record<string, PresupuestoMotor>;

/** Config por defecto — conservadora (la app la sobreescribe con sus datos). */
export const ORDEN_DEFAULT: OrdenMotores = {
  rapidocr: { timeoutMs: 120_000, intentos: 2, habilitado: true },
  tesseract: { timeoutMs: 60_000, intentos: 1, habilitado: false },
};
