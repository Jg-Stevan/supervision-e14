# Informe R7b-remate — Partición del bridge + fin de la dependencia invertida (completamiento)

Branch `refactor/r7b-particion` · Base `main` = `898e5ae` (R7a mergeado) · 8 commits en la rama.

## (1) Resumen

Soy REMATE de un agente R7b que quedó SIN CONTEXTO a mitad de misión. Heredé 7 commits
(M10, M1, M2, M5a, M5b, M4 y el mapa de partición en la cabecera del bridge), working tree
limpio y node_modules instalado. Verifiqué el estado heredado contra el §7 de
`docs/revision-v1/03a-digitalizador-nucleo.md` y contra el mapa: M1/M2/M4/M5a/M5b/M10
estaban completos y verdes (tsc 0 · 159 tests pass · lint 0 err). Del mapa quedaban 3
pendientes: (a) vendor `jsQR.js` que `orientacion-qr.ts` aún tomaba de `masiva/vendor` —
move-only, lo COMPLETÉ como «M10-fin» (commit `c93586f`, git mv R100 byte-idéntico);
(b) unificación de los cuerpos gemelos de los pipelines (M6) — cambio de LÓGICA, NO lo
toqué (PENDIENTE r7c); (c) extracción rapidocr (R4/M8) — vive en `lib/e14/ocr/`, FUERA de
mi zona (la misión excluye `ocr/`) (PENDIENTE r7c/R8). El bridge queda como FACHADA
(2.028 líneas: clase RealCoreBridge + pipeline ×2 + todo lo público re-exportado); los
consumidores (`get-bridge.ts`, `masiva/runner.ts`, `components/`) no cambian imports.
Quedan **0 imports ESTÁTICOS núcleo→masiva** (queda 1 import DINÁMICO de rescate,
documentado y anotado, ver §6/§10). Estado final verificado: tsc 0 errores · bun test
159 pass / 0 fail (35 de R7a intactos, 0 diff en `gate.ts`/`gate.test.ts`) · lint 0 errores
/ 5 warnings pre-existentes fuera de zona.

## (2) Cambios aplicados

### Heredados del agente anterior (verificados por mí, NO los modifiqué salvo el mapa de cabecera en M10-fin)

| Commit | Archivo | Qué | Por qué |
|---|---|---|---|
| `1b74aa6` | `qr-zxing.ts` (nuevo), `types.ts`, `bridge.ts`, `masiva/identidad-qr.ts`, `masiva/origen.ts` | M10: `moduloZxingDe`/`qrCorto`/`estadoZxingQr` movidos de `masiva/identidad-qr.ts` a `qr-zxing.ts`; tipo `OrigenActa` movido de `masiva/origen.ts` a `types.ts`; re-exports temporales en masiva | Fin de la dependencia invertida núcleo→masiva (estática) |
| `5b37edb` | `calidad.ts` (nuevo, 359 l) | M1: `calidadDeActa`, `scoreDeCalidad`, `esquinasDeActa`, `contrasteEfectivoDe`, `InfoCrop` | Partición §7 — helpers libres sin estado |
| `b7b0b9d` | `ocr-escalonado-runner.ts` (nuevo, 186 l) | M2: `reconocerRapidOcrEscalonado`, `reconocerRapidOcr`, `ocrBanda` + caps y elección | Partición §7 |
| `11d5e91` | `sim-assets.ts` (nuevo, 117 l) | M5a: `ACTAS_SIM`, `fetchActaSimulada`, `fetchActaSimPorScore`, ciclo rotativo §G-2, caché | Partición §7 |
| `7fc5c38` | `acta-factory.ts` (nuevo, 188 l) | M5b: `construirActa`, `firmasPorStatus`, `capturarFrame`, `ParcialPipeline` | Partición §7 |
| `a11f5f0` | `auditoria.ts` (nuevo, 138 l) | M4: `construirDiagnosticoDelDesenlace` (1 implementación para los 2 sitios) | Partición §7, pitfall §9.9 |
| `5a4cbcb` | `scanner-core-bridge.ts` | Mapa de partición en la cabecera (guía del remate) | Documentación |

### Míos (este remate)

| Commit | Archivo | Qué | Por qué |
|---|---|---|---|
| `c93586f` | `masiva/vendor/jsQR.js` → `vendor/jsQR.js`, `masiva/vendor/jsQR.d.ts` → `vendor/jsQR.d.ts` | **M10-fin**: git mv del vendor jsQR 1.4.0 al núcleo (R100, 0 bytes cambiados, red line 9 intacta) | Último import ESTÁTICO núcleo→masiva; la misión exige «orientacion-qr.ts NO debe importar de masiva/» |
| `c93586f` | `orientacion-qr.ts` | Import `./masiva/vendor/jsQR.js` → `./vendor/jsQR.js` + comentarios actualizados | Consumidor del vendor en la zona |
| `c93586f` | `masiva/qr-pixeles.ts` | 1 línea: `./vendor/jsQR.js` → `../vendor/jsQR.js` + comentario | Dirección CORRECTA masiva→núcleo. Edición mínima en masiva ANOTADA (no es re-export: el activo se movió) |
| `c93586f` | `eslint.config.mjs` | 1 línea: ignore D27 `…e14/masiva/vendor/**` → `…e14/vendor/**` | El ignore del vendor DEBE viajar con el activo o lint rompe (jsQR UMD genera 1 error + 12 warnings). Fuera de zona, mecánico, justificado en §8 |
| `c93586f` | `scanner-core-bridge.ts` | Cabecera-mapa actualizada: jsQR movido a «hecho»; PENDIENTE ahora = M6 + R4/M8 + import dinámico de rescate | Mapa veraz para quien siga |

## (3) Duplicados detectados

- **Ninguno nuevo**: grep de definiciones de los 16 símbolos públicos de los 6 módulos
  nuevos → 0 símbolos definidos en 2+ archivos (evidencia §9). Los re-exports temporales
  de masiva NO son duplicación: una sola definición, una sola caché de wasm.
- **Pre-existente, conocido (PENDIENTE r7c)**: cuerpos gemelos de `escanearActa`/`recortar`
  dentro de `scanner-core-bridge.ts` (banda dirigida, clasificación+lazo, escudo e71, log
  de auditoría ~60 l ×2) — el §7/M6 lo documenta; unificar es cambio de lógica, fuera del
  alcance move-only de este remate.

## (4) Código muerto o innecesario detectado

| Qué | Dónde | EVIDENCIA | Acción |
|---|---|---|---|
| `precargarDecodeArchivo` (export) | bridge | Ya eliminado por el agente anterior — comentario en `scanner-core-bridge.ts:212-215`: «DEAD desde D66… 0 anclas en scripts/, 0 usos en src» | Hecho (heredado) |
| `estadoZxingQr` (export público) | `qr-zxing.ts:69` (antes `masiva/identidad-qr.ts`) | grep en todo `src/`+`scripts/`: cero consumidores (solo definición, re-export y un comentario en `zbar-qr.ts:56` que lo cita como referencia de forma) | SE CONSERVÓ: es superficie pública pre-existente del módulo (posible uso por QA externo). Decisión → dueño (§8) |
| `evaluarGate` (método privado de 1 línea) | `scanner-core-bridge.ts:1941-1950` | Solo delega en `evaluarGateCriterio` de `gate.ts` | Indirección deliberada para respetar move-only (los pipelines llaman `this.evaluarGate`). Se puede inline durante la unificación M6 (r7c) |
| Export vivos de los 6 módulos nuevos | calidad / ocr-escalonado-runner / sim-assets / acta-factory / auditoria / qr-zxing | Todos con 4-23 referencias en el repo (tabla en §9) | Ninguno huérfano — nada que borrar |

## (5) Optimizaciones aplicadas (antes → después)

- **Bridge**: 2.748 l (inicio R7b) → 2.028 l hoy (−26%; 720 l menos). La fachada conserva
  `RealCoreBridge` + pipelines + `OpcionesEscaneoConTimeout` + `marcoPerdonadoPorLectura`.
- **Módulos extraídos** (partición §7): `gate.ts` (R7a), `calidad.ts` 359 l, `acta-factory.ts`
  188 l, `ocr-escalonado-runner.ts` 186 l, `auditoria.ts` 138 l, `sim-assets.ts` 117 l,
  `qr-zxing.ts` 81 l — 1.069 l de auxiliares fuera del bridge.
- **Dependencia invertida**: imports ESTÁTICOS núcleo→masiva: 3 rutas (orientacion-qr→
  identidad-qr, types/bridge→origen, orientacion-qr→vendor) → **0** (queda 1 dinámico, §6).
- **Movido verbatim** (`git diff main...HEAD --color-moved=dimmed-zebra`, medido):
  664 de las 1.270 líneas añadidas (52,3 %) y 641 de las 943 eliminadas (68,0 %) son
  re-inserciones byte-verbatim de código movido. El resto son cabeceras/imports/docs de
  los módulos nuevos y los comentarios M10.

## (6) Optimizaciones propuestas NO aplicadas (cola del dueño / r7c)

1. **M6 — unificar cuerpos gemelos** de `escanearActa`/`recortar` (banda dirigida,
   clasificación+lazo, escudo e71, log de auditoría ~60 l ×2) → NO es move-only (lógica,
   riesgo medio). Es elpendiente grande del §7; dejarlo para r7c con golden-tests de los
   chips SIM 8.2/7.0/4.3.
2. **R4/M8 — partición de `ocr/rapidocr.ts`** (1.433 l, 3 capas, 5 mutables de módulo) →
   FUERA DE ZONA: la misión R7b excluye `lib/e14/ocr/`. r7c/R8 (db-postprocess puro +
   tests de caracterización).
3. **Import DINÁMICO de rescate `scanner-core-bridge.ts:593` → `masiva/identidad-qr`**
   (`decodificarQrDeCapture`, e64-qr T-2.1): es el único `import` núcleo→masiva restante.
   Moverlo exige arrastrar la cadena completa de tiers QR de masiva (qr-pixeles, zbar-qr,
   worker capa 0) — NO move-only; además el lazy es intencional (no engorda el bundle del
   escaneo). Anotado en la cabecera del bridge. Decisión → dueño/R8.
4. **R5 — gating del pre-warm OCR** (`ocr/rapidocr.ts:1433`, ~30 MB al importar) → fuera
   de zona (ocr/). Ya propuesto en §7 (prioridad alta).
5. **Inline de `evaluarGate`** (wrapper privado 1-línea) → cosmético; hágase junto a M6.
6. **Re-exports temporales en masiva** (los retira R8 re-apuntando imports):
   `masiva/identidad-qr.ts:72` (`estadoZxingQr/moduloZxingDe/qrCorto` ← `../qr-zxing`) ·
   `masiva/origen.ts:35-36` (`OrigenActa` ← `../types`).

## (7) Riesgos y cobertura

- **Riesgo 1 — bundling del worker** (`masiva/sondeo-qr.worker.ts` → `qr-pixeles.ts` →
  `../vendor/jsQR.js`): jsQR es puro JS worker-safe (comentario del propio módulo); el
  activo es byte-idéntico (R100), solo cambió la ruta relativa. Cobertura: tsc 0 + 159
  tests (incl. 35 de caracterización del gate que ejercitan el bridge completo).
- **Riesgo 2 — resolución de tipos del vendor** (`vendor/jsQR.d.ts` junto al `.js`):
  tsc --noEmit 0 errores lo confirma (el d.ts viajó con el .js).
- **Riesgo 3 — lint sobre el vendor UMD**: mitigado moviendo el ignore D27 con el activo
  (1 línea en `eslint.config.mjs`); verificado: lint volvió a 0 errores / 5 warnings.
- **Riesgo 4 — fachada rota para consumidores**: `get-bridge.ts`, `masiva/runner.ts` y
  `__tests__/gate.test.ts` siguen importando de `scanner-core-bridge` SIN cambios (0 diff
  en esos archivos; gate.ts/gate.test.ts 0 diff vs main).
- **No cubierto por tests**: rutas de SIM/assets y mejoras de resolución no tienen test
  dedicado — la caracterización del gate (35) cubre el desenlace; los moves son byte-move
  verbatim, mitigado por tsc.

## (8) Decisiones sin dueño (justificadas)

1. **Editar `eslint.config.mjs` (fuera de zona, 1 línea)**: el ignore D27 del vendor era
   específico de la ruta vieja; sin él el build de lint queda rojo por un archivo vendido
   de terceros que SIEMPRE estuvo ignorado. Alternativa (revertir el move) contradecía el
   objetivo M10 explícito del remate («orientacion-qr.ts NO debe importar de masiva/»).
   Mínimo cambio mecánico posible.
2. **Editar `masiva/qr-pixeles.ts` (1 línea de import)**: al mover el activo no existía
   alternativa «re-export» (el módulo ES el archivo .js). La dirección resultante
   (masiva→núcleo) es la correcta por doctrina. Anotado in-situ y aquí.
3. **Conservar `estadoZxingQr` sin consumidores**: superficie pública pre-existente;
   borrarlo no era move-only y podría romper tooling externo.
4. **NO unificar M6 / NO tocar ocr/**: criterio de cierre del remate (coherente y
   mergeable > agotar el mapa).

## (9) Evidencia (comandos y salidas REALES)

```
$ bunx tsc --noEmit                       → (sin salida) TSC_EXIT=0
$ bun test                                → 159 pass · 0 fail · 2624 expect() · 19 files [16.2s]
$ bun run lint                            → ✖ 5 problems (0 errors, 5 warnings)  [pre-existentes:
                                            supervision/*×4, perfil-dispositivo×1 — fuera de zona]
$ git diff main...HEAD -- gate.ts __tests__/gate.test.ts | wc -l → 0   (R7a intacto)
$ rg "^\s*(import|export).*from \"(\./|\.\./)masiva|await import\(\"\./masiva" \
     --glob '!masiva/**' --glob '!ocr/**' --glob '!obs/**' .
  → scanner-core-bridge.ts:593: const { decodificarQrDeCapture } = await import("./masiva/identidad-qr");
  (ÚNICO import núcleo→masiva restante: DINÁMICO, lazy intencional, PENDIENTE §6.3.
   Imports ESTÁTICOS: 0. orientacion-qr.ts: 0 refs de import a masiva.)
$ git diff --cached --name-status -M   (commit c93586f)
  → R100 …e14/masiva/vendor/jsQR.d.ts → …e14/vendor/jsQR.d.ts
  → R100 …e14/masiva/vendor/jsQR.js   → …e14/vendor/jsQR.js
$ git diff --stat main...HEAD | tail -3
  → 16 files changed, 1270 insertions(+), 943 deletions(-)
$ wc -l scanner-core-bridge.ts → 2028
$ Refs de exports de los módulos nuevos (def incl.): contrasteEfectivoDe 8 · scoreDeCalidad 23 ·
  calidadDeActa 16 · esquinasDeActa 8 · reconocerRapidOcr 9 · reconocerRapidOcrEscalonado 5 ·
  ocrBanda 7 · fetchActaSimulada 4 · fetchActaSimPorScore 5 · capturarFrame 7 · firmasPorStatus 7 ·
  construirActa 19 · construirDiagnosticoDelDesenlace 4 · moduloZxingDe 12 · estadoZxingQr 6 (0 externos) · qrCorto 17
$ Moved verbatim (dimmed-zebra, contado por código ANSI \x1b[2m+/-):
  mvAdd=664/1270 (52,3%) · mvDel=641/943 (68,0%)
```

## (10) Hallazgos fuera de zona (→ R8 y dueño)

1. **`ocr/rapidocr.ts:1433`** — pre-warm de OCR al importar (~30 MB: ORT wasm + modelos)
   sin gating de red/acción (R5 del §7, prioridad alta del dueño). NO tocado (fuera de zona).
2. **Lint warnings pre-existentes** (5): `supervision/components/actas/acta-viewer-modal.tsx`
   (no-img-element), `supervision/components/vista-recepcion.tsx` (no-img-element +
   react-hooks/exhaustive-deps), `supervision/data/actas-mock.ts` (unused var),
   `perfil-dispositivo/perfil-provider.tsx` (exhaustive-deps). Fuera de zona — NO tocados.
3. **Comentarios stale en masiva** que citan la ruta vieja del vendor: `masiva/runner.ts:103`,
   `masiva/identidad-qr.ts:53`. R8 tocará esos archivos al re-apuntar imports — actualizarlos allí.
4. **`masiva/zbar-qr.ts:56`** cita `estadoZxingQr` como referencia de forma para su propio
   diagnóstico — coherente, solo señalado.
5. **Chip del dueño**: `estadoZxingQr` sigue exportado pero sin consumidores (§4) — decidir
   si se borra o se documenta para QA.
