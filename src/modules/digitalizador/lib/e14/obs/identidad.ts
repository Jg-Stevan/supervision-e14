/**
 * KIT e14-observabilidad-v1 (A1-C1) — identidad ANÓNIMA del rastreo.
 *
 * · idSesion() — UUID por sesión de página (en memoria, muere al cerrar).
 * · idDispositivo() — UUID anónimo PERSISTENTE en localStorage
 *   `e14-obs-device-id` (clave del contrato README-KITS §4.1).
 * · appVersion() — de package.json (resolveJsonModule — Next lo soporta).
 * · fnv1a8() — FNV-1a 32-bit → 8 hex: el hash compartido de obs (digests
 *   de errores y hash de actaId en perf — CERO PII: jamás sale un id plano,
 *   README-KITS §2 regla 5).
 *
 * SSR-safe: NINGÚN acceso a window/localStorage en el top-level del módulo
 * ni en import-time — todo dentro de funciones (page.tsx se pre-renderiza
 * estático; el bootstrap solo corre en useEffect, C7). Sin dependencias
 * nuevas (kit: package.json INTOCABLE).
 */
import pkg from "../../../../../../package.json";

const CLAVE_DISPOSITIVO = "e14-obs-device-id";

let sesionMemo: string | null = null;

/** UUID v4: crypto.randomUUID (secure context) con fallback honesto a
 *  getRandomValues — la identidad es un UUID sin relación con el operador
 *  (no es PII), pero jamás inventamos entropía si el navegador no la da.
 *  (infra interna compartida: buffer.ts la usa para el id de cada evento —
 *  el contrato §4.3 pinnea las 4 firmas públicas; este helper es plumbing). */
export function nuevoUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  }
  // Último recurso (navegadores paleolíticos): determinista en lo posible.
  return (
    "obs-" +
    Date.now().toString(16) +
    "-" +
    Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0")
  );
}

/** UUID por sesión de página — estable dentro de la sesión (memo), distinto
 *  entre pestañas/cargas. Idempotente por diseño. */
export function idSesion(): string {
  if (!sesionMemo) sesionMemo = nuevoUuid();
  return sesionMemo;
}

/** UUID anónimo PERSISTENTE del dispositivo (localStorage). Si localStorage
 *  falla (privado/iOS/SSR) → UUID de sesión: el rastreo sigue anónimo y
 *  nunca lanza (README-KITS §2 regla 4). */
export function idDispositivo(): string {
  try {
    const actual = window.localStorage.getItem(CLAVE_DISPOSITIVO);
    if (actual) return actual;
    const nuevo = nuevoUuid();
    window.localStorage.setItem(CLAVE_DISPOSITIVO, nuevo);
    return nuevo;
  } catch {
    return nuevoUuid();
  }
}

/** Versión de la app (package.json — el build la hornea; NO se lee en vivo). */
export function appVersion(): string {
  return pkg.version;
}

/** FNV-1a 32-bit → 8 hex (el helper de hash compartido del contrato §4.3).
 *  Math.imul para no perder los bits altos (multiplicación 32-bit real).
 *  Vectores fijados en obs.test.ts ("" → 811c9dc5, "a" → e40c292c,
 *  "foobar" → bf9cf968). */
export function fnv1a8(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
