# PR — Agente R1 (CI, Lint & Higiene)

## Agente

R1 — CI, Lint e higiene. Branch local `refactor/r1-ci-lint` (repo `supervision-e14`, sin remoto: entrega = 5 commits locales convencionales y revertibles).

## Qué

1. **ESLint con scope** (`eslint.config.mjs`): el bloque de reglas relajadas del motor trasplantado (digielect14) ahora lleva `files: ["src/modules/digitalizador/**"]` — deja de aplicar a TODO el repo; app, `src/components`, `src/modules/supervision` y `src/modules/perfil-dispositivo` vuelven a las reglas estándar de `eslint-config-next`. No había errores de lint que corregir en MI zona (`src/components/ui`, `src/lib`, `scripts`) — los que aparecen tras el scoping están en `src/modules/**` (zona de otros), listados en Hallazgos.
2. **CI nuevo** (`.github/workflows/ci.yml`): en cada PR y push a `main` corre `bun install --frozen-lockfile` → `bunx tsc --noEmit` → `bun run lint` → `bun test`. Versiones espejo de `package.json`: `bun-version: 1.3.14` (= `packageManager`), `node-version: 20` (= `@types/node ^20`). El paso de test lleva `continue-on-error: true` + comentario TODO (suite aún vacía; los agentes de datos lo activarán quitando la bandera). NO se tocó `pages.yml` ni `cloudflare-pages.yml` (ver Decisiones pendientes).
3. **Workers precompilados** (`package.json`): nuevo script `"prebuild": "bun scripts/build-capa0-worker.mjs"` (lifecycle npm: corre antes de cada `next build`). Verificación de drift: `bun scripts/build-capa0-worker.mjs` regenera `public/scanner/capa0-qr.worker.js` **byte-idéntico** al commiteado (`git status --porcelain public/` sin salida, re-verificado al final). No hizo falta commitear artifacts ni documentar diferencias: el builder NO está drifted.
4. **Alineación shadcn/cn**: `bun add clsx tailwind-merge` (+ `bun add -d @types/bun` para tipear `bun:test`). Nuevo `src/lib/utils.ts` exportando `cn = twMerge(clsx(...))` en la ruta exacta que `components.json` ya apuntaba (`"utils": "@/lib/utils"`) — el primer `shadcn add` ya no romperá el build. Los 11 componentes de `src/components/ui` unifican import a `@/lib/utils`. Test `src/lib/utils.test.ts` (bun:test) con 4 casos, incl. `cn("p-2","p-4") === "p-4"`. **El paquete `cn@0.5.0` se CONSERVA** porque `src/modules/**` (zona ajena) aún lo importa — decisión conservadora documentada abajo.
   Extra necesario para el punto 2: `src/lib/image-modules.d.ts` con `/// <reference types="next/image-types/global" />` — arregla 13 errores TS2307 pre-existentes (imports de .jpg/.png en `digitalizador/assets` y `supervision/data/actas-reales`): `next-env.d.ts` está gitignoreado y solo se genera al correr `next typegen/build/dev`, así que `tsc --noEmit` pelado fallaba en main. Es idempotente con el `next-env.d.ts` que genere el tooling (misma fuente de declaraciones).
5. **Higiene git**: `git rm --cached tool-results/read_1793244607345_2404a505b09a.txt` (patrón real verificado en `.gitignore:47`: `/tool-results/` anclado; el archivo queda en disco y futuros artifacts del sandbox quedan ignorados). `mini-services/.gitkeep`: evaluado, **NO borrado** (ver Decisiones pendientes).

## Cómo

- Orden: `bun install` → diagnóstico baseline (lint 0 problemas con reglas globales; tsc 13 errores TS2307) → un commit por sub-tarea: `6c0aeb2` (eslint), `d6547b3` (ci.yml), `a2c594a` (prebuild), `24ee206` (cn+test+shim), `8521f91` (higiene).
- Scoping de ESLint leyendo los comentarios del propio config (D27: el motor trasplantado vive en `src/modules/digitalizador/**`; vendor ya ignorado en `globalIgnores`).
- Reescritura de imports en `src/components/ui` con `sed` dirigido + verificación con `rg` (11 archivos, cero cambios semánticos).
- Verificación de drift del worker con `git status --porcelain` / `git diff` tras regenerar.

## Evidencia de verificación

| Check | Resultado |
|---|---|
| `bunx tsc --noEmit` | ✅ exit 0, sin errores (baseline: 13 TS2307) |
| `bun test` | ✅ 4 pass / 0 fail (utils.test.ts) |
| `bun run lint` | ⚠️ 2 errores + 5 warnings, **todos en `src/modules/**`** (zona ajena, pre-existentes tras el scoping; ver Hallazgos). Mi zona (`src/lib`, `src/components/ui`, `scripts`): `bunx eslint src/lib src/components/ui` → exit 0 |
| Drift worker capa0 | ✅ regenerado idéntico al commiteado (dos corridas) |
| `git diff --stat main...HEAD` | ✅ solo rutas de mi zona: `.github/workflows/ci.yml`, `eslint.config.mjs`, `package.json`, `bun.lock`, `src/lib/**`, `src/components/ui/**`, `tool-results/…` (borrado de índice) |
| `git status` | limpio tras cada commit |

## Riesgo y rollback

- **Un commit por sub-tarea, revertibles independientes** con `git revert <sha>`.
- `24ee206` cambia el significado de `cn` en `src/components/ui`: ahora **resuelve colisiones** (twMerge descarta clases conflictivas previas). Los componentes shadcn no dependen de colisiones intencionales, riesgo bajo; rollback = revert del commit (revive `cn@0.5.0` en ui).
- `src/lib/image-modules.d.ts`: si el dueño prefiere depender de `next typegen` en CI, revertir el archivo (los 13 TS2307 volverán en tsc pelado). No hay riesgo de duplicación de declaraciones (misma fuente `next/image-types/global`).
- `ci.yml` saldrá **rojo en lint** hasta que los dueños de `src/modules/**` corrijan los 2 errores listados — es la red funcionando, no un falso positivo.
- `continue-on-error` en `bun test` enmascara fallos futuros de tests hasta que se quite (TODO en el propio YAML).

## Decisiones pendientes del dueño

1. **Doble deploy (NO toqué `pages.yml` ni `cloudflare-pages.yml`)** ⚠️: ambos corren `on: push → main` → cada push produce dos builds y dos deploys del mismo `out/` (GH Pages con `NEXT_PUBLIC_BASE_PATH=/supervision-e14`; CF Pages sin basePath en raíz). Además **GH Pages NO sirve `public/_headers`** (los `_headers` solo los respeta Cloudflare Pages) → en GH Pages no hay COOP/COEP → sin SharedArrayBuffer → WASM multihilo caído → **OCR 1-hilo** en ese canal. Pendiente del dueño: ¿deprecar `pages.yml` y quedarse solo con CF Pages, o mantener el espejo (con la degradación conocida)?
2. **`cn@0.5.0` sigue en dependencies**: al migrar los imports de `src/modules/{supervision,perfil-dispositivo}` a `@/lib/utils` se puede `bun remove cn`. No lo hice por ser zona ajena.
3. **`continue-on-error` del paso test en ci.yml**: quitarlo cuando la suite de datos tenga tests reales.
4. **`mini-services/.gitkeep`**: está trackeado PERO `mini-services/` está en `.gitignore:52` (estado inconsistente: archivo ignorado-versionado). Propuesta: `git rm --cached mini-services/.gitkeep` (es rezago del sandbox, nada del build lo referencia y el dir se recreatea solo en entornos que lo usan). NO lo borré por defecto, como se pidió.
5. **2 errores de lint** en `src/modules/**` (ver Hallazgos): asignar a los agentes de supervision / perfil-dispositivo.

## Hallazgos fuera de alcance (no tocados: `src/modules/**`, `docs/**`, `worklog.md`)

- `src/modules/perfil-dispositivo/components/panel-perfil.tsx:360` — ERROR `react-hooks/set-state-in-effect` (setState síncrono en effect).
- `src/modules/supervision/components/vista-recepcion.tsx:208` — ERROR `react-hooks/set-state-in-effect` (semilla + setState en effect de montaje).
- Warnings: `perfil-provider.tsx:184` y `vista-recepcion.tsx:227` (`exhaustive-deps`), `acta-viewer-modal.tsx:334` y `vista-recepcion.tsx:69` (`@next/next/no-img-element`), `actas-mock.ts:412` (`_observacion` sin usar).
- Solo `capa0-qr.worker.js` tiene builder script; `public/scanner/{sondeo-qr.worker.js,detection-worker.js}` no tienen generador versionado (el comentario del builder dice que imita "el patrón del sondeo") → su drift es invisible para el gate de prebuild. Candidato a un `build-sondeo-worker.mjs` simétrico.
- El `.gitignore` ya traía `/tool-results/`, `/skills/`, `mini-services/`, `/agent-ctx/` (D39) — el repo estaba limpio salvo los 874 renglones del `read_*.txt` ahora des-trackeado (sigue en la historia de git; no se reescribió historia).
