# HIGIENE OLA 3 — veneno de tests · golden D21 · warnings de zona

> Agente 3-c (higiene). Worktree `/home/z/work/higiene`, branch `chore/ola3-higiene`.
> Zona exclusiva respetada: `src/shared/**` (flags-schema test + test de tiempo),
> `docs/DECISIONS.md` (solo §D21), `actas-mock.ts` (solo línea del warning),
> `perfil-provider.tsx` (solo línea del warning). ANTI-ZONA intacta:
> supervision/components, supervision/domain, masiva/** (incluido el shim del
> harness R8), lib/e14, workflows. Contrato cumplido: cero cambios de
> comportamiento observable · 211/211 tests verdes · 0 errores y 0 warnings en zona.

## 1. Resumen

Tres frentes, todos cerrados:

1. **Veneno cross-file de tests — arreglo de RAÍZ.** `flags-schema.test.ts`
   instalaba un `window` falso `{ localStorage }` PERMANENTE en `globalThis`
   (body de módulo, nunca restaurado). Como bun corre todos los `*.test.ts` en
   UN proceso, cualquier módulo evaluado después que leyera
   `window.navigator.onLine` en su evaluación (p.ej. `store-e14.ts:181-184`)
   abortaba el file entero — hoy lo mitigaba el shim del harness R8
   (`caracterizacion.harness.ts:40-61`, anti-zona, NO tocado). Ahora el window
   falso se monta en `beforeAll` y se **restaura en `afterAll`** (estado exacto
   previo). El veneno está muerto: demostración reproducible ANTES/DESPUÉS en §9.
2. **Golden D21 desfasado.** `docs/DECISIONS.md` decía `231+44+199+475`; el
   seed vigente (post-Ola 1, con anclas D26/D44) mide `233+44+198+474`
   (total 949 intacto). Actualizado + nota: los literales dependen del estado
   de anclas y el canónico vivo es `mock-determinismo.test.ts`.
3. **Warnings de zona → 0.** (a) `actas-mock.ts:418` y (b)
   `perfil-provider.tsx:184` suprimidos con `eslint-disable-next-line` y razón
   técnica (los arreglos "obvios" SÍ cambiarían comportamiento o romperían zona
   ajena — análisis en §6); (c) describe desactualizado del test de tiempo
   renombrado al nombre real de lo que prueba.

**Estado final:** tsc 0 errores · lint 0 errores / 3 warnings (TODOS fuera de
zona, ver §8) · `bun test` 211 pass / 0 fail (2.873 expect, 21 archivos) —
idéntico al baseline.

## 2. Cambios (evidencia file:line)

| # | Archivo | Cambio | Evidencia |
|---|---|---|---|
| 1 | `src/shared/e14/__tests__/flags-schema.test.ts` | window falso deja de instalarse en el body de módulo; pasa a `beforeAll` (instala) + `afterAll` (restaura descriptor original o elimina la propiedad si no existía — el caso de bun puro) | `flags-schema.test.ts:28` (import `afterAll/beforeAll`), `:109-140` (captura de descriptor + hooks), `:10-19` (cabecera que documenta el veneno y la retirada del shim) |
| 2 | `docs/DECISIONS.md` | golden D21 `231+44+199+475` → `233+44+198+474` (949 = mismo total) + nota de dependencia de anclas (Roma §ancla, D26, D44) + canónico vivo | `docs/DECISIONS.md:371-382` |
| 3 | `src/modules/supervision/data/actas-mock.ts` | warning `_observacion defined but never used` suprimido con razón técnica (firma paritaria con la API real) | `actas-mock.ts:415-419` |
| 4 | `src/modules/perfil-dispositivo/perfil-provider.tsx` | warning `react-hooks/exhaustive-deps` ('detectar', 'programarBenchmark') suprimido con razón técnica (montaje único por diseño) | `perfil-provider.tsx:183-185` |
| 5 | `src/shared/format/__tests__/tiempo.test.ts` | describe de `fmtMs` renombrado: decía «adopción pendiente» cuando la adopción YA ocurrió (`InformeCorrida.tsx:34` importa `fmtMs/hhmm` de shared) | `tiempo.test.ts:91` |

Commit-atribución: 4 commits convencionales (test/docs/chore/docs), ver pr.md.

## 3. Duplicados eliminados

**Ninguno en esta tarea.** La zona no contenía duplicados activos que fuera
seguro retirar (las copias de referencia «verbatim» de los tests de paridad son
DELIBERADAS: son el oráculo contra el que se compara la función compartida —
eliminarlas destruiría el test). Hallazgo relacionado FUERA de zona (§10):
`panel-perfil.tsx:203` conserva su copia local de `fmtDuracion` pudiendo
importar la shared (adopción pendiente REAL — la etiqueta del describe de
`fmtDuracion` en `tiempo.test.ts:115` sigue siendo cierta y NO se tocó).

## 4. Código muerto eliminado

**Ninguno.** El `Object.defineProperty(globalThis, "window", …)` del body de
módulo no era código muerto: era el mecanismo bajo test (la puerta localStorage
de `politica.ts` necesita `window`); se re-ubicó del ciclo de módulo al ciclo
de test (`beforeAll`/`afterAll`), preservando su función y eliminando su
efecto colateral permanente.

## 5. Optimizaciones aplicadas

- **Ciclo de vida del global de test** (`flags-schema.test.ts:109-140`): el
  window falso existe SOLO durante la ejecución de ese archivo. La
  restauración es EXACTA: se captura `Object.getOwnPropertyDescriptor` previo;
  si había window, vuelve idéntico; si no lo había (bun puro), se elimina con
  `delete`. Blindaje para entornos futuros (jsdom/happy-dom) donde `window` SÍ
  exista antes del test.
- **Nombre de describe veraz** (`tiempo.test.ts:91`): «paridad fmtMs
  (shared/format/tiempo.ts — YA adoptada por InformeCorrida.tsx:34)» —
  refleja lo que realmente prueba (la función compartida contra la copia
  verbatim de referencia).

## 6. Optimizaciones NO aplicadas (y porqué)

1. **Eliminar el parámetro `_observacion` de `confirmarRescanActaMock`**
   (el «arreglo» obvio del warning): **IMPOSIBLE sin romper zona ajena.**
   Verificado con rg: el único consumidor es `mock-repository.ts:988`
   (`confirmarRescanActaMock(actaId, _observacion)`) — supervisión/data NO está
   en mi zona; quitar el parámetro = error de compilación ahí. **Usarlo**
   (imprimirlo en el historial, como hace `aprobarActaMock:404`) cambiaría los
   textos exactos del mock — T5.4 fija esos textos y el contrato dice que el
   kit NO imprime la observación (comentario `actas-mock.ts:412-414`).
   Resultado: `eslint-disable-next-line` con razón técnica (patrón ya
   precedentado en el repo: `runner.ts:2341`).
2. **Incluir `detectar`/`programarBenchmark` en las deps del useEffect**
   (`perfil-provider.tsx`): **demostrado que SÍ cambia comportamiento.** El
   efecto es de montaje único por diseño (guard `montadoRef`, línea 175). Con
   deps completas, `detectar` cambia de identidad cuando aterriza el benchmark
   (su dep es `perfil.benchmark`) → React correría el CLEANUP del efecto a
   mitad de vida (`cancelIdleRef.current?.()`); si en esa ventana
   (setPerfil→re-render) el usuario disparó `refrescar()`, el cleanup
   cancelaría un benchmark RECÉN AGENDADO (se perdería la evidencia del
   benchmark B). Con `[]` ese cleanup jamás corre en caliente. Por eso
   disable comentado y no deps.
3. **Renombrar el describe de `fmtDuracion`** (`tiempo.test.ts:115`): su
   etiqueta «adopción pendiente» sigue siendo CIERTA (`panel-perfil.tsx:203`
   aún usa su copia local). Solo `fmtMs` estaba desfasado (línea 91).
4. **Retirar el shim del harness R8** (`caracterizacion.harness.ts:40-61`):
   ANTI-ZONA. Queda INERTE con este arreglo (su `if (windowFalsoGlobal)` ya no
   entra: no hay window residual) — el orquestador lo retirará post-ola.
5. **`<img>` → `<Image />`** en `acta-viewer-modal.tsx:336` y
   `vista-recepcion.tsx:69`: decisión de deploy del dueño (fuera de zona).

## 7. Riesgos

- **BAJO — dependencia del orden de hooks de bun:** la restauración en
  `afterAll` asume que bun ejecuta los hooks de un file antes de empezar el
  siguiente (verificado empíricamente: corrida completa 21 files OK, con
  `flags-schema` en posición 8 y `masiva-caracterizacion` — que evalúa
  `store-e14` REAL — en posición 20 del mismo proceso). Si un futuro bun
  cambiara el aislamiento entre files, re-capturar la demo del §9.
- **BAJO — semántica de restauración:** si algún día otro test instalara SU
  window antes que este archivo, la restauración le devuelve el SUYO
  (descriptor capturado en carga de módulo) — comportamiento correcto, pero
  dos instaladores simultáneos seguirían siendo un error de diseño (hoy solo
  este archivo instala: verificado con rg `globalThis|window\.` en `**/*.test.ts`).
- **NULO — comportamiento de la app:** los 2 `eslint-disable` son comentarios;
  el golden D21 es documentación; el rename de describe no toca asserts
  (2.873 expect idénticas al baseline).

## 8. Decisiones sin dueño (declaración)

1. **Los 2 warnings `<img>`** (`acta-viewer-modal.tsx:336` y
   `vista-recepcion.tsx:69`): NO son de esta tarea — decisión de deploy del
   dueño. Quedan vivos y documentados.
2. **Tercer warning fuera de zona NO enumerado en la misión:** la misión
   contaba «2 warnings restantes», pero el baseline tenía 5 y quedan **3**
   fuera de zona: además de los 2 `<img>`, `vista-recepcion.tsx:245`
   (`react-hooks/exhaustive-deps` — ref `temporizadores.current` leída en el
   cleanup). Es supervision/components (anti-zona) — queda para el dueño.
3. **Shim del harness R8** (`caracterizacion.harness.ts:40-61`): puede
   RETIRARSE al cierre de la ola (el orquestador lo hará). Con el veneno
   muerto es código defensivo contra un veneno que ya no existe; su rama
   `if (windowFalsoGlobal)` ya no entra (demo §9.3).
4. **Golden D21:** los literales `233+44+198+474` dependen del estado de las
   anclas del seed (Roma/D26/D44). El canónico vivo es
   `mock-determinismo.test.ts:170-179`; DECISIONS.md queda como referencia
   histórica (nota añadida en el propio documento).

## 9. Evidencia real de verificación

### 9.1 ANTES (baseline, worktree limpio en `710f8c6`)

```
bunx tsc --noEmit        → 0 errores (exit 0)
bunx eslint src          → 0 errores / 5 warnings:
    perfil-provider.tsx:184  exhaustive-deps (detectar, programarBenchmark)  [mía]
    actas-mock.ts:418        no-unused-vars (_observacion)                   [mía]
    acta-viewer-modal.tsx:336  no-img-element                                 [dueño]
    vista-recepcion.tsx:69     no-img-element                                 [dueño]
    vista-recepcion.tsx:245    exhaustive-deps (ref en cleanup)                [dueño]
bun test                 → 211 pass / 0 fail / 2.873 expect / 21 files [19.81s]
```

### 9.2 El veneno VIVO (repro ANTES del arreglo)

Probe efímero (creado, medido y BORRADO — nunca commiteado) que encadena en UN
file: (1) el módulo venenoso real y (2) la importación de `store-e14` REAL:

```
bun test src/aaa-probe-veneno.test.ts   [ANTES]
# Unhandled error between tests
TypeError: undefined is not an object (evaluating 'window.navigator.onLine')
      at onlineInicial (src/modules/digitalizador/store/store-e14.ts:183:17)
      at createStoreImpl (zustand/esm/vanilla.mjs:19:32)
  0 pass / 1 fail / 1 error
```

Es exactamente el abort que el shim R8 mitigaba (mismo stack, mismo mecanismo
documentado en `caracterizacion.harness.ts:41-49`).

### 9.3 El veneno MUERTO (DESPUÉS del arreglo)

Mismo probe (módulo venenoso + canario store-e14, MISMO proceso):

```
bun test src/aaa-probe-veneno.test.ts   [DESPUÉS]
  (pass) paridad sanearFlags … (5 tests del archivo venenoso)
  (pass) probe veneno > flags-schema.test + store-e14 en el MISMO proceso, sin abort
  6 pass / 0 fail
```

Y la demo en la TOPOLOGÍA REAL de la corrida completa (sin probe), donde el
archivo venenoso corre ANTES de la suite masiva que evalúa store-e14:

```
bun test 2>&1 | rg "^src/"   → orden de ejecución de bun:
  posición  8: src/shared/e14/__tests__/flags-schema.test.ts      (venenoso)
  posición 20: src/modules/digitalizador/lib/e14/masiva/__tests__/masiva-caracterizacion.test.ts
bun test (21 files, mismo proceso) → 211 pass / 0 fail / 2.873 expect
```

Con el veneno muerto, el shim del harness R8 queda inerte (su
`if (windowFalsoGlobal)` no encuentra window) — la suite masiva pasa SIN
necesitar el parche.

### 9.4 DESPUÉS (estado final, cambios aplicados)

```
bunx tsc --noEmit        → 0 errores (exit 0)
bunx eslint src          → 0 errores / 3 warnings — TODOS fuera de zona:
    acta-viewer-modal.tsx:336 (img, dueño) · vista-recepcion.tsx:69 (img, dueño)
    vista-recepcion.tsx:245 (ref en cleanup, dueño)
    → warnings de MI ZONA: 0 (eran 2)
bun test                 → 211 pass / 0 fail / 2.873 expect / 21 files [19.77s]
```

Delta vs baseline: 5 warnings → 3 (los 2 de zona eliminados, cero warnings
nuevos); tests/expect idénticos (2.873/2.873); anti-zona sin una línea de diff
(`git diff --stat` muestra solo los 5 archivos de la zona).

## 10. Hallazgos fuera de zona (sin tocar, para el orquestador/dueño)

1. **`vista-recepcion.tsx:245`** — warning `react-hooks/exhaustive-deps` (ref
   `temporizadores.current` en cleanup de efecto). No estaba en el enumerado de
   la misión («2 warnings restantes»); el baseline real tenía 3 fuera de zona.
   Fix sugerido (clásico): copiar `temporizadores.current` a una const dentro
   del efecto y limpiar esa const.
2. **Shim del harness R8** (`masiva/__tests__/caracterizacion.harness.ts:40-61`)
   — retirarlo post-ola (ver §8.3).
3. **`panel-perfil.tsx:203`** aún define `fmtDuracion` local pudiendo importar
   la shared `@/shared/format/tiempo` (como ya hizo `InformeCorrida.tsx:34`
   con `fmtMs/hhmm`) — candidato de adopción para una próxima ola de higiene;
   mientras tanto la etiqueta «adopción pendiente» del describe
   `tiempo.test.ts:115` es correcta y se dejó intacta.
4. **Orden de ejecución de bun test no es alfabético** (observado: shared/
   antes que modules/, probe nuevo primero) — documentado porque cualquier
   razonamiento sobre veneno cross-file en este repo NO debe asumir orden
   alfabético; la única defensa estable es no dejar estado global (lo que este
   arreglo garantiza).
