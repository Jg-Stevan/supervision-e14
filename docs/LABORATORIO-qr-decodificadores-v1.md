# LABORATORIO-qr-decodificadores-v1

**Objetivo:** determinar el decodificador QR y la estrategia de recorte más RÁPIDOS y PRECISOS
para actas E-14 fotografiadas/escaneadas, pensado para dispositivos de GAMA BAJA y SIN CONEXIÓN.
**Evidencia:** 12 imágenes reales (6 fotos de cámara 4000×3000 + 6 páginas de escáner ~1030×3400),
3 corridas reproducibles con el mismo patrón exacto.
**Destino:** este lab es la base del KIT e75-qr-zoom-zbar-v1 (`docs/REPORTE-e75-qr-zoom-zbar-v1.md`).

---

## 1 · Cómo funciona un lector QR (explica TODOS los resultados)

1. **Binarización** con umbral LOCAL: jsQR divide en cajas adaptativas; ZXing usa
   HybridBinarizer/GlobalHistogram; ZBar barre scanlines.
2. **Búsqueda de los 3 finder patterns**: se barre la imagen completa midiendo el ratio
   1:1:3:1:1 del patrón de esquinas → **la posición del QR en la foto jamás fue el problema**
   (verificado empíricamente: mismas lecturas en cualquier posición/rotación — zxing-wasm leyó
   actas rotadas 90° sola, vía transformación de perspectiva).
3. **Transformación de perspectiva** con los 3 finders → endereza el módulo.
4. **Reed-Solomon**: tolera ~30 % de módulos dañados — pero nada rescata un QR que el
   downscale convirtió en sopa de píxeles.

**Regla de oro medida: el límite es la RESOLUCIÓN POR MÓDULO (≥ 3-4 px por módulo).**
Escalar la página completa destruye módulos antes de que el lector pueda fallar con gracia.

## 2 · Metodología

- **Muestras:** 6 fotos `20261028_*.jpg` (cámara 4000×3000, una rotada 90°, QR a media altura)
  + 6 páginas de "Digitalización 1" (escáner, tiras verticales ~1030×3400).
- **GT (ground truth):** lectura multi-paso con 5 etapas de rescate (incluye crop@1600) →
  **7/12 legibles** (f1, f2, f3, f5, p1, p3, p5). Las 5 restantes: f4 y f6 **físicamente
  ilegibles** (nitidez/reflejo destruye los módulos — ningún lector en ninguna variante),
  p2/p4/p6 legibles SOLO vía rescates específicos.
- **Denominador honesto:** precisión siempre sobre las 7 GT-legibles (nunca "/12").
- **Correlación por payload EXACTO** (Reed-Solomon: no existe "casi el mismo payload").
- **Reproducibilidad:** 3 corridas completas (~18-50 s cada una) → mismo patrón exacto.

## 3 · Fase 1 — decodificadores a foto completa (por escala)

Escalas probadas sobre la imagen completa: **640 / 800 / 1024 / 1280 / 1600**.
Decodificadores medidos: jsQR (vendor), zxing-js (port TypeScript), zxing-wasm y zbar-wasm.
Finalistas: **zxing-wasm, zbar-wasm, jsQR** (los números ancla @1024, ver sección 4: full@1024).

Hallazgos:

- **full@640: 0 aciertos** — nadie leyó NADA a foto completa 640 px (módulos colapsados).
- **full@1024: zxing-wasm 4/7 · 5.2 ms — el mejor compromiso velocidad/precisión.**
  jsQR acierta un poco más (5/7) pero cuesta 71 ms (14× más lento). zbar 2/7 · 42 ms.
- jsQR se queda como **capa-0 en Web Worker** (gama sin WASM + jamás congela el hilo UI).
- zxing-wasm además es el único que leyó la acta rotada 90° sin pre-rotación (perspectiva).

## 4 · Fase 2 — full vs band vs zoom (el experimento decisivo)

Tres variantes de recorte, mismas imágenes, mismas escalas:

| Variante | Definición | Efecto medido |
|---|---|---|
| `full` | imagen completa escalada | línea base |
| `band` | **escala primero, recorta después** | solo ahorra tiempo — la banda ya fue re-muestreada y **pierde QRs fuera de ella** (perdió f3) |
| `zoom` | **recorta el ORIGINAL a resolución nativa y escala SOLO la banda** (TL 50%×30%) | reasigna píxeles al QR: gana precisión y rescata QRs chicos |

**Precisión por variante (7 imágenes GT-legible):**

| Variante | zxing-wasm | zbar-wasm | jsQR |
|---|---|---|---|
| full@1024 | 4/7 · 5.2 ms | 2/7 · 42 ms | 5/7 · 71 ms |
| band@1024 (recorta tras escalar) | 3/7 · **1.1 ms** | 3/7 · 6 ms | 3/7 · 15 ms |
| **zoom@1024 (recorta el ORIGINAL)** | **6/7 · 6.1 ms** | 5/7 · 49 ms | 2/7 · 47 ms |
| full@640 / band@640 | 0/7 | 0/7 | 0/7 |
| zoom@640 | 4/7 · 2.5 ms | **6/7 · 18 ms** | 3/7 · 29 ms |

Rescates notables (lo que justifica el ladder):

- **zoom@1024 rescató 3 páginas del escáner que full-frame NO leyó ni a 1600, ni a 2400,
  ni a 4000 px** — el downscale de la tira completa era el asesino, no la nitidez.
- **p2 solo la vio zbar@zoom1024** y **p4 solo zbar@zoom640** — el finder por scanlines de
  ZBar se comporta distinto ante impresiones degradadas: es COMPLEMENTARIO, no redundante.
- p6 (GT-null) se leyó en zoom@1024 con el payload de f2 → era la MISMA acta digitalizada
  dos veces; el zoom rescató incluso un caso que el GT no alcanzó.
- **Unión de las 4 estrategias del ladder: 10/12** (f4 y f6 quedan fuera por daño físico).

## 5 · Veredicto — la escalera (orden MEDIDO, early-exit al primer payload)

```
1. full@1024  → zxing-wasm (GlobalHistogram)                    ~5 ms   (happy path)
2. zoom TL 50%×30% @1024 → zxing GH→LA → zbar                   ~6-50 ms
3. zoom TL @640 → zbar                                          ~18-50 ms
4. (producción) rescate 4096 OpenCV warp+unsharp — última instancia
```

- Pasos 1+2 combinados: **~11 ms**; peor caso del lab con rescates zbar: **~80 ms** —
  ambos órdenes de magnitud por debajo de la cadena pesada (peor caso documentado sin QR:
  ~15-17 s).
- **Respuesta a la pregunta "¿foto cruda o recortada?": ni una ni otra — la escalera.**
  La cruda es el paso barato que resuelve la mayoría; el recorte zoom del ORIGINAL es el
  rescate preciso; zbar cierra los casos que ninguno otro ve.

## 6 · Reglas de oro (transferibles)

1. La **posición** jamás fue el problema; el límite es **px por módulo** (≥ 3-4).
2. **Jamás up-escalar**; recortar el ORIGINAL (`zoom`) > recortar tras escalar (`band`).
3. `band`@baja escala es una trampa: parece gratis (1.1 ms) y pierde QRs.
4. **zbar es complementario**: siempre detrás de zxing, nunca en su lugar.
5. **El resampler del navegador decide lecturas marginales** (desviación e75 medida píxel a
   píxel: `<img>`+canvas difiere de ImageBitmap+OffscreenCanvas en ~0.1 % de píxeles y en p4
   ESO decidía la lectura — el tier replica la receta exacta del lab).

## 7 · Dedup e identidad entre medios

- 6 payloads únicos en 12 muestras; **4 actas aparecen en foto Y escaneo con payload
  byte-a-byte idéntico** (p. ej. `LcyzMYaRF…`) → la identidad por payload funciona ENTRE
  medios sin transformaciones. p2 y p4 son actas solo-escaneadas.
- Validado en producción (PR #17): dedup foto↔escaneo por payload exacto, 0 colisiones.

## 8 · Validación de campo — informe masiva 2026-10-30 14:13 (con e75 activo)

Gama MEDIO (4 núcleos, Chrome 156, Windows, tesseract-best-psm4): **6/6 actas ENVIADAS
automáticas, 0 copias, score promedio 9.52, corrida 146.8 s** (~24.5 s/acta).

| Acta (lab) | En producción |
|---|---|
| f1-f3 (fáciles) | QR **gratis** — heredado del pre-scan paralelo (2-3 ms) |
| f5 (solo zoom@1024 la leía) | QR resuelto en capa-0 (muro 6.7 s) → payload exacto |
| f4/f6 (físicamente ilegibles) | escalera agotada: 18.9 s / 29.8 s → enviadas con identidad OCR/dhash |

Presupuesto QR de la corrida: 55.4 s, de los cuales **48.7 s son las DOS actas sin
solución física**. Palancas siguientes (lab → producción): presupuesto de tiempo para
actas sin QR (corrida estimada ~110 s, -25 %) y re-toma guiada en ingesta.

## 9 · Mapa a producción (qué adoptó el repo)

| Hallazgo del lab | Kit que lo adoptó |
|---|---|
| jsQR preciso pero lento → worker dedicado | capa-0 QR en Web Worker (gama sin WASM) |
| zxing-wasm mejor compromiso @1024 | cadena completa (zxing GH→LA), wasm LOCAL `/wasm/` |
| zoom TL del ORIGINAL + zbar complementario | **KIT e75-qr-zoom-zbar-v1** (tier antes del rescate 4096, kill-switch `qrZoomTl`) |
| rescate de último recurso | rescate 4096 OpenCV warp+unsharp (pre-existente) |
| identidad por payload exacto entre medios | capa-0 identidad QR + dedup (e63m/D30) |
