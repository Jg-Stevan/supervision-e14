# Revisión Profunda — Paquete 4: perfil-dispositivo + reutilización transversal
> Task ID: 4 · Alcance: `src/modules/perfil-dispositivo/**` (7 archivos, 2.117 líneas) + misión de caza de duplicados transversales entre `supervision` (8.477 líneas), `digitalizador` (25.333 líneas) y `perfil-dispositivo` (2.117 líneas).
> Método: solo lectura. Evidencia con `archivo:línea` reales verificadas en el repo.

---

## PARTE A: perfil-dispositivo

## A1. Mapa del paquete

| Archivo | Líneas | Rol | Observación |
|---|---|---|---|
| `components/panel-perfil.tsx` | 861 | Vista completa: KPIs, 9 tarjetas de recursos, bloque AUTONOMÍA (plan gama aplicado), selector de motor OCR (D6), tabla de recomendaciones y evidencia del tier | El más grande y el más acoplado: importa 5 módulos de `digitalizador` (gama, flags, politica, router-ocr, rapidocr) |
| `lib/senales.ts` | 355 | Recolectores de señales: sync (navigator/heap/red/UA), GPU (WebGL), runtime (WASM SIMD/hilos), async (batería/storage), factor de forma | Patrones sólidos; duplica colectores que ya existen en `obs/dispositivo.ts` (ver B2 #2) |
| `lib/clasificador.ts` | 244 | `clasificar()` §4.4 → tier + evidencia auditable + confianza %; `tonoTier()` | Duplica la lógica de `obs/dispositivo.ts:calcularTier` solo "por paridad de comentario" (ver B2 #1) |
| `perfil-provider.tsx` | 213 | Contexto React + ciclo de detección hydration-safe: pase sync → pase async → benchmark en idle | Correcto (setState post-montaje, guard StrictMode); duplica la forma vacía async con `senales.ts` |
| `domain/tipos.ts` | 157 | Contratos: `Tier` (+`PENDIENTE`), `PerfilRecursos`, `PlanRecursos`, señales, GPU, runtime, benchmark | Limpio y bien documentado; `Tier` es 2ª definición paralela a `obs/tipos.ts:6` |
| `lib/recomendaciones.ts` | 139 | `planRecomendado(tier, señales)` → catálogo D6-safe (pool, hilos, master, precalor, QR, caché, precarga, animaciones, sync) | Repite a mano los números de `gama.ts`/`flags.ts` (2ª fuente de verdad, ver B2 #6) |
| `lib/benchmark.ts` | 148 | Micro-benchmark <200 ms en 3 fases (CPU ops/ms, memoria MB/s, raster 2D ms) → score 0..1000 | Buen diseño (cesión de hilo, pesos, clamp); evidencia, nunca decide (D6) |

Dependencia externa del paquete (todas hacia digitalizador): `@/modules/digitalizador/lib/e14/{gama,flags}` y `{obs/politica, ocr/router-ocr, ocr/rapidocr}` (`panel-perfil.tsx:47-70`).

## A2. Lógica explicada al programador nuevo

1. **Ciclo de vida del perfil** (`perfil-provider.tsx:112-184`):
   - SSR/primer render: `PERFIL_PENDIENTE` (listo=false, tier="PENDIENTE") → determinista, cero mismatch de hidratación.
   - Al montar (`useEffect` con guard por `montadoRef` para StrictMode): **pase SYNC** (`recolectarSync` + `sondearGpu` + `sondearRuntime` + `detectarForma`) → `clasificar()` → setState. Después **pase ASYNC** (batería + storage) → re-clasifica (puede bajar a BAJO).
   - **Benchmark en idle** (`enIdle` = `requestIdleCallback` con fallback `setTimeout(1200)`, `perfil-provider.tsx:82-103`): actualiza solo la evidencia; el score **no** decide el tier v1.
   - `refrescar()` re-corre todo (botón RE-DETECTAR). Todo el ciclo está en try/catch: "la detección jamás tumba la app".
2. **Clasificación §4.4** (`lib/clasificador.ts:42-224`): cortocircuito en orden fijo — BAJO si RAM<2 · núcleos≤2 · saveData · batería<20% sin cargar · storage<500 MB (siempre con dato presente; `null` no condena). ALTO exige deviceMemory real ≥4 ∧ núcleos≥6 ∧ red 4g/wifi. Sin deviceMemory (iOS) → INFERIDO por núcleos≥6 + heap≥2048 MB con `tierInferido=true`. Cada regla deja una fila `SenalEvidencia` (el PORQUÉ visible en pantalla). La confianza = % de señales decisivas presentes (6 claves, `CLAVES_DECISIVAS`, línea 25).
3. **Plan recomendado** (`lib/recomendaciones.ts:17-139`): tablas por tier BAJO/MEDIO/ALTO + ajustes por factor de forma y red débil. Es un **catálogo** (D6): el panel lo muestra y los consumidores lo adoptan de forma acotada y revocable.
4. **Puente hacia la app viva** (`panel-perfil.tsx:211-263,342-361`): `perfilMinimoDe()` adapta el perfil al `PerfilMinimo` del router OCR; `resolverMotorDelDispositivo()` resuelve con la cadena completa (flag ← override ← gobernador ← sondas ← tier) y `resolverRecomendacionRouter()` resuelve con `overrideManual: null` para la "advertencia honesta". El estado `auto` se resuelve **en montaje, no en render** (hydration-safe) y se re-resuelve cuando cambia el perfil o el dueño toca el override.
5. **Escritura de overrides del dueño** (`panel-perfil.tsx:385-397`): va por la puerta oficial `guardarOverridesFlags({ ocrMotor })` (doble whitelist de `obs/politica.ts`) — `null` = retirar y el router recupera la decisión. El "APLICAR AHORA" hace import dinámico de `rapidocr` y `reiniciarMotorOcrSiInactivo()` (rechaza si hay OCR en vuelo — la corrida manda).

## A3. Lo que está BIEN

- **Null honesto + try/catch total en los 7 archivos**: ningún colector inventa datos donde el navegador no informa (iOS sin deviceMemory/batería/performance.memory), y ningún path lanza (`senales.ts:87-133,268-303`; `clasificador.ts:221-223`; `benchmark.ts:145-147`). Es la doctrina del repo, aplicada con disciplina.
- **Hydration-safe de manual**: estado PENDIENTE determinista en SSR, resolución en `useEffect`/montaje, nunca en render (`perfil-provider.tsx:59-68,174-184`; `panel-perfil.tsx:317-361`).
- **Paridad documentada**: los comentarios citan la fuente de verdad (§4.4, D6, D38) y las reglas están copiadas 1:1 en espíritu; la evidencia (`SenalEvidencia[]`) hace el tier auditable en pantalla — excelente para soporte en jornada.
- **Benchmark bien diseñado**: cesión de hilo entre fases (16 ms), pesos 0.5/0.3/0.2 con clamp ×2, score acotado 1..1000, lectura forzada del canvas para evitar raster diferido (`benchmark.ts:26-114`).
- **GPU sondeada y devuelta**: `WEBGL_lose_context` se invoca para no dejar contexto vivo (`senales.ts:180-185`) — detalle poco común y correcto.
- **D6 respetado**: el panel muestra y escribe SOLO lo que el dueño pide; override manual manda y kill-switch `masivaAdaptativoGama=false` apaga la autonomía (panel-perfil 778-784).
- **Ejemplo bueno de reutilización interna**: `orientacion-qr.ts` reutiliza `moduloZxingDe()` de `identidad-qr.ts` (misma instancia wasm en caché) — así debería ser el resto del repo.

## A4. Deudas y problemas

| Sev | Qué | Dónde | Por qué importa | Arreglo |
|---|---|---|---|---|
| 🔴 | **clasificador.ts duplica las reglas §4.4 de `obs/dispositivo.ts:calcularTier`** y ya hay divergencia de borde: aquí `nucleos===null` no condena (`clasificador.ts:198`) mientras `dispositivo.ts:139` recibe `nucleos=1` por defecto (`dispositivo.ts:29-33`) y condena a BAJO. La "paridad" se sostiene solo por comentario (`clasificador.ts:4-11`) | `lib/clasificador.ts:194-212` vs `obs/dispositivo.ts:136-161` | Un iPhone sin `hardwareConcurrency` fiable se clasifica distinto según qué módulo pregunte: el chip de MASIVA y el panel pueden discrepar justo en el caso que la paridad quería evitar | Extraer `calcularTier()` a `src/shared/dispositivo/tier.ts` (ver B2 #1) y consumirlo desde ambos |
| 🔴 | **Colectores de dispositivo duplicados en 3 copias**: batería, storage, heap, connection, osDeUA | `lib/senales.ts:45-53,270-299` vs `obs/dispositivo.ts:29-105,164-181` vs `gama.ts:312-338` | `osDeUA` YA divergió: `senales.ts:50` detecta CrOS → "ChromeOS"; `dispositivo.ts:109-116` devuelve "Linux" para el mismo UA. Tres lecturas del mismo hardware = tres verdades | Módulo compartido `src/shared/dispositivo/senales.ts` (ver B2 #2) |
| 🟡 | **`panel-perfil.tsx` de 861 líneas mezcla 6 preocupaciones**: 4 mini-componentes UI, 5 formatos, 3 adaptadores del router OCR, el bloque Autonomía, el selector de motor (radio-group con textos legales largos) y 2 tablas | `panel-perfil.tsx:74-227` (UI+formatos), `229-307` (router+JSON), `311-861` (vista) | El archivo más grande del paquete (41% de las líneas); cualquier cambio en el selector de motor obliga a releer el panel entero; el texto de riesgos de v5 (723-743) es contenido de dominio embebido en JSX | Dividir: `componentes/` (kpi, tarjeta, fila), `lib/informe.ts` (diagnosticoJson + adaptadores router), `components/motor-ocr.tsx`, `components/autonomia.tsx` |
| 🟡 | **`recomendaciones.ts` repite a mano los números de `gama.ts`/`flags.ts`** (2ª fuente de verdad): pool 1/2, hilos 2/4, master 3072/4032, precalor 1/2/3, QR 1600/2048 | `recomendaciones.ts:27-35` vs `gama.ts:218-246` y `flags.ts:36-44` | Si la capa adaptativa recalibra (p. ej. master BAJO a 2816), la tabla "Recomendado" del panel seguirá diciendo 3072 y el diagnóstico JSON mentirá | Única tabla canónica `src/shared/e14/presupuestos.ts` consumida por gama, flags y recomendaciones (ver B2 #6) |
| 🟡 | **Rama muerta / posible bug de veredicto del heap**: `heapOk ? "favorable" : heapLimiteMB===null ? "inconcluso" : "inconcluso"` — la rama `<2048 MB con dato` también es "inconcluso" | `lib/clasificador.ts:136` | El detalle dice "heap modesto" pero el veredicto no distingue; parece que se quiso `"debil"` (coherente con el umbral de inferencia iOS) | Decidir semántica y colapsar la rama duplicada (o cambiar a "debil") |
| 🟡 | **fmtMB/fmtN duplicados dentro del propio módulo** con contratos distintos (string "no informado" vs null) | `panel-perfil.tsx:170-176` vs `lib/clasificador.ts:27-39` | Dos copias pequeñas que ya difieren en firma; todo cambio de formato (p. ej. GB con coma decimal es-CO) hay que hacerlo 2 veces | `lib/formato.ts` interno del paquete (o compartido, B2 #10) |
| 🟡 | **Forma vacía async duplicada**: `PERFIL_VACIO_ASYNC` | `perfil-provider.tsx:51-57` vs `senales.ts:261-267` | Si se agrega un campo a `SenalesAsync`, hay 2 lugares que pueden quedarse sin el null | Exportar un único `SENAL_ASYNC_VACIA` desde `lib/senales.ts` |
| 🟢 | **Dos definiciones de `Tier`**: `domain/tipos.ts:22` (con "PENDIENTE") vs `obs/tipos.ts:6` (sin PENDIENTE) | — | Compatibles estructuralmente hoy; cualquier renombrado futuro (p. ej. "SIN_DATOS") debe tocarse en 2+ lugares | La capa compartida del #1 lleva un único `Tier` + helper `esPendiente()` |
| 🟢 | **Acoplamiento alto perfil→digitalizador**: 5 imports directos + import dinámico | `panel-perfil.tsx:47-70,415-417`; también `supervision-shell.tsx:49-52` importa el perfil | El módulo "independiente" no compila sin digitalizador; el proveedor se monta desde supervision | Aceptable hoy (D6 lo justifica); al extraer la capa compartida, que el panel dependa de `shared/*` y de un contrato `PerfilMinimo` propio |

## A5. Guía de lectura

Para entender el paquete en ~30 minutos, en este orden:

1. `domain/tipos.ts` — el contrato completo (qué es un perfil, un plan, una evidencia).
2. `lib/senales.ts` — qué se puede saber del dispositivo y cómo se colecta (sync/GPU/runtime/async/forma).
3. `lib/clasificador.ts:42-224` — cómo esas señales se vuelven un tier con evidencia (§4.4).
4. `perfil-provider.tsx` — el ciclo de 4 pasos y por qué es hydration-safe.
5. `lib/benchmark.ts` — la evidencia medida (score 0..1000) y su calibración.
6. `lib/recomendaciones.ts` — el catálogo D6-safe que la UI muestra.
7. `panel-perfil.tsx` — la vista; leer primero `74-227` (piezas), `229-307` (puente al router OCR), y al final el JSX.
8. Cierre de círculo: `digitalizador/lib/e14/obs/dispositivo.ts` (la otra mitad de §4.4) y `gama.ts` (quien APLICA los presupuestos que el panel solo recomienda).

---

## PARTE B: reutilización transversal

## B1. Inventario de helpers existentes por módulo

**supervision** (no tiene carpeta `lib/` propia; helpers viven en components/data):
- `tiempoRelativo()` — `components/tiempo.ts:6-14` (única función del archivo).
- `fechaLarga()` / `fechaISO()` — `components/vista-informes.tsx:27-38` (`toLocaleDateString("es-CO")`, `toISOString().slice(0,10)`); `toLocaleTimeString("es-CO")` en `vista-recepcion.tsx:53`; `hh:mm` con `padStart` en `data/mock-repository.ts:610` y `data/actas-mock.ts:362-364`.
- Mapa estado→color: `components/status-badge.tsx:19-35` (`ESTILOS` + `colorDeEstado`); tono→token en `kpi-card.tsx:17-22`, `resumen-chips.tsx:24-36`, `actas/acta-historial.tsx:16-18`, `puestos-table.tsx:165-167`, ternarios en `supervision-shell.tsx:318-323`.
- `descargar()` (Blob + `<a download>`) — `vista-informes.tsx:40-50`.
- `padStart` de códigos DIVIPOLA en mocks (`mock-repository.ts:127,287`).

**digitalizador** (ricos helpers ya compartidos internamente — `image-utils.ts`, `qr-pixeles.ts`, `logger.ts` — pero con fugas):
- Duración/tiempo: `fmtMs` + `fmtFechaRelativa` — `components/e14/screens/InformeCorrida.tsx:71-85`.
- Luminancia BT.601/709: 6 implementaciones (ver B2 #7).
- `padStart` DIVIPOLA: `lib/e14/divipol.ts:159-162`, `clasificador.ts:502-509,1078-1082`, `store/store-e14.ts:98-103` (¡ancho de zona distinto!), `masiva/tipos.ts:381`.
- QR: `moduloZxingDe()` en `identidad-qr.ts:236-256` (reutilizado por `orientacion-qr.ts:332` — bien); intentos jsQR/zxing repetidos en `orientacion-qr.ts:322-379`, `identidad-qr.ts:287-304`, `qr-pixeles.ts:104,250`, `prescan-qr.ts:226-252`; `pixelesDeBlob()` duplicado verbatim en los 2 workers (B2 #5).
- `PUBLIC_BASE`: `process.env.NEXT_PUBLIC_BASE_PATH ?? ""` repetido en **7 archivos** (`divipol.ts:57`, `flags.ts:18`, `ocr/tesseract-ocr.ts:23`, `ocr/rapidocr.ts:48`, `masiva/sondeo-qr.client.ts:54`, `masiva/prescan-qr.client.ts:47`, `masiva/capa0-qr.client.ts:49`, inline en `identidad-qr.ts:242`).
- Clamps de saneo duplicados: `flags.ts:147-149` vs `obs/politica.ts:151` (misma whitelist de `prescanWarpLado` 256..4032 en dos módulos).
- osDeUA: `obs/dispositivo.ts:109-116`.

**perfil-dispositivo**: `fmtMB/fmtN/fmtPct/fmtGB` (`clasificador.ts:27-39`), `fmtMB/fmtN/fmtDuracion` (`panel-perfil.tsx:170-209`), `tonoTier()` (`clasificador.ts:233-244`), `hayEntornoNavegador()` (`senales.ts:30-36`), `enIdle()` (`perfil-provider.tsx:82-103`), `etiquetaForma()` (`senales.ts:344-355`).

**Transversal**: `toast` de `sonner` usado directo en los 3 módulos; `cn` del paquete npm `cn` en todos; tokens CSS `var(--success/warning/danger/neutral-state)` definidos una vez en `globals.css:34-75` pero mapeados a mano por cada componente.

## B2. Matriz de duplicados detectados

| # | Código duplicado | Copias (archivo:línea) | Severidad | Propuesta de extracción | Esfuerzo |
|---|---|---|---|---|---|
| 1 | **Reglas de tier §4.4** (BAJO/ALTO/INFERIDO) | `digitalizador/lib/e14/obs/dispositivo.ts:136-161` · `perfil-dispositivo/lib/clasificador.ts:194-212` · consumidor tercero `gama.ts:345-360` | 🔴 ya divergió en el borde `nucleos=null` (dispositivo: BAJO por defecto 1 · perfil: no condena) | `src/shared/dispositivo/tier.ts` → `export function calcularTier(e: EntradaTier): { tier: Tier; tierInferido: boolean }` + `type Tier` único | Bajo (función pura ya aislada; solo mover + adaptar entradas) |
| 2 | **Colectores de señales del navegador** (deviceMemory, heap, connection, getBattery, storage.estimate, osDeUA) | `obs/dispositivo.ts:29-105` · `perfil-dispositivo/lib/senales.ts:45-303` · `gama.ts:312-338` (`señalesSync`) | 🔴 `osDeUA` ya difiere (CrOS: "ChromeOS" en senales.ts:50 vs "Linux" en dispositivo.ts:113) | `src/shared/dispositivo/senales.ts` → `recolectarSync()/recolectarAsync()/osDeUA()/navegadorDeUA()/hayEntornoNavegador()`; `dispositivo.ts` y `senales.ts` se vuelven wrappers finos | Medio (3 llamadores, mismos tipos con nombres distintos — mapear) |
| 3 | **Catálogo DIVIPOLA byte-idéntico ×2** (635.093 B, md5 `8d4b0963…`) | `public/e14/divipol.json` ≡ `src/modules/supervision/data/divipola-puestos.json` | 🔴 ~620 KB servidos/bundleados dos veces; riesgo de actualizar uno y no el otro | Un solo asset en `public/e14/divipol.json` + un cliente compartido `src/shared/e14/divipol-client.ts` (el fetch de `divipol.ts:69-94` ya es reutilizable); supervision importa el TIPO, no el JSON | Bajo (borrar la copia + re-exportar; NUNCA se importa en código según `divipola-adapter.ts:12-14`) |
| 4 | **Ancho de ZONA contradictorio en la identidad E-14** (idEnlace/clave) | Con 2 dígitos: `divipol.ts:161`, `clasificador.ts:508,1080`, y el JSON real (`zonas: '00','99'`). Con 3 dígitos: `store/store-e14.ts:100` (`joinDeActa`), `supervision/domain/divipola.ts:28,59,110` + `divipola-exterior.json` ("010") | 🔴 dos convenciones conviven; el puente está manualizado en `joinDeActa` (comentario store-e14.ts:79-82) y `nombreExportacion` (zona 2) vs `nombreArchivo` de la masiva (zona 3, `store-e14.ts:163`) construyen el mismo nombre E14 con anchos distintos | `src/shared/e14/identidad.ts` → `const ANCHOS = { dep: 2, mun: 3, zon: { nacional: 2, exterior: 3 }, puesto: 2, mesa: 3 }` + `construirIdEnlace(c, destino: "nacional"\|"monitor")`, `claveDeMesa()`, `nombreArchivoE14()` | Medio (requiere decidir el canon con el dueño; el código es pequeño) |
| 5 | **`pixelesDeBlob()` duplicado verbatim** (~34 líneas, el propio comentario lo admite: "MISMA receta del sondeo worker") | `masiva/sondeo-qr.worker.ts:155-188` · `masiva/capa0-qr.worker.ts:87-120` | 🟠 fix de bug (EXIF/memoria) debe aplicarse 2 veces; ya existe módulo puro worker-safe `qr-pixeles.ts` | Mover a `masiva/qr-pixeles.ts` → `export async function pixelesDeBlob(blob, ladoLargo)` (jsQR-only, cero DOM: cumple la red line del worker) | Bajo |
| 6 | **Tablas de presupuestos por tier repetidas** (pool 1/2 · hilos 2/4 · precalor 1/2/3 · master 3072/4032 · QR 1600/2048 · watchdog 75/90/105 s) | `gama.ts:157-180,214-267` (aplicada) · `perfil-dispositivo/lib/recomendaciones.ts:27-35` (recomendada) · `flags.ts:36-44` (defaults) · constantes de geometría replicadas en `masiva/archivos.ts:58` (`MAESTRO_LADO_MAYOR=4032`), `flags.ts:78,148` y `obs/politica.ts:151` (clamp 256..4032 ×2) | 🟠 el panel puede recomendar números que la app ya no usa (2ª fuente de verdad sin test de paridad) | `src/shared/e14/presupuestos.ts` → `PRESET_POR_TIER: Record<Tier, Presupuestos>` única; gama compone su plan desde ahí, recomendaciones lo MUESTRA desde ahí, flags deriva defaults/clamps | Medio |
| 7 | **Luminancia implementada 6 veces con 2 espacios de color distintos** | BT.601 entero: `scanner-core-bridge.ts:533` (`/1000`), `orientacion-qr.ts:160,186` (`>>8`), `completitud.ts:194` y `image-utils.ts:254` (float). BT.709: `integridad.ts:82` y `masiva/qr-pixeles.ts:355` (0.2126/0.7152/0.0722) | 🟠 umbrales de tinta/papel calibrados en un espacio se comparan con píxeles en otro (sutil deriva de detecciones) | `src/shared/img/luminancia.ts` → `lumaBT601(data,i): number` y `lumaBT709(data,i): number` (o unificar en 601 tras medir) | Bajo (funciones de 1 línea; tocar 6 archivos) |
| 8 | **Mapa tono→token + componentes KPI/badge duplicados** | `kpi-card.tsx:15-22` (`VAR_TONO`) ≡ ternarios `panel-perfil.tsx:85-92` ≡ ternarios `supervision-shell.tsx:318-323` (sin "neutral"); `KpiCard` (kpi-card.tsx:24-78) ≡ `KpiPerfil` (panel-perfil.tsx:74-108) — mismo markup (border-t-2 + borderTopColor + stats-number); variantes del mapa en `status-badge.tsx:19-30`, `resumen-chips.tsx:24-36`, `acta-historial.tsx:16-18`, `puestos-table.tsx:165-167`, `InformeCorrida.tsx:93-100` (colores hex ≠ tokens) | 🟡 un cambio de lenguaje visual (kit SUP-1) obliga a tocar ≥6 archivos de 2 módulos | `src/shared/ui/tono.ts` → `type Tono` + `VAR_TONO: Record<Tono,string>` + `colorDeTono()`; `src/shared/ui/kpi-card.tsx` con `sub` opcional (supervision y perfil lo consumen) | Bajo |
| 9 | **Formateadores de duración/tiempo relativos** (3 semanticas parecidas, 0 compartidos) | `supervision/components/tiempo.ts:6-14` (`tiempoRelativo`: min/h/d) · `InformeCorrida.tsx:71-78` (`fmtMs`: ms/s/m s) · `panel-perfil.tsx:203-209` (`fmtDuracion`: min→h→d); `hh:mm` con padStart ×3 (`InformeCorrida.tsx:82-84`, `mock-repository.ts:610`, `actas-mock.ts:362-364`) | 🟡 formatos de la MISMA jornada que ya divergen en texto ("Hace 3 min" vs "3 min") | `src/shared/format/tiempo.ts` → `duracionHumana(ms)`, `fechaRelativa(ts, ahora?)`, `hhmm(d)`, `fechaLarga(d)` (es-CO) | Bajo |
| 10 | **`PUBLIC_BASE` repetido en 7 módulos** | `divipol.ts:57`, `flags.ts:18`, `ocr/tesseract-ocr.ts:23`, `ocr/rapidocr.ts:48`, `masiva/sondeo-qr.client.ts:54`, `masiva/prescan-qr.client.ts:47`, `masiva/capa0-qr.client.ts:49`, inline `identidad-qr.ts:242` | 🟢 trivial pero 8 copias; un cambio de variable de entorno toca todo el repo | `src/shared/env.ts` → `export const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""` | Muy bajo |
| 11 | **Clamps de saneo de flags duplicados** | `flags.ts:113-156` (`sanearFlags`) vs `obs/politica.ts` (`leerOverridesFlags`/whitelist espejo, p. ej. `politica.ts:151` = `flags.ts:148`) | 🟢 nueva flag ⇒ 2 whitelists a mano; si se olvida una, el override del dueño se descarta silenciosamente | `src/shared/e14/flags-schema.ts` con la whitelist única consumida por ambos | Medio (requiere leer politica.ts completo) |
| 12 | **Magic numbers QR sin hogar común** | `QR_WARP_LADO=1600` (`orientacion-qr.ts:145`) ≡ `QR_WARP_LADO_TOPE=1600` (`prescan-qr.ts:219`); `QR_LADO_LARGO=2048` espejado como literal en `sondeo-qr.worker.ts:205` y como comentario/constante en `capa0-qr.worker.ts:57-60`; `LADOS_ALTA=[6000,4800,3600]` (`orientacion-qr.ts:222`) | 🟢 | `src/shared/e14/qr-const.ts` (o sección de constantes en `qr-pixeles.ts`, que ya es el módulo puro) | Muy bajo |
| 13 | **`hayEntornoNavegador` / idle scheduling** | `senales.ts:30-36` vs `typeof navigator === "undefined"` ad-hoc en `dispositivo.ts:86,234`, `gama.ts:314,423`; `enIdle()` solo en `perfil-provider.tsx:82-103` | 🟢 | Incluir en `src/shared/dispositivo/senales.ts` (#2) + `src/shared/env.ts`: `enIdle(cb)` | Muy bajo |

No detectado como duplicado (verificado): los mapas de estados COMPLETO/CRITICO/… son internos de supervision (no repetidos en otros módulos); `toast` y `cn` ya provienen de librerías compartidas; el decode de Blob→pixeles de los workers se trata en #5; los tres barridos QR (`qr-pixeles.ts` puro, `identidad-qr.ts` zxing, `orientacion-qr.ts` rescate) comparten primitivas pero sus cadenas son intencionalmente distintas (no forzar unificación sin bench).

## B3. Snippets comparativos de los top-5 duplicados

**#1 Reglas de tier (misma doctrina §4.4, dos cuerpos, borde distinto):**
```ts
// digitalizador/lib/e14/obs/dispositivo.ts:138-140 — nucleos SIEMPRE es number (default 1)
if (e.memoriaGB !== null && e.memoriaGB < 2) return { tier: "BAJO", tierInferido: false };
if (e.nucleos <= 2) return { tier: "BAJO", tierInferido: false };   // nucleos=1 ⇒ BAJO

// perfil-dispositivo/lib/clasificador.ts:197-199 — nucleos null NO condena
if (s.sync.memoriaGB !== null && s.sync.memoriaGB < 2) tier = "BAJO";
else if (s.sync.nucleos !== null && s.sync.nucleos <= 2) tier = "BAJO";
```

**#2 osDeUA ya divergió (mismo UA de ChromeOS → dos respuestas):**
```ts
// obs/dispositivo.ts:110-115
if (/Android/i.test(ua)) return "Android";
...
if (/Linux/i.test(ua)) return "Linux";            // CrOS ⇒ "Linux"

// perfil-dispositivo/lib/senales.ts:50-51 (copio con extensión)
if (/CrOS/i.test(ua)) return "ChromeOS";          // CrOS ⇒ "ChromeOS"
if (/Linux/i.test(ua)) return "Linux";
```

**#4 Ancho de zona contradictorio dentro del mismo producto:**
```ts
// digitalizador/store/store-e14.ts:97-102 — join hacia supervision (zona 3)
const idEnlace = [c.departamento.codigo.padStart(2,"0"), c.municipio.codigo.padStart(3,"0"),
  c.zona.codigo.padStart(3,"0"), c.puesto.codigo.padStart(2,"0")].join("_");

// digitalizador/lib/e14/clasificador.ts:1078-1081 — clave de mesa (zona 2)
const zon = c.zona.codigo.padStart(2, "0");
// ...y el JSON real: public/e14/divipol.json → zonas '00','99' (2 dígitos); exterior → '010' (3)
```

**#5 pixelesDeBlob — copia declarada:**
```ts
// capa0-qr.worker.ts:83-86
/** Decode del Blob a PixelesQr — MISMA receta del sondeo worker
 *  (sondeo-qr.worker.ts:155-188): createImageBitmap EXIF "from-image" →
 *  drawImage a OffscreenCanvas ... → getImageData. bitmap.close() INMEDIATO. */
async function pixelesDeBlob(blob: Blob, ladoLargo: number): Promise<PixelesQr | null> { ... }
// → 34 líneas idénticas en sondeo-qr.worker.ts:155-188. Hogar natural: qr-pixeles.ts (ya puro/worker-safe).
```

**#6 La misma decisión de presupuesto, dos fuentes de verdad:**
```ts
// gama.ts:224-231 (lo que la app APLICA en BAJO)
precalorCola: 1, maestroLadoMayor: 3072, qrLadoLargo: 1600, ...flagsOverride: { poolWorkers: 1, ocrThreadsTope: 2, ... }

// perfil-dispositivo/lib/recomendaciones.ts:27-32 (lo que el panel RECOMIENDA — a mano)
const poolWorkers = esBajo ? 1 : esAlto ? 2 : 1;
const ocrThreads  = esBajo ? 2 : 4;
const masterLadoMayor = esBajo ? 3072 : 4032;
const precalorCola = esBajo ? 1 : esAlto ? 3 : 2;
const qrLadoLargo  = esBajo ? 1600 : 2048;
```

## B4. Propuesta de capa compartida (estructura de carpetas src/shared/)

```
src/shared/
├── env.ts                    # PUBLIC_BASE (B2 #10) + hayEntornoNavegador() + enIdle()
├── format/
│   ├── tiempo.ts             # duracionHumana, fechaRelativa, hhmm, fechaLarga (es-CO)  (#9)
│   └── numero.ts             # fmtMB/fmtN/fmtPct, numeroConUnidad(v, null→"no informado") (#A4)
├── dispositivo/
│   ├── tier.ts               # Tier único + calcularTier() §4.4 + confianzaDe + tonoTier (#1)
│   └── senales.ts            # recolectarSync/Async, osDeUA/navegadorDeUA, sondearGpu/Runtime (#2)
├── e14/
│   ├── identidad.ts          # anchos canónicos DIVIPOLA + construirIdEnlace/claveDeMesa/
│   │                         #   nombreArchivoE14 — zona nacional 2 / monitor 3 explícitos (#4)
│   ├── divipol-client.ts     # fetch+caché del catálogo (único asset en public/e14/) (#3)
│   ├── presupuestos.ts       # PRESET_POR_TIER único (gama/recomendaciones/flags lo leen) (#6)
│   ├── qr-const.ts           # QR_WARP_LADO, QR_LADO_LARGO, RECORTE 600, RESCATE 4096 (#12)
│   └── flags-schema.ts       # whitelist de saneo única flags/overrides (#11)
├── img/
│   └── luminancia.ts         # lumaBT601/lumaBT709 sobre Uint8ClampedArray (#7)
└── ui/
    ├── tono.ts               # type Tono + VAR_TONO + colorDeTono() (#8)
    └── kpi-card.tsx          # KpiCard(title, valor, sub?, tono, onClick?, activo?) (#8)
```

Reglas de la extracción (para no romper la cultura del repo):
1. **Mover código existente sin cambiar comportamiento** (misma doctrina que `qr-pixeles.ts` / DICTAMEN-e73 §3.1): copiar literal → re-exportar desde el sitio viejo 1 release → borrar wrappers.
2. `shared/` no importa de `modules/` — solo al revés. Los tipos con nombres gemelos (`Tier`, `PerfilMinimo`) se definen en shared y los módulos re-exportan alias.
3. Todo helper compartido con try/catch total y null honesto (estándar del repo) y cero dependencias nuevas.

## B5. Roadmap de extracción priorizado (quick wins primero)

| Orden | Acción | Beneficio | Esfuerzo | Riesgo |
|---|---|---|---|---|
| 1 | `src/shared/env.ts` (PUBLIC_BASE + hayEntornoNavegador + enIdle) — 8 copias → 1 | Limpieza inmediata, 0 riesgo | ~30 min | Nulo |
| 2 | `src/shared/format/tiempo.ts` — unificar `tiempoRelativo`/`fmtMs`/`fmtDuracion`/`hhmm` | Los 3 módulos muestran la misma hora igual | ~1 h | Bajo (textos cambian ligeramente: revisar tests visuales) |
| 3 | `src/shared/ui/tono.ts` + `kpi-card.tsx` — mapa tono→token único + 1 componente KPI | El kit visual deja de vivir en 6 archivos | ~2 h | Bajo |
| 4 | `src/shared/dispositivo/tier.ts` — `calcularTier` único consumido por `obs/dispositivo.ts`, `gama.ts` y `perfil/clasificador.ts` | **Elimina el riesgo real de que el chip de MASIVA y el panel discrepen**; se corrigiendo el borde `nucleos=null` | ~3 h (tabla de casos incluida) | Bajo (función pura, ya testeada en dispositivo.ts) |
| 5 | `pixelesDeBlob` → `qr-pixeles.ts` | Un solo fix de EXIF/memoria para 2 workers | ~1 h | Bajo (los workers ya consumen qr-pixeles) |
| 6 | `src/shared/img/luminancia.ts` | Detección comparable entre módulos; decidir 601 vs 709 con una medición | ~2 h | Medio (cambiar pesos cambia umbrales: medir antes de unificar) |
| 7 | `src/shared/dispositivo/senales.ts` — colectores únicos (fin de la divergencia osDeUA/CrOS) | Una sola verdad sobre el hardware; iOS/borde consistente | ~4 h | Medio (3 llamadores con tipos gemelos) |
| 8 | `src/shared/e14/presupuestos.ts` — tabla única por tier | El panel deja de poder mentir vs gama; recalibrar = 1 archivo | ~4 h | Medio (gama.ts tiene lógica de composición propia: extraer solo los NUMEROS primero) |
| 9 | Borrar `src/modules/supervision/data/divipola-puestos.json` (≈620 KB) + `divipol-client.ts` compartido | −620 KB del repo/build; un solo catálogo que actualizar | ~1 h | Bajo (el JSON de supervision está documentado como "NUNCA importado") |
| 10 | `src/shared/e14/identidad.ts` — anchos canónicos + constructores de idEnlace/clave/nombre | Mata la ambigüedad zona 2/3 y unifica el nombre de archivo E14 | ~1 día | Alto para el código, bajo para la extracción (requiere decisión de producto: ¿zona del monitor a 3 dígitos para siempre?) |

Sugerencia de PR: 1-3 en un PR "shared/basico"; 4-5 en otro "shared/dispositivo+qr"; 6-8 después de medir; 9-10 con el dueño (decisión D22/zona).

---

## C. Métricas rápidas

- Líneas analizadas a fondo (perfil-dispositivo): **2.117 / 2.117** (100%); lectura dirigida en supervision/digitalizador: ~1.500 líneas + ~25 búsquedas estructurales (Grep) sobre todo `src/`.
- Duplicados transversales confirmados: **13** (4 🔴, 3 🟠, 3 🟡, 3 🟢).
- Copias de la lógica de tier: **2 cuerpos + 1 consumidor** (`dispositivo.ts`, `clasificador.ts`, `gama.ts`); 1 divergencia de borde detectada (`nucleos=null`).
- Copias de colectores de dispositivo: **3** (`dispositivo.ts`, `senales.ts`, `gama.ts:señalesSync`); `osDeUA` ya desincronizado (CrOS).
- Catálogo DIVIPOLA: **2 copias byte-idénticas** (md5 `8d4b0963057b2e8d0b0db179b8f5ddb2`, 635.093 B c/u) → −620 KB si se deduplica.
- Luminancia: **6 implementaciones, 2 espacios de color** (BT.601 ×4, BT.709 ×2).
- `PUBLIC_BASE`: **8 copias** en 7 archivos.
- `pixelesDeBlob`: **2 copias verbatim** (~34 líneas) entre workers.
- Ancho de zona DIVIPOLA: **2 convenciones activas** (2 dígitos nacional/JSON real vs 3 dígitos monitor/exterior) presentes incluso dentro de digitalizador (`divipol.ts:161` vs `store-e14.ts:100`).
- Formateadores de duración/tiempo: **3** sin compartir; mapas tono→token: **≥6**.
- Deudas propias de perfil-dispositivo: 2 🔴 (paridad por comentario), 5 🟡, 2 🟢; el archivo `panel-perfil.tsx` concentra el 41% del paquete.
