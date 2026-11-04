/** KIT e63f-autoenvio-v1 (F2): re-lectura interna antes de «repetir-primero».
 *
 *  Problema (kit §4): SUGERIDA/MANUAL con captura PERFECTA (score ≥ 8,
 *  lectura FUERTE, gate completa) cae a EN_REVISION_HUMANA «repetir-primero»
 *  y la UI le pide al humano RE-ESCANEAR un papel que ya se leyó bien (el
 *  caso real del informe 120553: `171446.jpg` — score 8.5, FUERTE, se cayó
 *  por clasificación: TRANSMISION 0.75 < 0.82). Un re-escaneo no cambia nada:
 *  el problema es de clasificación, no de captura.
 *
 *  Regla del kit: UNA pasada interna de re-OCR del MISMO bitmap con el cap
 *  fino (DET_CAP_PROD — la pasada-2 del escalonado; vía reconocerTexto:
 *  re-warp con el quad horneado, SIN re-detección — e63d F2 identidad
 *  intacta) → re-clasificar → re-evaluar el gate. AUTO → OPTIMA → autoenvío
 *  normal; si no → revisión humana como hoy.
 *
 *  RED LINES (kit §5/§6): jamás aplica a RECHAZADAS por calidad (score < 6.5
 *  — ahí re-escanear SÍ ayuda), ni a ADVERTENCIA (6.5–8 — red line), ni a
 *  gate incompleta; jamás más de 1 pasada interna; jamás empeora el
 *  desenlace. La lógica vive AQUÍ (pura, testeable headless por
 *  `scripts/qa-autoenvio.ts`) y la orquestación en `masiva/runner.ts`. */
import type { Acta } from "../types";
import type { ClasificacionE14 } from "../clasificador";

/** ¿Procede la re-lectura interna para ESTE desenlace? (kit §4.1 — puro.)
 *  EN_REVISION_HUMANA por SUGERIDA/MANUAL ∧ score ≥ 8 ∧ lectura FUERTE ∧
 *  gate completa. (En MASIVA no hay re-captura: el «intento de captura
 *  restante» del kit se materializa como UNA única re-lectura por desenlace
 *  — estructural, este predicado corre una sola vez por acta.) */
export function procedeRelecturaInterna(acta: Acta): boolean {
  const nivel = acta.clasificacion?.nivel;
  return (
    acta.status === "EN_REVISION_HUMANA" &&
    (nivel === "SUGERIDA" || nivel === "MANUAL") &&
    acta.score >= 8 &&
    acta.diagnostico?.lectura?.nivel === "FUERTE" &&
    acta.diagnostico?.gate?.completa === true
  );
}

/** Desenlace de la re-lectura (kit §4.1 — puro, regla del gate para este
 *  caso: score ≥ 8 ∧ AUTO → OPTIMA — statusDeScore). Cualquier otro
 *  resultado devuelve el acta ORIGINAL IDÉNTICA (mismo objeto — la
 *  re-lectura jamás toca el veredicto ni el score: sin recomputo de piso). */
export function desenlaceTrasRelectura(
  acta: Acta,
  textoRe: string,
  clasifRe: ClasificacionE14,
): { acta: Acta; desenlace: "auto" | "sin-cambio" } {
  if (clasifRe.nivel === "AUTO" && acta.score >= 8) {
    return {
      acta: { ...acta, ocrTexto: textoRe, clasificacion: clasifRe, status: "OPTIMA" },
      desenlace: "auto",
    };
  }
  return { acta, desenlace: "sin-cambio" };
}
