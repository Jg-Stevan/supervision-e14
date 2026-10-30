"use client";

/**
 * KIT e14-carga-masiva-v1 (T4) — FILA de la bandeja (R6).
 *
 * SPLIT move-only de MasivaView.tsx (reporte 03b M-2): el cuerpo del
 * `visiblesOrdenadas.map(...)` de la bandeja se extrae a este componente
 * SIN cambiar lógica ni JSX. Los props conservan LOS NOMBRES de las
 * variables locales originales (f, progreso, colaVida, recienListas,
 * filas y las acciones del store) para que el bloque movido quede
 * verbatim — solo cambia la indentación (dedent ×12).
 */
import type { EtapaVidaKit } from "@/modules/digitalizador/lib/e14/masiva/store";
import type { FilaMasiva } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import { CheckIcon, StitchStackIcon } from "../../icons";
import {
  esDuplicada,
  etiquetaDupDe,
  etiquetaVida,
  pildoraDe,
  porcentajeProcesoActa,
} from "./helpers";

/** Espejo estructural del estado `progreso` del store masiva (ProgresoFila
 * no se exporta — el store es de R8): mismos campos, misma forma. */
export interface ProgresoFilaVista {
  id: string;
  etapa: EtapaVidaKit;
  /** 0..1 SOLO cuando etapa === "ocr" — dato REAL del reconocedor. */
  ocrFraccion?: number;
  /** 0..1 del PROCESO COMPLETO del acta — monotónico. */
  fracGlobal?: number;
}

export function FilaMasivaVista({
  f,
  progreso,
  colaVida,
  recienListas,
  filas,
  procesarIgual,
  abrirActa,
  reintentar,
  quitar,
}: {
  f: FilaMasiva;
  progreso: ProgresoFilaVista | null;
  colaVida: string[];
  recienListas: Set<string>;
  filas: FilaMasiva[];
  procesarIgual: (id: string) => void;
  abrirActa: (id: string) => void;
  reintentar: (id: string) => void;
  quitar: (id: string) => void;
}) {
  const pildora = pildoraDe(f);
  const esActiva = progreso?.id === f.id && f.estado === "PROCESANDO";
  // KIT e64v — Cambio A: gemela CONFIRMADA (desenlace heredado)
  // → fila azul. La dup aplazada aún no confirma → sin azul.
  const esDup = esDuplicada(f);
  // D65 (T3.3) — señal de vida de la fila (barra h-1 discreta):
  const enColaVida = f.estado === "PENDIENTE" || f.estado === "DUPLICADA";
  const posCola = enColaVida ? colaVida.indexOf(f.id) + 1 : 0;
  const pctProceso = porcentajeProcesoActa(f, Boolean(esActiva), progreso);
  // % SOLO si es dato REAL (OCR del reconocedor) — kit T3 honestidad.
  const ocrPct =
    esActiva && progreso?.etapa === "ocr" && progreso.ocrFraccion != null
      ? Math.min(100, Math.max(0, Math.round(progreso.ocrFraccion * 100)))
      : null;
  return (
    <li
      key={f.id}
      className={`rounded-2xl border px-3.5 py-3 transition-all ${
        esDup
          ? // KIT e64v — Cambio A: specs dark del kit (bg/borde azul).
            // El repo es dark-only (paleta oscura hardcodeada — sin
            // variante `dark:`): los tokens dark aplican directos.
            "bg-blue-950/60 border-blue-800 hover:border-blue-700"
          : `bg-[#10161f] ${
              esActiva ? "border-[#10b981]/60 ring-1 ring-[#10b981]/60 shadow-md shadow-[#10b981]/10" : "border-slate-800 hover:border-slate-700"
            }`
      }`}
    >
      <div className="flex items-center gap-3">
      {/* Thumb 40px (o cuadrado pendiente) */}
      {f.thumb ? (
        <img
          src={f.thumb}
          alt={`Miniatura de ${f.nombre}`}
          className="w-11 h-11 rounded-xl object-cover bg-[#090d12] border border-slate-700 shrink-0"
        />
      ) : (
        <div
          aria-hidden
          className="w-11 h-11 rounded-xl bg-[#090d12] border border-slate-800 flex items-center justify-center text-slate-500 shrink-0"
        >
          <StitchStackIcon className="w-5 h-5" />
        </div>
      )}

      {/* Nombre + estado/motivo */}
      <div className="min-w-0 flex-1">
        {/* D59 — KIT e14-info-acta-filas-v1 (T4): línea de título
            ENCIMA del nombre con la info reconocida del acta
            (idea del dueño, mockup Stitch corregido — paleta del
            repo: brand-green mono). Fila sin infoTitulo queda
            EXACTAMENTE como hoy (cero regresión); null = sin
            datos → no se pinta nada (jamás inventar). */}
        {f.infoTitulo && (
          <p
            className="font-mono text-[11px] font-bold uppercase tracking-wider text-brand-green truncate"
            title={f.infoTitulo}
          >
            {f.infoTitulo}
          </p>
        )}
        <p
          className={`font-mono text-[11px] font-bold uppercase truncate ${
            f.estado === "ERROR" ? "text-red-300" : "text-white"
          }`}
        >
          {f.nombre}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span
            className={`px-2 py-0.5 rounded-full border font-mono text-[9px] font-bold uppercase tracking-wider ${pildora.clases}`}
          >
            {pildora.label}
          </span>
          {/* KIT e64v — Cambio A: chip azul de la gemela CONFIRMADA.
              Etiqueta SIEMPRE visible (el color jamás es el único
              portador de información — accesibilidad/daltonismo);
              refleja el desenlace heredado (jamás inventa — kit §1).
              Convive con QR chip / ≡ original / YA ENVIADA (flex-wrap
              del contenedor — red line 5). Icono: CheckIcon propio
              del repo (el icono del kit era opcional y lucide no
              existe en el repo — sistema de diseño propio manda). */}
          {esDup && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300 font-mono text-[9px] font-bold tracking-wider"
              aria-label={`Gemela confirmada — ${etiquetaDupDe(f)}`}
            >
              <CheckIcon className="w-3 h-3" strokeWidth={2.5} />
              {etiquetaDupDe(f)}
            </span>
          )}
          {/* D66 — KIT e14-decode-unico-precalor-v1 (T3.5): mini-señal
              PREPARADA — la fila PENDIENTE ya tiene master esperando
              (el precalor trabajó en la espera; D45 intacto: la fila
              NO procesa sola). Chip pequeñito y nada más — sin % ni
              promesas. Flag transitorio (muere con la recarga). */}
          {f.estado === "PENDIENTE" && f.precalentada === true && (
            <span
              className="px-1.5 py-0.5 rounded-full border border-brand-green/40 text-brand-green/90 font-mono text-[9px] font-bold uppercase tracking-wider"
              title="El precalor ya decodificó esta fila (master listo)"
            >
              PREPARADA
            </span>
          )}
          {/* e64-qr T-0.2 — chip del estado de la CAPA 0 QR (solo
              presencia, JAMÁS payload — red line 10). QR ✗ solo en
              LISTA: en PENDIENTE/PROCESANDO aún no hay veredicto
              (honestidad del kit). Resuelve la mitad de los
              reportes «no lee»: el dueño VERÁ cuándo sí leyó. */}
          {f.qrEstado === "leido" && (
            <span
              className="rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-300/90"
              aria-label="QR leído"
            >
              QR ✓
            </span>
          )}
          {f.qrEstado === "sin-payload" && f.estado === "LISTA" && (
            <span
              className="rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400"
              aria-label="QR no decodificado"
            >
              QR ✗
            </span>
          )}
          {/* KIT e14-masiva-tiempos-v1 (PR-1): la DUPLICADA señala
              a su original — transparencia total del dedup. */}
          {f.estado === "DUPLICADA" && f.dupOf && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-gray-400 truncate">
              ≡ {filas.find((o) => o.id === f.dupOf)?.nombre ?? "OTRA FILA"}
            </span>
          )}
          {/* e65-dedup-enviadas-v1 (T-7): chip YA ENVIADA — la
              fila nació con contenido ya enviado (bytes/dhash);
              cero OCR, cero envío. JUNTO al chip DUPLICADA. */}
          {f.estado === "YA-ENVIADA" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/60 text-emerald-300 bg-emerald-500/10">
              YA ENVIADA
            </span>
          )}
          {f.estado === "ERROR" && f.error && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-red-400/80 truncate">
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

      {/* % del proceso · score · página · nivel (div:nth-of-type(3)) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-gray-400">
        <span
          className={`font-mono text-[10px] sm:text-[11px] font-black tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1.5 transition-all ${
            esActiva || f.estado === "PROCESANDO"
              ? "border-[#10b981]/60 bg-[#10b981]/15 text-[#10b981] shadow-xs"
              : f.estado === "LISTA"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : f.estado === "ERROR"
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-slate-800 bg-[#090d12] text-slate-400"
          }`}
          title={`Progreso del proceso del acta: ${pctProceso}%`}
        >
          {(esActiva || f.estado === "PROCESANDO") && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping shrink-0" />
          )}
          {pctProceso}%
        </span>
        {typeof f.score === "number" && (
          <span className="text-gray-200 font-bold hidden md:inline" title="Score de calidad">
            {f.score.toFixed(1)}
          </span>
        )}
        <span className="hidden sm:inline">{f.pagina ?? "-/-"}</span>
        {f.nivel && (
          <span
            className={`hidden sm:inline px-1.5 py-0.5 rounded border ${
              f.nivel === "AUTO"
                ? "border-brand-green/50 text-brand-green"
                : "border-brand-borderdim text-gray-500"
            }`}
          >
            {f.nivel}
          </span>
        )}
      </div>

      {/* Acciones por fila */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* KIT e14-masiva-tiempos-v1 (PR-1): rescate del kit §2 —
            reprocesar la gemela COMPLETA por si el dhash la
            confundió (fotos distintas parecidas en thumb).
            e65 (T-7): también sobre YA-ENVIADA — ÚNICO escape del
            dueño para estampar QR/OCR en una fila ya enviada. */}
        {(f.estado === "DUPLICADA" || f.estado === "YA-ENVIADA") && (
          <button
            type="button"
            onClick={() => void procesarIgual(f.id)}
            aria-label={`Reprocesar ${f.nombre} completo aunque esté duplicada`}
            className="min-h-[44px] px-2.5 rounded-lg border border-amber-400/50 text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            PROCESAR IGUAL
          </button>
        )}
        {f.estado === "LISTA" && (
          <button
            type="button"
            onClick={() => void abrirActa(f.id)}
            aria-label={`Abrir ${f.nombre} en revisión`}
            className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-brand-border text-gray-300 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-brand-green hover:text-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/60"
          >
            ABRIR
          </button>
        )}
        {/* D59 — KIT e14-info-acta-filas-v1 (T4): «REINTENTAR» del
            mockup en filas ERROR — re-encola (PENDIENTE) para que
            PROCESAR la procese; SIN_ARCHIVO_ORIGINAL si el
            registro no trae el archivo original (honesto). */}
        {f.estado === "ERROR" && (
          <button
            type="button"
            onClick={() => void reintentar(f.id)}
            aria-label={`Reintentar ${f.nombre}: re-encolar para procesar`}
            className="min-h-[44px] px-2.5 rounded-lg border border-red-500/40 text-red-300 font-mono text-[10px] font-bold uppercase tracking-wider hover:border-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
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
          className="min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-red-400 font-mono text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
        >
          QUITAR
        </button>
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
      {(enColaVida || esActiva || f.estado === "ERROR" || (f.estado === "LISTA" && recienListas.has(f.id))) && (
        <div className="mt-2">
          {esActiva && ocrPct != null ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ocrPct}
              aria-label={`OCR ${ocrPct}%`}
              className="h-1 rounded-full bg-white/10 overflow-hidden"
            >
              <div className="h-full bg-brand-green" style={{ width: `${ocrPct}%` }} />
            </div>
          ) : esActiva ? (
            <div className="h-1 rounded-full bg-brand-green/40 animate-pulse" aria-hidden />
          ) : f.estado === "ERROR" ? (
            <div className="h-1 rounded-full bg-red-500/40" aria-hidden />
          ) : f.estado === "LISTA" ? (
            <div className="h-1 rounded-full bg-brand-green" aria-hidden />
          ) : (
            <div className="h-1 rounded-full bg-white/5" aria-hidden />
          )}
          {(enColaVida || (esActiva && progreso)) && (
            <p className="mt-1 font-mono text-[11px] tabular-nums tracking-wider text-gray-400 uppercase truncate">
              <span aria-live="polite">
                {enColaVida
                  ? `EN COLA #${posCola} DE ${colaVida.length}`
                  : progreso
                    ? etiquetaVida({ etapa: progreso.etapa })
                    : ""}
              </span>
              {ocrPct != null && <span> {ocrPct}%</span>}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
