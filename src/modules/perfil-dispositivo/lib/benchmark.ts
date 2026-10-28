/**
 * KIT perfil-recursos-v1 — micro-benchmark ligero (EVIDENCIA, no veredicto).
 *
 * OBJETIVO: confirmar el tier detectado por señales (un dispositivo puede
 * declararse ALTO y rendir BAJO por thermal throttling u overhead del SO).
 * Total < ~200 ms repartidos en 3 fases con cesión de hilo — jamás bloquea
 * la UI de forma perceptible. Se corre en idle (requestIdleCallback).
 *
 * FASES:
 * · CPU: aritmética mixta int/float + bit-ops sobre Uint8Array (ops/ms)
 * · Memoria: copia de buffers Float64 (MB/s)
 * · Raster 2D: rects+texto sobre canvas offscreen (ms — aprox. el coste de
 *   thumbnails/deskew liviano)
 *
 * El score NO decide el tier v1 (D6 — paridad §4.4): es evidencia en el
 * panel y entrada futura del plan recomendado. Jamás lanza.
 */
import type { BenchmarkResultado } from "../domain/tipos";
import { cederHilo, hayEntornoNavegador } from "./senales";

/** Referencias de calibración (PC de escritorio dev del kit ≈ 1000). */
const REF_CPU_OPS_MS = 400;
const REF_MEM_MB_S = 6000;
const REF_RASTER_MS = 10;

function medidaCpu(): number | null {
  try {
    const datos = new Uint8Array(64 * 1024);
    for (let i = 0; i < datos.length; i++) datos[i] = (i * 7) & 0xff;
    let acc = 0;
    const t0 = performance.now();
    const rondas = 400;
    for (let r = 0; r < rondas; r++) {
      for (let i = 0; i < datos.length; i += 4) {
        acc = (acc + (datos[i] ^ (datos[i + 1] << 1)) + ((datos[i + 2] * 3) | 0)) & 0x7fffffff;
        acc = (acc ^ (datos[i + 3] + r)) & 0x7fffffff;
      }
    }
    const ms = performance.now() - t0;
    if (ms <= 0 || !isFinite(acc)) return null;
    return Math.round((rondas * (datos.length / 4)) / ms); // ops/ms
  } catch {
    return null;
  }
}

function medidaMemoria(): number | null {
  try {
    const a = new Float64Array(512 * 1024); // 4 MB
    const b = new Float64Array(512 * 1024);
    for (let i = 0; i < a.length; i++) a[i] = i * 0.5;
    const t0 = performance.now();
    const copias = 12;
    for (let c = 0; c < copias; c++) b.set(a);
    const ms = performance.now() - t0;
    if (ms <= 0) return null;
    const mb = (a.byteLength / 1048576) * copias;
    return Math.round(mb / (ms / 1000)); // MB/s
  } catch {
    return null;
  }
}

function medidaRaster(): number | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) {
      const x = (i * 37) % 300;
      const y = (i * 23) % 180;
      ctx.fillStyle = i % 2 ? "#3fe56c" : "#252b2b";
      ctx.fillRect(x, y, 18, 12);
      ctx.fillStyle = "#dee4e3";
      ctx.font = "10px monospace";
      ctx.fillText(String(i % 97), x + 2, y + 9);
    }
    const ms = performance.now() - t0;
    // Forzar la lectura (evita que el rasterizador difiera el trabajo).
    void canvas.toDataURL("image/png", 0.5);
    return Math.round(ms * 100) / 100;
  } catch {
    return null;
  }
}

/** Score 0..1000 — mezcla ponderada de las 3 fases contra la referencia. */
function scoreDe(cpuOpsMs: number | null, memMBs: number | null, rasterMs: number | null): number | null {
  try {
    const partes: number[] = [];
    const pesos: number[] = [];
    if (cpuOpsMs !== null) {
      partes.push(Math.min(cpuOpsMs / REF_CPU_OPS_MS, 2));
      pesos.push(0.5);
    }
    if (memMBs !== null) {
      partes.push(Math.min(memMBs / REF_MEM_MB_S, 2));
      pesos.push(0.3);
    }
    if (rasterMs !== null && rasterMs > 0) {
      partes.push(Math.min(REF_RASTER_MS / rasterMs, 2));
      pesos.push(0.2);
    }
    if (partes.length === 0) return null;
    const total = pesos.reduce((a, b) => a + b, 0);
    const mezcla = partes.reduce((acc, p, i) => acc + p * pesos[i], 0) / total;
    return Math.max(1, Math.min(1000, Math.round(mezcla * 1000)));
  } catch {
    return null;
  }
}

export const BENCHMARK_SIN_EJECUTAR: BenchmarkResultado = {
  ejecutado: false,
  score: null,
  cpuOpsMs: null,
  memMBs: null,
  rasterMs: null,
  duracionMs: null,
  nota: "Sin ejecutar (se corre en idle tras el montaje)",
};

/** Ejecuta el micro-benchmark completo. Jamás lanza. */
export async function ejecutarBenchmark(): Promise<BenchmarkResultado> {
  try {
    if (!hayEntornoNavegador()) return BENCHMARK_SIN_EJECUTAR;
    const t0 = performance.now();
    await cederHilo(16);
    const cpuOpsMs = medidaCpu();
    await cederHilo(16);
    const memMBs = medidaMemoria();
    await cederHilo(16);
    const rasterMs = medidaRaster();
    const duracionMs = Math.round(performance.now() - t0);
    const score = scoreDe(cpuOpsMs, memMBs, rasterMs);
    let nota = "Medición completa";
    if (score === null) nota = "Fases insuficientes para puntuar";
    else if (score >= 750) nota = "Rendimiento medido: alto";
    else if (score >= 350) nota = "Rendimiento medido: medio";
    else nota = "Rendimiento medido: bajo";
    return { ejecutado: true, score, cpuOpsMs, memMBs, rasterMs, duracionMs, nota };
  } catch {
    return { ...BENCHMARK_SIN_EJECUTAR, nota: "El benchmark falló en silencio (jamás tumba la app)" };
  }
}
