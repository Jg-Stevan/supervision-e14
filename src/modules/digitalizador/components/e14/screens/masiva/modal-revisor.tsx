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
// · Feedback del dueño (ronda 2): VER EN MONITOR es FIJO — no desaparece
//   tras darle click (la condición sale del JOIN del acta misma, no del
//   registro en memoria de la publicación; solo se oculta con cuarentena
//   D25, donde el acta NO está en el monitor). Código de barras se muestra
//   SIN los asteriscos Code 39 (el diseño lo trae limpio). Tarjeta de
//   datos NUNCA se comprime (shrink-0) y su contenido lleva DESPLAZADOR
//   interno (max-h + overflow) para ventanas medianas/pequeñas — la info
//   del acta siempre alcanzable; el resto del panel se compacta (gap-4).
// · KIT VISOR-MASIVA-v1 (2026-11-02 — verificación fina, T1–T6): toolbar =
//   `zoom │ ↻ · ◐ · ⛶ │ SCORE` (fuera ✂/↩ — decisión 1: TODA la edición
//   entra por ✎ EDITAR); contraste BICICLO NORMAL↔NEGATIVO (N1 — el nivel
//   «ALTO» sale de la UI de masiva); franja de metadata full-width con
//   punto lleno + país en MAYÚSCULAS, sin «IMG i/N» (decisiones 3/4) y
//   código entre las X espaciado (solo tipografía — dato real); el MODO
//   RECORTAR evoluciona a EDITOR de recorte/perspectiva con 8 puntos +
//   DETECCIÓN AUTOMÁTICA (solo propone) + ROTAR + DESHACER dentro del
//   editor (N2/D8 — el horneado y el chip EDITADA se conservan tal cual);
//   motivo OBLIGATORIO también al ACEPTAR (decisión 6 — única excepción
//   ordenada a «cero lógica»: validación de formulario, store/ledger
//   intactos).
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Contrast,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Maximize,
  Minimize,
  Monitor,
  RotateCw,
  Scan,
  ShieldCheck,
  SquarePen,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  barcodeRealDeActa,
  codigoFormaDeActa,
  joinDeActa,
  useE14Store,
  type PublicacionActa,
} from "@/modules/digitalizador/store/store-e14";
import type { Acta } from "@/modules/digitalizador/lib/e14/types";
// KIT aceptar-revision-masiva-v1 (diseño 3 — INGRESO MANUAL DE DATOS): las
// opciones de los selects salen de la base DIVIPOL REAL del repo (§8 —
// PROHIBIDO inventar jerarquía: si la base falla, los selects degradan a
// display honesto). public/e14/divipol.json — mismo catálogo del
// clasificador.
import {
  cargarDivipol,
  mesasDePuesto,
  municipiosDe,
  puestosDe,
  zonasDe,
  type DivipolBase,
} from "@jg-stevan/scanner-core/dominio/divipol";
// KIT editor-masiva-v1: horneado de ROTAR por canvas (misma disciplina de
// siempre — canvas puro, dataURL out). El recorte RECTANGULAR
// (`recortarDataUrl`) lo sustituye el editor de perspectiva (T4).
import { rotateProcessedDataUrl } from "@/modules/digitalizador/lib/e14/image-utils";
// KIT VISOR-MASIVA-v1 (T4): editor de recorte/perspectiva — helper LOCAL
// de esta carpeta (warp por homografía + detección de bordes; el motor
// lib/e14 NO se toca — solo se consumen sus decodes LRU).
import {
  clampPct,
  detectarBordesDocumento,
  hornearRecorteCuadrilatero,
  QUAD_POR_DEFECTO,
  type PuntoPct,
  type QuadPct,
} from "./editor-recorte";
// KIT visor-gestos-v1 (compartido con el visor del dashboard): zoom con
// rueda del mouse / pellizco táctil / arrastre — primitivo puro de UI.
import {
  VisorZoom,
  type VisorZoomHandle,
} from "@/modules/supervision/components/actas/visor-zoom";
import { pildoraEstadoActa } from "./helpers";
import { PublicacionChip } from "./publicacion-chip";
// KIT paginas-acta-e14-v1 (feedback del dueño): el total de PÁGINA es el
// del ACTA (formulario de 2 hojas) — jamás del lote ni del OCR dudoso.
import { PAGINAS_POR_ACTA_E14 } from "@/modules/digitalizador/lib/e14/masiva/tipos";
import type { PropsMasivaView } from "./orquestador";

/** Mínimo % en CADA eje (del bbox del quad) para habilitar APLICAR —
 * evita recortes absurdos (mismo guard del editor anterior). */
const RECT_MIN_PCT = 3;

/** Modos de contraste del visor de masiva — KIT VISOR-MASIVA-v1 (N1,
 * dueño): BICICLO NORMAL↔NEGATIVO (el nivel «ALTO» sale de la UI de
 * masiva; el trío del visor del monitor es OTRO componente y no se toca). */
type ContrasteModo = "NORMAL" | "NEGATIVO";

const FILTRO_CONTRASTE: Record<ContrasteModo, string | undefined> = {
  NORMAL: undefined,
  NEGATIVO: "invert(1)",
};

/** Score honesto: entero sin decimales (10/10), el resto a 1 decimal. */
function scoreTexto(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** «Verificación de Identificador / Código» (feedback del dueño): el código
 * IMPRESO del formulario E-14 exterior — el que aparece ENTRE LAS X en el
 * acta física («X 7-23-10-19 X», justo bajo el encabezado CONSULADO/PAÍS/
 * ZONA/PUESTO/MESA/LUGAR). Es el código de plancha del formulario — NO es
 * el código de barras (ese vive en su campo propio).
 *
 * V2-01/V3-04 (auditoría diseños): la constante global
 * CODIGO_FORMA_ENTRE_XX (mismo valor para TODAS las actas) se ELIMINÓ —
 * ahora se lee del manifiesto de actas reales vía `codigoFormaDeActa()`
 * (patrón barcodeRealDeActa); sin dato → «—» (honestidad de datos). */

/** Etiqueta del formulario en la franja de metadata (feedback del dueño):
 * SOLO el tipo de copia RECONOCIDO por la OCR — TRANSMISION → «TRANSMISIÓN»,
 * DELEGADOS → «CÓNSUL/EMBAJADOR». Sin reconocimiento → «—» (dueño: «debería
 * aparecer Cónsul/embajador o transmisión; si no se llega a reconocer se
 * pone —»). El acta.tipo crudo es el TÍTULO del formulario mock («SENADO
 * DE LA REPÚBLICA»): NO es un tipo de copia — NUNCA se muestra (fuga del
 * mock reportada por el dueño). */
function etiquetaFormularioDe(acta: Acta): string {
  const t = acta.clasificacion?.tipo;
  if (t === "TRANSMISION") return "TRANSMISIÓN";
  if (t === "DELEGADOS") return "CÓNSUL/EMBAJADOR";
  return "—";
}

/** Etiqueta ORIGEN del panel (tipo de copia del acta) — misma regla del
 *  dueño: solo lo reconocido, sin reconocimiento → «—» (jamás el título
 *  crudo del mock). */
function origenDe(acta: Acta): string {
  const t = acta.clasificacion?.tipo;
  if (t === "TRANSMISION") return "Transmisión";
  if (t === "DELEGADOS") return "Delegados";
  return "—";
}

/** Arrastre activo del editor (T4): mueve el cuadro completo, una esquina
 *  (libre en 2 ejes) o un BORDE completo (alto = vertical, ancho =
 *  horizontal — las dos esquinas de ese borde se mueven juntas). */
type Arrastre =
  | { tipo: "mover"; inicio: PuntoPct; orig: QuadPct }
  | { tipo: "esquina"; cual: "tl" | "tr" | "br" | "bl"; orig: QuadPct }
  | { tipo: "alto"; borde: "sup" | "inf"; inicio: PuntoPct; orig: QuadPct }
  | { tipo: "ancho"; lado: "izq" | "der"; inicio: PuntoPct; orig: QuadPct };

/** Punto dentro del polígono (ray-casting — arrastrar por dentro mueve el
 *  cuadro completo). */
function puntoEnQuad(q: QuadPct, p: PuntoPct): boolean {
  const v = [q.tl, q.tr, q.br, q.bl];
  let dentro = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = v[i];
    const b = v[j];
    if (
      (a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/** Bounding box del quad en % (guard de tamaño mínimo de APLICAR). */
function bboxDeQuad(q: QuadPct): { x: number; y: number; w: number; h: number } {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x];
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Punto medio de un segmento (posición de los handles de borde). */
function midPct(a: PuntoPct, b: PuntoPct): PuntoPct {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function ModalRevisorBase({
  acta,
  publicacion,
  onVerEnMonitor,
  onCerrar,
  posNavegacion,
  onNavegar,
  cargarOriginal,
  onAceptar,
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
  /** KIT aceptar-revision-masiva-v1 (diseño 3 — ACEPTAR ACTA): envío real
   * de la fila abierta (store masiva: registrarEnvioMasiva → monitor +
   * registro ENVIADA + ledger + fila). Sin ella, el panel no ofrece ACEPTAR
   * (mismo degradado honesto que onVerEnMonitor/onNavegar). */
  onAceptar?: () => Promise<boolean>;
}) {
  // ── Visor (estado del redesign — todo local, cero acople con el store) ──
  const [verOriginal, setVerOriginal] = useState(false);
  const [rotacionVisual, setRotacionVisual] = useState(0);
  const [contraste, setContraste] = useState<ContrasteModo>("NORMAL");
  const [expandido, setExpandido] = useState(false);
  // Finding 1 (informe-arquitectura-fluidez-2026-11-02 §4) — el % de zoom
  // ya NO es estado: `onZoomChange` dispara POR FRAME de zoom y `setEscala`
  // re-renderizaba el modal COMPLETO (~1000 nodos) solo para actualizar una
  // etiqueta. El % se escribe DIRECTO al DOM por ref (mismo patrón del
  // VisorZoom: transform en refs, rAF dentro). El texto inicial es «—» y
  // el propio VisorZoom lo rellena con su ajuste inicial (pintar →
  // onZoomChange en cada gesto y en ajustar()).
  const escalaLabelRef = useRef<HTMLSpanElement>(null);
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
  // Finding 1: escritura DOM directa — cero re-render del modal por frame.
  const onZoomChange = useCallback((e: number) => {
    const el = escalaLabelRef.current;
    if (el) el.textContent = `${Math.round(e * 100)}%`;
  }, []);

  // ── Editor (estado local del modal — el acta vive en useE14Store) ──────
  const foto = acta?.fotoProcesada ?? acta?.fotoOriginal ?? null;
  const editable = Boolean(acta && !acta.enviadoAutomaticamente && foto);
  const [editandoRecorte, setEditandoRecorte] = useState(false);
  // KIT VISOR-MASIVA-v1 (T4): el rectángulo por arrastre evoluciona a
  // CUADRILÁTERO de 4 esquinas libres — los 4 handles de borde se derivan
  // de las esquinas (8 puntos visibles, decisión N2/D8 del dueño).
  const [puntos, setPuntos] = useState<QuadPct | null>(null);
  const [hintEditor, setHintEditor] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<
    null | "rotando" | "recortando" | "detectando"
  >(null);
  const [editada, setEditada] = useState(false);
  const fotoPreEdicionRef = useRef<string | null>(null);
  const visorRef = useRef<VisorZoomHandle>(null);
  const zonaRecorteRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  // P1.7 (informe-arquitectura-fluidez-2026-11-02 §6.7) — plomería del
  // arrastre del editor:
  // · zonaRectRef → getBoundingClientRect cacheado AL INICIAR el gesto (el
  //   layout no cambia mientras se arrastra): pctDePuntero deja de medir el
  //   DOM en CADA pointermove (60-120 lecturas de layout/s forzaban reflow).
  // · rafArrastreRef + puntoPendienteRef → COALESCING a rAF: cada
  //   pointermove ya no hace setPuntos (60-120 re-renders/s del modal
  //   arrastrando el quad) — el último punto del frame se aplica UNA vez
  //   (mismo patrón del VisorZoom: refs + rAF).
  // · ocupadoRef → espejo de `ocupado` para leerlo dentro del rAF sin
  //   closures vencidas (mismo patrón de editandoRef/expandidoRef).
  const zonaRectRef = useRef<DOMRect | null>(null);
  const rafArrastreRef = useRef<number | null>(null);
  const puntoPendienteRef = useRef<PuntoPct | null>(null);
  const ocupadoRef = useRef<null | "rotando" | "recortando" | "detectando">(null);
  useEffect(() => {
    ocupadoRef.current = ocupado;
  }, [ocupado]);
  // Espejos para el listener de Escape (lectura sin re-suscribir):
  // · editandoRef → T4.5: Escape CANCELA el editor antes de cerrar el modal.
  const editandoRef = useRef(false);
  useEffect(() => {
    editandoRef.current = editandoRecorte;
  }, [editandoRecorte]);
  // Escape — orden de salida: pantalla completa → EDITOR (cancela, no toca
  // nada) → cierra el modal.
  useEffect(() => {
    if (!acta) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (expandidoRef.current) {
        setExpandido(false);
        return;
      }
      if (editandoRef.current) {
        setEditandoRecorte(false);
        setPuntos(null);
        setHintEditor(null);
        return;
      }
      onCerrar();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [acta, onCerrar]);

  // ── Rechazo del supervisor (motivo obligatorio + armado a 2 toques) ────
  const [observaciones, setObservaciones] = useState("");
  const [errorMotivo, setErrorMotivo] = useState(false);
  const [rechazoArmado, setRechazoArmado] = useState(false);
  const [rechazoHecho, setRechazoHecho] = useState(false);
  const timerRechazoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── KIT aceptar-revision-masiva-v1 — INGRESO MANUAL DE DATOS (diseño 3,
  //    panel de actas SIN envío automático) ────────────────────────────────
  // Base DIVIPOL REAL para las opciones de los selects (fetch de
  // /e14/divipol.json — el mismo catálogo del clasificador). null/fallo →
  // los selects degradan a display honesto (jamás opciones inventadas).
  const [baseDivipol, setBaseDivipol] = useState<DivipolBase | null>(null);
  useEffect(() => {
    let vivo = true;
    void cargarDivipol().then((b) => {
      if (vivo) setBaseDivipol(b);
    });
    return () => {
      vivo = false;
    };
  }, []);
  /** Selección del supervisor (códigos DIVIPOL) — null = aún sin acta. */
  const [datosManual, setDatosManual] = useState<null | {
    municipio: string;
    zona: string;
    puesto: string;
    mesa: number | null;
    tipo: "TRANSMISION" | "DELEGADOS";
    paginaIndex: number;
  }>(null);
  /** El supervisor tocó AL MENOS un dato (transparencia de la corrección). */
  const [huboEdicionManual, setHuboEdicionManual] = useState(false);
  // ACEPTAR ACTA — armado a 2 toques (mismo patrón del rechazo: el envío
  // NUNCA es accidental) + flash de confirmación → avance al siguiente.
  const [aceptarArmado, setAceptarArmado] = useState(false);
  const [aceptacionHecha, setAceptacionHecha] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const timerAceptarRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset del visor/editor/rechazo/aceptación al cambiar de acta abierta
  // (navegación incluida) — y de los timers de avance pendientes.
  useEffect(() => {
    setEditandoRecorte(false);
    setPuntos(null);
    setHintEditor(null);
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
    setAceptarArmado(false);
    setAceptacionHecha(false);
    setHuboEdicionManual(false);
    if (timerRechazoRef.current) {
      clearTimeout(timerRechazoRef.current);
      timerRechazoRef.current = null;
    }
    if (timerAceptarRef.current) {
      clearTimeout(timerAceptarRef.current);
      timerAceptarRef.current = null;
    }
  }, [acta?.id]);

  useEffect(
    () => () => {
      if (timerRechazoRef.current) clearTimeout(timerRechazoRef.current);
      if (timerAceptarRef.current) clearTimeout(timerAceptarRef.current);
    },
    [],
  );

  // INGRESO MANUAL DE DATOS — pre-carga con los valores RECONOCIDOS del
  // acta (clasificación si existe; códigos vacíos si no — jamás inventar).
  // Re-carga en cada acta abierta (navegación incluida).
  useEffect(() => {
    if (!acta) {
      setDatosManual(null);
      return;
    }
    const c = acta.clasificacion;
    const pagina = acta.pagina ?? c?.pagina ?? null;
    setDatosManual({
      municipio: c?.municipio?.codigo?.padStart(3, "0") ?? "",
      // §1 de la base DIVIPOL: zona de 2 dígitos (el join del adaptador la
      // normaliza a 3 — aquí viaja verbatim de la base).
      zona: c?.zona?.codigo?.padStart(2, "0") ?? "",
      puesto: c?.puesto?.codigo?.padStart(2, "0") ?? "",
      mesa: c?.mesa ?? null,
      tipo: c?.tipo ?? "DELEGADOS",
      paginaIndex: pagina?.index ?? 1,
    });
  }, [acta?.id]);

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
    setPuntos(null);
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

  /** APLICAR del editor (T4.5) — hornea el CUADRILÁTERO en la foto
   *  procesada (warp por homografía — canvas puro, helper local). El QUÉ
   *  no cambia: fotoProcesada + chip EDITADA (mecanismo intacto); solo
   *  cambió CÓMO se marcó el área. */
  const aplicarRecorte = async () => {
    if (!acta || !foto || !puntos || ocupado) return;
    const bb = bboxDeQuad(puntos);
    if (bb.w < RECT_MIN_PCT || bb.h < RECT_MIN_PCT) return;
    if (!fotoPreEdicionRef.current) fotoPreEdicionRef.current = foto;
    setOcupado("recortando");
    try {
      const r = await hornearRecorteCuadrilatero(foto, puntos);
      useE14Store.getState().editarActaActual({ fotoProcesada: r.url });
      setEditada(true);
      setEditandoRecorte(false);
      setPuntos(null);
      setHintEditor(null);
    } catch {
      /* horneado fallido — la foto queda como está (honesto, sin humo) */
    } finally {
      setOcupado(null);
    }
  };

  /** DESHACER (T4.4 — vive DENTRO del editor: absorbió al ↩ de la toolbar,
   *  decisión 1 del dueño): devuelve la foto del momento ANTES de la
   *  primera edición (lógica intacta) y deja el editor abierto con el quad
   *  por defecto. Deshabilitado si no hay ediciones. */
  const deshacerEdicion = () => {
    const original = fotoPreEdicionRef.current;
    if (!original || ocupado) return;
    useE14Store.getState().editarActaActual({ fotoProcesada: original });
    setEditada(false);
    fotoPreEdicionRef.current = null;
    setPuntos(QUAD_POR_DEFECTO);
    setHintEditor(null);
  };

  /** ROTAR dentro del editor (T4.3): MISMA acción horneada de 90° que el ↻
   *  de la toolbar en manual (mismo estado, mismo DESHACER) — los 8 puntos
   *  se re-proyectan sobre la imagen rotada ((x,y) → (100−y, x); la vieja
   *  esquina BL pasa a ser la nueva TL del quad). */
  const rotarEnEditor = async () => {
    if (!acta || !foto || ocupado) return;
    if (!fotoPreEdicionRef.current) fotoPreEdicionRef.current = foto;
    setOcupado("rotando");
    try {
      const r = await rotateProcessedDataUrl(foto, 90);
      useE14Store.getState().editarActaActual({ fotoProcesada: r.url });
      setEditada(true);
      setPuntos((q) =>
        q
          ? {
              tl: { x: clampPct(100 - q.bl.y), y: clampPct(q.bl.x) },
              tr: { x: clampPct(100 - q.tl.y), y: clampPct(q.tl.x) },
              br: { x: clampPct(100 - q.tr.y), y: clampPct(q.tr.x) },
              bl: { x: clampPct(100 - q.br.y), y: clampPct(q.br.x) },
            }
          : q,
      );
    } catch {
      /* horneado fallido — la foto queda como está (honesto, sin humo) */
    } finally {
      setOcupado(null);
    }
  };

  /** DETECCIÓN AUTOMÁTICA (T4.2): SOLO PROPONE los 8 puntos — si la
   *  detección falla o el área es absurda, deja los puntos como estaban y
   *  muestra un hint honesto. Heurística de bordes en cliente (sin
   *  servicios externos ni librerías nuevas). */
  const detectarBordes = async () => {
    if (!foto || ocupado) return;
    setOcupado("detectando");
    try {
      const q = await detectarBordesDocumento(foto);
      if (q) {
        setPuntos(q);
        setHintEditor("PUNTOS PROPUESTOS — REVÍSALOS Y CONFIRMA CON APLICAR");
      } else {
        setHintEditor("DETECCIÓN SIN ÉXITO — AJUSTA LOS PUNTOS MANUALMENTE");
      }
    } catch {
      setHintEditor("DETECCIÓN SIN ÉXITO — AJUSTA LOS PUNTOS MANUALMENTE");
    } finally {
      setOcupado(null);
    }
  };

  /** CANCELAR del editor (botón del pie del editor) — sale sin tocar nada. */
  const cancelarEditor = () => {
    if (ocupado) return;
    setEditandoRecorte(false);
    setPuntos(null);
    setHintEditor(null);
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

  // ── Dibujo del editor de recorte (puntero = mouse o dedo) ──────────
  const pctDePuntero = (
    e: React.PointerEvent,
  ): PuntoPct | null => {
    // P1.7 — durante un arrastre se usa el rect cacheado AL INICIAR el
    // gesto (cero lecturas de layout por move); fuera de arrastre, vivo.
    const r = (arrastreRef.current ? zonaRectRef.current : null) ?? zonaRecorteRef.current?.getBoundingClientRect() ?? null;
    if (!r || !r.width || !r.height) return null;
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const capturarPuntero = (e: React.PointerEvent) => {
    // Captura fail-safe (pointerIds sintéticos/automation pueden fallar —
    // el gesto del editor jamás se aborta por eso).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura el arrastre sigue dentro del overlay — suficiente */
    }
    // P1.7 — el rect del gesto se mide UNA vez aquí (arranque del arrastre).
    try {
      zonaRectRef.current = zonaRecorteRef.current?.getBoundingClientRect() ?? null;
    } catch {
      zonaRectRef.current = null;
    }
  };
  /** Arrastrar POR DENTRO del polígono mueve el recorte completo. */
  const iniciarMoverQuad = (e: React.PointerEvent<HTMLDivElement>) => {
    if (ocupado || !puntos) return;
    const p = pctDePuntero(e);
    if (!p || !puntoEnQuad(puntos, p)) return;
    capturarPuntero(e);
    arrastreRef.current = { tipo: "mover", inicio: p, orig: puntos };
  };
  const iniciarHandleEsquina = (
    e: React.PointerEvent<HTMLButtonElement>,
    cual: "tl" | "tr" | "br" | "bl",
  ) => {
    if (ocupado || !puntos) return;
    e.stopPropagation();
    capturarPuntero(e);
    arrastreRef.current = { tipo: "esquina", cual, orig: puntos };
  };
  const iniciarHandleAlto = (
    e: React.PointerEvent<HTMLButtonElement>,
    borde: "sup" | "inf",
  ) => {
    if (ocupado || !puntos) return;
    e.stopPropagation();
    const p = pctDePuntero(e);
    if (!p) return;
    capturarPuntero(e);
    arrastreRef.current = { tipo: "alto", borde, inicio: p, orig: puntos };
  };
  const iniciarHandleAncho = (
    e: React.PointerEvent<HTMLButtonElement>,
    lado: "izq" | "der",
  ) => {
    if (ocupado || !puntos) return;
    e.stopPropagation();
    const p = pctDePuntero(e);
    if (!p) return;
    capturarPuntero(e);
    arrastreRef.current = { tipo: "ancho", lado, inicio: p, orig: puntos };
  };
  /** P1.7 — lógica de aplicación del arrastre (EXTRAÍDA de onEditorMove
   *  verbatim): dada la geometría pendiente y el punto, produce el nuevo
   *  quad. La llama el rAF (coalescing) o el pointerup (flush final). */
  const aplicarArrastre = (a: Arrastre, p: PuntoPct) => {
    if (a.tipo === "mover") {
      const dx = p.x - a.inicio.x;
      const dy = p.y - a.inicio.y;
      setPuntos({
        tl: { x: clampPct(a.orig.tl.x + dx), y: clampPct(a.orig.tl.y + dy) },
        tr: { x: clampPct(a.orig.tr.x + dx), y: clampPct(a.orig.tr.y + dy) },
        br: { x: clampPct(a.orig.br.x + dx), y: clampPct(a.orig.br.y + dy) },
        bl: { x: clampPct(a.orig.bl.x + dx), y: clampPct(a.orig.bl.y + dy) },
      });
      return;
    }
    if (a.tipo === "esquina") {
      // Arrastre LIBRE en 2 ejes — corrige perspectiva.
      const pt = { x: p.x, y: p.y };
      const o = a.orig;
      setPuntos(
        a.cual === "tl"
          ? { ...o, tl: pt }
          : a.cual === "tr"
            ? { ...o, tr: pt }
            : a.cual === "br"
              ? { ...o, br: pt }
              : { ...o, bl: pt },
      );
      return;
    }
    if (a.tipo === "alto") {
      // Mueve el BORDE completo verticalmente (ajusta el alto).
      const dy = p.y - a.inicio.y;
      const o = a.orig;
      setPuntos(
        a.borde === "sup"
          ? {
              ...o,
              tl: { x: o.tl.x, y: clampPct(o.tl.y + dy) },
              tr: { x: o.tr.x, y: clampPct(o.tr.y + dy) },
            }
          : {
              ...o,
              bl: { x: o.bl.x, y: clampPct(o.bl.y + dy) },
              br: { x: o.br.x, y: clampPct(o.br.y + dy) },
            },
      );
      return;
    }
    // Mueve el BORDE completo horizontalmente (ajusta el ancho).
    const dx = p.x - a.inicio.x;
    const o = a.orig;
    setPuntos(
      a.lado === "izq"
        ? {
            ...o,
            tl: { x: clampPct(o.tl.x + dx), y: o.tl.y },
            bl: { x: clampPct(o.bl.x + dx), y: o.bl.y },
          }
        : {
            ...o,
            tr: { x: clampPct(o.tr.x + dx), y: o.tr.y },
            br: { x: clampPct(o.br.x + dx), y: o.br.y },
          },
    );
  };
  /** P1.7 — el ÚLTIMO punto de cada frame se aplica UNA vez (rAF): el
   *  arrastre del quad deja de pagar 60-120 re-renders del modal por
   *  segundo. El estado pendiente vive en refs — el rAF lee SIEMPRE el
   *  arrastre y el `ocupado` VIGENTES (espejos en ref, sin closures vencidas). */
  const onEditorMove = (e: React.PointerEvent) => {
    const a = arrastreRef.current;
    if (!a || ocupadoRef.current) return;
    const p = pctDePuntero(e);
    if (!p) return;
    puntoPendienteRef.current = p;
    if (rafArrastreRef.current != null) return; // ya hay frame programado
    rafArrastreRef.current = requestAnimationFrame(() => {
      rafArrastreRef.current = null;
      const pendiente = puntoPendienteRef.current;
      puntoPendienteRef.current = null;
      const vivo = arrastreRef.current;
      if (!pendiente || !vivo || ocupadoRef.current) return;
      aplicarArrastre(vivo, pendiente);
    });
  };
  const onEditorUp = () => {
    // P1.7 — flush final: el último movimiento pendiente se aplica SINCRONO
    // (si hubiese frame programado se cancela — el flush lo sustituye) y se
    // limpia el rect cacheado del gesto.
    if (rafArrastreRef.current != null) {
      cancelAnimationFrame(rafArrastreRef.current);
      rafArrastreRef.current = null;
    }
    const pendiente = puntoPendienteRef.current;
    puntoPendienteRef.current = null;
    const a = arrastreRef.current;
    arrastreRef.current = null;
    zonaRectRef.current = null;
    if (pendiente && a && !ocupadoRef.current) aplicarArrastre(a, pendiente);
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

  // Desarme solo del armado de ACEPTAR (3 s — el envío NUNCA es accidental;
  // mismo gesto del VACIAR/REINICIAR de la bandeja).
  useEffect(() => {
    if (!aceptarArmado) return;
    const t = window.setTimeout(() => setAceptarArmado(false), 3000);
    return () => window.clearTimeout(t);
  }, [aceptarArmado]);

  // ── ACEPTAR ACTA (diseño 3 — actas SIN envío automático): 1) aplica la
  //    corrección manual de datos al acta abierta (clasificación DIVIPOL +
  //    ubicación + página — SOLO los campos que el supervisor tocó); 2)
  //    envía la fila por la vía real del store masiva (onAceptar →
  //    registrarEnvioMasiva → monitor + registro ENVIADA + ledger + fila);
  //    3) flash de confirmación → avance al siguiente acta del lote.
  const aceptarActa = async () => {
    if (!acta || !onAceptar || aceptando || aceptacionHecha) return;
    if (acta.status === "ENVIADA") return; // ya enviada — nada que aceptar
    // KIT VISOR-MASIVA-v1 (T5 — decisión 6 del dueño): motivo OBLIGATORIO
    // también al ACEPTAR — MISMA mecánica visual del rechazo (borde error +
    // mensaje inline; sin toast). Única excepción ordenada a «cero lógica»:
    // es validación de formulario sobre el motivo que YA viaja en el flujo
    // (observaciones del registro) — el store y el ledger quedan intactos.
    if (!observaciones.trim()) {
      setErrorMotivo(true);
      setAceptarArmado(false);
      return;
    }
    setErrorMotivo(false);
    if (!aceptarArmado) {
      setAceptarArmado(true);
      return;
    }
    setAceptarArmado(false);
    setAceptando(true);
    try {
      // 1) Corrección manual de datos — SOLO si el supervisor editó algo y
      //    el acta trae clasificación (sin ella no hay códigos reales que
      //    corregir; la ubicación textual degradada no se toca — honestidad).
      if (huboEdicionManual && datosManual && acta.clasificacion) {
        const c = acta.clasificacion;
        const dep2 = c.departamento?.codigo?.padStart(2, "0") ?? "";
        // Nombres REALES desde la base (el select solo viaja con códigos;
        // el nombre sale del catálogo — jamás inventado). Si la base no
        // cargó o la ruta no existe, el nombre cae al reconocido o "".
        const nombreMun =
          baseDivipol
            ? (municipiosDe(baseDivipol, dep2).find(
                (m) => m.codigo.padStart(3, "0") === datosManual.municipio,
              )?.nombre ?? c.municipio?.nombre ?? "")
            : (c.municipio?.nombre ?? "");
        const nombrePuesto =
          baseDivipol && datosManual.zona
            ? (puestosDe(baseDivipol, dep2, datosManual.municipio, datosManual.zona).find(
                (p) => p.codigo.padStart(2, "0") === datosManual.puesto,
              )?.nombre ?? c.puesto?.nombre ?? "")
            : (c.puesto?.nombre ?? "");
        const municipio =
          datosManual.municipio && datosManual.municipio !== c.municipio?.codigo?.padStart(3, "0")
            ? { codigo: datosManual.municipio, nombre: nombreMun }
            : c.municipio;
        const zona =
          datosManual.zona && datosManual.zona !== c.zona?.codigo?.padStart(2, "0")
            ? { codigo: datosManual.zona }
            : c.zona;
        const puesto =
          datosManual.puesto && datosManual.puesto !== c.puesto?.codigo?.padStart(2, "0")
            ? { codigo: datosManual.puesto, nombre: nombrePuesto }
            : c.puesto;
        const mesa = datosManual.mesa ?? c.mesa;
        const tipo = datosManual.tipo !== c.tipo ? datosManual.tipo : c.tipo;
        // Kit paginas-acta-e14-v1: el total que se HORNEA es el del acta
        // (2 hojas — dueño), no el total dudoso que viajara del OCR.
        const totalPaginas = PAGINAS_POR_ACTA_E14;
        const paginaEditada =
          datosManual.paginaIndex !== (c.pagina?.index ?? acta.pagina?.index ?? 1)
            ? { index: datosManual.paginaIndex, total: totalPaginas }
            : c.pagina;
        useE14Store.getState().editarActaActual({
          clasificacion: { ...c, municipio, zona, puesto, mesa, tipo, pagina: paginaEditada },
          // Ubicación textual (fallback de display) — coherente con la
          // corrección (mismos datos, formato de la ActaUbicacion).
          ubicacion: {
            ...acta.ubicacion,
            municipio: municipio ? `${municipio.codigo} - ${municipio.nombre}`.replace(/ - $/, "") : acta.ubicacion?.municipio ?? "",
            zona: zona?.codigo ?? acta.ubicacion?.zona ?? "",
            puesto: puesto ? `${puesto.codigo} - ${puesto.nombre}`.replace(/ - $/, "") : acta.ubicacion?.puesto ?? "",
            mesa: mesa != null ? String(mesa) : acta.ubicacion?.mesa ?? "",
          },
          ...(paginaEditada ? { pagina: paginaEditada } : {}),
        });
      }
      // 2) Envío REAL de la fila abierta (misma maquinaria del lote).
      const ok = await onAceptar();
      if (!ok) return; // sin fila abierta / envío en curso — honesto, sin flash
      // 3) Flash → avance al siguiente acta del lote (mismo gesto del rechazo).
      setAceptacionHecha(true);
      if (timerAceptarRef.current) clearTimeout(timerAceptarRef.current);
      timerAceptarRef.current = setTimeout(() => {
        timerAceptarRef.current = null;
        setAceptacionHecha(false);
        onNavegar?.(1);
      }, 1200);
    } finally {
      setAceptando(false);
    }
  };

  /** Patch del ingreso manual (selects del diseño 3) — marca la edición
   *  para que ACEPTAR sepa que hay corrección que hornear. */
  const patchManual = (p: Partial<NonNullable<typeof datosManual>>) => {
    setDatosManual((prev) => (prev ? { ...prev, ...p } : prev));
    setHuboEdicionManual(true);
  };

  if (!acta) return null;
  const join = joinDeActa(acta);
  const pildora = pildoraEstadoActa(acta);
  // T-07 (auditoría diseños): glifo prefijo del design system — ● estado
  // ok/informativo · ▲ advertencia · ■ crítico (chip rectangular 4px).
  const glifoPildora = /RECHAZADA|ERROR/.test(pildora.label)
    ? "■"
    : /ADVERTENCIA|REVISIÓN/.test(pildora.label)
      ? "▲"
      : "●";
  const ubic = acta.ubicacion;
  // KIT VISOR-MASIVA-v1 (T4): guard de tamaño mínimo del recorte (bbox del
  // quad) + los 8 handles del editor (4 esquinas + 4 bordes derivados —
  // mover un borde mueve las DOS esquinas de ese borde).
  const bbQuad = puntos ? bboxDeQuad(puntos) : null;
  const recorteValido = Boolean(
    bbQuad && bbQuad.w >= RECT_MIN_PCT && bbQuad.h >= RECT_MIN_PCT,
  );
  const handlesEditor = puntos
    ? [
        { key: "tl", esquina: true, p: puntos.tl, label: "Esquina superior izquierda", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleEsquina(e, "tl") },
        { key: "tr", esquina: true, p: puntos.tr, label: "Esquina superior derecha", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleEsquina(e, "tr") },
        { key: "br", esquina: true, p: puntos.br, label: "Esquina inferior derecha", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleEsquina(e, "br") },
        { key: "bl", esquina: true, p: puntos.bl, label: "Esquina inferior izquierda", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleEsquina(e, "bl") },
        { key: "t", esquina: false, p: midPct(puntos.tl, puntos.tr), label: "Borde superior — ajusta el alto", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleAlto(e, "sup") },
        { key: "b", esquina: false, p: midPct(puntos.bl, puntos.br), label: "Borde inferior — ajusta el alto", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleAlto(e, "inf") },
        { key: "l", esquina: false, p: midPct(puntos.tl, puntos.bl), label: "Borde izquierdo — ajusta el ancho", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleAncho(e, "izq") },
        { key: "r", esquina: false, p: midPct(puntos.tr, puntos.br), label: "Borde derecho — ajusta el ancho", start: (e: React.PointerEvent<HTMLButtonElement>) => iniciarHandleAncho(e, "der") },
      ]
    : [];

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

  // ── KIT aceptar-revision-masiva-v1 — opciones REALES de la base DIVIPOL ──
  // Editable SOLO en actas sin envío automático que no están enviadas ni
  // rechazadas (el diseño 3: el supervisor corrige y ACEPTA). Sin base o
  // sin departamento reconocido → display honesto (DatoPanel de siempre).
  const manualEditable = Boolean(
    onAceptar && !enviadaAuto && acta.status !== "ENVIADA" && !rechazadaYa,
  );
  const dep2 = c?.departamento?.codigo?.padStart(2, "0") ?? "";
  const opsPaises =
    baseDivipol && dep2 ? municipiosDe(baseDivipol, dep2) : [];
  const opsZonas =
    baseDivipol && dep2 && datosManual?.municipio
      ? zonasDe(baseDivipol, dep2, datosManual.municipio)
      : [];
  const opsPuestos =
    baseDivipol && dep2 && datosManual?.municipio && datosManual?.zona
      ? puestosDe(baseDivipol, dep2, datosManual.municipio, datosManual.zona)
      : [];
  const totalMesas =
    baseDivipol && dep2 && datosManual
      ? mesasDePuesto(
          baseDivipol,
          dep2,
          datosManual.municipio,
          datosManual.zona,
          datosManual.puesto,
        )
      : null;
  const opsMesas =
    totalMesas != null && totalMesas > 0
      ? Array.from({ length: totalMesas }, (_, i) => i + 1)
      : [];
  // ── CÓDIGO DE BARRAS DEL ACTA ESCANEADA (feedback del dueño — rondas 2
  //    y 3): el 1D REAL leído al papel por el pipeline o el manifiesto de
  //  actas reales como respaldo — UNA sola fuente (barcodeRealDeActa del
  //  adaptador, la misma que publica el monitor). NUNCA el código de
  //  tracking del sistema (acta.codigoBarras «*E14-SEN-…*»).
  const barcodeEscaneado = barcodeRealDeActa(acta);
  // ── V2-01/V3-04 — código IMPRESO entre las X: del manifiesto del acta
  //    (join real); sin dato → «—» (jamás el mismo código para todas).
  const codigoForma = codigoFormaDeActa(acta);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Revisión de acta ${acta.titulo}`}
      // Móvil navegable (feedback del dueño): el modal COMPLETO hace scroll
      // (el panel del auditor queda alcanzable); en lg vuelve el layout de
      // 2 columnas con scroll interno del panel.
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-y-auto overscroll-contain bg-[var(--mz-bg)] lg:flex-row lg:overflow-hidden"
    >
      {/* ════════════════ CANVAS — VISOR DEL DOCUMENTO ════════════════ */}
      {/* Canvas: 52vh en móvil — AJUSTAR (expandido) lo lleva a PANTALLA
          COMPLETA REAL (h-dvh, feedback del dueño) con el panel oculto. */}
      <main
        className={`grid-paper-bg relative flex shrink-0 flex-col overflow-hidden bg-[var(--mz-canvas)] ${
          expandido ? "h-dvh" : "h-[52vh]"
        } lg:h-auto lg:min-w-0 lg:flex-1`}
      >
        {/* ── Toolbar flotante de inspección ── */}
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-md border border-[var(--mz-border-strong)] bg-[var(--mz-head)]/90 px-3 py-1.5 font-mono text-xs text-gray-300 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => visorRef.current?.alejar()}
            disabled={editandoRecorte}
            title="Reducir zoom"
            aria-label="Reducir zoom"
            className="p-3.5 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span
            ref={escalaLabelRef}
            className="min-w-[40px] text-center font-bold tabular-nums text-gray-200"
          >
            —
          </span>
          <button
            type="button"
            onClick={() => visorRef.current?.acercar()}
            disabled={editandoRecorte}
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            className="p-3.5 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="h-3 w-px bg-[var(--mz-border-strong)]" />
          {/* ROTAR: hornea (sin envío auto) o gira visual (enviadas auto).
              T1 — el ↻ de la toolbar se queda; el editor tiene el suyo. */}
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
            className="p-3.5 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            {ocupado === "rotando" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
          </button>
          {/* CONTRASTE — biciclo NORMAL↔NEGATIVO (N1 del dueño: el nivel
              «ALTO» sale de la UI de masiva). */}
          <button
            type="button"
            onClick={() =>
              setContraste((m) => (m === "NORMAL" ? "NEGATIVO" : "NORMAL"))
            }
            disabled={editandoRecorte || !fotoVisible}
            title={`Contraste: ${contraste === "NORMAL" ? "Normal" : "Negativo"}`}
            aria-label={`Modo de contraste: ${contraste === "NORMAL" ? "Normal" : "Negativo"}`}
            className={`p-3.5 transition-colors hover:text-emerald-300 disabled:opacity-40 ${
              contraste !== "NORMAL" ? "text-emerald-400" : ""
            }`}
          >
            <Contrast className="h-4 w-4" />
          </button>
          {/* AJUSTAR = PANTALLA COMPLETA del acta (pedido del dueño). */}
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            disabled={editandoRecorte}
            title={expandido ? "Salir de pantalla completa" : "Ajustar — pantalla completa"}
            aria-label={expandido ? "Salir de pantalla completa" : "Ver el acta en pantalla completa"}
            className="p-3.5 transition-colors hover:text-emerald-400 disabled:opacity-40"
          >
            {expandido ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
          <span className="h-3 w-px bg-[var(--mz-border-strong)]" />
          {/* SCORE — dato real del pipeline (misma escala /10 de siempre).
              Color semántico de los diseños: esmeralda ≥ 9 (V2-02/T-10 —
              umbral ÚNICO unificado con el visor del monitor; el diseño
              «envío automático» 10/10) · ámbar < 9 (score bajo — diseño
              «sin envío automático» 6/10). */}
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-bold tracking-wider ${
              acta.score >= 9
                ? "border-emerald-400 bg-emerald-500/25 text-emerald-400"
                : "border-amber-500/70 bg-[var(--mz-amber-bg)] text-amber-300"
            }`}
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
          className="absolute right-3 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--mz-border-strong)] bg-[var(--mz-head)]/90 font-mono text-sm text-gray-400 shadow-2xl backdrop-blur transition hover:bg-[var(--mz-head-hover)] hover:text-white"
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
              className="absolute left-4 top-1/2 z-10 flex h-16 w-11 -translate-y-1/2 items-center justify-center rounded border border-[var(--mz-border-strong)] bg-[var(--mz-head)]/80 text-gray-400 shadow-lg transition-colors hover:bg-[var(--mz-head-hover)] hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
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
              className="absolute right-4 top-1/2 z-10 flex h-16 w-11 -translate-y-1/2 items-center justify-center rounded border border-[var(--mz-border-strong)] bg-[var(--mz-head)]/80 text-gray-400 shadow-lg transition-colors hover:bg-[var(--mz-head-hover)] hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </>
        )}

        {/* ── Documento (visor con gestos / modo recorte / sin foto) ── */}
        <div className="flex min-h-0 w-full flex-1 items-start justify-center px-14 pb-24 pt-16">
          {fotoVisible ? (
            editandoRecorte && puntos ? (
              /* KIT VISOR-MASIVA-v1 (T4) — EDITOR DE RECORTE/PERSPECTIVA:
                 8 handles (4 esquinas libres 2D + 2 de alto + 2 de ancho) y
                 arrastre interior del cuadro completo. Foto estática (sin
                 zoom) — el mapeo % → píxeles naturales del horneado es 1:1.
                 Borde ámbar + oscurecer exterior (patrón del modo anterior),
                 sin sombras (D4). */
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <div
                  ref={zonaRecorteRef}
                  className="relative max-h-full max-w-full overflow-hidden rounded border-2 border-dashed border-[var(--amber)]/70 bg-white"
                >
                  <img
                    src={fotoVisible}
                    alt={`Foto del acta ${acta.titulo} — ajustando el área de recorte`}
                    className="block max-h-[36vh] max-w-full select-none lg:max-h-[50vh]"
                    draggable={false}
                  />
                  <div
                    className="absolute inset-0 cursor-move touch-none"
                    onPointerDown={iniciarMoverQuad}
                    onPointerMove={onEditorMove}
                    onPointerUp={onEditorUp}
                    onPointerCancel={onEditorUp}
                  >
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      {/* Oscurecer FUERA del área (patrón del modo anterior). */}
                      <path
                        d={`M0 0 H100 V100 H0 Z M${puntos.tl.x} ${puntos.tl.y} L${puntos.tr.x} ${puntos.tr.y} L${puntos.br.x} ${puntos.br.y} L${puntos.bl.x} ${puntos.bl.y} Z`}
                        fill="rgba(5, 10, 15, 0.62)"
                        fillRule="evenodd"
                      />
                      {/* Borde ámbar del cuadrilátero — vector-effect mantiene
                          el trazo uniforme aunque el viewBox se estire. */}
                      <polygon
                        points={`${puntos.tl.x},${puntos.tl.y} ${puntos.tr.x},${puntos.tr.y} ${puntos.br.x},${puntos.br.y} ${puntos.bl.x},${puntos.bl.y}`}
                        fill="none"
                        stroke="var(--amber)"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    {/* 8 HANDLES — hit-area 44px (§6.7), dibujo pequeño:
                        esquinas más grandes (libres 2D), bordes medianos. */}
                    {handlesEditor.map((h) => (
                      <button
                        key={h.key}
                        type="button"
                        aria-label={h.label}
                        onPointerDown={h.start}
                        onPointerMove={onEditorMove}
                        onPointerUp={onEditorUp}
                        onPointerCancel={onEditorUp}
                        className="absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full active:cursor-grabbing"
                        style={{ left: `${h.p.x}%`, top: `${h.p.y}%` }}
                      >
                        <span
                          className={`block rounded-full border-2 border-[var(--mz-on-primary)] bg-[var(--amber)] ${
                            h.esquina ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex max-w-full flex-col items-center gap-2 px-2">
                  <p
                    role="status"
                    className="text-center font-mono text-[10px] uppercase tracking-wider text-gray-400"
                  >
                    {hintEditor ??
                      (recorteValido
                        ? "AJUSTA LOS 8 PUNTOS — APLICA PARA RECORTAR"
                        : "AJUSTA LOS 8 PUNTOS DEL DOCUMENTO")}
                  </p>
                  <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void detectarBordes()}
                      disabled={!!ocupado}
                      title="Detectar los bordes del documento (solo propone — revisa y confirma con APLICAR)"
                      className="flex min-h-[44px] items-center gap-1.5 rounded border border-[var(--mz-border-strong)] bg-[var(--mz-head)] px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-[var(--mz-border-hover)] hover:text-white disabled:opacity-40"
                    >
                      {ocupado === "detectando" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Scan className="h-3.5 w-3.5" />
                      )}
                      DETECCIÓN AUTOMÁTICA
                    </button>
                    <button
                      type="button"
                      onClick={() => void rotarEnEditor()}
                      disabled={!!ocupado}
                      title="Rotar 90° horario (hornea la foto; los puntos siguen el giro)"
                      aria-label="Rotar la foto 90 grados dentro del editor"
                      className="flex min-h-[44px] items-center gap-1.5 rounded border border-[var(--mz-border-strong)] bg-[var(--mz-head)] px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-[var(--mz-border-hover)] hover:text-white disabled:opacity-40"
                    >
                      {ocupado === "rotando" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="h-3.5 w-3.5" />
                      )}
                      ROTAR
                    </button>
                    <button
                      type="button"
                      onClick={deshacerEdicion}
                      disabled={!editada || !!ocupado}
                      title={
                        editada
                          ? "Devolver la foto a como estaba antes de la primera edición"
                          : "No hay ediciones que deshacer"
                      }
                      className="flex min-h-[44px] items-center gap-1.5 rounded border border-amber-400/60 bg-[var(--mz-head)] px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400 transition hover:border-amber-400 hover:text-amber-300 disabled:opacity-40"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      DESHACER
                    </button>
                    <button
                      type="button"
                      onClick={cancelarEditor}
                      disabled={!!ocupado}
                      className="min-h-[44px] rounded border border-[var(--mz-border-strong)] bg-[var(--mz-head)] px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-[var(--mz-border-hover)] hover:text-white disabled:opacity-40"
                    >
                      CANCELAR
                    </button>
                    <button
                      type="button"
                      onClick={() => void aplicarRecorte()}
                      disabled={!recorteValido || !!ocupado}
                      className="min-h-[44px] rounded bg-emerald-500 px-3.5 font-mono text-[10px] font-black uppercase tracking-wider text-[var(--mz-on-primary)] shadow-md shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
                    >
                      {ocupado === "recortando" ? "RECORTANDO…" : "APLICAR"}
                    </button>
                  </div>
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
                  decoding="async"
                  onLoad={() => visorRef.current?.ajustar()}
                  className="block max-h-[40vh] max-w-[68vw] select-none border border-white/25 bg-white shadow-[0_0_40px_rgba(0,0,0,0.8)] lg:max-h-[64vh] lg:max-w-[38vw]"
                />
              </VisorZoom>
            )
          ) : (
            <p className="rounded-lg border border-[var(--mz-border)] bg-[var(--mz-card)] px-4 py-5 text-center font-mono text-[11px] uppercase tracking-wider text-gray-400">
              SIN FOTO PROCESADA EN MEMORIA
            </p>
          )}
        </div>

        {/* ── EDITAR + MOSTRAR ORIGINAL (pie del canvas — diseño 3
            `visor_de_actas_sin_envio_automatico` / V3-01: el botón ✎ EDITAR
            verde del pie ABRE el editor de recorte/perspectiva (T4 — las
            herramientas ✂/↩ salieron de la toolbar por decisión 1 del
            dueño; toda la edición entra por aquí). Solo actas SIN envío
            automático (editables). ── */}
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 lg:bottom-16">
          {editable && !editandoRecorte && (
            <button
              type="button"
              onClick={() => {
                // T4 — el editor arranca con el quad por defecto (8 handles
                // visibles) sobre la foto PROCESADA: si el original estaba
                // en pantalla, vuelve a la procesada (mismo marco de %).
                setVerOriginal(false);
                setPuntos(QUAD_POR_DEFECTO);
                setHintEditor(null);
                setEditandoRecorte(true);
              }}
              disabled={!!ocupado}
              title="Editar la imagen (recorte y perspectiva)"
              className="pointer-events-auto flex items-center gap-1.5 rounded border border-emerald-500/70 bg-[var(--mz-head)]/90 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 shadow-lg backdrop-blur transition-colors hover:bg-emerald-500/15 disabled:opacity-60"
            >
              {ocupado === "recortando" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SquarePen className="h-3.5 w-3.5" />
              )}
              EDITAR
            </button>
          )}
          {hayOriginal && (
            <button
              type="button"
              onClick={() => void alternarOriginal()}
              disabled={cargandoOriginal || editandoRecorte}
              title={
                editandoRecorte
                  ? "Cierra el editor para ver el original (los puntos pertenecen a la foto procesada)"
                  : undefined
              }
              className="pointer-events-auto flex items-center gap-1.5 rounded border border-[var(--mz-border-strong)] bg-[var(--mz-head)]/90 px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wider text-gray-200 shadow-lg backdrop-blur transition-colors hover:bg-[var(--mz-head-hover)] hover:text-white disabled:opacity-60"
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

        {/* ── Franja de metadata (footer del canvas) — KIT VISOR-MASIVA-v1
            T3: full-width con márgenes laterales fijos ~28px, punto ● LLENO
            verde, país en MAYÚSCULAS, separadores como el mock y SIN
            «IMG i/N» (decisión 4 — la posición la dan los chevrons ‹ ›). ── */}
        <footer className="absolute bottom-3 left-[28px] right-[28px] z-20 flex items-center justify-center gap-2 rounded border border-[var(--mz-border-strong)] bg-[var(--mz-strip)]/95 px-4 py-2 text-center font-mono shadow-2xl backdrop-blur">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400"
            aria-hidden
          />
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-medium tracking-wide text-gray-300">
            <span>{etiquetaForm}</span>
            <span aria-hidden>·</span>
            <span className="font-bold">
              PÁG {pagina ? `${pagina.index}/${PAGINAS_POR_ACTA_E14}` : "-/-"}
            </span>
            <span className="text-gray-600" aria-hidden>
              |
            </span>
            <span className="font-normal text-gray-400 uppercase">
              PAÍS {c?.municipio ? `${c.municipio.codigo} – ${c.municipio.nombre}` : (ubic?.municipio ?? "—")}
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
      {/* gap-4 (ronda 2): los demás espacios se compactan para darle sitio
          a la tarjeta de datos — feedback del dueño. */}
      <aside
        className={`w-full shrink-0 overflow-y-auto border-t border-[var(--mz-border)] bg-[var(--mz-aside)] p-5 lg:w-[380px] lg:border-l lg:border-t-0 ${
          expandido ? "hidden" : "flex flex-col gap-4"
        }`}
      >
        {/* ── ENVÍO AUTOMÁTICO + datos reconocidos ── */}
        {/* shrink-0 (ronda 2): la tarjeta JAMÁS se comprime como ítem flex
            (overflow-hidden le daba mínimo 0 → el contenido quedaba tapado/
            recortado por los demás campos en ventanas medianas/pequeñas);
            ahora el propio aside desplaza y el contenido lleva su propio
            desplazador interno (ver div de datos). */}
        <div className="shrink-0 overflow-hidden rounded-[8px] border border-[var(--mz-border)] bg-[var(--mz-card)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--mz-border)]/60 bg-[var(--mz-head)]/90 px-3 py-3">
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
                  {/* Diseño 3 — «visor de actas sin envío automático»: el
                      panel pasa a MODO EDICIÓN (ingreso manual de datos). */}
                  <SquarePen className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="truncate font-mono text-xs font-bold uppercase tracking-wider text-gray-200">
                    INGRESO MANUAL DE DATOS
                  </span>
                </>
              )}
            </div>
            {/* VER EN MONITOR (feedback del dueño): en la CABECERA del panel,
                outline verde + icono monitor. RONDA 2 — BOTÓN FIJO: la
                condición es el JOIN del acta (clasificación AUTO, viaja
                persistida con el acta) — NO el registro en memoria de la
                publicación, que se pierde al recargar/cerrar; así el botón
                NO desaparece tras darle click. Solo se oculta en cuarentena
                D25 (bloqueada): ahí el acta NO existe en el monitor. */}
            {join &&
              onVerEnMonitor &&
              publicacion?.estado !== "bloqueada" && (
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
          <div className="flex items-center justify-between gap-2 border-b border-[var(--mz-border)]/40 px-3.5 py-2">
            {/* T-07 — chip rectangular 4px + glifo prefijo (design system). */}
            <span
              className={`shrink-0 rounded-[4px] border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${pildora.clases}`}
            >
              <span aria-hidden className="mr-1">{glifoPildora}</span>
              {pildora.label}
            </span>
            {enviadaAuto && (
              <span className="truncate font-mono text-[9px] uppercase tracking-wider text-emerald-400/90">
                ENVIADA AUTO · {acta.enviadoAutomaticamente}
              </span>
            )}
          </div>
          {/* DESPLAZADOR INTERNO (feedback del dueño — ronda 2): en ventanas
              medianas/pequeñas la tarjeta puede no caber entera → su
              contenido se desplaza DENTRO (max-h + overflow) con scroll
              fino (.scroll-panel). overscroll-contain solo en lg para no
              atrapar el dedo en móvil (el scroll fluye al modal). */}
          <div className="max-h-[45dvh] space-y-3 overflow-y-auto p-3.5 font-mono text-xs scroll-panel lg:overscroll-contain">
            {/* VERIFICACIÓN DE IDENTIFICADOR / CÓDIGO — el código IMPRESO
                ENTRE LAS X del acta física (feedback del dueño; NO el
                código de barras, que va en su campo propio). */}
            <div>
              <span className="mb-1 block text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Verificación de Identificador / Código
              </span>
              <div
                title="Código impreso del formulario E-14, entre las X del papel (el código de barras va en su campo propio)"
                className="rounded border border-[var(--mz-border)] bg-[var(--mz-canvas)] px-2 py-1.5 text-center"
              >
                {codigoForma ? (
                  <span className="text-sm font-bold tracking-widest text-emerald-400">
                    {/* T3 — espacio alrededor de cada guion (SOLO
                        tipografía; el dato real del manifiesto no se toca
                        y sin dato sigue el «—» honesto). */}
                    {`X  ${codigoForma.replace(/-/g, " - ")}  X`}
                  </span>
                ) : (
                  /* Sin código en el manifiesto → «—» honesto (V2-01). */
                  <span className="text-sm font-bold tracking-widest text-gray-500">
                    —
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {manualEditable && opsPaises.length > 0 && datosManual ? (
                <>
                  {/* DISEÑO 3 — INGRESO MANUAL DE DATOS: selects con opciones
                      REALES de la base DIVIPOL (país/zona/puesto/mesa); la
                      cascada reinyecta la ruta (cambiar país limpia zona,
                      puesto y mesa — la jerarquía manda). */}
                  <DatoSelect
                    etiqueta="País"
                    ariaLabel="Seleccionar país del acta"
                    valor={datosManual.municipio}
                    opciones={opsPaises.map((m) => ({
                      valor: m.codigo.padStart(3, "0"),
                      texto: `${m.nombre} (${m.codigo})`,
                    }))}
                    onCambiar={(v) =>
                      patchManual({ municipio: v, zona: "", puesto: "", mesa: null })
                    }
                  />
                  <DatoSelect
                    etiqueta="Zona"
                    ariaLabel="Seleccionar zona del acta"
                    valor={datosManual.zona}
                    opciones={opsZonas.map((z) => ({
                      valor: z.codigo.padStart(2, "0"),
                      texto: `Zona ${z.codigo}`,
                    }))}
                    onCambiar={(v) =>
                      patchManual({ zona: v, puesto: "", mesa: null })
                    }
                  />
                  <DatoSelect
                    etiqueta="Puesto"
                    ariaLabel="Seleccionar puesto del acta"
                    valor={datosManual.puesto}
                    opciones={opsPuestos.map((p) => ({
                      valor: p.codigo.padStart(2, "0"),
                      texto: `${p.codigo} - ${p.nombre}`,
                    }))}
                    onCambiar={(v) => patchManual({ puesto: v, mesa: null })}
                  />
                  <DatoSelect
                    etiqueta="Mesa"
                    ariaLabel="Seleccionar mesa del acta"
                    valor={datosManual.mesa != null ? String(datosManual.mesa) : ""}
                    opciones={opsMesas.map((n) => ({
                      valor: String(n),
                      texto: `Mesa ${String(n).padStart(3, "0")}`,
                    }))}
                    onCambiar={(v) => patchManual({ mesa: v ? Number(v) : null })}
                  />
                </>
              ) : (
                <>
                  <DatoPanel etiqueta="País" valor={pais} />
                  <DatoPanel etiqueta="Zona" valor={zonaTxt} />
                  <DatoPanel etiqueta="Puesto" valor={puesto} />
                  <DatoPanel etiqueta="Mesa" valor={mesa} />
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--mz-border)]/40 pt-2">
              {manualEditable && datosManual ? (
                <>
                  <DatoSelect
                    etiqueta="Origen"
                    ariaLabel="Seleccionar origen del acta"
                    valor={datosManual.tipo}
                    opciones={[
                      { valor: "DELEGADOS", texto: "DELEGADOS" },
                      { valor: "TRANSMISION", texto: "TRANSMISIÓN" },
                    ]}
                    onCambiar={(v) =>
                      patchManual({ tipo: v === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS" })
                    }
                  />
                  <DatoSelect
                    etiqueta="Página"
                    ariaLabel="Seleccionar página del acta"
                    // Kit paginas-acta-e14-v1 (feedback del dueño): el total
                    // del select es el del ACTA (2 hojas — «en este caso
                    // serían 2 páginas»), NUNCA el del lote de ingesta ni un
                    // total dudoso del OCR. El índice preseleccionado sigue
                    // siendo el reconocido (clamp 1..2 por si el OCR viajó
                    // fuera de rango).
                    valor={String(
                      Math.min(
                        Math.max(1, datosManual.paginaIndex),
                        PAGINAS_POR_ACTA_E14,
                      ),
                    )}
                    opciones={Array.from({ length: PAGINAS_POR_ACTA_E14 }, (_, i) => ({
                      valor: String(i + 1),
                      texto: `${i + 1} DE ${PAGINAS_POR_ACTA_E14}`,
                    }))}
                    onCambiar={(v) => patchManual({ paginaIndex: Number(v) || 1 })}
                  />
                </>
              ) : (
                <>
                  <DatoPanel etiqueta="Origen" valor={origenDe(acta)} />
                  <DatoPanel
                    etiqueta="Página"
                    valor={
                      pagina
                        ? `${pagina.index} DE ${PAGINAS_POR_ACTA_E14}`
                        : "- DE -"
                    }
                  />
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--mz-border)]/40 pt-2">
              <DatoPanel etiqueta="Kit" valor={kit} />
              <DatoPanel
                etiqueta="Código de Barras"
                valor={barcodeEscaneado || "—"}
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
          <p className="rounded border border-red-900/60 bg-[var(--hazard-bg)] px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-wider text-red-400">
            {acta.rechazo.tipo} — {acta.rechazo.detalle}
          </p>
        )}

        <div className="mt-auto shrink-0 space-y-4 border-t border-[var(--mz-border)] pt-4">
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
                // T5 — escribir el motivo desarma también la confirmación
                // de ACEPTAR (mismo gesto que ya aplicaba al rechazo).
                if (aceptarArmado) setAceptarArmado(false);
              }}
              placeholder="Ingrese el motivo de la decisión..."
              rows={4}
              aria-invalid={errorMotivo || undefined}
              aria-describedby={
                errorMotivo ? "masiva-observaciones-error" : undefined
              }
              className={`w-full resize-none rounded border bg-[var(--mz-card)] p-3 text-xs text-gray-200 placeholder-gray-600 transition-colors focus:outline-none focus:ring-1 ${
                errorMotivo
                  ? "border-red-500/70 focus:border-red-500 focus:ring-red-500"
                  : "border-[var(--mz-border)] focus:border-emerald-500 focus:ring-emerald-500"
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
            {/* ACEPTAR ACTA (diseño 3 — actas SIN envío automático): envío
                real de la fila abierta con los datos corregidos. 2 toques —
                el envío NUNCA es accidental. */}
            {onAceptar && !enviadaAuto && acta.status !== "ENVIADA" && (
              aceptacionHecha ? (
                <p
                  role="status"
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded border border-emerald-500/60 bg-emerald-500/15 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ACEPTADA — ENVIADA
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void aceptarActa()}
                  disabled={aceptando}
                  title="Aceptar el acta con los datos revisados y enviarla (2 toques)"
                  className={`mb-3 flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 font-mono font-bold text-xs uppercase tracking-wider shadow-lg transition-colors active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                    aceptarArmado
                      ? "animate-pulse bg-emerald-400 text-[var(--mz-on-primary)]"
                      : "bg-emerald-500 text-[var(--mz-on-primary)] hover:bg-emerald-400"
                  }`}
                >
                  {aceptando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  )}
                  {aceptando
                    ? "ENVIANDO…"
                    : aceptarArmado
                      ? "¿CONFIRMAR ENVÍO?"
                      : "ACEPTAR ACTA"}
                </button>
              )
            )}
            {rechazoHecho ? (
              <p
                role="status"
                className="flex w-full items-center justify-center gap-2 rounded border border-red-900/60 bg-[var(--hazard-bg)] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-red-400"
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
                    : "border-red-900/60 bg-[var(--hazard-bg)] text-red-400 hover:bg-[var(--mz-hazard-hover)] hover:text-red-300"
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
          <div className="flex items-start gap-2 border-t border-[var(--mz-border)]/40 pt-2">
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
            className="min-h-[44px] w-full rounded border border-[var(--mz-border)] bg-[var(--mz-card)] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-gray-300 transition hover:border-[var(--mz-border-hover)] hover:text-white"
          >
            CERRAR
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── P0.2/finding 10 (informe-arquitectura-fluidez-2026-11-02 §4) — MEMO ──
// El modal se monta DENTRO de MasivaView (suscriptor de filas+progreso+
// publicaciones+métricas): sin memo, CUALQUIER vida de fondo re-renderizaba
// el modal abierto (~1000 nodos). Con memo + handlers estables del
// orquestador (onCerrar/onNavegar/onAceptar con useCallback) el modal solo
// repinta por SUS datos (acta/publicación/estados locales del visor).
export const ModalRevisor = memo(ModalRevisorBase);

/** Celda de dato del panel del auditor (etiqueta caps + caja mono). */
function DatoPanel({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {etiqueta}
      </span>
      <div
        className="truncate rounded border border-[var(--mz-border)] bg-[var(--mz-canvas)] px-2 py-1.5 font-mono text-xs text-gray-200"
        title={valor}
      >
        {valor}
      </div>
    </div>
  );
}

/** Celda SELECT del ingreso manual de datos (diseño 3) — misma caja del
 *  DatoPanel pero editable. Opciones SIEMPRE de la base real (el llamador
 *  filtra por ruta DIVIPOL). */
function DatoSelect({
  etiqueta,
  valor,
  opciones,
  onCambiar,
  ariaLabel,
}: {
  etiqueta: string;
  valor: string;
  opciones: Array<{ valor: string; texto: string }>;
  onCambiar: (valor: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {etiqueta}
      </label>
      <select
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label={ariaLabel}
        className="w-full cursor-pointer truncate rounded border border-[var(--mz-border)] bg-[var(--mz-canvas)] px-2 py-1.5 font-mono text-xs text-gray-200 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        {valor === "" && <option value="">—</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}
