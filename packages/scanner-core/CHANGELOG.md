# CHANGELOG — @jg-stevan/scanner-core

Formato Keep-a-Changelog. Este paquete nace de la migración v2.3 y HEREDA la
historia del motor vendorizado.

## [0.5.0] — 2026-11-07 · Migración v2.3 (FASE 0 → DESPUÉS)

Nace como paquete de workspace único. Los 6 módulos de `core/` entran TAL
CUAL (md5 verificado en ambos clones: son el motor v0.4.1 vendorizado).

### FASE 0 — core/ literal
- `core/{types,codec,image-modes,image-processor,detector-client,ocr}.ts` —
  copia literal md5-idéntica (contrato en `src/core/CONTRATO.json`).
- `core/__tests__/` — contrato-core (versión CANÓNICA D5: fusión explícita
  de las de D y S), image-modes-parity, parity-worker-filters, types,
  heic-tope. Fixture `contrato-motor.json` (md5 idéntico en ambos repos).
- `src/obs/buffer.ts` + `identidad.ts` — puentes core→obs-base (el core
  lazy-importa `../obs/*`; el core es literal y NO se toca).

### FASE 1 — dominio
- `dominio/`: senal-lectura (criterio único), ocr-escalonado (COMPLETO —
  incluye `rescateAporta` de D), bridge (contrato base; extensiones de S
  quedan en S), integridad, kits, diagnostico, clasificador (+
  `codigoUnicoE14` exportado — uso de S), completitud, divipol (URL por
  `entorno`), marcadores, types (base D), image-utils (base D), seed,
  logger (lazy imports → obs-base), get-bridge (fábrica inyectable).
- NUEVOS: `entorno.ts` (publicBase inyectado — §3.3), `plan.ts`
  (OpcionesPlan — §3.1/D3, 6 consumidores en D).

### FASE 2 — QR + geom + OCR puro
- `qr/qr-zxing.ts` (de S — publicBase por entorno), `qr/qr-pixeles.ts`
  (unificado: versión S-masiva, superconjunto de exports), `qr/identidad-qr.ts`
  (base zxing/jsQR de D — zbar y concurrencia del runner se quedan en S),
  `qr/vendor/jsQR.js` (100% md5), `qr/capa0-qr.client.ts` (MERGE D+S:
  kill≠error, higiene F2, API 2 de cámara, opciones {habilitado, tier}).
- `workers/capa0-qr.worker.ts` (D + `export type PeticionCapa0` de S) —
  build único (3.7): `scripts/build-capa0-worker.mjs` emite UNA IIFE que
  ambas apps copian a `public/scanner/`.
- `assets/scanner/detection-worker.js` — asset VERSIONADO (D6: IIFE
  precompilada del origen, sin fuente compilable; md5 en assets.lock.json).
- `geom/orientacion.ts` (presupuesto + ladoMini por OpcionesPlan; +
  `esperaSink` aditivo de S), `geom/orientacion-qr.ts`.
- `ocr/db-postprocess.ts` (de S — módulo 100% puro, R7c).

### FASE 3 — rapidocr base SIN router
- `ocr/rapidocr.ts` = cuerpo de D (sin router) + SALUD de S (contador de
  vuelo, reinicio seguro, cola FIFO con sink por acta) + inyecciones
  (`topeThreadsOcr`, `knobsRec`, publicBase, cola).
- NUEVO `ocr/motor.ts` — contrato MotorOcr puro + presupuesto por motor
  (3.4 — orden de motores = CONFIGURACIÓN: compensación a S por el router).

### POST-F3 — cascada única
- `orquestacion/cascada.ts` (de `ocr-cascada.ts` de D — el bloqueo de
  compilación A.5 quedó resuelto en FASE 1) + telemetría `EventoCascada`
  (3.6: motor intentado, validación, aceptación). D adopta; S adopta y
  BORRA `router-ocr.ts` (§4.1: decidía ANTES de leer con priors inflables).

### DESPUÉS
- 3.2 `ocr/motores/tesseract.ts` — UN motor (fusión D+S; config EXACTA
  LSTM_ONLY + PSM 4 + spa best; `langPath` parámetro).
- 3.3 `ocr/motores/nativo.ts` — sidecar de S (URL inyectada; D lo hereda
  apagado — aceleración jamás requisito, SEC-10).
- 3.6 `obs-base/` — 783 L sin React (operacion, breadcrumbs, digest,
  identidad, buffer, dispositivo) + captura partida (boundary app-side) +
  `config.ts` + `eventos-lectura.ts` (esquema + sink inyectable).
- 3.10 `tests/fixtures/` — contrato-motor.json, divipol.json,
  agregados-router.json (FALLOS_PARA_DEGRADAR, VENTANA_PRESION_MS —
  preservados ANTES de borrar el router).

### YA (gates)
- 3.9 `scripts/qa-drift-core.ts` — drift app↔paquete (se BORRA al cerrar
  la adopción; reporta "shim" y sale verde).
- 3.8 `.github/workflows/paridad-scanner-core.yml` — reusable: materializa
  assets y corre ESTOS tests en el CI de AMBAS apps.
- D5 versión canónica de `contrato-core.test.ts` (fusión D+S).

### Verificación de este release
- Paquete: `tsc --noEmit` ✓ · `bun test` **120/120** ✓ · build del worker
  ✓ (IIFE 134.9 KB, sin zxing/process.env/import — red line e73).
- digielect14: typecheck ✓ · vitest **295/295** ✓ · paquete en workspace
  **120/120** ✓ · drift gate ✓ (6/6 shims).
- supervision-e14: typecheck ✓ · `bun test` **485/485** ✓ (baseline
  prístino: 449/450 — el fallo restante era el asset v5 sin materializar)
  · paquete en workspace **120/120** ✓.

## [0.4.1] — procedencia (web-scanner · feba267)

El motor vendorizado original: 12 módulos rastreados (6 compartidos D↔S +
6 D-only que se quedan en digielect14). `core/LEEME.md` y
`core/CONTRATO.json` de las apps describen ese contrato; el
`LICENSE-scanner-core.md` viaja con el paquete.
