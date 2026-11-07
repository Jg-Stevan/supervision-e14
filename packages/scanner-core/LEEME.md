# @jg-stevan/scanner-core

> **El núcleo de lectura E-14 — una sola copia.** Este paquete ejecuta el
> *mapa de migración v2.3*: lo que afecta la lectura vive aquí; lo que es
> producto, se queda en cada app. Sustituye a las copias vendorizadas
> (`core/LEEME.md` + `CONTRATO.json` + `qa-core-vendorizado.ts`) de
> `digielect14` y `supervision-e14` — sigue siendo código propio, solo que
> con una sola copia.
>
> **Procedencia:** `web-scanner` · `feba267` · **v0.4.1** (vendorizado
> original — 6 módulos md5-idénticos en ambos repos, verificados). Ver
> `CHANGELOG.md` y `src/core/LICENSE-scanner-core.md`.

## La regla que gobierna todo

*Si el motor diverge, dos puestos leen un acta distinto.* Todo lo que
afecta la lectura va al paquete; lo que no (UI, stores, flags de producto,
masiva, perfil-dispositivo), no. Dirección de dependencias: **app → núcleo,
nunca núcleo → app**. El paquete NO sabe nada de: React/zustand, flags de
producto, gama adaptativa, env vars (entran por opciones), ni de si la
fuente es cámara o lote.

## Estructura

```
src/
├── core/          FASE 0 — los 6 módulos del origen vendorizado (md5 en
│                  CONTRATO.json). Copia literal: NO editar sin regenerar
│                  el contrato en el mismo commit.
├── dominio/       FASE 1 — types, senal-lectura (criterio de aceptación
│                  único), ocr-escalonado (la decisión), bridge (contrato
│                  del motor), clasificador, divipol (URL inyectada),
│                  entorno + plan (OpcionesPlan — §3.1/D3), get-bridge
│                  (fábrica; el RealCoreBridge es de cada app)
├── geom/          FASE 2 — orientacion (presupuesto/ladoMini por plan) y
│                  orientacion-qr
├── qr/            FASE 2 — qr-zxing (de S), qr-pixeles (unificado,
│                  superconjunto S), identidad-qr (base zxing/jsQR de D),
│                  capa0-qr.client (merge D+S, opciones {habilitado,tier})
│                  + vendor/jsQR.js (100% md5)
├── ocr/           FASE 2-3 — db-postprocess (puro, de S), rapidocr (base
│                  de D sin router + salud de S: vuelo/reinicio/cola FIFO),
│                  motor.ts (contrato MotorOcr puro + presupuesto por
│                  motor 3.4), motores/tesseract (3.2: UN motor, fusión
│                  D+S, langPath parámetro), motores/nativo (3.3: sidecar
│                  de S, URL inyectada)
├── orquestacion/  POST-F3 — cascada.ts (de ocr-cascada.ts de D + hooks de
│                  telemetría EventoCascada — 3.6). El router-ocr de S
│                  MURIÓ: la cascada decide DESPUÉS de leer, contra
│                  invariantes del acta; el orden de motores es
│                  CONFIGURACIÓN (3.4)
└── obs-base/      3.6 — bloque base de observabilidad (783 L sin React +
                  captura partida: el ErrorBoundaryObs es de cada app) +
                  config inyectable (versión/política/salud) +
                  eventos-lectura.ts (esquema 3.6 + sink)
workers/           capa0-qr.worker.ts — fuente del build único (3.7):
                   `bun scripts/build-capa0-worker.mjs` emite la MISMA IIFE
                   para ambas apps → public/scanner/
assets/scanner/    detection-worker.js — asset VERSIONADO (D6): IIFE
                   precompilada del origen vendorizado, sin fuente
                   compilable; md5 en assets.lock.json
tests/             harness de paridad (3.10): contrato-motor (golden del
                   negocio) + cascada + fixtures versionados
                   (contrato-motor.json · divipol.json · agregados-router)
scripts/           build-capa0-worker.mjs (build único) · qa-drift-core.ts
                   (gate 3.9 — jubilable al cerrar la adopción)
.github/           paridad-scanner-core.yml (workflow 3.8 — corre ESTOS
                   tests en el CI de ambas apps)
```

## Consumo (bun workspaces)

```jsonc
// package.json de la app
{ "workspaces": ["packages/*"],
  "dependencies": { "@jg-stevan/scanner-core": "workspace:*" } }
```
```ts
import { correrCascadaOcr } from "@jg-stevan/scanner-core/orquestacion/cascada";
```
+ `transpilePackages: ["@jg-stevan/scanner-core"]` en `next.config.ts`.

Los archivos originales de cada app (p. ej. `src/lib/e14/senal-lectura.ts`)
quedaron como **shims** de re-export: las rutas de import de la app no
cambian y la implementación es ÚNICA (la del paquete).

## Inyecciones (todo lo adaptativo entra por opciones)

| Punto de inversión (mapa §3) | Módulo del paquete | La app inyecta |
|---|---|---|
| publicBase (§3.3) | `dominio/entorno.ts` | `configurarPublicBase()` |
| plan adaptativo (§3.1/D3) | `dominio/plan.ts` | `configurarPlan({topeThreadsOcr, presupuestoProbeOrientacion, ladoMiniProbe, pasesBrujulaWarp, tier, knobsRec})` |
| worker capa-0 | `qr/capa0-qr.client.ts` | `configurarCapa0({habilitado, tier})` |
| cola OCR global (S) | `ocr/rapidocr.ts` | `configurarColaGlobalOcr()` |
| motor tesseract (3.2) | `ocr/motores/tesseract.ts` | `configurarTesseract({langPath, …})` |
| sidecar nativo (3.3) | `ocr/motores/nativo.ts` | `configurarNativo(url)` |
| obs (3.6) | `obs-base/config.ts` | `configurarObsBase({versionApp, politicaMetadatos, condicionesSalud})` |

## Invariante de paridad (§6.1)

*Mismo fixture → misma lectura aceptada por la misma cascada en ambas apps,
aunque el orden de motores configurado difiera.* Gate: `bun test` (este
paquete) en el CI de ambas apps (workflow 3.8). Condición bloqueante §6.7:
medir la ventana del router con los eventos 3.6 ANTES de fijar el orden por
defecto de POST-F3 (los agregados históricos están preservados en
`tests/fixtures/agregados-router.json`).

## Versiones fijadas (§6.5)

`onnxruntime-web 1.30.0` · `zxing-wasm 3.1.6` · `tesseract.js 5.1.1` ·
`heic2any 0.0.4` (**sin caret — D8**) · `fflate ^0.8.3`.
