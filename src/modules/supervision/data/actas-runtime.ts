/**
 * Registro RUNTIME de actas recibidas del DIGITALIZADOR vía CARGA MASIVA
 * (kit carga-masiva-supervision-v1, D27) — la contraparte en runtime del
 * loader estático `actas-reales.ts` (SUP-6 / D24).
 *
 * CONTRATO: el módulo masiva publica AQUÍ cada acta que envía (clasificación
 * AUTO del OCR → `idEnlace` D22 + mesa + formulario + página + foto
 * procesada + encabezado impreso verbatim). La MISMA forma del loader:
 * `ActaRealLista` (reexportada del módulo estático — una sola fuente).
 *
 * VALIDACIÓN (D25 a/b/d) contra el catálogo DIVIPOLA — (a)/(b) por el
 * validador ÚNICO `data/validacion-d25.ts` (M13; jamás lanza — C1): (a) `idEnlace` existe;
 * (b) `mesa` ≤ `totalMesas`; (d) página dentro de rango. La que falla NO se
 * publica → `BLOQUEADA: <motivo>` en consola y en el desenlace que el
 * adaptador muestra en la bandeja (cuarentena); el resto sigue.
 *
 * REGLA DE ORO (§0-1 / D23): la foto se UBICA, no se INTERPRETA — aquí no
 * hay OCR ni cifras de votación; solo ranuras (idEnlace + mesa + formulario
 * + página) y la información impresa del encabezado.
 *
 * ANTI-REPROCESO: el mismo par (página, contenido) que llega dos veces
 * —reintento de la cola del móvil, ack perdido o re-sondeo del hub— se
 * registra como DUPLICADA en Recepción y NO se republica (no re-mide la
 * foto, no emite evento, no suma publicación). La identidad de la página es
 * idEnlace + mesa + formulario + página; la huella es ÚNICAMENTE el SHA-256
 * de la foto (`hashSha256`, C-08) — igual que la dedup de masiva, jamás
 * nombre de archivo ni fecha. Sin huella (sobre viejo) no se marca nada.
 * Una foto DISTINTA para la misma página es un reescaneo legítimo: se
 * publica y la huella se actualiza.
 *
 * MEMORIA DE SESIÓN (§0-5 / D8): sin persistencia y sin backend — el export
 * estático no cambia. Recargar la página restablece el estado (misma
 * disciplina del resto del dashboard); la cola durable del digitalizador
 * vive en IndexedDB de su módulo (masiva/cola).
 *
 * Fusión con el visor: `mock-repository.getActaDeMesa` consulta
 * `consultarActaRuntime()` y superpone las fotos sobre el acta base; el
 * estado de la mesa lo actualiza `registrarCargaMasiva` (mismo módulo del
 * mock) a partir del evento de publicación.
 */

import type { FormularioTipo, FotoActa, ImpresionActa } from "../domain/acta";
import type { Mesa } from "../domain/types";
import type { ActaRealLista } from "./actas-reales/actas-reales";
import { tieneActa } from "./actas-mock";
import { validarJoinDivipola } from "./validacion-d25";
// KIT recepcion-actas-v1 (D28): toda publicación deja su entrada en el
// log de RECEPCIÓN (PUBLICADA/BLOQUEADA) — el embudo es este módulo.
import { registrarRecepcion, type OrigenRecepcion } from "./recepcion-log";
// P-22 (plan 2026-11-12) — huellas del puente (shared, puras, sin DOM).
import {
  UMBRAL_HAMMING_DHASH,
  esDhash64Valido,
  hamming64,
  normalizarQrPayload,
} from "@/shared/e14/huellas";

/** Entrada de publicación que envía el adaptador del digitalizador
 * (store-e14.ts) tras un envío de la cola masiva. */
export interface EntradaActaMasiva {
  idEnlace: string;
  /** "001" (3 dígitos — convención del catálogo). */
  mesa: string;
  formulario: FormularioTipo;
  /** Página recibida (1-based) y total del formulario. */
  paginaIndex: number;
  paginaTotal: number;
  /** dataURL de la foto procesada del pipeline; null → página sin foto
   * (cae al sintético D18 — jamás inventar binarios). */
  srcFoto: string | null;
  /** Encabezado IMPRESO verbatim (se muestra, no se interpreta). */
  impresion: ImpresionActa;
  nombreArchivo: string;
  /** Informativo (telemetría de la bandeja del digitalizador). */
  score: number;
  statusActa: string;
  /** C-15 — epoch ms de llegada AL HUB (solo el sobre que trae
   * `hub-local.ts` desde la fila del sondeo). El embudo NO lo inventa:
   * los demás orígenes no lo mandan y el log cae a su `fecha`. */
  fechaRecepcionHub?: number;
  /** C-07 — epoch ms del gate del MÓVIL (`tsEscaneo` del sobre). Solo lo
   * trae la ruta del hub; ausente → «ORIGEN —» (jamás sintetizar). */
  fechaOrigen?: number;
  /** C-08 — SHA-256 (hex 64) de los BYTES de la foto que mandó el móvil.
   * Es la huella de CONTENIDO del anti-reproceso: un reenvío del mismo
   * sobre la conserva; un reescaneo produce otra. Ausente en sobres viejos
   * → sin huella comparable NO se marca duplicado (conservador, igual que
   * la dedup de masiva). */
  hashSha256?: string;
  /** P-22 (plan 2026-11-12) — payload EXACTO del código impreso leído por
   * la capa 0 del móvil, ya normalizado (normalizarQrPayload de shared).
   * IGUALDAD EXACTA contra el índice de la página: misma página + mismo
   * payload → DUPLICADA aunque los bytes de la foto difieran (acta
   * re-fotografiada). Ausente (sobre viejo o sin lectura) → capa omitida. */
  qrPayload?: string;
  /** P-22 — dhash64 perceptual (hex 16, dhash horizontal 9×8) de la foto
   * PROCESADA, estampado por el móvil. Respaldo SIN QR: hamming64 ≤ 6
   * contra el índice decide «misma imagen» (umbral D65). Ausente o mal
   * formado → capa omitida (conservador). */
  dhash64?: string;
}

export type ResultadoPublicacion =
  | {
      ok: true;
      clave: string;
      /** La página ya estaba publicada con el MISMO contenido: no se
       * republicó ni se contó de nuevo (anti-reproceso). */
      duplicada?: true;
    }
  | { ok: false; clave: string; motivo: string };

/** Evento que emite cada publicación exitosa (consumidores: datos-provider). */
export interface EventoActaPublicada {
  tipo: "publicada";
  idEnlace: string;
  mesa: string;
  formulario: FormularioTipo;
  /** Páginas del formulario que YA tienen foto en runtime (ordenadas). */
  paginas: number[];
  clave: string;
}

type Oyente = (evento: EventoActaPublicada) => void;

const RUNTIME = new Map<string, ActaRealLista>();
const oyentes = new Set<Oyente>();
/** D-32/D-33 (plan 2026-11-12): claves publicadas con origen "demo" — la
 *  memoria del reinicio del demo (purga SOLO demo, jamás el puente real). */
const CLAVES_DEMO = new Set<string>();

// ─── Anti-reproceso (duplicados enviados desde el móvil) ────────────────
// TRES capas de huella (P-22, plan 2026-11-12 — la deuda P2 del reporte):
//  1. SHA-256 exacto de los bytes (C-08, la de siempre) — atrapa el REENVÍO
//     del mismo sobre (reintento de cola, ack perdido, re-sondeo).
//  2. qrPayload EXACTO (P-22) — misma página + mismo payload del código
//     impreso → DUPLICADA aunque la foto tenga bytes distintos: una acta
//     RE-FOTOGRAFIADA ya no entra como página nueva. Igualdad EXACTA del
//     payload completo (RED LINE 10 de masiva: jamás prefijos, sin fuzzy).
//  3. dhash64 perceptual (P-22) — respaldo SIN QR legible: hamming64 ≤ 6
//     (umbral D65 del dedup de masiva) contra la huella indexada decide
//     «misma imagen». Sin QR Y sin dhash comparable no se marca nada.
// La identidad de la página (idEnlace + mesa + formulario + página) acota
// TODAS las comparaciones para que dos fotos idénticas de actas distintas
// no se confundan. Misma página + huella duplicada → se registra con `dupOf`
// (como el `dupOf` de las DUPLICADA de masiva) y NO se republica. La huella
// indexada es la de lo ÚLTIMO publicado: una foto DISTINTA (reescaneo
// legítimo, dhash lejos) publica, actualiza las tres huellas y el registro.
// NOTA DE PARIDAD: hamming64/normalizarQrPayload viven en shared/e14/huellas
// (gemelo EXACTO del de masiva/dedup.ts — migración a shared anotada en H-44).
interface PaginaIndexada {
  huella: string;
  /** P-22 — huellas del puente indexadas (null = el sobre no las trajo). */
  qrPayload: string | null;
  dhash64: string | null;
  /** id del registro de Recepción de la página original. */
  idRecepcion: string;
}

const HUELLAS_PAGINA = new Map<string, PaginaIndexada>();

function identidadDePagina(e: EntradaActaMasiva): string {
  return `${e.idEnlace}::${e.mesa}::${e.formulario}::${e.paginaIndex}`;
}

/** Huella de CONTENIDO del sobre — null si el móvil no la trajo (sobre viejo
 *  o contexto sin crypto.subtle): conservador, no se puede comparar. */
function huellaDeContenido(e: EntradaActaMasiva): string | null {
  return typeof e.hashSha256 === "string" && /^[0-9a-f]{64}$/.test(e.hashSha256)
    ? e.hashSha256
    : null;
}

/** Vacía el índice anti-duplicado de la sesión (pruebas y reinicio del hub:
 *  tras un reset la recepción se repuebla desde cero, no como duplicada). */
export function reiniciarIndicePaginas(): void {
  HUELLAS_PAGINA.clear();
}

/** Suscripción a publicaciones (patrón del módulo: sin libs nuevas). */
export function suscribirseActasRuntime(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Registro runtime para la clave `${puestoId}::${mesaId}` (o null). */
export function consultarActaRuntime(
  puestoId: string,
  mesaId: string
): ActaRealLista | null {
  return RUNTIME.get(`${puestoId}::${mesaId}`) ?? null;
}

/** ¿Hay acta runtime publicada para esta mesa? (antes de tocar el mock). */
export function hayActaRuntime(puestoId: string, mesaId: string): boolean {
  return RUNTIME.has(`${puestoId}::${mesaId}`);
}

/** Número de actas runtime publicadas (telemetría del módulo masiva). */
export function contarActasRuntime(): number {
  return RUNTIME.size;
}

// ─── T8 (KIT VISOR-MONITOR-GLOBAL-v1) — REGLA DE VISIBILIDAD ────────────────
// «En el visor del monitor global, solo se ven las imágenes enviadas
//  automáticamente, o aprobadas por supervisor en "masiva" o en Recepción.»
//
// Mapeo fuente → visible (lo que EXISTE en el código hoy, sin inventar
// estados de dominio — kit T8.1):
//   · Sembrada del demo (`actas-mock` / manifest D24 — representan
//     transmisiones RECIBIDAS: Roma, El Cairo, Barcelona)   → ✅ SÍ
//   · Publicada por ENVÍO AUTOMÁTICO de masiva (runtime
//     PUBLICADA — `publicarActaMasiva`)                     → ✅ SÍ
//   · BLOQUEADA (cuarentena D25): jamás entra al RUNTIME y la mesa queda
//     NO_INICIADO → sin entrada en el visor                 → ❌ NO
//   · DUPLICADA (reenvío del mismo contenido): no hay página nueva; la
//     original ya está en el visor por la fila PUBLICADA     → ❌ NO (nueva)
//   · SIN_JOIN (solo `recepcion-log`, sin join confiable)   → ❌ NO
//   · Rechazada en masiva: nunca llega a publicarse         → ❌ NO
//   · Mesa NO_INICIADO (sin transmisión)                    → ❌ NO
// BRECHA ABIERTA (decisión del dueño — docs/adr/README.md D-8): la APROBACIÓN en
// Recepción HOY no produce ningún registro consultable por el repositorio
// (`recepcion-log` solo documenta el embudo; no hay acción de aprobación
// en `vista-recepcion.tsx`) → el gate usa runtime + sembradas; cuando
// exista esa aprobación, se suma AQUÍ como tercera fuente.

/**
 * Predicado ÚNICO de visibilidad del visor del Monitor Global (T8). Se
 * aplica en los 3 puntos de entrada (VER ACTA de la subtabla de mesas,
 * VER ACTA de la tarjeta de anomalía y 👁 de la fila de puesto), en la
 * navegación interna (chevrons + dropdown de mesas) y en la restauración
 * del hash. VER EN MONITOR de masiva NO pasa por aquí (aterriza SIEMPRE:
 * el acta acaba de publicarse por envío automático).
 *
 * `mesa` es opcional para consultas sin catálogo a mano (solo runtime).
 */
export function actaVisibleEnMonitor(
  puestoId: string,
  mesaId: string,
  mesa?: Mesa
): boolean {
  // Envío automático PUBLICADA — el registro runtime manda (incluye el
  // caso de una mesa cuyo snapshot del provider aún no refrescó: el acta
  // publicada de madrugada es alcanzable, hallazgo §8f).
  if (hayActaRuntime(puestoId, mesaId)) return true;
  // Sembradas del demo (transmisiones recibidas del backlog) — cualquier
  // mesa que NO esté NO_INICIADO tiene acta servible por el repositorio.
  return mesa ? tieneActa(mesa) : false;
}

function medirFoto(src: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve({ ancho: 794, alto: 1123 });
    const img = new Image();
    const listo = (ancho: number, alto: number) => resolve({ ancho, alto });
    img.onload = () =>
      img.naturalWidth > 0 ? listo(img.naturalWidth, img.naturalHeight) : listo(794, 1123);
    img.onerror = () => listo(794, 1123);
    img.src = src;
  });
}

/** Publica (o fusiona) una página de acta del digitalizador. Merge por
 * clave `${idEnlace}::${mesa}` — cada página llega en un envío distinto
 * (una foto = una fila = una página en el pipeline masiva).
 *
 * `origen` (E2E local): el embudo es UNO solo, el MEDIO no. El lote local del
 * digitalizador usa `carga-masiva` (el default) y el sondeo del hub local usa
 * `puente-local`, para que el feed de Recepción distinga «llegó por red desde
 * un celular» de «procesada en este computador» sin duplicar la validación. */
export async function publicarActaMasiva(
  entrada: EntradaActaMasiva,
  origen: OrigenRecepcion = "carga-masiva"
): Promise<ResultadoPublicacion> {
  const clave = `${entrada.idEnlace}::${entrada.mesa}`;

  // D25 (a)/(b) — validador ÚNICO compartido con el loader estático
  // (actas-reales.ts, M13): `validarJoinDivipola` devuelve el motivo o
  // null. Catálogo no disponible → también BLOQUEADA (C1 — el adaptador
  // jamás lanza): la página va a cuarentena, el resto sigue.
  const motivoJoin = validarJoinDivipola(entrada.idEnlace, entrada.mesa);
  if (motivoJoin) {
    registrarRecepcion({
      fecha: Date.now(),
      origen,
      estado: "BLOQUEADA",
      idEnlace: entrada.idEnlace,
      mesa: entrada.mesa,
      formulario: entrada.formulario,
      paginaIndex: entrada.paginaIndex,
      paginaTotal: entrada.paginaTotal,
      srcFoto: entrada.srcFoto,
      pais: entrada.impresion.pais,
      lugar: entrada.impresion.lugar,
      motivo: motivoJoin,
      score: entrada.score,
      statusActa: entrada.statusActa,
      nombreArchivo: entrada.nombreArchivo,
      clave,
      // C-15 — solo si el sobre lo trae (fila del hub); jamás inventado.
      ...(entrada.fechaRecepcionHub !== undefined
        ? { fechaRecepcionHub: entrada.fechaRecepcionHub }
        : {}),
      // C-07 — ORIGEN real del móvil (solo filas del hub); sin dato → «—».
      ...(entrada.fechaOrigen !== undefined
        ? { fechaOrigen: entrada.fechaOrigen }
        : {}),
    });
    return { ok: false, clave, motivo: motivoJoin };
  }

  // (d) página dentro de rango del formulario.
  if (
    !Number.isInteger(entrada.paginaIndex) ||
    entrada.paginaIndex < 1 ||
    (entrada.paginaTotal > 0 && entrada.paginaIndex > entrada.paginaTotal)
  ) {
    const motivo = `(d) página ${entrada.paginaIndex} fuera de rango (total: ${entrada.paginaTotal})`;
    registrarRecepcion({
      fecha: Date.now(),
      origen,
      estado: "BLOQUEADA",
      idEnlace: entrada.idEnlace,
      mesa: entrada.mesa,
      formulario: entrada.formulario,
      paginaIndex: entrada.paginaIndex,
      paginaTotal: entrada.paginaTotal,
      srcFoto: entrada.srcFoto,
      pais: entrada.impresion.pais,
      lugar: entrada.impresion.lugar,
      motivo,
      score: entrada.score,
      statusActa: entrada.statusActa,
      nombreArchivo: entrada.nombreArchivo,
      clave,
      // C-07 — ORIGEN real del móvil (solo filas del hub); sin dato → «—».
      ...(entrada.fechaOrigen !== undefined
        ? { fechaOrigen: entrada.fechaOrigen }
        : {}),
    });
    return { ok: false, clave, motivo };
  }

  // Anti-reproceso: si esta MISMA página ya se publicó con la MISMA huella
  // de contenido, es un reenvío del móvil (reintento de la cola, ack perdido
  // o re-sondeo del hub). Se deja constancia en Recepción y se corta aquí:
  // sin re-medir la foto, sin pisar el runtime y sin sumar una publicación.
  const identidad = identidadDePagina(entrada);
  const huella = huellaDeContenido(entrada);
  // P-22 — huellas del puente (capas 2 y 3): normalizadas/validadas AQUÍ una
  // vez; mal formadas → null (conservador, jamás inventar comparación).
  const qr = normalizarQrPayload(entrada.qrPayload);
  const dhash = esDhash64Valido(entrada.dhash64) ? entrada.dhash64 : null;
  const indexada = HUELLAS_PAGINA.get(identidad);
  // P-22 — MOTIVO de la duplicación (capa que atrapó el reenvío; honesto en
  // el log de Recepción y comparable con el `dupOf` de masiva).
  let motivoDup: string | null = null;
  let originalDup: PaginaIndexada | undefined;
  if (indexada !== undefined) {
    if (huella !== null && indexada.huella === huella) {
      motivoDup = "mismo contenido ya recibido — no se reprocesa";
      originalDup = indexada;
    } else if (qr !== null && indexada.qrPayload === qr) {
      motivoDup =
        "mismo código impreso (payload exacto) con foto de bytes distintos — acta re-fotografiada";
      originalDup = indexada;
    } else if (
      dhash !== null &&
      indexada.dhash64 !== null &&
      hamming64(dhash, indexada.dhash64) <= UMBRAL_HAMMING_DHASH
    ) {
      motivoDup =
        "misma imagen perceptual (dhash64 ≤ 6 bits) — acta re-fotografiada sin QR legible";
      originalDup = indexada;
    }
  }
  if (motivoDup !== null) {
    registrarRecepcion({
      fecha: Date.now(),
      origen,
      estado: "DUPLICADA",
      idEnlace: entrada.idEnlace,
      mesa: entrada.mesa,
      formulario: entrada.formulario,
      paginaIndex: entrada.paginaIndex,
      paginaTotal: entrada.paginaTotal,
      srcFoto: entrada.srcFoto,
      pais: entrada.impresion.pais,
      lugar: entrada.impresion.lugar,
      motivo: motivoDup,
      score: entrada.score,
      statusActa: entrada.statusActa,
      nombreArchivo: entrada.nombreArchivo,
      clave,
      // Mismo puntero que la DUPLICADA de masiva: la original manda.
      dupOf: originalDup!.idRecepcion,
      ...(entrada.fechaRecepcionHub !== undefined
        ? { fechaRecepcionHub: entrada.fechaRecepcionHub }
        : {}),
      ...(entrada.fechaOrigen !== undefined
        ? { fechaOrigen: entrada.fechaOrigen }
        : {}),
    });
    return { ok: true, clave, duplicada: true };
  }

  // Foto real → FotoActa (null → la página cae al sintético D18).
  let foto: FotoActa | null = null;
  if (entrada.srcFoto) {
    const dims = await medirFoto(entrada.srcFoto);
    foto = {
      src: entrada.srcFoto,
      ancho: dims.ancho,
      alto: dims.alto,
      archivo: entrada.nombreArchivo,
      // Plan V1 — chip SCORE del visor: el score REAL del OCR viaja con la
      // foto (telemetría informativa de la bandeja del digitalizador).
      score: entrada.score,
      // D-32 — el lote demo llega marcado (chip DEMO en el visor — jamás
      // se presenta como dato real; coherente con D89-sup).
      ...(origen === "demo" ? { demo: true } : {}),
    };
  }

  // Merge por clave + formulario (mismo patrón del loader estático).
  const lista = RUNTIME.get(clave) ?? {
    idEnlace: entrada.idEnlace,
    mesa: entrada.mesa,
    fotos: {},
    impresion: entrada.impresion,
    etiquetasImpresas: {},
    barcodesImpresos: {},
  };
  const slot = lista.fotos[entrada.formulario] ?? [];
  slot[entrada.paginaIndex - 1] = foto;
  lista.fotos[entrada.formulario] = slot;
  lista.etiquetasImpresas[entrada.formulario] =
    entrada.impresion.etiquetaFormulario ??
    (entrada.formulario === "TRANSMISION" ? "TRANSMISIÓN" : "CÓNSUL/EMBAJADOR");
  lista.barcodesImpresos[entrada.formulario] = entrada.impresion.barcode ?? "";
  // El encabezado impreso más reciente manda (mismo formulario → mismo
  // encabezado; entre formularios, el último publicado).
  lista.impresion = entrada.impresion;
  RUNTIME.set(clave, lista);

  const paginas = slot
    .map((f, i) => (f ? i + 1 : 0))
    .filter((n) => n > 0);

  const evento: EventoActaPublicada = {
    tipo: "publicada",
    idEnlace: entrada.idEnlace,
    mesa: entrada.mesa,
    formulario: entrada.formulario,
    paginas,
    clave,
  };
  for (const oyente of oyentes) {
    try {
      oyente(evento);
    } catch {
      /* un oyente caído jamás rompe la publicación */
    }
  }
  // D28 — recepción: la página PUBLICADA también deja su entrada (la
  // vista Recepción y el badge del sidebar se alimentan de aquí).
  const registro = registrarRecepcion({
    fecha: Date.now(),
    origen,
    estado: "PUBLICADA",
    idEnlace: entrada.idEnlace,
    mesa: entrada.mesa,
    formulario: entrada.formulario,
    paginaIndex: entrada.paginaIndex,
    paginaTotal: entrada.paginaTotal,
    srcFoto: entrada.srcFoto,
    pais: entrada.impresion.pais,
    lugar: entrada.impresion.lugar,
    score: entrada.score,
    statusActa: entrada.statusActa,
    nombreArchivo: entrada.nombreArchivo,
    clave,
    // C-15 — solo si el sobre lo trae (fila del hub); jamás inventado.
    ...(entrada.fechaRecepcionHub !== undefined
      ? { fechaRecepcionHub: entrada.fechaRecepcionHub }
      : {}),
    // C-07 — ORIGEN real del móvil (solo filas del hub); sin dato → «—».
    ...(entrada.fechaOrigen !== undefined
      ? { fechaOrigen: entrada.fechaOrigen }
      : {}),
  });
  // La página queda indexada con la huella de lo ÚLTIMO publicado y con el
  // id de su registro (dupOf de una futura DUPLICADA). Una foto distinta es
  // un reemplazo legítimo (reescaneo) y actualiza huella + registro.
  if (huella !== null || qr !== null || dhash !== null) {
    // P-22 — el índice guarda las TRES huellas de lo ÚLTIMO publicado (las
    // ausentes quedan null: un reenvío del mismo sobre las re-estampa).
    HUELLAS_PAGINA.set(identidad, {
      huella: huella ?? "",
      qrPayload: qr,
      dhash64: dhash,
      idRecepcion: registro.id,
    });
  }
  // D-33 — la publicación demo deja constancia para su reinicio selectivo.
  if (origen === "demo") CLAVES_DEMO.add(clave);
  return { ok: true, clave };
}

/**
 * D-33 (plan 2026-11-12) — REINICIAR DEMO del panel: retira del runtime SOLO
 * las actas publicadas con origen "demo" (el puente real y las sembradas del
 * ancla demo —actas-mock— NO se tocan) y vacía el registro de claves demo.
 * El log de Recepción lo purga la vista con purgarPorOrigen("demo").
 */
export function reiniciarDemoPanel(): number {
  let retiradas = 0;
  for (const clave of CLAVES_DEMO) {
    if (RUNTIME.delete(clave)) retiradas += 1;
  }
  CLAVES_DEMO.clear();
  return retiradas;
}
