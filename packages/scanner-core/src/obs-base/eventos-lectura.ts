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

/** Sink que acumula en memoria (la medición de la ventana §6.7 lo consume). */
export function sinkLecturaEnMemoria(): { sink: SinkLectura; eventos: EventoLectura[] } {
  const eventos: EventoLectura[] = [];
  return {
    sink: (e) => {
      try {
        eventos.push(e);
      } catch {
        /* jamás tumba */
      }
    },
    eventos,
  };
}
