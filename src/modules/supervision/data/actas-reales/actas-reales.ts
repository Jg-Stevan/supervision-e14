/**
 * Ingesta de las ACTAS REALES del digitalizador (kit SUP-6 §3-T3 / D24-D25)
 * — METADATA-ONLY desde D35.
 *
 * D35 (opción A — anonimizar, 2026-11-08): las 8 fotos reales (4 actas ×
 * 2 páginas, WebP q75, ~1,17 MB) se ELIMINARON de `assets/` junto con la
 * segunda copia del módulo digitalizador (nombre exacto y rutas en
 * SECURITY.md §D35). Este loader
 * ya NO importa imágenes: publica METADATOS (encabezado impreso verbatim,
 * etiqueta/barcode/código de forma por formulario y la paginación real) y
 * cada ranura de página queda en `null` — el visor muestra el placeholder
 * «foto retirada (D35)» y el documento sintético D18 como cualquier página
 * sin foto. Qué había (solo JSON, sin fotos): `docs/historico/actas-reales-
 * manifest.original.json`. La historia git ANTERIOR al rewrite (1.3, script
 * aparte que se entrega) aún contiene los blobs y los nombres con códigos
 * de mesa.
 *
 * CONTRATO (D24): `actas-reales-manifest.json` declara las actas —
 * `idEnlace`, `mesa`, `formulario` (clave de dominio TRANSMISION |
 * DELEGADOS), `etiquetaImpresa`, `barcodeImpreso`, `impresion` (verbatim)
 * y `paginas[]` (solo números de página — sin archivo desde D35).
 * Convención histórica de nombre (la del digitalizador, hoy sin asset):
 * `E14_<idEnlace>_<mesa>_<PLANCHA>-<pagina>.webp` (DELEGADOS queda como
 * `DELEGADOS` o `CONSUL_EMBAJADOR` según la plancha de origen — ambas son
 * la clave de dominio DELEGADOS).
 *
 * VALIDACIÓN (D25 a–e) de CADA acta contra el catálogo DIVIPOLA — las
 * puertas (a)/(b) por el validador ÚNICO `data/validacion-d25.ts`
 * (`validarJoinDivipola`, M13; el catálogo llega por el adaptador Result,
 * jamás lanza — C1):
 * (a) `idEnlace` existe en el catálogo; (b) `mesa` ≤ `totalMesas` del
 * puesto; (c) `formulario` es clave conocida del dominio; (d) páginas
 * 1..N completas y continuas. La que falla NO se publica y queda
 * `BLOQUEADA: <motivo>` en consola y en el reporte (cuarentena); el resto
 * sigue. Guardrail (D25): máx 10 actas publicadas — el tope de peso/bytes
 * de assets perdió objeto con D35 (ya no hay binarios que cargar).
 *
 * REGLA DE ORO (§0-1): la foto se UBICA, no se INTERPRETA — aquí no hay
 * OCR ni cifras de votación; solo ranuras (idEnlace + mesa + formulario
 * + página) y la información impresa del encabezado.
 *
 * Se ejecuta 1 vez (memo en módulo). El loader es perezoso: lo consumen el
 * ancla del mock, el visor al abrir un acta y la semilla del log de
 * recepción.
 */

import type {
  FormularioTipo,
  FotoActa,
  ImpresionActa,
} from "../../domain/acta";
import { validarJoinDivipola } from "../validacion-d25";
import manifestBruto from "./actas-reales-manifest.json";

// ─── Guardrail (D25) ────────────────────────────────────────────────────────

const MAX_ACTAS = 10;

// ─── Contratos del loader ──────────────────────────────────────────────────

/** Acta real PUBLICADA para una mesa: ranuras por formulario (índice =
 * página − 1; `null` desde D35 — foto retirada — o ausente → esa página
 * cae al sintético D18) + encabezado impreso verbatim + etiqueta/barcode
 * impresos por formulario (del manifest — la etiqueta impresa
 * «CÓNSUL/EMBAJADOR» es la clave de dominio DELEGADOS, D24). */
export interface ActaRealLista {
  idEnlace: string;
  mesa: string;
  /** fotos[formulario][página − 1]; null/ausente → esa página cae al
   * sintético D18 (desde D35: TODAS las ranuras del manifest son null —
   * el largo del arreglo conserva la paginación real). */
  fotos: Partial<Record<FormularioTipo, (FotoActa | null)[]>>;
  /** Encabezado impreso verbatim (del manifest — se muestra, no se
   * interpreta). */
  impresion: ImpresionActa;
  /** Etiqueta impresa del encabezado por formulario (p. ej. «CÓNSUL/EMBAJADOR»). */
  etiquetasImpresas: Partial<Record<FormularioTipo, string>>;
  /** Barcode impreso por formulario (difiere entre formularios). */
  barcodesImpresos: Partial<Record<FormularioTipo, string>>;
  /** V2-01/V3-04 (auditoría diseños): código IMPRESO del formulario entre
   *  las X del papel («7 - 23 - 10 - 19») — verbatim del manifiesto. Sin
   *  dato → el panel muestra «—» (honestidad de datos, jamás inventar). */
  codigoFormaImpreso?: string;
}

/** Acta en cuarentena (D25): no se publica; motivo `BLOQUEADA: …`. */
export interface ActaRealBloqueada {
  clave: string;
  motivo: string;
}

export interface ResultadoIngesta {
  /** Publicadas, clave `${idEnlace}::${mesa}`. */
  actas: Record<string, ActaRealLista>;
  /** Cuarentena (D25) — también avisada por consola. */
  bloqueadas: ActaRealBloqueada[];
}

// ─── Validación del manifest (estricta, sin librerías — §0-5) ───────────────

const FORMULARIOS_VALIDOS: FormularioTipo[] = ["TRANSMISION", "DELEGADOS"];

const CAMPOS_IMPRESION = [
  "consulado",
  "pais",
  "zona",
  "puesto",
  "mesa",
  "lugar",
] as const;

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0;
}

/** Forma mínima de UNA entrada del manifest (D24, metadata-only D35) —
 * null si no es válida. */
interface EntradaManifest {
  idEnlace: string;
  mesa: string;
  formulario: FormularioTipo;
  etiquetaImpresa: string;
  barcodeImpreso: string;
  /** Opcional (V2-01): código impreso entre las X — si el manifest no lo
   *  trae, el panel degrada a «—» en vez de asumir el mismo código. */
  codigoFormaImpreso?: string;
  impresion: ImpresionActa;
  paginas: { pagina: number }[];
}

function validarEntrada(bruto: unknown): EntradaManifest | null {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return null;
  }
  const r = bruto as Record<string, unknown>;
  if (!esTexto(r.idEnlace) || !esTexto(r.mesa)) return null;
  if (
    !esTexto(r.formulario) ||
    !FORMULARIOS_VALIDOS.includes(r.formulario as FormularioTipo)
  ) {
    return null;
  }
  if (!esTexto(r.etiquetaImpresa) || !esTexto(r.barcodeImpreso)) return null;
  const imp = r.impresion;
  if (typeof imp !== "object" || imp === null) return null;
  const impresion = imp as Record<string, unknown>;
  for (const campo of CAMPOS_IMPRESION) {
    if (!esTexto(impresion[campo])) return null;
  }
  if (!Array.isArray(r.paginas) || r.paginas.length === 0) return null;
  const paginas: { pagina: number }[] = [];
  for (const paginaBruta of r.paginas) {
    if (typeof paginaBruta !== "object" || paginaBruta === null) return null;
    const p = paginaBruta as Record<string, unknown>;
    if (typeof p.pagina !== "number" || !Number.isInteger(p.pagina)) return null;
    // D35: el manifest metadata-only NO trae `archivo` (y si lo trajera no
    // se usa — jamás hay asset que importar).
    paginas.push({ pagina: p.pagina });
  }
  return {
    idEnlace: r.idEnlace,
    mesa: r.mesa,
    formulario: r.formulario as FormularioTipo,
    etiquetaImpresa: r.etiquetaImpresa,
    barcodeImpreso: r.barcodeImpreso,
    codigoFormaImpreso: esTexto(r.codigoFormaImpreso)
      ? r.codigoFormaImpreso
      : undefined,
    impresion: {
      consulado: impresion.consulado as string,
      pais: impresion.pais as string,
      zona: impresion.zona as string,
      puesto: impresion.puesto as string,
      mesa: impresion.mesa as string,
      lugar: impresion.lugar as string,
    },
    paginas,
  };
}

// ─── Ingesta (D24/D25 · metadata-only D35) ──────────────────────────────────

function ingestar(): ResultadoIngesta {
  const bloqueadas: ActaRealBloqueada[] = [];
  const bloquear = (clave: string, motivo: string) => {
    bloqueadas.push({ clave, motivo });
    console.warn(`BLOQUEADA: actas-reales ${clave} — ${motivo}`);
  };

  const bruto: unknown = manifestBruto;
  const manifest =
    typeof bruto === "object" && bruto !== null
      ? (bruto as { actas?: unknown })
      : null;
  const entradas = Array.isArray(manifest?.actas) ? manifest!.actas : [];

  // Guardrail D25 (ANTES de publicar nada): máx 10 actas — más →
  // BLOQUEADA del manifest completo. (El tope de peso/2 MB de assets de la
  // v1 perdió objeto con D35: ya no hay binarios que importar.)
  if (entradas.length > MAX_ACTAS) {
    const motivo = `guardrail excedido (${entradas.length} actas > ${MAX_ACTAS})`;
    bloquear("(manifest)", motivo);
    return { actas: {}, bloqueadas };
  }

  // D25 (a)/(b) — validador ÚNICO compartido con el runtime (M13). El
  // catálogo llega por el adaptador Result (C1 — jamás lanza): si no está
  // disponible, (a) falla entrada por entrada y TODO va a cuarentena
  // (nada se publica — honesto), sin excepción en el loader.

  const actas: Record<string, ActaRealLista> = {};

  for (let indice = 0; indice < entradas.length; indice++) {
    const entrada = validarEntrada(entradas[indice]);
    if (!entrada) {
      bloquear(`manifest.actas[${indice}]`, "entrada malformada (D24)");
      continue;
    }
    const clave = `${entrada.idEnlace}::${entrada.mesa}`;

    // (a) idEnlace existe en el catálogo + (b) mesa ≤ totalMesas del
    // puesto — validador ÚNICO (M13, antes duplicado aquí y en runtime).
    const motivoJoin = validarJoinDivipola(entrada.idEnlace, entrada.mesa);
    if (motivoJoin) {
      bloquear(clave, motivoJoin);
      continue;
    }

    // (c) formulario es clave conocida del dominio (validado arriba —
    // la entrada malformada nunca llega aquí).

    // (d) páginas 1..N completas y continuas.
    const numeros = entrada.paginas.map((p) => p.pagina).sort((x, y) => x - y);
    const continua = numeros.every((n, i) => n === i + 1);
    if (!continua) {
      bloquear(clave, `(d) páginas incompletas o discontinuas [${numeros.join(", ")}]`);
      continue;
    }

    // Publicar (merge por clave — las 2 entradas del ancla comparten mesa).
    const lista =
      actas[clave] ??
      (actas[clave] = {
        idEnlace: entrada.idEnlace,
        mesa: entrada.mesa,
        fotos: {},
        impresion: entrada.impresion,
        etiquetasImpresas: {},
        barcodesImpresos: {},
      });
    if (lista.fotos[entrada.formulario]) {
      bloquear(clave, `formulario ${entrada.formulario} duplicado en el manifest`);
      delete actas[clave].fotos[entrada.formulario];
      continue;
    }
    const ordenadas = [...entrada.paginas].sort((x, y) => x.pagina - y.pagina);
    // D35 — SIN foto: cada ranura queda `null` (el largo conserva la
    // paginación real del papel; la imagen cae al placeholder/sintético).
    lista.fotos[entrada.formulario] = ordenadas.map(
      (_p): FotoActa | null => null
    );
    lista.etiquetasImpresas[entrada.formulario] = entrada.etiquetaImpresa;
    lista.barcodesImpresos[entrada.formulario] = entrada.barcodeImpreso;
    // V2-01 — el código impreso viaja con la entrada (todas las copias del
    // formulario comparten plancha; la última gana, es la misma).
    if (entrada.codigoFormaImpreso) {
      lista.codigoFormaImpreso = entrada.codigoFormaImpreso;
    }
  }

  return { actas, bloqueadas };
}

// ─── Memo en módulo (1 sola ejecución — kit §3-T3) ──────────────────────────

let RESULTADO: ResultadoIngesta | null = null;

/** Actas reales validadas + publicadas (cuarentena aparte — D25). Desde
 * D35 solo METADATOS: las fotos reales no viven en el repo. */
export function cargarActasReales(): ResultadoIngesta {
  if (!RESULTADO) RESULTADO = ingestar();
  return RESULTADO;
}
