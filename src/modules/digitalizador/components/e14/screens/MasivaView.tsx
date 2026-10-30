"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — barrel de compatibilidad (R6).
 *
 * SPLIT de MasivaView.tsx (reporte 03b M-2, monolito de 1.644 líneas): la
 * vista vive en `masiva/orquestador.tsx` y sus componentes en `masiva/*`.
 * Este archivo conserva la RUTA de import del shell de supervision
 * (supervision-shell.tsx) — cero diffs fuera de components/e14/.
 */
export { MasivaView, type PropsMasivaView } from "./masiva/orquestador";
