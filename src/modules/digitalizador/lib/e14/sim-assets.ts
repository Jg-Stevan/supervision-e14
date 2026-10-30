/**
 * sim-assets.ts — R7b (M5a): assets y fetch de la SIMULACIÓN.
 *
 * MOVIDO verbatim de `scanner-core-bridge.ts` (partición move-only,
 * docs/revision-v1/03a-digitalizador-nucleo.md §7 paso M5 — el reporte lo
 * llama sim-assets.ts). El estado de módulo (actaSimIdx rotativo +
 * actasSimCache por índice) viaja CON las funciones: era estado privado del
 * bridge y aquí conserva EXACTAMENTE la misma semántica (ciclo determinista
 * §G-2 + caché por índice — fetchActaSimPorScore reutiliza la MISMA caché
 * del ciclo sin tocar el contador rotativo).
 *
 * Contenido (sin cambios de lógica, comentarios íntegros):
 *   · ActaSim / ACTAS_SIM — tabla de los 5 assets del dueño (§G-1/§D8)
 *   · fetchActaSimulada — ciclo rotativo óptima→intermedia→baja→… (§G-2)
 *   · indiceActaPorScore + fetchActaSimPorScore — asset FIJO por chip
 *     (§D3: 8.2/7.0/4.3 → 0/1/2, no-regresión dura AC-S2)
 *   · EntradaSim — entrada del pipeline con flag sinRecorte (§D8.1)
 */
// §1 (SPEC-ux-real-bn-editor): acta E-14 real del dueño (Galaxy A56 5G) —
// import estático: Next resuelve el basePath /web-scanner del deploy estático.
// REFRESCO 2026-10-21 (lote JPG.rar del dueño): el contenido del asset es
// AHORA la mejor foto del lote nuevo (1152×2048, nítida/flat — elegida por
// VLM + métricas Laplaciano: lap-var 3203, la más alta del lote).
import actaSimUrl from "@/modules/digitalizador/assets/acta-e14-real.jpg";
// §G-1 (SPEC-camara-funcional): las 3 actas del dueño para la SIMULACIÓN de
// scores — [0] óptima (pipeline COMPLETO con detect+warp+bw) · [1] intermedia
// (as-is, §D6 Rev. 3) · [2] baja (as-is, §D7 Rev. 3). Los flags viajan en la
// tabla ACTAS_SIM de abajo (§D8).
// REFRESCO 2026-10-21 (lote JPG.rar): contenidos nuevos del dueño — [0] la
// nítida/plana del lote (lap-var 3203, WhatsApp 1152×2048) · [1] la media
// (1800×2400, lap-var 632, leve perspectiva) · [2] la borrosa (1800×2400,
// lap-var 281, arrugas + firmas cargadas). Extras [3]/[4] para el ciclo
// rotativo (§G): la de arrugas pronunciadas y la de sombra lateral.
import actaSimIntermediaUrl from "@/modules/digitalizador/assets/acta-sim-intermedia.jpg";
import actaSimBajaUrl from "@/modules/digitalizador/assets/acta-sim-baja.jpg";
import actaSimExtra1Url from "@/modules/digitalizador/assets/acta-sim-extra-1.jpg";
import actaSimExtra2Url from "@/modules/digitalizador/assets/acta-sim-extra-2.jpg";

/**
 * SIMULACIÓN = pipeline real sobre el acta E-14 incluida (D35).
 * §G-2 (SPEC-camara-funcional): ciclo determinista de las 3 actas del dueño
 * (óptima → intermedia → baja → óptima…) — cada disparo consume el índice
 * actual y avanza el contador de módulo. Mismo camino que IMPORTAR: File →
 * fileToCaptureDataUrl (F-IMPORT: EXIF/12MP). Caché POR ÍNDICE a nivel de
 * módulo para no re-descargar un acta ya servida en el ciclo.
 * §D8.1 (SPEC-e14-score-ocr Rev. 3): flag «sin recorte» por ENTRADA — el
 * flag viaja con el ASSET, no con el chip (el ciclo rotativo §G lo hereda
 * automáticamente): [0] óptima = pipeline completo (hoy) · [1] b/n as-is ·
 * [2] borrosa as-is.
 */
export interface ActaSim {
  src: typeof actaSimUrl;
  nombre: string;
  sinRecorte: boolean;
}
const ACTAS_SIM: readonly ActaSim[] = [
  { src: actaSimUrl, nombre: "acta-e14-real.jpg", sinRecorte: false },
  { src: actaSimIntermediaUrl, nombre: "acta-sim-intermedia.jpg", sinRecorte: true },
  { src: actaSimBajaUrl, nombre: "acta-sim-baja.jpg", sinRecorte: true },
  { src: actaSimExtra1Url, nombre: "acta-sim-extra-1.jpg", sinRecorte: true },
  { src: actaSimExtra2Url, nombre: "acta-sim-extra-2.jpg", sinRecorte: true },
];
let actaSimIdx = 0;
export interface EntradaSim {
  archivo: File;
  sinRecorte: boolean;
}
const actasSimCache: EntradaSim[] = [];
export async function fetchActaSimulada(): Promise<EntradaSim> {
  const idx = actaSimIdx;
  actaSimIdx = (actaSimIdx + 1) % ACTAS_SIM.length;
  const cache = actasSimCache[idx];
  if (cache) return cache;
  // ACTAS_SIM[idx].src es StaticImageData — .src.src ya resuelve el basePath
  // /web-scanner del deploy estático (en dev: /_next/static/media/...).
  const res = await fetch(ACTAS_SIM[idx].src.src);
  if (!res.ok) throw new Error("SIMULACIÓN: no se pudo cargar la imagen incluida");
  // File con nombre real del asset (.jpg — evita el camino HEIC).
  const entrada: EntradaSim = {
    archivo: new File([await res.blob()], ACTAS_SIM[idx].nombre, {
      type: "image/jpeg",
    }),
    sinRecorte: ACTAS_SIM[idx].sinRecorte,
  };
  actasSimCache[idx] = entrada;
  return entrada;
}

/**
 * §D3 (SPEC-e14-simulacion-scores): asset FIJO por score de chip — mapeo
 * determinista dueño (la completa = óptima · la cortada = intermedio · la
 * borrosa = bajo): 8.2 → acta-e14-real.jpg · 7.0 → acta-sim-intermedia.jpg ·
 * 4.3 → acta-sim-baja.jpg. Reutiliza la MISMA caché por índice del ciclo
 * rotativo (§G del PR #33, que queda INTACTO — esta vía solo cambia QUÉ
 * índice se sirve: el del chip, nunca el contador rotativo). El flag
 * sinRecorte del asset viaja con la entrada (§D8.1).
 */
function indiceActaPorScore(score: number): number {
  if (score >= 8) return 0; // ÓPTIMA [8.2] → la acta completa, nítida
  if (score >= 6.5) return 1; // MEDIO [7.0] → la b/n del dueño, as-is (Rev. 3)
  return 2; // BAJA [4.3] → la borrosa del dueño, as-is (Rev. 3)
}
export async function fetchActaSimPorScore(score: number): Promise<EntradaSim> {
  const idx = indiceActaPorScore(score);
  const cache = actasSimCache[idx];
  if (cache) return cache;
  const res = await fetch(ACTAS_SIM[idx].src.src);
  if (!res.ok) throw new Error("SIMULACIÓN: no se pudo cargar la imagen incluida");
  const entrada: EntradaSim = {
    archivo: new File([await res.blob()], ACTAS_SIM[idx].nombre, {
      type: "image/jpeg",
    }),
    sinRecorte: ACTAS_SIM[idx].sinRecorte,
  };
  actasSimCache[idx] = entrada;
  return entrada;
}
