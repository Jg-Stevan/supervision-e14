"use client";

import { useSyncExternalStore } from "react";

/**
 * RELOJ VIVO compartido (ronda «reloj real») — un solo interval de 1 s
 * para todo el módulo; los consumidores eligen GRANULARIDAD:
 *
 * - `useRelojVivo()` → epoch ms del MINUTO en curso (cambia 1 vez por
 *   minuto): alimenta la proyección viva de la matriz (hora país, TIEMPO,
 *   estado). Snapshot = floor(now/60000) → sin re-renders entre minutos.
 * - `useRelojSegundos()` → epoch ms del SEGUNDO en curso: solo para el
 *   chip de reloj LOCAL (Colombia) del monitor — un span hoja.
 *
 * Canónico de lint (misma familia que hooks/use-mobile): suscriptor de
 * store + useSyncExternalStore, con snapshot de SERVIDOR = 0 (los
 * consumidores tratan 0 como «sin reloj»: la proyección devuelve el
 * puesto sembrado y el chip pinta su placeholder) — cero mismatch SSR.
 */

const listeners = new Set<() => void>();
let intervalo: ReturnType<typeof setInterval> | undefined;

function notificar() {
  for (const listener of listeners) listener();
}

function asegurarIntervalo() {
  if (intervalo !== undefined || listeners.size === 0) return;
  intervalo = setInterval(() => {
    notificar();
    // Sin oyentes (todas las vistas desmontadas) el reloj se apaga.
    if (listeners.size === 0) {
      clearInterval(intervalo);
      intervalo = undefined;
    }
  }, 1000);
}

function suscribir(listener: () => void): () => void {
  listeners.add(listener);
  asegurarIntervalo();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalo !== undefined) {
      clearInterval(intervalo);
      intervalo = undefined;
    }
  };
}

/** Snapshot por MINUTO (cambia 1 vez por minuto — proyección viva). */
function leerMinuto(): number {
  return Math.floor(Date.now() / 60_000);
}

/** Snapshot por SEGUNDO (chip de reloj LOCAL en vivo). */
function leerSegundo(): number {
  return Math.floor(Date.now() / 1000);
}

function leerServidor(): number {
  return 0;
}

/** Epoch ms del MINUTO en curso (0 durante SSR/pre-hidratación). */
export function useRelojVivo(): number {
  return useSyncExternalStore(suscribir, leerMinuto, leerServidor) * 60_000;
}

/** Epoch ms del SEGUNDO en curso (0 durante SSR/pre-hidratación). */
export function useRelojSegundos(): number {
  return useSyncExternalStore(suscribir, leerSegundo, leerServidor) * 1000;
}
