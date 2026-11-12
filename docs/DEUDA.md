# Deuda y pendientes

Lo que falta, lo que está cortado a propósito y las condiciones para reactivarlo.
Prioridad: **P0** bloquea el uso real; **P1** afecta la experiencia o la
operación; **P2** mejora deseable.

## 1. Cortado a propósito (no es un bug)

| Tema | Estado | Cómo se reactiva |
|---|---|---|
| Ledger remoto de envíos (D29) | Apagado con `LEDGER_REMOTO_ACTIVO = false`; no hay endpoint. | Implementar `/api/e14/envios` y poner la constante en `true`; las tres funciones ya respetan su contrato. |
| Notificaciones e informes (D82) | Vistas borradas (554 líneas). El dato de notificaciones sigue vivo sin UI. | Reescribir la vista si el negocio la vuelve a pedir; no resucitar el flag D20. |
| Persistencia de publicación | Memoria de sesión por diseño (sin backend). | Requiere backend o almacenamiento remoto; cambia el modelo de despliegue. |
| Aprobación/rescaneo desde el visor (D46) | Lógica dormida en el store; única acción visible: REPORTAR ANOMALIA. | Volver a exponer las acciones y sus motivos obligatorios. |
| Fotos de Roma/Barcelona en TRANSMISIÓN | Sintéticas: la fuente solo trae CÓNSUL/EMBAJADOR. | Con seguir fotos reales, añadirlas al manifest con la convención actual. |

## 2. Pendientes funcionales

| Prioridad | Tema | Detalle |
|---|---|---|
| P0 | Sonda `/salud` del sidecar | Hoy `ocrNativoUrl` nace `null`, así que hosted no falla; si se activa el sidecar, falta apagarlo solo cuando deja de responder. |
| P1 | Recepción sin destino para `SIN_JOIN` | Queda en el log y se puede reclasificar en la bandeja, pero no tiene cola propia. |
| P1 | Publicación solo de AUTO | Las ADVERTENCIA no se publican aunque el gate las acepte; `autoEnvioUmbral` controla el envío, no el join del monitor. |
| P1 | Monitor sin virtualización | 949 filas se renderizan completas; prohibido inventar paginación. Medir antes de optimizar. |
| P1 | Regla ALTO depende de la red en el momento del escaneo | Debería condicionar solo la descarga de modelos (`sincronizarSoloWifi`), no la clasificación del equipo. |
| P1 | iOS atrapado en MEDIO | Sin `deviceMemory`/`performance.memory`, la ruta de inferencia no se cumple. Fix propuesto: renderer GPU + sonda ≥750. |
| P2 | `benchmark.score` no viaja al perfil headless | El motor reporta `null` honesto; solo refinaría el origen `medio-elegible-upgrade`. |
| P2 | R2 de calidad no ejecutada | Filtro de documento, deskew de fotos, recorte al marco, nitidez y PDF de entrega. Cada uno con flag. |
| P2 | R1.5 presupuesto dinámico del prescan | Opcional; no se hizo. |
| P2 | Sidecar sin firma | SmartScreen advierte; requiere VC++ 2015-2022; doble instancia en 8765 reparte tráfico. |
| P2 | Dedup del puente móvil solo por SHA-256 exacto | El embudo (`actas-runtime.publicarActaMasiva`) detecta reenvíos con `hashSha256` (identidad de página + hash de bytes), la misma capa exacta de masiva. Las otras dos capas de masiva — dhash64 perceptual (Hamming ≤ 6) y payload QR exacto — NO viajan en `EntradaPuente`: una acta re-fotografiada (bytes distintos, misma imagen) entraría como página nueva. Reactivar: añadir `dhash64` y el payload QR al sobre del hub (`digielect14/src/lib/e14/puente/tipos.ts`) y al índice del embudo. |

## 3. Operación y despliegue

- **Cloudflare Pages (canal único):** verificar en cada despliegue que COOP/COEP llegan y que
  los dos wasm grandes se sirven por la Function con el tamaño correcto. La
  matriz de errores histórica está en `docs/archivo/RUNBOOK-deploy-pages-v1.md`.
- **GitHub Pages: retirado (verificado 2026-11-12 — `deploy-pages.yml` ya no
  está en `.github/workflows/`).** Cloudflare Pages es el único canal; sin sus
  cabeceras COOP/COEP cualquier host estático corre el OCR a un hilo.
- **Wasm partido:** el manifiesto debe quedar en `/e14/`, no en `/vendor/`, y
  `out/_routes.json` debe incluir solo los archivos partidos.
- **Sidecar:** construir en Windows (PyInstaller no cross-compila), publicar con
  semver sin `v` y probar en una máquina limpia; el runner no reproduce
  SmartScreen.
- **Benchmarks:** no usarlos como gate; anotar carga de máquina y repetir.

## 4. Higiene del repositorio

- **El gate local no era reproducible en un clon limpio.** Ocho componentes
  `src/components/ui/*` (andamiaje shadcn: calendar, carousel, chart, command,
  drawer, form, input-otp, resizable) y `src/lib/db.ts` importaban `cmdk`,
  `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-hook-form`,
  `react-resizable-panels`, `recharts`, `vaul` y `@prisma/client` — ninguno de
  esos nueve paquetes está en `package.json` ni en `bun.lock`. En la máquina de
  desarrollo pasaban porque `node_modules` heredaba los paquetes de un
  `bunx shadcn add` antiguo; en CI (`bun install --frozen-lockfile` + `tsc`)
  `bun run verificar` estaba rojo desde el primer commit. Los nueve archivos se
  fueron: cero consumidores en `src`, `functions`, `scripts` y `native`, y no
  hay `prisma/` (el `@prisma/client` de `db.ts` no era ni generable). Lección
  para el gate: si algo se borra, hay que borrar también su import huérfano.
- **PENDIENTE DE DECISIÓN DEL MANTENEDOR — datos personales en un repo que va a
  público.** Dos niveles, verificados abriendo los archivos, no deducidos del
  nombre:
  · *Capturas de sesión* (`docs/capturas-actas-reales-v1/` y
    `docs/capturas-divipola-v1/`, quince PNG, 1,5 MB, cero referencias en el
    repo): pantazos del supervisor con actas reales abiertas; en la página 2 se
    leen nombres, cédulas y firmas de los jurados. **Ya retiradas del árbol de
    trabajo.**
  · *Assets que consume el producto*: ocho `*.webp` de
    `src/modules/supervision/data/actas-reales/assets/`, seis `*.jpg` de
    `src/modules/digitalizador/assets/actas-demo/` y `acta-e14-real.jpg`
    (3,3 MB). La página 1 lleva totales de votación (eso es público por ley),
    pero la página 2 —`E14_88_335_005_02_001_TRANSMISION-2.webp`, revisada—
    muestra **nombres, cédulas y firmas de tres jurados**, que son datos
    personales de particulares y contradicen la regla del propio repo
    («no commitees actas», `CONTRIBUTING.md` regla 10).
  **El commit `910c71f` ya está empujado a `origin/main`**, así que borrar del
  árbol no basta: purgar el historial exige reescritura (`git filter-repo`/BFG)
  + `push --force` — prohibida por la regla del repo sin autorización explícita —
  y además un ticket a GitHub para que limpie cachés y vistas. Opciones: (a)
  autorizar la reescritura antes de abrir el repo, (b) anonimizar las páginas 2
  (tapar firmas/cédulas) y re-empujar, (c) reemplazar los assets por fixtures
  sintéticos, (d) declararlos documentos públicos y asumir las firmas visibles.
  Ninguna se decidió aquí porque ninguna es reversible sin tocar el remoto.
- Los JSON de benchmark contienen texto OCR de actas reales: **nunca** se
  versionan (ya están ignorados).
- `public/vendor/onnxruntime/` y `public/scanner/capa0-qr.worker.js` se generan
  en `preparar`; si un clon falla al arrancar, ejecutar `bun run preparar`.
- Las actas de demostración son documentos públicos recomprimidos (~3,3 MB). Si
  se añaden nuevas, respetar el guardrail de `actas-reales` (≤10 assets y ≤2 MB)
  y recomprimir antes de commitear.
- Convención de nombres de assets: los archivos reales usan
  `E14_<idEnlace>_<mesa>_<FORMULARIO>-<pagina>.webp`; el manifest es la fuente de
  verdad aunque la etiqueta visible difiera (`DELEGADOS` vs `CÓNSUL/EMBAJADOR`).
- Algunos comentarios del motor citan documentos del repositorio de origen
  (`revision-v1`, `REPORTE-*`, `ESTRATEGIA-*`) que no se versionan aquí: son
  procedencia histórica, no enlaces. La versión vigente de esa evidencia está en
  `docs/NOTAS-OCR-QR.md`, `docs/MEDICIONES.md` y `docs/adr/README.md`.

## 5. Decisiones que conviene revisar algún día

- **Numeración duplicada:** los comentarios del motor citan IDs del repo origen
  (D44, D57, D61, D63–D66, D74) con otro significado. Unificar el registro
  exigiría renumerar comentarios; riesgo alto, beneficio bajo.
- **Faltan D32 y D65–D74** en el registro local: D32 se perdió sin push. Lección:
  hacer push al cerrar cada tarea.
- **`AGENTS.md` ya existe** (reglas para agentes: stack, reglas del producto,
  privacidad y paridad con `digielect14`). La documentación histórica lo
  mencionaba como ausente; las reglas de fondo siguen también en
  `CONTRIBUTING.md` y `docs/adr/README.md`, así que hay tres entradas y conviene
  que `AGENTS.md` apunte a ellas en vez de duplicarlas.

## 6. Knip (C-6.3 del plan de cierre 2026-11-12) — configurado y triado

`knip@5.44.1` entró a devDependencies (espejo de la config de `digielect14`,
réplica pedida por el plan). `knip.json` cubre: entries de app/tests/scripts/
Pages Functions (`functions/**` — D80 wasm partes) y el workspace
`packages/scanner-core` con su contrato real (el `exports` map expone cada
`src/*.ts` como subpath público, más `tests/` y `workers/`). Resultado:
0 archivos/dependencias/binarios sin declarar o sin usar a nivel bloqueante;
exports/tipos/duplicados restantes **en `warn` (no bloqueante)** — superficie
deliberada: catálogo shadcn/ui (`src/components/ui/**` + hooks stock), catálogo
de iconos del digitalizador, helpers `__resetXParaTest`, alias semántico
`TECHO_ESCUDO_FONDO`, y helpers de observabilidad.

Deuda conocida documentada (PR propio, fuera del cierre):

- **Dependencias fantasma de radix:** `src/components/ui/*` importa
  `@radix-ui/react-*` (estilo viejo) sin declararlos — resuelven por hoisting
  del paquete unificado `radix-ui` (que los declara como dependencias suyas).
  Migrar los imports al paquete unificado.
- **Huérfanos detectados por knip** (0 referencias): `obs/identidad.ts` y
  `status-dot.tsx` — ignorados en la config con retiro pendiente (regla: nada
  se borra directo).
- **`fflate` en `packages/scanner-core/package.json`:** sin uso en sup, pero
  usado por `workers/__tests__/capa0.test.ts` en dig — se conserva por la regla
  de simetría byte-a-byte del paquete (`ignoreDependencies` documentado).
- **T-16 (paridad):** `heic2any`/`onnxruntime-web`/`tesseract.js`/`zxing-wasm`
  se declaran en la RAÍZ aunque los consume el paquete vendorizado (imports
  dinámicos) — decisión explícita de `qa-paridad-motor.ts`; no quitarlos.
- `tw-animate-css` se consume vía `@import` de CSS (knip no ve CSS).

Verificación: `bunx knip` → **exit 0** · `bun run typecheck` → 0 errores ·
tests del paquete → 154 pass.
