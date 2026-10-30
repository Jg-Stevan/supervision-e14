/**
 * R8 — RED DE CARACTERIZACIÓN de masiva/ (misión punto 1 — ORDEN GIT
 * test→refactor obligatorio: estos tests corrieron VERDES contra el código
 * ORIGINAL (main ff61533, pre-refactor R8) y deben seguir verdes byte a byte
 * tras los sub-pasos 2-6 del refactor).
 *
 * TRES SEAMS:
 *  A. FASES de procesarUno — entrada sintética (fila + registro + puente
 *     falso) → registro/estado esperado por fase (capa-0 QR, intentos/
 *     watchdog, rescate, relectura, capa-2 identidad, dedup contenido v2,
 *     envío, persistencia, post-mortem ERROR).
 *  B. LAS 8 PUERTAS DE DEDUP — dedupExactoIngesta (×2), cadenaDedup dhash
 *     (cinta cierta / banda aplazada / ya-enviada), cadenaDedup sondeo QR,
 *     prescan (aplicarVeredictoPrescan), capa-0 payload (YA-ENVIADA +
 *     reutiliza), capa-2 identidad, dedup contenido v2, veto post-OCR H1,
 *     marcarYaEnviada (contrato del helper estándar) + rama DUPLICADA del
 *     pool (reutilizar).
 *  C. CONTRATO DE TRAZAS POST-MORTEM — los 3 SITIOS de estampado de trazas
 *     (reuso-qr re-save · desenlace registroListo · catch ERROR) producen
 *     los MISMOS campos con la MISMA regla «ausente = el instrumento no
 *     corrió» antes y después del refactor.
 *  D. ESPERA DEL DEDUP (C5) — contrato de esperarDesenlaceOriginal que el
 *     fix C5 no cambia (cuando es LLAMADA, espera hasta techo): el fix añade
 *     el APARCADO en el CALLER (original detrás en FIFO), no aquí.
 *  E. ANCLAS QA — los literales que grepean los harnesses scripts/qa-*.ts
 *     (WATCHDOG_*_MS, RELECTURA_TOPE_MS, mutex, reutilizar*, bloque capa-0,
 *     console.info relectura, iniciar/pausar/rearrancar) SIGUEN en runner.ts
 *     (como literales o como `export const ANCLA_...`).
 *
 * El harness (caracterizacion.harness.ts) documenta QUÉ se simula y QUÉ no.
 */
import { beforeEach, describe, expect, test } from "bun:test";

import "./caracterizacion.harness";
import {
  CONTROL,
  LEDGER,
  PIXELES,
  REGISTROS,
  pixelesConPicos,
  pixelesUniformes,
  reiniciarControl,
  reiniciarLedger,
} from "./caracterizacion.harness";

// ─── módulos bajo prueba (después de los mocks del harness) ────────────────
const seed = await import("../../seed");
const { ACTA_MOCK } = seed;
const dedup = await import("../dedup");
const store = await import("../store");
const runner = await import("../runner");
const runnerDedup = await import("../runner-dedup");
const prescan = await import("../prescan-qr");
const storeE14 = await import("@/modules/digitalizador/store/store-e14");
const { useMasivaStore } = store;
const { useE14Store } = storeE14;
const { procesarUno, iniciarRunner, __resetAparcadasDedupParaTest } = runner;

type Fila = {
  id: string;
  nombre: string;
  agregadaEn: number;
  estado: string;
  [k: string]: unknown;
};

// ─── fixtures ───────────────────────────────────────────────────────────────

let secuenciaId = 0;

function clasificacion(nivel: string, codigoUnico?: { crudo: string; kit: number; tipoDigito: string; ver: number; pagina: number; total: number }) {
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
    ...(codigoUnico ? { codigoUnico } : {}),
  };
}

/** Serie 1D válida (gramática codigoUnicoE14: 7100|0039|3|01|01|02). */
const SERIE = "710000393010102";
const CODIGO = { crudo: SERIE, kit: 39, tipoDigito: "3", ver: 1, pagina: 1, total: 2 };

function actaFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...structuredClone(ACTA_MOCK),
    id: `acta-test-${(secuenciaId += 1)}`,
    status: "OPTIMA",
    score: 9.5,
    rechazo: null,
    intento: 1,
    maxIntentos: 4,
    clasificacion: clasificacion("AUTO"),
    ...over,
  };
}

function fileFixture(nombre: string, bytes?: Uint8Array): File {
  const parte = (bytes ?? new Uint8Array([1, 2, 3, 4])) as unknown as BlobPart;
  return new File([parte], nombre, { type: "image/jpeg" });
}

function filaFixture(over: Partial<Fila> = {}): Fila {
  const n = (secuenciaId += 1);
  return {
    id: `fila-test-${n}`,
    nombre: `FOTO_${n}.jpg`,
    agregadaEn: n,
    estado: "PENDIENTE",
    ...over,
  };
}

/** Deja la fila VIVA en el store + su registro en la cola falsa. */
function prepararFila(fila: Fila, archivo?: File, registroOver: Record<string, unknown> = {}): void {
  useMasivaStore.setState({
    filas: [...useMasivaStore.getState().filas.filter((f) => f.id !== fila.id), fila as never],
  });
  REGISTROS.set(fila.id, {
    id: fila.id,
    nombre: fila.nombre,
    agregadaEn: fila.agregadaEn,
    estado: fila.estado,
    ...(archivo ? { archivo } : {}),
    ...registroOver,
  });
}

function registroDe(id: string): Record<string, unknown> {
  const r = REGISTROS.get(id);
  if (!r) throw new Error(`sin registro para ${id}`);
  return r;
}

function filaDe(id: string): Fila {
  const f = useMasivaStore.getState().filas.find((x) => x.id === id);
  if (!f) throw new Error(`sin fila para ${id}`);
  return f as unknown as Fila;
}

/** Poll headless (la cadena de dedup es fire-and-forget — void). */
async function esperarHasta(
  condicion: () => boolean,
  topeMs = 5_000,
  pasoMs = 25,
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    if (condicion()) return true;
    await Bun.sleep(pasoMs);
  }
  return condicion();
}

// ─── reset por test ─────────────────────────────────────────────────────────
beforeEach(async () => {
  REGISTROS.clear();
  reiniciarLedger();
  reiniciarControl();
  secuenciaId = 0;
  PIXELES.clear();
  __resetAparcadasDedupParaTest(); // C5 — sin aparcadas entre tests
  await useMasivaStore.getState().vaciar();
  useMasivaStore.setState({
    filas: [],
    corriendo: false,
    progreso: null,
    enviandoLote: false,
    filtro: "TODAS",
    origenAbierto: null,
    guardando: 0,
    colaDisponible: true,
    avisoCola: null,
  });
});

// ═════════════════════ A · FASES DE procesarUno ═════════════════════════════

describe("R8 · A — fases de procesarUno (fixtures de entrada sintética)", () => {
  test("fase envío: desenlace OPTIMA → ENVIADA automática (hash ausente, fila enviadaAuto)", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("optima.jpg"));
    CONTROL.escanearActa = async () =>
      actaFixture({ id: `acta-${fila.id}`, status: "OPTIMA", score: 9.5 });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    const filaFinal = filaDe(fila.id);
    expect(registro.estado).toBe("LISTA");
    expect((registro.acta as Record<string, unknown>).status).toBe("ENVIADA");
    expect((registro.acta as Record<string, unknown>).enviadoAutomaticamente).toBe("09:00:00");
    expect(registro.hashSha256).toBeUndefined(); // online → el hash lo maneja el flujo
    expect(registro.thumb).toBe("data:image/jpeg;base64,THUMB-FIXTURE");
    expect(registro.qrPayload).toBeUndefined(); // capa-0 sin QR → campo AUSENTE (jamás inventar)
    expect(filaFinal.estado).toBe("LISTA");
    expect(filaFinal.statusActa).toBe("ENVIADA");
    expect(filaFinal.enviadaAuto).toBe(true);
    expect(CONTROL.llamadasHoraEnvio).toBe(1);
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(1);
  });

  test("fase envío: RECHAZADA (GENERICO) → sin envío + contador de motivo", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("rechazada.jpg"));
    CONTROL.escanearActa = async () =>
      actaFixture({
        status: "RECHAZADA",
        score: 4,
        rechazo: { tipo: "GENERICO", detalle: "sin motivo reconocido" },
      });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect((registro.acta as Record<string, unknown>).status).toBe("RECHAZADA");
    expect(registro.rescateRechazo).toBeUndefined(); // rescate SOLO para BAJO
    const filaFinal = filaDe(fila.id);
    expect(filaFinal.statusActa).toBe("RECHAZADA");
    expect(filaFinal.enviadaAuto).toBe(false);
    expect(CONTROL.llamadasHoraEnvio).toBe(0);
    expect(useE14Store.getState().motivosNoEnvio["rechazo:generico"]).toBe(1);
  });

  test("fase rescate: RECHAZADA-BAJO intento 1 → reintento OPTIMA → salvado + ENVIADA", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("bajo.jpg"));
    const colaActas = [
      actaFixture({ status: "RECHAZADA", score: 4, rechazo: { tipo: "BAJO", detalle: "NO SE RECONOCE INFORMACIÓN" } }),
      actaFixture({ status: "OPTIMA", score: 9.8 }),
    ];
    CONTROL.escanearActa = async () => {
      const a = colaActas.shift();
      if (!a) throw new Error("SIN_FIXTURE");
      return a;
    };

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect((registro.acta as Record<string, unknown>).status).toBe("ENVIADA");
    expect(registro.rescateRechazo).toBe("salvado");
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(2);
  });

  test("fase watchdog: veredicto-timeout del bridge ×2 → RECHAZADA (mismo veredicto de siempre)", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("colgado.jpg"));
    CONTROL.escanearActa = async () =>
      actaFixture({
        status: "RECHAZADA",
        score: 0,
        rechazo: { tipo: "ILEGIBLE", detalle: "TIEMPO DE PROCESADO EXCEDIDO" },
      });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect((registro.acta as Record<string, unknown>).status).toBe("RECHAZADA");
    expect((registro.acta as Record<string, unknown>).rechazo).toEqual({
      tipo: "ILEGIBLE",
      detalle: "TIEMPO DE PROCESADO EXCEDIDO",
    });
    // La traza watchdog solo persiste en el POST-MORTEM (catch → fila ERROR);
    // en el desenlace LISTA el campo viaja AUSENTE (ausente = instrumento no
    // corrió... aquí corrió pero el write del desenlace no lo lleva — la traza
    // de los 2 intentos vive en el logger). Comportamiento ORIGINAL fijado.
    expect(registro.watchdog).toBeUndefined();
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(2);
    expect(filaDe(fila.id).statusActa).toBe("RECHAZADA");
  });

  test("fase relectura interna: SUGERIDA perfecta → fila.relectura true (una pasada)", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("sugerida.jpg"));
    CONTROL.escanearActa = async () =>
      actaFixture({
        status: "EN_REVISION_HUMANA",
        score: 8.5,
        clasificacion: clasificacion("SUGERIDA"),
        diagnostico: { lectura: { nivel: "FUERTE" }, gate: { completa: true }, score: { techos: ["sin-diag"] } },
      });
    CONTROL.reconocerTexto = async () => "ACTA E-14 REGISTRADURIA";

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect((registro.acta as Record<string, unknown>).status).toBe("EN_REVISION_HUMANA");
    expect(filaDe(fila.id).relectura).toBe(true);
    // el veredicto de la 1.ª lectura queda intacto (sin-cambio — divipol vacía → MANUAL)
    expect(CONTROL.llamadasPuente.filter((x) => x === "reconocerTexto").length).toBe(1);
  });

  test("fase capa-0: qrPrevio HEREDADO → qrHeredado true + payload/estado en el registro", async () => {
    const fila = filaFixture({ qrPrevio: "PAYLOAD-HEREDA-1" });
    prepararFila(fila, fileFixture("hereda.jpg"));
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.qrPayload).toBe("PAYLOAD-HEREDA-1");
    expect(registro.qrHeredado).toBe(true);
    expect(registro.qrEstado).toBe("leido");
    // sin re-decode: la capa 0 NO llamó al decodificador
    expect(CONTROL.llamadasPuente.filter((x) => x === "decodificarQrDeCapture").length).toBe(0);
  });

  test("fase capa-0: decode payload NUEVO → registra original en el mapa del lote", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("decode.jpg"));
    CONTROL.qrDecode = "PAYLOAD-NUEVO-9";
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.qrPayload).toBe("PAYLOAD-NUEVO-9");
    expect(registro.qrHeredado).toBeUndefined(); // pagó decode — ausente (D44-R2)
    expect(store.originalQrDePayload("PAYLOAD-NUEVO-9")).toBe(fila.id);
    expect(CONTROL.llamadasPuente.filter((x) => x === "decodificarQrDeCapture").length).toBe(1);
  });

  test("fase capa-0: sin payload → pipeline normal (qrEstado sin-payload, campo qrPayload ausente)", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("sin-qr.jpg"));
    CONTROL.qrDecode = null;
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.qrPayload).toBeUndefined();
    expect(registro.qrEstado).toBe("sin-payload");
    expect(filaDe(fila.id).qrEstado).toBe("sin-payload");
  });
});

// ═══════════════ B · LAS 8 PUERTAS DE DEDUP ═════════════════════════════════

describe("R8 · B — las 8 puertas de dedup (fixture por puerta)", () => {
  test("puerta capa-0 YA-ENVIADA histórica: payload del ledger → YA-ENVIADA sin OCR", async () => {
    LEDGER.push({ id: "enviada-hist-1", ts: Date.now(), payloadQr: "PAYLOAD-HIST-1" });
    const fila = filaFixture({ qrPrevio: "PAYLOAD-HIST-1" });
    prepararFila(fila, fileFixture("hist.jpg"));

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.estado).toBe("YA-ENVIADA");
    expect(registro.dedup).toBe("ya-enviada");
    expect(registro.qrPayload).toBe("PAYLOAD-HIST-1");
    expect(registro.enviadaDe).toBe("enviada-hist-1");
    expect(filaDe(fila.id).estado).toBe("YA-ENVIADA");
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(0);
  });

  test("puerta capa-0 reutiliza (original LISTA): dedup=qr + trazas del re-save", async () => {
    const original = filaFixture({ estado: "LISTA", statusActa: "ENVIADA" });
    prepararFila(original, fileFixture("orig.jpg"), {
      acta: actaFixture({ status: "ENVIADA", enviadoAutomaticamente: "08:00:00" }),
      thumb: "data:image/jpeg;base64,ORIG",
    });
    store.registrarQrPayload("PAYLOAD-REUSA-1", original.id);
    const gemela = filaFixture({ qrPrevio: "PAYLOAD-REUSA-1", agregadaEn: original.agregadaEn + 10 });
    prepararFila(gemela, fileFixture("gemela.jpg"));

    await procesarUno(gemela as never);

    const registro = registroDe(gemela.id);
    expect(registro.estado).toBe("LISTA");
    expect(registro.dedup).toBe("qr");
    expect(registro.qrPayload).toBe("PAYLOAD-REUSA-1");
    expect(registro.qrHeredado).toBe(true);
    expect(registro.qrEstado).toBe("leido");
    expect((registro.acta as Record<string, unknown>).status).toBe("DUPLICADA"); // e66: copia de ENVIADA
    expect((registro.acta as Record<string, unknown>).enviadoAutomaticamente).toBeNull();
    expect(filaDe(gemela.id).estado).toBe("LISTA");
    expect(filaDe(gemela.id).enviadaAuto).toBe(false);
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(0);
  });

  test("puerta capa-0 APLAZADA (original PROCESANDO): techo vencido → reproceso completo", async () => {
    const original = filaFixture({ estado: "PROCESANDO" });
    prepararFila(original, fileFixture("orig2.jpg"));
    store.registrarQrPayload("PAYLOAD-APLAZ-1", original.id);
    const gemela = filaFixture({ qrPrevio: "PAYLOAD-APLAZ-1" });
    prepararFila(gemela, fileFixture("gemela2.jpg"));
    CONTROL.desenlaceQr = "techo";
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(gemela as never);

    const registro = registroDe(gemela.id);
    expect(registro.estado).toBe("LISTA");
    expect((registro.acta as Record<string, unknown>).status).toBe("ENVIADA");
    expect(registro.dedup).toBeUndefined(); // SU desenlace (sin copia)
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(1);
  });

  test("puerta rama DUPLICADA del pool: reutilizar copia heredada (RECHAZADA heredada — e71 P2.1)", async () => {
    const original = filaFixture({ estado: "LISTA", statusActa: "RECHAZADA" });
    prepararFila(original, fileFixture("orig3.jpg"), {
      acta: actaFixture({
        status: "RECHAZADA",
        score: 4,
        rechazo: { tipo: "BAJO", detalle: "x" },
        diagnostico: { tiempos: { esperaMs: 1000, totalMs: 5000, ocrMs: 21000 } },
      }),
      thumb: "data:image/jpeg;base64,ORIG3",
    });
    const gemela = filaFixture({ estado: "DUPLICADA", dupOf: original.id });
    prepararFila(gemela, fileFixture("gemela3.jpg"));

    await procesarUno(gemela as never);

    const registro = registroDe(gemela.id);
    expect(registro.estado).toBe("LISTA");
    expect((registro.acta as Record<string, unknown>).status).toBe("RECHAZADA"); // hereda el rechazo
    expect((registro.acta as Record<string, unknown>).enviadoAutomaticamente).toBeNull();
    expect((registro.acta as unknown as { diagnostico?: { tiempos?: { ocrMs?: number } } }).diagnostico?.tiempos?.ocrMs).toBe(0);
    expect(filaDe(gemela.id).estado).toBe("LISTA");
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(0);
  });

  test("puerta capa-2 identidad: misma serie impresa → DUPLICADA con SU PROPIO desenlace", async () => {
    // original LISTA con la serie al mapa (marcarFila la estampa al procesar)
    const original = filaFixture({ estado: "LISTA", statusActa: "OPTIMA", serie: SERIE });
    prepararFila(original, fileFixture("cap2-orig.jpg"), {
      acta: actaFixture({ status: "OPTIMA", clasificacion: clasificacion("AUTO", CODIGO) }),
    });
    const gemela = filaFixture({ agregadaEn: original.agregadaEn + 5 });
    prepararFila(gemela, fileFixture("cap2-gemela.jpg"));
    CONTROL.escanearActa = async () =>
      actaFixture({ status: "OPTIMA", clasificacion: clasificacion("AUTO", CODIGO) });

    await procesarUno(gemela as never);

    const registro = registroDe(gemela.id);
    expect(registro.estado).toBe("DUPLICADA");
    expect(registro.dedup).toBe("identidad");
    expect(registro.dupOf).toBe(original.id);
    expect(registro.serie).toBe(SERIE);
    // SU PROPIO desenlace (no copia): NO envía, NO borra, revisión disponible
    expect((registro.acta as Record<string, unknown>).status).toBe("OPTIMA");
    expect(filaDe(gemela.id).estado).toBe("DUPLICADA");
    expect(filaDe(gemela.id).enviadaAuto).toBe(false);
    expect(CONTROL.llamadasHoraEnvio).toBe(0);
  });

  test("puerta dedup contenido v2: gemela LISTA con MISMO hashBytes → copia (OCR ya pagado)", async () => {
    const hash = await dedup.hashBytesDeArchivo(fileFixture("v2.jpg"));
    const original = filaFixture({ estado: "LISTA", statusActa: "OPTIMA", hashBytes: hash });
    prepararFila(original, fileFixture("v2-orig.jpg", new Uint8Array([9, 9, 9])), {
      acta: actaFixture({ status: "OPTIMA" }),
      hashBytes: hash,
      thumb: "data:image/jpeg;base64,ORIG-V2",
    });
    const gemela = filaFixture({ hashBytes: hash, agregadaEn: original.agregadaEn + 5 });
    prepararFila(gemela, fileFixture("v2.jpg", new Uint8Array([9, 9, 9])), { hashBytes: hash });
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(gemela as never);

    const registro = registroDe(gemela.id);
    expect(registro.estado).toBe("LISTA");
    expect((registro.acta as Record<string, unknown>).status).toBe("DUPLICADA");
    expect(filaDe(gemela.id).estado).toBe("LISTA");
    expect(CONTROL.llamadasHoraEnvio).toBe(0); // el envío real vive en la original
  });

  test("puerta veto post-OCR (H1): payload ya ENVIADO → YA-ENVIADA-postocr sin envío", async () => {
    LEDGER.push({ id: "enviada-hist-2", ts: Date.now(), payloadQr: "PAYLOAD-VETO-1" });
    // La capa-0 NO debe vetar (la original del payload está viva en el lote →
    // rama "reprocesa-completo honesto") — el veto corre POST-OCR (H1).
    const portadora = filaFixture();
    prepararFila(portadora, fileFixture("veto-portadora.jpg"));
    store.registrarQrPayload("PAYLOAD-VETO-1", portadora.id);
    const fila = filaFixture({ qrPrevio: "PAYLOAD-VETO-1", agregadaEn: portadora.agregadaEn + 5 });
    prepararFila(fila, fileFixture("veto.jpg"));
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.estado).toBe("YA-ENVIADA");
    expect(registro.dedup).toBe("ya-enviada-postocr"); // puerta del veto AL FINAL (D57)
    expect(CONTROL.llamadasHoraEnvio).toBe(0); // el envío JAMÁS salió
    expect(useE14Store.getState().publicaciones[fila.id]).toBeUndefined();
  });

  test("puerta dedupExactoIngesta: DUPLICADA instantánea por SHA-256 (e71 Opt-1)", async () => {
    const bytes = new Uint8Array([7, 7, 7, 7, 7]);
    const a = fileFixture("inst-a.jpg", bytes);
    const b = fileFixture("inst-b.jpg", bytes);

    await useMasivaStore.getState().agregarFiles([a, b] as never);

    const filaA = () => useMasivaStore.getState().filas.find((f) => f.nombre === "inst-a.jpg");
    const filaB = () => useMasivaStore.getState().filas.find((f) => f.nombre === "inst-b.jpg");
    expect(await esperarHasta(() => filaB()?.estado === "DUPLICADA")).toBe(true);
    expect(filaA()?.estado).toBe("PENDIENTE");
    expect(filaB()?.dupOf).toBe(filaA()?.id);
    const registro = registroDe(filaB()!.id);
    expect(registro.estado).toBe("DUPLICADA");
    expect(registro.dupOf).toBe(filaA()!.id);
  });

  test("puerta dedupExactoIngesta: YA-ENVIADA instantánea por bytes contra el histórico", async () => {
    const bytes = new Uint8Array([8, 8, 8]);
    const sha = await dedup.hashBytesDeArchivo(fileFixture("hist-bytes.jpg", bytes));
    expect(sha).toBeTruthy();
    LEDGER.push({ id: "enviada-bytes-1", ts: Date.now(), hashBytes: sha });

    await useMasivaStore.getState().agregarFiles([fileFixture("hist-bytes.jpg", bytes)] as never);

    const fila = () => useMasivaStore.getState().filas.find((f) => f.nombre === "hist-bytes.jpg");
    expect(await esperarHasta(() => fila()?.estado === "YA-ENVIADA")).toBe(true);
    expect(fila()?.enviadaDe).toBe("enviada-bytes-1");
    const registro = registroDe(fila()!.id);
    expect(registro.dedup).toBe("ya-enviada");
  });

  test("puerta cadenaDedup dhash: cinta cierta (hamming 0) → DUPLICADA apuntando a la original", async () => {
    // bytes DISTINTOS (sha no matchea), píxeles IGUALES (dhash real → hamming 0)
    PIXELES.set("dhash-a.jpg", pixelesUniformes());
    PIXELES.set("dhash-b.jpg", pixelesUniformes());

    await useMasivaStore.getState().agregarFiles([
      fileFixture("dhash-a.jpg", new Uint8Array([1, 1, 1])),
      fileFixture("dhash-b.jpg", new Uint8Array([2, 2, 2])),
    ] as never);

    const a = () => useMasivaStore.getState().filas.find((f) => f.nombre === "dhash-a.jpg");
    const b = () => useMasivaStore.getState().filas.find((f) => f.nombre === "dhash-b.jpg");
    expect(await esperarHasta(() => b()?.estado === "DUPLICADA")).toBe(true);
    expect(b()?.dupOf).toBe(a()?.id);
    const registro = registroDe(b()!.id);
    expect(registro.hashDedup).toBe("0000000000000000"); // dhash REAL de gris uniforme
    expect(registro.dedup).toBe("v2");
    expect(registro.dedupDistancia).toBe(0);
    expect(registro.dedupDetalle).toEqual({ candidatas: 1, indice: 0, mejorDistancia: 0 });
  });

  test("puerta cadenaDedup dhash: banda 3..6 → visual-aplazada (fila sigue PENDIENTE)", async () => {
    PIXELES.set("banda-a.jpg", pixelesUniformes());
    PIXELES.set("banda-b.jpg", pixelesConPicos([0, 2, 4])); // hamming exacto 3

    await useMasivaStore.getState().agregarFiles([
      fileFixture("banda-a.jpg", new Uint8Array([3, 1, 1])),
      fileFixture("banda-b.jpg", new Uint8Array([4, 2, 2])),
    ] as never);

    const a = () => useMasivaStore.getState().filas.find((f) => f.nombre === "banda-a.jpg");
    const b = () => useMasivaStore.getState().filas.find((f) => f.nombre === "banda-b.jpg");
    expect(await esperarHasta(() => registroDe(b()!.id).dedup === "visual-aplazada")).toBe(true);
    expect(b()?.estado).toBe("PENDIENTE"); // NO marca pre-OCR — la capa 2 decide
    const registro = registroDe(b()!.id);
    expect(registro.dedup).toBe("visual-aplazada");
    expect(registro.dedupDistancia).toBe(3);
    expect(registro.dedupVisualDe).toBe(a()!.id);
  });

  test("puerta cadenaDedup sondeo QR: mismo payload → DUPLICADA qr-sondeo (no entra al pool)", async () => {
    CONTROL.sondeo.set("sondeo-a.jpg", { payload: "PAYLOAD-SONDEO-1", tier: "jsqr", ms: 5 });
    CONTROL.sondeo.set("sondeo-b.jpg", { payload: "PAYLOAD-SONDEO-1", tier: "jsqr", ms: 6 });

    await useMasivaStore.getState().agregarFiles([
      fileFixture("sondeo-a.jpg", new Uint8Array([5, 1, 1])),
      fileFixture("sondeo-b.jpg", new Uint8Array([6, 2, 2])),
    ] as never);

    const a = () => useMasivaStore.getState().filas.find((f) => f.nombre === "sondeo-a.jpg");
    const b = () => useMasivaStore.getState().filas.find((f) => f.nombre === "sondeo-b.jpg");
    expect(await esperarHasta(() => b()?.estado === "DUPLICADA")).toBe(true);
    expect(b()?.dupOf).toBe(a()?.id);
    const registro = registroDe(b()!.id);
    expect(registro.dedup).toBe("qr-sondeo");
    expect(registro.sondeoQrMs).toBe(6);
    expect(registro.sondeoQrTier).toBe("jsqr");
    expect(a()?.qrPrevio).toBe("PAYLOAD-SONDEO-1"); // la original lleva el payload (RAM del lote)
  });

  test("puerta cadenaDedup YA-ENVIADA por dhash: original viva ENVIADA → YA-ENVIADA (via dhash)", async () => {
    const original = filaFixture({ estado: "LISTA", statusActa: "ENVIADA", hashDedup: "0000000000000000" });
    prepararFila(original, fileFixture("denv-orig.jpg", new Uint8Array([1, 2, 3])), {
      acta: actaFixture({ status: "ENVIADA" }),
    });
    PIXELES.set("denv-nueva.jpg", pixelesUniformes()); // mismo dhash real → hamming 0

    await useMasivaStore.getState().agregarFiles([
      fileFixture("denv-nueva.jpg", new Uint8Array([7, 7, 7])),
    ] as never);

    const fila = () => useMasivaStore.getState().filas.find((f) => f.nombre === "denv-nueva.jpg");
    expect(await esperarHasta(() => fila()?.estado === "YA-ENVIADA")).toBe(true);
    expect(fila()?.enviadaDe).toBe(original.id);
    const registro = registroDe(fila()!.id);
    expect(registro.hashDedup).toBe("0000000000000000");
  });

  test("puerta prescan: aplicarVeredictoPrescan duplicada/ya-enviada/registrar/nada", async () => {
    const escritas: Record<string, unknown>[] = [];
    const parches: [string, Record<string, unknown>][] = [];
    const yaEnviadas: string[] = [];
    const deps = {
      leerRegistro: async (id: string) => registroDe(id),
      guardarRegistro: async (r: Record<string, unknown>) => {
        escritas.push(r);
        REGISTROS.set(r.id as string, r);
      },
      actualizarFila: (id: string, patch: Record<string, unknown>) => {
        parches.push([id, patch]);
      },
      marcarYaEnviada: async (...args: unknown[]) => {
        yaEnviadas.push(String(args[0]));
        return true;
      },
      registrarQrPayload: (payload: string, id: string) => store.registrarQrPayload(payload, id),
    };

    const filaDup = filaFixture();
    prepararFila(filaDup, fileFixture("p-dup.jpg"));
    await prescan.aplicarVeredictoPrescan(filaDup.id, { accion: "duplicada", originalId: "orig-x" } as never, null, deps as never);
    expect(REGISTROS.get(filaDup.id)!.estado).toBe("DUPLICADA");
    expect(REGISTROS.get(filaDup.id)!.dupOf).toBe("orig-x");
    expect(REGISTROS.get(filaDup.id)!.dedup).toBeUndefined(); // §F.2: el pre-scan NO estampa dedup
    expect(parches[0]).toEqual([filaDup.id, { estado: "DUPLICADA", dupOf: "orig-x" }]);

    const filaYa = filaFixture();
    await prescan.aplicarVeredictoPrescan(filaYa.id, { accion: "ya-enviada", enviadaId: "env-x" } as never, "PAYLOAD-P", deps as never);
    expect(yaEnviadas).toEqual([filaYa.id]);

    const filaReg = filaFixture();
    await prescan.aplicarVeredictoPrescan(filaReg.id, { accion: "registrar" } as never, "PAYLOAD-REG", deps as never);
    expect(store.originalQrDePayload("PAYLOAD-REG")).toBe(filaReg.id);
    expect(parches.at(-1)).toEqual([filaReg.id, { qrPrevio: "PAYLOAD-REG" }]);

    await prescan.aplicarVeredictoPrescan("otra", { accion: "nada" } as never, null, deps as never);
    expect(escritas.length).toBe(1);
  });

  test("puerta marcarYaEnviada: guard PENDIENTE/PROCESANDO + write + ledger + patch", async () => {
    const fila = filaFixture({ hashBytes: "abc" });
    prepararFila(fila, fileFixture("ya.jpg"), { hashBytes: "abc" });

    // PROCESANDO sin aceptarProcesando → false (byte a byte el guard e65b M-e65b-3)
    useMasivaStore.setState({
      filas: useMasivaStore.getState().filas.map((f) =>
        f.id === fila.id ? { ...f, estado: "PROCESANDO" } : f,
      ),
    });
    expect(await store.marcarYaEnviada(fila.id, "env-x", "bytes", "abc")).toBe(false);

    // PENDIENTE → marca completa
    useMasivaStore.setState({
      filas: useMasivaStore.getState().filas.map((f) =>
        f.id === fila.id ? { ...f, estado: "PENDIENTE" } : f,
      ),
    });
    expect(await store.marcarYaEnviada(fila.id, "env-x", "bytes", "abc", 0)).toBe(true);
    const registro = registroDe(fila.id);
    expect(registro.estado).toBe("YA-ENVIADA");
    expect(registro.dedup).toBe("ya-enviada");
    expect(registro.enviadaDe).toBe("env-x");
    expect(filaDe(fila.id).estado).toBe("YA-ENVIADA");
    expect(filaDe(fila.id).enviadaDe).toBe("env-x");
    expect(await esperarHasta(() => LEDGER.some((e) => e.id === fila.id))).toBe(true);
  });
});

// ═══════════ C · CONTRATO DE TRAZAS POST-MORTEM (3 sitios) ══════════════════

describe("R8 · C — contrato de trazas post-mortem (los 3 sitios, mismas líneas)", () => {
  test("sitio 1 (reuso-qr): el re-save lleva dedup/qrPayload/qrHeredado/qrEstado", async () => {
    const original = filaFixture({ estado: "LISTA", statusActa: "OPTIMA" });
    prepararFila(original, fileFixture("t1-orig.jpg"), {
      acta: actaFixture({ status: "OPTIMA" }),
    });
    store.registrarQrPayload("PAYLOAD-TRAZA-1", original.id);
    const gemela = filaFixture({ qrPrevio: "PAYLOAD-TRAZA-1" });
    prepararFila(gemela, fileFixture("t1-gem.jpg"));

    await procesarUno(gemela as never);

    const registro = registroDe(gemela.id);
    expect(registro.dedup).toBe("qr");
    expect(registro.qrPayload).toBe("PAYLOAD-TRAZA-1");
    expect(registro.qrHeredado).toBe(true);
    expect(registro.qrEstado).toBe("leido");
  });

  test("sitio 2 (desenlace/registroListo): trazas QR condicionales — ausente = no corrió", async () => {
    // sin QR: qrPayload/qrHeredado AUSENTES; qrEstado "sin-payload" (la capa 0 SÍ corrió)
    const fila = filaFixture();
    prepararFila(fila, fileFixture("t2.jpg"));
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.qrPayload).toBeUndefined();
    expect(registro.qrHeredado).toBeUndefined();
    expect(registro.qrEstado).toBe("sin-payload");
  });

  test("sitio 2b (desenlace/registroListo): con QR heredado los 3 campos viajan", async () => {
    const fila = filaFixture({ qrPrevio: "PAYLOAD-TRAZA-2" });
    prepararFila(fila, fileFixture("t2b.jpg"));
    CONTROL.escanearActa = async () => actaFixture({ status: "OPTIMA" });

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.qrPayload).toBe("PAYLOAD-TRAZA-2");
    expect(registro.qrHeredado).toBe(true);
    expect(registro.qrEstado).toBe("leido");
  });

  test("sitio 3 (catch ERROR): post-mortem con qrPayload/qrHeredado/qrEstado y SIN watchdog", async () => {
    const fila = filaFixture({ qrPrevio: "PAYLOAD-TRAZA-3" });
    prepararFila(fila, fileFixture("t3.jpg"));
    CONTROL.escanearActa = async () => {
      throw new Error("FALLO_OCR_FICTICIO");
    };

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.estado).toBe("ERROR");
    expect(registro.qrPayload).toBe("PAYLOAD-TRAZA-3");
    expect(registro.qrHeredado).toBe(true);
    expect(registro.qrEstado).toBe("leido");
    expect(registro.watchdog).toBeUndefined(); // ningún intento murió por watchdog
    expect(filaDe(fila.id).estado).toBe("ERROR");
    expect(filaDe(fila.id).error).toBe("FALLO_OCR_FICTICIO"); // motivo corto ≤48
    expect(filaDe(fila.id).infoTitulo).toBeNull(); // D59: ERROR nunca muestra título viejo
  });

  test("sitio 3 (catch ERROR) tras watchdog muerto: watchdog+etapaAlMorir+elapsed sobreviven", async () => {
    const fila = filaFixture();
    prepararFila(fila, fileFixture("t3b.jpg"));
    let llamada = 0;
    CONTROL.escanearActa = async () => {
      llamada += 1;
      if (llamada === 1) {
        return actaFixture({ status: "RECHAZADA", score: 0, rechazo: { tipo: "ILEGIBLE", detalle: "TIEMPO DE PROCESADO EXCEDIDO" } });
      }
      throw new Error("FALLO_EN_REINTENTO");
    };

    await procesarUno(fila as never);

    const registro = registroDe(fila.id);
    expect(registro.estado).toBe("ERROR");
    expect(registro.watchdog).toBe(1); // el intento 1 murió por watchdog
    expect(registro.etapaAlMorir).toBe("ocr");
    expect(typeof registro.elapsedMs).toBe("number");
    expect(registro.qrEstado).toBe("sin-payload"); // la capa 0 corrió antes del fallo
  });
});

// ═══════════ D · ESPERA DEL DEDUP — contrato C5 (no cambia con el fix) ══════

describe("R8 · D — esperarDesenlaceOriginal (contrato que el fix C5 conserva)", () => {
  test("espera y copia: la original aterriza durante el sondeo → true", async () => {
    const esta = filaFixture({ agregadaEn: 100 });
    const original = filaFixture({ agregadaEn: 50 });
    prepararFila(esta, fileFixture("d1-esta.jpg"));
    prepararFila(original, fileFixture("d1-orig.jpg"));

    const promesa = runnerDedup.esperarDesenlaceOriginal(esta.id, original.id);
    setTimeout(() => {
      REGISTROS.set(original.id, { id: original.id, acta: actaFixture({ status: "OPTIMA" }) });
      useMasivaStore.setState({
        filas: useMasivaStore.getState().filas.map((f) =>
          f.id === original.id ? { ...f, estado: "LISTA" } : f,
        ),
      });
    }, 500);
    expect(await promesa).toBe(true);
  });

  test("original muerta (ERROR): sin copia posible → false rápido (fallback honesto)", async () => {
    const esta = filaFixture();
    const original = filaFixture({ estado: "ERROR", error: "X" });
    prepararFila(esta, fileFixture("d2-esta.jpg"));
    prepararFila(original, fileFixture("d2-orig.jpg"));

    expect(await runnerDedup.esperarDesenlaceOriginal(esta.id, original.id)).toBe(false);
  });

  test("esta fila QUITADA en la espera: la voluntad del dueño manda → false", async () => {
    const esta = filaFixture();
    const original = filaFixture();
    prepararFila(esta, fileFixture("d3-esta.jpg"));
    prepararFila(original, fileFixture("d3-orig.jpg"));

    const promesa = runnerDedup.esperarDesenlaceOriginal(esta.id, original.id);
    setTimeout(() => {
      useMasivaStore.setState({
        filas: useMasivaStore.getState().filas.filter((f) => f.id !== esta.id),
      });
    }, 500);
    expect(await promesa).toBe(false);
  });

  test("original DETRÁS en FIFO (agregadaEn mayor): HOY espera igual (comportamiento que C5 aparca)", async () => {
    const esta = filaFixture({ agregadaEn: 100 });
    const original = filaFixture({ agregadaEn: 500 }); // detrás — el caso patológico
    prepararFila(esta, fileFixture("d4-esta.jpg"));
    prepararFila(original, fileFixture("d4-orig.jpg"));

    const promesa = runnerDedup.esperarDesenlaceOriginal(esta.id, original.id);
    setTimeout(() => {
      REGISTROS.set(original.id, { id: original.id, acta: actaFixture({ status: "OPTIMA" }) });
      useMasivaStore.setState({
        filas: useMasivaStore.getState().filas.map((f) =>
          f.id === original.id ? { ...f, estado: "LISTA" } : f,
        ),
      });
    }, 500);
    expect(await promesa).toBe(true);
  });
});

// ═════════ F · C5 — APARCADO + RE-VISITA (fin de la ola, caller en runner) ═
// El aparcado nace en el CALLER (rama DUPLICADA de runner.ts): copiable con
// original DETRÁS en FIFO → aparca (slot liberado, sin OCR) y la ola la
// re-visita al terminar (copia si la original aterrizó, o fallback honesto).
// La sección D prueba esperarDesenlaceOriginal DIRECTO (contrato intacto);
// esta prueba el comportamiento NUEVO de la rama DUPLICADA a través de
// procesarUno + bucle real (iniciarRunner).
describe("R8 · F — C5: aparcado + re-visita al terminar la ola", () => {
  test("original copiable DETRÁS en FIFO → la rama DUPLICADA APARCA (slot liberado, cero OCR)", async () => {
    const original = filaFixture({ agregadaEn: 500, estado: "PENDIENTE" }); // detrás — patológico
    const esta = filaFixture({ estado: "DUPLICADA", dupOf: original.id, agregadaEn: 100 });
    prepararFila(esta, fileFixture("f1-esta.jpg"));
    prepararFila(original, fileFixture("f1-orig.jpg"));

    await procesarUno(esta as never);

    // APARCADA: procesarUno resuelve sin pipeline — el puente JAMÁS sonó y
    // la fila vuelve a DUPLICADA en la bandeja (honesto: espera SU original).
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(0);
    expect(filaDe(esta.id).estado).toBe("DUPLICADA");
    expect(filaDe(esta.id).dupOf).toBe(original.id);
  });

  test("re-visita al terminar la ola: original aterrizó → copia LISTA (cero OCR) y la ola se cierra", async () => {
    const original = filaFixture({ agregadaEn: 500, estado: "PENDIENTE" });
    const esta = filaFixture({ estado: "DUPLICADA", dupOf: original.id, agregadaEn: 100 });
    prepararFila(esta, fileFixture("f2-esta.jpg"));
    prepararFila(original, fileFixture("f2-orig.jpg"));

    // 1. Aparcamiento (la original sigue PENDIENTE detrás).
    await procesarUno(esta as never);
    expect(filaDe(esta.id).estado).toBe("DUPLICADA");
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(0);

    // 2. La original aterriza DURANTE la ola (el pool la procesa → LISTA).
    REGISTROS.set(original.id, {
      id: original.id,
      nombre: original.nombre,
      agregadaEn: original.agregadaEn,
      estado: "LISTA",
      archivo: fileFixture("f2-orig.jpg"),
      acta: actaFixture({ status: "OPTIMA", score: 9.1 }),
      thumb: "data:image/jpeg;base64,ORIG-F2",
    });
    useMasivaStore.setState({
      filas: useMasivaStore.getState().filas.map((f) =>
        f.id === original.id ? { ...f, estado: "LISTA" } : f,
      ),
    });

    // 3. FIN DE LA OLA → re-visita: el bucle REAL (iniciarRunner) re-visita
    // la aparcada, copia el desenlace (DUPLICADA — regla e66) y se cierra.
    iniciarRunner();
    const copiada = await esperarHasta(() => filaDe(esta.id).estado === "LISTA");
    expect(copiada).toBe(true);
    expect(filaDe(esta.id).statusActa).toBe("DUPLICADA"); // hereda sin envío propio
    expect(filaDe(esta.id).dupOf).toBe(original.id);
    // La copia JAMÁS paga OCR (kit e71 literal) — ni en el aparcado ni en la
    // re-visita: escanearActa sigue en cero.
    expect(CONTROL.llamadasPuente.filter((x) => x === "escanearActa").length).toBe(0);
    const registroCopia = registroDe(esta.id);
    expect((registroCopia.acta as Record<string, unknown>).status).toBe("DUPLICADA");
    expect(registroCopia.thumb).toBe("data:image/jpeg;base64,ORIG-F2");
    // La ola se drena sola (no queda trabajo — la corrida se cierra).
    await esperarHasta(() => useMasivaStore.getState().corriendo === false);
    expect(useMasivaStore.getState().corriendo).toBe(false);
  });

  test("re-visita sin desenlace: la aparcada cae al fallback honesto → PENDIENTE (reproceso completo)", async () => {
    const original = filaFixture({ agregadaEn: 500, estado: "PENDIENTE" });
    const esta = filaFixture({ estado: "DUPLICADA", dupOf: original.id, agregadaEn: 100 });
    prepararFila(esta, fileFixture("f3-esta.jpg"));
    prepararFila(original, fileFixture("f3-orig.jpg"));

    // 1. Aparcamiento.
    await procesarUno(esta as never);
    expect(filaDe(esta.id).estado).toBe("DUPLICADA");

    // 2. La original QUITADA durante la ola (la voluntad del dueño manda).
    useMasivaStore.setState({
      filas: useMasivaStore.getState().filas.filter((f) => f.id !== original.id),
    });
    REGISTROS.delete(original.id);

    // 3. Fin de la ola → re-visita: sin original → fallback honesto (la fila
    // se des-marca a PENDIENTE y la MISMA ola la reprocesa — con el puente
    // SIN fixture el reproceso cae a ERROR, jamás tumba la cola).
    CONTROL.escanearActa = async () => {
      throw new Error("PUENTE_SIN_FIXTURE");
    };
    iniciarRunner();
    const reprocesada = await esperarHasta(() => filaDe(esta.id).estado === "ERROR");
    expect(reprocesada).toBe(true);
    expect(filaDe(esta.id).dupOf ?? null).toBeNull(); // dupOf des-marca en el fallback
    await esperarHasta(() => useMasivaStore.getState().corriendo === false);
  });
});

// ═══════════════ E · ANCLAS QA (los greps del post-mortem NO se rompen) ═════

describe("R8 · E — anclas QA: los literales grepeados siguen en runner.ts", () => {
  const fuente = Bun.file(new URL("../runner.ts", import.meta.url));
  let texto = "";
  beforeEach(async () => {
    texto = await fuente.text();
  });

  const anclas = [
    "const WATCHDOG_MS = 75_000;",
    "const WATCHDOG_INTENTOS = 2;",
    "const WATCHDOG_GRACIA_MS = 5_000;",
    "const RELECTURA_TOPE_MS = 45_000;",
    "let mutexDedup: Promise<void> = Promise.resolve();",
    "async function conExclusionMutua<",
    "return conExclusionMutua(() => reutilizarResultadoCritica(fila, t0))",
    "const originalEnviada = actaCopia.status ===",
    "actaCopia.enviadoAutomaticamente = null;",
    "const archivoPipeline = archivo",
    "console.info(",
    "[e14] relectura-interna fila=",
    "export function iniciarRunner",
    "export function pausarRunner",
    "export function rearrancarTrasEncolar",
  ];

  for (const ancla of anclas) {
    test(`ancla en runner.ts: ${ancla.slice(0, 48)}`, () => {
      expect(texto.includes(ancla)).toBe(true);
    });
  }

  test("los literales [e14] capa0-qr / dedup / veto siguen grepeables en runner.ts y runner-dedup.ts", async () => {
    for (const literal of [
      "[e14] capa0-qr worker fila=",
      "[e14] capa0-qr reutiliza",
      "[e14] capa0-qr aplazada",
      "[e14] capa0-qr original",
      "[e14] capa0-qr hereda-payload",
      "[e14] capa0-qr ya-enviada-historico",
      "[e14] capa0-qr sin-payload fila=",
      "[e14] capa0-qr fallback fila=",
      "[e14] capa0-qr techo-vencido",
      "[e14] capa0-qr reprocesa-completo",
      "[e14] dedup-identidad fila=",
      "[e14] veto ya-enviada post-ocr",
      "[e14] veto ya-enviada REMOTO",
      "[e14] dedup fila=",
      "[e14] watchdog fila=",
      "[e14] rescate-rechazo",
      "[e14] decode-maestro fila=",
      "[e14] precalor fila=",
      "[e14] origen=",
      "[e14] dedup fila=",
    ]) {
      expect(texto.includes(literal)).toBe(true);
    }
    // La espera acotada del dedup vive en runner-dedup.ts (C1) — sus
    // constantes ancladas permanecen ahí.
    const textoDedup = await Bun.file(new URL("../runner-dedup.ts", import.meta.url)).text();
    expect(textoDedup.includes("const ESPERA_ORIGINAL_INTERVALO_MS = 400;")).toBe(true);
    expect(textoDedup.includes("const ESPERA_ORIGINAL_TECHO_MS = 600_000;")).toBe(true);
    expect(textoDedup.includes("async function esperarDesenlaceOriginal(")).toBe(true);
  });
});
