/** Ítem 3.3: motor del sidecar en el paquete; URL de S inyectada
 * (flags.ocrNativoUrl — validador SEC-10: solo localhost). */
import { configurarNativo } from "@jg-stevan/scanner-core/ocr/motores/nativo";
import { leerFlags } from "../flags";

try {
  configurarNativo(leerFlags().ocrNativoUrl ?? null);
} catch {
  configurarNativo(null);
}

export * from "@jg-stevan/scanner-core/ocr/motores/nativo";
