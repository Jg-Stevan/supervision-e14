/**
 * R1.2 — KIT qr-cache-negativa-v1: CACHÉ NEGATIVA de la CAPA 0 QR.
 *
 * PROBLEMA (informe 2026-10-30-14-34-59): las actas SIN QR pagan el ladder
 * completo de la capa 0 (worker jsQR + fallback zxing — 6-30 s por fila)
 * EN CADA corrida: 3 actas × 2 corridas ≈ 110 s de CPU que no producen
 * nada (la identidad la resuelve el OCR + capa 2). Hoy, cuando la cadena
 * termina en `payload=null`, el resultado SE OLVIDA.
 *
 * DISEÑO:
 * · Llave = SHA-256 de los BYTES del archivo (fila.hashBytes / registro.
 *   hashBytes — e65, ya se calcula en la ingesta). Contenido distinto →
 *   llave distinto → sin caché. JAMÁS por nombre/fecha (kit T2.4).
 * · Hecho recordado: «la cadena COMPLETA de capa 0 corrió sobre estos
 *   bytes y terminó null SIN presupuesto vencido». Solo el runner la
 *   escribe (punto ÚNICO); el sondeo/prescan (parciales, presupuestados)
 *   JAMÁS escriben aquí.
 * · Lectura: la capa 0 del runner consulta ANTES del ladder — hit ⇒ 2-3 ms
 *   (misma economía de la herencia qrPrevio positiva, D30).
 * · Invalidación honesta: si una pasada posterior LEE un payload para la
 *   misma llave (p. ej. el dueño forzó reproceso), la entrada muere
 *   (cacheNegativaQuitar — el hecho cambió).
 * · MEMORIA de SESIÓN (Map en RAM, tope 500 FIFO) + traza persistente en
 *   el registro (`qrSinPayload` — sobrevive la recarga vía filaDeRegistro).
 *   El re-encolado del MISMO archivo en la MISMA sesión (nueva fila, mismos
 *   bytes, hashBytes estampado por cadenaDedup) cae en el Map.
 *
 * ESCAPES SAGRADOS:
 * · forzarDedupOff (PROCESAR IGUAL del dueño) JAMÁS consulta ni escribe —
 *   el runner lo garantiza (RL-e65b-6).
 * · flag `qrCacheNegativa` (default true) — kill-switch del dueño; false =
 *   byte-idéntico a hoy (el Map deja de consultarse y de escribirse).
 *
 * Pura (sin DOM, sin IDB propia), jamás lanza — la caché jamás tumba el
 * pipeline (doctrina del conservador).
 */

/** Tope de entradas vivas (FIFO por inserción — un lote grande cabe sobrado;
 *  el Map vive solo mientras la pestaña). */
const TOPE_ENTRADAS = 500;

/** sha256 hex → ts de registro. Map conserva orden de inserción (spec). */
const entradas = new Map<string, number>();

/** ¿Estos bytes ya terminaron la cadena completa de capa 0 sin payload? */
export function cacheNegativaTiene(hashBytes: string): boolean {
  try {
    return entradas.has(hashBytes);
  } catch {
    return false;
  }
}

/** Registrar «estos bytes NO rinden QR» (cadena completa terminó null). */
export function cacheNegativaRegistrar(hashBytes: string): void {
  try {
    // Re-inserción = refresh (delete+set — el orden de inserción manda).
    entradas.delete(hashBytes);
    if (entradas.size >= TOPE_ENTRADAS) {
      const masVieja = entradas.keys().next().value;
      if (masVieja != null) entradas.delete(masVieja);
    }
    entradas.set(hashBytes, Date.now());
  } catch {
    /* jamás lanza — sin caché el pipeline sigue igual */
  }
}

/** El hecho cambió: estos bytes SÍ rindieron payload en una pasada posterior
 *  (reproceso forzado) — la entrada muere (honestidad de la caché). */
export function cacheNegativaQuitar(hashBytes: string): void {
  try {
    entradas.delete(hashBytes);
  } catch {
    /* jamás lanza */
  }
}

/** Tamaño vivo (telemetría/qa — jamás el contenido: las llaves son hashes). */
export function cacheNegativaTamanio(): number {
  return entradas.size;
}

/** Prueba interna (tests): vacía el Map. */
export function __resetCacheNegativaParaTest(): void {
  entradas.clear();
}
