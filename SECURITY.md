# Seguridad

## Reportar una vulnerabilidad

No abras un issue público. Escribe al mantenedor del repositorio
(`@Jg-Stevan` en GitHub) con:

- descripción del problema y componente afectado;
- pasos mínimos para reproducirlo;
- impacto estimado (confidencialidad, integridad del acta, disponibilidad);
- versión o commit donde lo observaste.

Recibirás acuse de recibo y un plan de corrección. No publiques detalles hasta
que exista un arreglo disponible.

## Modelo de amenaza

La aplicación es un **export estático** que corre en el navegador del usuario:

- **Sin backend ni cuentas.** No hay API propia, ni base de datos remota, ni
  envío de actas a terceros. La publicación vive en memoria de sesión.
- **Datos locales.** Cola, histórico de deduplicación y métricas se guardan en
  IndexedDB del navegador. Borrar los datos del sitio los elimina (y también
  restablece el estado de demostración).
- **Sidecar opcional.** El OCR nativo escucha en `127.0.0.1:8765`. El servidor
  aplica una allow-list de orígenes y cabecera *Private Network Access*; aun así,
  es un binario local sin firma: descárgalo solo desde el release oficial del
  repositorio.
- **Sin fotos reales en el HEAD (D35).** Desde el 2026-11-08 el repositorio NO
  versiona actas reales: el kit de práctica `actas-reales/` quedó
  **metadata-only** (encabezado impreso, barcode, códigos y paginación — sin
  imágenes) y el visor muestra el placeholder «foto retirada (D35)» o el
  documento sintético. Ver la sección «Decisión D35» más abajo.
- **Hub del puente.** Las actas que muestra el panel en vivo llegan del hub
  (`e14-puente`); el sondeo `GET /actas` viaja autenticado cuando el origen no
  es local (ver «Token de lectura» más abajo).

## Decisión D35 — actas reales retiradas del HEAD (2026-11-08)

Se aplicó la **opción A (anonimizar)** de la decisión D35 del mantenedor:

- **Eliminadas del HEAD**: las **8 fotos WebP** (4 actas × 2 páginas, según el
  propio manifest) de `src/modules/supervision/data/actas-reales/assets/`
  (~1,17 MiB en total) y la **copia JPG** `acta-e14-real.jpg`
  (~0,22 MiB) del módulo digitalizador. Corrección de cifra: eran **8 WebP +
  1 copia JPG (~9 imágenes reales)**, no «más de 10».
- **Manifest metadata-only**: `actas-reales-manifest.json` conserva la
  estructura (idEnlace/divipola, mesa, formulario, códigos impresos,
  paginación) sin referencias a archivo de foto, con el campo
  `"fotos": "eliminadas-por-D35"` y la nota de la decisión con fecha.
- **Evidencia de auditoría**: el manifest ORIGINAL (solo JSON, sin fotos)
  quedó en `docs/archivo/historico/actas-reales-manifest.original.json`
  (movido a archivo el 2026-11-12; la ruta histórica era
  `docs/historico/…` y el script de purga cubre las dos).
- **Historia git pendiente**: los blobs y los **nombres de archivo** (que
  revelan códigos DANE de mesa) siguen en la historia ANTERIOR a la purga.
  El rewrite es la tarea 1.3 del plan de remediación y se entrega como
  **script aparte** (`git filter-repo --invert-paths` sobre
  `src/modules/supervision/data/actas-reales`); mientras corra, el estado
  honesto es «HEAD limpio, historia pendiente».

## Token de lectura del hub (0.2 / H-2)

- El `GET /actas` del hub ya no es anónimo: sin credenciales → 401.
- El panel sondea con `Authorization: Bearer <token>` **solo contra orígenes
  NO locales** (criterio `esOrigenLocal` idéntico al del hermano:
  localhost/127./10./192.168./172.16-31 sin auth — coherente con
  `scripts/hub-local.mjs`, que no pide credenciales en LAN).
- **Dónde se configura**: vista **Configuración → «Token de lectura del hub»**
  del panel. El token vive SOLO en `localStorage["e14-token-lectura"]` del
  navegador del supervisor. Es una clave de LECTURA, distinta de la firma de
  escritura del puente.
- **Jamás en el bundle ni en el repo** (sin `NEXT_PUBLIC_*`, sin constantes).
  Criterio de cerrado: `grep` del bundle construido → **0 tokens embebidos**.
- Sin token configurado el sondeo sigue; un 401 se muestra ACCIONABLE en la
  tarjeta del hub («sin token de lectura: configúralo en Configuración»),
  nunca como fallo mudo.

## Privacidad, retención y responsable (0.6)

- **Qué se trata**: actas E-14 (foto procesada del formulario + metadatos de
  mesa/formulario/encabezado impreso). El panel no lee votos ni maneja
  nombres/cédulas como datos estructurados.
- **Retención**: las actas se **expurgan a 30 días** de la jornada, **o antes**
  si hay confirmación oficial de recepción (política fijada con 0.4 en
  `digielect14`); puede quedar solo hash + metadatos.
- **Responsable del tratamiento**: quien opera el hub y el panel.
- **Expurgo bajo demanda**: `DELETE` autenticado contra el hub (por hash o por
  jornada), con log del evento.
- El aviso al operador vive en el panel: vista **Configuración → «Privacidad y
  retención»**.

## Respuesta a incidentes (H-6)

Si se detecta una **escritura no autenticada** aceptada por el hub (actas
inyectadas por un tercero):

1. **Rotar** `CLAVE_JORNADA` y `CLAVE_JORNADA_PREVIA` (la rotación mata las
   firmas futuras del lote comprometido).
2. **Purgar** los items inyectados (los que no correspondan a envíos
   legítimos de dispositivos conocidos).
3. **Anotar el evento** (fecha/hora, origen, items afectados, hash) en el
   registro de incidentes del operador.

## Prácticas del repositorio

- Sin secretos en el código: los tokens de despliegue viven en *GitHub Secrets*;
  el token de lectura del hub vive en el `localStorage` del supervisor (nunca en
  el bundle — ver «Token de lectura» más arriba).
- Dependencias fijadas por `bun.lock`; `bun install --frozen-lockfile` en CI.
- Cabeceras COOP/COEP en Cloudflare Pages habilitan `SharedArrayBuffer`; no
  introduzcas scripts de terceros que rompan el aislamiento.
- No se aceptan PRs que añadan telemetría, analítica o llamadas de red no
  documentadas.
- Los binarios vendidos (modelos, wasm, diccionarios) se verifican por origen y
  tamaño; `.gitattributes` evita que CRLF los corrompa.

## Nota de riesgo — CSP `unsafe-eval` del detector OpenCV (2026-11-12)

**Riesgo registrado 2026-11-12:** el detector (core OpenCV) requiere
`unsafe-eval` para wasm; el scope es el bundle del detector y se re-evalúa al
cambiar el core (D80 parte los wasm; validar tras cada bump). Introducido por
el commit `10be269` (fix(csp): permitir unsafe-eval al core OpenCV del
detector). Cualquier actualización del core OpenCV u otro wasm del detector
debe re-validar que la directiva sigue limitada al scope del detector y que el
resto de la app no hereda `unsafe-eval`.
