/**
 * Capa shared (R2) — formateadores de tiempo/fecha/duración (es-CO).
 *
 * Home único de los duplicados detectados en reporte 04 §B2 #9 y §B5 (2).
 * COPIAS VERBATIM de sus fuentes (patrón «mover sin cambiar» — doctrina
 * qr-pixeles/DICTAMEN-e73 §3.1); el test de paridad compara cada una contra
 * una copia de referencia incrustada de su sitio original:
 *
 * · tiempoRelativo — supervision/components/tiempo.ts:6-14 (kit SUP-3 T5/T6).
 * · fmtMs — digitalizador/components/e14/screens/InformeCorrida.tsx:71-78
 *   (KIT e14-tiempos-v2). Adopción pendiente (archivo de otro agente).
 * · fmtDuracion — perfil-dispositivo/components/panel-perfil.tsx:202-209.
 *   Adopción pendiente (archivo de otro agente).
 * · hhmm — patrón "HH:MM" con padStart ×3: InformeCorrida.tsx:82-84,
 *   supervision/data/mock-repository.ts:608-611, actas-mock.ts:361-366.
 *   Adopción pendiente.
 *
 * Diferencia SEMÁNTICA documentada entre las duraciones (NO se unifica v1 —
 * cambiar el texto visible rompe snapshots/QA visual):
 * · fmtMs: ms/s/m s con decimales ("—", "940 ms", "3.5 s", "2 m 5 s").
 * · fmtDuracion: granularidad min/h/d ("45 min", "3 h", "2 d").
 * · tiempoRelativo: relativo con prefijo "Hace …".
 * Cero dependencias. Jamás lanzan (entradas null-safe donde la fuente lo es).
 */

/** Timestamp relativo (kit SUP-3 T5/T6): "Hace instantes" (< 1 min),
 *  "Hace N min" (< 60), "Hace Nh" (< 24 h), "Hace Nd" (resto).
 *  Determinista respecto a `ahora`. COPIA verbatim de
 *  supervision/components/tiempo.ts:6-14. */
export function tiempoRelativo(fecha: number, ahora = Date.now()): string {
  const minutos = Math.floor((ahora - fecha) / 60_000);
  if (minutos < 1) return "Hace instantes";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Hace ${dias} d`;
}

/** Duración ms → texto del informe de corrida: "—" si null/undefined,
 *  "< 1000" → "N ms", "< 60 s" → "N.N s", resto → "N m N s". COPIA verbatim
 *  de InformeCorrida.tsx:71-78 (fmtMs). */
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} m ${Math.round(s - m * 60)} s`;
}

/** Duración humana min → h → d para el estado del castigo v5. COPIA
 *  verbatim de panel-perfil.tsx:202-209 (fmtDuracion). */
export function fmtDuracion(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Hora local "HH:MM" (padStart 2) — el patrón ×3 del §B2 #9:
 *  InformeCorrida.tsx:82-84 · mock-repository.ts:608-611 · actas-mock.ts:361-366.
 *  Implementación canónica con String() (idéntica salida a las 3 copias). */
export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
