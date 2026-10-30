# REPORTE — KITs R1: presupuesto REAL de la capa 0 QR + caché negativa por SHA-256

> Base: `docs/PLAN-R1-R2.md` (plan completo R1+R2) y el informe
> `informe-masiva-2026-10-30-14-34-59.json` (2 corridas × 6 actas).
> Alcance de este parche: **R1.1 + R1.2 + R1.4** (velocidad SIN tocar calidad).
> R1.3 quedó SUSTITUIDO por el guard por fracción de R1.1 (ver §1.3).

## 0. El problema medido

| Acta | preOcrMs | preOcrQrMs | QR leído |
|---|---|---|---|
| 085053.jpg | 18.945 | 18.922 | **null** |
| 084939.jpg | 29.789 | 29.765 | **null** |
| 085043.jpg | 6.730 | 6.727 | **null** |

- preOcr = **38 % de la corrida**; 98,6 % es `preOcrQrMs`.
- 3 actas sin QR pagan el ladder completo **en las 2 corridas** (~110 s de CPU
  que no produce nada — la identidad la resuelven OCR + capa 2).
- Causa raíz (código): el `presupuestoMs` de la capa 0 NO era de pared:
  · rotaciones 90/180/270 corrían SIEMPRE (sin guard — 3-6 s extra),
  · el rescate 4096 corría SIEMPRE que aplicara (re-decode 16 MP + barrido
    a 4096 — varios segundos extra),
  · el guard del barrido se chequeaba UNA vez ANTES de arrancar (entrando
    con 7,9 s/8 s el barrido corría completo).
  Y cuando la cadena terminaba `null`, el resultado SE OLVIDABA (la segunda
  corrida lo pagaba otra vez).

## 1. Qué cambia

### 1.1 — KIT qr-presupuesto-real-v1 (R1.1)

El presupuesto pasa a ser de VERDAD. **Con presupuesto null (gama BASE/ALTO)
`vencido()` es siempre false ⇒ byte-idéntico a hoy.** Con presupuesto
(MEDIO 8 s / BAJO 5 s):

- `barridoQrDePixeles` (qr-pixeles.ts): guard de reló **POR CUADRANTE**
  (al iniciar TL/TR/BL/BR) y **POR FRACCIÓN** (entre ventanas). La llamada
  `barridoQrDePixeles(pix)` queda byte-idéntica (ancla source-scan de
  identidad-qr §T-1 y del sondeo worker) — el guard se INYECTA módulo-scoped
  con `activarGuardBarrido(vencido)` y se desactiva en `finally`.
- `cadenaCapa0EnWorker` (capa0-qr.worker.ts): guard **por rotación** (break
  al vencer) y guard del **rescate 4096** antes del re-decode y antes de su
  barrido a 4096.
- `decodificarQrDePixeles` (identidad-qr.ts, camino main): ídem — barridos
  con guard inyectado + guard por rotación.
- `decodificarQrDeCapture` (identidad-qr.ts): el rescate 4096 responde al
  presupuesto de la cadena (`vencidoCapture`) — antes corría sin reló.
- **R1.3 sustituido**: el techo global de intentos jsQR habría cortado la
  cobertura de TR/BL/BR (los QR tardíos de fracciones grandes). El guard por
  cuadrante/fracción acota el wall-clock SIN perder cobertura dentro del
  presupuesto configurado — es la política del dispositivo, no un recorte
  inventado.

Nuevo en `RespuestaCapa0`: **`presupuestoVencido: boolean`** — el reló estaba
vencido al terminar (el `null` fue CORTE por presupuesto, no agotamiento).
El bundle `public/scanner/capa0-qr.worker.js` se REGENERÓ (`bun
scripts/build-capa0-worker.mjs` — smoke jsQR-only OK: sin zxing/process.env)
y el cache-bust sube a `?v=2`.

### 1.2 — KIT qr-cache-negativa-v1 (R1.2)

Cuando la cadena COMPLETA de capa 0 (worker jsQR + fallback zxing de main)
termina **null REAL** (sin presupuesto vencido, sin throw), el hecho se
recuerda:

- **Llave = SHA-256 de los bytes** (`registro.hashBytes` / `fila.hashBytes`
  — ya se calculan en la ingesta). Contenido distinto ⇒ llave distinta.
- **Escritura (punto ÚNICO — el runner):** Map de sesión con tope 500 FIFO
  (`qr-cache-negativa.ts`) + traza persistente `RegistroMasiva.qrSinPayload`
  (sobrevive la recarga vía `filaDeRegistro`). El sondeo y el prescan
  (parciales, presupuestados) JAMÁS escriben.
- **Lectura:** la capa 0 consulta ANTES del ladder — hit ⇒ 2-3 ms (misma
  economía de la herencia positiva `qrPrevio`, D30). Fuentes del hecho:
  la traza persistida del registro o el Map de sesión (re-encolado del
  MISMO archivo en la misma sesión).
- **Invalidación honesta:** si una pasada posterior lee payload para la
  misma llave (reproceso forzado), la entrada muere (`cacheNegativaQuitar`)
  y la traza `qrSinPayload` se limpia del registro (los writes intermedios
  y `registroListo` heredan el spread limpio — cubre el re-leer del watchdog).
- **Escapes sagrados:** `forzarDedupOff` (PROCESAR IGUAL) JAMÁS consulta ni
  escribe (RL-e65b-6). Un `null` por corte de reló o por throw NO se cachea
  (conservador — la siguiente pasada reintenta con la cadena completa).

**Flag del dueño: `qrCacheNegativa`** (default true). `false` = byte-idéntico
a hoy. Saneada en `ESQUEMA_FLAGS` (flags.json + overrides localStorage).

### 1.4 — KIT qr-tier-metrica-v1 (R1.4)

Telemetría aditiva de la capa 0 (honestidad — ausente = sin dato):

- `RegistroMasiva.qrTier` / `qrMs` — tier ganador + ms del worker
  (RespuestaCapa0; null honesto en ruta main / sin lectura).
- `MetricaActa.qrCacheNegativa` / `qrTier` / `qrMs` — viajan al informe JSON
  (desenlace y post-mortem ERROR). Con el informe se responde: ¿dónde
  aparece el QR, qué cuesta cada tier, y cuánto skip dio la caché?

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `masiva/qr-cache-negativa.ts` | NUEVO — Map de sesión (puro, jamás lanza) |
| `masiva/qr-pixeles.ts` | guard del barrido por cuadrante/fracción + `activarGuardBarrido` |
| `masiva/capa0-qr.worker.ts` | guards de rotación/rescate + `presupuestoVencido` |
| `masiva/capa0-qr.client.ts` | passthrough `presupuestoVencido` + `?v=2` |
| `masiva/identidad-qr.ts` | camino main: barridos/rotaciones/rescate con reló |
| `masiva/runner.ts` | consulta/escritura de la caché + trazas + métricas |
| `masiva/tipos.ts` | `qrSinPayload` (fila+registro), `qrCacheNegativa`, `qrTier`, `qrMs` |
| `masiva/store.ts` | `filaDeRegistro` restaura `qrSinPayload` |
| `masiva/metricas.ts` | `MetricaActa` + hooks con las trazas nuevas |
| `flags.ts` / `obs/tipos.ts` / `shared/e14/flags-schema.ts` | flag `qrCacheNegativa` |
| `public/scanner/capa0-qr.worker.js` | REGENERADO (smoke jsQR-only OK) |

## 3. Contratos respetados

- **D57**: campos NUEVOS AL FINAL (tipos y MetricaActa) — nada previo cambia.
- **Ancla QA**: `const barrido/nitido/binarizada = barridoQrDePixeles(...)`
  y el bloque «capa 0 ANCLA» (`archivoPipeline`) quedan byte-idénticos.
- **Red line e73**: el bundle del worker sigue jsQR-only (smoke OK).
- **D6**: overrides manuales del dueño mandan (`qrCacheNegativa` es
  kill-switch propio; los presupuestos siguen viniendo del plan de gama D74).
- **Jamás inventar**: todo campo nuevo es aditivo; null/ausente = sin dato.

## 4. Validación (para el dueño)

1. `bun install && bun run prebuild` regenera el worker (o usar el commit tal
   cual — el bundle ya viaja regenerado).
2. Corrida A/B con el MISMO lote del informe (6 actas, 2 corridas):
   - `preOcrQrMs` de las 3 sin QR: ≤ presupuesto + margen (~1 s) — antes
     18,9/29,8/6,7 s.
   - 2.ª corrida del mismo archivo: traza `capa0-qr cache-negativa` y
     `preOcrQrMs` de 2 dígitos.
   - `MetricaActa.qrTier/qrMs` presentes en las actas con QR (tier ganador).
   - % de QR leído IGUAL al baseline (cero regresión de cobertura) — la
     caché solo recuerda nulls REALES (sin corte por reló).
3. Kill-switches: `{"qrCacheNegativa": false}` en `e14-flags-overrides`
   vuelve la capa 0 byte-idéntica a hoy (el guard de R1.1 queda inerte con
   presupuesto null y respeta el presupuesto que el plan de gama ya traía).

## 5. Ahorro esperado (mismo lote del informe)

- R1.1: cada acta sin QR baja de 18,9/29,8/6,7 s a ≤ ~8-9 s ⇒ **-20-25 s por
  corrida**.
- R1.2: la 2.ª corrida del mismo archivo no paga ladder ⇒ **-~50 s**.
- Combinado: el gasto de QR inútil baja de ~110 s (2 corridas) a ~25 s
  (≈ -77 %), sin tocar criterios, score, gate ni la cobertura de QR leído.
