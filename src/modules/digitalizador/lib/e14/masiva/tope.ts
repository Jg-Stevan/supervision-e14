/** KIT/PLAN e63g-watchdog-relectura (F0): TOPE genérico para promesas que
 *  pueden colgarse.
 *
 *  Problema (plan §2): la re-lectura interna e63f F2 corre FUERA del
 *  watchdog D65 (que solo presupuesta el pipeline del intento) — un
 *  colgaje de `reconocerTexto` ahí dejaba la cola ESPERANDO PARA SIEMPRE
 *  (sin veredicto, sin error, sin reintento posible). Agujero latente
 *  desde e63f: no disparó en el informe 181622, pero es estructural.
 *
 *  Contrato (plan §2 literal):
 *  · Tríada de resultado — JAMÁS `throw`: `{ vencido: true }` |
 *    `{ vencido: false, valor }` | `{ vencido: false, error }`. El rechazo
 *    del trabajo viaja como DATO (el catch del llamador se vuelve una rama
 *    — nada de excepciones cruzando el tope).
 *  · `conTope` en sí JAMÁS rechaza (su promesa siempre resuelve).
 *  · Si el tope gana, el trabajo en vuelo se ABANDONA: su resolución
 *    tardía es un no-op (resolve sobre promesa ya resuelta) y su rechazo
 *    tardío TIENE handler (nunca `unhandledrejection`).
 *  · Sin fugas de timer: el reloj se limpia en cualquier desenlace.
 *  · Módulo PURO: sin DOM, sin red, sin estado global — testeable
 *    headless por `scripts/qa-watchdog-relectura.ts`.
 */
// knip C3: de-export — uso SOLO interno (retorno de conTope).
type ResultadoTope<T> =
  | { vencido: true }
  | { vencido: false; valor: T }
  | { vencido: false; error: unknown };

/** Corre `trabajo` con presupuesto de `topeMs`. El trabajo es una promesa
 *  YA creada (un throw síncrono del llamador nunca entra aquí — es del
 *  llamador, como hoy). Primer desenlace gana: valor, error o vencido. */
export function conTope<T>(
  trabajo: Promise<T>,
  topeMs: number,
): Promise<ResultadoTope<T>> {
  return new Promise((resolve) => {
    const reloj = setTimeout(() => resolve({ vencido: true }), topeMs);
    trabajo.then(
      (valor) => {
        clearTimeout(reloj);
        resolve({ vencido: false, valor });
      },
      (error) => {
        clearTimeout(reloj);
        resolve({ vencido: false, error });
      },
    );
  });
}
