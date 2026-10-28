"use client";

/**
 * KIT e107-prescan-qr-cola-v1 (§D.2) — orquestador del PRE-SCAN QR en
 * «PROCESAR COLA» + clasificador PURO + hook de progreso.
 *
 * El pedido del dueño (§0, contrato):
 *   Fase 1 — PRE-SCAN rápido: decode (EXIF ✓) → detección de quad con el
 *   detection-worker REAL → warp (recorte SIN rotar) → lectura de QR
 *   (BarcodeDetector → jsQR — sin el decodificador wasm lento, §F.3).
 *   Fase 2 — clasificación: DUPLICADA / YA-ENVIADA marcadas ANTES del OCR
 *   (el ahorro de los ~40 s); QR no leído JAMÁS se descarta — pasa al flujo
 *   normal (regla de oro 4).
 *   Fase 3 — tM() de siempre con la lista ya filtrada: «filtrar la lista»
 *   son MARCAS de estado previas a iniciar() (§B del kit) — CERO cambios en
 *   el runner/store: el único punto de contacto es la llamada `iniciar()`.
 *
 * Reglas de oro → cumplimiento mecánico (§E):
 *  · No tocar tM(): 0 edits en runner.ts/store.ts (QA lo escanea).
 *  · UI de progreso: «SONDEANDO QR… k/N» vía usePrescanQrEstado (D.3).
 *  · No bloquear main thread: detect/warp viven en el worker REAL; FIFO
 *    serial + hard-kill en prescan-qr.client.ts.
 *  · Sin pérdida de datos: cualquier fallo ⇒ fila queda PENDIENTE ⇒ Fase 3
 *    la procesa como hoy (try/catch por fila + guards anti-zombi).
 *
 * El decodificador wasm lento: NO importado aquí (§F.3 — QA: 0 matches del
 * token). El tier correspondiente de la capa 0 (identidad-qr.ts) queda
 * intacto — cambio separado.
 */
import { create } from "zustand";
import { logger } from "../../logger";
import { leerFlags } from "../flags";
// KIT e14-gama-adaptativa-v1 (D74): warpLado/presupuesto de la corrida son
// EFECTIVOS (gama BAJO 1920/6 s · MEDIO 2560/5 s · resto = flag puro).
import { flagsMasivaEfectivos } from "../gama";
import {
  crearClientePrescan,
  DETECT_LONG_SIDE,
  downscaleLado,
  type ClientePrescan,
} from "./prescan-qr.client";
import { BANDA_A, intentoSobrePixeles, type PixelesQr } from "./qr-pixeles";
import {
  enviadaPorPayload as enviadaPorPayloadStore,
  marcarYaEnviada,
  originalQrDePayload as originalQrDePayloadStore,
  registrarQrPayload as registrarQrPayloadStore,
  useMasivaStore,
} from "./store";
import { guardarRegistro, leerRegistro } from "./cola";
import type { FilaMasiva } from "./tipos";

// KIT flujo-dueno-v1 (K2) — re-exports de los helpers MOVIDOS al cliente
// (doctrina §A.2 del kit e73: módulo compartido, cero diffs en consumidores
// — prescan-qr.test.ts y demás no cambian).
export { downscaleLado, quadDeFracciones } from "./prescan-qr.client";

// ─── Clasificador PURO (testeable — deps inyectadas, patrón e73) ────────────

/** Veredicto del pre-scan para UNA fila (§D.2 — ESPEJO de cadenaDedup:
 *  primer ganador gana, FIFO por agregadaEn). */
export type VeredictoPrescan =
  | { accion: "duplicada"; originalId: string }
  | { accion: "ya-enviada"; enviadaId: string }
  | { accion: "registrar" } // payload NUEVO → registrarQrPayload + sigue PENDIENTE
  | { accion: "nada" }; // sin payload / conservador → sigue PENDIENTE

export interface DepsClasificadorPrescan {
  originalDePayload: (p: string) => string | null;
  /** existe en filas (viva — QUITADA/vaciada ⇒ false). */
  filaViva: (id: string) => boolean;
  enviadaPorPayload: (p: string) => Promise<{ id: string } | null>;
}

/**
 * Orden de decisión (kit §D.2 — literal):
 *  1. payload null → `nada` (los 4 arrugados pasan al flujo normal — regla
 *     de oro 4).
 *  2. original = originalDePayload(payload); si existe, ≠ filaId y la fila
 *     original está VIVA → `duplicada` (el reuso clona el desenlace — jamás
 *     doble envío).
 *     Guard transversal: match a fila NO viva → `nada` (conservador: OCR
 *     decidirá — jamás marcar DUPLICADA apuntando a un zombi).
 *  3. Si no: enviadaPorPayload(payload) → `ya-enviada` (via "payload") —
 *     mismo self-guard de la capa 0 (runner.ts:567: hit.id !== fila.id).
 *  4. Si no: `registrar`.
 */
export async function clasificarPayloadPrescan(
  payload: string | null,
  filaId: string,
  deps: DepsClasificadorPrescan,
): Promise<VeredictoPrescan> {
  // 1 · sin payload — los arrugados/giros pasan al OCR (jamás descartar)
  if (payload == null || payload.length === 0) return { accion: "nada" };
  // 2 · dup EN LOTE (mapaQrPayload — capas 0 del runner ven lo mismo)
  const original = deps.originalDePayload(payload);
  if (original != null && original !== filaId) {
    if (deps.filaViva(original)) return { accion: "duplicada", originalId: original };
    return { accion: "nada" }; // guard transversal — conservador: OCR decidirá
  }
  // 3 · histórico de ENVIADAS (ledger persistente — hit ⇒ YA-ENVIADA)
  const hit = await deps.enviadaPorPayload(payload);
  if (hit && hit.id !== filaId) return { accion: "ya-enviada", enviadaId: hit.id };
  // 4 · payload NUEVO — se registra (la capa 0 del runner lo verá igual)
  return { accion: "registrar" };
}

// ─── Objetivo del pre-scan (R3 — puro, testeable) ───────────────────────────

/**
 * Filas objetivo del pre-scan: SOLO PENDIENTE vivas. `forzarDedupOff`
 * (PROCESAR IGUAL / e65b) manda SIEMPRE — RL-e65b-6: el escape del dueño es
 * sagrado, la fila va directa a la Fase 3 sin pasar por el pre-scan.
 */
export function objetivoPrescan(filas: FilaMasiva[]): FilaMasiva[] {
  return filas.filter((f) => f.estado === "PENDIENTE" && !f.forzarDedupOff);
}

// ─── Escritura del veredicto (extraída para vitest — patrón deps e73) ───────

export interface DepsEscrituraPrescan {
  leerRegistro: typeof leerRegistro;
  guardarRegistro: typeof guardarRegistro;
  actualizarFila: (id: string, patch: Partial<FilaMasiva>) => void;
  marcarYaEnviada: typeof marcarYaEnviada;
  registrarQrPayload: (payload: string, id: string) => void;
}

/**
 * Escribe el veredicto con la MISMA maquinaria de marcas de siempre (§C):
 *  · duplicada → write IDB (patrón cadenaDedup store.ts:586-594) + patch
 *    SOLO-VISUAL. §F.2: el write OMITE el campo `dedup` (opcional) —
 *    estado:"DUPLICADA" + dupOf bastan para reuso/UI/informe; el pre-scan
 *    NO miente telemetría ajena (sin token "qr-prescan" en la unión §G).
 *  · ya-enviada → marcarYaEnviada COMPLETA (guard anti-zombi + write IDB +
 *    patchFila + alimenta el ledger) con via "payload" (§C).
 *  · registrar → registrarQrPayload(payload, id) — la capa 0 del runner lo
 *    verá igual en su re-chequeo.
 *  · nada → no-op (queda PENDIENTE — Fase 3 lo procesa).
 * El CALLER ya garantizó fila VIVA y PENDIENTE en el instante previo al
 * write (anti-zombi §G); marcarYaEnviada re-verifica su guard por dentro.
 */
export async function aplicarVeredictoPrescan(
  filaId: string,
  veredicto: VeredictoPrescan,
  payload: string | null,
  deps: DepsEscrituraPrescan,
): Promise<void> {
  switch (veredicto.accion) {
    case "duplicada": {
      try {
        const reg = await deps.leerRegistro(filaId);
        await deps.guardarRegistro({
          ...reg,
          estado: "DUPLICADA",
          dupOf: veredicto.originalId,
          // SIN campo `dedup` (§F.2) — es opcional; el comportamiento queda
          // completo (reuso <1 s, UI, informe) y el contrato D57 intacto.
        });
      } catch {
        /* IDB caída / fila fuera de la cola → patch solo en memoria */
      }
      deps.actualizarFila(filaId, { estado: "DUPLICADA", dupOf: veredicto.originalId });
      return;
    }
    case "ya-enviada":
      // §C — marcarYaEnviada TAL CUAL (via "payload"): su guard interno
      // exige PENDIENTE (anti-zombi doble) y alimenta el ledger (RL-e65b-2).
      await deps.marcarYaEnviada(
        filaId,
        veredicto.enviadaId,
        "payload",
        undefined,
        undefined,
        payload ?? undefined,
      );
      return;
    case "registrar":
      if (payload) {
        deps.registrarQrPayload(payload, filaId);
        // D30 (kit e14-qr-heredado-v1) — el payload que el pre-scan ACABA de
        // leer queda sobre la fila: la capa 0 del runner lo hereda sin
        // re-decode (igualdad EXACTA — misma llave de siempre). RAM del lote.
        deps.actualizarFila(filaId, { qrPrevio: payload });
      }
      return;
    case "nada":
      return; // queda PENDIENTE — Fase 3 lo procesa
  }
}

// ─── Lectura de QR sobre el warp — EXACTAMENTE la cadena del harness ────────

/** Declaración local mínima — el repo NO declara BarcodeDetector (la red
 *  line de identidad-qr.ts:54 lo PROHIBE para la capa 0/identidad y ese
 *  archivo queda INTACTO). §F.1: aquí lo ordena el dueño para este módulo
 *  NUEVO y es seguro por igualdad EXACTA de payload (Reed-Solomon — no hay
 *  «casi el mismo payload»; el error siempre cae del lado conservador). */
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  | (new (opts?: { formats?: string[] }) => BarcodeDetectorLike)
  | undefined;

/** Cap del harness para rasterizar el warp en el fallback jsQR. */
const QR_WARP_LADO_TOPE = 1600;

/**
 * (a) BarcodeDetector nativo → (b) jsQR sobre los píxeles del warp
 * (intentoSobrePixeles — tryBoth ya viene adentro) → (c) null. Sin throw
 * jamás (doctrina del conservador).
 */
export async function leerQrDeWarped(warped: ImageBitmap): Promise<string | null> {
  try {
    if (typeof BarcodeDetector !== "undefined") {
      try {
        const bd = new BarcodeDetector({ formats: ["qr_code"] });
        const hits = await bd.detect(warped);
        if (hits.length > 0 && hits[0]!.rawValue) return hits[0]!.rawValue;
      } catch {
        /* cae a jsQR */
      }
    }
    if (typeof OffscreenCanvas === "undefined") return null;
    const lado = Math.max(warped.width, warped.height);
    const escala = lado > QR_WARP_LADO_TOPE ? QR_WARP_LADO_TOPE / lado : 1;
    const w = Math.max(1, Math.round(warped.width * escala));
    const h = Math.max(1, Math.round(warped.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(warped, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const pix: PixelesQr = { data: img.data, width: w, height: h };
    return intentoSobrePixeles(pix, BANDA_A);
  } catch {
    return null; // (c) sin throw jamás
  }
}

// ─── Estado del pre-scan (banner D.3 — «SONDEANDO QR… k/N») ─────────────────

export type FasePrescan = "idle" | "boot" | "sondeo" | "fin";

export interface EstadoPrescan {
  corriendo: boolean;
  total: number;
  listo: number;
  leidos: number;
  fase: FasePrescan;
}

export const usePrescanStore = create<EstadoPrescan>(() => ({
  corriendo: false,
  total: 0,
  listo: 0,
  leidos: 0,
  fase: "idle",
}));

/** Hook del banner (D.3) — mismo gesto de suscripción del store masiva. */
export function usePrescanQrEstado(): EstadoPrescan {
  return usePrescanStore();
}

function emitir(parche: Partial<EstadoPrescan>): void {
  usePrescanStore.setState(parche);
}

// ─── Deps de producción (§C — las export reales del repo, tal cual) ─────────

const DEPS_CLASIFICADOR: DepsClasificadorPrescan = {
  originalDePayload: originalQrDePayloadStore,
  filaViva: (id) => useMasivaStore.getState().filas.some((f) => f.id === id),
  enviadaPorPayload: enviadaPorPayloadStore,
};

const DEPS_ESCRITURA: DepsEscrituraPrescan = {
  leerRegistro,
  guardarRegistro,
  actualizarFila: (id, patch) => useMasivaStore.getState().actualizarFila(id, patch),
  marcarYaEnviada,
  registrarQrPayload: registrarQrPayloadStore,
};

// ─── Downscale a la clase 400 del core (mismo gesto del harness) ────────────
// MOVIDO a prescan-qr.client.ts (hogar del contrato del worker) —
// re-exportado arriba. downscaleLado sigue importado aquí para el orquestador.

// ─── Orquestador (impuro — D.1 + export de §C) ──────────────────────────────

// Re-entrada R0 (doble protección con el flag del store — kit §D.2).
let corriendoModulo = false;

/**
 * Interceptar el clic de «PROCESAR COLA»: pre-scan QR de las PENDIENTE
 * vivas → marcar DUPLICADA / YA-ENVIADA / registrar payloads → iniciar().
 * Kill-switch OFF (prescanQrCola=false) ⇒ `iniciar()` byte-idéntico a hoy
 * (sin instanciar worker ni emitir estado — R1).
 */
export async function prescanYIniciar(): Promise<void> {
  // R0 — re-entrada: doble clic / clic durante pre-scan → no-op
  if (corriendoModulo || usePrescanStore.getState().corriendo) return;
  const store = useMasivaStore.getState();
  // KIT e14-prescan-warp-lado-v1: lado máximo de la SALIDA del warp — leído
  // UNA vez por corrida. Default 4032 = byte-idéntico (default del worker);
  // 1920 = remedio de los hard-kill «warp» (el coste del warpPerspective
  // escala con los píxeles de salida, no de entrada).
  // KIT e14-gama-adaptativa-v1 (D74): lectura EFECTIVA — en gama BAJO/MEDIO
  // adaptativa el plan baja el lado (1920/2560) SIN pisar un override manual
  // del dueño; flag OFF ⇒ el flag puro de siempre.
  const warpLado = flagsMasivaEfectivos().prescanWarpLado;
  // R1 — kill-switch del dueño: flag OFF ⇒ byte-idéntico a hoy
  if (!leerFlags().prescanQrCola) {
    store.iniciar();
    return;
  }
  // Observabilidad del dueño — eco de la config REAL de esta corrida (la
  // lectura de overrides de localStorage ocurre AQUÍ, en vivo). Diagnóstico
  // pactado: si esta línea no muestra los overrides del dueño, el navegador
  // está corriendo código viejo (pestaña sin recargar tras el deploy / SW en
  // waiting del banner E-04) — NO es un problema de flags ni del prescan.
  logger.info(
    `[e14] prescan-qr corrida warpLado=${warpLado} presupuesto=${flagsMasivaEfectivos().prescanQrPresupuestoMs}`,
  );
  // R2 — cola ya corriendo (iniciar() es singleton no-op, igual hoy)
  if (store.corriendo) {
    store.iniciar();
    return;
  }
  // R3 — objetivo: solo PENDIENTE vivas; PROCESAR IGUAL manda SIEMPRE
  const objetivo = objetivoPrescan(useMasivaStore.getState().filas);
  if (objetivo.length === 0) {
    store.iniciar(); // idempotente, como hoy
    return;
  }
  // D30 (kit e14-qr-heredado-v1) — TODAS las filas objetivo ya traen payload
  // del sondeo de ingesta (fila.qrPrevio): no hay NADA que pre-escanear →
  // saltarse el BOOT del worker OpenCV (wasm ~10 MB — segundos en frío y RAM
  // por nada) y entrar directo a Fase 3. La clasificación temprana de estas
  // filas ya vivió en cadenaDedup y el «registrar» lo firma la capa 0 con el
  // payload heredado (re-chequeo e71). Lotes mixtos: el skip por fila sigue
  // vivo abajo (D30 en el loop R5).
  if (objetivo.every((f) => f.qrPrevio != null)) {
    logger.info(
      `[e14] prescan-qr: ${objetivo.length} fila(s) con payload heredado del sondeo — boot omitido (D30)`,
    );
    store.iniciar();
    return;
  }
  corriendoModulo = true;
  emitir({ corriendo: true, total: objetivo.length, listo: 0, leidos: 0, fase: "boot" });
  let leidos = 0;
  const cliente: ClientePrescan = crearClientePrescan(); // R4
  try {
    if (!(await cliente.listo())) {
      // Abort honesto (§G): worker no bootea → flujo de HOY byte-idéntico.
      logger.info("[e14] prescan-qr: lector no disponible — flujo de hoy (abort honesto)");
    } else {
      emitir({ fase: "sondeo" });
      // R5 — FASE 1+2: por fila, EN ORDEN FIFO (for...of, serial, RAM móvil)
      let procesadas = 0;
      for (const fila of objetivo) {
        // D30 (kit e14-qr-heredado-v1) — la fila ya lleva el payload del
        // SONDEO de ingesta (fila.qrPrevio): su clasificación temprana ya
        // vivió en cadenaDedup (mapaSondeoPayload → DUPLICADA / YA-ENVIADA /
        // registrar) y re-decode+detect+warp sería trabajo REPETIDO (el
        // banner «SONDEANDO QR… k/N» se reduce a lo que de verdad falta).
        // El «registrar» que aquí se omitiría lo firma la capa 0 con el
        // payload heredado (runner conExclusionMutua — re-chequeo e71).
        // Cuenta como leído (lo fue — por el sondeo). Anti-zombi intacto:
        // el stamp solo vive en filas vivas (patchFila no-op en muertas).
        if (fila.qrPrevio != null) {
          procesadas++;
          leidos++;
          continue;
        }
        emitir({ listo: procesadas, leidos }); // «SONDEANDO QR… k/N»
        try {
          // Bytes originales: duermen en IDB (RegistroMasiva.archivo) —
          // NO hay `fila.file` en RAM (kit R5 dice fila.file; el gesto real
          // del repo es leerRegistro — desviación M-e107-2 del REPORTE).
          const reg = await leerRegistro(fila.id);
          const blob = reg.archivo;
          if (!blob) continue; // sin bytes → PENDIENTE (Fase 3)
          // Decode rápido respetando EXIF (kit R5 — imageOrientation).
          const bitmapFull = await createImageBitmap(blob, {
            imageOrientation: "from-image",
          }).catch(() => null);
          if (!bitmapFull) continue; // corrupto/HEIC raro → PENDIENTE (§G)
          let payload: string | null = null;
          try {
            const bitmap400 = await downscaleLado(bitmapFull, DETECT_LONG_SIDE).catch(
              () => null,
            );
            if (bitmap400) {
              const quad = await cliente.detectar(bitmap400); // bitmap400 transferido
              if (quad) {
                // bitmapFull TRANSFERIDO aquí (detached — close() de abajo
                // es no-op honesto); el warp sale SIN rotar (Anexo 1).
                const warped = await cliente.warpar(bitmapFull, quad, warpLado);
                if (warped) {
                  try {
                    payload = await leerQrDeWarped(warped);
                  } finally {
                    try {
                      warped.close();
                    } catch {
                      /* noop */
                    }
                  }
                }
              }
            }
          } finally {
            try {
              bitmapFull.close(); // no-op si fue transferido (detached)
            } catch {
              /* noop */
            }
          }
          // Anti-zombi: la fila pudo morir (quitar/vaciar) durante el sondeo
          // — el write del pre-scan exige fila VIVA y PENDIENTE (§G).
          const viva = useMasivaStore.getState().filas.find((f) => f.id === fila.id);
          if (!viva || viva.estado !== "PENDIENTE") continue;
          const veredicto = await clasificarPayloadPrescan(payload, fila.id, DEPS_CLASIFICADOR);
          await aplicarVeredictoPrescan(fila.id, veredicto, payload, DEPS_ESCRITURA);
          if (payload) leidos++;
        } catch {
          /* fila sigue PENDIENTE — JAMÁS descartar (regla de oro 4) */
        } finally {
          procesadas++;
        }
      }
      emitir({ listo: procesadas, leidos });
    }
  } finally {
    // R6 — el worker del pre-scan muere SIEMPRE al terminar (RAM).
    cliente.destruir();
    emitir({ corriendo: false, fase: "fin", leidos });
    corriendoModulo = false;
  }
  // R7 — FASE 3: tM() con la lista ya filtrada. ÚNICO punto de contacto
  // (flag OFF / abort honesto: iniciar() del flujo de hoy byte-idéntico).
  useMasivaStore.getState().iniciar();
}
