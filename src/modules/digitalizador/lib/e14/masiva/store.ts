"use client";

/**
 * KIT e14-carga-masiva-v1 (T2): MINI-STORE zustand del módulo MASIVA —
 * el store del flujo normal (useE14Store) NO sabe que MASIVA existe salvo
 * por los 3 puntos de integración T3 (kit §0.4). Estado liviano: filas sin
 * fotos (la RAM real duerme en IndexedDB — lección L7).
 */
import { create } from "zustand";
import { getBridge } from "../get-bridge";
import { useE14Store } from "@/modules/digitalizador/store/store-e14";
import {
  agregarLote,
  borrar,
  guardarRegistro,
  leerRegistro,
  listarMapeados,
  recuperarCola,
  vaciar as vaciarCola,
} from "./cola";
// e65b — KIT e65b-historico-enviadas-v1 (T-2): LEDGER PERSISTENTE de
// enviadas (DB separada — historico.ts, solo llaves/L7). El índice del
// histórico se FUSIONA con el ledger: sobrevive vaciar() y recargas
// (REVERSA de D-e65-8 → D-e65b-1).
import {
  borrarHistorico,
  listarHistorico,
  registrarEntradaHistorico,
  // KIT e73-sondeo-qr-precoz-v1 (§C) — índice histórico por payload del sondeo
  actualizarIndicePayload,
  indiceEnviadasPorPayload,
  // D33 — reiniciar-envios: reset del índice de sesión por payload
  resetearIndicePayload,
  type EntradaHistorica,
} from "./historico";
// SPLIT C1 (refactor/runner-logger-v1): hacerThumb vive en runner-thumbs.ts
import { logger } from "../../logger";
// WAVE3 §A.3 — ORDEN-WAVE3-remoto-rescate-obs-v1: cliente del ledger remoto
// (el registro nace TAMBIÉN al drenar las filas «EN COLA» — único hook de
// store.ts declarado por el kit §A.3/F).
import { origenActual, registrarEnvioRemoto, sha256HexDeTexto } from "./ledger-remoto";
// KIT e14-observabilidad-v1 (A1-C7): kill switch de thumbs (flags del dueño).
import { leerFlags } from "../flags";
// KIT e73-sondeo-qr-precoz-v1 (§B.2) — cliente del SONDEO QR en ingesta
// (worker e73: lee la identidad QR ANTES del pool — gemelas jamás pagan
// slot/probe/OCR; null honesto = la vía de HOY — doctrina del conservador).
import { sondearQrPrecoz } from "./sondeo-qr.client";
// (responsabilidad de render — movimiento puro del runner).
import { hacerThumb } from "./runner-thumbs";
import { iniciarRunner, pausarRunner, rearrancarTrasEncolar } from "./runner";
// D66 — KIT e14-decode-unico-precalor-v1: cableado del PRECALOR (T3) — la
// suscripción al mini-store vive aquí (zona del kit: «flag transitorio
// precalentada + cola de precalor») DESPUÉS de crear el store: precalor.ts
// también importa useMasivaStore (solo DENTRO de funciones — un call en su
// evaluación de módulo sería TDZ por el ciclo runner↔precalor↔store).
import { cablearPrecalor } from "./precalor";
// KIT e14-masiva-ux-v1 (T2): clasificación/extracción de archivos — las
// deps pesadas (fflate/node-unrar-js) viven DETRÁS de extraerArchivo con
// import diferido (D47): el bundle inicial no las carga.
// D60: parecePdfMasiva/extraerPdf añaden la rama PDF (pdfjs diferido ídem).
import {
  extraerArchivo,
  extraerPdf,
  pareceImagenMasiva,
  parecePdfMasiva,
} from "./archivos";
import {
  dhashDeArchivo,
  DEDUP_HAMMING_MAX,
  hamming64,
  hashBytesDeArchivo, // e65-dedup-enviadas-v1 — capa bytes (SHA-256 exacto, D-e65-1)
} from "./dedup";
// KIT e14-obs-hang-atribucion-v1 (§A.3) — hook D58 del sitio main-thread
// pesado de la cadenaDedup (precedente masiva→obs: runner.ts importa
// ../obs/dispositivo).
import { marcarOperacion } from "../obs/operacion";
// KIT e14-gama-adaptativa-v1 (D74): el guard del dhash de INGESTA (BAJO lo
// omite — ver comentario en la capa dhash de cadenaDedup).
import { planGamaActual } from "../gama";
// e63k — KIT e63k-capa2-identidad-v1: la cinta CIERTA del dedup visual (≤ 2).
// La banda 3..6 NO marca: la decide la capa 2 post-OCR (identidad.ts).
import { DEDUP_CINTA_CIERTA } from "./identidad";
import {
  paginaDeActa,
  tituloDeActa,
  type EstadoEntrada,
  type FilaMasiva,
  type RegistroMasiva,
} from "./tipos";
import type { Acta } from "../types";

export type FiltroMasiva =
  | "TODAS"
  | "OPTIMA"
  | "ADVERTENCIA"
  | "RECHAZADA"
  | "EN_REVISION_HUMANA"
  | "ERROR";

/** D65 — KIT e14-progreso-watchdog-dedup-v1 (T3): vocabulario del kit para
 *  la señal de vida de la fila ACTIVA. La fracción SOLO existe en OCR y es
 *  REAL (reconocedor por lotes de rec — §2-C4 del kit ocr-escalonado); las
 *  demás etapas van SIN número (barra animada — jamás inventar %). */
export type EtapaVidaKit = "preparando" | "deteccion" | "ocr" | "verificacion";

/** Progreso de la fila ACTIVA (throttled por el runner 250 ms — D65 T3.1).
 *  Estado TRANSITORIO: NO se persiste en IndexedDB (kit T3.4 — cada tick a
 *  IDB sería caro); al recargar la página las filas vuelven a PENDIENTE como
 *  hoy y no queda % fantasma.
 *
 *  CAMBIO (pedido del dueño): UN % para TODO el proceso del acta — antes el
 *  chip de la fila saltaba por tramos fijos por fase y el OCR escalonado
 *  (2 pasadas) hacía que el número RETROCEDIERA (95→50→95). Ahora el runner
 *  computa `fracGlobal` (0..1): cada fase del pipeline mapea a un tramo del
 *  TOTAL, las 2 pasadas del OCR reparten sub-tramos y el valor es MONOTÓNICO
 *  (jamás baja dentro de la misma acta — Math.max por señal). */
// knip C3: de-export — uso SOLO interno (estado del mini-store).
interface ProgresoFila {
  id: string;
  etapa: EtapaVidaKit;
  /** 0..1 SOLO cuando etapa === "ocr" — dato REAL del reconocedor. */
  ocrFraccion?: number;
  /** 0..1 del PROCESO COMPLETO del acta (todas las fases sumadas) —
   *  monotónico: nunca baja dentro de la misma acta. 1 = LISTA. */
  fracGlobal?: number;
}

interface MasivaStore {
  filas: FilaMasiva[];
  corriendo: boolean;
  progreso: ProgresoFila | null;
  filtro: FiltroMasiva;
  /** Acta abierta en REVISIÓN desde la bandeja (T3.4) — la identidad para
   *  sincronizar al volver. null = ninguna abierta. */
  origenAbierto: string | null;
  /** «GUARDANDO N…» — copia async de files → IDB (zona de carga). */
  guardando: number;
  /** false → píldora de fallback (IndexedDB no disponible — kit §3/§6). */
  colaDisponible: boolean;
  /** FIX (auditoría 2-c C5): true mientras corre «ENVIAR ADVERTENCIAS» —
   *  guard de re-entrancia del lote (doble tap = doble envío). */
  enviandoLote: boolean;

  /** FIX M9 (auditoría 2-c): aviso específico de QUOTA — antes cualquier
   *  fallo de escritura (casi siempre almacenamiento lleno con actas de
   *  ~15 MB/registro) degradaba a «TU NAVEGADOR NO SOPORTA LA COLA» (falso)
   *  y mataba el botón PROCESAR para TODA la bandeja. null = sin aviso. */
  avisoCola: string | null;

  /** Al montar: lista IDB → filas livianas + recuperarCola() (zombis fuera). */
  cargarFilas: () => Promise<void>;
  /** Suelta/selección de fotos: filas PENDIENTES al instante (ids temp) +
   *  copia async a IDB — al resolver, los ids reales reemplazan a los temp. */
  agregarFiles: (files: File[]) => Promise<void>;
  iniciar: () => void;
  pausar: () => void;
  /** ABRIR: auto-pausa del runner + REVISIÓN del acta (vía T3.4). */
  abrirActa: (id: string) => Promise<void>;
  /** Al volver de REVISIÓN: si la identidad coincide, re-persiste el acta
   *  ACTUALIZADA (recorte/filtro/envío — F5) y refresca la fila. Si no,
   *  SOLO limpia origenAbierto (no escribe nada). */
  sincronizarAlVolver: () => Promise<void>;
  quitar: (id: string) => Promise<void>;
  vaciar: () => Promise<void>;
  /** D33 — KIT e14-reiniciar-envios-v1: reset COMPLETO de envíos (cola +
   *  ledger del histórico + índices de sesión). El corte explícito que pide
   *  el dueño para re-probar el MISMO lote — botón de 2 toques (MasivaView);
   *  vaciar() queda byte a byte (RL-e65b-5 intacto). */
  reiniciarEnvios: () => Promise<void>;
  /** KIT e14-masiva-tiempos-v1 (PR-1): «PROCESAR IGUAL» — des-marca la fila
   *  DUPLICADA (→ PENDIENTE, dupOf fuera) para que el runner la reprocese
   *  COMPLETA (fotos distintas pueden parecer iguales en thumb — kit §2). */
  procesarIgual: (id: string) => Promise<void>;
  /** D59 — KIT e14-info-acta-filas-v1 (T3): «REINTENTAR» de una fila ERROR —
   *  la re-encola (PENDIENTE, error fuera, persistente) para que el dueño
   *  pulse PROCESAR. NO auto-procesa (misma doctrina D45: extraer/re-encolar
   *  NO procesa). Sin archivo original en IDB → la fila SIGUE en ERROR con
   *  SIN_ARCHIVO_ORIGINAL (honesto — registros viejos o filas de formato). */
  reintentar: (id: string) => Promise<void>;
  /** Envío en lote SECUENCIAL de ADVERTENCIAS (cada una vía registrarEnvio
   *  real). NO toca RECHAZADAS ni EN_RH (kit §6). */
  enviarLote: (estado: "ADVERTENCIA") => Promise<void>;
  /** D65 (T3.1): señal de vida de la fila en curso — action NUEVO del kit;
   *  el runner emite con throttle 250 ms vía bucketDeVida. Transitorio
   *  (NUNCA a IDB — kit T3.4). `fracGlobal` = % ÚNICO del proceso completo
   *  del acta (monotónico — ver ProgresoFila). */
  marcarProgreso: (
    id: string,
    progreso: { etapa: EtapaVidaKit; ocrFraccion?: number; fracGlobal?: number },
  ) => void;
  setFiltro: (filtro: FiltroMasiva) => void;
  /** e64-qr-v1 (T-0.2): estampar campos SOLO-VISUALES sobre UNA fila viva
   *  (el chip qrEstado de la CAPA 0 QR se pinta a mitad de proceso, cuando
   *  el runner acaba de decodificar). Patch INMUTABLE — el MISMO patrón del
   *  patchFila interno (el kit llama a este mutador desde el runner). */
  actualizarFila: (id: string, patch: Partial<FilaMasiva>) => void;
}

/** Registro IDB → fila LIVIANA (sin Blob, sin acta — la foto duerme). */
function filaDeRegistro(r: RegistroMasiva): FilaMasiva {
  const acta = r.acta;
  return {
    id: r.id,
    nombre: r.nombre,
    agregadaEn: r.agregadaEn,
    estado: r.estado,
    statusActa: acta?.status,
    score: acta?.score,
    nivel: acta?.clasificacion?.nivel ?? null,
    pagina: acta ? paginaDeActa(acta) : null,
    motivo: acta?.rechazo?.tipo ?? null,
    thumb: r.thumb,
    // D72: el título compuesto usa el formato compacto cuando r.acta existe
    infoTitulo: (r.acta ? tituloDeActa(r.acta) : r.infoTitulo) ?? null,
    enviadaAuto: r.acta?.status === "ENVIADA" && !!r.acta?.enviadoAutomaticamente,
    // KIT e14-masiva-ux-v1 (T3.2): el estado de envío se deriva DEL REGISTRO
    // (kit-literal: hashSha256 === "EN COLA") — sobrevive la recarga.
    envioEnCola: acta?.hashSha256 === "EN COLA",
    // KIT e14-masiva-ux-v1 (T2): el motivo corto de las filas ERROR sin
    // acta (guards de extracción/formato) sobrevive la recarga.
    error:
      r.estado === "ERROR"
        ? (r.error ?? (r.acta ? null : "ERROR DE COLA"))
        : null,
    // KIT e14-masiva-tiempos-v1 (PR-1): dedup persistente — sobrevive la
    // recarga (la fila sigue DUPLICADA y el runner puede copiar igual).
    hashDedup: r.hashDedup ?? null,
    dupOf: r.estado === "DUPLICADA" ? (r.dupOf ?? null) : null,
    // D63-A2 (T1): viaPdf sobrevive la recarga (el override de origen del
    // runner sigue funcionando a mitad de corrida). Ausente = no-PDF.
    ...(r.viaPdf ? { viaPdf: true } : {}),
    // e63k (F1): la serie impresa (mapa de identidad de la capa 2) y el
    // override del dueño sobreviven la recarga. Aditivos al final del
    // objeto retornado (contrato D57). Ausentes = registros previos.
    serie: r.serie ?? null,
    ...(r.forzarDedupOff ? { forzarDedupOff: true } : {}),
    // e64-qr-v1 (T-0.2): el estado de la CAPA 0 QR sobrevive la recarga.
    // Derivación honesta para registros e63m (traen qrPayload pero nacieron
    // antes de qrEstado): el payload EXISTE ⇒ fue leído. undefined → la fila
    // pinta sin chip ("n/d" — la capa 0 no corrió o el registro es previo).
    qrEstado: r.qrEstado ?? (r.qrPayload ? "leido" : undefined),
    // e65-dedup-enviadas-v1 (T-6): la YA-ENVIADA y sus llaves sobreviven la
    // recarga — hashBytes SIEMPRE (llave de dedup viva para la cola viva
    // tras recargar), enviadaDe SOLO cuando el estado lo es (SOLO-VISUAL).
    hashBytes: r.hashBytes ?? null,
    ...(r.estado === "YA-ENVIADA" ? { enviadaDe: r.enviadaDe ?? null } : {}),
    // KIT e73-sondeo-qr-precoz-v1 (§E) — la telemetría del sondeo sobrevive
    // la recarga (chip «Sondeo QR N/M» + p50/p95 del informe). Aditivos AL
    // FINAL del objeto retornado (contrato D57). Ausentes = registros previos.
    ...(r.sondeoQrMs != null ? { sondeoQrMs: r.sondeoQrMs } : {}),
    ...(r.sondeoQrTier != null ? { sondeoQrTier: r.sondeoQrTier } : {}),
  };
}

function patchFila(id: string, patch: Partial<FilaMasiva>): void {
  const filas = useMasivaStore.getState().filas;
  useMasivaStore.setState({
    filas: filas.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  });
}

// ─── e63m — KIT e63m-capa0-qr-identidad-v1 (F2): MAPA DE IDENTIDAD QR ───
// CAPA 0 pre-OCR — payload EXACTO → id de la fila original del lote (el
// runner lo registra al decodificar, ANTES de despachar OCR). Memoria de la
// SESIÓN del lote (kit §5 — decisión deliberada: NO se persiste en IDB ni
// se reconstruye al recargar; el lote es la unidad de dedup hoy). Llave
// OPACA: la única comparación es la IGUALDAD EXACTA del payload completo
// (jamás prefijos — RED LINE 10); sin umbrales, sin fuzzy (RED LINE 5).
const mapaQrPayload = new Map<string, string>();

// ─── e64p — KIT e64p-modo-pruebas-memoria-v1 (C-1): MODO PRUEBAS ───────────
// MODO PRUEBAS (pre-elección): la cola NO sobrevive recargas — revertir a
// true para producción.
// Pedido literal del dueño: «que las actas no se guarden en memoria por el
// momento, porque estamos haciendo pruebas y la gracia es que en cada lote
// pueda identificar el acta antes de procesarla».
// Con FALSE (modo pruebas):
//  · C-1 — cargarFilas() arranca la cola VACÍA (no restaura filas ni
//    reconstruye Maps desde persistencia) y borra la persistencia vieja
//    (cola IDB + ledger del histórico — higiene).
//  · C-2 — vaciar() resetea TODO el ciclo de vida de la memoria de dedup:
//    mapaQrPayload + ledger + índice → limpiar y re-subir el MISMO lote
//    procesa completo de cero.
//  · C-3 — el LEDGER de enviadas NO alimenta el índice del histórico (los
//    Maps de dedup no se alimentan de NADA persistido); la dedup DENTRO del
//    lote/sesión queda INTACTA (la gracia — gemelas atrapadas en vivo).
// Con TRUE (producción): byte a byte el comportamiento de siempre —
// restauración tras recarga/crash + dedup inter-lote + ledger e65b que
// sobrevive vaciar() (D-e65b-1). Cero código borrado — solo ciclo de vida.
/** e64p (C-1/C-2 — MODO PRUEBAS). Desde cola-persistente-v1: kill switch del
 *  dueño — el override `colaPersistente: false` (e14-flags-overrides) activa
 *  el modo pruebas (auto-borrado al cargar). Default TRUE: la masiva SOLO se
 *  elimina con vaciar() del dueño — petición literal 2026-10-24. */
const COLA_PERSISTENTE = leerFlags().colaPersistente ?? true;

/** Registra el payload de UNA fila como original del lote. Solo se llama
 *  cuando el payload es NUEVO en el mapa o su entrada apuntaba a una fila
 *  ya muerta (re-apuntado honesto — el carrier vivo del payload manda). */
export function registrarQrPayload(payload: string, id: string): void {
  mapaQrPayload.set(payload, id);
}

/** id de la fila ORIGINAL de este payload (null = payload nuevo en el lote). */
export function originalQrDePayload(payload: string): string | null {
  return mapaQrPayload.get(payload) ?? null;
}

// ─── e65-dedup-enviadas-v1 — ÍNDICE DEL HISTÓRICO DE ENVIADAS (D-e65-3) ────
// Carga LIVIANA una vez por sesión de encolado: listarMapeados con mapper
// que NO retiene Blob ni acta (lección L7 / fix C6) — solo las llaves del
// dedup ({id, hashBytes?, hashDedup?, payloadQr?}). Registros SIN llave
// quedan FUERA (jamás inventar).
// e65b (T-2b, D-e65b-1): el índice se FUSIONA con el LEDGER persistente
// (historico.ts — DB separada): sobrevive vaciar() y recargas. Lo que se
// ENVÍA después de la carga queda cubierto por (a) las filas VIVAS de la
// cola (mismas capas, con verificación de registro viva antes de marcar)
// y (b) registrarEnviadaHistorico — que actualiza el cache EN MEMORIA al
// instante (mismo gesto de la sesión).
let indiceEnviadas: EntradaHistorica[] | null = null;

async function indiceEnviadasDe(): Promise<EntradaHistorica[]> {
  if (indiceEnviadas) return indiceEnviadas;
  const deCola = await listarMapeados<EntradaHistorica>((r) => {
    // Solo ENVIADAS (acta propia) o YA-ENVIADA (filas marcadas por el kit).
    if (r.acta?.status !== "ENVIADA" && r.estado !== "YA-ENVIADA") return null;
    if (!r.hashBytes && !r.hashDedup && !r.qrPayload) return null; // sin llave → jamás inventar
    return {
      id: r.id,
      ts: r.agregadaEn,
      hashBytes: r.hashBytes,
      hashDedup: r.hashDedup,
      payloadQr: r.qrPayload,
    };
  });
  // e65b (M-e65b-2): el ledger NO es fatal — si cae, el índice se construye
  // SOLO con la cola viva (exactamente el comportamiento e65; conservador
  // RL-e65b-3 — jamás tumba la cadena de dedup).
  // e64p (C-3 — MODO PRUEBAS): con COLA_PERSISTENTE=false el ledger NO
  // alimenta el índice — cero memoria ENTRE lotes (el histórico de sesiones
  // anteriores jamás marca YA-ENVIADA); solo la cola viva de ESTA sesión.
  let deLedger: EntradaHistorica[] = [];
  if (COLA_PERSISTENTE) {
    try {
      deLedger = await listarHistorico(); // llaves chicas — getAll seguro (L7)
    } catch {
      deLedger = [];
    }
  }
  const porId = new Map<string, EntradaHistorica>();
  for (const e of deLedger) porId.set(e.id, e);
  for (const e of deCola) porId.set(e.id, e); // la cola viva manda (más fresca)
  indiceEnviadas = [...porId.values()];
  return indiceEnviadas;
}

/** e65b (T-2c): el ÚNICO punto donde el ledger crece — alimenta el histórico
 *  con TODO desenlace ENVIADO (envío propio del runner T-3a, gemela
 *  reutilizada T-3b, envíos manuales T-3c, marca YA-ENVIADA T-2d) —
 *  fire-and-forget desde el runner (RL-e65b-2/3). Si el cache del índice ya
 *  está construido, se actualiza EN MEMORIA al instante (mismo gesto — la
 *  re-subida de ESTA sesión ya matchea sin recargar). */
export async function registrarEnviadaHistorico(e: EntradaHistorica): Promise<void> {
  try {
    await registrarEntradaHistorico(e);
  } catch {
    return; // IDB caída — conservador, jamás tumba el envío (RL-e65b-3)
  }
  if (indiceEnviadas) {
    const entrada: EntradaHistorica = {
      id: e.id,
      ts: e.ts,
      hashBytes: e.hashBytes,
      hashDedup: e.hashDedup,
      payloadQr: e.payloadQr,
    };
    const i = indiceEnviadas.findIndex((x) => x.id === e.id);
    if (i >= 0) indiceEnviadas[i] = entrada;
    else indiceEnviadas.push(entrada);
  }
  // KIT e73-sondeo-qr-precoz-v1 (§C) — hook al MISMO punto de invalidación:
  // el índice por payload del sondeo ve el MISMO gesto de sesión (no-op si
  // aún no cargó — se construirá con TODO dentro al primer uso).
  actualizarIndicePayload(e);
}

/** e65b (T-2e): lookup O(n) sobre el índice cacheado (n = enviadas; miles OK).
 *  El índice SOLO contiene enviadas por construcción → hit = YA-ENVIADA.
 *  Igualdad EXACTA del payload (llave opaca — jamás prefijos, RL-e65b-8).
 *  Fallo del índice → null conservador: la fila sigue su curso (RL-e65b-3). */
export async function enviadaPorPayload(payload: string): Promise<EntradaHistorica | null> {
  if (!payload) return null;
  try {
    return (await indiceEnviadasDe()).find((h) => h.payloadQr === payload) ?? null;
  } catch {
    return null;
  }
}

/** e65 (T-4): marca YA-ENVIADA con el MISMO patrón anti-zombi de la marca
 *  DUPLICADA (fila viva + PENDIENTE + registro leíble + write IDB OK).
 *  SOLO-VISUAL (D-e65-2): NO copia acta, NO trae statusActa, NO dispara
 *  envío, NO toca contadores. false = guard falló → la fila sigue su curso
 *  normal (conservador — RL-e65-3).
 *  e65b (T-2d): exportada (el runner la llama desde la capa 0 payload —
 *  T-4) · `via` ampliado con "payload" (valor NUEVO AL FINAL — D57) ·
 *  parámetro opcional `qrPayload` estampado en el registro YA-ENVIADA
 *  (aditivo) · al final del éxito ALIMENTA EL LEDGER (registrarEnviada-
 *  Historico — cierra el gap de marcas contra filas enviadas pre-kit). */
// knip C3: export CONSERVADO — ancla QA (qa-historico-enviadas.ts grepea
// esta línea: «payload» fue valor NUEVO AL FINAL, D57; wave3 §A.3 añade
// "payload-remoto" AL FINAL — F-check actualizado con nota en el PR).
export type ViaYaEnviada = "bytes" | "dhash" | "payload" | "payload-remoto"; // valores NUEVOS AL FINAL (contrato D57)

export async function marcarYaEnviada(
  id: string,
  enviadaDeId: string,
  via: ViaYaEnviada,
  hashBytes?: string,
  hamming?: number,
  qrPayload?: string,
  aceptarProcesando?: boolean, // e65b (M-e65b-3): SOLO la capa 0 payload (runner T-4) lo declara
  // WAVE3 C.2 (obs-informe-wave3-v1): puerta del veto (D57 AL FINAL) —
  // undefined = "ya-enviada" (callers existentes SIN cambio de contrato:
  // el write de abajo conserva su literal byte a byte — ancla QA).
  dedupValor?: RegistroMasiva["dedup"],
): Promise<boolean> {
  const filaViva = useMasivaStore.getState().filas.find((f) => f.id === id);
  // e65b (M-e65b-3): la capa 0 payload llega con la fila YA en PROCESANDO
  // (marcada al entrar al pipeline — runner) → el caller T-4 declara
  // aceptarProcesando y este guard la admite. Los callers e65 de la
  // cadenaDedup (sin flag) siguen exigiendo PENDIENTE byte a byte.
  if (!(aceptarProcesando === true && filaViva?.estado === "PROCESANDO")) {
    if (!filaViva || filaViva.estado !== "PENDIENTE") return false;
  }
  let registro: RegistroMasiva;
  try {
    registro = await leerRegistro(id);
  } catch {
    return false; // fuera de la cola (IDB/vaciar) — nada que marcar
  }
  // Write e65 byte a byte (la QA previa escanea estas líneas — regresión cero).
  try {
    await guardarRegistro({
      ...registro,
      estado: "YA-ENVIADA",
      hashBytes: hashBytes ?? registro.hashBytes,
      enviadaDe: enviadaDeId,
      dedup: "ya-enviada",
      ...(qrPayload ? { qrPayload } : {}), // e65b (T-2d) — aditivo (D57)
      // WAVE3 C.2 — la puerta del veto SOBREESCRIBE el dedup solo cuando el
      // caller la declara ("ya-enviada-postocr" = H1 post-OCR): el literal
      // de arriba queda INTACTO (ancla QA qa-historico-enviadas byte a byte).
      ...(dedupValor && dedupValor !== "ya-enviada" ? { dedup: dedupValor } : {}),
    });
  } catch {
    return false; // IDB caído → la fila procesa normal (conservador)
  }
  patchFila(id, {
    estado: "YA-ENVIADA",
    ...(hashBytes ?? registro.hashBytes
      ? { hashBytes: hashBytes ?? registro.hashBytes }
      : {}),
    enviadaDe: enviadaDeId,
  });
  logger.info(
    `[e14] dedup fila=${id} YA-ENVIADA ${via}${hamming != null ? ` hamming=${hamming}` : ""} dupOf=${enviadaDeId}`,
  );
  // e65b (T-2d): la marca TAMBIÉN alimenta el histórico (ledger) — la
  // YA-ENVIADA es un desenlace ENVIADO por construcción (RL-e65b-2).
  // Fire-and-forget: jamás bloquea ni tumba la marca (RL-e65b-3).
  void registrarEnviadaHistorico({
    id,
    ts: Date.now(),
    hashBytes: hashBytes ?? registro.hashBytes,
    hashDedup: registro.hashDedup,
    payloadQr: qrPayload,
    serie: registro.serie ?? undefined,
  });
  return true;
}

/** KIT e14-masiva-tiempos-v1 (PR-1): cadena de hashing DEDUP en background —
 *  por cada archivo del lote EN ORDEN FIFO: e65 CAPA BYTES primero (SHA-256
 *  EXACTO contra el índice histórico de enviadas + cola viva enviada — sin
 *  decode, YA-ENVIADA al instante) → dhash (misma vía del pipeline,
 *  dedup.ts) → persiste hashDedup + hashBytes → compara contra TODAS las
 *  filas con hash (Hamming ≤ 6) + el ÍNDICE HISTÓRICO (D-e65-6) → marca
 *  DUPLICADA (persistente) apuntando a la ORIGINAL — o YA-ENVIADA si la
 *  original ya fue ENVIADA (D-e65-5).
 *  NUNCA bloquea la UI ni lanza: fallo de decode/hash → hash null → la fila
 *  procesa normal (conservador). Los guards de existencia hacen el vaciar/
 *  quitar del dueño MANDAR (0 zombis — mismo patrón del runner).
 *  D65 (T2): dedup v2 POR CONTENIDO con EXIF normalizada (dedup.ts) — misma
 *  cadena, y la traza aditiva dedup/dedupDistancia (kit T2.3) persiste en el
 *  MISMO write del hashDedup (campos nuevos al final del contrato D57). */
async function cadenaDedup(
  lote: {
    id: string;
    archivo: File;
    hashBytes?: string | null;
    // KIT e73 (§B.2) — cinturón: el override del dueño viaja con la entrada
    // (hoy ninguna fila nace con él en la ingesta — PROCESAR IGUAL lo pone
    // en la fila viva; el guard queda POR CONSTRUCCIÓN para futuros callers).
    forzarDedupOff?: boolean;
  }[],
): Promise<void> {
  // KIT e73-sondeo-qr-precoz-v1 (§B.2-a) — mapa payload → filaId construido
  // EN la cadena (FIFO — el primer ganador gana y la original siempre lleva
  // delante; filas ≠ PENDIENTE excluidas). Memoria del LOTE (muere con la
  // cadena — mismo ciclo de vida del mapaQrPayload de la capa 0, kit §5).
  const mapaSondeoPayload = new Map<string, string>();
  for (const entrada of lote) {
    try {
      // e65 — CAPA BYTES primero (D-e65-5): barata (~50-200 ms, SIN decode).
      // Match EXACTO por SHA-256 contra (a) el índice histórico de enviadas
      // y (b) las filas vivas de la cola cuyo registro ya fue ENVIADO (se
      // verifica leyendo el registro — la fila sola no basta). null →
      // conservador: cae a la capa dhash de siempre.
      // e71 (Opt-1): el hash pudo llegar PRE-CALCULADO por la ingesta
      // (agregarFiles → agregarLote) — reutilizado, cero re-hash (la SHA de
      // la ingesta es la MISMA llave: hashBytesDeArchivo determinista).
      // KIT e14-sondeo-burst-v1 (P1a): SHA-256 idéntica a una fila VIVA ⇒
      // identidad EXACTA ya probada — señal MÁS fuerte que cualquier QR/dhash
      // — y el sondeo del duplicado es trabajo de worker REGALADO al burst:
      // en el run 4 (47 archivos de golpe) el sondeo-qr worker se ahogó de
      // contención (14 hard-kills en 2 min — worker LENTO por hambruna de
      // CPU: dhash/decode en main + OCR WASM en 4 hilos, no zombi) y cada
      // kill costó presupuesto completo + respawn frío. Omitir SOLO el
      // sondeo: la capa dhash decide igual que hoy (gemela por bytes ⇒
      // hamming 0 ⇒ DUPLICADA / YA-ENVIADA si la original se envía primero)
      // y si la gemela muere después, el dhash propio no encuentra candidata
      // y la fila procesa normal — raza cubierta por los guards de siempre.
      let saltaSondeoPorBytes = false;
      const bytes =
        entrada.hashBytes ?? (await hashBytesDeArchivo(entrada.archivo));
      if (bytes) {
        const hitHistorico = (await indiceEnviadasDe()).find(
          (h) => h.hashBytes === bytes,
        );
        if (hitHistorico) {
          // El índice SOLO contiene enviadas → YA-ENVIADA por construcción.
          if (await marcarYaEnviada(entrada.id, hitHistorico.id, "bytes", bytes)) continue;
        } else {
          const viva = useMasivaStore
            .getState()
            .filas.find(
              (f) => f.id !== entrada.id && f.hashBytes === bytes,
            );
          if (viva) {
            // El match contra cola viva SOLO cuenta como YA-ENVIADA si ESE
            // registro tiene acta ENVIADA (verificar con leerRegistro antes
            // de marcar — kit T-4). Lectura que falla → conservador: la capa
            // dhash decide como hoy.
            try {
              const regViva = await leerRegistro(viva.id);
              if (
                regViva.acta?.status === "ENVIADA" ||
                regViva.estado === "YA-ENVIADA"
              ) {
                if (await marcarYaEnviada(entrada.id, viva.id, "bytes", bytes)) continue;
                // guard falló (ya marcada/ilegible) → conserva el sondeo
                // (sin flag — el conservador manda, RL-e65-3).
              } else {
                // KIT e14-sondeo-burst-v1 (P1a): gemela viva NO enviada →
                // omitir el sondeo (redundante: bytes idénticos). Sin marca
                // AQUÍ — el desenlace lo firma la capa dhash como hoy.
                saltaSondeoPorBytes = true;
                logger.info(
                  `[e14] dedup fila=${entrada.id} bytes gemela viva=${viva.id} → sondeo QR omitido (dhash decide)`,
                );
              }
            } catch {
              /* conservador — sigue a la capa dhash (comportamiento de hoy) */
            }
          }
        }
      }
      // ─── KIT e73-sondeo-qr-precoz-v1 (§B.2) — NUEVA CAPA: SONDEO QR ──────
      // Lee la identidad QR en INGESTA (worker e73 — presupuesto 2500 ms,
      // jamás throw). forzarDedupOff manda SIEMPRE (cinturón — RL-e65b-6:
      // sin sondeo si está puesto). null/fallo → continuar a dhash COMO HOY
      // (doctrina del conservador — la capa dhash queda íntegra byte a byte).
      let sondeo: Awaited<ReturnType<typeof sondearQrPrecoz>> = null;
      if (!entrada.forzarDedupOff) {
        // KIT e14-sondeo-burst-v1 (P1a): el skip por bytes vive DENTRO del
        // guard del override (RL-e65b-6 intacto — el dueño manda SIEMPRE;
        // test 7 ancla ambos literales byte a byte).
        // KIT flujo-dueno-v1 (K2 — masivaSondeoCrudo, default TRUE = camino
        // de hoy): en OFF se OMITE el sondeo crudo (el guard fuerza
        // sondeo=null) y la fila sigue a dhash COMO HOY — corrida de
        // control del dueño (el sondeo crudo alimenta el dedup temprano,
        // por eso default ON).
        if (!saltaSondeoPorBytes && leerFlags().masivaSondeoCrudo === true) {
          sondeo = await sondearQrPrecoz(entrada.archivo);
        }
        if (sondeo) {
          logger.info(
            `[e14] sondeo-qr fila=${entrada.id} tier=${sondeo.tier ?? "null"} ms=${sondeo.ms}`,
          );
          // Telemetría EN VIVO sobre la fila (chip «Sondeo QR N/M» — §E);
          // patchFila no-op si la fila murió durante el sondeo (anti-zombi).
          patchFila(entrada.id, {
            sondeoQrMs: sondeo.ms,
            ...(sondeo.payload != null ? { sondeoQrTier: sondeo.tier ?? undefined } : {}),
            // D30 (kit e14-qr-heredado-v1) — el payload leído EN INGESTA queda
            // sobre la fila: la capa 0 del runner lo hereda sin re-decode
            // (igualdad EXACTA — misma llave). RAM del lote — NUNCA a IDB
            // (mismo trato que prescanOk; tras recargar la capa 0 re-decodifica).
            ...(sondeo.payload != null ? { qrPrevio: sondeo.payload } : {}),
          });
        }
      }
      if (sondeo && sondeo.payload != null) {
        const payloadSondeo = sondeo.payload;
        // (a) Cola viva — mapa payload → filaId (primer ganador gana).
        // Match → DUPLICADA persistente con la MISMA rama del dhash (guard
        // filaViva PENDIENTe + leerRegistro + write + patchFila) con dedup
        // "qr-sondeo" (D57 AL FINAL) → NO entra al pool (jamás slot/probe/OCR).
        const originalSondeo = mapaSondeoPayload.get(payloadSondeo);
        if (originalSondeo && originalSondeo !== entrada.id) {
          const filaVivaSondeo = useMasivaStore
            .getState()
            .filas.find((f) => f.id === entrada.id);
          if (!filaVivaSondeo || filaVivaSondeo.estado !== "PENDIENTE") continue; // anti-zombi
          let regSondeo: RegistroMasiva;
          try {
            regSondeo = await leerRegistro(entrada.id);
          } catch {
            continue; // fuera de la cola (IDB/vaciar) — nada que marcar
          }
          // Write ÚNICO con la telemetría del sondeo plegada (patrón D65
          // T2.3 — campos AL FINAL del contrato D57).
          await guardarRegistro({
            ...regSondeo,
            estado: "DUPLICADA",
            dupOf: originalSondeo,
            dedup: "qr-sondeo",
            sondeoQrMs: sondeo.ms,
            sondeoQrTier: sondeo.tier ?? undefined,
          });
          patchFila(entrada.id, { estado: "DUPLICADA", dupOf: originalSondeo });
          logger.info(
            `[e14] sondeo-qr fila=${entrada.id} → DUPLICADA qr-sondeo dupOf=${originalSondeo}`,
          );
          continue;
        }
        // (b) Histórico — índice por payload (§C) → YA-ENVIADA via "payload"
        // EXISTENTE (cero churn D57), dedup default "ya-enviada" (el guard
        // wave3 C.2 de escritores YA-ENVIADA queda satisfecho).
        // COLA_PERSISTENTE=false (modo pruebas e64p C-3): el ledger NO
        // alimenta los Maps de dedup — el índice por payload tampoco.
        if (COLA_PERSISTENTE) {
          try {
            const hitSondeo = (await indiceEnviadasPorPayload(true)).get(payloadSondeo);
            if (hitSondeo) {
              // Telemetría del sondeo sobre el registro ANTES de la marca —
              // marcarYaEnviada la ARRASTRA con su spread ...registro (el
              // write ancla de marcarYaEnviada queda byte a byte). Write
              // extra SOLO en hits (desviación M-e73-3 del REPORTE).
              try {
                const regPre = await leerRegistro(entrada.id);
                await guardarRegistro({
                  ...regPre,
                  sondeoQrMs: sondeo.ms,
                  sondeoQrTier: sondeo.tier ?? undefined,
                });
              } catch {
                /* conservador — la marca sigue sin telemetría (jamás inventar) */
              }
              if (
                await marcarYaEnviada(
                  entrada.id,
                  hitSondeo.id,
                  "payload",
                  undefined,
                  undefined,
                  payloadSondeo,
                )
              ) {
                logger.info(`[e14] sondeo-qr fila=${entrada.id} → YA-ENVIADA payload`);
                continue;
              }
              // guard falló (ya no es PENDIENTE / registro ilegible) → cae
              // al comportamiento de siempre (el conservador manda — RL-e65-3).
            }
          } catch {
            /* índice caído → conservador: sigue a dhash (RL-e65b-3) */
          }
        }
        // (c) Sin match → registrar como original futura (primer ganador
        // gana; filas ≠ PENDIENTE excluidas) + seguir a dhash (capa íntegra).
        if (!mapaSondeoPayload.has(payloadSondeo)) {
          const vivaParaMapa = useMasivaStore
            .getState()
            .filas.find((f) => f.id === entrada.id);
          if (vivaParaMapa && vivaParaMapa.estado === "PENDIENTE") {
            mapaSondeoPayload.set(payloadSondeo, entrada.id);
          }
        }
      }
      // KIT e14-obs-hang-atribucion-v1 (§A.3) — el cómputo del dhash es
      // trabajo main-thread REAL del pipeline: marcar la operación activa
      // ANTES (sin clear después — la edad delata la obsolescencia).
      // KIT e14-gama-adaptativa-v1 (D74) — gama BAJO adaptativa: el dhash
      // visual de INGESTA se OMITE — su decode FULL 12 MP (≈48 MB) en main
      // thread compite con el sondeo worker y el hilo UI (evidencia run 4:
      // 14 hard-kills/2 min — store.ts cabecera e73) justo en los
      // dispositivos que menos lo aguantan. El dedup NO muere: bytes
      // (SHA-256 — nace en agregarLote), payload QR (capa 0 e63m) e
      // identidad impresa 13 dígitos (capa 2 e63k post-OCR) siguen
      // íntegros; SOLO el match VISUAL pre-OCR se aplaza (la fila procesa
      // normal). Tradeoff documentado en D74: sin hashDedup la fila tampoco
      // es candidata visual para filas futuras y el pliegue de sondeoQrMs
      // de este write no viaja (observabilidad, no comportamiento).
      // Flag OFF / MEDIO / ALTO ⇒ camino de hoy byte-idéntico.
      if (!planGamaActual().dhashIngesta) {
        logger.info(
          `[e14] dedup fila=${entrada.id} dhash OMITIDO (gama adaptativa — identidad post-OCR decide)`,
        );
        continue;
      }
      marcarOperacion("dhash");
      const hash = await dhashDeArchivo(entrada.archivo);
      if (!hash) continue; // decode/hash falló → sin dedup para esta fila
      // Guard anti-zombi: la fila pudo ser quitada/vaciada mientras el decode corría.
      if (!useMasivaStore.getState().filas.some((f) => f.id === entrada.id)) continue;
      let registro: RegistroMasiva;
      try {
        registro = await leerRegistro(entrada.id);
      } catch {
        continue; // fuera de la cola (IDB/vaciar) — nada que marcar
      }
      // KIT e73 (§E) — telemetría del sondeo plegada al snapshot del registro
      // (patrón D65 T2.3 — viaja EN el MISMO write del hash): ms SIEMPRE que
      // el sondeo corrió; tier SOLO con lectura (jamás inventar). El pliegue
      // va sobre el snapshot para que los write LITERALES anclados de wave3
      // C.2 (guard de contrato) queden byte a byte — los campos nuevos viajan
      // DENTRO del spread ...registro (AL FINAL del contrato D57).
      if (sondeo) {
        registro = {
          ...registro,
          sondeoQrMs: sondeo.ms,
          ...(sondeo.payload != null ? { sondeoQrTier: sondeo.tier ?? undefined } : {}),
        };
      }
      // ¿Gemela de una fila existente? (filas ANTERIORES con hash — la
      // cadena es FIFO, la original siempre lleva delante). D65: la búsqueda
      // corre ANTES del write para plegar la traza dedup (T2.3) en el MISMO
      // guardarRegistro del hash — mismo nº de writes que v1 (1 por fila, 2
      // para gemelas). Los candidatos salen del STORE (otras filas — esta no
      // es candidata de sí misma): mismo resultado que el orden de v1.
      const filas = useMasivaStore.getState().filas;
      const candidatas = filas.filter(
        (f) => f.id !== entrada.id && f.hashDedup && f.estado !== "ERROR",
      );
      let original: Pick<FilaMasiva, "id" | "agregadaEn"> | null = null;
      let hamming = DEDUP_HAMMING_MAX + 1;
      for (const c of candidatas) {
        const d = hamming64(hash, c.hashDedup as string);
        if (d <= DEDUP_HAMMING_MAX && (original === null || d < hamming || c.agregadaEn < original.agregadaEn)) {
          original = c;
          hamming = d;
        }
      }
      // e65 (D-e65-6): ampliar candidatas con el ÍNDICE HISTÓRICO de enviadas
      // (hashDedup, misma cinta — RL-e65-4). El histórico SOLO contiene
      // enviadas → si GANA (estrictamente más cerca), el desenlace es
      // YA-ENVIADA. Empate → la viva manda (FIFO — comportamiento de hoy).
      let originalDelIndice = false;
      for (const h of await indiceEnviadasDe()) {
        if (!h.hashDedup || h.id === entrada.id) continue;
        const d = hamming64(hash, h.hashDedup);
        if (d <= DEDUP_HAMMING_MAX && (original === null || d < hamming)) {
          original = { id: h.id, agregadaEn: 0 };
          hamming = d;
          originalDelIndice = true;
        }
      }
      // D65 (T2.3): traza del dedup v2 — "v2" = match CIERTO en la cinta baja
      // (con la distancia REAL del match); "sin-match" = hasheada sin gemela.
      // e63k (F1.3): el match en la BANDA 3..6 NO marca — traza
      // "visual-aplazada" + dedupVisualDe (oro para el post-mortem); la
      // identidad post-OCR decide (runner — punto único del kit). Sin hash
      // (decode falló) la fila NO trae traza (ausente = instrumento no corrió).
      const trazaDedup: Pick<
        RegistroMasiva,
        "dedup" | "dedupDistancia" | "dedupVisualDe"
      > =
        original && hamming <= DEDUP_CINTA_CIERTA
          ? { dedup: "v2", dedupDistancia: hamming }
          : original
            ? {
                dedup: "visual-aplazada",
                dedupDistancia: hamming,
                dedupVisualDe: original.id,
              }
            : { dedup: "sin-match" };
      const writeHashYTraza = { ...registro, hashDedup: hash, hashBytes: bytes ?? registro.hashBytes, ...trazaDedup };
      // WAVE3 C.2 (obs-informe-wave3-v1) — el veto ya-enviada JAMÁS es
      // destruido por la traza visual: si el registro YA es YA-ENVIADA (el
      // veto capa-0/bytes aterrizó antes que el dhash de esta cadena), la
      // traza NO puede estampar "sin-match"/"v2"/"visual-aplazada" sobre la
      // evidencia del veto — gap REAL del lote 10 (3 filas YA-ENVIADA ∧
      // dedup:"sin-match", informes 104609+): la ventana entre el snapshot
      // leerRegistro (L arriba) y ESTE write dejaba al veto sin su marca.
      // La puerta queda evidenciada: "ya-enviada-copia" (D57 AL FINAL).
      await guardarRegistro(
        registro.estado === "YA-ENVIADA"
          ? { ...writeHashYTraza, dedup: "ya-enviada-copia" as const }
          : writeHashYTraza,
      );
      patchFila(entrada.id, { hashDedup: hash, ...(bytes ? { hashBytes: bytes } : {}) });
      // e63k (F1.3): SOLO la cinta CIERTA (hamming ≤ DEDUP_CINTA_CIERTA)
      // marca DUPLICADA pre-OCR — comportamiento de HOY byte a byte. La
      // banda 3..6 NO marca y NO escribe DUPLICADA: la fila sigue PENDIENTE
      // → corre el pipeline completo y la capa 2 (runner) decide con la
      // serie impresa (kit §1.3 — corrección por la CINTA, no por el umbral).
      if (!original) continue;
      if (hamming > DEDUP_CINTA_CIERTA) {
        logger.info(
          `[e14] dedup fila=${entrada.id} visual hamming=${hamming} dupOf=${original.id} APLAZADA cinta=3-6 — identidad post-OCR decide (e63k)`,
        );
        continue;
      }
      // e65 (D-e65-5): cinta cierta — ¿la original matcheada ya fue ENVIADA?
      //  · Original del ÍNDICE histórico → es ENVIADA/YA-ENVIADA por
      //    construcción del índice (D-e65-3).
      //  · Original viva → verificar con leerRegistro (acta ENVIADA o estado
      //    YA-ENVIADA). Lectura que falla → DUPLICADA (conservador, hoy).
      let enviadaDeId: string | null = null;
      if (originalDelIndice) {
        enviadaDeId = original.id;
      } else {
        try {
          const regOriginal = await leerRegistro(original.id);
          if (
            regOriginal.acta?.status === "ENVIADA" ||
            regOriginal.estado === "YA-ENVIADA"
          ) {
            enviadaDeId = original.id;
          }
        } catch {
          enviadaDeId = null; // conservador → DUPLICADA como hoy
        }
      }
      if (enviadaDeId) {
        if (
          await marcarYaEnviada(
            entrada.id,
            enviadaDeId,
            "dhash",
            bytes ?? undefined,
            hamming,
          )
        ) {
          continue;
        }
        // guard falló (ya no es PENDIENTE / registro ilegible) → cae al
        // comportamiento de siempre (el conservador manda — RL-e65-3).
      }
      // Solo marca filas aún PENDIENTES (el dueño pudo procesar/quitar mientras el hash corría).
      const filaViva = useMasivaStore.getState().filas.find((f) => f.id === entrada.id);
      if (!filaViva || filaViva.estado !== "PENDIENTE") continue;
      const reg = await leerRegistro(entrada.id);
      await guardarRegistro({ ...reg, estado: "DUPLICADA", dupOf: original.id });
      patchFila(entrada.id, { estado: "DUPLICADA", dupOf: original.id });
      logger.info(
        `[e14] dedup fila=${entrada.id} marcada hamming=${hamming} dupOf=${original.id} hash=${hash}`,
      );
    } catch {
      /* un fallo de la cadena JAMÁS tumba el encolado — la fila queda normal */
    }
  }
}

/** e71 (Opt-1) — DEDUP EXACTO INSTANTÁNEO en la ingesta (kit e71-
 *  consolidación, benchmark aprobado): corre DESPUÉS del swap temp→id y
 *  ANTES de rearrancarTrasEncolar — el runner JAMÁS ve un duplicado exacto
 *  como PENDIENTE: no paga precalor, ni qr-capa0, ni OCR (~20 s de ahorro
 *  por duplicado exacto, kit literal). El SHA-256 ya nació calculado en la
 *  ingesta (hashBytes en el PRIMER write) → el pase cuesta un lookup en
 *  memoria + (solo con match) 1-2 lecturas de registro (~ms).
 *  · Match contra el ÍNDICE de enviadas (ledger + cola viva enviada —
 *    D-e65-3; respeta COLA_PERSISTENTE: en modo pruebas el ledger NO
 *    marca — C-3 intacto) → YA-ENVIADA vía marcarYaEnviada (maquinaria
 *    e65 EXACTA, via "bytes").
 *  · Match contra la cola viva (filas previas + anteriores del MISMO
 *    lote) → DUPLICADA instantánea con dupOf (kit Opt-1 literal); el
 *    desenlace lo resuelve reutilizarResultado en el runner (con P2.1:
 *    original rechazada → la copia nace RECHAZADA).
 *  Conservador: hash null → la fila procesa normal; guard anti-zombi
 *  (fila viva + PENDIENTE) igual que cadenaDedup; un fallo JAMÁS tumba
 *  el encolado (kit carga-masiva §3). */
async function dedupExactoIngesta(
  entradas: { id: string; hashBytes: string | null }[],
): Promise<void> {
  if (!entradas.length) return;
  try {
    // (a) seed: filas VIVAS PREVIAS a este lote que traen hashBytes — la
    // primera FIFO gana (mismo criterio de original que cadenaDedup).
    // Los registros pre-e71 sin hashBytes no matchean (conservador — igual
    // que hoy: la capa dhash de cadenaDedup los cubre).
    const idsLote = new Set(entradas.map((e) => e.id));
    const originales = new Map<string, string>(); // hashBytes → id original
    for (const f of useMasivaStore.getState().filas) {
      if (idsLote.has(f.id) || !f.hashBytes || f.estado === "ERROR") continue;
      if (!originales.has(f.hashBytes)) originales.set(f.hashBytes, f.id);
    }
    // (b) índice de enviadas (ledger + cola — D-e65-3) — una sola carga
    // (cacheado por indiceEnviadasDe; ledger caído → conservador).
    let indice: EntradaHistorica[] = [];
    let indiceListo = false;
    for (const e of entradas) {
      if (!e.hashBytes) continue;
      // La fila viva ya trae su llave (el informe/seed de futuros lotes la
      // ven SIN esperar a cadenaDedup — mismo gesto del patch L549).
      patchFila(e.id, { hashBytes: e.hashBytes });
      if (!indiceListo) {
        try {
          indice = await indiceEnviadasDe();
        } catch {
          indice = []; // ledger caído → solo cola viva (RL-e65b-3)
        }
        indiceListo = true;
      }
      const hitHistorico = indice.find((h) => h.hashBytes === e.hashBytes);
      if (hitHistorico) {
        // El índice SOLO contiene enviadas → YA-ENVIADA por construcción.
        if (await marcarYaEnviada(e.id, hitHistorico.id, "bytes", e.hashBytes)) {
          logger.info(
            `[e14] dedup fila=${e.id} instantanea ya-enviada-historico dupOf=${hitHistorico.id}`,
          );
          continue;
        }
      }
      const dupOf = originales.get(e.hashBytes);
      if (dupOf && dupOf !== e.id) {
        // ¿La original matcheada ya fue ENVIADA? (mismo criterio D-e65-5:
        // verificar con leerRegistro antes de marcar YA-ENVIADA; lectura
        // que falla → DUPLICADA conservadora como hoy).
        let enviadaDeId: string | null = null;
        try {
          const regOriginal = await leerRegistro(dupOf);
          if (
            regOriginal.acta?.status === "ENVIADA" ||
            regOriginal.estado === "YA-ENVIADA"
          ) {
            enviadaDeId = dupOf;
          }
        } catch {
          enviadaDeId = null; // conservador → DUPLICADA
        }
        if (enviadaDeId) {
          if (await marcarYaEnviada(e.id, enviadaDeId, "bytes", e.hashBytes)) {
            logger.info(
              `[e14] dedup fila=${e.id} instantanea ya-enviada dupOf=${enviadaDeId}`,
            );
            continue;
          }
        }
        // DUPLICADA instantánea (kit Opt-1) — guard anti-zombi + write IDB
        // + patch de la fila viva, MISMO patrón de cadenaDedup.
        const filaViva = useMasivaStore
          .getState()
          .filas.find((f) => f.id === e.id);
        if (filaViva && filaViva.estado === "PENDIENTE") {
          try {
            const reg = await leerRegistro(e.id);
            await guardarRegistro({ ...reg, estado: "DUPLICADA", dupOf });
            patchFila(e.id, { estado: "DUPLICADA", dupOf });
            logger.info(
              `[e14] dedup fila=${e.id} instantanea sha256 dupOf=${dupOf}`,
            );
          } catch {
            /* IDB caída — la fila procesa normal (conservador) */
          }
        }
      }
      // (c) esta fila pasa a candidata para las SIGUIENTES del lote (el
      // MISMO archivo 2× en UNA carga — la segunda nace DUPLICADA aquí).
      if (!originales.has(e.hashBytes)) originales.set(e.hashBytes, e.id);
    }
  } catch {
    /* un fallo del pase JAMÁS tumba el encolado — la fila procesa normal */
  }
}

/** KIT e14-masiva-ux-v1 (T3.2): al reactivar la conexión la cola offline del
 *  flujo se drena (alternarConexion del store principal — INTACTO, fuera de
 *  la whitelist §1). Aquí se refrescan las filas MASIVA que quedaron «EN
 *  COLA»: el acta en IDB pasa de hashSha256 "EN COLA" a un hash demo (mismo
 *  formato que el drenaje del flujo normal) y la fila pinta «ENVIADA».
 *  La llama MasivaView al detectar el toggle offline→online. */
export async function refrescarEnviosTrasDrenaje(): Promise<void> {
  const enCola = useMasivaStore
    .getState()
    .filas.filter((f) => f.estado === "LISTA" && f.envioEnCola);
  for (const fila of enCola) {
    try {
      const registro = await leerRegistro(fila.id);
      if (registro.acta?.hashSha256 !== "EN COLA") continue;
      await guardarRegistro({
        ...registro,
        acta: { ...registro.acta, hashSha256: hashDrenaje() },
      });
      patchFila(fila.id, { envioEnCola: false });
      // WAVE3 §A.3 — el registro remoto nace TAMBIÉN al drenar (kit §A.3:
      // «el registro remoto nace en refrescarEnviosTrasDrenaje() cuando la
      // fila drena — un void …catch()»): la fila ENVIADA offline viaja al
      // ledger D1 al reconectar — fire-and-forget, jamás bloquea el drenaje
      // (RL-e65b-3). SOLO el SHA-256 del payload (privacidad dura).
      if (registro.qrPayload) {
        const payloadDrenado = registro.qrPayload;
        void (async () => {
          const payloadHash = await sha256HexDeTexto(payloadDrenado);
          if (!payloadHash) return; // sin crypto — sin registro (conservador)
          await registrarEnvioRemoto({
            payloadHash,
            serie: registro.serie ?? undefined,
            filaId: fila.id,
            origenUrl: origenActual() ?? undefined,
          });
        })().catch(() => {});
      }
    } catch {
      /* IDB caído → la fila queda «EN COLA» (honesto; reintento al recargar) */
    }
  }
}

/** Espejo del hashMock del store principal (3 líneas — hash demo de 12 hex,
 *  mismo formato visible en REVISIÓN/RESUMEN tras el drenaje). Sin import:
 *  store.ts NO está en la whitelist §1 de este kit. */
function hashDrenaje(): string {
  const hex = Array.from({ length: 12 }, () =>
    "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
  return `${hex}…`;
}

export const useMasivaStore = create<MasivaStore>((set, get) => ({
  filas: [],
  corriendo: false,
  progreso: null,
  enviandoLote: false,
  filtro: "TODAS",
  origenAbierto: null,
  guardando: 0,
  colaDisponible: true,
  avisoCola: null,

  cargarFilas: async () => {
    try {
      // e64p (C-1 — MODO PRUEBAS): la cola arranca VACÍA — cero restauración
      // (sin filas fantasma ni Maps reconstruidos). Higiene: la persistencia
      // vieja muere AQUÍ (cola IDB + ledger del histórico) para que la pasada
      // siguiente sea de cero (QA doble pasada del kit). Con
      // COLA_PERSISTENTE=true este bloque entero no existe y el comportamiento
      // es el de siempre (restauración completa — reversibilidad).
      if (!COLA_PERSISTENTE) {
        try {
          await vaciarCola();
        } catch {
          /* la cola muere igual en la bandeja (IDB caída — kit §3) */
        }
        try {
          await borrarHistorico();
        } catch {
          /* conservador — el ledger se re-borra en el próximo vaciar/carga */
        }
        mapaQrPayload.clear();
        indiceEnviadas = null;
        set({ filas: [], colaDisponible: true, avisoCola: null });
        return;
      }
      await recuperarCola(); // PROCESANDO zombi → PENDIENTE (caída a mitad de OCR)
      // FIX C6: mapper DENTRO del cursor — los registros completos (acta con
      // dataURLs) viven un instante; la bandeja solo retiene filas livianas.
      const filas = await listarMapeados(filaDeRegistro);
      set({
        filas: filas.sort((a, b) => a.agregadaEn - b.agregadaEn),
        colaDisponible: true,
      });
    } catch {
      // IndexedDB no disponible → píldora de fallback (kit §6). La UI vive.
      set({ colaDisponible: false, filas: [] });
    }
  },

  agregarFiles: async (files) => {
    // KIT e14-masiva-ux-v1 (T2.3): clasificación — imágenes (MIME o
    // extensión, HEIC incluido) pasan directo; .zip/.rar se EXTRAEN
    // client-side (import diferido D47 — extraer NO procesa nada, solo
    // encola: D45 intacto); D60: PDF → páginas JPEG por extraerPdf (pdfjs
    // diferido ídem — cada página hereda TODO); lo demás → fila ERROR
    // FORMATO_NO_SOPORTADO (ya no se descarta en silencio).
    const lista = Array.from(files);
    if (!lista.length) return;
    const imagenes: File[] = [];
    // D63-A2 (T1): páginas nacidas de un PDF — nacen CON viaPdf (calibración
    // por CONSTRUCCIÓN: el pipeline SABE qué filas vienen de PDF sin adivinar
    // por píxeles). Solo la rama PDF llena este Set (fotos/WhatsApp/ZIP
    // jamás lo tocan — prueba de lectura en el REPORTE del kit).
    const paginasPdf = new Set<File>();
    const errores: { nombre: string; motivo: string }[] = [];
    for (const f of lista) {
      if (pareceImagenMasiva(f)) {
        imagenes.push(f);
      } else if (/\.(zip|rar)$/i.test(f.name)) {
        try {
          const resultado = await extraerArchivo(f);
          imagenes.push(...resultado.archivos);
          errores.push(...resultado.errores);
        } catch (err) {
          errores.push({
            nombre: f.name,
            motivo: (
              err instanceof Error ? err.message : "PROTEGIDO_O_CORRUPTO"
            ).slice(0, 48),
          });
        }
      } else if (parecePdfMasiva(f)) {
        // D60 — PDF: render página a página → CADA página cae en `imagenes`
        // (mismo manejo exacto que zip/rar: hereda pipeline/gate/dedup/IDB).
        // D63-A2 (T1): las páginas resultantes entran al Set `paginasPdf` —
        // sus filas nacen con viaPdf=true (memoria + IDB) y el runner las
        // clasifica ESCANEO por construcción (las señales de píxel del
        // detector D63-A quedan PRESERVADAS como prefijo `pdf-render+…`).
        try {
          const resultado = await extraerPdf(f);
          resultado.archivos.forEach((a) => paginasPdf.add(a));
          imagenes.push(...resultado.archivos);
          errores.push(...resultado.errores);
        } catch (err) {
          errores.push({
            nombre: f.name,
            motivo: (
              err instanceof Error ? err.message : "PROTEGIDO_O_CORRUPTO"
            ).slice(0, 48),
          });
        }
      } else {
        errores.push({ nombre: f.name || "ARCHIVO", motivo: "FORMATO_NO_SOPORTADO" });
      }
    }
    if (!imagenes.length && !errores.length) return;
    const base = Date.now();
    // Filas PENDIENTES AL INSTANTE (kit carga-masiva §6) con ids temporales
    // — el runner las salta mientras la copia a IDB está en vuelo.
    const temps = imagenes.map((file, i) => ({
      id: `masiva-temp-${base}-${i}`,
      nombre: file.name || `FOTO_${i + 1}`,
      agregadaEn: base + i,
      estado: "PENDIENTE" as EstadoEntrada,
      // D63-A2 (T1): solo páginas-PDF traen el flag (ausente = no-PDF).
      ...(paginasPdf.has(file) ? { viaPdf: true } : {}),
    }));
    // Filas ERROR (T2): motivo corto ≤48 — persisten en IDB (la bandeja
    // sobrevive la recarga; no hay datos que procesar).
    const filasError = errores.map((e, i) => ({
      id: `masiva-err-${base}-${i}`,
      nombre: e.nombre,
      agregadaEn: base + imagenes.length + i,
      estado: "ERROR" as EstadoEntrada,
      error: e.motivo,
    }));
    set({
      filas: [...get().filas, ...temps, ...filasError],
      guardando: get().guardando + imagenes.length,
    });
    // e71 (Opt-1) — SHA-256 PRE-SCAN en la ingesta (kit e71-consolidación,
    // benchmark aprobado ~68 ms por archivo): SECUENCIAL (RAM — un
    // arrayBuffer de 12 MP a la vez) y ANTES de abrir la transacción de IDB
    // (una tx de IndexedDB auto-commitea si el control vuelve al event loop
    // con awaits ajenos — el hash JAMÁS corre dentro de la tx). Las filas
    // ya están visibles (temps «GUARDANDO N…» — cero regresión UX); el
    // coste del hash vive en esa misma fase y a cambio TODO duplicado
    // exacto nace resuelto: nunca paga precalor, ni qr-capa0, ni OCR.
    const hashesBytes: (string | null)[] = [];
    for (const file of imagenes) {
      const tSha = Date.now();
      const hash = await hashBytesDeArchivo(file);
      hashesBytes.push(hash);
      if (hash) {
        logger.info(
          `[e14] ingesta sha256 nombre=${(file.name || "FOTO").slice(0, 24)} ms=${Date.now() - tSha} hash=${hash.slice(0, 8)}…`,
        );
      }
    }
    try {
      if (imagenes.length) {
        const ids = await agregarLote(imagenes, paginasPdf, hashesBytes); // D63-A2 (T1): viaPdf nace en el PRIMER write · e71 (Opt-1): hashBytes ídem
        // FIX M13 (auditoría 2-c): el swap respeta la decisión del dueño TOMADA
        // DURANTE la copia (QUITAR de una fila temp, VACIAR, o recarga de la
        // vista que re-monta cargarFilas): las temps que YA NO están en filas
        // NO reviven con id real — sus registros recién creados se BORRAN de
        // IDB (antes quedaban huérfanos y resucitaban como PENDIENTE al
        // recargar, contra la voluntad del usuario).
        const actuales = get().filas;
        const vivas = new Set(actuales.map((f) => f.id));
        const huerfanos = ids.filter((_, idx) => !vivas.has(temps[idx]!.id));
        set({
          filas: actuales.map((f) => {
            const idx = temps.findIndex((t) => t.id === f.id);
            return idx === -1 ? f : { ...f, id: ids[idx] };
          }),
          guardando: Math.max(0, get().guardando - imagenes.length),
          colaDisponible: true,
          avisoCola: null, // un lote que SÍ entró despeja el aviso de quota
        });
        // e71 (Opt-1) — DEDUP EXACTO INSTANTÁNEO: con los hashes ya en el
        // primer write, el pase marca DUPLICADA/YA-ENVIADA al instante y
        // ANTES de rearrancar el runner (el duplicado jamás llega al
        // pipeline). Fuera los huérfanos (M13 — jamás marcar muertos).
        await dedupExactoIngesta(
          imagenes
            .map((file, i) => ({ id: ids[i], hashBytes: hashesBytes[i] ?? null }))
            .filter((e) => e.id !== undefined && !huerfanos.includes(e.id)),
        );
        // e63g — PLAN e63g-e63h-ruta-unica (E1/FASE 1): el swap acaba de
        // crear filas PENDIENTE con id real — si el bucle murió mientras la
        // copia a IDB estaba en vuelo (siguientePendiente solo veía temps y
        // rompió), las nuevas quedaban PENDIENTE para siempre. Re-arranque
        // con guard IDEMPOTENTE en el runner: no-op si la cola corre, está
        // pausada o jamás se inició (D45 intacto — sesión fría no procesa).
        rearrancarTrasEncolar();
        // FIX M13 (auditoría 2-a): los huérfanos salen de IDB antes de
        // arrancar nada — jamás resucitan.
        for (const id of huerfanos) {
          try {
            await borrar(id);
          } catch {
            /* IDB caída — el orphan muere con el próximo VACIAR */
          }
        }
        // KIT e14-masiva-tiempos-v1 (PR-1): cadena de hashing DEDUP en
        // background (fire-and-forget — NUNCA bloquea el encolado ni la
        // UI; marca DUPLICADAS al aterrizar cada hash, FIFO). Los guards
        // anti-zombi de cadenaDedup ya excluyen filas muertas; aquí el
        // lote deja fuera a los huérfanos borrados (no hashear en balde).
        void cadenaDedup(
          imagenes
            .map((file, i) => ({
              id: ids[i],
              archivo: file,
              // e71 (Opt-1): el hash de la INGESTA viaja pre-computado —
              // la cadena de fondo no re-hashea (68 ms/file ahorrados).
              hashBytes: hashesBytes[i] ?? undefined,
            }))
            .filter((e) => e.id !== undefined && !huerfanos.includes(e.id)),
        );
      } else {
        set({ guardando: Math.max(0, get().guardando - imagenes.length) });
      }
      for (const fila of filasError) {
        try {
          await guardarRegistro({
            id: fila.id,
            nombre: fila.nombre,
            agregadaEn: fila.agregadaEn,
            estado: "ERROR",
            error: fila.error,
          });
        } catch {
          /* IDB caído: la fila vive SOLO en memoria (honesto) */
        }
      }
    } catch (err) {
      // El lote NO entró a IDB: filas temporales fuera + píldora honesta
      // (errores de IDB NUNCA tumban la UI — kit carga-masiva §3). Las filas
      // ERROR quedan en memoria — su motivo ES la información.
      // FIX M9 (auditoría 2-c): QUOTA ≠ «navegador sin soporte» — la cola
      // SIGUE disponible (hay filas pre-existentes sanas y PROCESAR vale);
      // el aviso explica cómo liberar espacio. Solo un fallo REAL de IDB
      // (abrir/versión) degrada a colaDisponible false.
      const esQuota =
        err instanceof Error &&
        (/quotaexceeded/i.test(err.name) ||
          /quota/i.test(err.message) ||
          /llen|full/i.test(err.message));
      const tempIds = new Set(temps.map((t) => t.id));
      set({
        filas: get().filas.filter((f) => !tempIds.has(f.id)),
        guardando: Math.max(0, get().guardando - imagenes.length),
        ...(esQuota
          ? {
              avisoCola:
                "ALMACENAMIENTO LLENO — vacía la bandeja o importa lotes más pequeños",
            }
          : { colaDisponible: false }),
      });
    }
  },

  iniciar: () => {
    if (!get().colaDisponible) return;
    iniciarRunner();
  },

  pausar: () => pausarRunner(),

  // KIT e14-masiva-tiempos-v1 (PR-1): «PROCESAR IGUAL» — la fila vuelve a
  // PENDIENTE (dupOf fuera, persistente) y el runner la reprocesa COMPLETA
  // como cualquier otra (kit §2 — el dueño fuerza el reproceso de una
  // gemela sospechosa). Si el runner está corriendo la toma en su siguiente
  // pasada (siguientePendiente ya incluye PENDIENTE).
  procesarIgual: async (id) => {
    // e63k (F1.3): el dueño mandó — se estampa forzarDedupOff (persistente)
    // para que las capas 1 (visual) y 2 (identidad) lo respeten SIEMPRE:
    // el runner ya no pasa por reutilizarResultado (dupOf null) y la capa 2
    // tampoco la marcará (kit §1.3 — el reproceso completo es irrevertible
    // hasta que el dueño decida otra cosa). e65 (T-6): extendido a
    // YA-ENVIADA — el MISMO escape del dueño: la fila nace PENDIENTE con
    // forzarDedupOff y enviadaDe FUERA (reproceso completo, RL-e65-7).
    patchFila(id, {
      estado: "PENDIENTE",
      dupOf: null,
      enviadaDe: null,
      forzarDedupOff: true,
    });
    logger.info(`[e14] dedup fila=${id} procesar-igual`);
    try {
      const registro = await leerRegistro(id);
      await guardarRegistro({
        ...registro,
        estado: "PENDIENTE",
        dupOf: undefined,
        enviadaDe: undefined,
        forzarDedupOff: true,
      });
    } catch {
      /* IDB caído — la fila ya está PENDIENTE en memoria (honesto) */
    }
  },

  // D59 — KIT e14-info-acta-filas-v1 (T3): «REINTENTAR» — la fila ERROR
  // vuelve a PENDIENTE (error fuera, persistente) y el runner la toma en su
  // siguiente pasada (o cuando el dueño pulse PROCESAR). Guard honesto: sin
  // archivo original en IDB (registros viejos o filas de formato) la fila
  // SIGUE en ERROR con SIN_ARCHIVO_ORIGINAL — jamás encolar humo.
  reintentar: async (id) => {
    const fila = get().filas.find((f) => f.id === id);
    if (!fila || fila.estado !== "ERROR") return;
    if (get().progreso?.id === id) return; // no corriendo en ese id (defensivo)
    let registro: RegistroMasiva;
    try {
      registro = await leerRegistro(id);
    } catch {
      return; // sin registro en IDB — nada que reintentar (honesto)
    }
    if (!(registro.archivo instanceof File)) {
      patchFila(id, { error: "SIN_ARCHIVO_ORIGINAL" });
      return;
    }
    patchFila(id, { estado: "PENDIENTE", error: null });
    try {
      await guardarRegistro({ ...registro, estado: "PENDIENTE", error: undefined });
    } catch {
      /* IDB caído — la fila ya está PENDIENTE en memoria (honesto) */
    }
  },

  abrirActa: async (id) => {
    // AUTO-PAUSA (kit §4 regla 2): el flujo de revisión usa el main thread
    // y actaActual — no pelear. Reanudar es MANUAL (botón PROCESAR).
    pausarRunner();
    set({ origenAbierto: id });
    await useE14Store.getState().abrirActaMasiva(id);
  },

  sincronizarAlVolver: async () => {
    const { origenAbierto } = get();
    if (!origenAbierto) return;
    const acta = useE14Store.getState().actaActual;
    // FIX (auditoría 2-c C4): la identidad se resuelve contra el acta GUARDADA
    // en el registro (registro.acta.id === actaActual.id) — NO contra el id de
    // la FILA ("masiva-*" vs "acta-*": prefijos distintos, la comparación
    // directa era SIEMPRE falsa y este bloque entero era código muerto: las
    // ediciones de REVISIÓN jamás volvían a la bandeja/IDB y el usuario,
    // viendo la fila desactualizada, re-abría y re-enviaba la misma acta).
    // El recorte/filtro/rotación conservan acta.id (spread ...acta) → la
    // identidad sobrevive a TODAS las ediciones del editor.
    if (!acta) {
      set({ origenAbierto: null });
      return;
    }
    try {
      const registro = await leerRegistro(origenAbierto);
      if (!registro || registro.acta?.id !== acta.id) {
        // Identidad NO coincide (arrancó una captura normal mientras tanto):
        // SOLO limpiar — no escribir nada (kit §4).
        set({ origenAbierto: null });
        return;
      }
      const actaNueva = acta;
      // Thumb FRESCO si la foto cambió (recorte/filtro/rotación hornean
      // fotoProcesada) — la bandeja no debe mentir.
      // KIT e14-observabilidad-v1 (A1-C7): kill switch MANUAL del dueño
      // (flags.thumbsOn, default true → idéntico sin overrides; D6: la app
      // nunca se auto-configura). OFF → conserva el thumb del registro.
      const thumb = leerFlags().thumbsOn
        ? ((await hacerThumb(actaNueva.fotoProcesada ?? actaNueva.fotoOriginal)) ??
          registro.thumb)
        : registro.thumb;
      await guardarRegistro({ ...registro, acta: actaNueva, thumb });
      // e65b (T-3c): envío MANUAL desde REVISIÓN — si el dueño envió a mano
      // el acta de esta fila masiva, el desenlace ENVIADO también alimenta
      // el ledger (RL-e65b-2 — micro-decisión: la vía existe y vive aquí,
      // con la identidad registro.acta?.id === acta.id ya verificada arriba;
      // el envío genérico del flujo normal queda INTACTO fuera de la
      // whitelist). Fire-and-forget — jamás tumba la sincronización (RL-e65b-3).
      if (actaNueva.status === "ENVIADA") {
        void registrarEnviadaHistorico({
          id: origenAbierto,
          ts: Date.now(),
          hashBytes: registro.hashBytes,
          hashDedup: registro.hashDedup,
          payloadQr: registro.qrPayload,
          serie: registro.serie ?? undefined,
        }).catch(() => {});
      }
      patchFila(origenAbierto, {
        estado: "LISTA",
        statusActa: actaNueva.status,
        score: actaNueva.score,
        nivel: actaNueva.clasificacion?.nivel ?? null,
        pagina: paginaDeActa(actaNueva),
        motivo: actaNueva.rechazo?.tipo ?? null,
        thumb,
        enviadaAuto:
          actaNueva.status === "ENVIADA" && !!actaNueva.enviadoAutomaticamente,
        // KIT e14-masiva-ux-v1 (T3.2): el envío manual desde REVISIÓN ya
        // hornea hashSha256 (registrarEnvio — actaFuente === actaActual);
        // la fila lo proyecta.
        envioEnCola: actaNueva.hashSha256 === "EN COLA",
        error: null,
      });
    } catch {
      /* sin registro en IDB → nada que sincronizar; la fila queda como está */
    }
    set({ origenAbierto: null });
  },

  quitar: async (id) => {
    try {
      await borrar(id);
    } catch {
      /* la fila muere igual en la bandeja (IDB falla — kit §3) */
    }
    set({ filas: get().filas.filter((f) => f.id !== id) });
    if (get().origenAbierto === id) set({ origenAbierto: null });
  },

  vaciar: async () => {
    if (get().corriendo) return; // el botón está deshabilitado — doble guard
    try {
      await vaciarCola();
    } catch {
      /* las filas mueren igual en la bandeja */
    }
    // e65b (T-5, REVERSA de D-e65-8 → D-e65b-1): lo que muere aquí es el
    // CACHE de sesión — NO el histórico. El ledger persistente (historico.ts,
    // DB separada) sobrevive: la próxima consulta reconstruye el índice
    // fusionando cola + ledger (T-2b) → tras VACIAR, re-subir lo ya enviado
    // nace YA-ENVIADA igualmente (la prueba exacta del dueño: vaciar +
    // re-subir los 46). `borrarHistorico()` existe pero JAMÁS se cablea aquí
    // (RL-e65b-5). La cola es el taller; el envío es el hecho.
    // e64p (C-2 — MODO PRUEBAS): con COLA_PERSISTENTE=false el ciclo de vida
    // COMPLETO muere aquí (reversa declarada del RL-e65b-5 SOLO en modo
    // pruebas): mapaQrPayload (capa 0 QR — hoy sobrevivía a vaciar en la
    // misma sesión) + ledger del histórico + índice → limpiar y re-subir el
    // MISMO lote procesa completo de cero (QA del kit). En producción
    // (true) este bloque no existe y D-e65b-1 queda byte a byte.
    if (!COLA_PERSISTENTE) {
      mapaQrPayload.clear();
      try {
        await borrarHistorico();
      } catch {
        /* conservador — el índice ya no lo verá en esta sesión */
      }
    }
    indiceEnviadas = null;
    set({ filas: [], progreso: null, origenAbierto: null, avisoCola: null });
  },

  // D33 — KIT e14-reiniciar-envios-v1: reset COMPLETO del ciclo de vida de
  // envíos, a pedido literal del dueño (2026-10-28): «un botón para reiniciar
  // los envíos… para poder probar las mismas imágenes y hacer las medidas».
  // La MISMA higiene del C-2 (modo pruebas) pero como ACCIÓN EXPLÍCITA de UI
  // en producción: cola + ledger del histórico + TODA la memoria de dedup
  // (capa 0 QR / bytes / visual / payload del sondeo). Re-subir el mismo
  // lote nace PENDIENTE y se procesa de cero. El botón es de 2 toques
  // (MasivaView) — el borrado NUNCA es accidental. vaciar() queda byte a
  // byte (RL-e65b-5 intacto — VACIAR sigue respetando el ledger).
  reiniciarEnvios: async () => {
    if (get().corriendo) return; // el botón está deshabilitado — doble guard
    try {
      await vaciarCola();
    } catch {
      /* las filas mueren igual en la bandeja */
    }
    mapaQrPayload.clear();
    try {
      await borrarHistorico();
    } catch {
      /* conservador — IDB caída: los índices de sesión ya no la verán */
    }
    resetearIndicePayload();
    indiceEnviadas = null;
    set({ filas: [], progreso: null, origenAbierto: null, avisoCola: null });
  },

  enviarLote: async (estado) => {
    if (estado !== "ADVERTENCIA") return; // v1: SOLO advertencias (kit §9)
    // FIX (auditoría 2-c C5): guard de re-entrancia — un doble clic (o doble
    // tap móvil) disparaba DOS lotes que tomaban el MISMO snapshot de filas
    // ADVERTENCIA (el patchFila llegaba tarde) → cada acta pasaba 2× por
    // registrarEnvioMasiva: historial duplicado y completadas inflada.
    if (get().enviandoLote) return;
    const pendientes = get().filas.filter(
      (f) => f.estado === "LISTA" && f.statusActa === "ADVERTENCIA",
    );
    if (pendientes.length === 0) return;
    set({ enviandoLote: true });
    try {
    for (const fila of pendientes) {
      try {
        const registro = await leerRegistro(fila.id);
        const acta = registro.acta;
        if (!acta || acta.status !== "ADVERTENCIA") continue;
        // La MISMA vía que el envío manual del flujo normal (T3.3) —
        // historial + completadas + hueco archivado + cola offline.
        // KIT e14-masiva-ux-v1 (T3.2): si la conexión estaba OFFLINE el
        // envío va a la cola → hashSha256 "EN COLA" (la fila pinta «EN
        // COLA» y refrescarEnviosTrasDrenaje la drena al reconectar).
        const onlineAlEnviar = useE14Store.getState().online;
        useE14Store.getState().registrarEnvioMasiva(acta);
        const actaEnviada: Acta = {
          ...acta,
          status: "ENVIADA",
          enviadoAutomaticamente: getBridge().horaEnvio(),
          ...(onlineAlEnviar ? {} : { hashSha256: "EN COLA" }),
        };
        await guardarRegistro({ ...registro, acta: actaEnviada });
        // e65b (T-3c): envío MANUAL del LOTE (ADVERTENCIA → ENVIADA) — el
        // desenlace ENVIADO también alimenta el ledger (RL-e65b-2 —
        // micro-decisión: misma vía del helper único). Si quedó «EN COLA»
        // (offline) el status YA es ENVIADA — el MISMO criterio del índice
        // (acta?.status === "ENVIADA"). Fire-and-forget (RL-e65b-3).
        void registrarEnviadaHistorico({
          id: fila.id,
          ts: Date.now(),
          hashBytes: registro.hashBytes,
          hashDedup: registro.hashDedup,
          payloadQr: registro.qrPayload,
          serie: registro.serie ?? undefined,
        }).catch(() => {});
        patchFila(fila.id, {
          statusActa: "ENVIADA",
          score: actaEnviada.score,
          motivo: null,
          envioEnCola: actaEnviada.hashSha256 === "EN COLA",
        });
      } catch {
        /* una fila que falla NO detiene el lote (sigue con la siguiente) */
      }
    }
    } finally {
      set({ enviandoLote: false });
    }
  },

  // D65 (T3.1): señal de vida — estado transitorio (NUNCA a IDB, kit T3.4);
  // el % fantasma no existe: al recargar, progreso vuelve a null.
  marcarProgreso: (id, progreso) => set({ progreso: { id, ...progreso } }),

  setFiltro: (filtro) => set({ filtro }),

  // e64-qr-v1 (T-0.2): patch INMUTABLE de UNA fila viva — el MISMO patrón
  // del patchFila interno; expuesto como action para el runner (chip QR).
  actualizarFila: (id, patch) => patchFila(id, patch),
}));

// D66 — KIT e14-decode-unico-precalor-v1 (T3): el precalor queda cableado
// al mini-store DESDE AHORA (store ya creado) — respira con la cola aunque
// el dueño nunca pulse PROCESAR (ese es su propósito: trabajar en la
// espera). En SSR el store no emite eventos y las señales de ociosidad lo
// mantienen apagado.
cablearPrecalor();
