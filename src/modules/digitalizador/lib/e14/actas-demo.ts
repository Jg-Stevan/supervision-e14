/**
 * actas-demo.ts — siembra del lote de demostración (botón «DEMO ×6»).
 *
 * QUÉ ES: seis fotos reales de actas E-14 del consulado de El Cairo
 * (documentos públicos), recomprimidas a 2000 px de ancho (JPEG q70) para
 * que el repo no cargue los 3-4 MB por foto del original.
 *
 * El lote entra al módulo masiva por la MISMA puerta que cualquier archivo
 * soltado en la dropzone (`agregarFiles`): todo el pipeline real corre (QR
 * capa 0, dedup, OCR, score, gate, envío). Los nombres son los originales
 * de la cámara — el pipeline NO los usa como identidad (prohibido, kit T2.4).
 */
import demo01 from "@/modules/digitalizador/assets/actas-demo/20261028_084854.jpg";
import demo02 from "@/modules/digitalizador/assets/actas-demo/20261028_084901.jpg";
import demo03 from "@/modules/digitalizador/assets/actas-demo/20261028_084906.jpg";
import demo04 from "@/modules/digitalizador/assets/actas-demo/20261028_084939.jpg";
import demo05 from "@/modules/digitalizador/assets/actas-demo/20261028_085043.jpg";
import demo06 from "@/modules/digitalizador/assets/actas-demo/20261028_085053.jpg";

/** Las 6 fotos, con su nombre original (la bandeja los lista así). El import
 *  estático de Next es StaticImageData — `.src` resuelve el basePath. */
const ACTAS_DEMO: readonly { src: string; nombre: string }[] = [
  { src: demo01.src, nombre: "20261028_084854.jpg" },
  { src: demo02.src, nombre: "20261028_084901.jpg" },
  { src: demo03.src, nombre: "20261028_084906.jpg" },
  { src: demo04.src, nombre: "20261028_084939.jpg" },
  { src: demo05.src, nombre: "20261028_085043.jpg" },
  { src: demo06.src, nombre: "20261028_085053.jpg" },
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
