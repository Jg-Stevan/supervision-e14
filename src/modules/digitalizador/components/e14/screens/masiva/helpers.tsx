"use client";

/**
 * KIT e14-carga-masiva-v1 — helpers de la vista MASIVA (R6).
 *
 * SPLIT move-only de MasivaView.tsx (reporte 03b M-2): funciones puras y
 * paletas de píldora extraídas SIN cambiar lógica (cada bloque conserva su
 * comentario de origen). Los consumen `orquestador.tsx`, `fila.tsx`,
 * `bandeja.tsx` y `modal-revisor.tsx`.
 */
import type { ReactNode } from "react";

import type { Acta } from "@/modules/digitalizador/lib/e14/types";
import type {
  EtapaVidaKit,
  FiltroMasiva,
} from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";

/** Píldora de estado de una fila — paleta de estado del repo
 *  (ReviewView L222-225: verde/ámbar/rojo, mono uppercase). */
export function pildoraDe(f: FilaMasiva): { label: string; clases: string } {
  switch (f.estado) {
    case "PENDIENTE":
      return { label: "PENDIENTE", clases: "border-brand-borderdim text-gray-400" };
    // KIT e14-masiva-tiempos-v1 (PR-1): gemela por hash — SOLO visual (al
    // procesar reutiliza el resultado de la original; PROCESAR IGUAL fuerza).
    case "DUPLICADA":
      return { label: "DUPLICADA", clases: "border-gray-500/60 text-gray-300 bg-white/5" };
    case "PROCESANDO":
      return { label: "PROCESANDO", clases: "border-brand-borderdim text-gray-200 bg-white/5" };
    case "ERROR":
      return { label: "ERROR", clases: "border-red-500/60 text-red-400 bg-red-500/10" };
    // e65-dedup-enviadas-v1 (T-7, D-e65-2): nació YA-ENVIADA — SOLO-VISUAL
    // (cero OCR, cero envío; PROCESAR IGUAL fuerza el reproceso completo).
    case "YA-ENVIADA":
      return { label: "YA ENVIADA", clases: "border-emerald-500/60 text-emerald-300 bg-emerald-500/10" };
    case "LISTA": {
      const s = f.statusActa;
      if (s === "ENVIADA") {
        // KIT e14-masiva-ux-v1 (T3.3): la fila DISTINGUE envío real vs en
        // cola por offline, y auto vs manual. Paleta de estado del repo.
        if (f.envioEnCola)
          return { label: "EN COLA", clases: "border-amber-400/60 text-amber-400 bg-amber-400/10" };
        return f.enviadaAuto
          ? { label: "ENVIADA AUTO", clases: "border-brand-green/60 text-brand-green bg-brand-green/10" }
          : { label: "ENVIADA", clases: "border-brand-green/60 text-brand-green bg-brand-green/10" };
      }
      if (s === "OPTIMA")
        return { label: "ÓPTIMA", clases: "border-brand-green/60 text-brand-green" };
      if (s === "ADVERTENCIA")
        return { label: "ADVERTENCIA", clases: "border-amber-400/60 text-amber-400 bg-amber-400/10" };
      if (s === "RECHAZADA")
        return { label: "RECHAZADA", clases: "border-red-500/60 text-red-400 bg-red-500/10" };
      if (s === "EN_REVISION_HUMANA")
        return { label: "REVISIÓN HUMANA", clases: "border-amber-400/60 text-amber-400" };
      // e66 (P2): la gemela confirmada ya NO hereda ENVIADA/OPTIMA — su
      // desenlace es DUPLICADA (el envío real vive SOLO en la original).
      // El fondo azul de la FILA lo pinta esDuplicada (kit e64v, intacto).
      if (s === "DUPLICADA")
        return { label: "DUPLICADA", clases: "border-blue-400/60 text-blue-300 bg-blue-950/40" };
      return { label: "LISTA", clases: "border-brand-borderdim text-gray-400" };
    }
  }
}

/** KIT e64v — UNA sola definición de «duplicada» (compartida por el color
 *  azul y el orden de la bandeja — kit §3): la fila heredó desenlace de
 *  otra vía la maquinaria reutilizarResultado — referencia al original
 *  (`dupOf`) PRESENTE y desenlace heredado YA CONFIRMADO (estado final
 *  LISTA con statusActa). Una dup APLAZADA (estado DUPLICADA, original
 *  en vuelo) aún no confirmó → JAMÁS azul (kit §1). Tokens sin-match o
 *  ausentes no llegan aquí: sin dupOf la fila es ORIGINAL por definición
 *  (el token `dedup` vive solo en RegistroMasiva — no en la fila liviana). */
export function esDuplicada(f: FilaMasiva): boolean {
  return f.dupOf != null && f.estado === "LISTA" && f.statusActa != null;
}

/** KIT e64v — etiqueta del chip azul: refleja el DESENLACE HEREDADO (jamás
 *  inventa — kit §1): ENVIADA real → texto exacto «Ya enviada»; cualquier
 *  otro desenlace → la etiqueta del estado ACTUAL (misma píldora, misma
 *  fuente de verdad). EN COLA (ENVIADA con envío offline pendiente) NO es
 *  «ya enviada» — honestidad del repo (jamás inventar). */
export function etiquetaDupDe(f: FilaMasiva): string {
  if (f.statusActa === "ENVIADA" && !f.envioEnCola) return "Ya enviada";
  return pildoraDe(f).label;
}

export const FILTROS: { valor: FiltroMasiva; label: string }[] = [
  { valor: "TODAS", label: "TODAS" },
  { valor: "OPTIMA", label: "ÓPTIMA" },
  { valor: "ADVERTENCIA", label: "ADVERTENCIA" },
  { valor: "RECHAZADA", label: "RECHAZADA" },
  { valor: "EN_REVISION_HUMANA", label: "EN RH" },
  { valor: "ERROR", label: "ERROR" },
];

/** Etiqueta de vida de la fila activa: FASE + el % ÚNICO del proceso
 *  COMPLETO del acta (cambio pedido por el dueño: UN solo % por acta que
 *  NO se reinicia entre fases — antes cada fase tenía su número y el OCR
 *  escalonado con 2 pasadas lo hacía retroceder 95→50→95). El % viene del
 *  runner (`fracGlobal`, monotónico); la fase es solo contexto. */
export function etiquetaVida(p: { etapa: EtapaVidaKit; fracGlobal?: number }): string {
  const pct =
    p.fracGlobal != null
      ? `${Math.min(99, Math.max(0, Math.round(p.fracGlobal * 100)))}%`
      : "…";
  switch (p.etapa) {
    case "preparando":
      return `PREPARANDO · ${pct}`;
    case "deteccion":
      return `DETECCIÓN · ${pct}`;
    case "verificacion":
      return `VERIFICANDO · ${pct}`;
    case "ocr":
      return `OCR · ${pct}`;
  }
}

/** % ÚNICO del PROCESO COMPLETO del acta (0% a 100%) — pedido del dueño:
 *  un solo número por acta, sin reinicios por fase. `fracGlobal` lo computa
 *  el runner (monotónico, todas las fases sumadas). LISTA = 100 · ERROR = 0 ·
 *  fila PROCESANDO sin señal viva (zombi de recarga) = 20 como hoy. */
export function porcentajeProcesoActa(
  f: FilaMasiva,
  esActiva: boolean,
  progreso: { fracGlobal?: number } | null,
): number {
  if (f.estado === "LISTA") return 100;
  if (f.estado === "ERROR") return 0;
  if (!esActiva) return f.estado === "PROCESANDO" ? 20 : 0;
  if (progreso?.fracGlobal != null) {
    return Math.min(99, Math.max(1, Math.round(progreso.fracGlobal * 100)));
  }
  return 20;
}

/** Píldora de estado del ACTA abierto en el modal (paleta del repo). */
export function pildoraEstadoActa(acta: Acta): { label: string; clases: string } {
  switch (acta.status) {
    case "ENVIADA":
      return { label: "ENVIADA", clases: "border-emerald-500/60 text-emerald-300 bg-emerald-500/10" };
    case "OPTIMA":
      return { label: "ÓPTIMA", clases: "border-emerald-500/60 text-emerald-300" };
    case "ADVERTENCIA":
      return { label: "ADVERTENCIA", clases: "border-amber-400/60 text-amber-400 bg-amber-400/10" };
    case "RECHAZADA":
      return { label: "RECHAZADA", clases: "border-red-500/60 text-red-400 bg-red-500/10" };
    case "EN_REVISION_HUMANA":
      return { label: "REVISIÓN HUMANA", clases: "border-amber-400/60 text-amber-400" };
    case "DUPLICADA":
      return { label: "DUPLICADA", clases: "border-blue-400/60 text-blue-300 bg-blue-950/40" };
  }
}

export function filaInfo(etiqueta: string, valor: string): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-slate-800 bg-[#090d12] px-2.5 py-2">
      <span className="font-mono text-[8px] uppercase tracking-widest text-slate-500">
        {etiqueta}
      </span>
      <span
        className="truncate font-mono text-[11px] font-bold uppercase tracking-wider text-slate-200"
        title={valor}
      >
        {valor}
      </span>
    </div>
  );
}
