/**
 * Timestamp relativo para las vistas del módulo (kit SUP-3 T5/T6):
 * "Hace instantes" (< 1 min), "Hace N min" (< 60), "Hace Nh" (< 24 h),
 * "Hace Nd" (resto). Determinista respecto a Date.now().
 */
export function tiempoRelativo(fecha: number, ahora = Date.now()): string {
  const minutos = Math.floor((ahora - fecha) / 60_000);
  if (minutos < 1) return "Hace instantes";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Hace ${dias} d`;
}
