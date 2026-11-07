/**
 * Entorno del paquete (FASE 1 — punto de inversión §3.3 del mapa v2.3).
 *
 * El paquete NO importa env de las apps (regla §0: app → núcleo, nunca al
 * revés). La URL del catálogo DIVIPOL y de los workers entra por
 * configuración; el DEFAULT es la MISMA expresión que ya usa el core
 * vendorizado (detector-client.ts L167): `NEXT_PUBLIC_BASE_PATH ?? ""` —
 * sin configurar, el comportamiento es byte-idéntico al de hoy en ambas apps.
 *
 * La app anfitriona llama UNA vez en su bootstrap:
 *   configurarPublicBase(PUBLIC_BASE);   // S: src/shared/env.ts · D: env directo
 */
let publicBaseConfigurado: string | null = null;

/** Fija el prefijo público de los assets estáticos (p. ej. "/supervision-e14"). */
export function configurarPublicBase(base: string): void {
  publicBaseConfigurado = base;
}

/** Prefijo público efectivo (configurado, o el env del core — default histórico). */
export function publicBaseEfectivo(): string {
  if (publicBaseConfigurado !== null) return publicBaseConfigurado;
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}
