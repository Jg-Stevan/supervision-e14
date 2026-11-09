/**
 * sim-assets.ts — muestras de la SIMULACIÓN de cámara (SPEC-camara-funcional
 * §G, SPEC-e14-score-ocr §D3/D8.1).
 *
 * QUÉ ES: fixtures de la simulación, la misma entrada que produce una
 * captura: `File` de imagen → pipeline real (detect + warp + OCR + score).
 * Están recomprimidas (≤1400 px de ancho, JPEG q72) para que el repo no
 * cargue los 3-4 MB por foto del original.
 *
 * D35 (opción A — anonimizar, 2026-11-08): la muestra «óptima» ERA una foto
 * real de acta (retirada del repo junto con las 8 WebP del kit actas-reales
 * — ver SECURITY.md §D35). Su ranura cae a una FIXTURE SINTÉTICA
 * (`acta-sim-intermedia.jpg`, la más limpia de las disponibles) con el
 * mismo tratamiento de ranura (`sinRecorte: false` → pipeline COMPLETO
 * con detect+warp): los índices del chip de score (§D3) y el ciclo
 * rotativo (§G-2) NO cambian.
 *
 * CONTRATO:
 *   · ciclo rotativo óptima → intermedia → baja → extra… (§G-2)
 *   · caché POR ÍNDICE: un mismo índice se carga una sola vez
 *   · chip de score → índice FIJO (§D3: ≥8 → 0 · ≥6.5 → 1 · resto → 2;
 *     no-regresión dura AC-S2)
 *   · `sinRecorte` viaja con la ENTRADA, no con el chip (§D8.1)
 */
import actaSimOptimaUrl from "@/modules/digitalizador/assets/acta-sim-intermedia.jpg";
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
  src: typeof actaSimOptimaUrl;
  nombre: string;
  sinRecorte: boolean;
}
const ACTAS_SIM: readonly ActaSim[] = [
  // Ranura «óptima» — fixture sintética desde D35 (la foto real salió del
  // repo); `nombre` es el archivo VERDADERO que recibe el pipeline.
  { src: actaSimOptimaUrl, nombre: "acta-sim-intermedia.jpg", sinRecorte: false },
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
