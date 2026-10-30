/**
 * KIT e14-observabilidad-v1 (A1-C5/C6) — política de datos + modo dev +
 * overrides de flags (claves del contrato README-KITS §4.1, INALTERABLES):
 *  · e14-obs-politica (localStorage) — PoliticaDatos JSON (agente 1)
 *  · e14-dev-mode (localStorage) — "on" | "off" (helpers aquí; UI agente 2)
 *  · e14-flags-overrides (localStorage) — overrides MANUALES de flags
 *    (helpers aquí; kill switch UI agente 2)
 *
 * Defaults D4 (sin excepciones): metadatos ON · textoOcr OFF · miniaturas
 * OFF · saludEnVivo ON. JSON corrupto → defaults + evento warn (jamás
 * inventar la mitad de una política).
 */
import { appendEvento } from "./buffer";
import { digestDe } from "./digest";
import { obtenerBreadcrumbs } from "./breadcrumbs";
import type { FlagsApp, PoliticaDatos } from "./tipos";
// R2 — tabla ÚNICA de flags + whitelist de saneo (§B2 #11): sanearFlags
// (flags.ts) y leerOverridesFlags derivan del MISMO esquema (fin de la
// doble whitelist «cada puerta su línea»).
import { sanearConEsquema } from "@/shared/e14/flags-schema";

const CLAVE_POLITICA = "e14-obs-politica";
export const CLAVE_MODO_DEV = "e14-dev-mode";
export const CLAVE_OVERRIDES = "e14-flags-overrides";

/** Defaults del contrato §4.2 (D4). */
export const POLITICA_DEFAULT: PoliticaDatos = {
  metadatos: true,
  textoOcr: false,
  miniaturas: false,
  saludEnVivo: true,
};

/** evento warn del rastreo (mismo ErrorEvento que el logger, sin consola:
 *  el fallo es conocido y esperable — no ensucia la consola del operador). */
function avisarObs(mensaje: string, etiqueta: string): void {
  try {
    const stack = new Error().stack ?? "";
    void appendEvento({
      tipo: "warn",
      ts: Date.now(),
      sesion: "",
      dispositivo: "",
      appVersion: "",
      datos: {
        mensaje,
        stack: stack.slice(0, 2000),
        tipo: etiqueta,
        archivo: null,
        digest: digestDe(mensaje, etiqueta, stack),
        breadcrumbs: obtenerBreadcrumbs(),
      },
    });
  } catch {
    /* silencioso */
  }
}

/** Leer la política — defaults si falta la clave; JSON corrupto → defaults
 *  + evento warn (kit A1-C6). SSR/privaacidad → defaults. */
export function leerPolitica(): PoliticaDatos {
  let existia = false;
  try {
    const raw = window.localStorage.getItem(CLAVE_POLITICA);
    existia = raw != null;
    if (!raw) return { ...POLITICA_DEFAULT };
    const p = JSON.parse(raw) as Partial<PoliticaDatos>;
    if (typeof p !== "object" || p === null) throw new Error("no-objeto");
    return {
      metadatos: p.metadatos !== false, // default TRUE
      textoOcr: p.textoOcr === true, // default FALSE
      miniaturas: p.miniaturas === true, // default FALSE
      saludEnVivo: p.saludEnVivo !== false, // default TRUE
    };
  } catch (e) {
    // corrupta (JSON roto / no-objeto) → defaults + warn. Ausente (la
    // primera lectura o SSR) NO avisa — es el estado de fábrica.
    if (existia) {
      avisarObs(`e14-obs-politica corrupta → defaults (${String(e)})`, "PoliticaCorrupta");
    }
    return { ...POLITICA_DEFAULT };
  }
}

/** Guardar la política (kill switch de toggles del panel agente 2). */
export function guardarPolitica(p: PoliticaDatos): void {
  try {
    window.localStorage.setItem(CLAVE_POLITICA, JSON.stringify(p));
  } catch {
    /* silencioso */
  }
}

/** Modo dev (contrato: "on" | "off" — ausente ≡ off). */
export function leerModoDev(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_MODO_DEV) === "on";
  } catch {
    return false;
  }
}

export function guardarModoDev(on: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_MODO_DEV, on ? "on" : "off");
  } catch {
    /* silencioso */
  }
}

/** Overrides de flags — la MÁXIMA prioridad en leerFlags (kill switch
 *  manual del dueño, D6). JSON corrupto → {} silencioso.
 *
 *  R2 (§B2 #11) — DERIVA de la tabla única `sanearConEsquema` (src/shared/
 *  e14/flags-schema.ts): mismas condiciones y clamps por clave que la
 *  whitelist manual que reemplaza. DELTA ADITIVO documentado (test de
 *  paridad lo fija): la tabla es la UNIÓN de las 2 whitelists históricas →
 *  el override localStorage ahora también alcanza `sondeoQrPresupuestoMs`,
 *  `sondeoQrCortocircuito`, `prescanQrCola` y `qrBrujulaOrientacion`
 *  (antes solo por flags.json vía sanearFlags). Nada que antes se aceptaba
 *  se rechaza. */
export function leerOverridesFlags(): Partial<FlagsApp> {
  try {
    const raw = window.localStorage.getItem(CLAVE_OVERRIDES);
    if (!raw) return {};
    const o = JSON.parse(raw) as Partial<FlagsApp>;
    if (typeof o !== "object" || o === null) return {};
    return sanearConEsquema(o) as Partial<FlagsApp>;
  } catch {
    return {};
  }
}

export function guardarOverridesFlags(o: Partial<FlagsApp>): void {
  try {
    const actual = leerOverridesFlags();
    window.localStorage.setItem(CLAVE_OVERRIDES, JSON.stringify({ ...actual, ...o }));
  } catch {
    /* silencioso */
  }
}
