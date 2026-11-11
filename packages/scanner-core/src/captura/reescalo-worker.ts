/**
 * E2 (Ola E) — cliente del WORKER de reescalado de importación.
 *
 * El trabajo pesado (decode 12 MP + resize + encode JPEG) deja el hilo
 * principal: `useDestello` manda el File y recibe el Blob reescalado. La ruta
 * del hilo principal queda intacta como RED — si el worker no está, falló una
 * vez o no responde a tiempo, el llamador sigue con su camino de siempre
 * (`reescalarFueraDelHilo` local). Mismo patrón que el fallback-canvas:
 * worker roto ⇒ sesión en modo local, nunca reintento.
 */
import { publicBaseEfectivo } from "../dominio/entorno";

export interface ResultadoReescalo {
  jpeg: Blob;
  ancho: number;
  alto: number;
  /** Tiempo DENTRO del worker — el main no lo puede medir. */
  msDecode: number;
  msEncode: number;
}

interface RespuestaOk extends ResultadoReescalo {
  id: number;
  ok: true;
}
interface RespuestaMal {
  id: number;
  ok: false;
  error: string;
}
type Respuesta = RespuestaOk | RespuestaMal;

let worker: Worker | null = null;
let roto = false;
let seq = 0;
const pendientes = new Map<
  number,
  { resolver: (r: ResultadoReescalo) => void; rechazar: (e: Error) => void }
>();

/** ¿La ruta en worker está disponible en ESTE entorno? */
export function reescaloImportEnWorkerHabilitado(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker === "function" &&
    typeof createImageBitmap === "function" &&
    typeof OffscreenCanvas === "function" &&
    !roto
  );
}

function romper(motivo: string): void {
  roto = true;
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* noop */
    }
    worker = null;
  }
  for (const [id, p] of pendientes) {
    pendientes.delete(id);
    p.rechazar(new Error(`reescalo-worker: ${motivo}`));
  }
}

function obtenerWorker(): Worker {
  if (!worker) {
    const w = new Worker(`${publicBaseEfectivo()}/scanner/reescalar-import.worker.js`, {
      name: "reescalar-import-v1",
    });
    w.onmessage = (e: MessageEvent<Respuesta>) => {
      const p = pendientes.get(e.data.id);
      if (!p) return;
      pendientes.delete(e.data.id);
      if (e.data.ok) {
        const { jpeg, ancho, alto, msDecode, msEncode } = e.data;
        p.resolver({ jpeg, ancho, alto, msDecode, msEncode });
      } else {
        p.rechazar(new Error(e.data.error));
      }
    };
    w.onerror = () => romper("onerror del worker");
    worker = w;
  }
  return worker;
}

/** Re-escalfa el File EN WORKER. `null` = no se pudo (entorno sin soporte,
 *  worker roto o fallo) — el llamador cae a su ruta local. */
export async function reescalarImportEnWorker(
  blob: Blob,
  dims: { w: number; h: number },
  cap: number,
  calidad: "medium" | "high",
  tiempoMaxMs = 45_000,
): Promise<ResultadoReescalo | null> {
  if (!reescaloImportEnWorkerHabilitado()) return null;
  let w: Worker;
  try {
    w = obtenerWorker();
  } catch {
    romper("no se pudo crear el worker");
    return null;
  }
  const id = ++seq;
  const respuesta = new Promise<ResultadoReescalo>((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar });
  });
  const reloj = setTimeout(() => {
    const p = pendientes.get(id);
    if (!p) return;
    pendientes.delete(id);
    p.rechazar(new Error("reescalo-worker: timeout"));
    romper(`sin respuesta en ${Math.round(tiempoMaxMs / 1000)} s`);
  }, tiempoMaxMs);
  try {
    w.postMessage({ id, blob, ancho: dims.w, alto: dims.h, cap, calidad });
    return await respuesta;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
    pendientes.delete(id);
  }
}
