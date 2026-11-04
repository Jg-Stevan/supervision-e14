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

## 3. Operación y despliegue

- **Cloudflare Pages:** verificar en cada despliegue que COOP/COEP llegan y que
  los dos wasm grandes se sirven por la Function con el tamaño correcto. La
  matriz de errores está en el runbook.
- **GitHub Pages:** sigue publicando en paralelo sin cabeceras (OCR mono-hilo).
  Retirarlo cuando migre el DNS.
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
- **`AGENTS.md` no existe** aunque documentación histórica lo menciona; las
  reglas para agentes viven hoy en `CONTRIBUTING.md` y `docs/adr/README.md`.
