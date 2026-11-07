/**
 * Esquema de eventos de LECTURA (ítem 3.6 del mapa v2.3).
 *
 * El evento que emite la cascada (orquestacion/cascada.ts — onEvento) y el
 * que consumen: la medición de la ventana del router (§6.7 — condición
 * BLOQUEANTE antes de fijar el orden por defecto de motores) y el panel de
 * perfil de S (adaptación de panel-perfil.tsx: su información pasa a venir
 * de aquí — el router moría con sus priors, la evidencia queda).
 *
 * Contrato mínimo: motor intentado, validación (gate), aceptación, ms.
 * Append-only: nuevos campos SOLO opcionales al final (contrato D57).
 */
export type PasoLectura = "intento1" | "1280" | "1920" | "roi" | "rescate-motor";

export interface EventoLectura {
  paso: PasoLectura;
  motor: string;
  validacion: "AUTO" | "SUGERIDA" | "MANUAL";
  aceptada: boolean;
  ms: number;
  /** Presupuesto restante del pipeline al cerrar la etapa (n/d → null). */
  presupuestoRestanteMs?: number | null;
}

/** Sink de eventos de lectura — inyectable (la app decide a dónde van). */
export type SinkLectura = (e: EventoLectura) => void;

/** Resumen de UNA corrida de lectura (una acta) — lo que se persiste en
 *  `PerfActa.lectura` (FASE C2 del plan post-v2.3): motor aceptante,
 *  intentos con su gate y ms por motor. Es lo que el router NUNCA registró
 *  (§6.7: riesgo 3 de la auditoría). Append-only (D57). */
export interface ResumenLectura {
  /** Motor del último evento `aceptada: true` (null = ninguno aceptó). */
  motorAceptante: string | null;
  /** Un registro por ETAPA intentada (gate incluido), en orden de corrida. */
  intentos: EventoLectura[];
  /** ms acumulados por motor — suma de las etapas reales, sin ecos. */
  msPorMotor: Record<string, number>;
}

/** Colector por corrida: la app lo crea ANTES de leer un acta, pasa `sink`
 *  a la cascada y persiste `resumen()` junto al perf del acta. */
export function colectorLectura(): {
  sink: SinkLectura;
  eventos: EventoLectura[];
  resumen: () => ResumenLectura;
} {
  const eventos: EventoLectura[] = [];
  return {
    sink: (e) => {
      try {
        eventos.push({ ...e });
      } catch {
        /* jamás tumba */
      }
    },
    eventos,
    resumen: () => {
      // La cascada re-emite la etapa aceptante con `aceptada: true` y, al
      // cerrar sin AUTO, un evento agregado con la suma de la corrida: sus
      // ms son eco o total, nunca una pasada nueva. Los intentos reales son
      // los NO aceptados; el motor aceptante es el del último aceptado.
      const intentos = eventos.filter((e) => !e.aceptada);
      const msPorMotor: Record<string, number> = {};
      for (const e of intentos) {
        const ms = Number.isFinite(e.ms) ? e.ms : 0;
        msPorMotor[e.motor] = (msPorMotor[e.motor] ?? 0) + ms;
      }
      let motorAceptante: string | null = null;
      for (const e of eventos) {
        if (e.aceptada) motorAceptante = e.motor;
      }
      return { motorAceptante, intentos, msPorMotor };
    },
  };
}
