/**
 * KIT e14-ocr-escalonado-v1 (§2.3-§2.4) — decisión del OCR ESCALONADO.
 *
 * Contexto (§0 del kit): el OCR medio mide 17.3 s (68% del total 25.3 s) y el
 * det a 1920 es ~19-21% del OCR real. El banco `tools/bench-det1280/`
 * (PR Agente 3) dio GO: det a 1280 → −56% del det, 120/120 votos, 0 cajas
 * perdidas, FUERTE idénticas. Este kit ACTIVA esa palanca en producción con
 * red de seguridad: 1.ª pasada con det cap 1280 (~0.44× del tiempo de det);
 * si la lectura sale débil → re-OCR completo a 1920 y quedarse con el MEJOR.
 * Las actas buenas (mayoría estimada) pagan solo la 1.ª pasada: ahorro
 * esperado ~10-12% del OCR. El gate JAMÁS ve un texto degradado si el 1920
 * lo salva (escudo «el mejor manda» — §3 del kit).
 *
 * PURO (sin DOM, sin OCR) — testeable headless con bun (misma convención de
 * senal-lectura.ts §6.2). CONSUME senal-lectura.ts (solo leer — zona de otro
 * kit, congelada): ANCLAS_LECTURA y senalDeLectura son los instrumentos
 * compartidos del «el OCR manda» (score-lectura v2, D45).
 */

import { ANCLAS_LECTURA, senalDeLectura } from "./senal-lectura";

/** Una pasada de OCR — lo mínimo para decidir (§2.3) y elegir (§2.4). */
export interface PasadaOcr {
  texto: string;
  conf: number;
}

/** Nº de anclas de ANCLAS_LECTURA presentes en el texto — criterio de
 *  elección (§2.4) y valor de los tokens anclas1/anclas2 de la traza (§2.5). */
export function anclasDe(texto: string): number {
  return ANCLAS_LECTURA.filter(([, re]) => re.test(texto)).length;
}

/**
 * §2.3 — ¿la 1.ª pasada (1280) basta?
 *  · `senalDeLectura(T1)` FUERTE → NO (fin).
 *  · MEDIA con mesa leída + anclas ≥ 4 → NO (fin).
 *  · Cualquier otro caso (DEBIL, MEDIA floja, sin señal) → SÍ reintenta.
 *
 * La 2.ª condición es redundante con FUERTE por definición de
 * senalDeLectura (mesa + 4 anclas YA es FUERTE) — queda EXPRESA porque el kit
 * la lista literal (blindaje ante futuros cambios del nivel FUERTE). Sin
 * `parciales`: la decisión corre ANTES de clasificarCabecera y la mesa la
 * aporta el MISMO regex de senalDeLectura sobre el texto (misma fuente).
 */
export function necesitaSegunda(texto: string): boolean {
  if (senalDeLectura(texto).nivel === "FUERTE") return false;
  const mesaLeida = /MESA[::\s.]*\d+/i.test(texto);
  if (mesaLeida && anclasDe(texto) >= 4) return false;
  return true;
}

/**
 * §2.4 — elegir el MEJOR entre la 1.ª (1280) y la 2.ª (1920): primero nº de
 * anclas de ANCLAS_LECTURA, luego conf media. NUNCA automáticamente la 2.ª —
 * si el 1280 leyó igual o mejor, el ahorro se queda. Empate total → la 1.ª
 * (ya pagada; misma lectura). Genérico: el caller pasa las pasadas con sus
 * métricas (cap/det/rec) y recibe EL MISMO objeto ganador por referencia.
 */
export function elegirMejor<T extends PasadaOcr>(a: T, b: T): T {
  const anclasA = anclasDe(a.texto);
  const anclasB = anclasDe(b.texto);
  if (anclasA !== anclasB) return anclasA > anclasB ? a : b;
  if (a.conf !== b.conf) return a.conf > b.conf ? a : b;
  return a;
}
