/**
 * Clasificador de cabecera E-14 (SPEC-e14-cabecera-clasificacion §3): extrae
 * SOLO los datos IMPRESOS del OCR (cabecera + banda + ver/pag + pie de
 * formulario — §0) y los resuelve contra la base DIVIPOL para saber dónde va
 * cada foto. Dominio E-14 NUEVO (§8: este módulo NO existe en el lab).
 *
 * Señales = anclas §3.2 (VERBATIM del spec, señales ya verificadas del
 * análisis §C páginas / §D tipo / §E ubicación — el doc `ANALISIS-e14-
 * identificacion-datos.md` referenciado por el spec no está en el repo; el
 * spec embebe las señales y es la fuente de aquí). Cada ajuste futuro a una
 * ancla DEBE llevar comentario `// Fuente:` con el texto OCR real que lo
 * justifique (§8: prohibido relajar a ciegas).
 *
 * Fuzzy §3.3: trigramas de caracteres + Dice — SIN dependencias externas.
 * Los G.2/G.3 (manuscritos) están FUERA (§0): el flujo de revisión humana
 * existente los sigue cubriendo.
 */
import type { DivipolBase } from "./divipol";
// KIT identificacion-codigo-v1 (FASE D.6/E): registro kit→mesa con guardas.
// KIT consenso-frankfurt-v1 (FASE 3, §4.2): REGISTRO_KITS para el fuzzy a
// distancia de edición 1 del consenso pie/código.
import { kitEnRegistro, REGISTRO_KITS } from "./kits";

// ---------- Tipos (§3.4) ----------

// knip C3: de-export — uso SOLO interno (ClasificacionE14.nivel, fmtClasif).
type NivelClasificacion = "AUTO" | "SUGERIDA" | "MANUAL";

/** Tipo de copia leído de la BANDA (§D.1 — sin tilde: es el literal OCR). */
export type TipoCopia = "TRANSMISION" | "DELEGADOS";

export interface ClasificacionE14 {
  departamento: { codigo: string; nombre: string } | null;
  municipio: { codigo: string; nombre: string } | null;
  zona: { codigo: string } | null;
  puesto: { codigo: string; nombre: string } | null;
  mesa: number | null;
  tipo: TipoCopia | null;
  /** Del «Ver/Pag/de» (§C). */
  pagina: { index: number; total: number } | null;
  /** KIT del pie (§G.4.5: forma parte del nombre de export). */
  kit: number | null;
  nivel: NivelClasificacion;
  confianzas: { departamento: number; municipio: number; puesto: number; tipo: number };
  /** §D2 (SPEC-e14-score-ocr): lecturas CRUDAS display-only — cabecera E-14
   *  matcheada, MESA de ANCLA_MESA y tipo de banda. NO se validan contra
   *  divipol, NO afectan niveles AUTO/SUGERIDA/MANUAL ni el panel §5 —
   *  alimentan la señal de contenido del score (§D1) y el chip MESA parcial
   *  de REVISIÓN. Opcional: las construcciones manuales (panel) no lo llevan. */
  parciales?: { cabecera: boolean; mesa: number | null; tipo: TipoCopia | null };
  /** KIT identificacion-codigo-v1 (FASE D.2, display): consenso del código
   *  1D parseado con la gramática completa (codigoUnicoE14) — null si no
   *  hay código legible o los candidatos no acuerdan. NO decide envío. */
  codigoUnico?: CodigoUnicoE14 | null;
  /** KIT identificacion-codigo-v1 (FASE D, display+traza): avisos de los
   *  cruces — BANDA_CODIGO_DISCREPAN · VERPAG_CODIGO_DISCREPAN ·
   *  MESA_POR_KIT · KIT_OTRA_RUTA · KIT_MESA_FUERA_RANGO ·
   *  CODIGO_1D_INCONSISTENTE. KIT consenso-frankfurt-v1 (FASE 3): NUEVOS —
   *  PIE_CODIGO_DISCREPAN · KIT_CODIGO_CORREGIDO · MESA_FUERA_RANGO ·
   *  MESA_REGISTRO_DISCREPAN (reemplaza a MESA_KIT_DISCREPAN: mismo
   *  disparador + baja AUTO→SUGERIDA — §4.3.2). */
  avisos?: string[];
  /** KIT consenso-frankfurt-v1 (FASE 3, §4.2 + FASE 5): procedencia REAL del
   *  kit ganador tras el arbitraje pie/código — el pie impreso (PIE), el
   *  consenso del código 1D (CODIGO) o el registro a distancia de edición 1
   *  (REGISTRO). null sin kit. Display-only (chip de ID de REVISIÓN). */
  kitFuente?: "PIE" | "CODIGO" | "REGISTRO" | null;
  /** KIT e63f-autoenvio-v1 (F0 — balde fino, solo-aditivo, contrato D51):
   *  motivo EXACTO por el que el nivel NO fue AUTO, calculado de variables ya
   *  existentes (cero recomputo). Valores: "puesto-lugar" | "tipo" |
   *  "mesa-registro" | "ruta". null = AUTO o sin motivo de los listados (el
   *  score NO es un motivo de clasificación — kit §2.1). Opcional: los
   *  consumidores pre-e63f lo tragan sin error. */
  clasifDebil?: string | null;
}

/** Regla de dominio E-14 (§4.5): la cabecera debe decir E-14/REGISTRADURÍA.
 *  Ya NO decide sola el estado del gate — solo traza/log + piso SUGERIDA. */
export const PATRON_CABECERA = /E\s*-\s*14|REGISTRADURIA|REGISTRADURÍA/i;

// ---------- Normalización (§3.1) ----------

/** Nombres: NFKD → quitar diacríticos → MAYÚSCULAS → colapsar espacios → recortar. */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** KIT e63f-autoenvio-v1 (F1a): normalización OCR-aware de NOMBRES — EXCLUSIVA
 *  de la verificación LUGAR (regla 4). Hereda normalizarNombre (NFKD, sin
 *  diacríticos, MAYÚSCULAS, espacios colapsados) y añade:
 *  (1) guiones/underscores/puntuación → espacio — el E-14 imprime
 *      «El Cairo - Consulado» con variantes de guion que el OCR come o
 *      duplica («CALRO-CONSULADO» vs «CAIRO - CONSULADO»);
 *  (2) equivalencia I ↔ L SOLO a efectos de comparación, aplicada a AMBOS
 *      lados (canónica simétrica): el error real del informe 120553 es
 *      «CALRO» vs «CAIRO» y «EI» vs «EL» — exactamente I↔L.
 *  RED LINE 3 del kit: normalizarNombre queda BYTE-IDÉNTICO en todo lo demás
 *  (resoluciones dep/mun/puesto, rescate global, desambiguaciones). */
export function normalizarNombreLugar(s: string): string {
  return normalizarNombre(s)
    .replace(/[^A-Z0-9]+/g, " ")
    .replaceAll("I", "L")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mapa de confusión OCR para tokens NUMÉRICOS (§3.1) — SOLO dentro de
 *  tokens que deban ser números; NUNCA aplicarlo a nombres. */
const MAPA_CONFUSION_OCR: Record<string, string> = {
  O: "0",
  Q: "0",
  I: "1",
  L: "1",
  S: "5",
  B: "8",
};

/** Códigos: MAYÚSCULAS + mapa de confusión (la evidencia OCR actual lee los
 *  dígitos limpios — p. ej. «CONSULADO: 88 - CONSULADOS», «MESA: 012» — el
 *  mapa queda aplicado defensivamente para lecturas futuras con letras). */
// knip C3 (refactor/runner-logger-v1): de-export — uso SOLO interno
// (5 llamadas en este archivo; cero consumidores externos, cero anclas QA).
function normalizarCodigo(s: string): string {
  return s
    .toUpperCase()
    .trim()
    .replace(/[OQILSB]/g, (c) => MAPA_CONFUSION_OCR[c] ?? c);
}

// ---------- Fuzzy (§3.3: trigramas de caracteres + Dice) ----------

function trigramas(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length === 0) return out;
  if (s.length < 3) {
    out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - 3; i += 1) out.add(s.slice(i, i + 3));
  return out;
}

/** Similitud Dice sobre trigramas: 2·|A∩B| / (|A|+|B|). */
export function similitud(a: string, b: string): number {
  const A = trigramas(a);
  const B = trigramas(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let interseccion = 0;
  for (const t of A) if (B.has(t)) interseccion += 1;
  return (2 * interseccion) / (A.size + B.size);
}

// ---------- Anclas de extracción (§3.2 — VERBATIM del spec) ----------

const ANCLA_DEPARTAMENTO = /^\s*(DEPARTAMENTO|CONSULADO)\s*[:.]?\s*(\d{1,2})?\s*[-–—]?\s*([A-ZÁÉÍÓÚÑÜ .'-]{3,})?/im;
const ANCLA_PAIS = /^\s*(PA[IÍ]S|MUNICIPIO)\s*[:.]?\s*(\d{1,3})?\s*[-–—]?\s*([A-ZÁÉÍÓÚÑÜ .'-]{3,})?/im;
const ANCLA_ZONA = /ZONA\s*[:.]?\s*(\d{1,2}|URBANA|RURAL)/im;
const ANCLA_PUESTO = /PUESTO\s*[:.]?\s*(\d{1,2})/im;
// §3b.2 (SPEC-e14-score-ocr Rev. 2): ancla MESA tolerante a la confusión M→N
// del OCR — con el texto REAL de la acta cortada del chip MEDIO se leyó
// «NESA. 001» (M→N) y la mesa se perdía. // Fuente: «05 PUESTO: 02 NESA. 001»
// (OCR real del asset intermedia viejo). La validación 1≤mesa≤countTable
// (regla 5) NO cambia; otras confusiones NO se tocan (riesgo de falsos
// positivos: [MN]ESA solo matchea MESA/NESA, secuencias inexistentes en
// castellano).
const ANCLA_MESA = /[MN]ESA\s*[:.Nº#]?\s*(\d{1,3})/im;
const ANCLA_LUGAR = /LUGAR\s*[:.]?\s*([A-ZÁÉÍÓÚÑÜ0-9().,\-' ]{3,})/im;
const ANCLA_VERPAG = /Ver\.?\s*:?\s*(\d{1,2})\s*Pag\.?\s*:?\s*(\d{1,2})\s*de\s*(\d{1,2})/i;
const ANCLA_KIT = /KIT\s*(\d{1,6})/i;
const ANCLA_FORM = /No\.?\s*Form\.?\s*:?\s*(\d{1,6})/i;

// Código 1D IMPRESO debajo del barcode (ANALISIS §D.2/§F — 8/8 muestras):
// 15 dígitos · d9: 3=TRANSMISIÓN, 2=CÓNSUL/EMBAJADOR · d12-13: página ·
// d14-15: total. Evidencia en vivo: «710003993010102» → d9=3 (T), d12-15=01/02.
const ANCLA_CODIGO_1D = /\b(\d{15})\b/g;

// ---------------------------------------------------------------------------
// KIT identificacion-codigo-v1 (FASE C, Task 120) — gramática COMPLETA del
// código 1D impreso. // Fuente: ANALISIS §1 (docs/research/
// PATRON-identificacion-actas-e14.md) — gramática cerrada VERIFICADA 12/12
// con actas oficiales del visor Registraduría:
//   7100 | KIT(4) | TIPO(1: 2=DELEGADOS, 3=TRANSMISION) | VER(2) | PAG(2) | TOTAL(2).
// Ejemplos reales: «710003992010102» → kit 399, DELEGADOS, ver 01, pág 1 de 2;
// «710003993010102» → el MISMO kit 399, TRANSMISION (misma mesa, otra copia).
// ---------------------------------------------------------------------------

// knip C3: de-export — uso SOLO interno (codigoUnicoE14/consenso viajan
// estructuralmente; nadie importa el tipo por nombre).
interface CodigoUnicoE14 {
  crudo: string;
  kit: number;
  tipoDigito: "2" | "3";
  ver: number;
  pagina: number;
  total: number;
}

/** Parseo TOTAL del código de 15 dígitos (prefijo + aritmética). null si
 *  cualquiera de las reglas falla — la llamada decide qué hacer (consenso). */
export function codigoUnicoE14(crudo: string): CodigoUnicoE14 | null {
  if (!/^\d{15}$/.test(crudo)) return null;
  if (crudo.slice(0, 4) !== "7100") return null;
  const d9 = crudo[8];
  if (d9 !== "2" && d9 !== "3") return null;
  const ver = parseInt(crudo.slice(9, 11), 10);
  const pagina = parseInt(crudo.slice(11, 13), 10);
  const total = parseInt(crudo.slice(13, 15), 10);
  const kit = parseInt(crudo.slice(4, 8), 10);
  if (!Number.isFinite(kit) || kit < 1) return null;
  if (!(ver >= 1 && ver <= 99)) return null;
  if (!(pagina >= 1 && total >= pagina && total <= 9)) return null;
  return { crudo, kit, tipoDigito: d9, ver, pagina, total };
}

/** d9 → tipo de copia (2=CÓNSUL/EMBAJADOR/DELEGADOS · 3=TRANSMISIÓN). */
export function tipoDeDigito(d: "2" | "3"): TipoCopia {
  return d === "3" ? "TRANSMISION" : "DELEGADOS";
}

/** Todas las subcadenas de largo exacto n (§4.1 del kit consenso-frankfurt). */
function ventanasDe(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= s.length; i += 1) out.push(s.slice(i, i + n));
  return out;
}

/**
 * KIT consenso-frankfurt-v1 (FASE 3, §4.1): candidatos del código 1D
 * tolerantes al «7» impreso como «/» y a espacios.
 * // Fuente: §0-F4 — Frankfurt «/1000/453010202» = 7100|0745|3|01|02|02:
 * la fuente de puntos del impreso renderiza el «7» como «/» y el OCR mete
 * espacios («71009 453010202»), ANCLA_CODIGO_1D (\d{15}, QUE QUEDA como
 * está — §7) nunca matchea → consenso null. Genera candidatos de 15
 * caracteres sobre secuencias pegadas de [\d/ ] SIN espacios y con
 * «/»→«7». Los candidatos puros \d{15} ya los cubre ANCLA_CODIGO_1D.
 */
export function candidatosCodigo1D(texto: string): string[] {
  const out = new Set<string>();
  for (const m of texto.matchAll(/[0-9/][0-9/ ]{13,19}[0-9/]/g)) {
    const pegado = m[0].replace(/ /g, "");
    for (const w of ventanasDe(pegado, 15)) {
      if (w.includes("/")) out.add(w.replaceAll("/", "7"));
    }
  }
  return [...out];
}

// BANDA (tipo copia, §D.1): señal primaria — CLAVEROS existe pero NO se archiva.
// CORRECCIÓN con evidencia (captura del dueño 2026-10-10): el `C[OÓ]NSUL` suelto
// matcheaba la caja impresa «CONSULADO: 88 - CONSULADOS» (presente en TODAS las
// copias de consulado) y marcaba DELEGADOS falso en un acta TRANSMISIÓN. La
// banda de delegados imprime el literal «CÓNSUL/EMBAJADOR» (ANALISIS §D.1) →
// EMBAJADOR ya la cubre sin colisionar con la caja del encabezado.
const BANDA_TRANSMISION = /TRANSMISI[OÓ]N/;
const BANDA_DELEGADOS = /EMBAJADOR|DELEGADOS/;

/**
 * KIT consenso-frankfurt-v1 (FASE 4, §5.1): cascada de banda EXTRAÍDA —
 * TRANSMISIÓN primero, DELEGADOS después (mismos regex BANDA_TRANSMISION /
 * BANDA_DELEGADOS byte a byte). El bridge la consulta ANTES de
 * clasificarCabecera para decidir la segunda pasada OCR dirigida del sello
 * (§5: solo cuando la banda no se leyó).
 */
export function tipoDeBanda(texto: string): TipoCopia | null {
  if (BANDA_TRANSMISION.test(texto)) return "TRANSMISION";
  if (BANDA_DELEGADOS.test(texto)) return "DELEGADOS";
  return null;
}

// ---------- Umbrales (§3.3) ----------

const UMBRAL_AUTO = 0.82;
const UMBRAL_SUGERIDA = 0.6;
/** LUGAR muy distinto del standName del puesto elegido (regla 4 §3.3). */
const UMBRAL_VERIFICACION_LUGAR = 0.55;

interface Mejor<T> {
  candidato: T;
  sim: number;
}

function mejorPorNombre<T>(candidatos: T[], nombre: (c: T) => string, leido: string): Mejor<T> | null {
  let mejor: Mejor<T> | null = null;
  for (const c of candidatos) {
    const sim = similitud(leido, normalizarNombre(nombre(c)));
    if (!mejor || sim > mejor.sim) mejor = { candidato: c, sim };
  }
  return mejor;
}

/** Puestos candidatos de un municipio (con su zona — para deducirla §3.3
 *  regla 4 cuando el ZONA leído no existe o no se leyó). */
interface PuestoCandidato {
  zon: string;
  std: string;
  nombre: string;
  mesas: number;
}

function puestosDelMunicipio(base: DivipolBase, dep2: string, mun3: string): PuestoCandidato[] {
  const zonas = base[dep2]?.m?.[mun3]?.z ?? {};
  const out: PuestoCandidato[] = [];
  for (const [zon, z] of Object.entries(zonas)) {
    for (const [std, p] of Object.entries(z.s ?? {})) {
      out.push({ zon, std, nombre: p.n, mesas: p.t });
    }
  }
  return out;
}

function numeroLimpio(crudo: string): number {
  const n = parseInt(normalizarCodigo(crudo), 10);
  return Number.isFinite(n) ? n : Number.NaN;
}

// ---------- Regla 4b (§3b.1 SPEC-e14-score-ocr Rev. 2): rescate global
// ---------- por NOMBRE del puesto ----------

/** Entrada del índice global: un puesto con su RUTA completa. */
interface PuestoGlobal {
  dep2: string;
  mun3: string;
  zon: string;
  std: string;
  nombre: string;
}

/** Índice invertido de trigramas de los nombres de TODOS los puestos
 *  (14.438) — se construye UNA vez (lazy) SOLO cuando la regla 4b corre
 *  (cascada sin resolver → costo CERO en capturas resueltas, §3b.1). Un
 *  candidato con similitud > 0 comparte ≥1 trigrama con la línea → los que
 *  no comparten ninguno tienen sim 0 (bajo UMBRAL_SUGERIDA) y se saltan sin
 *  costo. Cacheado por identidad de la base (cargarDivipol la cachea en
 *  memoria; una base distinta en pruebas reconstruye). */
interface IndicePuestos {
  base: DivipolBase;
  entradas: PuestoGlobal[];
  porTrigrama: Map<string, number[]>;
}
let indicePuestos: IndicePuestos | null = null;
function indicePuestosGlobal(base: DivipolBase): IndicePuestos {
  if (indicePuestos?.base === base) return indicePuestos;
  const entradas: PuestoGlobal[] = [];
  const porTrigrama = new Map<string, number[]>();
  for (const [dep2, d] of Object.entries(base)) {
    for (const [mun3, m] of Object.entries(d.m ?? {})) {
      for (const [zon, z] of Object.entries(m.z ?? {})) {
        for (const [std, p] of Object.entries(z.s ?? {})) {
          const nombre = normalizarNombre(p.n);
          const i = entradas.length;
          entradas.push({ dep2, mun3, zon, std, nombre });
          for (const t of trigramas(nombre)) {
            const bucket = porTrigrama.get(t);
            if (bucket) bucket.push(i);
            else porTrigrama.set(t, [i]);
          }
        }
      }
    }
  }
  indicePuestos = { base, entradas, porTrigrama };
  return indicePuestos;
}

/** Gap mínimo sobre el 2º mejor puesto para aceptar el rescate (§3b.1:
 *  «exigir gap con el 2º» — con 2+ candidatos cercanos queda null/MANUAL,
 *  mismo patrón de la regla 3 de municipios). Evidencia de calibración: el
 *  mejor match único del caso medio viejo (EL CAIRO - CONSULADO, 0.92) deja
 *  a los LUNES/MARTES… EL CAIRO - CONSULADO abajo por el prefijo del día. */
const GAP_RESCATE = 0.05;

/** Rescate global por NOMBRE (§3b.1): escanea las líneas del OCR
 *  (normalizadas, ≥4 chars) contra TODOS los puestos de la base con
 *  `similitud` (trigramas ya existentes). Devuelve el mejor puesto con su
 *  ruta y sim SOLO si: mejor ≥ UMBRAL_SUGERIDA y gap ≥ 0.05 sobre el 2º
 *  (puesto DISTINTO; el mismo puesto evaluado con varias líneas cuenta una
 *  vez — máx). Con 2+ cercanos o nada reconocible → null (MANUAL, lista en
 *  panel §5). */
function rescatarRutaPorNombreGlobal(
  texto: string,
  base: DivipolBase,
): (PuestoGlobal & { sim: number }) | null {
  const lineas = (texto ?? "")
    .split(/\n+/)
    .map((l) => normalizarNombre(l))
    .filter((l) => l.length >= 4);
  if (lineas.length === 0) return null;
  const indice = indicePuestosGlobal(base);
  // Mejor sim por puesto (índice) a través de TODAS las líneas.
  const mejores = new Map<number, number>();
  for (const linea of lineas) {
    const candidatos = new Set<number>();
    for (const t of trigramas(linea)) {
      const bucket = indice.porTrigrama.get(t);
      if (bucket) for (const i of bucket) candidatos.add(i);
    }
    for (const i of candidatos) {
      const sim = similitud(linea, indice.entradas[i].nombre);
      const prev = mejores.get(i) ?? -1;
      if (sim > prev) mejores.set(i, sim);
    }
  }
  let mejorIdx = -1;
  let mejorSim = 0;
  let segundaSim = 0;
  for (const [i, sim] of mejores) {
    if (sim > mejorSim) {
      segundaSim = mejorSim;
      mejorSim = sim;
      mejorIdx = i;
    } else if (sim > segundaSim) {
      segundaSim = sim;
    }
  }
  if (mejorIdx < 0 || mejorSim < UMBRAL_SUGERIDA) return null;
  if (mejorSim - segundaSim < GAP_RESCATE) return null;
  return { ...indice.entradas[mejorIdx], sim: mejorSim };
}

// ---------- Clasificación (§3.4) ----------

/**
 * KIT actas-vivas-paginas-v1 (FASE B): página desde el código 1D impreso
 * (d12-13 índice · d14-15 total — ANALISIS §D.2; El Cairo 710003903010102 →
 * 01/02, Frankfurt 710007453010202 → 02/02). Devuelve null si la aritmética
 * no cuadra (idx ≥ 1 · tot ≥ idx · tot ≤ 9) — la página es DATO: sin señal
 * honesta se declara DESCONOCIDA, jamás se asume P1.
 */
function paginaDesdeCodigo1D(codigo: string): { index: number; total: number } | null {
  const idx = parseInt(codigo.slice(11, 13), 10);
  const tot = parseInt(codigo.slice(13, 15), 10);
  return Number.isFinite(idx) && Number.isFinite(tot) && idx >= 1 && tot >= idx && tot <= 9
    ? { index: idx, total: tot }
    : null;
}

/**
 * KIT consenso-frankfurt-v1 (FASE 3, §4.2): kit del MISMO municipio a
 * «distancia de edición 1» — misma longitud y los dígitos que difieren
 * corresponden a UNA sola sustitución (un par leído→real constante).
 * // Fuente: §0-F3 — El Cairo impreso real 710003993010102, el OCR leyó
 * 710003003010102: los DOS 9 del kit se leyen 0 → 300↔399 es UNA edición
 * (el ejemplo del kit); un dígito distinto es el caso mínimo. 2+ pares
 * distintos o longitudes distintas → null (ambiguo: NO se inventa).
 * Helper local ~8 líneas — PROHIBIDO levenshtein general o dependencias
 * (§4.2). Si hay 2+ kits candidatos → null (sin inventar).
 */
function kitADistancia1(mun: string | null, kit: number): number | null {
  if (!mun || !Number.isFinite(kit)) return null;
  const leido = String(kit);
  let unico: number | null = null;
  for (const r of REGISTRO_KITS) {
    if (r.mun !== mun || r.kit === kit) continue;
    const real = String(r.kit);
    if (real.length !== leido.length) continue;
    let par: [string, string] | null = null; // [leído, real]
    let unaEdicion = true;
    for (let i = 0; i < leido.length; i += 1) {
      if (leido[i] === real[i]) continue;
      if (par === null) par = [leido[i], real[i]];
      else if (par[0] !== leido[i] || par[1] !== real[i]) {
        unaEdicion = false;
        break;
      }
    }
    if (!unaEdicion || par === null) continue;
    if (unico !== null && unico !== r.kit) return null; // 2+ candidatos
    unico = r.kit;
  }
  return unico;
}

/**
 * Clasifica la cabecera IMPRESA de un acta a partir de su OCR completo.
 * Los anclas que no matchean son normales (campo ausente → baja a
 * fuzzy/manual, §3.2): NUNCA lanza, siempre devuelve un veredicto.
 */
export function clasificarCabecera(ocrTexto: string, base: DivipolBase): ClasificacionE14 {
  const texto = ocrTexto ?? "";

  // ---- Anclas §3.2 (primera aparición; evidencia: OCR real del acta
  // Frankfurt incluida — «CONSULADO: 88 - CONSULADOS», «PAIS: 120 -
  // ALEMANIA», «ZONA: 18 PUESTO: 02 MESA: 012», «LUGAR: Frankfurt
  // Consulaco», «TRANSMISIÓN», «KIT 745»). ----
  const mDep = texto.match(ANCLA_DEPARTAMENTO);
  const mPais = texto.match(ANCLA_PAIS);
  const mZona = texto.match(ANCLA_ZONA);
  const mPuesto = texto.match(ANCLA_PUESTO);
  const mMesa = texto.match(ANCLA_MESA);
  const mLugar = texto.match(ANCLA_LUGAR);
  const mVerPag = texto.match(ANCLA_VERPAG);
  const mKit = texto.match(ANCLA_KIT);
  const mForm = texto.match(ANCLA_FORM);

  // Códigos con ancho fijo de la base (dep 2 · mun 3 · zon 2 · std 2).
  const depCodLeido = mDep?.[2] ? normalizarCodigo(mDep[2]).padStart(2, "0") : null;
  const depNomLeido = mDep?.[3] ? normalizarNombre(mDep[3]) : null;
  const munCodLeido = mPais?.[2] ? normalizarCodigo(mPais[2]).padStart(3, "0") : null;
  const munNomLeido = mPais?.[3] ? normalizarNombre(mPais[3]) : null;
  // ZONA: URBANA/RURAL es señal de tipo de zona, no un código → no resuelve.
  const zonaLeida =
    mZona && /^\d/.test(mZona[1]) ? normalizarCodigo(mZona[1]).padStart(2, "0") : null;
  const puestoCodLeido = mPuesto?.[1] ? normalizarCodigo(mPuesto[1]).padStart(2, "0") : null;
  const mesaLeida = mMesa ? numeroLimpio(mMesa[1]) : null;
  const lugarLeido = mLugar?.[1] ? normalizarNombre(mLugar[1]) : null;

  // ---- PÁGINA (§C): «Ver/Pag/de» impreso primero; respaldo d12-13/d14-15 del
  //      código 1D impreso (ANALISIS §D.2 — «710003993010102» → 01/02 = «1 de 2»,
  //      verificado en vivo con el OCR del dueño). KIT actas-vivas-paginas-v1
  //      (FASE B): los candidatos se prueban EN ORDEN y gana el PRIMERO cuya
  //      aritmética cuadre — exigir UN único código de 15 dígitos limpio era
  //      frágil (el OCR puede arrastrar códigos remanentes y la pág real del
  //      Frankfurt «Ver. 01 Pag: 2 de 2» se perdía → hueco P1 mentiroso).
  //      Ninguno cuadra → null (página DESCONOCIDA — hueco al primer libre). ----
  const codigos1DPuros = [...texto.matchAll(ANCLA_CODIGO_1D)].map((m) => m[1]);
  // KIT consenso-frankfurt-v1 (FASE 3, §4.1): la lista del consenso pasa a
  // ser la UNIÓN de ANCLA_CODIGO_1D + candidatosCodigo1D (Set, primero los
  // puros) — ANCLA_CODIGO_1D queda byte a byte (§7): se AÑADEN candidatos,
  // no se relajan reglas. El consenso de abajo (todos acuerdan) SIN CAMBIO.
  const codigos1D = [...new Set([...codigos1DPuros, ...candidatosCodigo1D(texto)])];

  // ---- KIT identificacion-codigo-v1 (FASE D.1): CONSENSO del código 1D —
  //      cada candidato se parsea con la gramática COMPLETA
  //      (codigoUnicoE14, FASE C). ≥1 parsea y TODOS acuerdan
  //      (kit, tipoDigito, pagina, total) → consenso; difieren → consenso
  //      null + traza CODIGO_1D_INCONSISTENTE (no se adivina cuál es el
  //      bueno: los consumidores ven el aviso y las reglas viejas siguen). ----
  const parseados = codigos1D
    .map((codigo) => codigoUnicoE14(codigo))
    .filter((c): c is CodigoUnicoE14 => c !== null);
  let consenso: CodigoUnicoE14 | null = null;
  if (parseados.length >= 1) {
    const primero = parseados[0];
    const acuerdan = parseados.every(
      (c) =>
        c.kit === primero.kit &&
        c.tipoDigito === primero.tipoDigito &&
        c.pagina === primero.pagina &&
        c.total === primero.total,
    );
    if (acuerdan) consenso = primero;
  }
  const avisos: string[] = [];
  if (parseados.length >= 1 && consenso === null) avisos.push("CODIGO_1D_INCONSISTENTE");

  // ---- PÁGINA (§C): «Ver/Pag/de» impreso primero; respaldo d12-13/d14-15 del
  //      código 1D impreso (ANALISIS §D.2 — «710003993010102» → 01/02 = «1 de 2»,
  //      verificado en vivo con el OCR del dueño). KIT actas-vivas-paginas-v1
  //      (FASE B): los candidatos se prueban EN ORDEN y gana el PRIMERO cuya
  //      aritmética cuadre — exigir UN único código de 15 dígitos limpio era
  //      frágil (el OCR puede arrastrar códigos remanentes y la pág real del
  //      Frankfurt «Ver. 01 Pag: 2 de 2» se perdía → hueco P1 mentiroso).
  //      Ninguno cuadra → null (página DESCONOCIDA — hueco al primer libre).
  //      KIT identificacion-codigo-v1 (FASE D.4): el consenso del código 1D
  //      cruza contra VerPag — discrepancia → gana el CÓDIGO (impreso OCR-B
  //      más fiable: sale del mismo sistema que el barcode) + aviso; VerPag
  //      ausente → consenso (misma validación, ahora con prefijo+kit). ----
  const paginaVerPag =
    mVerPag && Number.isFinite(numeroLimpio(mVerPag[2]))
      ? {
          // FIX (auditoría 2-a C1): index = grupo 2 (Pág) — el grupo 1 es
          // «Ver» (versión de diagramación, SIEMPRE 01). El swap fabricaba
          // «PÁG 1/2» en toda pág 2 sin código 1D (hueco P1 mentiroso —
          // el bug del dueño 16-oct que el kit decía curado) y el aviso
          // VERPAG_CODIGO_DISCREPAN espurio cuando el código SÍ se leía.
          index: Math.max(1, numeroLimpio(mVerPag[2]) || 1),
          total: Math.max(1, numeroLimpio(mVerPag[3]) || 2),
        }
      : null;
  const pagConsenso: { index: number; total: number } | null = consenso
    ? { index: consenso.pagina, total: consenso.total }
    : null;
  let pagina: { index: number; total: number } | null = paginaVerPag;
  if (paginaVerPag && pagConsenso) {
    if (paginaVerPag.index !== pagConsenso.index || paginaVerPag.total !== pagConsenso.total) {
      pagina = pagConsenso;
      avisos.push("VERPAG_CODIGO_DISCREPAN");
    }
  } else if (pagConsenso) {
    pagina = pagConsenso;
  } else if (!paginaVerPag) {
    pagina = codigos1D
      .map((codigo) => paginaDesdeCodigo1D(codigo))
      .find((p) => p !== null) ?? null;
  }
  // ---- KIT (pie — §3.2): el ARBITRAJE pie↔código↔registro vive ABAJO
  //      (KIT consenso-frankfurt-v1, FASE 3 §4.2) — necesita el municipio
  //      FINAL (cascada + rescate 4b) para consultar el registro. Aquí solo
  //      se capturan las lecturas crudas del pie. ----
  const mKitPie =
    mKit && Number.isFinite(numeroLimpio(mKit[1]))
      ? numeroLimpio(mKit[1])
      : mForm && Number.isFinite(numeroLimpio(mForm[1]))
        ? numeroLimpio(mForm[1])
        : null;

  // ---- TIPO (banda §D.1 — orden del spec: TRANSMISIÓN primero, DELEGADOS
  //      solo si la banda de transmisión NO aparece — FASE 4 §5.1: cascada
  //      extraída a tipoDeBanda, mismos regex byte a byte). Respaldo §D.2:
  //      dígito 9 del código 1D impreso (3=TRANSMISIÓN, 2=DELEGADOS) SOLO si
  //      la banda no se leyó; confianza 0.9 (señal impresa verificada 8/8,
  //      §F). ----
  let tipo: TipoCopia | null = null;
  let confianzaTipo = 0;
  const banda = tipoDeBanda(texto);
  if (banda !== null) {
    tipo = banda;
    confianzaTipo = 1;
  } else {
    const codigos = [...texto.matchAll(ANCLA_CODIGO_1D)].map((m) => m[1]);
    if (codigos.length >= 1) {
      const novenos = new Set(codigos.map((c) => c[8]));
      if (novenos.size === 1 && (novenos.has("3") || novenos.has("2"))) {
        tipo = novenos.has("3") ? "TRANSMISION" : "DELEGADOS";
        confianzaTipo = 0.9;
      }
    }
  }

  // ---- KIT identificacion-codigo-v1 (FASE D.3): cruce banda↔código —
  //      banda presente Y consenso presente Y tipoDeDigito(d9) ≠ tipo de la
  //      banda → la banda SIGUE ganando (nivel sin cambio, §6 inmutables)
  //      pero confianza tipo 0.75 + aviso display (ANALISIS §2: regla para
  //      discrepancia — el kit 399 de EL CAIRO trae las DOS copias de la
  //      misma mesa con d9 distinto: 2=delegados, 3=transmisión). ----
  if (tipo !== null && consenso && tipoDeDigito(consenso.tipoDigito) !== tipo) {
    confianzaTipo = 0.75;
    avisos.push("BANDA_CODIGO_DISCREPAN");
  }

  // ---- DEPARTAMENTO (§3.3 regla 1-2) ----
  let departamento: ClasificacionE14["departamento"] = null;
  let confDep = 0;
  let depResuelto = false;
  if (depCodLeido && base[depCodLeido]) {
    departamento = { codigo: depCodLeido, nombre: base[depCodLeido].n };
    confDep = 1;
    depResuelto = true;
  } else if (depNomLeido) {
    const deps = Object.entries(base).map(([codigo, d]) => ({ codigo, nombre: d.n }));
    const mejor = mejorPorNombre(deps, (d) => d.nombre, depNomLeido);
    if (mejor && mejor.sim >= UMBRAL_SUGERIDA) {
      departamento = { codigo: mejor.candidato.codigo, nombre: mejor.candidato.nombre };
      confDep = mejor.sim;
      depResuelto = mejor.sim >= UMBRAL_AUTO;
    }
  }

  // ---- MUNICIPIO (§3.3 regla 1-2; regla 3 si no hay departamento) ----
  let municipio: ClasificacionE14["municipio"] = null;
  let confMun = 0;
  let munResuelto = false;
  if (departamento) {
    const muns = base[departamento.codigo]?.m ?? {};
    if (munCodLeido && muns[munCodLeido]) {
      municipio = { codigo: munCodLeido, nombre: muns[munCodLeido].n };
      confMun = 1;
      munResuelto = true;
    } else if (munNomLeido) {
      const lista = Object.entries(muns).map(([codigo, m]) => ({ codigo, nombre: m.n }));
      const mejor = mejorPorNombre(lista, (m) => m.nombre, munNomLeido);
      if (mejor && mejor.sim >= UMBRAL_SUGERIDA) {
        municipio = { codigo: mejor.candidato.codigo, nombre: mejor.candidato.nombre };
        confMun = mejor.sim;
        munResuelto = mejor.sim >= UMBRAL_AUTO;
      }
    }
  } else if (munCodLeido || munNomLeido) {
    // Regla 3: municipio sin departamento legible — global en toda la base
    // (los códigos/nombres se repiten entre departamentos: 2+ → MANUAL, el
    // panel de corrección muestra la lista).
    const candidatos: Array<{ dep2: string; depNombre: string; mun3: string; munNombre: string }> = [];
    for (const [dep2, d] of Object.entries(base)) {
      for (const [mun3, m] of Object.entries(d.m ?? {})) {
        if (munCodLeido && mun3 === munCodLeido) {
          candidatos.push({ dep2, depNombre: d.n, mun3, munNombre: m.n });
        } else if (!munCodLeido && munNomLeido && similitud(munNomLeido, normalizarNombre(m.n)) >= UMBRAL_AUTO) {
          candidatos.push({ dep2, depNombre: d.n, mun3, munNombre: m.n });
        }
      }
    }
    if (candidatos.length === 1) {
      const unico = candidatos[0];
      municipio = { codigo: unico.mun3, nombre: unico.munNombre };
      confMun = munCodLeido ? 1 : UMBRAL_AUTO;
      munResuelto = true;
      // Departamento DEDUCIDO (único en toda la base).
      departamento = { codigo: unico.dep2, nombre: unico.depNombre };
      confDep = munCodLeido ? 0.9 : UMBRAL_AUTO;
      depResuelto = true;
    }
    // 2+ candidatos (o 0): municipio null → MANUAL con lista (panel §5).
  }

  // ---- ZONA (código exacto bajo dep+mun; si no existe — p. ej. OCR
  //      «ZONA: 18» cuando ALEMANIA solo tiene 05/15 — queda pendiente y la
  //      deduce la resolución del puesto por LUGAR, regla 4). ----
  let zona: ClasificacionE14["zona"] = null;
  if (
    departamento &&
    municipio &&
    zonaLeida &&
    base[departamento.codigo]?.m?.[municipio.codigo]?.z?.[zonaLeida]
  ) {
    zona = { codigo: zonaLeida };
  }

  // ---- PUESTO (regla 4: preferir PUESTO numérico; LUGAR como
  //      verificación/desambiguación; deduce zona si faltaba). ----
  let puesto: ClasificacionE14["puesto"] = null;
  let confPuesto = 0;
  let puestoResuelto = false;
  // e63f F0: el cap de la verificación LUGAR DISPARÓ (balde fino
  // "puesto-lugar" — el informe TOTALES y el contador fine lo consumen).
  let capLugarAplicado = false;
  // e63f F1b: ¿el puesto quedó resuelto POR CÓDIGO (no por nombre)? Solo esa
  // vía puede frenar el cap de la verificación LUGAR con el kit del registro.
  let puestoPorCodigo = false;
  if (departamento && municipio) {
    const candidatos = puestosDelMunicipio(base, departamento.codigo, municipio.codigo);

    if (puestoCodLeido) {
      const conCodigo = candidatos.filter((c) => c.std === puestoCodLeido);
      if (zona) {
        // const local: el narrowing de `zona` no sobrevive al callback (zona
        // es let y se reasigna abajo al deducir la zona del puesto).
        const zonCodigo = zona.codigo;
        const enZona = conCodigo.find((c) => c.zon === zonCodigo);
        if (enZona) {
          puesto = { codigo: enZona.std, nombre: enZona.nombre };
          confPuesto = 1;
          puestoResuelto = true;
          puestoPorCodigo = true;
        } else if (conCodigo.length === 1) {
          // El código leído vive en otra zona: confía en el código del
          // puesto y deduce su zona real.
          puesto = { codigo: conCodigo[0].std, nombre: conCodigo[0].nombre };
          zona = { codigo: conCodigo[0].zon };
          confPuesto = 0.9;
          puestoResuelto = true;
          puestoPorCodigo = true;
        }
      } else if (conCodigo.length === 1) {
        puesto = { codigo: conCodigo[0].std, nombre: conCodigo[0].nombre };
        zona = { codigo: conCodigo[0].zon };
        confPuesto = 0.9;
        puestoResuelto = true;
        puestoPorCodigo = true;
      } else if (conCodigo.length > 1 && lugarLeido) {
        // Mismo código en varias zonas (p. ej. ALEMANIA: 02 en zona 15
        // «Frankfurt Consulado» y en 05 «Berlin Consulado») → desambigua
        // por LUGAR.
        const mejor = mejorPorNombre(conCodigo, (c) => c.nombre, lugarLeido);
        if (mejor && mejor.sim >= UMBRAL_SUGERIDA) {
          puesto = { codigo: mejor.candidato.std, nombre: mejor.candidato.nombre };
          zona = { codigo: mejor.candidato.zon };
          confPuesto = mejor.sim;
          puestoResuelto = mejor.sim >= UMBRAL_AUTO;
        }
      }
    } else if (lugarLeido) {
      const mejor = mejorPorNombre(candidatos, (c) => c.nombre, lugarLeido);
      if (mejor && mejor.sim >= UMBRAL_SUGERIDA) {
        puesto = { codigo: mejor.candidato.std, nombre: mejor.candidato.nombre };
        zona ??= { codigo: mejor.candidato.zon };
        confPuesto = mejor.sim;
        puestoResuelto = mejor.sim >= UMBRAL_AUTO;
      }
    }

    // Verificación LUGAR (regla 4): contra el standName del puesto elegido;
    // si difiere mucho → baja la confianza (techo SUGERIDA).
    // KIT e63f-autoenvio-v1 (F1a): la similitud usa normalizarNombreLugar
    // (OCR-aware: puntuación→espacio + I↔L) SOLO aquí — UMBRAL intacto
    // (0.55), normalizarNombre byte-idéntico en todo lo demás. Efecto medido:
    // «EI Calro-Consulado» vs «El Cairo - Consulado» pasa de 0.471 (cap
    // injusto — el caso real del informe 120553) a ≥ 0.55 (sin cap).
    // KIT e63f-autoenvio-v1 (F1b — CAMBIO DE SEMÁNTICA DECLARADO, aprobación
    // del dueño en el kit §3b): el consenso del registro KIT FRENA el
    // downgrade — puesto resuelto POR CÓDIGO ∧ kitEnRegistro(mun, kit) existe
    // ∧ std del registro == puesto.codigo → NO capar: DOS fuentes
    // estructuradas de acuerdo (código divipol leído por OCR + kit del
    // consenso 1D/PIE = la ruta en REGISTRO_KITS) contra UNA línea de texto
    // libre con ruido. Aviso display LUGAR-DESVIADO (el humano lo ve — la UI
    // ya pinta avisos; el acta no se pierde). Cualquier otra combinación (sin
    // kit, kit de otra ruta, puesto resuelto por nombre) → cap como hoy
    // (byte-idéntico). El registro sigue sin resolver NADA solo: no otorga
    // upgrade, SOLO frena este cap; la mesa sigue la regla D.6 (kit §3b.3).
    if (puesto && lugarLeido && confPuesto >= UMBRAL_AUTO) {
      const verificacion = similitud(
        normalizarNombreLugar(lugarLeido),
        normalizarNombreLugar(puesto.nombre),
      );
      if (verificacion < UMBRAL_VERIFICACION_LUGAR) {
        // Kit disponible ANTES del arbitraje (que corre DESPUÉS, con el
        // municipio FINAL del rescate): consenso del código 1D, con fallback
        // al pie (kit e63f §3b: «kit 399 del consenso 1D/PIE»). En el
        // REGISTRO_KITS actual el std es constante por municipio → la señal
        // coincide con la del kit arbitrado (nota en REPORTE-e63f §3).
        const kitLugar = consenso?.kit ?? mKitPie;
        const registroLugar =
          kitLugar != null
            ? kitEnRegistro(municipio?.codigo ?? null, kitLugar)
            : null;
        if (puestoPorCodigo && registroLugar && registroLugar.std === puesto.codigo) {
          avisos.push("LUGAR-DESVIADO");
        } else {
          confPuesto = Math.min(confPuesto, 0.75);
          puestoResuelto = false;
          capLugarAplicado = true;
        }
      }
    }
  }

  // ---- Regla 4b (§3b.1 SPEC-e14-score-ocr Rev. 2): RESCATE GLOBAL POR
  //      NOMBRE — la cascada NO resolvió la ruta (p. ej. cabecera recortada:
  //      «LADO: 88 - CONSULADOS» no matchea ANCLA_DEPARTAMENTO pero
  //      «El Cairo - Consulado» sigue legible en el texto). Se escanea cada
  //      línea del OCR contra TODOS los puestos de la base (índice invertido
  //      de trigramas); con mejor match ≥ UMBRAL_SUGERIDA y gap ≥ 0.05 sobre
  //      el 2º se deduce la RUTA COMPLETA: dep/mun/zon de la ruta del puesto
  //      (conf 0.9 «deducida») y puesto con conf=sim (resuelto si ≥
  //      UMBRAL_AUTO). Con 2+ candidatos cercanos → queda null (MANUAL, lista
  //      en panel §5 — mismo patrón de la regla 3 de municipios). SOLO corre
  //      cuando la cascada no resolvió → costo CERO en capturas buenas.
  //      PROHIBIDO resolver AUTO por nombre solo: el nivel sigue exigiendo
  //      ruta + mesa válida + tipo leído (abajo, intacto). ----
  if (!(depResuelto && munResuelto && puestoResuelto)) {
    const rescate = rescatarRutaPorNombreGlobal(texto, base);
    // Guard de consistencia: el rescate JAMÁS contradice lo que la cascada
    // resolvió por códigos (conf 1) — solo RELLENA huecos (mismo municipio,
    // otra ruta → se descarta el rescate).
    if (
      rescate &&
      (departamento === null || departamento.codigo === rescate.dep2) &&
      (municipio === null || municipio.codigo === rescate.mun3) &&
      (zona === null || zona.codigo === rescate.zon)
    ) {
      if (!departamento) {
        departamento = { codigo: rescate.dep2, nombre: base[rescate.dep2]?.n ?? "" };
        confDep = 0.9; // «deducida»: ruta del puesto, no lectura del acta
        depResuelto = true;
      }
      if (!municipio) {
        municipio = {
          codigo: rescate.mun3,
          nombre: base[rescate.dep2]?.m?.[rescate.mun3]?.n ?? "",
        };
        confMun = 0.9; // «deducida»
        munResuelto = true;
      }
      zona ??= { codigo: rescate.zon };
      if (!puesto) {
        puesto = { codigo: rescate.std, nombre: rescate.nombre };
        confPuesto = rescate.sim;
        puestoResuelto = rescate.sim >= UMBRAL_AUTO;
      }
    }
  }

  // ---- MESA (regla 5: validar 1 ≤ mesa ≤ countTable; si falla → sugerida
  //      con aviso, NUNCA descartar el número leído) — FASE 3 §4.3.1: el
  //      guard de rango AHORA SÍ descarta la lectura IMPOSIBLE (fuera de
  //      1..p.t), porque «mesaLeida pasa a null» — la señal la da el conteo
  //      embarcado. // Fuente: §0-F5 — public/e14/divipol.json trae p.t por
  //      puesto: El Cairo puesto 02 tiene t:1 → una lectura «MESA: 004» es
  //      IMPOSIBLE (tesseract leyó MESA 001→004 en la captura cruda del
  //      dueño). Sin ruta completa no hay p.t → el guard no aplica. ----
  const rutaCompleta = Boolean(departamento && municipio && zona && puesto);
  const pRuta = rutaCompleta
    ? base[departamento!.codigo]?.m?.[municipio!.codigo]?.z?.[zona!.codigo]?.s?.[puesto!.codigo]
    : undefined;
  let mesaLeidaEfectiva: number | null =
    mesaLeida !== null && Number.isFinite(mesaLeida) ? mesaLeida : null;
  if (
    mesaLeidaEfectiva !== null &&
    pRuta !== undefined &&
    (mesaLeidaEfectiva < 1 || mesaLeidaEfectiva > pRuta.t)
  ) {
    avisos.push("MESA_FUERA_RANGO");
    mesaLeidaEfectiva = null; // la lectura es imposible — el registro puede rescatar (abajo)
  }
  const mesaValidaLeidaInicial =
    mesaLeidaEfectiva !== null && rutaCompleta && pRuta !== undefined &&
    mesaLeidaEfectiva >= 1 && mesaLeidaEfectiva <= pRuta.t;

  // ---- KIT consenso-frankfurt-v1 (FASE 3, §4.2): consenso del kit ARBITRADO
  //      por el registro. Corre con el municipio FINAL (cascada + rescate
  //      4b) — // Fuente: §0-F3 (El Cairo: código leído «…0300…», pie 399,
  //      registro(335)=399 — el campo KIT del código no tiene redundancia y
  //      el OCR leyó los DOS 9 como 0). Reglas: pie y código difieren → gana
  //      el que esté en registro; ambos o ninguno → gana el pie (impreso
  //      grande, menos confuso) — siempre con PIE_CODIGO_DISCREPAN. Fuzzy
  //      honesto: código fuera de registro con un vecino a distancia de
  //      edición 1 del MISMO municipio → lectura errada del código: gana el
  //      registro SOLO si el pie lo confirma o si no hay pie, con
  //      KIT_CODIGO_CORREGIDO. El kit NUNCA se inventa: sin ninguna fuente →
  //      null (SINKIT como hoy). ----
  const codigoKit = consenso ? consenso.kit : null;
  let kit: number | null = null;
  let kitFuente: "PIE" | "CODIGO" | "REGISTRO" | null = null;
  const enRegistro = (k: number): boolean => kitEnRegistro(municipio?.codigo ?? null, k) !== null;
  if (mKitPie !== null && codigoKit !== null && mKitPie !== codigoKit) {
    avisos.push("PIE_CODIGO_DISCREPAN");
    if (enRegistro(codigoKit) && !enRegistro(mKitPie)) {
      kit = codigoKit;
      kitFuente = "CODIGO";
    } else {
      kit = mKitPie;
      kitFuente = "PIE";
    }
    if (!enRegistro(codigoKit)) {
      const vecino = kitADistancia1(municipio?.codigo ?? null, codigoKit);
      if (vecino !== null && mKitPie === vecino) {
        // El pie CONFIRMA el vecino del registro — el código era la errada.
        kit = vecino;
        kitFuente = "REGISTRO";
        avisos.push("KIT_CODIGO_CORREGIDO");
      }
      // Pie presente y distinto del vecino → gana el pie (regla anterior).
    }
  } else if (mKitPie !== null) {
    kit = mKitPie;
    kitFuente = "PIE";
  } else if (codigoKit !== null) {
    kit = codigoKit;
    kitFuente = "CODIGO";
    if (!enRegistro(codigoKit)) {
      // Sin pie: el vecino del registro se acepta como lectura errada (§4.2).
      const vecino = kitADistancia1(municipio?.codigo ?? null, codigoKit);
      if (vecino !== null) {
        kit = vecino;
        kitFuente = "REGISTRO";
        avisos.push("KIT_CODIGO_CORREGIDO");
      }
    }
  }

  // ---- KIT identificacion-codigo-v1 (FASE D.6 + FASE E): MESA por registro
  //      kit→mesa (src/lib/e14/kits.ts — ANALISIS §4.2). SOLO si la cabecera
  //      NO leyó mesa (o su lectura fue imposible — §4.3.1): registro kit→mesa
  //      con municipio resuelto que coincida → mesa = registro.mesa + aviso
  //      MESA_POR_KIT. NIVEL: NO cambia (mesaValidaLeida sigue exigiendo
  //      lectura de cabecera → máx SUGERIDA, como hoy — §6 inmutables).
  //      KIT consenso-frankfurt-v1 (FASE 3, §4.2): la consulta usa el kit
  //      ARBITRADO (pie/código/registro — p. ej. código 300 + pie 399 → el
  //      registro 399 rescata la mesa que el código errado no encontraría).
  //      Guardas del kit §4: zona/puesto resueltos que contradigan el
  //      registro → NO aplicar (KIT_OTRA_RUTA); con ruta completa,
  //      1 ≤ mesa ≤ p.t (regla 5) o no aplica (KIT_MESA_FUERA_RANGO). ----
  const registro = kitEnRegistro(municipio?.codigo ?? null, kit);
  let mesaFinal: number | null = mesaLeidaEfectiva;
  if (registro) {
    if (mesaFinal === null) {
      const otraRuta =
        (zona !== null && registro.zon !== zona.codigo) ||
        (puesto !== null && registro.std !== puesto.codigo);
      let mesaEnRango = true;
      if (departamento && municipio && zona && puesto) {
        const p = base[departamento.codigo]?.m?.[municipio.codigo]?.z?.[zona.codigo]?.s?.[puesto.codigo];
        mesaEnRango = Boolean(p && registro.mesa >= 1 && registro.mesa <= p.t);
      }
      if (otraRuta) {
        avisos.push("KIT_OTRA_RUTA");
      } else if (!mesaEnRango) {
        avisos.push("KIT_MESA_FUERA_RANGO");
      } else {
        mesaFinal = registro.mesa;
        avisos.push("MESA_POR_KIT");
      }
    } else if (mesaFinal !== registro.mesa) {
      // KIT consenso-frankfurt-v1 (FASE 3, §4.3.2): mesa válida EN RANGO pero
      // ≠ mesa del registro → conflicto de fuentes NO se resuelve en silencio:
      // aviso + si el nivel era AUTO baja a SUGERIDA (mesaValidaLeida=false
      // abajo — el panel de corrección muestra ambas).
      avisos.push("MESA_REGISTRO_DISCREPAN");
    }
  }
  // §4.3.2: la discrepancia mesa↔registro NUNCA es AUTO (conflicto de
  // fuentes) — baja a SUGERIDA conservando la mesa leída (el panel muestra
  // ambas: MESA 001 leída vs registro 008).
  const mesaValidaLeida = mesaValidaLeidaInicial && !avisos.includes("MESA_REGISTRO_DISCREPAN");

  // ---- NIVEL (§3.4): AUTO exige dep+mun+puesto resueltos (código o ≥0.82)
  //      + mesa válida + tipo leído. Sin tipo → máx SUGERIDA (§D.4: prohibido
  //      asumir el tipo). PATRON_CABECERA matchea pero no llega a AUTO →
  //      SUGERIDA (nunca es pase libre a AUTO). ----
  const algoResuelto =
    departamento !== null ||
    municipio !== null ||
    puesto !== null ||
    (mesaLeidaEfectiva !== null && Number.isFinite(mesaLeidaEfectiva)) ||
    tipo !== null;
  let nivel: NivelClasificacion;
  if (depResuelto && munResuelto && puestoResuelto && mesaValidaLeida && tipo !== null) {
    nivel = "AUTO";
  } else if (algoResuelto) {
    nivel = "SUGERIDA";
  } else {
    nivel = "MANUAL";
  }
  if (nivel !== "AUTO" && PATRON_CABECERA.test(texto)) {
    nivel = "SUGERIDA";
  }

  // ---- KIT e63f-autoenvio-v1 (F0 — balde fino del «por qué no fue AUTO»):
  //      motivo EXACTO calculado de variables ya existentes (cero recomputo).
  //      Prioridad si hay varios: puesto-lugar > tipo > mesa-registro > ruta
  //      (es lo que se pueda arreglar primero — kit §2.1). null si AUTO o si
  //      nada aplica — el score NO es un motivo de clasificación. Solo-
  //      aditivo: el informe TOTALES (línea CLASIF-DEBIL) y el contador fino
  //      del store lo consumen; los consumidores viejos lo ignoran. ----
  let clasifDebil: string | null = null;
  if (nivel !== "AUTO") {
    if (capLugarAplicado) clasifDebil = "puesto-lugar";
    else if (tipo === null || confianzaTipo < UMBRAL_AUTO) clasifDebil = "tipo";
    else if (avisos.includes("MESA_REGISTRO_DISCREPAN")) clasifDebil = "mesa-registro";
    else if (!(depResuelto && munResuelto && puestoResuelto)) clasifDebil = "ruta";
  }

  return {
    departamento,
    municipio,
    zona,
    puesto,
    mesa: mesaFinal,
    tipo,
    pagina,
    kit,
    nivel,
    // §D2 (SPEC-e14-score-ocr): paquete display-only — lecturas crudas ANTES
    // de la validación divipol (la jerarquía puede no resolver y aun así la
    // MESA/tipo leídos son información real del acta para el chip parcial).
    // FASE 3 §4.3.1: la mesa IMPOSIBLE (fuera de 1..p.t) NO se muestra —
    // mesaLeidaEfectiva ya es null en ese caso.
    parciales: {
      cabecera: PATRON_CABECERA.test(texto),
      mesa: mesaLeidaEfectiva,
      tipo,
    },
    // KIT identificacion-codigo-v1 (FASE D.2): consenso + avisos (display).
    codigoUnico: consenso,
    avisos,
    // KIT consenso-frankfurt-v1 (FASE 3, §4.2): procedencia del kit ganador.
    kitFuente,
    // KIT e63f-autoenvio-v1 (F0): balde fino del no-AUTO (null si AUTO o sin
    // motivo de los listados) — solo-aditivo, contrato D51.
    clasifDebil,
    confianzas: {
      departamento: Math.round(confDep * 100) / 100,
      municipio: Math.round(confMun * 100) / 100,
      puesto: Math.round(confPuesto * 100) / 100,
      tipo: confianzaTipo,
    },
  };
}

// ---------- Utilidades para el panel (§5) y Fase B (§6) ----------

/** Literal de TipoPagina (types.ts L89) — sin import para evitar ciclo de
 *  tipos: los literales son estructuralmente idénticos. */
export function tipoPaginaDe(tipo: TipoCopia): "DELEGADOS" | "TRANSMISIÓN" {
  return tipo === "TRANSMISION" ? "TRANSMISIÓN" : "DELEGADOS";
}

/** Clave de mesa §6: ${dep}-${mun}-${zon}-${std}-${mesa} con ceros
 *  (p. ej. «88-335-05-02-001»). Códigos ya vienen con ancho de la base;
 *  se rellenan defensivamente para el modo texto libre. */
export function claveDeMesa(c: ClasificacionE14): string | null {
  if (!c.departamento || !c.municipio || !c.zona || !c.puesto || c.mesa === null) return null;
  const dep = c.departamento.codigo.padStart(2, "0");
  const mun = c.municipio.codigo.padStart(3, "0");
  const zon = c.zona.codigo.padStart(2, "0");
  const std = c.puesto.codigo.padStart(2, "0");
  const mesa = String(c.mesa).padStart(3, "0");
  return `${dep}-${mun}-${zon}-${std}-${mesa}`;
}

/** Prefijo PUESTO de la clave de mesa: «dep-mun-zon-std» (mismos anchos con
 *  ceros que claveDeMesa). Todas las claves de mesas de UN puesto comparten
 *  este prefijo — así se filtra `archivadas` por puesto sin parsear códigos. */
export function claveDePuesto(c: ClasificacionE14): string | null {
  const clave = claveDeMesa(c);
  return clave ? clave.split("-").slice(0, 4).join("-") : null;
}

/** Nombre de salida al exportar (§6 / §G.4.5):
 *  E14_{KIT}_{dep}_{mun}_{zon}_{puesto}_{mesa}_{TIPO}-{pag}. Extensión la
 *  pone el exportador real (PDF §6 — adaptación documentada). */
export function nombreExportacion(c: ClasificacionE14): string | null {
  const clave = claveDeMesa(c);
  if (!clave || !c.tipo) return null;
  const kit = c.kit !== null ? String(c.kit) : "SINKIT";
  const tipo = c.tipo; // ASCII: TRANSMISION/DELEGADOS
  const pag = c.pagina?.index ?? 1;
  return `E14_${kit}_${clave.replaceAll("-", "_")}_${tipo}-${pag}`;
}

/**
 * KIT actas-vivas-paginas-v1 (FASE C): RECORTADA por OCR de secciones —
 * la captura real del dueño salió con la parte inferior pisada (firmas al
 * filo) SIN advertencia específica: un recorte limpio por una franja blanca
 * pasaba (solo el guard geométrico de tinta al filo y el escudo de fondo
 * atrapaban casos). Señales por página (la página es DATO — §C):
 *   P1 exige «SUMA TOTAL» (el pie de la pág 1) · P≥2 exige «FIRMA».
 * Página DESCONOCIDA (null) → false SIEMPRE (conservador: no condena por
 * OCR débil).
 */
export function faltaSeccionInferior(
  texto: string,
  pagina: { index: number; total: number } | null,
): boolean {
  if (pagina == null) return false;
  if (pagina.index === 1) return !/SUMA\s*TOTAL/i.test(texto);
  return !/FIRMA/i.test(texto);
}

// ---------- Título y ubicación reales (SPEC-titulo-ubicacion §1) ----------

/**
 * Deriva el TÍTULO y la UBICACIÓN del acta desde una clasificación con RUTA
 * COMPLETA resuelta (nivel AUTO — del gate o del panel de corrección — o
 * SUGERIDA con ruta completa, §3b.3 Rev. 2: display-only). Devuelve null
 * cuando falta la ruta o el nivel es MANUAL — el llamador conserva el
 * seed (§0: sin datos reales no se inventa nada).
 *
 * Convención de ActaUbicacion (igual que ACTA_MOCK): departamento/municipio
 * por NOMBRE, zona/puesto por CÓDIGO, mesa con 3 dígitos. El título es el
 * standName del puesto en MAYÚSCULAS (p. ej. «EL CAIRO - CONSULADO») — la
 * TarjetaRica ya lo renderiza uppercase; el visor y el export lo usan crudo.
 */
export function tituloYUbicacionDe(
  c: ClasificacionE14 | null | undefined,
): {
  titulo: string;
  ubicacion: { departamento: string; municipio: string; zona: string; puesto: string; mesa: string };
} | null {
  // §3b.3 (SPEC-e14-score-ocr Rev. 2): título/ubicación REALES también con
  // nivel SUGERIDA cuando la RUTA COMPLETA está resuelta (display-only — el
  // banner y los chips muestran «EL CAIRO - CONSULADO» y la ruta deducida;
  // el tipo puede seguir pendiente). El AUTO-ENVÍO sigue exigiendo AUTO+gate
  // (sin cambio en envío/transmisión). Sin ruta completa o nivel MANUAL →
  // null: el llamador conserva el seed (§0: sin datos reales no se inventa).
  if (
    !c ||
    (c.nivel !== "AUTO" && c.nivel !== "SUGERIDA") ||
    !c.departamento ||
    !c.municipio ||
    !c.zona ||
    !c.puesto ||
    c.mesa === null
  ) {
    return null;
  }
  return {
    titulo: (c.puesto.nombre || "PUESTO SIN NOMBRE").toUpperCase(),
    ubicacion: {
      departamento: c.departamento?.nombre ?? "",
      municipio: c.municipio?.nombre ?? "",
      zona: c.zona?.codigo ?? "",
      puesto: c.puesto.codigo,
      mesa: String(c.mesa).padStart(3, "0"),
    },
  };
}
