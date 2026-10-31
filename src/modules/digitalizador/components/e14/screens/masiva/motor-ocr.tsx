"use client";

/**
 * KIT motor-ocr-selector-v1 (diseño «CARGA MASIVA» — bloque MOTOR OCR):
 * selector REAL del motor de OCR entre los DOS disponibles en el repo:
 *
 *  · «TESS BEST · RÁPIDO» → `tesseract-spa-best-psm4` — Tesseract spa-best
 *    (worker WASM LSTM + psm 4 + spa.traineddata.gz ~12 MB): el ligero y
 *    rápido (fase 5b del kit tesseract-spa-best-v1).
 *  · «PP · PRECISO» → `tesseract-best-psm4` — RapidOCR PP-OCRv4 (onnx,
 *    det+cls+rec), el motor de PRODUCCIÓN «de siempre» del repo (PROD-2).
 *
 * El override viaja por la cadena REAL del router (flags.ocrMotor —
 * guardarOverridesFlags → leerFlags → resolverMotor «override manual del
 * dueño manda», D6) y el cambio re-inicia el runtime (rapidOcrReiniciar —
 * el próximo init re-resuelve con el override) + precalienta con el motor
 * nuevo. Honestidad del kit: el MODELO REAL que cargó se muestra
 * (motorOcrVivo) — si Tesseract falla al arrancar, la sesión cae a v4 y la
 * UI lo dice (jamás un toggle que mienta).
 */

import { useEffect, useState } from "react";

import {
  motorOcrActual,
  rapidOcrPrecalentar,
  reiniciarMotorOcrSiInactivo,
} from "@/modules/digitalizador/lib/e14/ocr/rapidocr";
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";
// El override manual del dueño vive en la capa de política (localStorage
// «e14-flags-overrides» — leerFlags lo aplica con MÁXIMA prioridad).
import { guardarOverridesFlags } from "@/modules/digitalizador/lib/e14/obs/politica";
import { logger } from "@/modules/digitalizador/lib/logger";

/** Etiqueta corta del modelo vivo (motorOcrVivo().modelos) — honesta. */
function etiquetaModeloVivo(modelos: string | undefined): string {
  if (modelos === "tesseract-spa-best") return "TESS SPA-BEST";
  if (modelos === "v5") return "PP-OCRv5";
  if (modelos === "v4") return "PP-OCRv4";
  return "—";
}

export function MotorOcr() {
  // El override vigente (flags.ocrMotor — el dueño manda; null = router
  // adaptativo decide) + una señal de vida para re-leer tras el reinicio.
  const [override, setOverride] = useState<"tesseract-spa-best-psm4" | "tesseract-best-psm4" | null>(
    () => {
      const m = leerFlags().ocrMotor;
      return m === "tesseract-spa-best-psm4" || m === "tesseract-best-psm4" ? m : null;
    },
  );
  const [vivoModelos, setVivoModelos] = useState<string | undefined>(
    () => motorOcrActual()?.modelos,
  );
  const [cambiando, setCambiando] = useState(false);
  /** El override quedó guardado pero el runtime está en vuelo — se aplica
   *  en el próximo arranque (honesto: la corrida manda, RL del runner). */
  const [pendienteAplicar, setPendienteAplicar] = useState(false);

  // El modelo REAL que cargó el runtime puede cambiar fuera del selector
  // (precalentamiento del orquestador, fallback de sesión) — re-lectura suave.
  useEffect(() => {
    const t = window.setInterval(() => {
      setVivoModelos(motorOcrActual()?.modelos);
    }, 2000);
    return () => window.clearInterval(t);
  }, []);

  const elegir = async (m: "tesseract-spa-best-psm4" | "tesseract-best-psm4") => {
    if (cambiando) return;
    setCambiando(true);
    try {
      // 1) Override manual del dueño (D6) — la cadena REAL del router.
      guardarOverridesFlags({ ocrMotor: m });
      setOverride(m);
      logger.info(`[e14] motor OCR fijado por el dueño: ${m}`);
      // 2) Re-inicio SEGURO del runtime (reiniciarMotorOcrSiInactivo
      //    rechaza si hay OCR en vuelo — la corrida manda): el próximo init
      //    re-resuelve el modelo con el override.
      const aplicado = await reiniciarMotorOcrSiInactivo();
      setPendienteAplicar(!aplicado);
      // 3) Precalentar con el motor nuevo (el reinicio cae el pre-warm —
      //    «puede volver a calentar si alguien lo llama», rapidocr.ts).
      void rapidOcrPrecalentar().then(() => setVivoModelos(motorOcrActual()?.modelos));
    } finally {
      setCambiando(false);
    }
  };

  const activoTess = override === "tesseract-spa-best-psm4";
  const activoPP = override === "tesseract-best-psm4";
  // Sin override el router adaptativo decide — el activo REAL se muestra en
  // la línea del modelo (jamás fingir una selección que no existe).
  const sinOverride = override == null;

  return (
    <div className="w-full space-y-1.5 border-t border-[#112b2a]/60 pt-2 text-left">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00e599]" aria-hidden />
          MOTOR OCR
        </span>
        <span
          className="font-mono text-[9px] text-[#00e599]"
          title="Modelo REAL cargado en esta sesión (si el motor elegido falla al arrancar, la sesión cae al de seguridad y se muestra aquí)"
        >
          {cambiando ? "CAMBIANDO…" : etiquetaModeloVivo(vivoModelos)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 rounded border border-[#112b2a] bg-[#061214] p-1">
        <button
          type="button"
          onClick={() => void elegir("tesseract-spa-best-psm4")}
          disabled={cambiando}
          aria-pressed={activoTess}
          title="Tesseract spa-best + psm 4 — el ligero y rápido (~12 MB)"
          className={`rounded px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
            activoTess
              ? "border border-[#00e599]/70 bg-[#08201c] text-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.12)]"
              : "border border-transparent text-gray-400 hover:bg-[#0b191c] hover:text-gray-200"
          }`}
        >
          RÁPIDO
        </button>
        <button
          type="button"
          onClick={() => void elegir("tesseract-best-psm4")}
          disabled={cambiando}
          aria-pressed={activoPP}
          title="RapidOCR PP-OCRv4 — el motor de producción, el preciso"
          className={`rounded px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
            activoPP
              ? "border border-[#00e599]/70 bg-[#08201c] text-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.12)]"
              : "border border-transparent text-gray-400 hover:bg-[#0b191c] hover:text-gray-200"
          }`}
        >
          PRECISO
        </button>
      </div>
      {sinOverride && (
        <p className="text-[9px] uppercase tracking-wider text-gray-500">
          AUTO — EL ROUTER DECIDE POR EL DISPOSITIVO
        </p>
      )}
      {pendienteAplicar && (
        <p className="text-[9px] uppercase tracking-wider text-amber-400" role="status">
          CON OCR EN VUELO — SE APLICA AL PRÓXIMO ARRANQUE
        </p>
      )}
    </div>
  );
}
