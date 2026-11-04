/**
 * KIT e14-ocr-nativo-v1 (FASE 2) — prefetch del ACTA COMPLETA para MASIVA.
 *
 * Una sola ida al sidecar (`POST /acta`) hace lo que en el navegador cuesta
 * ~25 s por acta: detección de quad → warp → sondeo de orientación → filtro
 * b/n → lectura del QR → det+rec. El runner dispara esa ida AL TOMAR la fila
 * (antes de la capa 0) y el pipeline la consume cuando llega a DETECCIÓN, así
 * que el muro nativo corre en paralelo del dedup, del precalor y del decode
 * del master en vez de detrás de ellos.
 *
 * Dos cosas se pagan con ese adelanto, y son el negocio:
 *  · el ladder jsQR/zxing de la capa 0 (8-22 s) desaparece cuando el sidecar
 *    leyó el QR sobre SU warp — mismo Reed-Solomon, mismo payload exacto;
 *  · el det+rec WASM no se paga ni siquiera en la rama de fallback.
 *
 * Doctrina (la misma del sidecar de OCR): ACELERACIÓN, jamás requisito. Flag
 * `actaNativa` apagado, sidecar mudo, timeout, JSON raro, decode imposible →
 * `null` y el pipeline corre como hoy, byte a byte. Score, gate, dedup,
 * completitud, esquinas y envío siguen siendo del producto: el sidecar entrega
 * píxeles y texto, nunca veredictos.
 *
 * LA GARANTÍA DEL FOTOGRAMA: la imagen que se envía es `decodeArchivoMemo`, o
 * sea LITERALMENTE los mismos bytes (ya re-encodeados por el navegador) que el
 * bridge va a decodificar como `fotoOriginal`. El quad normalizado que devuelve
 * el sidecar por lo tanto proyecta sobre la copia del navegador sin depender de
 * que ambos decodifiquen igual — ni EXIF, ni recortes, ni tamaños. Cuando el
 * master D66 existe (File distinto, misma foto) el puente sigue valiendo: el
 * master es `min(1, 3072/lado)` sobre el fotograma ya enderezado — escala
 * UNIFORME, mismo aspect ratio, y un quad en fracciones 0..1 no se entera de
 * la escala. Se apaga sí con D63-B aplicado (ahí el fotograma SÍ cambia).
 */
import { actaNativa, ladoNativoDisponible, sesionesLadoNativo, type ActaNativa } from "../ocr/nativo";
import { decodeArchivoMemo } from "../scanner-core-bridge";
import { leerFlags } from "../flags";
import { logger } from "../../logger";
// e63g — el tope genérico de la casa para promesas que pueden colgarse
// (tríada, jamás throw, sin fugas de timer).
import { conTope } from "./tope";

/** Cuántas idas en vuelo/calentadas se recuerdan. La capa 0 y el pipeline
 *  piden la MISMA acta de la MISMA fila con objetos `File` DISTINTOS: MASIVA
 *  hornea un master D66 (re-encode del fotograma a `min(1, 3072/lado)` —
 *  escala UNIFORME, misma aspect) y el WeakMap por instancia no lo une, así
 *  que pagábamos DOS idas de 10-12 s que se canibalizaban el CPU. La clave es
 *  el ID DE FILA: único por acta (los nombres se repiten en un ZIP de dos
 *  carpetas — con nombre como clave la fila B heredaría el acta de A), estable
 *  entre reintentos y ajena a la instancia del File. FIFO: un lote de 200
 *  actas no retiene 200 imágenes (cada entrada guarda el dataURL del acta). */
const MAX_VUELO = 4;
const vuelo = new Map<string, Promise<ActaNativa | null>>();

/** EL RELÉ (N cadenas round-robin, con N = el pool del sidecar).
 *
 *  EL ORIGEN DEL VUELO ÚNICO: cuando el navegador todavía hacía SU pre-OCR y SU
 *  OCR en WASM, adelantar dos actas era CONTRAPRODUCENTE en la máquina del
 *  dueño (4 núcleos): dos actas simultáneas pasaron de 6 s a 17 s CADA una
 *  (los `--sesiones` se reparten `cpu/n` hilos y el WASM se comía el resto). De
 *  ahí la cadena única.
 *
 *  LO QUE CAMBIÓ: medido nat3 (2026-11-03), abrir el relé a dos vuelos con el
 *  techo de la capa 0 en 20 s seguía perdiendo — 104,6 s contra 82,3 s — porque
 *  las filas que vencían el techo corrían SU pre-OCR y el `detectMs` del
 *  navegador se disparaba de 2,2 a 11 s por acta. Con el techo en 45 s (nat4:
 *  62,2 s) la fila HEREDA el acta y `detectMs` es 0 en las seis: el navegador
 *  espera con los núcleos libres. O sea, la condición del vuelo único era la
 *  PELEA por los núcleos, no el relé.
 *
 *  ASÍ QUE el ancho lo anuncia el propio sidecar (`sesionesLadoNativo` = el
 *  `sesiones` de /salud): N cadenas, nunca más de N POST simultáneos, y el
 *  negocio del adelanto se queda — la ida de la fila k+1 arranca cuando
 *  aterriza la de su cadena, así que el muro por acta es `max(sidecar,
 *  navegador)` en vez de la suma. Sin sondeo bueno, pool 1 o sidecar que no lo
 *  declara ⇒ UNA sola cadena = el relé de vuelo único de siempre, byte a byte.
 *
 *  LA PREPARACIÓN: se probó a meter el sondeo `/salud` y el decode del fotograma
 *  DENTRO del relé para que no hubiese lado muerto entre idas (1,3-4,5 s por
 *  fila): MEDIDO, el lote subió de 1 m 25 s a 1 m 48 s. Ahora entran por fuera
 *  (`nuevaIda`), que es otra cosa: lo único que se adelanta es el decode. */
let colas: Promise<void>[] = [];
let turno = 0;

function vuelosNativo(): number {
  return Math.max(1, Math.min(4, sesionesLadoNativo()));
}

function nuevaIda(archivo: File): Promise<ActaNativa | null> {
  // EL PREPADO (sondeo + decode del fotograma) va FUERA del relé, el POST va
  // dentro. Medido con el prepado dentro: cada hueco entre acta e acta pagaba
  // 1,7-2,8 s de sidecar PARADO mientras el navegador hacía su `decodeArchivoMemo`
  // (canvas + base64 de ~3 MB, un solo hilo). Con el prepado fuera, ese hilo
  // trabaja en paralelo de las actas en vuelo y el relé arranca el POST con la
  // payload ya lista.
  const preparado = Promise.all([ladoNativoDisponible(), decodeArchivoMemo(archivo).catch(() => null)]);
  const ida = async (): Promise<ActaNativa | null> => {
    const [disponible, dataUrl] = await preparado;
    if (!disponible || !dataUrl) return null; // sidecar apagado / decode imposible → hoy, byte a byte
    const r = await actaNativa(dataUrl);
    logger.info(
      `[e14-nativo] prefetch acta ${r ? `OK ${Math.round(r.totalMs)}ms lineas=${r.nLineas} qr=${r.qr ? "si" : "no"}` : "FALLO (cae al pipeline JS)"} fila-file=${archivo.name}`,
    );
    return r;
  };
  const n = vuelosNativo();
  // Bajar el pool (sidecar reiniciado con menos sesiones) no cancela nada: la
  // cadena que se quita ya tiene su ida en vuelo y esa sigue su curso — solo
  // deja de recibir trabajo nuevo.
  while (colas.length > n) colas.pop();
  while (colas.length < n) colas.push(Promise.resolve());
  const k = turno++ % colas.length;
  const arrancar = colas[k].then(ida, ida);
  // Jamás se atasca una cadena: `ida` no lanza (todo catch interno), y si algún
  // día lo hiciera, su cola sigue viva y la siguiente ida de esa cadena arranca
  // igual.
  colas[k] = arrancar.then(
    () => {},
    () => {},
  );
  return arrancar;
}

/** El acta-completa prefeteada, o `undefined` si el kit está apagado (no se
 *  lanza fetch, no se decodifica nada — coste cero con el flag OFF). */
export function prefactaActa(
  claveFila: string,
  archivo: File,
): Promise<ActaNativa | null> | undefined {
  if (!leerFlags().actaNativa) return undefined;
  const existente = vuelo.get(claveFila);
  if (existente) return existente;
  const p = nuevaIda(archivo);
  vuelo.set(claveFila, p);
  if (vuelo.size > MAX_VUELO) {
    const masAntigua = vuelo.keys().next().value;
    if (masAntigua !== undefined) vuelo.delete(masAntigua);
  }
  return p;
}

/** Techo de espera de la capa 0 sobre el prefetch. NO es «lo que cuesta la
 *  escalera»: es lo que cuesta PERDERLA. Medido en el lote de 6 con sidecar
 *  vivo (bench nat2/nat3, 2026-11-03), la fila cuyo acta aterrizaba dentro del
 *  techo cerraba `preOcrQrMs ≈ 3,5-4,6 s` y `detectMs = 0` (el pre-OCR entero
 *  venía del sidecar); la fila que vencía los 20 s de antes pagaba la escalera
 *  (2-3 s) y, encima, 14-25 s de DETECCIÓN/WARP/b-n OpenCV SUYA, duplicando el
 *  trabajo que el acta ya había hecho. Con el relé en serie (un acta en vuelo,
 *  4,75 s cada una) la última fila de un lote de 6 aterriza hacia los 30-40 s,
 *  así que el techo tiene que cubrir la cola o la corrida vuelve a pagarse el
 *  pre-OCR dos veces.
 *
 *  Que un techo largo no sea un lazo: `ida` jamás queda colgada de un sidecar
 *  muerto — si no responde, `ladoNativoDisponible()` falla en ≤1,2 s y la
 *  promesa se resuelve `null` enseguida (la escalera corre en el acto). El
 *  techo solo muerde con el sidecar VIVO y ocupado, que es justo cuando esperar
 *  es más barato que repetir. Además el acta sigue consumible al aterrizar: el
 *  pipeline lo toma igual (el tiempo no se pierde, se solapa). */
const ESPERA_QR_MS = 45_000;

/** Herencia de la capa 0 sobre el prefetch. `null` = «no hay herencia, corre la
 *  escalera de siempre». Con `autoritativo` el sidecar SÍ respondió: el payload
 *  (o su ausencia) es el veredicto de zxing-cpp sobre el warp Y sobre el
 *  fotograma completo, así que un `payload=null` ya no es «no lo busqué bien». */
export type HerenciaQr = { payload: string | null; autoritativo: boolean };

/** Payload del QR del prefetch para la capa 0, con techo. `null` = «corre la
 *  escalera de siempre» — INCLUDINGO el timeout: no hubo respuesta, así que no
 *  hay hecho que heredarse. Un `null` nativo jamás escribe la caché negativa. */
export async function prefactaQr(
  claveFila: string,
  archivo: File,
): Promise<HerenciaQr | null> {
  const p = prefactaActa(claveFila, archivo);
  if (!p) return null;
  const t = performance.now();
  const tope = await conTope(p, ESPERA_QR_MS);
  if (tope.vencido) {
    logger.info(
      `[e14-nativo] prefetch sin respuesta a los ${Math.round(performance.now() - t)}ms — la capa 0 corre su escalera`,
    );
    return null;
  }
  if ("error" in tope) return null; // conTope ya le dio handler al rechazo tardío
  return { payload: tope.valor?.qr ?? null, autoritativo: tope.valor != null };
}
