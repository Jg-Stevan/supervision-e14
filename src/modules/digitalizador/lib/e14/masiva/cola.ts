/**
 * KIT e14-carga-masiva-v1 (T1): cola PERSISTENTE del módulo MASIVA —
 * IndexedDB VANILLA (kit §0.3: package.json/bun.lock INTOCABLES — cero
 * dependencias nuevas). UN solo store «archivos» (keyPath id → RegistroMasiva
 * completo): el File original duerme aquí (no en RAM) y el acta completa
 * queda junto a él tras procesar (recortable en REVISIÓN, F5).
 * Errores de IDB NUNCA tumban la UI (kit §3): el caller decide — la entrada
 * afectada pasa a ERROR con motivo corto / la vista pinta su píldora.
 */
import type { Acta } from "../types";
import type { RegistroMasiva } from "./tipos";

const DB_NOMBRE = "e14-masiva-v1";
const DB_VERSION = 1;
const STORE = "archivos";

let dbSingleton: IDBDatabase | null = null;

/** Abrir (singleton). Rechazo CLARO si IndexedDB no está disponible → la
 *  vista muestra la píldora «TU NAVEGADOR NO SOPORTA LA COLA — IMPORTA DE
 *  A UNA EN ESCANEAR» (kit §3). Overnight 3B-B2b: de-export — 7 usos
 *  internos, 0 externos (knip); el patrón sigue citándose en docs/QA. */
function abrirCola(): Promise<IDBDatabase> {
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
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      dbSingleton = req.result;
      // Higiene: si el navegador cierra la conexión, el próximo abrir re-crea.
      dbSingleton.onclose = () => {
        dbSingleton = null;
      };
      resolve(dbSingleton);
    };
    req.onerror = () => reject(req.error ?? new Error("IDB_NO_ABRIO"));
    req.onblocked = () => reject(new Error("IDB_BLOQUEADA"));
  });
}

/** Envolver un request IDB en promesa — error con contexto corto (kit §3:
 *  motivo corto, nunca tumba la UI; el catch del caller clasifica). */
function pedir<T>(req: IDBRequest<T>, contexto: string): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(contexto));
  });
}

function transaccion(db: IDBDatabase, modo: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, modo).objectStore(STORE);
}

let contadorId = 0;

/** 1 registro por File, id «masiva-<ts>-<contador>», estado PENDIENTE.
 *  Una sola transacción (lote atómico): todo entra o nada entra.
 *  D63-A2 (T1): `pdfPages` opcional — los File que estén en el Set estampan
 *  `viaPdf: true` en su registro DESDE EL PRIMER write (sin segundo write
 *  post-hoc que compita con el write del hash de cadenaDedup — write
 *  whole-object). Ausente = no-PDF (jamás inventar). */
export async function agregarLote(
  files: File[],
  pdfPages?: Set<File>,
  // e71 (Opt-1) — hashes SHA-256 PRE-CALCULADOS por el store (ingesta, kit
  // e71-consolidación): nacen EN EL PRIMER write del registro — el marcado
  // instantáneo de duplicados exactos no paga lecturas y cadenaDedup los
  // reutiliza sin re-hashear. null/ausente = hash falló (conservador — la
  // fila procesa normal, igual que hoy).
  hashesBytes?: (string | null)[],
): Promise<string[]> {
  const db = await abrirCola();
  const store = transaccion(db, "readwrite");
  const ahora = Date.now();
  const ids: string[] = [];
  files.forEach((file, i) => {
    const id = `masiva-${ahora}-${contadorId++}`;
    const hash = hashesBytes?.[i] ?? null;
    const registro: RegistroMasiva = {
      id,
      nombre: file.name || `FOTO_${i + 1}`,
      agregadaEn: ahora + i, // FIFO estable DENTRO del lote (orden de suelta)
      estado: "PENDIENTE",
      archivo: file,
      // e71 (Opt-1): la llave exacta de dedup (SHA-256 hex 64 — hashBytes)
      // viaja en el PRIMER write (kit: «guardar como hashSha256 en el
      // registro» — M-e71: el campo EXISTENTE e65 ya ES ese SHA-256).
      ...(hash ? { hashBytes: hash } : {}),
      ...(pdfPages?.has(file) ? { viaPdf: true } : {}),
    };
    ids.push(id);
    store.put(registro);
  });
  const tx = store.transaction;
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB_AGREGAR"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB_AGREGAR_ABORTADA"));
  });
  return ids;
}

// ─── e68-blob-idb-v1 — MIGRACIÓN base64 → Blob (fotos del acta en IDB) ───

/** e68 (§2) — dataURL → Blob: los bytes EXACTOS del base64 (Uint8Array →
 *  Blob con su MIME). null si no parsea (el caller CONSERVA el string —
 *  jamás perder una foto por un parseo). Convierte el +33 % de inflación
 *  del base64 en bytes nativos (structured clone sin conversión). */
function dataUrlABlob(dataUrl: string): Blob | null {
  // Sin flag `s` (target < es2018): el base64 de canvas/FileReader jamás
  // trae saltos de línea.
  const m = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

/** e68 — Blob → dataURL (FileReader del navegador — determinista: mismos
 *  bytes + MIME ⇒ mismo string; null si falla — el caller sigue sin foto y
 *  los guards existentes degradan honesto). */
function blobADataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const lector = new FileReader();
      lector.onload = () =>
        resolve(typeof lector.result === "string" ? lector.result : null);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

/** e68 (§3) — ¿el desenlace ya NO necesita la foto original? ENVIADA (el
 *  envío realizó — reintento/recorte manual son raros, plan §3) o
 *  DUPLICADA (gemela copiada — su foto ES la de la original). El ZIP del
 *  informe jamás exportó carpetas de estos status (ESTADOS_CARPETA =
 *  RECHAZADA/ADVERTENCIA/EN_REVISION_HUMANA) — cero impacto en el informe. */
function desenlaceSinOriginal(acta: Acta): boolean {
  return acta.status === "ENVIADA" || acta.status === "DUPLICADA";
}

/** e68 (§2) — COMPACTAR para IDB: las dataURLs del acta (base64, +33 % en
 *  el structured clone) se HOISTEAN a Blobs nativos del registro y salen de
 *  la copia persistida del acta. Reglas:
 *  · String presente → se convierte; fallo de parseo → el string SE QUEDA
 *    (jamás perder la foto).
 *  · Sin string pero Blob previo → el Blob se conserva (writes que
 *    re-persisten registros leídos crudos del cursor).
 *  · Cleanup (§3): ENVIADA/DUPLICADA → fotoOriginalBlob FUERA (2.4–16.9 MB
 *    por acta); fotoProcesadaBlob y thumb SE CONSERVAN (REVISIÓN/UI).
 *  · Registros sin acta (PENDIENTE/ERROR de cola) → sin cambios.
 *  Registros previos a e68 (base64 dentro del acta) se compactan en su
 *  PRÓXIMO write — sin reescritura en caliente (§2.1 del plan: migración
 *  aparte). */
function compactarRegistro(registro: RegistroMasiva): RegistroMasiva {
  const acta = registro.acta;
  if (!acta) return registro;
  let fotoOriginalBlob = registro.fotoOriginalBlob;
  let fotoProcesadaBlob = registro.fotoProcesadaBlob;
  let fotoOriginal: string | undefined = acta.fotoOriginal;
  let fotoProcesada: string | undefined = acta.fotoProcesada;
  if (fotoOriginal) {
    const blob = dataUrlABlob(fotoOriginal);
    if (blob) {
      fotoOriginalBlob = blob;
      fotoOriginal = undefined; // sale del acta — duerme como Blob
    }
  }
  if (fotoProcesada) {
    const blob = dataUrlABlob(fotoProcesada);
    if (blob) {
      fotoProcesadaBlob = blob;
      fotoProcesada = undefined; // ídem
    }
  }
  if (desenlaceSinOriginal(acta)) fotoOriginalBlob = undefined; // cleanup §3
  const actaCompacta: Acta = { ...acta };
  if (fotoOriginal) actaCompacta.fotoOriginal = fotoOriginal;
  else delete actaCompacta.fotoOriginal;
  if (fotoProcesada) actaCompacta.fotoProcesada = fotoProcesada;
  else delete actaCompacta.fotoProcesada;
  const compacto: RegistroMasiva = { ...registro, acta: actaCompacta };
  if (fotoOriginalBlob) compacto.fotoOriginalBlob = fotoOriginalBlob;
  else delete compacto.fotoOriginalBlob;
  if (fotoProcesadaBlob) compacto.fotoProcesadaBlob = fotoProcesadaBlob;
  else delete compacto.fotoProcesadaBlob;
  // §4 — observabilidad: bytes REALES que duermen en IDB por esta fila
  // (el thumb sigue siendo dataURL — desviación M-e68-2 documentada: su
  // migración ahorra ~13 KB/acta, no justifica tocar la bandeja).
  if (compacto.fotoOriginalBlob || compacto.fotoProcesadaBlob || fotoOriginal || fotoProcesada) {
    console.info("[e14] memoria fila", {
      registroId: registro.id,
      estado: registro.estado,
      statusActa: acta.status,
      fotoOriginalBytes: compacto.fotoOriginalBlob?.size ?? 0,
      fotoProcesadaBytes: compacto.fotoProcesadaBlob?.size ?? 0,
      thumbBytes: registro.thumb ? Math.floor((registro.thumb.length * 3) / 4) : 0,
    });
  }
  return compacto;
}

/** e68 — MATERIALIZAR al leer: reconstruye las dataURLs del acta desde los
 *  Blobs (contrato Acta en RAM INTACTO — REVISIÓN/recorte/UI las consumen
 *  como siempre). Registros previos a e68 (base64 dentro del acta) pasan
 *  tal cual — compatibilidad §2.1 (normalizar SOLO al leer; el próximo
 *  write del registro los compacta). Fallo del FileReader → el campo
 *  queda ausente (guards existentes degradan honesto — jamás inventar). */
async function materializarFotos(registro: RegistroMasiva): Promise<RegistroMasiva> {
  const acta = registro.acta;
  if (!acta) return registro;
  const necesitaOriginal = !acta.fotoOriginal && registro.fotoOriginalBlob;
  const necesitaProcesada = !acta.fotoProcesada && registro.fotoProcesadaBlob;
  if (!necesitaOriginal && !necesitaProcesada) return registro;
  const [fotoOriginal, fotoProcesada] = await Promise.all([
    necesitaOriginal ? blobADataUrl(registro.fotoOriginalBlob as Blob) : Promise.resolve(null),
    necesitaProcesada ? blobADataUrl(registro.fotoProcesadaBlob as Blob) : Promise.resolve(null),
  ]);
  return {
    ...registro,
    acta: {
      ...acta,
      ...(fotoOriginal ? { fotoOriginal } : {}),
      ...(fotoProcesada ? { fotoProcesada } : {}),
    },
  };
}

export async function guardarRegistro(registro: RegistroMasiva): Promise<void> {
  const db = await abrirCola();
  const store = transaccion(db, "readwrite");
  store.put(compactarRegistro(registro));
  const tx = store.transaction;
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB_GUARDAR"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB_GUARDAR_ABORTADA"));
  });
}

export async function leerRegistro(id: string): Promise<RegistroMasiva> {
  const db = await abrirCola();
  const store = transaccion(db, "readonly");
  const registro = await pedir<RegistroMasiva | undefined>(
    store.get(id),
    "IDB_LEER",
  );
  if (!registro) throw new Error("REGISTRO_FUERA_DE_LA_COLA");
  return materializarFotos(registro);
}

/** Listar SIN materializar todo de golpe: cursor uno-a-uno — cada registro
 *  (Blob + acta con dataURLs) vive un instante y se libera al mapearlo a
 *  fila liviana (lección L7).
 *  FIX (auditoría 2-c C6): el listado anterior acumulaba TODOS los
 *  registros completos (acta con fotoOriginal+fotoProcesada como dataURLs,
 *  ~7-14 MB c/u) antes de retornar → en una jornada real (100+ actas) el
 *  pico superaba 1 GB y mataba la pestaña. Ahora el MAPPER corre dentro
 *  del cursor: el registro se suelta en cuanto se transforma; devolver
 *  null lo salta sin retenerlo. Recorrer con mapper que devuelve el
 *  registro completo sigue siendo posible, pero cada caller ahora decide
 *  QUÉ retiene (y solo retiene lo liviano). */
export async function listarMapeados<T>(
  mapper: (registro: RegistroMasiva) => T | null,
): Promise<T[]> {
  const db = await abrirCola();
  const store = transaccion(db, "readonly");
  const req = store.openCursor();
  const salida: T[] = [];
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      const mapeado = mapper(cursor.value as RegistroMasiva);
      if (mapeado !== null) salida.push(mapeado);
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("IDB_LISTAR"));
  });
  return salida;
}

/** Conteo SIN leer un solo registro (IDB count nativo) — para checks de
 *  «¿la cola está vacía?» (ResumenView) sin tocar los Blobs. */
export async function contarRegistros(): Promise<number> {
  const db = await abrirCola();
  const store = transaccion(db, "readonly");
  return pedir<number>(store.count(), "IDB_CONTAR");
}

export async function borrar(id: string): Promise<void> {
  const db = await abrirCola();
  const store = transaccion(db, "readwrite");
  store.delete(id);
  const tx = store.transaction;
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB_BORRAR"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB_BORRAR_ABORTADA"));
  });
}

export async function vaciar(): Promise<void> {
  const db = await abrirCola();
  const store = transaccion(db, "readwrite");
  store.clear();
  const tx = store.transaction;
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB_VACIAR"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB_VACIAR_ABORTADA"));
  });
}

/** Recuperación de caída (kit §3): TODO estado PROCESANDO vuelve a
 *  PENDIENTE — una app que murió a mitad de OCR no debe dejar entradas
 *  zombis. Se llama en el arranque de MASIVA (T4, cargarFilas).
 *  FIX C6: el cursor solo RETIENE los zombis (mapper null para el resto) —
 *  el historial completo jamás se materializa. */
export async function recuperarCola(): Promise<void> {
  const zombis = await listarMapeados((r) =>
    r.estado === "PROCESANDO" ? r : null,
  );
  for (const r of zombis) {
    await guardarRegistro({ ...r, estado: "PENDIENTE" });
  }
}
