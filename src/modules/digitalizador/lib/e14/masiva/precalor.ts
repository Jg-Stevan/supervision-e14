"use client";

/**
 * D66 — KIT e14-decode-unico-precalor-v1 (T3): PRECALOR de la cola MASIVA.
 *
 * El tiempo muerto de la COLA trabaja: mientras hay filas PENDIENTES y el
 * pipeline está OCIOSO (ni lote activo, ni fila PROCESANDO, ni REVISIÓN
 * abierta, ni envío de lote), decodifica en background las próximas
 * `precalorColaEfectivo()` (3 base) filas a MASTER (maestroDeImagen — T1: un solo
 * decodificado a la escala de trabajo). DOCTRINA D45 INTACTA: precalentar NO
 * es procesar — sin OCR, sin veredicto, sin score; la fila sigue PENDIENTE
 * hasta que el dueño pulse PROCESAR (T3.1/T3 intro).
 *
 * · El master reposa como BLOB JPEG (q≈0.90, T3.2) — NUNCA un bitmap vivo.
 * · Flag `precalentada` TRANSITORIO en la fila (mini-store en memoria; NO
 *   se persiste en IDB — al recargar se pierde y el precalor vuelve a
 *   precalentar si aplica, kit T3.2 literal).
 * · Precalor PAUSADO durante un lote en ejecución (el CPU es del OCR —
 *   kit T3.6): el ciclo no ARRANCA masters nuevos y las construcciones en
 *   vuelo se abortan por la señal de cancelación. Excepción ÚNICA: el
 *   prefetch del runner (1 slot, D61 re-apuntado) pide el master de N+1
 *   DURANTE el OCR de N con `ignorarOciosidad` — el decode se esconde tras
 *   el OCR igual que hoy, pero produce un MASTER (el pipeline ya no consume
 *   el archivo original, así que calentar su memo sería trabajo muerto).
 * · Cancelación (T3.4): quitar la fila o vaciar la cola aborta el precalor
 *   en curso de esa fila (señal entre etapas + entrada fuera del mapa).
 * · Quad de detección (T3.1): DESVIACIÓN DOCUMENTADA (REPORTE §desviaciones
 *   D66) — el bridge no acepta un quad precomputado (escanearActa corre su
 *   propia detección), así que un quad del precalor sería trabajo muerto;
 *   lo que SÍ hace el precalor por la detección es el warm-up del worker
 *   OpenCV del core (warmUpScannerWorker — el mismo mecanismo que ya usa
 *   el bridge al detectar) UNA vez por sesión al primer master.
 *
 * Módulo singleton sin React: se suscribe al mini-store (useMasivaStore)
 * igual que el runner lo parchea desde fuera (mismo patrón marcarFila).
 * Un fallo del precalor JAMÁS tumba nada: la fila procesa normal.
 */
import { maestroDeImagen, type MaestroImagen } from "./archivos";
import { logger } from "../../logger";
import { leerRegistro } from "./cola";
import { warmUpScannerWorker } from "@jg-stevan/scanner-core/detector-client";
import { useMasivaStore } from "./store";
// KIT e14-gama-adaptativa-v1 (D74): el TOPE EFECTIVO del precalor lo da el
// plan de gama (BAJO 1 · MEDIO 2 · base 3).
import { planGamaActual } from "../gama";
import type { FilaMasiva } from "./tipos";

/** D66 (T3.1) — masters PRECALORADOS máximos en memoria (blobs ~1-4 MB c/u).
 *  KIT e14-gama-adaptativa-v1 (D74): EFECTIVO por gama — cada master es el
 *  decode a MAESTRO_LADO_MAYOR y en RAM justa 3 masters vivos son presión
 *  de GC/abortos (en BAJO además pool 1 ⇒ prefetch único). Flag OFF /
 *  ALTO ⇒ 3 = byte-idéntico a hoy. */
const precalorColaEfectivo = (): number => planGamaActual().precalorCola;

/** Entrada del mapa de masters (SOLO memoria — jamás IDB). */
interface EntradaPrecalor {
  maestro: MaestroImagen;
  /** ms TOTALES del precalor para esta fila (IDB+decode+encode — T4). */
  precalorMs: number;
  /** Señal de cancelación (T3.4) — la fila murió mientras se precalentaba. */
  abortada: boolean;
}

/** Mapa de masters vivos (tope precalorColaEfectivo). */
const entradas = new Map<string, EntradaPrecalor>();

/** Filas cuyo precalor FALLÓ en esta sesión (no reintentar en cada evento —
 *  una fila rota no puede bloquear la ventana; el reproceso del dueño o un
 *  evento futuro la re-evalúan: la poda del ciclo limpia las muertas). */
const fallidas = new Set<string>();

/** Warm-up del worker de detección ya disparado (UNA vez por sesión). */
let workerCalentado = false;

/** Programación del siguiente ciclo (el subscribe dispara POR CADA setState
 *  del mini-store — sin este guard entraríamos en cascada). */
let cicloProgramado = false;
let precalorEnVuelo = false;

/** Patch INMUTABLE de UNA fila (mismo patrón del runner). */
function marcarFila(id: string, patch: Partial<FilaMasiva>): void {
  const filas = useMasivaStore.getState().filas;
  useMasivaStore.setState({
    filas: filas.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  });
}

/** ¿El pipeline está OCIOSO para el precalor (kit T3.1/T3.6)? Ni lote activo
 *  (corriendo), ni fila PROCESANDO (progreso vivo), ni REVISIÓN abierta
 *  (origenAbierto — el editor usa el main thread), ni envío de lote. */
function pipelineOcioso(): boolean {
  const s = useMasivaStore.getState();
  return (
    !s.corriendo &&
    s.progreso === null &&
    s.origenAbierto === null &&
    !s.enviandoLote
  );
}

/** ¿La fila sigue viva y PENDIENTE? (base de TODAS las cancelaciones). */
function filaVivaYPendiente(id: string): boolean {
  const fila = useMasivaStore.getState().filas.find((f) => f.id === id);
  return !!fila && fila.estado === "PENDIENTE";
}

/** Siguiente PENDIENTE SIN master (y sin fallo previo) que aún viva en la
 *  cola (FIFO por agregadaEn — el mismo orden del runner; las temps se
 *  saltan: su id real llega al resolver agregarLote). */
function siguientePendienteSinMaster(): FilaMasiva | null {
  return (
    useMasivaStore
      .getState()
      .filas.filter(
        (f) =>
          f.estado === "PENDIENTE" &&
          !f.id.startsWith("masiva-temp-") &&
          !entradas.has(f.id) &&
          !fallidas.has(f.id),
      )
      .sort((a, b) => a.agregadaEn - b.agregadaEn)[0] ?? null
  );
}

/** Despacha los masters que faltan para llenar la ventana (T3.1: máx 3). */
function programarCiclo(): void {
  if (cicloProgramado) return;
  cicloProgramado = true;
  // Microtask: dejar asentar el setState que disparó la evaluación.
  void Promise.resolve().then(() => {
    cicloProgramado = false;
    void ciclo();
  });
}

/** Un ciclo: mientras haya hueco, ociosidad y PENDIENTE sin master →
 *  precalentar UNO (secuencial — nunca dos decodes a la vez). */
async function ciclo(): Promise<void> {
  if (precalorEnVuelo) return;
  precalorEnVuelo = true;
  try {
    for (;;) {
      if (!pipelineOcioso()) return;
      // Poda: entradas/fallos de filas que ya no están (quitada/vaciada).
      const vivos = new Set(useMasivaStore.getState().filas.map((f) => f.id));
      for (const [id, entrada] of entradas) {
        if (!vivos.has(id)) {
          entrada.abortada = true;
          entradas.delete(id);
        }
      }
      for (const id of fallidas) if (!vivos.has(id)) fallidas.delete(id);
      if (entradas.size >= precalorColaEfectivo()) return;
      const fila = siguientePendienteSinMaster();
      if (!fila) return;
      const ok = await precalentarUno(fila.id, { ignorarOciosidad: false });
      if (!ok) continue; // fallo/cancelación → siguiente candidato (fallidas evita el bucle)
    }
  } finally {
    precalorEnVuelo = false;
  }
}

/** Precalentar UNA fila: leer registro → maestroDeImagen (T1/T2) → mapa +
 *  flag transitorio en la fila. False = nada que hacer (la fila procesa
 *  normal cuando le toque — jamás bloquea, jamás inventa). */
async function precalentarUno(
  id: string,
  opciones: { ignorarOciosidad: boolean },
): Promise<boolean> {
  const t0 = Date.now();
  const entrada: EntradaPrecalor = { maestro: null as unknown as MaestroImagen, precalorMs: 0, abortada: false };
  try {
    const registro = await leerRegistro(id);
    const archivo = registro.archivo;
    if (!(archivo instanceof File)) return false;
    // Guard anti-zombi (misma doctrina de cadenaDedup): la fila pudo
    // quitarse/vaciarse mientras la lectura de IDB corría.
    if (entrada.abortada || !filaVivaYPendiente(id)) return false;
    if (!opciones.ignorarOciosidad && !pipelineOcioso()) return false;
    // Warm-up de la detección UNA vez por sesión (T3.1 — ver cabecera).
    if (!workerCalentado) {
      workerCalentado = true;
      try {
        warmUpScannerWorker(); // void (idempotente — crea/reanima el worker)
      } catch {
        /* el pipeline ya tiene su propio fallback Sobel */
      }
    }
    // Cancelación (T3.4): fila muerta/ya no PENDIENTE, o — salvo prefetch —
    // el pipeline dejó de estar ocioso (arrancó un lote: el CPU es del OCR).
    const senalCancelacion = () =>
      entrada.abortada ||
      !filaVivaYPendiente(id) ||
      (!opciones.ignorarOciosidad && !pipelineOcioso());
    const maestro = await maestroDeImagen(archivo, {
      nombre: registro.nombre,
      senalCancelacion,
    });
    if (!maestro) {
      fallidas.add(id); // roto o cancelado — sin reintentar en cada evento
      return false;
    }
    if (entrada.abortada || !filaVivaYPendiente(id)) return false; // murió a mitad — master descartado
    entrada.maestro = maestro;
    entrada.precalorMs = Math.max(1, Math.round(Date.now() - t0));
    // Tope por si la cola se movió más rápido que el bucle: expulsa al más
    // viejo (FIFO del Map) para respetar el tope EFECTIVO (memoria acotada).
    while (entradas.size >= precalorColaEfectivo()) {
      const masViejo = entradas.keys().next().value;
      if (masViejo === undefined) break;
      entradas.delete(masViejo);
    }
    entradas.set(id, entrada);
    // Flag TRANSITORIO en la fila (mini-store — NUNCA IDB, kit T3.2).
    marcarFila(id, { precalentada: true });
    logger.info(
      `[e14] precalor fila=${id} listo ms=${entrada.precalorMs} origen=${maestro.origenDecode} ${maestro.ancho}x${maestro.alto}`,
    );
    return true;
  } catch {
    fallidas.add(id);
    return false; // IDB caída/decode roto — la fila procesa normal (honesto)
  }
}

// ---------- API para el runner (zona D66 del kit: consumir masters) ----------

/** CONSUMIR el master de una fila (el runner lo alimenta al bridge — T3.3:
 *  decode = 0 s). Borra la entrada (un master se consume UNA vez). */
export function consumirMaestro(
  id: string,
): { maestro: MaestroImagen; precalorMs: number } | null {
  const entrada = entradas.get(id);
  if (!entrada) return null;
  entradas.delete(id);
  return { maestro: entrada.maestro, precalorMs: entrada.precalorMs };
}

/** Descartar el master de una fila (quitar/vaciar — T3.4): aborta el
 *  precalor en curso de esa fila y libera el blob. */
export function descartarMaestro(id: string): void {
  const entrada = entradas.get(id);
  if (entrada) {
    entrada.abortada = true;
    entradas.delete(id);
  }
}

/** D66 (T3.6 + prefetch D61 re-apuntado): asegurar el master de UNA fila
 *  concreta aunque el pipeline NO esté ocioso (el prefetch del runner
 *  durante el OCR de N). Idempotente; no lanza. */
export async function asegurarMaestro(id: string): Promise<void> {
  if (entradas.has(id)) return;
  if (!filaVivaYPendiente(id)) return;
  await precalentarUno(id, { ignorarOciosidad: true });
}

// ---------- Cableado (suscripción al mini-store — sin tocar store.ts) ----------

/** Suscripción ÚNICA a nivel de módulo: cada cambio relevante del mini-store
 *  re-evalúa el ciclo (programado en microtask). Los eventos de QUITAR/
 *  VACIAR también llegan aquí → descartan masters de filas muertas (T3.4)
 *  — cancelación sin tocar store.ts. */
let cableado = false;

export function cablearPrecalor(): void {
  if (cableado) return;
  cableado = true;
  useMasivaStore.subscribe((estado, previo) => {
    if (
      estado.filas === previo.filas &&
      estado.progreso === previo.progreso &&
      estado.corriendo === previo.corriendo &&
      estado.origenAbierto === previo.origenAbierto
    ) {
      return; // cambio irrelevante para el precalor
    }
    // Cancelación (T3.4): filas que desaparecieron (QUITAR/VACIAR) O que
    // dejaron de ser PENDIENTES — p. ej. la cadenaDedup las marcó DUPLICADA
    // (la gemela reutiliza el resultado de su original: su master sería
    // peso muerto). El consumo del runner NO corre esta rama: procesarUno
    // consume ANTES de marcar PROCESANDO (orden crítico documentado allí).
    if (estado.filas !== previo.filas) {
      const pendientes = new Set(
        estado.filas.filter((f) => f.estado === "PENDIENTE").map((f) => f.id),
      );
      for (const [id, entrada] of entradas) {
        if (!pendientes.has(id)) {
          entrada.abortada = true;
          entradas.delete(id);
        }
      }
    }
    programarCiclo();
  });
}
