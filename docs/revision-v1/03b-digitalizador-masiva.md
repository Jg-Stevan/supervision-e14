# Revisión Profunda — Paquete 3-b: digitalizador · carga masiva
> **Task ID:** 3-b · **Solo lectura** (ningún archivo del proyecto fue modificado)
> **Alcance:** `src/modules/digitalizador/lib/e14/masiva/**` (28 archivos, ~10.490 líneas sin vendor) · `src/modules/digitalizador/components/e14/**` (MasivaView 1.644 · InformeCorrida 585 · icons 470) · `vendor/jsQR.js` + `jsQR.d.ts` (terceros, solo anotados) · docs `REPORTE-carga-masiva-supervision-v1.md`, `PLAN-diseno-sin-tocar-masiva.md`, `DECISIONS.md` (vía Grep: D27, D29–D34, D59–D74).
> **Interfaces consumidas del núcleo (no revisadas a fondo):** `getBridge().escanearActa/reconocerTexto/horaEnvio` (`get-bridge.ts:13-17`, `scanner-core-bridge.ts:903-930` — intersección local `OpcionesEscaneoConTimeout` + `desdeMasiva`), `fileToCaptureDataUrl` (`@jg-stevan/scanner-core/image-processor`), `getScannerWorker/warmUpScannerWorker` (`detector-client`), `image-utils` (`canvasCon`, `decodeImagenLru(DeBlob)`, `recortarDataUrl`, `rotateProcessedDataUrl`), `gama.ts` (`planGamaActual`, `flagsMasivaEfectivos`, `reportarPresionGama`), `flags.ts` (`leerFlags`), `ocr/rapidocr` (`rapidOcrPrecalentar/Reiniciar`), `obs/` (`marcarOperacion`, `redActual`), `clasificador`/`divipol`/`seed`, y `store/store-e14.ts` (3 puntos de integración T3: `registrarEnvioMasiva`, `contarMotivoNoEnvioActa`, `abrirActaMasiva/cerrarActaMasiva/editarActaActual`).

---

## 1. Mapa del paquete

| Archivo (lib/e14/masiva) | Líneas | Rol (1 línea) | Observación |
|---|---:|---|---|
| `runner.ts` | 1.903 | Orquestador: bucle de la cola + `procesarUno` (capa-0 QR → origen → deskew → master → watchdog → rescate → relectura → capa-2 → envío → persist) | **Monolito**: `procesarUno` ≈ L414-1800 (~1.390 líneas); ya tiene splits `runner-*.ts` (C1) pero el corazón es un solo try/catch/finally |
| `store.ts` | 1.589 | Mini-store Zustand (`useMasivaStore`) + ingesta (`agregarFiles`) + cadena dedup background + ledger/histórico + ciclo de vida | Solo ~28% del archivo es el store (`create` en L1041); ~900 líneas son dedup |
| `metricas.ts` | 668 | Observador pasivo de tiempos por acta/corrida (IDB propia `e14-masiva-metricas-v1`, poda 30, export JSON) | Bien aislado; 4 hooks fire-and-forget |
| `identidad-qr.ts` | 667 | CAPA 0 identidad QR pre-OCR: ladder/barridos/zxing + espera aplazada + wrapper DOM | Re-exporta casi todo de `qr-pixeles.ts` (capa de compatibilidad); el núcleo `orientacion-qr.ts` **importa de aquí** (L69-71) |
| `qr-pixeles.ts` | 385 | Núcleo puro worker-safe de decode QR (jsQR vendido): bandas, barrido, nitidez, binarizada | Ejemplar: cero DOM/zxing, testeable, sin throw |
| `archivos.ts` | 502 | Clasificación + extracción zip/rar/pdf (fflate/node-unrar-js/pdfjs/heic2any diferidos D47) + `maestroDeImagen` (master único D66) | Zip descomprime TODO en RAM (ver 🟡-2) |
| `prescan-qr.ts` | 491 | Pre-scan QR en «PROCESAR COLA»: clasificador puro + orquestador con Fase 3 primero (D31) y carril QR paralelo | Deps inyectadas (patrón e73), testeable |
| `prescan-qr.client.ts` | 394 | Cliente del detection-worker real (OpenCV): serial FIFO, hard-kill, bitmaps transferidos | 3.er cliente de worker del paquete (ver §5) |
| `origen.ts` | 403 | Detector heurístico escaneo/foto (EXIF + borde-blanco + tinta-al-filo) | Puro + DOM mínimo; jamás tumba pipeline |
| `tipos.ts` | 394 | `EstadoEntrada`, `FilaMasiva`, `RegistroMasiva`, helpers `paginaDeActa/tituloDeActa` | Contrato D57 (campos aditivos al final) respetado con rigor |
| `cola.ts` | 365 | Cola persistente IDB vanilla (`e14-masiva-v1`): CRUD + compactar e68 + `leerRegistroRaw` D41 + zombis | Patrón limpio; cursor con mapper (FIX C6) evita pico 1 GB |
| `deskew.ts` | 348 | Pre-proceso de escaneos: detección de skew (perfiles de proyección) + rotación + limpieza de blanco | Partes puras separadas de DOM |
| `precalor.ts` | 297 | Precalor: decodifica masters en la espera (tope por gama, cancelación, prefetch N+1) | Suscripción única al store; TDZ resuelto por call-later |
| `sondeo-qr.client.ts` | 268 | Cliente del worker de sondeo QR en ingesta (FIFO serial, hard-kill, cortocircuito por hambruna D36) | Duplica patrón de los otros clientes |
| `sondeo-qr.worker.ts` | 223 | Worker: ladder presupuestado S1 full → S2 recorte+rotaciones → S3 barrido | Precompilado IIFE en `public/` (lección Turbopack) |
| `capa0-qr.worker.ts` | 221 | Worker jsQR-only de la capa 0 (misma cadena de main, presupuesto de pared) | `pixelesDeBlob` duplicado del sondeo worker (~byte a byte) |
| `runner-watchdog.ts` | 186 | Infra del watchdog D65: carrera del intento, kill/re-crear workers, acta-timeout honesta | Bien partido del orquestador |
| `dedup.ts` | 176 | dhash 64-bit (EXIF normalizado) + SHA-256 de bytes | Lógica pura, conservadora |
| `ledger-remoto.ts` | 174 | Cliente del ledger remoto D1 con fetch inyectado, timeout 3 s | `LEDGER_REMOTO_ACTIVO=false` (D29 — sin backend en este repo); hoy es no-op con contratos intactos |
| `historico.ts` | 171 | Ledger persistente de enviadas (IDB `e14-masiva-historico-v1`, solo llaves) + índice por payload | MISMO patrón IDB de cola.ts (copia deliberada) |
| `capa0-qr.client.ts` | 169 | Cliente del worker capa-0 (ids correlativos, hard-kill broadcast) | Ídem: 3.er clon del patrón |
| `runner-vida.ts` | 161 | % global monotónico por fila + throttle de vida + `marcarFila` | Copia #1 de `marcarFila` (ver §5) |
| `runner-dedup.ts` | 75 | Espera acotada del desenlace de la original (techo **10 min**) | Ver 🔴-3 |
| `identidad.ts` | 61 | CAPA 2: identidad impresa desde `codigoUnico` consensuado + `DEDUP_CINTA_CIERTA=2` | Puro, red lines claras |
| `rescate.ts` | 56 | Predicado puro del rescate anti-falso-rechazo (RECHAZADA-BAJO, máx 3/corrida) | Perfecto como módulo |
| `relectura.ts` | 56 | Predicado + desenlace de la re-lectura interna e63f | Puro, testeable |
| `tope.ts` | 49 | `conTope`: tríada vencido/valor/error sin throw | Genérico reutilizable |
| `runner-thumbs.ts` | 38 | `hacerThumb` (canvas 320px JPEG 0.7) | Única responsabilidad render fuera del runner |
| `vendor/jsQR.js` + `.d.ts` | 10.101/19 | jsQR 1.4.0 vendido byte-idéntico (red line 9) — **terceros, no revisado** | Consumido solo por `qr-pixeles.ts` y (¡núcleo!) `orientacion-qr.ts:71` |
| **components/e14** | | | |
| `screens/MasivaView.tsx` | 1.644 | Vista MASIVA completa: drag&drop global, header, zona de carga, filtros, bandeja, barra de vida + `ModalRevisor` (editor recortar/rotar + Ver en Monitor) | **Monolito de 5 componentes**; sin virtualización; O(n²) puntual (ver 🟡-4) |
| `screens/InformeCorrida.tsx` | 585 | Informe de carga: KPIs, barras de etapas + sub-barras preOcr, lentas, fallos, historial, export | Agregación `useMemo` correcta; solape por barrido de eventos |
| `icons.tsx` | 470 | 32 SVG inline del sistema de diseño propio | Sin deps; copia fiel de los code.html |

**Deps externas del paquete:** `zustand` (2 stores: masiva + prescan), `@jg-stevan/scanner-core` (types/image-processor/detector-client), `zxing-wasm/reader` (solo main), y diferidas D47 en `archivos.ts`: `fflate`, `node-unrar-js`, `heic2any`, `pdfjs-dist`.

---

## 2. Flujo de la corrida masiva explicado (máquina de estados + diagrama textual)

### 2.1 Estados de una fila (`tipos.ts:13`)

```
                        ┌────────────── (runner copia desenlace de dupOf) ──────────────┐
                        ▼                                                               │
ARRASTRE ──► PENDIENTE ──┬──► PROCESANDO ──► LISTA ──► (OPTIMA→ENVIADA | ADVERTENCIA    │
 (agregarFiles)          │        │  ▲         ▲      |  | RECHAZADA | EN_REVISION_HUMANA│
                         │        │  │         │      |  └────────► DUPLICADA (capa-2/contenido)
                         │        │  └─ reintento watchdog (2 intentos) / rescate §B       │
                         │        └──► ERROR ──(REINTENTAR)──► PENDIENTE                  │
                         ├──► DUPLICADA (pre-OCR: bytes/dhash/qr-sondeo/prescan/capa-0) ─┘
                         └──► YA-ENVIADA (ledger: bytes/dhash/payload/payload-remoto) ──(PROCESAR IGUAL)──► PENDIENTE
```

Estados transitorios (RAM, nunca IDB): `progreso` (etapa+fracGlobal de la fila activa, `store.ts:106-126`), `vidas` Map por fila (`runner-vida.ts:59`), flag `precalentada` (`tipos.ts:47`), `qrPrevio`/`prescanOk`/`quad` (RAM del lote).

### 2.2 Fases extremo a extremo

**F1 · Ingesta** (`store.ts:1090-1293`, drag&drop global `MasivaView.tsx:792-837`):
1. Clasifica cada File: imagen directa · `.zip/.rar` → `extraerArchivo` (fflate/unrar, tope 500 entradas) · `.pdf` → `extraerPdf` (pdfjs, ≤30 páginas, `viaPdf:true`) · lo demás → fila ERROR `FORMATO_NO_SOPORTADO` (`archivos.ts:240-244`).
2. Filas temp `masiva-temp-*` PENDIENTE al instante + contador `GUARDANDO N…`.
3. SHA-256 por archivo (secuencial, fuera de la tx IDB — `store.ts:1179-1189`).
4. `agregarLote` (una tx atómica, `cola.ts:74-113`) → swap temp→id real respetando QUITAR/VACIAR del dueño (FIX M13, `store.ts:1199-1210`) → huérfanos borrados.
5. `dedupExactoIngesta` (e71): gemela por SHA-256 → YA-ENVIADA/DUPLICADA instantánea, jamás paga OCR (`store.ts:894-986`).
6. `rearrancarTrasEncolar()` (runner re-arranca solo si la sesión ya vivió — `runner.ts:1897-1903`) y `void cadenaDedup(...)` en background.

**F2 · Cadena dedup de ingesta (background FIFO, `store.ts:496-874`)** por fila: capa bytes (histórico/cola viva) → **sondeo QR** en worker (e73, payload→`qrPrevio`, mapa del lote, índice por payload) → dhash EXIF-normalizado → Hamming: cinta cierta ≤2 marca DUPLICADA/YA-ENVIADA; banda 3..6 queda `visual-aplazada` (la decide la capa 2 post-OCR).

**F3 · «PROCESAR COLA»** (`prescan-qr.ts:315-491`): arranca el runner YA (D31) y en paralelo el pre-scan lee el QR del resto (OpenCV detect → warp → BarcodeDetector/jsQR) estampando `qrPrevio`/DUPLICADA/YA-ENVIADA con triple anti-zombi.

**F4 · Runner** (`runner.ts:1802-1831`): pool de N en vuelo (`procesamientoConcurrenteEfectivo`, default 1 — D31 baja el 2 de e71), reservas en `Set`, `Promise.race` para slots. Por fila, `procesarUno` (`runner.ts:414`):
- rama DUPLICADA → `reutilizarResultado` (copia registro+status+thumb, mutex) o espera acotada de la original o fallback honesto a reproceso completo (L447-478);
- **capa-0 QR** (hereda `qrPrevio` o worker jsQR + rescate zxing) → decide por payload EXACTO: reutiliza / YA-ENVIADA por histórico / registra / APLAZADA (espera ≤15 s);
- **bloque pipeline por intento** (bucle L825-1044): `clasificarOrigenDeArchivo` (D63-A, override `viaPdf`) → `preProcesoEscaneo` (deskew D63-B) → master (precalor consumido u horneado) → `getBridge().escanearActa` con `timeoutMs` y `desdeMasiva:true`; el watchdog (75 s ×2, gracia 5 s) mata workers y reintenta; rescate §B re-corre el desenlace si RECHAZADA-BAJO en intento 1;
- **post-desenlace**: parche inmutable del diagnóstico (esperaMs/origen/deskew/maestroFuente), guard anti-zombi, **relectura interna** (e63f, tope 45 s), **capa-2 identidad** (serie 13 dígitos, mutex), **dedup por contenido v2** (hashBytes + gemela LISTA/en vuelo), **envío automático** si OPTIMA: veto post-OCR ya-enviada (H1) + check remoto (D1, no-op en este repo) + `registrarEnvioMasiva` + ledger local/remoto fire-and-forget, hash EN COLA si offline; si no OPTIMA → `contarMotivoNoEnvioActa`;
- **persistencia**: `guardarRegistro` con fallback liviano si quota (FIX M14) + re-save de `persistMs` + thumb + `marcarFila(LISTA)` + métricas (D34/D44);
- **catch** (L1734-1793): fila ERROR con motivo corto ≤48, guard anti-zombi, post-mortem de trazas (qrPayload/watchdog/rescate) en IDB; **finally**: vida eliminada, progreso null.

**F5 · Drenaje offline**: envío en cola (`hashSha256:"EN COLA"`) → al reconectar `refrescarEnviosTrasDrenaje` (`store.ts:994-1029`) reescribe hash demo + registro remoto.

**F6 · Revisión humana**: `abrirActa` auto-pausa el runner (`store.ts:1363-1369`) → `ModalRevisor` (MasivaView) edita vía `editarActaActual` → al cerrar `sincronizarAlVolver` re-persiste acta+thumb+ledger si la identidad coincide (`store.ts:1371-1442`). Reanudar es MANUAL (botón).

### 2.3 Reanudación / cancelación / errores parciales
- **Crash/recarga**: `recuperarCola()` zombis PROCESANDO→PENDIENTE al montar (`cola.ts:358-365`); cola+thumb+trazas en IDB; `cargarFilas` con píldora fallback si IDB cae; QUOTA ≠ sin-soporte (aviso específico M9, `store.ts:1276-1291`).
- **Pausa** (`pausarRunner` → `stopFlag`): el vuelo TERMINA (no aborta a mitad); el bucle no toma más filas; el finally apaga cuando todo aterrizó (`runner.ts:1872-1879`).
- **Cancelación por fila**: QUITAR/VACIAR mata por guards anti-zombi en TODOS los await largos (leerRegistro→verificar fila viva, patrón repetido 15+ veces).
- **Errores parciales**: fila a fila — un error nunca tumba la cola; el envío en lote de ADVERTENCIAS también es fila a fila con guard de re-entrancia (`store.ts:1513-1571`).

---

## 3. Lo que está BIEN

1. **Doctrina del conservador, aplicada con disciplina real.** 123 `catch` que jamás tumban la cola; «jamás inventar» aparece 58 veces en comentarios y el código lo cumple: campos ausentes ≠ 0/1 (p. ej. `preOcrMs` solo viaja si el muro corrió, `runner.ts:1716`; `qrHeredado` solo `true` en ERROR, `runner.ts:1759`).
2. **Memoria bien administrada.** Filas livianas en RAM + Blobs en IDB (lección L7), `listarMapeados` con mapper DENTRO del cursor (FIX C6, `cola.ts:298-319`) — documenta el pico >1 GB que evitó —, migración base64→Blob (e68) con materialización perezosa (`leerRegistroRaw` D41 elimina atob de 2-16 MB por marca), `bitmap.close()` inmediato en workers (`sondeo-qr.worker.ts:175`), masters del precalor con tope por gama y expulsión FIFO (`precalor.ts:209-213`), bitmapFull transferido/detached en el prescan (`prescan-qr.ts:431-465`).
3. **Watchdog y autoreparación serios**: presupuesto por intento (75 s ≈ 3× peor caso real) + kill y re-creación de workers OpenCV/OCR + re-warm del OCR (`runner-watchdog.ts:94-131`) + acta de timeout honesta `actaTimeoutWatchdog` + techo aparte para la relectura (`conTope`, 45 s) — cierra los «se detiene a medio camino» del informe 20261020.
4. **Dedup en capas con trazas auditables**: bytes → payload QR exacto (red line 10: llave opaca, sin fuzzy) → dhash con cinta cierta 2 y banda aplazada → identidad impresa consensuada post-OCR. Cada desenlace queda en `RegistroMasiva.dedup` con evidencia del porqué (`tipos.ts:210-224`), y el falso positivo 3992/3993 quedó post-mortem documentado.
5. **Mutex simple correcto** (`conExclusionMutua`, `runner.ts:211-223`): promesa-cadena FIFO que solo encierra la decisión de dedup; el OCR y el precalor quedan fuera (paralelismo real). Cierra el doble envío del pool 2 por construcción, con re-chequeo post-reserva (WAVE2 B1).
6. **Workers bien hechos**: precompilados a IIFE en `public/` (lección Turbopack del FIX DICTAMEN-e73 §3.1), feature-detect + kill-switch por flag + hard-kill con respawn perezoso + bitmaps transferidos; red line «zxing JAMÁS en el worker» respetada (jsQR-only en `qr-pixeles.ts`).
7. **Soberanía del dueño**: `forzarDedupOff` respetado en las 6 capas (RL-e65b-6), botones destructivos de 2 toques con desarme a 3 s (VACIAR/REINICIAR/LIMPIAR), `REINICIAR ENVÍOS` como corte explícito (D33) sin tocar el `vaciar()` protegido (RL-e65b-5).
8. **Observabilidad de corrida honesta**: `metricas.ts` observador pasivo con IDB propia, poda a 30, `cuelloDeEtapas` que excluye particiones del muro (sin doble contabilidad, `metricas.ts:236-249`), solape real del pool por barrido de eventos (`InformeCorrida.tsx:238-259`), export JSON auto-identificado (gama + motor OCR).
9. **Accesibilidad y UX de detalle**: `role="status"/"alert"`, `aria-live` solo en textos de etapa, `aria-pressed` en filtros, `progressbar` con `aria-valuenow` solo para OCR real (el resto barra animada — «jamás inventar %»), min-h 44px táctil, drag&drop global con `dragCounter` correcto y overlay pointer-events gestionado.
10. **Contrato D57 cumplido de punta a punta**: campos nuevos SIEMPRE al final, unión `dedup` con valores nuevos al final, spread condicional `...(x ? {campo} : {})` — la evolución additiva del esquema persistido es impecable y reversiblemente documentada (e64p modo pruebas con `COLA_PERSISTENTE`).

---

## 4. Deudas y problemas

### 🔴 Críticos

**C-1 · `procesarUno` es un super-función de ~1.390 líneas con ~16 responsabilidades** (`runner.ts:414-1800`).
Capa-0 QR + dedup por payload + ledger local + ledger remoto + origen + deskew + master/precalor + bucle watchdog + rescate + relectura + capa-2 identidad + dedup por contenido + veto post-OCR + envío + persistencia + métricas + post-mortem, todo en un solo `try/catch/finally`. El post-mortem (catch) y el desenlace (try) **duplican el estampado de trazas** (`qrPayload/qrEstado/qrHeredado/watchdog/rescate` en 3 sitios: L1617-1634, L1764-1789 y el re-save L720-731): cualquier traza nueva debe recordarse en 3 lugares. La violación de SRP ya produjo subdivisión (C1: runner-watchdog/vida/dedup/thumbs) pero solo de infra periférica; el pipeline central sigue indivisible. La propia cabecera admite «los harnesses QA grepean este archivo» (L54-61) — las anclas de texto bloquean el refactor (ver C-5). *Cómo partirlo en stages:* extraer del cuerpo de `procesarUno` fases con un objeto de contexto explícito `{fila, registro, qrPayload, preOcr*, actaDesenlace, identidad, rescateLanzado…}`: `faseCapa0Qr()`, `fasePipelineIntentos()`, `faseDesenlace()` (relectura+capa2+dedup contenido), `faseEnvio()`, `fasePersistYMetrica()`, con un único catch en el orquestador que reciba el contexto parcial (las 3 estampadas se vuelven una). Los 5 stages quedan testeables headless como `rescate.ts`/`relectura.ts`.

**C-2 · Seis rutas independientes que marcan DUPLICADA/YA-ENVIADA re-implementan el mismo patrón.**
`cadenaDedup` (`store.ts:496-874`), `dedupExactoIngesta` (`store.ts:894-986`), `aplicarVeredictoPrescan` (`prescan-qr.ts:155-202`), capa-0 payload (`runner.ts:737-820`), capa-2 identidad (`runner.ts:1183-1245`) y dedup por contenido (`runner.ts:1286-1392`): cada una repite guard anti-zombi + `leerRegistro` + `guardarRegistro` + `patchFila` + verificación «¿la original ya fue ENVIADA?» (ese bloque de 12 líneas aparece **3 veces** en store.ts: L554-575, L830-845, L941-952). El costo no es estético: dos mapas de payload conviven con ciclos de vida distintos — `mapaQrPayload` global de sesión (`store.ts:269`) vs `mapaSondeoPayload` local a CADA llamada de `cadenaDedup` (`store.ts:511`) — y una marca persistente (`estado:"DUPLICADA"` en IDB) puede coexistir con la fila sin `dupOf` derivado (store.ts:228 solo restaura `dupOf` si estado==="DUPLICADA"). Consolidar en un módulo `dedup-marcas.ts` con UNA función `marcarDuplicada(id, dupOf, via)` / `marcarYaEnviada(...)` (la segunda ya existe y es el estándar de facto) reduciría ~400 líneas y eliminaría el riesgo de divergencia.

**C-3 · Espera acotada de 10 MINUTOS bloqueando slot del pool** (`runner-dedup.ts:33-34`, consumo `runner.ts:463` y `1327`).
La rama DUPLICADA sondea cada 400 ms (incl. `leerRegistro` IDB por tick) hasta que la original tenga acta, con techo `ESPERA_ORIGINAL_TECHO_MS = 600_000`. El argumento «sin deadlock por construcción» vale solo si la original va delante en la FIFO (`agregadaEn` menor): es cierto para `dedupExactoIngesta`/`cadenaDedup`/`prescan`/capa-0, pero `procesarIgual` (PROCESAR IGUAL) re-encola con el `agregadaEn` ORIGINAL y un reproceso posterior de la gemela + `quitar`/re-add de la original puede dejar la original PENDIENTE detrás de la gemela en curso — escenario donde la gemela espera hasta 10 min con pool 1 (default) mientras la cola entera se congela. El mismo patrón con techo 15 s existe para la capa-0 (`esperarDesenlaceQr`) y NO verifica `agregadaEn` de la original (`runner.ts:799-801`). Mitigación barata: si `original.agregadaEn > fila.agregadaEn` → reproceso completo inmediato (como ya hace el dedup por contenido en L1305-1310).

### 🟡 Medios

**M-1 · Zip/rar sin tope de bytes (zip bomb) y memoria doble en extracción** (`archivos.ts`).
`extraerZip` (L381-416) lee el `.zip` completo a `ArrayBuffer` y luego `unzipSync` descomprime **todas** las entradas de una vez a un `Record<string, Uint8Array>`; `TOPE_POR_COMPRIMIDO=500` cuenta entradas pero no bytes — un zip de 500 entradas × 100 MB (o 1 entrada de GB) revienta la pestaña antes del tope. `archivoDeEntrada` hace `datos.slice()` (L269-273) que duplica cada buffer al envolverlo en `File`. `extraerRar` ídem (arrayBuffer completo L429; el generador de `extract({})` es perezoso pero los `archivos[]` acumulan todo en RAM antes de encolar). Mitigación: tope de bytes acumulados por comprimido (p. ej. 2 GB) + check `datos.length` por entrada + construir el `File` con vista sin copia cuando el typing lo permita. El render PDF sí está bien acotado (secuencial, 1 página en memoria, `archivos.ts:336-367`).

**M-2 · `MasivaView.tsx`: monolito de 1.644 líneas, sin virtualización, O(n²) y derivados sin memo.**
- 5 componentes en un archivo (`MasivaView` L700, `ModalRevisor` L291, `PublicacionChip` L236, + helpers); el modal de revisión con editor (recorte con pointer events, rotación, undo) merece archivo propio.
- **O(n²)** en el render de la bandeja: `colaVida.indexOf(f.id)` por fila (L1334) y `filas.find((o) => o.id === f.dupOf)` por fila DUPLICADA (L1456) — con un zip de 500 entradas son ~250k comparaciones por render, y hay un render por señal de vida (throttle 250 ms).
- ~12 `filas.filter(...)` derivados **sin useMemo** (L711-712, L850-878: pendientes/duplicadas/terminadas/yaEnviadas/advertenciasPend/enviadas/enCola/errores/sondeadas/conPayload/visibles) — cada setState del store re-corre los 12 O(n).
- Thumbs dataURL ~20-40 KB cada una en `<img>` sin `loading="lazy"` ni virtualización: 500 filas ≈ 10-20 MB solo de decodificación de miniaturas.
- Cómo partirlo: `MasivaToolbar` (header+acciones), `MasivaZonaCarga`, `MasivaBandeja`+`FilaTarjeta` (memo por fila), `ModalRevisor` (archivo), hook `useMasivaDerivados` (un solo useMemo con todos los conteos); sustituir `indexOf/find` por `Map` precalculado en el mismo useMemo; virtualización (o paginación de 50) cuando `filas.length > 100`.

**M-3 · `store.ts` mezcla 6 responsabilidades y ancla el ciclo de imports.**
Zustand + ingesta/clasificación de archivos + cadena dedup background + índice de enviadas/ledger + ciclo de vida (vaciar/reiniciar/modo pruebas) + mapeo registro→fila. Además genera el **ciclo store↔runner↔precalor** (`store.ts:50,56` → `runner.ts:25,35` / `precalor.ts:42`), documentado como deliberado por TDZ (`store.ts:51-56`) pero frágil: `cablearPrecalor()` se ejecuta al importar el módulo (`store.ts:1589`, efecto al nivel de módulo) y `agregarFiles` es una action de 200 líneas con 4 fases async y manejo de huérfanos dentro del store. Extraer `ingesta.ts` (agregarFiles + clasificación + SHA) y `dedup-store.ts` (cadenaDedup + dedupExactoIngesta + indiceEnviadas) deja el store en ~350 líneas de estado puro y rompe el ciclo hacia un único sentido `store ← ingesta/dedup/runner`.

**M-4 · El núcleo depende de masiva (inversión de dependencia).**
`orientacion-qr.ts:69-71` importa `moduloZxingDe`, `qrCorto` y hasta el **vendor jsQR** desde `masiva/`; `types.ts:9` y `bridge.ts:23` importan `OrigenActa` desde `masiva/origen`. La «masiva» ya no es un módulo hoja: cualquier cambio ahí puede romper el flujo individual (la zona protegida del PLAN-diseno §1 es simétrica y este acoplamiento la cruza). Riesgo de ciclo futuro si masiva necesita más del núcleo QR.

**M-5 · QA por anclas de texto (grep de literales) sin tests en este repo.**
El REPORTE D27 (L40-41) confirma que los tests vitest y `scripts/qa-*` **se quedaron en digielect14**. En este repo la garantía son anclas: `console.info` literal prohibido de migrar (`runner.ts:1154-1158`), `eslint-disable` con nota de ancla (`runner.ts:552`), constantes que «QA grepea» (`WATCHDOG_MS` L122, `RELECTURA_TOPE_MS` L148, mutex L209…). Esto **bloquea refactorizar** (C-1) sin llevarse el harness: primera acción de cualquier reorganización debe ser portar `scripts/qa-*.ts` + tests a este repo.

**M-6 · Persistencia de métricas escribe la corrida en CADA acta** (`metricas.ts:515-529`): `persistirActa` hace `put(acta)` + lectura de la corrida + `put(corrida)` para mantener `nActas` — 3 operaciones IDB por desenlace donde 1 bastaría (contar al cerrar, como ya hace `cerrarCorridaMetrica` L494). Con 500 actas son 1.000 writes extra.

### 🟢 Leves

- **L-1** `hashDrenaje` duplica el `hashMock` del store principal por la whitelist del kit (`store.ts:1031-1039`) — 3 líneas aceptadas, pero es un candidato natural a módulo compartido si la whitelist se relaja.
- **L-2** `patchFila`/`marcarFila` existe 3 veces idéntico (`store.ts:255`, `runner-vida.ts:106`, `precalor.ts:81`) — mover a `tipos.ts` o `store.ts` exportado y reutilizar.
- **L-3** `pixelesDeBlob` duplicado casi byte a byte entre `sondeo-qr.worker.ts:155-188` y `capa0-qr.worker.ts:87-120` (decisión consciente: bundles jsQR-only separados; ok, pero anotar el espejo).
- **L-4** `motivoCorto` (`runner.ts:225-229`) vs `slice(0, 48)` repetido en `store.ts:1119` y `1138` — mismo formateo por dos vías.
- **L-5** Dos paletas de píldora casi idénticas (`pildoraDe` MasivaView:79 vs `pildoraEstadoActa` MasivaView:201) — unificar sobre la primera añadiendo DUPLICADA.
- **L-6** Tres implementaciones de «espera por sondeo con techo»: `esperarDesenlaceQr` (15 s), `esperarDesenlaceOriginal` (10 min), y el hard-kill/respawn de los 3 clientes worker — extraer un helper `sondeoHasta(predicado, {intervalo, techo})`.
- **L-7** `console.info("[e14] memoria fila", …)` en `cola.ts:211` fuera del `logger` (única traza no enrutable del paquete; el propio kit migró el resto a logger).
- **L-8** `LEDGER_REMOTO_ACTIVO=false` mantiene vivo el camino remoto (`consultarEnvioRemoto` L1464, `registrarEnvioRemoto` L1541, drenaje L1017) que hoy siempre es no-op — barato y documentado (D29), pero es ruido de ejecución; una rama temprana en `runner` lo saltaría.
- **L-9** `informeCorrida` mantiene el panel montado con reloj de 1 s mientras la corrida vive (`InformeCorrida.tsx:165-169`) — aceptable, pero en gama BAJO el `tick` re-corre el `agg` completo (el useMemo solo depende de `actas`, correcto; ok, sin costo real).
- **L-10** `siguientePendiente()` hace filter+sort O(n log n) en cada take del bucle (runner.ts:240-254) — irrelevante con n≤miles, anotado por completitud.

---

## 5. Duplicados y reutilización (incluye solapes con el núcleo)

| Duplicado | Dónde | Nota |
|---|---|---|
| `marcarFila`/`patchFila` ×3 | `store.ts:255` · `runner-vida.ts:106` · `precalor.ts:81` | idénticas; 1 export eliminaría 2 |
| Verificación «original ya enviada» ×3 | `store.ts:554-575` · `830-845` · `941-952` | mismo bloque 12 líneas (leerRegistro + status ENVIADA/YA-ENVIADA) |
| Rutas de marca DUPLICADA/YA-ENVIADA ×6 | ver C-2 | el patrón anti-zombi+write+patch completo |
| Esperas por sondeo ×3 | `identidad-qr.ts:646` (15 s) · `runner-dedup.ts:35` (10 min) · `store.ts` sondeo ingesta | techos e intervalos distintos, misma forma |
| Clientes de worker ×3 | `sondeo-qr.client.ts` · `capa0-qr.client.ts` · `prescan-qr.client.ts` | hard-kill + respawn perezoso + jamás throw; el prescan añade serial FIFO; un factory común ahorraría ~250 líneas |
| `pixelesDeBlob` ×2 | `sondeo-qr.worker.ts:155` · `capa0-qr.worker.ts:87` | espejo consciente (bundles jsQR-only separados) |
| Formateadores | `fmtMs`/`percentil`/`fmtFechaRelativa` (`InformeCorrida.tsx:71-91`) · `motivoCorto` (`runner.ts:225`) · `slice(0,48)` (`store.ts:1119,1138`) | sin módulo `formato.ts` del paquete |
| `hashDrenaje` vs `hashMock` (núcleo) | `store.ts:1034` vs `store/store-e14.ts` | espejo por whitelist §1 del kit (aceptado, documentado) |
| Paletas de píldora ×2 | `MasivaView.tsx:79` y `:201` | mismo vocabulario de estado |
| **Solape con el núcleo QR** | `identidad-qr.ts` (ladder/barridos/zxing/recorte-600) vs `orientacion-qr.ts` (núcleo, 611 líneas) | el núcleo **consume** `moduloZxingDe`+`qrCorto`+jsQR vendido de masiva (M-4); ambos implementan «re-scaneo con presupuesto y traza tier=» — el día que el prescan quiera la brújula, hay infra QR duplicada conceptualmente (decisión del trasplante D27: brújula OMITIDA en masiva vía `desdeMasiva`, `scanner-core-bridge.ts:1416-1424`) |
| Contratos IDB ×3 | `cola.ts:abrirCola` · `historico.ts:abrirHistorico` · `metricas.ts:abrirMetricas` | mismo patrón singleton+onupgradeneeded copiado 3 veces (comment lo declara) — un `idb-helper.ts` de 40 líneas lo cubre |

---

## 6. Guía de lectura para el programador nuevo

1. **Empieza por los tipos**: `tipos.ts` define `FilaMasiva` (RAM liviana) vs `RegistroMasiva` (IDB con Blob+acta) y el contrato D57 («campos nuevos al final, ausente = no medido»). Todo lo demás se lee mejor con eso.
2. **La vista**: `MasivaView.tsx` (bandeja, drag&drop, modal) habla SOLO con `useMasivaStore`; ningún botón toca el pipeline directamente (excepto `prescanYIniciar`).
3. **El store**: `store.ts` — `agregarFiles` (ingesta), `cadenaDedup` (marcas de fondo), el `create` de Zustand en L1041 con actions de UI (iniciar/pausar/procesarIgual/reintentar/vaciar/reiniciarEnvios/enviarLote/sincronizarAlVolver).
4. **El motor**: `runner.ts` — lee primero `bucle` (L1802) e `iniciarRunner` (L1857); después `procesarUno` (L414) en orden: capa-0 QR (L624-823) → bucle de intentos (L825-1044) → desenlace/envío (L1097-1552) → persist (L1584-1705). Los splits `runner-vida/-watchdog/-dedup/-thumbs` son helpers sin importación entre sí (C1).
5. **QR**: `qr-pixeles.ts` (puro) → `identidad-qr.ts` (cadena completa + wrapper DOM) → `capa0-qr.worker/client` (el mismo carril fuera del hilo UI) → `sondeo-qr.*` (versión ingesta) → `prescan-qr.*` (versión «PROCESAR COLA»).
6. **Archivos**: `archivos.ts` (zip/rar/pdf/master) y `precalor.ts` (decode adelantado en la espera).
7. **Persistencia**: `cola.ts` (la cola), `historico.ts` (ledger de enviadas), `metricas.ts` (métricas de corrida) — tres IDB separadas, mismo patrón.
8. **Honestidad de estado**: cualquier campo nuevo que quieras estampar en `RegistroMasiva`/`FilaMasiva` va AL FINAL, con spread condicional, y «ausente = el instrumento no corrió». Si dudas, mira 3 ejemplos en `runner.ts:1595-1634`.
9. **Docs vivas**: `docs/DECISIONS.md` D27 (trasplante), D29-D34, D59-D74 (cada uno mapea a un bloque comentado del código — los comentarios del paquete citan su kit).

---

## 7. Recomendaciones de reorganización

| # | Acción | Esfuerzo | Riesgo | Impacto |
|---|---|---|---|---|
| 1 | **Portar el harness QA + tests desde digielect14** (prerrequisito de todo lo demás — hoy las anclas grepeadas son la única red) | M | Bajo | Habilita C-1 y el resto |
| 2 | Extraer `marcarFila` único + unificar «original ya enviada» + formateadores (`motivoCorto`, fmt) | S | Bajo | −80 líneas, 1 sola definición |
| 3 | `MasivaView` → 4-5 archivos + `useMasivaDerivados` (un useMemo) + Maps para `dupOf`/posición de cola (mata el O(n²)) | M | Bajo | Render O(n), bandeja fluida con 500 filas |
| 4 | Tope de bytes en extracción zip/rar (suma acumulada + por entrada) y evitar `.slice()` del buffer | S | Bajo | Cierra el zip-bomb (M-1) |
| 5 | Techo de espera de original solo cuando la original va DELANTE (`agregadaEn` menor); si no, reproceso inmediato | S | Bajo | Elimina congelación de cola de C-3 |
| 6 | Extraer `ingesta.ts` y `dedup-marcas.ts` del store; `store.ts` queda estado+actions de UI | M | Medio | Rompe el ciclo store↔runner↔precalor; consolida 6 rutas de dedup (C-2) |
| 7 | Virtualización/paginación de la bandeja (>100 filas) + `loading="lazy"` en thumbs | M | Bajo | Memoria y jank en lotes grandes |
| 8 | Partir `procesarUno` en stages con contexto explícito (`faseCapa0Qr/fasePipeline/faseDesenlace/faseEnvio/fasePersist`) manteniendo las anclas de QA con re-grep actualizado | L | Medio-Alto | SRP real del runner (C-1); testeable por fases |
| 9 | Mover `moduloZxingDe`/`qrCorto`/`OrigenActa` a un módulo compartido (`lib/e14/qr-comun.ts` + `tipos-origen.ts`) para des-invertir la dependencia núcleo→masiva | M | Medio | Restaurar masiva como módulo hoja (M-4) |
| 10 | Factory común de clientes de worker (hard-kill/respawn/serial) + `idb-helper.ts` | M | Bajo | −400 líneas, 1 patrón en vez de 6 clones |
| 11 | Métricas: contar `nActas` solo al cerrar la corrida (quita 1.000 writes extra por 500 actas) | S | Bajo | Menos E/S IDB en plena corrida |

**Orden sugerido:** 1 → 2 → 5 → 4 → 3 → 11 → 6 → 10 → 7 → 9 → 8 (el 8 último porque invalida anclas y quiere el harness ya portado; el 9 requiere coordinación con el agente del núcleo).

---

## 8. Métricas rápidas

- **Tamaño propio del paquete:** 28 archivos masiva ≈ **10.490 líneas** (+ vendor jsQR 10.101) · componentes e14 **2.699 líneas** (3 archivos) → ~13.190 líneas revisadas.
- **Los 5 mayores:** runner 1.903 · MasivaView 1.644 · store 1.589 · metricas 668 · identidad-qr 667.
- **`procesarUno`:** ~1.390 líneas (73% de runner.ts) — 1 función, ~16 responsabilidades.
- **`catch` silenciosos/conservadores:** **123** en el paquete (doctrina del conservador) — cero `throw` cruzando fronteras instrumentales.
- **Trazas de log:** 59 `logger.info/warn` (+1 `console.info` ancla QA en runner.ts:1156 y 1 `console.info` residual en cola.ts:211).
- **Menciones de «jamás inventar»:** 58 — política de honestidad de datos hecha práctica.
- **Llamadas `leerRegistro/leerRegistroRaw`:** 27 puntos de uso (D41: las marcas usan Raw; solo REVISIÓN materializa fotos).
- **`filas.find(` en masiva:** 15 usos — 2 de ellos O(n) dentro del render O(n) de la bandeja (MasivaView:1334/1456).
- **Stores Zustand:** 2 (`useMasivaStore`, `usePrescanStore`) — acciones estables accedidas una vez por `getState()` (correcto).
- **Dedup:** 5 capas (bytes SHA-256 · payload QR exacto · dhash cinta ≤2 · identidad impresa 13 dígitos · contenido v2 en vuelo) con 12 valores de traza `dedup` y 3 modos de YA-ENVIADA.
- **IDB:** 3 bases (`e14-masiva-v1`, `e14-masiva-historico-v1`, `e14-masiva-metricas-v1`), todas vanilla sin deps.
- **Workers:** 2 precompilados (sondeo, capa-0) + 1 asset del core (detection-worker) — 3 clientes con patrón hard-kill/respawn.
- **Kill-switches/flags de dueño:** ≥10 (sondeoQrPrecoz, prescanQrCola, capa0QrWorker, masivaSondeoCrudo, colaPersistente, thumbsOn, masivaAdaptativoGama, masivaStreaming/quad/rotacion/prioridad heredados de K1/K2…).
- **Tests en este repo:** **0** para masiva (harness en digielect14 — REPORTE D27 L40-41) — hallazgo #1 de deuda estructural.

**Veredicto general:** paquete funcionalmente sólido y notablemente bien instrumentado (la disciplina «conservador + trazas aditivas + jamás inventar» es de las mejores que se ven en código de producción de este tipo), pero con tres focos de deuda estructural que ya están empezando a cobrar intereses: el super-`procesarUno` de runner.ts, el store de 1.589 líneas que mezcla 6 roles y alimenta un ciclo de imports, y un MasivaView monolítico sin virtualización con O(n²) puntual — todos refactorizables de forma segura solo después de portar el harness QA que este repo aún no tiene.
