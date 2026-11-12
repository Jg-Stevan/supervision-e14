/** Ítem 3.3: motor del sidecar en el paquete; URL de S inyectada
 * (flags.ocrNativoUrl — validador SEC-10: solo localhost). */
import { configurarNativo } from "@jg-stevan/scanner-core/ocr/motores/nativo";
import { leerFlags } from "../flags";

try {
  configurarNativo(leerFlags().ocrNativoUrl ?? null);
} catch {
  configurarNativo(null);
}

export * from "@jg-stevan/scanner-core/ocr/motores/nativo";

/**
 * P-21 (plan 2026-11-12) — sondeo DIRECTO a una URL de sidecar, SIN tocar la
 * configuración del motor.
 *
 * La tarjeta del acelerador lo usa mientras está CAÍDO: al desarmar el flag en
 * runtime (`configurarNativo(null)`), la sonda del core (`ladoNativoDisponible`)
 * contestaría `false` sin salir a la red — el sidecar muerto quedaría
 * irrecuperable aunque el proceso volviera. Este sondeo va directo a la URL
 * original y deja la decisión de RE-ARMAR en la tarjeta (que reconfigura solo
 * con veredicto positivo — jamás a ciegas, para no pagar el timeout del motor
 * muerto en la siguiente acta).
 *
 * Mismo contrato que la sonda del core: 1 GET /salud, timeout corto, jamás
 * lanza (fallo de red / JSON raro / abort = false).
 */
export async function sondearUrlSidecarDirecta(
  url: string,
  timeoutMs = 1_200,
): Promise<boolean> {
  const base = url.replace(/\/+$/, "");
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/salud`, {
      cache: "no-store",
      signal: control.signal,
    });
    if (!res.ok) return false;
    const j = (await res.json()) as Record<string, unknown>;
    return j?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
