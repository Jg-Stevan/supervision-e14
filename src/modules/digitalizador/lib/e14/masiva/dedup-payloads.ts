"use client";

/**
 * R8 — SPLIT del store (etapa 2, punto 5 de la misión): el MAPA DE PAYLOAD
 * QR consolidado en un módulo propio con su ciclo de vida documentado.
 *
 * UN SOLO MAPA (antes convivían dos — mapaQrPayload de sesión en store.ts y
 * mapaSondeoPayload local a cada cadenaDedup): `mapaPayload` es la memoria
 * de la SESIÓN del lote — payload EXACTO → id de la fila original del lote.
 * ESCRITORES (primer ganador gana; el carrier vivo del payload manda):
 *  · sondeo QR de la ingesta (cadenaDedup — worker e73, §B.2),
 *  · capa-0 del runner (e63m — registro mutexado con re-chequeo),
 *  · pre-scan de «PROCESAR COLA» (e107 — registrarQrPayload).
 * LECTOR: las mismas 3 puertas dedup por payload + prescan.
 *
 * CICLO DE VIDA (sesión, kit §5 — decisión deliberada: NO se persiste en
 * IDB ni se reconstruye al recargar; el lote es la unidad de dedup hoy):
 *  · muere con la página (RAM); con COLA_PERSISTENTE=false se limpia en
 *    cargarFilas/vaciar/reiniciarEnvios (modo pruebas e64p C-1/C-2);
 *  · en producción SOBRE-VIVE a vaciar() (comportamiento histórico de
 *    mapaQrPayload — el dueño ya contaba con dedup de sesión tras vaciar);
 *  · llave OPACA: la única comparación es la IGUALDAD EXACTA del payload
 *    completo (jamás prefijos — RED LINE 10); sin umbrales, sin fuzzy
 *    (RED LINE 5). La llave nunca viaja al informe parseada (export-only).
 */
const mapaPayload = new Map<string, string>();

/** Registra el payload de UNA fila como original de la sesión. Solo se llama
 *  cuando el payload es NUEVO en el mapa o su entrada apuntaba a una fila
 *  ya muerta (re-apuntado honesto — el carrier vivo del payload manda).
 *  El runner lo llama DENTRO del mutex (re-chequeo e71 Opt-3). */
export function registrarQrPayload(payload: string, id: string): void {
  mapaPayload.set(payload, id);
}

/** id de la fila ORIGINAL de este payload (null = payload nuevo en la sesión). */
export function originalQrDePayload(payload: string): string | null {
  return mapaPayload.get(payload) ?? null;
}

/** ¿Ya hay original para este payload? (atómico en JS: check+set sin await
 *  entre medio). Primer ganador gana — NO pisa una entrada existente. */
export function registrarPayloadSiNueva(payload: string, id: string): boolean {
  if (mapaPayload.has(payload)) return false;
  mapaPayload.set(payload, id);
  return true;
}

/** Limpieza del ciclo de vida (modo pruebas e64p C-1/C-2 + reiniciarEnvios). */
export function resetearPayloadsSesion(): void {
  mapaPayload.clear();
}
