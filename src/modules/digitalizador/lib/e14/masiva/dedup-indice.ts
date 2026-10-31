"use client";

/**
 * R8 — SPLIT del store (etapa 2, misión punto 4): ÍNDICE DEL HISTÓRICO DE
 * ENVIADAS en módulo propio (el store.ts tenía 6 roles mezclados — este es
 * el rol «ledger/índice»). Módulo movido byte a byte de store.ts: sin
 * import del mini-store (el índice vive en RAM + DB del histórico, ajeno al
 * estado de la bandeja) — parte del grafo acíclico store-api/dedup-*.
 *
 * CONTENIDO: cache del índice fusionado (cola viva + ledger persistente),
 * el ÚNICO punto de crecimiento del ledger (registrarEnviadaHistorico) y el
 * lookup por payload (enviadaPorPayload — hit ⇒ YA-ENVIADA por construcción
 * del índice). El kill switch del modo pruebas (COLA_PERSISTENTE) vive aquí
 * porque la decisión de alimentarse del ledger es DE ESTE módulo (e64p C-3).
 */
import {
  actualizarIndicePayload,
  borrarHistorico,
  indiceEnviadasPorPayload,
  listarHistorico,
  registrarEntradaHistorico,
  type EntradaHistorica,
} from "./historico";
import { listarMapeados, vaciar as vaciarCola } from "./cola";
import { resetearPayloadsSesion } from "./dedup-payloads";
import { leerFlags } from "../flags";

// ─── e64p — KIT e64p-modo-pruebas-memoria-v1 (C-1/C-3): MODO PRUEBAS ───────
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
//    mapa de payload (dedup-payloads) + ledger + índice → limpiar el MISMO
//    lote procesa completo de cero.
//  · C-3 — el LEDGER de enviadas NO alimenta el índice del histórico (los
//    Maps de dedup no se alimentan de NADA persistido); la dedup DENTRO del
//    lote/sesión queda INTACTA (la gracia — gemelas atrapadas en vivo).
// Con TRUE (producción): byte a byte el comportamiento de siempre —
// restauración tras recarga/crash + dedup inter-lote + ledger e65b que
// sobrevive vaciar() (D-e65b-1). Cero código borrado — solo ciclo de vida.
/** e64p (C-1/C-2 — MODO PRUEBAS). Desde cola-persistente-v1: kill switch del
 *  dueño — el override `colaPersistente: false` (e14-flags-overrides) activa
 *  el modo pruebas (auto-borrado al cargar). Default TRUE: la masiva SOLO se
 *  elimina con vaciar() del dueño — petición literal 2026-10-24.
 *  R8b — DESCONEXIÓN COMPLETA: constante PRIVADA del ledger — los gestos de
 *  ciclo de vida de abajo son la ÚNICA puerta (el store JAMÁS brancha sobre
 *  el flag; cero imports de este kill switch fuera de este módulo). */
const COLA_PERSISTENTE = leerFlags().colaPersistente ?? true;

// ─── R8b — DESCONEXIÓN COMPLETA del kill switch (misión punto 2) ────────────
// El ciclo de vida del MODO PRUEBAS (e64p C-1/C-2/C-3) se decide AQUÍ y SOLO
// aquí: el store consume los TRES gestos de abajo (sesión / vaciar / índice
// por payload) y no conoce el flag. Comportamiento byte a byte del bloque
// que vivía disperso en store.ts — misma higiene, mismo orden, mismos catch.

/** e64p (C-1 — MODO PRUEBAS): preparación de sesión en cargarFilas().
 *  false = producción (el caller sigue con la restauración de siempre).
 *  true = la cola arranca VACÍA — cero restauración (sin filas fantasma ni
 *  Maps reconstruidos) + higiene de la persistencia vieja (cola IDB + ledger
 *  del histórico) + memoria de dedup de la sesión en cero, para que la
 *  pasada siguiente sea de cero (QA doble pasada del kit). */
export async function prepararSesionModoPruebas(): Promise<boolean> {
  if (COLA_PERSISTENTE) return false;
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
  resetearPayloadsSesion(); // e64p C-1 — el mapa de payload de la sesión muere aquí
  resetearIndiceEnviadas();
  return true;
}

/** e64p (C-2 — MODO PRUEBAS) dentro de vaciar(): el ciclo de vida COMPLETO
 *  de la memoria de dedup muere aquí (reversa declarada del RL-e65b-5 SOLO
 *  en modo pruebas): mapa de payload de la sesión (hoy sobrevivía a vaciar
 *  en la misma sesión) + ledger del histórico → limpiar y re-subir el MISMO
 *  lote procesa completo de cero (QA del kit). En producción (true) no-op
 *  byte a byte: D-e65b-1 intacta — VACIAR respeta el ledger (RL-e65b-5). */
export async function higieneModoPruebasVaciar(): Promise<void> {
  if (COLA_PERSISTENTE) return;
  resetearPayloadsSesion();
  try {
    await borrarHistorico();
  } catch {
    /* conservador — el índice ya no lo verá en esta sesión */
  }
}

/** e73 §C + e64p C-3 — hit del LEDGER por payload EXACTO (el índice por
 *  payload del sondeo) con la decisión COLA_PERSISTENTE AQUÍ. null = sin hit
 *  (modo pruebas: el ledger NO alimenta los Maps de dedup ni el índice por
 *  payload — cero memoria ENTRE lotes · payload vacío · índice caído —
 *  conservador RL-e65b-3: el caller sigue a dhash como hoy). */
export async function enviadaLedgerPorPayload(
  payload: string,
): Promise<EntradaHistorica | null> {
  if (!payload || !COLA_PERSISTENTE) return null; // e64p C-3
  try {
    return (await indiceEnviadasPorPayload(true)).get(payload) ?? null;
  } catch {
    return null; // índice caído → conservador (RL-e65b-3)
  }
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

export async function indiceEnviadasDe(): Promise<EntradaHistorica[]> {
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

/** R8 — ciclo de vida del cache (modo pruebas C-1/C-2 + reiniciarEnvios):
 *  el índice se reconstruye (cola + ledger) en el próximo uso. */
export function resetearIndiceEnviadas(): void {
  indiceEnviadas = null;
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
export async function enviadaPorPayload(
  payload: string,
): Promise<EntradaHistorica | null> {
  if (!payload) return null;
  try {
    return (await indiceEnviadasDe()).find((h) => h.payloadQr === payload) ?? null;
  } catch {
    return null;
  }
}
