/**
 * actas-demo.ts — KIT visor-masiva-redesign-v1 — SEMBRADO DEL LOTE DEMO.
 *
 * Las 6 fotos REALES del dueño (RAR «Imagenes Buenas», cámara 2026-10-28 —
 * consulado 88 El Cairo, Egipto) empaquetadas como assets estáticos. El
 * patrón es EXACTAMENTE el de sim-assets.ts (import estático → fetch del
 * .src resuelto → new File): el lote entra al módulo masiva por la MISMA
 * puerta que cualquier archivo soltado en la dropzone (agregarFiles), así
 * que TODO el pipeline real corre (QR capa 0, dedup, OCR, score, gate,
 * envío automático) — nada de atajos ni fotos inventadas.
 *
 * El seeder vive SOLO en este entorno de preview (botón «DEMO ×6» del
 * orquestador). Al subir al repo el botón puede quedarse (útil para QA)
 * o removerse — es aditivo y no toca la cola ni el runner.
 */
import demo01 from "@/modules/digitalizador/assets/actas-demo/20261028_084854.jpg";
import demo02 from "@/modules/digitalizador/assets/actas-demo/20261028_084901.jpg";
import demo03 from "@/modules/digitalizador/assets/actas-demo/20261028_084906.jpg";
import demo04 from "@/modules/digitalizador/assets/actas-demo/20261028_084939.jpg";
import demo05 from "@/modules/digitalizador/assets/actas-demo/20261028_085043.jpg";
import demo06 from "@/modules/digitalizador/assets/actas-demo/20261028_085053.jpg";

/** Los 6 archivos del lote real, con su nombre original (la bandeja los
 *  lista con ese nombre). El orden es el del RAR. El import estático de
 *  Next es StaticImageData — `.src` resuelve la URL (con basePath si lo
 *  hay), EXACTO al patrón de sim-assets.ts (`ACTAS_SIM[idx].src.src`). */
const ACTAS_DEMO: readonly { src: string; nombre: string }[] = [
  { src: demo01.src, nombre: "20261028_084854.jpg" },
  { src: demo02.src, nombre: "20261028_084901.jpg" },
  { src: demo03.src, nombre: "20261028_084906.jpg" },
  { src: demo04.src, nombre: "20261028_084939.jpg" },
  { src: demo05.src, nombre: "20261028_085043.jpg" },
  { src: demo06.src, nombre: "20261028_085053.jpg" },
];

/** Fetch de los assets estáticos → File[] (imagen/jpeg) listos para
 *  `agregarFiles`. Mismo gesto del flujo IMPORTAR (F-IMPORT). */
export async function fetchActasDemo(): Promise<File[]> {
  const archivos: File[] = [];
  for (const asset of ACTAS_DEMO) {
    const res = await fetch(asset.src);
    if (!res.ok) {
      throw new Error(
        `DEMO: no se pudo cargar la imagen incluida (${asset.nombre})`,
      );
    }
    archivos.push(
      new File([await res.blob()], asset.nombre, { type: "image/jpeg" }),
    );
  }
  return archivos;
}
