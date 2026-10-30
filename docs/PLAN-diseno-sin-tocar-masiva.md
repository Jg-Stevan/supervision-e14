# PLAN — Traer cambios de diseño sin tocar Carga Masiva

> **Fecha:** 2026-10-30 · **Base:** main `a249518` (Merge PR #14 — tesseract-spa-best-v1)
> **Motivo del plan:** `main` actual es el commit con **los mejores tiempos** del
> benchmark de OCR/carga (Tesseract REAL del benchmark como motor). Cualquier
> cambio de diseño que llegue al repo debe respetar ese rendimiento: la masiva
> es **zona protegida**.

---

## 0. Principio rector (regla de oro)

```
El módulo digitalizador (carga masiva) NO se toca.
Los cambios de diseño viven SOLO en supervision/ y assets.
Nada entra a main sin pasar el guard de la sección 4.
```

- `main = a249518` es la **línea base de rendimiento**. Los tiempos del
  digitalizador (prescan, OCR por página, miniaturas, envío) fueron medidos
  sobre este árbol — cualquier diff que toque sus archivos invalida el
  benchmark.
- Los cambios de diseño (estilos, tablas, filtros, visores, datos del monitor)
  se incorporan con **cherry-pick quirúrgico** desde las ramas/backup, nunca
  con merges completos.

## 1. Zona protegida (NO tocar)

| Ruta | Por qué |
|---|---|
| `src/modules/digitalizador/**` | El módulo de carga masiva completo (benchmark de tiempos) |
| `public/**` assets de OCR/wasm | Modelos y workers del motor — afectan tiempos de carga |
| `next.config.ts` (export/basePath/StrictMode OFF) | StrictMode ON dispara doble pre-warm OCR/worker (ver D27) |
| `package.json` deps de OCR (tesseract, onnx, opencv…) | Cambiar versiones = re-benchmark completo |
| `docs/ESTRATEGIA-ocr-router-v1.md` | La estrategia del motor depende de estos tiempos |

## 2. Cambios de diseño disponibles (verificados)

Fuente: rama `backup/main-recreada-1c42b84` (historia recreada del panel).
Verificación hecha el 2026-10-30: **0 archivos de `src/modules/digitalizador/`**
en los tres commits.

| Orden | Commit | Qué aporta | Archivos que toca |
|---|---|---|---|
| 1º | `a8737da` | fix(monitor-global): columnas fijas y alineadas en matriz de puestos y subtabla de mesas | `supervision/components/{mesas-subtable,puestos-table}.tsx` |
| 2º | `37bfc49` | actas-reales-v2: Roma + Barcelona-Girona al monitor + techo real de páginas en el visor | `supervision/data/actas-reales/*`, assets PNG, `mock-repository.ts` |
| 3º | `8ae1074` | fecha por defecto LUNES, tiempo transcurrido senalizado y filtros de columna | `monitor-global.tsx`, `puestos-table.tsx`, `mock-repository.ts`, `domain/tiempo-cierre.ts` (nuevo), `domain/types.ts` |

⚠️ **El orden importa:** `8ae1074` retoca `puestos-table.tsx` (que `a8737da`
ya había modificado). Si se invierte el orden, el cherry-pick conflictúa.
Orden recomendado: `a8737da → 37bfc49 → 8ae1074`.

## 3. Procedimiento de cherry-pick seguro

```bash
# 1. Ramificar desde main (línea base de rendimiento)
git checkout main && git pull && git checkout -b feat/diseno-monitor-v1

# 2. Traer los commits de diseño EN ORDEN
git cherry-pick a8737da   # columnas fijas
git cherry-pick 37bfc49   # actas reales v2
git cherry-pick 8ae1074   # fecha LUNES + filtros

# 3. Si hay conflicto: gana el diseño SOLO en archivos de supervision/.
#    Jamás resolver un conflicto metiendo archivos de digitalizador/.
git checkout --theirs <archivo-de-supervision>
```

> Los commits viven en `backup/main-recreada-1c42b84`. Si git no los
> encuentra, primero: `git fetch origin backup/main-recreada-1c42b84`.

## 4. Guard — verificación OBLIGATORIA antes de push

```bash
# a) Ningún archivo de la zona protegida en el diff contra main
git diff --name-only origin/main...HEAD | grep -E "digitalizador|next.config|package.json|bun.lock"
#    → debe salir VACÍO. Si sale algo: NO se puede pushear.

# b) Build limpio (export estático nativo)
bun install --frozen-lockfile && NEXT_PUBLIC_BASE_PATH= bunx next build

# c) Benchmark de la masiva intacto: correr una carga de prueba y comparar
#    thumbMs / ms por página contra la línea base de a249518.
#    Umbral: sin regresión > 5%.
```

El guard (a) se puede automatizar como pre-push hook o como job de CI;
mientras tanto es responsabilidad del que pushea.

## 5. Checklist de aceptación

- [ ] `git diff origin/main...HEAD --name-only` — 0 archivos de la zona protegida
- [ ] Build estático OK (`out/` generado)
- [ ] Benchmark de carga masiva sin regresión (>5% = rechazar)
- [ ] QA visual del monitor: columnas alineadas, filtros funcionan, fecha LUNES
- [ ] Push a rama feature → PR → merge a main (el CI despliega solo)

## 6. Registro de aplicación

| Fecha | Commits aplicados | Benchmark | Resultado |
|---|---|---|---|
| _pendiente_ | a8737da, 37bfc49, 8ae1074 | _por medir_ | _pendiente_ |

---
*Este plan fue generado tras validar que el nuevo main (a249518) conserva los
mejores tiempos del benchmark. Cualquier duda: ver `docs/DECISIONS.md` y
`docs/ESTRATEGIA-ocr-router-v1.md`.*
