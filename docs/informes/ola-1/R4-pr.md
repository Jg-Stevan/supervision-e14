# pr.md — R4: rendimiento y accesibilidad de UI (supervisión)

## Agente

R4 (remate / verificación). Branch `refactor/r4-ui-perf`, 9 commits, working tree limpio. Zona: `src/modules/supervision/components/**`. Sin push ni PR remoto (repo local).

## Qué

Resumen de los 9 commits (de abajo hacia arriba):

1. **a2a01e4 — fix(r4): C6** — El contexto grande del módulo se divide en `ContextoDatos` (catálogo, filas, derivados) y `ContextoAcciones` (estado del visor + acciones), con valores `useMemo` separados (`useDatos()` / `useDatosAcciones()`). `PuestoRow` y `MesasSubtable` ya no consumen contexto: sus datos y acciones (`abrirVisor`/`abrirVisorDePuesto`) llegan por props estables desde `monitor-global`. Abrir/cerrar el visor o navegar MESA n/N ya no re-renderiza las ~949 filas.
2. **5644f64 — fix(r4): C8** — La transición de vida sale del updater de `setSegundosTicker` (StrictMode lo invoca 2× y duplicaba la transición). Cruce detectado en el callback del intervalo con ref anti-doble-invoke y bandera de limpieza.
3. **863e637 — fix(r4): C7** — Expansión de fila accesible: botón real (44 px) en la primera celda con `aria-expanded`/`aria-controls`/`aria-label` y foco visible (el `<tr>` ya no es trigger: era inalcanzable por teclado, WCAG 2.1.1). El menú de columna pasa a `DropdownMenu` de Radix (`RadioGroup`, Escape, clic-fuera, flechas).
4. **ed4046b — feat(r4): M7** — Deep-linking mínimo: espejo de vista/filtros/visor en `location.hash` (`espejo-url.ts`). El hash jamás inventa estado: puesto/mesa se validan contra el catálogo cargado; restauración única tras la carga con `setState` diferido a microtask.
5. **21c072b — perf(r4)** — Virtualización barata sin deps: `content-visibility:auto` + `contain-intrinsic-size` en los ~949 `<tbody>` de la matriz; el navegador se salta el pintado de filas fuera del scrollport.
6. **d5407ec — refactor(r4)** — Tokens D18 del visor + dedupe de UI (`CLASE_CHIP`, zoom, skeletons, clases Tailwind v4).
7. **8fedb09 — test(r4)** — Telemetría dev-only de renders de `PuestoRow` (`window.__R4_FILAS.renders`) para medir la aceptación de C6. Muere en el build de producción (rama por `NODE_ENV`).
8. **ef7af0c — fix(r4)** — `set-state-in-effect` en `vista-recepcion.tsx`: lectura inicial diferida a microtask. Lint de la zona en verde.
9. **4d08a4c — ci(r4)** — Se retira `continue-on-error` del paso **Lint** del workflow CI: el lint vuelve a bloquear merge. El paso **Test** conserva su `continue-on-error` (legado de R3, con TODO para retirarlo).

## Cómo

- C6: división de contextos con valores memoizados y consumo estrecho (`useDatosTicker` hoja para el chip «Sincronizado hace Xs»); filas puras por props + `memo`.
- C7: semántica nativa (`button` + `CollapsibleContent id`) sobre el Collapsible existente; Radix ya estaba en deps (sin dependencias nuevas en todo R4).
- C8/M7: patrones recomendados por React (setState en callbacks del sistema externo, microtask en lectura inicial) para cumplir la regla `react-hooks/set-state-in-effect`.
- Telemetría: un `useEffect` en `PuestoRow` incrementa un contador solo en dev; si el `memo` salta el render, el effect no corre y no cuenta.

## Evidencia de verificación (números reales, este worktree, hoy)

| Chequeo | Resultado |
|---|---|
| `bun install` | OK — 512 installs / 592 packages, sin cambios |
| `bunx tsc --noEmit` | **0 errores** (exit 0) |
| `bun test` | **47 pass / 0 fail** (9 archivos, 1234 `expect`) — R4 no añadió suite; su entregable de test es la telemetría dev, no tests |
| `bun run lint` | **1 error + 5 warnings**. El único error es `react-hooks/set-state-in-effect` en `perfil-dispositivo/components/panel-perfil.tsx:360` (zona ajena). Los 5 warnings son pre-existentes (`perfil-provider.tsx:184`, `acta-viewer-modal.tsx:336` img, `vista-recepcion.tsx:69` img y `:245` ref, `actas-mock.tsx:412` `_observacion`). **Cero problemas en la zona R4** → el fix de `vista-recepcion` funcionó |
| CI (`.github/workflows/ci.yml`) | Paso **Lint SIN `continue-on-error`** (retirado en `4d08a4c`, con comentario explicativo) ✓; paso **Test CON `continue-on-error: true`** conservado (R3) ✓ |
| Spot-check C6 | `datos-provider.tsx`: `ContextoDatos`/`ContextoAcciones` con `valorDatos`/`valorAcciones` memoizados separados (+ `ContextoTicker` hoja). `puestos-table.tsx` y `mesas-subtable.tsx`: **cero consumo de contexto en filas** (props; grep sin matches de `useDatos`/`useContext`) |
| Spot-check C7 | Botón real en primera celda: `type="button"`, `aria-expanded={abierto}`, `aria-controls={idDetalle}` (id estable `detalle-puesto-<id>` en el `CollapsibleContent`), foco visible, 44 px. Menú de columna: `DropdownMenu` de Radix con `RadioGroup` |

**No se requirió ningún commit `fix(r4)`**: las 3 misiones críticas están completas y nada está roto.

## Riesgo y rollback

- Branch local de 9 commits atómicos sobre el merge de Ola 0 (`4536ed5`). Rollback: `git revert` por commit o reset del branch al merge base; ninguno toca datos ni rutas fuera de `supervision/components` (+ `ci.yml`, `espejo-url.ts`).
- Riesgos residuales: (a) `content-visibility:auto` depende de `contain-intrinsic-size` estimado (49 px) — alturas muy distintas podrían provocar saltos de scrollbar; (b) el hash deep-link ignora enlaces a puestos/mesas inexistentes en silencio (decidido, conservador); (c) el lint global sigue en rojo por el error fuera de zona (ver abajo) — hasta que se resuelva, el paso Lint de CI fallará en este estado del repo.
- La telemetría es dev-only (rama `NODE_ENV` eliminada por el minificador en prod): costo cero, riesgo cero.

## Decisiones pendientes del dueño

1. **`panel-perfil.tsx:360` (zona ajena)** — Único error de lint restante (`set-state-in-effect` en `resolverAuto()` dentro de un effect). Con el paso Lint ya bloqueante, CI no queda verde hasta resolverlo. R4 sugiere el mismo patrón usado en su zona (diferir a `queueMicrotask`, cf. `ef7af0c`), pero NO lo tocó por regla de zona.
2. **Procedimiento de medición de C6 (telemetría del commit `8fedb09`, dev-only):**
   1. `bun dev` (build de desarrollo, no prod) y abrir la vista Supervisión → «Todos los días» (matriz completa, ~949 puestos).
   2. En la consola del navegador, verificar que existe `window.__R4_FILAS` y anotar su valor base (o ponerlo a 0: `window.__R4_FILAS.renders = 0`).
   3. Abrir el visor de actas (botón 👁 de cualquier fila) y navegar MESA n/N / cambiar página / cerrar.
   4. Leer de nuevo `window.__R4_FILAS.renders`.
   - **Resultado esperado (aceptación C6): incremento 0** durante todo el flujo del visor (ni una fila re-renderizada). Sube solo ante eventos reales de datos: tick de transición de vida (~45 s), reinspección, carga masiva, o al filtrar/expandir filas.
   - Nota: en build de producción `window.__R4_FILAS` no existe (la rama se elimina).
3. **Virtualización completa** (ventana de filas) vs. el `content-visibility:auto` actual: el fix barato cubre el pintado; si la medición en hardware real lo justifica, decidir si se invierte en virtualización con deps.

## Hallazgos fuera de alcance

- `perfil-provider.tsx:184`: warning `exhaustive-deps` (`detectar`, `programarBenchmark`) — pre-existente, zona perfil.
- `vista-recepcion.tsx:245`: warning `exhaustive-deps` sobre `temporizadores.current` en cleanup — pre-existente, inocuo pero válido de limpiar algún día.
- Imágenes con `<img>` en `acta-viewer-modal.tsx:336` y `vista-recepcion.tsx:69` (`@next/next/no-img-element`) — candidatas a `next/image`, fuera del alcance de rendimiento de R4.
- `actas-mock.ts:412`: parámetro `_observacion` sin usar — cosmético.
- `bun test` reporta 47 tests (los 47 pre-existentes + paridad de R3 viven en otro worktree); el prompt anticipaba hasta 113: lo real aquí es **47 pass / 0 fail**.
