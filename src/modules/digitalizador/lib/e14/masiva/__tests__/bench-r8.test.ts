/**
 * R8 — BENCHMARK headless del núcleo masiva (misión R8 punto de medición
 * obligatoria: mismo lote sintético antes→después). NO mide OCR (el puente es
 * falso y rápido): mide el OVERHEAD DE ORQUESTACIÓN del runner — ctx/stages/
 * trazas/persistencia/métrica sobre los SEAMS del harness de caracterización.
 * Es exactamente el dominio donde el split de procesarUno (stages con ctx
 * inmutable enriquecido) podría introducir regresión; en producción el OCR
 * real (~13 s/acta) domina y este coste es ruido, pero el umbral de la
 * misión (>5%) se evalúa sobre ESTA medición real y reproducible.
 *
 * Lote: N filas OPTIMA (camino feliz completo: capa-0 sin QR → 1 intento →
 * desenlace → envío online real (store-e14 zustand headless) → persistencia
 * (IDB falsa Map) → marcarFila LISTA + métrica). 3 rondas — se reporta la
 * MENOR (menor ruido de GC/planificador; misma regla para ambas versiones).
 */
import { beforeEach, test } from "bun:test";

import "./caracterizacion.harness";
import {
  CONTROL,
  PIXELES,
  REGISTROS,
  reiniciarControl,
  reiniciarLedger,
} from "./caracterizacion.harness";

// ─── módulos bajo medición (después de los mocks del harness) ───────────────
const seed = await import("../../seed");
const { ACTA_MOCK } = seed;
const store = await import("../store");
const runner = await import("../runner");
const { procesarUno } = runner;
const { useMasivaStore } = store;

const N = 120;
const RONDAS = 8;

let secuenciaId = 0;

function clasificacion(nivel: string) {
  return {
    departamento: null,
    municipio: null,
    zona: null,
    puesto: null,
    mesa: null,
    tipo: null,
    pagina: null,
    kit: null,
    nivel,
    confianzas: { departamento: 0, municipio: 0, puesto: 0, tipo: 0 },
  };
}

function actaFixture(): Record<string, unknown> {
  return {
    ...structuredClone(ACTA_MOCK),
    id: `acta-bench-${(secuenciaId += 1)}`,
    status: "OPTIMA",
    score: 9.5,
    rechazo: null,
    intento: 1,
    maxIntentos: 4,
    clasificacion: clasificacion("AUTO"),
  };
}

function fileFixture(nombre: string): File {
  const parte = new Uint8Array([1, 2, 3, 4]) as unknown as BlobPart;
  return new File([parte], nombre, { type: "image/jpeg" });
}

beforeEach(async () => {
  REGISTROS.clear();
  reiniciarLedger();
  reiniciarControl();
  PIXELES.clear();
  await useMasivaStore.getState().vaciar();
  useMasivaStore.setState({
    filas: [],
    corriendo: false,
    progreso: null,
    enviandoLote: false,
    filtro: "TODAS",
    origenAbierto: null,
    guardando: 0,
    colaDisponible: true,
    avisoCola: null,
  });
});

test(`bench r8: lote sintético N=${N} × ${RONDAS} rondas por procesarUno (happy path)`, async () => {
  CONTROL.escanearActa = async () => actaFixture();
  CONTROL.qrDecode = null; // capa-0 corre completa → sin-payload (camino de siempre)

  const tiempos: number[] = [];
  for (let ronda = 0; ronda < RONDAS; ronda += 1) {
    const filas: { id: string; nombre: string; agregadaEn: number; estado: string }[] = [];
    for (let i = 0; i < N; i += 1) {
      const n = (secuenciaId += 1);
      const fila = {
        id: `fila-bench-${n}`,
        nombre: `FOTO_${n}.jpg`,
        agregadaEn: n,
        estado: "PENDIENTE",
      };
      useMasivaStore.setState({
        filas: [...useMasivaStore.getState().filas, fila as never],
      });
      REGISTROS.set(fila.id, {
        id: fila.id,
        nombre: fila.nombre,
        agregadaEn: fila.agregadaEn,
        estado: fila.estado,
        archivo: fileFixture(fila.nombre),
      });
      filas.push(fila);
    }
    const t0 = performance.now();
    for (const fila of filas) {
      await procesarUno(fila as never);
    }
    tiempos.push(Math.round(performance.now() - t0));
    // saneo: el lote COMPLETO aterrizó LISTA (el bench mide el camino real)
    const listas = useMasivaStore
      .getState()
      .filas.filter((f: { estado: string }) => f.estado === "LISTA").length;
    if (listas !== N) throw new Error(`ronda ${ronda}: ${listas}/${N} LISTA`);
    await useMasivaStore.getState().vaciar();
  }
  const menor = Math.min(...tiempos);
  // eslint-disable-next-line no-console -- salida del benchmark (se pega en pr.md/informe)
  console.log(
    `BENCH-R8 N=${N} rondas=${RONDAS} ms_por_ronda=[${tiempos.join(", ")}] min_ms=${menor} us_por_fila=${Math.round((menor / N) * 1000)}`,
  );
});
