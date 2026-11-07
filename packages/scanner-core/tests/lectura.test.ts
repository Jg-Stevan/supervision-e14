/**
 * Tests unitarios — FASE C del plan post-v2.3 (medición §6.7).
 *
 * Cubre el contrato del colector que la app persiste en `PerfActa.lectura`:
 *  · resumen por acta: motor aceptante, un intento por etapa con su gate y
 *    ms por motor SIN dobles conteos (la cascada re-emite la etapa aceptante
 *    y, al cerrar sin AUTO, un evento agregado — ni uno ni otro son pasadas).
 *  · integración con la cascada REAL (mocks de motor): el `onEvento` que el
 *    bridge cablea produce exactamente ese resumen.
 *  · colección vacía honesta (no hay lectura ⇒ null, no hay que inventar).
 */
import { describe, expect, test } from "bun:test";
import { colectorLectura, type EventoLectura } from "../src/obs-base/eventos-lectura";
import {
  correrCascadaOcr,
  type DepsOcrCascada,
  type EventoCascada,
  type PasadaCascada,
} from "../src/orquestacion/cascada";

const TEXTO_AUTO = [
  "TARJETA ELECTORAL E-14",
  "REGISTRADURIA NACIONAL",
  "PAÍS: 88 CONSULADO: 1",
  "ZONA: 01 PUESTO: 0002",
  "MESA: 001",
  "KIT: 399",
].join("\n");
const TEXTO_DEBIL = "MANCHA ILEGIBLE";

function pasada(texto: string, conf = 0.9, cap: number | "roi" = 1280): PasadaCascada {
  return { texto, conf, cap, motor: "rapidocr" };
}

function evento(paso: EventoLectura["paso"], motor: string, ms: number, aceptada: boolean): EventoLectura {
  return { paso, motor, validacion: "MANUAL", aceptada, ms };
}

describe("colectorLectura · resumen por acta (§6.7 C2)", () => {
  test("vacío → sin motor aceptante, sin intentos, sin ms (honesto)", () => {
    expect(colectorLectura().resumen()).toEqual({
      motorAceptante: null,
      intentos: [],
      msPorMotor: {},
    });
  });

  test("cierre sin AUTO: el evento agregado NO suma ms ni cuenta como intento", () => {
    const c = colectorLectura();
    c.sink(evento("1280", "rapidocr", 800, false));
    c.sink(evento("1920", "rapidocr", 1400, false));
    c.sink(evento("roi", "rapidocr", 300, false));
    // Eco agregado de la cascada (suma de la corrida) — se ignora en el resumen.
    c.sink(evento("roi", "rapidocr", 2500, true));
    const r = c.resumen();
    expect(r.motorAceptante).toBe("rapidocr");
    expect(r.intentos.map((e) => e.paso)).toEqual(["1280", "1920", "roi"]);
    expect(r.msPorMotor).toEqual({ rapidocr: 2500 });
  });

  test("dos motores: ms separados por motor y el aceptante es el del rescate", () => {
    const c = colectorLectura();
    c.sink(evento("1280", "rapidocr", 700, false));
    c.sink(evento("1920", "rapidocr", 1200, false));
    c.sink(evento("rescate-motor", "tesseract", 2600, false));
    c.sink(evento("rescate-motor", "tesseract", 4500, true));
    const r = c.resumen();
    expect(r.motorAceptante).toBe("tesseract");
    expect(r.intentos.map((e) => `${e.paso}:${e.motor}`)).toEqual([
      "1280:rapidocr",
      "1920:rapidocr",
      "rescate-motor:tesseract",
    ]);
    expect(r.msPorMotor).toEqual({ rapidocr: 1900, tesseract: 2600 });
  });

  test("el sink copia el evento (mutarlo después no contamina la corrida)", () => {
    const c = colectorLectura();
    const e = evento("1280", "rapidocr", 500, false);
    c.sink(e);
    e.ms = 0;
    expect(c.resumen().msPorMotor).toEqual({ rapidocr: 500 });
  });

  test("ms inválido (NaN) no envenena la suma", () => {
    const c = colectorLectura();
    c.sink(evento("1280", "rapidocr", Number.NaN, false));
    c.sink(evento("1920", "rapidocr", 900, false));
    expect(c.resumen().msPorMotor).toEqual({ rapidocr: 900 });
  });
});

/** Deps con los mocks mínimos de la cascada (mismo patrón de cascada.test.ts). */
function deps(onEvento: (e: EventoCascada) => void): DepsOcrCascada {
  return {
    intento1: async () => pasada(TEXTO_DEBIL, 0.5),
    mismoMotorIntento1: true,
    ocr1280: async () => pasada(TEXTO_DEBIL, 0.5),
    ocr1920: async () => pasada(TEXTO_DEBIL, 0.6, 1920),
    ocrRoi: async () => pasada("MESA: 001 KIT: 399", 0.8, "roi"),
    recortarRoi: async () => "data:image/jpeg;base64,roi",
    clasificarNivel: (texto) => (texto.includes("E-14") ? "AUTO" : "MANUAL"),
    presupuestoVencido: () => false,
    onEvento,
  };
}

describe("colectorLectura · integración con la cascada real", () => {
  test("AUTO directo: un solo intento, motor aceptante declarado", async () => {
    const c = colectorLectura();
    const d = deps(c.sink);
    const salida = await correrCascadaOcr("foto", {
      ...d,
      intento1: async () => pasada(TEXTO_AUTO, 0.95),
    });
    const r = c.resumen();
    expect(salida.paso).toBe("intento1");
    expect(r.motorAceptante).toBe("rapidocr");
    expect(r.intentos.map((e) => e.paso)).toEqual(["intento1"]);
    expect(r.intentos[0]?.validacion).toBe("AUTO");
  });

  test("sin AUTO: las etapas reales se registran una vez cada una", async () => {
    const c = colectorLectura();
    const salida = await correrCascadaOcr("foto", deps(c.sink));
    const r = c.resumen();
    expect(salida.rescate).toBe(true);
    expect(r.intentos.map((e) => e.paso)).toEqual(["intento1", "1920", "roi"]);
    expect(r.motorAceptante).toBe("rapidocr");
    expect(Object.keys(r.msPorMotor)).toEqual(["rapidocr"]);
  });
});
