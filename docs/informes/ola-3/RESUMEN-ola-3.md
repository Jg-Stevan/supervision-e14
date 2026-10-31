# RESUMEN OLA 3 — Auditoría de orquestador (r7c · r8b · higiene · r9)

> Consolidado por el orquestador al cerrar la Ola 3. Fuentes: informes commiteados
> por los agentes (`docs/informes/ola-3/`) + verificación independiente (tsc/lint/
> test re-corridos, zonas contrastadas con `git diff --stat`, spot-checks). Ejecución
> PARALELA de 4 agentes con zonas disjuntas.

## 1. Estado de la ola

| Agente | Zona | Commits | Merge | Auditoría |
|---|---|---|---|---|
| higiene | shared tests + DECISIONS.md + actas-mock + perfil-provider | 4 (`aa6ec2a`→`1d59325`) | ✓ | OK |
| r8b | `masiva/**` | 3 (`58c8d72`→`1704eb2`) | ✓ | OK |
| r9 | supervision components/domain + vista-recepcion | 5 (`6a076c4`→`782dbbe`) | ✓ | OK |
| r7c | `lib/e14/**` (bridge) | 5 (`392ad6c`→`29e6d1f`) | ✓ | OK (2 sesiones) |

**Notas de ejecución (transparencia):**
- El primer agente r7c murió por corte de infraestructura tras 3 commits verdes
  (M8 completo + caracterización de gemelos). Su WIP sin commitear se preservó a
  patch (`/home/z/work/r7c-wip-descartado.patch`) y el agente continuador lo
  aplicó, lo completó y documentó la decisión (R7c.md §0-bis).
- **Incidente recuperado**: un `reset --hard` del orquestador movió el branch del
  agente caído (el `git status` no muestra commits propios — auditar SIEMPRE con
  `git log main..branch`). Los 3 commits se recuperaron íntegros vía reflog.

**Verificación independiente sobre main (post-merge completo):**
- `bunx tsc --noEmit` → **0 errores**
- `bun run lint` → **0 errores / 2 warnings** (solo los 2 `<img>`: decisión de deploy del dueño; veníamos de 5)
- `bun test` → **269 pass / 0 fail** (2.992 expect, 24 archivos) — veníamos de 211
- Zonas: r7c tocó 0 archivos de masiva; sin invasiones entre agentes (contrastado por diff)

## 2. Entregas (síntesis)

- **higiene** — Veneno cross-file de tests muerto DE RAÍZ: `flags-schema.test.ts`
  ya no instala un window falso global (beforeAll/afterAll restaura `globalThis`
  exacto; demo ANTES/DESPUÉS en su informe §9). El shim de mitigación de R8 queda
  INERTE (retirable). Golden D21 actualizado: `949 = 233+44+198+474` + nota de
  anclas D26/D44 + canónico vivo `mock-determinismo.test.ts`. Warnings de zona a 0
  (2 disables con razón técnica documentada y demostrada).
- **r8b** — Helper único de marcas DUPLICADA (`marcarDuplicada`/`marcarDuplicadaCon`,
  deps inyectables): las 6 rutas DUPLICADA/YA-ENVIADA ya no tienen writes hand-rolled.
  **COLA_PERSISTENTE desconectada**: el ciclo de vida del modo pruebas vive en el
  ledger `dedup-indice.ts` (kill switch privado, mismo orden/higiene/catch). Trazas
  byte-idénticas (51/51 caracterización SIN ediciones). Bench N=120×8 sin regresión.
  API Zustand intacta.
- **r9** — Adopciones de la capa shared: `documento-e14.tsx` adopta
  `delegadosAcreditados`/`ciudadDePuesto` de `domain/acta.ts`; `panel-perfil.tsx`
  adopta `fmtDuracion`/tono de shared; tests de paridad convertidos en tests de
  ADOPCIÓN. `initSupervisionDatos()` explícita en datos-provider + banner BLOQUEADA
  accesible (`role="alert"`, motivo verbatim). Fix ref-cleanup `vista-recepcion:245`
  (+2 tests nuevos: 213 en su branch).
- **r7c** — **M8**: el postproceso DB de rapidocr extraído a módulo PURO
  (`db-postprocess.ts`, 367 l) + 28 tests de caracterización RED PRIMERO. **M6-fin**:
  los gemelos restantes de `pipeline()`/`pipelineRecorte()` (~150 l ×2) viven UNA vez
  en `pipeline-comun.ts` (7 helpers puros; diferencias de sitio como campos tipados —
  el compilador garantiza paridad) + 28 tests. Refs `L####` muertas re-apuntadas al
  módulo dueño. Anclas QA, gate R7a (35) y masiva R8 (51) intactos.

## 3. Hallazgos consolidados

### Eliminado EN esta ola
- Veneno cross-file de tests (raíz, no mitigación) — higiene.
- Writes hand-rolled en las 6 rutas DUPLICADA/YA-ENVIADA — r8b.
- `COLA_PERSISTENTE` legacy (desconectada) + import/índice muertos — r8b.
- Copias shared sin adoptar en `documento-e14`/`panel-perfil` — r9.
- Gemelos del bridge ~150 l ×2 → `pipeline-comun.ts` — r7c.
- Postproceso DB enterrado en rapidocr con estado de módulo — r7c.
- Refs `L####` muertas + warning ref-cleanup `vista-recepcion` — r7c/r9.

### Restante documentado (→ decisión del dueño o micro-tareas)
1. **Import dinámico de rescate núcleo→masiva** (hoy `bridge:569` post-r7c,
   e64-qr T-2.1) — micro-tarea del orquestador para una próxima sesión.
2. **`FiltrosPuestos` al repo** (R9 §8.1): `coincide()` es privada y la única vía
   pública añade 400 ms simulados → 3 propuestas esperando elección del dueño.
3. **2 warnings `<img>`** (`acta-viewer-modal:336`, `vista-recepcion:69`) — ligados
   a la decisión de deploy (next/image en deploy estático requiere configuración).
4. **Inline `evaluarGate`** rompería el seam de R7a — NO tocar sin decisión.
5. **Gating pre-warm OCR** (~30 MB) y **split dedup-marcas** (rompería ciclo
   store↔runner benigno) — declarados PENDIENTE por r7c/r8b.
6. **Retirada del shim inerte de R8** en el harness de masiva — micro-tarea del
   orquestador (el veneno ya murió de raíz).

## 4. Cola de decisiones del DUEÑO (tras Ola 3)

1. **ADR idEnlace (2 vs 3 dígitos)** — decisión de producto.
2. **Deploy único**: GH Pages vs Cloudflare Pages (destraba además los 2 `<img>`).
3. **Proteger `main`** en GitHub (PR requerido + 1 approval).
4. **FiltrosPuestos**: elegir una de las 3 propuestas de `R9.md` §8.1.
5. Topes R5 definitivos / guard de conteos en deploy / virtualización bandeja (Profiler).
6. **Rotar el token de GitHub** (expuesto en chat).

## 5. Riesgos residuales

- Equivalencia del pipeline sostenida por caracterización + diff + tsc (no testeable
  headless end-to-end) — r7c.
- Bench R8 mide orquestación headless; el muro con OCR real sigue para el dueño — r8b.
- Los disables de eslint en `actas-mock`/`perfil-provider` tienen razón técnica
  demostrada; quitarlos requiere abordar la causa, no el síntoma — higiene.

## 6. Sistema de documentación

- Contrato de Ola 2 mantenido íntegro: informe de 10 secciones commiteado por los
  4 agentes (`docs/informes/ola-3/`) + este RESUMEN. `pr.md` jamás se commitea.
- Estado final del refactor v1: **olas 0-3 completas**. Base: tsc 0 · lint 0 errores
  · 269 tests · CI 100% bloqueante · main sincronizada con GitHub.
