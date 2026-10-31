"use client";

// ─── KIT visor-masida-redesign-v1 — MODAL DE REVISIÓN REMODELADO ────────────
// Redesign Stitch («Supervisión de Actas Electorales — Auditoría y
// Escrutinio») aplicado al ABRIR de la bandeja masiva: workspace completo
// a 2 columnas — canvas del documento (toolbar flotante + chevrons de
// navegación entre imágenes procesadas + MOSTRAR ORIGINAL + franja de
// metadata) y panel del auditor a la derecha (ENVÍO AUTOMÁTICO con los
// datos reconocidos, OBSERVACIONES, ACCIONES DEL SUPERVISOR con RECHAZAR
// (REESCANEAR) y nota de auditoría).
//
// DISCIPLINA DE SIEMPRE — cero cambios de lógica, solo remodelación:
// · Contrato de props intacto (+2 props NUEVAS opcionales de navegación:
//   posNavegacion/onNavegar — el orquestador las alimenta con la bandeja).
// · El editor (RECORTAR/ROTAR/DESHACER horneados por canvas) sigue vivo
//   para las actas SIN envío automático — ahora vive en la toolbar. Para
//   las ENVIADAS AUTO la rotación es VISUAL (ayuda de lectura, no hornea).
// · Las ediciones siguen viajando por editarActaActual; la persistencia
//   sigue siendo sincronizarAlVolver al cerrar (store masiva, intacto).
// · RECHAZAR (nueva acción del supervisor): motivo OBLIGATORIO + armado a
//   2 toques (mismo patrón VACIAR/REINICIAR de la bandeja) → parchea el
//   acta abierta (status RECHAZADA + rechazo SUPERVISOR con el motivo) y
//   pasa al siguiente acta del lote. Nada del runner/store se toca.
// · Honestidad de datos (kit §1): score real, página real (o «- DE -») —
//   jamás inventar campos.
// · Feedback del dueño (ronda 1): VER EN MONITOR vive en la CABECERA del
//   panel (outline verde + monitor, solo con publicación aterrizada D27);
//   al fondo del panel queda SOLO CERRAR; campos del panel = exactamente
//   los del diseño (fuera Intento/Hash/IdEnlace); «Verificación de
//   Identificador / Código» = el código impreso ENTRE LAS X del acta
//   (7-23-10-19 — plancha del formulario E-14 exterior), NO el barcode;
//   móvil: el modal COMPLETO hace scroll (navegable) y AJUSTAR = canvas a
//   pantalla completa real (h-dvh).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Contrast,
  Crop,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Maximize,
  Minimize,
  Monitor,
  RotateCw,
  ShieldCheck,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  joinDeActa,
  useE14Store,
  type PublicacionActa,
} from "@/modules/digitalizador/store/store-e14";
import type { Acta } from "@/modules/digitalizador/lib/e14/types";
// KIT editor-masiva-v1: horneado de ROTAR/RECORTAR por canvas (misma
// disciplina de siempre — canvas puro, dataURL out).
import {
  recortarDataUrl,
  rotateProcessedDataUrl,
} from "@/modules/digitalizador/lib/e14/image-utils";
// KIT visor-gestos-v1 (compartido con el visor del dashboard): zoom con
// rueda del mouse / pellizco táctil / arrastre — primitivo puro de UI.
import {
  VisorZoom,
  type VisorZoomHandle,
} from "@/modules/supervision/components/actas/visor-zoom";
import { pildoraEstadoActa } from "./helpers";
import { PublicacionChip } from "./publicacion-chip";
import type { PropsMasivaView } from "./orquestador";

/** Rectángulo de recorte en % del área de la foto (0–100 — mapea a píxeles
 * naturales al aplicar; el drag llega saneado y el clamp lo respalda). */
interface RectPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mínimo % en CADA eje para habilitar APLICAR (evita recortes absurdos). */
const RECT_MIN_PCT = 3;

/** Modos de contraste del visor (mismo trío del visor del dashboard). */
type ContrasteModo = "NORMAL" | "ALTO" | "NEGATIVO";

const FILTRO_CONTRASTE: Record<ContrasteModo, string | undefined> = {
  NORMAL: undefined,
  ALTO: "contrast(1.4) brightness(1.05)",
  NEGATIVO: "invert(1)",
};

/** Score honesto: entero sin decimales (10/10), el resto a 1 decimal. */
function scoreTexto(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** «Verificación de Identificador / Código» (feedback del dueño): el código
 * IMPRESO del formulario E-14 exterior — el que aparece ENTRE LAS X en el
 * acta física («X 7-23-10-19 X», justo bajo el encabezado CONSULADO/PAÍS/
 * ZONA/PUESTO/MESA/LUGAR). Es el código de plancha del formulario (constante
 * verificada en las actas reales del CONSULADO 88 · PAÍS 335 Egipto · KIT
 * 399 y en las 6 fotos del dueño) — NO es el código de barras (ese vive en
 * su campo propio) y el pipeline no lo lee: se muestra tal cual va impreso. */
const CODIGO_FORMA_ENTRE_XX = "7 - 23 - 10 - 19";

/** Etiqueta del formulario (misma convención del adaptador D27 —
 * store-e14.ts): TRANSMISION → «TRANSMISIÓN», DELEGADOS → «CÓNSUL/
 * EMBAJADOR». Sin clasificación → el tipo crudo del acta o «—». */
function etiquetaFormularioDe(acta: Acta): string {
  const t = acta.clasificacion?.tipo ?? acta.tipo;
  if (t === "TRANSMISION") return "TRANSMISIÓN";
  if (t === "DELEGADOS") return "CÓNSUL/EMBAJADOR";
  return t || "—";
}

/** Etiqueta ORIGEN del panel (tipo de copia del acta). */
function origenDe(acta: Acta): string {
  const t = acta.clasificacion?.tipo ?? acta.tipo;
  if (t === "TRANSMISION") return "Transmisión";
  if (t === "DELEGADOS") return "Delegados";
  return t || "—";
}

export function ModalRevisor({
  acta,
  publicacion,
  onVerEnMonitor,
  onCerrar,
  posNavegacion,
  onNavegar,
  cargarOriginal,
}: {
  acta: Acta | null;
  publicacion?: PublicacionActa;
  onVerEnMonitor?: PropsMasivaView["onVerEnMonitor"];
  onCerrar: () => void;
  /** Posición 1-based del acta abierta entre las imágenes LISTAS del lote
   * (null = fuera de la lista — chevrons sin destino). */
  posNavegacion?: { index: number; total: number } | null;
  /** Navegación entre imágenes procesadas (orquestador: sincroniza el acta
   * abierta y carga la vecina — misma puerta que ABRIR de la bandeja). */
  onNavegar?: (direccion: -1 | 1) => void;
  /** MOSTRAR ORIGINAL — materializa el archivo ORIGINAL del registro
   * (orquestador: FileReader del File en IDB). null si no hay archivo. */
  cargarOriginal?: (id: string) => Promise<string | null>;
}) {
  // ── Visor (estado del redesign — todo local, cero acople con el store) ──
  const [verOriginal, setVerOriginal] = useState(false);
  const [rotacionVisual, setRotacionVisual] = useState(0);
  const [contraste, setContraste] = useState<ContrasteModo>("NORMAL");
  const [expandido, setExpandido] = useState(false);
  const [escala, setEscala] = useState<number | null>(null);
  // MOSTRAR ORIGINAL: la foto cruda puede vivir en el acta (fotoOriginal),
  // en el archivo del registro (materialización on-demand) o no existir
  // (registros sin archivo — degradación honesta del toggle).
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cargandoOriginal, setCargandoOriginal] = useState(false);
  const [sinOriginal, setSinOriginal] = useState(false);
  // Espejo del expandido para el listener de Escape (lectura sin re-suscribir).
  const expandidoRef = useRef(false);
  useEffect(() => {
    expandidoRef.current = expandido;
  }, [expandido]);
  // Reporte de escala estable (VisorZoom llama onZoomChange en cada gesto).
  const onZoomChange = useCallback((e: number) => setEscala(e), []);

  // Escape: pantalla completa sale primero; fuera de ella cierra el modal.
  useEffect(() => {
    if (!acta) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (expandidoRef.current) {
        setExpandido(false);
        return;
      }
      onCerrar();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [acta, onCerrar]);

  // ── Editor (estado local del modal — el acta vive en useE14Store) ──────
  const foto = acta?.fotoProcesada ?? acta?.fotoOriginal ?? null;
  const editable = Boolean(acta && !acta.enviadoAutomaticamente && foto);
  const [editandoRecorte, setEditandoRecorte] = useState(false);
  const [rect, setRect] = useState<RectPct | null>(null);
  const [ocupado, setOcupado] = useState<null | "rotando" | "recortando">(null);
  const [editada, setEditada] = useState(false);
  const fotoPreEdicionRef = useRef<string | null>(null);
  const visorRef = useRef<VisorZoomHandle>(null);
  const zonaRecorteRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ x: number; y: number } | null>(null);

  // ── Rechazo del supervisor (motivo obligatorio + armado a 2 toques) ────
  const [observaciones, setObservaciones] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const [rechazoArmado, setRechazoArmado] = useState(false);
  const [rechazoHecho, setRechazoHecho] = useState(false);
  const timerRechazoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset del visor/editor/rechazo al cambiar de acta abierta (navegación
  // incluida) — y del timer de avance pendiente.
  useEffect(() => {
    setEditandoRecorte(false);
    setRect(null);
    setOcupado(null);
    setEditada(false);
    fotoPreEdicionRef.current = null;
    setVerOriginal(false);
    setOriginalUrl(null);
    setCargandoOriginal(false);
    setSinOriginal(false);
    setRotacionVisual(0);
    setContraste("NORMAL");
    setRechazoArmado(false);
    setRechazoHecho(false);
    setErrorMotivo(false);
    setObservaciones("");
    if (timerRechazoRef.current) {
      clearTimeout(timerRechazoRef.current);
      timerRechazoRef.current = null;
    }
  }, [acta?.id]);

  useEffect(
    () => () => {
      if (timerRechazoRef.current) clearTimeout(timerRechazoRef.current);
    },
    [],
  );

  /** ROTAR: actas sin envío automático → HORNEA 90° (persiste en el acta);
   *  enviadas auto → rotación VISUAL del visor (ayuda de lectura). */
  const rotarFoto = async () => {
    if (!acta || !foto || ocupado) return;
    if (!editable) {
      setRotacionVisual((r) => (r + 90) % 360);
      return;
    }
    if (!fotoPreEdicionRef.current) fotoPreEdicionRef.current = foto;
    setEditandoRecorte(false);
    setRect(null);
    setOcupado("rotando");
    try {
      const r = await rotateProcessedDataUrl(foto, 90);
      useE14Store.getState().editarActaActual({ fotoProcesada: r.url });
      setEditada(true);
    } catch {
      /* horneado fallido — la foto queda como está (honesto, sin humo) */
    } finally {
      setOcupado(null);
    }
  };

  /** APLICAR recorte — mapea el rect % → píxeles naturales y hornea. */
  const aplicarRecorte = async () => {
    if (!acta || !foto || !rect || ocupado) return;
    const img = zonaRecorteRef.current?.querySelector("img");
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    if (rect.w < RECT_MIN_PCT || rect.h < RECT_MIN_PCT) return;
    const natRect = {
      x: (rect.x / 100) * img.naturalWidth,
      y: (rect.y / 100) * img.naturalHeight,
      w: (rect.w / 100) * img.naturalWidth,
      h: (rect.h / 100) * img.naturalHeight,
    };
    if (!fotoPreEdicionRef.current) fotoPreEdicionRef.current = foto;
    setOcupado("recortando");
    try {
      const r = await recortarDataUrl(foto, natRect);
      useE14Store.getState().editarActaActual({ fotoProcesada: r.url });
      setEditada(true);
      setEditandoRecorte(false);
      setRect(null);
    } catch {
      /* horneado fallido — la foto queda como está (honesto, sin humo) */
    } finally {
      setOcupado(null);
    }
  };

  /** DESHACER — devuelve la foto del momento ANTES de la primera edición. */
  const deshacerEdicion = () => {
    const original = fotoPreEdicionRef.current;
    if (!original || ocupado) return;
    useE14Store.getState().editarActaActual({ fotoProcesada: original });
    setEditada(false);
    fotoPreEdicionRef.current = null;
    setEditandoRecorte(false);
    setRect(null);
  };

  /** MOSTRAR ORIGINAL — alterna procesada ↔ cruda. La cruda viene del acta
   *  (fotoOriginal) o se materializa del archivo del registro on-demand. */
  const alternarOriginal = async () => {
    if (cargandoOriginal || !acta) return;
    if (verOriginal) {
      setVerOriginal(false);
      return;
    }
    if (acta.fotoOriginal || originalUrl) {
      setVerOriginal(true);
      return;
    }
    if (!cargarOriginal) {
      setSinOriginal(true);
      return;
    }
    setCargandoOriginal(true);
    const url = await cargarOriginal(acta.id);
    setCargandoOriginal(false);
    if (url) {
      setOriginalUrl(url);
      setVerOriginal(true);
    } else {
      setSinOriginal(true); // sin archivo en el registro — el botón se oculta
    }
  };

  // ── Dibujo del rectángulo de recorte (puntero = mouse o dedo) ──────────
  const pctDePuntero = (
    e: React.PointerEvent,
  ): { x: number; y: number } | null => {
    const zona = zonaRecorteRef.current;
    if (!zona) return null;
    const r = zona.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const onRecorteDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (ocupado) return;
    const p = pctDePuntero(e);
    if (!p) return;
    // Captura fail-safe (pointerIds sintéticos/automation pueden fallar —
    // el gesto de recorte jamás se aborta por eso).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura el arrastre sigue dentro del overlay — suficiente */
    }
    arrastreRef.current = p;
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onRecorteMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const inicio = arrastreRef.current;
    if (!inicio) return;
    const p = pctDePuntero(e);
    if (!p) return;
    setRect({
      x: Math.min(inicio.x, p.x),
      y: Math.min(inicio.y, p.y),
      w: Math.abs(p.x - inicio.x),
      h: Math.abs(p.y - inicio.y),
    });
  };
  const onRecorteUp = () => {
    arrastreRef.current = null;
  };

  // ── RECHAZAR (REESCANEAR): motivo obligatorio + armado a 2 toques ──────
  const rechazarActa = () => {
    if (!acta || acta.status === "RECHAZADA") return;
    const motivo = observaciones.trim();
    if (!motivo) {
      setErrorMotivo(true);
      setRechazoArmado(false);
      return;
    }
    setErrorMotivo(false);
    if (!rechazoArmado) {
      setRechazoArmado(true);
      return;
    }
    setRechazoArmado(false);
    const rechazo = { tipo: "SUPERVISOR", detalle: motivo } as const;
    // Parche del acta ABIERTA (la persistencia la hace sincronizarAlVolver
    // al cerrar/navegar — misma plomería del editor, intacta).
    useE14Store.getState().editarActaActual({
      status: "RECHAZADA",
      rechazo,
    });
    // Balde de motivos (misma maquinaria del adaptador — clave
    // «rechazo:supervisor» con el Set anti-dup de siempre).
    useE14Store
      .getState()
      .contarMotivoNoEnvioActa({ ...acta, status: "RECHAZADA", rechazo });
    // Flash de confirmación → avance al siguiente acta del lote.
    setRechazoHecho(true);
    if (timerRechazoRef.current) clearTimeout(timerRechazoRef.current);
    timerRechazoRef.current = setTimeout(() => {
      timerRechazoRef.current = null;
      setRechazoHecho(false);
      onNavegar?.(1);
    }, 1200);
  };

  if (!acta) return null;
  const join = joinDeActa(acta);
  const pildora = pildoraEstadoActa(acta);
  const ubic = acta.ubicacion;
  const rectValido = Boolean(
    rect && rect.w >= RECT_MIN_PCT && rect.h >= RECT_MIN_PCT,
  );

  // Foto visible (MOSTRAR ORIGINAL alterna a la cruda si existe).
  const fotoVisible = verOriginal
    ? (acta.fotoOriginal ?? originalUrl ?? foto)
    : foto;
  const hayOriginal =
    Boolean(acta.fotoProcesada) &&
    (Boolean(acta.fotoOriginal) ||
      Boolean(originalUrl) ||
      (!sinOriginal && Boolean(cargarOriginal)));

  // ── Datos reconocidos (clasificación DIVIPOL + acta — jamás inventar) ──
  const c = acta.clasificacion;
  const pais =
    c?.municipio != null
      ? `${c.municipio.nombre} (${c.municipio.codigo})`
      : (ubic?.municipio ?? "—");
  const zonaTxt = c?.zona ? `Zona ${c.zona.codigo}` : (ubic?.zona ?? "—");
  const puesto =
    c?.puesto != null
      ? `${c.puesto.codigo} - ${c.puesto.nombre}`
      : (ubic?.puesto ?? "—");
  const mesa =
    c?.mesa != null
      ? `Mesa ${String(c.mesa).padStart(3, "0")}`
      : (ubic?.mesa ?? "—");
  const pagina = acta.pagina ?? c?.pagina ?? null;
  const kit =
    c?.kit != null
      ? String(c.kit)
      : c?.codigoUnico?.kit != null
        ? String(c.codigoUnico.kit)
        : "—";
  const lugar = c?.puesto?.nombre ?? "";
  const etiquetaForm = etiquetaFormularioDe(acta);
  const enviadaAuto = Boolean(acta.enviadoAutomaticamente);
  const rechazadaYa = acta.status === "RECHAZADA";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Revisión de acta ${acta.titulo}`}
      // Móvil navegable (feedback del dueño): el modal COMPLETO hace scroll
      // (el panel del auditor queda alcanzable); en lg vuelve el layout de
      // 2 columnas con scroll interno del panel.
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-y-auto overscroll-contain bg-[#070b0a] lg:flex-row lg:overflow-hidden"
    >
      {/* ════════════════ CANVAS — VISOR DEL DOCUMENTO ════════════════ */}
      {/* Canvas: 52vh en móvil — AJUSTAR (expandido) lo lleva a PANTALLA
          COMPLETA REAL (h-dvh, feedback del dueño) con el panel oculto. */}
      <main
        className={`grid-paper-bg relative flex shrink-0 flex-col overflow-hidden bg-[#060a09] ${
          expandido ? "h-dvh" : "h-[52vh]"
        } lg:h-auto lg:min-w-0 lg:flex-1`}
      >
        {/* ── Toolbar flotante de inspección ── */}
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-md border border-[#21362e] bg-[#0d1613]/90 px-3 py-1.5 font-mono text-xs text-gray-300 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => visorRef.current?.alejar()}
            disabled={editandoRecorte}
            title="Reducir zoom"
            aria-label="Reducir zoom"
            className="p-1 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[40px] text-center font-bold tabular-nums text-gray-200">
            {escala != null ? `${Math.round(escala * 100)}%` : "—"}
          </span>
          <button
            type="button"
            onClick={() => visorRef.current?.acercar()}
            disabled={editandoRecorte}
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            className="p-1 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="h-3 w-px bg-[#21362e]" />
          {/* AJUSTAR = PANTALLA COMPLETA del acta (pedido del dueño). */}
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            disabled={editandoRecorte}
            title={expandido ? "Salir de pantalla completa" : "Ajustar — pantalla completa"}
            aria-label={expandido ? "Salir de pantalla completa" : "Ver el acta en pantalla completa"}
            className="p-1 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            {expandido ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
          {/* ROTAR: hornea (sin envío auto) o gira visual (enviadas auto). */}
          <button
            type="button"
            onClick={() => void rotarFoto()}
            disabled={!!ocupado || editandoRecorte || !fotoVisible}
            title={
              editable
                ? "Rotar 90° horario (hornea la foto)"
                : "Rotar la vista 90° horario"
            }
            aria-label="Rotar la foto 90 grados"
            className="p-1 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            {ocupado === "rotando" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
          </button>
          {/* RECORTAR + DESHACER — SOLO actas sin envío automático. */}
          {editable && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRect(null);
                  setEditandoRecorte(true);
                }}
                disabled={!!ocupado || editandoRecorte}
                title="Recortar un área de la foto"
                aria-label="Recortar la foto"
                className={`p-1 transition-colors hover:text-emerald-400 disabled:opacity-40 ${
                  editandoRecorte ? "text-emerald-400" : ""
                }`}
              >
                {ocupado === "recortando" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crop className="h-4 w-4" />
                )}
              </button>
              {editada && (
                <button
                  type="button"
                  onClick={deshacerEdicion}
                  disabled={!!ocupado}
                  title="Devolver la foto a como estaba antes de editar"
                  aria-label="Deshacer las ediciones de la foto"
                  className="p-1 text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          {/* CONTRASTE: NORMAL → ALTO → NEGATIVO (ciclo del dashboard). */}
          <button
            type="button"
            onClick={() =>
              setContraste((m) =>
                m === "NORMAL" ? "ALTO" : m === "ALTO" ? "NEGATIVO" : "NORMAL",
              )
            }
            disabled={editandoRecorte || !fotoVisible}
            title={`Contraste: ${contraste === "NORMAL" ? "alto contraste B/N" : contraste === "ALTO" ? "negativo" : "normal"}`}
            aria-label={`Modo de contraste: ${contraste}`}
            className={`p-1 transition-colors hover:text-emerald-300 disabled:opacity-40 ${
              contraste !== "NORMAL" ? "text-emerald-400" : ""
            }`}
          >
            <Contrast className="h-4 w-4" />
          </button>
          <span className="h-3 w-px bg-[#21362e]" />
          {/* SCORE — dato real del pipeline (misma escala /10 de siempre). */}
          <span
            className="flex items-center gap-1.5 rounded border border-emerald-400 bg-emerald-500/25 px-2 py-0.5 text-[11px] font-bold tracking-wider text-emerald-400"
            title="Score de calidad del acta"
          >
            <CircleCheck className="h-3 w-3" />
            SCORE: {scoreTexto(acta.score)}/10
          </span>
          {editada && (
            <span className="rounded border border-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
              EDITADA
            </span>
          )}
        </div>

        {/* ── Cerrar (✕ flotante) + EDITADA ── */}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar revisión del acta"
          className="absolute right-3 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-[#21362e] bg-[#0d1613]/90 font-mono text-sm text-gray-400 shadow-2xl backdrop-blur transition hover:bg-[#12201c] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Chevrons de navegación entre imágenes procesadas ── */}
        {onNavegar && !editandoRecorte && (
          <>
            <button
              type="button"
              onClick={() => onNavegar(-1)}
              disabled={!posNavegacion || posNavegacion.index <= 1}
              title="Imagen anterior del lote"
              aria-label="Imagen anterior del lote"
              className="absolute left-4 top-1/2 z-10 flex h-16 w-11 -translate-y-1/2 items-center justify-center rounded border border-[#21362e] bg-[#0d1613]/80 text-gray-400 shadow-lg transition-colors hover:bg-[#12201c] hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => onNavegar(1)}
              disabled={
                !posNavegacion || posNavegacion.index >= posNavegacion.total
              }
              title="Imagen siguiente del lote"
              aria-label="Imagen siguiente del lote"
              className="absolute right-4 top-1/2 z-10 flex h-16 w-11 -translate-y-1/2 items-center justify-center rounded border border-[#21362e] bg-[#0d1613]/80 text-gray-400 shadow-lg transition-colors hover:bg-[#12201c] hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </>
        )}

        {/* ── Documento (visor con gestos / modo recorte / sin foto) ── */}
        <div className="flex min-h-0 w-full flex-1 items-start justify-center px-14 pb-24 pt-16">
          {fotoVisible ? (
            editandoRecorte ? (
              /* MODO RECORTAR — foto estática (sin zoom): el arrastre dibuja
                 el área; el mapeo % → píxeles naturales queda 1:1. */
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <div
                  ref={zonaRecorteRef}
                  className="relative max-h-full max-w-full overflow-hidden rounded border-2 border-dashed border-emerald-500/70 bg-white"
                >
                  <img
                    src={fotoVisible}
                    alt={`Foto del acta ${acta.titulo} — marcando área de recorte`}
                    className="block max-h-[42vh] max-w-full select-none lg:max-h-[56vh]"
                    draggable={false}
                  />
                  <div
                    className="absolute inset-0 cursor-crosshair touch-none"
                    onPointerDown={onRecorteDown}
                    onPointerMove={onRecorteMove}
                    onPointerUp={onRecorteUp}
                    onPointerCancel={onRecorteUp}
                    aria-hidden
                  />
                  {rect && rect.w > 0.5 && rect.h > 0.5 && (
                    <div
                      className="pointer-events-none absolute border-2 border-dashed border-emerald-400"
                      style={{
                        left: `${rect.x}%`,
                        top: `${rect.y}%`,
                        width: `${rect.w}%`,
                        height: `${rect.h}%`,
                        boxShadow: "0 0 0 9999px rgba(5, 10, 15, 0.62)",
                      }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                    {rectValido
                      ? "ÁREA MARCADA — APLICAR PARA RECORTAR"
                      : "ARRASTRA SOBRE LA FOTO PARA MARCAR EL ÁREA"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoRecorte(false);
                      setRect(null);
                    }}
                    disabled={!!ocupado}
                    className="min-h-[44px] rounded border border-[#21362e] bg-[#0d1613] px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-[#2a4037] hover:text-white disabled:opacity-40"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    onClick={() => void aplicarRecorte()}
                    disabled={!rectValido || !!ocupado}
                    className="min-h-[44px] rounded bg-emerald-500 px-3.5 font-mono text-[10px] font-black uppercase tracking-wider text-[#04120c] shadow-md shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
                  >
                    {ocupado === "recortando" ? "RECORTANDO…" : "APLICAR"}
                  </button>
                </div>
              </div>
            ) : (
              /* VISOR — KIT visor-gestos-v1: zoom con la RUEDA del mouse
                 (ancla en el cursor), PELLIZCO con 2 dedos, arrastre para
                 mover y doble clic/toque (ajustar ↔ acercar). fitKey = la
                 foto visible: al alternar original/procesada re-ajusta. */
              <VisorZoom
                ref={visorRef}
                fitKey={`${acta.id}::${verOriginal ? "original" : "procesada"}::${fotoVisible.length}`}
                rotacion={rotacionVisual}
                filtro={FILTRO_CONTRASTE[contraste]}
                onZoomChange={onZoomChange}
                ariaLabel="Foto del acta — zoom con la rueda del mouse o pellizco con los dedos"
                className="h-full w-full"
              >
                <img
                  src={fotoVisible}
                  alt={`Foto ${verOriginal ? "original" : "procesada"} del acta ${acta.titulo}`}
                  draggable={false}
                  onLoad={() => visorRef.current?.ajustar()}
                  className="block max-h-[40vh] max-w-[68vw] select-none border border-white/25 bg-white shadow-[0_0_40px_rgba(0,0,0,0.8)] lg:max-h-[64vh] lg:max-w-[38vw]"
                />
              </VisorZoom>
            )
          ) : (
            <p className="rounded-lg border border-[#16231e] bg-[#080d0b] px-4 py-5 text-center font-mono text-[11px] uppercase tracking-wider text-gray-400">
              SIN FOTO PROCESADA EN MEMORIA
            </p>
          )}
        </div>

        {/* ── MOSTRAR ORIGINAL (toggle foto cruda ↔ procesada) ── */}
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 lg:bottom-16">
          {hayOriginal && (
            <button
              type="button"
              onClick={() => void alternarOriginal()}
              disabled={cargandoOriginal}
              className="pointer-events-auto flex items-center gap-1.5 rounded border border-[#21362e] bg-[#0d1613]/90 px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wider text-gray-200 shadow-lg backdrop-blur transition-colors hover:bg-[#12201c] hover:text-white disabled:opacity-60"
            >
              {cargandoOriginal ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
              ) : verOriginal ? (
                <EyeOff className="h-3.5 w-3.5 text-gray-400" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-gray-400" />
              )}
              {cargandoOriginal
                ? "CARGANDO ORIGINAL…"
                : verOriginal
                  ? "MOSTRAR PROCESADA"
                  : "MOSTRAR ORIGINAL"}
            </button>
          )}
        </div>

        {/* ── Franja de metadata (footer del canvas) ── */}
        <footer className="absolute bottom-3 left-1/2 z-20 flex w-[94%] max-w-4xl -translate-x-1/2 items-center justify-center gap-2 rounded border border-[#21362e] bg-[#0b1310]/95 px-4 py-2 text-center font-mono shadow-2xl backdrop-blur">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full border border-emerald-400 bg-emerald-500/30"
            aria-hidden
          />
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-medium tracking-wide text-gray-300">
            {posNavegacion && (
              <>
                <span className="font-bold text-emerald-400">
                  IMG {posNavegacion.index}/{posNavegacion.total}
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{etiquetaForm}</span>
            <span aria-hidden>·</span>
            <span className="font-bold">
              PÁG {pagina ? `${pagina.index}/${pagina.total}` : "-/-"}
            </span>
            <span className="text-gray-600" aria-hidden>
              |
            </span>
            <span className="font-normal text-gray-400">
              PAÍS {c?.municipio ? `${c.municipio.codigo} - ${c.municipio.nombre}` : (ubic?.municipio ?? "—")}
            </span>
            <span className="font-normal text-gray-400">
              MESA {c?.mesa != null ? String(c.mesa).padStart(3, "0") : (ubic?.mesa ?? "—")}
            </span>
            {lugar && (
              <>
                <span aria-hidden>·</span>
                <span className="font-normal text-gray-400 uppercase">{lugar}</span>
              </>
            )}
          </p>
        </footer>
      </main>

      {/* ════════════════ PANEL DEL AUDITOR (SIDEBAR) ════════════════ */}
      <aside
        className={`w-full shrink-0 overflow-y-auto border-t border-[#16231e] bg-[#0c1210] p-5 lg:w-[380px] lg:border-l lg:border-t-0 ${
          expandido ? "hidden" : "flex flex-col gap-6"
        }`}
      >
        {/* ── ENVÍO AUTOMÁTICO + datos reconocidos ── */}
        <div className="overflow-hidden rounded border border-[#16231e] bg-[#080d0b]">
          <div className="flex items-center justify-between gap-2 border-b border-[#16231e]/60 bg-[#0d1613]/90 px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {enviadaAuto ? (
                <>
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2.5} />
                  <span className="truncate font-mono text-xs font-bold uppercase tracking-wider text-gray-200">
                    ENVÍO AUTOMÁTICO
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate font-mono text-xs font-bold uppercase tracking-wider text-gray-200">
                    SIN ENVÍO AUTOMÁTICO
                  </span>
                </>
              )}
            </div>
            {/* VER EN MONITOR (feedback del dueño): en la CABECERA del panel,
                outline verde + icono monitor — solo con la publicación D27
                aterrizada (misma condición de siempre). */}
            {publicacion?.estado === "publicada" && join && onVerEnMonitor && (
              <button
                type="button"
                onClick={() =>
                  onVerEnMonitor(join.idEnlace, join.mesa, join.tipo)
                }
                title="Abrir esta acta publicada en el monitor global"
                className="flex shrink-0 items-center gap-1.5 rounded border border-emerald-500 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-500/20 active:scale-[0.98]"
              >
                <Monitor className="h-3.5 w-3.5" />
                VER EN MONITOR
              </button>
            )}
          </div>
          {/* Estado del acta (píldora real) + sello del envío automático —
              fila fina bajo la cabecera para que la cabecera quede EXACTA
              como el diseño (✓ ENVÍO AUTOMÁTICO + VER EN MONITOR). */}
          <div className="flex items-center justify-between gap-2 border-b border-[#16231e]/40 px-3.5 py-2">
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${pildora.clases}`}
            >
              {pildora.label}
            </span>
            {enviadaAuto && (
              <span className="truncate font-mono text-[9px] uppercase tracking-wider text-emerald-400/90">
                ENVIADA AUTO · {acta.enviadoAutomaticamente}
              </span>
            )}
          </div>
          <div className="space-y-3 p-3.5 font-mono text-xs">
            {/* VERIFICACIÓN DE IDENTIFICADOR / CÓDIGO — el código IMPRESO
                ENTRE LAS X del acta física (feedback del dueño; NO el
                código de barras, que va en su campo propio). */}
            <div>
              <span className="mb-1 block text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Verificación de Identificador / Código
              </span>
              <div
                title="Código impreso del formulario E-14, entre las X del papel (el código de barras va en su campo propio)"
                className="rounded border border-[#16231e] bg-[#060a09] px-2 py-1.5 text-center"
              >
                <span className="text-sm font-bold tracking-widest text-emerald-400">
                  {`X  ${CODIGO_FORMA_ENTRE_XX}  X`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DatoPanel etiqueta="País" valor={pais} />
              <DatoPanel etiqueta="Zona" valor={zonaTxt} />
              <DatoPanel etiqueta="Puesto" valor={puesto} />
              <DatoPanel etiqueta="Mesa" valor={mesa} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[#16231e]/40 pt-2">
              <DatoPanel etiqueta="Origen" valor={origenDe(acta)} />
              <DatoPanel
                etiqueta="Página"
                valor={pagina ? `${pagina.index} DE ${pagina.total}` : "- DE -"}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[#16231e]/40 pt-2">
              <DatoPanel etiqueta="Kit" valor={kit} />
              <DatoPanel
                etiqueta="Código de Barras"
                valor={acta.codigoBarras || "—"}
              />
            </div>
          </div>
        </div>

        {/* ── Publicación en el monitor (D27 — lógica intacta, recolocada:
            feedback compacto bajo la tarjeta de datos; al fondo del panel
            queda SOLO CERRAR, pedido del dueño). ── */}
        <PublicacionChip publicacion={publicacion} />

        {/* ── Banner de rechazo (estado del acta) ── */}
        {acta.rechazo && (
          <p className="rounded border border-red-900/60 bg-[#1b0d0e] px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-wider text-red-400">
            {acta.rechazo.tipo} — {acta.rechazo.detalle}
          </p>
        )}

        <div className="mt-auto space-y-6 border-t border-[#16231e] pt-4">
          {/* ── OBSERVACIONES (motivo de la decisión — obligatorio) ── */}
          <div>
            <label
              htmlFor="masiva-observaciones-input"
              className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-gray-400"
            >
              OBSERVACIONES
            </label>
            <textarea
              id="masiva-observaciones-input"
              value={observaciones}
              onChange={(e) => {
                setObservaciones(e.target.value);
                if (errorMotivo) setErrorMotivo(false);
                if (rechazoArmado) setRechazoArmado(false);
              }}
              placeholder="Ingrese el motivo de la decisión..."
              rows={4}
              aria-invalid={errorMotivo || undefined}
              aria-describedby={
                errorMotivo ? "masiva-observaciones-error" : undefined
              }
              className={`w-full resize-none rounded border bg-[#080d0b] p-3 text-xs text-gray-200 placeholder-gray-600 transition-colors focus:outline-none focus:ring-1 ${
                errorMotivo
                  ? "border-red-500/70 focus:border-red-500 focus:ring-red-500"
                  : "border-[#16231e] focus:border-emerald-500 focus:ring-emerald-500"
              }`}
            />
            {errorMotivo && (
              <p
                id="masiva-observaciones-error"
                role="alert"
                className="mt-1 font-mono text-[10px] uppercase tracking-wider text-red-400"
              >
                Ingrese el motivo de la decisión
              </p>
            )}
          </div>

          {/* ── ACCIONES DEL SUPERVISOR ── */}
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>ACCIONES DEL SUPERVISOR</span>
            </div>
            {rechazoHecho ? (
              <p
                role="status"
                className="flex w-full items-center justify-center gap-2 rounded border border-red-900/60 bg-[#1b0d0e] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-red-400"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                RECHAZADA — REGISTRADA
              </p>
            ) : (
              <button
                type="button"
                onClick={rechazarActa}
                disabled={rechazadaYa}
                title={
                  rechazadaYa
                    ? "Esta acta ya está rechazada"
                    : "Rechazar el acta y solicitar reescaneo (motivo obligatorio)"
                }
                className={`flex w-full items-center justify-center gap-2 rounded border px-4 py-2.5 font-bold text-xs uppercase tracking-wider transition-colors ${
                  rechazoArmado
                    ? "animate-pulse border-red-500 bg-red-500/25 text-red-300"
                    : "border-red-900/60 bg-[#1b0d0e] text-red-400 hover:bg-[#281315] hover:text-red-300"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                {rechazadaYa
                  ? "RECHAZADA"
                  : rechazoArmado
                    ? "¿CONFIRMAR RECHAZO?"
                    : "RECHAZAR (REESCANEAR)"}
              </button>
            )}
          </div>

          {/* ── Nota de auditoría ── */}
          <div className="flex items-start gap-2 border-t border-[#16231e]/40 pt-2">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
              ESTA ACCIÓN QUEDARÁ REGISTRADA EN LA AUDITORÍA.
            </span>
          </div>

          {/* ── Cerrar (visible siempre — el redesign no tiene scrim-clic;
              al fondo del panel queda SOLO este botón, pedido del dueño) ── */}
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[44px] w-full rounded border border-[#16231e] bg-[#080d0b] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-[#2a4037] hover:text-white"
          >
            CERRAR
          </button>
        </div>
      </aside>
    </div>
  );
}

/** Celda de dato del panel del auditor (etiqueta caps + caja mono). */
function DatoPanel({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {etiqueta}
      </span>
      <div
        className="truncate rounded border border-[#16231e] bg-[#060a09] px-2 py-1.5 font-mono text-xs text-gray-200"
        title={valor}
      >
        {valor}
      </div>
    </div>
  );
}
