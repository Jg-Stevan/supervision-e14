"use client";

/**
 * KIT motor-ocr-selector-v4 (diseño «CARGA MASIVA» — bloque MOTOR OCR):
 * selector REAL del motor de OCR — el diseño (2 botones) NO cambia; el v3
 * (f955d58) restauró el DESTINO de «RÁPIDO» a `tesseract-spa-best-psm4`
 * (decisión D6 del dueño: throughput crudo del lote — 6.7–11.8 s/acta, el
 * lote de 6 vuelve a ~2 min; v2 lo había mandado a AUTO y el lote fue a
 * ~4 min con RapidOCR v4/v5 a 10–16 s/acta). El A/B del dueño cerró el
 * caso: ed09e63 (pre-merge, v1) = ~2 min y main con el MISMO motor fijado
 * NO lo igualaba. Cuatro pasadas estáticas independientes NO encuentran
 * regresión de código (ocr/ byte-idéntico entre ed09e63 y f955d58; store/
 * dedup/runner neutrales; pipeline-comun extracción pura; deps sin
 * cambios): la diferencia vive en el ESTADO del override del dispositivo
 * — y el v3 tenía DOS trampas reales que este kit cierra:
 *
 *  1) REPARACIÓN v2 (one-time por dispositivo): la migración del selector
 *     v2 (c01c46f) borró el override spa-best persistido escribiendo
 *     `ocrMotor: null` — idempotente y SIN marcador. Los botones de v1/v3/
 *     v4 JAMÁS escriben null, así que un `ocrMotor: null` PRESENTE en
 *     «e14-flags-overrides» solo puede venir de la era v2 (su «RÁPIDO» =
 *     AUTO; hoy RÁPIDO = spa-best por D6) o de un «Automático» del panel
 *     de perfil (D6 — que sí puede escribir null a propósito). El
 *     reparador asume la intención v2 y restaura spa-best UNA vez
 *     (marcador `e14-selector-v4-reparacion-v2` + log verbatim); no puede
 *     distinguirse del «Automático» del panel y ASÍ SE DECLARA — el panel
 *     lo deshace con 1 click y el marcador evita repetirlo jamás.
 *  2) VIGILANTE DE APLICACIÓN (el toggle se HONRA, no solo se muestra):
 *     `reiniciarMotorOcrSiInactivo()` rechaza con OCR en vuelo (correcto:
 *     la corrida manda) pero devuelve `true` con `rtSingleton == null`
 *     AUNQUE una init esté en pleno vuelo (ya leyó los flags viejos) — un
 *     click durante el pre-warm T1 o el lote dejaba TODA la sesión en el
 *     motor viejo con el botón prendido y el cartel «se aplica al próximo
 *     arranque» que NUNCA llegaba (el singleton del runtime solo
 *     re-resuelve al re-iniciar). El vigilante (mismo tick de 2 s de
 *     siempre) compara el modelo VIVO con el override (modeloEsperadoDe)
 *     y re-resuelve SOLO al quedar el OCR ocioso — jamás interrumpe una
 *     corrida — con tope de 3 re-resoluciones: si el motor elegido no
 *     carga, el fallback de sesión se declara honesto (jamás un loop).
 *
 * Honestidad del kit (intacta): el MODELO REAL que cargó se muestra
 * (motorOcrVivo) — si el motor elegido falla al arrancar, la sesión cae a
 * v4 y la UI lo dice (jamás un toggle que mienta). Se conservan las dos
 * honestidades del v2/v3: un «ppocrv5» fijado desde el panel de perfil se
 * respeta (ningún botón activo) y null = AUTO sigue existiendo (el ROUTER
 * adaptativo decide por el dispositivo: MEDIO = tesseract-best-psm4 ·
 * ALTO+SIMD = PP-OCRv5 con sonda).
 */

import { useEffect, useRef, useState } from "react";

import {
  motorOcrActual,
  rapidOcrPrecalentar,
  reiniciarMotorOcrSiInactivo,
} from "@/modules/digitalizador/lib/e14/ocr/rapidocr";
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";
import type { FlagsApp } from "@/modules/digitalizador/lib/e14/obs/tipos";
// El override manual del dueño vive en la capa de política (localStorage
// CLAVE_OVERRIDES «e14-flags-overrides» — leerFlags lo aplica con MÁXIMA
// prioridad). CLAVE_OVERRIDES se importa (export de obs/politica) — jamás
// un literal duplicado del nombre de la clave (§un-fuente-de-verdad).
import {
  CLAVE_OVERRIDES,
  guardarOverridesFlags,
} from "@/modules/digitalizador/lib/e14/obs/politica";
import { logger } from "@/modules/digitalizador/lib/logger";

/** Marcador one-time de la reparación v2 (localStorage — por dispositivo). */
const CLAVE_REPARACION_V2 = "e14-selector-v4-reparacion-v2";
/** Tope de re-resoluciones del vigilante — pasado el tope, el fallback del
 *  motor elegido se declara HONESTO (la sesión cae al de seguridad y el
 *  modelo vivo lo muestra) y se deja de re-intentar (sin loops de init). */
const TOPE_RERESOLUCIONES = 3;

/** Etiqueta corta del modelo vivo (motorOcrVivo().modelos) — honesta. */
function etiquetaModeloVivo(modelos: string | undefined): string {
  if (modelos === "tesseract-spa-best") return "TESS SPA-BEST";
  if (modelos === "v5") return "PP-OCRv5";
  if (modelos === "v4") return "PP-OCRv4";
  return "—";
}

/** El modelo REAL que debe cargar el runtime para HONRAR el override (D6).
 *  Espejo de resolverModeloDeArranque (rapidocr.ts): el override manda y
 *  `motorOcrActual().modelos` reporta el modelo cargado. Cualquier valor
 *  fuera del espejo = fallback de sesión (el motor elegido falló). */
function modeloEsperadoDe(ov: NonNullable<FlagsApp["ocrMotor"]>): string {
  if (ov === "tesseract-spa-best-psm4") return "tesseract-spa-best";
  if (ov === "tesseract-best-psm4") return "v4";
  return "v5"; // ppocrv5
}

export function MotorOcr() {
  // El override vigente (flags.ocrMotor — el dueño manda; null = router
  // adaptativo decide = estado inicial sin botón activo) + una señal de
  // vida para re-leer tras el reinicio. Un «ppocrv5» fijado desde el panel
  // de perfil se respeta (ningún botón activo — el modelo vivo lo muestra
  // honesto).
  const [override, setOverride] = useState<FlagsApp["ocrMotor"]>(
    () => leerFlags().ocrMotor ?? null,
  );
  const [vivoModelos, setVivoModelos] = useState<string | undefined>(
    () => motorOcrActual()?.modelos,
  );
  const [cambiando, setCambiando] = useState(false);
  /** El override quedó guardado pero el runtime AÚN carga otro modelo —
   *  el vigilante lo aplica SOLO al quedar el OCR ocioso (la corrida
   *  manda, RL del runner) y lo declara honesto al tope de intentos. */
  const [pendienteAplicar, setPendienteAplicar] = useState(false);
  /** Re-resoluciones del vigilante consumidas en la época de ESTE override
   *  (se resetean al honrarse o al cambiar el override). Ref espejo para
   *  leer el valor fresco dentro del intervalo sin re-agendarlo. */
  const [reResoluciones, setReResoluciones] = useState(0);
  const reResolucionesRef = useRef(0);
  /** Espejo de `cambiando` para que el vigilante no pise un `elegir` en
   *  vuelo (ambos llaman reiniciarMotorOcrSiInactivo — serializarlos). */
  const cambiandoRef = useRef(false);

  // ── REPARACIÓN v2 (una vez por dispositivo — §1 del encabezado) ────────
  // La migración del selector v2 (c01c46f) convirtió el spa-best persistido
  // del dueño en `ocrMotor: null` SIN dejar marcador. Los botones de v1/v3/
  // v4 jamás escriben null → un null PRESENTE en CLAVE_OVERRIDES solo puede
  // venir de la era v2 (o de un «Automático» del panel — indistinguible, se
  // asume v2 y se declara en el log; el panel lo deshace con 1 click).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_REPARACION_V2) === "1") return;
      window.localStorage.setItem(CLAVE_REPARACION_V2, "1"); // una sola vez, haya o no víctima
      const raw = window.localStorage.getItem(CLAVE_OVERRIDES);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      const nuloEscritoPorV2 =
        !!parsed &&
        typeof parsed === "object" &&
        "ocrMotor" in (parsed as Record<string, unknown>) &&
        (parsed as Record<string, unknown>).ocrMotor === null;
      if (!nuloEscritoPorV2) return;
      guardarOverridesFlags({ ocrMotor: "tesseract-spa-best-psm4" });
      setOverride("tesseract-spa-best-psm4");
      logger.info(
        "[e14] REPARACIÓN selector v4: `ocrMotor:null` presente en " +
          CLAVE_OVERRIDES +
          " — solo la migración v2 (o un «Automático» del panel, " +
          "indistinguible) escribe null por fuera de los botones. Se restaura " +
          "tesseract-spa-best-psm4 (el «RÁPIDO» de la era v2 = hoy spa-best por " +
          "D6: throughput del lote). Deshacer: 1 click en «Automático» del panel.",
      );
    } catch {
      /* localStorage caído / JSON corrupto — sin reparación; la UI manual manda */
    }
  }, []);

  // Señal de vida (2 s — el tick de siempre) + VIGILANTE DE APLICACIÓN
  // (§2 del encabezado): el modelo VIVO debe HONRAR el override. Si el
  // runtime quedó con otro modelo (click durante pre-warm/lote/init — el
  // reinicio seguro rechaza en vuelo o llegó tarde), se re-resuelve SOLO
  // al quedar el OCR ocioso; al tope de intentos, el fallback se declara.
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      setVivoModelos(motorOcrActual()?.modelos);
      // AUTO (null) — nada que honrar; si quedaba un pendiente de una
      // época anterior, se limpia (no hay promesa pendiente de aplicar).
      if (override == null) {
        setPendienteAplicar(false);
        return;
      }
      const vivoM = motorOcrActual()?.modelos;
      if (vivoM === undefined) return; // runtime ausente/cargando — no juzgar
      if (vivoM === modeloEsperadoDe(override)) {
        // HONRADO — en paz (y la época se limpia para el próximo override).
        setPendienteAplicar(false);
        if (reResolucionesRef.current > 0) {
          reResolucionesRef.current = 0;
          setReResoluciones(0);
        }
        return;
      }
      // Mismatch — ¿tope consumido? El fallback de sesión es LEGÍTIMO (el
      // motor elegido falla al arrancar → la sesión cae a v4 y la UI lo
      // dice): se declara y se deja de re-intentar (jamás un loop).
      if (reResolucionesRef.current >= TOPE_RERESOLUCIONES) {
        setPendienteAplicar(true);
        return;
      }
      if (cambiandoRef.current) return; // un elegir en vuelo manda
      const aplicado = await reiniciarMotorOcrSiInactivo();
      if (!vivo) return;
      if (!aplicado) {
        // OCR en vuelo — la corrida manda; el próximo tick reintenta.
        setPendienteAplicar(true);
        return;
      }
      reResolucionesRef.current += 1;
      setReResoluciones(reResolucionesRef.current);
      setPendienteAplicar(true);
      logger.info(
        `[e14] vigilante selector v4: el runtime quedó con «${vivoM}» ≠ ` +
          `override «${override}» (click durante init/lote) — re-resuelto al ` +
          `quedar ocioso (intento ${reResolucionesRef.current}/${TOPE_RERESOLUCIONES})`,
      );
      // El reinicio cayó el pre-warm — calentar el motor nuevo (promesa-once:
      // «puede volver a calentar si alguien lo llama», rapidocr.ts).
      void rapidOcrPrecalentar().then(() => {
        if (vivo) setVivoModelos(motorOcrActual()?.modelos);
      });
    };
    const t = window.setInterval(tick, 2000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [override]);

  const elegir = async (m: "tesseract-spa-best-psm4" | "tesseract-best-psm4") => {
    if (cambiandoRef.current) return;
    setCambiando(true);
    cambiandoRef.current = true;
    try {
      // 1) Override manual del dueño (D6) — la cadena REAL del router.
      guardarOverridesFlags({ ocrMotor: m });
      setOverride(m);
      reResolucionesRef.current = 0; // época nueva — el vigilante arranca limpio
      setReResoluciones(0);
      logger.info(`[e14] motor OCR fijado por el dueño: ${m}`);
      // 2) Re-inicio SEGURO del runtime (reiniciarMotorOcrSiInactivo
      //    rechaza si hay OCR en vuelo — la corrida manda): si rechaza, el
      //    VIGILANTE lo aplica solo al quedar ocioso (v4 — ya no queda
      //    colgado «para el próximo arranque» que nunca llegaba).
      const aplicado = await reiniciarMotorOcrSiInactivo();
      setPendienteAplicar(!aplicado);
      // 3) Precalentar con el motor nuevo (el reinicio cae el pre-warm —
      //    «puede volver a calentar si alguien lo llama», rapidocr.ts).
      void rapidOcrPrecalentar().then(() => setVivoModelos(motorOcrActual()?.modelos));
    } finally {
      cambiandoRef.current = false;
      setCambiando(false);
    }
  };

  const activoRapido = override === "tesseract-spa-best-psm4";
  const activoPP = override === "tesseract-best-psm4";
  // Sin override (null) el router adaptativo decide — el activo REAL se
  // muestra en la línea del modelo (jamás fingir una selección que no existe).
  const sinOverride = override == null;
  // Tope del vigilante consumido Y el modelo vivo sigue sin honrar el
  // override → el fallback de sesión se DECLARA (honestidad del kit).
  const falloDefinitivo =
    pendienteAplicar &&
    override != null &&
    reResoluciones >= TOPE_RERESOLUCIONES &&
    vivoModelos !== undefined &&
    vivoModelos !== modeloEsperadoDe(override);

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
          aria-pressed={activoRapido}
          title="Tesseract spa-best + psm 4 — el ligero y rápido (~12 MB)"
          className={`rounded px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
            activoRapido
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
      {falloDefinitivo ? (
        <p className="text-[9px] uppercase tracking-wider text-amber-400" role="alert">
          EL MOTOR ELEGIDO NO CARGÓ — SE MUESTRA EL DE SEGURIDAD (REINTENTA CON OTRO MOTOR)
        </p>
      ) : pendienteAplicar ? (
        <p className="text-[9px] uppercase tracking-wider text-amber-400" role="status">
          CON OCR EN VUELO — SE APLICA SOLO AL QUEDAR OCIOSO
        </p>
      ) : null}
    </div>
  );
}
