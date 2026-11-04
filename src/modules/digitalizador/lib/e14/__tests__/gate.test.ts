/**
 * R7a — TESTS DE CARACTERIZACIÓN del desenlace (gate) de scanner-core-bridge.
 *
 * FIJAN el comportamiento observable ANTES de que pipeline()/pipelineRecorte()
 * deleguen en lib/e14/gate.ts (M3 de docs/revision-v1/03a-digitalizador-
 * nucleo.md). Orden de commits garantizado por git log: test(r7a) ANTES de
 * refactor(r7a) — estos tests corrieron VERDES contra el bridge ORIGINAL
 * (commit 54f8163) y deben seguir verdes byte a byte tras el refactor.
 *
 * TRES SEAMS:
 *  A. ORIGINAL directo — `RealCoreBridge#evaluarGate` (privado, accedido por
 *     runtime) y `marcoPerdonadoPorLectura` (exportado — patrón D-5, QA kit
 *     e63e §4.2): los chips y la polaridad F0.2 se prueban contra el código
 *     original SIN transcripción.
 *  B. ACUERDO — la función pura `evaluarGate` de gate.ts (transcripción
 *     literal citada línea a línea en el header del módulo) debe ser
 *     IGUAL entrada-a-entrada a la del bridge original.
 *  C. DESENLACE — `resolverDesenlace` con valores dorados explícitos
 *     (escenario base + caps + vetos + bordes del score).
 */

import { describe, expect, test } from "bun:test";
import { RealCoreBridge, marcoPerdonadoPorLectura } from "../scanner-core-bridge";
import {
  DETALLE_BAJO,
  DETALLE_GENERICO,
  DETALLE_INCOMPLETA,
  DETALLE_INCOMPLETA_ESCANEO,
  DETALLE_ILEGIBLE,
  DETALLE_SIN_VOTOS,
  TECHO_SIN_SENAL,
  evaluarGate,
  resolverDesenlace,
  type EntradaDesenlace,
} from "../gate";
import type { ClasificacionE14 } from "../clasificador";

// ── fixtures ─────────────────────────────────────────────────────────────

/** Texto que `ocrTextIsValid` acepta (no vacío, no sentinela, sin disculpas). */
const TEXTO_VALIDO = "ACTA E-14 REGISTRADURIA DEPTO 88 MUN 335 MESA 001 KIT 399";

function clasif(nivel: ClasificacionE14["nivel"]): ClasificacionE14 {
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

/** Escenario NEUTRO que llega al evaluarGate del gate (sin vetos ni caps):
 *  completa, con votos, P1, sin fondo, sin escudo-manual, no recortada,
 *  cámara (no escaneo), sin SIM, calidad good, lectura MEDIA. */
function escenario(base: Partial<EntradaDesenlace> = {}): EntradaDesenlace {
  return {
    score: 7.0,
    levelCalidad: "good",
    nivelLectura: "MEDIA",
    senalActa: true,
    ocrTexto: TEXTO_VALIDO,
    clasificacion: clasif("AUTO"),
    intento: 1,
    maxIntentos: 4,
    scoreSimulado: null,
    completa: true,
    vetoIncompleta: false,
    escudoManual: false,
    fondo: false,
    recortada: false,
    origenEscaneo: false,
    votosSkipPag2: false,
    hayVotos: true,
    ...base,
  };
}

/** Seam A — método PRIVADO del bridge original (caracterización sin
 *  transcripción; el acceso runtime es el patrón estándar bun:test). */
const bridge = new RealCoreBridge();
const evaluarGateOriginal = (
  bridge as unknown as {
    evaluarGate: typeof evaluarGate;
  }
).evaluarGate;

// ── A. ORIGINAL: chips conocidos vía evaluarGate del bridge (54f8163) ────

describe("caracterización · evaluarGate del bridge ORIGINAL (seam A)", () => {
  // §G3: «los chips mandan: 8.2 → OPTIMA · 7.0 → ADVERTENCIA · 4.3 → RECHAZADA»
  test("chips SIM conocidos 8.2 / 7.0 / 4.3 (AUTO)", () => {
    expect(evaluarGateOriginal(8.2, TEXTO_VALIDO, clasif("AUTO"), 1, 4)).toEqual({
      status: "OPTIMA",
      rechazo: null,
      clasificacion: clasif("AUTO"),
    });
    expect(evaluarGateOriginal(7.0, TEXTO_VALIDO, clasif("AUTO"), 1, 4)).toEqual({
      status: "ADVERTENCIA",
      rechazo: null,
      clasificacion: clasif("AUTO"),
    });
    expect(evaluarGateOriginal(4.3, TEXTO_VALIDO, clasif("AUTO"), 1, 4)).toEqual({
      status: "RECHAZADA",
      rechazo: { tipo: "GENERICO", detalle: DETALLE_GENERICO },
      clasificacion: null,
    });
  });

  test("gate bloqueante: score < 6.5 rechaza; OCR inválido → ILEGIBLE", () => {
    expect(evaluarGateOriginal(4.3, "", clasif("AUTO"), 1, 4)).toEqual({
      status: "RECHAZADA",
      rechazo: { tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE },
      clasificacion: null,
    });
  });

  test("contingencia C4: al agotar intentos → EN_REVISION_HUMANA", () => {
    expect(evaluarGateOriginal(4.3, TEXTO_VALIDO, clasif("AUTO"), 4, 4).status).toBe(
      "EN_REVISION_HUMANA",
    );
    // no-AUTO ≥6.5: «repetir-primero» (§7.3) — tanto en 1er intento como agotado
    expect(evaluarGateOriginal(7.0, TEXTO_VALIDO, clasif("SUGERIDA"), 1, 4).status).toBe(
      "EN_REVISION_HUMANA",
    );
    expect(evaluarGateOriginal(7.0, TEXTO_VALIDO, clasif("SUGERIDA"), 4, 4).status).toBe(
      "EN_REVISION_HUMANA",
    );
  });

  test("bordes del score: 6.5 pasa · 6.49 rechaza · 8.0 OPTIMA", () => {
    expect(evaluarGateOriginal(6.5, TEXTO_VALIDO, clasif("AUTO"), 1, 4).status).toBe("ADVERTENCIA");
    expect(evaluarGateOriginal(6.49, TEXTO_VALIDO, clasif("AUTO"), 1, 4).status).toBe("RECHAZADA");
    expect(evaluarGateOriginal(8.0, TEXTO_VALIDO, clasif("AUTO"), 1, 4).status).toBe("OPTIMA");
  });
});

// ── A. ORIGINAL: polaridad del perdón del marco (pitfall F0.2) ───────────

describe("caracterización · marcoPerdonadoPorLectura F0.2 rev.2 (seam A)", () => {
  // P2 (tabla §3-A del kit e63d): cortado + FUERTE + secciones presentes → perdona.
  // Si la polaridad se re-invierte (bug rev.1 d671c29), este test MUERE.
  test("trío COMPLETO perdona (rev.2 — polaridad correcta)", () => {
    expect(marcoPerdonadoPorLectura("cortado", "FUERTE", false)).toBe(true);
  });
  test("sin una sola pata del trío NO perdona", () => {
    expect(marcoPerdonadoPorLectura("cortado", "FUERTE", true)).toBe(false); // falta sección
    expect(marcoPerdonadoPorLectura("cortado", "MEDIA", false)).toBe(false); // lectura media
    expect(marcoPerdonadoPorLectura("cortado", "DEBIL", false)).toBe(false); // lectura débil
    expect(marcoPerdonadoPorLectura("completo", "FUERTE", false)).toBe(false); // no cortado
    expect(marcoPerdonadoPorLectura("ceñido", "FUERTE", false)).toBe(false);
    expect(marcoPerdonadoPorLectura("no-encontrado", "FUERTE", false)).toBe(false);
  });
});

// ── B. ACUERDO: gate.ts ≡ bridge original (misma entrada → misma salida) ─

describe("caracterización · acuerdo evaluarGate(gate.ts) ≡ evaluarGate(bridge)", () => {
  test("rejilla de scores × textos × intentos × niveles — IGUALES", () => {
    const scores = [0, 4.3, 4.9, 5.9, 6.4, 6.49, 6.5, 7.0, 7.9, 8, 8.2, 10];
    const textos = [TEXTO_VALIDO, ""];
    const intentos: [number, number][] = [
      [1, 4],
      [4, 4],
    ];
    const niveles: ClasificacionE14["nivel"][] = ["AUTO", "SUGERIDA", "MANUAL"];
    for (const score of scores)
      for (const texto of textos)
        for (const [intento, maxIntentos] of intentos)
          for (const nivel of niveles) {
            expect(evaluarGate(score, texto, clasif(nivel), intento, maxIntentos)).toEqual(
              evaluarGateOriginal(score, texto, clasif(nivel), intento, maxIntentos),
            );
          }
  });
});

// ── C. DESENLACE: resolverDesenlace — valores dorados ────────────────────

describe("caracterización · resolverDesenlace — chips conocidos", () => {
  test("chip 8.2 → OPTIMA, sin rechazo, clasificación conservada", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.2 }));
    expect(d.status).toBe("OPTIMA");
    expect(d.rechazo).toBeNull();
    expect(d.clasificacion?.nivel).toBe("AUTO");
    expect(d.score).toBe(8.2);
  });
  test("chip 7.0 → ADVERTENCIA", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 7.0 }));
    expect(d.status).toBe("ADVERTENCIA");
    expect(d.rechazo).toBeNull();
    expect(d.score).toBe(7.0);
  });
  test("chip 4.3 → RECHAZADA GENERICO + clasificación null (invariante §4)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 4.3 }));
    expect(d.status).toBe("RECHAZADA");
    expect(d.rechazo).toEqual({ tipo: "GENERICO", detalle: DETALLE_GENERICO });
    expect(d.clasificacion).toBeNull();
  });
  test("chip 4.3 con OCR inválido → ILEGIBLE", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 4.3, ocrTexto: "" }));
    expect(d.rechazo).toEqual({ tipo: "ILEGIBLE", detalle: DETALLE_ILEGIBLE });
  });
});

describe("caracterización · resolverDesenlace — C3 piso/techo de lectura", () => {
  test("FUERTE + level≠poor: piso 8.5 (vence al techo fair, token aditivo)", () => {
    const d = resolverDesenlace(
      escenario({ score: 7.0, levelCalidad: "fair", nivelLectura: "FUERTE" }),
    );
    expect(d.score).toBe(8.5);
    expect(d.techosDiag).toContain("techo-fair:7.9");
    expect(d.techosDiag).toContain("piso-lectura-FUERTE:8.5");
    expect(d.status).toBe("OPTIMA"); // 8.5 ≥ 8 — el OCR manda
  });
  test("FUERTE + poor: piso BLOQUEADO (evidencia física manda)", () => {
    // NOTA de frontera: el techo poor 6.4 lo aplica scoreDeCalidad en el
    // caller — la entrada del desenlace ya llega CAPADA (el C3 solo sube/baja).
    const d = resolverDesenlace(
      escenario({ score: 6.4, levelCalidad: "poor", nivelLectura: "FUERTE" }),
    );
    expect(d.score).toBe(6.4); // el piso 8.5 NUNCA vence al techo poor
    expect(d.techosDiag).toContain("techo-poor:6.4");
    expect(d.techosDiag).not.toContain("piso-lectura-FUERTE:8.5");
    expect(d.status).toBe("RECHAZADA");
  });
  test("DEBIL: techo 5.9 — RECHAZADA honesta", () => {
    const d = resolverDesenlace(escenario({ score: 8.2, nivelLectura: "DEBIL" }));
    expect(d.score).toBe(5.9);
    expect(d.techosDiag).toContain("lectura-DEBIL:5.9");
    expect(d.status).toBe("RECHAZADA");
  });
});

describe("caracterización · resolverDesenlace — caps del sitio (cap activo)", () => {
  test("escudo-fondo D10: chip 8.2 con fondo → 7.9 ADVERTENCIA (nunca ÓPTIMA)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.2, fondo: true }));
    expect(d.score).toBe(7.9);
    expect(d.status).toBe("ADVERTENCIA");
    expect(d.techosDiag).toContain(`escudo-fondo:7.9`);
  });
  test("escudo-manual (Q2, recorte): techo 7.9 + token, sin rechazo", () => {
    const d = resolverDesenlace(
      escenario({ scoreSimulado: 8.2, completa: false, escudoManual: true }),
    );
    expect(d.score).toBe(7.9);
    expect(d.status).toBe("ADVERTENCIA");
    expect(d.techosDiag).toContain("escudo-manual:7.9");
    expect(d.techosDiag).not.toContain("incompleta:6.4"); // solo con veto real
  });
  test("recortada: techo 7.9 sobre el chip SIM (el recorte físico manda)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.2, recortada: true }));
    expect(d.score).toBe(7.9);
    expect(d.status).toBe("ADVERTENCIA");
    expect(d.techosDiag).toContain("recortada:7.9");
  });
  test("sin señal de contenido: token sin-senal:4.9 + rechazo BAJO (§D3)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.2, senalActa: false }));
    expect(d.score).toBe(8.2); // el status lo sigue decidiendo el gate — BAJO solo cambia el rechazo
    expect(d.status).toBe("OPTIMA");
    expect(d.rechazo).toEqual({ tipo: "BAJO", detalle: DETALLE_BAJO });
    expect(d.techosDiag).toContain(`sin-senal:${TECHO_SIN_SENAL}`);
  });
});

describe("caracterización · resolverDesenlace — gate bloqueante", () => {
  test("INCOMPLETA cámara: copy de cámara, cap 6.4, clasificación null", () => {
    const d = resolverDesenlace(
      escenario({ scoreSimulado: 8.2, completa: false, vetoIncompleta: true }),
    );
    expect(d.status).toBe("RECHAZADA");
    expect(d.rechazo).toEqual({ tipo: "INCOMPLETA", detalle: DETALLE_INCOMPLETA });
    expect(d.clasificacion).toBeNull();
    expect(d.score).toBe(6.4);
    expect(d.techosDiag).toContain("incompleta:6.4");
  });
  test("INCOMPLETA escaneo (e63d F3.4): copy distinto, MISMO desenlace", () => {
    const d = resolverDesenlace(
      escenario({ scoreSimulado: 8.2, completa: false, vetoIncompleta: true, origenEscaneo: true }),
    );
    expect(d.rechazo).toEqual({ tipo: "INCOMPLETA", detalle: DETALLE_INCOMPLETA_ESCANEO });
  });
  test("INCOMPLETA al agotar intentos → contingencia C4 (EN_REVISION_HUMANA)", () => {
    const d = resolverDesenlace(
      escenario({ completa: false, vetoIncompleta: true, intento: 4, maxIntentos: 4 }),
    );
    expect(d.status).toBe("EN_REVISION_HUMANA");
    expect(d.rechazo).toEqual({ tipo: "INCOMPLETA", detalle: DETALLE_INCOMPLETA });
  });
  test("SIN_VOTOS: rechazo directo + cap 6.4 (G2 — marcador obligatorio)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.2, hayVotos: false }));
    expect(d.status).toBe("RECHAZADA");
    expect(d.rechazo).toEqual({ tipo: "SIN_VOTOS", detalle: DETALLE_SIN_VOTOS });
    expect(d.marcadoresOk).toBe(false);
    expect(d.score).toBe(6.4);
    expect(d.techosDiag).toContain("sin-votos:6.4");
  });
  test("SIN_VOTOS al agotar → EN_REVISION_HUMANA con el MISMO rechazo", () => {
    const d = resolverDesenlace(escenario({ hayVotos: false, intento: 4, maxIntentos: 4 }));
    expect(d.status).toBe("EN_REVISION_HUMANA");
    expect(d.rechazo).toEqual({ tipo: "SIN_VOTOS", detalle: DETALLE_SIN_VOTOS });
  });
  test("votos skip-pag2 (página 2): sin zona de votos — no condena", () => {
    const d = resolverDesenlace(
      escenario({ scoreSimulado: 8.2, votosSkipPag2: true, hayVotos: false }),
    );
    expect(d.marcadoresOk).toBe(true);
    expect(d.status).toBe("OPTIMA");
  });
});

describe("caracterización · resolverDesenlace — polaridad F0.2 compuesta", () => {
  // La composición EXACTA de pipeline() (L1687-1695): el perdón decide
  // `completa` y el veto llega como vetoIncompleta=!completa. Si alguien
  // re-invierte la polaridad del perdón (bug rev.1 d671c29), P2 vuelve a
  // INCOMPLETA y este test muere — el dictamen NO puede cambiar.
  test("P2 (cortado+FUERTE+secciones): el perdón evita INCOMPLETA — pasa al gate", () => {
    const completa = marcoPerdonadoPorLectura("cortado", "FUERTE", false); // true (rev.2)
    const d = resolverDesenlace(
      escenario({ scoreSimulado: 7.0, completa, vetoIncompleta: !completa }),
    );
    expect(d.status).toBe("ADVERTENCIA"); // NO INCOMPLETA — dictamen rev.2
    expect(d.rechazo).toBeNull();
  });
  test("lectura débil NO perdona: cortado sigue condenando", () => {
    const completa = marcoPerdonadoPorLectura("cortado", "DEBIL", false); // false
    const d = resolverDesenlace(escenario({ completa, vetoIncompleta: !completa }));
    expect(d.status).toBe("RECHAZADA");
    expect(d.rechazo).toEqual({ tipo: "INCOMPLETA", detalle: DETALLE_INCOMPLETA });
  });
  test("mutilación real (falta sección) NO se perdona aunque la lectura sea FUERTE", () => {
    const completa = marcoPerdonadoPorLectura("cortado", "FUERTE", true); // false
    const d = resolverDesenlace(escenario({ completa, vetoIncompleta: !completa }));
    expect(d.status).toBe("RECHAZADA");
    expect(d.rechazo?.tipo).toBe("INCOMPLETA");
  });
});

describe("caracterización · resolverDesenlace — bordes del score", () => {
  test("6.5 exacto → ADVERTENCIA (≥6.5 no rechaza por calidad)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 6.5 }));
    expect(d.status).toBe("ADVERTENCIA");
    expect(d.rechazo).toBeNull();
  });
  test("6.49 → RECHAZADA por calidad (GENERICO con OCR válido)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 6.49 }));
    expect(d.status).toBe("RECHAZADA");
    expect(d.rechazo).toEqual({ tipo: "GENERICO", detalle: DETALLE_GENERICO });
  });
  test("8.0 exacto → OPTIMA (borde de statusDeScore)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.0 }));
    expect(d.status).toBe("OPTIMA");
  });
  test("8.5 piso FUERTE al filo: score base 7.9 + fair + FUERTE → 8.5 OPTIMA", () => {
    const d = resolverDesenlace(
      escenario({ score: 7.9, levelCalidad: "fair", nivelLectura: "FUERTE" }),
    );
    expect(d.score).toBe(8.5);
    expect(d.status).toBe("OPTIMA");
  });
  test("no-AUTO ≥6.5 → EN_REVISION_HUMANA (repetir-primero §7.3)", () => {
    const d = resolverDesenlace(escenario({ scoreSimulado: 8.2, clasificacion: clasif("MANUAL") }));
    expect(d.status).toBe("EN_REVISION_HUMANA");
    expect(d.rechazo).toBeNull();
    expect(d.clasificacion?.nivel).toBe("MANUAL");
  });
  test("techosDiag (acta completa): orden REAL fair → sin-senal → piso → escudo-fondo → recortada", () => {
    const d = resolverDesenlace(
      escenario({
        score: 8.2,
        levelCalidad: "fair",
        nivelLectura: "FUERTE",
        senalActa: false,
        fondo: true,
        recortada: true,
      }),
    );
    expect(d.techosDiag).toEqual([
      "techo-fair:7.9",
      `sin-senal:${TECHO_SIN_SENAL}`,
      "piso-lectura-FUERTE:8.5",
      "escudo-fondo:7.9",
      "recortada:7.9",
    ]);
  });
  test("techosDiag (veto real): techo-poor → incompleta:6.4 — sin tokens de escudo", () => {
    // completa && vetoIncompleta es INALCANZABLE en ambos pipelines (el veto
    // exige !completa) — por construcción escudo-fondo e incompleta son
    // mutuamente excluyentes: así lo fija este par de tests.
    const d = resolverDesenlace(
      escenario({ levelCalidad: "poor", completa: false, vetoIncompleta: true }),
    );
    expect(d.techosDiag).toEqual(["techo-poor:6.4", "incompleta:6.4"]);
  });
  test("puro: la misma entrada dos veces → salida idéntica (sin mutables)", () => {
    const e = escenario({ scoreSimulado: 8.2, fondo: true, recortada: true });
    expect(resolverDesenlace(e)).toEqual(resolverDesenlace(e));
    expect(e.score).toBe(7.0); // la entrada NO se muta
  });
});
