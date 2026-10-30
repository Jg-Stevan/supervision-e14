# RESUMEN OLA 1 — Auditoría de orquestador (R3 · R4 · R5 · R6)

> Documento consolidado por el orquestador. Fuente primaria: los PR de cada agente
> (`R3-pr.md` … `R6-pr.md`, preservados verbatim en esta carpeta; antes vivían sin
> commitear en `/home/z/work/rN/pr.md`). Verificación independiente: el orquestador
> re-corrió tsc/lint/test y spot-checks sobre `main` — no se confiaron claims.

## 1. Estado de la ola

| Agente | Zona exclusiva | Commits | Merge | Auditoría |
|---|---|---|---|---|
| R3 catálogo/datos | `supervision/domain/**`, `data/**` | 6 (`f2644c7…997bff3`) | `a2b43eb` | ✓ OK |
| R4 UI supervision | `supervision/components/**` | 9 (`a2a01e4…4d08a4c`) | `be4d8ee` | ✓ OK |
| R5 zip-guard | `masiva/archivos.ts` + tests | 2 (`6941999`, `83c9a9f`) | `4ce0b5f` | ✓ OK |
| R6 MasivaView split | `digitalizador/components/e14/**` | 9 (`5e259ed…5d4760a`) | `14ba25f` | ✓ OK |

Extra-orquestador: `4ea9cb4` fix de `panel-perfil.tsx:360` (queda sin dueño tras R4;
mismo patrón microtask que R4 usó en `vista-recepcion.tsx:208`).
Post-ola: `54f8163` integró `origin/main` (LABORATORIO-qr-decodificadores + D45-R1).

**Verificación independiente sobre main (post-merge):**
- `bunx tsc --noEmit` → **0 errores**
- `bun run lint` → **0 errores** / 5 warnings pre-existentes
- `bun test` → **124 pass / 0 fail** (2.390 expect, 18 archivos, ~16 s)
- CI: `continue-on-error` retirado en Lint (R4) y en Test (R3) → **CI 100 % bloqueante**

**Spot-checks de orquestador (claims verificados):**
- `MasivaView.tsx` = 11 líneas (barrel) ✓
- `registrarRecepcion` ×4 en `actas-runtime.ts` ✓ (duplicado real, ver §3)
- Golden D21 en `DECISIONS.md:374` dice `231+44+199+475`; el medido es `233+44+198+474` ✓ (desfasado, ver §4.2)

## 2. Entregas por agente (síntesis)

- **R3** — Red de tests PRIMERO (7 archivos, 66 tests: invariantes catálogo 949/67/3.670,
  validador divipola con fixtures corruptos, re-derivación de los 949 puestos desde semillas,
  D21, 3 anclas, golden KPIs). Fix **C1** (fin del white-screen: API `Result`,
  `initSupervisionDatos()` explícito e idempotente + init perezosa; conteos pasan de abortar a
  advertir). Fix **M3** (filtros `cierreCol/tiempo` en `coincide()`), **M11** (clonado profundo
  en frontera: mesas, delegados, transmisión, fotos), **M13** (validador D25 único
  `validacion-d25.ts`). CI: Test bloqueante.
- **R4** — Fix **C6** (contexto dividido Datos/Acciones/Ticker; filas por props + `memo`;
  abrir visor ya NO re-renderiza ~949 filas), **C8** (transición fuera del updater, ref
  anti-doble-invoke), **C7** (expansión accesible por teclado 44px + Radix DropdownMenu),
  **M7** (deep-linking por hash validado contra catálogo), `content-visibility` en 949
  `<tbody>`, telemetría dev-only `window.__R4_FILAS`, fix `vista-recepcion:208`, CI: Lint
  bloqueante.
- **R5** — Zip/rar en **streaming** (`fflate.Unzip` por trozos de 64 KB, clasificación POR
  CABECERA: lo rechazado jamás se descomprime), 3 topes anti zip-bomba (2 GB acumulado /
  128 MB por entrada / ratio 100 con piso 1 MB) con filas ERROR trazables
  (`TOPE_BYTES_ENTRADA`, `RATIO_SOSPECHOSO`, `TOPE_BYTES_COMPRIMIDO`), eliminado el doble
  buffer (`slice()` duplicaba cada foto), 11 tests de bomba con fixtures runtime. Doctrina
  conservador intacta: jamás tumba la cola.
- **R6** — Split **move-only** del monolito `MasivaView.tsx` (1.644 → 11 líneas barrel) a 8
  módulos en `screens/masiva/` (verificado con `--color-moved`: ~1.100 líneas movidas
  verbatim), fix **O(n²)** (`colaVida.indexOf`/`filas.find(dupOf)` por fila → Maps O(1);
  ~250k comparaciones por señal de vida con zip de 500 → 0), fila `memo` con props
  primitivos, `content-visibility`, adopción `@/shared/format/tiempo`.

## 3. Hallazgos consolidados: DUPLICADOS / CÓDIGO MUERTO / OPTIMIZACIONES

### Duplicados detectados (acción pendiente del dueño salvo nota)
1. `actas-runtime.ts`: 4 usos de `registrarRecepcion` con bloques casi idénticos (quedaron
   2 tras el dedupe M13; los de `(d) página` y PUBLICADA siguen). Quick win. *(R3)*
2. Copias de capa shared SIN adoptar: `delegadosAcreditados`/`ciudadDePuesto` en
   `documento-e14.tsx:31-45` (canónicos ya en `domain/acta.ts`; tests de paridad congelan
   mientras tanto), `fmtDuracion` y tono en `panel-perfil.tsx`, luminancia. *(R3/R6)*
3. Re-filtrado duplicado: `monitor-global.tsx:59-89` re-filtra en cliente lo que
   `coincide()` ya implementa en el repo → pasar `FiltrosPuestos` completo al repo. *(R3)*
4. `modal-revisor.tsx` importa type desde `./orquestador` (intencional, documentado). *(R6)*

### Código muerto / innecesario eliminado EN esta ola
- `CARGAR_CATALOGO()` eliminado (R3).
- Doble buffer `datos.slice()` en `archivos.ts` eliminado (R5) — duplicaba cada foto.
- O(n²) muerto de la bandeja masiva reemplazado por Maps precalculados (R6).
- Copias verbatim de `fmtMs`/`hhmm` en `InformeCorrida` eliminadas por adopción shared (R6).

### Optimizaciones aplicadas (medibles)
- Abrir/cerrar visor o navegar mesa: 0 re-renders de las ~949 filas (R4, telemetría
  `window.__R4_FILAS`; procedimiento de medición en `R4-pr.md`).
- Bandeja masiva: comparaciones por señal de vida ~250.000 → ~0 con zip de 500 (R6).
- Zip hostil: RAM acotada por topes; entradas rechazadas jamás descomprimidas (R5).
- Pintado de matriz y bandeja: `content-visibility:auto` (R4/R6).

### Optimizaciones propuestas NO aplicadas (requieren decisión)
- Virtualización real de bandeja (`@tanstack/react-virtual`) → ADR si React Profiler lo
  justifica (R6). · `actaEnCache` clonado sin Map inverso — cambia aprobar/rescan, riesgo
  medio (R3). · Paridad total RAR en streaming → cambiar librería (R5).

## 4. Cola de decisiones del DUEÑO (priorizada, accionable)

1. **ADR idEnlace (2 vs 3 dígitos)** — decisión de producto; BLOQUEANTE conceptual para R7b/R8.
2. **Golden D21 desfasado** (`DECISIONS.md:374`): actualizar a `233/44/198/474` (post-anclas
   D26/D44) o re-documentar que los literales dependen del estado de anclas. Canónico hoy:
   `mock-determinismo.test.ts`.
3. **`initSupervisionDatos()` explícito en `datos-provider`** + banner de `BLOQUEADA` (R4).
4. **Adoptar exports canónicos** en `documento-e14.tsx` (borrar copias locales).
5. **Pasar `FiltrosPuestos` al repo** y eliminar re-filtrado en `monitor-global`.
6. **Guard de conteos del kit en CI** (¿fallar deploy y no solo test?).
7. **Topes R5**: fijar valores definitivos / cablear a flags; política de ratio para BMP casi
   vacíos; fila explícita para imagen de 0 bytes.
8. **Medición React Profiler** de la bandeja (antes/después, zip 100/250/500) + ADR de
   virtualización si procede.
9. **Limpieza menor**: `img`→`next/image` (`acta-viewer-modal:336`, `vista-recepcion:69`),
   `exhaustive-deps` (`perfil-provider:184`, `vista-recepcion:245`), `_observacion`
   (`actas-mock.ts:412`), renombrar describe desactualizado en `tiempo.test.ts:91`.
10. **Doble deploy** GH Pages / Cloudflare Pages: elegir destino único o documentar ambos.

## 5. Riesgos residuales (documentados por los agentes, aceptados en auditoría)

- `content-visibility` depende de altura estimada (49/88 px): saltos de scrollbar posibles
  con alturas atípicas (R4/R6).
- Hash deep-link ignora enlaces a puestos/mesas inexistentes en silencio (decisión
  conservadora, R4).
- fflate retiene bytes comprimidos de entradas omitidas hasta descartar el `Unzip`
  (peor caso ≈ 2× tamaño comprimido transitorio, nunca descomprimido) (R5).
- RAR: cabecera mentirosa cuesta UNA entrada materializada antes del `DESCARTAR` (límite
  de la API, zip sí corta en vuelo) (R5).
- Memo de `FilaMasivaVista` degrada (no rompe) si se añade un prop de objeto sin recordarlo (R6).

## 6. Sistema de documentación (cambio de contrato desde la Ola 2)

- Esta carpeta (`docs/informes/`) es el **registro auditable persistido**: PRs de agentes
  verbatim + resúmenes consolidados por ola. Antes los PR vivían solo sin commitear en los
  worktrees.
- **Desde la Ola 2**, el contrato de cada agente exige commitear `docs/informes/<Rn>.md`
  con 10 secciones fijas (resumen, cambios, duplicados, código muerto, optimizaciones
  aplicadas/no aplicadas, riesgos, decisiones sin dueño, evidencia real, hallazgos fuera
  de zona). Honestidad radical: lo no hecho se declara PENDIENTE.
