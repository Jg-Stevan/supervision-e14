"use client";

/**
 * KIT perfil-dev-v1 — MODO DESARROLLADOR (D43).
 *
 * PROBLEMA: la app sale al público y el diagnóstico del dispositivo
 * (kit perfil-recursos-v1) es DEMASIADO TÉCNICO para el usuario final —
 * señales, benchmark, router OCR, overrides, flags.
 *
 * SOLUCIÓN: el módulo completo (entrada del sidebar + chip GAMA del
 * header + vista) solo existe cuando el MODO DESARROLLADOR está ACTIVO.
 * Apagado, el público NO ve nada técnico — ni siquiera la entrada.
 *
 * ACTIVACIÓN (conocida solo del dueño — dos puertas honestas):
 * 1. GESTO SECRETO: 5 clics seguidos (≤ 2,5 s entre toques) sobre el
 *    logo E-14 del menú de navegación. Alterna activado/desactivado.
 * 2. URL: abrir la app con `?dev=1` (p. ej. para activarlo en un móvil
 *    sin descubrir el gesto). PERSISTE como el gesto.
 *
 * PERSISTENCIA: localStorage `e14-modo-desarrollador` («1»/«0»). Al
 * DESACTIVAR se borra la marca (apagado limpio — cero rastro técnico en
 * el dispositivo del público si el dueño lo deja apagado).
 *
 * HYDRATION-SAFE (mismo patrón del perfil-recursos-v1): el estado inicial
 * es APAGADO y determinista en SSR; la lectura de localStorage/URL ocurre
 * SOLO en el efecto de montaje — cero mismatch con el export estático.
 *
 * Jamás lanza: un localStorage bloqueado (modo privado) deja el modo
 * APAGADO y no rompe la app — el dueño siempre puede reactivar por URL.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Clave de persistencia (prefijo e14- — misma familia de las flags). */
const CLAVE_MODO_DEV = "e14-modo-desarrollador";

/** Parámetro de activación por URL (?dev=1). */
const PARAM_URL_DEV = "dev";

/** Gesto: toques de logo que activan (y ventana entre toques, en ms). */
export const GESTO_TOQUES = 5;
export const GESTO_VENTANA_MS = 2500;

interface ModoDevContexto {
  /** true = el módulo perfil-dispositivo es visible (nav + chip + vista). */
  activo: boolean;
  activar: () => void;
  desactivar: () => void;
  /** Alterna el modo (el gesto del logo). */
  alternar: () => void;
}

const Ctx = createContext<ModoDevContexto | null>(null);

/** Lectura segura de la marca persistida (null = no marcado / error). */
function leerMarca(): boolean | null {
  try {
    const v = window.localStorage.getItem(CLAVE_MODO_DEV);
    if (v === "1") return true;
    if (v === "0") return false;
    return null;
  } catch {
    return null;
  }
}

/** Escritura segura: "1" al activar; al desactivar se BORRA (limpio). */
function escribirMarca(activo: boolean): void {
  try {
    if (activo) window.localStorage.setItem(CLAVE_MODO_DEV, "1");
    else window.localStorage.removeItem(CLAVE_MODO_DEV);
  } catch {
    /* modo privado / storage bloqueado — el modo vive solo en memoria */
  }
}

export function ModoDevProvider({ children }: { children: ReactNode }) {
  // APAGADO determinista en SSR/primer render — la lectura real va en el
  // efecto de montaje (hydration-safe con el export estático).
  const [activo, setActivo] = useState(false);
  const montadoRef = useRef(false);

  useEffect(() => {
    if (montadoRef.current) return; // montaje único (guard por ref)
    montadoRef.current = true;
    try {
      // Puerta 2 — URL: ?dev=1 activa (y persiste) sin descubrir el gesto.
      const porUrl = new URLSearchParams(window.location.search).get(PARAM_URL_DEV);
      const marca = leerMarca();
      const deberia = porUrl === "1" ? true : marca === true;
      if (deberia) escribirMarca(true);
      setActivo(deberia);
    } catch {
      /* silencioso — el modo queda APAGADO */
    }
  }, []);

  const activar = useCallback(() => {
    setActivo(true);
    escribirMarca(true);
  }, []);

  const desactivar = useCallback(() => {
    setActivo(false);
    escribirMarca(false); // borrado limpio — cero rastro
  }, []);

  const alternar = useCallback(() => {
    setActivo((a) => {
      escribirMarca(!a);
      return !a;
    });
  }, []);

  const valor = useMemo<ModoDevContexto>(
    () => ({ activo, activar, desactivar, alternar }),
    [activo, activar, desactivar, alternar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Consumidor del modo dev — lanza si se usa fuera del provider (error de cable). */
export function useModoDesarrollador(): ModoDevContexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useModoDesarrollador fuera de ModoDevProvider");
  return ctx;
}
