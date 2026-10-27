/**
 * KIT e14-obs-hang-atribucion-v1 (§A, T1) — registro de la operación ACTIVA
 * (D58): la última operación REGISTRADA del sistema, para que cada hang
 * emita `op`/`opEdadMs` y el export la agregue en `hangPorOp` (§B).
 *
 * Módulo PURO SIN imports (hoja — ciclo imposible; precedente masiva→obs:
 * runner.ts ya importa ../obs/dispositivo). El estado vive en module state:
 * escribir es barato (2 asignaciones) → los hooks llaman en cada señal sin
 * throttle (§A.2).
 *
 * SEMÁNTICA HONESTA (§A): `op` es la «última operación REGISTRADA», NO
 * prueba de causalidad — la correlación la dan los datos con `edadMs`
 * (el sesgo es parte del dato). Capa-0 QR in-pool NO etiquetable sin tocar
 * runner.ts (diff VACÍO — red line): quien corra tras la última marca
 * registrada se lee con esa edad. `operacionActa()` → {op: null, edadMs:
 * null} si nunca se marcó — jamás inventar "ocioso".
 *
 * VOCABULARIO v1 (append-only — nuevos valores SOLO al final de esta lista):
 *  · Pipeline (el MISMO bucket de bucketDeVida, runner-vida.ts): "preparando" | "deteccion" | "ocr" | "verificacion" — hook §A.2.
 *  · Sitios main-thread pesados: "dhash" (§A.3) · "informe" (§A.4) · "qr-sondeo-ingesta" (§A.5).
 *
 * Sin clear: las marcas NUNCA se limpian — la edad delata la obsolescencia
 * (un `op` con edad enorme se lee como «no es esto», jamás confunde).
 */

let opActual: string | null = null;
let tsMarca: number | null = null;

/** Registra la operación ACTIVA (module state + ts del momento). Jamás
 *  lanza ni valida vocabulario (los hooks son sitios fijos del repo — el
 *  contrato vive en los comentarios de cada hook, no en runtime). */
export function marcarOperacion(op: string): void {
  opActual = op;
  tsMarca = Date.now();
}

/** Última operación REGISTRADA + edad (ms) de la marca al momento de la
 *  consulta. Sin marca previa → {op: null, edadMs: null} (honesto — jamás
 *  inventar "ocioso"). Edad SIEMPRE ≥ 0 (reloj retroactivo → 0). */
export function operacionActa(): { op: string | null; edadMs: number | null } {
  if (opActual === null || tsMarca === null) return { op: null, edadMs: null };
  const edad = Date.now() - tsMarca;
  return { op: opActual, edadMs: edad > 0 ? edad : 0 };
}

/** Prueba interna (tests): reset del estado del módulo. */
export function __resetOperacionParaTest(): void {
  opActual = null;
  tsMarca = null;
}
