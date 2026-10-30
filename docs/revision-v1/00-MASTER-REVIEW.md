# 🎯 REVISIÓN MAESTRA — supervision-e14
> Síntesis consolidada de los 6 paquetes de revisión paralela · Cada hallazgo tiene la evidencia completa (archivo:línea) en su reporte de paquete.

| Paquete | Reporte | Alcance | Líneas revisadas | Veredicto |
|---|---|---|---|---|
| 1 · Fundaciones & Infra | [01-fundaciones-infra.md](01-fundaciones-infra.md) | config raíz, src/app, src/components, CI, higiene | ~1.500 | Sólida y excepcionalmente documentada |
| 2-a · supervision · dominio + datos | [02a-supervision-dominio-datos.md](02a-supervision-dominio-datos.md) | domain/, data/, catálogo DIVIPOLA | ~3.400 | Datos sólidos; riesgo en topología (singletons) |
| 2-b · supervision · componentes UI | [02b-supervision-componentes-ui.md](02b-supervision-componentes-ui.md) | components/** del módulo supervision | ~5.500 | Disciplinada; 3 críticos de bajo costo |
| 3-a · digitalizador · núcleo | [03a-digitalizador-nucleo.md](03a-digitalizador-nucleo.md) | lib/e14 raíz + ocr/ + obs/ + store | ~11.800 | Diseño sobresaliente; deuda de forma |
| 3-b · digitalizador · carga masiva | [03b-digitalizador-masiva.md](03b-digitalizador-masiva.md) | masiva/** + screens MasivaView/Informe | ~13.200 | Mejor disciplina del repo; deuda estructural |
| 4 · perfil-dispositivo + transversal | [04-perfil-dispositivo-reutilizacion.md](04-perfil-dispositivo-reutilizacion.md) | perfil-dispositivo/** + duplicados entre módulos | ~2.100 + transversal | Sólido; 12 duplicados detectados |

**Total: ~37.500 líneas TS/TSX en 142 archivos.** Veredicto global: **proyecto maduro y con la mejor trazabilidad de decisiones vista en un demo (DECISIONS.md + comentarios-rastro); la deuda está concentrada en TAMAÑO de archivos, DUPLICACIÓN entre módulos y AUSENCIA TOTAL DE TESTS — no en corrección ni arquitectura.**

---

## 1. Los hallazgos consolidados (priorizados)

### 🔴 Críticos — resolver antes de sumar funcionalidad

| # | Hallazgo | Dónde | Reporte | Esfuerzo |
|---|---|---|---|---|
| C1 | **Cero tests en todo el repo**: el determinismo del mock (invariante D21, draws D43, 3 anclas) y las 8 puertas de dedup de masiva viven sin red; las anclas QA grepean literales de runner.ts | todo el repo | 02-a, 03-b | M (portar harness) |
| C2 | **El swap al backend ya no es solo el repositorio**: estado en 6 singletons de módulo + el digitalizador importa directo `publicarActaMasiva/registrarRecepcion` — la promesa de frontera de `supervision-repository.ts` ya no es cierta | `actas-mock.ts:277`, `actas-runtime.ts:77`, `store-e14.ts:41,44` | 02-a | M |
| C3 | **scanner-core-bridge.ts clona su pipeline**: `pipeline()` (L1134-1985) y `pipelineRecorte()` (L2119-2612) duplican ~600-700 líneas; ya causó bug de polaridad (L1008). Extraer `resolverDesenlace()` pura | `scanner-core-bridge.ts` | 03-a | M |
| C4 | **`procesarUno` super-función (~1.390 líneas, ~16 responsabilidades)** con trazas post-mortem en 3 sitios; partible en 5 stages | `masiva/runner.ts:414-1800` | 03-b | M |
| C5 | **Espera de original con techo 10 min bloquea el slot del pool**: si la original no va delante en FIFO, la cola entera se congela hasta 10 min | `runner-dedup.ts:34`, `runner.ts:463` | 03-b | S |
| C6 | **Filas memoizadas suscritas al contexto grande anulan la optimización D42**: abrir el visor o aprobar un acta re-renderiza las ~949 filas (~14k componentes) | `puestos-table.tsx:398`, `mesas-subtable.tsx:93` | 02-b | S |
| C7 | **Matriz inoperable con teclado**: `CollapsibleTrigger asChild` sobre `<tr>` sin foco ni teclas — toda la sub-tabla inalcanzable (WCAG 2.1.1) | `puestos-table.tsx:411-415` | 02-b | S |
| C8 | **Side-effect dentro de updater de estado**: `setSegundosTicker()` invoca la transición de 45 s — en StrictMode se aplica DOS veces y corrompe KPIs en dev | `datos-provider.tsx:223-229` | 02-b | S |
| C9 | **Pre-warm de OCR al importar**: abrir MASIVA descarga ~30 MB (ORT wasm + modelos) antes de cualquier escaneo | `ocr/rapidocr.ts:1433` | 03-a | S |
| C10 | **Zip/rar sin tope de bytes (zip-bomb)**: `unzipSync` descomprime todo en RAM; el tope de 500 solo cuenta entradas | `masiva/archivos.ts:381-416` | 03-b | S-M |
| C11 | **6 rutas que marcan DUPLICADA re-implementan el mismo patrón** + store.ts (1.589 l) mezcla 6 roles y ancla el ciclo store↔runner↔precalor | `store.ts:496/894`, `runner.ts:737/1183/1286` | 03-b | L |

### 🟡 Medios — planificarlos

| # | Hallazgo | Dónde | Reporte |
|---|---|---|---|
| M1 | **idEnlace con ancho de zona contradictorio** (2 dígitos en clasificador/divipol.ts vs 3 en supervision/store-e14) + 2 constructores de nombre E14 → riesgo de join roto entre módulos; requiere decisión de producto | `divipol.ts:161` vs `supervision/domain/divipola.ts:59` | 04 |
| M2 | Catálogo DIVIPOLA byte-idéntico ×2 (635 KB, md5 igual): `public/e14/divipol.json` ≡ `supervision/data/divipola-puestos.json` | ambos | 04 |
| M3 | Contrato de filtros desconectado: `cierreCol/tiempo` declarados y no implementados; el filtrado vive duplicado en 2 capas | `types.ts:140-145` vs `mock-repository.ts:683-705` | 02-a |
| M4 | Workers precompilados con drift: build manual sin `prebuild` ni CI → producción puede servir worker viejo | `scripts/build-capa0-worker.mjs`, `package.json:5-10` | 01 |
| M5 | ESLint aflojado globalmente y fuera del CI: reglas para el motor trasplantado aplican a TODO el repo | `eslint.config.mjs:11-49` | 01 |
| M6 | shadcn desalineado: `cn@0.5.0` sin tailwind-merge y `components.json` apunta a `@/lib/utils` inexistente → primer `shadcn add` romperá el build | `select.tsx:4`, `components.json:16` | 01 |
| M7 | Sin deep-linking ni virtualización: refresh pierde vista/filtros/visor; "todos los días" monta ~14k componentes (hoy lo salva el default LUNES) | `supervision-shell.tsx:355`, `puestos-table.tsx:361` | 02-b |
| M8 | rapidocr.ts mezcla 3 capas (postprocess DB puro / runtime ORT / política del router) con ~5 mutables de módulo | `rapidocr.ts` | 03-a |
| M9 | Doble whitelist de flags (16 claves × 2 archivos): un olvido descarta el override del dueño en silencio | `flags.ts:113-156` ↔ `obs/politica.ts:109-173` | 03-a |
| M10 | Dependencia invertida núcleo→masiva: `orientacion-qr.ts` importa `moduloZxingDe`/jsQR vendido desde masiva/ — la zona protegida ya está cruzada | `orientacion-qr.ts:69-71` | 03-b |
| M11 | Copias superficiales exponen estado singleton: `{...m}` con arrays aliasados; `clonarActa` no clona `fotos` | `mock-repository.ts:730`, `actas-mock.ts:279-288` | 02-a |
| M12 | Reglas de tier §4.4 duplicadas y ya desincronizadas (`nucleos=null` condena distinto) + colectores de dispositivo ×3 | `obs/dispositivo.ts:136-161` ↔ `perfil/lib/clasificador.ts:194-212` | 04 |
| M13 | Duplicación de validación D25 y helpers de dominio en UI (`delegadosAcreditados/ciudadDePuesto` en data y en documento-e14) | `actas-reales.ts:249-267` ≈ `actas-runtime.ts:126-178` | 02-a |
| M14 | Higiene: `tool-results/read_*.txt` commiteado pese a D39 y .gitignore; doble deploy GH Pages+Cloudflare con paridad desigual (GH no sirve `_headers` → OCR 1-hilo) | `.gitignore:47`, `pages.yml` | 01 |

### 🟢 Leves notables
- Hex `#003912/#410004` sin tokenizar fuera del papel D18 — 02-b
- `CLASE_CHIP` ×3, skeletons inline ×5 pese a existir `esqueleto.tsx` — 02-b
- Luma ×6 con 2 espacios de color mezclados (BT.601 vs BT.709) — 03-a/04
- `pixelesDeBlob` verbatim ×2 entre workers — 04
- `PUBLIC_BASE` ×8 — 04
- Sintaxis Tailwind v3 suelta en vista-informes — 02-b

---

## 2. Duplicación transversal (el mapa de reutilización)

Top duplicados con copias verificadas (md5 incluido): ver reporte 04 §B2 (matriz completa de 12 grupos).

### Propuesta de capa compartida: `src/shared/`
```
src/shared/
├── env.ts                    # PUBLIC_BASE único (×8 copias hoy)
├── format/tiempo.ts          # fecha/hora/porcentaje
├── dispositivo/{tier,senales}.ts   # reglas §4.4 ÚNICAS + colectores
├── e14/{identidad,divipol-client,presupuestos,qr-const,flags-schema}.ts
├── img/luminancia.ts         # luma() único (BT.601 vs 709 a decidir)
└── ui/{tono,kpi-card}.ts     # mapa tono→token + KpiCard
```
**Regla de oro: `shared/` jamás importa de `modules/`.** Migrar sin cambiar comportamiento (doctrina qr-pixeles/DICTAMEN-e73), re-exportar 1 release y borrar. El único bloqueo de alto riesgo es la decisión de producto sobre el ancho de zona del idEnlace (M1) — resolverla ANTES de consolidar `e14/identidad`.

---

## 3. Roadmap recomendado (orden de ejecución)

### Ola 0 — barrear el suelo (todo S, riesgo bajo)
1. **M5/M4** Descastrar ESLint con `files:` + job CI (lint + tsc) + `prebuild` para workers
2. **M14** Higiene git (`git rm --cached tool-results/`) y decidir deploy único
3. **M6** Alinear shadcn/cn ANTES del primer `shadcn add`
4. **C5** Techo de espera del dedup (copiar el guard `agregadaEn` que ya existe)
5. **C8** Side-effect fuera del updater de estado

### Ola 1 — bombas de tiempo
6. **C1** Portar el harness QA (prerrequisito de todo lo demás) + test CI de invariantes
7. **C6/C7** React perf + teclado en la matriz de puestos
8. **C10** Endurecer zip/rar con techo de bytes
9. **C9** Precalentamiento OCR explícito en mount/idle+wifi
10. **M3** Cumplir o recortar el contrato de `FiltrosPuestos`

### Ola 2 — cirugía mayor (con guard de benchmark y QA portado)
11. **C3** Extraer `resolverDesenlace()` + partir bridge (plan §7 de 03-a)
12. **C4/C11** Stages de `procesarUno` + separar store.ts + unificar DUPLICADA en 1 helper
13. **M1** Decisión de producto zona-2/3-dígitos → consolidar `e14/identidad`
14. **Capa shared** según roadmap de 04 (quick wins primero: env → tiempo → tono/KPI → tier → pixelesDeBlob)
15. **M10** Resolver la dependencia invertida núcleo→masiva (mover `moduloZxingDe` al núcleo o al shared)

---

## 4. Guía para el programador nuevo (consenso de los 6 reportes)

**Por dónde leer, en orden:**
1. `README.md` → `docs/DECISIONS.md` (memoria viva — trazabilidad excepcional, aprovéchala)
2. `supervision/domain/types.ts` — contrato del dominio
3. `supervision/data/supervision-repository.ts` + `mock-repository.ts` — flujo de datos y mock determinístico por `idEnlace`
4. `supervision/components/supervision-shell.tsx` → `monitor-global.tsx` — navegación por estado interno (sin rutas, D11)
5. Pipeline digitalizador: `scanner-core-bridge.ts` (solo API pública) → `clasificador.ts` → `orientacion.ts` → `ocr/rapidocr.ts`
6. Corrida masiva: `masiva/runner.ts` (fases) → `masiva/store.ts` → `MasivaView.tsx`

**Trampas conocidas:** los IDs de motores OCR mienten por alias; `idEnlace` tiene anchos contradictorios según el módulo (M1); no importar jamás `divipola-puestos.json`; las anclas QA grepean literales de runner.ts (cambiarlos rompe el post-mortem); el núcleo ya importa desde masiva (M10) — no asumir que la flecha va en una sola dirección.

**Lo que NO se toca sin guard de benchmark + QA portado:** todo `masiva/` (zona protegida, doctrina del conservador, 8 puertas de dedup, 123 catch que jamás tumban la cola) — ver 03-b §7.

---

## 5. Métricas globales

- **~37.500 líneas** TS/TSX · 142 archivos · **0 `any`** en el núcleo digitalizador · 0 TODO/FIXME en masiva
- Archivos más complejos: `scanner-core-bridge.ts` (2.868), `runner.ts` (1.903), `MasivaView.tsx` (1.644), `masiva/store.ts` (1.589), `rapidocr.ts` (1.433)
- **4 archivos concentran ~8.000 líneas** — el grueso de la deuda de tamaño
- Tests: **0 en todo el repo** (hallazgo habilitador: sin C1 no hay refactor seguro)
- Lo mejor del repo: trazabilidad de decisiones, honestidad de datos (null jamás inventado), observabilidad del desenlace, doctrina del conservador
