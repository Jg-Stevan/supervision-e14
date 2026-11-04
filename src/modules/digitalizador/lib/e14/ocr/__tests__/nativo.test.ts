/**
 * KIT e14-sidecar-instalable-v1 (D81) — contrato del sondeo nativo.
 *
 * Cubre lo que la tarjeta «ACELERADOR NATIVO» necesita y lo que el lote
 * necesita que NO se rompa:
 *  · la memoria del sondeo (SALUD_TTL_MS) — un sidecar apagado no le cobra un
 *    timeout a cada acta;
 *  · `invalidarSondaNativo()` — sin él, el botón REINTENTAR releería un
 *    `ok:false` con hasta 15 s de vida y la tarjeta no se movería;
 *  · los campos crudos de `/salud` (motor/pid/version/sesiones) llegan a la UI;
 *  · EL PUERTO: el default de `native/servidor.py` y el de la flag son DOS
 *    archivos distintos que tienen que coincidir. Un exe que escucha en 8765 y
 *    una app que pregunta en 8766 es un fallo 100 % silencioso — la tarjeta
 *    diría «ausente» para siempre. Se fija aquí, no por lectura humana.
 *
 * Sin `window`: `leerOverridesFlagsRaw` envuelve el localStorage en try/catch,
 * así que en el proceso de bun las flags quedan en sus DEFAULTS — que es
 * exactamente el estado que un visitante descarga y ejecuta.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  invalidarSondaNativo,
  ladoNativoDisponible,
  saludNativo,
  urlLadoNativo,
} from "../nativo";

const SALUD = {
  ok: true,
  version: "e14-ocr-nativo-v1",
  motor: "v5",
  pid: 4242,
  sesiones: 2,
};

let llamadas: string[] = [];
let respuesta: (() => Promise<Response>) | null = null;

const fetchFalso = (entrada: RequestInfo | URL) => {
  llamadas.push(String(entrada));
  return respuesta
    ? respuesta()
    : Promise.resolve(
        new Response(JSON.stringify(SALUD), {
          headers: { "content-type": "application/json" },
        }),
      );
};

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  llamadas = [];
  respuesta = null;
  invalidarSondaNativo();
  globalThis.fetch = fetchFalso as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  invalidarSondaNativo();
});

describe("nativo — sondeo de salud", () => {
  test("urlLadoNativo() trae la flag y sin slash final", () => {
    const url = urlLadoNativo();
    expect(url).toBe("http://127.0.0.1:8765");
  });

  test("el default de la flag coincide con el --puerto default del sidecar", async () => {
    const fuente = await Bun.file(
      `${import.meta.dir}/../../../../../../../native/servidor.py`,
    ).text();
    const m = /--puerto",\s*type=int,\s*default=(\d+)/.exec(fuente);
    expect(m).not.toBeNull();
    expect(urlLadoNativo()).toBe(`http://127.0.0.1:${m![1]}`);
  });

  test("/salud bueno → true y los campos crudos quedan disponibles", async () => {
    expect(await ladoNativoDisponible()).toBe(true);
    const s = saludNativo();
    expect(s?.motor).toBe("v5");
    expect(s?.pid).toBe(4242);
    expect(s?.sesiones).toBe(2);
    expect(s?.version).toBe("e14-ocr-nativo-v1");
    expect(s?.ok).toBe(true);
  });

  test("el veredicto se memoriza: dos llamadas, un fetch", async () => {
    await ladoNativoDisponible();
    await ladoNativoDisponible();
    expect(llamadas.length).toBe(1);
  });

  test("invalidarSondaNativo() corta la memoria (el botón REINTENTAR)", async () => {
    await ladoNativoDisponible();
    invalidarSondaNativo();
    expect(saludNativo()).toBeNull();
    await ladoNativoDisponible();
    expect(llamadas.length).toBe(2);
  });

  test("sidecar muerto → false, memorizado como negativo y sin lanzar", async () => {
    respuesta = () => Promise.reject(new Error("conn refused"));
    expect(await ladoNativoDisponible()).toBe(false);
    expect(saludNativo()?.ok).toBe(false);
    // El negativo TAMBIÉN se memoriza: sin esto, cada acta del lote pagaría
    // 1,2 s de timeout contra un puerto que no contesta.
    expect(await ladoNativoDisponible()).toBe(false);
    expect(llamadas.length).toBe(1);
  });

  test("responde basura → false (jamás un estado que mienta)", async () => {
    respuesta = () => Promise.resolve(new Response("no es json", { status: 200 }));
    expect(await ladoNativoDisponible()).toBe(false);
    expect(saludNativo()?.motor).toBeNull();
  });
});
