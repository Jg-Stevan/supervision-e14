/**
 * PUNTO ÚNICO DE INTERCAMBIO (SPEC §2) — fábrica del paquete (FASE 1).
 *
 * En los repos este módulo instanciaba el RealCoreBridge directamente; el
 * real es el composition root de CADA app (scanner-core-bridge.ts — FASE 4
 * del mapa, se queda por app). El paquete exporta la FÁBRICA: cada app crea
 * su getBridge inyectando su bridge real y las vistas no se enteran
 * (get-bridge sigue siendo el punto único de intercambio en cada repo).
 */
import { CompositeBridge, type E14Bridge } from "./bridge";

export function crearGetBridge(real: () => E14Bridge): () => E14Bridge {
  let instancia: E14Bridge | null = null;
  return () => {
    if (!instancia) {
      instancia = new CompositeBridge(real());
    }
    return instancia;
  };
}
