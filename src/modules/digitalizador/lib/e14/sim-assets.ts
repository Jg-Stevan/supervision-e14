/**
 * sim-assets.ts — muestras de la SIMULACIÓN de cámara (SPEC-camara-funcional
 * §G, SPEC-e14-score-ocr §D3/D8.1).
 *
 * QUÉ ES: cinco fotos reales de actas E-14 (documentos públicos), la misma
 * entrada que produce una captura: `File` de imagen → pipeline real
 * (detect + warp + OCR + score). Están recomprimidas (≤1400 px de ancho,
 * JPEG q72) para que el repo no cargue los 3-4 MB por foto del original.
 *
 * CONTRATO:
 *   · ciclo rotativo óptima → intermedia → baja → extra… (§G-2)
 *   · caché POR ÍNDICE: un mismo índice se carga una sola vez
 *   · chip de score → índice FIJO (§D3: ≥8 → 0 · ≥6.5 → 1 · resto → 2;
 *     no-regresión dura AC-S2)
 *   · `sinRecorte` viaja con la ENTRADA, no con el chip (§D8.1)
 */
import actaSimUrl from "@/modules/digitalizador/assets/acta-e14-real.jpg";
import actaSimIntermediaUrl from "@/modules/digitalizador/assets/acta-sim-intermedia.jpg";
import actaSimBajaUrl from "@/modules/digitalizador/assets/acta-sim-baja.jpg";
import actaSimExtra1Url from "@/modules/digitalizador/assets/acta-sim-extra-1.jpg";
import actaSimExtra2Url from "@/modules/digitalizador/assets/acta-sim-extra-2.jpg";

/**
 * [0] óptima (nítida/plana — pipeline COMPLETO con detect+warp+bw) ·
 * [1] intermedia (leve perspectiva, as-is) · [2] baja (borrosa/arrugada,
 * as-is) · [3]/[4] extras del ciclo rotativo. `sinRecorte` por ENTRADA
 * (§D8.1): el flag viaja con el asset, no con el chip.
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

/** Carga (y memoriza) la muestra `idx`. `src.src` ya resuelve el basePath
 *  del export estático (en dev: /_next/static/media/...). */
async function cargarSim(idx: number): Promise<EntradaSim> {
  const enCache = actasSimCache[idx];
  if (enCache) return enCache;
  const sim = ACTAS_SIM[idx];
  const res = await fetch(sim.src.src);
  if (!res.ok) throw new Error("SIMULACIÓN: no se pudo cargar la imagen incluida");
  const entrada: EntradaSim = {
    archivo: new File([await res.blob()], sim.nombre, { type: "image/jpeg" }),
    sinRecorte: sim.sinRecorte,
  };
  actasSimCache[idx] = entrada;
  return entrada;
}

/** Ciclo determinista óptima → intermedia → baja → extra… (§G-2). */
export async function fetchActaSimulada(): Promise<EntradaSim> {
  const idx = actaSimIdx;
  actaSimIdx = (actaSimIdx + 1) % ACTAS_SIM.length;
  return cargarSim(idx);
}

/** Asset FIJO por score de chip (§D3): 8.2 → óptima · 7.0 → intermedia ·
 *  4.3 → baja. Comparte la caché del ciclo; NUNCA mueve el contador. */
function indiceActaPorScore(score: number): number {
  if (score >= 8) return 0;
  if (score >= 6.5) return 1;
  return 2;
}

export async function fetchActaSimPorScore(score: number): Promise<EntradaSim> {
  return cargarSim(indiceActaPorScore(score));
}
