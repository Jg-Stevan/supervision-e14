/**
 * KIT e14-observabilidad-v1 (A1-C2) — buffer CIRCULAR de eventos en
 * IndexedDB VANILLA (patrón de masiva/cola.ts, DB PROPIA — jamás abrir la
 * de la cola masiva).
 *
 * Contrato README-KITS §4.1/§4.3: DB `e14-obs` v1, store `eventos` con
 * keyPath `id` e índice por `ts` · tope 500 · TTL 30 días (FIFO: al pasarse
 * el tope se borran los MÁS VIEJOS por ts).
 *
 * REGLA DE ORO §2.4: el rastreo jamás rompe la app — TODO el módulo es
 * try/catch silencioso: si IDB falla, appendEvento RESUELVE (el caller no
 * espera, no sabe, no paga) y las lecturas degradan honestas ([]/0).
 *
 * La lógica de retención (TTL + tope) vive en `mantenimientoBuffer`, PURA y
 * testeada en obs.test.ts (kit A1-C2: «extrae la lógica pura a funciones
 * puras exportadas internamente y testéalas»).
 */
import { nuevoUuid, idDispositivo, idSesion, appVersion } from "./identidad";
import { agregarErrores } from "./digest";
import type { ErroresAgrupados, EventoObs } from "./tipos";

const DB_NOMBRE = "e14-obs";
const DB_VERSION = 1;
const STORE = "eventos";
export const TOPE_EVENTOS = 500; // contrato §4.1 (constante expuesta para tests)
export const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

let dbSingleton: IDBDatabase | null = null;

/** Abrir (singleton idempotente). Rechazo claro si IDB no está — solo
 *  abrirBuffer propaga; el resto de las operaciones atrapan. */
function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbSingleton) {
      resolve(dbSingleton);
      return;
    }
    if (typeof indexedDB === "undefined") {
      reject(new Error("SIN_INDEXEDDB"));
      return;
    }
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("ts", "ts", { unique: false });
      }
    };
    req.onsuccess = () => {
      dbSingleton = req.result;
      // Higiene (mismo patrón cola.ts): conexión cerrada → re-abrir después.
      dbSingleton.onclose = () => {
        dbSingleton = null;
      };
      resolve(dbSingleton);
    };
    req.onerror = () => reject(req.error ?? new Error("IDB_NO_ABRIO"));
    req.onblocked = () => reject(new Error("IDB_BLOQUEADA"));
  });
}

/** Envolver un request IDB en promesa (patrón cola.ts). */
function pedir<T>(req: IDBRequest<T>, contexto: string): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(contexto));
  });
}

/** Esperar el cierre de una transacción (put/delete/clear corren suelto). */
function esperarTx(store: IDBObjectStore, contexto: string): Promise<void> {
  const tx = store.transaction;
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(contexto));
    tx.onabort = () => reject(tx.error ?? new Error(`${contexto}_ABORTADA`));
  });
}

function transaccion(db: IDBDatabase, modo: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, modo).objectStore(STORE);
}

/** RETENCIÓN PURA — decide qué queda y qué se borra:
 *  1) TTL: fuera los eventos con ts < ahora − 30 días.
 *  2) Tope: si aún quedan más de 500, fuera los MÁS VIEJOS por ts (FIFO).
 *  Determinista: `borrar` sale ordenado por ts ASC (empates por id). */
export function mantenimientoBuffer(
  eventos: EventoObs[],
  ahora: number,
): { conservar: EventoObs[]; borrar: EventoObs[] } {
  const limite = ahora - TTL_MS;
  const porTs = (a: EventoObs, b: EventoObs) => a.ts - b.ts || (a.id < b.id ? -1 : 1);
  const vivos = eventos.filter((e) => e.ts >= limite).sort(porTs);
  const vencidos = eventos.filter((e) => e.ts < limite).sort(porTs);
  const exceso = Math.max(0, vivos.length - TOPE_EVENTOS);
  return {
    borrar: [...vencidos, ...vivos.slice(0, exceso)],
    conservar: vivos.slice(exceso),
  };
}

/** Completar el evento con la identidad del contrato (id/ts/sesion/
 *  dispositivo/appVersion si faltan — defensivo: los callers JS pueden
 *  omitirlos aunque el tipo los exija). */
function completarEvento(e: Omit<EventoObs, "id">): EventoObs {
  return {
    ...e,
    id: nuevoUuid(),
    ts: e.ts || Date.now(),
    sesion: e.sesion || idSesion(),
    dispositivo: e.dispositivo || idDispositivo(),
    appVersion: e.appVersion || appVersion(),
  };
}

/** Flag anti-recursión (kit A1-C3): mientras el rastreo está EMITIENDO un
 *  evento, cualquier appendEvento anidado (p. ej. un logger.error interno de
 *  obs disparado durante la emisión, o un evento que nace del propio
 *  handler de captura) se descarta — el rastreo jamás se auto-rastrea. */
let capturando = false;

/** Abrir el buffer ANTES de usarlo (idempotente — el bootstrap C7 la llama
 *  una vez; las demás funciones abren por sí solas si no). */
export async function abrirBuffer(): Promise<void> {
  await abrir();
}

/** Añadir un evento (aplica tope 500 + TTL 30d + purge vencidos). SILENCIOSO
 *  SIEMPRE: cualquier fallo de IDB resuelve sin lanzar (regla de oro §2.4).
 *  Anti-recursión: si ya estamos dentro de una emisión (capturando), el
 *  evento anidado se descarta en silencio. */
export async function appendEvento(e: Omit<EventoObs, "id">): Promise<void> {
  if (capturando) return;
  capturando = true;
  try {
    const db = await abrir();
    const completo = completarEvento(e);
    const store = transaccion(db, "readwrite");
    store.put(completo);
    await esperarTx(store, "IDB_APPEND");
    await mantener();
  } catch {
    /* el rastreo jamás lanza — el buffer es best-effort por diseño */
  } finally {
    capturando = false;
  }
}

/** TTL + tope sobre el contenido real del store (post-append). */
async function mantener(): Promise<void> {
  const db = await abrir();
  const todos = await pedir<EventoObs[]>(
    transaccion(db, "readonly").getAll() as IDBRequest<EventoObs[]>,
    "IDB_LEER_TODOS",
  );
  const { borrar } = mantenimientoBuffer(todos, Date.now());
  if (borrar.length === 0) return;
  const store = transaccion(db, "readwrite");
  for (const e of borrar) store.delete(e.id);
  await esperarTx(store, "IDB_MANTENER");
}

/** Leer eventos ordenados por ts ASC (filtrados opcionalmente). Fallo IDB →
 *  [] honesto (el reporte/export degradan — jamás lanzan). */
export async function leerEventos(
  f?: (e: EventoObs) => boolean,
): Promise<EventoObs[]> {
  try {
    const db = await abrir();
    const todos = await pedir<EventoObs[]>(
      transaccion(db, "readonly").getAll() as IDBRequest<EventoObs[]>,
      "IDB_LEER_EVENTOS",
    );
    const orden = todos.sort((a, b) => a.ts - b.ts);
    return f ? orden.filter(f) : orden;
  } catch {
    return [];
  }
}

/** Conteo barato (IDB count nativo). Fallo IDB → 0. */
export async function contarEventos(): Promise<number> {
  try {
    const db = await abrir();
    return await pedir<number>(
      transaccion(db, "readonly").count(),
      "IDB_CONTAR",
    );
  } catch {
    return 0;
  }
}

/** Vaciar el buffer COMPLETO (kill switch del dueño — export con
 *  vaciarDespues, C6). Fallo IDB → silencioso. */
export async function purgarBuffer(): Promise<void> {
  try {
    const db = await abrir();
    const store = transaccion(db, "readwrite");
    store.clear();
    await esperarTx(store, "IDB_PURGAR");
  } catch {
    /* silencioso */
  }
}

/** Agregación error+warn por digest (contrato §4.3) — sobre el contenido
 *  real del buffer. Fallo IDB → [] honesto. */
export async function eventosPorDigest(): Promise<ErroresAgrupados[]> {
  const eventos = await leerEventos(
    (e) => e.tipo === "error" || e.tipo === "warn",
  );
  return agregarErrores(eventos);
}
