/**
 * actas-demo.ts — siembra del lote DEMO (botón «DEMO ×4»).
 *
 * QUÉ ES: fixtures SINTÉTICAS del modo SIM (las mismas de sim-assets.ts).
 * Antes (hasta 2026-11-11) este lote eran 6 fotos REALES del consulado de El
 * Cairo — retiradas del HEAD por el hallazgo #1 de la auditoría y purgadas de
 * la historia con scripts/reescribir-historia-supervision-e14.sh (Fase 3).
 * Jamás vuelvas a commitear actas reales.
 *
 * El lote entra al módulo masiva por la MISMA puerta que cualquier archivo
 * soltado en la dropzone (`agregarFiles`): todo el pipeline real corre (QR
 * capa 0, dedup, OCR, score, gate, envío).
 */
import demo01 from "@/modules/digitalizador/assets/acta-sim-intermedia.jpg";
import demo02 from "@/modules/digitalizador/assets/acta-sim-baja.jpg";
import demo03 from "@/modules/digitalizador/assets/acta-sim-extra-1.jpg";
import demo04 from "@/modules/digitalizador/assets/acta-sim-extra-2.jpg";

/** Las 4 fixtures, con su nombre real (la bandeja los lista así). El import
 *  estático de Next es StaticImageData — `.src` resuelve el basePath. */
const ACTAS_DEMO: readonly { src: string; nombre: string }[] = [
  { src: demo01.src, nombre: "acta-sim-intermedia.jpg" },
  { src: demo02.src, nombre: "acta-sim-baja.jpg" },
  { src: demo03.src, nombre: "acta-sim-extra-1.jpg" },
  { src: demo04.src, nombre: "acta-sim-extra-2.jpg" },
];

/** Fetch de los assets estáticos → File[] (image/jpeg) para `agregarFiles`. */
export async function fetchActasDemo(): Promise<File[]> {
  const archivos: File[] = [];
  for (const asset of ACTAS_DEMO) {
    const res = await fetch(asset.src);
    if (!res.ok) {
      throw new Error(`DEMO: no se pudo cargar la imagen incluida (${asset.nombre})`);
    }
    archivos.push(new File([await res.blob()], asset.nombre, { type: "image/jpeg" }));
  }
  return archivos;
}
