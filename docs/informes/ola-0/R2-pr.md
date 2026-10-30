# pr.md — Agente R2 (capa shared compartida)

## Agente

R2 — capa shared (`src/shared/`) del repo `supervision-e14`. Branch `refactor/r2-shared-layer` (commits locales; no hay remoto).

## Qué

Creé `src/shared/` y migré los duplicados QUICK-WINS de los reportes de revisión v1 (04 §B2/B5, MASTER §2) con el patrón **«mover sin cambiar»**: mismo código en casa nueva, re-export/deriva en el original donde estaba declarado, y **1 test de paridad por módulo**.

| # | Archivo nuevo | Duplicado que casa | Adopción en el sitio original |
|---|---|---|---|
| 1 | `src/shared/env.ts` — `PUBLIC_BASE` | ×8 (§B2 #10) | ✅ los 8 sitios importan de shared (divipol.ts, flags.ts, ocr/tesseract-ocr.ts, ocr/rapidocr.ts, masiva/sondeo-qr.client.ts, prescan-qr.client.ts, capa0-qr.client.ts, inline identidad-qr.ts:242) |
| 2 | `src/shared/format/tiempo.ts` — `tiempoRelativo`/`fmtMs`/`fmtDuracion`/`hhmm` | 5 copias (§B2 #9) | ❌ pendiente: supervision/components/tiempo.ts (fuera de mi lista de re-exports declarados), InformeCorrida.tsx (`components/e14/**` prohibido), panel-perfil.tsx, mock-repository.ts, actas-mock.ts |
| 3 | `src/shared/ui/tono.ts` — `Tono`/`VAR_TONO`/`colorDeTono` | ×3 (§B2 #8) | ✅ supervision-shell.tsx:318-323 usa `colorDeTono`; ❌ panel-perfil.tsx:85-92 pendiente (archivo de otro agente) |
| 4 | `src/shared/ui/kpi-card.tsx` — `KpiCard` + alias `TonoKpi` | kpi-card.tsx ≡ KpiPerfil (§B2 #8) | ✅ supervision/components/kpi-card.tsx = re-export puro (consumidores sin diffs); ❌ `KpiPerfil` pendiente (tiene línea `sub` — exigiría extender la prop del componente compartido, no trivial) |
| 5 | `src/shared/dispositivo/ua.ts` — `osDeUA`/`navegadorDeUA`/`hayEntornoNavegador` + lecturas null-honest (`nucleosDe`, `nucleosDeConDefecto`, `memoriaGBDe`, `memoriaMBDe`, `heapLimitMB`, `bateriaDe`, `redDe`, `redActual`, `storageLibreMB`) | 3 copias (§B2 #2: dispositivo.ts · senales.ts · gama.ts) | ❌ pendiente (no era re-export declarado); las 2 semánticas de `nucleos` conviven documentadas |
| 6 | `src/shared/dispositivo/tier.ts` — `Tier`/`EntradaTier`/`calcularTier` §4.4 | 3 sitios (§B2 #1) | ❌ pendiente (cambia un veredicto de borde → decisión del dueño); canónica = perfil (null no condena) |
| 7 | `src/shared/img/luminancia.ts` — `luma` (BT.601 float canónica) + `lumaBT709` | 6 implementaciones (§B2 #7) | ❌ pendiente; el punto BT.709 (integridad.ts:82 / qr-pixeles.ts:355) queda marcado PENDIENTE DEL DUEÑO, no se toca sin medir |
| 8 | `src/shared/e14/qr-const.ts` — constantes QR + `pixelesDeBlob` (home canónico) | verbatim ×2 en workers (§B2 #5/#12) | ❌ pendiente: los workers NO se tocaron (precompila `scripts/build-capa0-worker.mjs`, zona R1 — regla de la misión) |
| 9 | `src/shared/e14/flags-schema.ts` — tabla ÚNICA de 19 flags + `sanearConEsquema` | doble whitelist (§B2 #11) | ✅ `flags.ts:sanearFlags` y `obs/politica.ts:leerOverridesFlags` DERIVAN de la tabla (única adopción completa, autorizada por la misión) |
| 10 | `docs/revision-v1/ADR-propuesta-idenlace.md` | §B2 #4 (NO unificado — bloqueado por producto) | — |

Tests: 8 archivos en `src/shared/**/__tests__/` — **43 tests, 1185 aserciones, 0 fallos**.

## Cómo

- Regla de oro respetada: `shared/` NUNCA importa de `modules/` (tipos gemelos replicados estructuralmente: `PixelesQr`, `ValorFlag`; `Tier` propio). Excepción solo en TESTS de paridad, que importan de `modules/` para comparar contra el original.
- Copias verbatim con proveniencia archivo:línea en cada cabecera; tests con referencias incrustadas + imports directos donde el símbolo es exportado.
- Canónicas elegidas (lo más completo/la mayoría): `osDeUA` = variante senales (CrOS→ChromeOS); `calcularTier` = variante perfil (null no condena, fuente §4.4); `luma` = BT.601; `VAR_TONO` = la de kpi-card (la única con `neutral`).
- Commits convencionales: 1 por quick-win (`refactor(r2): …` ×8, `docs(r2): …` ADR, `test(r2): …` fix).

## Evidencia de verificación

- `bun install` OK (503 paquetes).
- `bunx tsc --noEmit` → **exit 0, 0 errores TOTALES** (post-rebase: los 13 `TS2307` de assets desaparecieron — R1 los arregló con `src/lib/image-modules.d.ts` — y el `TS2769` de `tier.test.ts:254` quedó corregido comparando los unions `Tier` como string; commit aparte post-auditoría).
- `bun test` → **47 pass, 0 fail** (9 archivos: los 8 de R2 + `utils.test` de R1, heredados vía rebase).
- `bunx eslint src/shared` → **exit 0, sin errores ni warnings** (y `bun run lint` completo también exit 0).
- `git diff --stat main...HEAD` → solo `src/shared/**` + ADR + los sitios declarados (PUBLIC_BASE ×8, flags.ts, politica.ts, supervision-shell.tsx, kpi-card.tsx). Los workers (`sondeo-qr.worker.ts`, `capa0-qr.worker.ts`) y `scripts/build-capa0-worker.mjs` SIN tocar.

## Riesgo y rollback

- Riesgo bajo: todo es copia verbatim + derivación; el único cambio observable es el DELTA ADITIVO de la tabla de flags (abajo). `PUBLIC_BASE` es la misma expresión; `KpiCard` es re-export exacto (test de identidad de símbolo).
- Rollback: `git revert` de los 11 commits en orden inverso, o `git reset --hard main` en la branch (nada externo depende de estos commits; los re-exports mantienen los contratos de import para revertir sin cascada).

## Decisiones pendientes del dueño

1. **idEnlace / ancho de zona (M1):** NO unificado → `docs/revision-v1/ADR-propuesta-idenlace.md` con 2 opciones (A: canon 3 dígitos regenerando la base; B: dualidad nombrada en `shared/e14/identidad.ts` — recomendada).
2. **Luminancia BT.601 vs BT.709:** `luma()` canónica 601; el punto 709 (integridad.ts:82, qr-pixeles.ts:355) marcado en el código y aquí: unificar requiere medir (mueve umbrales de tinta/papel).
3. **Borde `nucleos=null` del tier (§B3 #1):** adoptar la canónica en `obs/dispositivo.ts`/`gama.ts` cambia BAJO→MEDIO-inferido en iOS sin `hardwareConcurrency` — expected-diff fijado en el test.
4. **Deltas aditivos de la tabla de flags** (ningún rechazo nuevo): flags.json ahora alcanza `capa0QrWorker`; el override localStorage alcanza `sondeoQrPresupuestoMs`, `sondeoQrCortocircuito`, `prescanQrCola`, `qrBrujulaOrientacion`.

## Hallazgos fuera de alcance

- **Infra de test/typecheck heredada de R1 vía rebase:** `@types/bun` (resolución de `bun:test` en tsc) y `src/lib/image-modules.d.ts` (declaración de los imports .jpg/.png que eliminaba los 13 `TS2307`) NO son de R2 — llegaron con el merge de R1 sobre el que esta branch está rebasada. R2 no toca `package.json` ni agrega dependencias.
- **Corrección post-auditoría (TS2769):** `expect(obtenido.tier).toBe(esperado.tier)` en `tier.test.ts` friccionaba porque el `Tier` de perfil incluye `"PENDIENTE"` y el de shared no. Comparación como string (`as string` en ambos lados): la aserción NO se debilita — en runtime `"PENDIENTE"` jamás igualaría un tier real, así que un desvío de paridad seguiría fallando el test.
- **`orientacion-qr.ts:160,186`:** la variante luma `(R·299+G·587+B·114) >> 8` divide por 256 → para blancos produce índices >255 (blanco puro = 996) que `Uint32Array(256)` descarta silenciosamente en el histograma. Congelado como test-evidencia; no se tocó (otro agente/cambiarlo altera la ecualización).
- `leerPolitica`/`leerOverridesFlags` leen `window.localStorage` sin guard de `typeof window` fuera del try/catch — el try/catch total lo cubre (observacional, no bug).
- (Histórico) Los 13 `TS2307` de assets que existían al momento del primer reporte de R2 quedaron resueltos por R1 (`image-modules.d.ts`); ya no aplican.
- `guardarOverridesFlags` serializa las claves ahora en el orden de la tabla única (antes: orden de inserción histórica) — sin efecto funcional (spreads), solo bytes del JSON guardado.
