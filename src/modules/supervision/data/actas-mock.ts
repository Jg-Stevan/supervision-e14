/**
 * Datos determinísticos de las ACTAS E-14 (kit SUP-4 §3-T1 / D18).
 *
 * TODO dato del visor se deriva por seed de la mesa (§0-7) — nada
 * aleatorio en render. Roma mesa 1 (Italia — ANCLA del kit SUP-5 §2.3,
 * `88_495_010_02`, código real del catálogo) es EXACTA al mockup (§0-6):
 * ID #A92-F · 14:20 LOCAL · motivo SOLICITUD DE RESCANEO · TRANSMISIÓN
 * P1 VALIDA / P2 ADVERTENCIA · DELEGADOS VALIDA · historial
 * 14:00 / 14:18 / 14:20 con los textos exactos.
 *
 * Reglas de mapeo acta←mesa (kit §3-T1, coherentes con el mock de vida):
 * - mesa NO_INICIADO → sin acta (getActaDeMesa devuelve null).
 * - mesa COMPLETO → TRANSMISIÓN P1 VALIDA / P2 VALIDA, sin motivo.
 * - mesa INCOMPLETO (el «CRÍTICO» de mesa) → P2 ADVERTENCIA; chip de
 *   motivo SOLO si la mesa tiene el alerta "Rescaneo" vigente (Roma 1,
 *   Italia 004; cualquier mesa a la que se le haya disparado
 *   REINSPECCIONAR conserva el chip mientras el alerta exista).
 * - mesa EN_PROCESO en puesto CRÍTICO → P2 ADVERTENCIA (kit: «EN_PROCESO
 *   o CRÍTICO»); en puesto PENDIENTE → P2 PENDIENTE (kit: «mesa
 *   PENDIENTE» — no existe estado de mesa PENDIENTE en el dominio, se
 *   interpreta como mesas de puestos PENDIENTE; documentado en REPORTE).
 * - DELEGADOS (página única): VALIDA si ambas partes de delegados de la
 *   mesa están ok; PENDIENTE en otro caso.
 *
 * El acta se genera al primer acceso desde el estado VIGENTE de la mesa y
 * queda en memoria (el acta es un documento histórico: las mutaciones del
 * visor —aprobar/rescan— la actualizan; nada más la toca, §3-T5.7).
 */

import type { Mesa, Puesto } from "../domain/types";
import type {
  ActaMesa,
  EventoActa,
  FormularioTipo,
  PaginaActa,
} from "../domain/acta";
import { crearRandomDeterministico as crearRandom } from "../domain/acta";
import type { ActaRealLista } from "./actas-reales/actas-reales";
import { ID_ENLACE_ROMA } from "./divipola-adapter";
import { cargarActasReales } from "./actas-reales/actas-reales";

// ─── Utilidades de formato ──────────────────────────────────────────────────

function minutosAHora(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "14:20 LOCAL" → 860 (minutos desde medianoche). */
export function horaAMinutos(hora: string): number {
  const [hh, mm] = hora.replace(" LOCAL", "").split(":").map(Number);
  return hh * 60 + mm;
}

/** Ciudad del puesto ("02 - Roma" → "ROMA"). */
export function ciudadDePuesto(puesto: Puesto): string {
  const partes = puesto.puesto.split(" - ");
  return (partes.length > 1 ? partes[1] : puesto.puesto).toUpperCase();
}

// ─── Identidad del acta (seed → id #XXX-Y) ─────────────────────────────────

const ALFABETO_ID = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generarIdActa(seed: string): string {
  const random = crearRandom(`${seed}::id`);
  const xxx =
    ALFABETO_ID[Math.floor(random() * ALFABETO_ID.length)] +
    ALFABETO_ID[Math.floor(random() * ALFABETO_ID.length)] +
    ALFABETO_ID[Math.floor(random() * ALFABETO_ID.length)];
  const y = ALFABETO_ID[Math.floor(random() * ALFABETO_ID.length)];
  return `#${xxx}-${y}`;
}

// ─── Mapeo estado de mesa → páginas del acta ────────────────────────────────

function paginasDeMesa(
  mesa: Mesa,
  puesto: Puesto
): Record<FormularioTipo, PaginaActa[]> {
  const transmision: PaginaActa[] = [
    { numero: 1, estado: "VALIDA" },
    { numero: 2, estado: "ADVERTENCIA" },
  ];
  if (mesa.estadoMesa === "COMPLETO") {
    transmision[1] = { numero: 2, estado: "VALIDA" };
  } else if (
    mesa.estadoMesa === "EN_PROCESO" &&
    puesto.estadoGlobal !== "CRITICO"
  ) {
    transmision[1] = { numero: 2, estado: "PENDIENTE" };
  }
  const delegadosOk = mesa.delegados.p1 === "ok" && mesa.delegados.p2 === "ok";
  return {
    TRANSMISION: transmision,
    DELEGADOS: [{ numero: 1, estado: delegadosOk ? "VALIDA" : "PENDIENTE" }],
  };
}

function motivoDeMesa(mesa: Mesa): string | undefined {
  const tieneRescaneo = Boolean(
    mesa.transmision.p1.alerta || mesa.transmision.p2.alerta
  );
  return mesa.estadoMesa === "INCOMPLETO" && tieneRescaneo
    ? "SOLICITUD DE RESCANEO"
    : undefined;
}

// ─── Historial genérico (mismo patrón de etiquetas que Roma 1) ──────────────

function historialDeMesa(
  mesa: Mesa,
  puesto: Puesto,
  actaId: string,
  minutosCarga: number
): EventoActa[] {
  const eventoEstado: EventoActa = (() => {
    const paginas = paginasDeMesa(mesa, puesto);
    const p2 = paginas.TRANSMISION[1].estado;
    if (motivoDeMesa(mesa)) {
      return {
        hora: `${minutosAHora(minutosCarga)} LOCAL`,
        titulo: "SOLICITUD DE RESCANEO",
        detalle: "Alerta automática: Falta de firmas / Ilegible",
        nivel: "CRITICO",
      };
    }
    if (p2 === "ADVERTENCIA") {
      return {
        hora: `${minutosAHora(minutosCarga)} LOCAL`,
        titulo: "TRANSMISIÓN INCOMPLETA",
        detalle: "Advertencia en página 2 — pendiente de revisión",
        nivel: "ALERTA",
      };
    }
    if (p2 === "PENDIENTE") {
      return {
        hora: `${minutosAHora(minutosCarga)} LOCAL`,
        titulo: "TRANSMISIÓN PARCIAL",
        detalle: "Página 2 pendiente de cierre de mesa",
        nivel: "NEUTRAL",
      };
    }
    return {
      hora: `${minutosAHora(minutosCarga)} LOCAL`,
      titulo: "TRANSMISIÓN COMPLETA",
      detalle: "Acta sin observaciones",
      nivel: "NEUTRAL",
    };
  })();

  // Orden descendente: evento de estado actual → recibido en cola (−2 min)
  // → pendiente/cierre (−20 min). Con Roma 1: 14:20 / 14:18 / 14:00.
  return [
    eventoEstado,
    {
      hora: `${minutosAHora(minutosCarga - 2)} LOCAL`,
      titulo: "RECIBIDO EN COLA",
      detalle: `Enviado desde sesión ${actaId}`,
      nivel: "ALERTA",
    },
    {
      hora: `${minutosAHora(minutosCarga - 20)} LOCAL`,
      titulo: "PENDIENTE",
      detalle: "Cierre del puesto de votación",
      nivel: "NEUTRAL",
    },
  ];
}

// ─── Roma mesa 1: EXACTA al mockup (§0-6) ───────────────────────────────────

const ROMA_MESA_1: ActaMesa = {
  id: "#A92-F",
  mesaId: "001",
  // SUP-5: re-anclada al idEnlace real del catálogo (§2.3) — el texto
  // del acta (CREDENCIAL, sesión #A92-F) NO cambia.
  puestoId: ID_ENLACE_ROMA,
  horaCarga: "14:20 LOCAL",
  motivo: "SOLICITUD DE RESCANEO",
  formularios: {
    TRANSMISION: [
      { numero: 1, estado: "VALIDA" },
      { numero: 2, estado: "ADVERTENCIA" },
    ],
    DELEGADOS: [{ numero: 1, estado: "VALIDA" }],
  },
  historial: [
    {
      hora: "14:20 LOCAL",
      titulo: "SOLICITUD DE RESCANEO",
      detalle: "Alerta automática: Falta de firmas / Ilegible",
      nivel: "CRITICO",
    },
    {
      hora: "14:18 LOCAL",
      titulo: "RECIBIDO EN COLA",
      detalle: "Enviado desde sesión #A92-F",
      nivel: "ALERTA",
    },
    {
      hora: "14:00 LOCAL",
      titulo: "PENDIENTE",
      detalle: "Cierre del puesto de votación",
      nivel: "NEUTRAL",
    },
  ],
  version: 1,
};

function esRomaMesa1(puestoId: string, mesaId: string): boolean {
  return puestoId === ID_ENLACE_ROMA && mesaId === "001";
}

// ─── Acta REAL del digitalizador (SUP-6 / D26 · generalizada D44) ────────

/** Acta REAL del ancla (D26): la realidad impresa trae 2 páginas por
 * formulario (TRANSMISIÓN P1/P2 y CÓNSUL/EMBAJADOR P1/P2, todas VALIDA —
 * la mesa está forzada a COMPLETO), `fotos` del loader + `impresion`
 * verbatim del manifest. id/hora/historial generados por seed como
 * cualquier acta (mismas reglas, sin textos custom — kit T4.2).
 *
 * actas-reales-v2 (D44): GENERALIZADA — la paginación DELEGADOS sale del
 * largo REAL del registro (2 páginas CÓNSUL/EMBAJADOR en los 3 anclas);
 * cualquier mesa con clave en el loader cae aquí (hoy El Cairo y
 * Barcelona-Girona — forzada COMPLETO en mock-repository, D44). */
function construirActaReal(
  mesa: Mesa,
  puesto: Puesto,
  registroReal: ActaRealLista
): ActaMesa {
  const seed = `${puesto.id}::mesa-${mesa.id}`;
  const random = crearRandom(`${seed}::carga`);
  // Hora de carga determinística dentro de la ventana 13:00–16:59.
  const minutosCarga = 13 * 60 + Math.floor(random() * (4 * 60 - 14));
  const id = generarIdActa(seed);
  const formularios = paginasDeMesa(mesa, puesto);
  // Realidad impresa del formulario CÓNSUL/EMBAJADOR: tantas páginas
  // VALIDA como fotos reales del registro (2 en los anclas actuales — D26/D44).
  const fotosDelegados = registroReal.fotos.DELEGADOS;
  if (fotosDelegados && fotosDelegados.length > 0) {
    formularios.DELEGADOS = fotosDelegados.map((_, i) => ({
      numero: i + 1,
      estado: "VALIDA" as const,
    }));
  }
  return {
    id,
    mesaId: mesa.id,
    puestoId: puesto.id,
    horaCarga: `${minutosAHora(minutosCarga)} LOCAL`,
    motivo: motivoDeMesa(mesa),
    formularios,
    historial: historialDeMesa(mesa, puesto, id, minutosCarga),
    version: 1,
    fotos: registroReal.fotos,
    impresion: registroReal.impresion,
  };
}

// ─── Generación + caché en memoria ──────────────────────────────────────────

export function tieneActa(mesa: Mesa): boolean {
  return mesa.estadoMesa !== "NO_INICIADO";
}

/** Delegados acreditados de la mesa (n/16, kit §2.3): 2 partes ok → 16,
 * 1 → 8, 0 → 0. Regla de derivación documentada en el REPORTE. */
export function delegadosAcreditados(mesa: Mesa): number {
  const ok =
    (mesa.delegados.p1 === "ok" ? 1 : 0) + (mesa.delegados.p2 === "ok" ? 1 : 0);
  return ok * 8;
}

const CACHE_ACTAS: Record<string, ActaMesa> = {};

function clonarActa(acta: ActaMesa): ActaMesa {
  return {
    ...acta,
    formularios: {
      TRANSMISION: acta.formularios.TRANSMISION.map((p) => ({ ...p })),
      DELEGADOS: acta.formularios.DELEGADOS.map((p) => ({ ...p })),
    },
    historial: acta.historial.map((e) => ({ ...e })),
  };
}

/** Caché de generación: la primera vez se deriva del estado vigente de la
 * mesa; después SIEMPRE se sirve la copia en memoria (el acta es un
 * documento histórico que solo mutan las acciones del visor). */
export function obtenerActa(mesa: Mesa, puesto: Puesto): ActaMesa | null {
  if (!tieneActa(mesa)) return null;
  const clave = `${puesto.id}::${mesa.id}`;
  const enCache = CACHE_ACTAS[clave];
  if (enCache) return clonarActa(enCache);

  if (esRomaMesa1(puesto.id, mesa.id)) {
    const ancla = clonarActa(ROMA_MESA_1);
    // actas-reales-v2 (D44): si el loader trae el registro real de Roma
    // mesa 001, el ANCLA recibe sus FOTOS (ranuras CÓNSUL/EMBAJADOR P1/P2)
    // + encabezado impreso verbatim + paginación DELEGADOS real. Los textos
    // del ancla (id #A92-F, hora, motivo, historial — §0-6) quedan INTACTOS:
    // la foto se UBICA, no se interpreta (§0-1); TRANSMISIÓN sigue sintética
    // (sin fotos reales — honesto).
    const registroRoma = cargarActasReales().actas[clave];
    if (registroRoma) {
      const fotosDelegados = registroRoma.fotos.DELEGADOS;
      if (fotosDelegados && fotosDelegados.length > 0) {
        ancla.formularios.DELEGADOS = fotosDelegados.map((_, i) => ({
          numero: i + 1,
          estado: "VALIDA" as const,
        }));
      }
      ancla.fotos = registroRoma.fotos;
      ancla.impresion = registroRoma.impresion;
    }
    CACHE_ACTAS[clave] = clonarActa(ancla);
    return clonarActa(ancla);
  }

  // D26/D44: cualquier mesa con registro real en el loader → acta real
  // (fotos + impresión). Si el loader la dejó en cuarentena (D25) cae al
  // sintético como cualquier otra mesa — nada se improvisa.
  const registroReal = cargarActasReales().actas[clave];
  if (registroReal) {
    const acta = construirActaReal(mesa, puesto, registroReal);
    CACHE_ACTAS[clave] = acta;
    return clonarActa(acta);
  }

  const seed = `${puesto.id}::mesa-${mesa.id}`;
  const random = crearRandom(`${seed}::carga`);
  // Hora de carga determinística dentro de la ventana 13:00–16:59.
  const minutosCarga = 13 * 60 + Math.floor(random() * (4 * 60 - 14));
  const id = generarIdActa(seed);
  const acta: ActaMesa = {
    id,
    mesaId: mesa.id,
    puestoId: puesto.id,
    horaCarga: `${minutosAHora(minutosCarga)} LOCAL`,
    motivo: motivoDeMesa(mesa),
    formularios: paginasDeMesa(mesa, puesto),
    historial: historialDeMesa(mesa, puesto, id, minutosCarga),
    version: 1,
  };
  CACHE_ACTAS[clave] = acta;
  return clonarActa(acta);
}

function actaEnCache(actaId: string): { clave: string; acta: ActaMesa } | null {
  for (const [clave, acta] of Object.entries(CACHE_ACTAS)) {
    if (acta.id === actaId) return { clave, acta };
  }
  return null;
}

/** Hora actual del navegador formateada como los eventos ("HH:MM"). */
function horaActual(): string {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, "0")}:${String(
    ahora.getMinutes()
  ).padStart(2, "0")}`;
}

/** Trunca la observación para el detalle del evento (kit §3-T5.3). */
function truncar(texto: string, maximo = 48): string {
  return texto.length > maximo ? `${texto.slice(0, maximo)}…` : texto;
}

// ─── Acciones del visor (kit §3-T1.3 / T5) — mutan SOLO tras interacción ───

/** APROBAR Y MARCAR COMO VÁLIDA: todas las páginas → VALIDA, motivo fuera,
 * evento APROBADA POR SUPERVISOR (nivel APROBADA → punto primary). */
export function aprobarActaMock(
  actaId: string,
  observacion: string
): ActaMesa | null {
  const hallada = actaEnCache(actaId);
  if (!hallada) return null;
  const acta = hallada.acta;
  acta.formularios = {
    TRANSMISION: acta.formularios.TRANSMISION.map((p) => ({
      ...p,
      estado: "VALIDA" as const,
    })),
    DELEGADOS: acta.formularios.DELEGADOS.map((p) => ({
      ...p,
      estado: "VALIDA" as const,
    })),
  };
  acta.motivo = undefined;
  acta.historial = [
    {
      hora: `${horaActual()} LOCAL`,
      titulo: "APROBADA POR SUPERVISOR",
      detalle: `ID: ADM-9482 · Obs: ${truncar(observacion)}`,
      nivel: "APROBADA",
    },
    ...acta.historial,
  ];
  return clonarActa(acta);
}

/** CONFIRMAR RESCANEO: versión 1→2, hora de carga +30 min determinísticos,
 * todas las páginas → VALIDA, motivo fuera, evento RESCANEO CONFIRMADO.
 * La observación es obligatoria (T5.2); el kit no la imprime en el evento. */
export function confirmarRescanActaMock(
  actaId: string,
   
  _observacion: string
): ActaMesa | null {
  const hallada = actaEnCache(actaId);
  if (!hallada) return null;
  const acta = hallada.acta;
  const nuevaHora = minutosAHora(horaAMinutos(acta.horaCarga) + 30);
  acta.version += 1;
  acta.horaCarga = `${nuevaHora} LOCAL`;
  acta.formularios = {
    TRANSMISION: acta.formularios.TRANSMISION.map((p) => ({
      ...p,
      estado: "VALIDA" as const,
    })),
    DELEGADOS: acta.formularios.DELEGADOS.map((p) => ({
      ...p,
      estado: "VALIDA" as const,
    })),
  };
  acta.motivo = undefined;
  acta.historial = [
    {
      hora: `${horaActual()} LOCAL`,
      titulo: "RESCANEO CONFIRMADO",
      detalle: `Nueva transmisión recibida desde sesión ${acta.id}`,
      nivel: "ALERTA",
    },
    ...acta.historial,
  ];
  return clonarActa(acta);
}
