# Decisiones (ADR condensado)

Registro de las decisiones que sostienen el producto. Sustituye al antiguo
`docs/DECISIONS.md` (123 KB) conservando **todas** las decisiones y su estado.
Cada `Dxx` es estable: los comentarios del código lo citan.

Cómo leerlo: **VIGENTE** = sigue en pie; **SUPERADA por** = no la apliques, usa la
nueva; **OBSOLETA** = el código ya no existe. Ante duda, el código y las pruebas
mandan sobre este documento.

> **Aviso de numeración:** los registros son POR REPO y pueden divergir — citar
> siempre `Dxx-sup` o `Dxx-dig` (plan 2026-11-12 §0). El motor trasplantado cita
> `Dxx` de su repositorio de origen (p. ej. D44, D57, D61, D63–D66, D74 y
> D89-dig) que **no** son los de esta tabla.
> Nunca confíes en el número sin leer el contexto. Faltan D32 y D65–D74: nunca se
> escribieron aquí (D32 se perdió sin push).

## Tabla de decisiones

| ID | Decisión | Estado | Esencia |
|---|---|---|---|
| D1 | Stack exacto | VIGENTE | Next.js 16 App Router, TS estricto, Tailwind 4, shadcn New York, lucide. Estado mínimo. |
| D2 | Frontera de módulo dura | VIGENTE | Todo el producto vive en `src/modules/**`; el trasplante es mover la carpeta. |
| D3 | Repo separado temporal | VIGENTE | Repo independiente para fundar el módulo sin tocar el digitalizador. |
| D4 | Tema solo dark | VIGENTE | Un único tema, tokens custom, radio 4 px, cero sombras; jerarquía por borde y tono. |
| D4.a | Ámbar canónico | VIGENTE | `#ffd600` como `--warning` y PENDIENTE. |
| D5 | Mock detrás de interfaz | VIGENTE | `SupervisionRepository` es el único punto de datos; el mock se sustituye sin tocar UI. |
| D6 | Consistencia de KPIs | SUPERADA por D21 | Los KPIs mandaban sobre el mockup; hoy se derivan del catálogo real. |
| D7 | Ajustes técnicos | VIGENTE | Diez ajustes de implementación sin cambio de alcance (sticky, selects, targets 44 px…). |
| D8 | Export estático + basePath | VIGENTE | `output: "export"`, `NEXT_PUBLIC_BASE_PATH`, `trailingSlash`, `.nojekyll`. |
| D9 | Firma de `LayoutProps` | VIGENTE | Firma estándar para que `tsc` pase sin typegen. |
| D10 | Tabla sin scroll a 1440 px | VIGENTE | Compactar paddings para exceso horizontal 0; por debajo se acepta scroll. |
| D11 | Vistas por estado, no rutas | VIGENTE | Una sola página; la navegación es estado del shell. |
| D12 | Repositorio async + mutaciones | VIGENTE | Lecturas `Promise` y mutaciones para anticipar el contrato real. |
| D13 | Simulación de vida | VIGENTE | Una fuente de verdad deriva estados; el ticker aplica una transición cada ~45 s. |
| D14 | Sidebar overlay | VIGENTE | Oculta por defecto, panel flotante con scrim; maximiza la tabla. |
| D15 | Informes client-side (Blob) | OBSOLETA (D82) | La mecánica era correcta; la vista de informes fue borrada. |
| D16 | Ajustes de datos | VIGENTE | Porcentajes derivados de mesas reales; estado de lectura solo en UI. |
| D17 | Visor modal por estado | VIGENTE | Modal, no ruta; 3 entradas; se desmonta al cerrar. |
| D18 | Acta sintética vectorial | VIGENTE | JSX/SVG A4, sin binarios; zoom/rotación/contraste CSS y seed determinístico. |
| D19 | Trazabilidad + acciones | PARCIAL (D46) | APROBAR y CONFIRMAR RESCANEO salieron de la UI; su lógica duerme. |
| D20 | Retiro temporal por flag | SUPERADA por D82 | Notificaciones e informes se ocultaban; hoy están borrados. |
| D21 | Catálogo DIVIPOLA como fuente | VIGENTE (supersede D6) | 949 puestos exteriores; el maestro de 14.438 nunca se importa; invariante de suma. |
| D22 | `idEnlace` como clave de join | VIGENTE | `<dept>_<mun>_<zona>_<puesto>` como strings de ancho fijo; solo la zona lleva padding. |
| D23 | Acta real = imagen + impresión | VIGENTE | Se muestra, no se interpreta. Prohibido leer votos. |
| D24 | Contrato manifest + assets | VIGENTE | Manifest JSON, assets estáticos, clave `${idEnlace}::${mesa}`, loader memoizado. |
| D25 | Validación + cuarentena | VIGENTE | idEnlace existe, mesa válida, formulario conocido, páginas continuas, asset importable. |
| D26 | Ancla El Cairo | VIGENTE | Se fuerza COMPLETO para que su acta real sea alcanzable; Roma no cambia. |
| D27 | Trasplante de carga masiva | VIGENTE | Motor real dentro del repo, adaptador de 5 puntos y publicación al monitor. |
| D28 | Recepción de actas | VIGENTE | Log por página con PUBLICADA / BLOQUEADA / SIN_JOIN; sin persistencia. |
| D29 | Ledger remoto cortado | VIGENTE | `LEDGER_REMOTO_ACTIVO = false`; cada función conserva su contrato. |
| D30 | Payload QR heredado | VIGENTE | `qrPrevio` evita 3-4 decodes por fila; si falta, cae al comportamiento previo. |
| D31 | Carril QR paralelo + pool 1 | VIGENTE | OCR wasm mono-hilo: pool 1 y prescan en paralelo. |
| D33 | REINICIAR ENVÍOS | VIGENTE | Reset explícito de cola, ledger y dedup; `vaciar()` sigue intacto. |
| D34 | Métricas + informe de carga | VIGENTE | Observador pasivo en 4 puntos, IDB separada y panel de KPIs. |
| D35 | Motivos honestos de lectura | VIGENTE | Separar ARCHIVO_ILEGIBLE y PDF_PROTEGIDO; miniatura conservada (3 ms). |
| D36 | Auditoría de reglas | VIGENTE | AUTO sin QR, cortocircuito del sondeo y orden de capas confirmados. |
| D37 | Cloudflare + COOP/COEP | VIGENTE | `_headers` habilita SharedArrayBuffer y OCR multihilo; GH Pages quedó retirada (2026-11-12) y Cloudflare Pages es el canal único. |
| D38 | Autonomía de recursos | VIGENTE | Tier ALTO amplía a 2 workers si hay hilos reales; gobernador reactivo. |
| D39 | Parche auditoría | VIGENTE | Cache inmutable del motor, pausa del ticker oculto y purga de artefactos. |
| D40 | Capa 0 QR al worker | VIGENTE | Worker jsQR-only evita bloquear el hilo UI 15-17 s. |
| D41 | Cola sin materializar/compactar | VIGENTE | `leerRegistroRaw` para lecturas que no muestran fotos. |
| D42 | Monitor memoizado | VIGENTE | Contexto hoja + valor memoizado + `PuestoRow` memo. |
| D43 | Etapas pre-OCR visibles | VIGENTE | `preOcrMs` y sub-etapas medidas como observador pasivo. |
| D44 | Tiempos v2 | VIGENTE | Sub-desglose QR/origen/deskew/master, `tsInicio` y re-arms del watchdog. |
| D45 | Huecos de medición | VIGENTE | `gapMs`, publicación real, cierre de corrida y dedup sin match. |
| D46 | REPORTAR ANOMALIA única acción | VIGENTE | Aprobar/rescanear salen de la UI del visor. |
| D47 | Header con dropdowns nativos | VIGENTE | Mesa/ORIGEN/PÁGINA nativos; sin chips de hora/motivo. |
| D48 | Toolbar sin AJUSTAR + SCORE | VIGENTE | Ajuste por doble clic; chip SCORE real al final. |
| D49 | Pantalla completa real | VIGENTE | Fullscreen API + `fullscreenchange`; fallback sin chrome. |
| D50 | VER ORIGINAL | VIGENTE | Solo con foto real; alterna original/procesada. |
| D51 | Caption-bar full-width | VIGENTE | Estado + etiqueta + PÁG a la izquierda; impresión verbatim a la derecha. |
| D52 | Historial estilizado | VIGENTE | Puntos por semántica del evento existente; hora local y dual. |
| D53 | Predicado único de visibilidad | VIGENTE | `actaVisibleEnMonitor` en 3 entradas, navegación y hash. |
| D54 | Unificar `modoMonitor` | VIGENTE | Un solo visor; el flag desaparece. |
| D55 | Auditoría del kit | VIGENTE | Cero diffs en motor, sin sombras/hex, export intacto, suites verdes. |
| D56 | Edición solo por ✎ EDITAR | VIGENTE | ✂/↩ fuera de la toolbar; DESHACER dentro del editor; targets 44 px. |
| D57 | Fila de estado intacta | VIGENTE | La captura del mantenedor manda sobre la fila ENVIADA. |
| D58 | ✕ flotante se conserva | VIGENTE | CERRAR y Escape son salidas adicionales. |
| D59 | Sin «IMG i/N» | VIGENTE | La posición la comunican los chevrons. |
| D60 | Dos toques en ACEPTAR/RECHAZAR | VIGENTE | Confirmación armada; desarme a 3 s solo en ACEPTAR. |
| D61 | Motivo también al ACEPTAR | VIGENTE | Excepción ordenada por el mantenedor; store y ledger intactos. |
| D62 | Contraste biciclo en masiva | VIGENTE | NORMAL↔NEGATIVO solo en masiva; el trío del monitor no se toca. |
| D63 | Editor de perspectiva 8 puntos | VIGENTE | Detección que solo propone, ROTAR reproyecta, DESHACER propio. |
| D64 | Franja de metadata full-width | VIGENTE | Punto lleno, país en mayúsculas, código espaciado visual. |
| D75 | Error real del bridge se reintenta | VIGENTE | Sesión OCR muerta es transitoria; mismo cupo y recuperación única. |
| D76 | Sidecar nativo al repo | VIGENTE | Código y requirements versionados; `.gitattributes` protege binarios. |
| D77 | Wasm desde R2 | SUPERADA por D80 | Pages corta en 25 MiB; R2 exigía consentimiento humano (API 10042). |
| D78 | `_headers` de un solo bloque | VIGENTE | Pages aplica solo la última regla que casa; el duplicado anulaba COOP/COEP. |
| D79 | Techo del prefetch manda | VIGENTE | 20 s → 45 s hace heredar QR a todas las filas (82 s → 53 s). |
| D80 | Wasm partido en build | VIGENTE | Partes ≤20 MiB + Pages Function que las pega; `_routes.json` obligatorio. |
| D81 | Sidecar instalable en ZIP | VIGENTE | PyInstaller `--onedir` como Release; allow-list de orígenes y PNA. |
| D82 | Borrar notificaciones e informes | VIGENTE | 554 líneas inalcanzables eliminadas; el dato de notificaciones queda sin vista. |
| D83 | Motor vendorizado en el repo | VIGENTE | `@jg-stevan/scanner-core` (npm) se copió a `src/modules/digitalizador/lib/e14/core/` (6 módulos) y a `src/lib/e14/core/` del hermano (12 tras la poda), desde `web-scanner@feba267` = 0.4.1. La paridad ya no la da la versión de npm sino `core/CONTRATO.json` + `core/__tests__/contrato-core.test.ts` (corre en CI) y `scripts/qa-core-vendorizado.ts` (18 chequeos acá; 26 en el móvil, donde el mismo harness además contrata la capa UI vendorizada de su D83 y acá ese chequeo sale «omitido» — este panel tiene visor propio). El md5 del contrato se calcula sobre contenido normalizado a LF — los working tree están en CRLF y `.gitattributes` fija `eol=lf`. Editar el motor = misma edición en los dos repos, `--generar` en los dos. |
| D84 | El rescate HEIC va topado | VIGENTE | Kit `e14-heic-tope-v1` en `core/image-processor.ts` (compartido byte a byte con el hermano): heic2any 0.0.4 **no** admite `width`/`height` — decodifica a resolución nativa, así que recortar dentro de la conversión es imposible. El arreglo real es olfatear las dimensiones desde el contenedor ISO-BMFF (`dimensionesHeic` → `meta`→`iprp`→`ipco`→`ispe`, el ítem de mayor área) antes de decodificar, rechazar sobre `HEIC_TOPE_MP_DEFECTO` = 24 MP, y limitar el rescate a `HEIC_LIMITE_MS_DEFECTO` = 45 s (debajo del watchdog del puente, 120 s). Sin dimensiones ciertas se marca, no se rellena: `dimensionesHeic` devuelve `null` ante cualquier duda y el flujo sigue el decode de siempre. Flags `heicTopeMp`/`heicLimiteMs` con kill-switch en 0 y doble whitelist (`flags.ts` + `obs/politica.ts`). En este repo el tope vive en el guardabarros de `masiva/archivos.ts` (`maestroDeImagen`), que devuelve `null` y deja pasar la reserva. |
| D85 | Los binarios de `public/` se materializan, no se versionan | VIGENTE | Modelos OCR, OpenCV y vendor de npm salen del índice: `scripts/sincronizar-vendor.mjs` copia Tesseract/zxing/zbar desde `node_modules` (sin los `.wasm` crudos, que el worker no pide) y `scripts/preparar-assets.mjs` descarga OpenCV + RapidOCR + `spa.traineddata` con URL y SHA-256 fijados en `scripts/assets.lock.json`; `preparar` corre en `predev`, `prebuild` y CI. El `spa.traineddata.gz` pasa al `.gz` de naptha/tessdata (commit fijo): mismo traineddata de 13.570.187 bytes, distinto empaquetado gzip. `public/models/** eol=lf` dejó de aplicar a binarios (ahora `binary` explícito). La purga del historial (`git filter-repo`, SHA previo `0386fa1`) fue autorizada por el mantenedor como excepción a la regla de no reescribir historial: pack 49,3 MB → 5,87 MB; respaldo en bundle `--all`.

| D86 | La ventana §6.7 manda sobre el orden de motores | VIGENTE | La telemetría de lectura por acta (`MetricaActa.lectura` y `PerfActa.lectura`) alimenta un `lecturaResumen` en el informe de corrida: `porAceptante[m].msPorActa` es el número de la comparación. **Criterio: min ms/acta aceptada con falso-acepto = 0** (muestra ≥ 50 AUTO por motor; un falso-acepto descalifica). Se cierra con ≥ 2 semanas o ≥ 500 actas aceptadas. Un candidato solo cambia el default si mejora ≥ 15 %, y el cambio es **solo por configuración** (orden = datos, históricos inyectados). Mientras no haya datos el default **no se toca** — decidir sin ventana repite el error del router (decidía antes de leer). Protocolo completo en `docs/MEDICIONES.md` §9. |

| D87 | Remediar fotos reales y botón DEMO | VIGENTE | Las 6 fotos REALES del consulado (20261028_*) salen del HEAD y del bundle; el lote DEMO pasa a 4 fixtures sintéticas del modo SIM (`acta-sim-*.jpg`) y el botón exige doble cerradura: flag `loteDemoLocal` + `NODE_ENV !== "production"`. **Cierra:** hallazgos #1, #2 y #3 de la auditoría 2026-11-11 (T2.1+T2.2). **Evidencia:** `rg 20261028 src/` = 0, `rg 20261028 out/` = 0; `bun run verificar` verde. |
| D88 | Fallback honesto y envío sin clasificación vetado | VIGENTE | `construirActa` y `actaTimeoutWatchdog` nacen sin datos de demostración: título «ACTA SIN IDENTIFICAR», ubicación «—», `candidatos: []`, firmas sin nombres y `codigoBarras` omitido; `camposSinIdentificar`/`firmasSinIdentificar` son la única fuente. Gate G5 del mantenedor: sin join DIVIPOL completo (`joinDeActa`) no hay envío automático ni manual. **Cierra:** hallazgos #9 y #10 (T2.3). **Evidencia:** `sin-relleno-produccion.test.ts` (T5.2) + 511 tests verdes. |
| D89 | El panel de supervisión se declara DEMO | VIGENTE | Banner persistente y no descartable «PANEL EN MODO DEMO — estados sembrados localmente; sin conexión con el digitalizador real» (G3=A); el punto de intercambio (`datos-provider.tsx` → `mock-repository`) queda documentado; el ancla Roma #A92-F y las notificaciones/anomalías sembradas viven detrás del flag `anclaDemoSupervision` (default false: panel vacío). **Cierra:** hallazgos #4, #5, #6 y #7 (T2.4). **Evidencia:** banner en `supervision-shell.tsx`; `ancla-demo.ts` + preload de tests. |
| D90 | Reescritura de historia preparada, no ejecutada | VIGENTE | `scripts/reescribir-historia-supervision-e14.sh` purga `actas-demo/`, `actas-reales/assets`, `acta-e14-real.jpg` y `capturas-actas-reales-v1`, conserva el manifest metadata-only vigente y `actas-reales.ts`, exige bundle `--all`, `--force-with-lease` y eco del SHA previo; `PURGA_MANIFEST_ORIGINAL=1` por defecto (G2 del mantenedor). **Cierra:** hallazgo #8 (T2.5). **Evidencia:** `bash -n` OK; SHA previo de `main` al preparar: `440924900e8b555f430d6c2582badda40e9803cf`; ejecutado por el mantenedor el <pendiente>. |
| D91 | Higiene de comentarios y guardarraíl | VIGENTE | Los comentarios que citaban valores del mock (`*E14-SEN-…*`, «ROMA - CONSULADO», archivos 20261028) describen ahora el fallback honesto; test permanente que prohíbe `ACTA_MOCK` en `acta-factory.ts`/`runner-watchdog.ts`, exige el fallback honesto y vigila que `src/` no mencione `20261028` (T2.6+T5.2). **Evidencia:** `bun run verificar` verde. |
| D92 | Contención del hub local (olas 0) | VIGENTE | Endurecimiento de `scripts/hub-local.mjs` según el plan 2026-11-11: **C-01** toda ruta mutante (`POST /v1/actas`, alias `/actas`, `POST /hub/reset`) valida origen+Host contra una lista fija construida al arrancar (anti-CSRF y anti DNS-rebinding) y el reset exige además `x-hub-reset: confirmar` con registro en consola; **C-02** el cert TLS vive en `.hub-local-cert/` FUERA del almacén — el reset jamás lo borra y los celulares no re-aceptan el aviso; **C-03** solo se aceptan `data:image/(jpeg|png|webp);base64` (SVG/gif → 400), `/foto/<seq>` sirve el mime VALIDADO en recepción (jamás eco del dataURL) y todas las respuestas llevan CSP + `X-Content-Type-Options: nosniff`; **C-04** cuota de filas/bytes (507, `HUB_CUOTA_FILAS`/`HUB_CUOTA_BYTES`) y rate limit por IP en memoria (30/min mutantes, 120/min lecturas, 429 con `Retry-After`); `/hub/estado` ya no expone rutas de disco; **C-05** claves reservadas del sobre (`seq/ts/dispositivo/hashHub`) sanitizadas — la entrada jamás pisa metadatos del hub; **C-06** `MAX_PAGINA` 500 + respuesta con `hay`/`proximoSeq`/`total` y drenaje por cursor-SEQ en el panel (`hub-local-drenaje.test.ts`: 210 filas → 210 procesadas); **C-13** `DELETE /v1/actas/:seq` con `x-hub-admin` (clave impresa al arrancar) + auditoría `expurgo.jsonl`; **C-16** `generacion` (UUID persistido) cambia en cada reset y el panel re-sincroniza con aviso. **Evidencia:** `hub-local.test.ts` ampliado + prueba manual con curl. |
| D93 | Panel honesto: horas, monitor y chips (olas 1–2) | VIGENTE | **C-07** ORIGEN real: el sobre trae `tsEscaneo` (gate del móvil); sin él la vista muestra `ORIGEN —` — la síntesis `LATENCIA_CICLO_S` quedó eliminada (`rg` = 0) y la latencia media solo se calcula con pares reales; **C-15** REC = `ts` del hub (`fechaRecepcionHub`) — dos horas honestas y distintas; **C-16** detección de reset del hub por `generacion` + botón «Re-sincronizar con el hub»; **C-17** VER EN MONITOR respeta el `tipo` del sobre (el visor pinta el formulario recibido, no la sembrada); **C-18** panel en `h-dvh` con zonas internas scrollables (cero doble scroll; REVISIÓN con un solo scroll); **C-20** `ChipScore` clampea a [0,10] y el hub rechaza score fuera de escala; **C-24** chip Online = `navigator.onLine` Y último sondeo; texto «EN TRANSPORTE» corregido; **C-32** README describe el lote sintético vigente; **C-34** el script de reescritura vive en `scripts/reescribir-historia-supervision-e14.sh` (autonomía del repo a purgar). **Evidencia:** tests de drenaje y recepción verdes; `rg "3,3 MB|q70" README.md` = 0. |
| D97 | D82 se cierra RENDERIZANDO el dato vivo (P-28) | VIGENTE | El estado de notificaciones del provider (sembrado + generado por anomalías y carga masiva, con toasts en el flujo) volvió a tener UI: chip de campana en el header con badge de NO leídas + panel flotante (no leídas primero, tope 8, techo de scroll), marcar leída por ítem y «marcar todas». La alternativa de P-28 (retirar el estado con ADR) se descarta: las acciones del producto producen notificaciones de verdad — dejar el estado muerto era la deuda; resucitar el centro de 554 líneas era lo que D82 borró con razón. Coherente con D89-sup (el chip vive bajo el mismo banner de modo demo). |
| D96 | Los 2 commits UI de dig (78a9d09, f2dc192) NO se portan (T-13) | VIGENTE | Pantallas sin scroll + cámara fullscreen (78a9d09: ReviewView/ScanView/globals.css) y el posponer el disparo automático cuando el acta toca el borde del encuadre (f2dc192: `frame-loop.ts`/`quality.ts` de dig) son features del MÓVIL de captura única. sup no las tiene ni las necesita: no hay `getUserMedia` ni auto-captura ni ScanView/ReviewView aquí — el flujo es MASIVA + puente desde el móvil. Decisión de no-port documentada (plan 2026-11-12, T-13: «PR espejo o decisión documentada de no-port»). |
| D95 | KIT fusion-evidencia-divipol-v1 — integración en espejo (T-11) | VIGENTE (motor integrado, flag APAGADO) | La identificación del acta pasa a disponer del motor de FUSIÓN de evidencia `(PAÍS + CONSULADO + ZONA + PUESTO + MESA) ⊕ TIPO ⊕ PÁGINA` de `packages/scanner-core/src/dominio/fusion.ts` (+ `fusion-tipos.ts`, `normalizar.ts`, test `tests/fusion.test.ts`; `clasificador.ts` expone `leerCamposCrudos`) — los 5 módulos del paquete son BYTE A BYTE los del PR #158 de digielect14 y cotejan idénticos en `scripts/qa-paridad-motor.ts` (T-16). **Decisión origen: D89-dig** (2026-11-11) — pesos exactos y umbrales registrados allí (depto 6 · país código 40/30 · nombre país dice×35 · zona 14 · puesto 20 · lugar dice×30 · acuerdos 8 · mesa 20 · fuera de rango −45; AUTO ≥85/gap≥8/≥2 grupos · SUGERIDA ≥55/gap≥4 · lo demás MANUAL). En sup el motor NO decide nada del envío: con `fusion_evidencia=true` el pipeline SOLO LOGUEA la resolución (`[e14] fusion NIVEL gap=… mejor=… grupos=… avisos=…`) a la altura de la clasificación de cabecera (`pipeline.ts`, adaptador `fusion-lectura.ts` sobre `leerCamposCrudos`). Kill-switch `fusion_evidencia` con default `false`, tabla única de flags R2 (`flags-schema.ts`) sirve la whitelist a las dos puertas (sanearFlags + leerOverridesFlags) — en sup NO hay doble whitelist a mano. Apagado, el pipeline queda byte a byte el de hoy. | La fusión ya estaba validada e integrada en el gemelo (PR #158, flag apagado, 223 líneas de test) y el plan 2026-11-12 (A-07/T-11) recomienda integrarla en sup en vez de «probar o descartar»: el contenido de la rama `feat/fusion-evidencia-divipol` es byte a byte el que dig ya corre en main. |
| D94 | MASIVA local por diseño + rearme sin re-armar | VIGENTE | **C-14 (decisión de producto)**: la carga MASIVA NO publica en el hub por diseño (D8 — export estático; la «publicación» es el monitor en memoria de sesión + ledger IDB) — se RATIFICA y los copys lo dicen: «PUBLICADAS / YA PUBLICADAS» en la bandeja y chip «YA PUBLICADA» en la fila (nada sugiere red; el envío al hub es SOLO del flujo individual vía puente). Sidecar como acelerador opcional se mantiene. **Rearme corregido:** `recuperarCola(excluir)` respeta los ids EN VUELO del runner de la sesión (`idsEnVuelo()` desde runner — el guard nace con la sesión, así que los zombis reales de una caída siguen recuperándose); re-montar la vista MASIVA a mitad de OCR ya NO re-arma la fila a PENDIENTE 0 % (el síntoma del informe), y la recuperación queda registrada en traza (`[e14] masiva recuperarCola {zombis, recuperados, vivosRespetados}`). **C-22/C-23 (sidecar)**: `Origin: null`/vacío → 403 EXPLÍCITO sin cabeceras permissivas (allowlist lazo/Pages/E14_ORIGENES; file:// del mantenedor SOLO con `E14_ORIGENES="null"`), calentamiento apuntado a las fixtures vigentes `acta-sim-*.jpg` con fallback frío silencioso, y la promesa del README nativa ajustada. **Evidencia:** prueba curl del runbook §B.6; `py_compile` verde; calentamiento resuelve las 4 fixtures. |

## Mapa de supersesión

- **D21 → D6:** los KPIs dejan de ser literales y se derivan del catálogo; la invariante de suma se conserva.
- **D80 → D77:** se elimina R2, `[[r2_buckets]]` y `scripts/cf-r2-wasm.mjs`; se conserva el diagnóstico del límite de 25 MiB.
- **D82 → D20 / D15:** las vistas de notificaciones e informes se borran; el dato de notificaciones sigue vivo sin UI.
- **D46 → D19 (parcial):** aprobar y confirmar rescaneo salen de la UI del visor y duermen en el store.
- **D38 → D31 (parcial):** pool 1 sigue por defecto; el tier ALTO con hilos reales lo amplía a 2.
- **D37 → D8 (parcial):** el export estático sigue; Cloudflare es el canal primario con cabeceras.
- **D26 + ancla Barcelona-Girona:** dos puestos forzados para que las actas reales sean alcanzables.

## Invariantes que el código cita

1. **Join por `idEnlace` (D22).** Códigos como strings de ancho fijo; solo la zona lleva padding 2→3. Romperlo desancla actas, anomalías y notificaciones.
2. **El maestro `divipola-puestos.json` nunca se importa (D21).** Importarlo mete 14.438 registros al bundle y rompe el guardrail.
3. **Cuarentena D25.** `validacion-d25.ts` es el validador único. Lo que falla no se publica.
4. **D23: no se leen votos.** Prohibido OCR o deducción en supervisión; la foto y la impresión se muestran tal cual.
5. **Contrato de manifest D24.** Claves `idEnlace`, `mesa`, `formulario`, `paginas[]`; clave `${idEnlace}::${mesa}`; assets estáticos.
6. **Seams D27.** `onVerEnMonitor` por props, superficie de 5 puntos del store y superposición del registro runtime.
7. **Anclas forzadas D26.** Quitarlas hace inalcanzables las actas reales y mueve el golden.
8. **Invariante de KPIs D21.** `total = completo + crítico + pendiente + no_iniciado`, exacto siempre.
9. **Válvula del ledger D29.** `LEDGER_REMOTO_ACTIVO = false` corta las tres funciones sin romper contratos.
10. **Predicado único de visibilidad D53.** `actaVisibleEnMonitor` en todas las entradas.
11. **Sin rutas nuevas (D11).** El export estático es una sola página.
12. **Frontera de módulo (D2).** Nada externo importa de un módulo salvo el shell mínimo.
13. **Estático puro (D8).** Sin API routes, backend ni persistencia remota.
14. **Contratos solo aditivos (D57).** Campos nuevos al final, opcionales, ausentes si no se midieron.
15. **El visor no muta contadores (D19/T5.7).** Solo acta, anomalías y notificaciones.
16. **zxing-wasm nunca en el worker de capa 0 (D40).** El worker es jsQR-only.
17. **`acta-viewer-modal.tsx` intocable desde masiva (D62).** Son componentes distintos.
18. **`vaciar()` intacto (D33).** El reset explícito es `reiniciarEnvios()`.
19. **Dark only (D4/D55).** Sin hex sueltos ni sombras.
20. **Despliegue (D78/D80).** `_headers` de un bloque `/*` y `out/_routes.json` obligatorio.

## Despliegue: estado final

La app es un export estático (D8). El canal único es **Cloudflare Pages**:
`public/_headers` lleva COOP/COEP, cache inmutable para
`/vendor`, `/models`, `/wasm` y `/_next/static`, y `must-revalidate` para
`/e14`. GitHub Pages quedó retirado — no permitía cabeceras, así que ahí
`crossOriginIsolated` era `false` y el OCR corría a un hilo; el workflow
`deploy-pages.yml` ya no existe (verificado 2026-11-12). Sin COOP/COEP en
cualquier otro host estático, el OCR sigue corriendo a un hilo.

Los dos wasm grandes de onnxruntime (jsep ≈27 MiB, asyncify ≈25,5 MiB) superan
el límite de 25 MiB por asset. D80 los parte en build en trozos ≤20 MiB y una
Pages Function los reensambla por streaming en la misma ruta. Requisitos:
`out/_routes.json` con `include` solo de los archivos partidos, manifiesto en
`/e14/` (no en `/vendor/`, que es inmutable), script idempotente y un servidor
local que haga el mismo ensamblado para medir.

El sidecar nativo se distribuye como ZIP `--onedir` (~108 MiB) desde un Release;
escucha en `127.0.0.1:8765`, aplica allow-list de orígenes y la app lo detecta
por `/salud`. La primera acta paga el recargo de arranque; el binario no está
firmado y SmartScreen lo advierte.

## Trampas conocidas

- **`_headers` duplicado:** Pages aplica solo la última regla que casa; duplicar `/*` deja producción sin COOP/COEP y sin error visible.
- **Wasm partido:** sin `_routes.json` acotado, la Function sombrea el estático y devuelve 404; el manifiesto en ruta inmutable sirve partes viejas.
- **No borrar todo `out/_next/static/media/*.wasm`:** se lleva `zbar.wasm` y `unrar.wasm`; borra solo lo que supera el umbral.
- **Benchmarks sobre build incompleto:** sin las partes, el navegador corre sin `jsep.wasm` y atribuyes a un commit lo que es un 404.
- **Proxy vs asyncify:** el worker proxy pide `asyncify.wasm` directamente; quitarlo no es gratis.
- **CRLF:** convierte binarios y diccionarios en basura; `.gitattributes` lo evita.
- **`ocrNativoUrl` por defecto:** convierte el estado de la máquina en estado del test; el harness debe asumir sidecar ausente.
- **`onefile` vs `--onedir`:** onefile descomprime ~108 MiB en cada arranque (+12 s); usar onedir.
- **Primer arranque del sidecar:** el antivirus escanea el binario nuevo; no pongas un gate de tiempo ahí.
- **Benchmarks de 5 s:** la banda se rompe con cualquier carga de la máquina; no son gates.
- **Colisión de IDs:** los comentarios del motor citan D44/D57/D61/D63–D66/D74 del repo origen, con otro significado aquí.
- **README histórico:** describía solo GitHub Pages y decía «solo useState/useMemo»; no confíes en documentación vieja sin contrastar el código.
