/**
 * Config inyectable del bloque base obs (ítem 3.6 — costuras ② y ③).
 *
 * El bloque base NO conoce: la versión de la app (identidad la leía del
 * package.json — §3.4), la política de datos (captura leía politica.ts) ni
 * las condiciones de muestreo de salud (dispositivo leía politica + flags).
 * TODO entra por configuración; la app anfitriona la fija en su bootstrap.
 */
export interface ConfigObsBase {
  /** Versión de la app anfitriona (package.json — inyectada, costura ②). */
  versionApp: string;
  /** Kill switch de datos (politica.metadatos — costura de captura). Default ON. */
  politicaMetadatos: () => boolean;
  /** Condiciones del muestreo de salud (modo dev + saludEnVivo + flag). Default OFF. */
  condicionesSalud: () => boolean;
}

export const configObsBase: ConfigObsBase = {
  versionApp: "0.0.0",
  politicaMetadatos: () => true,
  condicionesSalud: () => false,
};

/** Fija la configuración (parcial). Idempotente. */
export function configurarObsBase(parcial: Partial<ConfigObsBase>): void {
  Object.assign(configObsBase, parcial);
}
