# REPORTE — sup-e14-pages-v1 (SUP-2)

**Kit:** `INSTRUCCIONES-sup-e14-pages-v1.md` · **Fecha:** 2026-10-20
**Entregable:** GitHub Pages funcionando (al merge) + 2 hallazgos de auditoría resueltos + PR draft

---

## 1. CASO tocado

**PR #1 mergeado** (el dueño lo fusionó tras la auditoría; luego lo revirtió en
PR #2 y lo re-aplicó en PR #3 — `main` @ `9a0a099` tiene la fundación viva).
Según §0-4 → rama nueva **`feat/pages-v1`** desde `main` actualizado y **PR
draft NUEVO** (los commits NO van al PR #1, que ya está cerrado).

## 2. Hallazgo 1 — `LayoutProps` (tsc en clone fresco)

- `src/app/layout.tsx`: `LayoutProps<"/">` → `Readonly<{ children: React.ReactNode }>` (fix literal del kit T1).
- **Evidencia:** `rm -rf .next && bunx tsc --noEmit` → **0 errores SIN typegen** (exit 0, dos veces: tras el fix y al final con todos los cambios, §4.1).
- El workflow conserva `bunx next typegen` como cinturón (no bloqueante).

## 3. Hallazgo 2 — scroll horizontal a 1440px

**Antes del fix (medido, 1440×900, sidebar abierta):**
`scrollWidth 1245` vs `clientWidth 1134` → **exceso 111px**.

**Técnica (solo en `puestos-table.tsx` — zona del módulo):**
1. `px-1.5` en los 10 `th`/`td` de la fila (override de `p-2`/`px-2` de ui/table vía tailwind-merge; kit lo permite explícitamente).
2. Mini-progreso compactado: `min-w-28→min-w-24`, `%` `w-10→w-9`, `gap-2→gap-1.5`.
3. Chip de hora actual `px-2→px-1.5`.
4. Encabezado «Hora cierre Colombia» (158px, la columna más ancha) → **«Cierre COL»** (abreviación autorizada por el kit; legibilidad mantenida).

**Después del fix (medido):**

| Viewport | scrollWidth | clientWidth | Exceso |
|---|---|---|---|
| **1440×900** | **1134** | **1134** | **0 — tabla COMPLETA hasta ESTADO GLOBAL** ✓ |
| 1280×800 | 1097 | 974 | 123px (scroll aceptable por el kit < 1440) |

## 4. Export estático + Pages

- `next.config.ts`: snippet EXACTO del kit (`output: "export"`, `basePath` por env, `images.unoptimized`, `trailingSlash`). Nota: el snippet reemplazó `cacheComponents`/`partialPrefetching` del scaffold — sin efecto en un sitio 100% estático (D8).
- `public/.nojekyll` (vacío) — creado.
- **Dev local intacto (regla §0-6):** tras el cambio de config, `GET /` en raíz → 200 (verificado en caliente y re-verificado al final).

## 5. Workflow

`.github/workflows/pages.yml` — EXACTO al kit (build con bun → `next typegen` → `next build` con `NEXT_PUBLIC_BASE_PATH=/supervision-e14` → `configure-pages` con `enablement: true` → upload → deploy). Se activará con el **push a main (merge del dueño)** o `workflow_dispatch`. NO se ejecutó a mano (regla del kit); Pages quedará habilitado automáticamente por `enablement: true`.

## 6. Verificación del build estático (T5)

1. `NEXT_PUBLIC_BASE_PATH=/supervision-e14 bunx next build` → `out/` generado (404, `_next`, `.nojekyll`, index).
2. Preview subpath: `out/*` → `/tmp/pages-preview/supervision-e14/` + `python3 -m http.server 8080`.
3. **Browser (1440×900) sobre `http://localhost:8080/supervision-e14/`:**
   - Dashboard renderiza con estilos correctos (`_next/` carga: fondo dark `rgb(14,20,20)`, fuentes `loaded`, `.nojekyll` OK) ✓
   - Italia colapsa/expande (subtabla 001–003 visible al abrir) ✓
   - Búsqueda filtra: «499» → solo Italia; «zzz» → estado vacío «Ningún puesto coincide» ✓
   - REINSPECCIONAR → toast «Función de demostración — sin backend» ✓
   - Tabla completa a 1440 en el preview estático (`tablaScroll: 0`) ✓
4. **Build SIN env:** `out/index.html` con **0** referencias a `/supervision-e14` (raíz se mantiene raíz) ✓

## 7. Verificación §4 (checklist final)

| # | Prueba | Resultado |
|---|---|---|
| 1 | Clone fresco: `rm -rf .next` → `bunx tsc --noEmit` (sin typegen) | **0 errores** ✓ |
| 2 | `bun run lint` | **0 errores** ✓ |
| 3 | `bun run dev` en raíz | **200 OK** (export no rompió dev) ✓ |
| 4 | `NEXT_PUBLIC_BASE_PATH=/supervision-e14 bunx next build` → `out/` + preview subpath | **OK** (§6) ✓ |
| 5 | Tabla completa a 1440×900 sin scroll horizontal | **exceso 0 (medido)** ✓ |
| 6 | Checklist en el PR | ✓ (incluida en el body del PR) |

## 8. Desviaciones y decisiones

- **Ninguna de fondo.** Dos notas honestas:
  1. El snippet del kit para `next.config.ts` reemplazó los flags del scaffold (`cacheComponents`, `partialPrefetching`) — se siguió el kit VERBATIM (alcance cerrado); sin efecto visible en export estático (D8).
  2. El repo NO tiene `docs/worklog.md` (estado heredado de SUP-1; `AGENTS.md` lo menciona pero el archivo no existe en la fundación aprobada). La whitelist del kit NO lo incluye y el kit prohíbe «cualquier otra cosa» → se respetó la whitelist; si el dueño quiere la entrada de worklog del repo, es un append de 1 archivo a decisión suya.

## 9. Commits

- `fix(layout): RootLayout sin LayoutProps — tsc de clone fresco sin typegen (D9)`
- `fix(ui): tabla completa a 1440px sin scroll horizontal (D10)`
- `feat(pages): export estático + basePath por env + workflow Pages + .nojekyll (D8)`
- `docs(pages): README Pages + DECISIONS D8/D9/D10 + REPORTE-pages-v1`

## 10. NOTA DE CONTINUIDAD DE SESIÓN

- **Clon de trabajo:** `/home/z/supervision-e14` (rama `feat/pages-v1`, base `main` @ `9a0a099`).
- **Kit:** `/home/z/my-project/upload/INSTRUCCIONES-sup-e14-pages-v1.md` (Task ID SUP-2).
- **Token:** lo entrega el dueño en el chat («Agente 3»); configurar en la URL del remote si hay que re-empujar. **El dueño debe REVOCARLO al cerrar la sesión** (quedó expuesto en el chat).
- **Worklog de sesión del agente:** `/home/z/my-project/worklog.md` (máquina del agente).
- **Pendiente del dueño:** mergear el PR → el workflow despliega Pages automáticamente → verificar https://jg-stevan.github.io/supervision-e14/ (primera vez: revisar en Settings → Pages que el source quede «GitHub Actions» si el navegador muestra 404).
- **Si la sesión se reinicia:** re-clonar el repo, `git checkout feat/pages-v1`, leer este reporte y `docs/DECISIONS.md` (D8/D9/D10); el PR ya estará abierto y este reporte está dentro del repo.
