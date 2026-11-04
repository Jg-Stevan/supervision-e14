# GUÍA DE AUDITORÍA — Parche `fixes-supervision-e14.patch`

> **Repositorio:** https://github.com/Jg-Stevan/supervision-e14
> **Commit base:** `1e23174` (fix(csp): 'unsafe-eval' solo en desarrollo)
> **Parche:** `fixes-supervision-e14.patch` — 15 archivos, +418 / −45 líneas
> **SHA-256:** `12c7533abda200c15ea2d565a93f04d4812e377391304754744e0b79a86a1daf`

---

## 1. Veredicto de la verificación

**SÍ ES VERÍDICO.** En el repo el envío automático de actas existía pero era
*de facto* insuficiente y lento:

| Problema verificado | Impacto |
|---|---|
| **Solo actas OPTIMA se autoenviaban** (ADVERTENCIA quedaba manual siempre) | La mayoría de actas no salían solas |
| **COI apagado** en GH Pages → `crossOriginIsolated:false` → `ocrThreads` muerto → OCR mono-hilo | Lento (el plan ofrecía 4 hilos que JAMÁS se aplicaban) |
| **Doble descarga de modelos ONNX** (~32 MB × 2 al arranque, medido en network log) | Arranque ~2× más lento |
| **Benchmark CPU recalibrar** (`REF_CPU_OPS_MS=400`): cualquier escritorio saturaba la fase y el router OCR no discriminaba (sonda pasaba trivial) | Enrutamiento OCR impreciso |
| `atob` + bucle byte-a-byte en MAIN (150-400 ms por guardarRegistro ×2 fotos) | Bloqueos del hilo principal |
| Imagen integral QR con `Float64` (8 bytes/px) | Bandwidth innecesaria |

---

## 2. Qué corrige el parche (9 fixes + 1 palanca)

### P0-1 — Service Worker de aislamiento COI
- **Archivo:** `public/coi-serviceworker.js` (nuevo, 114 líneas) + `src/app/layout.tsx`
- **Qué hace:** activa `crossOriginIsolated:true` (COOP/COEP vía SW) → los
  hilos WASM del OCR viven. Incluye kill-switch del dueño
  (`localStorage e14-coi-sw=off`) y **auto-reparación**: si el runtime wasm
  no soporta COI, se revierte solo (nunca tumba la app).

### P0-2 — Fetch único de modelos + init diferida
- **Archivo:** `src/modules/digitalizador/lib/e14/ocr/rapidocr.ts` (+119)
- **Qué hace:** los 3 modelos ONNX se bajan **UNA sola vez** (cache por URL
  `CACHE_BYTES_MODELO`); las sesiones se crean desde `Uint8Array` y el proxy
  de ORT recibe el buffer por postMessage (sin re-fetch). Copia fresca
  `slice(0)` por sesión para que un reintento nunca vea un buffer detachado.
  Además: init OCR diferida a `requestIdleCallback` (timeout 5 s) — no
  compite con el arranque de la página.

### P0-3 — Benchmark recalibrado
- **Archivo:** `src/modules/perfil-dispositivo/lib/benchmark.ts`
- **Qué hace:** `REF_CPU_OPS_MS` 400 → **14000**. Antes cualquier escritorio
  daba score 1000/1000 (37.8× la ref → cap 2.0 fijo) y la sonda del router
  OCR (`SONDA_MINIMA_V5=750`) pasaba trivial. Ahora sí discrimina:
  escritorio sano ≈ 750-1000, portátil justo ≈ 400-700, débil < 350.

### P1-5 — `willReadFrequently` en el PRIMER `getContext`
- **Archivos:** `image-utils.ts`, `masiva/qr-pixeles.ts`, `masiva/identidad-qr.ts`
- **Qué hace:** la hint debe ir en la PRIMERA creación del contexto de cada
  canvas (si se pasa después, el navegador ya fijó el backend). Cubre los 3
  hot paths: `canvasDe`, `analizarPixeles`, `pixelesDeCapture`.

### P1-6 — `dataUrlABlob` nativo
- **Archivo:** `src/modules/digitalizador/lib/e14/masiva/cola.ts`
- **Qué hace:** en vez de `atob` + bucle byte-a-byte en MAIN (150-400 ms
  justo cuando la bandeja repinta), usa `fetch(dataUrl) → Blob` nativo y
  asíncrono. MISMO contrato (bytes exactos + MIME, `null` si no parsea).
  `compactarRegistro` → `compactarRegistroAsync`, esperado por el único
  caller ANTES de abrir la transacción IDB (una tx sin requests pendientes
  se auto-confirma — jamás `await` dentro).

### P1-7b — Imagen integral de QR en `Uint32`
- **Archivo:** `src/modules/digitalizador/lib/e14/masiva/identidad-qr.ts`
- **Qué hace:** la imagen integral pasa de `Float64` (8 B/px) a `Uint32`
  (4 B/px) → **−50 % de bandwidth** de memoria, mismos valores.

### P2-10 — Catálogo honesto de hilos
- **Archivo:** `src/modules/perfil-dispositivo/lib/recomendaciones.ts`
- **Qué hace:** el catálogo muestra el valor **EFECTIVO** con la MISMA
  fórmula del runtime (`min(tope, hardwareConcurrency)` con COI, 1 sin COI).
  Tres casos honestos: hilos activos, COI activo sin tier que los recomiende,
  y sin COI (`1 (efectivo hoy) · N con COOP/COEP`). Ya no enseña un «4»
  que jamás se aplicaba.

### P2-11 — `marcarFila` salta patches idénticos (no-op skip)
- **Archivos:** `masiva/runner-vida.ts`, `masiva/precalor.ts`
- **Qué hace:** si el patch de fila es idéntico al anterior, se salta el
  re-render (menos trabajo de pintado en lotes grandes).

### Red de seguridad COI-fallback (dentro de P0-2)
- **Archivo:** `src/modules/digitalizador/lib/e14/ocr/rapidocr.ts`
- **Qué hace:** con COI activo el runtime arranca threaded; si el backend
  wasm threaded no inicializa en algún entorno («no available backend
  found»), reintenta **UNA vez** con `numThreads=1` (camino mono-hilo
  recuperable). Solo corre tras un fallo real — coste cero en éxito.

---

## 3. ⭐ KIT `auto-envio-umbral-v1` — el objetivo del dueño

> *«lo ideal es que la mayoría de actas se envíen automaticamente si son
> elegibles y se reconoce el ocr»*

### Palanca `autoEnvioUmbral` (flag del dueño)
- **Archivos:** `src/modules/digitalizador/lib/e14/flags.ts` (default),
  `src/shared/e14/flags-schema.ts` (esquema + saneo),
  `masiva/runner.ts` (`faseEnvio`), `obs/tipos.ts` (telemetría)
- **Valores:**
  - `"optima"` (**default**) = solo OPTIMA se autoenvía — **byte-idéntico a hoy**.
  - `"advertencia"` = **extiende el auto-envío a ADVERTENCIA (6.5-7.9)** con
    clasificación AUTO (ruta divipol completa ≥ 0.82 + mesa + tipo: el MISMO
    requisito que `joinDeActa`/`publicarDesdeActa` ya exige para aterrizar
    en el monitor). Una ADVERTENCIA sin AUTO cae al contador de motivos
    como siempre.

### Garantías (auditar en `faseEnvio`, runner.ts ~línea 1744)
1. **TODOS los vetos anti-duplicado corren idénticos** para ambos umbrales:
   veto ya-enviada H1 (ledger POST-OCR), veto remoto WAVE3, dedup.
2. El join del monitor (`publicarDesdeActa`) **sigue exigiendo AUTO** —
   nada de ADVERTENCIA sin join completo llega a la bandeja.
3. Sin override → default `optima` → **comportamiento 100 % preservado**.
   Cero cambios de lógica salvo la extensión opt-in.

### Cómo activar la extensión (una línea, sin código)
```json
// flags.json (remoto) o localStorage:
localStorage.setItem("e14-flags-overrides", '{"autoEnvioUmbral":"advertencia"}')
```

---

## 4. Mapa de auditoría por archivo

| # | Archivo | Δ | Qué auditar |
|---|---|---|---|
| 1 | `public/coi-serviceworker.js` | +114 | COOP/COEP headers, kill-switch, auto-reparación |
| 2 | `src/app/layout.tsx` | +32 | Registro condicional del SW (solo prod), nunca en dev |
| 3 | `flags.ts` | +9 | Default `optima`, comentario de contrato |
| 4 | `image-utils.ts` | +11 −6 | hint en PRIMER getContext |
| 5 | `masiva/cola.ts` | +53 −24 | fetch(data:)→Blob, compactarRegistroAsync, tx IDB |
| 6 | `masiva/identidad-qr.ts` | +12 −6 | Uint32 integral |
| 7 | `masiva/precalor.ts` | +16 | skip no-op |
| 8 | `masiva/qr-pixeles.ts` | +18 −8 | hint en primer getContext |
| 9 | `masiva/runner-vida.ts` | +17 | skip no-op |
| 10 | `masiva/runner.ts` | +15 −1 | ⭐ gate `enviableAuto` + vetos intactos |
| 11 | `obs/tipos.ts` | +4 | telemetría del umbral |
| 12 | `ocr/rapidocr.ts` | +119 −14 | cache único, idle init, fallback threads=1 |
| 13 | `perfil-dispositivo/lib/benchmark.ts` | +13 −3 | REF 14000 |
| 14 | `perfil-dispositivo/lib/recomendaciones.ts` | +23 −8 | catálogo honesto |
| 15 | `shared/e14/flags-schema.ts` | +7 | saneo whitelist |

---

## 5. Cómo aplicar y verificar el parche

```bash
cd supervision-e14
git checkout 1e23174           # commit base del parche
git apply --check fixes-supervision-e14.patch   # dry-run: debe salir limpio
git am fixes-supervision-e14.patch              # aplica conservando autor/mensaje
```

Verificación de integridad aplicada antes de entregar (worktree limpio):

| Chequeo | Resultado |
|---|---|
| `git apply --check` sobre `1e23174` | ✅ limpio |
| `git am` | ✅ commit `7795d6c` |
| `bun install` + `bun run test` | ✅ **314/314** pass (3484 expect) |
| `tsc --noEmit` | ✅ 0 errores |
| `bun run lint` | ✅ 0 errors (3 warnings `<img>` pre-existentes, ajenos) |
| E2E lote demo (sesión previa, app corriendo) | ✅ 6/6 **ENVIADA AUTO** a **7.2 s/acta** |
| Network log | ✅ doble fetch eliminado — 1× cada ONNX |

---

## 6. Notas para el auditor

- **Cero lógica maqueteada:** el score es siempre el real (`acta.score`).
- El parche es un único commit atómico con mensaje completo (los KITs y su
  motivación están documentados inline en cada hunk — buscar `KIT ` en el
  diff).
- Los flags con saneo estricto: valor inválido → `undefined` → default.
  No hay ruta para romper la app por configuración.
- Kill-switches disponibles: `e14-coi-sw=off` (SW COI) y
  `autoEnvioUmbral:"optima"` (auto-envío clásico).
- El desglose completo de por-qué de cada fix está en el cuerpo del commit
  (`git show HEAD` tras aplicar).
