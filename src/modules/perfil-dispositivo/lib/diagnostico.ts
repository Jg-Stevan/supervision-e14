"use client";

/**
 * KIT perfil-recursos-v1 / ocr-router-v1 — CAPA DE DIAGNÓSTICO (no-UI).
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): todo lo que
 * PRODUCE el informe del dispositivo — resolución del motor OCR con la
 * cadena completa del router, catálogo de opciones elegibles (D6) y el
 * JSON copiable — vive aquí; las secciones de la vista solo consumen.
 *
 * Reglas que NO cambian:
 * · D6 — la app muestra; el dueño decide. El override viaja por la puerta
 *   oficial (e14-flags-overrides) con su DOBLE whitelist de fase 2.
 * · Jamás lanza: un fallo del router/flags deja el bloque del informe
 *   FUERA del JSON (honesto — null = sin señales aún).
 */
import {
  presionReciente,
  resolverMotor,
  type MotorOcr,
  type PerfilMinimo,
  type ResolucionMotor,
} from "@/modules/digitalizador/lib/e14/ocr/router-ocr";
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";
import type { PerfilRecursos, PlanRecursos } from "../domain/tipos";

// ─── etiquetas del motor OCR ────────────────────────────────────────────────

/** Nombre humano de cada motor (informe, tarjeta de autonomía y avisos). */
export const ETIQUETA_MOTOR: Record<MotorOcr, string> = {
  "tesseract-best-psm4": "Tesseract best + psm 4",
  ppocrv5: "PP-OCRv5 (ONNX)",
  "tesseract-spa-best-psm4": "Tesseract spa-best + psm 4",
};

// KIT selector-motor-v1 fase 5 + 5b — opciones del selector (D6: la app
// muestra; el dueño decide). null = Automático: el router recupera la
// decisión. «Motor base» son los modelos v4 de RapidOCR (producción actual);
// «Tesseract spa-best» es el Tesseract REAL del benchmark (tesseract.js v5 +
// spa.traineddata best — 94,4 % dígitos, ~67 MB, 13,5 MB gz) — fase 5b.
export const OPCIONES_MOTOR: Array<{
  valor: MotorOcr | null;
  etiqueta: string;
  sub: string;
}> = [
  { valor: null, etiqueta: "Automático", sub: "el router decide · recomendado" },
  { valor: "tesseract-best-psm4", etiqueta: "Motor base", sub: "RapidOCR v4 · producción" },
  { valor: "tesseract-spa-best-psm4", etiqueta: "Tesseract spa-best", sub: "psm 4 · 13,5 MB · 94,4 %" },
  { valor: "ppocrv5", etiqueta: "PP-OCRv5", sub: "precisión · 100 % · ~487 MB pico" },
];

/** Duración humana para el estado del castigo (min → h → d). */
export function fmtDuracion(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

// ─── resolución del motor para el informe ───────────────────────────────────

/** Adapta el `PerfilRecursos` del kit a la estructura mínima que espera el
 *  router (`PerfilMinimo` — runtime/sync/async en la raíz). null = sin
 *  señales aún (SSR / primer pase): el informe sale SIN bloque de motor —
 *  honesto, jamás inventar. */
function perfilMinimoDe(perfil: PerfilRecursos): PerfilMinimo | null {
  const s = perfil.senales;
  if (!s) return null;
  return {
    tier: perfil.tier,
    benchmark: perfil.benchmark,
    runtime: s.runtime,
    sync: s.sync,
    async: s.async,
    gpu: s.gpu,
    forma: s.forma,
  };
}

/** Resuelve el motor con la cadena COMPLETA de prioridad del router:
 *  flag kill-switch ← override manual ← gobernador ← sonda de carga ←
 *  sonda de CPU ← tier. Jamás lanza (null si aún no hay señales). */
export function resolverMotorDelDispositivo(perfil: PerfilRecursos): ResolucionMotor | null {
  try {
    const p = perfilMinimoDe(perfil);
    if (!p) return null;
    const flags = leerFlags();
    return resolverMotor(p, {
      flagOn: flags.ocrMotorAdaptativo !== false,
      overrideManual: flags.ocrMotor ?? null,
      presionReciente: presionReciente(),
    });
  } catch {
    return null;
  }
}

/** fase 5 — la recomendación PROPIA del router (override anulado a
 *  propósito): alimenta la advertencia honesta cuando el dueño fuerza un
 *  motor que el router no elegiría aquí. Jamás lanza. */
export function resolverRecomendacionRouter(perfil: PerfilRecursos): ResolucionMotor | null {
  try {
    const p = perfilMinimoDe(perfil);
    if (!p) return null;
    const flags = leerFlags();
    return resolverMotor(p, {
      flagOn: flags.ocrMotorAdaptativo !== false,
      overrideManual: null, // la voz del router SIN la del dueño
      presionReciente: presionReciente(),
    });
  } catch {
    return null;
  }
}

// ─── informe copiable ───────────────────────────────────────────────────────

/** JSON de diagnóstico (botón COPIAR JSON): señales + evidencia + plan +
 *  motor resuelto con su origen auditable. Jamás lanza ({} en el peor caso). */
export function diagnosticoJson(
  perfil: PerfilRecursos,
  plan: PlanRecursos,
  motor: ResolucionMotor | null,
): string {
  try {
    return JSON.stringify(
      {
        generado: new Date().toISOString(),
        kit: "perfil-recursos-v1",
        tier: perfil.tier,
        tierInferido: perfil.tierInferido,
        confianza: perfil.confianza,
        evidencia: perfil.evidencia,
        senales: perfil.senales,
        benchmark: perfil.benchmark,
        planRecomendado: plan,
        // KIT ocr-router-v1 — qué motor OCR corre en este dispositivo y el
        // porqué auditable (origen: flag-off | override-manual |
        // gobernador-presion | sonda-cpu | sonda-carga-previa | tier |
        // medio-elegible-upgrade). Aditivo AL FINAL (mismo patrón
        // hangResumen/enviosDetalle): informes previos no cambian de forma.
        // Ausente = sin señales aún (no debería ocurrir en una copia hecha
        // desde el panel).
        ...(motor && {
          motorOcr: {
            motor: motor.motor,
            motivo: motor.motivo,
            origen: motor.origen,
            requiereSondaCarga: motor.requiereSondaCarga,
            condicionesUpgrade: motor.condicionesUpgrade,
          },
        }),
      },
      null,
      2,
    );
  } catch {
    return "{}";
  }
}
