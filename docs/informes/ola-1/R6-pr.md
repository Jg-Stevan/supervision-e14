# R6 — Split move-only de MasivaView.tsx + fixes O(n²) (agente R6-remate)

## Agente
R6 (refactor/r6-masiva-view @ `5d4760a`, 9 commits sobre `main`). Este documento cubre el trabajo
completo de la rama; el R6 anterior agotó contexto antes de verificar y escribir este pr.md.
Zona autorizada: `src/modules/digitalizador/components/e14/**` (lib/e14/masiva/** intacta).

## Qué
Monolito `MasivaView.tsx` (1.644 líneas, reporte 03b M-2) → orquestador + 8 módulos en
`screens/masiva/`, en 5 commits estrictamente move-only, seguidos de 4 commits quirúrgicos:

| Commit | Contenido |
|---|---|
| `5e259ed` | move-only: helpers y píldoras → `masiva/helpers.tsx` (+183/−159) |
| `8e819ee` | move-only: PublicacionChip y ModalRevisor → `masiva/publicacion-chip.tsx`, `masiva/modal-revisor.tsx` (+515/−489) |
| `b330a4e` | move-only: MasivaView → `masiva/orquestador.tsx` + barrel de compatibilidad (+1025/−1009) |
| `836880f` | move-only: cuerpo del `map` de la bandeja → `masiva/fila.tsx` (+371/−312) |
| `ebcdae4` | move-only: bandeja, progreso-lote y dropzone (+387/−184) |
| `a6578db` | fix O(n²): `colaVida.indexOf` y `filas.find(dupOf)` por fila → Maps precalculados en `useMemo` (+146/−55) |
| `e9595b7` | perf: fila memoizada (`memo`) con props primitivos (+112/−72) |
| `4642c32` | perf: virtualización barata — `[content-visibility:auto]` + `contain-intrinsic-size` (+5/−1) |
| `5d4760a` | adopción `@/shared/format/tiempo` en InformeCorrida (fmtMs + hhmm) (+9/−11) |

Resultado: `MasivaView.tsx` quedó como barrel de 11 líneas que re-exporta `MasivaView` y
`PropsMasivaView` desde `masiva/orquestador.tsx` — el consumer (`supervision-shell.tsx`) no cambió
imports. Total rama: 10 archivos, +2111/−1650.

## Cómo
1. Extracción en capas hoja→raíz (helpers → chips/modal → orquestador+barrel → fila → bandeja/dropzone/progreso),
   un commit move-only por capa, sin tocar lógica: los consumers internos se rehacen por props, los
   externos siguen importando `.../screens/MasivaView`.
2. `fix(r6)` a6578db: `posicionesCola: Map<string, number>` (1-based, primera aparición = semántica
   idéntica a `indexOf`) y `nombrePorId: Map<id, nombre>` precalculados en `useMemo` del orquestador y
   pasados a la bandeja; el render por fila pasa a `Map.get` O(1).
3. `perf(r6)` e9595b7: derivados por fila (píldora, dup, %, posición en cola) se calculan en el `map`
   de la bandeja y se pasan como primitivos a `FilaMasivaVista` memoizada — una señal de vida
   (throttle 250 ms) re-renderiza solo la fila activa.
4. `4642c32`: filas con `[content-visibility:auto] [contain-intrinsic-size:auto_88px]` — el navegador
   salta layout/paint de filas fuera del viewport (virtualización barata, sin dependencias).
5. `5d4760a`: InformeCorrida importa `fmtMs`/`hhmm` de `@/shared/format/tiempo` (copias verbatim
   eliminadas; tests de paridad del repo siguen verificando output idéntico).

## Evidencia de verificación
Comandos corridos en el remate (PASO 1), números reales:

- `bun install` → OK (512 installs, 592 packages, no changes).
- `bunx tsc --noEmit` → **0 errores** (exit 0).
- `bun test` → **47 pass, 0 fail** (1234 expect, 9 archivos, 134 ms).
- `bun run lint` → **2 errors + 5 warnings**, ninguno en zona e14: los 2 errors son los
  `react-hooks/set-state-in-effect` pre-existentes de `perfil-dispositivo/components/panel-perfil.tsx:360`
  y `supervision/components/vista-recepcion.tsx:208` (R4/dueño). 0 problemas nuevos en mi zona.
- `git diff --stat main...HEAD` → **solo** `src/modules/digitalizador/components/e14/**`:
  `InformeCorrida.tsx (±20)`, `MasivaView.tsx (1645→11)`, y 8 nuevos en `screens/masiva/`
  (bandeja 169 · dropzone 138 · fila 373 · helpers 170 · modal-revisor 468 · orquestador 675 ·
  progreso-lote 61 · publicacion-chip 43). 10 files changed, 2111 insertions(+), 1650 deletions(-).

PASO 2 — integridad del split:
- `git diff main...HEAD --color=always --color-moved=dimmed-zebra --stat` → misma lista de 10 archivos
  (el `--stat` no cambia; el análisis de líneas marcadas como moved se hizo sobre el diff coloreado).
- Análisis del diff coloreado (estilos SGR por línea): líneas `+` de contenido 2111 → **1136 movidas
  verbatim** (estilos dim `2` = 1099, dim-italic `2;3` = 24, zebra-alt `1;33/1;36` = 13) y 975 nuevas
  reales; líneas `−` de contenido 1650 → **1119 movidas verbatim** y 531 borradas reales (locales del
  código movido con indentación adaptada + fmtMs/hhmm de InformeCorrida). ≈54% de las adiciones son
  moves puros; las nuevas reales son barrel, Maps precalculados, memo, content-visibility, imports y
  comentarios R6.
- Imports a `lib/e14/masiva/`: el conjunto de `main` vs el de los archivos nuevos es **idéntico**
  (`prescan-qr`, `store`, `tipos`) — cero dependencias nuevas a la librería protegida; `git diff
  main...HEAD -- src/modules/digitalizador/lib/e14/masiva/` = vacío.
- Grep render-path: `filas.find((o) => o.id === f.dupOf)` y `colaVida.indexOf` solo aparecen en
  **comentarios** (orquestador.tsx:341/356, bandeja.tsx:108-113); los usos reales son
  `posicionesCola.get(f.id)` y `nombrePorId.get(f.dupOf)` O(1).
- Consumer externo intacto: `supervision-shell.tsx:43` sigue importando
  `@/modules/digitalizador/components/e14/screens/MasivaView` (barrel).

Working tree limpio; no se requirió ningún commit `fix(r6)` adicional en el remate.

## Riesgo y rollback
- Riesgo bajo: 5 de 9 commits son move-only verificados por `--color-moved`; los 4 quirúrgicos están
  acotados a la bandeja/orquestador y cubiertos por tsc + 47 tests. Sin cambios de comportamiento
  intencionales (la semántica de `indexOf`/`find` se preservó exactamente: primera aparición, 0 si ausente).
- Riesgo residual: el memo de `FilaMasivaVista` depende de que la bandeja siga pasando primitivos;
  si alguien añade un prop de objeto nuevo sin recordarlo, el memo deja de filtrar (degrada a
  comportamiento previo, no rompe).
- Rollback: `git revert 5d4760a..5e259ed` (o `git reset --hard main` en la rama) — no hay migraciones
  ni cambios fuera de `components/e14/`, así que el revert es limpio y completo.

## Decisiones pendientes del dueño
1. **Medición React Profiler (pendiente de R6 anterior):** los fixes O(n²) + memo + content-visibility
   son mejoras teóricas (de ~250k comparaciones por señal de vida con zip de 500 → 0). Falta medir el
   ganancia real: montar `<Profiler id="masiva-bandeja">` alrededor de la bandeja y comparar
   commit duration con zip de 100/250/500 entradas y una señal de vida cada 250 ms, antes (main) vs
   después (esta rama). Propuesta: script o Storybook-aislado en `digitalizador`, sin tocar lib/.
2. **Virtualización completa como ADR:** content-visibility resuelve paint/layout pero no el costo de
   React (el `map` sigue renderizando N nodos). Si con Profiler el commit time sigue siendo relevante
   con zips grandes, proponer ADR para virtualización real (`@tanstack/react-virtual` o similar) en la
   bandeja — decisión de dependencia nueva, del dueño.
3. Consolidar el umbral de adopción de `@/shared/format/tiempo` para el resto de copias
   (`fmtDuracion` en panel-perfil, ver hallazgo 2).
4. Los 2 errores `set-state-in-effect` pre-existentes (R4) siguen en rojo en lint.

## Hallazgos fuera de alcance
1. `src/shared/format/__tests__/tiempo.test.ts:91` — el describe aún dice «paridad fmtMs
   (InformeCorrida.tsx — adopción pendiente)» pero la adopción YA se hizo en `5d4760a`. Renombrar el
   describe (test vive en shared/, fuera de mi zona; la paridad sigue pasando y validando).
2. Copias restantes de la capa shared aún sin adoptar (dueño/Ola 0): `fmtDuracion` en
   `supervision/components/panel-perfil.tsx` (test de paridad en verde), tono en panel-perfil,
   luminancia — marcadas «adopción pendiente» en sus comentarios.
3. Warnings lint pre-existentes fuera de zona: ref `temporizadores.current` en cleanup
   (vista-recepcion), `_observacion` sin usar (actas-mock.ts:412).
4. `modal-revisor.tsx` importa `type { PropsMasivaView }` desde `./orquestador` (sin barrel) —
   intencional (import intra-carpeta), documentado para quien toque el módulo.
