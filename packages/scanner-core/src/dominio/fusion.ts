/**
 * Motor de fusión de evidencia acta ↔ DIVIPOL
 * (TAREA-AGENTE-fusion-divipol §3 — D89).
 *
 * Ningún campo del encabezado es indispensable: el ganador sale de la suma
 * ponderada de TODA la evidencia disponible y el nivel exige corroboración de
 * ≥2 grupos independientes. Justificación medida sobre el catálogo real
 * (§2.2): 877 nombres de puesto repetidos entre países, 4.146 puestos con
 * «MESA 001», 0 países duplicados en el depto 88 — ningún campo aislado
 * identifica un acta; la identidad es la composición.
 *
 * Pesos y umbrales: §3.4/§3.5 EXACTOS, calibrados contra el divipol real.
 * NO se ajustan sin aprobación del mantenedor (D89).
 *
 * Sin dependencias externas. Reutiliza la carga/estructura del catálogo de
 * `divipol.ts`; la normalización (I↔L, letra→dígito, permutaciones ≤64,
 * Dice con padding) vive en `normalizar.ts` para no tocar el clasificador ni
 * su golden (D80).
 */
import type { DivipolBase } from "./divipol";
import type {
  Aviso,
  Candidato,
  CampoLeido,
  CodigoBarras,
  Evidencia,
  FuentePagina,
  FuenteTipo,
  HipotesisTipo,
  LecturaActa,
  NivelFusion,
  PaginaConsenso,
  Resolucion,
  StandResuelto,
  TipoActa,
  TipoConsenso,
  ViaEvidencia,
} from "./fusion-tipos";
import {
  normalizarCodigoFusion,
  normalizarNombreFusion,
  permutacionesCodigo,
  similitudDice,
  trigramasDeNombre,
} from "./normalizar";

// ---------- Pesos y umbrales (§3.4/§3.5 — EXACTOS) ----------

const W = {
  deptExacto: 6,
  paisCodExacto: 40,
  paisCodPerm: 30,
  paisNombre: 35,
  paisNombreUnico: 15,
  paisAcuerdo: 8,
  zonaExacta: 14,
  zonaPerm: 9,
  puestoCodExacto: 20,
  puestoCodPerm: 13,
  lugar: 30,
  lugarUnico: 25,
  puestoAcuerdo: 8,
  mesaValida: 20,
  mesaPermPenal: 4,
  mesaInvalida: -45,
} as const;

const UMBRAL_FUZZY = 0.55;
const UMBRAL_UNICO = 0.85;
const UMBRAL_AUTO = 85;
const UMBRAL_SUGERIDA = 55;
const GAP_AUTO = 8;
const GAP_SUGERIDA = 4;
const GRUPOS_MIN_AUTO = 2;

// ---------- Acceso al catálogo (índice perezoso por identidad de base) ----------

interface PuestoIndice {
  dep: string;
  depNombre: string;
  depNombreNorm: string;
  mun: string;
  munNombre: string;
  munNombreNorm: string;
  zon: string;
  std: string;
  nombre: string;
  nombreNorm: string;
  mesas: number;
  trigramas: Set<string>;
}

interface IndiceFusion {
  base: DivipolBase;
  puestos: PuestoIndice[];
  porMun: Map<string, number[]>;
  porTrigrama: Map<string, number[]>;
  /** Nombres de puesto repetidos en TODO el divipol (§2.2: 917). */
  conteoNombrePuesto: Map<string, number>;
  /** Nombres de país repetidos dentro del depto 88 (0 medidos). */
  conteoNombrePais: Map<string, number>;
}

let indiceCache: IndiceFusion | null = null;

function indiceDe(base: DivipolBase): IndiceFusion {
  if (indiceCache?.base === base) return indiceCache;
  const puestoIndices: PuestoIndice[] = [];
  const porMun = new Map<string, number[]>();
  const porTrigrama = new Map<string, number[]>();
  for (const [dep, nodoDep] of Object.entries(base)) {
    const depNombre = nodoDep.n;
    const depNombreNorm = normalizarNombreFusion(depNombre);
    for (const [mun, nodoMun] of Object.entries(nodoDep.m ?? {})) {
      const munNombreNorm = normalizarNombreFusion(nodoMun.n);
      for (const [zon, zona] of Object.entries(nodoMun.z ?? {})) {
        for (const [std, puesto] of Object.entries(zona.s ?? {})) {
          const nombreNorm = normalizarNombreFusion(puesto.n);
          const i = puestoIndices.length;
          puestoIndices.push({
            dep,
            depNombre,
            depNombreNorm,
            mun,
            munNombre: nodoMun.n,
            munNombreNorm,
            zon,
            std,
            nombre: puesto.n,
            nombreNorm,
            mesas: puesto.t,
            trigramas: trigramasDeNombre(nombreNorm),
          });
          const listaMun = porMun.get(mun);
          if (listaMun) listaMun.push(i);
          else porMun.set(mun, [i]);
          for (const t of trigramasDeNombre(nombreNorm)) {
            const bucket = porTrigrama.get(t);
            if (bucket) bucket.push(i);
            else porTrigrama.set(t, [i]);
          }
        }
      }
    }
  }
  const conteoNombrePuesto = new Map<string, number>();
  for (const p of puestoIndices) {
    conteoNombrePuesto.set(p.nombreNorm, (conteoNombrePuesto.get(p.nombreNorm) ?? 0) + 1);
  }
  // §3.4: la unicidad del país se mide SOLO dentro del depto 88 (allí viven
  // los países; en el interior «municipio» es otra cosa).
  const conteoNombrePais = new Map<string, number>();
  for (const nodoMun of Object.values(base["88"]?.m ?? {})) {
    const norm = normalizarNombreFusion(nodoMun.n);
    conteoNombrePais.set(norm, (conteoNombrePais.get(norm) ?? 0) + 1);
  }
  indiceCache = {
    base,
    puestos: puestoIndices,
    porMun,
    porTrigrama,
    conteoNombrePuesto,
    conteoNombrePais,
  };
  return indiceCache;
}

// ---------- Lectura de campos ----------

/** Un campo con valor aporta salvo que esté declarado `ilegible` (§3.2). */
function campoUtil(campo: CampoLeido | null | undefined): campo is CampoLeido {
  return Boolean(campo && campo.calidad !== "ilegible" && campo.valor.trim());
}

/** `<código> - <nombre>` (§3.2: la caja imprime «88 - CONSULADOS»): si el
 *  valor arranca con dígitos, son el código; el resto es nombre. */
function codigoInicial(valor: string): string {
  return valor.trim().match(/^\d{1,3}/)?.[0] ?? valor;
}

function codigosDe(
  campo: CampoLeido | null | undefined,
  ancho: number,
  extraerCodigoInicial = false,
): { exacto: string | null; conPermutacion: Set<string> } {
  if (!campoUtil(campo)) return { exacto: null, conPermutacion: new Set() };
  const texto = extraerCodigoInicial ? codigoInicial(campo.valor) : campo.valor;
  const codigo = normalizarCodigoFusion(texto).padStart(ancho, "0");
  const conPermutacion = new Set<string>();
  for (const combo of permutacionesCodigo(codigo)) conPermutacion.add(combo.padStart(ancho, "0"));
  return { exacto: codigo, conPermutacion };
}

// ---------- Código de barras (§3.7) ----------

/** d9 → hipótesis de tipo. `2` es AMBIGUO entre dos fuentes documentadas y
 *  se marca como tal: nunca se eleva a certeza (D89). */
function hipotesisDeDigito(d9: string): HipotesisTipo | null {
  if (d9 === "3") return { valor: "TRANSMISION", certeza: "acordada", alternativas: [] };
  if (d9 === "2") {
    return {
      valor: "CONSUL/EMBAJADOR",
      certeza: "ambigua",
      alternativas: ["CONSUL/EMBAJADOR", "DELEGADOS"],
    };
  }
  if (d9 === "1") return { valor: "DELEGADOS", certeza: "no-verificada", alternativas: [] };
  return null;
}

/** Parsea el código de 15 dígitos con la gramática cerrada (§3.7):
 *  `71000 | Form(3) | d9 | Ver(2) | Pág(2) | sufijo(2)`. null si no tiene
 *  exactamente 15 dígitos tras limpiar separadores. */
export function parsearBarcode(crudo: string): CodigoBarras | null {
  const limpio = (crudo ?? "").replace(/\D/g, "");
  if (limpio.length !== 15) return null;
  const prefijo = limpio.slice(0, 5);
  const form = limpio.slice(5, 8);
  const d9 = limpio.slice(8, 9);
  const ver = limpio.slice(9, 11);
  const pag = limpio.slice(11, 13);
  const sufijo = limpio.slice(13, 15);
  return {
    crudo: limpio,
    prefijo,
    form,
    d9,
    ver,
    pag,
    sufijo,
    plausible: prefijo === "71000" && sufijo === "02",
    tipoHipotesis: hipotesisDeDigito(d9),
  };
}

// ---------- Página y tipo por consenso (§3.8) ----------

const ANCLA_VERPAG_FUSION = /Ver\.?\s*:?\s*(\d{1,2})\s*Pag\.?\s*:?\s*(\d{1,2})\s*de\s*(\d{1,2})/i;

/** Página = consenso de verpag impreso, dígitos 12–13 del barcode y
 *  contenido. La primera fuente fija el valor; toda contradicción deja
 *  `consistente = false` (§3.8). */
export function consensuarPagina(
  lectura: LecturaActa,
  barcode: CodigoBarras | null,
): PaginaConsenso {
  const fuentes: FuentePagina[] = [];
  if (campoUtil(lectura.verpag)) {
    const m = lectura.verpag.valor.match(ANCLA_VERPAG_FUSION);
    if (m) {
      const index = Number.parseInt(m[2], 10);
      if (Number.isFinite(index) && index >= 1) fuentes.push({ fuente: "verpag", valor: index });
    }
  }
  if (barcode) {
    const pag = Number.parseInt(barcode.pag, 10);
    if (Number.isFinite(pag) && pag >= 1) fuentes.push({ fuente: "barcode", valor: pag });
  }
  if (lectura.contenido) {
    fuentes.push({ fuente: "contenido", valor: lectura.contenido === "resultados" ? 1 : 2 });
  }
  const valor = fuentes[0]?.valor ?? null;
  return {
    valor,
    fuentes,
    consistente: fuentes.every((f) => f.valor === valor),
  };
}

/** Banner normalizado → tipo canónico. `CÓNSUL/EMBAJADOR` incluye CONSUL a
 *  secas (variante exterior) pero TRANSMISIÓN se prueba primero — la caja
 *  «CONSULADO: 88» del encabezado no debe marcar el tipo. */
function tipoDeBanner(banner: string): TipoActa | null {
  const t = (banner ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (/TRANSMISI/.test(t)) return "TRANSMISION";
  if (/EMBAJADOR/.test(t) || /CONSUL/.test(t)) return "CONSUL/EMBAJADOR";
  if (/DELEGAD/.test(t)) return "DELEGADOS";
  return null;
}

/** Tipo = consenso de banner impreso + hipótesis del d9 (§3.8). La
 *  contradicción NO se resuelve en silencio: queda como aviso de error. */
export function consensuarTipo(lectura: LecturaActa, barcode: CodigoBarras | null): TipoConsenso {
  const banner = campoUtil(lectura.tipoBanner) ? tipoDeBanner(lectura.tipoBanner.valor) : null;
  const d9 = barcode?.tipoHipotesis ?? null;
  const fuentes: FuenteTipo[] = [];
  if (banner) fuentes.push({ fuente: "banner", valor: banner });
  if (d9) fuentes.push({ fuente: "barcode", valor: d9.valor });
  const valor = banner ?? d9?.valor ?? null;
  return {
    valor,
    fuentes,
    consistente: banner && d9 ? banner === d9.valor : true,
  };
}

// ---------- Enumeración de candidatos ----------

/** Universo de stands que la evidencia disponible permite considerar. Si un
 *  campo de país o el lugar apuntan a algún sitio, sus stands compiten; si no
 *  hay ninguna señal territorial la fusión NO adivina (§3.5: MANUAL). Los
 *  departamentos NO enumeran solos: el consulado por sí mismo no discrimina
 *  (cascada §3.9). */
function poolDeCandidatos(
  lectura: LecturaActa,
  indice: IndiceFusion,
  paisCodigo: { exacto: string | null; conPermutacion: Set<string> },
  paisNombreNorm: string,
  lugarNorm: string,
): number[] {
  const indices = new Set<number>();
  if (paisCodigo.exacto) {
    for (const [mun, lista] of indice.porMun) {
      if (paisCodigo.conPermutacion.has(mun)) for (const i of lista) indices.add(i);
    }
  }
  if (paisNombreNorm) {
    // 1.189 países/municipios: comparar nombres es barato frente a 14.438 puestos.
    for (const [, lista] of indice.porMun) {
      const nombre = indice.puestos[lista[0]]?.munNombreNorm ?? "";
      if (nombre && similitudDice(paisNombreNorm, nombre) >= UMBRAL_FUZZY) {
        for (const i of lista) indices.add(i);
      }
    }
  }
  if (lugarNorm) {
    // Índice invertido de trigramas: Dice > 0 exige compartir ≥1 trigrama.
    const candidatos = new Set<number>();
    for (const t of trigramasDeNombre(lugarNorm)) {
      for (const i of indice.porTrigrama.get(t) ?? []) candidatos.add(i);
    }
    for (const i of candidatos) {
      if (similitudDice(lugarNorm, indice.puestos[i].nombreNorm) >= UMBRAL_FUZZY) {
        indices.add(i);
      }
    }
  }
  return [...indices];
}

// ---------- Puntaje de un candidato (§3.4) ----------

interface Acumulador {
  puntos: number;
  evidencias: Evidencia[];
  grupos: Set<string>;
}

function sumar(
  acc: Acumulador,
  campo: string,
  leido: string,
  via: ViaEvidencia,
  puntos: number,
  grupo?: string,
): void {
  acc.puntos += puntos;
  acc.evidencias.push({ campo, leido, via, puntos });
  if (grupo && puntos > 0) acc.grupos.add(grupo);
}

interface Contexto {
  lectura: LecturaActa;
  depCodigo: { exacto: string | null; conPermutacion: Set<string> };
  depNombreNorm: string;
  paisCodigo: { exacto: string | null; conPermutacion: Set<string> };
  paisNombreNorm: string;
  zonaCodigo: { exacto: string | null; conPermutacion: Set<string> };
  puestoCodigo: { exacto: string | null; conPermutacion: Set<string> };
  lugarNorm: string;
  conteoLugar: number;
  mesaExacta: number | null;
  mesaPermutaciones: number[];
  indice: IndiceFusion;
}

function puntuar(p: PuestoIndice, ctx: Contexto): Candidato {
  const acc: Acumulador = { puntos: 0, evidencias: [], grupos: new Set() };

  // DEPARTAMENTO (grupo depto): código exacto o nombre prácticamente igual.
  if (ctx.depCodigo.exacto && ctx.depCodigo.exacto === p.dep) {
    sumar(acc, "departamento", ctx.lectura.departamento?.valor ?? "", "EXACTA", W.deptExacto, "depto");
  } else if (ctx.depNombreNorm && similitudDice(ctx.depNombreNorm, p.depNombreNorm) >= UMBRAL_UNICO) {
    sumar(acc, "departamento", ctx.lectura.departamento?.valor ?? "", "FUZZY (alto)", W.deptExacto, "depto");
  }

  // PAÍS (grupo país): código (la evidencia más fuerte), nombre y acuerdo.
  let paisPorCodigo = false;
  if (ctx.paisCodigo.exacto) {
    if (ctx.paisCodigo.exacto === p.mun) {
      sumar(acc, "pais", ctx.lectura.paisCodigo?.valor ?? "", "EXACTA", W.paisCodExacto, "pais");
      paisPorCodigo = true;
    } else if (ctx.paisCodigo.conPermutacion.has(p.mun)) {
      sumar(acc, "pais", ctx.lectura.paisCodigo?.valor ?? "", "PERMUTACIÓN", W.paisCodPerm, "pais");
      paisPorCodigo = true;
    }
  }
  let paisPorNombre = false;
  if (ctx.paisNombreNorm) {
    const dice = similitudDice(ctx.paisNombreNorm, p.munNombreNorm);
    if (dice >= UMBRAL_FUZZY) {
      sumar(
        acc,
        "pais",
        ctx.lectura.paisNombre?.valor ?? "",
        "FUZZY",
        Math.round(dice * W.paisNombre),
        "pais",
      );
      paisPorNombre = true;
      const unico = (ctx.indice.conteoNombrePais.get(p.munNombreNorm) ?? 0) === 1;
      if (dice >= UMBRAL_UNICO && unico && p.dep === "88") {
        sumar(acc, "pais", ctx.lectura.paisNombre?.valor ?? "", "ÚNICO", W.paisNombreUnico, "pais");
      }
    }
  }
  if (paisPorCodigo && paisPorNombre) {
    sumar(acc, "paisAcuerdo", ctx.lectura.paisNombre?.valor ?? "", "ACUERDO", W.paisAcuerdo);
  }

  // ZONA (grupo zona).
  if (ctx.zonaCodigo.exacto && ctx.zonaCodigo.exacto === p.zon) {
    sumar(acc, "zona", ctx.lectura.zona?.valor ?? "", "EXACTA", W.zonaExacta, "zona");
  } else if (ctx.zonaCodigo.conPermutacion.has(p.zon)) {
    sumar(acc, "zona", ctx.lectura.zona?.valor ?? "", "PERMUTACIÓN", W.zonaPerm, "zona");
  }

  // PUESTO (grupo puesto).
  let puestoPorCodigo = false;
  if (ctx.puestoCodigo.exacto && ctx.puestoCodigo.exacto === p.std) {
    sumar(acc, "puesto", ctx.lectura.puesto?.valor ?? "", "EXACTA", W.puestoCodExacto, "puesto");
    puestoPorCodigo = true;
  } else if (ctx.puestoCodigo.conPermutacion.has(p.std)) {
    sumar(acc, "puesto", ctx.lectura.puesto?.valor ?? "", "PERMUTACIÓN", W.puestoCodPerm, "puesto");
    puestoPorCodigo = true;
  }

  // LUGAR (grupo lugar): nombre del puesto, con bono de unicidad global.
  let lugarAlto = false;
  if (ctx.lugarNorm) {
    const dice = similitudDice(ctx.lugarNorm, p.nombreNorm);
    if (dice >= UMBRAL_FUZZY) {
      sumar(acc, "lugar", ctx.lectura.lugar?.valor ?? "", "FUZZY", Math.round(dice * W.lugar), "lugar");
      lugarAlto = dice >= UMBRAL_UNICO;
      const unico = (ctx.indice.conteoNombrePuesto.get(p.nombreNorm) ?? 0) === 1;
      if (lugarAlto && unico) {
        sumar(acc, "lugar", ctx.lectura.lugar?.valor ?? "", "ÚNICO", W.lugarUnico, "lugar");
      }
    }
  }
  if (puestoPorCodigo && lugarAlto) {
    sumar(acc, "puestoAcuerdo", ctx.lectura.lugar?.valor ?? "", "ACUERDO", W.puestoAcuerdo);
  }

  // MESA (grupo mesa): RESTRICCIÓN, no identificador (§3.6).
  let mesaResuelta: number | null = null;
  if (ctx.mesaExacta !== null || ctx.mesaPermutaciones.length > 0) {
    const validas = ctx.mesaPermutaciones.filter((n) => n >= 1 && n <= p.mesas);
    if (validas.length === 0) {
      sumar(acc, "mesa", ctx.lectura.mesa?.valor ?? "", "FUERA DE RANGO", W.mesaInvalida);
    } else {
      const exacta = ctx.mesaExacta !== null && validas.includes(ctx.mesaExacta);
      mesaResuelta = exacta ? ctx.mesaExacta! : Math.min(...validas);
      sumar(
        acc,
        "mesa",
        ctx.lectura.mesa?.valor ?? "",
        exacta ? "RESTRICCIÓN" : "PERMUTACIÓN",
        exacta ? W.mesaValida : W.mesaValida - W.mesaPermPenal,
        "mesa",
      );
    }
  }

  const stand: StandResuelto = {
    departamento: { codigo: p.dep, nombre: p.depNombre },
    municipio: { codigo: p.mun, nombre: p.munNombre },
    zona: { codigo: p.zon },
    puesto: { codigo: p.std, nombre: p.nombre, mesas: p.mesas },
  };
  return {
    stand,
    puntos: acc.puntos,
    evidencias: acc.evidencias,
    grupos: acc.grupos.size,
    gruposActivos: [...acc.grupos],
    mesaValida: mesaResuelta !== null,
    mesaResuelta,
  };
}

// ---------- Cascada de rescate y niveles (§3.5, §3.9) ----------

function campoMuerto(campo: CampoLeido | null | undefined): boolean {
  return Boolean(campo) && (campo!.calidad === "ilegible" || !campo!.valor.trim());
}

function armarRescates(lectura: LecturaActa, nivel: NivelFusion, hayMesaError: boolean): string[] {
  const rescates: string[] = [];
  const muertos: string[] = [];
  const borrosos: string[] = [];
  const revisar = (campo: string, valor: CampoLeido | null | undefined): void => {
    if (!valor) return;
    if (campoMuerto(valor)) muertos.push(campo);
    else if (valor.calidad === "borroso") borrosos.push(campo);
  };
  revisar("departamento", lectura.departamento);
  revisar("paisCodigo", lectura.paisCodigo);
  revisar("paisNombre", lectura.paisNombre);
  revisar("zona", lectura.zona);
  revisar("puesto", lectura.puesto);
  revisar("mesa", lectura.mesa);
  revisar("lugar", lectura.lugar);
  revisar("barcode", lectura.barcode);

  for (const campo of muertos) {
    switch (campo) {
      case "departamento":
        rescates.push(
          "CONSULADO (departamento) ilegible → lo cubre: el resto de la caja delimita el departamento por sí solo",
        );
        break;
      case "paisCodigo":
        rescates.push(
          "PAÍS (código) ilegible → lo cubre: nombre del país, o nombre del lugar + jerarquía divipol",
        );
        break;
      case "paisNombre":
        rescates.push("PAÍS (nombre) ilegible → lo cubre: código del país, o nombre del lugar si es único");
        break;
      case "zona":
        rescates.push("ZONA ilegible → lo cubre: país + puesto (promedio 2,2 puestos por zona)");
        break;
      case "puesto":
        rescates.push("PUESTO (código) ilegible → lo cubre: nombre del lugar (LUGAR) + restricción de mesa");
        break;
      case "mesa":
        rescates.push(
          "MESA ilegible → lo cubre: el puesto se resuelve sin mesa; la mesa se valida contra countTable",
        );
        break;
      case "lugar":
        rescates.push("LUGAR ilegible → lo cubre: código de país + zona + puesto identifican el puesto");
        break;
      case "barcode":
        rescates.push(
          "código de barras ilegible → la caja de ubicación lo reconstruye: 71000+Form+(2|3)+Ver+(01|02)+02",
        );
        break;
      default:
        break;
    }
  }
  if (muertos.length === 0 && borrosos.length > 0) {
    rescates.push(
      `los campos borrosos (${borrosos.join(", ")}) aportaron con peso reducido (permutación/fuzzy) y la suma decidió`,
    );
  }
  if (nivel === "AUTO" && muertos.length > 0) {
    rescates.push("la corroboración cruzada cubrió el hueco: AUTO alcanzado con campos muertos");
  }
  if (hayMesaError) {
    rescates.push("la mesa leída no existe en el ganador: el puesto queda resuelto y la mesa pasa a revisión");
  }
  return rescates;
}

// ---------- Motor ----------

/**
 * Resuelve la ruta DIVIPOL combinando toda la evidencia de la lectura.
 * NUNCA lanza y NUNCA completa a mano: sin evidencia suficiente devuelve
 * MANUAL con las alternativas como pista (§3.5, política del repo).
 */
export function fusionar(lectura: LecturaActa, base: DivipolBase): Resolucion {
  const indice = indiceDe(base);
  const barcode = campoUtil(lectura.barcode) ? parsearBarcode(lectura.barcode.valor) : null;
  const pagina = consensuarPagina(lectura, barcode);
  const tipo = consensuarTipo(lectura, barcode);

  const depCodigo = codigosDe(lectura.departamento, 2, true);
  const depNombreNorm = campoUtil(lectura.departamento)
    ? normalizarNombreFusion(lectura.departamento.valor.replace(/^\s*\d+\s*[-–—]?\s*/, ""))
    : "";
  const paisCodigo = codigosDe(lectura.paisCodigo, 3, true);
  const paisNombreNorm = campoUtil(lectura.paisNombre)
    ? normalizarNombreFusion(lectura.paisNombre.valor.replace(/^\s*\d+\s*[-–—]?\s*/, ""))
    : "";
  const zonaCodigo = codigosDe(lectura.zona, 2);
  const puestoCodigo = codigosDe(lectura.puesto, 2);
  const lugarNorm = campoUtil(lectura.lugar) ? normalizarNombreFusion(lectura.lugar.valor) : "";

  const mesaCruda = campoUtil(lectura.mesa) ? normalizarCodigoFusion(lectura.mesa.valor) : "";
  const mesaPermutaciones: number[] = [];
  if (mesaCruda) {
    for (const combo of permutacionesCodigo(mesaCruda)) {
      // Solo combinaciones 100 % numéricas: `parseInt` cortaría en la letra
      // («8I2» → 8) y fabricaría una mesa que nadie leyó.
      if (!/^\d+$/.test(combo)) continue;
      const n = Number.parseInt(combo, 10);
      if (Number.isFinite(n) && !mesaPermutaciones.includes(n)) mesaPermutaciones.push(n);
    }
  }
  const mesaExacta = /^\d+$/.test(mesaCruda) ? Number.parseInt(mesaCruda, 10) : null;

  const pool = poolDeCandidatos(lectura, indice, paisCodigo, paisNombreNorm, lugarNorm);
  const ctx: Contexto = {
    lectura,
    depCodigo,
    depNombreNorm,
    paisCodigo,
    paisNombreNorm,
    zonaCodigo,
    puestoCodigo,
    lugarNorm,
    conteoLugar: lugarNorm ? (indice.conteoNombrePuesto.get(lugarNorm) ?? 0) : 0,
    mesaExacta,
    mesaPermutaciones,
    indice,
  };

  const candidatos = pool
    .map((i) => puntuar(indice.puestos[i], ctx))
    .sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      const clave = (c: Candidato): string =>
        `${c.stand.departamento.codigo}-${c.stand.municipio.codigo}-${c.stand.zona.codigo}-${c.stand.puesto.codigo}`;
      return clave(a).localeCompare(clave(b));
    });

  let mejor: Candidato | null = candidatos[0] ?? null;
  const segundo = candidatos[1] ?? null;
  const gap = mejor ? mejor.puntos - Math.max(0, segundo?.puntos ?? 0) : 0;

  let nivel: NivelFusion = "MANUAL";
  if (mejor && mejor.puntos >= UMBRAL_AUTO && gap >= GAP_AUTO && mejor.grupos >= GRUPOS_MIN_AUTO) {
    nivel = "AUTO";
  } else if (mejor && mejor.puntos >= UMBRAL_SUGERIDA && gap >= GAP_SUGERIDA) {
    nivel = "SUGERIDA";
  }
  // Empate en la cima: MANUAL no elige por orden de recorrido (§3.5).
  if (mejor && segundo && segundo.puntos === mejor.puntos) mejor = null;

  const avisos: Aviso[] = [];
  if (campoUtil(lectura.barcode) && barcode === null) {
    avisos.push({
      tipo: "alerta",
      codigo: "BARCODE_ILEGIBLE",
      mensaje: "el código de barras no tiene 15 dígitos legibles; la página y el tipo se resuelven por otras fuentes",
    });
  }
  if (barcode && !barcode.plausible) {
    avisos.push({
      tipo: "alerta",
      codigo: "BARCODE_NO_PLAUSIBLE",
      mensaje: `código de barras no plausible (prefijo ${barcode.prefijo}, sufijo ${barcode.sufijo})`,
    });
  }
  if (!pagina.consistente) {
    const detalle = pagina.fuentes.map((f) => `${f.fuente}=${f.valor}`).join(", ");
    avisos.push({
      tipo: "error",
      codigo: "PAGINA_DISCREPANTE",
      mensaje: `las fuentes de página no coinciden (${detalle})`,
    });
  }
  if (!tipo.consistente) {
    const detalle = tipo.fuentes.map((f) => `${f.fuente}=${f.valor}`).join(", ");
    avisos.push({
      tipo: "error",
      codigo: "TIPO_DISCREPANTE",
      mensaje: `banner y código de barras señalan tipos distintos (${detalle})`,
    });
  }
  if (barcode?.tipoHipotesis?.certeza === "ambigua") {
    avisos.push({
      tipo: "alerta",
      codigo: "TIPO_AMBIGUO",
      mensaje:
        "d9=2 es ambiguo entre CÓNSUL/EMBAJADOR (informe) y DELEGADOS (documentación): hipótesis, no certeza",
    });
  }
  if (ctx.conteoLugar > 1) {
    avisos.push({
      tipo: "alerta",
      codigo: "LUGAR_AMBIGUO",
      mensaje: `el nombre del lugar coincide con ${ctx.conteoLugar} puestos del catálogo`,
    });
  }
  const referencia = mejor ?? candidatos[0] ?? null;
  const hayMesaError =
    referencia !== null && campoUtil(lectura.mesa) && referencia.mesaResuelta === null;
  if (hayMesaError) {
    avisos.push({
      tipo: "error",
      codigo: "MESA_FUERA_RANGO",
      mensaje: `la mesa leída no existe en el puesto ganador (${referencia!.stand.puesto.nombre}: 1–${referencia!.stand.puesto.mesas})`,
    });
  }
  if (pool.length === 0) {
    avisos.push({
      tipo: "info",
      codigo: "SIN_CANDIDATOS",
      mensaje:
        "sin evidencia de país ni de lugar no hay candidatos: la identidad requiere revisión humana",
    });
  }

  const rescates = armarRescates(lectura, nivel, hayMesaError);
  if (nivel === "MANUAL") {
    rescates.push("requiere revisión humana: ningún candidato alcanza el umbral de SUGERIDA");
  }

  return {
    nivel,
    gap,
    mejor,
    alternativas: candidatos.filter((c) => c !== mejor && c.puntos > 0).slice(0, 6),
    avisos,
    rescates,
    gruposActivos: mejor?.gruposActivos ?? [],
    barcode,
    pagina,
    tipo,
  };
}
