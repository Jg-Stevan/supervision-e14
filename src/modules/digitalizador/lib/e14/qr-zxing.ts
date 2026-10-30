/**
 * qr-zxing.ts — R7b (M10): hogar del loader zxing-wasm compartido.
 *
 * MOVIDO verbatim de `masiva/identidad-qr.ts` (misma caché, mismos tokens de
 * traza, mismo contrato) para CORTAR la dependencia invertida
 * núcleo→masiva: `orientacion-qr.ts` (núcleo E-14) importaba
 * `moduloZxingDe`/`qrCorto` del submódulo `masiva/` — la dirección correcta
 * es masiva→núcleo (hallazgo M10 de docs/revision-v1/03a-digitalizador-
 * nucleo.md). `masiva/identidad-qr.ts` conserva RE-EXPORT temporal (R8 lo
 * retirará al re-apuntar sus imports).
 *
 * `estadoZxingQr` viaja con el loader porque LEE la MISMA caché de módulo
 * (`modZxing`) — partirlos habría dado DOS caches y un estado de
 * diagnóstico mentiroso. `qrCorto` es el formateador de trazas compartido
 * (SOLO cosmético — la decisión vive SIEMPRE en la igualdad EXACTA, red
 * line 10).
 */

// R2 — PUBLIC_BASE único (src/shared/env.ts; el inline de locateFile era la
// copia #8 del §B2 #10).
import { PUBLIC_BASE } from "@/shared/env";
import { logger } from "../logger"; // SPRINT-A A6 — console→logger (mensajes byte-idénticos)

// ─── e63n (T-PRE) — tier ZXING (zxing-wasm 3.1.6, wasm LOCAL) ──────────────
/** Módulo zxing-wasm/reader cacheado — undefined = aún no intentado ·
 *  null = la carga falló (degrada a solo-jsQR) · módulo = listo. */
type ModZxing = typeof import("zxing-wasm/reader");
let modZxing: ModZxing | null | undefined;

/**
 * Carga DIFERIDA del módulo zxing (doc hermano §1: `import("zxing-wasm/
 * reader")` + wasm servido LOCAL desde public/wasm/ vía
 * setZXingModuleOverrides({ locateFile }) con base
 * `${NEXT_PUBLIC_BASE_PATH ?? ""}/wasm/`). Una sola tentativa por sesión
 * (caché); falla → null CON traza de indisponibilidad (T-0.1 del e64 —
 * doc hermano F-0.2) y el pipeline degrada a solo-jsQR. Jamás throw.
 *
 * KIT e14-orientacion-qr-v1 — EXPORTADO ADITIVO: la brújula QR de
 * orientación REUTILIZA este loader (mismo módulo, MISMA instancia de wasm
 * en caché — cero costo extra de memoria/bundle). El contrato no cambia:
 * caché de una tentativa, jamás throw.
 */
export async function moduloZxingDe(): Promise<ModZxing | null> {
  if (modZxing !== undefined) return modZxing;
  try {
    const mod = await import("zxing-wasm/reader");
    mod.setZXingModuleOverrides({
      locateFile: (archivo: string) =>
        `${PUBLIC_BASE}/wasm/${archivo}`,
    });
    modZxing = mod;
  } catch {
    // e64-qr T-0.1 — el fallo del wasm/glue era SILENCIOSO (doc hermano
    // H-3): sin esta traza era imposible distinguir «QR ilegible» de
    // «wasm no cargó» (deploy sin BUILD_STATIC=1, basePath equivocado,
    // red bloqueada). El pipeline NO se rompe: degrada a solo-jsQR.
    logger.warn(
      `[e14] qr-capa0 zxing INDISPONIBLE (wasm/glue no cargó) — rescate degrada a solo-jsQR`,
    );
    modZxing = null;
  }
  return modZxing;
}

/** e64-qr T-0.1 — Estado del módulo zxing para diagnóstico (doc hermano
 *  F-0.2): "no-intentado" = aún sin intentar · "indisponible" = la carga
 *  falló (rescate degrada a solo-jsQR) · "listo" = wasm cargado. SOLO-
 *  LECTURA: jamás muta el estado, jamás dispara la carga. */
export function estadoZxingQr(): "no-intentado" | "indisponible" | "listo" {
  return modZxing === undefined
    ? "no-intentado"
    : modZxing === null
      ? "indisponible"
      : "listo";
}

/** Prefijo corto del payload para trazas/informe (8 chars + «…») — SOLO
 *  cosmética: la decisión vive SIEMPRE en la igualdad EXACTA (red line 10). */
export function qrCorto(payload: string): string {
  return `${payload.slice(0, 8)}…`;
}
