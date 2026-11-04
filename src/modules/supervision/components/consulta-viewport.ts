"use client";

import { useSyncExternalStore } from "react";

/**
 * Media query del VISOR (plan M1 — acordeones móviles de la sidebar).
 * Canónico de lint (misma familia que hooks/use-mobile del shell y
 * components/reloj-vivo del módulo): suscriptor de matchMedia +
 * useSyncExternalStore — sin effect, sin flash, snapshot de SERVIDOR =
 * false (escritorio) igual que el resto de consumidores del template.
 * Vive DENTRO del módulo (frontera de trasplante: sin imports de la app).
 */

const CONSULTA_MOVIL = "(max-width: 767px)";

function suscribir(callback: () => void): () => void {
  const mql = window.matchMedia(CONSULTA_MOVIL);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function leer(): boolean {
  return window.matchMedia(CONSULTA_MOVIL).matches;
}

function leerServidor(): boolean {
  return false;
}

export function useEsMovil(): boolean {
  return useSyncExternalStore(suscribir, leer, leerServidor);
}
