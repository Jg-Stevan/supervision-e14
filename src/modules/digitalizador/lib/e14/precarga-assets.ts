"use client";

/**
 * P-23 (plan 2026-11-12) — PRECARGA de los assets OCR descargables, indexada
 * por `scripts/assets.lock.json` (payload ~38,7 MB — el lockfile pesa ~3 KB).
 *
 * El problema: los modelos (RapidOCR v4/v5, Tesseract fast, OpenCV) se bajan
 * del mismo origen en la PRIMERA captura — el acta paga la descarga y en red
 * débil el lote se queda esperando el muro. La precarga los calienta CON
 * ANTELACIÓN (HTTP cache del navegador + SW), respetando la recomendación
 * `sincronizarSoloWifi` del perfil (P-23: "hoy es dato sin consumidor" — este
 * módulo es SU consumidor): con la recomendación ON, la descarga solo corre
 * en wifi/red buena (effectiveType 4g o type wifi); en red débil se difiere
 * con reintentos acotados (event `online` + techo de intentos).
 *
 * Doctrina (misma del resto del módulo digitalizador): la precarga es una
 * ACELERACIÓN, jamás un requisito — fire-and-forget, JAMÁS lanza, jamás
 * bloquea el lote, y con 404/red caída el pipeline sigue igual (los modelos
 * se bajan en la captura de siempre). La LISTA es un CONTRATO a dos bandas:
 * este módulo ↔ `scripts/assets.lock.json` — el test la fija (un desalinee se
 * ve verde antes de llegar a producción).
 */

/** Rutas same-origin de los assets descargables en runtime (sin el prefijo
 *  `public/` del lockfile — las rutas QUE SIRVE la app). El orden es el del
 *  lockfile: primero lo barato (OpenCV ~8 MB), luego el modelo por defecto de
 *  la cascada (Tesseract fast 1,14 MB), después RapidOCR v4 (det/rec/cls) y
 *  el v5 (det/rec) de la escalada. */
export const RUTAS_PRECARGA_OCR: readonly string[] = [
  "/vendor/opencv-4.5.5-core.js",
  "/models/tesseract/4.0.0_fast/spa.traineddata.gz",
  "/models/rapidocr/ch_PP-OCRv4_det_infer.onnx",
  "/models/rapidocr/ch_PP-OCRv4_rec_infer.onnx",
  "/models/rapidocr/ch_ppocr_mobile_v2.0_cls_infer.onnx",
  "/models/rapidocr/det_v5_mobile.onnx",
  "/models/rapidocr/rec_v5_latin.onnx",
];

/** Techo de reintentos cuando la red no colabora (event online + temporales). */
export const TECHO_INTENTOS_PRECARGA = 3;
/** Base del backoff entre intentos (ms): 30 s · 60 s · 90 s. */
export const BACKOFF_PRECARGA_MS = 30_000;

/** ¿Podemos descargar AHORA? (PURE — testeada). Regla P-23:
 *  · sin red (`enLinea=false`) → NO (esperar `online`).
 *  · `soloWifi=false` (recomendación del perfil OFF) → SÍ en cualquier red.
 *  · `soloWifi=true` → solo wifi (`redWifi`) o red buena (`redTipo="4g"`). */
export function puedeDescargarAhora(
  soloWifi: boolean,
  enLinea: boolean,
  redTipo: string | null,
  redWifi: boolean | null,
): boolean {
  if (!enLinea) return false;
  if (!soloWifi) return true;
  if (redWifi === true) return true;
  return redTipo === "4g";
}

/** Señales de red del momento (null-honest — sin connection API → null). */
function redDelMomento(): { redTipo: string | null; redWifi: boolean | null } {
  try {
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; type?: string };
    };
    return {
      redTipo: nav.connection?.effectiveType ?? null,
      redWifi: nav.connection?.type === "wifi" ? true : null,
    };
  } catch {
    return { redTipo: null, redWifi: null };
  }
}

/** Precarga UN asset (fire-and-forget: resolve true si llegó a caché). */
async function precargarRuta(ruta: string): Promise<boolean> {
  try {
    const res = await fetch(ruta, { cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Programador de la precarga (llamar FIRE-AND-FORGET desde el montar de
 *  MASIVA — jamás delante de una acta). Con la recomendación solo-wifi y red
 *  débil, difiere con techo de intentos (event `online` + backoff). Log de
 *  resumen honesto (cuántas entraron a caché). JAMÁS lanza. */
export function programarPrecargaAssetsOcr(sincronizarSoloWifi: boolean): void {
  try {
    if (typeof window === "undefined") return;
    let intentos = 0;

    const correr = async (): Promise<void> => {
      const { redTipo, redWifi } = redDelMomento();
      const enLinea = navigator.onLine;
      if (!puedeDescargarAhora(sincronizarSoloWifi, enLinea, redTipo, redWifi)) {
        intentos++;
        if (intentos > TECHO_INTENTOS_PRECARGA) {
          console.info(
            `[e14] precarga P-23 — desistida tras ${TECHO_INTENTOS_PRECARGA} intentos (red débil/offline; soloWifi=${sincronizarSoloWifi})`,
          );
          limpiar();
          return;
        }
        return; // difiere: el event `online` y el temporizador re-intentan
      }
      limpiar(); // con permiso de descarga, no hay más re-intentos
      let ok = 0;
      for (const ruta of RUTAS_PRECARGA_OCR) {
        if (await precargarRuta(ruta)) ok++;
      }
      console.info(
        `[e14] precarga P-23 — assets OCR en caché: ${ok}/${RUTAS_PRECARGA_OCR.length} (soloWifi=${sincronizarSoloWifi})`,
      );
    };

    const alOnline = () => void correr();
    window.addEventListener("online", alOnline);
    const temporizador = window.setInterval(
      () => void correr(),
      BACKOFF_PRECARGA_MS,
    );
    const limpiar = (): void => {
      window.removeEventListener("online", alOnline);
      window.clearInterval(temporizador);
    };

    void correr();
  } catch {
    /* la precarga jamás rompe el montar de MASIVA */
  }
}
