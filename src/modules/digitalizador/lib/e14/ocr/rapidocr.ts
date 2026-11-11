/**
 * FASE 3 (mapa v2.3) — ocr/rapidocr.ts REESCRITO: el motor vive en el
 * PAQUETE (@jg-stevan/scanner-core/ocr/rapidocr — base de digielect14 sin
 * router + la salud del motor que S aportó). El wiring del ROUTER MUERE
 * (§4.1): resolverMotor/motorElegidoActual/sonda de carga ya no existen —
 * el orden de motores es CONFIGURACIÓN (ocr/motor.ts del paquete) y la
 * decisión la toma la CASCADA validando después de cada intento.
 *
 * Este archivo ahora SOLO: (1) inyecta lo adaptativo de S (gama → topeThreads,
 * flags → cola global), (2) fija el langPath de Tesseract de S, (3) re-exporta
 * el contrato completo del motor, (4) mantiene motorOcrActual para los
 * consumidores históricos (metricas) — ahora desde estado-motores.
 */
import { configurarPlan } from "@jg-stevan/scanner-core/dominio/plan";
import { publicBaseEfectivo } from "@jg-stevan/scanner-core/dominio/entorno";
import {
  configurarColaGlobalOcr,
  rapidOcrReiniciar as rapidOcrReiniciarPaquete,
} from "@jg-stevan/scanner-core/ocr/rapidocr";
import { configurarTesseract, tesseractReiniciar } from "@jg-stevan/scanner-core/ocr/motores/tesseract";
import { flagsMasivaEfectivos } from "../gama";
import { leerFlags } from "../flags";
import { motorOcrActual } from "./estado-motores";

// Tope de hilos: la gama adaptativa de S (cap por hardware, BAJO 2 — D74).
configurarPlan({
  topeThreadsOcr: () => {
    try {
      return Math.min(
        flagsMasivaEfectivos().ocrThreadsTope,
        navigator.hardwareConcurrency || 1,
      );
    } catch {
      return 1;
    }
  },
});

// Cola FIFO global (pool≥2 del runner — kit ocr-cola-global-v1 de S).
configurarColaGlobalOcr(() => {
  try {
    return leerFlags().ocrColaGlobal;
  } catch {
    return false;
  }
});

// Motor Tesseract ÚNICO (3.2) con el langPath de ESTA app (D88: versión del
// sabor servido, para invalidar IndexedDB/SW/HTTP en equipos con caché previa).
// El prefijo es el basePath REAL del deploy (S se sirve bajo /supervision).
configurarTesseract({ langPath: `${publicBaseEfectivo()}/models/tesseract/4.0.0_fast` });

export * from "@jg-stevan/scanner-core/ocr/rapidocr";

// Salud del motor — el reinicio también suelta el worker de Tesseract
// (comportamiento que el wrapper viejo garantizaba al panel).
export async function rapidOcrReiniciar(): Promise<void> {
  await Promise.allSettled([rapidOcrReiniciarPaquete(), tesseractReiniciar()]);
}

export { motorOcrActual };
export type { MotorOcrVivo } from "./estado-motores";
