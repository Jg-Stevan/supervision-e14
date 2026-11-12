/**
 * Test de PARIDAD R2 — src/shared/e14/flags-schema.ts (tabla ÚNICA, §B2 #11)
 * contra las 2 whitelists manuales históricas:
 * · flags.ts:113-156 (sanearFlags — puerta flags.json) — ahora DERIVA de la
 *   tabla (se compara por import directo).
 * · obs/politica.ts:109-173 (leerOverridesFlags — puerta localStorage) —
 *   ahora DERIVA de la tabla (se compara por import directo con un
 *   localStorage falso).
 *
 * HIGIENE OLA-3 — el window falso ya NO queda instalado en globalThis:
 * se monta en beforeAll y se RESTAURA en afterAll (devuelve globalThis a
 * su estado exacto previo). Antes quedaba permanente (body de módulo) y
 * envenenaba suites posteriores del MISMO proceso bun (todos los *.test.ts
 * corren en uno): la evaluación de módulo de store-e14 lee
 * `window.navigator.onLine` (store-e14.ts:181-184) y con el window ajeno
 * incompleto { localStorage } abortaba el file entero — lo que hoy mitiga
 * el shim de caracterizacion.harness.ts:40-61 (R8). Con la restauración,
 * ese shim queda INERTE (su `if (windowFalsoGlobal)` no entra) y puede
 * retirarse al cierre de la ola.
 *
 * INVARIANTE: nada que las whitelistas históricas ACEPTABAN se rechaza
 * ahora (mismo saneo por clave, mismos clamps) — SALVO LA EXCEPCIÓN
 * EXPLÍCITA SEC-10 (INFORME-PRUEBAS-Y-AUDITORIA): `endpointReportes`
 * pasa de «cualquier string» a whitelist same-origin (null, "" o ruta
 * relativa "/..."). Es un endurecimiento de seguridad INTENCIONAL de
 * ambas puertas — las referencias verbatim de abajo reflejan el
 * contrato NUEVO (post-SEC-10), no el histórico. DELTA ADITIVO esperado
 * (la tabla es la UNIÓN): la puerta flags.json pasa a aceptar
 * `capa0QrWorker`; la puerta localStorage pasa a aceptar
 * `sondeoQrPresupuestoMs`/`sondeoQrCortocircuito`/`prescanQrCola`/
 * `qrBrujulaOrientacion` — fijado como expected-diff explícito.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  CLAVES_FLAGS_JSON_HISTORICAS,
  CLAVES_OVERRIDES_HISTORICAS,
  sanearConEsquema,
} from "@/shared/e14/flags-schema";
import { FLAGS_DEFAULT, sanearFlags } from "@/modules/digitalizador/lib/e14/flags";
import { leerOverridesFlags, CLAVE_OVERRIDES } from "@/modules/digitalizador/lib/e14/obs/politica";
import type { FlagsApp } from "@/modules/digitalizador/lib/e14/obs/tipos";

// ─── referencias verbatim (las whitelists ANTES de la unificación) ──────────

/** Referencia: flags.ts:113-156 (body original de sanearFlags). */
function refSanearFlags(o: unknown): Partial<FlagsApp> {
  if (typeof o !== "object" || o === null) return {};
  const p = o as Partial<FlagsApp>;
  const limpio: Partial<FlagsApp> = {};
  if (p.poolWorkers === 1 || p.poolWorkers === 2) limpio.poolWorkers = p.poolWorkers;
  if (typeof p.thumbsOn === "boolean") limpio.thumbsOn = p.thumbsOn;
  if (typeof p.colaPersistente === "boolean") limpio.colaPersistente = p.colaPersistente;
  if (typeof p.ocrThreadsTope === "number" && Number.isFinite(p.ocrThreadsTope)) {
    limpio.ocrThreadsTope = Math.max(1, Math.min(8, Math.round(p.ocrThreadsTope)));
  }
  if (typeof p.telemetriaSalud === "boolean") limpio.telemetriaSalud = p.telemetriaSalud;
  // SEC-10 — contrato NUEVO de endpointReportes (whitelist same-origin):
  // null / "" / ruta relativa. Un URL absoluto ya NO pasa (antes sí).
  if (p.endpointReportes === null || typeof p.endpointReportes === "string") {
    const v = p.endpointReportes;
    if (v === null || v === "" || /^\/[A-Za-z0-9\-._~\/?=&%]*$/.test(v)) {
      limpio.endpointReportes = v;
    }
  }
  if (typeof p.sondeoQrPrecoz === "boolean") limpio.sondeoQrPrecoz = p.sondeoQrPrecoz;
  if (typeof p.sondeoQrPresupuestoMs === "number" && Number.isFinite(p.sondeoQrPresupuestoMs)) {
    limpio.sondeoQrPresupuestoMs = Math.max(500, Math.min(30_000, Math.round(p.sondeoQrPresupuestoMs)));
  }
  if (typeof p.sondeoQrCortocircuito === "boolean") limpio.sondeoQrCortocircuito = p.sondeoQrCortocircuito;
  if (typeof p.hangEnCurso === "boolean") limpio.hangEnCurso = p.hangEnCurso;
  if (typeof p.prescanQrCola === "boolean") limpio.prescanQrCola = p.prescanQrCola;
  if (typeof p.qrBrujulaOrientacion === "boolean") limpio.qrBrujulaOrientacion = p.qrBrujulaOrientacion;
  if (typeof p.masivaSondeoCrudo === "boolean") limpio.masivaSondeoCrudo = p.masivaSondeoCrudo;
  if (typeof p.prescanQrPresupuestoMs === "number" && Number.isFinite(p.prescanQrPresupuestoMs)) {
    limpio.prescanQrPresupuestoMs = Math.max(1000, Math.min(30_000, Math.round(p.prescanQrPresupuestoMs)));
  }
  if (typeof p.prescanWarpLado === "number" && Number.isFinite(p.prescanWarpLado)) {
    limpio.prescanWarpLado = Math.max(256, Math.min(4032, Math.round(p.prescanWarpLado)));
  }
  if (typeof p.masivaAdaptativoGama === "boolean") limpio.masivaAdaptativoGama = p.masivaAdaptativoGama;
  if (typeof p.ocrCascada === "boolean") limpio.ocrCascada = p.ocrCascada;
  return limpio;
}

/** Referencia: politica.ts:109-173 (body original de leerOverridesFlags,
 *  sin el wrapper try/catch + localStorage — mismo saneo). */
function refLeerOverrides(o: unknown): Partial<FlagsApp> {
  const o2 = o as Partial<FlagsApp>;
  if (typeof o2 !== "object" || o2 === null) return {};
  const limpio: Partial<FlagsApp> = {};
  if (o2.poolWorkers === 1 || o2.poolWorkers === 2) limpio.poolWorkers = o2.poolWorkers;
  if (typeof o2.thumbsOn === "boolean") limpio.thumbsOn = o2.thumbsOn;
  if (typeof o2.colaPersistente === "boolean") limpio.colaPersistente = o2.colaPersistente;
  if (typeof o2.ocrThreadsTope === "number" && Number.isFinite(o2.ocrThreadsTope)) {
    limpio.ocrThreadsTope = Math.max(1, Math.min(8, Math.round(o2.ocrThreadsTope)));
  }
  if (typeof o2.telemetriaSalud === "boolean") limpio.telemetriaSalud = o2.telemetriaSalud;
  // SEC-10 — mismo endurecimiento en la puerta localStorage (ver cabecera).
  if (o2.endpointReportes === null || typeof o2.endpointReportes === "string") {
    const v = o2.endpointReportes;
    if (v === null || v === "" || /^\/[A-Za-z0-9\-._~\/?=&%]*$/.test(v)) {
      limpio.endpointReportes = v;
    }
  }
  if (typeof o2.hangEnCurso === "boolean") limpio.hangEnCurso = o2.hangEnCurso;
  if (typeof o2.masivaSondeoCrudo === "boolean") limpio.masivaSondeoCrudo = o2.masivaSondeoCrudo;
  if (typeof o2.sondeoQrPrecoz === "boolean") limpio.sondeoQrPrecoz = o2.sondeoQrPrecoz;
  if (typeof o2.prescanQrPresupuestoMs === "number" && Number.isFinite(o2.prescanQrPresupuestoMs)) {
    limpio.prescanQrPresupuestoMs = Math.max(1000, Math.min(30_000, Math.round(o2.prescanQrPresupuestoMs)));
  }
  if (typeof o2.prescanWarpLado === "number" && Number.isFinite(o2.prescanWarpLado)) {
    limpio.prescanWarpLado = Math.max(256, Math.min(4032, Math.round(o2.prescanWarpLado)));
  }
  if (typeof o2.masivaAdaptativoGama === "boolean") limpio.masivaAdaptativoGama = o2.masivaAdaptativoGama;
  if (typeof o2.capa0QrWorker === "boolean") limpio.capa0QrWorker = o2.capa0QrWorker;
  if (typeof o2.ocrCascada === "boolean") limpio.ocrCascada = o2.ocrCascada;
  return limpio;
}

// ─── window + localStorage falsos (para la puerta real de politica.ts) ──────

// SOLO durante este archivo: se instala en beforeAll y se restaura en
// afterAll. NUNCA en el body de módulo — ahí el global quedaba permanente
// y envenenaba suites posteriores del mismo proceso (ver cabecera).
const windowDescriptorOriginal = Object.getOwnPropertyDescriptor(globalThis, "window");

beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: localStorageFalso },
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  // Restauración EXACTA: si había window previo, vuelve tal cual (mismo
  // descriptor); si no lo había (bun puro — el caso actual), se elimina.
  if (windowDescriptorOriginal) {
    Object.defineProperty(globalThis, "window", windowDescriptorOriginal);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
});

const memoria = new Map<string, string>();
const localStorageFalso = {
  getItem: (k: string): string | null => (memoria.has(k) ? (memoria.get(k) as string) : null),
  setItem: (k: string, v: string): void => void memoria.set(k, v),
  removeItem: (k: string): void => void memoria.delete(k),
  clear: (): void => void memoria.clear(),
};

function escribirOverrides(json: string): void {
  memoria.set(CLAVE_OVERRIDES, json);
}

// ─── tablas de saneo por clave ───────────────────────────────────────────────

const MATRIZ_CLAVES: Array<[string, unknown[], unknown]> = [
  // [clave, valores VÁLIDOS que ambas puertas históricas aceptan, valor inválido]
  ["poolWorkers", [1, 2], 3],
  ["thumbsOn", [true, false], "si"],
  ["colaPersistente", [true, false], 1],
  ["ocrThreadsTope", [1, 4, 8], 0], // 0 → clamp a 1 en ambas (válida pero clampeada)
  ["telemetriaSalud", [true, false], null],
  ["endpointReportes", [null, "", "/api/reportes/informes"], "https://x/y"], // SEC-10: URL absoluta → RECHAZADA
  ["sondeoQrPrecoz", [true, false], "on"],
  ["sondeoQrPresupuestoMs", [500, 2500, 30_000], 100],
  ["sondeoQrCortocircuito", [true, false], 0],
  ["hangEnCurso", [true, false], "no"],
  ["prescanQrCola", [true, false], null],
  ["qrBrujulaOrientacion", [true, false], 1],
  ["masivaSondeoCrudo", [true, false], "x"],
  ["prescanQrPresupuestoMs", [1000, 4000, 30_000], 999],
  ["prescanWarpLado", [256, 1920, 4032], 100],
  ["masivaAdaptativoGama", [true, false], null],
  ["capa0QrWorker", [true, false], "sí"],
  ["ocrCascada", [true, false], "auto"],
];

describe("paridad sanearFlags (flags.ts) — tabla única vs whitelist histórica", () => {
  test("idéntica para todo el abanico de entradas (válidas, inválidas, clamps, no-objeto, desconocidas)", () => {
    const entradas: unknown[] = [
      {},
      null,
      42,
      "string",
      [],
      { claveDesconocida: true, otra: 5 },
      { poolWorkers: 2, thumbsOn: false, ocrThreadsTope: 99 }, // clamp 99→8
      { ocrThreadsTope: -3 }, // clamp → 1
      { endpointReportes: null },
      { endpointReportes: "" },
      { endpointReportes: "https://exfiltracion.ejemplo/r" }, // SEC-10 → rechazada en AMBAS puertas
      { endpointReportes: "/api/reportes" }, // SEC-10 → aceptada (ruta same-origin)
      { sondeoQrPresupuestoMs: 100 }, // clamp → 500
      { sondeoQrPresupuestoMs: 99_999 }, // clamp → 30_000
      { prescanWarpLado: 10_000 }, // clamp → 4032
      { poolWorkers: "2" }, // string → rechazada
      JSON.parse('{"poolWorkers":1,"hangEnCurso":false,"ocrCascada":false}'),
      JSON.parse('{"sondeoQrPresupuestoMs":2500,"prescanWarpLado":1920}'),
    ];
    for (const entrada of entradas) {
      // Paridad sobre las claves históricas de ESTA puerta (la unión añade
      // capa0QrWorker — expected-diff aparte).
      const nueva = sanearFlags(entrada);
      const referencia = refSanearFlags(entrada);
      for (const clave of CLAVES_FLAGS_JSON_HISTORICAS) {
        expect(`[${JSON.stringify(entrada)}] ${clave}`).toEqual(
          `[${JSON.stringify(entrada)}] ${clave}`,
        );
        expect((nueva as Record<string, unknown>)[clave]).toEqual(
          (referencia as Record<string, unknown>)[clave],
        );
      }
    }
  });

  test("EXPECTED-DIFF aditivo: flags.json ahora alcanza capa0QrWorker (antes solo localStorage)", () => {
    expect(sanearFlags({ capa0QrWorker: false })).toEqual({ capa0QrWorker: false });
    expect(refSanearFlags({ capa0QrWorker: false })).toEqual({}); // la histórica la ignoraba
    // El delta es SOLO aditivo: jamás rechaza lo que antes aceptaba.
    for (const clave of CLAVES_FLAGS_JSON_HISTORICAS) {
      expect(CLAVES_FLAGS_JSON_HISTORICAS.includes(clave)).toBe(true);
    }
  });
});

describe("paridad leerOverridesFlags (politica.ts) — tabla única vs whitelist histórica", () => {
  test("idéntica para todo el abanico de entradas vía e14-flags-overrides real", () => {
    const crudos = [
      "{}",
      '{"poolWorkers":2,"colaPersistente":false}', // MODO PRUEBAS e64p
      '{"ocrThreadsTope":99,"prescanWarpLado":1920}',
      '{"endpointReportes":null,"telemetriaSalud":false}',
      '{"ocrCascada":false,"masivaAdaptativoGama":false}',
      '{"capa0QrWorker":true,"masivaSondeoCrudo":false}',
      '{"claveDesconocida":1}',
      "no-json",
      "5",
      "null",
    ];
    for (const crudo of crudos) {
      escribirOverrides(crudo);
      const nueva = leerOverridesFlags();
      let referencia: Partial<FlagsApp> = {};
      let crudoParseado: unknown = null;
      let noObjeto = false;
      try {
        crudoParseado = JSON.parse(crudo);
      } catch {
        noObjeto = true; // JSON corrupto → {} silencioso (wrapper try/catch)
      }
      if (!noObjeto) referencia = refLeerOverrides(crudoParseado);
      for (const clave of CLAVES_OVERRIDES_HISTORICAS) {
        expect((nueva as Record<string, unknown>)[clave]).toEqual(
          (referencia as Record<string, unknown>)[clave],
        );
      }
    }
  });

  test("EXPECTED-DIFF aditivo: localStorage ahora alcanza las 4 claves que solo flags.json tenía", () => {
    const deltas = ["sondeoQrPresupuestoMs", "sondeoQrCortocircuito", "prescanQrCola", "qrBrujulaOrientacion"];
    escribirOverrides(JSON.stringify({ sondeoQrPresupuestoMs: 2500, sondeoQrCortocircuito: false, prescanQrCola: false, qrBrujulaOrientacion: false }));
    const nueva = leerOverridesFlags() as Record<string, unknown>;
    expect(nueva.sondeoQrPresupuestoMs).toBe(2500);
    expect(nueva.sondeoQrCortocircuito).toBe(false);
    expect(nueva.prescanQrCola).toBe(false);
    expect(nueva.qrBrujulaOrientacion).toBe(false);
    const referencia = refLeerOverrides(JSON.parse('{"sondeoQrPresupuestoMs":2500,"sondeoQrCortocircuito":false,"prescanQrCola":false,"qrBrujulaOrientacion":false}')) as Record<string, unknown>;
    for (const clave of deltas) {
      expect(referencia[clave]).toBeUndefined(); // la histórica las ignoraba
      expect(nueva[clave]).toBeDefined();
    }
  });
});

describe("invariante nuevo de la tabla única: las 2 puertas aceptan/rechazan IGUAL por clave", () => {
  test("sanearConEsquema ≡ sanearFlags ≡ leerOverridesFlags en TODAS las claves de la unión", () => {
    for (const [clave, validos, invalido] of MATRIZ_CLAVES) {
      for (const valor of [...validos, invalido, undefined]) {
        const entrada = { [clave]: valor };
        const esperado = (sanearConEsquema(entrada) as Record<string, unknown>)[clave];
        expect((sanearFlags(entrada) as Record<string, unknown>)[clave]).toEqual(esperado);
        escribirOverrides(JSON.stringify(entrada));
        const viaPuerta = (leerOverridesFlags() as Record<string, unknown>)[clave];
        if (valor === undefined) {
          // JSON.stringify omite la clave undefined → ausente en la puerta.
          expect(viaPuerta).toBeUndefined();
        } else {
          expect(viaPuerta).toEqual(esperado);
        }
      }
    }
  });
});

describe("D98-sup (C-2) — default del kill-switch loteDemoLocal", () => {
  test("FLAGS_DEFAULT.loteDemoLocal === true: el botón DEMO ×4 es PÚBLICO; false lo esconde", () => {
    // El default TRUE es la esencia de D98-sup: el lote demo (fixtures
    // sintéticas — SEC-10: jamás actas reales) es público y el flag es el
    // único candado junto al aviso permanente role="status". Cambiar el
    // default a false vuelve al estado dev-only que el plan de cierre
    // corrige (hallazgo D-31/G-2).
    expect(FLAGS_DEFAULT.loteDemoLocal).toBe(true);
    // El kill-switch sigue operando igual en AMBAS puertas (tabla única):
    // false pasa el saneo y esconde el botón.
    expect(sanearFlags({ loteDemoLocal: false })).toEqual({ loteDemoLocal: false });
    expect(sanearConEsquema({ loteDemoLocal: false })).toEqual({ loteDemoLocal: false });
  });
});
