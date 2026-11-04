/**
 * KIT perfil-recursos-v1 — clasificador de tier con EVIDENCIA auditable.
 *
 * PARIDAD §4.4 (obs/dispositivo.ts — calcularTier): MISMAS reglas para que
 * el chip de gama de Carga Masiva y este perfil NUNCA discrepen:
 * · BAJO por cualquier señal débil (solo con el dato presente — null no
 *   condena): memoriaGB < 2 · núcleos ≤ 2 · saveData · batería < 20 % sin
 *   cargar · storage libre < 500 MB.
 * · ALTO con deviceMemory REAL ≥ 4 ∧ núcleos ≥ 6 ∧ red 4g/wifi ∧ !saveData;
 *   sin deviceMemory (iOS) → INFERIDO por núcleos ≥ 6 + heap ≥ 2048 MB.
 * · MEDIO el resto.
 *
 * EXTENSIONES (evidencia, nunca deciden v1): GPU, WASM, forma y benchmark
 * se REPORTAN — cumplen D6 y dejan el terreno listo para planes futuros.
 * Jamás lanza.
 */
import type {
  Confianza,
  SenalEvidencia,
  Tier,
} from "../domain/tipos";
import type { BenchmarkResultado, RecursoSenales } from "../domain/tipos";

/** Señales decisivas del §4.4 (base de la confianza). */
const CLAVES_DECISIVAS = ["ram", "nucleos", "red", "bateria", "storage", "heap"] as const;

function fmtGB(v: number | null): string | null {
  return typeof v === "number" ? `${v} GB (informado)` : null;
}
function fmtN(v: number | null, sufijo: string): string | null {
  return typeof v === "number" ? `${v} ${sufijo}` : null;
}
function fmtPct(v: number | null): string | null {
  return typeof v === "number" ? `${Math.round(v * 100)} %` : null;
}
function fmtMB(v: number | null): string | null {
  if (v === null) return null;
  return v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`;
}

/** Clasifica y produce la evidencia. PARIDAD EXACTA con §4.4. Jamás lanza. */
export function clasificar(
  senales: RecursoSenales,
  benchmark: BenchmarkResultado,
): { tier: Tier; tierInferido: boolean; evidencia: SenalEvidencia[]; confianzaPct: number } {
  try {
    const s = senales;
    const evidencia: SenalEvidencia[] = [];

    // ── señales decisivas (§4.4) ──
    const ramOk = s.sync.memoriaGB !== null && s.sync.memoriaGB >= 4;
    const ramDebil = s.sync.memoriaGB !== null && s.sync.memoriaGB < 2;
    evidencia.push({
      clave: "ram",
      etiqueta: "Memoria (RAM)",
      valor: fmtGB(s.sync.memoriaGB),
      veredicto: ramDebil ? "debil" : ramOk ? "favorable" : "inconcluso",
      detalle:
        s.sync.memoriaGB === null
          ? "El navegador no informa RAM (iOS/Safari) — se infiere por núcleos + heap"
          : ramDebil
            ? "deviceMemory < 2 GB — señal débil (condena a BAJO, §4.4)"
            : ramOk
              ? "deviceMemory ≥ 4 GB — requisito de gama ALTO (§4.4)"
              : "deviceMemory 2-4 GB — sin condena, sin requisito ALTO",
    });

    const nucOk = (s.sync.nucleos ?? 0) >= 6;
    const nucDebil = s.sync.nucleos !== null && s.sync.nucleos <= 2;
    evidencia.push({
      clave: "nucleos",
      etiqueta: "Núcleos de CPU",
      valor: fmtN(s.sync.nucleos, "núcleos"),
      veredicto: nucDebil ? "debil" : nucOk ? "favorable" : "inconcluso",
      detalle:
        s.sync.nucleos === null
          ? "hardwareConcurrency no disponible"
          : nucDebil
            ? "≤ 2 núcleos — señal débil (condena a BAJO, §4.4)"
            : nucOk
              ? "≥ 6 núcleos — requisito de gama ALTO (§4.4)"
              : "3-5 núcleos — sin condena, sin requisito ALTO",
    });

    const redOk = s.sync.redTipo === "4g" || s.sync.redWifi === true;
    const saveDataDebil = s.sync.saveData === true;
    evidencia.push({
      clave: "red",
      etiqueta: "Red",
      valor:
        s.sync.redTipo ?? s.sync.redDownlinkMbps !== null
          ? `${s.sync.redTipo ?? "—"}${s.sync.redDownlinkMbps !== null ? ` · ${s.sync.redDownlinkMbps} Mbps` : ""}`
          : null,
      veredicto: saveDataDebil ? "debil" : redOk ? "favorable" : "inconcluso",
      detalle: saveDataDebil
        ? "saveData activo — señal débil (condena a BAJO, §4.4)"
        : redOk
          ? "4g/wifi — requisito de gama ALTO (§4.4)"
          : "Sin dato de red o tipo intermedio — no bloquea el ALTO en este panel (se refleja en la confianza)",
    });

    const bateriaDebil =
      s.async.bateriaNivel !== null &&
      s.async.bateriaNivel < 0.2 &&
      s.async.bateriaCargando === false;
    evidencia.push({
      clave: "bateria",
      etiqueta: "Batería",
      valor: fmtPct(s.async.bateriaNivel),
      veredicto: bateriaDebil ? "debil" : s.async.bateriaNivel !== null ? "favorable" : "inconcluso",
      detalle: bateriaDebil
        ? "< 20 % sin cargar — señal débil (condena a BAJO, §4.4)"
        : s.async.bateriaNivel === null
          ? "No informada (iOS/Safari/PC de escritorio) — no condena"
          : "Carga suficiente — sin condena",
    });

    const storageDebil = s.async.storageLibreMB !== null && s.async.storageLibreMB < 500;
    evidencia.push({
      clave: "storage",
      etiqueta: "Almacenamiento libre",
      valor: fmtMB(s.async.storageLibreMB),
      veredicto: storageDebil ? "debil" : s.async.storageLibreMB !== null ? "favorable" : "inconcluso",
      detalle: storageDebil
        ? "< 500 MB libres — señal débil (condena a BAJO, §4.4)"
        : s.async.storageLibreMB === null
          ? "Sin quota informada — no condena"
          : "Espacio suficiente — sin condena",
    });

    const heapOk = (s.sync.heapLimiteMB ?? 0) >= 2048;
    evidencia.push({
      clave: "heap",
      etiqueta: "Límite de heap JS",
      valor: fmtMB(s.sync.heapLimiteMB),
      veredicto: heapOk ? "favorable" : s.sync.heapLimiteMB === null ? "inconcluso" : "inconcluso",
      detalle:
        s.sync.heapLimiteMB === null
          ? "performance.memory no existe (fuera de Chromium) — se usa para INFERIR en iOS"
          : heapOk
            ? "≥ 2048 MB — permite inferir RAM holgada (ruta iOS)"
            : "< 2048 MB — heap modesto",
    });

    // ── evidencia ADICIONAL (no decisiva v1) ──
    evidencia.push({
      clave: "gpu",
      etiqueta: "GPU",
      valor: s.gpu.renderer,
      veredicto: s.gpu.disponible ? "favorable" : "inconcluso",
      detalle: s.gpu.disponible
        ? `WebGL${s.gpu.webgl2 ? "2" : "1"}${s.gpu.webgpu ? " + WebGPU" : ""} — textura máx ${s.gpu.maxTexturaLado ?? "?"} px (relevante para ONNX/canvas)`
        : "Sin contexto WebGL — raster por software probable",
    });

    evidencia.push({
      clave: "wasm",
      etiqueta: "Runtime WASM",
      valor: s.runtime.wasmSimd ? "SIMD ✓" : s.runtime.wasmBasico ? "básico" : "no disponible",
      veredicto: s.runtime.wasmSimd ? "favorable" : s.runtime.wasmBasico ? "inconcluso" : "debil",
      detalle: s.runtime.wasmHilos
        ? "SIMD + hilos (SAB/COOP-COEP) — los workers OCR/QR pueden aprovecharlo"
        : s.runtime.wasmSimd
          ? "SIMD disponible — hilos WASM inactivos sin COOP/COEP (activables en Cloudflare Pages)"
          : "Sin WASM SIMD — el OCR/QR corre más lento de lo posible",
    });

    evidencia.push({
      clave: "forma",
      etiqueta: "Factor de forma",
      valor: s.forma,
      veredicto: "inconcluso",
      detalle:
        s.forma === "celular"
          ? "Pantalla chica + touch — la UI debe priorizar objetivos táctiles y presupuestos pequeños"
          : s.forma === "tablet"
            ? "Pantalla media + touch"
            : s.forma === "escritorio"
              ? "Pantalla grande — puede aprovechar paneles densos"
              : "No determinado",
    });

    if (benchmark.ejecutado && benchmark.score !== null) {
      evidencia.push({
        clave: "benchmark",
        etiqueta: "Benchmark medido",
        valor: `${benchmark.score}/1000`,
        veredicto:
          benchmark.score >= 750 ? "favorable" : benchmark.score >= 350 ? "inconcluso" : "debil",
        detalle: `${benchmark.nota} — CPU ${benchmark.cpuOpsMs ?? "?"} ops/ms · memoria ${benchmark.memMBs ?? "?"} MB/s · raster ${benchmark.rasterMs ?? "?"} ms (${benchmark.duracionMs ?? "?"} ms total)`,
      });
    }

    // ── decisión §4.4 (PARIDAD EXACTA — mismo orden de cortocircuito) ──
    let tier: Tier;
    let tierInferido = false;
    if (s.sync.memoriaGB !== null && s.sync.memoriaGB < 2) tier = "BAJO";
    else if (s.sync.nucleos !== null && s.sync.nucleos <= 2) tier = "BAJO";
    else if (s.sync.saveData === true) tier = "BAJO";
    else if (bateriaDebil) tier = "BAJO";
    else if (storageDebil) tier = "BAJO";
    else if (s.sync.memoriaGB !== null) {
      // saveData===true ya cortó a BAJO más arriba (§4.4) — TS lo estrecha aquí.
      if (s.sync.memoriaGB >= 4 && nucOk && redOk) tier = "ALTO";
      else tier = "MEDIO";
    } else if (nucOk && heapOk) {
      tier = "ALTO";
      tierInferido = true;
    } else {
      tier = "MEDIO";
      tierInferido = true;
    }

    // ── confianza: proporción de señales decisivas PRESENTES ──
    const presentes = evidencia.filter(
      (e) => (CLAVES_DECISIVAS as readonly string[]).includes(e.clave) && e.valor !== null,
    ).length;
    const confianzaPct = Math.round((presentes / CLAVES_DECISIVAS.length) * 100);

    return { tier, tierInferido, evidencia, confianzaPct };
  } catch {
    return { tier: "MEDIO", tierInferido: true, evidencia: [], confianzaPct: 0 };
  }
}

export function confianzaDe(pct: number): Confianza {
  if (pct >= 83) return "alta";
  if (pct >= 50) return "media";
  return "baja";
}

/** Tono semántico del tier (colores del kit §2.1). */
export function tonoTier(tier: Tier): "success" | "warning" | "danger" | "neutral" {
  switch (tier) {
    case "ALTO":
      return "success";
    case "MEDIO":
      return "warning";
    case "BAJO":
      return "danger";
    default:
      return "neutral";
  }
}
