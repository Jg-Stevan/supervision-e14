/**
 * Ingesta de las ACTAS REALES del digitalizador (kit SUP-6 §3-T3 / D24-D25).
 *
 * CONTRATO (D24): `actas-reales-manifest.json` declara las actas —
 * `idEnlace`, `mesa`, `formulario` (clave de dominio TRANSMISION |
 * DELEGADOS), `etiquetaImpresa`, `barcodeImpreso`, `impresion` (verbatim)
 * y `paginas[]`. Los assets son fotos reales de actas E-14 (documentos
 * públicos) importadas estáticamente desde `assets/`. Convención de nombre
 * (la del digitalizador): `E14_<idEnlace>_<mesa>_<PLANCHA>-<pagina>.webp`
 * (DELEGADOS queda como `DELEGADOS` o `CONSUL_EMBAJADOR` según la plancha
 * de origen — ambas son la clave de dominio DELEGADOS).
 *
 * PESO: las fotos vienen recomprimidas a WebP q75 a su ancho nativo
 * (~1.2 MB las 8, contra 1.8 MB en PNG) — el repo no carga el escaneo sin
 * comprimir.
 *
 * VALIDACIÓN (D25 a–e) de CADA acta contra el catálogo DIVIPOLA — las
 * puertas (a)/(b) por el validador ÚNICO `data/validacion-d25.ts`
 * (`validarJoinDivipola`, M13; el catálogo llega por el adaptador Result,
 * jamás lanza — C1):
 * (a) `idEnlace` existe en el catálogo; (b) `mesa` ≤ `totalMesas` del
 * puesto; (c) `formulario` es clave conocida del dominio; (d) páginas
 * 1..N completas y continuas; (e) asset importable. La que falla NO se
 * publica y queda `BLOQUEADA: <motivo>` en consola y en el reporte
 * (cuarentena); el resto sigue. Guardrail: máx 10 assets y 2 MB totales;
 * más → BLOQUEADA del manifest completo (hoy: 8 / 1.2 MB — dentro).
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

// ─── Assets (imports estáticos — Next entrega { src, width, height }) ──────

import fotoTransmision1 from "./assets/E14_88_335_005_02_001_TRANSMISION-1.webp";
import fotoTransmision2 from "./assets/E14_88_335_005_02_001_TRANSMISION-2.webp";
import fotoConsul1 from "./assets/E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.webp";
import fotoConsul2 from "./assets/E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.webp";
import fotoRoma1 from "./assets/E14_88_495_010_02_001_DELEGADOS-1.webp";
import fotoRoma2 from "./assets/E14_88_495_010_02_001_DELEGADOS-2.webp";
import fotoBarcelona1 from "./assets/E14_88_355_003_08_001_DELEGADOS-1.webp";
import fotoBarcelona2 from "./assets/E14_88_355_003_08_001_DELEGADOS-2.webp";

/** Assets importables por nombre de archivo (D24-e). */
const ASSETS: Record<string, { src: string; width: number; height: number }> = {
  "E14_88_335_005_02_001_TRANSMISION-1.webp": fotoTransmision1,
  "E14_88_335_005_02_001_TRANSMISION-2.webp": fotoTransmision2,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.webp": fotoConsul1,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.webp": fotoConsul2,
  "E14_88_495_010_02_001_DELEGADOS-1.webp": fotoRoma1,
  "E14_88_495_010_02_001_DELEGADOS-2.webp": fotoRoma2,
  "E14_88_355_003_08_001_DELEGADOS-1.webp": fotoBarcelona1,
  "E14_88_355_003_08_001_DELEGADOS-2.webp": fotoBarcelona2,
};

/**
 * Peso en bytes de cada asset (el bundle no expone el peso del import).
 * SOLO alimenta el guardrail D25; no es dato de dominio.
 */
const PESO_ASSETS: Record<string, number> = {
  "E14_88_335_005_02_001_TRANSMISION-1.webp": 160_332,
  "E14_88_335_005_02_001_TRANSMISION-2.webp": 137_352,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.webp": 173_622,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.webp": 131_546,
  "E14_88_495_010_02_001_DELEGADOS-1.webp": 170_540,
  "E14_88_495_010_02_001_DELEGADOS-2.webp": 146_792,
  "E14_88_355_003_08_001_DELEGADOS-1.webp": 170_442,
  "E14_88_355_003_08_001_DELEGADOS-2.webp": 133_140,
};

// ─── Guardrail (D25) ────────────────────────────────────────────────────────

const MAX_ASSETS = 10;
const MAX_BYTES_TOTALES = 2 * 1024 * 1024;

// ─── Contratos del loader ──────────────────────────────────────────────────

/** Acta real PUBLICADA para una mesa: fotos por formulario (índice =
 * página − 1) + encabezado impreso verbatim + etiqueta/barcode impresos
 * por formulario (del manifest — la etiqueta impresa «CÓNSUL/EMBAJADOR»
 * es la clave de dominio DELEGADOS, D24). */
export interface ActaRealLista {
  idEnlace: string;
  mesa: string;
  /** fotos[formulario][página − 1]; null/ausente → esa página cae al
   * sintético D18. */
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

/** Forma mínima de UNA entrada del manifest (D24) — null si no es válida. */
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
  paginas: { pagina: number; archivo: string }[];
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
  const paginas: { pagina: number; archivo: string }[] = [];
  for (const paginaBruta of r.paginas) {
    if (typeof paginaBruta !== "object" || paginaBruta === null) return null;
    const p = paginaBruta as Record<string, unknown>;
    if (typeof p.pagina !== "number" || !Number.isInteger(p.pagina)) return null;
    if (!esTexto(p.archivo)) return null;
    paginas.push({ pagina: p.pagina, archivo: p.archivo });
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

// ─── Ingesta (D24/D25) ──────────────────────────────────────────────────────

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

  // Guardrail D25 (ANTES de publicar nada): máx 10 assets y 2 MB totales
  // — más → BLOQUEADA del manifest completo.
  const archivosUnicos = new Set<string>();
  for (const entrada of entradas) {
    if (typeof entrada !== "object" || entrada === null) continue;
    const paginas = (entrada as { paginas?: unknown }).paginas;
    if (!Array.isArray(paginas)) continue;
    for (const pagina of paginas) {
      if (typeof pagina !== "object" || pagina === null) continue;
      const archivo = (pagina as { archivo?: unknown }).archivo;
      if (esTexto(archivo)) archivosUnicos.add(archivo);
    }
  }
  const bytesTotales = [...archivosUnicos].reduce(
    (suma, archivo) => suma + (PESO_ASSETS[archivo] ?? 0),
    0
  );
  if (archivosUnicos.size > MAX_ASSETS || bytesTotales > MAX_BYTES_TOTALES) {
    const motivo = `guardrail de assets excedido (${archivosUnicos.size} > ${MAX_ASSETS} o ${(bytesTotales / 1024 / 1024).toFixed(2)} MB > 2 MB)`;
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

    // (e) asset importable (todos los archivos de la entrada).
    const faltantes = entrada.paginas.filter((p) => !ASSETS[p.archivo]);
    if (faltantes.length > 0) {
      bloquear(
        clave,
        `(e) asset no importable: ${faltantes.map((p) => p.archivo).join(", ")}`
      );
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
    lista.fotos[entrada.formulario] = ordenadas.map((p) => {
      const asset = ASSETS[p.archivo];
      const foto: FotoActa = {
        src: asset.src,
        ancho: asset.width,
        alto: asset.height,
        archivo: p.archivo,
      };
      return foto;
    });
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

/** Actas reales validadas + publicadas (cuarentena aparte — D25). */
export function cargarActasReales(): ResultadoIngesta {
  if (!RESULTADO) RESULTADO = ingestar();
  return RESULTADO;
}
