/**
 * Ingesta de las ACTAS REALES del digitalizador (kit SUP-6 §3-T3 / D24-D25).
 *
 * CONTRATO (D24): `actas-reales-manifest.json` declara las actas —
 * `idEnlace`, `mesa`, `formulario` (clave de dominio TRANSMISION |
 * DELEGADOS), `etiquetaImpresa`, `barcodeImpreso`, `impresion` (verbatim)
 * y `paginas[]`. Los assets son PNG importados estáticamente desde
 * `assets/` (el export estático resuelve la ruta con basePath solo).
 * Convención de nombre (la del digitalizador):
 * `E14_<idEnlace con _>_<mesa>_<FORMULARIO>-<pagina>.png` (DELEGADOS
 * queda como `DELEGADOS` o `CONSUL_EMBAJADOR` según el lote de origen —
 * ambos son la clave de dominio DELEGADOS).
 *
 * VALIDACIÓN (D25 a–e) de CADA acta contra el catálogo DIVIPOLA
 * (`CARGAR_CATALOGO()` — import de solo-lectura; el adaptador NO cambia):
 * (a) `idEnlace` existe en el catálogo; (b) `mesa` ≤ `totalMesas` del
 * puesto; (c) `formulario` es clave conocida del dominio; (d) páginas
 * 1..N completas y continuas; (e) asset importable. La que falla NO se
 * publica y queda `BLOQUEADA: <motivo>` en consola y en el reporte
 * (cuarentena); el resto sigue. Guardrail: máx 10 assets y 2 MB totales;
 * más → BLOQUEADA del manifest completo (actas-reales-v2: 8 assets /
 * 1.82 MB — dentro).
 *
 * REGLA DE ORO (§0-1): la foto se UBICA, no se INTERPRETA — aquí no hay
 * OCR ni cifras de votación; solo ranuras (idEnlace + mesa + formulario
 * + página) y la información impresa del encabezado.
 *
 * Se ejecuta 1 vez (memo en módulo). Sin efecto en bundle inicial salvo
 * los 8 PNG (el loader es perezoso: lo consumen el ancla del mock, el
 * visor al abrir un acta real y la semilla del log de recepción).
 */

import type {
  FormularioTipo,
  FotoActa,
  ImpresionActa,
} from "../../domain/acta";
import { CARGAR_CATALOGO } from "../divipola-adapter";
import manifestBruto from "./actas-reales-manifest.json";

// ─── Assets (imports estáticos — Next entrega { src, width, height }) ──────

import fotoTransmision1 from "./assets/E14_88_335_005_02_001_TRANSMISION-1.png";
import fotoTransmision2 from "./assets/E14_88_335_005_02_001_TRANSMISION-2.png";
import fotoConsul1 from "./assets/E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.png";
import fotoConsul2 from "./assets/E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.png";
// actas-reales-v2 (D44): Roma - Consulado (ITALIA) y Barcelona - Girona
// (ESPAÑA) — misma convención de nombre (DELEGADOS = CÓNSUL/EMBAJADOR).
import fotoRoma1 from "./assets/E14_88_495_010_02_001_DELEGADOS-1.png";
import fotoRoma2 from "./assets/E14_88_495_010_02_001_DELEGADOS-2.png";
import fotoBarcelona1 from "./assets/E14_88_355_003_08_001_DELEGADOS-1.png";
import fotoBarcelona2 from "./assets/E14_88_355_003_08_001_DELEGADOS-2.png";

/** Assets importables por nombre de archivo (D24-e). */
const ASSETS: Record<string, { src: string; width: number; height: number }> = {
  "E14_88_335_005_02_001_TRANSMISION-1.png": fotoTransmision1,
  "E14_88_335_005_02_001_TRANSMISION-2.png": fotoTransmision2,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.png": fotoConsul1,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.png": fotoConsul2,
  "E14_88_495_010_02_001_DELEGADOS-1.png": fotoRoma1,
  "E14_88_495_010_02_001_DELEGADOS-2.png": fotoRoma2,
  "E14_88_355_003_08_001_DELEGADOS-1.png": fotoBarcelona1,
  "E14_88_355_003_08_001_DELEGADOS-2.png": fotoBarcelona2,
};

/**
 * Peso en bytes de cada asset (Anexo A, verificado con sha256sum al
 * copiar — el bundle no expone el peso del asset). SOLO alimenta el
 * guardrail D25; no es dato de dominio. actas-reales-v2 (D44): los 4
 * nuevos verificados igual al copiarlos (REPORTE-actas-reales-v2 §1).
 */
const PESO_ASSETS: Record<string, number> = {
  "E14_88_335_005_02_001_TRANSMISION-1.png": 237_038,
  "E14_88_335_005_02_001_TRANSMISION-2.png": 204_950,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.png": 262_874,
  "E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.png": 194_627,
  "E14_88_495_010_02_001_DELEGADOS-1.png": 253_534,
  "E14_88_495_010_02_001_DELEGADOS-2.png": 214_258,
  "E14_88_355_003_08_001_DELEGADOS-1.png": 254_952,
  "E14_88_355_003_08_001_DELEGADOS-2.png": 197_248,
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

  // Catálogo DIVIPOLA (solo-lectura) para las validaciones (a)/(b).
  const catalogo = new Map(CARGAR_CATALOGO().map((r) => [r.idEnlace, r]));

  const actas: Record<string, ActaRealLista> = {};

  for (let indice = 0; indice < entradas.length; indice++) {
    const entrada = validarEntrada(entradas[indice]);
    if (!entrada) {
      bloquear(`manifest.actas[${indice}]`, "entrada malformada (D24)");
      continue;
    }
    const clave = `${entrada.idEnlace}::${entrada.mesa}`;

    // (a) idEnlace existe en el catálogo.
    const registro = catalogo.get(entrada.idEnlace);
    if (!registro) {
      bloquear(clave, `(a) idEnlace "${entrada.idEnlace}" ausente en el catálogo DIVIPOLA`);
      continue;
    }

    // (b) mesa ≤ totalMesas del puesto.
    const numeroMesa = Number(entrada.mesa);
    if (
      !Number.isInteger(numeroMesa) ||
      numeroMesa < 1 ||
      numeroMesa > registro.totalMesas
    ) {
      bloquear(
        clave,
        `(b) mesa ${entrada.mesa} fuera de rango (totalMesas: ${registro.totalMesas})`
      );
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
