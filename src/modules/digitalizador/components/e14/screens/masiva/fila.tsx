"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — FILA de la bandeja (R6).
 *
 * SPLIT move-only de MasivaView.tsx (reporte 03b M-2): el cuerpo del
 * `visiblesOrdenadas.map(...)` de la bandeja se extrae a este componente
 * SIN cambiar lógica ni JSX — solo cambia la indentación (dedent ×12).
 *
 * R6-perf (re-renders, reporte 03b §M-2): componente MEMOIZADO. Los valores
 * derivados POR RENDER llegan como props primitivos (pildora*, posCola,
 * totalCola, recienLista, nombreOriginal, tiempoTexto) — precalculados en
 * BandejaFilas; `f` se pasa por IDENTIDAD (el store parchea con
 * `filas.map(f => f.id === id ? { ...f, ...patch } : f)`: el objeto de una
 * fila solo se reemplaza cuando ESA fila cambia — misma granularidad que
 * explotarlo en 16 primitivos, sin duplicar su forma). Las acciones del
 * store (zustand) son estables.
 *
 * P0.2 (informe-arquitectura-fluidez-2026-11-02 §3 A4/A5 + §6.2) — BARRERA
 * DE RENDER: la señal de vida (`progreso`) ya NO viaja por props desde el
 * orquestador (cada tick re-renderizaba la vista entera ~500 nodos para
 * cambiar 1 fila). Ahora CADA fila se suscribe por su cuenta con un selector
 * fino (solo la fila ACTIVA en PROCESANDO recibe el objeto de vida): un tick
 * de vida re-renderiza 1-2 filas y NADA más — el orquestador y la bandeja ni
 * se enteran. Los derivados de vida (esActiva, pctProceso, ocrPct,
 * vidaTexto) se computan AQUÍ (mismas fórmulas de siempre).
 *
 * KIT carga-masiva-redesign-v1 — tarjeta del diseño «CARGA MASIVA»: miniatura
 * REAL en marco blanco, título del acta (infoTitulo) como línea principal,
 * filename en gris, píldoras % / score / TIEMPO REAL (msPorFila de la
 * corrida — metricas.ts; sin dato no se pinta) y botones ABRIR/QUITAR.
 * Todos los estados del repo (DUPLICADA/YA-ENVIADA/PREPARADA/QR/error)
 * se conservan — solo cambia la presentación.
 */
import { memo } from "react";

import { useMasivaStore } from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import { etiquetaVida, porcentajeProcesoActa } from "./helpers";
import { CheckIcon, StitchStackIcon } from "../../icons";

/** Espejo estructural del estado `progreso` del store masiva (ProgresoFila
 * no se exporta — el store es de R8): mismos campos, misma forma. */
export interface ProgresoFilaVista {
  id: string;
  etapa: "preparando" | "deteccion" | "ocr" | "verificacion";
  /** 0..1 SOLO cuando etapa === "ocr" — dato REAL del reconocedor. */
  ocrFraccion?: number;
  /** 0..1 del PROCESO COMPLETO del acta — monotónico. */
  fracGlobal?: number;
}

export interface PropsFilaMasiva {
  /** La fila del store — por IDENTIDAD (ver doc del archivo). */
  f: FilaMasiva;
  pildoraLabel: string;
  pildoraClases: string;
  /** KIT e64v — gemela CONFIRMADA (desenlace heredado) → fila azul. */
  esDup: boolean;
  /** Etiqueta del chip azul (solo si esDup; null = no aplica). */
  etiquetaDup: string | null;
  /** Posición 1-based en la cola de vida (0 = fuera de cola). */
  posCola: number;
  totalCola: number;
  /** Destello 100% verde al LISTAR (D65 T3.3 — transitorio). */
  recienLista: boolean;
  /** Nombre de la fila original de una DUPLICADA (null → «OTRA FILA»). */
  nombreOriginal: string | null;
  /** Tiempo REAL del acta completa ("20 s") — SU MURO (despacho → desenlace:
   *  pre-OCR + pipeline + persist/envío), NO el pipeline suelto. Métricas de
   *  la corrida (MetricaActa.id ≡ fila.id). "" = sin dato → NO se pinta. */
  tiempoTexto: string;
  procesarIgual: (id: string) => void;
  abrirActa: (id: string) => void;
  reintentar: (id: string) => void;
  quitar: (id: string) => void;
}

export const FilaMasivaVista = memo(function FilaMasivaVista({
  f,
  pildoraLabel,
  pildoraClases,
  esDup,
  etiquetaDup,
  posCola,
  totalCola,
  recienLista,
  nombreOriginal,
  tiempoTexto,
  procesarIgual,
  abrirActa,
  reintentar,
  quitar,
}: PropsFilaMasiva) {
  // P0.2 — suscripción FINA a la señal de vida (barrera de render): este
  // selector solo devuelve el objeto de vida cuando ESTA fila es la activa
  // en PROCESANDO — un tick de vida re-renderiza 1-2 filas (la que entra y
  // la que sale de activa) y ninguna otra (Object.is sobre la referencia
  // del store; con el skip-identical de marcarProgreso los ticks idénticos
  // ni siquiera llegan aquí).
  const vida = useMasivaStore((s) =>
    f.estado === "PROCESANDO" && s.progreso?.id === f.id ? s.progreso : null,
  );
  const esActiva = vida != null;
  const pctProceso = porcentajeProcesoActa(f, esActiva, esActiva ? vida : null);
  // % SOLO si es dato REAL (OCR del reconocedor) — kit T3 honestidad.
  const ocrPct =
    esActiva && vida?.etapa === "ocr" && vida.ocrFraccion != null
      ? Math.min(100, Math.max(0, Math.round(vida.ocrFraccion * 100)))
      : null;
  const vidaTexto = esActiva && vida ? etiquetaVida(vida) : "";
  // D65 (T3.3) — señal de vida de la fila (barra h-1 discreta):
  const enColaVida = f.estado === "PENDIENTE" || f.estado === "DUPLICADA";
  return (
    <li
      key={f.id}
      // R6 — virtualización barata (reporte 03b §M-2, tope 500 filas): las
      // filas fuera del viewport no pintan su contenido (el navegador las
      // salta) y reservan ~88px estimados — sin librería de virtualización
      // (eso exigiría ADR; ver pr.md).
      className={`rounded-lg border p-3 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_88px] ${
        esDup
          ? // KIT e64v — Cambio A: specs dark del kit (bg/borde azul).
            // El repo es dark-only (paleta oscura hardcodeada — sin
            // variante `dark:`): los tokens dark aplican directos.
            "bg-blue-950/60 border-blue-800 hover:border-blue-700"
          : `bg-[#071214] ${
              esActiva ? "border-[#00e599]/60 ring-1 ring-[#00e599]/60 shadow-md shadow-[#00e599]/10" : "border-[#112b2a] hover:border-[#1b3f3e]"
            }`
      }`}
    >
      <div className="flex items-start gap-3.5">
      {/* Thumb (marco blanco del diseño — la miniatura SIEMPRE es la foto
          real de la fila; regla del mantenedor: jamás fotos inventadas) */}
      {f.thumb ? (
        <img
          src={f.thumb}
          alt={`Miniatura de ${f.nombre}`}
          decoding="async"
          className="mt-0.5 h-14 w-12 shrink-0 rounded border border-gray-400 bg-white object-cover shadow-inner"
        />
      ) : (
        <div
          aria-hidden
          className="mt-0.5 flex h-14 w-12 shrink-0 items-center justify-center rounded border border-[#112b2a] bg-[#04090b] text-gray-500"
        >
          <StitchStackIcon className="h-5 w-5" />
        </div>
      )}

      {/* Título del acta + nombre/estado/motivo */}
      <div className="min-w-0 flex-1">
        {/* D59 — KIT e14-info-acta-filas-v1 (T4): línea de título
            ENCIMA del nombre con la info reconocida del acta — en el
            diseño es la LÍNEA PRINCIPAL (gris claro, bold). Fila sin
            infoTitulo queda EXACTAMENTE como hoy (cero regresión);
            null = sin datos → no se pinta nada (jamás inventar). */}
        {f.infoTitulo && (
          <h2
            className="truncate text-xs font-bold tracking-wider text-gray-200"
            title={f.infoTitulo}
          >
            {f.infoTitulo}
          </h2>
        )}
        <p
          className={`truncate font-mono text-[11px] font-semibold tracking-wide ${
            f.infoTitulo
              ? f.estado === "ERROR"
                ? "text-red-300"
                : "text-gray-400"
              : f.estado === "ERROR"
                ? "text-red-300"
                : "text-white"
          }`}
        >
          {f.nombre}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${pildoraClases}`}
          >
            {pildoraLabel}
          </span>
          {/* KIT e64v — Cambio A: chip azul de la gemela CONFIRMADA.
              Etiqueta SIEMPRE visible (el color jamás es el único
              portador de información — accesibilidad/daltonismo);
              refleja el desenlace heredado (jamás inventa — kit §1).
              Convive con QR chip / ≡ original / YA PUBLICADA (flex-wrap
              del contenedor — red line 5). Icono: CheckIcon propio
              del repo (el icono del kit era opcional y lucide no
              existe en el repo — sistema de diseño propio manda). */}
          {esDup && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-blue-900 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-blue-300"
              aria-label={`Gemela confirmada — ${etiquetaDup}`}
            >
              <CheckIcon className="h-3 w-3" strokeWidth={2.5} />
              {etiquetaDup}
            </span>
          )}
          {/* D66 — KIT e14-decode-unico-precalor-v1 (T3.5): mini-señal
              PREPARADA — la fila PENDIENTE ya tiene master esperando
              (el precalor trabajó en la espera; D45 intacto: la fila
              NO procesa sola). Chip pequeñito y nada más — sin % ni
              promesas. Flag transitorio (muere con la recarga). */}
          {f.estado === "PENDIENTE" && f.precalentada === true && (
            <span
              className="rounded-full border border-brand-green/40 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-green/90"
              title="El precalor ya decodificó esta fila (master listo)"
            >
              PREPARADA
            </span>
          )}
          {/* e64-qr T-0.2 — chip del estado de la CAPA 0 QR (solo
              presencia, JAMÁS payload — red line 10). QR ✗ solo en
              LISTA: en PENDIENTE/PROCESANDO aún no hay veredicto
              (honestidad del kit). Resuelve la mitad de los
              reportes «no lee»: el mantenedor VERÁ cuándo sí leyó. */}
          {f.qrEstado === "leido" && (
            <span
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold tracking-wider text-[#00e599]"
              aria-label="QR leído"
            >
              QR <span aria-hidden>✓</span>
            </span>
          )}
          {f.qrEstado === "sin-payload" && f.estado === "LISTA" && (
            <span
              className="rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide text-gray-500"
              aria-label="QR no decodificado"
            >
              QR ✗
            </span>
          )}
          {/* KIT e14-masiva-tiempos-v1 (PR-1): la DUPLICADA señala
              a su original — transparencia total del dedup. */}
          {f.estado === "DUPLICADA" && f.dupOf && (
            <span className="truncate font-mono text-[9px] uppercase tracking-wider text-gray-500">
              ≡ {nombreOriginal ?? "OTRA FILA"}
            </span>
          )}
          {/* e65-dedup-enviadas-v1 (T-7): chip YA PUBLICADA (C-14 — copy
              honesto: la fila nació con contenido ya publicado en sesiones
              previas (bytes/dhash); cero OCR, cero publicación — LOCAL, D8).
              JUNTO al chip DUPLICADA. */}
          {f.estado === "YA-ENVIADA" && (
            <span className="rounded border border-[#00e599]/60 bg-[#00e599]/10 px-1.5 py-0.5 text-[10px] text-[#00e599]">
              YA PUBLICADA
            </span>
          )}
          {f.estado === "ERROR" && f.error && (
            <span className="truncate font-mono text-[9px] uppercase tracking-wider text-red-400/80">
              {f.error}
            </span>
          )}
          {f.motivo && f.statusActa === "RECHAZADA" && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-red-400/80">
              {f.motivo}
            </span>
          )}
        </div>
      </div>

      {/* Píldoras del diseño: % · score · tiempo — + acciones */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-all ${
              esActiva || f.estado === "PROCESANDO"
                ? "border-[#00e599]/60 bg-[#061e19] text-[#00e599] shadow-xs"
                : f.estado === "LISTA"
                  ? "border-[#00e599]/40 bg-[#061e19] text-[#00e599]"
                  : f.estado === "ERROR"
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : "border-[#112b2a] bg-[#04090b] text-gray-400"
            }`}
            title={`Progreso del proceso del acta: ${pctProceso}%`}
          >
            {(esActiva || f.estado === "PROCESANDO") && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 animate-ping rounded-full bg-[#00e599]" />
            )}
            {pctProceso}%
          </span>
          {typeof f.score === "number" && (
            <span
              className="rounded border border-[#112b2a] bg-[#0b191c] px-2.5 py-0.5 font-mono text-[10px] font-bold text-gray-300"
              title="Score de calidad"
            >
              {f.score.toFixed(1)}
            </span>
          )}
          {tiempoTexto && (
            <span
              className="rounded border border-[#112b2a] bg-[#0b191c] px-2.5 py-0.5 font-mono text-[10px] font-bold text-gray-300"
              title="Tiempo real del acta completa: del despacho al desenlace (pre-OCR + pipeline + persistencia/envío). Sin cola de espera."
            >
              {tiempoTexto}
            </span>
          )}
        </div>

        {/* Acciones por fila */}
        <div className="flex items-center gap-1 pl-1">
          {/* KIT e14-masiva-tiempos-v1 (PR-1): rescate del kit §2 —
              reprocesar la gemela COMPLETA por si el dhash la
              confundió (fotos distintas parecidas en thumb).
              e65 (T-7): también sobre YA-ENVIADA — ÚNICO escape del
              mantenedor para estampar QR/OCR en una fila ya enviada. */}
          {(f.estado === "DUPLICADA" || f.estado === "YA-ENVIADA") && (
            <button
              type="button"
              onClick={() => void procesarIgual(f.id)}
              aria-label={`Reprocesar ${f.nombre} completo aunque esté duplicada`}
              className="min-h-[40px] rounded border border-amber-500/50 px-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400 transition-colors hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
            >
              PROCESAR IGUAL
            </button>
          )}
          {f.estado === "LISTA" && (
            <button
              type="button"
              onClick={() => void abrirActa(f.id)}
              aria-label={`Abrir ${f.nombre} en revisión`}
              className="min-h-[40px] min-w-[44px] rounded border border-[#112b2a] bg-[#0b191c] px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300 transition-colors hover:border-[#1b3f3e] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e599]/60"
            >
              ABRIR
            </button>
          )}
          {/* D59 — KIT e14-info-acta-filas-v1 (T4): «REINTENTAR» de
              filas ERROR — re-encola (PENDIENTE) para que PROCESAR la
              procese; SIN_ARCHIVO_ORIGINAL si el registro no trae el
              archivo original (honesto). */}
          {f.estado === "ERROR" && (
            <button
              type="button"
              onClick={() => void reintentar(f.id)}
              aria-label={`Reintentar ${f.nombre}: re-encolar para procesar`}
              className="min-h-[40px] rounded border border-red-500/40 px-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-300 transition-colors hover:border-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              REINTENTAR
            </button>
          )}
          <button
            type="button"
            // FIX (auditoría 2-b #15): QUITAR fuera de la fila en
            // PROCESO — el desenlace de la foto activa ya está en
            // vuelo (el runner descarta el resultado de una fila
            // quitada, pero el botón mentía sobre lo que hace).
            disabled={f.estado === "PROCESANDO"}
            onClick={() => void quitar(f.id)}
            aria-label={`Quitar ${f.nombre} de la cola`}
            className="min-h-[40px] min-w-[44px] rounded px-2 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
          >
            QUITAR
          </button>
        </div>
      </div>
      </div>

      {/* D65 (T3.3) — BARRA DE VIDA (h-1, tipografía discreta — no
          compite con los chips): EN COLA → vacía + «#N de M»;
          PROCESANDO preparando/detección/verificación → animada
          SIN número; OCR con fracción REAL → determinada + %;
          LISTA → 100% verde un instante (transitorio); ERROR →
          roja. aria-live SOLO en el texto de etapa (los cambios
          de % van en un hermano sin aria-live — kit T3.5).
          SPRINT-B (B2): re-cableada del bloque original D65
          (perdido en el zip 4f9c871 — AUDITORIA-REGRESION
          #1/#2). Plomería intacta: recienListas/enColaVida/
          posCola/colaVida + ocrPct (honesto, solo dato real). */}
      {(enColaVida || esActiva || f.estado === "ERROR" || (f.estado === "LISTA" && recienLista)) && (
        <div className="mt-2">
          {esActiva && ocrPct != null ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ocrPct}
              aria-label={`OCR ${ocrPct}%`}
              className="h-1 overflow-hidden rounded-full bg-white/10"
            >
              <div className="h-full bg-brand-green" style={{ width: `${ocrPct}%` }} />
            </div>
          ) : esActiva ? (
            <div className="h-1 animate-pulse rounded-full bg-[#00e599]/40" aria-hidden />
          ) : f.estado === "ERROR" ? (
            <div className="h-1 rounded-full bg-red-500/40" aria-hidden />
          ) : f.estado === "LISTA" ? (
            <div className="h-1 rounded-full bg-brand-green" aria-hidden />
          ) : (
            <div className="h-1 rounded-full bg-white/5" aria-hidden />
          )}
          {(enColaVida || esActiva) && (
            <p className="mt-1 truncate font-mono text-[11px] uppercase tabular-nums tracking-wider text-gray-400">
              <span aria-live="polite">
                {enColaVida
                  ? `EN COLA #${posCola} DE ${totalCola}`
                  : vidaTexto}
              </span>
              {ocrPct != null && <span> {ocrPct}%</span>}
            </p>
          )}
        </div>
      )}
    </li>
  );
});
