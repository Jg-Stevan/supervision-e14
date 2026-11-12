# Notas de OCR y QR

Dos problemas distintos: **leer el texto** del acta (OCR) y **encontrar su
código** (QR). Aquí está el estado final de ambos, los flags que los controlan y
lo que ya se probó y no debe reintentarse sin una razón nueva.

## 1. OCR: la cascada fija (el router murió)

El «router OCR» — elección de motor por gama con sondas de CPU, sonda de carga,
gobernador y castigos (`ocrMotorAdaptativo`, `ocrMotor`) — fue retirado: la
decisión del mantenedor 2026-11-11 fijó **una cascada única para todos los tiers**
(flag `ocrCascada`, default ON; ver `lib/e14/flags.ts` y
`docs/MEDICIONES.md` §9 para el protocolo que regula el orden de motores).
El orden es dato, no código: los órdenes históricos viajan inyectados en la
telemetría de lectura.

### 1.1 Cascada vigente

1. **Tesseract `fast`** — `spa.traineddata.gz` 4.0.0_fast
   (`public/models/tesseract/4.0.0_fast/`), intento 1, el más barato.
2. **Gate de producción** (`clasificarCabecera` + divipol): si cierra con AUTO,
   la lectura termina ahí.
3. **RapidOCR PP-OCRv4 escalonado** 1280 → 1920 → ROI si el gate no cerró.

Kill-switch: `ocrCascada: false` vuelve al escalonado RapidOCR de siempre,
byte a byte. SIM nunca corre la cascada.

### 1.2 Motores disponibles

| Motor | Modelo(s) | Dónde | Papel hoy |
|---|---|---|---|
| Tesseract fast | `spa.traineddata.gz` (4.0.0_fast) + núcleos | `public/models/tesseract/`, `public/vendor/tesseract/` | Intento 1 de la cascada. |
| PP-OCRv4 (base) | `ch_PP-OCRv4_det/rec`, `cls` | `public/models/rapidocr/` | Paso 2 de la cascada (escalonado). |
| PP-OCRv5 mobile latin | `det_v5_mobile`, `rec_v5_latin`, `latin_dict` | ídem | Descargado y disponible; ya no es default de ALTO. |
| Sidecar nativo | OCR en Python | `127.0.0.1:8765` | Si el usuario lo instala. |

Los modelos se bajan con `bun run preparar` (`scripts/assets.lock.json`) y se
cargan de forma perezosa en `ocr/rapidocr.ts` con `onnxruntime-web/wasm`;
`wasmPaths` apunta a `/vendor/onnxruntime/`, que se materializa en el build.
El reconocimiento usa altura 48 y ancho máximo 480, con post-proceso DB en JS.

### 1.3 Flags relevantes

| Flag | Default | Efecto |
|---|---|---|
| `ocrCascada` | ON | La cascada Tesseract fast → gate → RapidOCR v4; `false` = escalonado v4 byte-idéntico. |
| `ocrEp` | `auto` | WebGPU vs WASM (execution provider). |
| `ocrNativoUrl` | `null` | URL local del sidecar (`http://127.0.0.1:8765`). |
| `actaNativa` | OFF | Envía el acta completa al sidecar. |
| `ocrCls` | ON | Clasificador de 180° por línea. |
| `ocrColaGlobal` | ON | Un turno por corrida ORT; hace seguro el pool 2. |
| `autoEnvioUmbral` | `optima` | `advertencia` extiende el autoenvío. |

### 1.4 Escalado de lectura

El OCR escalonado usa detección a 1280 y una segunda pasada a 1920 cuando la
lectura es débil. La señal de lectura alimenta el gate: fuerte sube, débil
techa. Un acta nunca se envía por "parecer" legible; el nivel de lectura y la
calidad física son señales separadas.

## 2. Cadena QR

Orden real de ejecución (de más barato a más caro):

1. **Sondeo temprano** — corre en paralelo a la ingesta; si lee, el payload se
   hereda (`qrPrevio`) y las capas siguientes no re-decodifican.
2. **Capa 0 en worker (jsQR)** — canvas ≤2048 (BAJO 1600), presupuesto de pared
   MEDIO 8 s / BAJO 5 s, guard por rotación y por cuadrante. No congela la UI.
3. **zxing-wasm en main** — `full@1024` GlobalHistogram → LocalAverage; solo QR,
   sin tryHarder/rotate/invert. Es el mejor compromiso coste/cobertura.
4. **Tier zoom TL + zbar** — recorta el original (50 % × 30 %) sin upscalear,
   prueba zxing y luego zbar en zoom@1024 y zoom@640.
5. **Rescate 4096 con OpenCV** — warp + unsharp, última instancia.

Por qué conviven todos: jsQR es el único seguro dentro del worker; zxing lee
actas rotadas que jsQR pierde; zbar es **complementario** (vio QR que zxing no
en zoom); OpenCV cubre el residuo extremo y además hace warp/deskew.

### 2.1 Caché negativa

Llave SHA-256 de los bytes; Map de sesión FIFO de 500 entradas más traza
persistente. Nunca cachea `null` por timeout o excepción; `PROCESAR IGUAL`
(`forzarDedupOff`) no consulta ni escribe. Un hit cuesta 2–3 ms.

### 2.2 Flags relevantes

| Flag | Default | Efecto |
|---|---|---|
| `capa0QrWorker` | ON | Capa 0 en worker. |
| `qrZoomTl` | ON | Tier zoom TL + zbar. |
| `qrPrevioRapido` | ON | Hereda el payload del sondeo. |
| `qrCapa0PostPrevioCorta` | ON | Tras un previo vacío, evita la cadena larga. |
| `qrCacheNegativa` | ON | Cachea "esta imagen no tiene QR". |
| `sondeoQrPrecoz` | ON | Sondeo al ingerir, no al procesar. |
| `prescanQrPresupuestoMs` | — | Presupuesto del prescan (1000–30 000 ms). |
| `prescanWarpLado` | — | Lado del warp del prescan (256–4032). |
| `procesoLadoMayor` | 1920 | Lado mayor del warp del lote (1024–4032). |

### 2.3 Regla de oro

El worker de capa 0 es **jsQR-only**: no importes `zxing-wasm` ahí. Duplica el
decodificador que el hilo principal ya paga e infla el grafo del worker. El
fallback zxing vive en main.

## 3. Experimentos descartados

No los reintentes sin una medición nueva que cambie la premisa:

- **Tesseract fast como default:** ahorra 11 MB pero pierde 11 puntos de dígitos.
- **EasyOCR:** 2,2 GB de dependencias y 10,4 s por acta.
- **docTR:** no existe en web; como servicio exigiría ~1 GB de RAM en tablets.
- **VLM cloud como lector principal:** PP-OCRv5 offline ya gana en texto impreso; queda solo como verificador de campos manuscritos.
- **Cuantización int8:** ahorra disco/descarga, **no RAM** (la dominan los buffers del detector) y pierde ~1 campo.
- **Recorte `band`:** 1,1 ms pero 3/7 aciertos; pierde QR fuera de la banda.
- **`full@640` / `band@640`:** 0/7 en los tres decodificadores.
- **Escalar la tira completa a 1600/2400/4000:** no arregla escaneos ilegibles; el downscale del frame era el problema.
- **jsQR como decoder rápido en main:** acierta 5/7 pero cuesta 71 ms (14× zxing).
- **zxing-wasm dentro del worker:** viola la red line de capa 0.
- **Crop con `<img>` + canvas:** 0,11 % de píxeles distintos basta para perder el QR; usar `createImageBitmap` + `OffscreenCanvas`.
- **Techo global de intentos jsQR:** corta la cobertura de esquinas; usar guard por cuadrante.
- **WebGPU/shaders, OCR paralelo sin `SharedArrayBuffer`, cambiar el master 4032 o reescribir el core:** sin ganancia medida o mueven los scores.
- **R2 para los wasm grandes:** el deploy no puede depender de un consentimiento humano; usar el split de D80.

## 4. Reglas para cambiar modelos o decodificadores

1. Un modelo nuevo entra con **su charset**: `ppocr_keys.txt` y `latin_dict`
   no son intercambiables.
2. No cambies un default sin A/B de 2–3 corridas y sin anotar el corpus.
3. Conserva el mismo contrato de salida (`texto`, `score`, `lineas`); el gate y
   el clasificador no deben saber qué motor corrió.
4. Los modelos se versionan en `public/models/`; los wasm de runtime se
   materializan, no se versionan.
5. Si un decoder nuevo gana, demuestra cobertura **y** coste: el presupuesto de
   QR es la causa número uno de lotes lentos.
