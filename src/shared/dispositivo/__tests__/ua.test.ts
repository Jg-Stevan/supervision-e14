/**
 * Test de PARIDAD R2 — src/shared/dispositivo/ua.ts contra las 3 variantes
 * del §B2 #2 (obs/dispositivo.ts · perfil-dispositivo/lib/senales.ts ·
 * gama.ts señalesSync). Las variantes se comparan como COPIAS DE REFERENCIA
 * incrustadas y, donde el símbolo es exportado, por import directo del
 * módulo original (permitido SOLO en tests de paridad durante la migración).
 *
 * Diferencias actuales DOCUMENTADAS (no se corrigen aquí — la adopción en
 * los módulos es pendiente y la elegiría el dueño junto con §B5 (7)):
 * · osDeUA(CrOS): senales/shared → "ChromeOS" · dispositivo.ts → "Linux".
 *   Canónica = la MÁS COMPLETA (senales) — decisión de la misión R2.
 * · nucleos: senales → null honesto · dispositivo.ts/gama → 1 por defecto
 *   (condena BAJO vía nucleos ≤ 2 — interacciona con tier.ts §B3 #1).
 */
import { describe, expect, test } from "bun:test";

import {
  bateriaDe,
  heapLimitMB,
  memoriaGBDe,
  memoriaMBDe,
  navegadorDeUA,
  nucleosDe,
  nucleosDeConDefecto,
  osDeUA,
  redActual,
  redDe,
} from "@/shared/dispositivo/ua";
// Variantes ORIGINALES exportadas (paridad por import directo):
import { osDeUA as osDeUASenales, navegadorDeUA as navegadorDeUASenales } from "@/modules/perfil-dispositivo/lib/senales";

// ─── referencias verbatim (COPIAS de los originales — NO tocar) ─────────────

/** Referencia: obs/dispositivo.ts:109-116 (osDeUA SIN CrOS). */
function refOsDeUADispositivo(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "desconocido";
}

/** Referencia: obs/dispositivo.ts:29-33 (nucleosDel — default 1). */
function refNucleosDel(n: Navigator): number {
  return typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0
    ? n.hardwareConcurrency
    : 1;
}

/** Referencia: gama.ts:322-325 (expresión inline de señalesSync — default 1). */
function refNucleosGama(n: Navigator & { hardwareConcurrency?: number }): number {
  return typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0
    ? n.hardwareConcurrency
    : 1;
}

// ─── paridad osDeUA ──────────────────────────────────────────────────────────

describe("paridad osDeUA — 3 variantes", () => {
  const UAS: Array<[string, string]> = [
    ["Mozilla/5.0 (Linux; Android 13; SM-A235M) AppleWebKit/537.36 Chrome/120 Mobile", "Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile", "iOS"],
    ["Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15", "iOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120", "Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/16.5 Safari", "macOS"],
    // ChromeOS: UA CrOS contiene "Linux" — AQUÍ DIFIEREN las variantes.
    ["Mozilla/5.0 (X11; CrOS x86_64 15633.69.0) AppleWebKit/537.36 Chrome/120", "ChromeOS"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120", "Linux"],
    ["raro/navegador", "desconocido"],
  ];
  test("shared ≡ senales.ts (canónica = la MÁS COMPLETA) para toda la tabla", () => {
    for (const [ua, esperado] of UAS) {
      expect(osDeUA(ua)).toBe(esperado);
      expect(osDeUA(ua)).toBe(osDeUASenales(ua));
    }
  });
  test("EXPECTED-DIFF vs dispositivo.ts: SOLO el UA CrOS diverge (ChromeOS vs Linux)", () => {
    for (const [ua] of UAS) {
      const compartida = osDeUA(ua);
      const legacy = refOsDeUADispositivo(ua);
      if (/CrOS/i.test(ua)) {
        expect(compartida).toBe("ChromeOS");
        // La variante legacy NO distingue CrOS: cae a "Linux" si el UA trae
        // la subcadena (algunos CrOS la traen) o a "desconocido" si no — en
        // ambos casos la divergencia es la misma: JAMÁS dice "ChromeOS".
        expect(legacy).not.toBe("ChromeOS");
        expect(compartida).not.toBe(legacy); // divergencia CONOCIDA (§B3 #2)
      } else {
        expect(compartida).toBe(legacy);
      }
    }
  });
});

describe("paridad navegadorDeUA (solo existe en senales.ts)", () => {
  const UAS: Array<[string, string]> = [
    ["Mozilla/5.0 (Windows) Edg/120.0.0.0", "Edge"],
    ["Mozilla/5.0 OPR/105.0.0.0", "Opera"],
    ["Mozilla/5.0 SamsungBrowser/24.0", "Samsung Internet"],
    ["Mozilla/5.0 Firefox/121.0", "Firefox"],
    ["Mozilla/5.0 Chrome/120.0.0.0", "Chrome"],
    ["Mozilla/5.0 Version/16.5 Safari/605.1.15", "Safari"],
    ["desconocido/1.0", "desconocido"],
  ];
  test("shared ≡ senales.ts; Edge/Opera/Samsung ganan a Chrome (orden importa)", () => {
    for (const [ua, esperado] of UAS) {
      expect(navegadorDeUA(ua)).toBe(esperado);
      expect(navegadorDeUA(ua)).toBe(navegadorDeUASenales(ua));
    }
  });
});

// ─── paridad nucleos (delta null-honest vs default 1) ────────────────────────

describe("nucleos — las 2 semánticas documentadas del §B2 #2", () => {
  test("sin hardwareConcurrency: shared null-honest ≡ senales · default-1 ≡ dispositivo/gama", () => {
    const sinDato = {} as Navigator;
    expect(nucleosDe(sinDato)).toBe(null); // variante null-honest (senales:105-108)
    expect(nucleosDeConDefecto(sinDato)).toBe(1); // variante default (dispositivo:29-33)
    expect(refNucleosDel(sinDato)).toBe(1);
    expect(refNucleosGama(sinDato)).toBe(1);
  });
  test("con hardwareConcurrency válido: TODAS las variantes coinciden", () => {
    const conDato = { hardwareConcurrency: 8 } as Navigator;
    expect(nucleosDe(conDato)).toBe(8);
    expect(nucleosDeConDefecto(conDato)).toBe(8);
    expect(refNucleosDel(conDato)).toBe(8);
    expect(refNucleosGama(conDato)).toBe(8);
  });
  test("hardwareConcurrency 0/negativo → null honesto / 1 (defecto)", () => {
    const raro = { hardwareConcurrency: 0 } as unknown as Navigator;
    expect(nucleosDe(raro)).toBe(null);
    expect(nucleosDeConDefecto(raro)).toBe(1);
  });
});

// ─── paridad lecturas null-honest (dispositivo.ts) ───────────────────────────

describe("lecturas null-honest del navigator (referencias incrustadas)", () => {
  test("memoriaGBDe: deviceMemory ausente → null · presente → número", () => {
    // Referencia: dispositivo.ts:35-38.
    const refMemoriaGBDe = (n: Navigator): number | null => {
      const m = (n as Navigator & { deviceMemory?: number }).deviceMemory;
      return typeof m === "number" ? m : null;
    };
    const vacio = {} as Navigator;
    const conDato = { deviceMemory: 8 } as Navigator;
    expect(memoriaGBDe(vacio)).toBe(null);
    expect(memoriaGBDe(vacio)).toBe(refMemoriaGBDe(vacio));
    expect(memoriaGBDe(conDato)).toBe(8);
    expect(memoriaGBDe(conDato)).toBe(refMemoriaGBDe(conDato));
  });

  test("heapLimitMB/memoriaMBDe: tipo honesto (null o número — sin inventar)", () => {
    // Referencia: dispositivo.ts:40-51 (misma forma de guard).
    const limite = heapLimitMB();
    const usados = memoriaMBDe();
    expect(limite === null || typeof limite === "number").toBe(true);
    expect(usados === null || typeof usados === "number").toBe(true);
  });

  test("bateriaDe: sin getBattery → {null,null} (iOS/Safari) · con getBattery → lectura", async () => {
    // Referencia: dispositivo.ts:53-64.
    const refBateria = async (
      n: Navigator,
    ): Promise<{ nivel: number | null; cargando: boolean | null }> => {
      try {
        const nav = n as Navigator & {
          getBattery?: () => Promise<{ level: number; charging: boolean }>;
        };
        if (typeof nav.getBattery !== "function") return { nivel: null, cargando: null };
        const b = await nav.getBattery();
        return { nivel: b.level, cargando: b.charging };
      } catch {
        return { nivel: null, cargando: null };
      }
    };
    const sinBateria = {} as Navigator;
    const vacio = { nivel: null, cargando: null };
    expect(await bateriaDe(sinBateria)).toEqual(vacio);
    expect(await bateriaDe(sinBateria)).toEqual(await refBateria(sinBateria));
    const falsa = { getBattery: async () => ({ level: 0.55, charging: false }) } as unknown as Navigator;
    expect(await bateriaDe(falsa)).toEqual({ nivel: 0.55, cargando: false });
    expect(await bateriaDe(falsa)).toEqual(await refBateria(falsa));
    const explota = {
      getBattery: async () => {
        throw new Error("denegado");
      },
    } as unknown as Navigator;
    expect(await bateriaDe(explota)).toEqual(vacio); // try/catch total
  });

  test("redDe: sin connection → nulls + saveData false · con connection → lectura", () => {
    // Referencia: dispositivo.ts:66-76.
    const refRed = (
      n: Navigator,
    ): { tipo: string | null; downlinkMbps: number | null; saveData: boolean; wifi: boolean } => {
      const c = (n as Navigator & {
        connection?: { effectiveType?: string; downlink?: number; saveData?: boolean; type?: string };
      }).connection;
      return {
        tipo: c?.effectiveType ?? null,
        downlinkMbps: typeof c?.downlink === "number" ? c.downlink : null,
        saveData: c?.saveData === true,
        wifi: c?.type === "wifi",
      };
    };
    const vacio = {} as Navigator;
    const conRed = {
      connection: { effectiveType: "4g", downlink: 2.3, saveData: false, type: "wifi" },
    } as Navigator;
    expect(redDe(vacio)).toEqual({ tipo: null, downlinkMbps: null, saveData: false, wifi: false });
    expect(redDe(vacio)).toEqual(refRed(vacio));
    expect(redDe(conRed)).toEqual({ tipo: "4g", downlinkMbps: 2.3, saveData: false, wifi: true });
    expect(redDe(conRed)).toEqual(refRed(conRed));
  });

  test("redActual: null honesto sin navigator.connection (bun/SSR)", () => {
    // Referencia: dispositivo.ts:84-94 — wrapper del sello de envío.
    const r = redActual();
    expect(r === null || typeof r.tipo === "string").toBe(true);
  });
});
