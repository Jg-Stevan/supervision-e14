# INFORME R7c — Remate del bridge: gemelos M6-fin + M8 rapidocr (OLA 3)

> Branch `refactor/r7c-remate-bridge` · base `710f8c6` (main post-Ola-2, rebasada).
> Misión: (1) unificar los CUERPOS GEMELOS restantes de `pipeline()`/`pipelineRecorte()`
> (M6-fin: banda dirigida, clasificación+faltaSección+lazo, escudo esquinas e71,
> `construirDiagnostico` + log de auditoría ~60 l ×2), (2) refs `L####` obsoletas,
> (3) informe. Además (por el predecesor de esta misma ronda, con 3 commits ya verdes):
> M8 — extracción del postproceso DB de `ocr/rapidocr.ts` a módulo puro con
> caracterización. Doctrina conservadora: refactor = equivalencia verificada contra la
> caracterización; API pública del bridge/fachada R7b INTACTA; las 20 anclas QA de
> `masiva/runner.ts` intactas; import dinámico de rescate núcleo→masiva (e64-qr T-2.1,
> hoy `scanner-core-bridge.ts:569`) NI UNA LÍNEA tocada (micro-tarea del orquestador).
> **4 commits verdes · tree verde (tsc 0 / lint 0 errores / 269 pass) tras cada commit.**
> Zona: `src/modules/digitalizador/lib/e14/**` excepto `masiva/**`
> (`git diff --stat 710f8c6..HEAD`: 5 archivos, +1.595/−446).

## 0. Los 4 commits de la ronda (2 del predecesor + 2 de continuidad)

| Commit | Tipo | Qué |
|---|---|---|
| `392ad6c` | test(r7c) | Caracterización del postproceso DB de detección — `ocr/db-postprocess.ts` NACE como transcripción literal (28 tests, RED primero; `rapidocr.ts` INTACTO aquí) |
| `8f27e1a` | refactor(r7c) | **M8**: `inferDet` delega el postproceso DB en `dbPostprocess()` — `rapidocr.ts` 1.433→1.175 l (−258) |
| `a696a47` | test(r7c) | Caracterización de pipeline-comun (gemelos M6-fin, RED primero) — `pipeline-comun.ts` NACE como transcripción literal de los cuerpos gemelos (28 tests con valores dorados; el bridge TODAVÍA NO lo usa) |
| `23cd2de` | refactor(r7c) | **M6-fin**: el bridge delega los 7 helpers gemelos en `pipeline-comun.ts` + limpieza de imports muertos + refs `L####` actualizadas |

### 0-bis. Decisión sobre el WIP del predecesor (`r7c-wip-descartado.patch`)

El patch preservado era el diff de `scanner-core-bridge.ts` sobre el árbol del commit 3
(`a696a47`): el CABLEADO del bridge a `pipeline-comun.ts` (el paso 2 del patrón
RED-primero que el predecesor ya había usado en M8). **DECISIÓN: APLICADO** (`git apply`
limpio, sin conflicto), porque era TÉCNICAMENTE COHERENTE con la caracterización ya
commiteada: los 7 helpers que invoca (`bandaDirigidaSiFalta`, `caracterizarLectura`,
`construirDiagnosticoSitio`, `evidenciaBordeDe`, `medirEsquinasSitio`,
`trazaDesenlaceComun`, `vetoCuatroEsquinas`) calzan 1:1 con las firmas exportadas por
`pipeline-comun.ts:62-341` y con lo que los 28 tests dorados congelaron. NO estaba
incompleto en diseño, pero sí en acabado: tal cual venía NO COMPILABA (tsc TS18004 en
recorte) y dejaba 10 imports muertos. Correcciones aplicadas dentro de `23cd2de`:
(a) faltaba `let score = scoreBase` en `pipelineRecorte` (el patch borró el
`scoreDeCalidad` inline y no repuso la variable que consumen `resolverDesenlace`, el
log y el spread del acta); (b) imports sin uso tras el cableado (ver §4) — la zona
exige 0 warnings de lint; (c) `faltaSeccion` se desestructura SOLO en el escaneo (el
recorte no tiene perdón de marco — ver §8). Todo lo demás del patch se respetó
byte a byte, incluida su documentación de equivalencias y la ADAPTACIÓN DECLARADA del
orden de awaits en recorte.

## 1. Resumen

1. **M6-fin — los gemelos restantes del bridge, ×2 → ×1** (`23cd2de`): los ~150 l que
   `pipeline()` (escaneo) y `pipelineRecorte()` (recorte manual/mejorarResolución)
   mantenían duplicados viven ahora en **`pipeline-comun.ts`** (388 l, módulo PURO salvo
   los 2 helpers que orquestan I/O ya existente: `ocrBanda` y `esquinasDeActa` — cero
   awaits nuevos). Patrón **EntradaDesenlace de R7a**: cada diferencia legítima del sitio
   entra como CAMPO TIPADO del helper (`simular`, `aplica`, `sitio.{actaId,intento,
   maxIntentos,gateMarco,fondo,filtro,decodeMs,detectMs}`, `evidenciaSitio`, `extrasSim`,
   `extrasDeteccion`) — un cambio futuro de criterio compila o falla en AMBOS sitios; no
   puede divergir en silencio (el modo de fallo del bug F0.2 rev.1). El compilador
   garantiza la paridad: añadir/quitar un campo del contrato rompe la compilación del
   call-site que no lo atienda.
2. **M8 — postproceso DB fuera de `rapidocr.ts`** (predecesor, `392ad6c`+`8f27e1a`):
   `ocr/db-postprocess.ts` (367 l, puro: sin estado de módulo, sin DOM, sin ORT) recibe
   `dbPostprocess(pred, pw, ph, ops, srcW, srcH)`; `inferDet` pasa de ~258 l de bloque
   inline a UNA llamada. `rapidocr.ts` 1.433→1.175 l. 28 tests headless contra la
   transcripción (hull/rect/score/ordenarCajas/mapearAFuente + extremos).
3. **Refs `L####` muertas actualizadas** (`23cd2de`): los números de línea murieron con
   las particiones R7a/R7b; los comentarios ahora nombran el módulo dueño del criterio
   (detalle en §2 tabla C).
4. **Higiene**: imports muertos que dejó el cableado (10 símbolos en 4 imports) y
   docstrings que apuntaban a wiring viejo (detalle §4/§2-C).

No se tocó: `masiva/**` (zona de otro agente), `src/shared/**`, `.github/**`,
DECISIONS.md, las 20 anclas QA de `masiva/runner.ts`, el import dinámico de rescate
(`scanner-core-bridge.ts:569-570`, etiqueta e64-qr T-2.1) ni los 35 tests de gate R7a.

## 2. Cambios aplicados (evidencia file:line)

### A. M8 (predecesor — `392ad6c`, `8f27e1a`)

| Archivo:línea | Qué |
|---|---|
| `ocr/db-postprocess.ts:37-341` (NUEVO, 367 l) | `OpsDet` (37), `mapearAFuente` (52), `convexHull` (90), `minAreaRect` (115), `boxScoreFast` (160), `esquinasRect` (205), `ordenarCajas` (242), `dbPostprocess` (270) — transcripción literal del bloque «Post det (DBPostProcess en JS puro)» + pasos 1-4 de `inferDet`; origen citado línea a línea en la cabecera. Cambio único vs original: `src.naturalWidth/Height` → parámetros `srcW/srcH` (necesario para ser invocable headless) |
| `ocr/rapidocr.ts` (1.433→1.175 l) | Se retiran `OpsDet`, `mapearAFuente` y el bloque completo post-det; `inferDet` llama `dbPostprocess(pred, pw, ph, ops, srcW, srcH)`; `TEXT_SCORE` se queda (es del filtro del rec, no del det); los 7 mutables de módulo sobrevivientes quedan documentados en el INVENTARIO de la cabecera |

### B. M6-fin (commit 3 + cableado `23cd2de`)

| Archivo:línea | Qué |
|---|---|
| `pipeline-comun.ts:62` | `senalDeContenido` — MOVIDA del bridge (era module-private, gemela ×2 según R7a §10.2; solo la consumían los 2 sitios) |
| `pipeline-comun.ts:75` | `fmtClasif` — MOVIDA del bridge (solo la consumían los 2 logs de auditoría) |
| `pipeline-comun.ts:103` | `bandaDirigidaSiFalta` — banda dirigida ×2; guard SIM del sitio EXPLÍCITO (`simular`) |
| `pipeline-comun.ts:124` | `medirEsquinasSitio` — medición única de esquinas + lado + traza ×2 (SIM → `ESQUINAS_OK`/traza `"sim"`) |
| `pipeline-comun.ts:142` | `vetoCuatroEsquinas` — veto e71 ×2; `aplica` explícito (escaneo `!simular` · recorte `true`) |
| `pipeline-comun.ts:157` | `caracterizarLectura` — faltaSección + lazo + recortada + ocrLegible + señalActa + señal + pisoPerfecto + scoreBase ×2 |
| `pipeline-comun.ts:202` | `evidenciaBordeDe` — segmento `borde=/tintaFilo=/franja=/fondo=/perdon=` del log §3c ×2 (`null` → `""` como hoy) |
| `pipeline-comun.ts:225` | `trazaDesenlaceComun` — COLA del log D51 desde `votos=` hasta `ClasifDebil` (orden de tokens CONGELADO en UNA implementación) |
| `pipeline-comun.ts:305` | `construirDiagnosticoSitio` — payload del desenlace (R7b M4) ×2 → ×1, con bloque `sitio` de 8 diferencias tipadas |
| `scanner-core-bridge.ts:191-199` | Import de los 7 helpers (única dependencia nueva del bridge) |
| `scanner-core-bridge.ts:889` (escaneo) · `:1618` (recorte) | `medirEsquinasSitio({fotoProcesada, simular})` reemplaza las 3 líneas gemelas |
| `scanner-core-bridge.ts:970` (escaneo: `simular: opciones.simular === true`) · `:1594` (recorte: `simular: false`) | `bandaDirigidaSiFalta` reemplaza el `if (!opciones.simular && tipoDeBanda(...) === null)` ×2. Equivalencia verificada: con `simular===undefined`, `!undefined===true` corre la banda hoy y `undefined===true→false` NO la salta en el helper → misma decisión en los 3 estados del flag |
| `scanner-core-bridge.ts:997` (escaneo) · `:1667` (recorte) | `caracterizarLectura` reemplaza los ~26-33 l de señales; `let score = scoreBase` conserva la mutación posterior (`score = desenlace.score`) y `scoreVisual` queda capturado ANTES de los caps |
| `scanner-core-bridge.ts:1062` (escaneo: `aplica: !opciones.simular`) · `:1633` (recorte: `aplica: true`) | `vetoCuatroEsquinas` — misma conjunción `aplica && cuatroEsquinasFaltan(esquinas)` |
| `scanner-core-bridge.ts:1127` (escaneo) · `:1722` (recorte) | `evidenciaBordeDe(verificacionResuelta)` / `(verificacion)` — misma expresión; en recorte la verificación es no-null |
| `scanner-core-bridge.ts:1147` (escaneo) · `:1739` (recorte) | `construirDiagnosticoSitio` — las ~35 líneas de campos idénticos viven una vez; la guarda de sitio (`!opciones.simular` / `acta.fuente !== "SIMULACION"`) y el try/catch (observación PASIVA §9.7) quedan EN EL CALLER, intactos |
| `scanner-core-bridge.ts:1216` (escaneo) · `:1802` (recorte) | `trazaDesenlaceComun` — el head del log (decode/detect del escaneo; fuente del recorte) queda en el caller: es la parte genuinamente distinta |
| `scanner-core-bridge.ts:52-63` | Cabecera-mapa: los gemelos pasan de PENDIENTE a hecho; PENDIENTE queda SOLO el import dinámico de rescate (dueño: orquestador) |

### C. ADAPTACIÓN DECLARADA y refs actualizadas (doc-only, `23cd2de`)

| Archivo:línea | Qué |
|---|---|
| `scanner-core-bridge.ts:1661-1666` | **ADAPTACIÓN DECLARADA**: en recorte el `await medirZonaVotos` quedaba ENTRE las señales (tras `recortada`, antes de `ocrLegible`); el bloque extraído es PURO y síncrono → ahora corre después. Sin dependencia de datos mutados por el await (ver §7); orden relativo de las awaits del sitio (divipol → marcadores) intacto |
| `scanner-core-bridge.ts:260-262` | `«catch de detección L1284→»` → el detalle vive hoy en `gate.ts` (el número murió con las particiones) |
| `scanner-core-bridge.ts:908-912` | `«escudo anti-fondo (techo 7.9, L1461)»` → `gate.ts/resolverDesenlace` |
| `scanner-core-bridge.ts:1042-1043` | `«senal (L1368) y faltaSeccion (L1357)»` → `caracterizarLectura — pipeline-comun.ts` |
| `scanner-core-bridge.ts:1434-1438` | Docstring de `pipelineRecorte`: los helpers que «reusa» apuntan ahora a su módulo real (conRampa=bridge, PATRON_CABECERA=clasificador, scoreDeCalidad=calidad.ts vía pipeline-comun) |
| `scanner-core-bridge.ts:99-104, 115-120, 132-136, 143-147` | Comentarios de import re-apuntados a `pipeline-comun.ts` (quién consume cada símbolo movido) |

## 3. Duplicados eliminados

| Par gemelo (sitios: escaneo/recorte) | Antes | Después |
|---|---|---|
| Banda dirigida (guard SIM + cronómetro + `texto +=`) | 5 l ×2 | `bandaDirigidaSiFalta` ×1 (2 call-sites de 1 l) |
| Medición esquinas + lado + traza | 3 l ×2 | `medirEsquinasSitio` ×1 |
| Señales de texto: faltaSección → lazo → recortada → ocrLegible → señalActa → señal → pisoPerfecto → scoreDeCalidad | ~26-33 l ×2 (con comentarios casi idénticos) | `caracterizarLectura` ×1 (el caller desestructura lo que usa) |
| Veto e71 4/4 fiduciales | 1-3 l ×2 con guard SIM implícito | `vetoCuatroEsquinas` ×1 (guard EXPLÍCITO tipado) |
| Segmento evidencia-borde del log §3c | 8 l ×2 | `evidenciaBordeDe` ×1 |
| Payload `construirDiagnosticoDelDesenlace` | ~45 l ×2 (≈35 idénticas línea a línea) | `construirDiagnosticoSitio` ×1 (+ bloque `sitio` de 8 campos) |
| Cola del log de auditoría D51 (de `votos=` a `ClasifDebil`) | ~23 l ×2 con órdenes que solo el ojo mantenía iguales | `trazaDesenlaceComun` ×1 — el orden vive en UNA cadena |
| `senalDeContenido` / `fmtClasif` (module-private del bridge) | 9 l + 17 l (definición) + 2 consumos | definición única en pipeline-comun |
| **Postproceso DB de detección (M8)** | bloque inline ~258 l en `inferDet` | `dbPostprocess` ×1 en `ocr/db-postprocess.ts` |

Neto del bridge: 2.029 → 1.989 l (−40; diff `a696a47..23cd2de`: +246/−285). El cuerpo
común (388 l) ya estaba commiteado en `a696a47` como transcripción — el repo cambia de
~2×150 l duplicadas a 1 implementación + 7 contratos tipados. En M8, `rapidocr.ts`
−258 l netas con 0 cambio de comportamiento (28 tests de la transcripción).

## 4. Código muerto o innecesario eliminado

| Qué | Dónde | Evidencia | Acción |
|---|---|---|---|
| Import `./integridad` completo (`ESQUINAS_OK`, `cuatroEsquinasFaltan`, `ladoEsquinaFaltante`, `trazaEsquinas`) | bridge (antes L99-107) | Tras el cableado, 0 usos (todos via `medirEsquinasSitio`/`vetoCuatroEsquinas`) | Eliminado en `23cd2de` — el patch del predecesor lo dejaba vivo (hubiera sido 1 warning de zona) |
| `lazoPerdonadoPorLectura`, `senalDeLectura` del import `./senal-lectura` | bridge (antes L124) | 0 usos tras el cableado (`type NivelLectura` SÍ se conserva: firma de `marcoPerdonadoPorLectura`) | Import reducido a `import type { NivelLectura }` |
| `contrasteEfectivoDe`, `esquinasDeActa`, `scoreDeCalidad` del import `./calidad` | bridge (antes L138-144) | 0 usos tras el cableado (`calidadDeActa` + `InfoCrop` se quedan) | Import reducido |
| `ocrBanda` del import `./ocr-escalonado-runner` | bridge (antes L155) | 0 usos tras el cableado (`reconocerRapidOcr*` se quedan) | Import reducido |
| `import { construirDiagnosticoDelDesenlace } from "./auditoria"` | bridge (antes L185) | Reemplazado por `construirDiagnosticoSitio` | Eliminado por el propio patch (confirmado) |
| Comentarios espejo de los cuerpos movidos (`senalDeContenido`/`fmtClasif` dejan «nota de tumba» de 2 l cada uno) | bridge | El mapa de cabecera ya documenta el destino | Se conservan las notas de tumba (rastreo del kit) — no son código |
| M8 (predecesor): `OpsDet`/`mapearAFuente`/bloque post-det inline | `ocr/rapidocr.ts` | Se mudaron, no murieron — 0 líneas muertas nuevas; `TEXT_SCORE` re-documentado (es del rec) | — |

Ningún símbolo público quedó huérfano: `marcoPerdonadoPorLectura`,
`OpcionesEscaneoConTimeout`, `RealCoreBridge` siguen exportados desde el bridge
(`scanner-core-bridge.ts:329/417/426`) con sus consumidores intactos
(`get-bridge.ts`, `masiva/runner.ts`, `__tests__/gate.test.ts`).

## 5. Optimizaciones aplicadas (antes → después)

- **Compilador como guardián de la paridad ×2** (objetivo central de la misión): las 8
  diferencias de sitio del payload del diagnóstico y las 3 del log D51 son ahora CAMPOS
  de un contrato tipado — el caso real que motivó esto (bug F0.2 rev.1: el escaneo se
  arregló y el recorte divergió) ya no puede repetirse sin error de compilación.
- **Bridge**: 2.748 l (inicio R7b) → 2.028 l (fin R7b) → **1.989 l** (fin R7c). La
  fachada pública intacta; el auxiliar común vive en módulos puros testeables headless
  (gate 35 tests · pipeline-comun 28 · db-postprocess 28).
- **rapidocr.ts**: 1.433 → 1.175 l (−258, −18%); el postproceso DB queda puro y
  testable headless (antes: enterrado en una función async de ORT con canvas — no
  invocable sin modelo).
- **Orden de awaits sin coste nuevo**: cero llamadas I/O añadidas o reordenadas más allá
  de la ADAPTACIÓN DECLARADA de recorte (§2-C); el escaneo mantiene su orden exacto.

## 6. Optimizaciones propuestas NO aplicadas (porqué)

1. **Import dinámico de rescate `scanner-core-bridge.ts:569` → `masiva/identidad-qr`**
   (e64-qr T-2.1): PROHIBIDO por la misión — micro-tarea del orquestador. Intocado
   (verificado: sigue en L569-570 con su etiqueta).
2. **Inline del wrapper `evaluarGate`** (privado, 1 línea — R7b §4 lo proponía «junto a
   M6»): NO aplicado. Es el SEAM que `__tests__/gate.test.ts` usa para comparar el
   ORIGINAL contra el módulo puro (cabecera del test: «A. ORIGINAL directo —
   `RealCoreBridge#evaluarGate`… B. ACUERDO»). Inlinarlo rompería la caracterización
   R7a (35 tests) sin beneficio real; declarado PENDIENTE hasta que el dueño decida
   retirar el seam junto con la propia comparación.
3. **Agrupar los 22 campos de `trazaDesenlaceComun` en sub-objetos**: la forma plana es
   la transcripción fiel del log; re-agrupar sería re-diseño cosmético sin garantía
   adicional. El contrato tipado ya cumple el objetivo.
4. **Unificar también el HEAD de los 2 logs** (`[e14] pipeline …` vs `[e14] recorte …`):
   la parte genuinamente distinta (decode/detect/fuente) — forzarla haría el contrato
   más complejo sin eliminar duplicación real. Documentado como diseño deliberado.
5. **Gating del pre-warm OCR (~30 MB al importar)** — R7b §7.1/R4: cambio de
   COMPORTAMIENTO (cuándo carga el modelo), fuera de la doctrina de equivalencia de
   esta ronda. Cola del dueño.
6. **Desestructurar `faltaSeccion` en recorte** por simetría con el escaneo: NO — es una
   variable sin uso en ese sitio (warning de zona; zona exige 0 warnings). La simetría
   la da el contrato tipado, no la desestructuración.

## 7. Riesgos y cobertura

- **Paridad del log D51** (contrato congelado — «solo añadir al final»): cobertura
  triple. (a) 28 tests de caracterización con valores dorados derivados a mano de las
  expresiones ANTERIORES del bridge — incluyen la cola completa en estilo ESCANEO
  (tokens sim/detección/diag/origen) y estilo RECORTE (skip-pag2/escudo-manual/crop=full/
  ClasifDebil), `pipeline-comun.test.ts:327-433`; (b) revisión token-a-token del diff
  del cableado (`votos= → SIN_VOTOS → recortada=1 → lado= → lazo=perdonado → esquinas=+
  evidencia → quad= → piso10/origen → score/filtro/ocrIn → ocr=rapidocr → lectura/anclas/
  piso → clasif → crop → metricas → sim/diag → detectOrigen/detectReintento →
  ClasifDebil`); (c) tsc — los campos tipados obligan a pasar CADA token por el contrato.
  Residual conocido (desde R7a): los logs runtime no son testeables headless end-to-end;
  la paridad queda sostenida por caracterización + diff + tsc.
- **ADAPTACIÓN DECLARADA (recorte)**: las señales puras ahora se computan antes del
  `await medirZonaVotos`. Riesgo evaluado NULO: ninguna de las 8 señales depende de nada
  que el await mute (`medirZonaVotos` solo lee `fotoProcesada`; las señales son funciones
  puras de `texto/clasificacion/esquinas/calidad`) y no hay escritura compartida entre
  ambas. Documentada en el código (`scanner-core-bridge.ts:1661-1666`).
- **Guard SIM de los chips 8.2/7.0/4.3**: los 3 guards implícitos originales
  (`!opciones.simular`, `opciones.simular ? ESQUINAS_OK : …`, `opciones.simular ? "sim" : …`)
  pasaron a campos explícitos. Cobertura: `bandaDirigidaSiFalta` SIM (test «OMITIDA byte
  a byte»), `medirEsquinasSitio` SIM (ESQUINAS_OK/traza sim), `vetoCuatroEsquinas`
  `!aplica`. Con `simular===undefined` la equivalencia se conservó (verificado §2-B).
- **Patch WIP aplicado de un tercero**: riesgo de heredar errores ajenos — mitigado por
  compilador (encontró el `score` faltante), suite completa (269) y revisión línea a
  línea del diff antes de commitear.
- **No se cambió NINGÚN expect de las caracterizaciones pre-existentes** (35 gate R7a ·
  28 db-postprocess · 28 pipeline-comun · 51 masiva R8): `23cd2de` no toca ningún
  archivo de test.

## 8. Decisiones tomadas sin dueño (justificadas)

1. **APLICAR el patch del predecesor** (vs. rehacer limpio): la dirección era correcta y
   calzaba 1:1 con la caracterización commiteada; rehacer habría tirado trabajo verificado.
   Correcciones mínimas documentadas en §0-bis.
2. **`faltaSeccion` solo en el desestructurado del escaneo** (`scanner-core-bridge.ts:997`
   vs `:1667`): en recorte nadie la consume (el perdón de marco es exclusivo del escaneo).
   La asimetría está comentada en el sitio (`:1665-1666`).
3. **Comentarios `L####` muertos → nombre de módulo** (no borrado): la referencia sirve
   para encontrar el criterio; el módulo es estable, la línea no. Las citas EXTERNAS
   (apps/scanner-lab L602-604, L644-669, L1360-1395…) se CONSERVAN: son fuentes de otro
   repo y no han cambiado.
4. **Notas de tumba de 2 líneas** donde vivían `senalDeContenido`/`fmtClasif` (R7c) y
   donde vivían los imports retirados: mantienen el rastreo del kit sin coste.
5. **Seam `evaluarGate` conservado** (ver §6.2): decisión conservadora que R7b ya había
   sugerido revisar «junto a M6» — queda anotada para el dueño con el contexto nuevo.

## 9. Evidencia real de verificación (comandos y salidas REALES)

ANTES (árbol del commit 3 `a696a47` — estado verificado por el orquestador y re-run por
el continuador antes de tocar):

```
$ bunx tsc --noEmit                 → (sin salida) exit 0
$ bun run lint                      → ✖ 2 problems (0 errors, 2 warnings)   [warnings <img>
                                       pre-existentes en modules/supervision — fuera de zona]
$ bun test                          → 269 pass · 0 fail · 2.992 expect() calls · 24 archivos [19.85s]
```

DESPUÉS de cada commit (el tree se verificó verde tras `23cd2de`; `a696a47`/`8f27e1a`/
`392ad6c` llegaron verdes por el predecesor — evidencia en sus mensajes: 28 pass/69
expect cada caracterización, tsc 0):

```
$ git apply --check r7c-wip-descartado.patch   → PATCH APLICA LIMPIO
$ bunx tsc --noEmit                            → 1ª pasada: 5 errores TS18004/TS2304
                                                 (score faltante en recorte — corregido)
                                               → 2ª pasada: exit 0 (sin salida)
$ bun run lint                                 → ✖ 2 problems (0 errors, 2 warnings)
                                                 [los MISMOS 2 de la baseline — zona
                                                 digitalizador: 0 errores, 0 warnings]
$ bun test                                     → 269 pass · 0 fail · 2.992 expect() calls ·
                                                 24 archivos [19.75s]
$ bun test src/.../__tests__/pipeline-comun.test.ts → 28 pass · 0 fail · 69 expect
$ git diff a696a47..23cd2de --stat             → scanner-core-bridge.ts | 246 + / 285 −
$ git diff main...HEAD --color-moved=dimmed-zebra → (transcripciones literales — ver
                                                 cabecera de pipeline-comun.ts y de
                                                 db-postprocess.ts con origen citado)
```

API pública verificada sin cambios: `rg "^export"` en `scanner-core-bridge.ts` →
`OpcionesEscaneoConTimeout` (329) · `marcoPerdonadoPorLectura` (417) · `RealCoreBridge`
(426). Import dinámico de rescate intacto: `scanner-core-bridge.ts:569-570`.

## 10. Hallazgos fuera de zona (vistos, NO tocados — alimenta la siguiente ola)

1. **2 warnings de lint pre-existentes** en `modules/supervision` (`acta-viewer-modal.tsx:336`,
   `vista-recepcion.tsx:69` — `<img>` en vez de `next/image`): fuera de zona; son los
   únicos warnings del repo.
2. **`masiva/` intocada y verificada**: la suite de caracterización (51) y el bench R8
   pasaron sin ediciones — la partición del bridge no la afecta (los 20 anclas QA de
   `runner.ts` siguen grepeables).
3. **El seam `evaluarGate` del bridge** queda como candidato a retiro cuando el dueño
   decida jubilar la comparación ORIGINAL-vs-puro de gate.test.ts (ver §6.2/§8.5).
4. **`pipeline-comun.ts` hereda el formato plano de 22 campos** en `trazaDesenlaceComun`:
   si el log D51 vuelve a crecer, valdrá un sub-contrato `extrasLog` único — decisión de
   diseño para quien toque el log de nuevo.
5. **Gating del pre-warm OCR** (R4/R7b §7.1) sigue sin dueño asignado en ocr/ — impacto
   ~30 MB al importar el módulo; recomendación: decidirlo antes del próximo kit de OCR.

## PENDIENTES declarados (honestidad radical)

- **Import dinámico de rescate núcleo→masiva** (`scanner-core-bridge.ts:569`, e64-qr
  T-2.1): NO tocado — es micro-tarea del ORQUESTADOR (prohibida para esta ronda).
- **Inline de `evaluarGate`**: PENDIENTE del dueño (rompería el seam de 35 tests R7a;
  ver §6.2).
- **Gating del pre-warm OCR**: PENDIENTE del dueño (cambio de comportamiento, fuera de
  la doctrina de equivalencia).
- **Rutas con OCR/canvas real** (SIM usa assets reales): la equivalencia de los 7 helpers
  se sostiene en caracterización + diff + tsc, NO en un run end-to-end del pipeline
  (imposible headless — residual declarado desde R7a §7 y asumido por el orquestador).
- **Golden D21 en DECISIONS.md** sigue desfasado (pre-existente, zona prohibida).
