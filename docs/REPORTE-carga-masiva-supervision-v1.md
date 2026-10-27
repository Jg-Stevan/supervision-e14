# REPORTE — carga-masiva-supervision-v1 (D27)

Trasplante del módulo **masiva** del digitalizador (`digielect14`) a este
repo y completación del ciclo con el dashboard de supervision: lo que la
carga masiva escanea y clasifica, el monitor lo ubica y lo muestra.

## Alcance

- **Motor** (`src/modules/digitalizador/`): `lib/e14/masiva/**` (store,
  runner, cola IDB, dedup 3 capas, identidad QR/serie, prescan, precalor,
  watchdog, vida, histórico, ledger-remoto fail-soft), motor compartido
  (`scanner-core-bridge`, `bridge`, `clasificador`, `divipol`,
  `completitud`, `integridad`, `marcadores`, `marco-escaneo`,
  `orientacion(-qr)`, `ocr-escalonado`, `diagnostico`, `senal-lectura`,
  `image-utils`, `flags`, `gama`, `seed`, `types`), `obs` mínimo
  (buffer/breadcrumbs/captura/digest/dispositivo/identidad/operacion/
  politica/tipos), `logger`, `components/e14/{icons,MasivaView}` y el
  **adaptador** `store/store-e14.ts` (la costura — ver D27).
- **Assets** (`public/`): `models/rapidocr` (~16 MB), `vendor/onnxruntime`
  + `opencv-4.5.5-core`, `scanner/detection-worker.js` +
  `scanner/sondeo-qr.worker.js`, `wasm/zxing_reader.wasm`,
  `e14/divipol.json`; `src/modules/digitalizador/assets/*.jpg` (prewarm).
- **Supervision** (cambios quirúrgicos): `data/actas-runtime.ts` (NUEVO),
  `data/mock-repository.ts` (overlay + `registrarCargaMasiva`),
  `data/supervision-repository.ts` (método nuevo en la interfaz),
  `components/datos-provider.tsx` (suscripción a publicaciones),
  `components/supervision-shell.tsx` (vista activada + prop
  `onVerEnMonitor`), `components/actas/acta-viewer-modal.tsx` (caption
  prefiere la impresión del acta runtime).
- **Dependencias nuevas:** `@jg-stevan/scanner-core ^0.4.0`,
  `onnxruntime-web 1.30.0`, `pdfjs-dist 6.4.299`, `node-unrar-js`,
  `heic2any`, `fflate`, `zxing-wasm 3.1.6`, `zustand ^5`.

## Limpieza (lo que NO viajó)

Experimentos flag-OFF del repo origen y su maquinaria quedaron fuera:
warp de ingesta (K2), quad-streaming/turno de clasificación (P4/P5),
rescate ZXing del pre-scan (§F.3), cascada OCR Tesseract (K3), DRY RUN
«solo QR», hand-off P1, prioridad W1, dhash-resize (NO-GO), PanelDev,
informe/obs-de-informe, `tools/bench-*`, `lab/`, `scripts/qa-*` y los
tests vitest (su harness + anclas de QA viven en `digielect14`). Los
flags correspondientes salieron de `FlagsApp` + whitelists.

## Verificación (browser, end-to-end)

1. Monitor global intacto: 949 puestos, invariante de KPIs exacta.
2. CARGA MASIVA: upload de `acta-e14-real.jpg` → «SONDEO QR 1/1» →
   fila PREPARADA → PROCESAR COLA → pipeline completo →
   `88 - PORTUGAL - SABADO LISBOA - CONSULADO - TRANSMISION - MESA 003
   - PAG 1/2`, score 10.0, **ENVIADA AUTO**, QR ✓.
3. Publicación: traza `[e14] masiva → supervision: acta publicada
   88_680_005_86::003 (pág 1)`; KPIs del monitor se movieron en vivo;
   mesa 003 → transmisión P1 ok (13%), notificación «CARGA MASIVA —
   MESA 003».
4. Visor (👁 del puesto): **ACTA REAL · TRANSMISIÓN · PÁG 1/2** con el
   encabezado impreso verbatim (`CONSULADO 88 · PAÍS 680 - PORTUGAL ·
   ZONA 05 · PUESTO 86 · MESA 003 … · *E14-SEN-2026-001*`).
5. Modal de revisión (ABRIR): foto procesada + grid de datos + píldora
   de publicación + **VER EN MONITOR** → aterriza en el visor de la mesa.
6. `bunx tsc --noEmit` y `eslint` limpios (0 errores).

## Límites documentados

- Sin backend (D8): la publicación es memoria de sesión; recargar
  restablece (§0-5). La cola durable del motor vive en IndexedDB.
- Ledger remoto D1 sin endpoint (fail-soft — «indisponible — continúo»);
  idempotencia local vía histórico IDB.
- Solo se publican actas con clasificación **AUTO** (SUGERIDA/MANUAL no
  tienen join confiable — jamás inventar).
- El build estático de Pages no se verificó en este entorno (solo dev);
  el motor proviene de un repo con el mismo patrón `output: export`.
