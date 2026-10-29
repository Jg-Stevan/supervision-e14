"use client";

/**
 * SPLIT del runner (refactor/runner-logger-v1, C1 — movimiento puro): la
 * INSTRUMENTACIÓN del progreso (kit D65 T3 / e71 Opt-3) vive aquí — el %
 * global MONOTÓNICO por fila, la vida de cada fila (throttle 250 ms,
 * detección de pasada OCR) y el patch INMUTABLE de filas de la bandeja.
 * runner.ts (orquestador) importa { vidas, vidaDe, marcarFila, marcarVida };
 * este archivo NUNCA importa de otros runner-*.ts.
 */
import { useMasivaStore } from "./store";
import type { FilaMasiva } from "./tipos";
import type { ProgresoAnalisis } from "../types";
// KIT e14-obs-hang-atribucion-v1 (§A.2) — hook D58: cada señal del bridge
// actualiza la operación ACTIVA (module state, barato — sin tocar el
// throttling). Precedente masiva→obs: runner.ts ya importa ../obs/dispositivo.
import { marcarOperacion } from "../obs/operacion";
// KIT e14-gama-adaptativa-v1 (D74): el throttle EFECTIVO lo da el plan de
// gama (BAJO 500 · MEDIO 350 · base 250).
import { planGamaActual } from "../gama";

/** Throttle del progreso (250 ms — kit D65 T3.1 literal): el OCR emite decenas
 *  de eventos por etapa; la bandeja solo necesita el último.
 *  KIT e14-gama-adaptativa-v1 (D74): EFECTIVO por gama — con bandejas grandes
 *  cada setState re-pinta TODAS las filas y a 4 Hz eso es jank puro en los
 *  dispositivos que menos lo aguantan (BAJO 500 · MEDIO 350 · base 250).
 *  La detección de pasada OCR (caída fuerte de fracción — ver abajo) sigue
 *  siendo evidente al muestreo: la caída es de ~1.0 a ~0.0 entre etapas. */
const progresoMsEfectivo = (): number => planGamaActual().progresoMs;

// ─── % ÚNICO DEL PROCESO COMPLETO POR ACTA (cambio pedido por el dueño) ───
// Antes: el chip de la fila saltaba por tramos fijos por FASE (25→50→OCR
// 50-95→98) y, con el OCR ESCALONADO (1.ª pasada 1280 → re-OCR 1920), el
// número RETROCEDÍA (la 2.ª pasada re-emite su fracción 0→1: 95→50→95).
// Ahora cada señal del bridge mapea a un TRAMO del total del proceso y el
// valor es MONOTÓNICO (Math.max por señal — jamás baja dentro de la misma
// acta). Pesos según la duración REAL del pipeline (~21 s: OCR ~13 s domina
// → ~60% del arco; decode+detección ~2 s; recorte/realce ~2 s; calidad <1 s;
// el 5% final = clasificación/gate/guardado → LISTA pinta 100%).
const FRAC_DECODE_HASTA = 0.15; // DETECTANDO 0→1 (decode + detección de quad)
const FRAC_RECORTE_HASTA = 0.3; // RECORTANDO/REALZANDO (emite 0.2→1)
const FRAC_CALIDAD_HASTA = 0.35; // CALIDAD 0→1
const FRAC_OCR_P1_HASTA = 0.68; // OCR 1.ª pasada (fracción REAL por lotes)
const FRAC_OCR_TOPE = 0.95; // 2.ª pasada (1920) y banda dirigida: tope

/** Estado del % global de UNA fila (se resetea al empezar cada acta).
 *  e71 (Opt-3): POR-FILA (Map) — con 2 actas EN VUELO (pool del kit) cada
 *  una lleva SU estado: el global del secuencial corrompería la detección
 *  de pasada OCR entre filas (la caída fuerte de la fracción de UNA fila
 *  contaría como 2.ª pasada de la OTRA). `ocrPasada` detecta una NUEVA
 *  pasada del escalonado por caída fuerte de la fracción OCR (dentro de una
 *  pasada la fracción solo sube — es real, por lotes de rec). */
interface VidaFila {
  frac: number;
  ocrPasada: number;
  ocrFracPrev: number;
  ultimoEn: number; // throttle 250 ms POR-FILA (antes global)
}
const vidas = new Map<string, VidaFila>();

function vidaDe(id: string): VidaFila {
  let v = vidas.get(id);
  if (!v) {
    v = { frac: 0, ocrPasada: 1, ocrFracPrev: 0, ultimoEn: 0 };
    vidas.set(id, v);
  }
  return v;
}

/** Tramo del TOTAL (0..1) que representa una señal del bridge — la suma de
 *  todas las fases = el proceso COMPLETO del acta. Etapa desconocida →
 *  conserva el máximo alcanzado (jamás inventa). */
function fracGlobalDe(id: string, p: ProgresoAnalisis): number {
  const vida = vidaDe(id);
  const f = Math.min(1, Math.max(0, p.progreso));
  switch (p.etapa) {
    case "DETECTANDO":
      return f * FRAC_DECODE_HASTA;
    case "RECORTANDO":
    case "REALZANDO": {
      // el bridge compone este tramo como 0.2→1 (recorte + realce)
      const t = Math.min(1, Math.max(0, (f - 0.2) / 0.8));
      return FRAC_DECODE_HASTA + t * (FRAC_RECORTE_HASTA - FRAC_DECODE_HASTA);
    }
    case "CALIDAD":
      return FRAC_RECORTE_HASTA + f * (FRAC_CALIDAD_HASTA - FRAC_RECORTE_HASTA);
    case "OCR": {
      // ¿2.ª pasada del escalonado? caída fuerte de la fracción REAL
      if (f < vida.ocrFracPrev - 0.15) vida.ocrPasada += 1;
      vida.ocrFracPrev = f;
      if (vida.ocrPasada <= 1) {
        return FRAC_CALIDAD_HASTA + f * (FRAC_OCR_P1_HASTA - FRAC_CALIDAD_HASTA);
      }
      // 2.ª pasada (re-OCR 1920) y siguientes (banda dirigida): tope 0.95
      return Math.min(
        FRAC_OCR_TOPE,
        FRAC_OCR_P1_HASTA + f * (FRAC_OCR_TOPE - FRAC_OCR_P1_HASTA),
      );
    }
    default:
      return vida.frac;
  }
}

/** Patch INMUTABLE de UNA fila (la bandeja pinta filas livianas). */
function marcarFila(id: string, patch: Partial<FilaMasiva>): void {
  const filas = useMasivaStore.getState().filas;
  useMasivaStore.setState({
    filas: filas.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  });
}

/** D65 (T3) — vocabulario del kit para la señal de vida (marcarProgreso). */
type EtapaVidaKit = "preparando" | "deteccion" | "ocr" | "verificacion";

/** D65 (T3) — bucket del kit para una señal ProgresoAnalisis del bridge:
 *  · DETECTANDO con fracción ≤ 0.5 → "preparando" (rampa del decode).
 *  · DETECTANDO > 0.5, RECORTANDO, REALZANDO → "deteccion" (quad detectado
 *    + recorte/realce — cola de la fase de encuadre).
 *  · CALIDAD → "verificacion" · OCR → "ocr".
 *  La fracción del OCR es REAL (reconocedor por lotes de rec — §2-C4 del kit
 *  ocr-escalonado, consume el MISMO emit del bridge); las rampas del bridge
 *  son interpolación → SIN número (kit T3: barra animada, jamás inventar %). */
function bucketDeVida(
  p: ProgresoAnalisis,
): { etapa: EtapaVidaKit; ocrFraccion?: number } {
  switch (p.etapa) {
    case "OCR":
      return { etapa: "ocr", ocrFraccion: Math.min(1, Math.max(0, p.progreso)) };
    case "CALIDAD":
      return { etapa: "verificacion" };
    case "DETECTANDO":
      return p.progreso <= 0.5 ? { etapa: "preparando" } : { etapa: "deteccion" };
    default:
      return { etapa: "deteccion" }; // RECORTANDO / REALZANDO
  }
}

/** D65 (T3.1) — emisión de vida vía el action NUEVO del store (throttle).
 *  El % global se computa ANTES del throttle: la detección de pasada OCR
 *  necesita ver TODAS las señales (con 250 ms de muestreo la caída de la
 *  fracción sigue siendo evidente — de ~1.0 a ~0.0). */
function marcarVida(id: string, p: ProgresoAnalisis): void {
  const vida = vidaDe(id);
  const bruto = fracGlobalDe(id, p);
  if (bruto > vida.frac) vida.frac = bruto; // MONOTÓNICO
  // KIT e14-obs-hang-atribucion-v1 (§A.2) — ÚNICO cambio de este archivo:
  // marcar la etapa ANTES del throttle return (cada señal del bridge —
  // decode/detección/OCR/verificación — actualiza el registro D58; es el
  // MISMO bucket de bucketDeVida, vocabulario append-only §A). Sin clear:
  // la edad delata la obsolescencia.
  marcarOperacion(bucketDeVida(p).etapa);
  const ahora = Date.now();
  if (ahora - vida.ultimoEn < progresoMsEfectivo()) return;
  vida.ultimoEn = ahora;
  useMasivaStore
    .getState()
    .marcarProgreso(id, { ...bucketDeVida(p), fracGlobal: vida.frac });
}

export { marcarFila, marcarVida, vidaDe, vidas };
