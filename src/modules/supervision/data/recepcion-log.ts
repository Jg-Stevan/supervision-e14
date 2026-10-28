/**
 * REGISTRO DE RECEPCIÓN de actas (kit recepcion-actas-v1, D28) — el log
 * en vivo de TODO lo que va llegando al monitor.
 *
 * CONTRATO: cada acta que entra al sistema deja aquí UNA entrada por
 * PÁGINA (mismo grano del pipeline masiva: una foto = una fila = una
 * página). Tres desenlaces, los mismos del kit D27:
 *   · PUBLICADA  — aterrizó en el monitor (join `idEnlace` D22 válido).
 *   · BLOQUEADA  — cuarentena D25: validación (a)/(b)/(d) falló; con motivo.
 *   · SIN_JOIN   — llegó sin clasificación AUTO: sin join confiable; solo
 *                  registro local (honestidad — jamás inventar ubicación).
 *
 * QUIÉN ESCRIBE (punto único de verdad):
 *   · `actas-runtime.publicarActaMasiva()` → PUBLICADA y BLOQUEADA (es el
 *     embudo por donde pasa toda publicación del digitalizador).
 *   · `store-e14.publicarDesdeActa()` → SIN_JOIN (ese desenlace nunca
 *     llega a publicarActaMasiva — se registra donde se decide).
 *
 * ORÍGENES:
 *   · "carga-masiva"     — llegadas EN VIVO del módulo digitalizador.
 *   · "ingesta-inicial"  — el ancla estático SUP-6 (manifest actas-reales):
 *     se siembra 1 vez perezosa (`asegurarSemilla`) con desfases fijos —
 *     misma disciplina determinística del mock (§0-7: nada aleatorio).
 *
 * MEMORIA DE SESIÓN (§0-5 / D8): sin persistencia y sin backend — recargar
 * la página restablece el log. Consumidores: la vista RECEPCIÓN
 * (`vista-recepcion.tsx`, suscripción) y el badge del sidebar (shell).
 */

import type { FormularioTipo } from "../domain/acta";
import { cargarActasReales } from "./actas-reales/actas-reales";

/** Desenlace de la recepción (mismos términos del kit D27/PublicacionChip). */
export type EstadoRecepcion = "PUBLICADA" | "BLOQUEADA" | "SIN_JOIN";

/** De dónde llegó el acta. */
export type OrigenRecepcion = "carga-masiva" | "ingesta-inicial";

/** UNA página recibida (grano del pipeline: 1 foto = 1 entrada). */
export interface EntradaRecepcion {
  id: string;
  /** Epoch ms de la llegada. */
  fecha: number;
  origen: OrigenRecepcion;
  estado: EstadoRecepcion;
  /** Clave de join D22 ("—" si SIN_JOIN — no hay dato confiable). */
  idEnlace: string;
  /** Mesa 3 dígitos ("—" si SIN_JOIN). */
  mesa: string;
  /** null en SIN_JOIN (sin clasificación AUTO no se inventa formulario). */
  formulario: FormularioTipo | null;
  /** Página recibida (1-based) y total del formulario; null en SIN_JOIN. */
  paginaIndex: number | null;
  paginaTotal: number | null;
  /** Miniatura de la foto recibida (dataURL/asset); null = llegó sin foto. */
  srcFoto: string | null;
  /** Encabezado impreso verbatim (país y lugar del puesto), si viajó. */
  pais: string | null;
  lugar: string | null;
  /** Motivo de cuarentena D25 / de sin-join (solo los dos estados). */
  motivo?: string;
  /** Telemetría de la bandeja del digitalizador (informativo). */
  score?: number;
  statusActa?: string;
  nombreArchivo?: string;
  /** Clave `${idEnlace}::${mesa}` cuando hay join (atajo para VER EN MONITOR). */
  clave?: string;
}

export interface RecepcionPublicada {
  tipo: "recepcion";
  entrada: EntradaRecepcion;
}

type Oyente = (entrada: EntradaRecepcion) => void;

const ENTRADAS: EntradaRecepcion[] = [];
const oyentes = new Set<Oyente>();
let contador = 0;

/** Suscripción a llegadas (patrón del módulo: sin libs nuevas). El oyente
 * caído jamás rompe el registro (mismo gesto de actas-runtime). */
export function suscribirseRecepcion(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function notificar(entrada: EntradaRecepcion) {
  for (const oyente of oyentes) {
    try {
      oyente(entrada);
    } catch {
      /* un oyente caído jamás rompe el registro */
    }
  }
}

/** Registra UNA página recibida (más nuevas primero) y notifica. */
export function registrarRecepcion(
  entrada: Omit<EntradaRecepcion, "id">
): EntradaRecepcion {
  const completa: EntradaRecepcion = {
    ...entrada,
    id: `recepcion-${Date.now()}-${contador++}`,
  };
  ENTRADAS.unshift(completa);
  notificar(completa);
  return completa;
}

/** Copia del log (más nuevas primero). */
export function consultarRecepciones(): EntradaRecepcion[] {
  return [...ENTRADAS];
}

/** Conteo por desenlace (KPIs de la vista; semilla incluida). */
export function contarRecepciones(): {
  total: number;
  publicadas: number;
  bloqueadas: number;
  sinJoin: number;
} {
  let publicadas = 0;
  let bloqueadas = 0;
  let sinJoin = 0;
  for (const e of ENTRADAS) {
    if (e.estado === "PUBLICADA") publicadas += 1;
    else if (e.estado === "BLOQUEADA") bloqueadas += 1;
    else sinJoin += 1;
  }
  return { total: ENTRADAS.length, publicadas, bloqueadas, sinJoin };
}

// ─── Semilla de INGESTA INICIAL (ancla estático SUP-6) ──────────────────────

let sembrado = false;

/**
 * Siembra 1 vez (perezosa) las páginas del ancla estático como llegadas
 * de "ingesta-inicial": esas actas YA entraron al sistema al arrancar la
 * sesión (manifest D24 validado por D25). Desfases FIJOS (sin aleatorio)
 * para que el log muestre una secuencia coherente; recargar restablece.
 * Llamar ANTES de la primera lectura de la vista (idempotente).
 */
export function asegurarSemilla(): void {
  if (sembrado || typeof window === "undefined") return;
  const ingesta = cargarActasReales();
  sembrado = true;
  const ahora = Date.now();
  const MIN = 60_000;
  // Orden de llegada: el manifest trae [TRANSMISION p1-p2, DELEGADOS p1-p2].
  const desfases = [34, 31, 27, 24]; // minutos hacia atrás, fijos (§0-7)
  let i = 0;
  const semilla: EntradaRecepcion[] = [];
  for (const clave of Object.keys(ingesta.actas)) {
    const acta = ingesta.actas[clave];
    for (const formulario of Object.keys(acta.fotos) as FormularioTipo[]) {
      const fotos = acta.fotos[formulario] ?? [];
      for (let p = 0; p < fotos.length; p++) {
        const foto = fotos[p] ?? null;
        const etiqueta =
          formulario === "TRANSMISION" ? "TRANSMISIÓN" : "CÓNSUL/EMBAJADOR";
        semilla.push({
          id: `recepcion-inicial-${contador++}`,
          fecha: ahora - (desfases[i % desfases.length] ?? 30) * MIN,
          origen: "ingesta-inicial",
          estado: "PUBLICADA",
          idEnlace: acta.idEnlace,
          mesa: acta.mesa,
          formulario,
          paginaIndex: p + 1,
          paginaTotal: fotos.length,
          srcFoto: foto ? foto.src : null,
          pais: acta.impresion.pais,
          lugar: acta.impresion.lugar,
          clave,
          nombreArchivo: foto ? foto.archivo : `E14_${clave}_${formulario}-${p + 1}`,
          statusActa: `MANIFEST SUP-6 (${etiqueta})`,
        });
        i++;
      }
    }
  }
  if (semilla.length === 0) return;
  // Insertar manteniendo "más nuevas primero" (las de ingesta son antiguas).
  ENTRADAS.push(...semilla);
  ENTRADAS.sort((a, b) => b.fecha - a.fecha);
}
