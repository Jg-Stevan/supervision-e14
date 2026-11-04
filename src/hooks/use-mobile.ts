import * as React from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function suscribir(callback: () => void) {
  const mql = window.matchMedia(CONSULTA)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

/** Snapshot del cliente: media query del viewport actual. */
function leer(): boolean {
  return window.matchMedia(CONSULTA).matches
}

/** Snapshot del servidor: sin viewport → no móvil (igual que antes). */
function leerServidor(): boolean {
  return false
}

/**
 * useIsMobile — react-hooks/set-state-in-effect (reporte lint): la versión
 * anterior hacía `setIsMobile(...)` sincrónico dentro del effect (render
 * cascada). useSyncExternalStore es el patrón canónico para media queries:
 * sin effect, sin flash, misma firma booleana que consumía el template.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(suscribir, leer, leerServidor)
}
