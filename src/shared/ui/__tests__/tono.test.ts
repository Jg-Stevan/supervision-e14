/**
 * Test de PARIDAD R2 — src/shared/ui/tono.ts contra las 3 fuentes del
 * mapa tono→token (reporte 04 §B2 #8):
 * · kpi-card.tsx:17-22 (VAR_TONO — objeto, fuente canónica)
 * · panel-perfil.tsx:85-92 (ternario — adopción pendiente, referencia aquí)
 * · supervision-shell.tsx:318-323 (ternario sin neutral — migrado en R2;
 *   el test fija que tonoTier() nunca devuelve "neutral" para los tiers
 *   reales, condición que hacía inalcanzable la diferencia).
 */
import { describe, expect, test } from "bun:test";

import { colorDeTono, VAR_TONO } from "@/shared/ui/tono";
import { tonoTier } from "@/modules/perfil-dispositivo/lib/clasificador";
import type { Tier } from "@/modules/perfil-dispositivo/domain/tipos";

/** Referencia verbatim: kpi-card.tsx:17-22. */
const REF_VAR_TONO = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  neutral: "var(--neutral-state)",
} as const;

type TonoRef = keyof typeof REF_VAR_TONO;

/** Referencia verbatim: panel-perfil.tsx:85-92 (ternario KpiPerfil). */
function refColorPerfil(tono: TonoRef): string {
  return tono === "success"
    ? "var(--success)"
    : tono === "warning"
      ? "var(--warning)"
      : tono === "danger"
        ? "var(--danger)"
        : "var(--neutral-state)";
}

describe("paridad VAR_TONO (kpi-card.tsx:17-22)", () => {
  test("mapa idéntico token a token", () => {
    expect(VAR_TONO).toEqual(REF_VAR_TONO);
  });
});

describe("paridad colorDeTono vs ternario panel-perfil.tsx:85-92", () => {
  const TONOS: TonoRef[] = ["success", "warning", "danger", "neutral"];
  test("salida idéntica para los 4 tonos", () => {
    for (const t of TONOS) {
      expect(colorDeTono(t)).toBe(refColorPerfil(t));
    }
  });
});

describe("ternario supervision-shell.tsx:318-323 (migrado) — dominio real", () => {
  /** Referencia verbatim: supervision-shell.tsx:318-323 (sin "neutral":
   *  success→success, warning→warning, resto→danger). */
  function refColorShell(tono: string): string {
    return tono === "success"
      ? "var(--success)"
      : tono === "warning"
        ? "var(--warning)"
        : "var(--danger)";
  }
  test("colorDeTono(tonoTier(tier)) coincide para TODO tier real", () => {
    const TIERS: Tier[] = ["ALTO", "MEDIO", "BAJO"];
    for (const tier of TIERS) {
      const tono = tonoTier(tier);
      expect(colorDeTono(tono)).toBe(refColorShell(tono));
    }
  });
  test("invariante que hacía inalcanzable el caso 'neutral': tonoTier nunca lo devuelve para ALTO/MEDIO/BAJO", () => {
    const TIERS: Tier[] = ["ALTO", "MEDIO", "BAJO"];
    for (const tier of TIERS) {
      expect(tonoTier(tier)).not.toBe("neutral");
    }
  });
  test("delta teórico documentado: si 'neutral' existiera, shell daba danger y shared da neutral-state (diferencia INTENCIONAL)", () => {
    expect(refColorShell("neutral")).toBe("var(--danger)");
    expect(colorDeTono("neutral")).toBe("var(--neutral-state)");
  });
});
