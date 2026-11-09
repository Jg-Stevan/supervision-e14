/**
 * HUB LOCAL — el lado RECEPTOR del flujo E2E celular → computador.
 *
 * `digielect14` (el digitalizador móvil) manda sus actas ENVIADAS a un hub con
 * `POST {hub}/actas` (contrato en su `src/lib/e14/puente/tipos.ts`). En
 * producción ese hub es un Worker externo; para reproducir el flujo completo en
 * una sola máquina, `scripts/hub-local.mjs` lo reemplaza y atiende
 * `GET /actas?desde=<epoch ms>` en el MISMO origen que sirve este panel.
 *
 * Por qué same-origin y no una URL configurable:
 *   · el CSP del panel fija `connect-src 'self' …` (`src/app/layout.tsx:41`) —
 *     un hub en otro origen obligaría a relajarlo;
 *   · es el mismo criterio SEC-10 que ya rige `endpointReportes` y
 *     `ocrNativoUrl` en `shared/e14/flags-schema.ts`: un string arbitrario
 *     configurable sería un canal de exfiltración de recortes de actas.
 *   Por eso NO hay flag de URL: la ruta es constante y relativa al origen.
 *
 * El embudo de publicación NO se duplica: cada entrada que llega del hub pasa
 * por `publicarActaMasiva()` — la misma función del lote local, con la misma
 * validación D25, el mismo join D22 y el mismo log de recepción (aquí con
 * origen `puente-local`, para que el feed distinga «del celular por la red» de
 * «de la bandeja de este computador»).
 *
 * INTERRUPTOR: el dueño lo prende desde la tarjeta HUB LOCAL de la vista
 * Recepción (persistido en `localStorage["e14-hub-local"]`). Arrancar el panel
 * con el hub apagado es el default: en GitHub Pages no hay hub, y un sondeo
 * fallando cada 4 s contra una 404 sería ruido. Tras 5 fallos seguidos el
 * sondeo se autodetiene (mismo criterio del puente del móvil).
 */

import { publicarActaMasiva } from "./actas-runtime";
import type { EntradaActaMasiva } from "./actas-runtime";
import type { FormularioTipo, ImpresionActa } from "../domain/acta";
// 0.2/H-2 — token de lectura: el GET del hub dejó de ser anónimo. Con
// origen NO local (hub remoto del puente) el sondeo viaja autenticado;
// con origen local (hub-local.mjs, LAN) NO se manda auth — mismo criterio
// `esOrigenLocal` del hermano (ver lib/token-lectura.ts).
import { headersDeLectura } from "../lib/token-lectura";

/** Tope del contrato del hub. */
const RUTA_HUB = "/actas";
const CADA_MS = 4_000;
const FALLOS_KILL_LOCAL = 5;
const CLAVE_ACTIVO = "e14-hub-local";
const CLAVE_CURSOR = "e14-hub-curso";

interface ActaHub {
  seq: number;
  ts: number;
  dispositivo: string;
  idEnlace: string;
  mesa: string;
  formulario: FormularioTipo;
  paginaIndex: number;
  paginaTotal: number;
  impresion: ImpresionActa;
  nombreArchivo: string;
  score: number;
  statusActa: string;
  /** Ruta raíz del hub para la foto almacenada; null = llegó sin foto. */
  fotoUrl: string | null;
}

export interface EstadoHubLocal {
  activo: boolean;
  /** Actas traídas del hub y publicadas/bloqueadas en esta sesión. */
  procesadas: number;
  publicas: number;
  bloqueadas: number;
  /** Filas que el hub ya tiene (cursor del sondeo anterior). */
  enHub: number;
  ultimaSyncTs: number | null;
  ultimoError: string | null;
  /** Autodetenido por fallos consecutivos (se reactiva al prender de nuevo). */
  detenido: boolean;
}

const estado: EstadoHubLocal = {
  activo: false,
  procesadas: 0,
  publicas: 0,
  bloqueadas: 0,
  enHub: 0,
  ultimaSyncTs: null,
  ultimoError: null,
  detenido: false,
};

type Oyente = () => void;
const oyentes = new Set<Oyente>();

/** fetch inyectable (pruebas sin red — mismo patrón del puente del móvil). */
type FetchComo = (input: string, init?: RequestInit) => Promise<Response>;

let temporizador: ReturnType<typeof setInterval> | null = null;
let enCurso = false;
let fallosSeguidos = 0;

export function estadoHubLocal(): EstadoHubLocal {
  return { ...estado };
}

export function suscribirseHubLocal(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function notificar() {
  for (const o of oyentes) {
    try {
      o();
    } catch {
      /* un oyente roto no corta el feed */
    }
  }
}

function leerNumero(clave: string): number {
  try {
    const v = Number(window.localStorage.getItem(clave) ?? "0");
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function escribirNumero(clave: string, valor: number) {
  try {
    window.localStorage.setItem(clave, String(valor));
  } catch {
    /* modo privado: el cursor vive solo en memoria */
  }
}

/** `origen` es la raíz del panel (`/supervision/`) — el hub vive en la raíz
 *  del servidor, así que se ancla al origen, nunca al path relativo. */
function urlHub(desde: number): string {
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  return `${origen}${RUTA_HUB}?desde=${desde}`;
}

async function traerActas(
  desde: number,
  fetchComo: FetchComo
): Promise<{ actas: ActaHub[]; ahora: number; total: number }> {
  // 0.2/H-2 — el sondeo viaja con el header de lectura SOLO si el origen
  // del hub no es local (LAN same-origin → {} — hub-local.mjs no pide
  // auth; el modo local no se toca).
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetchComo(urlHub(desde), {
    headers: { accept: "application/json", ...headersDeLectura(origen) },
  });
  // 401 NUNCA es fallo mudo (H-2): el hub autenticado rechazó el sondeo
  // sin credenciales → mensaje ACCIONABLE (la tarjeta del hub lo muestra
  // y apunta a Configuración); el genérico `HTTP <status>` queda para el
  // resto de errores.
  if (res.status === 401) {
    throw new Error(
      "HTTP 401 — sin token de lectura: configúralo en Configuración (vista Configuración → Token de lectura del hub)"
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cuerpo = (await res.json()) as { ok?: boolean; ahora?: number; total?: number; actas?: ActaHub[] };
  if (!cuerpo?.ok) throw new Error("respuesta sin ok");
  return { actas: Array.isArray(cuerpo.actas) ? cuerpo.actas : [], ahora: cuerpo.ahora ?? Date.now(), total: cuerpo.total ?? 0 };
}

/** Una fila del hub → el sobre que consume el embudo de publicación. La foto
 *  NO viaja como dataURL en el sondeo (serían megas cada 4 s): se pasa la URL
 *  del hub, que el visor resuelve como cualquier otra imagen same-origin.
 *
 *  NOTA 0.2 (auth de la foto): `fotoUrl` es `/foto/<seq>` RELATIVA — solo
 *  existe en el hub local (same-origin/LAN, que no pide auth, coherente
 *  con hub-local.mjs) y se resuelve contra el origen del panel. Un
 *  `Authorization` no puede viajar en un `<img>`; si el hub remoto llegara
 *  a servir /foto, el panel tendría que traerla por fetch autenticado
 *  (headersDeLectura) y convertirla a blob URL — hoy no hay tal ruta. */
function entradaDesdeHub(a: ActaHub): EntradaActaMasiva {
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  return {
    idEnlace: a.idEnlace,
    mesa: a.mesa,
    formulario: a.formulario,
    paginaIndex: a.paginaIndex,
    paginaTotal: a.paginaTotal,
    srcFoto: a.fotoUrl ? `${origen}${a.fotoUrl}` : null,
    impresion: a.impresion,
    nombreArchivo: a.nombreArchivo,
    score: a.score,
    statusActa: a.statusActa,
  };
}

/**
 * Un ciclo de sondeo: trae lo nuevo desde el cursor, publica cada página por el
 * embudo de siempre y AVANZA el cursor solo si el ciclo terminó (si algo
 * revienta a mitad, la siguiente pasada re-intenta esas filas — publicar es
 * idempotente porque el merge es por clave `${idEnlace}::${mesa}`).
 */
export async function sincronizarHubLocal(
  fetchComo: FetchComo = (input, init) => fetch(input, init)
): Promise<{ publicas: number; bloqueadas: number; error: string | null }> {
  if (enCurso) return { publicas: 0, bloqueadas: 0, error: null };
  enCurso = true;
  try {
    const cursor = leerNumero(CLAVE_CURSOR);
    const { actas, ahora, total } = await traerActas(cursor, fetchComo);
    let publicas = 0;
    let bloqueadas = 0;
    for (const a of actas) {
      const r = await publicarActaMasiva(entradaDesdeHub(a), "puente-local");
      if (r.ok) publicas++;
      else bloqueadas++;
    }
    escribirNumero(CLAVE_CURSOR, Math.max(ahora, cursor));
    estado.procesadas += publicas + bloqueadas;
    estado.publicas += publicas;
    estado.bloqueadas += bloqueadas;
    estado.enHub = total;
    estado.ultimaSyncTs = Date.now();
    estado.ultimoError = null;
    fallosSeguidos = 0;
    notificar();
    return { publicas, bloqueadas, error: null };
  } catch (e) {
    estado.ultimoError = e instanceof Error ? e.message : "fallo de red";
    fallosSeguidos += 1;
    if (fallosSeguidos >= FALLOS_KILL_LOCAL) {
      estado.detenido = true;
      detener();
    }
    notificar();
    return { publicas: 0, bloqueadas: 0, error: estado.ultimoError };
  } finally {
    enCurso = false;
  }
}

function detener() {
  if (temporizador !== null) {
    clearInterval(temporizador);
    temporizador = null;
  }
}

function arrancar() {
  detener();
  temporizador = setInterval(() => {
    void sincronizarHubLocal();
  }, CADA_MS);
}

/** Prende/apaga el sondeo (persistido — sobrevive al recargo). */
export function alternarHubLocal(): boolean {
  estado.activo = !estado.activo;
  try {
    window.localStorage.setItem(CLAVE_ACTIVO, estado.activo ? "on" : "off");
  } catch {
    /* sin localStorage: solo esta sesión */
  }
  if (estado.activo) {
    estado.detenido = false;
    fallosSeguidos = 0;
    void sincronizarHubLocal();
    arrancar();
  } else {
    detener();
  }
  notificar();
  return estado.activo;
}

/** Estado inicial al montar: respeta lo que dejó el dueño, y si venía prendido
 *  pero el hub no responde, la tarjeta lo muestra (no se calla). */
export function iniciarHubLocal(): void {
  let guardado = "off";
  try {
    guardado = window.localStorage.getItem(CLAVE_ACTIVO) ?? "off";
  } catch {
    return;
  }
  if (guardado !== "on") return;
  estado.activo = true;
  estado.detenido = false;
  fallosSeguidos = 0;
  void sincronizarHubLocal();
  arrancar();
}

/** Solo pruebas: deja el módulo como si nunca hubiera corrido. */
export function reiniciarHubLocalParaPrueba() {
  detener();
  Object.assign(estado, {
    activo: false,
    procesadas: 0,
    publicas: 0,
    bloqueadas: 0,
    enHub: 0,
    ultimaSyncTs: null,
    ultimoError: null,
    detenido: false,
  });
  fallosSeguidos = 0;
}
