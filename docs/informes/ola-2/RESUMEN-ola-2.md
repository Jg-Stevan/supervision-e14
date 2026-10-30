# RESUMEN OLA 2 — Auditoría de orquestador (R7a · R7b · R8)

> Documento consolidado por el orquestador al cerrar la Ola 2. Fuentes: informes
> commiteados por los agentes (`docs/informes/R7a.md`, `R7b.md`, `R8.md`) +
> verificación independiente (tsc/lint/test re-corridos, zonas contrastadas con
> `git diff --stat`, spot-checks). La Ola 2 fue SECUENCIAL: R7a → R7b → R8.

## 1. Estado de la ola

| Agente | Zona | Commits | Merge | Auditoría |
|---|---|---|---|---|
| R7a gate | bridge + `gate.ts` (nuevo) | 3 (`1184fd3`→`2c2f848`) | `898e5ae` | ✓ OK |
| R7b partición | raíz `lib/e14/` (+vendor) | 9 (`1b74aa6`→`4996ca0`) | `ff61533` | ✓ OK (remate) |
| R8 runner/store | `masiva/**` | 14 (`f4ef115`→`c2b9ae5`) | `e671bbd` | ✓ OK (4-agent chain) |

**Nota de ejecución**: el entorno cortó 3 sesiones por deadline (R7b a mitad,
R8 tres veces). Patrón de sobrevivencia: commits verdes acumulados + remates en
cadena + WIP roto descartado a patch (`/home/z/work/r8-wip-stage3-descartado.patch`).
La misión de R8 se completó con **PARCIAL honesto declarado** (§3.4 abajo).

**Verificación independiente sobre main (post-merge `de2706f`):**
- `bunx tsc --noEmit` → **0 errores** · `bun run lint` → **0 errores / 5 warnings pre-existentes**
- `bun test` → **211 pass / 0 fail** (2.830 expect, 21 archivos)
- Anclas QA: 20 literales grepeables intactos en `runner.ts` · madge: 0 circular
- CI 100 % bloqueante (sin `continue-on-error` desde la Ola 1)

## 2. Entregas (síntesis)

- **R7a** — Gate (desenlace) extraído a `lib/e14/gate.ts` PURO (313 l): RED PRIMERO
  con 35 tests de caracterización (commiteados ANTES del refactor, incluido el caso
  de polaridad del bug histórico F0.2 + test de acuerdo rejilla 12×2×2×3). Bridge
  2.905→2.748. Las 6 diferencias legítimas entre pipelines hoy son campos tipados
  de `EntradaDesenlace` — un cambio futuro compila o falla en ambos sitios (el modo
  de fallo del bug F0.2 queda estructuralmente cerrado).
- **R7b** — Partición §7 del bridge (move-only con fachada): 2.748→2.028 l y 7
  módulos por responsabilidad (`calidad` 359, `acta-factory` 188,
  `ocr-escalonado-runner` 186, `auditoria` 138, `sim-assets` 117, `qr-zxing` 81 +
  vendor jsQR git-mv R100). **FIX M10**: fin de la dependencia invertida
  núcleo→masiva (0 imports estáticos; queda 1 dinámico de rescate `bridge:593`
  PENDIENTE). Re-exports temporales en masiva anotados (R8 los retiró).
- **R8** — Núcleo masiva: caracterización de 51 tests contra el ORIGINAL (8+ puertas
  de dedup, fases, trazas byte-idénticas), **FIX C5** (park + re-visita fin de ola;
  el slot del pool ya no se congela hasta 10 min), ciclo store↔runner↔precalor roto
  por INYECCIÓN (`store-api.ts`, API Zustand intacta), payload map + ledger
  consolidados (`dedup-payloads.ts`, `dedup-indice.ts`), **split de `procesarUno`
  en 5/5 stages** con ctx tipado y trazas en un único sitio, benchmark headless
  N=120×8 **sin regresión dentro del ruido**.

## 3. Hallazgos consolidados (duplicados / muerto / optimizaciones)

### Eliminados EN esta ola
- Desenlace duplicado ~190 l ×2 (R7a) · ~720 l de responsabilidades clonadas del
  bridge (R7b) · 2 mapas de payload gemelos + índice enterrado en 6 roles del
  store (R8) · 3 sitios de traza post-mortem → 1 (R8) · espejos/lets del
  orquestador (R8) · imports muertos tras los moves (R7a: `statusDeScore`,
  `PISO_LECTURA_FUERTE`, `TECHO_LECTURA_DEBIL`).

### Duplicados RESTANTES documentados (→ próxima ola)
1. `rapidocr.ts`: 3 capas + ~5 mutables de módulo (M8) — r7c (R7b lo declaró fuera por riesgo).
2. Gemelos bridge restantes: banda dirigida, clasificación+faltaSección+lazo, escudo esquinas e71, `construirDiagnostico` + log de auditoría (~60 l ×2) — r7c.
3. Helper ÚNICO de las 6 rutas DUPLICADA/YA-ENVIADA: datos ya consolidados; faltan converger call-sites — r8b.
4. Comentarios con refs `L####` obsoletas en pipelineRecorte — revisar al tocar.

### Optimizaciones aplicadas
- Compilador como guardián del criterio duplicado (R7a) · −877 l netas del bridge
  con fachada intacta para consumidores (R7a+R7b) · slot del pool liberado en caso
  patológico C5 (R8) · orquestación de masiva en 5 stages testeables (R8).

## 4. Cola de decisiones del DUEÑO (actualizada tras Ola 2)

1. **ADR idEnlace (2 vs 3 dígitos)** — sigue pendiente (decisión de producto).
2. **r7c**: rapidocr M8 (db-postprocess puro + tests) + gemelos restantes del
   bridge + import dinámico `bridge:593` (e64-qr T-2.1) + revisar refs L####.
3. **r8b**: helper único de 6 rutas + desconexión completa de `COLA_PERSISTENTE`
   (que se alimente del ledger `dedup-indice.ts`).
4. **Veneno cross-file de tests**: `flags-schema.test.ts` (shared) instala un
   window falso global que aborta suites posteriores en el mismo proceso — fix de
   raíz en shared (hoy mitigado con shim en el harness de R8).
5. **Golden D21** en `DECISIONS.md:374` (desfasado desde Ola 1) + ítems 3-10 de la
   cola de la Ola 1 (ver `RESUMEN-ola-1.md` §4: initSupervisionDatos explícito,
   exports canónicos, FiltrosPuestos al repo, guard de conteos en CI, topes R5,
   Profiler, limpieza menor, doble deploy).

## 5. Riesgos residuales (aceptados en auditoría)

- Logs runtime del pipeline no testeables headless (paridad sostenida en diff + tsc) — R7a.
- Riesgo residual del memo de `FilaMasivaVista` (degrada, no rompe) — Ola 1.
- Caso patológico C5: aparcada re-visita al fin de ola (comportamiento nuevo, testeado) — R8.
- Benchmark R8 mide orquestación headless; el muro con OCR real queda para el dueño.

## 6. Sistema de documentación (estado)

- Contrato con informe commiteado OBLIGATORIO se aplicó desde el primer agente de
  esta ola: `R7a.md`, `R7b.md`, `R8.md` (10 secciones) + este RESUMEN.
- Lección incorporada al contrato: **pr.md jamás se commitea** (un agente de la
  cadena R8 lo commiteó; retirado por orquestador en `de2706f`, preservado en
  `/home/z/work/r8-pr-final-preserved.md`).
- Cadena de remates: ante deadline, commits verdes acumulados + informe parcial
  actualizado = entrega válida; el orquestador consolida al cierre.
