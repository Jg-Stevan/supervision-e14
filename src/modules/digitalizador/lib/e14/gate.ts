/**
 * R7a — GATE del desenlace (M3 de docs/revision-v1/03a-digitalizador-nucleo.md):
 * UNA implementación del desenlace compartida por `pipeline()` y
 * `pipelineRecorte()` de scanner-core-bridge.ts.
 *
 * POR QUÉ: ambos pipelines duplicaban PASO A PASO la secuencia
 * C3 (piso/techo lectura) → inyección SIM → caps del sitio → gate
 * (INCOMPLETA/SIN_VOTOS/evaluarGate) → caps post-gate → sustitución BAJO →
 * techosDiag. Los comentarios «mismo criterio en AMBOS pipelines (pitfall
 * §9.9)» lo evidenciaban 10+ veces y ya causaron un bug de polaridad real
 * (gate F0.2 rev.1, rev.2 en scanner-core-bridge L1008-1013). Este módulo
 * elimina la sincronía a mano: el fix vive en UN solo sitio.
 *
 * PURO (sin DOM, sin I/O, sin logging, sin mutables de módulo): misma
 * entrada → misma salida. Las mediciones ASÍNCRONAS que alimentan el
 * desenlace (verificarCompletitud, evaluarMarcoImpreso, medirZonaVotos)
 * siguen en el CALLER — aquí solo entra su veredicto ya resuelto. El log
 * de auditoría también queda en el caller con el resultado estructurado
 * (`SalidaDesenlace`) — byte a byte idéntico al de hoy.
 *
 * ORIGEN (transcripción literal — R7a): scanner-core-bridge.ts
 *   · C3              → pipeline() L1642-1646 ≡ pipelineRecorte() L2401-2405
 *   · inyección SIM   → pipeline() L1653-1655 (recorte: scoreSimulado null)
 *   · marcadoresOk    → pipeline() L1725 ≡ pipelineRecorte() L2367
 *   · caps del sitio  → pipeline() L1731-1740 ≡ pipelineRecorte() L2408-2424
 *   · gate            → pipeline() L1741-1774 ≡ pipelineRecorte() L2425-2446
 *   · caps post-gate  → pipeline() L1775-1778 ≡ pipelineRecorte() L2449-2450
 *   · sustitución BAJO→ pipeline() L1786-1788 ≡ pipelineRecorte() L2453-2455
 *   · techosDiag      → pipeline() L1818-1833 ≡ pipelineRecorte() L2475-2495
 *   · evaluarGate §4  → scanner-core-bridge L2666-2700 (se mantiene accesible
 *     como método privado delegante del bridge — seam de caracterización).
 *
 * DIFERENCIAS legítimas entre pipelines, hoy EXPLÍCITAS como entradas
 * (antes ocultas en ramas gemelas):
 *   · `vetoIncompleta` — escaneo: !completa · recorte: !completa && !manual
 *     (Q2 del kit esquinas-suaves: el recorte MANUAL degrada a escudo).
 *   · `escudoManual` — solo recorte (techo 7.9 + token «escudo-manual:7.9»).
 *   · `origenEscaneo` — copy del rechazo INCOMPLETA (kit e63d F3.4).
 *   · `scoreSimulado` — solo pipeline SIM (chips 8.2/7.0/4.3 mandan — §9.5).
 */

import { ocrTextIsValid } from "@jg-stevan/scanner-core/ocr";
import type { QualityLevel } from "@jg-stevan/scanner-core/types";
import type { ClasificacionE14 } from "./clasificador";
import { PISO_LECTURA_FUERTE, TECHO_LECTURA_DEBIL, type NivelLectura } from "./senal-lectura";
import { statusDeScore, type Acta, type ActaStatus } from "./types";

/** Copias del rechazo — MOVIDAS de scanner-core-bridge.ts (R7a): vivían
 *  junto al gate y solo lo alimentan a él (y DETALLE_ILEGIBLE/TECHO_SIN_SENAL
 *  que el bridge sigue usando en rutas propias — importadas desde aquí). */
export const DETALLE_ILEGIBLE = "CÓDIGO DE BARRAS Y CABECERA NO DETECTADOS";
export const DETALLE_GENERICO = "SCORE INSUFICIENTE PARA TRANSMISIÓN";
export const DETALLE_INCOMPLETA =
  "EL ACTA ESTÁ CORTADA EN EL ENCUADRE — ALÉJATE UN POCO Y CAPTURA EL ACTA COMPLETA";
/** KIT e63d-escaneo-ya-recortado-v1 (F3.4): copy del rechazo INCOMPLETA para
 *  ARCHIVO/escaneo — «aléjate un poco» no tiene sentido para un archivo
 *  subido (no hay cámara que alejar). Mismo tipo de rechazo, copy del medio. */
export const DETALLE_INCOMPLETA_ESCANEO =
  "EL ESCANEO PARECE CORTADO — REPITE EL ESCANEO INCLUYENDO EL ACTA COMPLETA";
/** KIT e14-gate-v2 (FASE G2): detalle del rechazo por el MARCADOR
 *  OBLIGATORIO de votos fallido — copy CORTO y descriptivo (decisión del
 *  dueño: SIN guía de cámara). */
export const DETALLE_SIN_VOTOS = "ACTA SIN VOTOS VISIBLES";
/** §D1 (SPEC-e14-score-ocr): detalle del rechazo determinista «score bajo». */
export const DETALLE_BAJO = "NO SE RECONOCE INFORMACIÓN DEL ACTA — REPITA LA FOTO";
/** §D1: techo de una foto SIN SEÑAL de contenido (lo aplica scoreDeCalidad;
 *  aquí solo alimenta el token de observabilidad `sin-senal:`). */
export const TECHO_SIN_SENAL = 4.9;
/** D10 (SPEC-e14-guard-borde): techo del ESCUDO anti-fondo / recortada /
 *  escudo-manual — el acta pasa al gate pero NUNCA ÓPTIMA (statusDeScore:
 *  ≥8 sería ÓPTIMA — el operador puede preferir repetir). */
export const TECHO_ESCUDO_FONDO = 7.9;

/** Resultado del gate §4 (evaluarGate) — status + rechazo + clasificación.
 *  MOVIDO de scanner-core-bridge.ts (era interfaz local del bridge). */
export interface ResultadoGate {
  status: ActaStatus;
  rechazo: Acta["rechazo"];
  clasificacion: ClasificacionE14 | null;
}

/** Entradas del desenlace — TODAS las observaciones ya resueltas por el
 *  caller (las esperas/canvas/OCR quedan fuera: este módulo es puro). */
export interface EntradaDesenlace {
  /** Score BRUTO de scoreDeCalidad (antes del C3). El caller conserva el
   *  mismo valor como `scoreVisual` (KIT e14-diagnostico-autoenvio-v1 §3-A). */
  score: number;
  /** `calidad.level` — gobierna el techo del piso de lectura (C3) y los
   *  tokens de observabilidad `techo-fair:7.9` / `techo-poor:6.4`. */
  levelCalidad: QualityLevel;
  /** `senal.nivel` de senalDeLectura — C3 (piso FUERTE / techo DEBIL). */
  nivelLectura: NivelLectura;
  /** Señal de contenido del acta (senalDeContenido) — sustitución BAJO §D3
   *  y token `sin-senal:4.9`. */
  senalActa: boolean;
  /** Texto OCR POST-banda — evaluarGate lo consulta con ocrTextIsValid
   *  (ILEGIBLE vs GENERICO). */
  ocrTexto: string;
  clasificacion: ClasificacionE14;
  intento: number;
  maxIntentos: number;
  /** Chip SIM (§D3): reemplaza el score tras el C3 y ANTES de los caps
   *  (pitfall §9.5 — los chips 8.2/7.0/4.3 mandan). `null` = no SIM. */
  scoreSimulado: number | null;
  /** Acta entera (POST-perdón del marco F0.2 y POST-veto 4/4 fiduciales —
   *  ambos criterios viven en el caller: difieren entre escaneo y recorte). */
  completa: boolean;
  /** Veto INCOMPLETA real — escaneo: !completa · recorte: !completa && !manual
   *  (Q2: el recorte MANUAL degrada el veto a escudo, NO rechaza). */
  vetoIncompleta: boolean;
  /** Escudo-MANUAL del recorte (Q2) — techo 7.9 + token `escudo-manual:7.9`. */
  escudoManual: boolean;
  /** Escudo D10: fondo/sombra al filo (verificacion.fondo). */
  fondo: boolean;
  /** Recortada (OCR de secciones / esquina faltante sin perdón de lazo). */
  recortada: boolean;
  /** Copy del rechazo INCOMPLETA según origen (kit e63d F3.4) — escaneo:
   *  DETALLE_INCOMPLETA_ESCANEO · resto: DETALLE_INCOMPLETA. */
  origenEscaneo: boolean;
  /** KIT actas-vivas-paginas-v1 (FASE C): gate de votos SOLO P1. */
  votosSkipPag2: boolean;
  /** Medición de marcadores (medirZonaVotos.hayVotos). */
  hayVotos: boolean;
}

/** Salida estructurada del desenlace — el caller la usa para el log, el
 *  diagnóstico y el acta (SIN recomputo — pitfall §9.10). */
export interface SalidaDesenlace {
  /** Score FINAL (C3 → SIM → caps del sitio → caps post-gate). */
  score: number;
  status: ActaStatus;
  /** Rechazo FINAL — con la sustitución BAJO §D3 ya aplicada. */
  rechazo: Acta["rechazo"];
  /** Clasificación del gate (null en RECHAZADA — invariante §4: RECHAZADA ⇒
   *  clasificación descartada). La sustitución BAJO NO la toca. */
  clasificacion: ClasificacionE14 | null;
  /** Gate de votos resuelto (para log `SIN_VOTOS`, diag `gate.votos.ok` y
   *  el cap `sin-votos:6.4` — computado UNA vez, antes vivía duplicado). */
  marcadoresOk: boolean;
  /** Techos/ajustes del desenlace en orden real de aplicación (C1/§6-B). */
  techosDiag: string[];
}

/**
 * §4 (evaluarGate) — CRITERIO puro del gate por CALIDAD, MOVIDO VERBATIM de
 * scanner-core-bridge.ts (era `private evaluarGate`, solo consumido por los
 * dos pipelines gemelos — hoy ambos llegan vía resolverDesenlace).
 *
 *   score ≥ 6.5 · AUTO     → statusDeScore (OPTIMA ≥8 / ADVERTENCIA ≥6.5)
 *   score ≥ 6.5 · no AUTO  → EN_REVISION_HUMANA «repetir-primero» (§7.3 —
 *                            la CONTINGENCIA solo al agotar intentos)
 *   score < 6.5            → RECHAZADA por calidad (GENERICO con OCR válido
 *                            · ILEGIBLE sin él); al AGOTAR → contingencia C4.
 */
export function evaluarGate(
  score: number,
  ocrTexto: string,
  clasificacion: ClasificacionE14,
  intento: number,
  maxIntentos: number,
): ResultadoGate {
  if (score >= 6.5) {
    if (clasificacion.nivel === "AUTO") {
      return { status: statusDeScore(score), rechazo: null, clasificacion };
    }
    // SUGERIDA/MANUAL: la CONTINGENCIA (panel) llega SOLO al agotar intentos;
    // antes, el acta viaja como EN_REVISION_HUMANA «repetir-primero» (§7.3 —
    // la pantalla distingue por intento; el estado no cambia).
    return { status: "EN_REVISION_HUMANA", rechazo: null, clasificacion };
  }
  // score < 6.5 — rechazo por CALIDAD. Al AGOTAR intentos: contingencia
  // automática (C4) — el sistema escala solo, sin botón manual.
  if (intento >= maxIntentos) {
    return {
      status: "EN_REVISION_HUMANA",
      rechazo: ocrTextIsValid(ocrTexto)
        ? { tipo: "GENERICO", detalle: DETALLE_GENERICO }
        : { tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE },
      clasificacion: null,
    };
  }
  return {
    status: "RECHAZADA",
    rechazo: ocrTextIsValid(ocrTexto)
      ? { tipo: "GENERICO", detalle: DETALLE_GENERICO }
      : { tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE },
    clasificacion: null,
  };
}

/**
 * DESENLACE unificado de los pipelines gemelos (ver ORIGEN arriba). Orden de
 * aplicación — pitfall §9.4/§G3 (los caps del sitio mandan sobre el piso-10):
 *   C3 (piso FUERTE / techo DEBIL) → inyección SIM → escudo-fondo →
 *   escudo-manual → recortada → gate (INCOMPLETA · SIN_VOTOS · evaluarGate)
 *   → caps post-gate 6.4 → sustitución BAJO → techosDiag.
 * JAMÁS lanza: entrada tipada, sin efectos, sin logging.
 */
export function resolverDesenlace(e: EntradaDesenlace): SalidaDesenlace {
  // KIT e14-score-lectura-v1 (C3): ajuste por LECTURA — el OCR manda (§3):
  // FUERTE sube el score a ≥8.5 (el piso vence al techo fair pero NUNCA al
  // poor — level "poor" es evidencia física dura); DEBIL techo 5.9; MEDIA no
  // toca. Va tras scoreDeCalidad y ANTES de la inyección SIM (pitfall §9.5)
  // y de los caps posteriores (pitfall §9.4).
  let score = e.score;
  if (e.nivelLectura === "FUERTE" && e.levelCalidad !== "poor") {
    score = Math.max(score, PISO_LECTURA_FUERTE);
  } else if (e.nivelLectura === "DEBIL") {
    score = Math.min(score, TECHO_LECTURA_DEBIL);
  }
  // §D3 (SPEC-e14-simulacion-scores): inyección determinista del chip —
  // reemplaza el calculado DESPUÉS de scoreDeCalidad y ANTES del gate.
  // §G3 (KIT e14-gate-v2): SIN re-aplicación del piso de identificada —
  // el chip manda: 8.2 → OPTIMA por statusDeScore · 7.0 → ADVERTENCIA ·
  // 4.3 → RECHAZADA (§D4). Nada se fuerza a mano: `evaluarGate` decide.
  if (e.scoreSimulado != null) {
    score = e.scoreSimulado;
  }
  // GATE-MARCADORES (KIT e14-gate-v2, FASE G2) — marcador OBLIGATORIO de
  // votos, FUERA de evaluarGate (mismo patrón del veto INCOMPLETA: D6/AC10).
  // INCOMPLETA manda primero: el veto de votos SOLO condena actas cuyo veto
  // geométrico no aplicó (escaneo: completas · recorte: !vetoIncompleta —
  // con escudo-manual el gate de votos SIGUE corriendo, Q2).
  const marcadoresOk = !e.vetoIncompleta ? (e.votosSkipPag2 ? true : e.hayVotos) : true;
  // D10 — escudo anti-fondo: SOLO actas completas (la condenada por tinta no
  // llega al gate). TECHO 7.9 (nunca ÓPTIMA — statusDeScore: ≥8).
  if (e.completa && e.fondo) {
    score = Math.min(score, TECHO_ESCUDO_FONDO);
  }
  // KIT e14-esquinas-suaves-v1 (Q2): escudo-MANUAL (solo recorte) — techo 7.9
  // junto al escudo-fondo, MISMO orden de caps (pitfall G3).
  if (e.escudoManual) {
    score = Math.min(score, TECHO_ESCUDO_FONDO);
  }
  // KIT actas-vivas-paginas-v1 (FASE C): acta RECORTADA → techo 7.9 —
  // ADVERTENCIA, NO rechazo (conservador en campo). Cap DESPUÉS de la
  // inyección SIM (el recorte físico manda sobre cualquier score).
  if (e.recortada) {
    score = Math.min(score, TECHO_ESCUDO_FONDO);
  }
  const gate: ResultadoGate = e.vetoIncompleta
    ? {
        // intento < maxIntentos → RECHAZADA · al AGOTAR → contingencia
        // automática C4 (EN_REVISION_HUMANA con el MISMO rechazo).
        status:
          e.intento >= e.maxIntentos
            ? ("EN_REVISION_HUMANA" as ActaStatus)
            : ("RECHAZADA" as ActaStatus),
        rechazo: {
          tipo: "INCOMPLETA",
          detalle: e.origenEscaneo ? DETALLE_INCOMPLETA_ESCANEO : DETALLE_INCOMPLETA,
        },
        clasificacion: null,
      }
    : !marcadoresOk
      ? {
          // KIT e14-gate-v2 (G2): rechazo DIRECTO por marcador obligatorio
          // fallido — mismo desenlace por intentos que INCOMPLETA
          // (contingencia C4 al AGOTAR, con el MISMO rechazo SIN_VOTOS).
          status:
            e.intento >= e.maxIntentos
              ? ("EN_REVISION_HUMANA" as ActaStatus)
              : ("RECHAZADA" as ActaStatus),
          rechazo: { tipo: "SIN_VOTOS", detalle: DETALLE_SIN_VOTOS },
          clasificacion: null,
        }
      : evaluarGate(score, e.ocrTexto, e.clasificacion, e.intento, e.maxIntentos);
  // Cap del veto INCOMPLETA (§7 score↔status coherente): RECHAZADA implica
  // <6.5 (statusDeScore) — en recorte SOLO cuando el veto es REAL (Q2: con
  // escudo-manual el cap 7.9 ya aplicó arriba).
  if (e.vetoIncompleta) score = Math.min(score, 6.4);
  // Cap del veto de votos (mismo patrón): el score queda coherente con el
  // status SIN_VOTOS.
  if (e.completa && !marcadoresOk) score = Math.min(score, 6.4);
  // §D3 (SPEC-e14-score-ocr): desenlace «SCORE BAJO» determinista — sin
  // señal de contenido, el rechazo se sustituye por BAJO SEA CUAL SEA el
  // status (el status lo sigue decidiendo el gate/los intentos). Con señal,
  // nada cambia (INCOMPLETA/SIN_VOTOS/ILEGIBLE/GENERICO como hoy).
  const rechazoFinal: Acta["rechazo"] = e.senalActa
    ? gate.rechazo
    : { tipo: "BAJO", detalle: DETALLE_BAJO };
  // KIT e14-diagnostico-autoenvio-v1 (C1/§6-B): techos capturados con las
  // MISMAS condiciones que ya aplicaron los caps — orden real de aplicación
  // (techo-fair/poor/sin-senal de scoreDeCalidad → escudo-fondo →
  // escudo-manual → recortada → incompleta → sin-votos). Los de
  // lectura-DEBIL/piso-FUERTE llegan con score-lectura (PR #13, §8 — campos
  // aditivos). KIT e14-esquinas-suaves-v1 (Q1/Q2): `escudo-manual:7.9` y el
  // token `incompleta:6.4` SOLO con el veto real (un recorte manual
  // incompleto NO es INCOMPLETA — es escudo).
  const techosDiag: string[] = [];
  if (e.levelCalidad === "fair") techosDiag.push("techo-fair:7.9");
  if (e.levelCalidad === "poor") techosDiag.push("techo-poor:6.4");
  if (!e.senalActa) techosDiag.push(`sin-senal:${TECHO_SIN_SENAL}`);
  // KIT e14-diag-campos-aditivos-v1 (§8 score-lectura): ajustes de LECTURA
  // del score v2 — NO son caps: observabilidad del ajuste (piso sube,
  // techo baja). Condición espejo exacta del C3 de arriba.
  if (e.nivelLectura === "FUERTE" && e.levelCalidad !== "poor")
    techosDiag.push("piso-lectura-FUERTE:8.5");
  if (e.nivelLectura === "DEBIL") techosDiag.push("lectura-DEBIL:5.9");
  if (e.completa && e.fondo) techosDiag.push(`escudo-fondo:${TECHO_ESCUDO_FONDO}`);
  if (e.escudoManual) techosDiag.push("escudo-manual:7.9");
  if (e.recortada) techosDiag.push(`recortada:${TECHO_ESCUDO_FONDO}`);
  if (e.vetoIncompleta) techosDiag.push("incompleta:6.4");
  if (e.completa && !marcadoresOk) techosDiag.push("sin-votos:6.4");
  return {
    score,
    status: gate.status,
    rechazo: rechazoFinal,
    clasificacion: gate.clasificacion,
    marcadoresOk,
    techosDiag,
  };
}
