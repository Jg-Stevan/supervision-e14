/**
 * Pruebas de regresión de la OLA 0/1 del plan 2026-11-11:
 *
 *  · C-06 — drenaje del sondeo: una ráfaga de 210 filas entre dos sondeos
 *    (página de 200 con `hay: true` + página de 10) se procesa COMPLETA:
 *    ninguna fila se queda fuera por el truncado de página ni por un cursor
 *    que avanzaba «al reloj del hub».
 *  · C-16 — reconciliación de generación: si el hub se reinició
 *    (`generacion` distinta), la página traída con el cursor viejo se
 *    DESCARTA (no resucita filas del almacén borrado), el cursor vuelve a 0,
 *    el log de recepción se purga y el estado expone el aviso.
 *  · C-07 — honestidad del log de recepción: `registrarRecepcion` jamás
 *    fabrica `fechaOrigen` (la síntesis LATENCIA_CICLO_S quedó eliminada);
 *    si la entrada no trae hora de origen, la fila no la tiene y la vista
 *    muestra «ORIGEN —». La latencia media solo se calcula con pares reales.
 *
 * `window` + `localStorage` falsos con el mismo patrón de `hub-local.test.ts`
 * (instalados en `beforeAll`, restaurados en `afterAll`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import {
  estadoHubLocal,
  reiniciarHubLocalParaPrueba,
  sincronizarHubLocal,
} from "../hub-local";
import { consultarRecepciones, registrarRecepcion } from "../recepcion-log";
import { consultarActaRuntime } from "../actas-runtime";

const ROMA = "88_495_010_02";

const almacenFalso = new Map<string, string>();
const windowFalso = {
  localStorage: {
    getItem: (k: string) => almacenFalso.get(k) ?? null,
    setItem: (k: string, v: string) => void almacenFalso.set(k, String(v)),
    removeItem: (k: string) => void almacenFalso.delete(k),
  },
  location: { origin: "https://192.168.1.8:8443" },
};

const descriptorOriginal = Object.getOwnPropertyDescriptor(globalThis, "window");
const descriptorImagen = Object.getOwnPropertyDescriptor(globalThis, "Image");

class ImagenFalsa {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  set src(_valor: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    value: windowFalso,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "Image", {
    value: ImagenFalsa,
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  if (descriptorOriginal) {
    Object.defineProperty(globalThis, "window", descriptorOriginal);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
  if (descriptorImagen) {
    Object.defineProperty(globalThis, "Image", descriptorImagen);
  } else {
    delete (globalThis as { Image?: unknown }).Image;
  }
});

beforeEach(() => {
  reiniciarHubLocalParaPrueba();
  almacenFalso.clear();
});

/** Una fila del hub con seq/mesa parametrizables. */
function filaHub(seq: number, mesa: string) {
  return {
    seq,
    ts: 1_793_821_040_000 + seq,
    dispositivo: "cel-puesto-02",
    idEnlace: ROMA,
    mesa,
    formulario: "TRANSMISION",
    paginaIndex: 1,
    paginaTotal: 2,
    impresion: {
      consulado: "88",
      pais: "380 - ITALIA",
      zona: "010",
      puesto: "02",
      mesa,
      lugar: "Roma - Consulado",
      barcode: "710003993010102",
      etiquetaFormulario: "TRANSMISIÓN",
    },
    nombreArchivo: `acta-roma-${seq}.jpg`,
    score: 8.5,
    statusActa: "OPTIMA",
    fotoUrl: `/foto/${seq}`,
  };
}

describe("C-06 — drenaje del sondeo (ráfaga de 210 filas)", () => {
  test("210 filas en ráfaga → 210 procesadas y cursor en 210 (ninguna se pierde)", async () => {
    const primera = Array.from({ length: 200 }, (_, i) => filaHub(i + 1, String((i % 8) + 1).padStart(3, "0")));
    const segunda = Array.from({ length: 10 }, (_, i) => filaHub(201 + i, String((i % 8) + 1).padStart(3, "0")));
    let paginas = 0;
    const hubEnRafaga = async (u: string): Promise<Response> => {
      paginas++;
      const desde = Number(new URL(u).searchParams.get("desde") ?? "0");
      if (desde < 200) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            ahora: 1,
            total: 210,
            hay: true,
            proximoSeq: 200,
            actas: primera,
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          ahora: 1,
          total: 210,
          hay: false,
          proximoSeq: 210,
          actas: segunda,
        }),
      } as unknown as Response;
    };

    const r = await sincronizarHubLocal(hubEnRafaga);

    // El bucle de drenaje re-sondeó INMEDIATAMENTE (2 páginas, sin esperar el
    // tic de 4 s) y procesó TODO el lote.
    expect(paginas).toBe(2);
    expect(r.publicas + r.bloqueadas).toBe(210);
    expect(almacenFalso.get("e14-hub-curso")).toBe("210");
    expect(estadoHubLocal().procesadas).toBe(210);
  });

  test("la página truncada NO pierde las filas 201+ (el cursor no salta al reloj)", async () => {
    const primera = [filaHub(1, "001")];
    const segunda = [filaHub(2, "002")];
    const hub = async (u: string): Promise<Response> => {
      const desde = Number(new URL(u).searchParams.get("desde") ?? "0");
      return {
        ok: true,
        json: async () =>
          desde === 0
            ? { ok: true, ahora: 5_000, total: 2, hay: true, proximoSeq: 1, actas: primera }
            : { ok: true, ahora: 5_001, total: 2, hay: false, proximoSeq: 2, actas: segunda },
      } as unknown as Response;
    };
    // Con el bug del plan, el cursor habría quedado en `ahora` (5000) y la
    // fila seq 2 se perdía para siempre.
    const r = await sincronizarHubLocal(hub);
    expect(r.publicas + r.bloqueadas).toBe(2);
    expect(almacenFalso.get("e14-hub-curso")).toBe("2");
  });
});

describe("C-16 — reconciliación tras /hub/reset (generación)", () => {
  test("generación nueva → página vieja descartada, cursor a 0, log purgado, aviso visible", async () => {
    // 1) Ciclo limpio con generación G1: una fila publicada, cursor en 1.
    let llamadas = 0;
    const hub = async (u: string): Promise<Response> => {
      llamadas++;
      const desde = Number(new URL(u).searchParams.get("desde") ?? "0");
      if (llamadas === 1) {
        return {
          ok: true,
          json: async () => ({
            ok: true, ahora: 1, total: 1, hay: false, proximoSeq: 1,
            generacion: "G1", actas: [filaHub(1, "001")],
          }),
        } as unknown as Response;
      }
      // 2) Tras el reset del hub: el panel aún con cursor 1 pide desde=1 y
      //    recibe la página VIEJA de la generación anterior.
      if (desde >= 1 && llamadas === 2) {
        return {
          ok: true,
          json: async () => ({
            ok: true, ahora: 2, total: 0, hay: false, proximoSeq: 1,
            generacion: "G2", actas: [filaHub(1, "001")], // fila zombi del almacén borrado
          }),
        } as unknown as Response;
      }
      // 3) Re-sondeo desde 0 en la MISMA pasada: el hub nuevo está vacío.
      return {
        ok: true,
        json: async () => ({
          ok: true, ahora: 3, total: 0, hay: false, proximoSeq: 0,
          generacion: "G2", actas: [],
        }),
      } as unknown as Response;
    };

    await sincronizarHubLocal(hub);
    expect(consultarActaRuntime(ROMA, "001")).not.toBeNull(); // llegó de verdad
    expect(consultarRecepciones().length).toBeGreaterThan(0);

    const r = await sincronizarHubLocal(hub);

    // La página zombi NO se re-publicó en el log de recepción (sería
    // resucitar un acta del almacén borrado): el log queda purgado y vacío.
    expect(consultarRecepciones().length).toBe(0);
    expect(almacenFalso.get("e14-hub-curso")).toBe("0");
    expect(estadoHubLocal().aviso).toBe("El hub se reinició — recepción re-sincronizada");
    expect(estadoHubLocal().generacion).toBe("G2");
    expect(r.error).toBeNull();
  });
});

describe("C-07 — honestidad del log de recepción", () => {
  test("registrarRecepcion jamás fabrica fechaOrigen (cero síntesis)", () => {
    const conOrigen = registrarRecepcion({
      fecha: 1_793_821_040_000,
      origen: "puente-local",
      estado: "PUBLICADA",
      idEnlace: ROMA,
      mesa: "001",
      formulario: "TRANSMISION",
      paginaIndex: 1,
      paginaTotal: 2,
      srcFoto: null,
      pais: "380 - ITALIA",
      lugar: "Roma - Consulado",
      fechaOrigen: 1_793_821_038_200, // real: tsEscaneo del sobre del móvil
    });
    expect(conOrigen.fechaOrigen).toBe(1_793_821_038_200); // se respeta tal cual

    const sinOrigen = registrarRecepcion({
      fecha: 1_793_821_050_000,
      origen: "puente-local",
      estado: "PUBLICADA",
      idEnlace: ROMA,
      mesa: "002",
      formulario: "TRANSMISION",
      paginaIndex: 1,
      paginaTotal: 2,
      srcFoto: null,
      pais: "380 - ITALIA",
      lugar: "Roma - Consulado",
    });
    // Sin dato NO se inventa: la vista muestra «ORIGEN —».
    expect(sinOrigen.fechaOrigen).toBeUndefined();
  });
});
