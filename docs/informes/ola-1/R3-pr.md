# PR — Agente R3: catálogo y datos de supervisión

## Agente

R3 (Task ID: R3) — zona: `src/modules/supervision/domain/**`, `src/modules/supervision/data/**` y nuevos `src/modules/supervision/data/__tests__/**`. Branch local `refactor/r3-catalogo` (sin push: entrega por commits locales). Base: `4536ed5` (Ola 0 + merge e75-qr-zoom-zbar). El merge del remoto no tocó domain/ ni data/ de supervision — los archivo:línea del reporte 02a se re-verificaron con Grep antes de editar.

## Qué

6 commits convencionales y revertibles, en el orden pedido (primero la red de tests, después los fixes):

1. `f2644c7` **test(r3)** — red de tests en `data/__tests__/` (7 archivos, 66 tests nuevos): invariantes del catálogo (949/67/3.670/depto 88/idEnlace únicos), validador `domain/divipola.ts` con fixtures corruptos (campos exactos, ancho fijo 2/3/3/2, congruencia idEnlace, unicidad con ambos índices, mensajes), determinismo (re-derivación de estado+horario de los 949 puestos desde `divipola::puesto::<idEnlace>` con el orden de draws D43), invariante D21, 3 anclas forzadas (Roma CRÍTICO/8 mesas/#A92-F, Cairo y Barcelona COMPLETO) y golden de KPIs.
2. `74909d5` **fix(r3) C1** — fin del white-screen: el adaptador ya no lanza (devuelve `Result = ok | BLOQUEADA con motivo` vía `prepararCatalogoDivipola`/`cargarCatalogoDivipola`); `mock-repository` ya NO siembra al importar: nueva `initSupervisionDatos()` explícita e idempotente + inicialización perezosa (`asegurarDatos()`) en las 11 lecturas/mutaciones del repo para no exigir cambios a R4. Los conteos del kit (949/67/3.670 + registros de control + ancla Roma=8) pasan de «abortar» a «advertir en consola y arrancar»: el guard de conteos es TEST desde ahora. Solo lo estructural BLOQUEA (registros malformados, idEnlace duplicado/incongruente, guardrail > 1.500). `CARGAR_CATALOGO()` eliminado; `actas-reales.ts` y `actas-runtime.ts` migrados a la API Result (catálogo no disponible → cuarentena, jamás excepción).
3. `f56e93b` **fix(r3) M3** — `coincide()` implementa los filtros `cierreCol/tiempo` declarados en `FiltrosPuestos` (types.ts:140-145) con la MISMA semántica de la referencia de la vista (`monitor-global.tsx:68-72`); test de paridad + partición de los 4 tramos = 949.
4. `85dd75e` **fix(r3) M11** — clonado profundo mínimo en la frontera: `clonarMesa()` (delegados + transmisión p1/p2/alerta) en `getMesasDePuesto` y también en los resultados de `resolverRescaneo`/`registrarCargaMasiva`; `clonarActa()` clona `fotos` (por FotoActa) y `impresion`. Tests que mutan a fondo lo recibido y re-leyeron.
5. `c241ff2` **fix(r3) M13** — validador D25 único `data/validacion-d25.ts` (`validarJoinDivipola(idEnlace, mesa)` → motivo `(a)`/`(b)` o null), adoptado por `actas-reales.ts` y `actas-runtime.ts` (redacción de motivo congelada por test: es contrato del log de recepción); `delegadosAcreditados` (n/16) y `ciudadDePuesto` quedan canónicas en `domain/acta.ts` (actas-mock re-exporta por compatibilidad; tests de paridad contra las copias verbatim de documento-e14.tsx:31-45).
6. `997bff3` **ci(r3)** — último commit: quita `continue-on-error: true` del paso **Test** de `.github/workflows/ci.yml` (+ su TODO asociado y la nota del header). El paso **Lint NO se tocó** (prohibido; lo arregla R4).

## Cómo

- **Tests primero**: commit 1 solo añade `data/__tests__/` (7 archivos, bun:test, sin dependencias nuevas; imports por alias `@/` como el resto de la suite). Los tests de cada fix viajan en el commit del fix para que CADA commit compile, pase tsc y tenga la suite verde (revertible limpio).
- **Re-derivación como red de determinismo**: `mock-determinismo.test.ts` re-implementa como REFERENCIA los umbrales (estadoPorSeed L99-104, transcurridoPorSeed L116-121, relojDeMinutos L124-131, CIERRES_COL_MIN L106) + el contrato de draws D43 (3 draws de horario quemados + 4.º de estado, anclas sin consumir draws) y verifica los 949 puestos contra el repo. Importa el PRNG REAL (`crearRandomDeterministico`) — no duplica el hash/mulberry.
- **Golden honesto**: los literales del golden (949 = 233+44+198+474) se MIDIERON ejecutando el repo antes de hardcodearlos (verificado también en 2 procesos distintos). Los 231/44/199/475 de DECISIONS D21 corresponden a un seed anterior a las anclas D26/D44 — ver Hallazgos.
- **C1 sin tocar R4**: `datos-provider.tsx` sigue llamando solo `mockSupervisionRepository.*`; la inicialización perezosa lo cubre. `initSupervisionDatos()` queda expuesto con su contrato documentado en el propio código.
- **Determinismo preservado**: la siembra se movió de statements top-level a `initSupervisionDatos()` conservando el ORDEN EXACTO de cómputo (puestoDeRegistro → mesas/pcts → AHORA → semillas); la única diferencia semántica es que `AHORA` se congela en el primer uso del repo en vez de en el import (milisegundos de diferencia; las fechas relativas siguen estables entre renders). Suite verde incluida la re-derivación 949/949 y el golden: sin drift.
- **Trampa respetada**: `divipola-puestos.json` NUNCA importado (Grep post-cambios: única mención es un comentario del test que documenta la regla). `idEnlace` NO se unificó (ADR-idenlace: decisión de producto pendiente).

## Evidencia de verificación

Ejecutado por mí sobre el árbol final (commits `f2644c7…997bff3`):

- `bunx tsc --noEmit` → **0 errores** (exit 0).
- `bun test` → **113 pass, 0 fail** (2.364 expect(), 17 archivos, ~16 s). Baseline antes de mis cambios: 47 pass/9 archivos — mis 7 archivos suman 66 tests. Incluye golden de KPIs, re-derivación de los 949 puestos y tests de mutación profunda.
- `bun run lint` → **7 problemas (2 errors, 5 warnings)** — IDÉNTICO al baseline medido antes de empezar (mismos 5 archivos: panel-perfil.tsx, perfil-provider.tsx, acta-viewer-modal.tsx, vista-recepcion.tsx, actas-mock.ts:412 `_observacion`). Cero problemas nuevos; mis 7 archivos nuevos salen limpios. Los 2 errores siguen hasta que R4/dueño arreglen (paso Lint con continue-on-error intacto).
- Grep `divipola-puestos` en `src/` → solo comentario del test (regla D21/D22), **0 imports**.
- Smoke determinismo multi-proceso: `getResumen()` = `{total:949, completo:233, critico:44, pendiente:198, noIniciado:474}` antes y después del refactor C1.

## Riesgo y rollback

- **Riesgo bajo-moderado en `mock-repository.ts`** (archivo mayor del paquete): el cambio C1 movió la siembra a función; mitigado con la red nueva (re-derivación 949/949 + golden + anclas + D21 exacta). ROLLBACK: cada fix es un commit independiente y revertible; `git revert 74909d5` devuelve el efecto-de-import (y los white-screens) sin tocar tests — si se revierte C1 conviene revertir también `f2644c7` (los tests del adaptador dependen de la API Result).
- **Cambio de política en el adaptador**: si la validación estructural falla hoy, la app ARRANCA con 0 puestos y `BLOQUEADA` en consola en vez de romper el import. Si el dueño prefiere fail-fast en dev, es un `if` en `initSupervisionDatos()` — decisión documentada, no pérdida de información.
- **actas-reales**: con catálogo no disponible la cuarentena es ahora por-entrada (motivo `(a) catálogo no disponible…`) y no del manifest completo — ambos dejan 0 publicadas; solo cambia la granularidad del log.
- **CI**: desde `997bff3` el paso Test bloquea PRs. Si la suite flakeara (no hay nada no determinístico: los tests no dependen de reloj ni red; `Date.now()` solo aparece en semillas de sesión), el rollback es revertir ese commit de 1 línea.

## Decisiones pendientes del dueño

1. **Adopción explícita de `initSupervisionDatos()` en `datos-provider.tsx` (R4)**: hoy las lecturas inicializan perezosamente; llamarla en mount haría explícito el momento de carga y permitiría manejar el motivo `BLOQUEADA` (banner de datos no disponibles en vez de monitor vacío).
2. **Adopción de los exports canónicos en `documento-e14.tsx` (R4)**: `delegadosAcreditados`/`ciudadDePuesto` ya viven en `domain/acta.ts`; borrar las copias locales de documento-e14.tsx:31-45 (los tests congelan la paridad mientras tanto).
3. **Adopción UI de los filtros del repo (R4)**: `coincide()` ya implementa `cierreCol/tiempo`, pero `datos-provider` sigue llamando `getPuestos()` sin filtros y `monitor-global.tsx:59-89` re-filtra en cliente — pasar `FiltrosPuestos` completo al repo y eliminar la duplicación es del lado UI.
4. **¿Los conteos del kit (949/67/3.670) en un guard de CI aparte?** Hoy viven solo en tests (C1). Si el dueño quiere fallar DEPLOY (no solo test) ante desviación del catálogo, es un paso más en el workflow.
5. **Golden vs DECISIONS D21**: actualizar D21 con 233/44/198/474 (seed vigente post-anclas D26/D44) o re-documentar que los literales dependen del estado de las anclas (ver Hallazgos).
6. **ADR idEnlace (M1)**: NO tocado — los anchos contradictorios entre módulos siguen como estaban (decisión de producto, no de este agente).

## Hallazgos fuera de alcance

1. **Golden D21 desfasado en DECISIONS.md:374** (`949 = 231+44+199+475`): el seed vigente mide **949 = 233+44+198+474**. No es un bug del mock: las anclas forzadas D26 (El Cairo→COMPLETO) y D44 (Barcelona→COMPLETO) mueven puestos de NO_INICIADO/PENDIENTE a COMPLETO; los literales de D21 parecen previos a esas decisiones. El golden canónico ahora vive en `mock-determinismo.test.ts`.
2. **`resolverRescaneo`/`registrarCargaMasiva` tenían el mismo bug de aliasado que `getMesasDePuesto`** (M11): devolvían `{...mesa}` con `delegados/transmision` aliasados al singleton. Corregido en el mismo commit por ser la misma clase de fuga en la misma frontera.
3. **`actas-runtime.ts` conserva 3 bloques `registrarRecepcion` casi idénticos** (reporte 02a §5-4, `registrarBloqueada`): quedaron 2 tras el dedupe (a)/(b) de M13; el tercero es el de `(d) página` y el de PUBLICADA. No lo toqué (fuera del alcance M13 declarado; sugerido como quick win).
4. **`actaEnCache` (actas-mock.ts) devuelve la entrada interna de la caché** para mutarla en aprobar/rescan — es la disciplina del «documento histórico» y así está diseñado, pero es el tercer punto de la familia M11 (reporte 🟡-1) que requeriría un Map inverso id→clave para clonar sin romper las acciones del visor. No tocado: tocarlo cambia el comportamiento de aprobar/rescan (riesgo medio; recomendación #5 del reporte).
5. **bun reutiliza la instancia de módulo entre archivos de test** (sin isolate): no se puede demostrar el «no-lanza al importar» re-importando en el mismo proceso. La garantía real es estructural (cero statements top-level que lancen) + los tests de `prepararCatalogoDivipola` con fixtures corruptos. Documentado en el header de `init-datos.test.ts`.
6. **`import … from "*.png"` funciona en bun test** (la cadena actas-reales → 8 PNG se importa sin config extra): útil saberlo para futuras suites de datos, aunque acopla los tests a los assets del loader.
