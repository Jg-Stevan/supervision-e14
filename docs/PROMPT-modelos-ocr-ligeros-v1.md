# PROMPT — Pruebas de viabilidad: modelos OCR más ligeros (int8/latin)

> Cómo usarlo: pega este prompt COMPLETO en la otra sesión (el agente debe tener acceso
> al repo `supervision-e14` clonado). No requiere tocar código: el experimento vive en
> `download/` (gitignored) y solo toca `public/models/rapidocr/` AL FINAL, con tu
> decisión explícita. Basado en el estado D40-D42 del repo.

---

## PROMPT (copiar desde aquí)

Eres el agente de ingeniería del repo `supervision-e14` (Next.js 16, export estático,
deploy en Cloudflare Pages). Objetivo del producto: **enviar actas E-14 lo más rápido
posible desde dispositivos GAMBA BAJA en red móvil inestable**. Todo corre en el
navegador: RapidOCR (PP-OCRv4 det/cls/rec) en onnxruntime-web WASM.

**Tu tarea HOY:** evaluar si modelos OCR MÁS LIGEROS son viables SIN degradar la calidad
de lectura/clasificación. Es un EXPERIMENTO medido, no un cambio de producción.

### Estado actual (no lo re-investigues completo, parte de aquí)

- Modelos actuales en `public/models/rapidocr/`:
  - `ch_PP-OCRv4_det_infer.onnx` — 4.745.517 bytes (4.7 MB)
  - `ch_PP-OCRv4_rec_infer.onnx` — 10.857.958 bytes (10.9 MB) ← el grande
  - `ch_ppocr_mobile_v2.0_cls_infer.onnx` — 585.532 bytes
  - `ppocr_keys.txt` — 26.249 bytes (**charset del rec: 6.623 líneas — CRÍTICO**)
- Carga en `src/modules/digitalizador/lib/e14/ocr/rapidocr.ts`: `import("onnxruntime-web/wasm")`
  perezoso, `wasmPaths=/vendor/onnxruntime/`, det/cls/rec en `Promise.all`, `proxy:true`,
  threads = min(ocrThreadsTope, hardwareConcurrency) si crossOriginIsolated (COOP/COEP de
  Cloudflare, D37/D38), rec con tensor h=48 y REC_WMAX=480, post-proceso DB en JS.
- OCR escalonado (`ocr-escalonado.ts`): pasada-1 det cap **1280**, pasada-2 det **1920**
  si lectura débil («el mejor manda»). El OCR es el **98% del trabajo** del pipeline
  (métricas D34/D35: OCR p50 ~2.0 s, decode 50 ms, thumbs 3 ms).
- El rec actual (PP-OCRv4 chino) casi NO se comprime en red (solo 8-9% con gzip) — viaja
  crudo. **Meta de descarga: rec+det ≤ ~5 MB totales** (hoy ~15.6 MB).
- Verificación del repo: `tsc 0 · lint 0/0` + E2E agent-browser con actas sintéticas en
  `src/modules/digitalizador/assets/` (acta-sim-*.jpg con QR controlado) y actas reales
  del ancla El Cairo (`docs/capturas-actas-reales-v1/`).

### Qué probar (en orden de preferencia)

1. **Cuantización dinámica int8 del rec Y det actuales** (mismos grafos, pesos 8-bit):
   `python -m onnxruntime.quantization.quantize_dynamic` (o `quant_dynamic.py`) sobre
   los 2 ONNX → `*.int8.onnx` en `download/modelos-int8/`. Esperado: rec 10.9→~3 MB,
   det 4.7→~1.5 MB. **Ventaja: `ppocr_keys.txt` queda VÁLIDO sin cambios.**
2. **PP-OCRv4 slim / mobile rec en su variante internacional-latin** (PaddleOCR
   `en_PP-OCRv4_rec_infer.onnx` o `latin`): ~30-50% más chico. **PELIGRO: cambia el
   charset → `ppocr_keys.txt` DEBE reemplazarse por el del modelo elegido (si el
   vocabulario no coincide 1:1, el rec produce BASURA).** Solo si (1) no alcanza.

### Protocolo de verificación OBLIGATORIO (en este orden)

1. **Entorno:** `bun install`; dev server `PORT=3001 bun run dev`; agent-browser headless
   contra `http://localhost:3001/`.
2. **Swap controlado:** NO sobrescribas aún. Copia los candidatos a `download/modelos-int8/`
   y crea un harness mínimo que apunte `wasmPaths/modelos` a ellos (copia temporal con
   backup de los originales, o env). Documenta el hash sha256 de cada modelo antes/después.
3. **Banco de lectura (CALIDAD):** con las actas sintéticas de
   `src/modules/digitalizador/assets/` + las fotos reales del ancla El Cairo
   (`src/modules/supervision/data/actas-reales/assets/*.png`), corre el pipeline completo
   (Carga Masiva → PROCESAR COLA, con REINICIAR ENVÍOS entre corridas) para:
   - **baseline** (modelos actuales) y **candidato** (int8): MISMAS fotos, MISMO orden.
4. **Métricas a comparar (del INFORME DE CARGA — panel del módulo, export JSON):**
   - `ocrMs` p50/p95 por acta (el candidato debe ser **≤ baseline ±10%**; int8 a veces
     GANA en CPUs modestas).
   - Clasificación AUTO correcta (mismo `idEnlace`/mesa/tipo que baseline) — **0 cambios
     permitidos**.
   - `score` del acta: distribución baseline vs candidato — **la caída máxima tolerada es
     −0.5 puntos y NINGUNA acta que baseline aprobó puede caer a RECHAZADA**.
   - Tasa de desenlaces: ENVIADA/REVISIÓN/RECHAZADA idéntica.
   - Si el banco da < 10 actas reales: REPÓRTALO HONESTO — el GO final lo da el dueño con
     su banco GO 120/120 (ocr-escalonado).
5. **Descarga (RED):** tamaño de los 4 archivos servidos (con y sin brotli de CF):
   `curl -sH 'Accept-Encoding: br' -o /dev/null -w '%{size_download}' <url>`. Meta:
   total motor ≤ ~5 MB.
6. **Compatibilidad runtime:** el `rec` int8 debe aceptar el tensor h=48 con REC_WMAX=480
   (valida formas: si el modelo cuantizado exige forma fija, REPORTA — no fuerces cambios
   de pipeline). Hilos/SIMD/COOP-COEP sin cambios.

### Entregables de la sesión (informe)

1. Tabla: modelo | bytes | ocrMs p50/p95 | clasificaciones correctas | score min/medio |
   desenlaces | NOTA de riesgo (charset/formas).
2. Veredicto explícito: **VIABLE / NO VIABLE / VIABLE CON CALIBRACIÓN** (si el score se
   mueve, lista qué gates habría que recalibrar: `statusDeScore` ≥8, rescate, relectura).
3. Los modelos candidatos quedan en `download/modelos-int8/` (gitignored) + script/README
   de cómo se generaron. **NO hagas commit de los ONNX ni toques `public/models/` sin mi
   confirmación explícita.**

### Reglas del repo que NO puedes romper

- `package.json`/`bun.lock` intocables (kit §0.3 — cero dependencias nuevas; python
  corre fuera del repo).
- Pipeline (runner/cola/dedup/OCR-escalonado) INTACTO: este experimento SOLO evalúa
  modelos; cualquier cambio de código de producción se propone APARTE con su D-number.
- Nada de `bun run build` en el sandbox; verificación con `tsc --noEmit` + dev server.
- Red line QR: payload EXACTO (Reed-Solomon) — los cambios de OCR NO tocan la capa QR
  (`qr-pixeles.ts`/worker D40).

---

## Notas del dueño (rellenar tras la sesión)

- Corrida: (fecha) — veredicto: (VIABLE/NO VIABLE/…) — decisión: (adoptar / seguir en PP-OCRv4 / recalibrar gates)
