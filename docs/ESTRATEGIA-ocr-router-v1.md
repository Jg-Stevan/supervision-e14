# Estrategia OCR por dispositivo — supervision-e14

> Ronda 3 del benchmark (9 motores, 6 actas E-14, sandbox 2 núcleos / 4 GB).
> Pregunta que responde: *¿Tesseract best + psm 4 para todos, o PP-OCR?
> ¿Nos fiaremos del diagnóstico automático de `perfil-dispositivo` para
> repartir los modelos?*

## Respuesta corta

1. **Ninguno de los dos "para todos".** Cada motor gana en su gama —
   el router reparte: Tesseract best + psm 4 en BAJO/MEDIO,
   PP-OCRv5 en ALTO, y el upgrade siempre es opt-in con sonda.
2. **Al diagnóstico automático sí, como base; no como único árbitro.**
   El módulo `perfil-dispositivo` es sólido (nulls honestos, evidencia
   auditable, paridad §4.4), pero para elegir motor necesita 3 ajustes
   (abajo). La filosofía D6 del kit se respeta: el router es un
   consumidor más, con flag revocable y override manual del dueño.

## Matriz de decisión (números medidos, no teoría)

| Gama | Motor | RAM pico | Dígitos impresos | s/pág | Descarga | Solo impreso |
|---|---|---|---|---|---|---|
| **BAJO** (deviceMemory < 2, ≤ 2 núcleos, saveData, batería < 20 %, storage < 500 MB) | Tesseract spa-best + psm 4 | 62-67 MB | 94,4 % | 2,2 | 13,5 MB | 93,8 |
| **MEDIO** (el resto: 2-4 GB, iOS inferido, ALTO sin red) | Tesseract best + psm 4 → upgrade opt-in a PP-OCRv5 | 67 → 487 MB | 94,4 % → 100 % | 2,2 → 3,25 | 13,5 (+13) MB | 93,8 → 97,6 |
| **ALTO** (deviceMemory ≥ 4 + ≥ 6 núcleos + 4g/wifi + WASM SIMD) | PP-OCRv5 mobile latin (ONNX) en worker | 487 MB | 100 % | 3,25 | 13 MB | **97,6** |

Decisiones auxiliares medidas:

- **Tesseract fast NO como default**: ahorra 11 MB pero cae a 83,3 % de
  dígitos (−11 puntos). Solo como último recurso de red lenta.
- **int8 (3,5 MB)**: ahorra disco/descarga, NO RAM (la dominan los buffers
  del detector) y pierde ~1 campo. Cuantizar solo si el OTA importa.
- **EasyOCR descartado** (2,2 GB, 10,4 s). **docTR** no existe en web
  (PyTorch); como servicio nativo sería para tablets (~1 GB RAM).
- **VLM cloud (GLM-4.5V) como verificador**, no como lector principal:
  en texto impreso ya lo supera PP-OCRv5 offline (97,6 vs 94,4). Su
  valor real: manuscritos y semántica cuando las reglas rechazan.

## Los 3 ajustes al diagnóstico automático (v1 → v2)

### 1. Que el benchmark decida (hoy es "evidencia que no decide")

El propio `benchmark.ts` del kit lo documenta: *"un dispositivo puede
declararse ALTO y rendir BAJO"*. `deviceMemory` redondea a la baja y
llega a 8; `hardwareConcurrency` no distingue big.LITTLE. Para el motor:

- sonda de CPU **< 350**/1000 ⇒ Tesseract sin excepción (aunque las
  señales digan ALTO);
- sonda **≥ 750**/1000 ⇒ habilita PP-OCRv5.

Es la misma sonda que ya corre en idle (~150 ms) — solo cambia su rol:
de evidencia a condición.

### 2. Sonda de carga real del modelo ONNX

La RAM declarada no garantiza los ~487 MB de buffers del detector DBNet.
Antes de fijar v5 en un dispositivo:

```
ejecutarSondaCarga(() => cargar det_v5_mobile + rec_v5_latin en ONNX
                      e inferir una imagen 200×60 con texto,
                    timeout 8_000)
```

- ok ⇒ se fija v5 (y se cachea en localStorage).
- fallo/timeout ⇒ Tesseract + castigo de 7 días sin reintentar.

Es el equivalente exacto del "warm-up con página 1" que usó el benchmark
para medir la RAM pico real (487 MB) y no la teórica.

### 3. iOS y red — las dos trampas de la regla §4.4

- **iOS queda atrapado en MEDIO para siempre**: sin `deviceMemory` ni
  `performance.memory`, la ruta de inferencia (núcleos ≥ 6 + heap ≥ 2048 MB)
  nunca se cumple porque el heap es null en Safari. Fix: usar el renderer
  de GPU que el kit YA recolecta (`WEBGL_debug_renderer_info` → "Apple GPU")
  + sonda de CPU ≥ 750 como vía de inferencia alternativa.
- **La red debe condicionar la DESCARGA, no la capacidad**: exigir 4g/wifi
  para declarar ALTO congela el motor por cómo esté la conexión en el
  momento del primer escaneo. Los modelos se descargan UNA vez — la regla
  correcta ya existe en el kit: `sincronizarSoloWifi`. Aplicarla a la
  descarga del modelo v5 y liberar el tier de la red.

## Integración en supervision-e14 (D6-safe)

```
perfil-dispositivo (ya existe, sin cambios)
        │ tier + sonda de CPU (score 0-1000)
        ▼
router-ocr.ts  (NUEVO consumidor — src/modules/digitalizador/lib/e14/ocr/router-ocr.ts)
        │  flag `ocrMotorAdaptativo` (kill-switch, default ON)
        │  override manual `ocrMotor` en e14-flags-overrides manda
        │  gobernador reactivo: 2 fallos/OOM de v5 en 3 min ⇒ Tesseract por sesión
        ▼
worker OCR (ocr-escalonado.ts / ocr/rapidocr.ts)
        │  BAJO/MEDIO: tesseract spa-best --psm 4
        │  ALTO: PP-OCRv5 (det_v5_mobile + rec_v5_latin + latin_dict, 13 MB)
        │        con sonda de carga previa y fallback automático
        ▼
reglas e14 (completitud/coherencia — ya existen)  ⛨ red de seguridad en TODOS los tiers
        │  OPTIMA ⇒ ENVIADA · ADVERTENCIA ⇒ REVISION · RECHAZADA ⇒ no enviar
        ▼
¿RECHAZADA/ADVERTENCIA y hay red?  ⇒  VLM cloud valida SOLO los campos ambiguos
   (o los manuscritos) — no la página entera: 1 llamada corta, no 4,2 s de página.
```

Notas de integración:

- El upgrade en MEDIO es una **tarjeta opt-in** ("Activar OCR de
  precisión"), como el patrón de flags del dueño: descarga 13 MB en wifi,
  sonda de carga, y si falla no se reintenta por 7 días.
- El router **jamás cambia criterios ni reglas** — solo qué motor corre
  (mismo bound D74 que `gama.ts`).
- Paridad de chips: el panel de perfil puede mostrar el motor resuelto y
  su `motivo` (auditable, igual que la evidencia de señales).

## Modelo mínimo por tier (descargas totales)

| Gama | Descarga inicial | Extra opcional |
|---|---|---|
| BAJO | spa.best 13,5 MB (+tesseract.js ~3-5 MB) | — |
| MEDIO | idem BAJO | v5 ONNX 13 MB (en wifi, opt-in) |
| ALTO | tesseract.js + spa.best 13,5 MB (fallback instantáneo) | v5 ONNX 13 MB al primer uso |

Con esto ningún dispositivo descarga más de ~27 MB y el fallback a
Tesseract existe SIEMPRE (v5 cargando lento ⇒ el primer OCR ya puede
correr con Tesseract mientras v5 se calienta).

---

## Fase 3 — el motor consume el router (wire-in, este PR)

El motor de producción de este repo es **RapidOCR/PP-OCR** (el experimento
Tesseract fue retirado en su día). El router de la fase 1 mapea así:

| Resolución del router | Modelos en producción |
|---|---|
| `tesseract-best-psm4` (motor base del benchmark) | **PP-OCRv4** det+rec (byte-idéntico a hoy) |
| `ppocrv5` (ALTO+SIMD u override manual) | **PP-OCRv5 mobile** det + rec latin (assets nuevos, ~12.7 MB) |

Cadena completa en `initReal()` (rapidocr.ts): `leerFlags()` → `resolverMotor(perfil headless)` → set de modelos → **sonda de carga real** (inferencia de prueba 320×120, timeout 8 s) como gate de v5 → si falla, v4 + castigo 7 días (localStorage).

Redes de seguridad (todas activas):

1. **Flag `ocrMotorAdaptativo=false`** ⇒ v4 byte-idéntico en TODOS los dispositivos.
2. **Override manual `ocrMotor`** del dueño manda (la sonda sigue verificando viabilidad: el contrato del router exige sonda para ppocrv5).
3. **Sonda de carga real**: el deviceMemory no garantiza los buffers del detector — se PRUEBA el ONNX antes de adoptarlo; fallo ⇒ castigo 7 días.
4. **Gobernador reactivo**: `rapidOcrReiniciar()` (watchdog) reporta presión si el runtime muerto era v5; 2 fallos/OOM en 3 min ⇒ degradación a v4 por el resto de la sesión.
5. **`perfil headless` honesto**: tier §4.4 de `obs/dispositivo` (la MISMA fuente que gama.ts) + probe SIMD + probe GPU. El `benchmark.score` del kit NO viaja al motor (null honesto) — la sonda de carga es la señal real, no la sonda sintética.

Pendiente honesto (siguiente fase): la tarjeta «Activar OCR de precisión» de la
fase 2 (hoy el dueño puede forzar v5 vía `e14-flags-overrides:
{"ocrMotor":"ppocrv5"}`) y que el `benchmark.score` viaje del provider al
arranque del motor para refinar el origen `medio-elegible-upgrade`.

---

## Fase 4 — override con un clic + informe de corrida auto-identificado

Cierre del ciclo: el router decide (fase 1), el worker obedece (fase 3), el
diagnóstico audita (fase 2) y AHORA el dueño actúa sin consola y el informe
de corrida se auto-identifica.

1. **Tarjeta «OCR de precisión (PP-OCRv5)»** en el panel AUTONOMÍA
   (`panel-perfil.tsx`): visible en la ruta `medio-elegible-upgrade` (MEDIO
   con condiciones cumplidas) o con override vigente.
   · **ACTIVAR PP-OCRV5** escribe `ocrMotor:"ppocrv5"` en
   `e14-flags-overrides` vía `guardarOverridesFlags` (la puerta oficial —
   DOBLE whitelist ya registrada en fase 2). El arranque del OCR lo lee en
   la PRÓXIMA init: el singleton vigente no se toca (una corrida en curso
   termina con el motor que arrancó).
   · **QUITAR OVERRIDE** escribe `ocrMotor:null` — el null NO pasa el
   whitelist ⇒ el flag vuelve al default y el router recupera la decisión.
   · La **sonda de carga real sigue siendo el gate técnico** de v5: el botón
   no la salta (fallo ⇒ v4 + castigo 7 días, igual que ALTO).
   · D6 íntegro: la app muestra y escribe SOLO lo que el dueño pide.

2. **Informe de corrida (D34) auto-identificado** (`metricas.ts →
   exportarInformeMetricas`): dos campos ADITIVOS AL FINAL (patrón D57 — los
   informes previos no cambian de forma):
   · `gama: { tier, tierEfectivo }` — el tier §4.4 que la capa adaptativa
   aplicó (y su efectivo si hubo degradación reactiva).
   · `motorOcr: { motor, modelos, origen, motivo }` — la decisión del router
   Y los modelos que REALMENTE cargaron (pueden diferir: sonda de v5 fallida
   ⇒ `motor:"ppocrv5"` con `modelos:"v4"` — el informe muestra ambos, cero
   maquillaje). Fuente: `motorOcrActual()` de rapidocr.ts (el MÓDULO del
   motor, misma fuente que la telemetría `[ocr-router]`; null honesto si el
   motor no inició).

   Con esto el A/B del dueño deja de ser forense: cada `informe-masiva-*.json`
   nuevo dice QUIÉN es (gama) y QUÉ corrió (motor+modelos+origen+motivo).

Pendiente honesto: que el `benchmark.score` viaje del provider al perfil
headless del motor (hoy null honesto — la sonda de carga real es el gate;
el score solo refinaría el origen `medio-elegible-upgrade` del arranque).
