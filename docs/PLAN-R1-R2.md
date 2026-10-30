# PLAN R1 + R2 — Velocidad y calidad del acta final

> Base: análisis del informe `informe-masiva-2026-10-30-14-34-59.json` (2 corridas × 6 actas)
> y lectura del código real (`masiva/runner.ts`, `capa0-qr.worker.ts`, `qr-pixeles.ts`,
> `gama.ts`, `deskew.ts`, `marco-escaneo.ts`, `archivos.ts`, `scanner-core-bridge.ts`).

---

## 0. Contexto — dónde se pierde el tiempo hoy

| Acta | archivo | preOcrMs | preOcrQrMs | QR leído | OCR ms | cuello |
|---|---|---|---|---|---|---|
| 0 | 085053.jpg | 18.945 | 18.922 | **null** | 8.060 | preOcr |
| 1 | 084854.jpg | 264 | 2 | heredado ✓ | 5.688 | ocr |
| 2 | 084901.jpg | 249 | 3 | heredado ✓ | 5.130 | ocr |
| 3 | 084906.jpg | 243 | 3 | heredado ✓ | 6.767 | ocr |
| 4 | 084939.jpg | 29.789 | 29.765 | **null** | 5.573 | preOcr |
| 5 | 085043.jpg | 6.730 | 6.727 | **null** | 7.625 | ocr |

- preOcr ≈ **56 s por corrida (38 % del total)**; el 98,6 % es `preOcrQrMs`.
- 3 actas **sin QR** pagan el ladder completo (~19 s, ~30 s, ~7 s) **en las 2 corridas**
  → ~110 s de CPU quemada que no produce nada (la identidad la resuelve el OCR + capa 2).
- La herencia (`qrHeredado`) ya demuestra el camino: 2-3 ms por acta.

---

## R1 — Velocidad SIN tocar calidad (kill-switch en cada tarea)

### R1.1 Presupuesto REAL de pared en la capa 0 QR
**Archivos:** `masiva/capa0-qr.worker.ts`, `masiva/qr-pixeles.ts`
**Problema exacto:** el `presupuestoMs` (MEDIO 8 s) NO es de verdad:
- `rotacion90/180/270` (línea ~165): **sin guard** — 3 rotaciones de frame completo
  + intento jsQR ≈ 3-6 s extra aunque el presupuesto esté vencido.
- `rescate4096` (línea ~171): **sin guard** — re-decode a 4096² (~16 MP) + ladder base
  + barrido a 4096 (≈4× el costo del 2048) = varios segundos extra.
- El guard del `barrido` se chequea UNA vez ANTES de arrancar: si entra con 7,9 s/8 s,
  corre el barrido completo (~3-5 s) igual.
**Cambio:**
1. `if (vencido()) break;` antes de CADA rotación y antes del rescate 4096.
2. `barridoQrDePixeles(pix, vencido?)` — firma con callback opcional; chequeo de
   presupuesto **por cuadrante** (el loop ya itera 4 cuadrantes).
3. Rescate 4096: exige `!vencido()` Y conservar la condición actual (`rescate4096 ∧
   lado ≥ 2048`).
**Riesgo:** bajo — solo se ACORTA el peor caso sin QR. Si el QR está, aparece ANTES
de los 8 s (los tiers baratos van primero).
**Ahorro estimado:** ~20-25 s por corrida en este lote (3 actas sin QR bajan de
19/30/7 s a ≤ 8 s c/u).
**Validación:** informe nuevo → `preOcrQrMs ≤ presupuesto + margen (~1 s)` en actas
sin QR; % de QR leído igual que baseline.

### R1.2 Caché negativa de QR por SHA-256
**Archivos:** `masiva/store.ts` (fila), `masiva/cola.ts`/`historico.ts` (persistencia),
`masiva/runner.ts` (bloque capa 0).
**Problema:** cuando la capa 0 termina con `payload=null`, el resultado se olvida.
Al reprocesar / re-encolar / correr de nuevo el mismo lote, el ladder se paga OTRA VEZ.
**Cambio:**
1. La fila ya lleva `hashDedup` (SHA-256 del archivo). Persistir `qrPrevio = null →
   marca "sin-qr"` (nuevo campo `qrSinPayload: true` en el registro IDB) cuando la
   capa 0 (worker + fallback zxing) termina con null.
2. En el bloque capa 0 del runner: si `fila.qrSinPayload` ∧ `!fila.forzarDedupOff` →
   **saltar ladder y fallback zxing** (2-3 ms), igual que la herencia positiva.
   `qrHeredado = true` con traza `hereda-sin-qr`.
3. Invalidación natural: la llave es el CONTENIDO (hash). Archivo distinto → sin caché.
   "PROCESAR IGUAL" (`forzarDedupOff`) SIEMPRE fuerza re-lectura completa.
4. Flag: `qrCacheNegativa` (default ON, revocable).
**Riesgo:** bajo-moderado — teoría de "jamás inventar": solo se recuerda un HECHO
medido (esta imagen exacta no rinde QR tras la cadena completa). Si el dueño fuerza
dedup OFF, no aplica.
**Ahorro estimado:** ~50 s en la 2.ª corrida de este lote (todo el preOcrQrMs nulo
desaparece). En re-encolados del mismo archivo: ídem.
**Validación:** re-encolar el mismo lote → corrida 2 con `preOcrQrMs ≤ 50 ms` en las
3 actas sin QR; desenlaces idénticos.

### R1.3 Techo de intentos dentro del barrido
**Archivos:** `masiva/qr-pixeles.ts` (`barridoQrDePixeles`, `ladderBaseDePixeles`).
**Problema:** el barrido es un bucle 4 cuadrantes × fracciones × grilla con costo
similar por ventana; si el QR no está, se paga TODO aunque el presupuesto expire a
mitad. El guard por cuadrante (R1.1) acota, pero el techo por intento da garantía dura.
**Cambio:** contador de intentos jsQR por llamada (const `BARRIDO_INTENTOS_MAX`,
p. ej. 220 ≈ peor caso actual × 0,6) — al llegar al tope, `return null` inmediato.
Misma constante para nitido/binarizado (comparten barrido).
**Riesgo:** bajo — el tope solo corta colas que HOY se agotan sin resultado.
**Ahorro:** acota el peor caso residual de R1.1 (~2-4 s por acta sin QR).

### R1.4 Métricas del tier QR ganador
**Archivos:** `masiva/capa0-qr.client.ts` (respuesta ya trae `tier`), `masiva/runner.ts`,
`masiva/metricas.ts`, informe.
**Cambio:** guardar `qrTier` y `qrMs` en el registro + exponer en el informe JSON
(campos aditivos). Permite medir: qué tier gana, cuánto cuesta cada uno, y validar
R1.1-R1.3 con datos en vez de suposiciones.
**Costo:** ~1 h. Sin riesgo (solo observabilidad).

### R1.5 (opcional) Prescan QR con presupuesto dinámico
**Archivos:** `masiva/prescan-qr.ts`, `gama.ts`.
Hoy el prescan de "PROCESAR COLA" gasta ~5 s por acta aunque el 50 % de la cola ya
haya heredado del sondeo. Presupuesto de sesión: si tras N actas la tasa de QR leído
es baja (o el sondeo ya marcó sin-QR vía R1.2), el prescan salta esas filas.
**Prioridad:** después de R1.1/R1.2 — solo si el informe sigue mostrando prescan caro.

---

## R2 — Calidad del acta final (recortada, enderezada, sin sombras, legible)

Estado actual del producto final:
- **Fotos:** quad OpenCV (worker) → warp INTER_CUBIC ×2 (bw para mostrar, original
  para OCR) → filtro **"bw"** default. Sombras/gradientes de papel sobreviven si el
  bw no los absorbe.
- **Escaneos:** deskew D63-B (±10°, banda cabecera) + limpieza de punto blanco
  (ganancia ≤ 1,25 — suave, NO elimina sombras) + página completa sin warp.
- `marco-escaneo.ts` ya devuelve el **rect del formulario** en fracciones cuando el
  veredicto es "completo" — hoy solo alimenta el gate, no el recorte.

### R2.1 Filtro "documento" (eliminación REAL de sombras)
**Archivos nuevos:** `masiva/filtro-documento.ts` (núcleo puro) +
`filtro-documento.worker.ts` (OffscreenCanvas, patrón ya existente en capa0/sondeo).
Integración: post-warp en el pipeline (donde se fija `fotoProcesada`), flag
`filtroDocumento` (default OFF → validación → default ON).
**Algoritmo (estándar, barato, sin dependencias nuevas):**
1. Downscale del warp a ~1/8 (512 px) → estimar FONDO con blur gaussiano grande
   (o máximo local por bloques — el fondo del papel).
2. Upscale del fondo al tamaño del producto (drawImage suavizado — gratis en canvas).
3. División por canal: `salida = min(255, I × 255 / fondo)` → el papel queda blanco
   plano, la sombra (multiplicativa) desaparece; la tinta se preserva.
4. Ajuste final: punto blanco percentil 99,5 → 255 (reutiliza la receta de
   `deskew.ts`) + curva suave opcional.
**Costo:** ~150-300 ms por acta a escala producto (worker, fuera del hilo UI).
**Riesgo:** medio — cambia píxeles de la imagen final. Mitigación: flag + el OCR
sigue leyendo la variante "original" (PROD-1 ya separa lectura de presentación).
**Validación:** banco del dueño — score OCR medio NO baja; percentil 99,5 del
producto ≥ 245 (fondo blanco medible); comparación visual lado a lado.

### R2.2 Deskew fino post-warp para FOTOS
**Archivos:** `masiva/deskew.ts` (reutilizar `detectarSkew` — ya es puro y testeado),
integración post-warp en el bridge/pipeline.
**Problema:** el warp corrige perspectiva pero el skew intra-página del texto queda
(fotos tomadas en ángulo leve). El deskew D63-B hoy SOLO aplica a escaneos.
**Cambio:** sobre el recorte final: análisis a 512 px → `detectarSkew` → si
|θ| ≥ 0,3° y ≤ 10° → rotación de alta calidad del producto (mismo `rotarCanvas`).
**Costo:** ~50-100 ms. **Riesgo:** bajo (misma receta probada en escaneos).

### R2.3 Recorte al marco impreso (margen muerto fuera)
**Archivos:** `masiva/marco-escaneo.ts` (rect ya disponible), integración en el
paso de recorte. Flag `recorteMarco` (default OFF → piloto).
**Cambio:** cuando `veredicto = "completo"` (4 líneas cerradas) → recortar AL rect
con margen pequeño (~1,5 % ≈ insertado del formulario). Aplica a escaneos y fotos;
en fotos se calcula sobre el bitmap post-warp.
**Cuidado:** NUNCA recortar cuando veredicto = "cortado" (perdería contenido) —
solo "completo" (y opcionalmente "ceñido" sin cambio).
**Ganancia:** acta con presentación limpia (sin franjas del escáner/fondo).

### R2.4 Chequeo de calidad de imagen PRE-OCR
**Archivos:** `masiva/calidad-imagen.ts` (nuevo, puro) + integración en el runner
(justo tras master, antes de despachar el bridge).
**Cambio:** sobre el bitmap de análisis (512 px, ya se decodifica para origen/deskew):
- blur = varianza del Laplaciano
- brillo medio y contraste RMS
Salida SOLO-observabilidad + advertencia temprana en la fila si blur muy alto
("fotografía borrosa" ANTES de pagar 13 s de OCR). No cambia gates ni score (honestidad).
**Ganancia:** diagnóstico temprano + ahorro en reintento de fotos inservibles.

### R2.5 Nitidez de presentación (unsharp sutil)
**Archivos:** reutilizar la receta unsharp 3×3 de `qr-pixeles.ts` (ya existe, pura) a
escala producto en el worker de R2.1. Flag `nitidezPresentacion`.
**Ganancia:** legibilidad visual del PDF/JPG entregado (el OCR ya lee el "original").

### R2.6 Entrega y verificación objetiva
- **Export:** re-encode del producto final a JPEG q 0,92 (verificar la q que sale
  del core hoy; si ya ≥ 0,92, no tocar).
- **Informe:** campos aditivos `fondoBlanco` (percentil 99,5 ≥ 245), `skewResidual`,
  `filtroDocumentoAplicado`, `calidadImagen` (blur/brillo/contraste) → el dueño puede
  verificar el objetivo "acta legible y bien presentada" con NÚMEROS, no a ojo.
- **Opcional (post):** export PDF de entrega agrupando P1+P2 del mismo formulario.

---

## Orden de ejecución sugerido

| # | Tarea | Efecto | Riesgo | Esfuerzo |
|---|---|---|---|---|
| 1 | R1.1 presupuesto real QR | -20-25 s/corrida | bajo | 0,5 día |
| 2 | R1.2 caché negativa QR | -50 s re-corridas | bajo-med | 0,5-1 día |
| 3 | R1.4 métricas tier | medición | ~0 | 0,5 día |
| 4 | R1.3 techo barrido | acota peor caso | bajo | 0,5 día |
| 5 | R2.1 filtro documento | calidad visible | medio | 1-2 días |
| 6 | R2.2 deskew fotos | enderezado | bajo | 0,5 día |
| 7 | R2.3 recorte marco | presentación | medio | 0,5-1 día |
| 8 | R2.4 calidad pre-OCR | diagnóstico | ~0 | 0,5 día |
| 9 | R2.5 nitidez + R2.6 entrega | pulido final | bajo | 0,5-1 día |

Total R1: ~2-2,5 días · Total R2: ~3-5 días. Cada tarea con flag/kill-switch
(doctrina del repo: `flags.json` + `e14-flags-overrides`).

## KPIs de aceptación (medidos con el informe nuevo)

- **R1:** `preOcrQrMs` p95 por acta ≤ 8,5 s en actas sin QR · QR-waste total por
  corrida ≤ 25 s · % de QR leído IGUAL al baseline (cero regresión de cobertura).
- **R2:** ≥ 95 % de actas con fondo blanco (p99,5 ≥ 245) · skew residual ≤ 0,3° ·
  score OCR medio ≥ baseline · tamaño export estable (±5 %).

## Qué NO hacemos (y por qué)

- **WebGPU / shaders:** overkill para 12 MP estáticos; los píxeles-ops en worker
  ya van a ~100-300 ms. Compatibilidad limitada.
- **OCR paralelo sin SAB:** el wasm es mono-hilo; 2 OCR se reparten el mismo CPU
  (ya documentado en runner.ts e71/D31). Sin ganancia real.
- **Cambiar el master 4032:** mueve scores ±margen — prohibido sin kit propio.
- **zxing-wasm en el worker:** red line del kit e73 (jsQR vendido worker-safe).
  El fallback zxing en main se conserva.
- **Reescribir el pipeline del core:** `@jg-stevan/scanner-core` es paquete externo;
  todo lo de R2 se integra desde la capa e14 con flags.
