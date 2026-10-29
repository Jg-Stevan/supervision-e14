/**
 * GATE-MARCADORES v2 (KIT e14-gate-v2, FASE G1) — marcador OBLIGATORIO:
 * la ZONA DE VOTOS del E-14. «La geometría sospecha, la tinta condena» —
 * aquí la tinta de la zona de votos es OBLIGATORIA.
 *
 * Fallo que origina este gate (2026-10-16): un acta SIN votos visibles se
 * calificó 10/10 (el piso de identificación forzaba el 10 por la cabecera
 * OCR — eliminado en la FASE G3) y se auto-envió. Nadie miró los votos
 * jamás. Este módulo CIERRA esa vía: sin tinta en la zona de votos →
 * rechazo directo SIN_VOTOS (FASE G2 del kit, fuera de evaluarGate —
 * patrón del veto INCOMPLETA).
 *
 * Estilo completitud.ts: REUTILIZA el motor de tinta `motorTinta` (mismo
 * criterio luma<128, mismo downscale ~320 px, mismo presupuesto <30 ms p95)
 * — helper común extraído, cero duplicación (verificación obligatoria del
 * kit: `rg "medirTintaAlFilo|medirZonaVotos" src` → motor compartido).
 *
 * Región (kit G1): franja inferior del acta PROCESADA — y de 0.45 a 0.95,
 * x de 0.06 a 0.94 (evita la cabecera y los márgenes). El contrato es el
 * mismo de completitud: las fracciones caen sobre el PAPEL (la fotoProcesada
 * ya es el interior del warp).
 *
 * Umbral CALIBRADO CON DATOS (kit G1 — nada inventado; densidad luma<128 en
 * la zona, medido sobre los assets reales del repo, script jpeg-js):
 *   · acta-sim-intermedia.jpg (b/n as-is — EXACTA a la medición del
 *     pipeline, sinRecorte/quad identidad): 15.68 %
 *   · acta-sim-baja.jpg (borrosa as-is — exacta): 8.83 %
 *   · acta-e14-real.jpg (cruda con fondo — proxy; en el pipeline la zona
 *     cae sobre el papel warped): bandas de papel 7.8-17.4 %
 *   · blanco puro (control): 0.00 % · margen blanco real del dueño
 *     (calibración D5 de completitud.ts): 0.3 %
 *   → UMBRAL_VOTOS_PCT = 0.8 (kit G1): ~2.6× el peor blanco real medido y
 *     ~11× por debajo de la acta real más tenue. CALIBRABLE con evidencia
 *     (F-C §8.5 de guard-borde — la REGLA no se toca).
 */
import { motorTinta } from "./completitud";

/** Zona de votos (fracciones del acta procesada) — kit G1. */
const ZONA_X0 = 0.06;
const ZONA_X1 = 0.94;
const ZONA_Y0 = 0.45;
const ZONA_Y1 = 0.95;

/** Umbral del marcador (kit G1): densidad de la zona < 0.8 % = SIN votos. */
const UMBRAL_VOTOS_PCT = 0.8;

// knip C3: de-export — uso SOLO interno (retorno de medirMarcadores).
interface MarcadoresResult {
  /** % de píxeles con tinta (luma<128) en la zona de votos. */
  densidadVotosPct: number;
  /** true = el marcador obligatorio CUMPLE (hay tinta de votos). */
  hayVotos: boolean;
}

/**
 * Mide la zona de votos de la foto PROCESADA (data URL del warp+realce —
 * el mismo insumo del guard de completitud). Recorte degenerado / decode
 * imposible → hayVotos=false (conservador, §7 de completitud: el acta
 * inservible se repite; cuando la geometría sospecha, el guard de
 * completitud condena ANTES y su veto manda).
 */
export async function medirZonaVotos(
  dataUrlFotoProcesada: string,
  /** D63-C — KIT e63c-quad-gate-escaneo-v1: región de la zona de votos en
   *  FRACCIONES del canvas — el RECT del marco impreso del formulario (el
   *  marco ES el borde del acta: mismo sistema de referencia que las
   *  fracciones ZONA_*). undefined = fracciones fijas de HOY (fotos y
   *  escaneos sin rect — comportamiento byte-idéntico). */
  region?: { x0: number; y0: number; x1: number; y1: number },
): Promise<MarcadoresResult> {
  const motor = await motorTinta(dataUrlFotoProcesada);
  if (!motor.utilizable) {
    return { densidadVotosPct: 0, hayVotos: false };
  }
  const zx0 = region?.x0 ?? ZONA_X0;
  const zx1 = region?.x1 ?? ZONA_X1;
  const zy0 = region?.y0 ?? ZONA_Y0;
  const zy1 = region?.y1 ?? ZONA_Y1;
  const sx = Math.round(motor.cw * zx0);
  const sy = Math.round(motor.ch * zy0);
  const sw = Math.max(1, Math.round(motor.cw * zx1) - sx);
  const sh = Math.max(1, Math.round(motor.ch * zy1) - sy);
  const densidadVotosPct = motor.densidadDe(sx, sy, sw, sh) * 100;
  return { densidadVotosPct, hayVotos: densidadVotosPct >= UMBRAL_VOTOS_PCT };
}
