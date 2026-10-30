/**
 * R8 — HARNESS DE CARACTERIZACIÓN de masiva/ (red previa al refactor —
 * misión R8 punto 1, orden git test→refactor obligatorio).
 *
 * SEAMS (todo lo que toca navegador/IDB/worker/wasm fuera del paquete):
 *  · cola.ts (IndexedDB)      → Map en memoria con la MISMA semántica de
 *                               throws (leerRegistro/Raw lanzan si falta).
 *  · historico.ts (IDB)       → array en memoria + índice por payload con el
 *                               MISMO ciclo de vida (cache + hook + reset).
 *  · get-bridge.ts            → puente falso (escanearActa/reconocerTexto/
 *                               horaEnvio) con fixtures controlables.
 *  · store/store-e14          → REAL (zustand corre headless; su publicación
 *                               es fire-and-forget con catch — sin red en el
 *                               camino del desenlace).
 *  · identidad-qr.ts          → decodificarQrDeCapture/esperarDesenlaceQr
 *                               controlables (zxing-wasm/worker no corren
 *                               headless); qrCorto copiado byte a byte
 *                               (qr-zxing.ts:79-81 — formateador de trazas).
 *  · capa0-qr.client          → null (kill path de siempre: cae a main).
 *  · precalor.ts              → no-ops (canvas/worker).
 *  · runner-thumbs.ts         → dataURL fijo (canvas).
 *  · sondeo-qr.client         → fixture controlable por nombre de archivo.
 *  · image-utils.ts           → canvas/img falsos con un REGISTRO DE PÍXELES
 *                               por nombre de archivo (9×8 RGBA) — el dhash
 *                               REAL de dedup.ts corre sobre esos píxeles.
 *  · gama.ts                  → plan fijo determinista (el real depende del
 *                               host: nucleos/memoria — en el probe del sandbox
 *                               dio BAJO con dhashIngesta omitido; el fixture
 *                               fuerza ALTO-equivalente para que las PUERTAS
 *                               de dedup corran igual en cualquier máquina).
 *
 * LO QUE NO SE SIMULA: la lógica de dedup (dedup.ts REAL — dhash/hamming/
 * sha256 reales sobre los píxeles/bytes del fixture), la cadena de marcas
 * (store REAL), el runner completo (procesarUno REAL), prescan (REAL), el
 * mutex, el watchdog (runner-watchdog REAL), relectura/identidad/rescate/
 * tope (REALES y puros).
 */
import { mock } from "bun:test";

// ─── controles mutables por test ────────────────────────────────────────────
export const CONTROL = {
  /** escanearActa: fixture | throw | colgado. null = PUENTE_SIN_FIXTURE. */
  escanearActa: null as null | ((opciones: unknown) => Promise<unknown> | unknown),
  /** reconocerTexto (relectura interna). */
  reconocerTexto: null as null | ((acta: unknown) => Promise<string> | string),
  /** payload que devuelve decodificarQrDeCapture (null = sin lectura). */
  qrDecode: null as null | string,
  /** desenlace de esperarDesenlaceQr (capa-0 APLAZADA). */
  desenlaceQr: null as null | "reutiliza" | "techo",
  /** sondeo QR por nombre de archivo (ingesta). */
  sondeo: new Map<string, { payload: string | null; tier: string | null; ms: number } | null>(),
  llamadasPuente: [] as string[],
  llamadasHoraEnvio: 0,
};

export function reiniciarControl(): void {
  CONTROL.escanearActa = null;
  CONTROL.reconocerTexto = null;
  CONTROL.qrDecode = null;
  CONTROL.desenlaceQr = null;
  CONTROL.sondeo.clear();
  CONTROL.llamadasPuente = [];
  CONTROL.llamadasHoraEnvio = 0;
}

// ─── IDB falsa: cola ────────────────────────────────────────────────────────
export const REGISTROS = new Map<string, Record<string, unknown>>();
let secuenciaCola = 0;

mock.module("@/modules/digitalizador/lib/e14/masiva/cola", () => ({
  agregarLote: async (
    archivos: File[],
    paginasPdf: Set<File>,
    hashes: (string | null)[],
  ): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < archivos.length; i += 1) {
      const id = `masiva-test-${(secuenciaCola += 1)}`;
      REGISTROS.set(id, {
        id,
        nombre: archivos[i]!.name,
        agregadaEn: Date.now() + i,
        estado: "PENDIENTE",
        archivo: archivos[i],
        ...(hashes[i] ? { hashBytes: hashes[i] } : {}),
        ...(paginasPdf.has(archivos[i]!) ? { viaPdf: true } : {}),
      });
      ids.push(id);
    }
    return ids;
  },
  guardarRegistro: async (registro: Record<string, unknown>): Promise<void> => {
    REGISTROS.set(registro.id as string, structuredClone(registro));
  },
  leerRegistroRaw: async (id: string): Promise<Record<string, unknown>> => {
    const registro = REGISTROS.get(id);
    if (!registro) throw new Error("REGISTRO_FUERA_DE_LA_COLA");
    return structuredClone(registro);
  },
  leerRegistro: async (id: string): Promise<Record<string, unknown>> => {
    const registro = REGISTROS.get(id);
    if (!registro) throw new Error("REGISTRO_FUERA_DE_LA_COLA");
    return structuredClone(registro);
  },
  listarMapeados: async <T>(mapper: (r: Record<string, unknown>) => T | null): Promise<T[]> => {
    const salida: T[] = [];
    for (const registro of [...REGISTROS.values()]) {
      const mapeado = mapper(structuredClone(registro));
      if (mapeado !== null) salida.push(mapeado);
    }
    return salida;
  },
  contarRegistros: async (): Promise<number> => REGISTROS.size,
  borrar: async (id: string): Promise<void> => {
    REGISTROS.delete(id);
  },
  vaciar: async (): Promise<void> => {
    REGISTROS.clear();
  },
  recuperarCola: async (): Promise<void> => {
    for (const registro of REGISTROS.values()) {
      if (registro.estado === "PROCESANDO") registro.estado = "PENDIENTE";
    }
  },
}));

// ─── IDB falsa: ledger del histórico ────────────────────────────────────────
export const LEDGER: Record<string, unknown>[] = [];
const indicePayloadMem = new Map<string, Record<string, unknown>>();
let indicePayloadListo = false;

mock.module("@/modules/digitalizador/lib/e14/masiva/historico", () => ({
  registrarEntradaHistorico: async (e: Record<string, unknown>): Promise<void> => {
    const i = LEDGER.findIndex((x) => x.id === e.id);
    if (i >= 0) LEDGER[i] = { ...e };
    else LEDGER.push({ ...e });
    if (indicePayloadListo && e.payloadQr) {
      indicePayloadMem.set(e.payloadQr as string, LEDGER[i >= 0 ? i : LEDGER.length - 1]!);
    }
  },
  listarHistorico: async (): Promise<Record<string, unknown>[]> =>
    LEDGER.map((e) => ({ ...e })),
  borrarHistorico: async (): Promise<void> => {
    LEDGER.length = 0;
    indicePayloadMem.clear();
    indicePayloadListo = false;
  },
  indiceEnviadasPorPayload: async (
    incluirPersistido = true,
  ): Promise<Map<string, Record<string, unknown>>> => {
    if (indicePayloadListo) return indicePayloadMem;
    const mapa = new Map<string, Record<string, unknown>>();
    if (incluirPersistido) {
      for (const e of LEDGER) {
        if (e.payloadQr != null && e.payloadQr !== "") mapa.set(e.payloadQr as string, e);
      }
    }
    indicePayloadMem.clear();
    for (const [k, v] of mapa) indicePayloadMem.set(k, v);
    indicePayloadListo = true;
    return indicePayloadMem;
  },
  actualizarIndicePayload: (e: Record<string, unknown>): void => {
    if (indicePayloadListo && e.payloadQr) {
      indicePayloadMem.set(e.payloadQr as string, e);
    }
  },
  resetearIndicePayload: (): void => {
    indicePayloadMem.clear();
    indicePayloadListo = false;
  },
  __resetIndicePayloadParaTest: (): void => {
    indicePayloadMem.clear();
    indicePayloadListo = false;
  },
}));

export function reiniciarLedger(): void {
  LEDGER.length = 0;
  indicePayloadMem.clear();
  indicePayloadListo = false;
}

// ─── puente falso ───────────────────────────────────────────────────────────
mock.module("@/modules/digitalizador/lib/e14/get-bridge", () => ({
  getBridge: () => ({
    escanearActa: async (opciones: unknown) => {
      CONTROL.llamadasPuente.push("escanearActa");
      const op = opciones as { onProgreso?: (p: unknown) => void } | null;
      if (op?.onProgreso) {
        try {
          op.onProgreso({ etapa: "OCR", progreso: 0.5 });
        } catch {
          /* la señal de vida jamás tumba el intento */
        }
      }
      if (!CONTROL.escanearActa) throw new Error("PUENTE_SIN_FIXTURE");
      return CONTROL.escanearActa(opciones);
    },
    reconocerTexto: async (acta: unknown) => {
      CONTROL.llamadasPuente.push("reconocerTexto");
      if (!CONTROL.reconocerTexto) throw new Error("PUENTE_SIN_FIXTURE_TEXTO");
      return CONTROL.reconocerTexto(acta);
    },
    horaEnvio: () => {
      CONTROL.llamadasHoraEnvio += 1;
      return "09:00:00";
    },
  }),
}));

// ─── image-processor (core) ─────────────────────────────────────────────────
mock.module("@jg-stevan/scanner-core/image-processor", () => ({
  fileToCaptureDataUrl: async (file: File) =>
    `data:image/jpeg;base64,${Buffer.from(file.name).toString("base64url")}`,
}));

// ─── detector-client (core — workers OpenCV) ────────────────────────────────
mock.module("@jg-stevan/scanner-core/detector-client", () => ({
  getScannerWorker: () => null,
  warmUpScannerWorker: () => {},
}));

// ─── identidad-qr (zxing/jsQR/ladder — no corren headless) ─────────────────
mock.module("@/modules/digitalizador/lib/e14/masiva/identidad-qr", () => ({
  decodificarQrDeCapture: async () => {
    CONTROL.llamadasPuente.push("decodificarQrDeCapture");
    return CONTROL.qrDecode != null ? { payload: CONTROL.qrDecode } : null;
  },
  esperarDesenlaceQr: async () => CONTROL.desenlaceQr ?? "techo",
  // Copia byte a byte de qr-zxing.ts:79-81 (formateador de trazas).
  qrCorto: (payload: string): string => `${payload.slice(0, 8)}…`,
}));

// ─── capa0-qr worker (path del worker — kill path de siempre) ───────────────
mock.module("@/modules/digitalizador/lib/e14/masiva/capa0-qr.client", () => ({
  decodificarQrCapa0Worker: async () => null,
}));

// ─── precalor (canvas/worker) ───────────────────────────────────────────────
mock.module("@/modules/digitalizador/lib/e14/masiva/precalor", () => ({
  cablearPrecalor: (): void => {},
  asegurarMaestro: async (): Promise<void> => {},
  consumirMaestro: (): null => null,
  descartarMaestro: (): void => {},
}));

// ─── thumbs (canvas) ────────────────────────────────────────────────────────
mock.module("@/modules/digitalizador/lib/e14/masiva/runner-thumbs", () => ({
  hacerThumb: async (): Promise<string> => "data:image/jpeg;base64,THUMB-FIXTURE",
}));

// ─── sondeo QR precoz (worker e73) ──────────────────────────────────────────
mock.module("@/modules/digitalizador/lib/e14/masiva/sondeo-qr.client", () => ({
  sondearQrPrecoz: async (
    file: File,
  ): Promise<{ payload: string | null; tier: string | null; ms: number } | null> =>
    CONTROL.sondeo.get(file.name) ?? null,
}));

// ─── gama — plan fijo determinista (el real depende del host) ───────────────
const { leerFlags } = await import("@/modules/digitalizador/lib/e14/flags");
mock.module("@/modules/digitalizador/lib/e14/gama", () => ({
  planGamaActual: () => ({
    tier: "ALTO",
    tierEfectivo: "ALTO",
    tierInferido: false,
    fuente: "sync",
    nucleos: 8,
    memoriaGB: 8,
    saveData: false,
    activo: true,
    amplificado: false,
    reactivo: null,
    flagsOverride: {},
    watchdogMs: 75_000,
    qrLadoLargo: 2048,
    qrRescate4096: true,
    qrPresupuestoMs: null,
    dhashIngesta: true,
    ladoMaestro: 4032,
  }),
  flagsMasivaEfectivos: () => ({
    ...leerFlags(),
    poolWorkers: 1,
    masivaAdaptativoGama: false,
  }),
  reportarPresionGama: (): void => {},
}));

// ─── image-utils — canvas/img falsos + registro de píxeles 9×8 ──────────────
export const PIXELES = new Map<string, Uint8ClampedArray>();

/** 9×8 RGBA uniforme en gris `gris` (dhash real → todos los bits 0). */
export function pixelesUniformes(gris = 128): Uint8ClampedArray {
  const data = new Uint8ClampedArray(9 * 8 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = gris;
    data[i + 1] = gris;
    data[i + 2] = gris;
    data[i + 3] = 255;
  }
  return data;
}

/** Píxeles con «picos» en la fila 0 (dhash real → hamming exacto). */
export function pixelesConPicos(posiciones: number[]): Uint8ClampedArray {
  const data = pixelesUniformes();
  for (const x of posiciones) {
    const i = x * 4; // fila 0
    data[i] = 200;
    data[i + 1] = 100;
  }
  return data;
}

function datosDe(fuente: unknown, ancho: number, alto: number): Uint8ClampedArray {
  const tag = (fuente as { __tag?: string } | null)?.__tag;
  const guardados = tag ? PIXELES.get(tag) : undefined;
  if (guardados) return guardados;
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  return data;
}

function ctxFalso() {
  let fuente: unknown = null;
  return {
    __fuente: () => fuente,
    drawImage: (src: unknown) => {
      fuente = src;
    },
    getImageData: (_x: number, _y: number, ancho: number, alto: number) => ({
      data: datosDe(fuente, ancho, alto),
      width: ancho,
      height: alto,
    }),
    fillRect: () => {},
    clearRect: () => {},
  };
}

function canvasFalso(ancho: number, alto: number) {
  const ctx = ctxFalso();
  return {
    width: ancho,
    height: alto,
    getContext: () => ctx,
    toDataURL: () => "data:image/jpeg;base64,CANVAS-FIXTURE",
    toBlob: async (cb: (b: Blob | null) => void) => {
      cb(new Blob([new Uint8Array(8)], { type: "image/jpeg" }));
    },
  };
}

function imgFalsa(bag: Blob) {
  const tag = (bag as File).name ?? "blob";
  return {
    __tag: tag,
    naturalWidth: 9,
    naturalHeight: 8,
    width: 9,
    height: 8,
  };
}

mock.module("@/modules/digitalizador/lib/e14/image-utils", () => ({
  canvasCon: (ancho: number, alto: number) => canvasFalso(ancho, alto),
  decodeImagenLruDeBlob: async (blob: Blob) => imgFalsa(blob),
  decodeImagenLru: async (url: string) => imgFalsa({ name: url } as File),
  loadImageMemo: async (url: string) => imgFalsa({ name: url } as File),
  analizarPixeles: async (fuente: string, maxDim: number) => {
    const data = datosDe({ __tag: fuente }, maxDim, maxDim);
    return { data, ancho: maxDim, alto: maxDim };
  },
  procesadaVaciaDataUrl: async () => false,
  recortarDataUrl: async () => null,
  rotateProcessedDataUrl: async () => null,
}));

// createImageBitmap global (dhash.ts bitmapNormalizado lo prefiere si existe;
// en bun no existe → el fixture lo define para que el dhash REAL corra).
type FuenteBitmapFalsa = { __tag: string; width: number; height: number; close(): void };
(globalThis as Record<string, unknown>).createImageBitmap = async (
  fuente: Blob,
): Promise<FuenteBitmapFalsa> => ({
  __tag: (fuente as File).name ?? "blob",
  width: 9,
  height: 8,
  close: () => {},
});
