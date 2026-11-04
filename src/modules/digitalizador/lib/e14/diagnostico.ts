/**
 * KIT e14-diagnostico-autoenvio-v1 (C2) — «POR QUÉ NO SE ENVIÓ».
 * Módulo PURO (sin React): montaje del registro del desenlace (C1) que el
 * bridge adjunta como `acta.diagnostico`.
 *
 * KIT e14-fuera-informes-v1 (R-2.2 — mandato del dueño: fuera los informes
 * automáticos): el módulo queda RECORTADO a SOLO lo que alimenta el B7
 * (`construirDiagnostico` — el dueño podrá reusar `acta.diagnostico` con
 * su propio sistema). FUERA: `registrarDesenlace` (acumulador localStorage
 * §5), `descargarPaqueteDiagnostico` (paquete ZIP §3), el reporte de
 * comportamiento y `causaPrincipal` — sus únicos consumidores eran los
 * descargas automáticas que este kit retira. Regla de oro §1: lo que se
 * quita se quita COMPLETO y lo que queda queda EXACTO.
 */
import type { Acta, ActaStatus, DiagnosticoActa } from "./types";
import type { NivelLectura } from "./senal-lectura";

/** Empaca lo que el sitio del log ya tiene en scope (§6-B: las MISMAS
 *  expresiones que ya usa el log — NO re-evalúa nada nuevo). Los techos
 *  llegan YA construidos por el sitio (orden de aplicación real). */
export function construirDiagnostico(p: {
  actaId: string;
  intento: number;
  maxIntentos: number;
  status: ActaStatus;
  rechazo: Acta["rechazo"];
  scoreVisual: number;
  scoreFinal: number;
  techos: string[];
  metricas: {
    sharpness: number;
    // KIT e14-diag-campos-aditivos-v1: métricas v2 de main (calidadDeActa §3).
    sharpnessHi: number;
    brightness: number;
    contrast: number;
    contrastPapel: number;
    contrasteEfectivo: number;
  };
  level: string;
  lecturaChars: number;
  // KIT e14-diag-campos-aditivos-v1: la señal de lectura que el bridge ya
  // calcula (C3 del score v2) — misma instancia, SIN recálculo (pitfall §9.10).
  senalLectura: { nivel: NivelLectura; anclas: number };
  senalActa: boolean;
  ocrValido: boolean;
  gate: DiagnosticoActa["gate"];
  captura: DiagnosticoActa["captura"];
  tiempos: DiagnosticoActa["tiempos"];
}): DiagnosticoActa {
  return {
    ts: new Date().toISOString(),
    actaId: p.actaId,
    intento: p.intento,
    maxIntentos: p.maxIntentos,
    status: p.status,
    rechazo: p.rechazo,
    score: { visual: p.scoreVisual, final: p.scoreFinal, techos: p.techos },
    metricas: {
      sharpness: p.metricas.sharpness,
      sharpnessHi: p.metricas.sharpnessHi, // AHORA REAL (fallo → 0, §3)
      brightness: p.metricas.brightness,
      contrast: p.metricas.contrast,
      contrastPapel: p.metricas.contrastPapel, // AHORA REAL
      contrasteEfectivo: p.metricas.contrasteEfectivo,
    },
    level: p.level,
    // KIT e14-diag-campos-aditivos-v1: REAL — la señal del C3 (L1050/L1503).
    lectura: {
      nivel: p.senalLectura.nivel,
      anclas: p.senalLectura.anclas,
      chars: p.lecturaChars,
    },
    senalActa: p.senalActa,
    ocrValido: p.ocrValido,
    gate: p.gate,
    captura: p.captura,
    tiempos: p.tiempos,
  };
}
