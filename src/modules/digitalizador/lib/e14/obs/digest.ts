/**
 * KIT e14-observabilidad-v1 (A1-C1) — digests de errores: el agrupamiento
 * que convierte una avalancha de eventos en una lista legible.
 *
 * · digestDe(mensaje, tipo, stack) — FNV-1a 8 hex sobre la TRIPLETA
 *   normalizada: tipo + mensaje con números/UUIDs/hex abstractos + primer
 *   frame del stack dentro de src/. Dos ocurrencias del MISMO fallo con
 *   datos distintos (ids, ms, UUIDs) → el MISMO digest.
 * · agregarErrores(eventos) — agrupa error+warn por digest, ordena por
 *   (veces desc, ultima desc) y aporta breadcrumbsRecientes del evento MÁS
 *   RECIENTE (el contexto vivo, no el del primer fallo).
 *
 * Módulo PURO (sin DOM): 100% testeable en node (obs.test.ts).
 */
import { fnv1a8 } from "./identidad";
import type { ErroresAgrupados, ErrorEvento, EventoObs } from "./tipos";

/** UUIDs PRIMERO (contienen hex y dígitos — si van después, el mensaje ya
 *  quedó masticado y dos UUIDs distintos darían tokens distintos). */
const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Hex ≥ 8 (ids de chunk, hashes, digests anidados) → *hash*. */
const RE_HEX = /\b[0-9a-f]{8,}\b/gi;
/** Números → *norm* (ms, contadores, DIP, mesas…). */
const RE_NUM = /\d+/g;

/** Normalizar un mensaje: la MISMA causa con datos distintos → mismo string. */
export function normalizarMensaje(s: string): string {
  return s
    .replace(RE_UUID, "*uuid*")
    .replace(RE_HEX, "*hash*")
    .replace(RE_NUM, "*norm*");
}

/** Primer frame del stack que apunte a src/ (patrón `src/…:LÍNEA:COLUMNA`).
 *  null honesto si el stack no trae ninguno (build minificado sin mapas,
 *  error cross-origin, stack vacío — jamás inventar). Compartido con
 *  captura.ts (campo `archivo` de ErrorEvento) y buffer (agrupación). */
export function archivoDeStack(stack: string): string | null {
  if (!stack) return null;
  const m = /src\/[^\s():]+:\d+:\d+/.exec(stack);
  return m ? m[0] : null;
}

/** Digest estable del fallo: tipo + mensaje normalizado + frame src/.
 *  El frame participa para separar dos fallos con el MISMO mensaje lanzado
 *  desde lugares distintos (regresiones distintas, grupos distintos). */
export function digestDe(mensaje: string, tipo: string, stack: string): string {
  const frame = archivoDeStack(stack) ?? "sin-frame-src";
  return fnv1a8(`${tipo}|${normalizarMensaje(mensaje)}|${frame}`);
}

/** Agrupar eventos error/warn por digest (contrato §4.3). Orden de salida:
 *  veces DESC, luego ultima DESC (lo que más duele y lo más fresco arriba).
 *  · severidad — la del evento MÁS RECIENTE del grupo (estado actual).
 *  · breadcrumbsRecientes — del evento más reciente (contexto vivo).
 *  · versiones — set de appVersion presentes (¿regresión de un upgrade?). */
export function agregarErrores(eventos: EventoObs[]): ErroresAgrupados[] {
  const porDigest = new Map<string, EventoObs[]>();
  for (const e of eventos) {
    if (e.tipo !== "error" && e.tipo !== "warn") continue;
    const datos = e.datos as Partial<ErrorEvento>;
    if (!datos || typeof datos.digest !== "string" || !datos.digest) continue;
    const lista = porDigest.get(datos.digest);
    if (lista) lista.push(e);
    else porDigest.set(datos.digest, [e]);
  }
  const grupos: ErroresAgrupados[] = [];
  for (const [digest, lista] of porDigest) {
    const cronologico = [...lista].sort((a, b) => a.ts - b.ts);
    const ultimo = cronologico[cronologico.length - 1];
    const datos = ultimo.datos as Partial<ErrorEvento>;
    grupos.push({
      digest,
      severidad: ultimo.tipo === "error" ? "error" : "warn",
      tipo: typeof datos.tipo === "string" ? datos.tipo : "",
      mensaje: typeof datos.mensaje === "string" ? datos.mensaje : "",
      archivo: typeof datos.archivo === "string" ? datos.archivo : null,
      veces: lista.length,
      primera: cronologico[0].ts,
      ultima: ultimo.ts,
      versiones: [...new Set(cronologico.map((e) => e.appVersion))],
      breadcrumbsRecientes: Array.isArray(datos.breadcrumbs) ? datos.breadcrumbs : [],
    });
  }
  grupos.sort((a, b) => b.veces - a.veces || b.ultima - a.ultima);
  return grupos;
}
