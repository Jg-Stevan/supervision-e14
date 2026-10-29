/**
 * KIT puente-remoto-v1 — PRODUCTOR REMOTO de actas: trae del HUB
 * (e14-puente, workers.dev — vía el proxy `/api/supervision/remotas`)
 * las actas que el digitalizador publicó y las inyecta en el pipeline
 * local `publicarActaMasiva()` (actas-runtime).
 *
 * POR QUÉ AQUÍ: la recepción en memoria YA EXISTE — `publicarActaMasiva`
 * hace la validación DIVIPOLA (D25 a/b/d), el merge runtime por
 * `${idEnlace}::${mesa}`, emite el evento a `suscribirseActasRuntime`
 * (monitor/KPIs/notificaciones/toasts vía datos-provider) y registra en
 * el recepcion-log (vista Recepción + badge). Este módulo solo ES EL
 * PRODUCTOR: no duplica validación ni toca el RUNTIME directamente.
 *
 * IDEMPOTENCIA (§0-7 del kit): cada acta del hub trae un `hash` (sha256
 * del lote). `VISTOS` memoriza los hashes procesados ESTA SESIÓN — el
 * mismo hash jamás se publica dos veces, así la primera sincronización
 * (desde=0, histórico completo) y el polling (desde=último ts) pueden
 * solaparse sin duplicar entradas en el log de recepción.
 *
 * MEMORIA DE SESIÓN (§0-5 / D8): `VISTOS` y `ULTIMO_TS` viven en el
 * módulo — recargar la página los restablece (y la primera sync repuebla
 * todo el runtime desde el hub: mismo comportamiento del resto del
 * dashboard, sin persistencia).
 *
 * CLIENT-SAFE: fetch RELATIVO al proxy propio — NUNCA fetch absoluto al
 * workers.dev desde el cliente (el proxy resuelve el hub en el servidor
 * con `E14_PUENTE_URL`). Sin libs nuevas (patrón del módulo).
 */

import type { FormularioTipo } from "../domain/acta";
import {
  publicarActaMasiva,
  type EntradaActaMasiva,
} from "./actas-runtime";

/** Acta tal como viaja en el hub: la forma EXACTA de `EntradaActaMasiva`
 * + los extras del puente. `formulario` llega como string crudo — aquí
 * se estrecha a FormularioTipo (solo TRANSMISION|DELEGADOS pasan). */
interface ActaRemota {
  hash: string;
  dispositivo: string;
  ts: number;
  idEnlace: string;
  mesa: string;
  formulario: string;
  paginaIndex: number;
  paginaTotal: number;
  srcFoto: string | null;
  impresion: EntradaActaMasiva["impresion"];
  nombreArchivo: string;
  score: number;
  statusActa: string;
}

interface RespuestaHub {
  ok?: boolean;
  ahora?: number;
  total?: number;
  actas?: ActaRemota[];
}

/** Desenlace de una sincronización (el poller del hook lo consume). */
export interface ResumenSincronizacion {
  /** false → el proxy/hub falló (el poller sobrevive y reintenta). */
  conectado: boolean;
  /** Actas NUEVAS vistas este ciclo (no estaban en VISTOS). */
  nuevas: number;
  /** Aterrizaron en el runtime (validación D25 OK). */
  publicadas: number;
  /** Bloqueadas por el runtime o con formulario fuera del dominio. */
  bloqueadas: number;
  error: string | null;
}

const VISTOS = new Set<string>();
let ULTIMO_TS = 0;

/** Telemetría del módulo (depuración del puente en consola/tests). */
export function estadoPuenteRemoto(): { vistos: number; ultimoTs: number } {
  return { vistos: VISTOS.size, ultimoTs: ULTIMO_TS };
}

/** Estrecha el formulario crudo del hub al dominio: solo acepta
 * "TRANSMISION" | "DELEGADOS" — cualquier otro valor se filtra. */
function estrecharFormulario(
  formulario: string
): FormularioTipo | null {
  return formulario === "TRANSMISION" || formulario === "DELEGADOS"
    ? formulario
    : null;
}

/** Un ciclo de sincronización: trae el lote desde `ULTIMO_TS` y publica
 * cada acta nueva. JAMÁS lanza — el poller (use-puente-remoto) sobrevive
 * a hubs caídos y reintenta en el siguiente ciclo. */
export async function sincronizarRemota(): Promise<ResumenSincronizacion> {
  try {
    const res = await fetch(
      `/api/supervision/remotas?desde=${encodeURIComponent(String(ULTIMO_TS))}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return {
        conectado: false,
        nuevas: 0,
        publicadas: 0,
        bloqueadas: 0,
        error: `HUB_INALCANZABLE (HTTP ${res.status})`,
      };
    }
    const data = (await res.json()) as RespuestaHub;
    const actas = Array.isArray(data?.actas) ? data.actas : [];

    let publicadas = 0;
    let bloqueadas = 0;
    let nuevas = 0;

    for (const acta of actas) {
      // Defensivo: fila malformada del hub no rompe el lote.
      if (!acta || typeof acta.hash !== "string" || acta.hash === "") continue;
      // Idempotencia: hash ya procesado esta sesión → saltar.
      if (VISTOS.has(acta.hash)) continue;
      VISTOS.add(acta.hash);
      nuevas += 1;
      ULTIMO_TS = Math.max(ULTIMO_TS, typeof acta.ts === "number" ? acta.ts : 0);

      const formulario = estrecharFormulario(acta.formulario ?? "");
      if (!formulario || !acta.impresion || typeof acta.idEnlace !== "string") {
        // Fuera del dominio (formulario no reconocido / fila incompleta):
        // queda contada, no publicada — honestidad del embudo.
        bloqueadas += 1;
        continue;
      }

      const resultado = await publicarActaMasiva({
        idEnlace: acta.idEnlace,
        mesa: acta.mesa,
        formulario,
        paginaIndex: acta.paginaIndex,
        paginaTotal: acta.paginaTotal,
        srcFoto: acta.srcFoto ?? null,
        impresion: acta.impresion,
        nombreArchivo: acta.nombreArchivo,
        score: acta.score,
        statusActa: acta.statusActa,
      });
      if (resultado.ok) publicadas += 1;
      else bloqueadas += 1;
    }

    return { conectado: true, nuevas, publicadas, bloqueadas, error: null };
  } catch (error) {
    // Hub caído / red cortada / JSON inválido: SIN lanzar — el poller
    // marca desconexión y reintenta en 8 s.
    return {
      conectado: false,
      nuevas: 0,
      publicadas: 0,
      bloqueadas: 0,
      error: `HUB_INALCANZABLE: ${String(error).slice(0, 160)}`,
    };
  }
}
