"use client";

/**
 * R8 — SPLIT del store (misión etapa 2, punto 4): API del mini-store masiva
 * INYECTADA al núcleo. Rompe el ciclo de imports `store↔runner↔precalor`
 * (store.ts:50,56 ← runner.ts ← precalor.ts — documentado en el informe de
 * zona como deliberado por TDZ pero frágil) por INYECCIÓN: el núcleo ya NO
 * importa `./store`; recibe la API del store Zustand por `cablearStoreMasiva`
 * (store.ts la entrega UNA vez, al final de su evaluación de módulo, después
 * de `create`) y la consume vía `storeMasiva()`.
 *
 * SENTIDO ÚNICO restante: `store.ts → núcleo` (runner/precalor/dedup-*).
 * Ningún módulo del núcleo importa `./store` — la evidencia del grafo sin
 * ciclos vive en `docs/informes/R8.md` (madge + trazado manual).
 *
 * La API PÚBLICA del store Zustand (`useMasivaStore`) NO cambia — sus
 * consumidores (components/e14/screens/masiva/, zona R6) siguen importando
 * de `./store` byte a byte.
 */
import type { MasivaStore } from "./tipos";

/** Forma estructural de la API de un store zustand (`useMasivaStore` tal
 *  cual — getState/setState/subscribe). El tipo del ESTADO vive en tipos.ts
 *  (MasivaStore) para que el núcleo pueda tiparse sin importar store.ts. */
export interface MasivaStoreApi {
  getState: () => MasivaStore;
  setState: (
    parcial: Partial<MasivaStore> | ((estado: MasivaStore) => Partial<MasivaStore>),
  ) => void;
  subscribe: (listener: (estado: MasivaStore, previo: MasivaStore) => void) => () => void;
}

let api: MasivaStoreApi | null = null;

/** Cableado ÚNICO (store.ts, tras `create`): entrega la API del store al
 *  núcleo. Idempotente (re-cablear con la misma API es no-op real). */
export function cablearStoreMasiva(nueva: MasivaStoreApi): void {
  api = nueva;
}

/** Punto de consumo del núcleo (`storeMasiva().getState()`). Falla RÁPIDO y
 *  con traza clara si algún módulo del núcleo se usa sin el store montado —
 *  jamás silencio (doctrina del conservador: rechazar con traza > improvisar). */
export function storeMasiva(): MasivaStoreApi {
  if (!api) {
    throw new Error("[e14] masiva sin cablear: el mini-store debe evaluarse antes del núcleo");
  }
  return api;
}
