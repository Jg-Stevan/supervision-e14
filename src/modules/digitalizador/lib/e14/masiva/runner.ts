"use client";

/**
 * KIT e14-carga-masiva-v1 (T2): motor SECUENCIAL del módulo MASIVA — UNA
 * foto a la vez, SIEMPRE. Por qué secuencial y no en paralelo: el OCR es
 * wasm mono-hilo (GH Pages sin SAB — AUDITORIA §2); dos OCR en paralelo se
 * reparten el mismo CPU → NO hay ganancia y la UI sí sufre. Secuencial =
 * throughput máximo real (~1 acta / 15-18 s → 100 actas ≈ 25-30 min).
 *
 * REGLA DE ORO (kit §0): llama getBridge().escanearActa(...) igual que la
 * app normal — MISMO pipeline, MISMO gate, MISMO desenlace. Nunca escribe
 * actaActual, nunca navega vistas, NUNCA simula. La orquestación vive aquí;
 * el store del flujo normal solo ve las 3 acciones de integración (T3).
 */
import { getBridge } from "../get-bridge";
// KIT e14-masiva-ux-v1 (T4): tipo con el presupuesto de timeout opcional
// (intersección LOCAL en el bridge — kit §1 prohíbe tocar bridge.ts).
// D66 — KIT e14-decode-unico-precalor-v1: el prefetch (D61) se RE-APUNTA —
// ya no calienta la memo del original (el pipeline ya no la consume: recibe
// el MASTER) sino que asegura el master de N+1 vía el precalor (T3.6/T3.1).
import { type OpcionesEscaneoConTimeout } from "../scanner-core-bridge";
// D66 — KIT e14-decode-unico-precalor-v1 (T1/T3): maestro único a escala de
// trabajo + precalor de la cola (consumo T3.3 + prefetch re-apuntado).
import { maestroDeImagen, type MaestroImagen } from "./archivos";
import { asegurarMaestro, consumirMaestro, descartarMaestro } from "./precalor";
import { useE14Store } from "@/modules/digitalizador/store/store-e14";
import { guardarRegistro, leerRegistroRaw } from "./cola";
import {
  enviadaPorPayload, // e65b — KIT e65b-historico-enviadas-v1 (T-4): capa 0 contra el histórico
  marcarYaEnviada, // e65b (T-4): marca YA-ENVIADA vía "payload" (exportada en T-2d)
  originalQrDePayload,
  registrarEnviadaHistorico, // e65b — KIT e65b-historico-enviadas-v1 (T-3): hooks de envío
  registrarQrPayload,
} from "./store";
// R8 — SPLIT del store (etapa 2): el runner ya NO importa useMasivaStore —
// consume el mini-store por INYECCIÓN (store.ts → cablearStoreMasiva; fin
// del ciclo store↔runner↔precalor). El resto de helpers del store sigue
// importándose de ./store hasta su propio split (dedup-marcas/dedup-índice).
import { storeMasiva } from "./store-api";
import { clasificarOrigenDeArchivo, type OrigenVeredicto } from "./origen"; // D63-A — detector de origen (kit e63a-origen-escaneo-v1)
// WAVE3 §B — ORDEN-WAVE3-remoto-rescate-obs-v1: predicado PURO del rescate
// anti-falso-rechazo (RECHAZADA-BAJO intermitente — reintento, no rotaciones).
import { procedeRescateRechazo } from "./rescate";
// WAVE3 §A.3 — ORDEN-WAVE3-remoto-rescate-obs-v1: cliente del ledger REMOTO
// (módulo aparte con inyección de fetch — cero fetch suelto en runner).
import {
  consultarEnvioRemoto,
  origenActual,
  registrarEnvioRemoto,
  sha256HexDeTexto,
} from "./ledger-remoto";
// §G.2 — ORDEN-WAVE3-add-envio-individual-v1: la red del momento del envío
// (parche D61 — envioRedTipo/envioDownlinkMbps junto al envioMs existente).
import { redActual } from "../obs/dispositivo";
import { preProcesoEscaneo, type PreProcesoEscaneo } from "./deskew"; // D63-B — pre-proceso de escaneos (kit e63b-deskew-escaneo-v1)
import { paginaDeActa, tituloDeActa, type FilaMasiva, type RegistroMasiva } from "./tipos";
import type { Acta, EtapaAnalisis } from "../types";
// SPLIT C1 (refactor/runner-logger-v1 — movimiento puro): la infra del
// orquestador vive en runner-*.ts (imports UNIDIRECCIONALES — los
// runner-*.ts no se importan entre sí; detalle en
// docs/REPORTE-runner-logger-v1.md). Las líneas ANCLADAS por QA
// (WATCHDOG_*_MS, RELECTURA_TOPE_MS, mutexDedup/conExclusionMutua,
// reutilizarResultado*, bloque capa-0, relectura conTope, bucle del pool,
// iniciar/pausar/rearrancar) permanecen AQUÍ — los harnesses
// scripts/qa-*.ts grepean este archivo.
import { hacerThumb } from "./runner-thumbs";
import { esperarDesenlaceOriginal } from "./runner-dedup";
import {
  actaTimeoutWatchdog,
  correrIntento,
  esVeredictoTimeout,
  etapaDeSenal,
  matarYRecrearWorkers,
} from "./runner-watchdog";
import { marcarFila, marcarVida, vidaDe, vidas } from "./runner-vida";
// D34 — KIT e14-metricas-corrida-v1: observador PASIVO de tiempos por acta
// (corrida inicia/fin + desenlace LISTA/ERROR + copia) — fire-and-forget,
// el pipeline NUNCA cambia por esto (metricas.ts §0).
import {
  cerrarCorridaMetrica,
  iniciarCorridaMetrica,
  registrarMetricaCopia,
  registrarMetricaDesenlace,
  registrarMetricaEnvioRound, // D45 — la publicación al monitor aterrizó (re-put idempotente)
  registrarMetricaError,
} from "./metricas";
import { logger } from "../../logger";
// e63f — KIT e63f-autoenvio-v1 (F2): re-lectura interna pre-«repetir-primero».
// Lógica pura en masiva/relectura.ts (testeable headless); aquí solo la
// orquestación: re-OCR del MISMO bitmap (reconocerTexto — cap fino) +
// re-clasificar con la base divipol.
import { clasificarCabecera } from "../clasificador";
import { cargarDivipol } from "../divipol";
import { desenlaceTrasRelectura, procedeRelecturaInterna } from "./relectura";
// e63k — KIT e63k-capa2-identidad-v1 (F1.4): CAPA 2 de dedup por IDENTIDAD
// impresa (código 1D consensuado — identidad.ts es lógica pura; aquí solo
// la orquestación post-OCR, punto ÚNICO del kit).
import { identidadDeActa, type IdentidadActa } from "./identidad";
// e63g — PLAN e63g-e63h-ruta-unica (E1/F0): tope de la re-lectura interna —
// tríada {vencido} | {valor} | {error}, jamás throw (tope.ts es lógica
// pura; aquí solo la orquestación del bloque relectura).
import { conTope } from "./tope";
// e63m — KIT e63m-capa0-qr-identidad-v1 (F2): CAPA 0 IDENTIDAD QR PRE-OCR
// (identidad-qr.ts es núcleo puro + wrapper DOM; aquí solo la orquestación
// pre-OCR — punto ÚNICO del kit, ANTES de despachar OCR). El capture sale
// de la vía del pipeline (fileToCaptureDataUrl — la MISMA que midió el
// banco #72; jsQR 1.4.0 vendido byte-idéntico en vendor/jsQR.js).
import { fileToCaptureDataUrl } from "@jg-stevan/scanner-core/image-processor";
import { decodificarQrDeCapture, esperarDesenlaceQr } from "./identidad-qr";
// R8 — re-apuntado directo al módulo canónico (fin del re-export temporal
// de R7b: identidad-qr ya no re-exporta qrCorto).
import { qrCorto } from "../qr-zxing";
// KIT e14-gama-adaptativa-v1 (D74) — capa adaptativa de gama: el tier BAJO/
// MEDIO detectado aplica SOLO presupuestos de recursos (pool/watchdog/QR);
// el override manual del dueño manda y el flag masivaAdaptativoGama=false
// vuelve todo byte-idéntico a hoy.
import { flagsMasivaEfectivos, planGamaActual } from "../gama";
import { leerFlags } from "../flags";
import { decodificarQrCapa0Worker } from "./capa0-qr.client"; // D40 — KIT e14-capa0-qr-worker-v1

// ─── D65 — KIT e14-progreso-watchdog-dedup-v1 (T1): WATCHDOG HUMANO ───
// Antes (e14-masiva-ux-v1 T4): presupuesto ÚNICO de 120 s — un colgado moría
// CIEGO una vez (informe 20261020-122235: 3 actas ~175 s, 8.7 min de cola
// congelada, `tiempos: null` sin etapa ni duración — el «se detiene a medio
// camino»). Ahora cada INTENTO tiene presupuesto propio y UN reintento:
const WATCHDOG_MS = 75_000;
const WATCHDOG_INTENTOS = 2;
const WATCHDOG_GRACIA_MS = 5_000;
// · WATCHDOG_MS (75 s) — presupuesto de CADA intento: el pipeline real mide
//   ~21 s total (OCR 12.5-22.6 s domina); 75 s ≈ 3× el peor caso real — un
//   intento que lo vence ya no es lentitud, es un colgaje. El flujo
//   individual sigue en 15 s (default de escanearActa — intacto).
// · WATCHDOG_INTENTOS (2) — intento original + 1 REINTENTO automático del
//   MISMO procesado ya iniciado por el dueño (NO re-encola nada nuevo — D45
//   intacto; criterios/score intactos). Al vencer: etapa capturada, workers
//   del intento muertos y re-creados (detección OpenCV + OCR RapidOCR), y
//   UN relanzamiento. Si el reintento también vence → MISMO veredicto de
//   hoy (ILEGIBLE - TIEMPO DE PROCESADO EXCEDIDO, score 0) con trazas
//   watchdog/etapaAlMorir/elapsedMs persistidas (T1.4 — nada de inventar).
// · WATCHDOG_GRACIA_MS — gracia de la carrera EXTERNA sobre WATCHDOG_MS:
//   cubre colgajes FUERA del bridge (origen/pre-proceso) que su timeout no ve.

// ─── e63g — PLAN e63g-e63h-ruta-unica (E1/F0): TOPE DE LA RE-LECTURA ───
// La re-lectura interna (e63f F2) corre FUERA del watchdog D65 (solo
// presupuesta el pipeline del intento): un colgaje de reconocerTexto ahí
// dejaba la cola esperando PARA SIEMPRE (sin veredicto, sin error, sin
// reintento posible — agujero latente desde e63f; no disparó en 181622).
// Presupuesto PROPIO y SEPARADO del watchdog: 45 s ≈ 2× el peor caso real
// del re-OCR a cap fino (~22 s) — vencido eso ya no es lentitud, es
// colgaje. Vencido: workers muertos y re-creados (misma infraestructura
// del watchdog), veredicto de la 1.ª lectura INTACTO y CERO reintentos.
const RELECTURA_TOPE_MS = 45_000;

/** KIT e14-gama-adaptativa-v1 (D74) — presupuesto del intento EFECTIVO:
 *  WATCHDOG_MS (75 s) se calibró con el peor caso del dueño (PC — el p95
 *  real de RECHAZADA-BAJO medía 30-46 s); en gama BAJO/MEDIA el p95 puede
 *  rozarlo y un kill FALSO paga workers muertos + re-OCR completo (coste
 *  doble) por «lentitud» que no era colgaje. Con el flag adaptativo ON el
 *  presupuesto se escala por tier (MEDIO 90 s · BAJO 105 s); flag OFF /
 *  ALTO ⇒ la base. La CONSTANTE queda byte-idéntica (ancla QA RED LINE 3
 *  qa-watchdog-relectura/qa-qr-identidad) y manda como PISO — el plan solo
 *  puede ESCALAR hacia arriba (jamás acorta el presupuesto histórico):
 *  este wrapper escala los 2 puntos de consumo de abajo (timeoutMs del
 *  bridge + carrera externa). */
function watchdogMsEfectivo(): number {
  return Math.max(WATCHDOG_MS, planGamaActual().watchdogMs);
}

let corriendoFlag = false;
let stopFlag = false;
// WAVE3 §B — rescate anti-falso-rechazo: rescates YA LANZADOS en ESTA
// corrida (techo MAX_RESCATES_CORRIDA — kit §B.1). Se reinicia en
// iniciarRunner (cada corrida arranca de cero).
let rescatesCorrida = 0;
// e71 (Opt-3): el throttle del progreso pasa a POR-FILA (campo ultimoEn de
// VidaFila) — con 2 actas en vuelo cada una lleva SU cadencia de 250 ms.
// e63g FASE 1: ¿el dueño arrancó la cola ALGUNA VEZ en esta sesión? El
// re-arranque tras el swap temp→id solo procede en sesión viva (D45
// intacto: encolar en sesión fría JAMÁS procesa por sí solo).
let colaSesionIniciada = false;

// ─── e71 (Opt-3) — PARALELISMO + EXCLUSIÓN MUTUA (kit e71-consolidación) ───
/** Actas EN VUELO simultáneas. HISTORIA: e71 nació con 2 (benchmark del
 *  dueño); D31 — KIT e14-carril-qr-paralelo-v1 — baja el DEFAULT a 1: el
 *  OCR es wasm mono-hilo (GH Pages sin SAB — AUDITORIA §2), dos OCR en
 *  paralelo se reparten el mismo CPU → NO hay ganancia y la UI sí sufre
 *  (cabecera de este archivo). El slot liberado lo ocupa el CARRIL QR del
 *  prescan (prescanYIniciar — Fase 3 ANTES que Fase 1+2): mientras UNA acta
 *  paga su OCR completa, el prescan lee el QR del RESTO de la cola y marca
 *  DUPLICADA/YA-ENVIADA temprano — esas filas jamás llegan a pagar OCR.
 *  El override manual del dueño (e14-flags-overrides / flags.json
 *  `poolWorkers: 2`) restaura el pool doble de e71 byte-idéntico.
 *  KIT e14-gama-adaptativa-v1 (D74): el valor es EFECTIVO y se lee POR
 *  CORRIDA en bucle() (antes const de módulo — el plan puede refrescarse
 *  al montar MASIVA): en gama BAJO adaptativa baja a 1 — ídem arriba. El
 *  override manual del dueño MANDA (flagsMasivaEfectivos no pisa claves de
 *  e14-flags-overrides). */
function procesamientoConcurrenteEfectivo(): 1 | 2 {
  return flagsMasivaEfectivos().poolWorkers;
}

/** Filas RESERVADAS por el pool: nace ANTES de disparar el pipeline y
 *  muere en el finally del vuelo — cierra la ventana entre
 *  siguientePendiente() y el marcarFila(PROCESANDO) de procesarUno (sin
 *  reserva, el segundo worker tomaría la MISMA fila). */
const reservadas = new Set<string>();

// ─── C5 — DUPLICADAS APARCADAS (espera del dedup sin bloquear el pool) ────
// La rama DUPLICADA de procesarUno APARCA una copiable cuya original NO va
// delante en la FIFO (guard agregadaEn — ver el bloque C5 allí): el id entra
// AQUÍ y siguientePendiente lo salta (el slot del pool queda LIBERADO). El
// FIN DE LA OLA (bucle) RE-VISITA las aparcadas: copia si la original
// aterrizó durante la ola, o fallback honesto a PENDIENTE (reproceso) —
// cada aparcada se resuelve UNA vez (jamás reaparca: sin bucles). El set
// muere en esa re-visita; si la ola muere antes (pausa), la próxima ola (o
// rearrancarTrasEncolar) la re-visita igual.
const dedupAparcadas = new Set<string>();

/** Reset SOLO-TEST (masiva-caracterizacion.test.ts) — knip tiene los
 *  *.test.ts como entry (cero export muerto; mismo precedente de
 *  historico.__resetIndicePayloadParaTest). */
export function __resetAparcadasDedupParaTest(): void {
  dedupAparcadas.clear();
}

/** Mutex simple (kit Opt-3: «Mutex simple o encolar la verificación de
 *  dedup en un solo hilo») — promesa-cadena FIFO: cada sección crítica se
 *  encola detrás de la anterior y JAMÁS se intercala. Solo la protege lo
 *  que decide/marca dedup; el OCR y el precalor quedan FUERA (paralelos de
 *  verdad). */
let mutexDedup: Promise<void> = Promise.resolve();

async function conExclusionMutua<T>(seccion: () => Promise<T>): Promise<T> {
  const anterior = mutexDedup;
  let liberar!: () => void;
  mutexDedup = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  await anterior;
  try {
    return await seccion();
  } finally {
    liberar();
  }
}

function motivoCorto(err: unknown): string {
  const crudo = err instanceof Error ? err.message : String(err);
  const corto = crudo.replace(/\s+/g, " ").trim().slice(0, 48);
  return (corto || "ERROR DEL PIPELINE").toUpperCase();
}

/** Siguiente PENDIENTE o DUPLICADA (FIFO por agregadaEn) — el ORDEN vive en
 *  las filas livianas (mini-store), los DATOS viven en IDB (leerRegistro
 *  uno-a-uno). Las filas temporales (copia a IDB aún en vuelo — «GUARDANDO
 *  N…») se saltan: su id real llega al resolver agregarLote y el loop las
 *  toma en la siguiente pasada. KIT e14-masiva-tiempos-v1 (PR-1): las
 *  DUPLICADAS ENTRAN al loop — su procesamiento es la copia rápida (<1 s).
 *  e65-dedup-enviadas-v1 (T-5, D-e65-7): YA-ENVIADA JAMÁS entra — es
 *  SOLO-VISUAL (sin acta propia, sin envío): el filtro de abajo solo toma
 *  PENDIENTE/DUPLICADA, verificación del kit (cero código de runner). */
export function siguientePendiente(): FilaMasiva | null {
  const pendientes = storeMasiva()
    .getState()
    .filas.filter(
      (f) =>
        (f.estado === "PENDIENTE" || f.estado === "DUPLICADA") &&
        !f.id.startsWith("masiva-temp-") &&
        // e71 (Opt-3): una fila RESERVADA por otro worker del pool jamás
        // se toma dos veces (la reserva nace ANTES del pipeline y muere en
        // el finally del vuelo).
        !reservadas.has(f.id) &&
        // C5: las APARCADAS (original detrás en FIFO) no se toman — su
        // slot quedó liberado; el FIN DE LA OLA las re-visita.
        !dedupAparcadas.has(f.id),
    )
    .sort((a, b) => a.agregadaEn - b.agregadaEn);
  return pendientes[0] ?? null;
}

/** KIT e14-masiva-tiempos-v1 (PR-1): la fila DUPLICADA REUTILIZA el resultado
 *  de su original (kit §2 — copia registro+status+thumb, sin pipeline, sin
 *  contadores: el desenlace del acta gemela YA fue registrado con la
 *  original). El acta copiada se RE-IDENTIFICA con el id de ESTA fila
 *  (contrato de sincronizarAlVolver: acta.id === id de la fila abierta).
 *  Devuelve false ante CUALQUIER falta (original quitada/ERROR/sin acta) →
 *  la fila cae al reproceso completo — jamás inventar. */
async function reutilizarResultado(fila: FilaMasiva, t0: number): Promise<boolean> {
  // e71 (Opt-3): leer original → decidir status → escribir copia es
  // SECCIÓN CRÍTICA de dedup — en el mutex JAMÁS se intercala con otra
  // verificación/marca (capa 0 / capa 2 / ingesta) aunque haya 2 actas en
  // vuelo. El cuerpo vive intacto en reutilizarResultadoCritica.
  return conExclusionMutua(() => reutilizarResultadoCritica(fila, t0));
}

async function reutilizarResultadoCritica(fila: FilaMasiva, t0: number): Promise<boolean> {
  if (!fila.dupOf) return false;
  // e72 — reloj de la COPIA en sí (lecturas+writes+thumb): alimenta el
  // totalMs PROPIO de la copia (abajo) — el duplicado muestra SU consumo en
  // el informe, no el del original (criterio del dueño e72).
  const tCopia = Date.now();
  try {
    // D41 — lecturas RAW: la copia no consume dataURLs del acta (las fotos
    // viajan como Blobs del original — abajo); el par materializar↔compactar
    // (FileReader + atob de 2-16 MB por registro, main thread) se elimina de
    // la marca de dedup MÁS frecuente del pipeline.
    const [registro, original] = await Promise.all([
      leerRegistroRaw(fila.id),
      leerRegistroRaw(fila.dupOf),
    ]);
    const actaOrigen = original.acta;
    if (!actaOrigen) return false; // original sin desenlace (ERROR/en vuelo)
    if (!storeMasiva().getState().filas.some((f) => f.id === fila.id)) return false;
    const actaCopia = { ...actaOrigen, id: fila.id };
    // e66 (P2) — la gemela ya NO hereda el desenlace de envío de la original:
    // · status DUPLICADA (valor NUEVO al FINAL de ActaStatus): su desenlace es
    //   una COPIA — cero pipeline propio, cero envío propio (el envío real
    //   vive SOLO en la original). Antes heredaba ENVIADA/OPTIMA y corrompía
    //   porStatusActa, los conteos de envío y el historial.
    // · diagnostico.status DUPLICADA + enviadoAutomaticamente null (plan P2
    //   literal) — el informe nunca la contará como envío exitoso.
    // e71 (P2.1) — la copia HEREDA el desenlace del ORIGINAL (kit e71:
    // «duplicado de una rechazada → RECHAZADA, no DUPLICADA» — el informe
    // debe mostrar RECHAZADA: 2, no DUPLICADA):
    // · original ENVIADA/OPTIMA (desenlace de envío) → DUPLICADA (regla e66
    //   intacta — la copia es un doble del enviado).
    // · original RECHAZADA o CON rechazo → RECHAZADA heredada: el rechazo y
    //   el score ya viajan en el spread de actaOrigen — aquí solo el status
    //   (el informe la cuenta en su rechazo real, jamás como «duplicada»).
    // · resto (ADVERTENCIA / EN_REVISION_HUMANA sin rechazo) → DUPLICADA:
    //   copia de un desenlace final propio (doctrina e66 — sin envío heredado).
    const originalEnviada = actaCopia.status === "ENVIADA" || actaCopia.status === "OPTIMA";
    const copiaRechazada = !originalEnviada && !!actaCopia.rechazo;
    actaCopia.status = copiaRechazada ? "RECHAZADA" : "DUPLICADA";
    if (actaCopia.diagnostico) {
      actaCopia.diagnostico.status = actaCopia.status;
      // e66 (P3.4) — esperaMs PROPIO de la fila duplicada (t0 − agregadaEn),
      // NO el heredado de la original: la media de espera del informe ya no
      // cuenta la espera de la original DOS veces. ≥ 0 defensivo (D57 T1).
      if (actaCopia.diagnostico.tiempos) {
        actaCopia.diagnostico.tiempos.esperaMs = Math.max(0, t0 - fila.agregadaEn);
        // e72 — TIEMPOS PROPIOS de la copia (criterio del dueño: el segundo
        // del mismo archivo NO debe mostrar OCR): totalMs = la copia en sí
        // («casi 0» — la espera vive en esperaMs de arriba; totalMs jamás
        // incluye espera, contrato del informe) y ocrMs = 0 EXPLÍCITO (la
        // copia JAMÁS paga OCR — guard e72). El resto (procesoMs/calidadMs…)
        // queda heredado: describe el pipeline que produjo el desenlace
        // copiado (nulls jamás inventados).
        actaCopia.diagnostico.tiempos.totalMs = Date.now() - tCopia;
        actaCopia.diagnostico.tiempos.ocrMs = 0;
      }
    }
    actaCopia.enviadoAutomaticamente = null;
    // e63k (F1.4): derivar la serie del acta COPIADA (la gemela ES el mismo
    // papel — misma identidad). El mapa de identidad de futuras filas
    // también cubre gemelas copiadas.
    const serieCopia = identidadDeActa(actaCopia)?.serie ?? null;
    const registroListo: RegistroMasiva = {
      ...registro,
      estado: "LISTA",
      acta: actaCopia,
      thumb: original.thumb,
      // D59 — KIT e14-info-acta-filas-v1 (T2): la gemela ES el mismo acta →
      // mismo título (honesto — copia el desenlace, copia la info).
      infoTitulo: tituloDeActa(actaCopia),
      hashDedup: registro.hashDedup,
      dupOf: fila.dupOf,
      serie: serieCopia, // e63k — identidad de la copia (null = sin consenso, honesto)
      // D41 — las fotos del original viajan como BLOBS (nunca dataURLs):
      // hoy las dataURLs materializadas del acta original re-entraban a
      // compactarRegistro (atob de 2-16 MB) para volver a ser Blobs. Neto
      // byte-idéntico: compactarRegistro sigue aplicando el cleanup §3
      // (DUPLICADA → fotoOriginalBlob fuera) y los registros legacy pre-e68
      // (dataURLs dentro del actaOrigen) se compactan igual al guardar.
      ...(original.fotoOriginalBlob
        ? { fotoOriginalBlob: original.fotoOriginalBlob }
        : {}),
      ...(original.fotoProcesadaBlob
        ? { fotoProcesadaBlob: original.fotoProcesadaBlob }
        : {}),
    };
    await guardarRegistro(registroListo);
    // e66 (D-e66-2) — REVERSA de e65b T-3b (mandato del plan P2): la gemela
    // REUTILIZADA ya NO alimenta el LEDGER histórico (el historial registra
    // SOLO envíos reales). Re-encolado de la gemela sigue protegido: su
    // payload-QR es el MISMO de la original (igualdad EXACTA, capa 0) y su
    // dhash cae dentro de la cinta cierta de la ENTRADA ya registrada de la
    // original (≤ 6) → YA-ENVIADA igual, cero re-OCR.
    const ms = Date.now() - t0;
    logger.info(
      `[e14] dedup fila=${fila.id} dupOf=${fila.dupOf} reutiliza status=${actaCopia.status} score=${actaCopia.score ?? "-"} ms=${ms}`,
    );
    marcarFila(fila.id, {
      estado: "LISTA",
      statusActa: actaCopia.status, // e66 — DUPLICADA (ya no ENVIADA heredada)
      score: actaCopia.score,
      nivel: actaCopia.clasificacion?.nivel ?? null,
      pagina: paginaDeActa(actaCopia),
      infoTitulo: tituloDeActa(actaCopia), // D59 — KIT e14-info-acta-filas-v1 (T2)
      motivo: actaCopia.rechazo?.tipo ?? null,
      thumb: original.thumb,
      // e66 — DUPLICADA jamás es envío propio (plan P2): enviadaAuto=false
      // explícito — el ÚNICO productor de enviadaAuto=true sigue siendo el
      // desenlace real del pipeline (actaDesenlace, línea de abajo).
      enviadaAuto: false,
      envioEnCola: actaCopia.hashSha256 === "EN COLA",
      serie: serieCopia, // e63k — el mapa de identidad cubre gemelas copiadas
      error: null,
    });
    // D34 — métricas: la COPIA jamás pagó pipeline (guard e72) — totalMs
    // propio ≈0 y ocrMs=0 EXPLÍCITO como datos reales; etapas heredadas
    // quedan FUERA (no son trabajo de esta fila).
    registrarMetricaCopia({
      filaId: fila.id,
      nombre: fila.nombre,
      status: actaCopia.status,
      score: actaCopia.score,
      totalMs: actaCopia.diagnostico?.tiempos?.totalMs ?? null,
      esperaMs: actaCopia.diagnostico?.tiempos?.esperaMs ?? null,
      ocrMs: actaCopia.diagnostico?.tiempos?.ocrMs,
      dedup: registro.dedup,
      tsInicio: t0, // D44-R3 — el turno de la copia también es turno (solape)
    });
    return true;
  } catch {
    return false; // original fuera de la cola / IDB caído → reprocesa completo
  }
}

// ─── R8 · SPLIT de procesarUno (misión punto 3) — CTX EXPLÍCITO ───────────
// El orquestador (procesarUno) conserva: prólogo (rama DUPLICADA + precalor),
// el ÚNICO try/catch/finally (jamás tumbar la cola) y las estampadas del
// post-mortem hasta su unificación (stage 5). Cada STAGE es una función con
// el contexto explícito CtxProcesarUno: recibe ctx y devuelve ctx NUEVO
// (inmutable enriquecido — jamás muta el que recibe) o resuelto:true cuando
// el desenlace quedó resuelto sin seguir al pipeline (reutiliza/ya-enviada/
// guard M8/dedup contenido). Los stages viven EN ESTE archivo porque las
// anclas QA grepean runner.ts (caracterización §E — PROHIBIDO moverlas).
interface CtxProcesarUno {
  // Insumos del orquestador (ningún stage los cambia).
  fila: FilaMasiva;
  archivo: File | null; // File garantizado tras el guard del try (CtxPipeline)
  registro: RegistroMasiva | null; // leído de IDB al entrar al try (CtxPipeline)
  esperaMs: number; // D57 — espera en cola → tInicio
  tsDespacho: number | null; // D44-R3
  tPreOcrIntento: number; // cronómetro del muro pre-OCR (se re-arma por intento)
  entradaPrecalor: { maestro: MaestroImagen; precalorMs: number } | null;
  // STAGE 1 — capa 0 QR (faseCapa0Qr).
  qrPayload: string | null; // e63m — llave OPACA (RED LINE 10)
  qrEstadoCapa0: "leido" | "sin-payload" | null; // e64-qr T-0.2 (SOLO-VISUAL)
  qrHeredado: boolean; // D44-R2 — heredó qrPrevio (sin decode ni ladder)
  preOcrQrMs: number | null; // D44-R1 — el bloque capa-0 entero
  // STAGE 2 — pipeline de intentos (fasePipelineIntentos).
  preOcrMs: number | null; // D43 — el muro pre-OCR (null = jamás llegó al bridge)
  preOcrOrigenMs: number; // D63-A por intento (acumula reintentos)
  preOcrDeskewMs: number; // D63-B ídem
  preOcrMasterMs: number; // D66 ídem
  preOcrPasadas: number; // D44-R4 — pasadas del muro (1 = sin reintento)
  watchdogUsados: number; // D65 (T1.4)
  etapaAlMorir: string | null;
  elapsedMuerteMs: number | null;
  rescateLanzado: boolean; // WAVE3 §B — máx 1 por fila
  veredictoOrigen: OrigenVeredicto | null; // D63-A (del ÚLTIMO intento)
  preProceso: PreProcesoEscaneo | null; // D63-B (ídem)
  actaBruta: Acta | null; // desenlace crudo del pipeline (o acta de timeout)
  maestroDesenlace: MaestroImagen | null; // D66 — master que SÍ sirvió
  decodeMasterMs: number | null;
  intentoDesenlace: number;
  // STAGE 3 — desenlace (faseDesenlace: relectura + capa 2 + dedup contenido).
  actaDesenlace: Acta | null; // post re-lectura (e63f)
  relecturaDesenlace: "auto" | "sin-cambio" | null;
  relecturaToken: "auto" | "sin-cambio" | "tope" | null;
  identidad: IdentidadActa | null; // e63k capa 2
  originalIdentidad: FilaMasiva | null;
  falsoPositivoEvitado: boolean; // e63k — banda aplazada resuelta sin-match
  // STAGE 4 — envío (faseEnvio).
  actaFinal: Acta | null; // post envío (ENVIADA) o desenlace de siempre
  enviadaAuto: boolean;
}

/** Ctx DENTRO del pipeline: el try garantizó registro (leído) y archivo (File
 *  por el guard instanceof) — los stages 1-5 lo exigen no-null. */
type CtxPipeline = CtxProcesarUno & { registro: RegistroMasiva; archivo: File };

/** Resultado de UN stage: resuelto = desenlace ya resuelto (procesarUno
 *  return — el finally del orquestador limpia igual); si no, ctx enriquecido. */
type DesenlaceStage = { resuelto: boolean; ctx: CtxProcesarUno };

// ─── R8 · STAGE 1/5 — faseCapa0Qr (e63m/D30/D40/e65b) ──────────────────────
/** CAPA 0 IDENTIDAD QR PRE-OCR (punto ÚNICO del kit — ANTES de despachar OCR:
 *  det/cls/rec y la cadena dhash visual quedan río abajo) ─── El QR es DATO
 *  LEÍDO (banco #72: GO 88.2% decode, 0 colisiones, gemelas agrupan por
 *  payload EXACTO). Llave = IGUALDAD EXACTA de payload (sin umbrales, sin
 *  fuzzy — RED LINES 5/10). Decisión por el estado del original:
 *  · payload null → pipeline normal INTACTO (dhash + OCR + capa 2 e63k).
 *  · payload NUEVO → se registra (mapa del lote en store) y SIGUE normal
 *    (el ORIGINAL paga el OCR, como hoy).
 *  · payload VISTO + original con desenlace final → reutilizarResultado
 *    (maquinaria EXACTA — desenlace clonado, sin doble envío, comparten
 *    hash) con token aditivo `dedup=qr`; OCR JAMÁS se paga.
 *  · payload VISTO + original EN VUELO (PROCESANDO) → APLAZADA `capa0=qr`:
 *    espera acotada SOLO-LECTURA (QR_ESPERA_INTERVALO_MS ×
 *    QR_ESPERA_INTENTOS — sin timers globales); techo vencido →
 *    reproceso completo honesto.
 *  · Fallback sagrado: reutilizarResultado→false → pipeline completo.
 *    Dedup JAMÁS inventa: falso-positivo = NO-GO. La capa 0 JAMÁS throw
 *    (cualquier falla → sin-payload → normal).
 *  ─── D30 — KIT e14-qr-heredado-v1: HERENCIA del payload (punto ÚNICO) ───
 *  Si el SONDEO de ingesta (worker e73) o el PRE-SCAN de «PROCESAR COLA»
 *  (e107) ya leyeron el QR de ESTA fila, el payload viaja en fila.qrPrevio
 *  y la capa 0 lo HEREDA — sin fileToCaptureDataUrl (decode completo del
 *  original) ni ladder (peor caso documentado sin QR: ~15-17 s SYNC).
 *  Igualdad EXACTA del payload (Reed-Solomon — no hay «casi el mismo
 *  payload», RED LINE 10): el prescan YA confiaba en ese payload para
 *  marcar DUPLICADA/YA-ENVIADA, heredarlo para la identidad es
 *  estrictamente MENOS riesgo. Fallback sagrado: qrPrevio AUSENTE (flags
 *  OFF, abort honesto, recarga, fila sin lectura) ⇒ decode de hoy
 *  byte-idéntico. Todo el bloque de decisión consume qrPayload IGUAL que ayer.
 *  Función PURA salvo los efectos de siempre (store/IDB/logger/mapas):
 *  recibe ctx y devuelve ctx nuevo; JAMÁS muta el que recibe. */
async function faseCapa0Qr(ctx: CtxPipeline): Promise<DesenlaceStage> {
  const fila = ctx.fila;
  const archivo = ctx.archivo;
  let qrPayload: string | null = ctx.qrPayload;
  let qrHeredado = ctx.qrHeredado;
  let qrEstadoCapa0: "leido" | "sin-payload" | null = ctx.qrEstadoCapa0;
  // (bloque movido VERBATIM de procesarUno — mismo orden, mismos literales)
    const tQrCapa0 = performance.now(); // D44-R1 — el bloque capa-0 se cronometra ENTERO
    const qrPrevio = fila.qrPrevio;
    if (qrPrevio) {
      qrPayload = qrPrevio;
      qrHeredado = true; // D44-R2 — explícito: heredó (no pagó decode ni ladder)
      logger.info(
        `[e14] capa0-qr hereda-payload fila=${fila.id} nombre=${fila.nombre} (sondeo/prescan — sin re-decode)`,
      );
    } else {
      try {
        const planQr = planGamaActual();
        // D40 — KIT e14-capa0-qr-worker-v1: el carril pesado de la capa 0
        // (decode del blob + ladder + barridos + nitidez + binarizada +
        // rotaciones + rescate) corre en WORKER dedicado jsQR-only
        // (capa0-qr.worker.js — qr-pixeles.ts) — el peor caso SIN QR
        // (~15-17 s SYNC documentado en identidad-qr.ts) deja de congelar
        // el hilo UI en los dispositivos que menos lo aguantan. El tier
        // zxing (wasm — RED LINE del worker e73) queda en MAIN como
        // SOLO-rescate si el worker no leyó nada (cobertura EXACTA).
        // Kill-switch capa0QrWorker=false / feature-detect fallida /
        // hard-kill ⇒ camino de hoy byte-idéntico (decode main + cadena
        // completa con SU presupuesto de gama).
        let viaWorker = false;
        if (leerFlags().capa0QrWorker) {
          const rWorker = await decodificarQrCapa0Worker(archivo, {
            ladoLargo: planQr.qrLadoLargo,
            rescate4096: planQr.qrRescate4096,
            presupuestoMs: planQr.qrPresupuestoMs,
          });
          if (rWorker) {
            viaWorker = true;
            qrPayload = rWorker.payload;
            logger.info(
              `[e14] capa0-qr worker fila=${fila.id} nombre=${fila.nombre} tier=${rWorker.tier ?? "null"} ms=${rWorker.ms} payload=${qrPayload ? qrCorto(qrPayload) : "-"}`,
            );
            if (!qrPayload) {
              // Solo el tier que el worker no puede cargar (wasm) — sin
              // re-pagar los barridos jsQR (ya corrieron en el worker).
              const captureQr = await fileToCaptureDataUrl(archivo);
              const qrQr = await decodificarQrDeCapture(captureQr, {
                soloZxing: true,
                ladoLargo: planQr.qrLadoLargo,
                // KIT e75-qr-zoom-zbar-v1 — kill-switch del dueño (flag
                // qrZoomTl): el tier ZOOM TL + zbar es main-only, justo aquí
                // donde ya corre el otro tier wasm (cobertura aditiva).
                zoomTl: leerFlags().qrZoomTl,
              });
              qrPayload = qrQr?.payload ?? null;
            }
          }
        }
        if (!viaWorker) {
          const captureQr = await fileToCaptureDataUrl(archivo);
          // KIT e14-gama-adaptativa-v1 (D74) — la CAPA 0 recibe el plan de
          // gama: flag OFF / ALTO ⇒ {2048, rescate ON, sin presupuesto} =
          // llamada byte-idéntica a hoy. BAJO ⇒ 1600 + sin rescate 4096 +
          // presupuesto 5 s; MEDIO ⇒ 2048 + rescate + presupuesto 8 s — el
          // peor caso SIN QR (~15-17 s SYNC documentado en identidad-qr.ts)
          // deja de congelar la UI en los dispositivos que menos lo aguantan.
          const qrQr = await decodificarQrDeCapture(captureQr, {
            ladoLargo: planQr.qrLadoLargo,
            rescate4096: planQr.qrRescate4096,
            presupuestoMs: planQr.qrPresupuestoMs,
            // KIT e75-qr-zoom-zbar-v1 — kill-switch del dueño (flag qrZoomTl,
            // default true = MEJORA): ZOOM TL re-escalado + zbar antes del
            // rescate 4096 (lab: 3 páginas del escáner rescatadas).
            zoomTl: leerFlags().qrZoomTl,
          });
          qrPayload = qrQr?.payload ?? null;
        }
      } catch {
        qrPayload = null; // la capa 0 jamás tumba el pipeline (fallback limpio)
      }
    }
    // e64-qr T-0.2 — estampar el estado en la fila viva (chip de la
    // bandeja — kit literal vía actualizarFila; el mutador real del store,
    // mismo patrón de precalentada/dedup). SOLO presencia, JAMÁS payload.
    qrEstadoCapa0 = qrPayload ? "leido" : "sin-payload";
    storeMasiva()
      .getState()
      .actualizarFila(fila.id, { qrEstado: qrEstadoCapa0 });
    if (!qrPayload) {
      logger.info(`[e14] capa0-qr sin-payload fila=${fila.id} nombre=${fila.nombre}`);
    } else {
      const payloadQrCorto = qrCorto(qrPayload);
      const qrPayloadSeguro: string = qrPayload; // acotado (la closure no hereda narrowing)
      const idOriginalQr = originalQrDePayload(qrPayload);
      const originalQr =
        idOriginalQr && idOriginalQr !== fila.id
          ? (storeMasiva().getState().filas.find((f) => f.id === idOriginalQr) ?? null)
          : null;
      // Reutilización vía la maquinaria EXACTA de reutilizarResultado (la
      // fila viaja como DUPLICADA con dupOf del original). El token
      // `dedup=qr` + qrPayload se estampan DESPUÉS (post-write honesto: si
      // el fallback salta, la traza nunca mintió — reutilizarResultado ya
      // re-leyó el registro y clonó el desenlace; OCR JAMÁS se pagó).
      const reutilizarViaQr = async (o: FilaMasiva): Promise<boolean> => {
        const tQr = Date.now();
        const filaGemela: FilaMasiva = { ...fila, estado: "DUPLICADA", dupOf: o.id };
        if (!(await reutilizarResultado(filaGemela, tQr))) return false;
        try {
          // D41 — lectura RAW: spread base del re-save (dedup/qrPayload/qrEstado
          // son escalares — sin dataURLs que materializar).
          const regQr = await leerRegistroRaw(fila.id);
          await guardarRegistro({
            ...regQr,
            dedup: "qr",
            qrPayload: qrPayloadSeguro,
            // KIT e14-tiempos-v2 (D44-R2): la herencia viaja con el write.
            ...(qrHeredado ? { qrHeredado: true } : {}),
            // e64-qr T-0.2: el estado viaja con el write (sobrevive recarga).
            qrEstado: "leido",
          });
        } catch {
          /* IDB caído — la fila ya está LISTA con el desenlace (honesto) */
        }
        logger.info(
          `[e14] capa0-qr reutiliza ${payloadQrCorto} fila=${fila.id} original=${o.id}`,
        );
        return true;
      };
      if (!originalQr) {
        // e65b (T-4): payload ya ENVIADO según el HISTÓRICO (ledger —
        // sobrevive vaciar/recargas, D-e65b-1) → YA-ENVIADA sin OCR.
        // forzarDedupOff manda SIEMPRE (RL-e65b-6 — el escape del dueño es
        // sagrado). La marca viaja con aceptarProcesando: esta fila ya fue
        // marcada PROCESANDO al entrar al pipeline (M-e65b-3). Jamás se
        // apunta a sí misma (defensivo — el re-encolado nace con id nuevo).
        if (!fila.forzarDedupOff) {
          const enviadaHist = await enviadaPorPayload(qrPayload);
          if (
            enviadaHist &&
            enviadaHist.id !== fila.id &&
            (await marcarYaEnviada(
              fila.id,
              enviadaHist.id,
              "payload",
              undefined,
              undefined,
              qrPayload,
              true,
            ))
          ) {
            logger.info(
              `[e14] capa0-qr ya-enviada-historico ${payloadQrCorto} fila=${fila.id} hist=${enviadaHist.id}`,
            );
            return { resuelto: true, ctx: { ...ctx, qrPayload, qrHeredado, qrEstadoCapa0 } }; // sin OCR, sin envío — YA-ENVIADA jamás vuelve a siguientePendiente (T-5 e65)
          }
        }
        // ORIGINAL — payload nuevo en el lote (o auto-registrado: la fila ya
        // carryaba el payload de una pasada previa / entrada muerta re-apuntada).
        // e71 (Opt-3) — SECCIÓN CRÍTICA con RE-CHEQUEO: con 2 actas en vuelo,
        // DOS filas del MISMO payload podían ver el mapa vacío y registrar
        // AMBAS (Map.set sobrescribiría la original — mapa corrupto). Dentro
        // del mutex la segunda ve el registro de la primera y NO pisa: paga
        // SU OCR con desenlace propio y la capa 2 (mutexada) decide — el
        // mapa queda consistente SIEMPRE. (qrPayloadSeguro: la closure no
        // hereda el narrowing de qrPayload — misma acotación de arriba.)
        await conExclusionMutua(async () => {
          const idEnMapa = originalQrDePayload(qrPayloadSeguro);
          if (!idEnMapa || idEnMapa === fila.id) {
            registrarQrPayload(qrPayloadSeguro, fila.id);
          }
        });
        logger.info(`[e14] capa0-qr original ${payloadQrCorto} fila=${fila.id}`);
      } else if (fila.forzarDedupOff) {
        // El dueño pulsó PROCESAR IGUAL — las capas 0/1/2 lo respetan SIEMPRE
        // (misma doctrina e63k): reproceso completo, nada se reutiliza.
        logger.info(
          `[e14] capa0-qr reprocesa-completo ${payloadQrCorto} fila=${fila.id} forzarDedupOff`,
        );
      } else if (originalQr.estado === "LISTA" || originalQr.estado === "DUPLICADA") {
        // Original con desenlace FINAL → reutiliza (el OCR jamás se paga).
        if (await reutilizarViaQr(originalQr))
          return { resuelto: true, ctx: { ...ctx, qrPayload, qrHeredado, qrEstadoCapa0 } };
        logger.info(
          `[e14] capa0-qr fallback fila=${fila.id} reprocesa-completo reutilizarResultado=false`,
        );
      } else if (originalQr.estado === "PROCESANDO") {
        // Original EN VUELO → APLAZADA `capa0=qr` (maquinaria aplazada de
        // e63k con motivo NUEVO): espera acotada SOLO-LECTURA del estado.
        logger.info(
          `[e14] capa0-qr aplazada ${payloadQrCorto} fila=${fila.id} original=${originalQr.id}`,
        );
        const desenlaceQr = await esperarDesenlaceQr(() =>
          storeMasiva().getState().filas.find((f) => f.id === originalQr.id)?.estado ?? "AUSENTE",
        );
        if (desenlaceQr === "reutiliza") {
          if (await reutilizarViaQr(originalQr))
          return { resuelto: true, ctx: { ...ctx, qrPayload, qrHeredado, qrEstadoCapa0 } };
          logger.info(
            `[e14] capa0-qr fallback fila=${fila.id} reprocesa-completo reutilizarResultado=false`,
          );
        } else {
          // Techo vencido (o el original salió del vuelo por otra puerta):
          // reproceso completo HONESTO — como si no hubiera gemela.
          logger.info(
            `[e14] capa0-qr techo-vencido reprocesa-completo fila=${fila.id} original=${originalQr.id}`,
          );
        }
      } else {
        // Original sin desenlace final ni en vuelo (PENDIENTE/ERROR) →
        // reproceso completo honesto (la gemela paga SU OCR, como hoy).
        logger.info(
          `[e14] capa0-qr reprocesa-completo ${payloadQrCorto} fila=${fila.id} original=${originalQr.id} estado=${originalQr.estado}`,
        );
      }
    }
    // D44-R1 — cierre del bloque capa-0 (herencia/ladder + dedup + APLAZADA).
    const preOcrQrMs = Math.round(performance.now() - tQrCapa0);
    return { resuelto: false, ctx: { ...ctx, qrPayload, qrHeredado, qrEstadoCapa0, preOcrQrMs } };
}

/** Desenlace de UNA foto — byte a byte el pipeline real (kit §6-C: el
 *  desenlace DEBE ser idéntico al del IMPORTAR normal).
 *  D66 — KIT e14-decode-unico-precalor-v1: el pipeline recibe el MASTER
 *  (T1: un solo decodificado a escala de trabajo) — precalentado (T3.3:
 *  decode = 0 s) o recién horneado con `maestroDeImagen`; sin master →
 *  fallback HONESTO a la ruta de siempre (identidad AC-P3 intacta).
 *  WAVE2 B1: `export` SOLO-TEST (runner-rechequeo.test.ts) — el kit exige
 *  test conductual del re-chequeo post-reserva; knip tiene los *.test.ts
 *  como entry (cero export muerto). Comportamiento byte-idéntico. */
export async function procesarUno(filaEntrante: FilaMasiva): Promise<void> {
  // % global: cada acta NACE en 0 — su propio 0→100 del proceso COMPLETO
  // (reset aquí cubre TAMBIÉN el fallback de la rama DUPLICADA de abajo).
  // e71 (Opt-3): estado POR-FILA — con 2 actas en vuelo, cada una lleva su
  // propio 0→100 sin contaminarse (la limpieza vive en el finally).
  vidas.set(filaEntrante.id, {
    frac: 0,
    ocrPasada: 1,
    ocrFracPrev: 0,
    ultimoEn: 0,
  });
  // KIT e14-masiva-tiempos-v1 (PR-1): rama DEDUP — copia del resultado de la
  // original (<1 s). Si la original no sirve, la fila cae al pipeline
  // completo AQUÍ MISMO (fallback honesto — el dueño nunca pierde la foto).
  let fila = filaEntrante;
  // WAVE2 B1 — re-chequeo post-reserva: la referencia del snapshot puede estar
  // vieja — cadenaDedup (ingesta background FIFO) pudo marcar DUPLICADA la fila
  // entre siguientePendiente() y aquí. El duplicado JAMÁS paga probe+OCR
  // (kit e71 literal; e72: totalMs de la copia ≈ 0). Re-lectura del estado REAL
  // del store — si ya está marcada, entra por la rama de reuso de abajo.
  const filaFresca = storeMasiva()
    .getState()
    .filas.find((f) => f.id === filaEntrante.id);
  if (
    filaFresca &&
    filaFresca.estado === "DUPLICADA" &&
    fila.estado !== "DUPLICADA"
  ) {
    logger.info(
      `[e14] dedup fila=${fila.id} re-chequeo post-reserva → reuso (carrera cerrada)`,
    );
    fila = { ...fila, estado: "DUPLICADA", dupOf: filaFresca.dupOf ?? null };
  }
  if (fila.estado === "DUPLICADA") {
    marcarFila(fila.id, { estado: "PROCESANDO", error: null });
    const t0 = Date.now();
    if (await reutilizarResultado(fila, t0)) return;
    // e72 — GUARD de ingesta × pool: reutilizar falló con la original VIVA
    // pero SIN desenlace — la race del smoke del dueño (imagen9/imagen10
    // idénticas en un lote EN VUELO): la ingesta marcó «instantanea sha256»
    // al instante, pero el pool reservó la copia ANTES de que la original
    // aterrizara y el fallback de abajo la mandaba al REPROCESO COMPLETO
    // (32 s de OCR pagados + desenlace ENVIADA propio). Si la original está
    // EN COLA o EN VUELO → ESPERAR su desenlace (sondeo ligero, techo
    // generoso) y copiar: el duplicado JAMÁS paga OCR (kit e71 literal —
    // totalMs de la copia ≈ 0, criterio del dueño). QUITAR/ERROR/techo → el
    // fallback honesto de abajo queda intacto.
    //
    // C5 — GUARD agregadaEn de la espera (MISMO patrón del guard P2.1-v2 de
    // la resolución post-OCR de abajo): la original SOLO se espera si va
    // DELANTE en la FIFO (agregadaEn menor). Antes se esperaba a CUALQUIER
    // original viva: si la original estaba DETRÁS (o la cola congelada/
    // pausada — post-mortem 20261020-122235), el slot del pool quedaba
    // BLOQUEADO hasta el techo (10 min) por un desenlace que no llegaba.
    // Ahora, original copiable pero NO delante → APARCAR (abajo): la fila
    // vuelve a DUPLICADA, el slot se libera YA, la ola sigue y la aparcada
    // se RE-VISITA al terminar la ola (revisitarDuplicadaAparcada — copia si
    // la original aterrizó, o el fallback honesto de abajo). El techo de la
    // espera activa NO cambia (esperarDesenlaceOriginal, 10 min): el
    // comportamiento observable SOLO cambia en el caso patológico (original
    // detrás / cola congelada): antes slot bloqueado ×10 min; ahora slot
    // liberado al instante + re-visita al cierre de la ola.
    if (fila.dupOf) {
      const original = storeMasiva()
        .getState()
        .filas.find((f) => f.id === fila.dupOf);
      // Whitelist COPIABLE (T-5 e65 — la MISMA de esperarDesenlaceOriginal):
      // AUSENTE/ERROR/ya-enviada quedan fuera por construcción (sin acta
      // copiable no hay resolución posible — esa espera responde rápido).
      const copiable =
        original != null &&
        (original.estado === "PENDIENTE" ||
          original.estado === "PROCESANDO" ||
          original.estado === "LISTA" ||
          original.estado === "DUPLICADA");
      if (
        copiable &&
        // LISTA ya ES desenlace: si reutilizar falló arriba el registro no
        // tiene acta (IDB inconsistente) — el sondeo de la espera jamás la
        // vería llegar (estado terminal) → aparcado, no espera.
        original.estado !== "LISTA" &&
        original.agregadaEn >= fila.agregadaEn
      ) {
        // APARCAR: soltar el slot (procesarUno resuelve → el finally del
        // vuelo libera la reserva) y dejar la fila DUPLICADA en la bandeja
        // (honesto: ES una duplicada esperando a SU original).
        dedupAparcadas.add(fila.id);
        marcarFila(fila.id, { estado: "DUPLICADA", error: null });
        logger.info(
          `[e14] dedup fila=${fila.id} dupOf=${fila.dupOf} aparcada original-detras slot-liberado`,
        );
        return;
      }
      if (await esperarDesenlaceOriginal(fila.id, fila.dupOf)) {
        if (await reutilizarResultado(fila, t0)) return;
      }
    }
    // Fallback: des-marcar y reprocesar como fila normal (mismo pase).
    fila = { ...fila, estado: "PENDIENTE", dupOf: null };
    marcarFila(fila.id, { estado: "PENDIENTE", dupOf: null });
    try {
      // D41 — lectura RAW: solo spread base del re-save (sin dataURLs que
      // materializar — la fila es PENDIENTE, sin acta/fotos).
      const registro = await leerRegistroRaw(fila.id);
      await guardarRegistro({ ...registro, estado: "PENDIENTE", dupOf: undefined });
    } catch {
      /* IDB caído — la fila ya está PENDIENTE en memoria (honesto) */
    }
    logger.info(`[e14] dedup fila=${fila.id} sin-original reprocesa-completo`);
  }
  // D66 — KIT e14-decode-unico-precalor-v1 (T3.3): consumir el MASTER
  // precalentado ANTES de marcar PROCESANDO (orden crítico: el precalor
  // descarta masters de filas que dejan de ser PENDIENTE — si marcáramos
  // primero, la suscripción descartaría el master que estamos a punto de
  // consumir). decode = 0 s — el coste ya vivió en precalorMs durante la
  // espera en cola. Un master se consume UNA vez; el chip PREPARADA muere
  // con la fila al pasar a PROCESANDO.
  // D63-A2 (T0): `let` — si el pre-proceso aplicó (deskew), el master
  // precalentado NO alimenta el pipeline y la referencia se SUELTA
  // (disciplina de memoria más abajo — el blob muere YA, no al fin del
  // scope: el OCR domina con ~13 s por fila).
  let entradaPrecalor = consumirMaestro(fila.id);
  if (entradaPrecalor) {
    logger.info(
      `[e14] precalor fila=${fila.id} consumido precalorMs=${entradaPrecalor.precalorMs} origen=${entradaPrecalor.maestro.origenDecode}`,
    );
  }
  marcarFila(fila.id, { estado: "PROCESANDO", error: null, precalentada: false });
  // D65 (T3): señal de vida INICIAL — "preparando" (origen/pre-proceso van
  // primero; el bridge emite la suya apenas arranca). fracGlobal = 0: el
  // proceso del acta acaba de nacer (UN % para TODO el proceso).
  storeMasiva()
    .getState()
    .marcarProgreso(fila.id, { etapa: "preparando", fracGlobal: vidaDe(fila.id).frac });

  // ─── R8 · SPLIT — CTX inicial del pipeline (inmutable: los stages devuelven
  // ctx NUEVO; el orquestador reasigna la referencia). Creado ANTES del try:
  // el catch del post-mortem también lee las trazas (qrPayload/watchdog/…). ───
  let ctx: CtxProcesarUno = {
    fila,
    archivo: null,
    registro: null,
    esperaMs: 0,
    tsDespacho: null,
    tPreOcrIntento: 0,
    entradaPrecalor,
    qrPayload: null,
    qrEstadoCapa0: null,
    qrHeredado: false,
    preOcrQrMs: null,
    preOcrMs: null,
    preOcrOrigenMs: 0,
    preOcrDeskewMs: 0,
    preOcrMasterMs: 0,
    preOcrPasadas: 0,
    watchdogUsados: 0,
    etapaAlMorir: null,
    elapsedMuerteMs: null,
    rescateLanzado: false,
    veredictoOrigen: null,
    preProceso: null,
    actaBruta: null,
    maestroDesenlace: null,
    decodeMasterMs: null,
    intentoDesenlace: 0,
    actaDesenlace: null,
    relecturaDesenlace: null,
    relecturaToken: null,
    identidad: null,
    originalIdentidad: null,
    falsoPositivoEvitado: false,
    actaFinal: null,
    enviadaAuto: false,
  };
  let registro: RegistroMasiva | null = null;
  // e63m — payload QR de la CAPA 0 (identidad-qr.ts): llave OPACA — solo se
  // guarda en el registro y viaja al informe (export-only); JAMÁS se parsea,
  // se invierte o se compara por prefijos (RED LINE 10). null = sin-payload
  // (el QR no decodificó — pipeline normal intacto, sin campo en IDB).
  let qrPayload: string | null = null;
  // e64-qr T-0.2 — estado SOLO-VISUAL de la CAPA 0 (chip QR ✓/✗ de la
  // bandeja): null = la capa 0 NO llegó a correr (throw previo — jamás
  // inventar); "leido"/"sin-payload" = el intento de decode terminó.
  let qrEstadoCapa0: "leido" | "sin-payload" | null = null;
  // D65 (T1.4) — trazas del watchdog (visibles también en el catch).
  let watchdogUsados = 0;
  let etapaAlMorir: string | null = null;
  let elapsedMuerteMs: number | null = null;
  // WAVE3 §B — el rescate LANZADO para ESTA fila (máx 1 — el predicado
  // exige intento 1): la traza rescateRechazo del registro nace aquí
  // ("salvado" si el desenlace final ≠ RECHAZADA; "lanzado" si no).
  // Fuera del try — el catch del post-mortem TAMBIÉN la estampa.
  let rescateLanzado = false;
  // ─── KIT e14-tiempos-v2 (D44) — los 4 ROJOS: sub-desglose del muro + trazas ───
  // (R1) particiones del muro: cada segmento vive DENTRO de la pared que lo
  // acumula (qr + origen + deskew + master ≤ preOcrMs SIEMPRE — el residuo
  // son logs/marco de store). Los reintentos re-pagan y ACUMULAN igual que
  // preOcrMs — (R4) cuenta cuántas pasadas hay en la suma. Fuera del try —
  // el catch del post-mortem TAMBIÉN los estampa (mismo trato que watchdogUsados).
  let preOcrQrMs: number | null = null; // bloque capa-0 QR + dedup (+ espera APLAZADA)
  let preOcrOrigenMs = 0; // clasificarOrigenDeArchivo (D63-A) por intento
  let preOcrDeskewMs = 0; // preProcesoEscaneo (D63-B) por intento
  let preOcrMasterMs = 0; // master del intento (maestroDeImagen/precalor — D66)
  let preOcrPasadas = 0; // (R4) veces que se cerró el muro (1 = sin reintento)
  // (R2) la capa 0 HEREDÓ qrPrevio (sondeo/prescan) — sin decode ni ladder.
  let qrHeredado = false;
  // (R3) epoch del despacho (tInicio) — con tsFin reconstruye el solape D31.
  let tsDespacho: number | null = null;
  try {
    // D41 — lectura RAW: el pipeline solo consume `archivo` y escribe el
    // desenlace NUEVO encima (el acta vieja, si existiera, se reemplaza
    // wholesale — jamás se lee su dataURL); materializar las fotos del
    // registro era FileReader de 2-16 MB por fila en el hilo UI.
    registro = await leerRegistroRaw(fila.id);
    const archivo = registro.archivo;
    // IDB clona el File original (sigue siendo File — structured clone de
    // File API). El guard honesto evita alimentar al bridge con un Blob
    // genérico (OpcionesEscaneo.archivo espera File — A5).
    if (!(archivo instanceof File)) throw new Error("ARCHIVO_FUERA_DE_LA_COLA");

    // KIT e14-masiva-tiempos-v1 (PR-2): la instancia del File de SIEMPRE —
    // base de origen/pre-proceso (D63-A/B corren sobre el ORIGINAL: EXIF y
    // márgenes viven ahí; el master es un re-encode sin EXIF).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- NO es código muerto: ancla del QA e63m (qa-qr-identidad.ts:353 grepea esta línea para «bloque capa 0 ANCLA»)
    const archivoPipeline = archivo;

    // D57 — KIT e14-instrumentos-espera-v1 (T1): espera en cola → inicio del
    // pipeline. tInicio capturado antes del PRIMER intento (kit §4-T1):
    // esperaMs = tInicio − fila.agregadaEn (≥ 0 defensivo — jamás inventar).
    // SOLO masiva lo llena (el flujo individual no tiene espera de cola).
    const tInicio = Date.now();
    tsDespacho = tInicio; // D44-R3 — el despacho ES el cierre de la espera de cola
    const esperaMs = Math.max(0, tInicio - fila.agregadaEn);

    // ─── KIT e14-etapas-preocr-v1 (D43) — preOcrMs: el MURO entre el fin de
    // la espera de cola y el arranque del pipeline del bridge ─── Hoy es
    // INVISIBLE en el informe (esperaMs cierra AQUÍ; totalMs nace DENTRO del
    // bridge) — evidencia del informe 2026-10-30: 6-10 s/acta sin dueño.
    // Cronómetro OBSERVADOR PASIVO (solo medir — jamás cambia decisiones):
    // intento 1 arranca YA (incluye la capa-0 QR completa); los reintentos
    // (watchdog/rescate) re-pagan origen/deskew/master → se ACUMULAN (T1).
    let preOcrMs: number | null = null; // null = jamás llegó al bridge (YA-ENVIADA/copias tempranas)
    let tPreOcrIntento = performance.now(); // intento 1: incluye la capa-0 (T1)

    // D65 (T1) — estado del intento del WATCHDOG (kit T1.1/T1.2/T1.3).
    let veredictoOrigen: OrigenVeredicto | null = null;
    let preProceso: PreProcesoEscaneo | null = null;
    let actaBruta: Acta | null = null;
    let senal: { etapa: EtapaAnalisis; fraccion: number } | null = null;
    let errorIntento: { error: unknown } | null = null;
    // D66 — trazas del master del DESENLACE (el del intento que produjo
    // actaBruta; los reintentos re-hornean — la traza describe el master que
    // SÍ sirvió; jamás inventar).
    let maestroDesenlace: MaestroImagen | null = null;
    let decodeMasterMs: number | null = null;
    let intentoDesenlace = 0;
    // Archivo del intento: el 1.º usa el archivo re-leído de IDB (el prefetch
    // del original ya no existe — D66 re-apuntó ese trabajo al precalor:
    // dispararPrefetch→asegurarMaestro). Los REINTENTOS re-leen el registro:
    // instancia FRESCA del File — la decodeMemo del bridge es POR INSTANCIA y
    // el intento muerto pudo envenenar la suya con un decode colgado (el
    // fallback honesto de v1 se conserva si IDB falla).
    let archivoIntento: File = archivo;

    // ─── R8 · STAGE 1/5 (split de procesarUno — misión punto 3): CAPA 0 QR ───
    // El bloque entero (decode + dedup por payload + APLAZADA + ya-enviada)
    // vive en faseCapa0Qr (abajo) — MISMA gestión de catch: el stage corre
    // DENTRO de este try y cualquier throw cae al MISMO catch (fila ERROR,
    // la cola jamás se tumba). Los `return` del bloque (reutiliza /
    // ya-enviada-histórico) salen como resuelto:true (el finally limpia igual).
    // ctx inmutable enriquecido: el stage devuelve ctx NUEVO, nunca muta el suyo.
    const r1 = await faseCapa0Qr({ ...ctx, registro, archivo, esperaMs });
    if (r1.resuelto) return;
    ctx = r1.ctx;
    // Espejo transitorio (estrangulamiento incremental): los stages 2-5 aún
    // no extraídos leen las variables locales — mueren en sus commits.
    qrPayload = ctx.qrPayload;
    qrEstadoCapa0 = ctx.qrEstadoCapa0;
    qrHeredado = ctx.qrHeredado;
    preOcrQrMs = ctx.preOcrQrMs;

    for (let intento = 1; intento <= WATCHDOG_INTENTOS; intento += 1) {
      const tIntento = Date.now();
      // KIT e14-etapas-preocr-v1 (D43): intentos ≥ 2 re-pagan origen/deskew/
      // master (D65 — bloques del reintento byte-idénticos) → re-armar el
      // cronómetro pre-OCR. La matanza/re-creación de workers ENTRE intentos
      // NO es pre-OCR (costo del watchdog) — queda fuera por construcción.
      if (intento > 1) tPreOcrIntento = performance.now();
      senal = null; // la etapa al morir es la del INTENTO que muere
      // Reintento del watchdog: MISMA acta → el % global CONSERVA el máximo
      // alcanzado (monotónico — no vuelve a 0; la etiqueta de fase sí vuelve
      // a PREPARANDO para contar la historia del reintento).
      storeMasiva()
        .getState()
        .marcarProgreso(fila.id, { etapa: "preparando", fracGlobal: vidaDe(fila.id).frac });
      try {
        // ── D63-A — KIT e63a-origen-escaneo-v1 (punto ÚNICO del kit, T1/T2):
        // origen del archivo — detector heurístico conservador (origen.ts),
        // calculado UNA vez por fila AL INICIO del pipeline. SOLO visibilidad:
        // no alimenta score/gate (calibra D63-B/D63-C). Falla → null (el
        // detector jamás tumba el pipeline). Traza aditiva propia (contrato
        // D51: solo-AÑADIR) + campos en el diagnóstico (parche D57 de abajo).
        // D65: bloque AJENO byte-idéntico — el REINTENTO lo re-ejecuta (los
        // workers del intento anterior ya fueron muertos y re-creados).
        const tOrigenSeg = performance.now(); // D44-R1
        veredictoOrigen = await clasificarOrigenDeArchivo(archivoIntento);
        preOcrOrigenMs += Math.round(performance.now() - tOrigenSeg);
        logger.info(
          `[e14] origen=${veredictoOrigen.origen ?? "null"} senales=${veredictoOrigen.senales ?? "null"}`,
        );
        // ── D63-A2 — KIT e14-d63a2-deskew-pipeline-v1 (T1): calibración por
        // CONSTRUCCIÓN — una fila nacida de un PDF (viaPdf, rama PDF del
        // store) ES un escaneo aunque el detector D63-A por señales no lo
        // diga (un E-14 impreso a sangre NO tiene borde blanco de escáner:
        // evidencia F1, informe 200613 — 10 null con borde-no-blanco). Las
        // señales de píxel del detector QUEDAN (honestidad D57) como prefijo
        // `pdf-render+…`. SIM y captura individual JAMÁS traen viaPdf (campo
        // de MASIVA — nace SOLO en la rama PDF de agregarFiles).
        if (fila.viaPdf && veredictoOrigen.origen !== "escaneo") {
          veredictoOrigen = {
            origen: "escaneo",
            senales: `pdf-render+${veredictoOrigen.senales}`,
          };
          logger.info(
            `[e14] origen pdf-render → escaneo (señales píxel preservadas: ${veredictoOrigen.senales})`,
          );
        }

        // ── D63-B — KIT e63b-deskew-escaneo-v1 (bloque de PRE-PROCESO, T2/T3):
        // SOLO escaneos (origen del detector D63-A) — detección de ángulo sobre
        // la banda del encabezado + deskew selectivo (|θ| ≥ 0.3° y ≤ 10°) con
        // resample de alta calidad + limpieza suave del punto blanco. Fotos y
        // escaneos rectos+limpios pasan el archivo ORIGINAL byte-idéntico (memo
        // de decode del bridge intacta — cero cambios). El pipeline consume el
        // master corregido (T2.2); el original duerme en IDB sin cambios.
        // D65: bloque AJENO byte-idéntico (ídem D63-A — se re-ejecuta).
        const tDeskewSeg = performance.now(); // D44-R1
        preProceso = await preProcesoEscaneo(archivoIntento, veredictoOrigen.origen);
        preOcrDeskewMs += Math.round(performance.now() - tDeskewSeg);
        if (veredictoOrigen.origen === "escaneo") {
          logger.info(
            `[e14] preproceso skewGrados=${preProceso.skewGrados ?? "null"} deskewMs=${preProceso.deskewMs ?? "null"} limpiezaMs=${preProceso.limpiezaMs ?? "null"} limpieza=${preProceso.limpieza} aplicado=${preProceso.aplicado} decodeMs=${preProceso.decodeMs ?? "null"}`,
          );
        }
        // ── D63-A2 (T0) — DISCIPLINA DE MEMORIA: si el CORREGIDO manda, el
        // master precalentado de esta fila muere AQUÍ (descartado por la vía
        // del precalor + referencia local soltada — NUNCA huérfano). El
        // precalor sigue decodificando el ORIGINAL en la espera (sin cambios
        // — simplicidad del kit): las filas PDF aplicadas pierden el
        // beneficio del precalor (doble decode por fila escaneada — coste
        // CONOCIDO y documentado: el OCR domina con ~13 s).
        if (preProceso?.aplicado && entradaPrecalor) {
          logger.info(
            `[e14] precalor fila=${fila.id} descartado fuente=corregido precalorMs=${entradaPrecalor.precalorMs}`,
          );
          descartarMaestro(fila.id); // vía del precalor (idempotente — defensa)
          entradaPrecalor = null; // soltar el blob YA (no al fin del scope)
        }

        // ── D66 — KIT e14-decode-unico-precalor-v1 (T1.2/T1.5): MASTER del
        // intento. Intento 1 consume el master PRECALENTADO (T3.3 — el decode
        // ya vivió en la espera; entradaPrecalor se consumió ANTES de marcar
        // PROCESANDO). Reintentos (intento ≥ 2): horneado FRESCO del
        // archivoIntento — el File fue re-leído de IDB (D65) y el intento
        // muerto pudo envenenar la decodeMemo por-instancia del master
        // anterior. Sin master (decode imposible) → fallback HONESTO: el
        // bridge recibe archivoIntento tal cual (AC-P3).
        const tMaestro = Date.now();
        // ── D63-A2 (T0): FUENTE del master — el CORREGIDO del pre-proceso
        // (D63-B) cuando aplicó; el original en los demás casos. El bloque
        // D63-B calcula preProceso.archivo PERO la fusión D65/D66 lo dejó
        // desconectado (solo sus métricas llegaban — hallazgo del worklog
        // D65, orden del dueño: despertarlo AQUÍ y NADA más). El master
        // único D66 queda VERDADERO: el pipeline sigue consumiendo UN master
        // (`maestro?.archivo ?? archivoIntento` del bridge, sin tocar).
        const fuenteMaestro: File = preProceso?.aplicado
          ? preProceso.archivo
          : archivoIntento;
        const tMasterSeg = performance.now(); // D44-R1
        const maestro: MaestroImagen | null =
          intento === 1 && !preProceso?.aplicado
            ? (entradaPrecalor?.maestro ??
              (await maestroDeImagen(fuenteMaestro, { nombre: fila.nombre })))
            : await maestroDeImagen(fuenteMaestro, { nombre: fila.nombre });
        preOcrMasterMs += Math.round(performance.now() - tMasterSeg);
        const decodeMsIntento = maestro
          ? intento === 1 && entradaPrecalor
            ? 0 // T3.3/T4: precalentada → el decode ya pasó en la espera
            : Math.max(1, Math.round(Date.now() - tMaestro))
          : null;
        if (maestro) {
          logger.info(
            `[e14] decode-maestro fila=${fila.id} intento=${intento} ms=${decodeMsIntento} origen=${maestro.origenDecode} precalentada=${intento === 1 && !!entradaPrecalor} ${maestro.ancho}x${maestro.alto}${preProceso?.aplicado ? " fuente=corregido" : ""}`,
          );
        }

        // T4: variable tipada con la intersección (sin excess-check de literal —
        // el parámetro de la interfaz E14Bridge sigue siendo OpcionesEscaneo).
        // D65 (T1): presupuesto del INTENTO — lo RESTANTE de WATCHDOG_MS (el
        // pre-proceso ya gastó lo suyo; el timeout del bridge dispara SU acta
        // de timeout exactamente en la frontera del intento).
        const opcionesMasiva: OpcionesEscaneoConTimeout = {
          objetivo: null, // A4 — la clasificación REAL manda (viene del OCR)
          intento: 1, // A6 — semántica de PRIMERA captura (el watchdog NO es re-captura)
          maxIntentos: 4, // fallos → RECHAZADA repetible / rescate por recorte manual
          fuente: "ARCHIVO", // A5 — MASIVA SIEMPRE archivo
          archivo: maestro?.archivo ?? archivoIntento, // D66 — el master (fallback: original)
          // D63-C — KIT e63c-quad-gate-escaneo-v1: origen del detector D63-A
          // alimenta T1 (quad página-completa) y T2 (gate del marco impreso).
          // SIM y el flujo individual JAMÁS lo traen (nada de escaneos les aplica).
          origenActa: veredictoOrigen.origen,
          // e66 (P4): la señal auditable viaja al bridge — "exif-camara"
          // omite el probe de rotaciones (orientación ya horneada por el
          // EXIF del core; aplicado=0 SIEMPRE — evidencia del dueño).
          origenSenales: veredictoOrigen.senales,
          // P2 (plan masiva — brief Agente A): el caller es el runner MASIVA
          // — el bridge OMITE la brújula QR (su payload no se consume aquí;
          // la rotación la cubren deskew D63-B + probe e66/e70 + rescate §B).
          // Intersección LOCAL OpcionesEscaneoConTimeout — bridge.ts intacto.
          desdeMasiva: true,
          onProgreso: (p) => {
            senal = { etapa: p.etapa, fraccion: p.progreso }; // etapa al morir (T1.4)
            marcarVida(fila.id, p); // señal de vida (T3 — throttle 250 ms)
          },
          timeoutMs: Math.max(5_000, watchdogMsEfectivo() - (Date.now() - tIntento)),
        };
        // KIT e14-etapas-preocr-v1 (D43): cierre del tramo pre-OCR del intento
        // (capa-0 + origen + deskew + master) — justo ANTES de despachar el
        // bridge. Acumula reintentos (intento ≥ 2 re-armó arriba).
        preOcrMs = (preOcrMs ?? 0) + Math.round(performance.now() - tPreOcrIntento);
        preOcrPasadas += 1; // D44-R4 — pasada completa del muro (reintento = re-armó)
        const resultado = await correrIntento(
          getBridge().escanearActa(opcionesMasiva),
          watchdogMsEfectivo() + WATCHDOG_GRACIA_MS,
        );
        if (resultado.tipo === "acta") {
          actaBruta = resultado.acta;
          // D66: el desenlace nació de ESTE master — fija sus trazas.
          maestroDesenlace = maestro;
          decodeMasterMs = decodeMsIntento;
          intentoDesenlace = intento;
          if (!esVeredictoTimeout(resultado.acta)) {
            // WAVE3 §B — ORDEN-WAVE3-remoto-rescate-obs-v1 (feat/rescate-
            // rechazo-v1): RECHAZADA-BAJO en el intento 1 es INTERMITENTE
            // (OCR bajo presión — evidencia lotes 7/8/9: las MISMAS actas
            // dieron score 10 FUERTE después; el probe jamás rotó) → UNA
            // 2ª pasada del paso desenlace con workers frescos (la
            // maquinaria EXISTENTE del bucle — nada nuevo de OCR). Cupos:
            // 1 por fila (el predicado exige intento===1) +
            // MAX_RESCATES_CORRIDA por corrida. Si el reintento también
            // RECHAZA → se acepta el rechazo (honesto, sin inventar).
            // forzarDedupOff manda SIEMPRE (RL-e65b-6 — escape del dueño).
            if (
              procedeRescateRechazo(resultado.acta, {
                intento,
                rescatesCorrida,
                forzarDedupOff: fila.forzarDedupOff,
              })
            ) {
              rescatesCorrida += 1;
              rescateLanzado = true;
              logger.info(`[e14] rescate-rechazo fila=${fila.id} intento=2`);
              await matarYRecrearWorkers(); // workers frescos (misma infra T1.2)
              continue; // 2ª pasada del MISMO paso desenlace — el bucle re-ejecuta
            }
            break; // desenlace REAL (comportamiento de siempre)
          }
          // veredicto-timeout del bridge → el intento MURIÓ (cae al final del
          // loop: traza + kill de workers + reintento si queda cupo).
        } else if (resultado.tipo === "error") {
          errorIntento = resultado; // error REAL → catch de siempre (fila ERROR)
          break;
        }
        // resultado.tipo === "tope" → el bridge nunca respondió: intento muerto.
      } catch (err) {
        errorIntento = { error: err }; // NUNCA es muerte de watchdog
        break;
      }
      watchdogUsados = intento;
      etapaAlMorir = etapaDeSenal(senal);
      elapsedMuerteMs = Date.now() - tIntento;
      logger.info(
        `[e14] watchdog fila=${fila.id} intento=${intento}/${WATCHDOG_INTENTOS} etapa=${etapaAlMorir ?? "null"} elapsed=${elapsedMuerteMs}ms`,
      );
      if (intento >= WATCHDOG_INTENTOS) break; // kit T1.3: veredicto de siempre
      // D65 (T1.2): matar y re-crear los workers del intento (detección + OCR)
      // y relanzar UNA vez. El reintento es del MISMO procesado ya iniciado por
      // el dueño (no re-encola nada nuevo — D45 intacto; criterios/score intactos).
      await matarYRecrearWorkers();
      try {
        // D41 — lectura RAW: solo se consumen `archivo` (File) para el
        // reintento del watchdog — sin dataURLs que materializar.
        const fresco = await leerRegistroRaw(fila.id);
        if (fresco.archivo instanceof File) {
          registro = fresco;
          archivoIntento = fresco.archivo;
        }
      } catch {
        /* IDB caído — el reintento usa la instancia actual (honesto) */
      }
    }
    if (errorIntento) throw errorIntento.error;
    if (!actaBruta) {
      // Colgaje FUERA del bridge (origen/pre-proceso) en TODOS los intentos:
      // el veredicto de SIEMPRE con la MISMA forma del acta de timeout del
      // bridge (score 0 — nada inventado).
      actaBruta = actaTimeoutWatchdog(fila.id);
    }
    // WAVE3 §B — traza del rescate SALVADOR: el reintento produjo un
    // desenlace ≠ RECHAZADA (honesto — solo cuando el rescate corrió).
    if (
      rescateLanzado &&
      actaBruta.status !== "RECHAZADA" &&
      !esVeredictoTimeout(actaBruta)
    ) {
      logger.info(`[e14] rescate-rechazo OK fila=${fila.id}`);
    }
    // D57 (T1): parche INMUTABLE del diagnóstico (kit §4-T1). ADITIVO — no
    // toca score/status/gate; si el diagnóstico no existe (no debería: el
    // bridge lo monta en todo desenlace fuera de SIM), se omite el campo.
    // D63-A (T2): las trazas de origen viajan en el MISMO parche (aditivas,
    // al final del contrato D57 — origen/origenSenales, ver origen.ts).
    // D65: veredictoOrigen/preProceso son del ÚLTIMO intento ejecutado (si el
    // desenlace existe, al menos un intento completó sus bloques D63).
    const acta =
      actaBruta.diagnostico != null
        ? {
            ...actaBruta,
            diagnostico: {
              ...actaBruta.diagnostico,
              tiempos: { ...actaBruta.diagnostico.tiempos, esperaMs },
              origen: veredictoOrigen?.origen ?? null,
              origenSenales: veredictoOrigen?.senales ?? null,
              // D63-B (T2/T3): trazas del pre-proceso de escaneos (aditivas,
              // al final del contrato — null cuando no aplicó/no es escaneo).
              skewGrados: preProceso?.skewGrados ?? null,
              deskewMs: preProceso?.deskewMs ?? null,
              limpieza: preProceso?.limpieza ?? null,
              // D63-A2 (T0): provenance del master que el bridge CONSUMIÓ —
              // "corregido" (deskew aplicado) | "original". Aditivo al final
              // del contrato D57; el informe T2 lo consume como
              // preprocesoAplicado (bool, presente si origen escaneo).
              // preProceso existe SIEMPRE en MASIVA (nulo para no-escaneos →
              // "original") — null solo si no hay diagnóstico (jamás inventar).
              maestroFuente: preProceso
                ? preProceso.aplicado
                  ? ("corregido" as const)
                  : ("original" as const)
                : null,
            },
          }
        : actaBruta;

    // FIX M8 (auditoría 2-c): la decisión del dueño manda TAMBIÉN para el
    // ENVÍO — si quitó la fila mientras el OCR corría, el desenlace NO se
    // transmite (antes registrarEnvioMasiva corría ANTES del guard: fila de
    // historial + completadas + hueco archivado de un acta descartado).
    if (!storeMasiva().getState().filas.some((f) => f.id === fila.id)) return;

    // ─── e63f — KIT e63f-autoenvio-v1 (F2): RE-LECTURA INTERNA antes de
    // «repetir-primero» ─── SUGERIDA/MANUAL con captura PERFECTA (score ≥ 8 ∧
    // lectura FUERTE ∧ gate completa) no vuelve a capturar: se RE-LEE el
    // MISMO bitmap (reconocerTexto — re-warp con el quad horneado SIN
    // re-detección + rapidocr a cap fino DET_CAP_PROD, la pasada-2 del
    // escalonado) → re-clasificar → re-evaluar el gate (desenlaceTrasRelec-
    // tura). AUTO → OPTIMA → autoenvío normal más abajo; si no → revisión
    // humana como hoy. UNA pasada MÁXIMA (RED LINE 5) y el humano NUNCA la
    // ve (intento de LECTURA, no de captura — el «repetir-primero» físico
    // del flujo individual NO cambia). NUNCA aplica a RECHAZADAS por calidad
    // (score < 6.5 — ahí re-escanear SÍ ayuda), ADVERTENCIA (red line) ni
    // gate incompleta. Trazas aditivas: token ` RelecturaInterna=` (D51) y
    // flag `relectura` en la fila. Cualquier falla interna (runtime OCR,
    // base divipol) deja el veredicto de siempre — jamás empeora.
    //
    // e63g (E1/F0): el bloque va envuelto en conTope (RELECTURA_TOPE_MS) —
    // era el ÚNICO await de la fila sin presupuesto propio (el watchdog D65
    // no lo cubre) y un colgaje de reconocerTexto congelaba la cola PARA
    // SIEMPRE. Tríada: valor → desenlace de la re-lectura; error →
    // sin-cambio (como el catch de siempre); VENCIDO → matarYRecrear-
    // Workers() + veredicto de la 1.ª lectura INTACTO (actaDesenlace sigue
    // siendo `acta`) + token `tope` (D51 aditivo) + CERO reintentos. La
    // traza SIEMPRE (también con tope).
    let actaDesenlace = acta;
    let relecturaDesenlace: "auto" | "sin-cambio" | null = null;
    let relecturaToken: "auto" | "sin-cambio" | "tope" | null = null;
    if (procedeRelecturaInterna(acta)) {
      const tRelectura = performance.now();
      const r = await conTope(
        (async () => {
          const textoRe = await getBridge().reconocerTexto(acta);
          const clasifRe = clasificarCabecera(textoRe, await cargarDivipol());
          return desenlaceTrasRelectura(acta, textoRe, clasifRe);
        })(),
        RELECTURA_TOPE_MS,
      );
      if (r.vencido) {
        // Tope vencido — infraestructura muerta y re-creada (misma doctrina
        // del watchdog T1.2); el VEREDICTO de la 1.ª lectura queda intacto.
        // La relectura JAMÁS reintenta (red line): sin-cambio y fuera.
        await matarYRecrearWorkers();
        relecturaDesenlace = "sin-cambio";
        relecturaToken = "tope";
      } else if ("valor" in r) {
        actaDesenlace = r.valor.acta;
        relecturaDesenlace = r.valor.desenlace;
        relecturaToken = r.valor.desenlace;
      } else {
        relecturaDesenlace = "sin-cambio";
        relecturaToken = "sin-cambio";
      }
      // console.info LITERAL — ancla QA (qa-watchdog-relectura.ts Bloque 3:
      // «traza SIEMPRE» grepea console.info( en este bloque). No migra al logger.
      console.info(
        `[e14] relectura-interna fila=${fila.id} ms=${Math.round(performance.now() - tRelectura)} RelecturaInterna=${relecturaToken}`,
      );
    }

    // ─── e63k — KIT e63k-capa2-identidad-v1 (F1.4): CAPA 2 DEDUP POR
    // IDENTIDAD (punto ÚNICO del kit, POST-OCR) ─── La identidad nace SOLO
    // del código 1D consensuado (identidad.ts — RED LINE 2: sin consenso no
    // hay identidad, jamás regex suelto sobre el texto). La marca pre-OCR
    // quedó APLAZADA en la banda 3..6 (store); AQUÍ decide la serie impresa.
    const identidad = identidadDeActa(actaDesenlace);
    // ¿Original por identidad? OTRA fila (f.id !== fila.id) con la MISMA
    // identidadActa (13 dígitos = formulario+PAG — P1 y P2 del mismo
    // formulario son actas DISTINTAS, nunca se deduplican entre sí) en
    // estado LISTA|DUPLICADA; la de agregadaEn MÍNIMA es la original.
    // forzarDedupOff (el dueño pulsó PROCESAR IGUAL) manda sobre la capa 2.
    // e71 (Opt-3) — SECCIÓN CRÍTICA (kit: «encolar la verificación de dedup
    // en un solo hilo»): DOS filas con la MISMA serie aterrizando juntas
    // veían AMBAS «sin original» y se enviaban DOBLE. Dentro del mutex la
    // segunda ve la marca de la primera → DUPLICADA — el envío doble es
    // IMPOSIBLE por construcción. El thumb/IDB (~50 ms) dentro de la
    // sección: el OCR queda fuera (paralelo de verdad).
    let originalIdentidad: FilaMasiva | null = null;
    if (identidad && !fila.forzarDedupOff) {
      // Capturas para la closure (el narrowing de registro no entra en las
      // funciones async — misma técnica de qrPayloadSeguro arriba).
      const registroCritico = registro;
      const marcadaIdentidad = await conExclusionMutua(async () => {
        const original =
          storeMasiva()
            .getState()
            .filas.filter(
              (f) =>
                f.id !== fila.id &&
                f.serie != null &&
                f.serie.slice(0, 13) === identidad.identidadActa &&
                (f.estado === "LISTA" || f.estado === "DUPLICADA"),
            )
            .sort((a, b) => a.agregadaEn - b.agregadaEn)[0] ?? null;
        if (!original) return false;
        originalIdentidad = original;
        // DUPLICADA por identidad — SU PROPIO desenlace (no el de la
        // original): NO reenvía, NO borra, revisión disponible. La capa 2
        // decide por CUALQUIER status del desenlace (un dup RECHAZADO por
        // blur de la misma acta también es dup) → return ANTES del envío y
        // del contador (kit §1.4-5). El guard anti-zombi M8 ya corrió antes
        // en el flujo (la fila está viva al llegar aquí) — NO se duplica.
        const thumbIdentidad = await hacerThumb(
          actaDesenlace.fotoProcesada ?? actaDesenlace.fotoOriginal,
        );
        await guardarRegistro({
          ...registroCritico,
          estado: "DUPLICADA",
          dupOf: original.id,
          acta: actaDesenlace,
          thumb: thumbIdentidad,
          serie: identidad.serie,
          dedup: "identidad",
          infoTitulo: tituloDeActa(actaDesenlace),
          // e63m: el payload QR de esta fila viaja con SU desenlace (post-mortem).
          ...(qrPayload ? { qrPayload } : {}),
          // e64-qr T-0.2: el estado SOLO-VISUAL de la capa 0 también (honesto:
          // la capa 0 corrió si qrEstadoCapa0 != null).
          ...(qrEstadoCapa0 ? { qrEstado: qrEstadoCapa0 } : {}),
        });
        marcarFila(fila.id, {
          estado: "DUPLICADA",
          dupOf: original.id,
          statusActa: actaDesenlace.status,
          score: actaDesenlace.score,
          nivel: actaDesenlace.clasificacion?.nivel ?? null,
          pagina: paginaDeActa(actaDesenlace),
          infoTitulo: tituloDeActa(actaDesenlace),
          motivo: actaDesenlace.rechazo?.tipo ?? null,
          thumb: thumbIdentidad,
          enviadaAuto: false,
          // e63k (decisión declarada en el REPORTE §1): la serie TAMBIÉN al
          // mapa en memoria (regla general del kit — el mapa de identidad de
          // la sesión ve esta fila aunque la original se haya quitado).
          serie: identidad.serie,
          error: null,
        });
        logger.info(
          `[e14] dedup-identidad fila=${fila.id} serie=${identidad.identidadActa} original=${original.id}`,
        );
        return true;
      });
      if (marcadaIdentidad) {
        return; // NO registrarEnvioMasiva NI contarMotivoNoEnvioActa
      }
    }
    // Falso-positivo visual EVITADO (el caso 3992/3993 de la consola del
    // dueño — QA §3.2): la banda visual 3..6 la había dejado sospechosa y
    // la serie impresa demuestra que es OTRA acta → resolución final
    // "sin-match" en el registroListo de abajo (conservando dedupDistancia
    // y dedupVisualDe del write aplazado — post-mortem). La fila sigue al
    // envío normal — SU desenlace, NUNCA el de otra. La traza vive en el
    // REGISTRO (kit §1.2 — dedupVisualDe es de RegistroMasiva; el store no
    // la restaura a la fila).
    const dedupVisualDeAplazada = registro?.dedupVisualDe ?? null;
    // Solo se RESUELVE una banda que SIGUE aplazada (registro.dedup ===
    // "visual-aplazada"): jamás revertir un veredicto "identidad" previo
    // (el dueño pudo PROCESAR IGUAL una dup real — su traza queda intacta).
    const falsoPositivoEvitado =
      identidad != null &&
      originalIdentidad == null &&
      dedupVisualDeAplazada != null &&
      registro?.dedup === "visual-aplazada";
    if (falsoPositivoEvitado) {
      logger.info(
        `[e14] dedup-identidad fila=${fila.id} falso-positivo-visual evitado serie=${identidad!.serie} original-visual=${dedupVisualDeAplazada}`,
      );
    }

    // ─── e72 — P2.1-v2: el veredicto de dedup por CONTENIDO manda sobre el
    // envío ─── Segundo plano de la MISMA race del smoke del dueño
    // (imagen9/imagen10): la fila llegó AL DESENLACE con el veredicto puesto
    // (traza «v2» de cadenaDedup — cinta cierta, estampada aunque el guard
    // anti-zombi bloqueara la marca pre-OCR) o con una gemela EXACTA
    // (hashBytes sha256 idéntico) ya resuelta. El desenlace NUNCA envía:
    // resolver por la maquinaria P2.1 (reutilizarResultado — la copia hereda
    // DUPLICADA o RECHAZADA) o, sin original resoluble, DUPLICADA con SU
    // PROPIO desenlace (doctrina capa-2 e63k: revisión disponible, cero
    // envío, cero contador). LA ORIGINAL JAMÁS CAE AQUÍ: su traza es
    // «sin-match» (la cadena es FIFO — sus candidatas son ANTERIORES) y una
    // gemela en cola (DUPLICADA/PENDIENTE posterior) sin traza v2 no activa
    // el guard. La gemela en vuelo cuenta SOLO si es ANTERIOR (agregadaEn
    // menor): esperar a una POSTERIOR sería esperarla a ELLA que espera por
    // ESTA — deadlock imposible por construcción. forzarDedupOff (PROCESAR
    // IGUAL) manda SIEMPRE (RL-e65b-6 — el escape del dueño es sagrado).
    if (!fila.forzarDedupOff && registro != null && registro.hashBytes != null) {
      const hashNeto: string = registro.hashBytes;
      // Whitelist de estados (T-5 e65: la literal YA-ENVIADA jamás se escribe
      // en el runner — el QA la veta; AUSENTE/ERROR/ya-enviada quedan fuera
      // por construcción: sin acta copiable no hay resolución posible).
      const gemelasHash = storeMasiva()
        .getState()
        .filas.filter(
          (f) =>
            f.id !== fila.id &&
            f.hashBytes === hashNeto &&
            (f.estado === "PENDIENTE" ||
              f.estado === "PROCESANDO" ||
              f.estado === "LISTA" ||
              f.estado === "DUPLICADA"),
        )
        .sort((a, b) => a.agregadaEn - b.agregadaEn);
      const originalLista =
        gemelasHash.find((f) => f.estado === "LISTA") ?? null;
      const originalEnVuelo =
        gemelasHash.find(
          (f) =>
            (f.estado === "PENDIENTE" || f.estado === "PROCESANDO") &&
            f.agregadaEn < fila.agregadaEn,
        ) ?? null;
      if (registro.dedup === "v2" || originalLista != null) {
        const tNet = Date.now();
        let copiado = false;
        if (originalLista != null) {
          const filaGemela: FilaMasiva = {
            ...fila,
            estado: "DUPLICADA",
            dupOf: originalLista.id,
          };
          copiado = await reutilizarResultado(filaGemela, tNet);
        }
        if (!copiado && originalEnVuelo != null) {
          // La gemela cierta aún no aterriza (profunda en la cola/vuelo) →
          // esperar su desenlace (mismo guard acotado de la rama DUPLICADA)
          // y copiar: la OCR de ESTA fila ya se pagó (precio de la race) —
          // el desenlace correcto sigue siendo el de la original.
          if (await esperarDesenlaceOriginal(fila.id, originalEnVuelo.id)) {
            const filaGemela: FilaMasiva = {
              ...fila,
              estado: "DUPLICADA",
              dupOf: originalEnVuelo.id,
            };
            copiado = await reutilizarResultado(filaGemela, tNet);
          }
        }
        if (copiado) return;
        // (c) Sin original resoluble (gemela QUITADA en la carrera / «v2»
        // por dHash de bytes distintos / gemela desaparecida) → DUPLICADA
        // con SU PROPIO desenlace (revisión disponible — cero envío, cero
        // contador; el OCR pagado fue el precio de la race y el informe lo
        // muestra honesto con sus tiempos reales). La voluntad del dueño
        // manda: una fila QUITADA en la espera no resucita registro.
        if (!storeMasiva().getState().filas.some((f) => f.id === fila.id)) {
          return;
        }
        const thumbNet = await hacerThumb(
          actaDesenlace.fotoProcesada ?? actaDesenlace.fotoOriginal,
        );
        await guardarRegistro({
          ...registro,
          estado: "DUPLICADA",
          acta: {
            ...actaDesenlace,
            status: "DUPLICADA",
            enviadoAutomaticamente: null,
            ...(actaDesenlace.diagnostico
              ? {
                  diagnostico: {
                    ...actaDesenlace.diagnostico,
                    status: "DUPLICADA" as const,
                  },
                }
              : {}),
          },
          thumb: thumbNet,
          infoTitulo: tituloDeActa(actaDesenlace),
          ...(identidad ? { serie: identidad.serie } : {}),
          ...(qrPayload ? { qrPayload } : {}),
          ...(qrEstadoCapa0 ? { qrEstado: qrEstadoCapa0 } : {}),
          // WAVE3 §B — la DUPLICADA tras un rescate cuenta como SALVADA
          // (desenlace final ≠ RECHAZADA — traza honesta del informe).
          ...(rescateLanzado ? { rescateRechazo: "salvado" as const } : {}),
        });
        marcarFila(fila.id, {
          estado: "DUPLICADA",
          dupOf: originalLista?.id ?? originalEnVuelo?.id ?? null,
          statusActa: "DUPLICADA",
          score: actaDesenlace.score,
          nivel: actaDesenlace.clasificacion?.nivel ?? null,
          pagina: paginaDeActa(actaDesenlace),
          infoTitulo: tituloDeActa(actaDesenlace),
          motivo: actaDesenlace.rechazo?.tipo ?? null,
          thumb: thumbNet,
          enviadaAuto: false,
          ...(identidad ? { serie: identidad.serie } : {}),
          error: null,
        });
        logger.info(
          `[e14] dedup fila=${fila.id} desenlace-contenido DUPLICADA v2=${registro.dedup === "v2"} gemela=${originalLista?.id ?? originalEnVuelo?.id ?? "sin-original"} (sin envío propio)`,
        );
        return; // NO registrarEnvioMasiva NI contarMotivoNoEnvioActa (patrón capa-2)
      }
    }

    // Desenlace → la MISMA vía que el flujo normal (T3.3/T3.2). El envío
    // automático reutiliza registrarEnvio (historial + completadas + hueco
    // archivado + cola offline); el resto cae al contador T5 con las
    // MISMAS claves.
    let actaFinal = actaDesenlace;
    let enviadaAuto = false;
    // D61 — KIT e14-tiempos-ocultos-v1 (T3): coste del ENVÍO del desenlace —
    // registrarEnvioMasiva (hash + historial + completadas + hueco archivado +
    // cola offline; la sección síncrona del envío). SOLO hay envío real ONLINE:
    // offline/EN COLA y no-OPTIMA → campo OMITIDO (jamás 0 falso — kit §2-T3).
    let envioMs: number | null = null;
    // WAVE3 G.5 — latencia del CHECK remoto (ledger D1 — §A.3). Estampa en
    // el MISMO parche D61 (viaja solo en envíos online — mismos nulls
    // honestos: sin check → omitido, jamás inventar).
    let remotoMs: number | null = null;
    if (actaDesenlace.status === "OPTIMA") {
      // HOTFIX H1 (fix/ya-enviada-veto-postocr-v1) — veto ya-enviada POST-OCR:
      // si el payload del QR (presente en el desenlace) ya pertenece a una
      // ENVIADA del histórico, el envío JAMÁS sale. La capa 0 consulta el
      // ledger pre-OCR (L543-562) pero SOLO en la rama sin original de sesión
      // (`if (!originalQr)`) — las rutas que llegan aquí CON payload en mano
      // (fallback de reutilizarResultado=false, original PENDIENTE/ERROR,
      // techo-vencido de la APLAZADA) hoy envían sin volver a consultar.
      // ADAPTACIÓN al árbol real (el kit cita `diag.qrPayload` — el bridge
      // OMITE qrCam en masiva, scanner-core-bridge L1156): las fuentes reales
      // del payload en el punto de envío son la capa 0 de ESTA corrida
      // (qrPayload local), el acta (futuro-proof — undefined hoy en masiva) y
      // el registro (payload persistido por una pasada previa del MISMO
      // registro — ERROR/DUPLICADA reprocesada). MISMA llave exacta y
      // maquinaria de capa0-qr (marcarYaEnviada via "payload") — RED LINES:
      // sin fuzzy. Índice caído → null conservador (RL-e65b-3): la fila sigue
      // su curso como hoy. forzarDedupOff manda SIEMPRE (RL-e65b-6 — el
      // escape del dueño es sagrado, mismas capas L543/L580).
      const diagQr =
        qrPayload ?? actaDesenlace.qrPayload ?? registro.qrPayload ?? null;
      if (diagQr && !fila.forzarDedupOff) {
        const enviadaPostOcr = await enviadaPorPayload(diagQr);
        if (enviadaPostOcr && enviadaPostOcr.id !== fila.id) {
          if (
            await marcarYaEnviada(
              fila.id,
              enviadaPostOcr.id,
              "payload",
              undefined,
              undefined,
              diagQr,
              true,
              "ya-enviada-postocr", // WAVE3 C.2 — puerta del veto AL FINAL (D57): distingue el veto post-OCR (OCR ya pagado)
            )
          ) {
            logger.info(
              `[e14] veto ya-enviada post-ocr ${qrCorto(diagQr)} fila=${fila.id} hist=${enviadaPostOcr.id}`,
            );
            return; // sin envío — el OCR pagado es costo hundido (caso raro)
          }
        }
      }
      // WAVE3 §A.3 — veto ya-enviada REMOTO (ledger D1 en Cloudflare — la
      // garantía definitiva vive FUERA del navegador): el gap real del lote
      // 9 fue doble envío tras borrar IndexedDB + cambiar de origen. El
      // check SOLO usa el SHA-256 del payload (privacidad dura — jamás el
      // payload). MISMO escape del dueño: forzarDedupOff salta TAMBIÉN el
      // remoto (RL-e65b-6). Timeout 3 s / fallo → continuar como hoy
      // (doctrina del conservador: el remoto es una red EXTRA, jamás una
      // dependencia). El marcado fallido (IDB caído) también continúa.
      if (diagQr && !fila.forzarDedupOff) {
        const payloadHashRemoto = await sha256HexDeTexto(diagQr);
        if (payloadHashRemoto) {
          const tRemoto = Date.now();
          const remoto = await consultarEnvioRemoto(payloadHashRemoto);
          remotoMs = Date.now() - tRemoto;
          if (remoto && remoto.duplicado) {
            const marcadoRemoto = await marcarYaEnviada(
              fila.id,
              remoto.filaOriginal ?? "remoto",
              "payload-remoto", // WAVE3 §A.3/D57 — valor NUEVO AL FINAL
              undefined,
              undefined,
              diagQr,
              true,
            );
            if (marcadoRemoto) {
              logger.info(
                `[e14] veto ya-enviada REMOTO ${qrCorto(diagQr)} fila=${fila.id} remoto=${remoto.filaOriginal ?? "?"}`,
              );
              return; // sin envío — igual que H1 (costo OCR hundido)
            }
          } else if (remoto === null) {
            logger.info("[e14] ledger remoto indisponible — continúo");
          }
        }
      }
      // KIT e14-masiva-ux-v1 (T3.2): el envío respeta la conexión del momento
      // (misma semántica que registrarEnvio para actaActual): OFFLINE →
      // hashSha256 "EN COLA" — la fila pinta «EN COLA» y refrescarEnviosTrasDrenaje
      // la drena al reconectar. Online → el hash lo maneja el flujo normal.
      const onlineAlEnviar = useE14Store.getState().online;
      const tEnvio = onlineAlEnviar ? performance.now() : 0;
      useE14Store.getState().registrarEnvioMasiva(actaDesenlace, (pub) => {
        // D45 — KIT e14-medicion-faltante-v1: la PUBLICACIÓN al monitor
        // aterrizó — este es el roundtrip REAL de red (envioMs de D61 solo
        // medía la sección síncrona, ≈1 ms). Observador pasivo: re-put
        // idempotente de la métrica (llega DESPUÉS del desenlace — fire-
        // and-forget, jamás bloquea ni tumba nada — RL-e65b-3).
        registrarMetricaEnvioRound({
          filaId: fila.id,
          envioRoundMs: pub.ms,
          envioEstado: pub.estado,
        });
      });
      actaFinal = {
        ...actaDesenlace, // e63f F2: el desenlace POST re-lectura manda (si AUTO → clasificación nueva viaja al envío)
        status: "ENVIADA",
        enviadoAutomaticamente: getBridge().horaEnvio(),
        ...(onlineAlEnviar ? {} : { hashSha256: "EN COLA" }),
      };
      enviadaAuto = true;
      // e65b (T-3a): el envío propio alimenta el LEDGER (historico.ts —
      // sobrevive vaciar/recargas, D-e65b-1) — fire-and-forget, jamás
      // bloquea ni tumba el envío (RL-e65b-2/3). El payload/serie VIVOS de
      // ESTA corrida mandan sobre los del registro leído (la capa 0 acaba
      // de decodificar el QR y la capa 2 la serie).
      // HOTFIX H2 (fix/ya-enviada-veto-postocr-v1) — el ledger lleva las
      // llaves FRESCAS de la fila: `registro` se leyó al ENTRAR al pipeline
      // (L427) y cadenaDedup persiste hashDedup/hashBytes DESPUÉS (carrera
      // ingesta×pipeline — el valor del snapshot viaja undefined). La fila
      // viva del store lleva lo que cadenaDedup estampó (guardarRegistro +
      // patchFila de la cadena). Sin estos campos el cinturón
      // dhash-vs-histórico D-e65-6 SALTA la entrada del índice
      // (`if (!h.hashDedup ...) continue`) — caso imagen10: una copia
      // re-saved a Hamming 0 de una enviada no era atrapada en ingesta.
      // Sin campos nuevos: completar la escritura de campos ya declarados
      // (EntradaHistorica.hashDedup/hashBytes — mismo contrato del índice).
      const filaViva = storeMasiva().getState().filas.find(
        (f) => f.id === fila.id,
      );
      void registrarEnviadaHistorico({
        id: fila.id,
        ts: Date.now(),
        hashBytes: filaViva?.hashBytes ?? registro.hashBytes,
        hashDedup: filaViva?.hashDedup ?? registro.hashDedup,
        payloadQr: qrPayload ?? undefined,
        serie: identidad?.serie ?? registro.serie ?? undefined,
      }).catch(() => {}); // fire-and-forget — jamás bloquea ni tumba el envío (RL-e65b-3)
      // WAVE3 §A.3 — registro REMOTO tras el envío local exitoso (junto al
      // H2, MISMA disciplina RL-e65b-3: fire-and-forget). Dirección del
      // riesgo asumida y documentada (kit §1): registrar DESPUÉS del envío —
      // un duplicado es detectable; un acta perdida no. SOLO online (offline
      // → el registro nace en refrescarEnviosTrasDrenaje). forzarDedupOff
      // salta TAMBIÉN el remoto (RL-e65b-6 — el escape del dueño manda).
      if (diagQr && onlineAlEnviar && !fila.forzarDedupOff) {
        const payloadRegistro = diagQr;
        const serieRegistro = identidad?.serie ?? registro.serie ?? undefined;
        const filaRegistro = fila.id;
        void (async () => {
          const payloadHash = await sha256HexDeTexto(payloadRegistro);
          if (!payloadHash) return; // sin crypto — sin registro (conservador)
          await registrarEnvioRemoto({
            payloadHash,
            serie: serieRegistro,
            filaId: filaRegistro,
            origenUrl: origenActual() ?? undefined,
          });
        })().catch(() => {});
      }
      if (onlineAlEnviar) envioMs = Math.round(performance.now() - tEnvio);
    } else {
      useE14Store.getState().contarMotivoNoEnvioActa(actaDesenlace);
    }
    // D61 (T3): parche INMUTABLE del diagnóstico con envioMs — MISMO patrón
    // del parche esperaMs de D57 (spread, solo si diagnostico != null). Va
    // ANTES de construir registroListo → viaja en la PRIMERA persistencia.
    if (envioMs != null && actaFinal.diagnostico != null) {
      // §G.2 — ORDEN-WAVE3-add-envio-individual-v1: la red del momento del
      // envío viaja JUNTO al envioMs D61 (mismo parche inmutable — mismos
      // nulls honestos: sin navigator.connection → null, jamás inventar).
      // WAVE3 G.5 — remotoMs (latencia del check del ledger) viaja en el
      // MISMO parche cuando el check corrió (omitido si no — jamás inventar).
      const redEnvio = redActual();
      actaFinal = {
        ...actaFinal,
        diagnostico: {
          ...actaFinal.diagnostico,
          tiempos: {
            ...actaFinal.diagnostico.tiempos,
            envioMs,
            ...(remotoMs != null ? { remotoMs } : {}),
          },
          envioRedTipo: redEnvio?.tipo ?? null,
          envioDownlinkMbps: redEnvio?.downlinkMbps ?? null,
        },
      };
    }

    // D35 — thumbMs: la miniatura de la bandeja es TRABAJO REAL del main
    // thread post-pipeline (decode completo + canvas + JPEG). Cronometrado
    // para decidir su destino (quitar/degradar) con datos del INFORME.
    const tThumb0 = performance.now();
    const thumb = await hacerThumb(acta.fotoProcesada ?? acta.fotoOriginal);
    const thumbMs = performance.now() - tThumb0;
    const registroListo: RegistroMasiva = {
      ...registro,
      estado: "LISTA",
      acta: actaFinal,
      thumb,
      // D59 — KIT e14-info-acta-filas-v1 (T2): título con la info reconocida
      // del desenlace REAL (persiste — desviación aditiva de thumb).
      infoTitulo: tituloDeActa(actaFinal),
      // e63k (F1.4): resolución final del FP visual evitado — "sin-match"
      // cierra la banda aplazada; dedupDistancia y dedupVisualDe quedan como
      // estaban (spread de arriba — post-mortem del falso positivo).
      ...(falsoPositivoEvitado ? { dedup: "sin-match" as const } : {}),
      // e63k (F1.4): regla general de persistencia de la serie (aplica
      // SIEMPRE que haya desenlace con identidad leída, también cuando NO
      // es dup — sirve al mapa de la cola y al informe). Ausente = sin
      // consenso (jamás inventar — RED LINE 2).
      ...(identidad ? { serie: identidad.serie } : {}),
      // D66 — KIT e14-decode-unico-precalor-v1 (T4): trazas de decodificación
      // ADITIVAS del master del DESENLACE (solo con master — sin él los
      // campos VIAJAN AUSENTES: registros previos/ERROR/fallback quedan como
      // hoy — jamás inventar). decodeMs top-level ≠ tiempos.decodeMs (D61 —
      // decode del archivo por el bridge; semánticas distintas, ambas honestas).
      ...(maestroDesenlace
        ? {
            decodeMs: decodeMasterMs ?? 0,
            origenDecode: maestroDesenlace.origenDecode,
            precalentada: intentoDesenlace === 1 && !!entradaPrecalor,
            precalorMs:
              intentoDesenlace === 1 ? (entradaPrecalor?.precalorMs ?? null) : null,
          }
        : {}),
      // e63m — payload QR de la CAPA 0 (llave opaca): campo ADITIVO AL FINAL
      // (contrato D57) — absent = sin-payload (jamás inventar). Export-only.
      ...(qrPayload ? { qrPayload } : {}),
      // KIT e14-tiempos-v2 (D44-R2) — la capa 0 HEREDÓ (sondeo/prescan):
      // ausente = pagó decode/ladder completo (o sin payload). Aditivo D57.
      ...(qrHeredado ? { qrHeredado: true } : {}),
      // e64-qr T-0.2 — estado SOLO-VISUAL de la capa 0 (chip QR ✓/✗;
      // sobrevive la recarga vía filaDeRegistro). Aditivo al final (D57).
      ...(qrEstadoCapa0 ? { qrEstado: qrEstadoCapa0 } : {}),
      // WAVE3 §B — traza del rescate anti-falso-rechazo (ADITIVA AL FINAL,
      // D57): "salvado" = el desenlace final ≠ RECHAZADA tras el reintento;
      // "lanzado" = el reintento también rechazó (se acepta el rechazo —
      // honesto). Ausente = sin rescate (jamás inventar).
      ...(rescateLanzado
        ? {
            rescateRechazo: (
              actaDesenlace.status !== "RECHAZADA" ? "salvado" : "lanzado"
            ) as "salvado" | "lanzado",
          }
        : {}),
    };
    // FIX M14 (auditoría 2-c): persistencia fallida TRAS el envío — la fila
    // NO pasa a ERROR (el acta SÍ se transmitió; una fila ERROR invita a
    // reprocesar → doble envío tras recarga) y el registro JAMÁS queda
    // PENDIENTE con el archivo (el reproceso automático re-enviaría).
    // Reintento MÍNIMO: estado LISTA + desenlace liviano, SIN el acta
    // completa (la causa típica del fallo es quota — el registro con acta
    // de ~15 MB no cabe; el liviano sí).
    // D61 — KIT e14-tiempos-ocultos-v1 (T3): la MISMA ventana mide ahora la
    // persistencia del desenlace (guardarRegistro principal + fallback
    // liviano — kit §2-T3): persistMs = coste REAL del write que el usuario
    // experimenta. Si ambos writes fallan, el campo se OMITE (sin dato —
    // jamás inventar).
    let persistMs: number | null = null;
    const tPersist = performance.now();
    try {
      await guardarRegistro(registroListo);
      persistMs = Math.round(performance.now() - tPersist);
    } catch {
      try {
        await guardarRegistro({ ...registro, estado: "LISTA", thumb });
        persistMs = Math.round(performance.now() - tPersist);
      } catch {
        /* IDB caída del todo — la fila vive honesta en memoria (LISTA);
           persistMs se omite (sin dato — jamás inventar). */
      }
    }
    // D61 (T3) — re-save de INSTRUMENTO (FUERA del desenlace): persistMs nace
    // DEL write que lo mide (paradoja del instrumento — no puede viajar dentro
    // de él). Con el valor ya medido, parchea el diagnóstico (patrón inmutable
    // de esperaMs) y re-persiste para que sobreviva la recarga (kit T5 — IDB).
    // Best-effort y SILENCIOSO: si falla, IDB se queda con el write 1 —
    // desenlace INTACTO (sin este campo; honesto). El liviano del fallback no
    // lleva acta → sin diagnóstico → no hay nada que parchear (omitido).
    if (persistMs != null && registroListo.acta?.diagnostico != null) {
      try {
        await guardarRegistro({
          ...registroListo,
          acta: {
            ...registroListo.acta,
            diagnostico: {
              ...registroListo.acta.diagnostico,
              tiempos: {
                ...registroListo.acta.diagnostico.tiempos,
                persistMs,
              },
            },
          },
        });
      } catch {
        /* el write 1 manda — persistMs viaja solo si este re-save cabe */
      }
    }
    marcarFila(fila.id, {
      estado: "LISTA",
      statusActa: actaFinal.status,
      score: actaFinal.score,
      nivel: actaFinal.clasificacion?.nivel ?? null,
      pagina: paginaDeActa(actaFinal),
      infoTitulo: tituloDeActa(actaFinal), // D59 — KIT e14-info-acta-filas-v1 (T2)
      motivo: actaFinal.rechazo?.tipo ?? null,
      thumb,
      enviadaAuto,
      envioEnCola: actaFinal.hashSha256 === "EN COLA", // KIT e14-masiva-ux-v1 (T3.2)
      // e63f (F2): el desenlace pasó por la re-lectura interna (trazabilidad
      // — el detalle auto|sin-cambio vive en la traza RelecturaInterna=).
      relectura: relecturaDesenlace != null,
      // e63k (F1.4): serie impresa al mapa de la cola (identidad capa 2).
      serie: identidad?.serie ?? null,
      error: null,
    });
    // D34 — métricas por acta (observador pasivo — fire-and-forget): el
    // desglose de etapas YA existe en actaFinal.diagnostico.tiempos.
    registrarMetricaDesenlace({
      filaId: fila.id,
      nombre: fila.nombre,
      acta: actaFinal,
      sondeoQrMs: fila.sondeoQrMs,
      thumbMs,
      // KIT e14-etapas-preocr-v1 (D43): el muro pre-OCR sube al informe
      // (ausente si la fila jamás despachó el bridge — jamás inventar).
      ...(preOcrMs != null ? { preOcrMs } : {}),
      // KIT e14-tiempos-v2 (D44) — sub-desglose + trazas del despacho: los 4
      // sub-segmentos viajan JUNTOS cuando el muro corrió (con sus 0 reales —
      // master=0 = precalentada); qrHeredado true|false EXPLÍCITO (false =
      // pagó ladder — el dato de la palanca ①).
      ...(preOcrMs != null && preOcrQrMs != null
        ? {
            preOcrQrMs,
            preOcrOrigenMs,
            preOcrDeskewMs,
            preOcrMasterMs,
            qrHeredado,
          }
        : {}),
      ...(tsDespacho != null ? { tsInicio: tsDespacho } : {}),
      ...(preOcrPasadas > 1 ? { reintentosPreOcr: preOcrPasadas - 1 } : {}),
      dedup: registro?.dedup,
      // D45 — diagnóstico del dedup de ingesta (POR QUÉ sin-match): la traza
      // fresca del registroListo manda (el spread de arriba la trae de
      // cadenaDedup; el override "sin-match" de e63k solo toca `dedup`).
      ...(registroListo.dedupDetalle
        ? { dedupDetalle: registroListo.dedupDetalle }
        : {}),
    });
  } catch (err) {
    // Errores de IDB/decode/pipeline NUNCA tumban la UI (kit §3): la
    // entrada pasa a ERROR con motivo corto (repetible — quitar y
    // re-soltar la foto vuelve a encolarla).
    // FIX M8-b (auditoría 2-c): el guard anti-zombi TAMBIÉN en el catch —
    // re-persistir el registro de una fila QUITADA lo revivía al recargar.
    if (!storeMasiva().getState().filas.some((f) => f.id === fila.id)) return;
    // D59 — KIT e14-info-acta-filas-v1 (T2): la fila ERROR NUNCA muestra
    // título viejo (infoTitulo: null — limpiar en el catch).
    marcarFila(fila.id, {
      estado: "ERROR",
      error: motivoCorto(err),
      infoTitulo: null,
      thumb: undefined,
    });
    // D34 — métricas: desenlace ERROR (totalMs null — jamás inventar).
    registrarMetricaError({
      filaId: fila.id,
      nombre: fila.nombre,
      error: motivoCorto(err),
      sondeoQrMs: fila.sondeoQrMs,
      // KIT e14-tiempos-v2 (D44) — post-mortem honesto: qrHeredado SOLO true
      // (false prematuro mentiría — la capa 0 pudo no correr); el contador de
      // re-arms y el tsInicio viajan si alcanzaron a nacer.
      ...(tsDespacho != null ? { tsInicio: tsDespacho } : {}),
      ...(qrHeredado ? { qrHeredado: true } : {}),
      ...(preOcrPasadas > 1 ? { reintentosPreOcr: preOcrPasadas - 1 } : {}),
    });
    if (registro) {
      try {
        await guardarRegistro({
          ...registro,
          estado: "ERROR",
          // e63m: si el QR decodificó antes de que el pipeline fallara, el
          // payload viaja también en la fila ERROR (post-mortem honesto).
          ...(qrPayload ? { qrPayload } : {}),
          // KIT e14-tiempos-v2 (D44-R2): herencia — ídem (solo true; false
          // prematuro mentiría si el throw fue antes de la capa 0).
          ...(qrHeredado ? { qrHeredado: true } : {}),
          // e64-qr T-0.2: el estado de la capa 0 ídem — si la capa 0 corrió
          // antes del fallo, "leido"/"sin-payload" viajan; si el throw fue
          // ANTES de la capa 0, el campo viaja AUSENTE (jamás inventar).
          ...(qrEstadoCapa0 ? { qrEstado: qrEstadoCapa0 } : {}),
          // D65 (T1.4): si un intento murió por watchdog antes del error real,
          // la traza sobrevive también en la fila ERROR (honesto).
          ...(watchdogUsados > 0
            ? {
                watchdog: watchdogUsados,
                ...(etapaAlMorir != null ? { etapaAlMorir } : {}),
                ...(elapsedMuerteMs != null ? { elapsedMs: elapsedMuerteMs } : {}),
              }
            : {}),
          // WAVE3 §B — el rescate lanzado no se pierde en un ERROR tardío
          // (traza honesta del post-mortem — el intento 2 pagó su costo).
          ...(rescateLanzado ? { rescateRechazo: "lanzado" as const } : {}),
        });
      } catch {
        /* IDB otra vez — la fila ya quedó ERROR en memoria (honesto) */
      }
    }
  } finally {
    // e71 (Opt-3): la vida de ESTA fila muere con ella (Map por-fila).
    vidas.delete(fila.id);
    const progreso = storeMasiva().getState().progreso;
    if (progreso?.id === fila.id) storeMasiva().setState({ progreso: null });
  }
}

/** C5 — RE-VISITA de UNA duplicada aparcada (fin de la ola — la llama
 *  bucle()). Copia si la original ya aterrizó durante la ola; si sigue sin
 *  desenlace, cae al fallback HONESTO de la rama DUPLICADA (des-marcar a
 *  PENDIENTE — la MISMA ola la reprocesa completa por la puerta de siempre).
 *  JAMÁS espera ni reaparca: una aparcada se resuelve exactamente UNA vez
 *  (terminación garantizada del bucle). QUITADA en el aparcado → nada (la
 *  voluntad del dueño manda — misma regla de esperarDesenlaceOriginal). */
async function revisitarDuplicadaAparcada(fila: FilaMasiva): Promise<void> {
  if (!storeMasiva().getState().filas.some((f) => f.id === fila.id)) return;
  marcarFila(fila.id, { estado: "PROCESANDO", error: null });
  if (await reutilizarResultado(fila, Date.now())) return;
  marcarFila(fila.id, { estado: "PENDIENTE", dupOf: null });
  try {
    // D41 — lectura RAW: solo spread base del re-save (sin dataURLs que
    // materializar — idéntico al fallback de la rama DUPLICADA).
    const registro = await leerRegistroRaw(fila.id);
    await guardarRegistro({ ...registro, estado: "PENDIENTE", dupOf: undefined });
  } catch {
    /* IDB caído — la fila ya está PENDIENTE en memoria (honesto) */
  }
  logger.info(`[e14] dedup fila=${fila.id} sin-original reprocesa-completo`);
}

async function bucle(): Promise<void> {
  // e71 (Opt-3) — PARALELISMO 2 WORKERS (kit e71-consolidación, benchmark
  // aprobado): pool de PROCESAMIENTO_CONCURRENTE actas EN VUELO. La fila se
  // RESERVA antes de disparar su pipeline (ventana entre siguientePendiente
  // y el marcarFila PROCESANDO de procesarUno — el segundo worker jamás la
  // toma). El bucle espera a que un slot se libere (Promise.race) y al
  // final espera a las filas en vuelo (el finally del runner apaga solo
  // cuando TODO aterrizó — mismo contrato del secuencial).
  const enVuelo = new Set<Promise<void>>();
  while (!stopFlag) {
    while (enVuelo.size >= procesamientoConcurrenteEfectivo()) {
      await Promise.race(enVuelo);
    }
    const fila = siguientePendiente();
    if (!fila) {
      // C5 — FIN DE LA OLA con aparcadas: RE-VISITA antes de romper (en
      // FIFO). Cada una copia (original aterrizada) o cae al fallback
      // honesto → PENDIENTE, que el `continue` re-entra a ESTA misma ola.
      // La re-visita jamás reaparca: siguiente pasada o rompe (todo
      // resuelto) o toma trabajo real — terminación garantizada.
      if (dedupAparcadas.size > 0) {
        const idsAparcadas = [...dedupAparcadas];
        dedupAparcadas.clear();
        const ordenadas = storeMasiva()
          .getState()
          .filas.filter((f) => idsAparcadas.includes(f.id))
          .sort((a, b) => a.agregadaEn - b.agregadaEn);
        for (const aparcada of ordenadas) {
          await revisitarDuplicadaAparcada(aparcada);
        }
        continue;
      }
      break;
    }
    reservadas.add(fila.id);
    // D66 — KIT e14-decode-unico-precalor-v1: prefetch RE-APUNTADO (D61) —
    // al iniciar N se asegura el MASTER de N+1 (decode oculto tras el OCR
    // de N, AC-P1 intacto) vía el precalor. El consumo vive en procesarUno
    // (consumirMaestro — el master de N pudo venir del precalor de la cola
    // ociosa o de este prefetch; DUPLICADA no consume master: es copia).
    dispararPrefetch(fila.id);
    const vuelo: Promise<void> = procesarUno(fila).finally(() => {
      reservadas.delete(fila.id);
      enVuelo.delete(vuelo);
    });
    enVuelo.add(vuelo);
  }
  await Promise.all(enVuelo);
}

/** D66 — KIT e14-decode-unico-precalor-v1 (prefetch D61 re-apuntado, T3.1):
 *  asegura el MASTER de la próxima fila pipeline-able (PENDIENTE, no temp,
 *  no DUPLICADA) con `ignorarOciosidad` — el decode de N+1 se esconde tras
 *  el OCR de N igual que hoy (AC-P1), pero produce el master que el
 *  pipeline SÍ consume (la memo del original quedó sin consumidor).
 *  Idempotente (asegurarMaestro no duplica) y jamás bloquea: si falla, la
 *  fila procesa con build inline o fallback (AC-P2). */
function dispararPrefetch(filaActualId: string): void {
  if (stopFlag) return;
  const proxima = storeMasiva()
    .getState()
    .filas.filter(
      (f) =>
        f.estado === "PENDIENTE" &&
        f.id !== filaActualId &&
        !f.id.startsWith("masiva-temp-"),
    )
    .sort((a, b) => a.agregadaEn - b.agregadaEn)[0];
  if (!proxima) return;
  void asegurarMaestro(proxima.id);
}

/** UN solo runner global (módulo singleton) — `iniciar()` double-call →
 *  no-op (kit §4 regla 1). */
export function iniciarRunner(): void {
  if (corriendoFlag) return;
  corriendoFlag = true;
  stopFlag = false;
  rescatesCorrida = 0; // WAVE3 §B — techo del rescate por CORRIDA
  colaSesionIniciada = true; // e63g FASE 1: sesión viva — el swap puede rearrancar
  storeMasiva().setState({ corriendo: true });
  iniciarCorridaMetrica(); // D34 — abre corrida de métricas (fire-and-forget)
  void bucle().finally(() => {
    corriendoFlag = false;
    // D34/D45 — cierra la corrida con su MOTIVO (drenada o pausa — stopFlag
    // manda: manual o auto-pausa de REVISIÓN; el informe ya no tiene fin=null
    // sin dueño).
    cerrarCorridaMetrica(stopFlag ? "pausa" : "drenada");
    storeMasiva().setState({ corriendo: false, progreso: null });
  });
}

/** Pausa MANUAL: stop = true — el OCR en vuelo TERMINA (no hay aborto a
 *  mitad de pipeline; la fila queda LISTA/ERROR y el loop no toma la
 *  siguiente). PROCESAR retoma donde iba. También lo llama la AUTO-PAUSA
 *  al abrir un acta en REVISIÓN (kit §4 regla 2 — el flujo de revisión usa
 *  el main thread y actaActual, no pelear). Reanudar es MANUAL (botón). */
export function pausarRunner(): void {
  stopFlag = true;
}

/** e63g — PLAN e63g-e63h-ruta-unica (E1/FASE 1): RE-ARRANQUE del bucle tras
 *  el swap temp→id real (lo llama `agregarFiles` del store). El agujero:
 *  `siguientePendiente` salta los ids `masiva-temp-` — si la copia a IDB
 *  aterriza DESPUÉS de que el bucle rompió (cola que se vació mientras el
 *  lote copiaba), las filas nuevas quedaban PENDIENTE para siempre.
 *  Guard IDEMPOTENTE (triple):
 *  · sesión fría (el dueño JAMÁS pulsó PROCESAR) → NO arranca (D45
 *    intacto: encolar no procesa por sí solo);
 *  · pausa activa (stopFlag — manual o auto-pausa de REVISIÓN) → NO
 *    arranca (reanudar es MANUAL — contrato del botón);
 *  · cola viva → iniciarRunner() es no-op (corriendoFlag) y el bucle vivo
 *    toma las nuevas en su siguiente pasada.
 *  El re-check va DIFERIDO (macrotask): cierra la ventana en la que el
 *  bucle rompe ENTRE el swap y este llamado — al disparar el timer el
 *  `finally` del bucle ya limpió corriendoFlag, y si hay pendientes
 *  reales el bucle renace exactamente por la puerta de siempre. */
export function rearrancarTrasEncolar(): void {
  if (!colaSesionIniciada || stopFlag) return;
  setTimeout(() => {
    if (stopFlag) return; // pausa llegando tarde — el dueño manda
    // C5: las APARCADAS también exigen ola (siguientePendiente las salta) —
    // el swap temp→id real de su original es exactamente la señal que las
    // resuelve (la re-visita del fin de ola copia o cae al fallback).
    if (siguientePendiente() || dedupAparcadas.size > 0) iniciarRunner();
  }, 0);
}
