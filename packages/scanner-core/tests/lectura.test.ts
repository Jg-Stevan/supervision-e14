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
import {
  agregarLecturas,
  colectorLectura,
  type EventoLectura,
  type ResumenLectura,
} from "../src/obs-base/eventos-lectura";
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

describe("agregarLecturas · ventana §6.7 (C3)", () => {
  const resumen = (
    motorAceptante: string | null,
    msPorMotor: Record<string, number>,
    intentos = Object.keys(msPorMotor).length,
  ): ResumenLectura => ({
    motorAceptante,
    intentos: Array.from({ length: intentos }, () => evento("1280", "rapidocr", 1, false)),
    msPorMotor,
  });

  test("vacío → agregado honesto en cero", () => {
    expect(agregarLecturas([])).toEqual({
      actas: 0,
      aceptadas: 0,
      sinAceptante: 0,
      porAceptante: {},
    });
  });

  test("ms/acta aceptada = ms totales de la acta (todos los motores) / actas", () => {
    const a = agregarLecturas([
      resumen("tesseract", { rapidocr: 1900, tesseract: 2600 }, 3),
      resumen("tesseract", { tesseract: 4000 }, 1),
    ]);
    expect(a.actas).toBe(2);
    expect(a.aceptadas).toBe(2);
    const t = a.porAceptante["tesseract"]!;
    expect(t.actas).toBe(2);
    expect(t.intentos).toBe(4);
    expect(t.msTotal).toBe(8500);
    expect(t.msPorActa).toBe(4250);
    expect(t.msPorMotor).toEqual({ rapidocr: 1900, tesseract: 6600 });
  });

  test("aceptantes distintos no se mezclan (la decisión es por motor)", () => {
    const a = agregarLecturas([
      resumen("rapidocr", { rapidocr: 2000 }),
      resumen("nativo", { nativo: 900 }),
    ]);
    expect(a.porAceptante["rapidocr"]?.msPorActa).toBe(2000);
    expect(a.porAceptante["nativo"]?.msPorActa).toBe(900);
    expect(a.porAceptante["rapidocr"]?.msPorMotor).toEqual({ rapidocr: 2000 });
  });

  test("acta sin aceptante se cuenta aparte (no inventa bucket)", () => {
    const a = agregarLecturas([resumen(null, { rapidocr: 700 }), resumen("rapidocr", { rapidocr: 1000 })]);
    expect(a.actas).toBe(2);
    expect(a.aceptadas).toBe(1);
    expect(a.sinAceptante).toBe(1);
    expect(Object.keys(a.porAceptante)).toEqual(["rapidocr"]);
    expect(a.porAceptante["rapidocr"]?.msPorActa).toBe(1000);
  });

  test("ms inválido y entradas hostiles no envenenan el agregado", () => {
    const a = agregarLecturas([
      resumen("rapidocr", { rapidocr: Number.NaN, tesseract: 500 }),
      null as unknown as ResumenLectura,
    ]);
    expect(a.actas).toBe(1);
    expect(a.porAceptante["rapidocr"]?.msTotal).toBe(500);
    expect(a.porAceptante["rapidocr"]?.msPorActa).toBe(500);
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
