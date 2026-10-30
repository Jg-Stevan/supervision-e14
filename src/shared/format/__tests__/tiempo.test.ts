/**
 * Test de PARIDAD R2 — src/shared/format/tiempo.ts contra los sitios
 * originales (reporte 04 §B2 #9). Patrón: cada función compartida se compara
 * contra una COPIA DE REFERENCIA incrustada, extraída verbatim de su sitio
 * original (archivo:línea anotado). Los sitios originales NO se editaron
 * (son archivos de otros agentes / zona protegida) — la adopción queda
 * documentada como pendiente en pr.md.
 *
 * IMPORTANTE (zonas horarias): hhmm usa horas LOCALES del runtime — la
 * comparación shared↔referencia es determinista porque ambas leen el MISMO
 * reloj local del proceso de test.
 */
import { describe, expect, test } from "bun:test";

import { fmtDuracion, fmtMs, hhmm, tiempoRelativo } from "@/shared/format/tiempo";

// ─── referencias verbatim (COPIAS de los originales — NO tocar) ─────────────

/** Referencia: supervision/components/tiempo.ts:6-14. */
function refTiempoRelativo(fecha: number, ahora = Date.now()): string {
  const minutos = Math.floor((ahora - fecha) / 60_000);
  if (minutos < 1) return "Hace instantes";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Hace ${dias} d`;
}

/** Referencia: InformeCorrida.tsx:71-78 (fmtMs). */
function refFmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} m ${Math.round(s - m * 60)} s`;
}

/** Referencia: panel-perfil.tsx:202-209 (fmtDuracion). */
function refFmtDuracion(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Referencia: InformeCorrida.tsx:82-84 (partes de fmtFechaRelativa). */
function refHhmmInforme(d: Date): string {
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Referencia: mock-repository.ts:608-611 (horaRuntime) / actas-mock.ts:361-366
 *  (horaActual) — misma expresión String().padStart en ambos sitios. */
function refHhmmMock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── paridad ─────────────────────────────────────────────────────────────────

describe("paridad tiempoRelativo (supervision/components/tiempo.ts)", () => {
  const AHORA = 1_700_000_000_000;
  const CASOS: Array<[number]> = [
    [AHORA],
    [AHORA - 30_000], // < 1 min
    [AHORA - 5 * 60_000], // minutos
    [AHORA - 59 * 60_000],
    [AHORA - 60 * 60_000], // borde → horas
    [AHORA - 5 * 3_600_000],
    [AHORA - 23 * 3_600_000],
    [AHORA - 24 * 3_600_000], // borde → días
    [AHORA - 72 * 3_600_000],
    [AHORA - 400 * 3_600_000],
  ];
  test("salida idéntica para toda la tabla de casos", () => {
    for (const [fecha] of CASOS) {
      expect(tiempoRelativo(fecha, AHORA)).toBe(refTiempoRelativo(fecha, AHORA));
    }
  });
  test("valores literales del kit", () => {
    expect(tiempoRelativo(AHORA, AHORA)).toBe("Hace instantes");
    expect(tiempoRelativo(AHORA - 9 * 60_000, AHORA)).toBe("Hace 9 min");
    expect(tiempoRelativo(AHORA - 3 * 3_600_000, AHORA)).toBe("Hace 3 h");
    expect(tiempoRelativo(AHORA - 2 * 86_400_000, AHORA)).toBe("Hace 2 d");
  });
});

describe("paridad fmtMs (InformeCorrida.tsx — adopción pendiente)", () => {
  const CASOS: Array<number | null | undefined> = [
    null,
    undefined,
    0,
    42.4,
    999.4,
    999.6,
    1000,
    1500,
    3599,
    59_999,
    60_000,
    61_400,
    125_000,
    3_725_000,
  ];
  test("salida idéntica para toda la tabla de casos", () => {
    for (const ms of CASOS) {
      expect(fmtMs(ms)).toBe(refFmtMs(ms));
    }
  });
});

describe("paridad fmtDuracion (panel-perfil.tsx — adopción pendiente)", () => {
  const CASOS: number[] = [
    0,
    30_000,
    59_999,
    60_000,
    45 * 60_000,
    59 * 60_000,
    60 * 60_000,
    47 * 3_600_000,
    48 * 3_600_000,
    72 * 3_600_000,
    100 * 3_600_000,
  ];
  test("salida idéntica para toda la tabla de casos", () => {
    for (const ms of CASOS) {
      expect(fmtDuracion(ms)).toBe(refFmtDuracion(ms));
    }
  });
});

describe("paridad hhmm (InformeCorrida + mock-repository + actas-mock)", () => {
  test("idéntica a las 2 variantes de referencia en horas crudas", () => {
    const CASOS: Array<[number, number]> = [
      [0, 0],
      [0, 5],
      [9, 7],
      [13, 45],
      [23, 59],
    ];
    for (const [h, m] of CASOS) {
      const d = new Date(2024, 4, 20, h, m);
      expect(hhmm(d)).toBe(refHhmmInforme(d));
      expect(hhmm(d)).toBe(refHhmmMock(d));
      expect(hhmm(d)).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
