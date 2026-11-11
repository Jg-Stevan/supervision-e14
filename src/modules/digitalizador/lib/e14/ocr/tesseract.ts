/**
 * Motor Tesseract de ESTA app — MISMO motor del paquete
 * (@jg-stevan/scanner-core/ocr/motores/tesseract), langPath de S y el
 * contrato de D (2026-11-10): sabor `fast` (spa 4.0.0_fast), throw en
 * fallo/sin texto para que la cascada caiga a RapidOCR.
 */
import {
  configurarTesseract,
  tesseractReconocer,
  tesseractInit,
  tesseractReiniciar,
} from "@jg-stevan/scanner-core/ocr/motores/tesseract";
import { publicBaseEfectivo } from "@jg-stevan/scanner-core/dominio/entorno";

configurarTesseract({
  langPath: `${publicBaseEfectivo()}/models/tesseract/4.0.0_fast`,
});

export { tesseractInit, tesseractReiniciar };

/** Contrato de la cascada: throw en fallo ⇒ el caller sigue con RapidOCR. */
export async function tessReconocer(
  dataUrl: string,
  presupuestoMs?: number,
  onProgreso?: (p: number) => void,
): Promise<{ texto: string; conf: number }> {
  const r = await tesseractReconocer(dataUrl, presupuestoMs, onProgreso);
  if (!r || r.texto.length === 0) {
    throw new Error("tess-fast: sin resultado — la cascada cae a RapidOCR");
  }
  return { texto: r.texto, conf: r.confMedia };
}
