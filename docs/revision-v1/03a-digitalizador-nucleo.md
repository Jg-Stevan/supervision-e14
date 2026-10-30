# Revisión Profunda — Paquete 3-a: digitalizador · núcleo
> Task ID: 3-a · Alcance: `src/modules/digitalizador/lib/e14/*.ts` (raíz, 20 archivos), `lib/e14/ocr/**`, `lib/e14/obs/**`, `store/store-e14.ts`, `lib/logger.ts`. NO revisado a fondo (otro agente): `lib/e14/masiva/**` y `components/e14/**` (solo interfaces). `vendor/jsQR.js` anotado, NO leído (terceros).

---

## 1. Mapa del paquete

**Zona núcleo `lib/e14/` raíz (8.400 líneas):**

| Archivo | Líneas | Rol (1 línea) | Observación |
|---|---|---|---|
| `scanner-core-bridge.ts` | 2.868 | El pipeline completo: entrada→detect→warp→orientación→calidad→OCR→gate→Acta (implementa `E14Bridge`) | 🔴 Monolito: 2 pipelines gemelos (~600-700 líneas duplicadas) + 15 helpers de dominio en un archivo |
| `clasificador.ts` | 1.172 | OCR → ruta DIVIPOL (dep/mun/zona/puesto/mesa/tipo/página/kit) con fuzzy trigramas+Dice, consenso código 1D, arbitraje registro | 🟡 Función única `clasificarCabecera` de ~580 líneas con cascada de reglas difícil de testear en partes |
| `orientacion.ts` | 631 | Probe de rotación 0/90/180/270 (score por anclas+conf, mini-probe 320px con fallo seguro, anillo D62 en localStorage) | ✅ Bien estructurado (sondeoDe compartido mini/full) |
| `orientacion-qr.ts` | 611 | Brújula QR: cuadrante del QR → rotación; jsQR sobre warp + rescate hi-res ZXing con crops paralelogramo | 🟡 Puerto "verbatim del bench": duplica utilidades QR/imagen de masiva |
| `gama.ts` | 474 | Capa adaptativa de gama (BAJO/MEDIO/ALTO → presupuestos) + gobernador reactivo por hard-kills | ✅ Bien aislado, jamás lanza, flag kill-switch |
| `completitud.ts` | 372 | Guard-borde: geometría sospecha, tinta condena; motor de tinta compartido (luma<128, ~320px) | ✅ Motor compartido con marcadores.ts |
| `types.ts` | 364 | Dominio: `Acta`, `ActaStatus`, `DiagnosticoActa`, `statusDeScore` | ✅ Contratos claros, campos aditivos documentados (D57) |
| `image-utils.ts` | 338 | LRU de decodes (tope 2 + dedup en vuelo), factory canvas, tinta 64×64, recorte/rotación | ✅ Pieza clave de performance, bien comentada |
| `flags.ts` | 247 | FLAGS_DEFAULT + fetch remoto `flags.json` (24h, backoff) + saneo whitelist | 🟡 Whitelist paralela a `politica.ts` (mantenimiento doble) |
| `bridge.ts` | 211 | Contrato `E14Bridge` + `CompositeBridge` (gates por presencia de foto) | 🟡 `OpcionesEscaneo` sin `timeoutMs`/`desdeMasiva` ⇒ casts en el bridge real |
| `marco-escaneo.ts` | 203 | Detector del marco impreso del E-14 (gate de escaneos: completo/ceñido/cortado/no-encontrado) | ✅ Parte pura separada (testeable) |
| `divipol.ts` | 189 | Carga caché de `divipol.json` + consultas jerárquicas; degrada a base vacía, nunca RECHAZADA | ✅ |
| `integridad.ts` | 172 | Marcas fiduciales de esquina (imagen integral, núcleo oscuro + anillo claro) | 🟡 Luma BT.709 ≠ BT.601 del resto |
| `seed.ts` | 134 | Mocks de diseño (mesas, historial, ACTA_MOCK) | ✅ |
| `senal-lectura.ts` | 122 | Señal de lectura FUERTE/MEDIA/DEBIL (10 anclas regex) + perdón de lazo | ✅ Pura, testeable |
| `marcadores.ts` | 85 | Gate SIN_VOTOS: densidad de tinta en zona de votos (fracciones + rect del marco) | ✅ Reutiliza `motorTinta` |
| `diagnostico.ts` | 79 | Builder del registro de desenlace (`acta.diagnostico`) | ✅ Puro, sin recomputo |
| `ocr-escalonado.ts` | 66 | Decisión pura del OCR escalonado (¿2.ª pasada? ¿cuál gana?) | ✅ |
| `kits.ts` | 44 | Registro KIT→mesa (tabla pequeña con evidencia) | ✅ |
| `get-bridge.ts` | 18 | Punto único de intercambio (`CompositeBridge(new RealCoreBridge())`) | ✅ |

**OCR (`lib/e14/ocr/`, 1.908 líneas):**

| Archivo | Líneas | Rol | Observación |
|---|---|---|---|
| `rapidocr.ts` | 1.433 | Motor de producción: PP-OCRv4/v5 con onnxruntime-web; det (DB postprocess en JS puro: hull, minAreaRect, unclip), cls, rec (CTC decode), pre-warm, sonda v5, memo del det | 🔴 Tres responsabilidades (runtime ORT + algoritmo DB/rec + política router/sonda); ~1.000 líneas de matemática de det dignas de módulo propio |
| `router-ocr.ts` | 281 | Router puro de motor por tier + sonda de carga (castigo 7 días) + gobernador reactivo | ✅ Resolutor puro testeable; localStorage aislado |
| `tesseract-ocr.ts` | 194 | Tesseract.js v5 spa-best psm4 real (solo por override), mismo contrato de salida que RapidOCR | ✅ Contrato unificado con RapidOCR |

**Observabilidad (`lib/e14/obs/`, 1.417 líneas, 9 archivos):** `dispositivo.ts` (259, tier §4.4 + muestreo salud), `tipos.ts` (235, contratos), `captura.ts` (217, onerror/unhandledrejection + ErrorBoundary + perf), `buffer.ts` (216, IDB circular 500/TTL 30d), `politica.ts` (182, política de datos + modo dev + overrides), `identidad.ts` (95, UUID + FNV-1a8), `digest.ts` (87, agrupación de errores), `breadcrumbs.ts` (76, ring 30), `operacion.ts` (50, marca de operación activa). ✅ Módulo consistente: try/catch total, PII cero, `null` honesto.

**Store + logger:** `store/store-e14.ts` (282, Zustand adaptador de 5 puntos para masiva→supervision), `lib/logger.ts` (118, info/debug solo-dev, warn/error siempre + transporte obs).

---

## 2. Pipeline de digitalización explicado

```
ENTRADAS: File (ARCHIVO / foto cámara) | grab <video> (CÁMARA) | asset (SIMULACIÓN)
                    │
                    ▼
[escanearActa]  timeout global (opciones.timeoutMs ?? 120s) → resuelve Acta RECHAZADA ILEGIBLE
   │             (e67: rescate tardío vía onRescateTardio si el pipeline vivo termina después)
   ▼
1) DECODE  fileToCaptureDataUrl memoizado por File (WeakMap, prefetch de masiva pega aquí)
   │  └─ EN PARALELO: capa-0 QR de cámara (decodificarQrDeCapture, tiers base ~0.5s) — señal ADITIVA
   ▼
2) DETECT  detectDocumentEdgesDetail (worker OpenCV; fallback Sobel; reintento ×1 tras warm-up 5s)
   │  · escaneo (origenActa="escaneo") o sinRecorte (SIM) → QUAD_IDENTITY, detección OMITIDA
   ▼
3) WARP×2 (Promise.all) processImage(quad,"bw") + processImage(quad,"original").catch(null)
   │  · bw = imagen para mostrar/guardar · "original" = ENTRADA del OCR (PROD-1; fallback bw)
   ▼
4) ORIENTACIÓN  (guard: !SIM, !sinRecorte; en masiva la brújula se omite — deskew D63-B la cubre)
   │  a) brújula QR (flag qrBrujulaOrientacion): jsQR@warp → rescate ZXing hi-res por cuadrante
   │  b) si no decidió: probe OCR (miniatura 320px → fallo seguro → resolución completa;
   │     modo "confirmar" si origenSenales="exif-camara") → rotarDataUrl(fotoOcr, fotoProcesada)
   ▼
5) VERIFICACIONES (varias en vuelo/serie)
   · esquinas fiduciales (integridad) → ladoEsquinaFaltante
   · verificarCompletitud (geometría sospecha → tinta al filo condena; escudo fondo ≥85%)
   · procesadaVaciaDataUrl (visor nunca vacío)
   ▼
6) CALIDAD  calidadDeActa: recorta bbox del quad (+3%, cap 2000px) → evaluateQuality del core
   │         + señales hi-res (sharpnessHi mediana Laplaciano 9 tiles, contrastPapel p95-p5)
   ▼
7) OCR ESCALONADO  pasada-1 det cap 1280 → senalDeLectura débil? → pasada-2 det 1920 →
   │                elegirMejor (anclas de ANCLAS_LECTURA, luego conf). Motor:
   │                router-ocr decide v4 | v5(sonda de carga) | tesseract-spa-best (override)
   ▼
8) BANDA DIRIGIDA  si tipoDeBanda(texto)==null → recorta franja (22-88%×3-13%), invierte, ×2, re-OCR
   ▼
9) CLASIFICACIÓN  clasificarCabecera(texto, cargarDivipol()) → dep/mun/zon/puesto/mesa/tipo/pag/kit
   │              + avisos (BANDA_CODIGO_DISCREPAN, MESA_POR_KIT, …) + clasifDebil (balde fino)
   ▼
10) SCORE + GATE
    senalDeLectura → pisoPerfecto(4 condiciones) → scoreDeCalidad (techos fair 7.9 / poor 6.4 /
    sin-señal 4.9) → piso FUERTE 8.5 / techo DEBIL 5.9 (C3) → inyección SIM → escudo-fondo 7.9 →
    recortada 7.9 → gate: !completa → INCOMPLETA · !marcadoresOk → SIN_VOTOS · evaluarGate(score)
    → rechazoFinal: sin señal de contenido ⇒ tipo "BAJO" (D3)
    (caps de score coherentes: incompleta/sin-votos ⇒ ≤6.4)
    ▼
11) SALIDA  construirDiagnostico + log auditoría `[e14] pipeline …` (solo dev) +
    construirActa (+ qrCam si cámara) + emitirPerfDeActa (lazy, FNV-1a del id)
    → store: OPTIMA → envío automático · ADVERTENCIA → confirmar · RECHAZADA → repetir/intento
    · EN_REVISION_HUMANA (SUGERIDA/MANUAL o contingencia C4 al agotar intentos)

RUTAS SECUNDARIAS: recortar() → pipelineRecorte (mismo gate completo, timeout 30s, escudo-manual
Q2, quad al píxel sin refine) · mejorarResolucion() → re-detecta quad sobre foto nueva →
pipelineRecorte · revelar() → solo processImage · reconocerTexto() → re-OCR del editor.
```

**Entidades**: `Acta` (types.ts:223) con `status`/`score`/`rechazo`/`clasificacion`/`diagnostico`/`qrPayload`; `ClasificacionE14` (clasificador.ts:32); `DiagnosticoActa` (types.ts:66) — el "por qué no se envió"; `PlanGama` (gama.ts:112); `FlagsApp` (obs/tipos.ts:123).

**Invariantes clave** (bien mantenidos en el código):
1. `statusDeScore`: ≥8 OPTIMA · ≥6.5 ADVERTENCIA · <6.5 RECHAZADA (types.ts:360) — los caps de score dejan SIEMPRE coherente score↔status (bridge L1759, L1762).
2. RECHAZADA ⇒ clasificación descartada (evaluarGate devuelve `clasificacion: null`; también en el timeout del recorte — fix auditoría 2-a #8, bridge L2053).
3. "El OCR manda": la lectura FUERTE sube el score (piso 8.5) pero nunca vence a poor ni a los caps de contenido (incompleta/sin-votos).
4. El QR/identidad es señal ADITIVA: jamás afecta score/gate/OCR (red line 10 — payload opaco).
5. `null` honesto: sin medición no se condena ni se inventa (página desconocida, esquinas n/d, orientacionProbe ausente).
6. SIM: probe/banda/completitud OMITIDOS, chips 8.2/7.0/4.3 intactos por construcción.

---

## 3. Lo que está BIEN

1. **Arquitectura del gate**: la separación `evaluarGate` (criterio) vs vetos externos (INCOMPLETA/SIN_VOTOS/BAJO fuera del gate, con "reasons" documentados) es limpia y estable; los caps y el orden de aplicación están expuestos en `techosDiag` (bridge L1802-1817) — observabilidad del desenlace de primera clase.
2. **`clasificador.ts`**: fuzzy sin dependencias (trigramas+Dice), índice invertido de puestos con costo cero en capturas resueltas (L341-369), guard de consistencia del rescate global (el rescate jamás contradice la cascada por códigos, L840-845), aviso en vez de invención en TODA discrepancia. La regla "cada ajuste lleva `// Fuente:` con el OCR real" es una disciplina excelente.
3. **Falsos-positivos curados con evidencia**: cada kit documenta el caso real (NESA, CALRO, «/»→7, 9→0, filo al 0.988…). La trazabilidad evidencia→regla→umbral es ejemplar y hace auditable el sistema.
4. **Performance bien pensada**: LRU de decodes tope 2 + dedup en vuelo (image-utils.ts:80-160), memo del det por identidad dataURL+cap (rapidocr.ts:1022-1054), memo del det-postprobe (D62), `rec-wmax480` con kill-switch, mini-probe de orientación con fallo seguro que garantiza paridad con el camino original, `conRampa` con autolímite del timer (fix auditoría 2-a #7).
5. **Robustez**: TODO el paquete respeta "jamás lanza" en rutas accesorias (obs, gama, orientación, brújula, banda, marco): 94 catch silenciosos son en su mayoría deliberados y comentados. Timeouts en todo lo que puede colgar (120s global, 30s recorte, 5s worker, 12s probe, 8/30s sonda, 20s tesseract-init).
6. **Multi-motor con contrato único** (tesseract-ocr.ts devuelve `RapidOcrResultado`): el pipeline no sabe qué motor corre; el router es puro + sonda de carga real + gobernador reactivo + castigo con ventana; la honestidad "decisión vs modelos reales" en el informe evita maquillaje.
7. **D6-safe consistente**: kill-switch por feature, doble whitelist documentada, override manual del dueño manda (gama.ts:456 "la mano del dueño MANDA"), `__reset*ParaTest` para tests.
8. **obs/**: buffer IDB propio (no comparte DB con la cola), retención pura testeada (`mantenimientoBuffer`), anti-recursión del rastreo, hash FNV-1a del actaId (jamás id plano), privacidad dura (breadcrumbs sin contenido).
9. **Zero `any`** en ~12.100 líneas de la zona; el tipado de ORT mínimo está aislado con cast único y documentado.

---

## 4. Deudas y problemas

### 🔴 Críticos

1. **`scanner-core-bridge.ts` es un monolito de 2.868 líneas con DOS pipelines gemelos.** `pipeline()` (L1134-1985, ~850 líneas) y `pipelineRecorte()` (L2119-2612, ~500 líneas) duplican PASO A PASO: banda dirigida (L1556-1560 ≈ L2258-2262), clasificación+faltaSección+lazo+recortada (L1583-1585 ≈ L2322-2324), bloque C3 piso/techo (L1626-1630 ≈ L2367-2371), escudo-fondo/recortada (L1715-1724 ≈ L2374-2390), construcción del gate INCOMPLETA/SIN_VOTOS (L1725-1758 ≈ L2391-2416), `rechazoFinal` BAJO (L1770-1772 ≈ L2419-2421), `techosDiag` (L1802-1817 ≈ L2441-2461), `construirDiagnostico` completo (L1820-1886 ≈ L2464-2527), el log de auditoría gigante (L1899-1929 ≈ L2540-2562) y el bloque de `actaActualizada`. Riesgo real: los comentarios ya deben decir "mismo criterio en AMBOS pipelines (pitfall §9.9)" 10+ veces — es la señal de que la duplicación ya obliga a sincronizar a mano. Un fix aplicado a un lado y no al otro cambia desenlaces de forma silenciosa (ya ocurrió una vez: el rev.1 del gate F0.2 tenía polaridad invertida, L1008-1013).
2. **`rapidocr.ts` mezcla 3 capas**: (a) la matemática del postprocess DB en JS puro (hull/minAreaRect/boxScore/unclip/CCL — L692-1170, ~500 líneas reutilizables y testeables headless), (b) el runtime ORT (init/sesiones/soltar/prewarm/proxy/threads) y (c) la política del router (sonda v5, `motorElegidoActual`, `motorOcrVivo`). Los mutables de módulo (`motorModelosActual`, `motorElegidoActual`, `motorOcrVivo`, `rtSingleton`, `reconocimientosEnVuelo`) forman una máquina de estados invisible a los 5 importadores.
3. **Pre-warm de OCR al importar el módulo (rapidocr.ts:1433)**: `if (typeof window !== "undefined") void rapidOcrInit().catch(() => {})`. La cadena de imports es estática: `MasivaView → masiva/store → get-bridge → scanner-core-bridge → ./ocr/rapidocr`. Solo con ABRIR la página MASIVA se disparan: import de onnxruntime-web + descarga ORT wasm (~14 MB en /vendor) + det/cls/rec/dict (~16 MB) + creación de sesiones + worker proxy — antes de que el dueño pida escanear una sola acta. En gama baja con red móvil esto compite con la propia UI y contradice el espíritu "descarga v5 al primer uso en wifi" del router (para v4/v5 no hay gating de red ni de acción de usuario). Es decisión documentada (kit PROD-2 §4.1-C5) pero hoy es cuesta arriba: la única vía de excusa es `ocrMotorAdaptativo=false`, que no evita la init de v4.

### 🟡 Medios

4. **`OpcionesEscaneo` incompleto para lo que el bridge necesita**: `timeoutMs`, `onRescateTardio`, `desdeMasiva` viven en una intersección local `OpcionesEscaneoConTimeout` (bridge L903-931) porque "el kit §1 prohíbe tocar bridge.ts". Consecuencia: casts `(opciones as OpcionesEscaneoConTimeout).timeoutMs/desdeMasiva` (L1424, L1539) y DOS banderas para el mismo concepto (`esMasiva = opciones.origenActa != null` en L1173 vs `(opciones as …).desdeMasiva` en L1424) — dos fuentes de verdad para "vengo de masiva".
5. **Doble whitelist de flags** (flags.ts:113-156 `sanearFlags` y obs/politica.ts:109-173 `leerOverridesFlags`): cada flag nuevo exige tocar dos listas en dos archivos ("cada puerta su línea" — el propio código lo confiesa). 16 claves × 2 whitelists ya; un olvido = override del dueño descartado en silencio.
6. **Clasificador monolítico**: `clasificarCabecera` (L484-1063, ~580 líneas) anida cascada + rescate + arbitraje con variables mutables (`depResuelto`, `puestoPorCodigo`, `capLugarAplicado`, `avisos[]`). Es testeable solo de punta a punta; los umbrales (0.82/0.6/0.55/gap 0.05) están calibrados con evidencia pero la lógica de arbitraje pie↔código↔registro (L906-944) merece función pura propia.
7. **Luma inconsistente entre módulos**: BT.601 (0.299/0.587/0.114) en scanner-core-bridge `senalHiResDeCanvas` (L533), `motorTinta` (completitud.ts:194), `procesadaVaciaDataUrl` (image-utils.ts:254), `marco-escaneo.ts:90` y `canvasQrEnh` (orientacion-qr.ts:160, variante `>>8`); **BT.709** (0.2126/0.7152/0.0722) en `integridad.ts:82`. Dos definiciones de "tinta" en un mismo pipeline: un umbral calibrado contra una fórmula no traslada a la otra.
8. **Geometría del formulario E-14 dispersa**: zona de votos (0.06/0.94/0.45/0.95, marcadores.ts:39-42), banda del sello (0.22/0.03/0.88/0.13, bridge `ocrBanda` L849-852), regiones de fiduciales (integridad.ts:104-108), inset/region del marco (marco-escaneo.ts:63-76), rotación por cuadrante (orientacion-qr.ts:92-97). No existe un `geometria-e14.ts` único; un cambio de diagramación del formulario toca 5 archivos.
9. **Logger `info` = no-op en producción** (logger.ts:105-107): TODAS las trazas de auditoría del pipeline (`[e14] pipeline…`, `[e14] orientacion…`, `[e14] ocr-escalonado…`, `[ocr-router]…`) desaparecen en el bundle servido. Los "instrumentos del dueño" que parsean por prefijo solo funcionan en dev; en campo el diagnóstico vivo depende exclusivamente de `acta.diagnostico` + informe de corrida. Es coherente con la política declarada, pero la fricción es alta para depurar una corrida remota.
10. **Lógica QR duplicada en 3 sitios**: orientacion-qr.ts re-porta del bench `canvasQrEnh`/`escalaCanvas`/`zxLee`/`jsQrDe`/`cropParal`/`canvasQrAlta` (L145-488) que conviven con la cadena de `masiva/identidad-qr.ts` (`decodificarQrDeCapture`, `barridoQrZxingDePixeles`, ladders en qr-pixeles). Además `núcleo→masiva`: orientacion-qr y el bridge importan de `./masiva/identidad-qr` (L69, L1178) — la dependencia de capa va al revés (núcleo → submódulo masiva).
11. **`clasificarCabecera` recorre la base completa para la regla 3 y la verificación** sin índice (L678-699): O(deps×muns) por acta; con la base completa en memoria (0,63 MB) no es grave, pero el índice de trigramas ya existe para el rescate 4b — la regla 3 podría reutilizarlo.
12. **Algunos catch silenciosos sin log** en sitios donde la evidencia ayudaría: `construirDiagnostico` → `diag = null` (bridge L1883-1885, L2524-2526), `calidadDeActa` catch → fallback (L675), `decodeArchivoMemo` fallo fuera de la traza. El patrón "jamás lanza" está bien, pero un `logger.debug/warn` puntual convertiría una imagen en blanco en un diagnóstico de campo.
13. **`dhash`/`vendor` asumidos**: `npm ls` muestra `tesseract.js 5.1.1` (la API `blocks` usada es de v5 — correcto), pero `zxing-wasm 3.1.6` y `onnxruntime-web 1.30.0` se cargan con paths vendorizados a `/public` — si la versión del paquete y el wasm de `/public/vendor` se desincronizan, falla en runtime (no hay check de versión). Riesgo de mantenimiento del "vendoring manual".

### 🟢 Leves

14. `dosDigitos` duplicado (bridge.ts:123 y scanner-core-bridge.ts:377); `horaEnvio`/`horaHistorial` implementadas DOS veces: `CompositeBridge` las calcula sin delegar (bridge.ts:200-210) y `RealCoreBridge` tiene copias muertas (L2859-2867) — código muerto dentro del bridge real.
15. `TRUNCA_MENSAJE/TRUNCA_STACK` duplicados (captura.ts:23-24 y logger.ts:54-55) con el mismo comentario de contrato.
16. Tres regex de MESA distintas: `ANCLA_MESA` `[MN]ESA` (clasificador.ts:172), `MESA[::\s.]*\d+` en `ANCLAS_LECTURA` (senal-lectura.ts:50) y en `ocr-escalonado.ts:48` — tres formas de leer el mismo ancla, con tolerancias distintas.
17. `store-e14.ts:173` usa `console.warn` directo (único `console.*` de la zona fuera del logger) — inconsistencia menor.
18. `contadosNoEnvio` Set a nivel de módulo (store-e14.ts:77) crece sin tope en sesiones muy largas (memoria trivial, pero es el único acumulador sin límite de la zona).
19. `pipelineRecorte` aplica banda OCR dirigida sin guard SIM (bridge L2258: `if (tipoDeBanda(texto) === null)`) mientras `pipeline()` tiene `!opciones.simular` (L1556) — asimetría inocua hoy (el store no permite recortar SIM), pero invisible si cambia el guard.
20. `contarMotivoNoEnvioActa` usa `techos[0]` como "el techo" (store-e14.ts:216) — el primer elemento no siempre es el decisivo (el orden es el de aplicación).
21. `comentar` sin efecto: `interface ParcialPipeline.qrCam` mezcla tres estados (undefined/null/payload) con semántica documentada pero frágil para lectores nuevos (bridge L1022-1031).
22. `flags.ts:195-201`: hack de `unref` sobre un timer de `window.setTimeout` (tipado DOM no lo trae) — funciona por cast, pero es ruido.
23. El `v5EnCastigo`/`infoCastigoV5` leen localStorage en cada resolución del router — barato, pero sin caché; y `ejecutarSondaCarga` crea sesiones v5 completas (~487 MB pico) antes de decidir soltarlas (mitigado con `soltarRuntime` en el abandono, L327-339 — bien resuelto).

---

## 5. Duplicados y reutilización

| Duplicado | Sitios | Nota |
|---|---|---|
| **Pipelines gemelos** (banda, C3, caps, gate, diag, log) | `pipeline()` L1134-1985 vs `pipelineRecorte()` L2119-2612 | ~600-700 líneas clonadas; los comentarios "mismo criterio en AMBOS (pitfall §9.9)" aparecen ≥10 veces |
| **Luma (gris)** | bridge L533 · completitud.ts:194 · image-utils.ts:254 · marco-escaneo.ts:90 · orientacion-qr.ts:160 (+ integridad.ts:82 con BT.709) | 5× BT.601 + 1× BT.709; extraer `luma(r,g,b)` y unificar fórmula |
| **Doble whitelist de flags** | flags.ts:113-156 ↔ obs/politica.ts:109-173 | 16 claves duplicadas; candidata a tabla única `WHITELIST` compartida |
| **Constantes de geometría E-14** | marcadores.ts:39-45 · bridge `ocrBanda` L849-852 · integridad.ts:104-112 · marco-escaneo.ts:55-76 · orientacion-qr.ts:92-97 | Sin módulo único de geometría del formulario |
| **Ancla MESA** | clasificador.ts:172 · senal-lectura.ts:50,81 · ocr-escalonado.ts:48 | 3 regex con tolerancias distintas (una perdona M→N, otras no) |
| **Utilidades QR/imagen del bench** | orientacion-qr.ts (canvasQrEnh, escalaCanvas, zxLee, jsQrDe, cropParal) ↔ masiva/identidad-qr.ts + qr-pixeles.ts | Dos ensamblados de decode QR vivos; el "port verbatim" fue deliberado pero ya hay dos fuentes |
| **TRUNCA 500/2000** | captura.ts:23-24 ↔ logger.ts:54-55 | Constantes del mismo contrato |
| **dosDigitos + horas** | bridge.ts:123,200-210 ↔ scanner-core-bridge.ts:377,2859-2867 | Segunda copia muerta |
| **Gobernador reactivo (patrón)** | gama.ts:270-308 (reportarPresionGama) ↔ router-ocr.ts:251-276 (reportarPresionMotor) | Mismo patrón implementado dos veces (ventana/umbral/distinto dominio — aceptable, pero merece helper común) |
| **Timeout-resuelve-RECHAZADA** | escanearActa L1082-1130 ↔ recortar L2030-2069 | Patrón Promise+timer+parcial repetido (apenas ~40 líneas; tolerable) |

**Reutilización bien lograda** (no duplicar): `motorTinta` (completitud) usado por marcadores; `senalDeLectura`/`ANCLAS_LECTURA` compartidos por orientación/ocr-escalonado/bridge; `loadImageMemo`/`canvasCon`/`decodeImagenLru` en todo el pipeline; `sondeoDe` único para mini/full; `tipoDeBanda` extraída y compartida banda/bridge; contrato `RapidOcrResultado` compartido por Tesseract.

---

## 6. Guía de lectura para el programador nuevo (orden del pipeline)

1. `types.ts` — el dominio (Acta, status, DiagnosticoActa) y `statusDeScore`.
2. `bridge.ts` + `get-bridge.ts` — el contrato y el punto de intercambio.
3. `image-utils.ts` — LRU/factory/tinta (lo que todo el pipeline usa).
4. `scanner-core-bridge.ts` **por bloques, no lineal**: L1-450 (comentarios de kits + helpers de score), luego `pipeline()` L1134-1985, luego los helpers que invoque (calidadDeActa L639, reconocerRapidOcrEscalonado L782, evaluarGate L2629, construirActa L2743). Al final `pipelineRecorte()` L2119-2612 leyéndolo como "el mismo pipeline sin decode/detección".
5. `clasificador.ts` — la traducción de texto OCR a ruta DIVIPOL (con los comentarios `// Fuente:`).
6. `orientacion.ts` → `orientacion-qr.ts` — las dos brújulas (OCR-probe y QR) y su integración en el paso 4 del pipeline.
7. `ocr/rapidocr.ts` (después de entender el contrato `RapidOcrResultado`) → `ocr/router-ocr.ts` → `ocr/tesseract-ocr.ts`.
8. `completitud.ts` → `marcadores.ts` → `integridad.ts` → `marco-escaneo.ts` — los gates de tinta/geometría.
9. `senal-lectura.ts` + `ocr-escalonado.ts` — el "el OCR manda".
10. `gama.ts` + `flags.ts` + `obs/**` — presupuesto adaptativo y telemetría.
11. `store/store-e14.ts` — la costura con supervision (5 puntos).
12. Contexto imprescindible en docs: `ESTRATEGIA-ocr-router-v1.md` (fases 1-5b) y las decisiones D30/D34-D44/D57/D63-D74 de `DECISIONS.md`.

---

## 7. Recomendaciones de reorganización

**Cómo partir `scanner-core-bridge.ts` (2.868 líneas)** — objetivo: ninguna unidad >600 líneas, pipelines gemelos re-unificados:

| Paso | Qué | Dónde va | Esfuerzo | Riesgo |
|---|---|---|---|---|
| M1 | Helpers de imagen/medición ya puros (`senalHiResDeCanvas`, `bboxActaEnPx`, `calidadDeActa`, `esquinasDeActa`, `InfoCrop`) | `lib/e14/calidad.ts` (~450 líneas) | S | Bajo — son funciones libres sin estado de módulo |
| M2 | `reconocerRapidOcrEscalonado` + tipos (`OcrEscalonadoSalida`, `PasadaEscalonada`) + `ocrBanda` + `reconocerRapidOcr` | `lib/e14/ocr/escalonado-runner.ts` (~200 líneas) | S | Bajo |
| M3 | **Extraer el gate completo a función pura compartida**: `resolverDesenlace({calidad, senal, senalActa, faltaSeccion, lazoPerdonado, verificacion, marcoEscaneo, marcadores, clasificacion, simular/scoreSimulado, intento/maxIntentos, manual}) → {score, status, rechazo, techosDiag, clasif}` — UNA implementación para ambos pipelines | `lib/e14/gate.ts` | **M** | **Medio** — es el cambio que mata la duplicación crítica (M1/M2 son mudanzas; este es el de verdad). Requiere golden-test con los desenlaces documentados (chips SIM 8.2/7.0/4.3, tabla §2 de guard-borde, tabla §3-A de e63d) |
| M4 | Construcción de log de auditoría + `construirDiagnostico`-merge (los dos bloques de 40-90 líneas) | helper `auditoria.ts` | S | Bajo (formato de línea: congelado — solo AÑADIR) |
| M5 | `construirActa`, `firmasPorStatus`, `capturarFrame`, actas SIM (`ACTAS_SIM`, `fetchActaSim*`) | `lib/e14/acta-factory.ts` + `sim-assets.ts` | S | Bajo |
| M6 | Queda en `scanner-core-bridge.ts`: `RealCoreBridge` con `pipeline()` y `pipelineRecorte()` llamando a `resolverDesenlace` (~500-600 líneas cada uno, o un solo `pipelineComun(opcionesComunes)` si se quiere el paso final) | — | M | Medio |

**Otros:**

- **R1 (M, riesgo medio): unificar `OpcionesEscaneo`** — mover `timeoutMs`/`onRescateTardio`/`desdeMasiva` a `bridge.ts` (el kit que lo prohibió ya se consumió; hoy el costo son los casts y las dos banderas de "masiva"). Reemplazar `desdeMasiva` + `origenActa!=null` por una sola señal.
- **R2 (S): tabla única de whitelist de flags** — objeto `WHITELIST_FLAGS: Record<keyof FlagsApp, (v:unknown)=>boolean>` consumido por `sanearFlags` y `leerOverridesFlags`; desaparece el doble mantenimiento y los "se descarta en silencio".
- **R3 (S): `geometria-e14.ts`** con ZONA_VOTOS, BANDA, FIDUCIALES, MARCO, ROT_POR_CUADRANTE + `luma()` único (BT.601; migrar integridad o documentar por qué 709).
- **R4 (S): partir `rapidocr.ts`** en `ocr/db-postprocess.ts` (hull/minAreaRect/boxScore/unclip/CCL — puro, testeable con bun), `ocr/ort-runtime.ts` (init/sesiones/prewarm/proxy/threads) y `ocr/rapidocr.ts` (orquestación det→cls→rec + contrato). `resolverModeloDeArranque` → `ocr/arranque-router.ts`.
- **R5 (S, alto valor): gating del pre-warm** — mover el `void rapidOcrInit()` de rapidocr.ts:1433 a un punto con intención: montar MASIVA/escáner (ya existe `rapidOcrPrecalentar()` llamado por MasivaView.tsx:767 y runner-watchdog) o `requestIdleCallback` + condición de red (`sincronizarSoloWifi`). Borrar el side-effect de import evita ~30 MB de descarga al visitar la página.
- **R6 (S):** borrar `RealCoreBridge.horaEnvio/horaHistorial` (muerto) y decidir delegación en `CompositeBridge`.
- **R7 (M):** extraer de `clasificarCabecera` los sub-pasos puros: `consensoCodigo1D`, `arbitrarKit(pie, codigo, registro)`, `resolverPuesto(...)` — cada uno testeable con la tabla de evidencia ya existente en comentarios.
- **R8 (S):** captura de telemetría en los catch críticos (diag=null, calidadDeActa fallback) vía `logger.debug` (no-op en prod, visible en dev) o evento obs "warn" de baja frecuencia.
- **R9 (S):** check de compatibilidad vendor↔paquete (p. ej. `ort.env.wasm.wasmPaths` + versión en un `assertVendorVersion()` que loguee una vez).

**Prioridad sugerida**: M3 (gate unificado) > R5 (pre-warm gating) > M1/M2/R4 (mudanzas de rapidocr) > R1/R2 > el resto.

---

## 8. Métricas rápidas

| Métrica | Valor |
|---|---|
| Líneas de la zona (e14 raíz + ocr + obs + store + logger) | **≈ 12.125** (8.400 + 1.908 + 1.417 + 282 + 118) |
| Archivo mayor | scanner-core-bridge.ts 2.868 (34% de la zona raíz) |
| `catch` totales / vacíos (silenciosos) | 127 / 94 (mayoría deliberados y comentados — política "jamás lanza") |
| `any` explícito | **0** (`as unknown as OrtModule` único y documentado) |
| `console.*` fuera del logger | 1 (store-e14.ts:173) |
| TODO/FIXME/HACK reales | **0** (coincidencias grep son prosa "todos/TODOS") |
| Duplicación mayor | pipeline↔pipelineRecorte ≈ 600-700 líneas; 2 whitelists; 5× luma (+1 BT.709); 3× regex MESA |
| Mutables de módulo (estado global) | ~15 (singletons: rtSingleton, workerProm, caches flags/gama/tier, contadores, memo maps — todos con tope o reset de test) |
| Kill-switches de flags (D6) | 16 claves en FlagsApp, todas con default "comportamiento de hoy" |
| Motores OCR vivos | 3 (RapidOCR v4, v5 sonda, Tesseract spa-best) + 2 lectores QR (jsQR, zxing-wasm) |
| Dependencias críticas de runtime | @jg-stevan/scanner-core ^0.4.0 · onnxruntime-web 1.30.0 · tesseract.js 5.1.1 · zxing-wasm 3.1.6 · zustand 5 |
| Assets del motor (public/) | modelos rapidocr ~16 MB · tesseract spa.traineddata.gz ~12 MB · ort wasm ~14 MB · opencv ~8.6 MB · zxing_reader.wasm |
| COOP/COEP | public/_headers (Cloudflare Pages) + Caddyfile → crossOriginIsolated → hilos WASM reales; next.config no los pone (export estático + _headers) |
| Tests observados en la zona | Funciones puras exportadas para QA (`marcoPerdonadoPorLectura`, `mantenimientoBuffer`, `__reset*ParaTest`); suite bun headless mencionada en comentarios (obs.test.ts, senal-lectura §6.2) — no hay tests dentro de la carpeta revisada |

---

### Veredicto general

Núcleo de calidad superior a la media: dominio modelado con honestidad de datos (`null` jamás inventado), decisiones calibradas con evidencia citada archivo:línea, robustez sistemática ("jamás lanza" + timeouts + fallbacks), y una observabilidad del desenlace (DiagnosticoActa + techos + informe auto-identificado) poco común. La deuda NO es de diseño sino de **forma**: `scanner-core-bridge.ts` y `rapidocr.ts` concentran 4.300 líneas donde la duplicación entre pipelines gemelos ya obliga a sincronía manual, la geometría del formulario y las utilidades de imagen/QR están sembradas en 5+ archivos, y el pre-warm del OCR dispara ~30 MB de descargas al importar. Las extracciones propuestas (gate unificado M3, partición de rapidocr R4/M1-M2, gating del pre-warm R5, whitelist única R2) son mecánicas, de riesgo acotado y con golden-tests posibles con la evidencia ya documentada en los comentarios del propio repo.
