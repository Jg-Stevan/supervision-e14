# Revisión Profunda — Paquete 1: Fundaciones & Infraestructura
> Task ID: 1 · Alcance: configs raíz (`package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `Caddyfile`, `.gitignore`, `bun.lock`), `src/app/**`, `src/components/**` (13 archivos ui), `scripts/build-capa0-worker.mjs`, `.github/workflows/**`, `public/` (estructura), higiene del repo (`tool-results/`, `worklog.md`, `mini-services/`, `docs/` inventario) y `docs/DECISIONS.md` solo vía Grep (D8/D37/D39/D40).

## 1. Mapa del paquete

| Archivo | Líneas | Rol (1 línea) | Observación |
|---|---|---|---|
| `package.json` | 47 | Manifiesto: Next 16.4.2, React 19.3, bun pinned; scripts mínimos (dev/build/start/lint) | Sin `prebuild` para workers (ver §4) |
| `next.config.ts` | 22 | Export estático (`output:"export"`) + `basePath` por env (D8) | `reactStrictMode:false` global (D27) |
| `tsconfig.json` | 42 | TS `strict:true`, paths `@/*`, exclude de artefactos sandbox | Faltan banderas de estrictez extra |
| `eslint.config.mjs` | 77 | Flat config next/core-web-vitals + overrides **globales** que aflojan reglas | Overrides sin `files:` (ver §4) |
| `postcss.config.mjs` | 7 | Solo `@tailwindcss/postcss` (Tailwind 4 sin config JS) | OK |
| `components.json` | 21 | Config shadcn (new-york, CSS vars, lucide) | Alias `utils: "@/lib/utils"` **inexistente** |
| `Caddyfile` | 23 | Proxy dev del sandbox → `localhost:3000` (con truco `XTransformPort`) | Infra de entorno commiteada |
| `.gitignore` | 53 | Ignora deps, out/, y artefactos AI (D39: `tool-results/`, `mini-services/`, `skills/`) | Bien comentado |
| `bun.lock` | lock | Lockfile bun (commiteado); confirma el grafo real de deps | `cn@0.5.0` llega **sin** clsx/tailwind-merge |
| `src/app/layout.tsx` | 37 | Root layout: fuentes (Hanken 600/700 + JetBrains Mono 400–600), metadata, `Toaster theme="dark"` | Dark-only consistente |
| `src/app/page.tsx` | 12 | Única ruta: monta `SupervisionShell` (todo por estado interno, D11) | Ideal para export estático |
| `src/app/globals.css` | 198 | Tokens del tema dark-only (kit SUP-1) + tipografías + utilidades propias | Tokens extra sin mapear a `@theme` |
| `src/app/favicon.ico` | bin | Favicon | — |
| `src/components/ui/*.tsx` | 910 (13) | Kit shadcn/ui (new-york, Radix monopackage, `data-slot`) | **5 de 13 sin usar** (367 líneas) |
| `scripts/build-capa0-worker.mjs` | 34 | Compila `capa0-qr.worker.ts` → `public/scanner/capa0-qr.worker.js` con Bun (IIFE) | Ejecución 100% manual (D40) |
| `.github/workflows/pages.yml` | 44 | CI/CD GitHub Pages: bun install frozen → typegen → build con `NEXT_PUBLIC_BASE_PATH` → deploy `out/` | Sin lint, sin caché |
| `.github/workflows/cloudflare-pages.yml` | 35 | CI/CD Cloudflare Pages: build sin basePath → `wrangler pages deploy out` | Duplica el trigger de push |
| `public/.nojekyll` | 0 | Desactiva Jekyll en GH Pages (crítico para `_next/`, D8:119) | ✓ |
| `public/_headers` | 34 | COOP/COEP (SharedArrayBuffer) + cache inmutable del motor (~40 MB) | Solo lo sirve Cloudflare |
| `public/scanner/` | 3 JS | Workers pre-compilados commiteados: `capa0-qr.worker.js` (137 KB), `sondeo-qr.worker.js` (313 KB), `detection-worker.js` (71 KB) | Riesgo de drift vs fuente |
| `public/e14/divipol.json` | 635 KB | Catálogo DIVIPOLA completo (dato, no código) | Cache 1 día en `_headers` |
| `public/models/`, `public/vendor/`, `public/wasm/` | ~78 MB | Modelos RapidOCR (~28 MB), Tesseract traineddata (12 MB), OpenCV (8,6 MB), onnxruntime wasm (14 MB), núcleos Tesseract (13 MB), zxing (0,9 MB) | Versionados por convención `?v=N` |
| `public/*.svg` (5) | — | `next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg` del scaffold | Sin uso aparente |
| `worklog.md` | 545 | Transcript de tareas de agentes AI (port del módulo masiva) | Commiteado a propósito (D39:1018) |
| `tool-results/read_…txt` | 873 | Snapshot antiguo de `mock-repository.ts` capturado por una tool AI | **Commiteado** pese a D39 y `.gitignore:47` |
| `mini-services/` | 0 | Solo `.gitkeep` trackeado | Placeholder vacío |
| `README.md` | 236 | Documentación de producto muy completa (flujos demo, límites honestos) | Sección "Arquitectura" desactualizada |
| `docs/` (inventario) | 12 MD + 14 PNG | DECISIONS.md (1.221 líneas, ADRs D1–D44), 8 REPORTEs, ESTRATEGIA-ocr-router-v1, PLAN de diseño, capturas-evidencia | Evidencia citada, se conserva (D39) |

## 2. Cómo funciona la base (explicado al programador nuevo)

1. **Build y deploy.** El sitio es un **export estático** de Next 16 (`next.config.ts:10`, decisión D8): `basePath` se inyecta solo por env — `NEXT_PUBLIC_BASE_PATH=/supervision-e14` en el workflow de GH Pages (`pages.yml:29`), vacío en Cloudflare y en dev (`next.config.ts:7`). Con `output:"export"` no hay servidor: mock repository, sin API routes (D8:116-117). Existen **dos CDNs en paralelo** (transición documentada D37): GitHub Pages en subpath y Cloudflare Pages en raíz, cada uno con su workflow que hace `bun install --frozen-lockfile → next typegen → next build` (`pages.yml:25-27`, `cloudflare-pages.yml:27-29`).
2. **Una sola página.** `src/app/page.tsx:10-12` monta `SupervisionShell`; la navegación es estado interno del shell (D11, no rutas). Por eso el export estático es trivial y no hay que preocuparse por SSG/ISR.
3. **Tema y diseño.** Dark-only (D4). Los tokens viven como CSS custom properties en `globals.css:13-55` y se exponen a Tailwind 4 vía `@theme inline` (`globals.css:57-89`). Tipografías self-hosted con `next/font` (Hanken Grotesk = estructura, JetBrains Mono = datos, `layout.tsx:6-16`). El kit shadcn (`src/components/ui`) es new-york sobre el Radix monopackage y estiliza con los tokens.
4. **Motor del digitalizador.** Los binarios pesados (modelos ONNX, OpenCV, núcleos Tesseract, zxing, workers) viven en `public/` y se sirven tal cual; Cloudflare añade COOP/COEP vía `public/_headers` para habilitar SharedArrayBuffer → hilos WASM reales (`_headers:6-8`) y cache immutable de 1 año para el motor (`_headers:18-31`, D39). Los workers JS (`public/scanner/*.js`) **no** pasan por el bundler: se pre-compilan con Bun y se commitean (`scripts/build-capa0-worker.mjs:20-27`, patrón D40/e73).
5. **Higiene del repo.** `.gitignore:44-53` y `tsconfig.json:33-41` excluyen explícitamente los artefactos del entorno AI (`skills/`, `tool-results/`, `mini-services/`, `.zscripts/`) — purga formalizada en D39. `docs/DECISIONS.md` funciona como registro de ADRs con supersede explícito (p.ej. D6→D21).

## 3. Lo que está BIEN

- **D8 implementada y verificada**: export estático + basePath por env + dev local sin cambios (`next.config.ts:7-13`), con `.nojekyll` presente (`public/.nojekyll`) — sin él, GH Pages ignoraría `_next/` (D8:119-120).
- **`public/_headers` es ingeniería de gama baja seria**: COOP/COEP para hilos WASM y cache `immutable` 1 año solo para lo versionado, con `divipol.json` (dato) a 1 día y `must-revalidate` (`public/_headers:6-34`); racional completo en D39:1000-1006.
- **CI reproducible**: `bun install --frozen-lockfile` con `bun.lock` commiteado y `packageManager` pinned (`pages.yml:25`, `package.json:42`), `next typegen` antes del build (`pages.yml:26`), permissions mínimas y `concurrency` con cancel (`pages.yml:8-15`).
- **Tema centralizado y documentado**: cada token tiene comentario de origen del kit (`globals.css:6-11,13-52`); reglas explícitas (prohibido azul, prohibido shadow) que explican decisiones de estética como sistema.
- **`scripts/build-capa0-worker.mjs` con gate de humo**: verifica que el bundle no contenga `zxing/logger/process.env` (red line e73) antes de declarar OK (`build-capa0-worker.mjs:11-12`).
- **README de producto honesto**: documenta límites del demo, flujos de demostración paso a paso y el plan de integración futura (`README.md:48-54,175-236`).
- **ADRs con disciplina**: DECISIONS.md usa números estables, fecha, origen y supersede explícito (D21 supersede D6, `DECISIONS.md:351`); los overrides de ESLint y `next.config` citan el número de decisión que los justifica (`eslint.config.mjs:8-10`, `next.config.ts:14-16`).
- **Kit shadcn moderno**: imports desde el monopackage `radix-ui` y `data-slot` en cada primitiva (p.ej. `select.tsx:6,11`) — facilita targeting CSS y upgrades.
- **`.gitignore` con comentarios de política** (qué es "jamás producto" y por qué las capturas SÍ se conservan: `.gitignore:44-45`), coherente con `tsconfig.json:33-41` y `eslint.config.mjs:66-73`.

## 4. Deudas y problemas

### 🔴 Críticos

1. **Workers pre-compilados con build manual → riesgo de drift producción vs fuente.**
   - **Qué:** `public/scanner/capa0-qr.worker.js` (137 KB) y `sondeo-qr.worker.js` (313 KB) se generan con Bun y se **commitean**; el único script de build (`scripts/build-capa0-worker.mjs:10`) es de ejecución manual, no está cableado a `package.json:5-10` ni a ningún workflow (`pages.yml:25-27` no lo corre).
   - **Dónde:** `scripts/build-capa0-worker.mjs:1-34` + `package.json:5-10` + `.github/workflows/pages.yml:20-35`.
   - **Por qué importa:** si alguien edita `capa0-qr.worker.ts` (fuente, en el alcance del paquete masiva) y despliega, lo que sirve producción es el `.js` viejo commiteado; el code review ve el cambio "hecho" pero el binario no cambia. Es exactamente el tipo de bug invisible que el propio script documenta haber sufrido ("Turbopack emitía el .ts crudo como asset", `build-capa0-worker.mjs:7-8`).
   - **Arreglo sugerido:** `bun run build:capa0` como paso de `prebuild` en `package.json` + ejecutarlo en ambos workflows antes de `next build` (y decidir si el artefacto se commitea o se genera solo en CI, con smoke gate incluido).

### 🟡 Medios

1. **Regresión de la purga D39: `tool-results/` vuelve a estar commiteada.**
   - **Qué:** `tool-results/read_1793244607345_2404a505b09a.txt` (873 líneas, 42 KB) está en `git ls-files`, es un snapshot antiguo del header de `mock-repository.ts` capturado por una herramienta AI.
   - **Dónde:** `tool-results/read_1793244607345_2404a505b09a.txt:1-25` (texto idéntico al doc-header del mock) vs `.gitignore:47` (`/tool-results/`) y `DECISIONS.md:1014-1016` (D39 dice haberla purgado con `git rm --cached`).
   - **Por qué importa:** es una copia muerta de un archivo core que va a pudrirse y confundir a cualquiera que la busque; contradice la decisión D39 formalizada en el repo.
   - **Arreglo:** `git rm --cached tool-results/*` (el `.gitignore` ya la cubre; riesgo nulo).
2. **ESLint aflojado GLOBALMENTE para acomodar al módulo trasplantado + lint fuera del CI.**
   - **Qué:** el bloque de reglas desactivadas (`no-explicit-any`, `react-hooks/exhaustive-deps`, `react-compiler`, `no-img-element`, etc.) se aplica a **todo** el repo sin selector `files:`; además ningún workflow ejecuta `eslint`.
   - **Dónde:** `eslint.config.mjs:11-49` (sin `files: ["src/modules/digitalizador/**"]`) y `pages.yml`/`cloudflare-pages.yml` (sin paso lint).
   - **Por qué importa:** el código nuevo (módulo supervision, app) hereda la laxitud pensada solo para el motor trasplantado (D27); el script `lint` existe (`package.json:9`) pero jamás corre en CI, así que ni siquiera las reglas que quedan sirven de puerta.
   - **Arreglo:** envolver el bloque en `{ files: ["src/modules/digitalizador/**"], rules: {...} }` y añadir `bun run lint` a ambos workflows.
3. **El paquete `cn` y `components.json` cuentan historias distintas (shadcn roto a futuro).**
   - **Qué:** las 13 primitivas importan `cn` de un paquete bare (`select.tsx:4`, `button.tsx:3`, etc.), dependencia `cn@0.5.0` (`package.json:14`) que en `bun.lock:575` llega **sin dependencias** (no arrastra `clsx` ni `tailwind-merge`; el único `clsx` del grafo es transitivo de `class-variance-authority`, `bun.lock:569`). Mientras tanto `components.json:16` declara el alias canónico `utils: "@/lib/utils"`, que **no existe** en `src/`.
   - **Dónde:** `package.json:14`, `bun.lock:575`, `components.json:14-19`, imports en los 13 archivos de `src/components/ui/`.
   - **Por qué importa:** (a) sin `tailwind-merge`, los overrides de `className` (p. ej. `rounded-xl` del Card vs `rounded-md` heredado) no se mergean — el ganador lo decide el orden de CSS, no el prop; (b) el primer `bunx shadcn add <x>` generará un componente que importa `@/lib/utils` y romperá el build de CI.
   - **Arreglo:** crear el `src/lib/utils.ts` canónico (clsx + tailwind-merge), codemod de 13 imports, y alinear `components.json`; o documentar la decisión de usar `cn` como paquete y corregir `components.json`.
4. **Doble pipeline de deploy en cada push, con paridad de features desigual.**
   - **Qué:** ambos workflows disparan en `push: main` (`pages.yml:3-6`, `cloudflare-pages.yml:6-9`) → todo push construye y publica dos veces; GH Pages **no sirve `_headers`** → en esa URL el OCR corre 1-hilo (reconocido en `DECISIONS.md:1028-1029`).
   - **Dónde:** `.github/workflows/pages.yml:3-6`, `.github/workflows/cloudflare-pages.yml:6-9`, `public/_headers:1-8`.
   - **Por qué importa:** costo de CI doble y dos URLs con comportamiento del motor distinto (la de Pages es objetivamente peor para la feature estrella). D37/D39 lo declaran transición consciente, pero no hay palanca que frene el deploy duplicado mientras tanto.
   - **Arreglo (M):** dejar `workflow_dispatch` como único trigger de `pages.yml` (o `paths` filter) hasta que el dueño corte el DNS; eliminarlo después (recomendación ya registrada en D39:1028).
5. **`reactStrictMode: false` global por una decisión local del masiva.**
   - **Qué:** el comentario lo justifica para el módulo trasplantado (doble pre-warm OCR/worker, D27), pero el flag aplica a **toda** la app.
   - **Dónde:** `next.config.ts:14-17`.
   - **Por qué importa:** el monitor/actas (código nuevo) pierde el detector de efectos dobles de React 19; bugs de impureza pasarán inadvertidos.
   - **Arreglo (M):** dejarlo documentado con plan de salida: activarlo de nuevo cuando el pre-warm sea idempotente, o acotar el no-doble-montaje dentro del masiva (p. ej. guard propio en `precalor`).
6. **`worklog.md` (545 líneas / ~51 KB) commiteado en la raíz.**
   - **Qué:** transcript de tareas de agentes AI; D39 lo conserva a propósito como evidencia (`DECISIONS.md:1018`).
   - **Dónde:** `worklog.md:1-545`.
   - **Por qué importa:** es decisión documentada, pero como archivo de raíz crecerá indefinidamente y mezcla historia de proceso con producto.
   - **Arreglo (S):** moverlo a `docs/worklog.md` (o congelar por versión `docs/historia/`) — la evidencia se conserva igual.

### 🟢 Leves

1. **`tsconfig` "estricto" a medias.** `strict: true` (`tsconfig.json:7`) es el default de Next, pero faltan `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes` — el README presume "TypeScript estricto" (`README.md:9`). Arreglo: activarlas de a una con pase de lint.
2. **`next-themes` prescindible.** `sonner.tsx:10` usa `useTheme`, pero la app es dark-only (D4) y el layout ya fija `theme="dark"` (`layout.tsx:33`), que gana por el spread (`sonner.tsx:17-35`). Se puede eliminar la dep y hardcodear.
3. **SVGs del scaffold sin uso.** `public/next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg` no son referenciados por el alcance; borrar (los assets reales viven en subcarpetas).
4. **Infra de sandbox commiteada como si fuera producto.** `Caddyfile:1-23` (proxy dev con truco `XTransformPort`) y `next.config.ts:19` (`allowedDevOrigins: ["*.space-z.ai", …]`) son del entorno AI; moverlos a `docs/`/`.zscripts` o al menos un comentario de "no-producto".
5. **Tokens definidos pero no expuestos a Tailwind.** `--surface-lowest/--surface/--surface-high/--surface-highest/--outline-strong/--outline-variant/--hover-row` (`globals.css:46-52`) y `--neutral-state/--error-text` (`globals.css:37-38`) no aparecen en el bloque `@theme inline` (`globals.css:57-89`): solo se alcanzan con `var()`/`bg-(--x)`, no con utilidades `bg-surface-high`. Mapearlos o documentar el porqué.
6. **`NEXT_PUBLIC_BASE_PATH` hardcodeado** al nombre del repo (`pages.yml:29`); se rompe si renombran. Derivar de `github.event.repository.name` (o dejar el comentario).
7. **Sin caché de dependencias en CI.** Ninguno de los dos workflows cachea el install de bun (`pages.yml:25`, `cloudflare-pages.yml:27`).
8. **Hanken Grotesk solo en 600/700** (`layout.tsx:8`) — el texto estructural usa pesos menores (p.ej. `font-medium` de Button, `button.tsx:7`), que se sintetizarán. Verificar contra el kit si es intencional.
9. **README con secciones en desorden temporal.** "Arquitectura" dice que todo el producto vive en `src/modules/supervision/**` y "sin librerías extra" (`README.md:13,24-27`), contradiciendo el trasplante D27 y `zustand` (`package.json:29`) que la propia sección "Carga Masiva" (`README.md:149+`) describe. Reordenar/actualizar encabezados.
10. **`mini-services/` vacía con `.gitkeep` trackeado.** Sin propósito visible ni referencia en docs del alcance; borrar o explicar (`.gitignore:52` ya la ignora para el futuro).

## 5. Duplicados y reutilización

- **Duplicado muerto confirmado:** `tool-results/read_1793244607345_2404a505b09a.txt` es una captura antigua de `src/modules/supervision/data/mock-repository.ts` (mismo doc-header KIT SUP-5/D21, `tool-results/…:1-25`). Candidato único a `git rm --cached`.
- **Kit UI semimuerto:** 8 de 13 primitivas tienen consumidores (`button`×5, `select`×2, `input`×2, `tooltip`, `table`, `sonner`, `separator`, `collapsible`); **`card`, `badge`, `sheet`, `progress`, `scroll-area` (367 líneas, 40% del kit) no tienen ningún import** (verificado por grep de `components/ui/*` en todo `src/`). O se adoptan (badges de estado y cards KPI del monitor son candidatos naturales) o se retiran del repo para no mantener CSS muerto.
- **Los "4 motores" NO son duplicación accidental — es estrategia documentada, con costos conscientes:**
  - OCR principal: RapidOCR sobre `onnxruntime-web` (deps `package.json:21`), gobernado por el router de dispositivo (`docs/ESTRATEGIA-ocr-router-v1.md:19` matriz de decisión, `:117` modelo por tier).
  - OCR alternativo: `tesseract.js` (`package.json:27`) es **elegible manual** que el modo automático "jamás elige" (`panel-perfil.tsx:726`); costo: ~12 MB traineddata + ~13 MB de núcleos en `public/`. Consciente (fase 5b, `ESTRATEGIA-ocr-router-v1.md:235`).
  - QR: dos lectores con roles distintos — `zxing-wasm` para sondeo/prescan y **jsQR vendido byte-exacto** para la capa 0 del worker (red line e73: el grafo del worker es jsQR-only, `build-capa0-worker.mjs:11-12`; DECISIONS D40:1048). No consolidar sin revisar esa red line.
  - Conclusión: duplicación justificada por rendimiento/dispositivo; el costo real está en los ~78 MB de `public/` (relevante para clone y Pages), ya parcialmente mitigado por cache D39.
- **`heic2any` doble ruta:** dep directa (`package.json:16`) y transitiva de `@jg-stevan/scanner-core` (`bun.lock:177`). Legítimo (se importa directo en `masiva/archivos.ts`), pero conviene documentar que la versión manda por la directa.
- **Reutilizable hoy:** `scripts/build-capa0-worker.mjs` es el patrón de emisión canónico para cualquier worker futuro (el propio script cita que `sondeo-qr.worker.js` sigue el mismo patrón, `build-capa0-worker.mjs:5-6`) — generalizarlo a un script `build:workers` sería el siguiente paso natural.

## 6. Guía de lectura para el programador nuevo

1. `README.md` (producto, límites y flujos demo) → 2. `docs/DECISIONS.md` D1–D9 (stack, frontera, dark-only, mock, export estático) → 3. `next.config.ts` + `.github/workflows/pages.yml` (cómo se construye y publica) → 4. `src/app/layout.tsx` + `globals.css` (contrato visual: tokens y fuentes) → 5. `src/app/page.tsx` → `src/modules/supervision/components/supervision-shell.tsx` (la app entera cuelga de ahí) → 6. `src/components/ui/` (kit disponible; ojo: solo 8 primitivas están en uso) → 7. `scripts/build-capa0-worker.mjs` + `public/_headers` (cómo viaja el motor OCR/QR) → 8. `docs/DECISIONS.md` D27/D37/D39/D40 cuando se meta al masiva o al deploy.
   Reglas de oro que la base impone: sin backend (todo estático, D8), sin rutas (estados del shell, D11), sin azules ni sombras (D4/kit), `idEnlace` como clave de join (D22).

## 7. Recomendaciones de reorganización (esfuerzo / riesgo)

| # | Acción | Esfuerzo | Riesgo |
|---|---|---|---|
| 1 | `git rm --cached tool-results/*` (regresión D39) y borrar `mini-services/` | **S** | Nulo |
| 2 | Cablear `build:workers` a `prebuild` + paso en ambos CI (worker siempre fresco) | **S/M** | Bajo |
| 3 | Scoping de overrides ESLint con `files: ["src/modules/digitalizador/**"]` + `lint` en CI | **S** | Bajo |
| 4 | Adoptar `src/lib/utils.ts` (clsx+tailwind-merge) con codemod de 13 imports y alinear `components.json` | **M** | Medio (toca las 13 primitivas; verificar overrides visuales) |
| 5 | Mover `worklog.md` → `docs/`; decidir destino del `Caddyfile` y `allowedDevOrigins` | **S** | Nulo |
| 6 | Retirar (o adoptar) `card/badge/sheet/progress/scroll-area`; borrar SVGs del scaffold y `next-themes` | **S** | Bajo |
| 7 | Mapear tokens `--surface-*/--outline-*/--hover-row` a `@theme inline` | **S** | Bajo (auditando usos `var()`) |
| 8 | Reducir a un trigger de deploy (congelar `pages.yml` en manual) hasta corte de DNS (D37/D39) | **S** | Bajo |
| 9 | Actualizar sección "Arquitectura" del README (post-D27) y activar banderas TS extra gradualmente | **M** | Bajo |
| 10 | Consolidar a un solo CDN cuando el dueño corte DNS (eliminar `pages.yml`) — ya recomendado en D39 | **L** | Medio (decisión de negocio) |
| 11 | Plan de salida para `reactStrictMode:false` (idempotencia del pre-warm → reactivar) | **L** | Medio |

## 8. Métricas rápidas

- **Alcance directo:** 27 archivos de código/config ≈ **1.596 líneas** (ui 910 · app 247 · configs raíz 292 · workflows 79 · script 34 · `_headers` 34) + `favicon.ico`/`.nojekyll` binarios-vacíos.
- **Higiene:** `worklog.md` 545 líneas (~51 KB) · `tool-results/` 873 líneas (~42 KB, commiteada) · `README.md` 236 · `docs/` 12 MD (~3.841 líneas) + 14 PNG de evidencia · repo total: **215 archivos trackeados**.
- **Peso de `public/`:** ~78 MB (models ~40 MB · vendor ~36 MB · wasm 0,9 MB · divipol.json 0,6 MB · scanner 0,5 MB) — motor documentado en ~40 MB (D39:1000).
- **Kit UI:** 13 primitivas · 910 líneas · **8 en uso / 5 sin usar** (367 líneas muertas).
- **TODOs/FIXMEs en el alcance:** **0 reales** (2 falsos positivos por "TODO" en prosa española: `page.tsx:5`, `globals.css:80`).
- **Workflows:** 2 pipelines de deploy, 0 pasos de lint, 0 caché, 1 env crítico (`NEXT_PUBLIC_BASE_PATH`).
- **Deps de motor en `package.json`:** 4 tecnologías OCR/QR (onnxruntime-web, tesseract.js, zxing-wasm, jsQR vendido) — todas con rol documentado (§5).
