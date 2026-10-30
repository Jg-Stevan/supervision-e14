/**
 * Tipos de dominio del ACTA E-14 (kit SUP-4 "actas-v1" §3-T1).
 *
 * El acta es el documento digitalizado que llega a la cola de revisión del
 * supervisor. Como el resto del dominio: sin dependencias externas y listo
 * para el trasplante al monorepo del digitalizador (D2).
 */

import type { Mesa, Puesto } from "./types";

/** Formulario contenido en el acta (kit T1). */
export type FormularioTipo = "TRANSMISION" | "DELEGADOS";

/** Estado de una página del acta (kit T1). */
export type PaginaEstado = "VALIDA" | "ADVERTENCIA" | "PENDIENTE";

/** Página de un formulario del acta. */
export interface PaginaActa {
  numero: number;
  estado: PaginaEstado;
}

// ─── KIT SUP-6 (actas-reales-v1 §3-T2) — foto real + encabezado impreso ────

/** Foto real de una página del acta (kit actas-reales-v1). */
export interface FotoActa {
  /** URL del asset (import estático del módulo). */
  src: string;
  /** Dimensiones intrínsecas en px (canvas del visor). */
  ancho: number;
  alto: number;
  /** Nombre de archivo (convención digitalizador). */
  archivo: string;
}

/** Encabezado IMPRESO del acta — se muestra, no se interpreta. */
export interface ImpresionActa {
  consulado: string; // "88"
  pais: string;      // "335 - EGIPTO"
  zona: string;      // "05"   (verbatim impreso; el catálogo usa 005)
  puesto: string;    // "02"
  mesa: string;      // "001"
  lugar: string;     // "El Cairo - Consulado"
  barcode?: string;  // "710003993010102"
  etiquetaFormulario?: string; // "TRANSMISIÓN" | "CÓNSUL/EMBAJADOR"
}

/** Nivel de un evento del historial del acta. El kit §3-T1 define
 * CRITICO/ALERTA/NEUTRAL; §3-T5.5 añade APROBADA (punto primary en la
 * timeline — color nuevo permitido por el kit). */
export type NivelEventoActa = "CRITICO" | "ALERTA" | "NEUTRAL" | "APROBADA";

/** Evento de trazabilidad del acta (kit T1). */
export interface EventoActa {
  /** "14:20 LOCAL" */
  hora: string;
  /** "SOLICITUD DE RESCANEO" */
  titulo: string;
  /** "Alerta automática: Falta de firmas / Ilegible" */
  detalle: string;
  nivel: NivelEventoActa;
}

/** Acta de una mesa (kit T1). Todo dato se deriva por seed de la mesa
 * (§0-7); Roma mesa 1 es EXACTA al mockup (§0-6). */
export interface ActaMesa {
  /** "#A92-F" */
  id: string;
  mesaId: string;
  puestoId: string;
  /** "14:20 LOCAL" */
  horaCarga: string;
  /** "SOLICITUD DE RESCANEO" → muestra el chip de motivo en el header. */
  motivo?: string;
  formularios: Record<FormularioTipo, PaginaActa[]>;
  /** En orden descendente (más reciente primero — kit §3-T1). */
  historial: EventoActa[];
  /** 1; ++ tras rescan confirmado (kit T1). */
  version: number;
  /** SUP-6 (D23): fotos reales del digitalizador por formulario, indexadas
   * página − 1 (null/ausente → esa página cae al documento sintético D18). */
  fotos?: Partial<Record<FormularioTipo, (FotoActa | null)[]>>;
  /** SUP-6 (D23): encabezado impreso verbatim — se muestra, no se
   * interpreta (§0-1: el módulo NO mira votos). */
  impresion?: ImpresionActa;
}

/** true si el acta fue aprobada por el supervisor (overlay "ACTA VALIDADA",
 * kit §2.3) — derivado del historial, sin campo extra en el contrato. */
export function actaAprobada(acta: ActaMesa): boolean {
  return acta.historial.some((evento) => evento.nivel === "APROBADA");
}

// ─── Reglas de derivación acta ← mesa/puesto (CANÓNICAS — M13) ──────────

/** Delegados acreditados de la mesa (n/16, kit §2.3 «coherente con los
 * delegados de la mesa»): 2 partes ok → 16, 1 → 8, 0 → 0. Regla ÚNICA
 * (M13): vivía duplicada en `data/actas-mock.ts:271` y
 * `components/actas/documento-e14.tsx:31` — este export canónico manda;
 * el lado documento-e14 lo adopta R4. */
export function delegadosAcreditados(mesa: Mesa): number {
  const ok =
    (mesa.delegados.p1 === "ok" ? 1 : 0) + (mesa.delegados.p2 === "ok" ? 1 : 0);
  return ok * 8;
}

/** Ciudad del puesto ("02 - Roma" → "ROMA") — etiqueta del encabezado del
 * acta. Regla ÚNICA (M13): vivía duplicada en `data/actas-mock.ts:58` y
 * `components/actas/documento-e14.tsx:38` — este export canónico manda. */
export function ciudadDePuesto(puesto: Puesto): string {
  const partes = puesto.puesto.split(" - ");
  return (partes.length > 1 ? partes[1] : puesto.puesto).toUpperCase();
}

// ─── Utilidades determinísticas (§0-7: todo dato se deriva por seed) ───────

function hashSeed(texto: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG determinístico (mulberry32 sobre hash FNV-1a del seed): la misma
 * seed produce siempre la misma secuencia — compartido por los datos del
 * acta y el dibujo sintético del documento (D18). */
export function crearRandomDeterministico(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
