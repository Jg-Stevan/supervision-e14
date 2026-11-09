/**
 * TOKEN DE LECTURA del hub del puente (0.2/H-2 — plan de remediación).
 *
 * QUÉ ES: la credencial con la que el panel de supervisión sondea
 * `GET /actas?desde=` cuando el hub NO es local. La Ola 0 (0.2) cierra el
 * GET anónimo del hub: sin credenciales → 401. Este módulo es la mitad
 * cliente de ese cierre (la otra mitad vive en el worker `e14-puente`).
 *
 * DÓNDE VIVE EL TOKEN (H-2): el panel es un export estático público — no
 * hay servidor que inyecte configuración, así que el token lo pega el
 * supervisor en Configuración (vista `ajustes`, tarjeta «Token de lectura
 * del hub») y vive SOLO en el `localStorage` de SU navegador
 * (`localStorage["e14-token-lectura"]`). JAMÁS va en el bundle ni en el
 * repo (criterio de cerrado de H-2: `grep` del bundle → 0 tokens
 * embebidos). Es una clave de LECTURA, distinta de la firma de escritura
 * del puente (0.1, `CLAVE_JORNADA` del digitalizador).
 *
 * CUÁNDO SE ENVÍA: `headersDeLectura(origenHub)` devuelve el header
 * `Authorization: Bearer …` SOLO si el origen del hub NO es local. La LAN
 * (hub-local.mjs, same-origin localhost/127./10./192.168./172.16-31) no
 * pide auth — el criterio es el MISMO de `esOrigenLocal` del hermano
 * (`digielect14/src/lib/e14/puente/envio.ts:96`): mismo origen local, sin
 * credenciales, coherente con el servidor local. Sin token guardado →
 * headers vacíos (el sondeo sigue; el 401 del hub se muestra accionable
 * en la tarjeta del hub, no como fallo mudo).
 */

/** Clave de localStorage (pública por diseño — el VALOR es el secreto). */
const CLAVE_TOKEN = "e14-token-lectura";

/** Token de lectura guardado ("" si no hay — try/catch: modo privado o
 * storage bloqueado no deben tumbar el sondeo). */
export function tokenLectura(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CLAVE_TOKEN) ?? "";
  } catch {
    return "";
  }
}

/** Guarda/actualiza el token de lectura (vista Configuración). */
export function fijarTokenLectura(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_TOKEN, token.trim());
  } catch {
    /* modo privado: sin persistencia — se avisa en la UI; el sondeo de
       ESTA carga igual puede usar el valor si el componente lo retiene. */
  }
}

/** Quita el token de lectura. */
export function borrarTokenLectura(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* nada que borrar */
  }
}

/**
 * ¿El origen es LOCAL (loopback o red privada)? Mismo criterio de
 * `esOrigenLocal` del hermano: localhost, 127.0.0.0/8, 10.0.0.0/8,
 * 192.168.0.0/16 y 172.16.0.0/12. Origen vacío/inválido → NO local
 * (conservador: si algún día el sondeo apunta a un hub remoto, pide
 * credenciales; el modo local real siempre trae un origen URL válido).
 */
export function esOrigenLocal(origen: string): boolean {
  try {
    const host = new URL(origen).hostname;
    return (
      host === "localhost" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

/**
 * Headers de LECTURA para el sondeo del hub. Con origen local (LAN,
 * hub-local.mjs) → {} (el servidor local no pide auth — coherencia con
 * hub-local.mjs). Con origen remoto y token configurado →
 * `{ Authorization: "Bearer <token>" }`. Sin token → {} (el 401 que
 * responda el hub se muestra accionable en la UI: «configúralo en
 * Configuración»).
 */
export function headersDeLectura(origenHub: string): Record<string, string> {
  if (esOrigenLocal(origenHub)) return {};
  const token = tokenLectura();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
