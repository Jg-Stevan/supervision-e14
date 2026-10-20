/**
 * Implementación mock de SupervisionRepository (kit SUP-1 §3-T2).
 *
 * Datos demo del mockup (§2.4) + relleno creíble autorizado por el kit para
 * que los conteos cuadren EXACTAMENTE con los KPIs: total 20, completo 5,
 * crítico 1, pendiente 4, no iniciado 10. Ajuste aplicado: España pasa de
 * CRÍTICO (mockup) a PENDIENTE — ver docs/DECISIONS.md (D6).
 */

import type {
  FiltrosPuestos,
  Mesa,
  Puesto,
  ResumenGlobal,
  Supervisor,
} from "../domain/types";
import type { SupervisionRepository } from "./supervision-repository";

/** Supervisor de la sesión (header del mockup). El repositorio mantiene
 * exactamente los 3 métodos del kit; el supervisor es texto fijo del shell. */
export const SUPERVISOR: Supervisor = {
  nombre: "SUPERVISOR",
  id: "ADM-9482",
};

/**
 * 20 puestos: los 5 visibles del mockup + 15 de relleno creíble
 * (países/zonas variados, autorizado en kit §2.4 "Decisión de consistencia").
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
    // Ajuste de consistencia: el mockup la muestra CRÍTICO, pero el KPI
    // oficial del sistema es CRÍTICO: 1 → se rebaja a PENDIENTE (kit §2.4).
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

/** Mesas del demo (kit §2.4): solo Italia define detalle de mesas. */
const MESAS_POR_PUESTO: Record<string, Mesa[]> = {
  "puesto-499": [
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
  ],
};

function coincide(
  puesto: Puesto,
  f: FiltrosPuestos | undefined
): boolean {
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
  getResumen(): ResumenGlobal {
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
    return resumen;
  },

  getPuestos(filtros?: FiltrosPuestos): Puesto[] {
    return PUESTOS.filter((puesto) => coincide(puesto, filtros));
  },

  getMesasDePuesto(puestoId: string): Mesa[] {
    return MESAS_POR_PUESTO[puestoId] ?? [];
  },
};
