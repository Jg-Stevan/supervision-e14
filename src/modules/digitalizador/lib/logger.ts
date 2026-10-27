/**
 * Helper de logging con política ÚNICA del proyecto (overnight 2026-10-22,
 * Prioridad 3 del PLAN-overnight.md — AUDIT.md fila «Observabilidad»).
 *
 * Política:
 *  · debug/info — SOLO en desarrollo (`process.env.NODE_ENV !== "production"`).
 *    Next sustituye NODE_ENV en build → el minificador elimina las llamadas
 *    de producción (cero costo de string-building en el bundle servido).
 *  · warn/error — SIEMPRE (útiles en producción: degradaciones visibles en
 *    devtools del operador de mesa, p. ej. divipol → MANUAL).
 *
 * El formato de los mensajes NO cambia (prefijo `[e14] …` incluido en el
 * propio mensaje del caller) — las trazas que los QA y la consola del dueño
 * conocen quedan byte-idénticas en desarrollo.
 *
 * KIT e14-observabilidad-v1 (A1-C3): warn/error TRANSPORTAN al buffer obs
 * (IndexedDB `e14-obs`) — SIEMPRE con:
 *  · import LAZY (`import("./e14/obs/buffer")` dentro del método) — no carga
 *    obs en SSR/edge ni crea ciclos estáticos (logger ← muchos módulos),
 *    con `.catch(() => {})` total.
 *  · try/catch — el transporte jamás tumba al caller ni altera la consola.
 *  · datos del contrato ErrorEvento: mensaje truncado 500, stack truncado
 *    2000 (capturado EN la llamada de logger — frame real del caller),
 *    tipo LoggerWarn/LoggerError, digest estable (digestDe), archivo
 *    (primer frame src/) y breadcrumbs del momento.
 * El flag anti-recursión vive en el buffer (appendEvento se auto-descarta
 * si ya está emitiendo — README-KITS §2.4).
 *
 * Migración pendiente (Fase 4, módulos GRANDES — fuera de alcance
 * overnight): runner.ts (22 console.info), rapidocr.ts (5), masiva/store.ts
 * (4), scanner-core-bridge.ts (3), identidad-qr.ts (3), store.ts (2),
 * orientacion.ts (2), precalor.ts (1). Los módulos pequeños ya estaban
 * limpios (dedup/historico/cola/origen: 0 console — grep overnight).
 */

const esDev = process.env.NODE_ENV !== "production";

/** Serializar args de logger a texto plano (string directo, objetos con
 *  JSON; circular/extraño → String()). Jamás lanza. */
function aTexto(args: unknown[]): string {
  try {
    return args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        return JSON.stringify(a) ?? "undefined";
      })
      .join(" ");
  } catch {
    return "<sin-serializar>";
  }
}

const TRUNCA_MENSAJE = 500; // contrato ErrorEvento
const TRUNCA_STACK = 2000;

/** Enviar el evento al buffer obs — lazy, silencioso, anti-recursivo. */
function transportar(
  tipo: "warn" | "error",
  etiqueta: "LoggerWarn" | "LoggerError",
  args: unknown[],
): void {
  try {
    const stackError = new Error(); // el stack EN la llamada de logger → frame del caller
    const mensaje = aTexto(args).slice(0, TRUNCA_MENSAJE);
    void Promise.all([
      import("./e14/obs/buffer"),
      import("./e14/obs/digest"),
      import("./e14/obs/breadcrumbs"),
      import("./e14/obs/identidad"),
    ])
      .then(([buffer, digest, breadcrumbs, identidad]) => {
        const stack = (stackError.stack ?? "").slice(0, TRUNCA_STACK);
        return buffer.appendEvento({
          tipo,
          ts: Date.now(),
          sesion: identidad.idSesion(),
          dispositivo: identidad.idDispositivo(),
          appVersion: identidad.appVersion(),
          datos: {
            mensaje,
            stack,
            tipo: etiqueta,
            archivo: digest.archivoDeStack(stack),
            digest: digest.digestDe(mensaje, etiqueta, stack),
            breadcrumbs: breadcrumbs.obtenerBreadcrumbs(),
          },
        });
      })
      .catch(() => {
        /* el transporte jamás rompe al logger (SSR/edge/SIN_INDEXEDDB) */
      });
  } catch {
    /* silencioso */
  }
}

export const logger = {
  /** Trazas de desarrollo (pipeline, presupuestos, dedup) — eliminadas en
   *  el bundle de producción por sustitución estática de NODE_ENV. */
  debug(...args: unknown[]): void {
    if (esDev) console.debug(...args);
  },
  /** Hitos informativos de desarrollo — eliminadas en producción. */
  info(...args: unknown[]): void {
    if (esDev) console.info(...args);
  },
  /** Degradaciones/avisos — SIEMPRE (el operador debe poder verlos) + obs. */
  warn(...args: unknown[]): void {
    console.warn(...args);
    transportar("warn", "LoggerWarn", args);
  },
  /** Errores — SIEMPRE + obs. */
  error(...args: unknown[]): void {
    console.error(...args);
    transportar("error", "LoggerError", args);
  },
};
