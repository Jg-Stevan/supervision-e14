/**
 * Adaptador app → motor de fusión (KIT fusion-evidencia-divipol-v1, D89).
 *
 * Traduce la lectura CRUDA del OCR (`leerCamposCrudos`, mismas anclas §3.2 del
 * clasificador) al contrato `LecturaActa` del motor. Sin etiqueta de calidad
 * por campo, presente = legible y ausente = ilegible: la fusión ya degrada
 * por vías (una lectura con ruido entra como legible y se resuelve por
 * permutación/fuzzy). Vive en la app y no en el paquete porque es glue de
 * este pipeline — el motor compartido solo conoce `fusionar(lectura, base)`.
 */
import type { CamposCrudosE14 } from "@jg-stevan/scanner-core/dominio/clasificador";
import type { CampoLeido, LecturaActa } from "@jg-stevan/scanner-core/dominio/fusion-tipos";

function campo(valor: string | null): CampoLeido {
  return valor ? { valor, calidad: "legible" } : { valor: "", calidad: "ilegible" };
}

export function lecturaParaFusion(campos: CamposCrudosE14): LecturaActa {
  return {
    departamento: campo(campos.departamento),
    paisCodigo: campo(campos.paisCodigo),
    paisNombre: campo(campos.paisNombre),
    zona: campo(campos.zona),
    puesto: campo(campos.puesto),
    mesa: campo(campos.mesa),
    lugar: campo(campos.lugar),
    barcode: campo(campos.barcode),
    verpag: campo(campos.verpag),
    tipoBanner: campo(campos.tipoBanner),
  };
}
