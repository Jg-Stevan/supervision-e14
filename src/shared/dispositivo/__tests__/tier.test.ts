/**
 * Test de PARIDAD R2 — src/shared/dispositivo/tier.ts (canónica = variante
 * perfil-dispositivo) contra las DOS implementaciones originales del §B2 #1:
 * · perfil-dispositivo/lib/clasificador.ts:194-212 (por import directo —
 *   paridad EXACTA esperada en TODA la tabla).
 * · obs/dispositivo.ts:136-161 (por import directo — paridad esperada
 *   SALVO el borde `nucleos=null`, donde ya estaba DESINCRONIZADO:
 *   dispositivo condena BAJO por su default 1 (nucleosDel:29-33) y la
 *   canónica NO condena → MEDIO INFERIDO. Delta fijado como EXPECTED-DIFF
 *   con aserción explícita (no test.skip): es el riesgo documentado en
 *   §B3 #1 que la adopción de la canónica resolvería.
 * · 3er consumidor gama.ts:345-360 (tierSyncDe) consume la variante de
 *   dispositivo — cubierto indirectamente por la misma tabla.
 */
import { describe, expect, test } from "bun:test";

import { calcularTier, type EntradaTier } from "@/shared/dispositivo/tier";
import {
  calcularTier as calcularTierDispositivo,
  type EntradaTier as EntradaTierDispositivo,
} from "@/modules/digitalizador/lib/e14/obs/dispositivo";
import { clasificar } from "@/modules/perfil-dispositivo/lib/clasificador";
import type {
  BenchmarkResultado,
  CapacidadGpu,
  CapacidadesRuntime,
  FactorForma,
  RecursoSenales,
  SenalesAsync,
  SenalesSync,
} from "@/modules/perfil-dispositivo/domain/tipos";

// ─── caso §4.4 (memoriaGB, nucleos, saveData, bateriaNivel, bateriaCargando, storageLibreMB, redTipo, redWifi, heapLimitMB) ──

type Caso = {
  nombre: string;
  memoriaGB: number | null;
  nucleos: number | null;
  saveData: boolean | null;
  bateriaNivel?: number | null;
  bateriaCargando?: boolean | null;
  storageLibreMB?: number | null;
  redTipo?: string | null;
  redWifi?: boolean | null;
  heapLimitMB?: number | null;
};

const CASOS: Caso[] = [
  { nombre: "memoria débil condena", memoriaGB: 1, nucleos: 8, saveData: false },
  { nombre: "núcleos débiles condenan", memoriaGB: 8, nucleos: 2, saveData: false },
  { nombre: "saveData condena", memoriaGB: 8, nucleos: 8, saveData: true, redTipo: "4g" },
  {
    nombre: "batería <20% sin cargar condena",
    memoriaGB: 8,
    nucleos: 8,
    saveData: false,
    bateriaNivel: 0.15,
    bateriaCargando: false,
    redTipo: "4g",
  },
  {
    nombre: "batería cargando NO condena",
    memoriaGB: 8,
    nucleos: 8,
    saveData: false,
    bateriaNivel: 0.15,
    bateriaCargando: true,
    redTipo: "4g",
  },
  {
    nombre: "storage <500MB condena",
    memoriaGB: 8,
    nucleos: 8,
    saveData: false,
    storageLibreMB: 400,
    redTipo: "4g",
  },
  { nombre: "ALTO exacto del kit", memoriaGB: 8, nucleos: 8, saveData: false, redTipo: "4g" },
  { nombre: "ALTO por wifi", memoriaGB: 4, nucleos: 6, saveData: false, redWifi: true },
  { nombre: "MEMORIA 2-4GB sin requisito ALTO", memoriaGB: 3, nucleos: 8, saveData: false, redTipo: "4g" },
  {
    nombre: "MEDIO: memoria real pero núcleos medios",
    memoriaGB: 8,
    nucleos: 4,
    saveData: false,
    redTipo: "3g",
  },
  {
    nombre: "INFERIDO ALTO (iOS): 8 núcleos + heap holgado",
    memoriaGB: null,
    nucleos: 8,
    saveData: false,
    heapLimitMB: 4096,
  },
  {
    nombre: "INFERIDO MEDIO (iOS): heap modesto",
    memoriaGB: null,
    nucleos: 8,
    saveData: false,
    heapLimitMB: 1024,
  },
  // ── bordes nucleos=null — AQUÍ ESTÁ EL DELTA CONOCIDO (§B3 #1) ──
  {
    nombre: "DELTA nucleos=null + heap holgado: canónica MEDIO inferido",
    memoriaGB: null,
    nucleos: null,
    saveData: false,
    heapLimitMB: 4096,
  },
  {
    nombre: "DELTA nucleos=null sin heap: canónica MEDIO inferido",
    memoriaGB: null,
    nucleos: null,
    saveData: false,
    heapLimitMB: null,
  },
  {
    nombre: "todo null (SSR/cero señales): canónica MEDIO inferido",
    memoriaGB: null,
    nucleos: null,
    saveData: null,
    bateriaNivel: null,
    bateriaCargando: null,
    storageLibreMB: null,
    redTipo: null,
    redWifi: null,
    heapLimitMB: null,
  },
];

// ─── adaptadores hacia las 2 implementaciones originales ────────────────────

function aEntradaShared(c: Caso): EntradaTier {
  return {
    memoriaGB: c.memoriaGB,
    nucleos: c.nucleos,
    saveData: c.saveData,
    bateriaNivel: c.bateriaNivel ?? null,
    bateriaCargando: c.bateriaCargando ?? null,
    storageLibreMB: c.storageLibreMB ?? null,
    redTipo: c.redTipo ?? null,
    redWifi: c.redWifi ?? null,
    heapLimitMB: c.heapLimitMB ?? null,
  };
}

/** obs/dispositivo.ts — su EntradaTier exige `nucleos: number` y
 *  `saveData/redWifi: boolean` PORQUE sus colectores ya aplicaron los
 *  defaults (nucleosDel → 1, redDe → false). Simular EXACTAMENTE eso es lo
 *  que expone el delta del borde null. */
function aEntradaDispositivo(c: Caso): EntradaTierDispositivo {
  return {
    memoriaGB: c.memoriaGB,
    nucleos: c.nucleos ?? 1, // ← nucleosDel (dispositivo.ts:29-33)
    saveData: c.saveData === true, // ← redDe (saveData: c?.saveData === true)
    bateriaNivel: c.bateriaNivel ?? null,
    bateriaCargando: c.bateriaCargando ?? null,
    storageLibreMB: c.storageLibreMB ?? null,
    redTipo: c.redTipo ?? null,
    redWifi: c.redWifi === true, // ← redDe (wifi: c?.type === "wifi")
    heapLimitMB: c.heapLimitMB ?? null,
  };
}

const SYNC_VACIO: SenalesSync = {
  nucleos: null,
  memoriaGB: null,
  heapLimiteMB: null,
  heapUsadoMB: null,
  redTipo: null,
  redDownlinkMbps: null,
  saveData: null,
  redWifi: null,
  touchMax: null,
  pantallaW: null,
  pantallaH: null,
  dpr: null,
  ua: "",
  os: "desconocido",
  navegador: "desconocido",
  plataforma: null,
};

const ASYNC_VACIO: SenalesAsync = {
  bateriaNivel: null,
  bateriaCargando: null,
  storageTotalMB: null,
  storageUsadoMB: null,
  storageLibreMB: null,
};

const GPU_VACIA: CapacidadGpu = {
  disponible: false,
  renderer: null,
  vendedor: null,
  webgl2: false,
  webgpu: false,
  maxTexturaLado: null,
};

const RUNTIME_VACIO: CapacidadesRuntime = {
  wasmBasico: false,
  wasmSimd: false,
  wasmHilos: false,
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  offscreenCanvas: false,
  serviceWorker: false,
};

const BENCHMARK_NULO: BenchmarkResultado = {
  ejecutado: false,
  score: null,
  cpuOpsMs: null,
  memMBs: null,
  rasterMs: null,
  duracionMs: null,
  nota: "",
};

/** RecursoSenales mínimas para clasificar() — solo sync/async participan
 *  de la decisión §4.4 (gpu/runtime/forma son evidencia, no deciden v1). */
function aSenalesPerfil(c: Caso): RecursoSenales {
  const forma: FactorForma = "escritorio";
  return {
    sync: {
      ...SYNC_VACIO,
      memoriaGB: c.memoriaGB,
      nucleos: c.nucleos,
      saveData: c.saveData,
      redTipo: c.redTipo ?? null,
      redWifi: c.redWifi ?? null,
      heapLimiteMB: c.heapLimitMB ?? null,
    },
    async: {
      ...ASYNC_VACIO,
      bateriaNivel: c.bateriaNivel ?? null,
      bateriaCargando: c.bateriaCargando ?? null,
      storageLibreMB: c.storageLibreMB ?? null,
    },
    gpu: GPU_VACIA,
    runtime: RUNTIME_VACIO,
    forma,
  };
}

// ─── paridad ─────────────────────────────────────────────────────────────────

describe("paridad tier §4.4 — canónica (perfil) vs perfil clasificar()", () => {
  test("salida idéntica (tier + tierInferido) para TODA la tabla", () => {
    for (const c of CASOS) {
      const esperado = clasificar(aSenalesPerfil(c), BENCHMARK_NULO);
      const obtenido = calcularTier(aEntradaShared(c));
      // Comparación como string: el Tier de perfil incluye "PENDIENTE"
      // (estado de UI del panel — shared/dispositivo/tier.ts lo documenta);
      // el de shared es el union de los 3 tiers reales. Comparar los unions
      // tipados fricciona (TS2769) sin aportar nada: la paridad que importa
      // es de VALORES en runtime — si clasificar() devolviera "PENDIENTE" y
      // calcularTier no (o cualquier desvío), esta aserción FALLA igual.
      expect(obtenido.tier as string).toBe(esperado.tier as string);
      expect(obtenido.tierInferido).toBe(esperado.tierInferido);
    }
  });
});

describe("paridad tier §4.4 — canónica vs obs/dispositivo.ts", () => {
  test("idéntica en todo caso con nucleos INFORMADO", () => {
    for (const c of CASOS.filter((x) => x.nucleos !== null)) {
      const compartida = calcularTier(aEntradaShared(c));
      const legacy = calcularTierDispositivo(aEntradaDispositivo(c));
      expect(compartida.tier).toBe(legacy.tier);
      expect(compartida.tierInferido).toBe(legacy.tierInferido);
    }
  });

  test("EXPECTED-DIFF §B3 #1: con nucleos=null (iOS sin hardwareConcurrency) la variante dispositivo condena BAJO (default 1) y la canónica NO condena", () => {
    const deltas = CASOS.filter((x) => x.nucleos === null);
    expect(deltas.length).toBeGreaterThan(0);
    for (const c of deltas) {
      const compartida = calcularTier(aEntradaShared(c));
      const legacy = calcularTierDispositivo(aEntradaDispositivo(c));
      // Canónica (perfil §4.4): null no condena → ruta inferida.
      expect(compartida.tier).toBe("MEDIO");
      expect(compartida.tierInferido).toBe(true);
      // Legacy (dispositivo): nucleosDel default 1 → 1 ≤ 2 → BAJO sin inferir.
      expect(legacy.tier).toBe("BAJO");
      expect(legacy.tierInferido).toBe(false);
      // El delta, EXPLÍCITO: un iPhone sin hardwareConcurrency fiable se
      // clasifica distinto según qué módulo pregunte (riesgo §B3 #1).
      expect(compartida.tier).not.toBe(legacy.tier);
    }
  });
});
