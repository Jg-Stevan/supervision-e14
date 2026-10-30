/**
 * auditoria.ts — R7b (M4): UNA implementación del registro del desenlace.
 *
 * MOVIDO/UNIFICADO de `scanner-core-bridge.ts` (partición del reporte
 * docs/revision-v1/03a-digitalizador-nucleo.md §7 paso M4): los DOS sitios
 * (pipeline() y pipelineRecorte()) montaban el payload de
 * `construirDiagnostico` bloque a bloque con ~90% de líneas idénticas
 * (hallazgo de R7a: «construirDiagnostico completo ×2»). Este helper es la
 * transcripción literal del payload con las TRES diferencias legítimas de
 * cada sitio pasando EXPLÍCITAS como parámetros:
 *   · actaId — escaneo: "" (se parcha con el id REAL tras construirActa) ·
 *     recorte: acta.id (el acta existe — identidad conservada).
 *   · gateMarco — escaneo: veredicto del marco impreso (D63-C, null en
 *     fotos/SIM) · recorte: AUSENTE (el recorte manual no pasa por el gate
 *     de marco) — la ausencia de la clave se PRESERVA byte a byte con un
 *     spread condicional (undefined = no traía la clave; jamás inventar).
 *   · decodeMs/detectMs — escaneo: medidos (null honesto si la fase no
 *     corrió) · recorte: null/null (esa ruta no mide decode/detección).
 * Las guardas de sitio (`!opciones.simular` vs `acta.fuente !==
 * "SIMULACION"`) y el log de auditoría `logger.info` quedan EN EL CALLER
 * (mismo patrón del desenlace M3: el caller conserva su traza).
 *
 * Formato de línea del log: CONGELADO — solo AÑADIR (contrato D51). Este
 * módulo no escribe logs: SOLO monta el registro (§9.6 — una sola fuente de
 * verdad del payload).
 */
import type { Quad } from "@jg-stevan/scanner-core/types";
import { construirDiagnostico } from "./diagnostico";
import { contrasteEfectivoDe, type PageQualityV2 } from "./calidad";
import type { NivelLectura } from "./senal-lectura";
import type { Acta, ActaStatus, DiagnosticoActa } from "./types";

/** Monta el registro del DESENLACE (payload completo de construirDiagnostico)
 *  para AMBOS pipelines — ver cabecera del módulo para las diferencias. */
export function construirDiagnosticoDelDesenlace(p: {
  actaId: string;
  intento: number;
  maxIntentos: number;
  status: ActaStatus;
  rechazo: Acta["rechazo"];
  scoreVisual: number;
  scoreFinal: number;
  techos: string[];
  /** PageQualityV2 del sitio (calidadDeActa) — metricas se mapea aquí. */
  calidad: PageQualityV2;
  ocrLegible: boolean;
  lecturaChars: number;
  /** KIT e14-diag-campos-aditivos-v1: la señal del C3 — MISMA instancia,
   *  sin recálculo (pitfall §9.10). */
  senalLectura: { nivel: NivelLectura; anclas: number };
  senalActa: boolean;
  ocrValido: boolean;
  completa: boolean;
  /** D63-C (T2.3): veredicto del marco impreso — `undefined` = el sitio no
   *  trae la clave (recorte: la clave viaja AUSENTE byte a byte). */
  gateMarco?: "completo" | "ceñido" | "cortado" | "no-encontrado" | null;
  fondo: boolean;
  recortada: boolean;
  ladoEsquina: string | null;
  votos: { densidadPct: number | null; skipPag2: boolean; ok: boolean };
  procesadaVacia: boolean;
  clasifNivel: string;
  motor: string;
  filtro: string;
  crop: { w: number; h: number; fallback: boolean };
  quad: Quad;
  quadOrigen: DiagnosticoActa["captura"]["quadOrigen"];
  /** Tiempos del sitio (objeto `ms` local de cada pipeline). */
  msProceso: number;
  msProcesoBw: number;
  msProcesoOcr: number;
  msCalidad: number;
  msOcr: number;
  msTotal: number;
  /** D61 — decode/detect persistidos; `null` honesto si la fase no corrió. */
  decodeMs: number | null;
  detectMs: number | null;
}): DiagnosticoActa {
  return construirDiagnostico({
    actaId: p.actaId,
    intento: p.intento,
    maxIntentos: p.maxIntentos,
    status: p.status,
    rechazo: p.rechazo,
    scoreVisual: p.scoreVisual,
    scoreFinal: p.scoreFinal,
    techos: p.techos,
    metricas: {
      sharpness: p.calidad.sharpness,
      // KIT e14-diag-campos-aditivos-v1: métricas v2 REALES (§3).
      sharpnessHi: p.calidad.sharpnessHi,
      brightness: p.calidad.brightness,
      contrast: p.calidad.contrast,
      contrastPapel: p.calidad.contrastPapel,
      contrasteEfectivo: contrasteEfectivoDe(p.calidad, p.ocrLegible),
    },
    level: p.calidad.level,
    lecturaChars: p.lecturaChars,
    senalLectura: p.senalLectura,
    senalActa: p.senalActa,
    ocrValido: p.ocrValido,
    gate: {
      completa: p.completa,
      // D63-C (T2.3): veredicto del marco impreso (null en fotos/SIM).
      // R7b (M4): `undefined` preserva la AUSENCIA de la clave en el sitio
      // que no la traía (recorte manual — jamás inventar null donde no lo
      // había; el JSON persistido queda byte a byte como hoy).
      ...(p.gateMarco !== undefined ? { gateMarco: p.gateMarco } : {}),
      fondo: p.fondo,
      recortada: p.recortada,
      ladoEsquina: p.ladoEsquina,
      votos: p.votos,
      procesadaVacia: p.procesadaVacia,
      clasifNivel: p.clasifNivel,
    },
    captura: {
      motor: p.motor,
      filtro: p.filtro,
      crop: p.crop,
      quad: p.quad,
      quadOrigen: p.quadOrigen,
    },
    tiempos: {
      procesoMs: p.msProceso,
      // D45 — sub-desglose de los 2 warps (omitidos si no corrieron —
      // jamás inventar; doctrina guard > 0 de D43).
      ...(p.msProcesoBw > 0 ? { procesoBwMs: p.msProcesoBw } : {}),
      ...(p.msProcesoOcr > 0 ? { procesoOcrMs: p.msProcesoOcr } : {}),
      calidadMs: p.msCalidad,
      ocrMs: p.msOcr,
      totalMs: p.msTotal,
      // D61 — KIT e14-tiempos-ocultos-v1 (T2): decode/detect PERSISTEN
      // (escaneo los mide; recorte pasa null/null — no mide esas fases).
      decodeMs: p.decodeMs,
      detectMs: p.detectMs,
    },
  });
}
