/**
 * KIT e75-qr-zoom-zbar-v1 — ZBAR-WASM 0.11 como tier de RESCATE (main thread).
 *
 * Evidencia del laboratorio de benchmark (12 imágenes reales E-14: 6 fotos de
 * cámara 4000×3000 con acta rotada 90° + 6 páginas de escáner ~1100×3700,
 * corrida 3× reproducible — docs/REPORTE-e75-qr-zoom-zbar-v1.md):
 * · zbar leyó 2 actas que NINGÚN otro lector vio en NINGUNA variante
 *   (p2 solo zbar@zoom1024 · p4 solo zbar@zoom640) — el finder por scanlines
 *   de ZBar es complementario al de ZXing/jsQR en impresiones degradadas.
 * · zbar es LENTO a imagen completa (~42 ms @1024) — por eso SOLO vive
 *   detrás del tier zoom (recorte re-escalado, ~6 ms), nunca delante.
 *
 * Contratos heredados del tier zxing (e63n + e64 §7, byte a byte en espíritu):
 * · Carga DIFERIDA con UNA tentativa por sesión (caché módulo|indisponible).
 * · wasm servido LOCAL desde public/wasm/zbar.wasm vía setModuleArgs({
 *   locateFile }) con base `${NEXT_PUBLIC_BASE_PATH}/wasm/` — MISMA doctrina
 *   que zxing_reader.wasm (offline primero; sin red jamás carga el tier).
 * · JAMÁS throw: cualquier falla = null = el ladder sigue (red line e64 §7-4).
 * · PROHIBIDO en el worker (misma red line e73 que zxing: el bundle del
 *   worker de capa 0 queda jsQR-only; zbar/zxing viven en main como rescate).
 * · El E-14 usa QR — un símbolo NO-QR de zbar JAMÁS sale de aquí (filtro por
 *   typeName; el payload sigue siendo llave opaca, red line 10 intacta).
 */
import { logger } from "../../logger";
import type { PixelesQr } from "./qr-pixeles";

type ModZbar = typeof import("@undecaf/zbar-wasm");

/** Módulo zbar cacheado — undefined = aún no intentado · null = la carga
 *  falló (el tier zoom degrada a zxing/jsQR) · módulo = listo. */
let modZbar: ModZbar | null | undefined;

/**
 * Carga DIFERIDA del módulo zbar (MISMO patrón de `moduloZxingDe` de
 * identidad-qr.ts). Una sola tentativa por sesión; falla → null CON traza de
 * indisponibilidad y el ladder degrada honesto. Jamás throw.
 */
export async function moduloZbarDe(): Promise<ModZbar | null> {
  if (modZbar !== undefined) return modZbar;
  try {
    const mod = await import("@undecaf/zbar-wasm");
    mod.setModuleArgs({
      locateFile: () =>
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/wasm/zbar.wasm`,
    });
    modZbar = mod;
  } catch {
    logger.warn(
      "[e14] qr-capa0 zbar INDISPONIBLE (wasm/glue no cargó) — tier zoom degrada a zxing",
    );
    modZbar = null;
  }
  return modZbar;
}

/** Estado del módulo zbar para diagnóstico (misma forma de `estadoZxingQr`).
 *  SOLO-LECTURA: jamás muta el estado, jamás dispara la carga. */
export function estadoZbarQr(): "no-intentado" | "indisponible" | "listo" {
  return modZbar === undefined
    ? "no-intentado"
    : modZbar === null
      ? "indisponible"
      : "listo";
}

/**
 * UN intento zbar sobre UNA ventana de píxeles RGBA. Filtra símbolos QR (el
 * E-14 usa QR — zbar reporta otras simbologías y JAMÁS deben salir como
 * payload). null si el módulo no está o nada lee. Jamás throw.
 */
export async function zbarDePixeles(pix: PixelesQr): Promise<string | null> {
  try {
    const mod = await moduloZbarDe();
    if (!mod) return null;
    // Copia del buffer RGBA (scanRGBABuffer consume ArrayBuffer propio).
    const buffer = pix.data.buffer.slice(
      pix.data.byteOffset,
      pix.data.byteOffset + pix.data.byteLength,
    ) as ArrayBuffer;
    const simbolos = await mod.scanRGBABuffer(buffer, pix.width, pix.height);
    const qr = simbolos.find((s) => (s.typeName ?? "").includes("QR"));
    return qr ? qr.decode() : null;
  } catch {
    return null; // un intento jamás tumba el ladder (red line e64 §7-4)
  }
}
