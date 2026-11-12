# RUNBOOK — flujo E2E local: acta desde el celular → recepción en el computador

**Kit:** `e14-e2e-hub-local-v1` · **Fecha:** 2026-11-04 · **Para seguir a mano (o en vivo con otro agente)**

> **Qué prueba esto:** los dos repos del dominio E-14 funcionando como UN solo
> sistema en UNA máquina. `digielect14` (el digitalizador del puesto, en el
> navegador del celular) transmite; `supervision-e14` (el panel del supervisor,
> en el computador) recibe por red y publica por su embudo real (D25 + join
> D22 + log de Recepción + Monitor global).
>
> Al terminar debes ver, en el panel, una fila nueva en RECEPCIÓN marcada
> **DEL CELULAR** y accesible con VER EN MONITOR.

---

## 0. Topología (lee esto antes de tocar nada)

Un SOLO servidor, un SOLO origen. `supervision-e14/scripts/hub-local.mjs`:

```
https://<IP-del-compu>:8443/            → digielect14/out     (el celular)
https://<IP-del-compu>:8443/supervision → supervision-e14/out (el computador)
https://<IP-del-compu>:8443/actas       → POST del puente · GET del panel
```

Por qué todo en un origen y no dos puertos distintos:

- **Cámara del celular.** `useSesionCamara.ts` exige `window.isSecureContext`.
  Por HTTP en LAN la cámara queda bloqueada → solo HTTPS (o importar archivo).
- **CSP del panel** (`src/app/layout.tsx:41`) fija `connect-src 'self' …`. Un
  hub en otro origen obligaría a relajarlo — y el repo ya tiene el precedente
  SEC-10: ni `endpointReportes` ni `ocrNativoUrl` aceptan URLs absolutas
  configurables. Por eso **no hay flag de URL del hub**: la ruta es constante
  y relativa al origen (`src/modules/supervision/data/hub-local.ts:36`).
- **Contenido mixto:** si el panel va en HTTPS y el hub en HTTP, el navegador
  bloquea el fetch. Mismo origen = mismo esquema.
- **COOP/COEP:** el servidor las emite en todas las respuestas, así
  `crossOriginIsolated` es real y el OCR va multihilo (y el coi-service-worker
  del layout ni se registra). Medido en un Galaxy A56 real por `:8443`:
  `isSecureContext:true, crossOriginIsolated:true`.

Dónde vive el código:

| Pieza | Archivo |
|---|---|
| Servidor + hub | `supervision-e14/scripts/hub-local.mjs` |
| Receptor del panel (sondeo 4 s) | `supervision-e14/src/modules/supervision/data/hub-local.ts` |
| Tarjeta HUB LOCAL (prender/sincronizar) | `supervision-e14/src/modules/supervision/components/hub-local-card.tsx` |
| Embudo común (D25/D22/log) | `supervision-e14/src/modules/supervision/data/actas-runtime.ts` (`publicarActaMasiva(entrada, origen)`) |
| Puente del celular (POST) | `digielect14/src/lib/e14/puente/envio.ts` |
| Botón HUB LOCAL del celular | `digielect14/src/components/e14/screens/ResumenView.tsx` |
| Tests del receptor | `supervision-e14/src/modules/supervision/data/__tests__/hub-local.test.ts` |

**Fin del runbook cuando:** el panel muestra la fila del celular en RECEPCIÓN
(y el acta abre en el Monitor). Si eso pasa, el E2E está cerrado.

---

## Paso 1 — Construir los dos estáticos (2-4 min)

```bash
cd <ruta-local-del-mantenedor>/digielect14
BUILD_STATIC=1 NEXT_PUBLIC_BASE_PATH= bun run build

cd <ruta-local-del-mantenedor>/supervision-e14
MSYS_NO_PATHCONV=1 NEXT_PUBLIC_BASE_PATH=/supervision bun run build
```

> **El detalle que rompe el E2E sin avisar:** `NEXT_PUBLIC_BASE_PATH=` (vacío
> EXPLÍCITO) en el móvil. Sin esa asignación, `next.config.ts` cae al default
> histórico `/digielect14` y el `out/index.html` referencia
> `/digielect14/_next/…`; como el hub lo sirve en la RAÍZ, todos los chunks dan
> 404 → la página **pinta pero nunca hidrata** (SSR puro, ningún botón
> responde). Comprobación que lo detecta en 2 s:
> `grep -o 'src="[^"]*\.js"' out/index.html | head -1` → debe empezar por
> `/_next/`, no por `/digielect14/_next/`.

> **Qué debes ver:** en ambos, `Generating static pages (N/N)` y la tabla de
> rutas con ` (Static)`. El del panel **tiene** que llevar
> `MSYS_NO_PATHCONV=1`: sin esa variable Git Bash reescribe `/supervision`
> como `C:/Program Files/Git/supervision` y `next build` muere con
> `Specified basePath has to start with a /`.
> Comprobación rápida de que el basePath quedó horneado:
> `grep -o '/supervision/_next/[^"]*' out/index.html | head -1` → debe imprimir
> una ruta con el prefijo.

## Paso 2 — Arrancar el hub (10 s)

```bash
cd <ruta-local-del-mantenedor>/supervision-e14
bun scripts/hub-local.mjs              # 8443 HTTPS + 8081 HTTP de respaldo
# opciones: --puerto 9443 --puerto-http 8082 --no-http --movil ../digielect14/out
```

> **Qué debes ver** en el banner:
> `HUB LOCAL e14 — almacén en C:\...\supervision-e14\.hub-local`, el aviso de
> que reutilizó el certificado, y las tres URLs (MÓVIL / PANEL / HUB) con la IP
> de la red privada (no `localhost`). Si un puerto estaba ocupado, el servidor
> arranca en el otro y el banner usa el puerto vivo.
> La primera vez tarda ~2 s más: genera `certificado.pem` con `openssl`
> (`-days 820`, con `subjectAltName` de la IP y del DNS-name) porque iOS no
> acepta un certificado sin SAN.

## Paso 3 — Probar el hub SIN celular (30 s)

```bash
curl -sk https://127.0.0.1:8443/hub/estado
curl -sk -X POST https://127.0.0.1:8443/actas -H 'content-type: application/json' \
  --data-binary @"$TEMP/e2e-lote.json"
curl -sk "https://127.0.0.1:8443/actas?desde=0"
curl -sk https://127.0.0.1:8443/supervision/ -o /dev/null -w '%{http_code} %{size_download}\n'
curl -sk https://127.0.0.1:8443/ -o /dev/null -w '%{http_code} %{size_download}\n'
```

Un lote de prueba que pasa el validador del hub y **llena los dos caminos**
(una PUBLICADA y una BLOQUEADA por D25) — `actas` de 2, con `idEnlace` real del
catálogo DIVIPOLA el primero y falso el segundo. Guárdalo donde quieras (no en
el repo):

```json
{
  "dispositivo": "cel-puesto-roma-02",
  "actas": [
    { "idEnlace": "88_495_010_02", "mesa": "001", "formulario": "TRANSMISION",
      "paginaIndex": 1, "paginaTotal": 2,
      "srcFoto": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "impresion": { "consulado": "88", "pais": "380 - ITALIA", "zona": "010",
        "puesto": "02", "mesa": "001", "lugar": "Roma - Consulado",
        "barcode": "710003993010102", "etiquetaFormulario": "TRANSMISIÓN" },
      "nombreArchivo": "acta-roma-mesa001-p1.jpg", "score": 91.4, "statusActa": "OPTIMA" },
    { "idEnlace": "99_999_999_99", "mesa": "001", "formulario": "DELEGADOS",
      "paginaIndex": 1, "paginaTotal": 1, "srcFoto": null,
      "impresion": { "consulado": "99", "pais": "000 - INEXISTENTE", "zona": "999",
        "puesto": "99", "mesa": "001", "lugar": "Lugar sin catalogo" },
      "nombreArchivo": "acta-sin-catalogo-p1.jpg", "score": 44.2, "statusActa": "RECHAZADA" }
  ]
}
```

> **Qué debes ver:**
> - `POST /actas` → `{"ok":true,"recibidas":2,"publicadas":2,"insertadas":2,"rechazadas":[],…}`
>   (el hub rechaza sobres mal formados; la cuarentena D25 la decide el PANEL, no el hub).
> - `GET /actas?desde=0` → `total:2` y cada fila con `fotoUrl:"/foto/<seq>"`,
>   **sin** el dataURL de la foto dentro del JSON (por eso el sondeo de 4 s no
>   arrastra megas).
> - Los dos `curl` de estáticos → `200` con `size_download` de 5 cifras
>   (una cifra = sirvió un HTML de error o un redirect, no la app).
> - Todo con `Cross-Origin-Opener-Policy: same-origin` en las cabeceras.

## Paso 4 — El computador: prender el receptor (60 s)

1. Abre `https://<IP>:8443/supervision/` (o `https://localhost:8443/supervision/`
   si estás en la misma máquina; en Chrome el aviso de certificado self-signed
   se salta escribiendo `thisisunsafe` con la pestaña enfocada).
2. Entra con el supervisor demo, sidebar → **RECEPCIÓN DE ACTAS**.
3. Tarjeta **HUB LOCAL · puente desde el celular** → botón **PRENDER HUB**.

> **Qué debes ver:**
> - El chip pasa a `SONDEANDO CADA 4 S` (verde) y los chips
>   `EN EL HUB 2`, `TRAÍDAS 2`, `PUBLICADAS 1`, `BLOQUEADAS 1`.
> - En el log, la fila de Roma con la píldora `TRANSMITIDA` y el tag
>   **`DEL CELULAR`**, y la otra en `CUARENTENA (D25)` con el motivo
>   `(a) idEnlace "99_999_999_99" ausente en el catálogo DIVIPOLA`.
> - El KPI `Recibidas` y el badge del sidebar suben; la fila nueva parpadea
>   (`fila-llegada`) porque `esLlegadaViva("puente-local")` es true.
> - **VER EN MONITOR** en la fila de Roma aterriza en el acta del puesto
>   `88_495_010_02` mesa 001, y a la derecha se ve la miniatura servida por
>   `https://<IP>:8443/foto/<seq>`.
> - El interruptor queda en `localStorage["e14-hub-local"]=on`: si recargas,
>   el shell lo reanuda solo (`iniciarHubLocal()` en `supervision-shell.tsx`).

## Paso 5 — El celular: escanear y transmitir (2-3 min)

1. Conecta el celular a la MISMA red WiFi que el computador.
2. Abre `https://<IP>:8443/` (la IP del banner, no `localhost`).
3. Aviso «no es privado» → **Avanzado → Continuar**. Acepta el permiso de cámara.
4. Captura un acta (o **IMPORTAR** una imagen si la cámara no se habilita) y
   procésala hasta que la fila quede **ENVIADA**.
5. Pestaña **RESUMEN** → tarjeta **PUENTE A SUPERVISIÓN**: la línea `hub:` debe
   mostrar el Worker de producción. Toca **USAR HUB LOCAL (ESTE EQUIPO)**.
6. Toca **SINCRONIZAR AHORA**.

> **Qué debes ver:**
> - El botón pasa a `HUB LOCAL: ESTE EQUIPO · tocar para producción` y el
>   `hub:` cambia al origen actual. El override se lee en CADA envío
>   (`localStorage["e14-puente-url"]`) — no hay que recargar.
> - Tras SINCRONIZAR: `0 pendientes · N enviadas` y el resumen inline del envío.
> - En el computador (Paso 4), en menos de 4 s aparece la fila con **DEL
>   CELULAR**, la miniatura real de lo fotografiado y el score del OCR.
> - Con el hub apagado en el panel, la fila NO desaparece: queda en el hub y
>   entra al prender (el cursor `localStorage["e14-hub-curso"]` es de epoch ms).

## Paso 6 — Eventos que conviene ver una vez

| Evento | Cómo provocarlo | Qué debes ver |
|---|---|---|
| Cuarentena D25 | idEnlace fuera del catálogo (el 2° del lote) | Fila BLOQUEADA con motivo `(a)`; la mesa NO aparece en el monitor |
| Página 2 del mismo acta | Enviar la página 2 desde el celular | La MISMA fila de destino, `PAG 2/2`; el visor muestra las 2 páginas |
| Reintento | Apagar el hub, enviar desde el celular, volver a prender | El puente del celular reenvía lo pendiente; el panel lo trae al sondeo siguiente |
| Kill local del sondeo | URL mal formada en el hub / servidor caído | Tras 5 fallos el chip dice `DETRANSPORTE · 5 fallos seguidos` y el sondeo para |
| Lote > 10 | `POST /actas` con 11 actas | `413 {"ok":false,"error":"lote de 11 excede el tope 10"}` |
| Origen distinto | `curl -X POST … -H "Origin: https://otro"` | `403 {"ok":false,"error":"origen distinto"}` |
| No comitear datos reales | `git status` tras el Paso 5 | Nada: el almacén vive en `.hub-local/`, que está en `.gitignore` |

## Paso 7 — Limpiar

```bash
curl -sk -X POST https://127.0.0.1:8443/hub/reset     # vacía el almacén del hub
```

Y en los navegadores: `localStorage.removeItem("e14-hub-curso")` en el panel y
**devolver el puente a producción** en el celular (el mismo botón). El
certificado y el almacén se pueden borrar a mano: son `.hub-local/` dentro del
repo y nunca se suben.

> El `reset` borra TODO el almacén, **incluido `cert/`**: el servidor en marcha
> sigue sirviendo el certificado que ya tiene cargado en memoria, pero al
> reiniciar el hub se genera uno nuevo y el celular vuelve a ver una autoridad
> desconocida.

---

## Verificar desde un celular real (sin adivinar)

El Paso 5 se puede hacer mejor: con **depuración inalámbrica** del Android, el
agente ve y opera el Chrome real del teléfono (cámara real, rendimiento real).
Hace falta `adb` (platform-tools portable, sin admin) y, en el celular, solo el
interruptor de desarrollador.

```bash
# en el celu: Opciones de desarrollador → Depuración inalámbrica → Emparelar
adb pair <IP>:<puerto-emparejamiento>        # pide los 6 dígitos de la pantalla
adb devices                                  # el device aparece por mDNS, sin puerto manual
adb forward tcp:9333 localabstract:chrome_devtools_remote
curl -s http://127.0.0.1:9333/json/list      # pestañas del Chrome del celular
```

Con ese socket (CDP) se puede, sin tocar el teléfono:

- `Runtime.evaluate` → `isSecureContext`, `crossOriginIsolated`, viewport,
  `localStorage["e14-puente-url"]`, y leer el outbox `e14-puente-v1`.
- `Input.dispatchTouchEvent` → taps reales en los botones (RESUMEN, SINCRONIZAR).
- `DOM.setFileInputFiles` → inyectar una foto al `input[type=file]`, después de
  `adb push <acta.jpg> /sdcard/Download/`: OCR de un acta real sin tener que
  fotografiar nada.
- `Page.captureScreenshot` → la pantalla exacta que ve el operario.

**Medido así (Galaxy A56 5G, Chrome 156, gama media, por `:8443`):** un acta
completa procesada en **7 741 ms** de motor, `crossOriginIsolated:true` (OCR
multihilo activo en el celular), y un lote del puente pesando **205 KB**.

> **Apágalo al terminar.** Con la depuración inalámbrica prendida, cualquier
> dispositivo de la misma red puede leer archivos, instalar APKs y ver la
> pantalla del teléfono.

## Matriz de corrección rápida

| Síntoma | Causa real | Fix |
|---|---|---|
| `Specified basePath has to start with a /, found "C:/Program Files/Git/supervision"` | Git Bash reescribe el env | Reconstruir con `MSYS_NO_PATHCONV=1` delante |
| El hub no levanta y dice `Ningún puerto quedó libre` | 8443 y 8081 ocupados | `--puerto 9443` (y `--no-http` si sobra) |
| `EADDRINUSE :::8081` en el log pero el servidor vive | Otro proceso tenía el HTTP | Nada: `escuchar()` prueba/catch, el HTTPS sigue |
| El celular no conecta (rueda y falla) | Firewall de Windows en la red privada | `netsh advfirewall firewall add rule name="e14-hub" dir=in action=allow protocol=TCP localport=8443` **como administrador** (no lo hago por ti) |
| Cámara en blanco en el celular | Abrió `http://…` o `localhost` | HTTPS con la IP del banner; o usar IMPORTAR |
| iOS dice «no se puede abrir» sin opción de continuar | Cert self-signed sin CA de confianza | Instalar el certificado raíz en el iPhone (Ajustes → Perfil descargado) o probar en Android |
| `hub:` del celular sigue en `workers.dev` | No tocó USAR HUB LOCAL, o el navegador bloqueó localStorage | Tocar el botón; si el feedback dice «el navegador bloqueó el almacenamiento», usar la consola con `localStorage.setItem("e14-puente-url", location.origin)` |
| RECEPCIÓN no muestra nada aunque el hub tenga filas | Hub apagado en el panel (default) o cursor adelantado | Prender HUB LOCAL / SINCRONIZAR AHORA; si nada llega, borrar `e14-hub-curso` |
| Chip `DETRANSPORTE · 5 fallos seguidos` | 5 ciclos caídos (servidor muerto, red cortada) | Volver a prender la tarjeta (eso resetea el contador) |
| Fila DEL CELULAR sin miniatura | El `POST` llegó sin `srcFoto` o la foto supera 16 MB | Verificar `fotoUrl` en `GET /actas?desde=0`; el hub guarda aparte y sirve `/foto/<seq>` |
| `bun test` rojo en `hub-local.test.ts` con `Image is not defined` | Alguien quitó el stub del archivo | El embudo mide la foto con `new Image()`; el test instala `ImagenFalsa` (naturalWidth 0 → sintético 794×1123) |
| El celular dice `1 pendientes · Último error: Failed to fetch` y el hub no recibe NADA | El `POST` del puente salía con `keepalive:true`, y Chrome **rechaza** el fetch si el cuerpo pasa su cuota de 64 KB — con la miniatura en dataURL (≈205 KB) el acta quedaba encolada para siempre | Build ≥ `e72977a` de `digielect14` (keepalive condicionado al tamaño). Prueba desde la propia página: `fetch('/actas',{method:'POST',body:cuerpo,keepalive:true})` → TypeError; `keepalive:false` → 200 |

## Límites honestos de este hub

- **Es una demo local**, no el Worker de producción: sin persistencia fuera de
  la máquina, sin autenticación (la única puerta es `esSameOrigin`), sin cola.
- Las fotos se guardan en disco (`actas/<seq>.json` + `indice.jsonl`): si
  pruebas con **actas reales**, ese contenido queda en `.hub-local/`. Nunca se
  comitea, pero tampoco se borra solo.
- El panel en GitHub Pages NO tiene hub: la tarjeta existe, el sondeo falla y
  se autodetiene a los 5 fallos. Por eso el default es apagado.
- SIM (modo simulación) **nunca** envía — es la regla D6 del puente; para el
  E2E hace falta una captura real o importada.
