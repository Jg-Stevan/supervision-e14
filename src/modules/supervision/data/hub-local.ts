/**
 * HUB LOCAL — el lado RECEPTOR del flujo E2E celular → computador.
 *
 * `digielect14` (el digitalizador móvil) manda sus actas ENVIADAS a un hub con
 * `POST {hub}/actas` (contrato en su `src/lib/e14/puente/tipos.ts`). En
 * producción ese hub es un Worker externo; para reproducir el flujo completo en
 * una sola máquina, `scripts/hub-local.mjs` lo reemplaza y atiende
 * `GET /actas?desde=<seq>` en el MISMO origen que sirve este panel.
 *
 * C-06 — el cursor es la SEQ de la última fila procesada (exclusivo), no epoch
 * ms: `GET /actas?desde=<seq>` responde
 * `{ ok, ahora, total, hay, proximoSeq, generacion, actas[] }`, donde
 * `hay: true` = quedan filas más allá de la página (truncada a MAX_PAGINA=500)
 * y `proximoSeq` = seq de la última fila de la página (o el `desde` entrante si
 * vino vacía). `sincronizarHubLocal` DRENA: mientras `hay === true` vuelve a
 * sondear INMEDIATAMENTE (cap de 50 iteraciones) — el cursor SOLO avanza a
 * `proximoSeq`, JAMÁS a `ahora`/`Date.now()` (avanzar al reloj del hub saltaría
 * filas publicadas durante el propio sondeo).
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

import { publicarActaMasiva, reiniciarIndicePaginas } from "./actas-runtime";
import type { EntradaActaMasiva } from "./actas-runtime";
import type { FormularioTipo, ImpresionActa } from "../domain/acta";
// 0.2/H-2 — token de lectura: el GET del hub dejó de ser anónimo. Con
// origen NO local (hub remoto del puente) el sondeo viaja autenticado;
// con origen local (hub-local.mjs, LAN) NO se manda auth — mismo criterio
// `esOrigenLocal` del hermano (ver lib/token-lectura.ts).
import { headersDeLectura } from "../lib/token-lectura";
// C-16 — la reconciliación tras un reset del hub purga el log de recepción.
import { purgarRecepciones } from "./recepcion-log";

/** Tope del contrato del hub. */
const RUTA_HUB = "/actas";
const RUTA_RESET = "/hub/reset";
const CADA_MS = 4_000;
const FALLOS_KILL_LOCAL = 5;
const CLAVE_ACTIVO = "e14-hub-local";
const CLAVE_CURSOR = "e14-hub-curso";
/** C-06 — por encima de esta escala el cursor guardado es LEGADO (epoch ms del
 *  contrato viejo): se resetea a 0 y el primer drenaje re-trae desde la seq 1.
 *  Las seq reales del hub local son contadas; un epoch ms hoy es ~1.7e12. */
const ESCALA_EPOCH_MS = 1_000_000_000;
/** C-06 — cap de seguridad del drenaje: si el hub insiste en `hay: true` más
 *  allá de esto, el panel corta y deja el resto para el próximo ciclo de 4 s
 *  (que continúa desde el cursor) — jamás colgar el render del supervisor. */
const TOPE_DRENAJE = 50;
/** C-16 — aviso persistente en el estado cuando la generación cambió. */
const AVISO_REINICIO = "El hub se reinició — recepción re-sincronizada";

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
  /** C-07 — epoch ms del gate del móvil (viaja dentro del sobre y el hub lo
   * devuelve tal cual). Ausente en actas viejas → ORIGEN «—». */
  tsEscaneo?: number;
  /** C-08 — SHA-256 (hex 64) de los BYTES de la foto: huella de contenido
   *  del anti-reproceso (un reenvío del mismo sobre la conserva). */
  hashSha256?: string;
}

export interface EstadoHubLocal {
  activo: boolean;
  /** Actas traídas del hub y publicadas/bloqueadas en esta sesión (los
   *  duplicados NO se reprocesan y no suman aquí). */
  procesadas: number;
  publicas: number;
  bloqueadas: number;
  /** Reenvíos del mismo contenido (misma página + misma huella SHA-256):
   *  detectados y NO republicados — el anti-reproceso de actas-runtime. */
  duplicadas: number;
  /** Filas que el hub ya tiene (cursor del sondeo anterior). */
  enHub: number;
  ultimaSyncTs: number | null;
  ultimoError: string | null;
  /** Autodetenido por fallos consecutivos (se reactiva al prender de nuevo). */
  detenido: boolean;
  /** C-24 — fallos consecutivos del sondeo (0..5; alimenta «N fallos seguidos»). */
  fallosSeguidos: number;
  /** C-16 — `generacion` vista del hub (null mientras no se haya visto una). */
  generacion: string | null;
  /** C-16 — aviso persistente si el hub se reinició (cambió la generación). */
  aviso: string | null;
}

const estado: EstadoHubLocal = {
  activo: false,
  procesadas: 0,
  publicas: 0,
  bloqueadas: 0,
  duplicadas: 0,
  enHub: 0,
  ultimaSyncTs: null,
  ultimoError: null,
  detenido: false,
  fallosSeguidos: 0,
  generacion: null,
  aviso: null,
};

/** C-16 — la última `generacion` vista en una respuesta del hub (variable de
 *  módulo: si una respuesta trae OTRA, el hub se reinició). */
let generacionVista: string | null = null;

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

/** C-06 — lee el cursor en escala SEQ. Un valor guardado en escala epoch ms
 *  (contrato viejo) es legado: se resetea a 0 (y se re-escribe, para que la
 *  migración sea observable y no se repita en cada lectura). */
function leerCursorSeq(): number {
  const v = leerNumero(CLAVE_CURSOR);
  if (v > ESCALA_EPOCH_MS) {
    escribirNumero(CLAVE_CURSOR, 0);
    return 0;
  }
  return v;
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

interface PaginaHub {
  actas: ActaHub[];
  ahora: number;
  total: number;
  /** C-06 — quedan filas más allá de esta página (truncada a MAX_PAGINA). */
  hay: boolean;
  /** C-06 — seq de la última fila de la página (o `desde` si vino vacía). */
  proximoSeq: number;
  /** C-16 — generación del almacén del hub (cambia en cada /hub/reset). */
  generacion?: string;
}

async function traerActas(desde: number, fetchComo: FetchComo): Promise<PaginaHub> {
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
  const cuerpo = (await res.json()) as {
    ok?: boolean;
    ahora?: number;
    total?: number;
    hay?: boolean;
    proximoSeq?: number;
    generacion?: string;
    actas?: ActaHub[];
  };
  if (!cuerpo?.ok) throw new Error("respuesta sin ok");
  // Defaults espejo del contrato del hub: página vacía → proximoSeq = desde y
  // hay = false (así un hub viejo sin estos campos sigue drenando 1 página).
  const actas = Array.isArray(cuerpo.actas) ? cuerpo.actas : [];
  return {
    actas,
    ahora: cuerpo.ahora ?? Date.now(),
    total: cuerpo.total ?? 0,
    hay: cuerpo.hay === true,
    proximoSeq:
      typeof cuerpo.proximoSeq === "number"
        ? cuerpo.proximoSeq
        : actas.length > 0
          ? (actas[actas.length - 1]?.seq ?? desde)
          : desde,
    generacion: cuerpo.generacion,
  };
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
    // C-15 — la hora REC honesta es la de LLEGADA AL HUB (`ts` que el hub
    // estampa en cada fila), no la del sondeo; si la fila no la trae (hub
    // viejo), el log cae a su `fecha` de siempre.
    ...(typeof a.ts === "number" ? { fechaRecepcionHub: a.ts } : {}),
    // C-07 — la hora ORIGEN es la del gate del móvil (`tsEscaneo` del
    // sobre); si la fila no la trae (acta antigua), no se inventa: la vista
    // muestra «ORIGEN —».
    ...(typeof a.tsEscaneo === "number" ? { fechaOrigen: a.tsEscaneo } : {}),
    // C-08 — huella de CONTENIDO del anti-reproceso (SHA-256 de la foto).
    // Si la fila no la trae (sobre viejo), no se inventa: sin huella no se
    // puede marcar un duplicado (conservador, igual que masiva).
    ...(typeof a.hashSha256 === "string" && /^[0-9a-f]{64}$/.test(a.hashSha256)
      ? { hashSha256: a.hashSha256 }
      : {}),
  };
}

/**
 * C-06 — un ciclo de sondeo con DRENAJE: trae lo nuevo desde el cursor (escala
 * SEQ, exclusivo) y mientras la respuesta diga `hay: true` vuelve a sondear
 * INMEDIATAMENTE con `proximoSeq` (cap de TOPE_DRENAJE iteraciones). El cursor
 * SOLO avanza a `proximoSeq` (seq de la última fila de cada página) y JAMÁS a
 * `ahora`/`Date.now()`: avanzar al reloj del hub saltaría filas publicadas
 * durante el propio sondeo. Si algo revienta a mitad, la siguiente pasada
 * re-intenta esas filas (publicar es idempotente: merge por clave
 * `${idEnlace}::${mesa}`).
 *
 * C-16 — reconciliación de generación: si una respuesta trae una `generacion`
 * DISTINTA a la vista, el hub se reinició: la página traída con el cursor viejo
 * pudo saltar seqs nuevos ≤ cursor, así que se DESCARTA, el cursor vuelve a 0,
 * el log de recepción se purga (sin re-sembrar el ancla demo) y el estado
 * expone `aviso` para la tarjeta.
 */
export async function sincronizarHubLocal(
  fetchComo: FetchComo = (input, init) => fetch(input, init)
): Promise<{ publicas: number; bloqueadas: number; error: string | null }> {
  if (enCurso) return { publicas: 0, bloqueadas: 0, error: null };
  enCurso = true;
  let publicas = 0;
  let bloqueadas = 0;
  try {
    let cursor = leerCursorSeq();
    for (let i = 0; i < TOPE_DRENAJE; i++) {
      const r = await traerActas(cursor, fetchComo);

      // C-16 — ¿cambió la generación? (reset destructivo del hub)
      let paginaDescartada = false;
      if (typeof r.generacion === "string" && r.generacion.length > 0) {
        if (generacionVista !== null && r.generacion !== generacionVista) {
          cursor = 0;
          escribirNumero(CLAVE_CURSOR, 0);
          purgarRecepciones(); // vacía ENTRADAS y notifica (solo se llama aquí)
          // El índice anti-duplicado es de ESTA generación: tras el reset la
          // recepción se repuebla desde cero y no como duplicada.
          reiniciarIndicePaginas();
          estado.duplicadas = 0;
          estado.aviso = AVISO_REINICIO;
          // La página vino de la generación anterior (cursor viejo): se
          // DESCARTA — publicarla resucitaría filas del almacén borrado y el
          // proximoSeq viejo desharía el reset del cursor.
          paginaDescartada = true;
        }
        generacionVista = r.generacion;
        estado.generacion = r.generacion;
      }
      if (paginaDescartada) continue; // re-sondea desde 0 en esta misma pasada

      let publicasPagina = 0;
      let bloqueadasPagina = 0;
      let duplicadasPagina = 0;
      for (const a of r.actas) {
        const res = await publicarActaMasiva(entradaDesdeHub(a), "puente-local");
        if (!res.ok) bloqueadasPagina++;
        else if (res.duplicada) duplicadasPagina++;
        else publicasPagina++;
      }
      publicas += publicasPagina;
      bloqueadas += bloqueadasPagina;
      // El duplicado no se reprocesó: no suma a `procesadas` (que mide
      // páginas que pasaron por el embudo de publicación).
      estado.procesadas += publicasPagina + bloqueadasPagina;
      estado.publicas += publicasPagina;
      estado.bloqueadas += bloqueadasPagina;
      estado.duplicadas += duplicadasPagina;
      estado.enHub = r.total;

      // El cursor avanza SOLO a proximoSeq (seq de la última fila de la
      // página — o el `desde` entrante si vino vacía). Nunca al reloj.
      cursor = r.proximoSeq;
      escribirNumero(CLAVE_CURSOR, r.proximoSeq);
      estado.ultimaSyncTs = Date.now();
      estado.ultimoError = null;
      fallosSeguidos = 0;
      estado.fallosSeguidos = 0;

      if (!r.hay) break; // drenado: no quedan filas más allá de la página
      // hay === true → re-sondeo INMEDIATO con el cursor ya avanzado.
    }
    notificar();
    return { publicas, bloqueadas, error: null };
  } catch (e) {
    estado.ultimoError = e instanceof Error ? e.message : "fallo de red";
    fallosSeguidos += 1;
    estado.fallosSeguidos = fallosSeguidos;
    if (fallosSeguidos >= FALLOS_KILL_LOCAL) {
      estado.detenido = true;
      detener();
    }
    notificar();
    return { publicas, bloqueadas, error: estado.ultimoError };
  } finally {
    enCurso = false;
  }
}

/**
 * C-16 — reinicio destructivo del hub local (demo): `POST /hub/reset` con el
 * segundo factor `x-hub-reset: confirmar` (sin él el hub responde 428; con
 * origen/host no confiable, 403). Tras el reset se sincroniza de inmediato:
 * la `generacion` nueva dispara la reconciliación (cursor a 0 + log purgado +
 * aviso en el estado) y la tarjeta muestra el resultado.
 */
export async function reiniciarHubRemoto(
  fetchComo: FetchComo = (input, init) => fetch(input, init)
): Promise<{ ok: boolean; generacion: string | null; error: string | null }> {
  try {
    const origen = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetchComo(`${origen}${RUTA_RESET}`, {
      method: "POST",
      headers: { "x-hub-reset": "confirmar" },
    });
    if (!res.ok) {
      const detalle =
        res.status === 428
          ? "el hub exigió el segundo factor (x-hub-reset) — reintenta"
          : `HTTP ${res.status}`;
      return { ok: false, generacion: null, error: detalle };
    }
    const cuerpo = (await res.json()) as { ok?: boolean; generacion?: string };
    if (!cuerpo?.ok) return { ok: false, generacion: null, error: "respuesta sin ok" };
    // Re-sync inmediato: la generación nueva debe reconciliarse YA (el aviso
    // y el cursor a 0 no deben esperar el próximo tic de 4 s).
    const r = await sincronizarHubLocal(fetchComo);
    return { ok: true, generacion: cuerpo.generacion ?? null, error: r.error };
  } catch (e) {
    return {
      ok: false,
      generacion: null,
      error: e instanceof Error ? e.message : "fallo de red",
    };
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
    duplicadas: 0,
    enHub: 0,
    ultimaSyncTs: null,
    ultimoError: null,
    detenido: false,
    fallosSeguidos: 0,
    generacion: null,
    aviso: null,
  });
  generacionVista = null;
  fallosSeguidos = 0;
}
