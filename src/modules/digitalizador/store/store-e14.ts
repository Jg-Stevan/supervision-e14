/**
 * ADAPTADOR store-e14 — el punto de costura del TRASPLANTE (kit carga-masiva-
 * supervision-v1, D27): reemplaza al store del flujo individual de
 * digielect14 (`useE14Store`, 1.494 líneas) con la SUPERFICIE EXACTA que
 * consume el módulo masiva (5 puntos, kit T3) sobre el dashboard de
 * SUPERVISION — nada del motor toca el store viejo:
 *
 *   · `online`            → estado de red del navegador (listeners propio).
 *   · `registrarEnvioMasiva(acta)` → PUBLICA el acta en el monitor de
 *     supervision vía `publicarActaMasiva()` (actas-runtime.ts): la
 *     clasificación AUTO (DIVIPOL del OCR) mapea a `idEnlace` (D22),
 *     se valida contra el catálogo (D25 a/b) y la foto procesada del
 *     pipeline viaja como `FotoActa` (D23/D24). Fire-and-forget: jamás
 *     bloquea el runner (RL-e65b-3). Solo AUTO se publica — SUGERIDA/
 *     MANUAL no tienen join confiable (honestidad: sin inventar datos).
 *   · `contarMotivoNoEnvioActa(acta)` → mismas claves del original
 *     (advertencia:<techo> · revision:clasif-<nivel>[:motivo] ·
 *     rechazo:<tipo>) sobre estado local del adaptador.
 *   · `abrirActaMasiva(id)` / `cerrarActaMasiva()` → carga el acta de IDB
 *     (masiva/cola) y la expone en `actaActual` — MasivaView la muestra
 *     en SU modal de revisión (aquí no existe la vista REVISIÓN del
 *     digitalizador: el escaneo individual vive en su propio repo).
 *   · `publicaciones` → desenlace de la publicación por acta.id (ok/bloqueada
 *     + motivo D25) — el modal de revisión muestra "VER EN MONITOR" solo
 *     cuando el acta aterrizó en el catálogo.
 *
 * El envío NO sube binarios a ningún servidor (D8 — export estático): la
 * "publicación" es el registro en memoria de sesión del dashboard + el
 * ledger local de enviadas (masiva/historico, IDB). El ledger remoto D1 de
 * digielect14 queda fuera de este port (sin backend aquí; su cliente
 * fail-soft queda inerte y documentado).
 */

import { create } from "zustand";
import { publicarActaMasiva, type ResultadoPublicacion } from "@/modules/supervision/data/actas-runtime";
// KIT recepcion-actas-v1 (D28): el desenlace SIN_JOIN nunca llega a
// publicarActaMasiva — se registra aquí, donde se decide (log de recepción).
import { registrarRecepcion } from "@/modules/supervision/data/recepcion-log";
import { leerRegistro } from "../lib/e14/masiva/cola";
import type { Acta } from "../lib/e14/types";
import { logger } from "../lib/logger";

/** Desenlace de la publicación de UN acta en el monitor (por acta.id). */
export interface PublicacionActa {
  estado: "publicando" | "publicada" | "bloqueada" | "sin-join";
  /** Clave `${idEnlace}::${mesa}` cuando hay join. */
  clave?: string;
  /** Motivo de cuarentena D25 (solo bloqueada). */
  motivo?: string;
}

interface EstadoE14 {
  /** Conexión del momento (masiva/runner la consulta al enviar). */
  online: boolean;
  /** Acta abierta desde la bandeja (modal de revisión de MasivaView). */
  actaActual: Acta | null;
  /** Contador de motivos de no-envío (mismas claves del repo origen). */
  motivosNoEnvio: Record<string, number>;
  /** Desenlace de la publicación en el monitor, por acta.id. */
  publicaciones: Record<string, PublicacionActa>;
  registrarEnvioMasiva: (acta: Acta) => void;
  contarMotivoNoEnvioActa: (acta: Acta) => void;
  abrirActaMasiva: (id: string) => Promise<void>;
  cerrarActaMasiva: () => void;
}

const contadosNoEnvio = new Set<string>();

/** idEnlace (D22) desde la clasificación AUTO, normalizado a la convención
 * del catálogo de supervision (dep 2 · mun 3 · zona 3 · puesto 2 dígitos —
 * la zona impresa "05" viaja verbatim en `impresion`, el join usa "005").
 * Exportado: el modal de revisión de MasivaView lo usa para VER EN MONITOR. */
export function joinDeActa(acta: Acta): { idEnlace: string; mesa: string; tipo: "TRANSMISION" | "DELEGADOS" } | null {
  const c = acta.clasificacion;
  if (!c) return null;
  if (
    c.nivel !== "AUTO" ||
    !c.departamento ||
    !c.municipio ||
    !c.zona ||
    !c.puesto ||
    c.mesa == null ||
    !c.tipo
  ) {
    return null;
  }
  const idEnlace = [
    c.departamento.codigo.padStart(2, "0"),
    c.municipio.codigo.padStart(3, "0"),
    c.zona.codigo.padStart(3, "0"),
    c.puesto.codigo.padStart(2, "0"),
  ].join("_");
  return { idEnlace, mesa: String(c.mesa).padStart(3, "0"), tipo: c.tipo };
}

/** Dimensions de la foto (dataURL) para `FotoActa` — la medición real vive
 * en supervision/data/actas-runtime.ts (única fuente); aquí solo se consume. */

/** Publicación en el monitor de supervision (D23/D24/D25) — la completación
 * del trasplante: lo que masiva escanea y clasifica, supervision lo ubica. */
async function publicarDesdeActa(
  acta: Acta,
  marcar: (p: PublicacionActa) => void,
): Promise<void> {
  const join = joinDeActa(acta);
  if (!join) {
    // Sin clasificación AUTO no hay join confiable — SOLO registro local
    // (el acta ya quedó ENVIADA en la cola; honestidad ante todo).
    // D28 — recepción: la llegada SÍ se registra (SIN_JOIN) para que la
    // vista Recepción la muestre; sin inventar idEnlace/mesa/formulario.
    registrarRecepcion({
      fecha: Date.now(),
      origen: "carga-masiva",
      estado: "SIN_JOIN",
      idEnlace: "—",
      mesa: "—",
      formulario: null,
      paginaIndex: null,
      paginaTotal: null,
      srcFoto: acta.fotoProcesada ?? acta.fotoOriginal ?? null,
      pais: null,
      lugar: null,
      motivo: "sin clasificación AUTO — sin join confiable (solo registro local)",
      score: acta.score,
      statusActa: acta.status,
    });
    marcar({ estado: "sin-join" });
    return;
  }
  const { idEnlace, mesa } = join;
  const c = acta.clasificacion!;
  const formulario = join.tipo; // TipoCopia ≡ FormularioTipo (guard en joinDeActa)
  const paginaIndex = c.pagina?.index ?? acta.pagina?.index ?? 1;
  const paginaTotal = c.pagina?.total ?? acta.pagina?.total ?? 1;
  const srcFoto = acta.fotoProcesada ?? acta.fotoOriginal ?? null;
  const resultado: ResultadoPublicacion = await publicarActaMasiva({
    idEnlace,
    mesa,
    formulario,
    paginaIndex,
    paginaTotal,
    srcFoto,
    impresion: {
      consulado: c.departamento!.codigo,
      pais: `${c.municipio!.codigo} - ${c.municipio!.nombre}`,
      zona: c.zona!.codigo, // verbatim impreso (el catálogo usa 3 dígitos)
      puesto: c.puesto!.codigo,
      mesa,
      lugar: c.puesto!.nombre,
      barcode: acta.codigoBarras || undefined,
      etiquetaFormulario: formulario === "TRANSMISION" ? "TRANSMISIÓN" : "CÓNSUL/EMBAJADOR",
    },
    nombreArchivo: `E14_${idEnlace}_${mesa}_${formulario}-${paginaIndex}.jpg`,
    score: acta.score,
    statusActa: acta.status,
  });
  if (resultado.ok) {
    marcar({ estado: "publicada", clave: resultado.clave });
    logger.info(`[e14] masiva → supervision: acta publicada ${resultado.clave} (pág ${paginaIndex})`);
  } else {
    // Cuarentena D25 — visible en consola (mismo gesto del loader estático)
    // y en el modal de revisión de la fila.
    console.warn(`BLOQUEADA: carga-masiva ${resultado.clave} — ${resultado.motivo}`);
    marcar({ estado: "bloqueada", clave: resultado.clave, motivo: resultado.motivo });
  }
}

function onlineInicial(): boolean {
  if (typeof window === "undefined") return true;
  return window.navigator.onLine;
}

export const useE14Store = create<EstadoE14>()((set, get) => ({
  online: onlineInicial(),
  actaActual: null,
  motivosNoEnvio: {},
  publicaciones: {},

  registrarEnvioMasiva: (acta) => {
    // Fire-and-forget (el runner jamás espera la publicación — RL-e65b-3).
    const id = acta.id;
    set((prev) => ({
      publicaciones: { ...prev.publicaciones, [id]: { estado: "publicando" } },
    }));
    void publicarDesdeActa(acta, (p) =>
      set((prev) => ({ publicaciones: { ...prev.publicaciones, [id]: p } })),
    ).catch((error) => {
      // La publicación JAMÁS tumba el envío — queda documentada y bloqueada.
      logger.info(`[e14] masiva → supervision: publicación falló (${String(error)})`);
      set((prev) => ({
        publicaciones: {
          ...prev.publicaciones,
          [id]: { estado: "bloqueada", motivo: "error interno de publicación" },
        },
      }));
    });
  },

  contarMotivoNoEnvioActa: (acta) => {
    // MISMAS claves del repo origen (kit e14-carga-masiva-v1 T3.2 — lógica
    // extraída de analisisCompletado): mismo Set anti-dup por id, mismo
    // incremento. El balde fino e63f viaja también (solo-aditivo).
    if (contadosNoEnvio.has(acta.id)) return;
    let clave: string | null = null;
    if (acta.status === "ADVERTENCIA") {
      const techo = acta.diagnostico?.score?.techos[0];
      clave = techo ? `advertencia:${techo}` : "advertencia:sin-diag";
    } else if (acta.status === "EN_REVISION_HUMANA") {
      const nivel = acta.clasificacion?.nivel;
      clave = nivel ? `revision:clasif-${nivel}` : "revision:sin-diag";
      const motivo = acta.clasificacion?.clasifDebil;
      if (nivel && motivo) {
        const actualesFino = get().motivosNoEnvio;
        const claveFina = `revision:clasif-${nivel}:${motivo}`;
        set({
          motivosNoEnvio: {
            ...actualesFino,
            [claveFina]: (actualesFino[claveFina] ?? 0) + 1,
          },
        });
      }
    } else if (acta.status === "RECHAZADA") {
      clave = `rechazo:${acta.rechazo?.tipo.toLowerCase() ?? "desconocido"}`;
    }
    if (clave) {
      contadosNoEnvio.add(acta.id);
      const actuales = get().motivosNoEnvio;
      set({
        motivosNoEnvio: { ...actuales, [clave]: (actuales[clave] ?? 0) + 1 },
      });
    }
  },

  abrirActaMasiva: async (id) => {
    // T3.4 adaptado: acta de IDB → modal de revisión de MasivaView
    // (aquí no existe la vista REVISIÓN del digitalizador individual).
    try {
      const registro = await leerRegistro(id);
      if (!registro.acta) return; // sin desenlace aún — nada que abrir
      set({ actaActual: registro.acta });
    } catch {
      /* registro ausente/IDB caído → la bandeja queda como está (kit §3) */
    }
  },

  cerrarActaMasiva: () => set({ actaActual: null }),
}));

// Listeners de red (client-only — el prerender del export estático no los
// registra; en el navegador quedan vivos para el drenaje de la cola).
if (typeof window !== "undefined") {
  const sincronizarRed = () =>
    useE14Store.setState({ online: window.navigator.onLine });
  window.addEventListener("online", sincronizarRed);
  window.addEventListener("offline", sincronizarRed);
}

/** Atajos standalone (los usa MasivaView sin colgarse del hook). */
export function cerrarActaMasiva(): void {
  useE14Store.getState().cerrarActaMasiva();
}
