# INFORME R8b — Helpers masiva + ledger (OLA 3)

> Branch `refactor/r8b-masiva-helpers` · base `710f8c6` (main post-Ola-2).
> Misión: (1) helper ÚNICO de las 6 rutas DUPLICADA/YA-ENVIADA, (2) desconexión
> completa de `COLA_PERSISTENTE` (que viva en el ledger `dedup-indice.ts`),
> (3) limpieza de imports/re-exports muertos. Doctrina conservador: la cola
> JAMÁS se tumba, semántica del catch intacta, API pública del store Zustand
> INTACTA. **2 commits verdes · tree verde tras cada commit.**
> Zona respetada: SOLO `src/modules/digitalizador/lib/e14/masiva/**` + informe
> (`git diff --stat 710f8c6..HEAD`: 4 archivos, +279/−147). El shim del
> window venenoso en el harness de caracterización: NI UNA LÍNEA tocada.

## 1. Resumen

R8 dejó declarados dos pendientes en masiva (R8 §6.1 y §6.2) y esta ronda los
cierra ambos con equivalencia verificada:

1. **Helper único de las 6 rutas DUPLICADA/YA-ENVIADA** — la ruta YA-ENVIADA
   ya convergía en `marcarYaEnviada` (store.ts, ancla QA — los 3 call-sites
   del runner, el prescan y los 2 de store la llaman). Faltaba la ruta
   gemela: **`marcarDuplicadaCon` + `marcarDuplicada`** (store.ts:331/361)
   y la convergencia de los **4 sitios que escribían la marca a mano**
   (cadenaDedup sondeo · cadenaDedup dhash · dedupExactoIngesta · prescan).
   Resultado: **cero writes DUPLICADA pre-desenlace hand-rolled en masiva**;
   el par `marcarYaEnviada`/`marcarDuplicada` es el único lugar del repo que
   estampa estos dos desenlaces.
2. **Desconexión completa de `COLA_PERSISTENTE`** — el kill switch pasa a ser
   **constante privada del ledger** (`dedup-indice.ts:54`) y el store Zustand
   JAMÁS brancha sobre el flag: consume tres gestos del ledger
   (`prepararSesionModoPruebas` / `higieneModoPruebasVaciar` /
   `enviadaLedgerPorPayload`) con el MISMO orden, higiene y catch que los
   bloques que vivían dispersos en store.ts. Camino legacy muerto eliminado.
3. **Limpieza** — imports muertos que dejó la desconexión (ver §4) y
   comentarios que apuntaban a wiring viejo.

Evidencia de equivalencia: **51/51 tests de caracterización verdes SIN
ediciones** (mismas decisiones, mismos `resuelto`, mismas trazas
byte-idénticas — los literales de traza viajan como opción `traza` del
helper), suite completa **211 pass / 0 fail (2.873 expect)** y benchmark
headless N=120×8 **sin regresión** (suelo 52 ms = min-of-mins del baseline).

## 2. Cambios aplicados (evidencia file:line)

| Archivo:línea | Qué | Por qué |
|---|---|---|
| `store.ts:294-378` | **Helper único**: `DepsMarcaDuplicada` (298), `OpcionesMarcaDuplicada` (306), `marcarDuplicadaCon` (331 — núcleo con deps inyectables), `marcarDuplicada` (361 — envoltorio con deps reales del store) | La ruta gemela de `marcarYaEnviada`; un solo lugar con la secuencia guard anti-zombi → leerRegistro → write `{estado:"DUPLICADA", dupOf, ...extra}` → patch SOLO-VISUAL → traza opcional |
| `store.ts:527` | cadenaDedup sondeo (rama a) → `marcarDuplicada(..., { extraRegistro: { dedup:"qr-sondeo", sondeoQrMs, sondeoQrTier }, traza: "[e14] sondeo-qr …" })` + `continue` | Mismo write (mismos campos en el MISMO orden — AL FINAL del contrato D57), misma traza byte a byte, misma salida por `continue` en todos los caminos (marcada / guard-fail / IDB) |
| `store.ts:778` | cadenaDedup dhash → `marcarDuplicada(..., { traza: "[e14] dedup … marcada hamming=…" })` | El guard `filaViva PENDIENTE` y el write pelado vivían inline; idénticos dentro del helper |
| `store.ts:876` | dedupExactoIngesta → `marcarDuplicada(..., { traza: "[e14] dedup … instantanea sha256 …" })` | `false` (guard/IDB) → cae al paso (c) como candidata, exactamente como el catch de siempre |
| `prescan-qr.ts:163-183` | `aplicarVeredictoPrescan` case `duplicada` → `marcarDuplicadaCon({leer/guardar/actualizar de SUS deps}, …, { patchSiempre: true })` (call en 172) | Contrato congelado por la caracterización (test 609) se preserva: SIN guard (caller ya garantizó §G), SIN campo `dedup` (§F.2), SIN traza, patch SIEMPRE (incluso con write fallido) |
| `dedup-indice.ts:54` | `COLA_PERSISTENTE` deja de ser `export` → constante privada del ledger | Misión 2: el flag solo se lee en el módulo dueño de la decisión (fin del camino legacy) |
| `dedup-indice.ts:68` | `prepararSesionModoPruebas()` — e64p C-1: `false` en producción; en modo pruebas: vaciarCola → borrarHistorico → resetearPayloadsSesion → resetearIndiceEnviadas (mismo orden del bloque que vivía en `cargarFilas`) | El ciclo de vida del modo pruebas se decide en el ledger |
| `dedup-indice.ts:91` | `higieneModoPruebasVaciar()` — e64p C-2 en `vaciar()`: resetearPayloadsSesion + borrarHistorico SOLO en modo pruebas; no-op byte a byte en producción (D-e65b-1 / RL-e65b-5) | Ídem |
| `dedup-indice.ts:106` | `enviadaLedgerPorPayload(payload)` — e73 §C + e64p C-3: hit del LEDGER por payload EXACTO; `null` honesto en modo pruebas / índice caído / payload vacío (RL-e65b-3) | La decisión `COLA_PERSISTENTE` del sondeo (b) sale del store y entra al ledger |
| `store.ts:545` | sondeo (b): `const hitSondeo = await enviadaLedgerPorPayload(payloadSondeo)` (antes: `if (COLA_PERSISTENTE) { (await indiceEnviadasPorPayload(true)).get(...) }`) | Desconexión: el store ya no consulta el índice del ledger directamente ni brancha el flag; try/catch externo conservado (estructura idéntica) |
| `store.ts:964` | `cargarFilas`: `if (await prepararSesionModoPruebas()) { set({filas:[],…}); return; }` (antes: `if (!COLA_PERSISTENTE) {…}` con el bloque inline) | Misma higiene, mismo orden, mismos catch — el branch del flag vive en el ledger |
| `store.ts:1366` | `vaciar()`: `await higieneModoPruebasVaciar(); resetearIndiceEnviadas();` (antes: `if (!COLA_PERSISTENTE) {…}` inline) | Ídem — API pública de las actions intacta |
| `store.ts:184-189` | Comentario de cabecera e64p actualizado: desconexión R8b (sin `import { COLA_PERSISTENTE }`) | Documenta quién decide |
| `historico.ts:80-82, 93-101` | Comentarios de `listarHistorico`/`borrarHistorico` re-apuntados (consumidor real = `dedup-indice.ts`) | Comentarios mentían tras el split R8 + desconexión R8b (doc-only) |

## 3. Duplicados eliminados

- **4 marcas DUPLICADA hand-rolled** (guard `PENDIENTE` + `leerRegistro` +
  `guardarRegistro{estado,dupOf,…}` + `patchFila` + `logger.info`, ~12-20
  líneas cada una en `store.ts` sondeo/dhash/ingesta y `prescan-qr.ts`):
  **1 helper** (`marcarDuplicadaCon`/`marcarDuplicada`). Neto del commit del
  helper: +139/−62 en 2 archivos (las inserciones son el helper y su
  documentación; los 4 sitios quedaron en llamadas de 3-9 líneas).
- La consulta de índice-payload del sondeo con gating `COLA_PERSISTENTE`
  duplicaba la decisión que ya vivía en `dedup-indice` → **1 decisión**
  (`enviadaLedgerPorPayload`).
- El ciclo de vida del modo pruebas estaba disperso en 2 actions del store
  (`cargarFilas`, `vaciar`) → **1 módulo dueño** (dedup-indice).

## 4. Código muerto o innecesario eliminado (EVIDENCIA / acción)

- `import { COLA_PERSISTENTE } from "./dedup-indice"` en store.ts — quedó
  MUERTO tras el rewiring → eliminado (y el export privatizado en
  dedup-indice.ts:54; grep: cero consumidores fuera del ledger).
- `indiceEnviadasPorPayload` en el import de historico de store.ts — su
  único call-site (store.ts:459 pre-cambio) ahora vive en el ledger →
  eliminado del import (la función sigue viva en historico.ts, consumida por
  `enviadaLedgerPorPayload`).
- Comentarios obsoletos por los movimientos (historico.ts ×2, cabecera e64p
  del store, comentario del import historico del store) — actualizados.
- NOTA: el parámetro `incluirPersistido` de `indiceEnviadasPorPayload`
  (historico.ts:130) quedó SIN caller que pase `false` tras la desconexión —
  declarado en §6 como NO eliminado (contrato del kit e73 §C).

## 5. Optimizaciones aplicadas (antes / después)

- Estructural (no de runtime): 4 copias del patrón de marca → 1 helper tipado
  con deps inyectables; el compilador protege ahora las diferencias
  legítimas entre sitios (extraRegistro/traza/patchSiempre vs. guard).
- La desconexión no añade trabajo: los 3 gestos del ledger ejecutan las
  MISMAS operaciones en el MISMO orden (producción: return temprano en los
  tres — igual que los `if (!COLA_PERSISTENTE)` que reemplazan).
- Benchmark headless N=120×8 (`__tests__/bench-r8.test.ts`, marcador
  BENCH-R8): **sin regresión dentro del ruido** — ver §9.

## 6. Optimizaciones propuestas NO aplicadas (porqué)

1. **No se movió el par `marcarYaEnviada`/`marcarDuplicada` a un módulo
   `dedup-marcas.ts`** (lo que rompería de raíz el ciclo estático
   store↔runner, §10.1): el write de `marcarYaEnviada` es ancla QA
   documentada («la QA previa escanea estas líneas» — store.ts:216/248) y
   moverla cruza un contrato anclado sin dueño que lo autorice. El helper
   nuevo vive a su lado por cohesión del par.
2. **No se re-apuntaron los imports del runner** (`runner.ts:28-34`) de la
   fachada `./store` a los módulos canónicos (`dedup-indice`/`dedup-payloads`):
   son re-exports VIVOS (no muertos — quedan fuera de la misión 3) y R8 los
   declaró pendientes «hasta su propio split» (runner.ts:38). Candidato
   natural junto al punto 1.
3. **No se eliminó el parámetro `incluirPersistido`** de
   `indiceEnviadasPorPayload` (historico.ts:130): tras la desconexión nadie
   pasa `false`, pero es contrato documentado del kit e73 §C; su borrado es
   un cambio de API no pedido (doctrina: ante duda, no tocar).
4. **Benchmark con OCR real en navegador** (muro fuera de headless):
   heredado de R8 §6.4 — queda para el dueño. El bench headless mide
   orquestación y dió sin regresión.
5. **Test del modo pruebas (COLA_PERSISTENTE=false)**: no se añadió — el
   flag se lee UNA vez a module-load (`leerFlags().colaPersistente ?? true`)
   y simularlo exigiría mockear flags antes de cargar el store (el harness
   corre con el default true). El rewiring es mecánico (diff hunks 1:1 con
   los bloques originales). Declarado como riesgo residual en §7.

## 7. Riesgos y cobertura

| Riesgo | Cobertura |
|---|---|
| Regresión en las rutas convertidas (decisiones/trazas) | 51/51 tests de caracterización SIN ediciones — fixture POR puerta: sondeo qr-sondeo (571), dhash cinta cierta (531), dedupExactoIngesta (499/516), YA-ENVIADA dhash (591), prescan duplicada/ya-enviada/registrar/nada (609), marcarYaEnviada (650), veto H1 (479), capa-0 (349/365/390) |
| Trazas post-mortem / anclas QA | Suite E de anclas grepea runner.ts/runner-dedup.ts — intactos (los cambios no tocan esos archivos); las trazas de las marcas DUPLICADA viajan byte-idénticas como opción `traza` |
| Catch del conservador debilitado | El helper encierra guard/leer/write en UN catch que devuelve `false` y jamás re-lanza — la cola jamás se tumba; los call-sites conservan su `continue` / caída a (c) / fin-de-cuerpo originales |
| Modo pruebas (flag=false) sin test | Riesgo residual bajo y declarado (§6.5): mismo orden de operaciones verificado por diff; el kill switch es del dueño y su camino está aislado en 3 funciones de un módulo |
| Diferencia teórica en paths imposibles | En el helper, guard/leer/write comparten un try (antes la ingesta tenía catch propio y el dhash ninguno). En un hipotético throw de `patchFila`/`logger` (setState/console no lanzan en la práctica) el desenlace observable es el mismo: fila sin marcar y sin patch, loop continúa |
| API del store cambia y rompe consumidores | API pública Zustand INTACTA (mismas actions/firmas); solo cambian internals de `cargarFilas`/`vaciar` |

## 8. Decisiones tomadas sin dueño (justificadas)

1. **Helper nuevo en store.ts junto a `marcarYaEnviada`** (no en módulo
   propio): cohesión del par de marcas + el write YA-ENVIADA es ancla QA
   grepeada en store.ts. El split `dedup-marcas.ts` queda propuesto (§6.1).
2. **`patchSiempre` como opción documentada** en vez de replicar el branch
   del prescan a mano: preserva la ÚNICA divergencia deliberada (patch
   solo-memoria con write fallido, §G) sin duplicar maquinaria.
3. **Privatizar `COLA_PERSISTENTE`** (era `export`): la misión pide
   «eliminar el camino legacy si queda muerto tras la desconexión»; el grep
   probó cero consumidores externos tras el rewiring.
4. **2 commits separados** (helper / desconexión) para revisión 1:1 con las
   dos misiones; el state intermedio (commit 1) compila y pasa la suite
   completa (verificado antes de commitear).
5. **`enviadaLedgerPorPayload` captura el índice caído internamente**
   (null conservador) manteniendo el try/catch externo del call-site: la
   estructura del bloque (b) queda reconnaissable y el contrato RL-e65b-3
   no cambia.

## 9. Evidencia real de verificación (comandos y salidas REALES)

**ANTES (base `710f8c6`, worktree limpio):**
- `bunx tsc --noEmit` → **0 errores** (exit 0).
- `bun run lint` → **0 errores / 5 warnings pre-existentes**
  (actas-mock.ts `_observacion`, no-img-element ×2, temporizadores ref —
  ninguno en masiva).
- `bun test` → **211 pass / 0 fail** (2.873 expect, 21 archivos).

**DESPUÉS (HEAD `1dd73d4`):** re-corrido completo sobre el árbol commiteado:
- `bunx tsc --noEmit` → **0 errores**.
- `bun run lint` → **0 errores / 5 warnings pre-existentes** (los mismos).
- `bun test` → **211 pass / 0 fail** (2.873 expect, 21 archivos) — mismo
  conteo que el baseline: cero tests añadidos/rotos/ediciones de
  caracterización.
- `bun test src/.../__tests__/masiva-caracterizacion.test.ts` → **51 pass /
  0 fail** (206 expect) — la red de R8 manda y quedó verde sin tocarla.
- Commit intermedio (58c8d72, helper): tsc 0 + suite completa 211/0
  verificados ANTES de commitear (tree verde tras CADA commit).

**Benchmark headless (BENCH-R8, N=120 × 8 rondas por `procesarUno`):**
4 corridas por versión (stash push/pop para el baseline; misma máquina):

| Versión | min_ms por corrida | min-of-mins |
|---|---|---|
| Baseline `710f8c6` | 52 · 57 · 54 · 53 | **52** (433 µs/fila) |
| R8b `1dd73d4` | 55 · 59 · 71 · 52 | **52** (433 µs/fila) |

Ruido intra-corrida observado: 52→119 ms entre rondas (±56 %). El suelo
(52 ms) es idéntico y las diferencias entre medianas (~54 vs ~57 ms) viven
dentro de ese ruido → **sin regresión dentro del ruido**. Mejor corrida R8b:
`BENCH-R8 N=120 rondas=8 ms_por_ronda=[111, 71, 77, 52, 78, 81, 85, 59]
min_ms=52 us_por_fila=433`.

**madge** (`bunx madge --circular --ts-config tsconfig.json` sobre store +
dedup-indice + prescan): **2 ciclos estáticos** — (1) `store.ts > runner.ts`
(heredado de R8: runner consume re-exports de la fachada; benigno en runtime
— ver §10.1) y (2) `ocr/rapidocr.ts > tesseract-ocr.ts` (fuera de zona, M8
r7c). NOTA honesta: la evidencia de R8 («madge: no circular») corrió con UN
solo archivo de entrada — este R8b la corrige como hallazgo (§10.3).

**Alcance del diff:** `git diff --stat 710f8c6..HEAD` → 4 archivos, todos en
`masiva/**` (+279/−147) + este informe. `git status` limpio tras cada commit.

## 10. Hallazgos fuera de zona (vistos, NO tocados — alimenta la siguiente ola)

1. **Ciclo estático store↔runner en masiva** (in-zone el fix, declarado por
   alcance): `store.ts:56` importa `iniciarRunner/pausarRunner/
   rearrancarTrasEncolar` y `runner.ts:28-34` importa 5 helpers dedup de la
   fachada `./store` (4 de ellos son re-exports de `dedup-indice`/
   `dedup-payloads`; solo `marcarYaEnviada` vive de verdad en store). Funciona
   por live-bindings (los `export … from` son hoisted y nadie consume los
   bindings en module-init), pero es el único ciclo estático restante del
   núcleo. Fix de raíz = split `dedup-marcas.ts` (§6.1/§6.2) — decisión del
   dueño porque cruza el ancla QA del write YA-ENVIADA.
2. **La evidencia madge de R8 era débil**: sin `--ts-config`, madge procesó
   1 archivo y no siguió el grafo («no circular» no era concluyente). Re-
   confirma la sugerencia de R8 §10.4: un `madge.config` con los paths del
   tsconfig en CI haría esta evidencia automática y real.
3. **Ciclo `ocr/rapidocr.ts ↔ ocr/tesseract-ocr.ts`** (lib/e14/ocr — fuera
   de la zona masiva): detectado por el mismo madge corregido; encaja con el
   pendiente M8/r7c de la cola del dueño.
4. `runner.ts:35-38`: el comentario de R8 dice que los helpers «siguen
   importándose de ./store hasta su propio split (dedup-marcas/dedup-
   índice)» — la mitad «dedup-índice» YA existe (dedup-indice.ts, R8) y aun
   así la fachada sigue alimentando al runner; el re-apunte del import es
   una línea por helper cuando el dueño ordene el split.
5. El test del modo pruebas e64p (COLA_PERSISTENTE=false) sigue sin existir
   desde su kit de origen; si el dueño quiere red de caracterización para ese
   camino, el gesto natural es un segundo harness que lea flags ANTES de
   importar el store (hoy el kill switch se captura a module-load).

## PENDIENTES declarados (honestidad radical)

- Nada de la misión priorizada quedó sin hacer: helper único (rutas
  convergentes: YA-ENVIADA vía `marcarYaEnviada` preexistente + DUPLICADA vía
  `marcarDuplicada(Con)` en las 4 rutas que marcaban a mano), desconexión
  completa de COLA_PERSISTENTE (cero branches del flag fuera del ledger) y
  limpieza de lo muerto.
- Lo NO hecho (fuera de misión, declarado): split dedup-marcas, re-apunte de
  imports del runner, borrado de `incluirPersistido`, test del modo pruebas,
  bench con OCR real — §6 y §10.
