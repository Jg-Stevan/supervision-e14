/**
 * Implementación mock de SupervisionRepository.
 *
 * Datos demo del mockup (SUP-1 §2.4) + relleno creíble autorizado para que
 * los conteos cuadren EXACTAMENTE con los KPIs iniciales (D6): total 20,
 * completo 5, crítico 1, pendiente 4, no iniciado 10.
 *
 * KIT SUP-3 (T2): mesas determinísticas para los 20 puestos (cantidad
 * EXACTA = numeroMesas; Italia conserva sus 3 mesas EXACTAS del mockup
 * original — no se tocan — y se le generan las 5 restantes coherentes con
 * CRÍTICO). Los pctDelegado/pctTransmision se DERIVAN de las mesas
 * (≈ % de partes ok) — kit T2. Interfaz async con latencia simulada
 * ~400 ms (D12). Mutaciones de T4 + transición de vida de T3 (D13).
 * Sin backend, sin persistencia: el estado vive en memoria del módulo.
 */

import type {
  Anomalia,
  FiltrosPuestos,
  Mesa,
  Notificacion,
  Puesto,
  ResumenGlobal,
} from "../domain/types";
import type { SupervisionRepository } from "./supervision-repository";
import {
  aprobarActaMock,
  confirmarRescanActaMock,
  obtenerActa,
} from "./actas-mock";

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

/**
 * 20 puestos: los 5 visibles del mockup + 15 de relleno creíble
 * (países/zonas variados, autorizado en SUP-1 §2.4 "Decisión de
 * consistencia"). Los pcts se recalculan al inicializar (derivación de
 * mesas, D16) — los valores literales de aquí abajo son el punto de
 * partida del mockup y quedan documentados en docs/DECISIONS.md.
 */
const PUESTOS: Puesto[] = [
  // ── Mockup §2.4 (5 visibles) ────────────────────────────────────────────
  {
    id: "puesto-499",
    codigoPais: "499",
    pais: "Italia",
    zonaId: "10",
    zona: "10",
    puesto: "02 - Roma",
    numeroMesas: 8,
    horaCierreColombia: "9:00 AM",
    horaActualLocal: "7:08 PM",
    diferenciaTiempo: "> 3 hrs",
    pctDelegado: 59,
    pctTransmision: 29,
    estadoGlobal: "CRITICO",
  },
  {
    id: "puesto-435",
    codigoPais: "435",
    pais: "Países Bajos",
    zonaId: "65",
    zona: "65",
    puesto: "04 - La Haya",
    numeroMesas: 1,
    horaCierreColombia: "9:00 AM",
    horaActualLocal: "7:08 PM",
    diferenciaTiempo: "< 1 hr",
    pctDelegado: 100,
    pctTransmision: 100,
    estadoGlobal: "COMPLETO",
  },
  {
    // Ajuste de consistencia SUP-1: el mockup la muestra CRÍTICO, pero el
    // KPI oficial es CRÍTICO: 1 → se rebaja a PENDIENTE (D6).
    id: "puesto-365",
    codigoPais: "365",
    pais: "España",
    zonaId: "83",
    zona: "83",
    puesto: "06 - Tarragona",
    numeroMesas: 1,
    horaCierreColombia: "9:00 AM",
    horaActualLocal: "7:08 PM",
    diferenciaTiempo: "> 2 hrs",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "PENDIENTE",
  },
  {
    id: "puesto-466",
    codigoPais: "466",
    pais: "Inglaterra",
    zonaId: "85",
    zona: "85",
    puesto: "03 - Londres",
    numeroMesas: 1,
    horaCierreColombia: "10:00 AM",
    horaActualLocal: "6:08 PM",
    diferenciaTiempo: "1-2 hrs",
    pctDelegado: 10,
    pctTransmision: 100,
    estadoGlobal: "PENDIENTE",
  },
  {
    id: "puesto-346",
    codigoPais: "346",
    pais: "Estados Unidos",
    zonaId: "55",
    zona: "55",
    puesto: "02 - Nueva York",
    numeroMesas: 1,
    horaCierreColombia: "1:00 PM",
    horaActualLocal: "1:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  // ── Relleno creíble (15): 4 COMPLETO + 2 PENDIENTE + 9 NO INICIADO ─────
  {
    id: "puesto-208",
    codigoPais: "208",
    pais: "Francia",
    zonaId: "12",
    zona: "12",
    puesto: "01 - París",
    numeroMesas: 2,
    horaCierreColombia: "9:00 AM",
    horaActualLocal: "7:08 PM",
    diferenciaTiempo: "< 1 hr",
    pctDelegado: 100,
    pctTransmision: 100,
    estadoGlobal: "COMPLETO",
  },
  {
    id: "puesto-277",
    codigoPais: "277",
    pais: "Alemania",
    zonaId: "71",
    zona: "71",
    puesto: "03 - Berlín",
    numeroMesas: 1,
    horaCierreColombia: "9:00 AM",
    horaActualLocal: "7:08 PM",
    diferenciaTiempo: "< 1 hr",
    pctDelegado: 100,
    pctTransmision: 100,
    estadoGlobal: "COMPLETO",
  },
  {
    id: "puesto-392",
    codigoPais: "392",
    pais: "Brasil",
    zonaId: "48",
    zona: "48",
    puesto: "02 - São Paulo",
    numeroMesas: 3,
    horaCierreColombia: "9:00 AM",
    horaActualLocal: "5:08 PM",
    diferenciaTiempo: "< 1 hr",
    pctDelegado: 100,
    pctTransmision: 100,
    estadoGlobal: "COMPLETO",
  },
  {
    id: "puesto-124",
    codigoPais: "124",
    pais: "Canadá",
    zonaId: "62",
    zona: "62",
    puesto: "01 - Toronto",
    numeroMesas: 2,
    horaCierreColombia: "10:00 AM",
    horaActualLocal: "5:08 PM",
    diferenciaTiempo: "< 1 hr",
    pctDelegado: 100,
    pctTransmision: 100,
    estadoGlobal: "COMPLETO",
  },
  {
    id: "puesto-555",
    codigoPais: "555",
    pais: "México",
    zonaId: "21",
    zona: "21",
    puesto: "01 - Ciudad de México",
    numeroMesas: 4,
    horaCierreColombia: "1:00 PM",
    horaActualLocal: "1:08 PM",
    diferenciaTiempo: "1-2 hrs",
    pctDelegado: 45,
    pctTransmision: 30,
    estadoGlobal: "PENDIENTE",
  },
  {
    id: "puesto-060",
    codigoPais: "060",
    pais: "Argentina",
    zonaId: "44",
    zona: "44",
    puesto: "02 - Buenos Aires",
    numeroMesas: 2,
    horaCierreColombia: "10:00 AM",
    horaActualLocal: "7:08 PM",
    diferenciaTiempo: "1-2 hrs",
    pctDelegado: 70,
    pctTransmision: 55,
    estadoGlobal: "PENDIENTE",
  },
  {
    id: "puesto-058",
    codigoPais: "058",
    pais: "Venezuela",
    zonaId: "32",
    zona: "32",
    puesto: "01 - Caracas",
    numeroMesas: 2,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-051",
    codigoPais: "051",
    pais: "Perú",
    zonaId: "39",
    zona: "39",
    puesto: "01 - Lima",
    numeroMesas: 3,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-563",
    codigoPais: "563",
    pais: "Chile",
    zonaId: "41",
    zona: "41",
    puesto: "01 - Santiago",
    numeroMesas: 2,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-593",
    codigoPais: "593",
    pais: "Ecuador",
    zonaId: "37",
    zona: "37",
    puesto: "01 - Quito",
    numeroMesas: 2,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-507",
    codigoPais: "507",
    pais: "Costa Rica",
    zonaId: "28",
    zona: "28",
    puesto: "01 - San José",
    numeroMesas: 1,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-180",
    codigoPais: "180",
    pais: "República Dominicana",
    zonaId: "26",
    zona: "26",
    puesto: "01 - Santo Domingo",
    numeroMesas: 2,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-034",
    codigoPais: "034",
    pais: "Guatemala",
    zonaId: "24",
    zona: "24",
    puesto: "01 - Ciudad de Guatemala",
    numeroMesas: 1,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-503",
    codigoPais: "503",
    pais: "El Salvador",
    zonaId: "30",
    zona: "30",
    puesto: "01 - San Salvador",
    numeroMesas: 1,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
  {
    id: "puesto-682",
    codigoPais: "682",
    pais: "Australia",
    zonaId: "90",
    zona: "90",
    puesto: "01 - Sídney",
    numeroMesas: 1,
    horaCierreColombia: "12:00 PM",
    horaActualLocal: "12:00 PM",
    diferenciaTiempo: "—",
    pctDelegado: 0,
    pctTransmision: 0,
    estadoGlobal: "NO_INICIADO",
  },
];

// ─── Generación determinística de mesas (T2 / D13) ─────────────────────────

function ok(): Mesa["delegados"]["p1"] {
  return "ok";
}
function pend(): Mesa["delegados"]["p1"] {
  return "pendiente";
}

/** Mesas EXACTAS del mockup original (SUP-1 §2.4) — NO SE TOCAN (kit T2). */
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
 * fijos). Recetas del kit T2:
 * - COMPLETO → todas COMPLETO, ok, sin alertas, carga reciente.
 * - PENDIENTE → mezcla EN_PROCESO/NO_INICIADO, pendientes en partes.
 * - CRÍTICO → mayormente NO_INICIADO/INCOMPLETO, alerta "Rescaneo"
 *   presente (Italia: 3 exactas del mockup + 004-008 generadas).
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

  // Italia (CRÍTICO): 3 exactas del mockup + las restantes generadas
  // coherentes con CRÍTICO (mayoría NO_INICIADO, Rescaneo presente).
  if (puesto.id === "puesto-499") {
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

  // PENDIENTE: mezcla EN_PROCESO / NO_INICIADO (receta del kit).
  // - Con varias mesas: la ÚLTIMA es EN_PROCESO (delegados completos,
  //   transmisión a medias → candidato de transición de vida), el resto
  //   NO_INICIADO. Con 1 mesa: la mesa única es EN_PROCESO con partes a
  //   medias (España 50/50; Inglaterra transmisión completa 0/100).
  const mesas: Mesa[] = [];
  for (let i = 0; i < n; i++) {
    const esUltima = i === n - 1;
    const indice = i;
    if (puesto.id === "puesto-466") {
      // Inglaterra: transmisión completa, delegados sin iniciar (≈ mockup
      // 10/100 → 0/100 derivable de 1 mesa).
      mesas.push({
        id: numero(indice),
        delegados: { p1: pend(), p2: pend() },
        transmision: { p1: { estado: "ok" }, p2: { estado: "ok" } },
        estadoMesa: "EN_PROCESO",
        ultimaCarga: carga(33),
        accionSugerida: "notificar",
      });
      continue;
    }
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

/** pcts derivables de las mesas (≈ % de partes ok, kit T2). */
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
      (m.transmision.p1.estado === "ok" ? 1 : 0) +
      (m.transmision.p2.estado === "ok" ? 1 : 0),
    0
  );
  return {
    delegado: Math.round((delegOk / total) * 100),
    transmision: Math.round((transOk / total) * 100),
  };
}

/** Estado global derivado: COMPLETO si TODAS las mesas lo están; si no, se
 * conserva el estado actual (el kit solo define transición → COMPLETO). */
function estadoGlobalTrasMesas(actual: Puesto["estadoGlobal"], mesas: Mesa[]): Puesto["estadoGlobal"] {
  const todasCompletas = mesas.length > 0 && mesas.every((m) => m.estadoMesa === "COMPLETO");
  return todasCompletas ? "COMPLETO" : actual;
}

// ─── Estado mutable del mock (en memoria — sin persistencia, §0-5) ─────────

const MESAS_POR_PUESTO: Record<string, Mesa[]> = {};
for (const puesto of PUESTOS) {
  const mesas = generarMesasPuesto(puesto);
  MESAS_POR_PUESTO[puesto.id] = mesas;
  // T2: los pcts del puesto deben ser DERIVABLES de sus mesas — se
  // corrigen al inicializar (D16 documenta los valores que cambian).
  const pcts = pctsDeMesas(mesas);
  puesto.pctDelegado = pcts.delegado;
  puesto.pctTransmision = pcts.transmision;
}

const AHORA = Date.now();
const MIN = 60_000;

/** Semillas T5 (7): coherentes con los datos (Italia rescaneo, España
 * retraso…). 3 no leídas → badge inicial 3. */
const NOTIFICACIONES: Notificacion[] = [
  { id: "notif-1", tipo: "rescaneo", texto: "Rescaneo requerido en Mesa 001 (Italia — 02 - Roma)", fecha: AHORA - 12 * MIN, leida: false },
  { id: "notif-2", tipo: "retraso", texto: "Retraso en transmisión — España (06 - Tarragona)", fecha: AHORA - 38 * MIN, leida: false },
  { id: "notif-3", tipo: "transmision", texto: "Transmisión en curso — Mesa 004 (México — 01 - Ciudad de México)", fecha: AHORA - 47 * MIN, leida: false },
  { id: "notif-4", tipo: "sistema", texto: "Sincronización completada: 20 puestos al día", fecha: AHORA - 65 * MIN, leida: true },
  { id: "notif-5", tipo: "rescaneo", texto: "Rescaneo requerido en Mesa 004 (Italia — 02 - Roma)", fecha: AHORA - 21 * MIN, leida: false },
  { id: "notif-6", tipo: "sistema", texto: "Respaldo de datos del consolidado completado", fecha: AHORA - 5 * 60 * MIN, leida: true },
  { id: "notif-7", tipo: "transmision", texto: "Transmisión restablecida — Países Bajos (04 - La Haya)", fecha: AHORA - 26 * 60 * MIN, leida: true },
];

/** Semillas T6: 5 ABIERTAS (badge dinámico real del mockup) + 2 revisadas
 * de histórico (para el filtro por estado). */
const ANOMALIAS: Anomalia[] = [
  { id: "anom-1", tipo: "Rescaneo", puestoId: "puesto-499", puesto: "Italia — 02 - Roma", mesaId: "001", severidad: "critica", fecha: AHORA - 12 * MIN, revisada: false },
  { id: "anom-2", tipo: "Mesa incompleta", puestoId: "puesto-499", puesto: "Italia — 02 - Roma", mesaId: "004", severidad: "alta", fecha: AHORA - 21 * MIN, revisada: false },
  { id: "anom-3", tipo: "Transmisión caída", puestoId: "puesto-365", puesto: "España — 06 - Tarragona", mesaId: "001", severidad: "alta", fecha: AHORA - 38 * MIN, revisada: false },
  { id: "anom-4", tipo: "Desfase de hora", puestoId: "puesto-365", puesto: "España — 06 - Tarragona", severidad: "media", fecha: AHORA - 52 * MIN, revisada: false },
  { id: "anom-5", tipo: "Mesa incompleta", puestoId: "puesto-555", puesto: "México — 01 - Ciudad de México", mesaId: "002", severidad: "media", fecha: AHORA - 2 * 60 * MIN, revisada: false },
  { id: "anom-6", tipo: "Rescaneo", puestoId: "puesto-435", puesto: "Países Bajos — 04 - La Haya", mesaId: "001", severidad: "media", fecha: AHORA - 26 * 60 * MIN, revisada: true },
  { id: "anom-7", tipo: "Desfase de hora", puestoId: "puesto-466", puesto: "Inglaterra — 03 - Londres", severidad: "media", fecha: AHORA - 8 * 60 * MIN, revisada: true },
];

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

function coincide(puesto: Puesto, f: FiltrosPuestos | undefined): boolean {
  if (!f) return true;
  if (f.pais && puesto.codigoPais !== f.pais) return false;
  if (f.zona && puesto.zonaId !== f.zona) return false;
  if (f.puesto && puesto.puesto !== f.puesto) return false;
  if (f.estado && puesto.estadoGlobal !== f.estado) return false;
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

export const mockSupervisionRepository: SupervisionRepository = {
  async getResumen(): Promise<ResumenGlobal> {
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
    return conLatencia(PUESTOS.filter((puesto) => coincide(puesto, filtros)).map((p) => ({ ...p })));
  },

  async getMesasDePuesto(puestoId: string): Promise<Mesa[]> {
    return conLatencia((MESAS_POR_PUESTO[puestoId] ?? []).map((m) => ({ ...m })));
  },

  async getNotificaciones(): Promise<Notificacion[]> {
    return conLatencia(NOTIFICACIONES.map((n) => ({ ...n })));
  },

  async getAnomalias(): Promise<Anomalia[]> {
    return conLatencia(ANOMALIAS.map((a) => ({ ...a })));
  },

  async resolverRescaneo(puestoId, mesaId) {
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
      `Rescaneo completado en Mesa ${mesa.id} (${puesto.pais} — ${puesto.puesto})`
    );
    NOTIFICACIONES.unshift(notificacion);
    return { mesa: { ...mesa }, notificacion: { ...notificacion } };
  },

  async notificarMesa(puestoId, mesaId) {
    await conLatencia(true);
    const puesto = puestoPorId(puestoId);
    const mesa = MESAS_POR_PUESTO[puestoId]?.find((m) => m.id === mesaId);
    if (!puesto || !mesa) {
      // Sin puesto/mesa no hay notificación posible (jamás inventar).
      return crearNotificacion("sistema", "Supervisor notificó a la mesa (dato no encontrado)");
    }
    // T4: el estado de la mesa NO cambia — solo se registra la notificación.
    const notificacion = crearNotificacion(
      "sistema",
      `Supervisor notificó a la mesa ${mesa.id} (${puesto.pais} — ${puesto.puesto})`
    );
    NOTIFICACIONES.unshift(notificacion);
    return { ...notificacion };
  },

  async aplicarTransicionVida() {
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
    const puesto = puestoPorId(puestoId);
    const mesa = MESAS_POR_PUESTO[puestoId]?.find((m) => m.id === mesaId);
    // null = mesa sin transmisión (NO_INICIADO) o inexistente.
    return conLatencia(puesto && mesa ? obtenerActa(mesa, puesto) : null);
  },

  async aprobarActa(actaId: string, observacion: string) {
    await esperar(LATENCIA_REINSPECCION_MS);
    const acta = aprobarActaMock(actaId, observacion);
    if (!acta) return null;
    const puesto = puestoPorId(acta.puestoId);
    const etiquetaPuesto = puesto ? `${puesto.pais} — ${puesto.puesto}` : acta.puestoId;
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
    // La observación es OBLIGATORIA (T5.2) pero el kit no la imprime en el
    // evento/notificación del rescan (textos exactos de T5.4) — queda en la
    // auditoría del visor.
    await esperar(LATENCIA_REINSPECCION_MS);
    const acta = confirmarRescanActaMock(actaId, _observacion);
    if (!acta) return null;
    const puesto = puestoPorId(acta.puestoId);
    const etiquetaPuesto = puesto ? `${puesto.pais} — ${puesto.puesto}` : acta.puestoId;
    // T5.4 — notificación nueva (plantilla 2/2 del kit).
    const notificacion = crearNotificacion(
      "rescaneo",
      `RESCANEO COMPLETADO — MESA ${acta.mesaId} (${etiquetaPuesto})`
    );
    NOTIFICACIONES.unshift(notificacion);
    return { acta, notificacion: { ...notificacion } };
  },
};
