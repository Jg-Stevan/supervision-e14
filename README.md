# supervision-e14

Digitalización masiva de actas electorales **E-14** del voto exterior colombiano
y monitoreo de su recepción, en el navegador. Convierte fotos, PDF y ZIP/RAR en
actas clasificadas por puesto y mesa (`idEnlace` DIVIPOLA), las valida contra el
catálogo oficial y publica las que superan el control de calidad en un monitor
en vivo.

> **Alcance del producto:** ubica, valida y muestra actas. **No lee votos.** El
> módulo de supervisión nunca interpreta el contenido del acta: muestra la foto
> y el encabezado impreso tal cual (regla D23). Un total inventado en un acta
> electoral sería un fallo de integridad, no de interfaz.

## Estado

Demo funcional sin backend: la publicación vive en memoria de sesión y recargar
la página restablece el estado. El OCR, el QR, la deduplicación y el gate corren
enteros en el cliente; el único componente opcional es un *sidecar* nativo de
Python para acelerar el lote en Windows.

## Arquitectura en 30 segundos

```
src/modules/
├── digitalizador/      Motor de carga masiva: ingesta → QR → warp → OCR →
│                       calidad → gate → clasificación DIVIPOLA → publicación.
├── supervision/        Monitor global, recepción en vivo, anomalías y visor de
│                       actas. Consume datos tras SupervisionRepository.
└── perfil-dispositivo/ Perfil del equipo y recomendaciones de rendimiento.
src/shared/             Utilidades sin dominio: tiempo, tiers de dispositivo,
                        esquema de flags, QR, luminancia.
```

Tres módulos, dos contratos y una clave de unión:

- **`SupervisionRepository`** — único punto por el que la UI de supervisión lee
  datos; el mock se sustituye sin tocar componentes.
- **Seams del trasplante** — `publicarActaMasiva`, `suscribirseActasRuntime` y
  `registrarCargaMasiva` conectan motor y monitor.
- **`idEnlace`** = `<dept>_<mun>_<zona>_<puesto>` (p. ej. `88_495_010_02`).
  Es la clave de join entre el acta, el catálogo y el monitor.

Detalle completo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Pipeline de una foto

1. **Ingesta** — cola persistente en IndexedDB; acepta JPG/PNG/HEIC, PDF, ZIP y RAR.
2. **Sondeo QR** — intento temprano y en paralelo; el payload se hereda entre capas.
3. **Detección y warp** — OpenCV localiza el marco del acta y corrige perspectiva.
4. **Deduplicación** — dhash perceptual (64 bits) + SHA-256 exacto por bytes.
5. **OCR** — RapidOCR PP-OCRv4/v5 en WASM; Tesseract y sidecar nativo como rutas alternativas.
6. **Calidad y gate** — score: `≥8` ÓPTIMA, `≥6.5` ADVERTENCIA, `<6.5` RECHAZADA.
7. **Completitud y marcadores** — recortes y actas sin votos se vetos con cap 6.4.
8. **Clasificación y publicación** — se normaliza a `idEnlace`, se valida (D25) y
   se publica en el monitor o queda en cuarentena con motivo.

## Requisitos

- **Bun 1.3.x** (gestor y runtime de scripts; `bun.lock` es la fuente de verdad).
- Node.js 20 solo si usas herramientas que lo exigen.
- Navegador con WebAssembly y `createImageBitmap` (Chrome/Edge/Firefox recientes).

## Arranque

```bash
bun install
bun run dev          # http://localhost:3000
```

`predev` ejecuta `bun run preparar`: genera el worker de QR y materializa
`public/vendor/onnxruntime/` (68 MB) desde `node_modules`; no se versiona.
Un clon limpio queda operativo tras `bun install`.

### Scripts

| Comando | Qué hace |
|---|---|
| `bun run dev` | Servidor de desarrollo en el puerto 3000. |
| `bun run build` | Export estático a `out/` (con `preparar` previo). |
| `bun run typecheck` | `tsc --noEmit` en modo estricto. |
| `bun run lint` | ESLint (flat config). |
| `bun test` | Suite de `bun:test` (31 archivos, 354 pruebas). |
| `bun run verificar` | typecheck + lint + test, la misma puerta que CI. |

Pruebas opcionales de medición (no son gates): `scripts/bench-navegador.mjs`,
`scripts/ort-bench.mjs`, `scripts/cf-wasm-partes.mjs --dry-run`.

## Despliegue

La app es **export estático puro** (sin rutas de API ni servidor): `output:
"export"`, `basePath` inyectado por `NEXT_PUBLIC_BASE_PATH`, `trailingSlash` e
imágenes sin optimizar.

- **Cloudflare Pages (canal primario):** `public/_headers` habilita
  `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy:
  require-corp`, lo que activa `SharedArrayBuffer` y el OCR multihilo. Los wasm
  que superan el límite de 25 MiB se parten en el build y una Pages Function los
  reensambla por la misma ruta.
- **GitHub Pages (canal secundario):** sirve el mismo export sin cabeceras; en
  esa URL el OCR corre con un hilo. `.nojekyll` es obligatorio.

Los detalles operativos —y la matriz de errores— están en
[`docs/RUNBOOK-deploy-pages-v1.md`](docs/RUNBOOK-deploy-pages-v1.md).

## Datos y privacidad

- **DIVIPOLA:** el catálogo maestro (14.438 puestos) vive en el repo pero
  **nunca se importa**; el código consume solo el derivado exterior validado
  (949 puestos, 67 países, 3.670 mesas).
- **Actas de demostración:** son documentos públicos, recomprimidos para no
  inflar el repo (JPEG q70–q72 y WebP q75; ~3,3 MB en total). No se versionan
  fotos de particulares ni datos personales.
- **Sin telemetría remota:** no hay backend, ni cuentas, ni envío de datos a
  terceros. El histórico de deduplicación y las métricas viven en IndexedDB local.

## Límites conocidos

- Publicación y recepción en memoria: recargar restablece (por diseño, sin backend).
- El monitor lista 949 puestos sin paginación ni virtualización.
- En GitHub Pages el OCR es mono-hilo (sin COOP/COEP).
- El sidecar nativo es un ZIP sin firmar para Windows x64; SmartScreen lo advierte.
- El ledger remoto de envíos está cortado (`LEDGER_REMOTO_ACTIVO = false`).

Deuda y pendientes priorizados: [`docs/DEUDA.md`](docs/DEUDA.md).

## Estructura del repositorio

```
.github/workflows/   CI, deploy GH Pages, deploy Cloudflare y release del sidecar
functions/           Pages Function que reensambla los wasm partidos
native/              Sidecar Python (OCR nativo opcional)
public/              Modelos ONNX, diccionarios, wasm, workers y catálogo DIVIPOL
scripts/             Preparación de assets, partición de wasm y benchmarks
src/app/             Entrada Next (una sola página)
src/modules/         Producto (ver arriba)
src/shared/          Utilidades transversales
docs/                Arquitectura, ADR, mediciones, notas OCR/QR y runbooks
```

## Documentación

| Documento | Para qué |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Módulos, flujo de datos, invariantes y contratos. |
| [`docs/adr/README.md`](docs/adr/README.md) | Decisiones (D1–D82) con mapa de supersesión. |
| [`docs/MEDICIONES.md`](docs/MEDICIONES.md) | Números reales de rendimiento y calidad. |
| [`docs/NOTAS-OCR-QR.md`](docs/NOTAS-OCR-QR.md) | Router OCR, modelos y cadena de decodificadores QR. |
| [`docs/DEUDA.md`](docs/DEUDA.md) | Lo que falta, lo cortado y sus condiciones de retorno. |
| [`docs/RUNBOOK-deploy-pages-v1.md`](docs/RUNBOOK-deploy-pages-v1.md) | Despliegue Cloudflare y wasm partido. |
| [`docs/RUNBOOK-sidecar-instalable-v1.md`](docs/RUNBOOK-sidecar-instalable-v1.md) | Empaquetado y uso del sidecar nativo. |
| [`docs/auditoria/GUIA-AUDITORIA-supervision-e14.md`](docs/auditoria/GUIA-AUDITORIA-supervision-e14.md) | Guion de verificación funcional. |

## Contribuir

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de abrir un PR. Para reportar una
vulnerabilidad, sigue [`SECURITY.md`](SECURITY.md).

## Licencia

[MIT](LICENSE).
