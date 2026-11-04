/**
 * E2E LOCAL — el lado RECEPTOR del hub (`data/hub-local.ts`).
 *
 * Congela lo que el flujo celular → computador NO puede romper:
 *  · la fila del hub entra al MISMO embudo (D25 + join D22 + log de recepción)
 *    que la bandeja local, y no a un embudo paralelo;
 *  · el origen registrado es `puente-local` (el feed distingue el medio) y
 *    `esLlegadaViva` lo cuenta como llegada (destello + badge del sidebar);
 *  · la foto NO viaja como dataURL en el sondeo: se resuelve contra el origen
 *    (`/foto/<seq>`), que es lo que el visor del monitor puede cargar;
 *  · el cursor SOLO avanza en un ciclo limpio (un fallo a mitad re-intenta
 *    esas filas — publicar es idempotente por clave);
 *  · 5 fallos seguidos autodetienen el sondeo (criterio del puente del móvil).
 *
 * `window` + `localStorage` falsos SOLO durante este archivo (el mismo
 * patrón de `shared/e14/__tests__/flags-schema.test.ts`: se instalan en
 * `beforeAll` y se restauran en `afterAll` — en el body del módulo el global
 * quedaría permanente y envenenaría suites posteriores del mismo proceso).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import {
  estadoHubLocal,
  reiniciarHubLocalParaPrueba,
  sincronizarHubLocal,
} from "../hub-local";
import { esLlegadaViva, consultarRecepciones } from "../recepcion-log";
import { consultarActaRuntime } from "../actas-runtime";

const ROMA = "88_495_010_02"; // 8 mesas en el catálogo
const INEXISTENTE = "99_999_999_99";

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

/** `publicarActaMasiva` mide la foto con `new Image()` (dom). En bun no hay
 *  Image: se instala un stub que NUNCA decodifica (naturalWidth 0 → el
 *  sintético 794×1123 de siempre), así el test ejercita el embudo real sin
 *  depender de un navegador. */
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

/** La respuesta exacta del hub (`scripts/hub-local.mjs`) para una fila de celular. */
function filaHub(
  sobre: Partial<{ idEnlace: string; mesa: string; fotoUrl: string | null }> = {}
) {
  return {
    seq: 1,
    ts: 1_793_821_040_388,
    dispositivo: "cel-puesto-02",
    idEnlace: ROMA,
    mesa: "001",
    formulario: "TRANSMISION",
    paginaIndex: 1,
    paginaTotal: 2,
    impresion: {
      consulado: "88",
      pais: "380 - ITALIA",
      zona: "010",
      puesto: "02",
      mesa: "001",
      lugar: "Roma - Consulado",
      barcode: "710003993010102",
      etiquetaFormulario: "TRANSMISIÓN",
    },
    nombreArchivo: "acta-roma-1.jpg",
    score: 91.4,
    statusActa: "OPTIMA",
    fotoUrl: "/foto/1",
    ...sobre,
  };
}

function fetchComo(cuerpo: unknown): (u: string) => Promise<Response> {
  return async () =>
    ({ ok: true, json: async () => cuerpo }) as unknown as Response;
}

function fetchFallo(motivo: string): (u: string) => Promise<Response> {
  return async () => {
    throw new Error(motivo);
  };
}

/** El log va MÁS NUEVAS PRIMERO (`unshift`): las de este test son las
 *  primeras `length - antes`, no las últimas. */
function nuevasDesde(n: number) {
  const todas = consultarRecepciones();
  return todas.slice(0, Math.max(0, todas.length - n));
}

beforeEach(() => {
  reiniciarHubLocalParaPrueba();
  almacenFalso.clear();
});

describe("hub-local — el puente del celular usa el embudo de siempre", () => {
  test("fila válida del hub → PUBLICADA con origen puente-local y foto por URL", async () => {
    const antes = consultarRecepciones().length;
    const r = await sincronizarHubLocal(
      fetchComo({ ok: true, ahora: 500, total: 1, actas: [filaHub()] })
    );

    expect(r).toEqual({ publicas: 1, bloqueadas: 0, error: null });
    const [entrada] = nuevasDesde(antes);
    expect(entrada.origen).toBe("puente-local");
    expect(entrada.estado).toBe("PUBLICADA");
    expect(entrada.idEnlace).toBe(ROMA);
    expect(entrada.mesa).toBe("001");
    expect(entrada.paginaTotal).toBe(2);
    // La foto se resuelve contra el origen del panel — no es un dataURL.
    expect(entrada.srcFoto).toBe("https://192.168.1.8:8443/foto/1");
    // El embudo real: la página quedó alcanzable para el visor del monitor.
    expect(consultarActaRuntime(ROMA, "001")).not.toBeNull();
  });

  test("fila sin foto → entra igual (el sintético D18), srcFoto null", async () => {
    const antes = consultarRecepciones().length;
    await sincronizarHubLocal(
      fetchComo({ ok: true, ahora: 500, total: 1, actas: [filaHub({ fotoUrl: null })] })
    );
    expect(nuevasDesde(antes)[0].srcFoto).toBeNull();
  });

  test("cuarentena D25 en el celular → BLOQUEADA en Recepción y nada en el monitor", async () => {
    const antes = consultarRecepciones().length;
    const r = await sincronizarHubLocal(
      fetchComo({
        ok: true,
        ahora: 500,
        total: 1,
        actas: [filaHub({ idEnlace: INEXISTENTE })],
      })
    );

    expect(r).toEqual({ publicas: 0, bloqueadas: 1, error: null });
    const [entrada] = nuevasDesde(antes);
    expect(entrada.estado).toBe("BLOQUEADA");
    expect(entrada.origen).toBe("puente-local");
    expect(entrada.motivo).toContain("(a)");
    expect(consultarActaRuntime(INEXISTENTE, "001")).toBeNull();
  });

  test("el cursor avanza solo en ciclo limpio y el sondeo pide desde él", async () => {
    await sincronizarHubLocal(fetchComo({ ok: true, ahora: 900, total: 1, actas: [] }));
    expect(almacenFalso.get("e14-hub-curso")).toBe("900");

    let pedido = "";
    const sinOk = async (u: string): Promise<Response> => {
      pedido = u;
      // Respuesta corrupta (sin `ok`) → el ciclo FALLA y el cursor NO se mueve:
      // la próxima pasada re-intenta esa ventana (publicar es idempotente).
      return { ok: true, json: async () => ({ total: 0, actas: [] }) } as unknown as Response;
    };
    await sincronizarHubLocal(sinOk);
    expect(pedido).toContain("desde=900");
    expect(almacenFalso.get("e14-hub-curso")).toBe("900");
    expect(estadoHubLocal().ultimoError).toBe("respuesta sin ok");
  });

  test("5 fallos seguidos autodetienen el sondeo (criterio del puente del móvil)", async () => {
    for (let i = 0; i < 5; i++) {
      await sincronizarHubLocal(fetchFallo(`fallo ${i}`));
    }
    const estado = estadoHubLocal();
    expect(estado.detenido).toBe(true);
    expect(estado.ultimoError).toBe("fallo 4");
    expect(estado.procesadas).toBe(0);
  });

  test("un ciclo en curso no se solapa (el botón doble no duplica filas)", async () => {
    let liberar: () => void = () => {};
    const barrido = new Promise<void>((r) => (liberar = r));
    const lenta = async (): Promise<Response> => {
      await barrido;
      return {
        ok: true,
        json: async () => ({ ok: true, ahora: 1, total: 1, actas: [filaHub({ mesa: "002" })] }),
      } as unknown as Response;
    };

    const primera = sincronizarHubLocal(lenta);
    const segunda = await sincronizarHubLocal(
      fetchComo({ ok: true, ahora: 1, total: 0, actas: [] })
    );
    expect(segunda).toEqual({ publicas: 0, bloqueadas: 0, error: null });
    liberar();
    await primera;
    expect(estadoHubLocal().procesadas).toBe(1);
  });
});

describe("esLlegadaViva — el criterio del feed y del badge", () => {
  test("carga-masiva y puente-local son llegadas; la semilla no", () => {
    expect(esLlegadaViva("carga-masiva")).toBe(true);
    expect(esLlegadaViva("puente-local")).toBe(true);
    expect(esLlegadaViva("ingesta-inicial")).toBe(false);
  });
});
