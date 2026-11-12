# Mediciones

Números reales observados durante el desarrollo. Sirven para **decidir**, no
como puerta de CI: el tiempo de pared varía 40–130 s según la carga de la
máquina y los benchmarks cortos de 5 s no son fiables. Cuando una medición fue
superada por otra, se indica.

Cómo se midió: Chrome/Edge de escritorio, builds estáticos servidos por
`scripts/serve-export.py`, corridas demo de 6 actas, telemetría del propio
pipeline (D34/D43–D45). Las mediciones nativas usan el sidecar Windows x64.

## 1. Motores OCR (corpus de 6 actas E-14)

| Motor | Precisión dígitos | Tiempo por acta | RAM pico | Descarga | Notas |
|---|---:|---:|---:|---:|---|
| Tesseract spa-best + PSM 4 | 94,4 % | 2,2 s | 62–67 MB | ~13,5 MB | Gama BAJA; en producción se mapea a PP-OCRv4. |
| PP-OCRv4 (base) | 94,4 % | ~2,2 s | ~67 MB | ~15,6 MB | Ruta histórica de MEDIO/BAJO. |
| PP-OCRv5 mobile latin | 100 % | 3,25 s | ~487 MB | +13 MB | Gama ALTA; 97,6 % solo en texto impreso. |
| Tesseract fast | 83,3 % | — | — | −11 MB | Descartado como default: −11 pts de dígitos. |

El OCR consume ~98 % del trabajo del pipeline; la miniatura cuesta ~3 ms y el
decode ~50 ms. El cuello es el reconocimiento, no la UI.

## 2. Modelos (descargados por `preparar` — no versionados desde D88)

Los modelos ya no van commiteados: `bun run preparar` los baja según
`scripts/assets.lock.json` (tessdata_fast 4.0.0 desde 2026-11-10 y RapidOCR
PP-OCRv4/v5 de modelscope). Cifras en disco tras `preparar`
(verificado 2026-11-12):

| Asset | Bytes | Uso |
|---|---:|---|
| `ch_PP-OCRv4_det_infer.onnx` | 4.745.517 | Detección v4 (paso 2 de la cascada). |
| `ch_PP-OCRv4_rec_infer.onnx` | 10.857.958 | Reconocimiento v4. |
| `ch_ppocr_mobile_v2.0_cls_infer.onnx` | 585.532 | Clasificador de orientación. |
| `det_v5_mobile.onnx` | 4.819.576 | Detección v5 (disponible; ya no es default de ALTO). |
| `rec_v5_latin.onnx` | 7.904.513 | Reconocimiento v5 latino (disponible; ya no es default de ALTO). |
| `spa.traineddata.gz` | 1.137.561 | Tesseract español 4.0.0_fast (2,29 MB descomprimido; intento 1 de la cascada). |
| `opencv-4.5.5-core.js` | 8.595.825 | Warp, deskew y rescate QR 4096. |
| `zxing_reader.wasm` | 946.860 | Decodificador QR principal en main. |
| `zbar.wasm` | 238.653 | Tier zoom complementario. |
| Núcleos Tesseract (SIMD + fallback) | ~8,0 MB | `public/vendor/tesseract/` (verificado 2026-11-12). |

Total `public/models/`: 28,7 MB. El wasm de `onnxruntime-web` (~69 MB) tampoco
se versiona: se materializa en `predev`/`prebuild` desde `node_modules`.

## 3. Cadena QR

Corpus de laboratorio: 7 imágenes con QR legible y 12 reales (6 fotos de
4000×3000 y 6 escaneos de ~1030×3400).

| Estrategia | Aciertos | Coste | Comentario |
|---|---:|---:|---|
| zxing full@1024 | 4/7 | 5,2 ms | Punto de partida. |
| zxing zoom@1024 (TL) | 6/7 | 6,1 ms | Mejor relación coste/cobertura. |
| zbar zoom@640 | 6/7 | 18 ms | Complementario: vio p2 y p4 que zxing no. |
| jsQR full@1024 | 5/7 | 71 ms | 14× más lento; solo worker capa 0. |
| band@1024 (recortar tras escalar) | 3/7 | 1,1 ms | Trampa: pierde QR fuera de la banda. |
| full@640 / band@640 | 0/7 | — | No usar. |

Cobertura: unión de estrategias 10/12 en laboratorio y 11/12 en cola real; el
único fallo era físicamente ilegible. El límite es **píxeles por módulo
(≥3–4)**, no la posición ni la nitidez.

Presupuesto en producción: sondeo temprano 2–3 ms cuando hereda payload; peor
caso sin QR 0,6–1 s extra con caché negativa; la cadena pesada sin QR puede
costar 15–17 s, por eso el worker y el presupuesto por gama (MEDIO 8 s,
BAJO 5 s).

## 4. Corridas end-to-end

| Escenario | Resultado | Tiempo | Estado |
|---|---|---:|---|
| Demo 6 actas, motor wasm | 6/6 ENVIADA AUTO, QR ✓, scores 10,0 / 8,5 / 10,0 | ~31 s/acta | Vigente (2026-11-04). |
| Corrida de campo e75 (MEDIO, 6 actas) | 6/6 enviadas, 0 duplicadas, score medio 9,52 | 146,8 s (~24,5 s/acta) | Histórica (2026-10-30). |
| Lote con sidecar nativo | ~100 s → 40–58 s | 6 actas | Histórica. |
| Build hosted sin sidecar | ~130 s | 6 actas | Penalización por intento fallido a loopback. |
| Sin los wasm grandes | 218 s y un acta rechazada | 6 actas | Por eso no se borran. |

Los presupuestos de QR dominaban la corrida cuando el acta no traía código:
18,9 s / 29,8 s / 6,7 s de `preOcr` en tres filas, 98,6 % atribuible a QR. El
techo de prefetch de 45 s (D79) hizo heredar el payload a las seis filas y bajó
el lote de 82 s a 53 s.

## 5. Gate y calidad

- Score de un acta real clasificada correctamente: **10,0**.
- Umbrales: ÓPTIMA `≥8`; ADVERTENCIA `6,5–7,9`; RECHAZADA `<6,5`.
- Veto `INCOMPLETA`: cap 6,4 y rechazo directo.
- Veto `SIN_VOTOS`: cap 6,4.
- Fondo, escudo manual o acta recortada: techo 7,9.
- Lectura débil: techo 5,9; lectura fuerte: piso 8,5 salvo calidad `poor`.

## 6. Datos y assets

| Dato | Valor actual |
|---|---|
| Catálogo exterior | 949 puestos · 67 países · 3.670 mesas |
| Catálogo maestro | 14.438 puestos (nunca importado) |
| Golden de KPIs | 949 = 233 COMPLETO + 218 CRÍTICO + 138 PENDIENTE + 360 NO_INICIADO |
| Actas reales versionadas | 0 — retiradas del árbol (D87); manifest metadata-only, purga de historial preparada (D90) |
| Fotos demo + simulación | 4 JPEG · 446.801 B (`acta-sim-*.jpg` — verificado 2026-11-12) |
| Repo versionado (sin `.git`) | 6,7 MB · 390 archivos (verificado 2026-11-12); los modelos ya no se versionan (D88): 28,7 MB de modelos + ~69 MB de wasm ort se bajan/materializan con `preparar` |

Las fotos se recomprimieron: demo a 2000 px q70, simulación a 1400 px q72 y
actas reales a WebP q75. La reducción fue de ~23,2 MB a ~3,3 MB (−86 %) sin
perder legibilidad para el OCR.

## 7. Export y despliegue

- `out/` histórico: 2,34 MB en disco / 1,25 MB gzip (antes de las fotos reales).
- Wasm de onnxruntime: jsep 28.312.028 B (27,0 MiB), asyncify 26.781.914 B
  (25,5 MiB), simd-threaded 14.239.897 B (13,6 MiB, nunca se parte).
- Partición con `--tamano-max=20`: 2 + 2 partes, verificadas byte a byte.
- Sidecar: EXE 239,5 MiB en `--onedir`, ZIP 108,4 MiB; `/salud` 5–15 s la
  primera vez y 4,5–6,3 s después.

## 8. Cómo volver a medir

```bash
bun run build
bun run scripts/cf-wasm-partes.mjs --dry-run   # confirma qué se parte
python scripts/serve-export.py                 # sirve out/ ensamblando partes
node scripts/bench-navegador.mjs               # tiempos por acta (JSON local)
```

Reglas de medición: no mezclar builds, no comparar corpus distintos como si
fueran el mismo, repetir 2–3 veces y anotar la carga de la máquina. Los JSON de
benchmark contienen texto OCR de actas reales y **no se versionan**.

## 9. Ventana §6.7 — orden por defecto de motores (en curso)

La cascada de lectura emite telemetría por acta desde el 2026-11-07
(`MetricaActa.lectura` → `lecturaResumen` del informe de corrida; el mismo
dato viaja en `PerfActa.lectura`). La ventana mide el **default vigente**:

- **Cierre**: ≥ 2 semanas **o** ≥ 500 actas aceptadas en el producto, lo que
  llegue primero.
- **Criterio de cambio**: **min ms/acta aceptada con falso-acepto = 0**. El
  falso-acepto se revisa a mano sobre una muestra mínima de 50 actas AUTO por
  motor; un solo falso-acepto descalifica al candidato.
- **margen**: un candidato solo reemplaza al default si mejora el
  `msPorActa` vigente en **≥ 15 %**.
- **Cómo se cambia**: solo por configuración (orden de motores = datos, los
  órdenes históricos viajan inyectados) y se registra en `docs/adr/README.md`
  (D86). Mientras no haya datos, el default **no se toca**.

Exportar el informe semanalmente y acumular los `lecturaResumen` sucesivos:
`MetricaActa` se poda por corrida (historial de 30), no es un archivo
histórico. SIM no emite telemetría; una corrida simulada no cuenta.

Detalle del protocolo (idéntico en los dos productos): `digielect14` →
`docs/MEDICION-6.7.md`.


## Matriz iOS/Android del tier (P-26, plan 2026-11-12)

La regla INFERIDA (sin `deviceMemory` ni `performance.memory` — iOS/Safari)
rescata ALTO con la SONDA GPU: `núcleos ≥ 6 ∧ (heap ≥ 2048 MB ∨ sonda ≥ 750)`.
El umbral 750 es el MISMO del benchmark del panel (favorable); el factor de
escala de `shared/dispositivo/sonda-gpu.ts` es PROVISIONAL hasta medir la
matriz de abajo (Q-56). La medición se hace en el panel PERFIL (benchmark
completo: CPU/memoria/raster) y con la sonda (raster puro, ~120 ms):

| Dispositivo | UA | deviceMemory | heap | benchmark panel | sonda GPU | tier antes | tier después |
|---|---|---|---|---|---|---|---|
| iPhone Safari (RAM holgada) | iOS ≥ 16 | — (null) | — (null) | _pendiente_ | _pendiente_ | MEDIO inferido | ALTO inferido si sonda ≥ 750 |
| iPhone Safari (RAM corta) | iOS ≤ 15 | — (null) | — (null) | _pendiente_ | _pendiente_ | MEDIO inferido | MEDIO (núcleos ≤ 4 en A-series viejas) |
| iPad Safari | iPadOS ≥ 17 | — (null) | — (null) | _pendiente_ | _pendiente_ | MEDIO inferido | _pendiente_ (esperado ALTO) |
| Android gama baja (A56) | Chrome | 2-4 | medible | _pendiente_ | — (regla exacta §4.4) | BAJO/MEDIO | SIN CAMBIO (memoriaGB real manda) |
| Android gama media (A13) | Chrome | 4-8 | medible | _pendiente_ | — | MEDIO/ALTO | SIN CAMBIO |
| Desktop Chrome | — | 8 | medible | _pendiente_ | — | ALTO | SIN CAMBIO |

Reglas fijadas por esta tarea (no requieren medición):
- La sonda SOLO participa en la rama INFERIDA (con deviceMemory real la regla
  §4.4 exacta manda — la sonda jamás escala un MEDIO con memoria medida).
- La sonda NUNCA baja el tier (solo rescata).
- La red ya no condena a mitad de sesión: P-23 congela `effectiveType`/wifi a
  la primera medición (el saveData del usuario sigue vivo).
- La descarga de modelos respeta `sincronizarSoloWifi` (precarga P-23 en el
  montar de MASIVA; difiere con techo 3 intentos · backoff 30 s).


## Monitor: ventana de filas (P-25, plan 2026-11-12) — medido

La regla del plan era MEDIR primero y virtualizar SIN paginar. Medición con
`next dev` + navegador headless (agent-browser/Chromium, catálogo del día
JUEVES = 116 puestos visibles; el catálogo completo de la jornada ≈ 949
puestos ≈ 14k componentes de fila):

| Métrica | ANTES (content-visibility) | DESPUÉS (ventana P-25) |
|---|---|---|
| `<tbody>` montados | 117 (con catálogo completo: ~949) | **25** (ventana ± margen + espaciadores) |
| `<tr>` montados | 119 (~949 con catálogo completo) | **25** |
| Nodos DOM en la tabla | 4.170 (~34k estimado con 949) | **885** |
| Scrollbar | altura real (CSS skip) | altura REAL (espaciadores con alturas reales de abiertos) |
| Criterio del plan: DOM < ~50 filas | ✗ (117/949) | **✓ (25 montadas)** |

Comportamiento verificado en navegador (headless):
- scroll profundo → la ventana sigue al scrollport (14-32 filas montadas según
  posición; 0 espaciador abajo al fondo, 1 arriba);
- expansión de puesto → el subdetalle mide su altura REAL vía ResizeObserver
  y los espaciadores la absorben (el scrollbar no salta);
- reorden por urgencia del ticker NO resetea el scroll del usuario (solo
  orden manual/filtro lo hace — posición inválida);
- accesibilidad R4-C7 intacta: fila semántica `<tr>`, botón de expansión con
  aria-expanded/aria-controls, espaciadores `aria-hidden` + `role="presentation"`.

Pendiente de campo (Q-56): FPS y render-time en gama baja real (A13/A56) con
el catálogo COMPLETO — la ventana ya cumple el criterio DOM, el número de FPS
se añade aquí cuando se corra la matriz de dispositivos.
