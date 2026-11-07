/**
 * KIT e14-sin-relleno-v1 — seed EXCLUSIVO del MODO SIMULACIÓN.
 *
 * Antes este módulo alimentaba el ARRANQUE de la app (mesas demo MESA
 * 01/02/03, progreso falso 12/9, cola offline 3, rescaneo 1 y filas de
 * historial inventadas). Eso era relleno de prueba visible en producción y
 * se retiró: el arranque/jornada real nace VACÍO (store.ts).
 *
 * Lo que queda SOLO se consume con el toggle «SIM» de ACTAS encendido
 * (overlay de vista — D6: jamás escribe archivadas/puestoActual/historial)
 * y en `construirActa` del bridge (datos de pantalla del editor, fase
 * lógica L1). El usuario final jamás ve estos datos sin activar la
 * simulación de forma explícita.
 */
import type { Mesa, MesaPagina } from "./types";

/** Guion demo del SIM sin puesto real: MESA 01 COMPLETADA · MESA 02 EN
 *  PROCESO · MESA 03 PENDIENTE (§6.4) — es el avance que el tick de 5 s
 *  «sube a la vista». FUERA del SIM no existe. */
export function mesasIniciales(): Mesa[] {
  return [
    {
      id: "MESA 01",
      estado: "COMPLETADA",
      progresoPct: 100,
      paginas: [
        { tipo: "DELEGADOS", pagina: 1, estado: "OK" },
        { tipo: "DELEGADOS", pagina: 2, estado: "OK" },
        { tipo: "TRANSMISIÓN", pagina: 1, estado: "OK" },
        { tipo: "TRANSMISIÓN", pagina: 2, estado: "RESCANEO" },
      ],
    },
    {
      id: "MESA 02",
      estado: "EN_PROCESO",
      progresoPct: 50,
      paginas: [
        { tipo: "DELEGADOS", pagina: 1, estado: "OK" },
        { tipo: "DELEGADOS", pagina: 2, estado: "EN_PROCESO" },
        { tipo: "TRANSMISIÓN", pagina: 1, estado: "PENDIENTE" },
        { tipo: "TRANSMISIÓN", pagina: 2, estado: "PENDIENTE" },
      ],
    },
    {
      id: "MESA 03",
      estado: "PENDIENTE",
      progresoPct: 0,
      paginas: [
        { tipo: "DELEGADOS", pagina: 1, estado: "PENDIENTE" },
        { tipo: "DELEGADOS", pagina: 2, estado: "PENDIENTE" },
        { tipo: "TRANSMISIÓN", pagina: 1, estado: "PENDIENTE" },
        { tipo: "TRANSMISIÓN", pagina: 2, estado: "PENDIENTE" },
      ],
    },
  ];
}

/** KIT e14-luz-sim-puntos-v1 (T-S): guion del PUESTO REAL — 1..N mesas
 *  DIVIPOL (p.t) × 4 páginas (DELEGADOS P1/P2 + TRANSMISIÓN P1/P2), todo
 *  PENDIENTE. El SIM lo llena a la vista con avanzarSimulacion (overlay
 *  D6: jamás escribe archivadas/puestoActual). Mismo shape que
 *  mesasIniciales — ActasView no distingue. */
export function guionDePuesto(totalMesas: number): Mesa[] {
  return Array.from({ length: Math.max(1, totalMesas) }, (_, i) => {
    const paginas: MesaPagina[] = [
      { tipo: "DELEGADOS", pagina: 1, estado: "PENDIENTE" },
      { tipo: "DELEGADOS", pagina: 2, estado: "PENDIENTE" },
      { tipo: "TRANSMISIÓN", pagina: 1, estado: "PENDIENTE" },
      { tipo: "TRANSMISIÓN", pagina: 2, estado: "PENDIENTE" },
    ];
    return {
      id: `MESA ${String(i + 1).padStart(2, "0")}`,
      estado: "PENDIENTE" as const,
      progresoPct: 0,
      paginas,
    };
  });
}

/** Puesto demo del MODO SIMULACIÓN (look clásico del mock §6.4). SOLO
 *  alimenta la vista cuando `modoSimulacion && !puestoActual` — JAMÁS se
 *  escribe en `archivadas` ni en `puestoActual` (cero contaminación de
 *  datos reales). `clave` es placeholder de display: en simulación no se
 *  filtra `archivadas` ni se consulta countTable. */
export const PUESTO_SIMULADO = {
  clave: "88-000-10-02",
  titulo: "ROMA - CONSULADO",
  departamento: "CONSULADOS",
  municipio: "ITALIA",
  zona: "10",
  puesto: "02",
} as const;

/** Datos fijos del acta del editor (los diseños siempre muestran la misma
 *  pantalla de acta — fase lógica L1). Consumido por `construirActa` del
 *  bridge; NUNCA se muestra al usuario final sin pasar por el pipeline. */
export const ACTA_MOCK = {
  titulo: "ROMA - CONSULADO",
  departamento: "CONSULADOS",
  municipio: "ROMA",
  zona: "10",
  puesto: "02",
  tipo: "SENADO DE LA REPÚBLICA",
  codigoBarras: "*E14-SEN-2026-001*",
  candidatos: [
    { codigo: "101", votos: 25 },
    { codigo: "102", votos: 42 },
    { codigo: "103", votos: 18 },
    { codigo: "104", votos: 30 },
  ],
  firmas: [
    { nombre: "C. Gomez", jurado: "JURADO 1" },
    { nombre: "L. Rossi", jurado: "JURADO 2" },
    { nombre: "M. Torres", jurado: "JURADO 3" },
  ],
} as const;
