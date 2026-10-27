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
 * VALIDACIÓN (D25 a/b/d) contra el catálogo DIVIPOLA (`CARGAR_CATALOGO()` —
 * import de solo-lectura; el adaptador NO cambia): (a) `idEnlace` existe;
 * (b) `mesa` ≤ `totalMesas`; (d) página dentro de rango. La que falla NO se
 * publica → `BLOQUEADA: <motivo>` en consola y en el desenlace que el
 * adaptador muestra en la bandeja (cuarentena); el resto sigue.
 *
 * REGLA DE ORO (§0-1 / D23): la foto se UBICA, no se INTERPRETA — aquí no
 * hay OCR ni cifras de votación; solo ranuras (idEnlace + mesa + formulario
 * + página) y la información impresa del encabezado.
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
import type { ActaRealLista } from "./actas-reales/actas-reales";
import { CARGAR_CATALOGO } from "./divipola-adapter";

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
}

export type ResultadoPublicacion =
  | { ok: true; clave: string }
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
 * (una foto = una fila = una página en el pipeline masiva). */
export async function publicarActaMasiva(
  entrada: EntradaActaMasiva
): Promise<ResultadoPublicacion> {
  const clave = `${entrada.idEnlace}::${entrada.mesa}`;

  // (a) idEnlace existe en el catálogo (solo-lectura — D25).
  const registro = CARGAR_CATALOGO().find((r) => r.idEnlace === entrada.idEnlace);
  if (!registro) {
    return {
      ok: false,
      clave,
      motivo: `(a) idEnlace "${entrada.idEnlace}" ausente en el catálogo DIVIPOLA`,
    };
  }

  // (b) mesa ≤ totalMesas del puesto.
  const numeroMesa = Number(entrada.mesa);
  if (
    !Number.isInteger(numeroMesa) ||
    numeroMesa < 1 ||
    numeroMesa > registro.totalMesas
  ) {
    return {
      ok: false,
      clave,
      motivo: `(b) mesa ${entrada.mesa} fuera de rango (totalMesas: ${registro.totalMesas})`,
    };
  }

  // (d) página dentro de rango del formulario.
  if (
    !Number.isInteger(entrada.paginaIndex) ||
    entrada.paginaIndex < 1 ||
    (entrada.paginaTotal > 0 && entrada.paginaIndex > entrada.paginaTotal)
  ) {
    return {
      ok: false,
      clave,
      motivo: `(d) página ${entrada.paginaIndex} fuera de rango (total: ${entrada.paginaTotal})`,
    };
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
  return { ok: true, clave };
}
