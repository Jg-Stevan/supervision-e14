# RUNBOOK — destrabar y verificar el deploy de Cloudflare Pages (sin R2)

**Kit:** `e14-pages-wasm-partes-v1` (D80) · **Fecha:** 2026-11-03 · **Para leer en vivo con Gemini / seguir a mano**

> Este runbook reemplazó al de R2. **No hay que habilitar R2, ni crear bucket, ni
> tocar el dashboard para nada de storage.** Lo excedido de 25 MiB se parte en el
> build y lo pega una Pages Function (D80). Si encuentras en otro archivo
> instrucciones con `r2 bucket create`, están superadas.

## 0. Qué está pasando (lee esto antes de tocar nada)

- `cloudflare-pages.yml` lleva **7 runs rojas**. Último deploy verde: 2026-11-03 10:09 UTC.
- El fallo **no era de código**: el paso de R2 pedía un consentimiento del panel
  que la API no puede dar (`10042`). Con D80 ese paso desaparece, así que el
  bloqueo humano ya no existe.
- Consecuencia de estar rojo: `supervision-e14.pages.dev` responde **sin**
  `Cross-Origin-Opener-Policy` y **sin** `Cross-Origin-Embedder-Policy` →
  `crossOriginIsolated=false`, `SharedArrayBuffer=undefined` → el OCR va a **1 hilo**
  para todos los visitantes. El fix de `_headers` está commiteado (`51e82c8`) pero
  **no ha podido desplegarse**.
- Qué hace ahora el pipeline: `next build` → `bun run scripts/cf-wasm-partes.mjs`
  parte lo que pasa de 24,5 MiB y escribe `out/e14/wasm-partes.json` + `out/_routes.json`
  → `wrangler pages deploy`. Los dos activos rápidos (`…jsep.wasm` 27,0 MiB = EP WebGPU,
  `…asyncify.wasm` 25,5 MiB = worker del EP wasm) salen de `out/` como partes y entran
  al navegador reensamblados por `functions/vendor/onnxruntime/[file].ts`. Sin ellos:
  **218 s el lote demo con un acta rechazada**.

**Cuenta:** `<ACCOUNT_ID>` · proyecto Pages `supervision-e14`.

**Fin del runbook cuando:** el deploy verde + `curl -I` muestra COOP/COEP + el wasm
gordo llega entero + el navegador dice `crossOriginIsolated=true`.

---

## Paso 1 — Comprobar localmente que el split funciona (2 min, antes de mover CI)

```bash
cd <ruta-local-del-mantenedor>/supervision-e14
bun run build                              # o bunx next build
bun run scripts/cf-wasm-partes.mjs --dry-run
bun run scripts/cf-wasm-partes.mjs
```

> **Qué debes ver:** la dry-run lista los dos `.wasm` y dice cuántas partes salen (2 y 2
> con `--tamano-max=20`); el run real imprime `… verificado byte a byte` por asset y al
> final `manifiesto e14/wasm-partes.json · _routes.json → /vendor/onnxruntime/…`.
>
> **Lo que NO debes ver:** `✘ BYTE MISMATCH` (corte a medias: borra `out/` y rebuild), ni
> `_routes.json → sin rutas` teniendo los `.parteN` en disco.

```bash
cat out/_routes.json
ls out/vendor/onnxruntime/ | grep -c parte   # 4
ls out/vendor/onnxruntime/*.wasm             # solo ort-wasm-simd-threaded.wasm (13,6 MiB, nunca se parte)
```

> **Qué debes ver:** `include` con **exactamente** los dos nombres partidos. Si `include`
> lista `ort-wasm-simd-threaded.wasm` o está vacío habiendo partes, la Function va a
> sombrear un asset estático y el OCR se cae a 404 (es el bug que D80 documentó).

## Paso 2 — Verificar que la Function pega los assets (prueba de runtime, opcional)

```bash
bunx --yes wrangler@4.157.0 pages dev out --port 8793
```

> **Qué debes ver**, en otra terminal:
> ```bash
> curl -s -o /tmp/j.bin -w "%{http_code} %{size_download}\n" \
>   http://127.0.0.1:8793/vendor/onnxruntime/ort-wasm-simd-threaded.jsep.wasm && sha256sum /tmp/j.bin
> ```
> `200 28312028` y sha `3ad23231b5bd6d9dda55a7f84606315e0bf35b6750c28ee993c987c54cacab0f`.
> Y que el chico sigue estático:
> `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://127.0.0.1:8793/vendor/onnxruntime/ort-wasm-simd-threaded.wasm` → `200 14239897`.
>
> Ctrl+C al terminar. Si prefieres el servidor de medición, `python scripts/serve-export.py 8794`
> hace el mismo ensamblado con COOP/COEP y debe dar los mismos sha256.

## Paso 3 — El token de CI: alcance (ya no hace falta R2)

1. GitHub → repo → **Settings → Secrets and variables → Actions** → `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
2. `CLOUDFLARE_ACCOUNT_ID` = `<ACCOUNT_ID>` exactamente.
3. El token necesita **Pages:Edit** sobre esa cuenta. **R2:Edit ya no se usa** y sobra
   (mínimo privilegio). El token que se pegó en el chat está quemado: créate uno nuevo.
4. El `wrangler.toml` de la raíz **no se toca**: de ahí lee el deploy `pages_build_output_dir`.
   Perdió el bloque `[[r2_buckets]]`; si alguien lo reintroduce, la Function pedirá un
   binding que ya no existe.

> **Qué debes ver:** los secrets existen. El valor no se puede leer; la comprobación real
> es el log del Paso 4, que imprime `wrangler whoami`.

## Paso 4 — Redisparar el deploy

```bash
gh workflow run cloudflare-pages.yml --ref main     # o git push origin main con los cambios de D80
gh run list --workflow=cloudflare-pages.yml --limit 3
gh run watch <ID_DE_LA_NUEVA_RUN>
```

> **Qué debes ver:** los pasos `Partir los wasm que Pages rechaza` y
> `Deploy to Cloudflare Pages` en verde. El log del primero debe imprimir las dos líneas
> `verificado byte a byte` y la línea `_routes.json → …`. Si en vez de eso aparece
> `Failed to publish your Pages project` busca el paso de deploy: no hay R2 en medio ya.

## Paso 5 — Verificación post-deploy (la que le falta a tu CI)

Correlos **siempre** después de publicar: "deploy verde" y "sitio bien" no son la misma
cosa — hoy tenías un deploy que servía CSP sin COOP/COEP.

```bash
# 1. Aislamiento: tienen que aparecer las DOS líneas Cross-Origin-*
curl -sI "https://supervision-e14.pages.dev/?cb=1" | grep -i cross-origin

# 2. Los dos wasm partidos, reensamblados por la Function
for w in ort-wasm-simd-threaded.jsep.wasm ort-wasm-simd-threaded.asyncify.wasm; do
  curl -s "https://supervision-e14.pages.dev/vendor/onnxruntime/$w" -o /tmp/$w -D - | grep -iE "^HTTP|etag|content-length"
  sha256sum /tmp/$w
done

# 3. Que un asset estático chico NO lo sombreó la Function (el bug de D80)
curl -sI "https://supervision-e14.pages.dev/vendor/onnxruntime/ort-wasm-simd-threaded.wasm" | grep -iE "^HTTP|etag|content-length"

# 4. Que el default publicado es el que crees (o el que NO quieres, que también hay que saberlo)
for f in $(curl -s https://supervision-e14.pages.dev/ | grep -o '/_next/static/chunks/[a-z0-9]*\.js' | head -40); do
  curl -s "https://supervision-e14.pages.dev$f" | grep -q "127.0.0.1:8765" && echo "$f CONTIENE el default nativo"
done
```

Y en el navegador, sobre el sitio publicado:

```js
({coi: crossOriginIsolated, hilos: navigator.hardwareConcurrency, sab: typeof SharedArrayBuffer})
```

> **Qué debes ver:**
> 1. `Cross-Origin-Opener-Policy: same-origin` **y** `Cross-Origin-Embedder-Policy: require-corp`.
> 2. `200` + `content-length: 28312028` / `26781914` y `etag: "3ad23231b5bd…"` / `"39f9f0894d47…"`,
>    con sha256 del archivo descargado **igual** al etag. Un `500 NO HAY MANIFIESTO` = el
>    paso del build no corrió o el deploy subió un `out/` sin `e14/wasm-partes.json`.
> 3. `200` y `content-length: 14239897` **sin** `etag` de 64 hex (esa respuesta es de Pages,
>    no de la Function). Si sale 404, `_routes.json` está mal.
> 4. Nada (el sitio publicado debe seguir con OCR en navegador hasta que decidas lo del default adaptativo).
> 5. `{coi: true, hilos: 4, sab: "function"}` ← **este es el número que te estaba fallando hoy.**

---

## Paso 6 — Matriz de corrección rápida

| Síntoma | Causa real | Qué hacer |
|---|---|---|
| CI `10042 Please enable R2` | la run es ANTERIOR a D80 | Re-disparar con el commit de D80; el paso de R2 ya no existe. |
| `500 NO HAY MANIFIESTO DE PARTES` | `cf-wasm-partes.mjs` no corrió en el build | Revisar el paso `Partir los wasm…` del log; `ls out/e14/`. |
| `502 PARTE n/2 DE … NO RESPONDE` | el deploy subió partes incompletas | `wrangler pages deployment list`; redesplear desde un `out/` recién partido. |
| `503 … SUMAN X Y EL MANIFIESTO DECLARA Y` | manifiesto y partes de builds distintos | Build limpio: `rm -rf out && bun run build && bun run scripts/cf-wasm-partes.mjs`. |
| `/vendor/onnxruntime/ort-wasm-simd-threaded.wasm` 404 con texto de la Function | `out/_routes.json` con `include` vacío o ausente: la Function sombrea lo estático | Paso 1. Si `include` está bien en `out/`, el deploy no lo subió. |
| Pages rechaza un asset >25 MiB | un asset nuevo superó el umbral y no está en `vendor/onnxruntime/` | `bun run scripts/cf-wasm-partes.mjs --dry-run`; lo de fuera de esa ruta se borra, lo de dentro se parte. |
| `✘ BYTE MISMATCH` en CI | `split` cortado a medias (disco lleno / Ctrl+C) | No es un fallo del wasm: rebuild de `out/` y re-correr el script. |
| El lote local va lento tras partir | el servidor de medición no sabe pegar partes | Usar `scripts/serve-export.py` (ensambla) y NO `python -m http.server`. |
| `curl -I` sin `Cross-Origin-*` tras deploy verde | `_headers` no desplegado (bloque duplicado o build viejo) | `diff -q public/_headers out/_headers`; verifica que la run usó el commit `51e82c8`. |
| `crossOriginIsolated=false` con headers presentes | service worker / caché del navegador | Ctrl+Shift+R con `?cb=N`; revisa el flag `localStorage e14-coi-sw`. |
| Lote publicado ~218 s con un acta rechazada | los dos wasm no se están sirviendo | Paso 5 check 2. |
| Lote publicado ~130 s con default nativo ON | visitante sin sidecar paga el fallback | **no desplegar el default estático**; hace falta la sonda `/salud` (Paso 7). |

---

## Paso 7 — Pendientes que este runbook NO resuelve (para no creer que acabamos)

1. **Revocar el token pegado en el chat** (`cfat_…`, Cloudflare → My Profile → API Tokens → Delete).
   Quedó expuesto en texto plano en una conversación; no lo uses tampoco como secret de CI.
2. Commitear D80 (`scripts/cf-wasm-partes.mjs`, `functions/`, `wrangler.toml`, el workflow,
   `serve-export.py`, los tests y `flags.ts`) — **nada de esto está commiteado aún**.
3. **Default adaptativo antes de publicar el nativo:** sonda `/salud` al arrancar; si no
   responde, apagar `ocrNativoUrl` en la sesión. Sin eso, cada visitante hosted paga el
   intento fallido y el sitio publicado va a **130,5 s** en vez de ~101,6 s.
4. `public/flags.json` sigue muerto (`refrescarFlags()` no tiene llamadores) y la capa de
   flags no tiene ni un test.
5. El tiempo de pared no va como gate de CI: la varianza medida es 40-130 s según carga de la máquina.
6. Si al final quieres R2 (por ahorrar los 4 `fetch` internos por wasm, o por servir los
   modelos de 32 MB iguales), D80 no lo impide: se puede re-addicionar el binding. Lo que
   no se puede es que el deploy dependa de un consentimiento del panel.
