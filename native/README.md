# `native/` — sidecar nativo del E-14 (KIT `e14-ocr-nativo-v1`)

Lo que hace: corre en CPU nativa (ONNX Runtime de python) la parte más cara del
pipeline — OCR y, en modo *acta-completa*, también warp, b/n y sondeo de
orientación. La app web sigue haciendo su gate, score, dedup y envío; del
sidecar salen la imagen de presentación y el texto ya enderezado.

**Es una aceleración, nunca un requisito.** Flag apagado, sidecar mudo o
timeout ⇒ el pipeline WASM de siempre corre byte-idéntico (kill-switch).

## Por qué loopback y nada más

Los recortes son datos sensibles (actas con nombres, cédulas, mesas).
`ocrNativoUrl` solo acepta `http://127.0.0.1:<puerto>` — la validación vive en
`urlSidecarLocalValida` ([src/shared/e14/flags-schema.ts:152](file:///c/Users/JG/Documents/Qoder/2026-11-02/a8b531fd/supervision-e14/src/shared/e14/flags-schema.ts#L152))
y descarta cualquier otra URL. No expongas este servidor a la red.

Desde D81 el servidor también **elige a quién responde**: `origen_permitido()` deja
pasar loopback, el dominio de Pages del proyecto y `null`/vacío (el `file://`), y
cualquier otra página origin se queda sin `Access-Control-Allow-Origin`. Mientras el
sidecar fue herramienta local un `ACAO: *` era inofensivo; publicado el instalador,
un wildcard significa que cualquier sitio abierto en el navegador del visitante puede
encolar actas en su CPU y leer el texto. La lista se amplía con `E14_ORIGENES`
(separadas por coma) si montas la app en otro dominio.

Y manda `Access-Control-Allow-Private-Network: true`: desde un origen público https,
Chrome pre-vuela todo `fetch` hacia `http://127.0.0.1` con
`Access-Control-Request-Private-Network`; hoy es advertencia, mañana será corte. Sin
esa cabecera de respuesta, el sitio publicado deja de ver el sidecar sin explicación.

## Distribución: el ZIP para el visitante

`127.0.0.1` es la máquina del visitante, nunca el servidor — o sea, publicado el sitio
solo vuela si EL VISITANTE corre esto. Como `python native/servidor.py` no es una frase
que un elector escriba, existe el empaquetado:

```bash
node scripts/empaquetar-sidecar.mjs   # → dist/supervision-e14-sidecar-win-x64.zip (~108 MiB)
```

Congela `native/` con PyInstaller (`--onedir`, NO `--onefile`: el un-archivo paga ~12 s
de descompresión a `%TEMP%` en CADA arranque por la misma descarga) y la vista CARGA
MASIVA ofrece el ZIP desde la tarjeta **ACELERADOR NATIVO**. Pasos para quien lo
descarga y procedimiento de release: `docs/RUNBOOK-sidecar-instalable-v1.md`.

## Arranque

```bash
pip install -r native/requirements.txt
python native/servidor.py                 # motor v5, puerto 8765, 2 sesiones
```

Qué debes ver (las dos líneas, tal como las imprime `servidor.py:346`):

```
[e14-nativo] sidecar en http://127.0.0.1:8765 · motor v5 · cls-lineas False · 2 sesión(es) × 2 hilos — calentando…
[e14-nativo] LISTO (calentada en … ms)
```

La segunda línea es la que importa: mientras no diga `LISTO`, el `/salud` ya
responde pero la primera acta paga el calentamiento del grafo. Desde el ZIP del
visitante dirá `LISTO (sin acta de ejemplo: no calentada)` — ver D81.

Opciones: `--motor v4|v5` · `--puerto 8765` · `--sesiones N` (los núcleos se
reparten entre ellas) · `--hilos N` · `--con-cls` (volteo 180° por línea, más
lento) · `--forzar` (arrancar aunque ya haya uno — **ralentiza el lote**, es el
error del bind duplicado en Windows).

Para probar el sidecar sin navegador: `python native/bench-acta.py` (mide el
`/acta` secuencial, como el relé de la app, sobre `assets/actas-demo`).

## Encenderlo en la app

El panel de dispositivo NO expone estas dos flags (expone el motor OCR). Se
encienden por la puerta oficial de overrides, en la consola del navegador:

```js
localStorage.setItem(
  "e14-flags-overrides",
  JSON.stringify({ ocrNativoUrl: "http://127.0.0.1:8765", actaNativa: true }),
);
location.reload();
```

Qué debes ver: `/salud` 200 en la pestaña de red y, en consola, las actas con
etapas nativas (el navegador deja de pagar det/rec WASM). Para apagarlo:
`localStorage.removeItem("e14-flags-overrides")` y recargar.

## Medido en el lote demo (6 actas reales, 4 núcleos, HD Graphics 520)

| Camino | Lote | Resultado |
| --- | --- | --- |
| 3 m 21 s | antes del KIT | referencia |
| **50-67 s** | sidecar nativo (`actaNativa`, D79) | 6/6 ENVIADAS, 0 rechazos, `lectura=FUERTE` en las 6 |
| **59-62 s** | navegador + WebGPU | 6/6 ENVIADAS, scores idénticos |
| 218 s | navegador SIN WebGPU | 1 RECHAZADA — no es opción |

El sidecar solo (sin navegador) hace el lote en **28,5 s** con `--sesiones 2`;
el lote completo vale lo que tarda la cola de esperas del navegador por detrás.
La varianza de la máquina es de ±14 s entre corridas idénticas (D79), así que
cualquier comparación se hace con 2-3 corridas back-to-back.

`--sesiones 1 --hilos 4` va PEOR por acta (6,31 s vs 4,75 s): el reconocedor
PP-OCRv5 no escala más allá de 2 hebras. Se queda el default `--sesiones 2`, que
además es lo que el relé de la app lee de `/salud` para saber cuántas actas
puede tener en vuelo.

Nativo gana ~8-10 % en este equipo, pero su ventaja real es el peor caso: no
depende del execution provider del navegador.

## Matriz de corrección rápida

| Síntoma | Causa | Qué hacer |
| --- | --- | --- |
| `YA HAY un sidecar en …` | doble arranque (Windows permite el bind duplicado) | mata el PID viejo o usa `--puerto` distinto; **nunca** `--forzar` para medir |
| Números 2-3× peores sin tocar código | máquina saturada u otro agente compilando | `python native/bench-acta.py` solo; compara A/B back-to-back antes de sentenciar |
| Acta en `ERROR` con `CANNOT RUN INFERENCE. INVALID SESSION ID` | sesión ORT compartida muerta por el watchdog de otra acta | ya se reintenta sola ([runner.ts:1453](file:///c/Users/JG/Documents/Qoder/2026-11-02/a8b531fd/supervision-e14/src/modules/digitalizador/lib/e14/masiva/runner.ts#L1453)); si persiste, baja `poolWorkers` a 1 |
| `/salud` no responde | sidecar caído o puerto distinto al flag | rearranca; revisa que el flag apunte al mismo `--puerto` |
| `no encuentro la raíz del proyecto` | `public/models/rapidocr` fuera de sitio | arranca desde el repo o apunta `E14_REPO` / `E14_MODELS` |
