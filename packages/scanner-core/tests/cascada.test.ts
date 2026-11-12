/**
 * Tests unitarios — KIT e14-ocr-cascada-v1 (K3 fase 2 — plan flujo-mantenedor
 * paso 6). Patrón: runner-watchdog.test.ts (entorno node + mocks) + el
 * patrón PURO de ocr-escalonado (la cascada recibe TODAS sus dependencias
 * inyectadas — la producción (bridge) solo las arma).
 *
 * Cubre el contrato del brief K3 fase 2:
 *  · cascada con mocks — AUTO directo (ahorra el re-OCR), core como hoy
 *    (1280→1920), rescate ROI (gana y pierde).
 *  · guard — cascadaActiva: flag OFF / SIM ⇒ false (byte-idéntico).
 *  · elegirMejor JAMÁS recibe pasadas de motores distintos: el intento 1
 *    de OTRO motor (futuro Tesseract) solo vale por el GATE.
 *  · presupuesto vencido ⇒ no se abre ninguna etapa nueva.
 *  · gate/ROI a prueba de fallos (jamás tumba — conservador).
 */
import { describe, expect, test } from "bun:test";
import {
  cascadaActiva,
  correrCascadaOcr,
  pasadaRoiCompuesta,
  ROI_FRACCIONES,
  type DepsOcrCascada,
  type PasadaCascada,
} from "../src/orquestacion/cascada";

/** Pasada de prueba — conf/comparables SOLO entre pasadas del mismo motor. */
function pasada(
  texto: string,
  conf = 0.9,
  cap: number | "roi" | "tess" = 1280,
): PasadaCascada {
  return { texto, conf, cap, msDet: 10, msRec: 20 };
}

/** Texto con las anclas del brief (cabecera-céntrica + pie). */
const TEXTO_AUTO = [
  "TARJETA ELECTORAL E-14",
  "REGISTRADURIA NACIONAL",
  "PAÍS: 88 CONSULADO: 1",
  "ZONA: 01 PUESTO: 0002",
  "MESA: 001",
  "Ver.: 1 Pag.: 1 de 2",
  "KIT: 399",
  "202610271234567",
].join("\n");
const TEXTO_DEBIL = "MANCHA ILEGIBLE"; // sin anclas, sin mesa, <150 chars → necesitaSegunda true
const TEXTO_ROI_BUENO = "MESA: 001 KIT: 399 SUMA TOTAL"; // rescate que recompone

/** Deps por defecto: intento1 = 1280 débil; core igual; ROI rescata bien. */
function depsBase(
  overrides: Partial<DepsOcrCascada> = {},
): DepsOcrCascada & {
  llamadas: { intento1: number; ocr1280: number; ocr1920: number; ocrRoi: number; recortar: number };
} {
  const llamadas = { intento1: 0, ocr1280: 0, ocr1920: 0, ocrRoi: 0, recortar: 0 };
  return {
    llamadas,
    intento1: async (foto) => {
      llamadas.intento1 += 1;
      return pasada(`${TEXTO_DEBIL}${foto ? "" : ""}`, 0.5, 1280);
    },
    mismoMotorIntento1: true,
    ocr1280: async () => {
      llamadas.ocr1280 += 1;
      return pasada(TEXTO_DEBIL, 0.5, 1280);
    },
    ocr1920: async () => {
      llamadas.ocr1920 += 1;
      return pasada(TEXTO_DEBIL, 0.6, 1920);
    },
    ocrRoi: async () => {
      llamadas.ocrRoi += 1;
      return pasada(TEXTO_ROI_BUENO, 0.8, "roi");
    },
    recortarRoi: async () => {
      llamadas.recortar += 1;
      return "data:image/jpeg;base64,roi";
    },
    clasificarNivel: (texto) => (texto.includes("E-14") && texto.includes("MESA") ? "AUTO" : "MANUAL"),
    presupuestoVencido: () => false,
    ...overrides,
  };
}

describe("ocr-cascada · cascadaActiva (guard del call-site)", () => {
  test("flag OFF ⇒ false (el bridge corre el escalonado de siempre byte a byte)", () => {
    expect(cascadaActiva(false, false)).toBe(false);
    expect(cascadaActiva(false, undefined)).toBe(false);
  });
  test("flag ON + no-SIM ⇒ true; SIM NUNCA (chips 8.2/7.0/4.3 intactos)", () => {
    expect(cascadaActiva(true, false)).toBe(true);
    expect(cascadaActiva(true, undefined)).toBe(true);
    expect(cascadaActiva(true, true)).toBe(false);
  });
});

describe("ocr-cascada · ROI_FRACCIONES (contrato del brief K3)", () => {
  test("top 0-25% y bottom 75-100% del warp", () => {
    expect(ROI_FRACCIONES.top).toEqual([0, 0.25]);
    expect(ROI_FRACCIONES.bottom).toEqual([0.75, 1]);
  });
});

describe("ocr-cascada · pasadaRoiCompuesta (solo pasadas útiles)", () => {
  test("sin ROIs útiles → null (no hay rescate)", () => {
    expect(pasadaRoiCompuesta(null, null)).toBe(null);
    expect(pasadaRoiCompuesta(pasada("   ", 0.5, "roi"), pasada("", 0.5, "roi"))).toBe(null);
  });
  test("un solo ROI útil → su texto y su conf, cap roi", () => {
    const c = pasadaRoiCompuesta(pasada("KIT: 399", 0.7, "roi"), null);
    expect(c).not.toBe(null);
    expect(c?.texto).toBe("KIT: 399");
    expect(c?.conf).toBe(0.7);
    expect(c?.cap).toBe("roi");
  });
  test("dos ROIs útiles → textos unidos con \\n y conf = media", () => {
    const c = pasadaRoiCompuesta(pasada("E-14 MESA: 001", 0.6, "roi"), pasada("SUMA TOTAL", 0.8, "roi"));
    expect(c?.texto).toBe("E-14 MESA: 001\nSUMA TOTAL");
    expect(c?.conf).toBeCloseTo(0.7, 10);
  });
  test("un ROI vacío no aporta NI texto NI conf (media solo entre útiles)", () => {
    const c = pasadaRoiCompuesta(pasada("E-14", 0.4, "roi"), pasada("  \n  ", 0.99, "roi"));
    expect(c?.texto).toBe("E-14");
    expect(c?.conf).toBe(0.4);
  });
});

describe("ocr-cascada · correrCascadaOcr (cascada con mocks)", () => {
  test("AUTO directo en el intento 1 ⇒ UNA sola pasada, sin 1920 ni ROI (ahorro del re-OCR)", async () => {
    const d = depsBase();
    d.intento1 = async () => {
      d.llamadas.intento1 += 1; // el override reemplaza el stub contado — se re-cuenta aquí
      return pasada(TEXTO_AUTO, 0.9, 1280);
    };
    const s = await correrCascadaOcr("data:x", d);
    expect(s.paso).toBe("intento1");
    expect(s.elegidoCap).toBe(1280);
    expect(s.rescate).toBe(false);
    expect(s.texto).toContain("MESA: 001");
    expect(d.llamadas.intento1).toBe(1);
    expect(d.llamadas.ocr1280).toBe(0);
    expect(d.llamadas.ocr1920).toBe(0);
    expect(d.llamadas.ocrRoi).toBe(0);
    expect(d.llamadas.recortar).toBe(0);
  });

  test("sin AUTO y lectura débil ⇒ core como hoy (1920) + rescate ROI que GANA (más anclas)", async () => {
    const d = depsBase();
    const s = await correrCascadaOcr("data:x", d);
    expect(d.llamadas.intento1).toBe(1);
    expect(d.llamadas.ocr1280).toBe(0); // mismo motor ⇒ la 1.ª pasada se REUSA
    expect(d.llamadas.ocr1920).toBe(1);
    expect(d.llamadas.recortar).toBe(2); // top + bottom
    expect(d.llamadas.ocrRoi).toBe(2);
    expect(s.rescate).toBe(true);
    expect(s.paso).toBe("roi");
    expect(s.elegidoCap).toBe("roi");
    expect(s.texto).toBe(`${TEXTO_ROI_BUENO}\n${TEXTO_ROI_BUENO}`); // top + bottom unidos
    expect(s.ms1280).toBe(null);
  });

  test("rescate ROI que PIERDE ⇒ el core queda (elegirMejor mismo motor manda)", async () => {
    const d = depsBase({ ocrRoi: async () => pasada("basura", 0.1, "roi") });
    const s = await correrCascadaOcr("data:x", d);
    expect(s.rescate).toBe(true); // el rescate CORRIÓ (intento)
    expect(s.paso).toBe("roi"); // la compuesta entró a elegirMejor
    expect(s.texto).toBe(TEXTO_DEBIL); // pero el core de 1920 ganó (conf 0.6 > 0.1)
  });

  test("ROI fallidos (recorte null + ocrRoi lanza) ⇒ sin rescate, core intacto, JAMÁS tumba", async () => {
    const d = depsBase({
      recortarRoi: async () => null,
      ocrRoi: async () => {
        throw new Error("roi roto");
      },
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(s.rescate).toBe(false);
    expect(s.paso).toBe("1920"); // escalonado completo de siempre
    expect(s.elegidoCap).toBe(1920);
    expect(s.texto).toBe(TEXTO_DEBIL);
  });

  test("GO-B (intento 1 de OTRO motor): su texto JAMÁS entra a elegirMejor", async () => {
    // Tesseract simulado: cap "tess" + motor "tesseract". El gate NO le da
    // AUTO → el core abre su PROPIA 1.ª pasada y TODO lo que entra a
    // elegirMejor es RapidOCR (1280/1920/roi) — jamás la pasada Tess.
    let vioTess = false;
    const elegirEspia = async (deps: DepsOcrCascada, foto: string) => {
      const s = await correrCascadaOcr(foto, deps);
      if (s.elegidoCap === "tess") vioTess = true;
      return s;
    };
    const d = depsBase({
      intento1: async () => ({ ...pasada("TESSERACT DEBIL", 0.95, "tess"), motor: "tesseract" }),
      mismoMotorIntento1: false,
    });
    const s = await elegirEspia(d, "data:x");
    expect(vioTess).toBe(false);
    expect(d.llamadas.ocr1280).toBe(1); // core abre su 1.ª pasada propia
    expect(s.elegidoCap).not.toBe("tess");
    expect(s.ms1280).not.toBe(null);
  });

  test("GO-B: Tesseract con gate AUTO ⇒ listo SIN core (el gate decide entre motores)", async () => {
    const d = depsBase({
      intento1: async () => ({ ...pasada(`${TEXTO_AUTO} (tess)`, 0.7, "tess"), motor: "tesseract" }),
      mismoMotorIntento1: false,
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(s.paso).toBe("intento1");
    expect(s.elegidoCap).toBe("tess"); // el texto del intento 1 viaja POR EL GATE
    expect(s.motorIntento1).toBe("tesseract");
    expect(d.llamadas.ocr1280).toBe(0);
    expect(d.llamadas.ocr1920).toBe(0);
    expect(d.llamadas.ocrRoi).toBe(0);
  });

  test("GO-B CAÍDA HONESTA: Tess vencido ⇒ intento1 RapidOCR (motor declarado) ⇒ SE REUSA (no se paga dos veces)", async () => {
    const d = depsBase({ mismoMotorIntento1: false });
    d.intento1 = async () => {
      d.llamadas.intento1 += 1;
      return { ...pasada(TEXTO_DEBIL, 0.5, 1280), motor: "rapidocr" }; // fallback del bridge
    };
    const s = await correrCascadaOcr("data:x", d);
    expect(d.llamadas.intento1).toBe(1);
    expect(d.llamadas.ocr1280).toBe(0); // REUSADA — el core no repite la 1.ª pasada
    expect(s.motorIntento1).toBe("rapidocr");
    expect(s.ms1280).toBe(null);
  });

  test("GO-B: retro-compat — pasada sin motor + mismoMotorIntento1 true ⇒ reuso histórico intacto", async () => {
    const d = depsBase(); // intento1 sin campo motor (pasadas históricas)
    const s = await correrCascadaOcr("data:x", d);
    expect(d.llamadas.ocr1280).toBe(0); // la 1.ª pasada YA pagada se reusa
    expect(s.motorIntento1).toBe("rapidocr");
  });

  test("presupuesto vencido ⇒ ni 1920 ni ROI (el timeout EXISTENTE manda — §3)", async () => {
    const d = depsBase({ presupuestoVencido: () => true });
    const s = await correrCascadaOcr("data:x", d);
    expect(d.llamadas.ocr1920).toBe(0);
    expect(d.llamadas.recortar).toBe(0);
    expect(s.paso).toBe("1280"); // la 1.ª pasada (reusada) es lo que hay
    expect(s.rescate).toBe(false);
  });

  test("gate que LANZA ⇒ tratado MANUAL (conservador — sigue como hoy)", async () => {
    const d = depsBase({
      clasificarNivel: () => {
        throw new Error("divipol caída");
      },
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(s.paso).toBe("roi"); // la cascada siguió completa sin morir
    expect(s.texto).toBe(`${TEXTO_ROI_BUENO}\n${TEXTO_ROI_BUENO}`);
  });

  test("lectura FUERTE pero sin AUTO ⇒ SIN rescate (el ROI no arregla clasificación)", async () => {
    // TEXTO_AUTO-like pero el gate lo niega: necesitaSegunda=false (FUERTE)
    // ⇒ el rescate no corre (falla la ruta, no la lectura).
    const d = depsBase({
      clasificarNivel: () => "MANUAL",
      intento1: async () => pasada(TEXTO_AUTO, 0.9, 1280),
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(d.llamadas.ocr1920).toBe(0); // necesitaSegunda false (FUERTE)
    expect(d.llamadas.recortar).toBe(0); // sin rescate
    expect(s.rescate).toBe(false);
    expect(s.paso).toBe("1280");
  });

  test("rescateMotor AUSENTE ⇒ cascada de siempre byte a byte (ninguna etapa nueva)", async () => {
    const d = depsBase();
    const s = await correrCascadaOcr("data:x", d);
    expect(s.msMotor).toBeNull();
    expect(s.paso).toBe("roi");
  });

  test("KIT e14-velocidad-5s-v1: el otro motor SOLO corre si el core cerró SIN AUTO, y SALVA", async () => {
    let motor = 0;
    const d = depsBase({
      rescateMotor: async () => {
        motor += 1;
        return pasada(TEXTO_AUTO, 0.85, "tess");
      },
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(motor).toBe(1);
    expect(s.paso).toBe("rescate-motor");
    expect(s.elegidoCap).toBe("tess");
    expect(s.msMotor).toBeTypeOf("number");
  });

  test("rescateMotor que NO llega a AUTO ⇒ manda el core (entre motores jamás decide elegirMejor)", async () => {
    const d = depsBase({
      rescateMotor: async () => pasada("BASURA DEL OTRO MOTOR", 0.99, "tess"),
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(s.paso).toBe("roi");
    expect(s.elegidoCap).not.toBe("tess");
    expect(s.msMotor).toBeTypeOf("number"); // corrió y se midió honesto
  });

  test("rescateMotor con AUTO en el intento 1 ⇒ JAMÁS se paga (el caso fácil no lo espera)", async () => {
    let motor = 0;
    const d = depsBase({
      intento1: async () => pasada(TEXTO_AUTO, 0.9, 1280),
      rescateMotor: async () => {
        motor += 1;
        return pasada(TEXTO_AUTO, 0.9, "tess");
      },
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(motor).toBe(0);
    expect(s.paso).toBe("intento1");
    expect(s.msMotor).toBeNull();
  });

  test("rescateMotor con presupuesto vencido ⇒ no se abre (mismo §3 que 1920 y ROI)", async () => {
    let motor = 0;
    const d = depsBase({
      presupuestoVencido: () => true,
      rescateMotor: async () => {
        motor += 1;
        return pasada(TEXTO_AUTO, 0.9, "tess");
      },
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(motor).toBe(0);
    expect(s.msMotor).toBeNull();
  });

  test("rescateMotor que LANZA ⇒ se descarta (jamás tumba el acta)", async () => {
    const d = depsBase({
      rescateMotor: async () => {
        throw new Error("tesseract no disponible");
      },
    });
    const s = await correrCascadaOcr("data:x", d);
    expect(s.paso).toBe("roi");
    expect(s.msMotor).toBeTypeOf("number");
  });
});

/*
 * source-scan: los dos describes que leían src/lib/e14/scanner-core-bridge.ts
 * (call-site condicional + rechazo temprano) se quedan en el repo digielect14 —
 * validan el CABLEADO de la app, no la cascada del paquete. El paquete prueba
 * COMPORTAMIENTO (arriba); la app prueba su alambre (tests propios).
 */
