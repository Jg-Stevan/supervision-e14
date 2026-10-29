/**
 * KIT autonomia-ui-v1 (D44) — la app DECIDE los recursos de UI/ARRANQUE.
 *
 * Petición del dueño: «que el proyecto sea lo suficientemente autónomo para
 * decidir sobre los recursos con los que cuenta en cada dispositivo». La
 * capa adaptativa D74/D38 (gama.ts) ya automatiza los presupuestos del
 * PIPELINE (pool/threads/warp/watchdog/master/QR/dhash); este kit completa
 * la autonomía con lo que faltaba y vuelve HONESTA la tabla del plan:
 *
 * · estadosPlan(plan): el estado REAL de cada fila del catálogo — derivado
 *   de planGamaActual() + flagsMasivaEfectivos() + overrides del dueño,
 *   JAMÁS del texto de la recomendación. Cuatro estados:
 *     auto       — la capa adaptativa lo aplica ahora (revocable).
 *     base       — el base ya es lo óptimo aquí (sin cambio).
 *     override   — el dueño fijó la clave (D6: su mano manda).
 *     sugerencia — catálogo sin consumidor todavía (no fingir autonomía).
 *
 * · aplicarAutonomiaUi(plan): los DOS consumidores nuevos, acotados y
 *   revocables (kill-switch único `uiAdaptativaGama`, default ON):
 *     1. ANIMACIONES — tier BAJO ⇒ <html data-anim="reducidas"> (CSS puro
 *        en globals.css: transiciones 80 ms, keyframes 0.6 s, scroll auto).
 *        MEDIO/ALTO ⇒ sin atributo (comportamiento de hoy byte-idéntico).
 *     2. PRECARGA OCR EN IDLE — cierra el plan «Precarga de modelos»:
 *        plan.preloadModelos (∧ red holgada — respeta saveData/datos del
 *        dueño) ⇒ en idle, import dinámico de rapidocr + rapidOcrPrecalentar
 *        (e14-prowarm: la 1.ª acta del día deja de pagar ~27 s de frío).
 *        1 vez por sesión; un fallo ⇒ frío como siempre (jamás tumba).
 *
 * Excepción BOUNDADA al espíritu D6 (misma naturaleza que D74): solo
 * recursos de UI/arranque — jamás criterios/score/reglas de negocio. El
 * override MANUAL del dueño manda clave a clave (flagsMasivaEfectivos).
 *
 * Sin dependencias nuevas. Jamás lanza (try/catch total — la autonomía
 * jamás tumba la app). SSR-safe (los gated por typeof document/window).
 */
import type { PlanRecursos } from "../domain/tipos";
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";
import { leerOverridesFlags } from "@/modules/digitalizador/lib/e14/obs/politica";
import {
  flagsMasivaEfectivos,
  planGamaActual,
} from "@/modules/digitalizador/lib/e14/gama";

// ─── estado honesto de cada fila del plan ───────────────────────────────────

/** Cómo está AHORA un parámetro del plan (columna ESTADO de la tabla). */
export type EstadoAplicacion = "auto" | "base" | "override" | "sugerencia";

export interface EstadoFila {
  estado: EstadoAplicacion;
  /** El valor REAL aplicado en este momento (texto humano). */
  aplicado: string;
  /** El porqué — para el tooltip de la fila. */
  detalle: string;
}

/** Estado real de TODAS las filas del plan, anclado por la `clave` estable
 *  de cada FilaRecomendacion. Jamás lanza ({} en el peor caso — la tabla
 *  muestra las celdas vacías honestamente). */
export function estadosPlan(plan: PlanRecursos): Record<string, EstadoFila> {
  const vacio: Record<string, EstadoFila> = {};
  try {
    const planGama = planGamaActual();
    const efectivos = flagsMasivaEfectivos();
    const flagUiOn = leerFlags().uiAdaptativaGama !== false;
    let overrides: Record<string, unknown> = {};
    try {
      overrides = leerOverridesFlags() as Record<string, unknown>;
    } catch {
      overrides = {};
    }

    const estados: Record<string, EstadoFila> = {};

    /** Filas que viajan por FLAGS (poolWorkers / ocrThreadsTope): el dueño
     *  puede fijarlas a mano en e14-flags-overrides — su mano manda (D6). */
    const deFlag = (clave: "poolWorkers" | "ocrThreadsTope", baseTxt: string): EstadoFila => {
      const aplicado = String(efectivos[clave]);
      if (overrides[clave] !== undefined) {
        return {
          estado: "override",
          aplicado,
          detalle: `Tu override manual manda (D6) — la capa adaptativa NO toca «${clave}» mientras exista.`,
        };
      }
      if (planGama.activo && (planGama.flagsOverride as Record<string, unknown>)[clave] !== undefined) {
        return {
          estado: "auto",
          aplicado,
          detalle: "Aplicado por la capa adaptativa de gama (D74/D38) — presupuestos de recursos, revocable.",
        };
      }
      return {
        estado: "base",
        aplicado,
        detalle: `El base (${baseTxt}) ya es lo óptimo para este equipo — sin cambio.`,
      };
    };

    /** Filas por CAMPO del plan de gama (master/precalor/QR — no son flags:
     *  los consumidores leen el campo; la única mano que existe es el flag
     *  kill-switch masivaAdaptativoGama, cubierto por planGama.activo). */
    const deCampo = (aplicado: number, base: number, unidad: string): EstadoFila =>
      planGama.activo && aplicado !== base
        ? {
            estado: "auto",
            aplicado: `${aplicado}${unidad}`,
            detalle: "Aplicado por la capa adaptativa de gama (D74/D38).",
          }
        : {
            estado: "base",
            aplicado: `${aplicado}${unidad}`,
            detalle: "El base ya es lo óptimo para este equipo — sin cambio.",
          };

    estados.pool = deFlag("poolWorkers", "1 worker");
    estados.hilos = deFlag("ocrThreadsTope", "4 hilos");
    estados.master = deCampo(planGama.maestroLadoMayor, 4032, " px");
    estados.precalor = deCampo(planGama.precalorCola, 3, "");
    estados.qr = deCampo(planGama.qrLadoLargo, 2048, " px");

    estados.thumbs = {
      estado: "sugerencia",
      aplicado: "—",
      detalle: "Catálogo v1: la miniatura se genera UNA vez por acta — no hay caché de MB que ajustar todavía.",
    };

    if (!flagUiOn) {
      estados.precarga = {
        estado: "override",
        aplicado: "al primer uso",
        detalle: "Kill-switch uiAdaptativaGama=false — la app no se auto-configura (byte-idéntico a hoy).",
      };
    } else if (plan.preloadModelos && !plan.sincronizarSoloWifi) {
      estados.precarga = {
        estado: "auto",
        aplicado: "precarga en idle ✓",
        detalle: "El motor OCR se calienta en idle (e14-prowarm) — la primera acta del día no paga el arranque frío.",
      };
    } else {
      estados.precarga = {
        estado: "base",
        aplicado: "al primer uso",
        detalle: plan.sincronizarSoloWifi
          ? "Red débil/saveData — precargar competiría por los datos del dueño; se respeta."
          : "Gama baja — precargar compite por memoria; el plan lo respeta.",
      };
    }

    if (!flagUiOn) {
      estados.animaciones = {
        estado: "override",
        aplicado: "completas",
        detalle: "Kill-switch uiAdaptativaGama=false — sin reducción (byte-idéntico a hoy).",
      };
    } else if (plan.animaciones === "reducidas") {
      const activo =
        typeof document !== "undefined" &&
        document.documentElement?.getAttribute("data-anim") === "reducidas";
      estados.animaciones = {
        estado: "auto",
        aplicado: activo ? "reducidas ✓" : "reducidas (al montar)",
        detalle: "CSS [data-anim] en <html>: transiciones cortas y keyframes acotados — menos re-raster en scroll.",
      };
    } else {
      estados.animaciones = {
        estado: "base",
        aplicado: "completas",
        detalle: "Coste de animación despreciable en este equipo — sin cambio (normales ≈ completas aquí).",
      };
    }

    estados.sync = {
      estado: "sugerencia",
      aplicado: "siempre",
      detalle: "Catálogo v1: la app hoy no sincroniza por red (sin backend, D1) — la regla queda lista para cuando exista.",
    };

    return estados;
  } catch {
    return vacio;
  }
}

// ─── los consumidores D44 (animaciones + precarga OCR en idle) ──────────────

/** 1 vez por sesión — re-detectar el perfil no re-precarga (y el prewarm del
 *  motor ya es idempotente por página: prewarmHecho en rapidocr.ts). */
let precargaLanzada = false;

/** idle real con fallback honesto (mismo espíritu que perfil-provider). */
function enIdle(fn: () => void): void {
  try {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => void fn(), { timeout: 8000 });
      return;
    }
  } catch {
    /* fallback */
  }
  try {
    window.setTimeout(() => void fn(), 3000);
  } catch {
    /* silencioso */
  }
}

/** Aplica la autonomía de UI/arranque del plan — llamar cuando el perfil
 *  está listo (PerfilProvider). Idempotente; jamás lanza; SSR no-op.
 *  Kill-switch: flag `uiAdaptativaGama` false ⇒ TODO apagado
 *  (sin atributo data-anim + sin precarga — byte-idéntico a hoy). */
export function aplicarAutonomiaUi(plan: PlanRecursos): void {
  try {
    if (typeof document === "undefined") return; // SSR — no-op honesto
    let flagOn = true;
    try {
      flagOn = leerFlags().uiAdaptativaGama !== false;
    } catch {
      flagOn = true;
    }

    // 1) ANIMACIONES — solo BAJO cambia («reducidas»); normales/completas =
    //    el comportamiento de hoy (sin atributo — byte-idéntico).
    try {
      if (flagOn && plan.animaciones === "reducidas") {
        document.documentElement.setAttribute("data-anim", "reducidas");
      } else {
        document.documentElement.removeAttribute("data-anim");
      }
    } catch {
      /* silencioso */
    }

    // 2) PRECARGA OCR EN IDLE — plan.preloadModelos (gama ≠ BAJO) ∧ red
    //    holgada (sincronizarSoloWifi = saveData/red lenta del dueño ⇒ NO
    //    competir por sus datos). El import dinámico es la puerta: el módulo
    //    del motor pre-calienta al importarse — no se carga en el bundle
    //    inicial ni sin permiso del plan.
    try {
      if (!flagOn || precargaLanzada || !plan.preloadModelos) return;
      if (plan.sincronizarSoloWifi) return;
      precargaLanzada = true;
      enIdle(async () => {
        try {
          const { rapidOcrPrecalentar } = await import(
            "@/modules/digitalizador/lib/e14/ocr/rapidocr"
          );
          await rapidOcrPrecalentar();
        } catch {
          /* frío como hoy — fallback honesto (el pipeline NO depende de esto) */
        }
      });
    } catch {
      /* silencioso */
    }
  } catch {
    /* la autonomía jamás tumba la app */
  }
}
