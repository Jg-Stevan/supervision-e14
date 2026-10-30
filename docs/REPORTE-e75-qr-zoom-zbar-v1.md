# REPORTE-e75-qr-zoom-zbar-v1

**Kit:** tier ZOOM TL re-escalado + zbar-wasm en la CAPA 0 QR (rescate antes del rescate 4096).
**Evidencia:** laboratorio de benchmark con 12 imágenes reales E-14 (6 fotos de cámara 4000×3000, acta rotada 90°, QR a media altura + 6 páginas de escáner ~1030×3400), 3 corridas reproducibles.

## 1 · Motivo (lo que la cadena e63n+e64 NO cubre)

La cadena completa trabaja sobre el canvas de trabajo (≤2048; BAJO 1600). El lab midió que ese
downscale es la pérdida dominante para los ESCANEOS (tiras ~1030×3400): al escalar la página
COMPLETA a 1600/1024, los módulos del QR colapsan y 3 páginas no las leyó NI la cadena del repo
NI un GT full-frame de zxing-hard a 1600→2400→4000 px. El remedio medido: recortar la banda
superior-izquierda (50%×30%) del ORIGINAL a resolución NATIVA y escalar SOLO la banda
(s = min(1, lado/max(sw,sh)) — jamás up-escala) → el QR conserva sus píxeles.

## 2 · Evidencia del lab (precisión por variante, 7 imágenes con GT legible)

| Variante | zxing-wasm | zbar-wasm | jsQR |
|---|---|---|---|
| full@1024 | 4/7 · 5.2 ms | 2/7 · 42 ms | 5/7 · 71 ms |
| band@1024 (recorta tras escalar) | 3/7 · **1.1 ms** | 3/7 · 6 ms | 3/7 · 15 ms |
| **zoom@1024 (recorta el ORIGINAL)** | **6/7 · 6.1 ms** | 5/7 · 49 ms | 2/7 · 47 ms |
| full@640 / band@640 | 0/7 | 0/7 | 0/7 |
| zoom@640 | 4/7 · 2.5 ms | **6/7 · 18 ms** | 3/7 · 29 ms |

· **La posición del QR jamás fue el problema** (los finders barren la imagen completa); el límite
  es la resolución por módulo (≥3-4 px/módulo).
· **Recortar sin re-escalar (band) solo ahorra tiempo y pierde QRs** fuera de la banda.
· **zbar es complementario**: leyó 2 actas que NINGÚN otro lector vio en NINGUNA variante
  (p2 solo zbar@zoom1024 · p4 solo zbar@zoom640) — el finder por scanlines de ZBar se comporta
  distinto ante impresiones degradadas.
· **Identidad entre medios**: las 4 actas legibles en foto Y escaneo comparten payload
  byte-a-byte (dedup foto↔escaneo funciona sin transformaciones).

## 3 · Qué implementa (orden MEDIDO, early-exit al primer payload)

```
[después de la cadena completa SIN lectura — worker o main]
1. zoom@1024  → zxing GlobalHistogram → LocalAverage → zbar   (~6-50 ms)
2. zoom@640   → zbar                                          (~18-50 ms)
[si null → rescate 4096 de siempre]
```

· Trazas: `tier=zoom1024-zxing|zoom1024-zbar|zoom640-zbar` (+ diagnóstico
  `zoom-e75 pix1024=… estado=…` — la salud del wasm queda en la traza).
· `zxingDeVentana`/`trazaQr` reutilizados — MISMO contrato (QRCode-only,
  tryHarder/rotate/invert false, jamás throw).
· zbar-qr.ts NUEVO: carga diferida UNA tentativa, wasm LOCAL `public/wasm/zbar.wasm`
  vía `setModuleArgs({ locateFile })` (misma doctrina que zxing_reader.wasm), filtro
  `typeName` QR (un símbolo NO-QR jamás sale como payload), PROHIBIDO en el worker
  (red line e73 — main only, como zxing).
· Flag kill-switch del dueño: `qrZoomTl` (default true = MEJORA; false = cadena de hoy
  byte-idéntica). Whitelist doble completa (flags.ts sanear + politica.ts overrides) +
  wiring en los 2 call sites del runner (soloZxing y cadena completa). El tier es
  main-only: el modo "base" (cámara, techo 0.5 s) NO lo corre.

## 4 · DESVIACIÓN DECLARADA crítica — el resampler del navegador decide lecturas

La 1.ª implementación del recorte usaba la vía estándar del repo (`<img>` del LRU +
HTMLCanvasElement, como `pixelesDeCapture`). En el banco, el acta marginal p4 quedaba
`sin-payload` con dimensiones IDÉNTICAS al lab. Medición píxel a píxel (mismo navegador,
misma banda 325×640):

| Fuente → destino | píxeles que difieren (>8) | zbar |
|---|---|---|
| ImageBitmap → OffscreenCanvas (receta lab) | — | **LEE** |
| HTMLImageElement → HTMLCanvasElement (vía estándar) | **0.11 %** | **null** |

El navegador usa un resampler distinto según el origen del drawImage; ~0.1 % de píxeles
distintos DECIDE la lectura de un QR en el filo. El kit replica la receta que ganó en el
lab: `fetch(dataURL)→blob→createImageBitmap + OffscreenCanvas` (fallback
HTMLCanvasElement), `imageSmoothingQuality "medium"`, `bitmap.close()` inmediato
(gama baja). Consecuencia aceptada: el tier NO calienta la entrada LRU `|4096` del
rescate (decode bitmap propio ~100-300 ms una-off — el rescate 4096 solo corre si el
tier falla, costo marginal en el camino que ya es lento).

## 5 · Verificación E2E (dev server, Gama BAJO detectado — el perfil objetivo)

12 imágenes reales (6 fotos + 6 páginas) por la COLA completa del módulo masiva:

| Fila | Desenlace capa-0 |
|---|---|
| f1 (foto) | `recorte-600` PdZiNVrw… (cadena de siempre) |
| f2/f6 (fotos gemelas) | worker `base`/`barrido` LcyzMYaR… |
| f3/f5 (fotos) | worker `barrido` CSSz/bGj… · PdZiNVrw… |
| **p4 (escáner)** | **`zoom640-zbar` +TENTeAA… en 263 ms ← RESCATE del kit** |
| p1/p2/p3/p5/p6 | sondeo precoz (e73) → hereda-payload → reutiliza gemela |
| f4 (foto) | sin-payload honesto (QR físicamente ilegible — módulos ~2 px) |

**11 QR ✓ / 1 QR ✗ · DESENLACES: ENVIADA 6 · DUPLICADA 6 · ERRORES 0 · cero errores JS.**
Las 6 páginas publican con el payload de su acta original (identidad byte-a-byte
foto↔escaneo; las gemelas NO re-publican — dedup exacto intacto, red line 5/10).

Antes del kit (misma corrida con la vía `<img>`): p4 = `sin-payload` (QR ✗) — el kit
convierte ese caso en leído sin tocar ningún otro desenlace.

## 6 · Cobertura y costo

· Mejor caso (QR decente): SIN costo — el tier no corre (early-exit antes).
· Caso de rescate: ~150-600 ms main (bandas 1024/640 + zxing + zbar) — vs ~15-17 s de
  los barridos jsQR que ya corrieron antes, y vs segundos del rescate 4096 que ya no
  se paga en los casos que el tier rescata.
· Peor caso (sin QR real): ~0.6-1 s extra main una vez por acta (el resto de la cadena
  ya falló) — acotado, sin reló nuevo (2 crops + 4 decodes acotados).
