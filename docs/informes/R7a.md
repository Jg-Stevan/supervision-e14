# INFORME R7a — Extraer el gate (desenlace) duplicado del bridge

> Agente R7a · Ola 2 (secuencial) · branch `refactor/r7a-gate` (base 54f8163 = main de la Ola 1)
> Commits: `1184fd3` test(r7a) → `5e27369` refactor(r7a) → `docs(r7a)` este informe.

## 1. Resumen

Se extrajo la secuencia completa del DESENLACE (gate) — bloque C3 de lectura, inyección SIM, caps del sitio (escudo-fondo/escudo-manual/recortada), gate (INCOMPLETA · SIN_VOTOS · evaluarGate §4), caps post-gate 6.4, sustitución BAJO §D3 y techosDiag — desde `scanner-core-bridge.ts` (2905 líneas) a un módulo PURO nuevo `lib/e14/gate.ts` (313 líneas). `pipeline()` y `pipelineRecorte()` ahora delegan en `resolverDesenlace({...})`; las diferencias legítimas entre ambos (chip SIM, escudo-manual Q2, copy INCOMPLETA por origen) quedan EXPLÍCITAS como entradas tipadas en vez de ramas gemelas. Neto: −276/+119 líneas en el bridge (−157) y una sola fuente de verdad para el desenlace. RED PRIMERO: 35 tests de caracterización commiteados ANTES del refactor corrieron verdes contra el bridge ORIGINAL (seam directo al `evaluarGate` privado + acuerdo de rejilla) y siguen verdes byte a byte después, sin modificar ni una aserción. Verificación final: tsc 0 errores · bun test 159 pass / 0 fail · lint 0 errores (5 warnings pre-existentes, ninguno en mi zona).

## 2. Cambios aplicados

| Archivo | Qué | Por qué |
|---|---|---|
| `src/modules/digitalizador/lib/e14/gate.ts` (NUEVO, 313 l) | `resolverDesenlace(EntradaDesenlace): SalidaDesenlace` puro + `evaluarGate` puro (movido verbatim del bridge) + copies/techos del desenlace (`DETALLE_*`, `TECHO_SIN_SENAL`, `TECHO_ESCUDO_FONDO`) | M3 de `docs/revision-v1/03a-digitalizador-nucleo.md`: UNA implementación del desenlace para ambos pipelines; mata la sincronía a mano (pitfall §9.9) que ya causó el bug de polaridad F0.2 rev.1 |
| `src/modules/digitalizador/lib/e14/scanner-core-bridge.ts` (2905→2748 l) | pipeline()/pipelineRecorte(): los bloques duplicados se sustituyen por UNA llamada `resolverDesenlace(...)`; refs `gate.*` → `desenlace.*`; `private evaluarGate` queda como delegante al módulo puro (seam); imports/consts ajustados | El bridge ya no decide el desenlace: lo recibe estructurado. El log/diag/acta quedan en el caller sin recomputo (pitfall §9.10) |
| `src/modules/digitalizador/lib/e14/__tests__/gate.test.ts` (NUEVO, 405 l) | 35 tests de caracterización en 3 seams (ver §9) | Fijar el comportamiento ANTES de tocar el bridge y detectar regresiones de polaridad/caps/bordes para siempre |

Firmas públicas del bridge INTACTAS (`escanearActa`, `recortar`, `mejorarResolucion`, `revelar`, `reconocerTexto`, `marcoPerdonadoPorLectura`). Ningún archivo fuera de la zona fue tocado.

## 3. Duplicados detectados (qué / dónde / acción)

- **Desenlace completo duplicado** (C3 → SIM → caps → gate → post-caps → BAJO → techosDiag): `pipeline()` L1642-1833 ≡ `pipelineRecorte()` L2401-2495 (refs de main 54f8163). ~140 líneas gemelas + ~50 de comentarios espejo. **Acción: ELIMINADO** — vive una sola vez en `gate.ts::resolverDesenlace`.
- **`evaluarGate` (criterio §4)**: método privado consumido solo por los 2 pipelines. **Acción: MOVIDO** a `gate.ts` (verbatim); el método queda delegando (seam, ver §4).
- **Constantes del desenlace** (`DETALLE_ILEGIBLE/GENÉRICO/INCOMPLETA(+_ESCANEO)/SIN_VOTOS/BAJO`, `TECHO_SIN_SENAL`, `TECHO_ESCUDO_FONDO`): duplicación potencial entre bridge y gate. **Acción: MOVIDAS** a gate.ts (export) — el bridge importa `DETALLE_ILEGIBLE` y `TECHO_SIN_SENAL` (aún usados en rutas propias: catch de detección y `scoreDeCalidad`).
- **PENDIENTE (R7b, fuera de mi zona)**: banda dirigida, clasificación+faltaSección+lazo+recortada, escudo esquinas (e71), `senalDeContenido`, `construirDiagnostico` y el log de auditoría siguen duplicados — los comentarios «mismo criterio en AMBOS (pitfall §9.9)» que NO refieren al desenlace siguen en pie (≈8 menciones de las 15 originales; hoy 4 adicionales son citas textuales del pitfall hechas por R7a).

## 4. Código muerto o innecesario detectado (qué / dónde / EVIDENCIA / acción)

- **`statusDeScore` (import) y `PISO_LECTURA_FUERTE`/`TECHO_LECTURA_DEBIL` (imports) del bridge** — EVIDENCIA: `rg 'statusDeScore|PISO_LECTURA_FUERTE|TECHO_LECTURA_DEBIL' scanner-core-bridge.ts` → solo 3 usos, todos dentro del desenlace movido. **Acción: imports eliminados** del bridge (las consts viven en `./types` y `./senal-lectura`, intocadas).
- **Método `private evaluarGate` del bridge** — EVIDENCIA: tras el refactor 0 llamadores en producción (`rg 'this.evaluarGate'` → solo su definición). **Acción: se CONSERVA como delegante de 1 línea** — es el seam que usan los tests de caracterización (seam A/B) y el punto de anclaje de la partición R7b. Declarado aquí para que nadie lo borre sin migrar los tests.
- **Nada más**: no se detectó código muerto adicional en la zona del desenlace (cada rama eliminada tenía consumidor).

## 5. Optimizaciones aplicadas (antes / después)

- **Duplicación**: ~190 líneas del desenlace existían ×2 (pipeline + recorte, sin contar comentarios espejo) → ×1 en `gate.ts`. Bridge: 2905 → 2748 líneas (−157 neto tras añadir las 2 llamadas + docs).
- **Sincronía manual → compilador**: 6 diferencias legítimas entre pipelines que antes vivían ocultas en ramas gemelas (chip SIM, escudo-manual, veto según `manual`, copy por origen, fondo nullable, gateMarco) ahora son campos tipados de `EntradaDesenlace` — un cambio futuro de criterio compila o falla en ambos sitios, no diverge en silencio (el modo de fallo del bug F0.2).
- **`marcadoresOk` computado 1 vez** (antes 1 línea por pipeline, con riesgo de divergencia) → nace dentro de `resolverDesenlace` y regresa en la salida estructurada para log/diag/cap.
- Costo runtime: 0 llamadas nuevas a I/O; `resolverDesenlace` es síncrono y puro (los awaits quedaron en el caller en el MISMO orden relativo que hoy; verificado: sin `emitir()` ni retornos tempranos entre `scoreVisual` y el punto del desenlace).

## 6. Optimizaciones propuestas NO aplicadas (→ cola del dueño)

- **Partición completa del bridge** (M1/M2 + helpers de dominio): es R7b — este PR solo extrae el gate por diseño del orquestador.
- **Mover también el cálculo de `completa`** (perdón del marco F0.2 + veto 4/4 fiduciales e71) a `gate.ts`: las dos pipelines calculan `completa` con REGLAS DISTINTAS (marco/escaneo vs `verificacion.completa && !fiduciales` + degradación manual Q2). Unificarla habría exigido flags de modo y reordenar awaits — riesgo > beneficio; hoy entra como `completa`/`vetoIncompleta` ya resueltos. DECISIÓN PENDIENTE DEL DUEÑO si R7b quiere absorberla.
- **Mover el log de auditoría gigante y `construirDiagnostico`** a un módulo compartido: mismas ~60 líneas ×2, pero el contrato de esta misión es SOLO el gate; el log es byte-a-byte observable y cualquier toque merece su propia caracterización (R7b).
- **`ResultadoGate` como tipo exportado de gate.ts**: hoy se exporta para el seam del bridge; si R7b elimina el método privado, puede dejar de exportarse.

## 7. Riesgos y cobertura (qué puede romperse + test que lo cubre)

| Riesgo | Cobertura |
|---|---|
| Regresión de polaridad del perdón F0.2 (el bug histórico rev.1) | `marcoPerdonadoPorLectura` seam A (6 aserciones) + 3 tests compuestos que reproducen la composición exacta de `pipeline()` — si el trío se re-niega, mueren |
| Chips SIM 8.2/7.0/4.3 mal mapeados (auto-envío roto) | seam A (directo al bridge) + 4 tests de chips vía `resolverDesenlace` |
| Caps aplicados en orden incorrecto (fair/poor → sin-señal → piso → fondo → manual → recortada → incompleta → sin-votos) | 2 tests de `techosDiag` con orden EXACTO (toEqual) + tests de cap activo con score esperado |
| Sustitución BAJO tocando status/clasificación de más | test «sin señal → rechazo BAJO, status OPTIMA intacto, techosDiag con token» |
| Contingencia C4 (intentos agotados) distinta por rama | 3 tests (INCOMPLETA agotado, SIN_VOTOS agotado, evaluarGate agotado en rejilla) |
| Divergencia gate.ts vs bridge | test de ACUERDO: rejilla 12 scores × 2 textos × 2 intentos × 3 niveles ≡ `evaluarGate` del bridge (se mantiene verde post-refactor vía delegación) |
| No-pureza (mutación de entrada / estado de módulo) | test «misma entrada dos veces → salida idéntica» + «la entrada no se muta» |
| Límite real NO cubierto por tests headless: los logs `[e14] pipeline/recorte` en runtime (canvas/OCR) no se pueden ejecutar en bun. La paridad se sostiene en: (a) solo se renombró `gate.*`→`desenlace.*` en las expresiones de log (diff revisable, 0 cambios de strings/condiciones), (b) tsc valida tipos. Declarado honestamente como residual. | revisión de diff + tsc |

## 8. Decisiones sin dueño (justificadas)

1. **`gate.ts` nace en el commit de TESTS** (`1184fd3`) como transcripción literal (con origen citado línea a línea en su header), y el bridge se cablea en el commit de refactor (`5e27369`). Justificación: la misión exige correr tests contra el código original ANTES de refactorizar, pero el desenlace original NO es invocable headless (está inline en métodos con canvas/OCR). El único modo honesto: (a) seam directo al `evaluarGate` privado original + `marcoPerdonadoPorLectura` exportada, (b) transcripción mecánica para el resto, (c) test de ACUERDO transcripción↔original corriendo contra el bridge sin tocar. El orden git `test → refactor` queda intacto y la evidencia del §9 lo respalda.
2. **`completa`/`vetoIncompleta`/`escudoManual` entran como inputs** en vez de computarse dentro del gate (ver §6.2) — opción conservadora que preserva byte a byte las reglas distintas por pipeline.
3. **Método privado delegante `evaluarGate` conservado** pese a quedar sin llamadores en producción (seam de tests + anclaje R7b). Documentado en §4 para evitar que se borre sin migrar los tests.
4. **`fondo: verificacionResuelta?.fondo ?? false`** en pipeline: la coalescencia reproduce exactamente la semántica de `completa && verificacionResuelta?.fondo` original (undefined → falsy) con entrada booleana estricta.

## 9. Evidencia (comandos y salidas REALES)

**(1) Tests de caracterización contra el CÓDIGO ORIGINAL** (bridge en 54f8163, sin tocar — `git status` solo mostraba los archivos nuevos):

```
$ bun test src/modules/digitalizador/lib/e14/__tests__/gate.test.ts
  35 pass
  0 fail
  234 expect() calls
Ran 35 tests across 1 file. [59.00ms]
```
Incluye el seam A contra el bridge original, p. ej.:
```
(pass) caracterización · evaluarGate del bridge ORIGINAL (seam A) > chips SIM conocidos 8.2 / 7.0 / 4.3 (AUTO) [1.06ms]
(pass) caracterización · evaluarGate del bridge ORIGINAL (seam A) > gate bloqueante: score < 6.5 rechaza; OCR inválido → ILEGIBLE [0.02ms]
(pass) caracterización · marcoPerdonadoPorLectura F0.2 rev.2 (seam A) > trío COMPLETO perdona (rev.2 — polaridad correcta) [0.02ms]
(pass) caracterización · acuerdo evaluarGate(gate.ts) ≡ evaluarGate(bridge) > rejilla de scores × textos × intentos × niveles — IGUALES [0.73ms]
```
(Los 2 primeros intentos de corrida revelaron 2 VALORES DORADOS equivocados MÍOS — puntuación poor ya capada por scoreDeCalidad y token escudo-fondo inalcanzable con veto real — se corrigieron los tests ANTES de commitear; el código original nunca se tocó. Son exactamente los dos tests de frontera que hoy documentan el límite correcto del seam.)

**(2) Tras el refactor — mismos tests SIN cambios:**
```
$ bun test src/modules/digitalizador/lib/e14/__tests__/gate.test.ts
  35 pass / 0 fail · 234 expect() calls
```

**(3) DoD completa:**
```
$ bunx tsc --noEmit          → (sin salida) exit 0 — 0 errores
$ bun test                   → 159 pass / 0 fail · 2624 expect() calls · 19 files (main traía 124: +35 de R7a)
$ bun run lint               → ✖ 5 problems (0 errors, 5 warnings)  [los mismos 5 warnings pre-existentes de main: perfil-provider, acta-viewer-modal, vista-recepcion ×2, actas-mock — ninguno en mi zona]
$ git diff --stat main...HEAD → SOLO rutas de mi zona:
   .../lib/e14/__tests__/gate.test.ts | 405 +++++
   .../lib/e14/gate.ts                | 313 ++++
   .../lib/e14/scanner-core-bridge.ts | 395 ++++++-------------- (119+/276−)
```

## 10. Hallazgos fuera de zona (vistos, NO tocados — alimenta la siguiente ola)

1. **`main` local (fdca1ec) va 1 commit adelante de mi base (54f8163)** — es `docs(informes): registro auditable de la delegación…` del orquestador. No rebreé (misión: base 54f8163, sin push); `git diff --stat main...HEAD` usa merge-base y muestra solo mi zona. Sin conflicto esperado al integrar (mi informe toca `docs/informes/R7a.md`).
2. **Duplicaciones restantes del bridge para R7b** (con sus comentarios «mismo criterio en AMBOS» aún en pie): banda dirigida, clasificación+faltaSección+lazo, bloque de escudo de esquinas e71, `senalDeContenido`/`ocrLegible` (×2), `construirDiagnostico` completo y el log de auditoría gigante (~60 l ×2).
3. **Comentarios con refs de línea obsoletas** en pipelineRecorte (p. ej. «Condición espejo exacta del C3 del recorte (L1503-1508)» — esas líneas ya no existen en el archivo actual): deriva histórica de números de línea en comentarios. R7b debería revisar todas las refs `L####` al particionar.
4. **Docstring de `evaluarGate`** menciona «vía statusDeScore» — sigue cierto (ahora en gate.ts); avisar a R7b de que el criterio ya no vive en el bridge.
5. **`medirZonaVotos` en recorte se llama SIN el rect del marco** (pipeline pasa `marcoEscaneo?.rect`) — correcto por diseño (el recorte manual no evalúa marco), pero merece comentario propio algún día; no lo toqué.
