/**
 * Implementación mock de SupervisionRepository.
 *
 * KIT SUP-5 (T3 / D21): los puestos YA NO son un array demo de 20 — la
 * fuente es el catálogo DIVIPOLA exterior real (`cargarCatalogoDivipola()`,
 * 949 puestos / 67 países / 3.670 mesas). El estado (Global/Mesas/
 * Delegados/Transmisión) se SIEMBRA por hash determinístico del `idEnlace`
 * divipola (mismo seed → mismos KPIs siempre; nada aleatorio en render,
 * §0-9) con la MISMA distribución de estados que el mock anterior
 * (CRÍTICO ~5% · COMPLETO ~25% · PENDIENTE ~20% · NO_INICIADO ~50%).
 *
 * D6 queda SUPERSEDEDO: los KPIs iniciales dejan de ser los literales
 * 20/5/1/4/10 y se DERIVAN del catálogo sembrado, con la invariante
 * intacta: `total = completo + crítico + pendiente + no_iniciado` exacto.
 *
 * ANCLA DEMO (§2.3): el puesto `88_495_010_02` Roma - Consulado (ITALIA,
 * 8 mesas — el catálogo manda sobre el 499 del demo viejo) conserva su
 * estado demo completo: CRÍTICO, mesas 001-003 EXACTAS del mockup,
 * acta `#A92-F` con historial 14:00/14:18/14:20 y P2 con advertencia.
 * Los IDs internos quedan re-anclados al `idEnlace` real.
 *
 * C1 — SIN EFECTO DE IMPORT: importar este módulo no carga nada ni puede
 * lanzar. Los datos se siembran en `initSupervisionDatos()` (explícito e
 * idempotente); las lecturas del repo la invocan perezosamente
 * (`asegurarDatos()`) para no requerir cambios en el consumidor actual
 * (datos-provider, zona R4 — adopción explícita pendiente). Si la
 * validación ESTRUCTURAL del catálogo falla, el repo arranca VACÍO y el
 * motivo `BLOQUEADA: …` vuelve como Result — jamás un white-screen.
 *
 * Kit SUP-3: mesas determinísticas por puesto (cantidad EXACTA =
 * totalMesas del catálogo), pcts derivados de las mesas (D16), interfaz
 * async con latencia simulada ~400 ms (D12), mutaciones de T4 y
 * transición de vida de T3 (D13). Kit SUP-4: actas por contrato (§0-9).
 * Sin backend, sin persistencia: el estado vive en memoria del módulo.
 */

import type {
  Anomalia,
  EstadoGlobal,
  FiltrosPuestos,
  Mesa,
  Notificacion,
  Puesto,
  ResumenGlobal,
} from "../domain/types";
import type { PuestoDivipola } from "../domain/divipola";
import { zonaParaUI } from "../domain/divipola";
import {
  CIERRE_LOCAL_MIN,
  tramoDeMinutos,
  UMBRAL_CRITICO_MIN,
} from "../domain/tiempo-cierre";
import type { ActaMesa, FormularioTipo, PaginaActa } from "../domain/acta";
import { consultarActaRuntime } from "./actas-runtime";
import { ID_ENLACE_ROMA, cargarCatalogoDivipola } from "./divipola-adapter";
import { crearRandomDeterministico } from "../domain/acta";
import { diaDeNombrePuesto } from "../domain/jornada";
import type { SupervisionRepository } from "./supervision-repository";
import {
  aprobarActaMock,
  confirmarRescanActaMock,
  obtenerActa,
} from "./actas-mock";

/** ANCLA DE PRÁCTICA (SUP-6 §2.3 / D26): El Cairo - Consulado (EGIPTO) —
 * la mesa 001 sirve el acta real del digitalizador (kit actas-reales-v1). */
export const ID_ENLACE_CAIRO = "88_335_005_02";

/** ANCLA DE PRÁCTICA #2 (actas-reales-v2 / D44): Barcelona - Girona
 * (ESPAÑA) — la mesa 001 sirve el acta real CÓNSUL/EMBAJADOR del
 * digitalizador. Su seed natural cae PENDIENTE (mesa 001 NO_INICIADO →
 * sin acta → ancla inalcanzable); mismo mecanismo del ancla El Cairo
 * (D26): se FUERZA a COMPLETO. */
export const ID_ENLACE_BARCELONA = "88_355_003_08";

/** Supervisor de la sesión (header del mockup). */
export const SUPERVISOR = {
  nombre: "SUPERVISOR",
  id: "ADM-9482",
} as const;

/** Latencia simulada del mock (D12): el contrato es async desde hoy. */
const LATENCIA_MS = 400;
/** Latencia simulada de REINSPECCIONAR (T4): ~2.5 s de spinner. */
const LATENCIA_REINSPECCION_MS = 2500;
/** Intervalo del ticker de sincronización (T3). */
export const TICKER_SEGUNDOS = 5;
/** Cada cuántos segundos del ticker aplica UNA transición de vida (T3). */
export const TRANSICION_CADA_SEGUNDOS = 45;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Con latencia simulada (sin romper el determinismo de los datos). */
async function conLatencia<T>(valor: T, ms = LATENCIA_MS): Promise<T> {
  await esperar(ms);
  return valor;
}

// ─── Catálogo DIVIPOLA → Puesto (kit SUP-5 §3-T3) ───────────────────────────

/**
 * Distribución de estados SEMBRADA (misma proporción que el mock de 20:
 * 5 COMPLETO / 1 CRÍTICO / 4 PENDIENTE / 10 NO_INICIADO). El ancla Roma
 * se FUERZA a CRÍTICO aparte (§2.3).
 */
function estadoPorSeed(random: number): EstadoGlobal {
  if (random < 0.05) return "CRITICO"; // ~1 de cada 20 (como hoy)
  if (random < 0.3) return "COMPLETO"; // ~25%
  if (random < 0.5) return "PENDIENTE"; // ~20%
  return "NO_INICIADO"; // ~50%
}

/**
 * Regla del dueño (feedback de la matriz): un puesto con MÁS DE 3 HORAS
 * transcurridas desde el cierre de sus mesas (4:00 p. m. hora local) que
 * AÚN no completa la digitalización pasa a estado CRÍTICO automático —
 * «para saber cuáles puestos están quedados en la digitalización de las
 * actas». Los COMPLETO no se tocan (ya terminaron; quedan al fondo de la
 * matriz) y un CRÍTICO sembrado nunca se degrada. Umbral alineado con el
 * tramo «> 3 hrs» del dominio (UMBRAL_CRITICO_MIN, inclusivo — un puesto
 * que MUESTRA «> 3 hrs» en rojo no puede tener badge NO_INICIADO).
 *
 * La derivación es POSTERIOR al draw de estado (D43): no consume draws,
 * así que las secuencias determinísticas de mesas/actas quedan intactas.
 */
function derivarEstadoPorUmbral(
  sembrado: EstadoGlobal,
  minutosDesdeCierre: number
): EstadoGlobal {
  if (sembrado === "COMPLETO") return "COMPLETO";
  if (minutosDesdeCierre >= UMBRAL_CRITICO_MIN) return "CRITICO";
  return sembrado;
}

const CIERRES_COL_MIN = [9 * 60, 10 * 60, 11 * 60, 12 * 60, 13 * 60];

/**
 * TIEMPO transcurrido desde el cierre (pedido del dueño): la columna
 * «Tiempo» es el tiempo desde el cierre de 4:00 p. m. HORA LOCAL del
 * país del puesto de digitalización (regla del kit monitor-jornada-v1:
 * «cierre 4:00 p. m. hora local»); > 3 hrs es crítico. Distribución del
 * demo moldeada por tramos (30% / 25% / 20% / 25%) — mapea UN draw
 * uniforme a un minuto concreto dentro del tramo.
 */
function transcurridoPorSeed(r: number): number {
  if (r < 0.3) return Math.floor((r / 0.3) * 59); // < 1 hr: 0-58 min
  if (r < 0.55) return 60 + Math.floor(((r - 0.3) / 0.25) * 59); // 1-2 hrs
  if (r < 0.75) return 120 + Math.floor(((r - 0.55) / 0.2) * 59); // 2-3 hrs
  return 180 + Math.floor(((r - 0.75) / 0.25) * 175); // > 3 hrs: 180-354
}

/** "19:08" → "7:08 PM" (formato del mockup). */
function relojDeMinutos(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const sufijo = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${sufijo}`;
}

/**
 * Horarios creíbles + determinísticos por seed (el demo no conoce
 * zonas horarias reales; la coherencia EXACTA solo la exige el kit para
 * el ancla Roma — §4.9).
 *
 * Pedido del dueño (semántica de las columnas de tiempo):
 * - «Hora actual» = hora del PAÍS del puesto de digitalización — queda
 *   coherente por construcción: 16:00 local (cierre) + transcurrido.
 * - «Tiempo» = transcurrido desde el cierre de 4:00 p. m. LOCAL, con la
 *   etiqueta del tramo canónico (domain/tiempo-cierre).
 *
 * D43 — el horario consume EXACTAMENTE 3 draws como antes (cierre COL,
 * transcurrido, jitter quemado) para NO desplazar la posición del draw
 * de estado en la secuencia determinística: los estados sembrados y los
 * KPIs del demo quedan idénticos.
 */
function horarioPorSeed(random: () => number): {
  cierre: string;
  local: string;
  diferencia: string;
  minutosDesdeCierre: number;
} {
  // 1) Cierre en hora de Colombia (16:00 local convertido al huso).
  const cierre = CIERRES_COL_MIN[Math.floor(random() * CIERRES_COL_MIN.length)];
  // 2) Transcurrido desde el cierre local 4:00 p. m. (0–354 min).
  const transcurrido = transcurridoPorSeed(random());
  // 3) Tercer draw CONSERVADO (antes: jitter de minutos) — se quema para
  //    mantener la secuencia de seeds estable (estados/KPIs inalterados).
  void random();
  const local = CIERRE_LOCAL_MIN + transcurrido;
  const tramo = tramoDeMinutos(transcurrido);
  return {
    cierre: relojDeMinutos(cierre),
    local: relojDeMinutos(local),
    diferencia: tramo.etiqueta,
    minutosDesdeCierre: transcurrido,
  };
}

/** Valores EXACTOS del horario del ancla Roma (mockup original). 7:08 PM
 * local − 4:00 PM de cierre = 188 min → tramo «> 3 hrs» (coherente con
 * su estadoGlobal CRÍTICO). */
const HORARIO_ROMA = {
  cierre: "9:00 AM",
  local: "7:08 PM",
  diferencia: "> 3 hrs",
  minutosDesdeCierre: 188,
} as const;

/** Registro canónico → fila de la tabla (`Puesto`). El `id` ES el
 * `idEnlace` divipola (D22): re-ancla mesas, actas, anomalías y el join
 * futuro con el digitalizador. Códigos reales del catálogo, sin
 * transformar (§2.3). KIT monitor-jornada-v1: el día de la jornada se
 * DERIVA del nombre real del catálogo (prefijo LUNES…SABADO; puestos
 * base sin prefijo = DOMINGO — jornada de cierre, 2.181 mesas). */
function puestoDeRegistro(registro: PuestoDivipola): Puesto {
  const esAncla = registro.idEnlace === ID_ENLACE_ROMA;
  // D26: ancla de práctica El Cairo — se FUERZA a COMPLETO (mismo
  // mecanismo del ancla Roma → CRÍTICO). Su seed natural cae en
  // NO_INICIADO (4a llamada del seed > 0.5 — rango NO_INICIADO; el kit
  // lo anota como 0.9872): sin fuerza el ancla es inalcanzable.
  const esAnclaCairo = registro.idEnlace === ID_ENLACE_CAIRO;
  // D44: ancla de práctica #2 Barcelona - Girona — misma historia: seed
  // natural PENDIENTE (mesa 001 NO_INICIADO) → se FUERZA a COMPLETO para
  // que la acta real CÓNSUL/EMBAJADOR del digitalizador sea servible.
  const esAnclaBarcelona = registro.idEnlace === ID_ENLACE_BARCELONA;
  const random = crearRandomDeterministico(`divipola::puesto::${registro.idEnlace}`);
  const horario = esAncla ? HORARIO_ROMA : horarioPorSeed(random);
  // D43 — el 4.º draw SOLO se consume en puestos sin ancla (igual que
  // antes); la derivación por umbral (>3 hrs → CRÍTICO) es posterior y no
  // consume draws, así que la secuencia determinística queda intacta.
  const estadoSembrado: EstadoGlobal = esAncla
    ? "CRITICO"
    : esAnclaCairo || esAnclaBarcelona
      ? "COMPLETO"
      : estadoPorSeed(random());
  return {
    id: registro.idEnlace,
    codigoPais: registro.codigoMunicipio,
    pais: registro.nombreMunicipio,
    zonaId: registro.codigoZona,
    zona: zonaParaUI(registro.codigoZona),
    puesto: `${registro.codigoPuesto} - ${registro.nombre}`,
    numeroMesas: registro.totalMesas,
    horaCierreColombia: horario.cierre,
    horaActualLocal: horario.local,
    minutosDesdeCierre: horario.minutosDesdeCierre,
    diferenciaTiempo: horario.diferencia,
    // Los pcts se recalculan al inicializar (derivación de mesas, D16).
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: derivarEstadoPorUmbral(
      estadoSembrado,
      horario.minutosDesdeCierre
    ),
    diaJornada: diaDeNombrePuesto(registro.nombre),
  };
}

/** Puestos = catálogo DIVIPOLA exterior real (949 — §2.4). Se siembran
 * en `initSupervisionDatos()` — C1: importar el módulo NO carga nada. */
let PUESTOS: Puesto[] = [];

// ─── Generación determinística de mesas (T2 / D13) ──────────────────────────

function ok(): Mesa["delegados"]["p1"] {
  return "ok";
}
function pend(): Mesa["delegados"]["p1"] {
  return "pendiente";
}

/** Mesas 001-003 EXACTAS del mockup original (SUP-1 §2.4) — NO SE TOCAN:
 * hoy pertenecen al ANCLA Roma (`88_495_010_02`, kit SUP-5 §2.3). */
const MESAS_ITALIA_MOCKUP: Mesa[] = [
  {
    id: "001",
    delegados: { p1: "ok", p2: "ok" },
    transmision: {
      p1: { estado: "ok" },
      p2: { estado: "ok", alerta: "Rescaneo" },
    },
    estadoMesa: "INCOMPLETO",
    ultimaCarga: "Hace 12 min",
    accionSugerida: "reinspeccionar",
  },
  {
    id: "002",
    delegados: { p1: "ok", p2: "ok" },
    transmision: {
      p1: { estado: "pendiente" },
      p2: { estado: "pendiente" },
    },
    estadoMesa: "EN_PROCESO",
    ultimaCarga: "Hace 45 min",
    accionSugerida: "notificar",
  },
  {
    id: "003",
    delegados: { p1: "pendiente", p2: "pendiente" },
    transmision: {
      p1: { estado: "pendiente" },
      p2: { estado: "pendiente" },
    },
    estadoMesa: "NO_INICIADO",
    ultimaCarga: null,
    accionSugerida: "notificar",
  },
];

/**
 * Mesas por puesto, DETERMINÍSTICAS (sin random por render — arrays
 * fijos). Recetas del kit T2 (SUP-3), ahora sobre el catálogo real:
 * - COMPLETO → todas COMPLETO, ok, sin alertas, carga reciente.
 * - PENDIENTE → mezcla EN_PROCESO/NO_INICIADO, pendientes en partes.
 * - CRÍTICO → mayormente NO_INICIADO/INCOMPLETO, alerta "Rescaneo"
 *   presente (el ANCLA Roma: 3 exactas del mockup + 004-008 generadas;
 *   los demás críticos del catálogo: receta propia coherente).
 * - NO_INICIADO → todas NO_INICIADO, sin carga ("—").
 */
function generarMesasPuesto(puesto: Puesto): Mesa[] {
  const n = puesto.numeroMesas;
  const numero = (i: number) => String(i + 1).padStart(3, "0");
  const carga = (min: number) => `Hace ${min} min`;

  if (puesto.estadoGlobal === "COMPLETO") {
    return Array.from({ length: n }, (_, i) => ({
      id: numero(i),
      delegados: { p1: ok(), p2: ok() },
      transmision: { p1: { estado: "ok" }, p2: { estado: "ok" } },
      estadoMesa: "COMPLETO",
      ultimaCarga: carga(5 + i * 3),
      accionSugerida: "notificar",
    })) as Mesa[];
  }

  if (puesto.estadoGlobal === "NO_INICIADO") {
    return Array.from({ length: n }, (_, i) => ({
      id: numero(i),
      delegados: { p1: pend(), p2: pend() },
      transmision: { p1: { estado: "pendiente" }, p2: { estado: "pendiente" } },
      estadoMesa: "NO_INICIADO",
      ultimaCarga: null,
      accionSugerida: "notificar",
    })) as Mesa[];
  }

  // ANCLA Roma (CRÍTICO): 3 exactas del mockup + las restantes generadas
  // coherentes con CRÍTICO (mayoría NO_INICIADO, Rescaneo presente).
  if (puesto.id === ID_ENLACE_ROMA) {
    const restantes = Math.max(0, n - MESAS_ITALIA_MOCKUP.length);
    const generadas: Mesa[] = Array.from({ length: restantes }, (_, i) => {
      const indice = MESAS_ITALIA_MOCKUP.length + i;
      // 004 → INCOMPLETO con Rescaneo (coherente con CRÍTICO y con la
      // anomalía sembrada); 005 → EN_PROCESO; 006+ → NO_INICIADO.
      if (i === 0) {
        return {
          id: numero(indice),
          delegados: { p1: ok(), p2: ok() },
          transmision: {
            p1: { estado: "ok" },
            p2: { estado: "ok", alerta: "Rescaneo" },
          },
          estadoMesa: "INCOMPLETO",
          ultimaCarga: carga(21),
          accionSugerida: "reinspeccionar",
        } as Mesa;
      }
      if (i === 1) {
        return {
          id: numero(indice),
          delegados: { p1: ok(), p2: pend() },
          transmision: {
            p1: { estado: "ok" },
            p2: { estado: "pendiente" },
          },
          estadoMesa: "EN_PROCESO",
          ultimaCarga: carga(52),
          accionSugerida: "notificar",
        } as Mesa;
      }
      return {
        id: numero(indice),
        delegados: { p1: pend(), p2: pend() },
        transmision: { p1: { estado: "pendiente" }, p2: { estado: "pendiente" } },
        estadoMesa: "NO_INICIADO",
        ultimaCarga: null,
        accionSugerida: "notificar",
      } as Mesa;
    });
    return [...MESAS_ITALIA_MOCKUP.map((m) => ({ ...m })), ...generadas];
  }

  // CRÍTICO (resto del catálogo): la mesa 001 INCOMPLETO con alerta
  // "Rescaneo" (reinspeccionable, coherente con anomalías del tipo), la
  // 002 EN_PROCESO si hay más mesas y el resto NO_INICIADO.
  if (puesto.estadoGlobal === "CRITICO") {
    const mesas: Mesa[] = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        mesas.push({
          id: numero(i),
          delegados: { p1: ok(), p2: ok() },
          transmision: {
            p1: { estado: "ok" },
            p2: { estado: "ok", alerta: "Rescaneo" },
          },
          estadoMesa: "INCOMPLETO",
          ultimaCarga: carga(18),
          accionSugerida: "reinspeccionar",
        });
      } else if (i === 1) {
        mesas.push({
          id: numero(i),
          delegados: { p1: ok(), p2: pend() },
          transmision: { p1: { estado: "ok" }, p2: { estado: "pendiente" } },
          estadoMesa: "EN_PROCESO",
          ultimaCarga: carga(41),
          accionSugerida: "notificar",
        });
      } else {
        mesas.push({
          id: numero(i),
          delegados: { p1: pend(), p2: pend() },
          transmision: { p1: { estado: "pendiente" }, p2: { estado: "pendiente" } },
          estadoMesa: "NO_INICIADO",
          ultimaCarga: null,
          accionSugerida: "notificar",
        });
      }
    }
    return mesas;
  }

  // PENDIENTE: mezcla EN_PROCESO / NO_INICIADO (receta del kit).
  // - Con varias mesas: la ÚLTIMA es EN_PROCESO (delegados completos,
  //   transmisión a medias → candidato de transición de vida), el resto
  //   NO_INICIADO. Con 1 mesa: la mesa única es EN_PROCESO con partes a
  //   medias.
  const mesas: Mesa[] = [];
  for (let i = 0; i < n; i++) {
    const esUltima = i === n - 1;
    const indice = i;
    if (esUltima) {
      mesas.push({
        id: numero(indice),
        delegados: { p1: ok(), p2: ok() },
        transmision: { p1: { estado: "ok" }, p2: { estado: "pendiente" } },
        estadoMesa: "EN_PROCESO",
        ultimaCarga: carga(47),
        accionSugerida: "notificar",
      });
    } else {
      mesas.push({
        id: numero(indice),
        delegados: { p1: pend(), p2: pend() },
        transmision: { p1: { estado: "pendiente" }, p2: { estado: "pendiente" } },
        estadoMesa: "NO_INICIADO",
        ultimaCarga: null,
        accionSugerida: "notificar",
      });
    }
  }
  return mesas;
}

/** Estado de mesa derivado de sus partes (regla única, D13). */
function estadoMesaDePartes(mesa: Mesa): Mesa["estadoMesa"] {
  if (
    mesa.transmision.p1.alerta ||
    mesa.transmision.p2.alerta
  ) {
    return "INCOMPLETO";
  }
  const partesOk =
    (mesa.delegados.p1 === "ok" ? 1 : 0) +
    (mesa.delegados.p2 === "ok" ? 1 : 0) +
    (mesa.transmision.p1.estado === "ok" ? 1 : 0) +
    (mesa.transmision.p2.estado === "ok" ? 1 : 0);
  if (partesOk === 4) return "COMPLETO";
  if (partesOk === 0) return "NO_INICIADO";
  return "EN_PROCESO";
}

/** Recalcula estadoMesa + accionSugerida de una mesa (in place). */
function refrescarMesa(mesa: Mesa): void {
  mesa.estadoMesa = estadoMesaDePartes(mesa);
  mesa.accionSugerida = mesa.estadoMesa === "INCOMPLETO" ? "reinspeccionar" : "notificar";
}

/**
 * pcts derivables de las mesas (≈ % de partes ok, kit T2).
 *
 * REGLA DEL DUEÑO (feedback matriz): «si ya se recibieron todas las actas
 * de un puesto debería quedar al 100% y completado en verde». Para que
 * 100% ⟺ COMPLETO sea EXACTO, una parte de transmisión con alerta de
 * rescaneo PENDIENTE NO cuenta como recibida — el acta llegó pero fue
 * rechazada (se ve en el detalle con «Rescaneo» + reinspeccionar) y el
 * % solo sube con actas válidas. Así ningún puesto muestra 100%/100%
 * sin estar COMPLETO (antes: 134 puestos de 1 mesa con 100%/100% en
 * rojo CRÍTICO — la barra contaba la parte alertada y el estado no).
 */
function pctsDeMesas(mesas: Mesa[]): { delegado: number; transmision: number } {
  const total = mesas.length * 2;
  if (total === 0) return { delegado: 0, transmision: 0 };
  const delegOk = mesas.reduce(
    (s, m) =>
      s + (m.delegados.p1 === "ok" ? 1 : 0) + (m.delegados.p2 === "ok" ? 1 : 0),
    0
  );
  const transOk = mesas.reduce(
    (s, m) =>
      s +
      (m.transmision.p1.estado === "ok" && !m.transmision.p1.alerta ? 1 : 0) +
      (m.transmision.p2.estado === "ok" && !m.transmision.p2.alerta ? 1 : 0),
    0
  );
  return {
    delegado: Math.round((delegOk / total) * 100),
    transmision: Math.round((transOk / total) * 100),
  };
}

/**
 * Estado global derivado: COMPLETO si TODAS las mesas lo están (todas las
 * actas recibidas y válidas — regla del dueño: 100% ⟺ verde); si no, se
 * conserva el estado actual (el kit solo define transición → COMPLETO).
 * Consecuencia de la regla: un puesto COMPLETO jamás es degradado por el
 * umbral de 3 hrs — el CRÍTICO automático solo alcanza a los que NO han
 * completado la digitalización.
 */
function estadoGlobalTrasMesas(actual: Puesto["estadoGlobal"], mesas: Mesa[]): Puesto["estadoGlobal"] {
  const todasCompletas = mesas.length > 0 && mesas.every((m) => m.estadoMesa === "COMPLETO");
  return todasCompletas ? "COMPLETO" : actual;
}

// ─── Estado mutable del mock (en memoria — sin persistencia, §0-5) ─────────

const MESAS_POR_PUESTO: Record<string, Mesa[]> = {};
let NOTIFICACIONES: Notificacion[] = [];
let ANOMALIAS: Anomalia[] = [];

/** Etiqueta de puesto para textos ("ITALIA — 02 - Roma - Consulado"). */
function etiquetaDePuesto(puesto: Puesto): string {
  return `${puesto.pais} — ${puesto.puesto}`;
}

/**
 * Búsqueda DETERMINÍSTICA de un puesto real de un país con una mesa dada
 * en un estado útil (re-anclaje de las semillas de notificaciones y
 * anomalías al catálogo real — kit SUP-5 §3-T3.5). Prioridad de estados
 * coherentes con la semilla; fallback: cualquier mesa con transmisión;
 * fallback final: el primer puesto del país.
 */
function buscarPuestoDePais(
  pais: string,
  mesaIndice: number
): { puesto: Puesto; mesa: Mesa } | null {
  const delPais = PUESTOS.filter((p) => p.pais === pais);
  const candidatos = delPais
    .map((puesto) => ({ puesto, mesa: MESAS_POR_PUESTO[puesto.id]?.[mesaIndice] }))
    .filter(({ mesa }) => Boolean(mesa));
  const prioridad: Mesa["estadoMesa"][] = ["INCOMPLETO", "EN_PROCESO", "COMPLETO"];
  for (const estado of prioridad) {
    const hallado = candidatos.find(({ mesa }) => mesa.estadoMesa === estado);
    if (hallado) return hallado;
  }
  const conTransmision = candidatos.find(({ mesa }) => mesa.estadoMesa !== "NO_INICIADO");
  if (conTransmision) return conTransmision;
  return candidatos.length > 0 ? candidatos[0] : null;
}

export type ResultadoInitSupervision =
  | { ok: true; puestos: number; paises: number; mesas: number }
  | { ok: false; motivo: string };

let RESULTADO_INIT: ResultadoInitSupervision | null = null;

/**
 * C1 — inicialización EXPLÍCITA de los datos de supervisión (sustituye al
 * efecto de import que había hoy): carga el catálogo (Result — nunca
 * lanza), siembra puestos + mesas + semillas de notificaciones/anomalías
 * y deja el repo servible. IDEMPOTENTE (memoizada — la prep es una sola
 * vez, D12).
 *
 * Contrato del fallo: si la validación ESTRUCTURAL del catálogo falla, el
 * repo arranca VACÍO (0 puestos: la UI muestra el monitor sin filas,
 * jamás un white-screen) y el motivo `BLOQUEADA: …` vuelve por aquí. Los
 * conteos del kit (949/67/3.670) NO bloquean (C1): una desviación solo
 * advierte en consola — el guard vive en data/__tests__.
 *
 * ADOPCIÓN PENDIENTE (R4): el punto de consumo actual
 * (components/datos-provider.tsx) no la llama aún — las lecturas del
 * repo inicializan perezosamente (`asegurarDatos()`) para no exigir
 * cambios en R4. Llamarla en el mount haría explícito el momento de
 * carga y el manejo del motivo BLOQUEADA.
 */
export function initSupervisionDatos(): ResultadoInitSupervision {
  if (RESULTADO_INIT) return RESULTADO_INIT;

  const catalogo = cargarCatalogoDivipola();
  if (!catalogo.ok) {
    RESULTADO_INIT = { ok: false, motivo: catalogo.motivo };
    return RESULTADO_INIT;
  }

  PUESTOS = catalogo.catalogo.map(puestoDeRegistro);

  for (const puesto of PUESTOS) {
    const mesas = generarMesasPuesto(puesto);
    MESAS_POR_PUESTO[puesto.id] = mesas;
    // T2: los pcts del puesto deben ser DERIVABLES de sus mesas — se
    // corrigen al inicializar (D16 documenta los valores que cambian).
    const pcts = pctsDeMesas(mesas);
    puesto.pctDelegado = pcts.delegado;
    puesto.pctTransmision = pcts.transmision;
    // REGLA DEL DUEÑO (red de seguridad sobre la semilla/umbral): si todas
    // las mesas del puesto ya están completas, el puesto QUEDA COMPLETO.
    // Hoy es no-op sobre la receta de siembra (solo la receta COMPLETO
    // genera mesas todas COMPLETO), pero garantiza la invariante
    // «100% visible ⟺ COMPLETO verde» ante futuros cambios de receta.
    puesto.estadoGlobal = estadoGlobalTrasMesas(puesto.estadoGlobal, mesas);
  }

  // Época de la sesión congelada: las fechas relativas de las semillas
  // son estables entre renders (igual que el AHORA de módulo anterior).
  const AHORA = Date.now();
  const MIN = 60_000;

  const anclaRoma = PUESTOS.find((p) => p.id === ID_ENLACE_ROMA) ?? PUESTOS[0];
  if (anclaRoma) {
    // España/México/Países Bajos: puestos REALES del catálogo para las
    // semillas (determinístico — §0-9). INGLATERRA existe en el catálogo
    // (Londres); su anomalía es de puesto (sin mesa).
    const semillaEspana = buscarPuestoDePais("ESPAÑA", 0) ?? { puesto: anclaRoma, mesa: MESAS_POR_PUESTO[anclaRoma.id][0] };
    const semillaMexico = buscarPuestoDePais("MEXICO", 1) ?? { puesto: anclaRoma, mesa: MESAS_POR_PUESTO[anclaRoma.id][0] };
    const semillaPaisesBajos = buscarPuestoDePais("PAISES BAJOS", 0) ?? { puesto: anclaRoma, mesa: MESAS_POR_PUESTO[anclaRoma.id][0] };
    const semillaInglaterra =
      PUESTOS.find((p) => p.pais === "INGLATERRA") ?? anclaRoma;
    const mesaEnCursoMexico =
      MESAS_POR_PUESTO[semillaMexico.puesto.id]?.find((m) => m.estadoMesa === "EN_PROCESO") ??
      semillaMexico.mesa;

    /** Semillas T5 (7): coherentes con los datos (Roma rescaneo, España
     * retraso…), ya re-ancladas a los códigos reales del catálogo.
     * 3 no leídas → badge inicial 3. */
    NOTIFICACIONES = [
      { id: "notif-1", tipo: "rescaneo", texto: `Rescaneo requerido en Mesa 001 (${etiquetaDePuesto(anclaRoma)})`, fecha: AHORA - 12 * MIN, leida: false },
      { id: "notif-2", tipo: "retraso", texto: `Retraso en transmisión — ${etiquetaDePuesto(semillaEspana.puesto)}`, fecha: AHORA - 38 * MIN, leida: false },
      { id: "notif-3", tipo: "transmision", texto: `Transmisión en curso — Mesa ${mesaEnCursoMexico.id} (${etiquetaDePuesto(semillaMexico.puesto)})`, fecha: AHORA - 47 * MIN, leida: false },
      { id: "notif-4", tipo: "sistema", texto: `Sincronización completada: ${PUESTOS.length} puestos al día`, fecha: AHORA - 65 * MIN, leida: true },
      { id: "notif-5", tipo: "rescaneo", texto: `Rescaneo requerido en Mesa 004 (${etiquetaDePuesto(anclaRoma)})`, fecha: AHORA - 21 * MIN, leida: false },
      { id: "notif-6", tipo: "sistema", texto: "Respaldo de datos del consolidado completado", fecha: AHORA - 5 * 60 * MIN, leida: true },
      { id: "notif-7", tipo: "transmision", texto: `Transmisión restablecida — ${etiquetaDePuesto(semillaPaisesBajos.puesto)}`, fecha: AHORA - 26 * 60 * MIN, leida: true },
    ];

    /** Semillas T6: 5 ABIERTAS (badge dinámico real del mockup) + 2 revisadas
     * de histórico (para el filtro por estado) — re-ancladas al catálogo. */
    ANOMALIAS = [
      { id: "anom-1", tipo: "Rescaneo", puestoId: anclaRoma.id, puesto: etiquetaDePuesto(anclaRoma), mesaId: "001", severidad: "critica", fecha: AHORA - 12 * MIN, revisada: false },
      { id: "anom-2", tipo: "Mesa incompleta", puestoId: anclaRoma.id, puesto: etiquetaDePuesto(anclaRoma), mesaId: "004", severidad: "alta", fecha: AHORA - 21 * MIN, revisada: false },
      { id: "anom-3", tipo: "Transmisión caída", puestoId: semillaEspana.puesto.id, puesto: etiquetaDePuesto(semillaEspana.puesto), mesaId: semillaEspana.mesa.id, severidad: "alta", fecha: AHORA - 38 * MIN, revisada: false },
      { id: "anom-4", tipo: "Desfase de hora", puestoId: semillaEspana.puesto.id, puesto: etiquetaDePuesto(semillaEspana.puesto), severidad: "media", fecha: AHORA - 52 * MIN, revisada: false },
      { id: "anom-5", tipo: "Mesa incompleta", puestoId: semillaMexico.puesto.id, puesto: etiquetaDePuesto(semillaMexico.puesto), mesaId: semillaMexico.mesa.id, severidad: "media", fecha: AHORA - 2 * 60 * MIN, revisada: false },
      { id: "anom-6", tipo: "Rescaneo", puestoId: semillaPaisesBajos.puesto.id, puesto: etiquetaDePuesto(semillaPaisesBajos.puesto), mesaId: semillaPaisesBajos.mesa.id, severidad: "media", fecha: AHORA - 26 * 60 * MIN, revisada: true },
      { id: "anom-7", tipo: "Desfase de hora", puestoId: semillaInglaterra.id, puesto: etiquetaDePuesto(semillaInglaterra), severidad: "media", fecha: AHORA - 8 * 60 * MIN, revisada: true },
    ];
  }

  const mesasSembradas = Object.values(MESAS_POR_PUESTO).reduce(
    (suma, mesas) => suma + mesas.length,
    0
  );
  RESULTADO_INIT = {
    ok: true,
    puestos: PUESTOS.length,
    paises: new Set(PUESTOS.map((p) => p.pais)).size,
    mesas: mesasSembradas,
  };
  return RESULTADO_INIT;
}

/** C1 — inicialización PEREZOSA por compatibilidad: los métodos del repo
 * siembran al primer uso si nadie llamó `initSupervisionDatos()` aún
 * (datos-provider no lo hace — adopción explícita pendiente de R4). */
function asegurarDatos(): void {
  if (!RESULTADO_INIT) initSupervisionDatos();
}

let contadorNotificaciones = 0;

function crearNotificacion(tipo: Notificacion["tipo"], texto: string): Notificacion {
  contadorNotificaciones += 1;
  return {
    id: `notif-nueva-${contadorNotificaciones}`,
    tipo,
    texto,
    fecha: Date.now(),
    leida: false,
  };
}

function puestoPorId(puestoId: string): Puesto | undefined {
  return PUESTOS.find((p) => p.id === puestoId);
}

function refrescarPuesto(puesto: Puesto): void {
  const mesas = MESAS_POR_PUESTO[puesto.id] ?? [];
  const pcts = pctsDeMesas(mesas);
  puesto.pctDelegado = pcts.delegado;
  puesto.pctTransmision = pcts.transmision;
  puesto.estadoGlobal = estadoGlobalTrasMesas(puesto.estadoGlobal, mesas);
}

/**
 * KIT carga-masiva-supervision-v1 (D27) — superpone el registro RUNTIME del
 * digitalizador (fotos + encabezado impreso) sobre el acta base del mock.
 * Las fotos del runtime MANDAN en las páginas que traen; el resto cae al
 * acta base o al sintético D18. Si la mesa no tenía acta (NO_INICIADO), se
 * construye una mínima honesta desde el registro runtime.
 */
function fusionarActaRuntime(
  base: ActaMesa | null,
  runtime: import("./actas-reales/actas-reales").ActaRealLista,
  puesto: Puesto,
  mesa: Mesa
): ActaMesa {
  const horaRuntime = (() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} LOCAL`;
  })();
  const acta: ActaMesa = base
    ? {
        ...base,
        formularios: { ...base.formularios },
        historial: [...base.historial],
        fotos: { ...(base.fotos ?? {}) },
      }
    : {
        id: `#MSV-${runtime.idEnlace.replace(/_/g, "")}-${runtime.mesa}`,
        mesaId: mesa.id,
        puestoId: puesto.id,
        horaCarga: horaRuntime,
        formularios: { TRANSMISION: [], DELEGADOS: [] },
        historial: [
          {
            hora: horaRuntime,
            titulo: "CARGA MASIVA",
            detalle: "Acta recibida del digitalizador (carga masiva)",
            nivel: "NEUTRAL",
          },
        ],
        version: 1,
      };

  // Formularios: tamaño y estado por página — runtime con foto → VALIDA;
  // sin foto → lo que diga el base, o PENDIENTE.
  const formularios: Record<FormularioTipo, PaginaActa[]> = {
    TRANSMISION: [...acta.formularios.TRANSMISION],
    DELEGADOS: [...acta.formularios.DELEGADOS],
  };
  for (const formulario of ["TRANSMISION", "DELEGADOS"] as FormularioTipo[]) {
    const slotRuntime = runtime.fotos[formulario];
    if (!slotRuntime) continue;
    const total = Math.max(
      slotRuntime.length,
      formularios[formulario].length,
      1
    );
    const paginas: PaginaActa[] = [];
    for (let i = 0; i < total; i++) {
      paginas.push({
        numero: i + 1,
        estado: slotRuntime[i]
          ? "VALIDA"
          : (formularios[formulario][i]?.estado ?? "PENDIENTE"),
      });
    }
    formularios[formulario] = paginas;
  }
  acta.formularios = formularios;

  // Fotos: el runtime manda donde trae foto; el base cubre el resto.
  const fotos = { ...(acta.fotos ?? {}) } as NonNullable<ActaMesa["fotos"]>;
  for (const formulario of ["TRANSMISION", "DELEGADOS"] as FormularioTipo[]) {
    const slotRuntime = runtime.fotos[formulario];
    if (!slotRuntime) continue;
    const baseSlot = fotos[formulario] ?? [];
    const total = Math.max(slotRuntime.length, baseSlot.length);
    const fusion: (import("../domain/acta").FotoActa | null)[] = [];
    for (let i = 0; i < total; i++) {
      fusion.push(slotRuntime[i] ?? baseSlot[i] ?? null);
    }
    fotos[formulario] = fusion;
  }
  acta.fotos = fotos;

  // Encabezado impreso verbatim del runtime (se muestra, no se interpreta).
  acta.impresion = runtime.impresion;
  return acta;
}

function coincide(puesto: Puesto, f: FiltrosPuestos | undefined): boolean {
  if (!f) return true;
  if (f.pais && puesto.codigoPais !== f.pais) return false;
  // KIT monitor-jornada-v1: filtro por día de la jornada electoral.
  if (f.fecha && puesto.diaJornada !== f.fecha) return false;
  if (f.zona && puesto.zonaId !== f.zona) return false;
  if (f.puesto && puesto.puesto !== f.puesto) return false;
  if (f.estado && puesto.estadoGlobal !== f.estado) return false;
  // M3 — contrato de filtros COMPLETO (reporte 02a 🔴-1): cierreCol y
  // tiempo estaban declarados en FiltrosPuestos (types.ts:140-145) pero
  // no implementados aquí (código muerto; el filtrado real vivía
  // duplicado en monitor-global.tsx:68-72). Misma semántica que allí:
  if (f.cierreCol && puesto.horaCierreColombia !== f.cierreCol) return false;
  if (f.tiempo && tramoDeMinutos(puesto.minutosDesdeCierre).id !== f.tiempo) {
    return false;
  }
  const q = f.busqueda?.trim().toLowerCase();
  if (q) {
    const texto = [
      puesto.id,
      puesto.codigoPais,
      puesto.pais,
      puesto.zona,
      puesto.puesto,
    ]
      .join(" ")
      .toLowerCase();
    if (!texto.includes(q)) return false;
  }
  return true;
}

/**
 * M11 — clonado PROFUNDO mínimo en la frontera del repo (reporte 02a
 * 🟡-1): `{...mesa}` dejaba `delegados` y `transmision` (con `p1/p2` y
 * `alerta`) ALIASADOS al singleton; un mutador externo corrompía el
 * estado global del demo sin rastro.
 */
function clonarMesa(mesa: Mesa): Mesa {
  return {
    ...mesa,
    delegados: { ...mesa.delegados },
    transmision: {
      p1: { ...mesa.transmision.p1 },
      p2: { ...mesa.transmision.p2 },
    },
  };
}

export const mockSupervisionRepository: SupervisionRepository = {
  async getResumen(): Promise<ResumenGlobal> {
    asegurarDatos();
    const resumen: ResumenGlobal = {
      total: PUESTOS.length,
      completo: 0,
      critico: 0,
      pendiente: 0,
      noIniciado: 0,
    };
    for (const puesto of PUESTOS) {
      if (puesto.estadoGlobal === "COMPLETO") resumen.completo += 1;
      if (puesto.estadoGlobal === "CRITICO") resumen.critico += 1;
      if (puesto.estadoGlobal === "PENDIENTE") resumen.pendiente += 1;
      if (puesto.estadoGlobal === "NO_INICIADO") resumen.noIniciado += 1;
    }
    return conLatencia(resumen);
  },

  async getPuestos(filtros?: FiltrosPuestos): Promise<Puesto[]> {
    asegurarDatos();
    return conLatencia(PUESTOS.filter((puesto) => coincide(puesto, filtros)).map((p) => ({ ...p })));
  },

  async getMesasDePuesto(puestoId: string): Promise<Mesa[]> {
    asegurarDatos();
    return conLatencia((MESAS_POR_PUESTO[puestoId] ?? []).map(clonarMesa));
  },

  async getNotificaciones(): Promise<Notificacion[]> {
    asegurarDatos();
    return conLatencia(NOTIFICACIONES.map((n) => ({ ...n })));
  },

  async getAnomalias(): Promise<Anomalia[]> {
    asegurarDatos();
    return conLatencia(ANOMALIAS.map((a) => ({ ...a })));
  },

  async resolverRescaneo(puestoId, mesaId) {
    asegurarDatos();
    await esperar(LATENCIA_REINSPECCION_MS);
    const puesto = puestoPorId(puestoId);
    const mesa = MESAS_POR_PUESTO[puestoId]?.find((m) => m.id === mesaId);
    if (!puesto || !mesa) return null;
    const teniaAlerta =
      Boolean(mesa.transmision.p1.alerta) || Boolean(mesa.transmision.p2.alerta);
    if (!teniaAlerta) return null;
    // T4: la alerta "Rescaneo" se resuelve (desaparece) y se recalcula.
    mesa.transmision.p1 = { ...mesa.transmision.p1, alerta: undefined };
    mesa.transmision.p2 = { ...mesa.transmision.p2, alerta: undefined };
    refrescarMesa(mesa);
    refrescarPuesto(puesto);
    const notificacion = crearNotificacion(
      "rescaneo",
      `Rescaneo completado en Mesa ${mesa.id} (${etiquetaDePuesto(puesto)})`
    );
    NOTIFICACIONES.unshift(notificacion);
    return { mesa: clonarMesa(mesa), notificacion: { ...notificacion } };
  },

  async aplicarTransicionVida() {
    asegurarDatos();
    await conLatencia(true);
    // Candidatas: mesas EN_PROCESO. Preferencia (D13): la primera cuya
    // transición COMPLETA su puesto (KPIs en vivo); si ninguna completa,
    // la primera EN_PROCESO en orden del mock.
    const candidatas: { puesto: Puesto; mesa: Mesa }[] = [];
    for (const puesto of PUESTOS) {
      for (const mesa of MESAS_POR_PUESTO[puesto.id] ?? []) {
        if (mesa.estadoMesa === "EN_PROCESO") candidatas.push({ puesto, mesa });
      }
    }
    if (candidatas.length === 0) return null;
    const elegida =
      candidatas.find(({ puesto, mesa }) => {
        const restantes = (MESAS_POR_PUESTO[puesto.id] ?? []).filter(
          (m) => m.id !== mesa.id && m.estadoMesa !== "COMPLETO"
        ).length;
        return restantes === 0;
      }) ?? candidatas[0];
    const { puesto, mesa } = elegida;
    // La transición completa las partes pendientes de la mesa.
    if (mesa.delegados.p1 !== "ok") mesa.delegados.p1 = "ok";
    if (mesa.delegados.p2 !== "ok") mesa.delegados.p2 = "ok";
    if (mesa.transmision.p1.estado !== "ok")
      mesa.transmision.p1 = { ...mesa.transmision.p1, estado: "ok" };
    if (mesa.transmision.p2.estado !== "ok")
      mesa.transmision.p2 = { ...mesa.transmision.p2, estado: "ok" };
    refrescarMesa(mesa);
    mesa.ultimaCarga = "Hace 1 min";
    const estadoAntes = puesto.estadoGlobal;
    refrescarPuesto(puesto);
    return {
      puestoId: puesto.id,
      mesaId: mesa.id,
      puestoEstado: puesto.estadoGlobal,
      puestoCompletado:
        estadoAntes !== "COMPLETO" && puesto.estadoGlobal === "COMPLETO",
    };
  },

  // ── KIT SUP-4 (actas-v1) — el acta llega por el repositorio (§0-9) ──────

  async getActaDeMesa(puestoId: string, mesaId: string) {
    asegurarDatos();
    const puesto = puestoPorId(puestoId);
    const mesa = MESAS_POR_PUESTO[puestoId]?.find((m) => m.id === mesaId);
    if (!puesto || !mesa) return conLatencia(null);
    // KIT carga-masiva (D27): el registro RUNTIME del digitalizador manda —
    // sus fotos se superponen al acta base (o la construyen si la mesa era
    // NO_INICIADO y no tenía acta). Sin runtime, camino de siempre.
    const runtime = consultarActaRuntime(puestoId, mesaId);
    if (runtime) {
      return conLatencia(
        fusionarActaRuntime(obtenerActa(mesa, puesto), runtime, puesto, mesa)
      );
    }
    // null = mesa sin transmisión (NO_INICIADO) o inexistente.
    return conLatencia(obtenerActa(mesa, puesto));
  },

  // ── KIT carga-masiva-supervision-v1 (D27) — estado del monitor ──────────

  async registrarCargaMasiva(puestoId, mesaId, formulario, paginas) {
    asegurarDatos();
    await conLatencia(true);
    const puesto = puestoPorId(puestoId);
    const mesa = MESAS_POR_PUESTO[puestoId]?.find((m) => m.id === mesaId);
    if (!puesto || !mesa) return null;
    // Las partes de la mesa reflejan lo recibido: TRANSMISION pág n →
    // transmisión pn ok (1|2); DELEGADOS → delegados presentes. Idempotente
    // por construcción (ok → ok).
    if (formulario === "TRANSMISION") {
      for (const pagina of paginas) {
        if (pagina === 1) mesa.transmision.p1 = { ...mesa.transmision.p1, estado: "ok" };
        if (pagina === 2) mesa.transmision.p2 = { ...mesa.transmision.p2, estado: "ok" };
      }
    } else {
      mesa.delegados.p1 = "ok";
      mesa.delegados.p2 = "ok";
    }
    refrescarMesa(mesa);
    mesa.ultimaCarga = "Hace 1 min";
    refrescarPuesto(puesto);
    const notificacion = crearNotificacion(
      "sistema",
      `CARGA MASIVA — MESA ${mesa.id} (${etiquetaDePuesto(puesto)})`
    );
    NOTIFICACIONES.unshift(notificacion);
    return { mesa: clonarMesa(mesa), notificacion: { ...notificacion } };
  },

  async aprobarActa(actaId: string, observacion: string) {
    asegurarDatos();
    await esperar(LATENCIA_REINSPECCION_MS);
    const acta = aprobarActaMock(actaId, observacion);
    if (!acta) return null;
    const puesto = puestoPorId(acta.puestoId);
    const etiquetaPuesto = puesto ? etiquetaDePuesto(puesto) : acta.puestoId;
    // T5.3 — notificación nueva (plantilla 1/2 del kit).
    const notificacion = crearNotificacion(
      "sistema",
      `ACTA APROBADA — MESA ${acta.mesaId} (${etiquetaPuesto})`
    );
    NOTIFICACIONES.unshift(notificacion);
    // T5.3 — anomalía vinculada abierta pasa a revisada (badge incluido).
    const vinculada = ANOMALIAS.find(
      (a) =>
        !a.revisada && a.puestoId === acta.puestoId && a.mesaId === acta.mesaId
    );
    const anomalia = vinculada
      ? (() => {
          vinculada.revisada = true;
          return { ...vinculada };
        })()
      : undefined;
    return { acta, notificacion: { ...notificacion }, anomalia };
  },

  async confirmarRescanActa(actaId: string, _observacion: string) {
    asegurarDatos();
    // La observación es OBLIGATORIA (T5.2) pero el kit no la imprime en el
    // evento/notificación del rescan (textos exactos de T5.4) — queda en la
    // auditoría del visor.
    await esperar(LATENCIA_REINSPECCION_MS);
    const acta = confirmarRescanActaMock(actaId, _observacion);
    if (!acta) return null;
    const puesto = puestoPorId(acta.puestoId);
    const etiquetaPuesto = puesto ? etiquetaDePuesto(puesto) : acta.puestoId;
    // T5.4 — notificación nueva (plantilla 2/2 del kit).
    const notificacion = crearNotificacion(
      "rescaneo",
      `RESCANEO COMPLETADO — MESA ${acta.mesaId} (${etiquetaPuesto})`
    );
    NOTIFICACIONES.unshift(notificacion);
    return { acta, notificacion: { ...notificacion } };
  },
};
