# Arquitectura

Este documento explica **qué piezas existen, cómo se hablan y qué reglas no se
pueden romper**. Las decisiones y su contexto histórico viven en
[`adr/README.md`](adr/README.md); los números reales, en
[`MEDICIONES.md`](MEDICIONES.md).

## 1. Vista general

Aplicación Next.js 16 (App Router) con **export estático** de una sola página.
No hay backend: todo el procesamiento ocurre en el navegador y el estado de
sesión vive en memoria e IndexedDB.

```
┌──────────────────────────────────────────────────────────────────────┐
│ src/app/  (layout + page)                                            │
│        └── SupervisionShell                                          │
├──────────────────────────────────────────────────────────────────────┤
│ src/modules/supervision/     Monitor · Recepción · Anomalías · Visor │
│        ▲ datos tras SupervisionRepository                            │
│        │ seams: publicarActaMasiva / suscribirseActasRuntime         │
│        │        registrarCargaMasiva                                 │
│ src/modules/digitalizador/   Ingesta → QR → warp → OCR → gate        │
│        └── store Zustand + cola IndexedDB                            │
├──────────────────────────────────────────────────────────────────────┤
│ src/modules/perfil-dispositivo/  Perfil, tiers y recomendaciones     │
│ src/shared/                      Tiempo, tiers, flags, QR, imágenes  │
└──────────────────────────────────────────────────────────────────────┘
```

Dependencias permitidas:

- `app` → módulos.
- `supervision` ↔ `digitalizador` **solo** por los seams documentados.
- `perfil-dispositivo` → `digitalizador` (consulta de motor) y `shared`.
- `shared` no importa módulos.
- `supervision/domain` no depende de librerías externas.

## 2. Módulos

### 2.1 `src/modules/supervision` — el producto de monitoreo

| Área | Archivos clave | Responsabilidad |
|---|---|---|
| Shell | `components/supervision-shell.tsx` | Navegación por estado (sin rutas), sidebar y montaje del provider. |
| Monitor | `components/monitor-global.tsx`, `puestos-table.tsx`, `mesas-subtable.tsx` | KPIs, tabla de 949 puestos, transiciones de vida. |
| Recepción | `components/vista-recepcion.tsx`, `data/recepcion-log.ts` | Log en vivo por página con desenlaces PUBLICADA / BLOQUEADA / SIN_JOIN. |
| Anomalías | `components/vista-anomalias.tsx` | Bandeja de anomalías abiertas y revisadas. |
| Visor | `components/actas/acta-viewer-modal.tsx` y subcomponentes | Foto real o documento sintético, zoom, rotación, contraste, pantalla completa y REPORTAR ANOMALIA. |
| Dominio | `domain/types.ts`, `domain/acta.ts`, `domain/divipola.ts` | Contratos puros: puestos, mesas, actas, DIVIPOLA. |
| Datos | `data/supervision-repository.ts`, `mock-repository.ts` | Interfaz única de lectura/mutación y su implementación demo. |
| Ingesta estática | `data/actas-reales/` | Manifest + assets WebP de actas reales (D24). |
| Ingesta runtime | `data/actas-runtime.ts` | Actas que llegan de la carga masiva durante la sesión. |
| Validación | `data/validacion-d25.ts`, `data/divipola-adapter.ts` | Cuarentena por ubicación y carga estricta del catálogo. |

La UI **nunca** lee datos directamente: habla con `SupervisionRepository`
(ver §4.1). El visor no interpreta el contenido del acta (D23): muestra la foto
y la impresión verbatim.

### 2.2 `src/modules/digitalizador` — el motor de digitalización

| Área | Archivos clave | Responsabilidad |
|---|---|---|
| Cola | `lib/e14/masiva/*`, `store/*` | Encolado, dedup, reanudación, métricas y envío. |
| Bridge | `lib/e14/scanner-core-bridge.ts`, `bridge.ts`, `get-bridge.ts` | Orquesta el pipeline real y publica al monitor. |
| Pre-OCR | `lib/e14/masiva/prescan-qr.client.ts`, worker capa 0 | Sondeo QR temprano y en paralelo. |
| Calidad | `lib/e14/calidad.ts`, `completitud.ts`, `marcadores.ts`, `gate.ts` | Score, veto de recorte, marcadores y desenlace. |
| OCR | `lib/e14/ocr/*` | RapidOCR (v4/v5), Tesseract y selector por gama. |
| Clasificación | `lib/e14/clasificador.ts`, `divipol.ts` | Normalización del encabezado a `idEnlace`. |
| Integridad | `lib/e14/integridad.ts`, `auditoria.ts` | Dedup por bytes, telemetría y trazas. |
| Assets | `assets/*`, `lib/e14/actas-demo.ts`, `sim-assets.ts` | Fotos demo/simulación comprimidas. |

### 2.3 `src/modules/perfil-dispositivo`

Detecta gama (BAJO / MEDIO / ALTO), expone el motor OCR activo y genera
recomendaciones (hilos wasm, sidecar, red). No participa en el pipeline de actas.

### 2.4 `src/shared`

Utilidades sin dominio: formato de tiempo, detección de tier/UA, esquema y
validación de flags, constantes de QR y luminancia. Todo lo compartido entre
módulos debe vivir aquí, no en un módulo.

## 3. Flujo de una corrida

```
Archivo (JPG/PNG/HEIC/PDF/ZIP/RAR)
  │
  ├─ 1. Ingesta: normaliza a File, calcula SHA-256 y dhash, encola en IndexedDB
  ├─ 2. Sondeo QR: intento temprano; el payload se guarda en qrPrevio
  ├─ 3. Decode + detección de marco + warp (OpenCV)
  ├─ 4. Dedup: bytes exactos y perceptual (≤6 bits de distancia)
  ├─ 5. Calidad: brillo, nitidez, contraste, cobertura → level + score
  ├─ 6. Completitud: ¿el papel está entero? (4 lados / área / fiduciales)
  ├─ 7. OCR escalonado: detección + reconocimiento; segunda pasada si es débil
  ├─ 8. Gate: score, veto INCOMPLETA, marcador de votos, techos
  ├─ 9. Clasificación: encabezado → idEnlace, formulario y páginas
  └─ 10. Publicación: D25 valida; publica en monitor/recepción o cuarentena
```

Puntos de medición (solo aditivos): `preOcrMs`, `ocrMs`, `qrMs`, `gapMs`,
`tsInicio`, `thumbMs`, motivo de cierre y desglose de warp. Los consume el
informe de carga y la telemetría; nunca cambian el resultado.

### 3.1 Gate y veto

| Señal | Efecto |
|---|---|
| `score ≥ 8` | ÓPTIMA (envío automático si el umbral es `optima`). |
| `6.5 ≤ score < 8` | ADVERTENCIA (revisión humana salvo opt-in). |
| `score < 6.5` | RECHAZADA; al agotar intentos pasa a contingencia. |
| `INCOMPLETA` (recorte real) | Veto directo; cap de score 6.4. |
| `SIN_VOTOS` (marcador obligatorio) | Veto directo; cap 6.4. |
| Fondo / escudo manual / recortada | Techo 7.9 (nunca ÓPTIMA). |
| Lectura DEBIL | Techo 5.9. |
| Lectura FUERTE | Piso 8.5 salvo calidad `poor`. |

Los fiduciales presentes pueden perdonar la sospecha geométrica: si el papel
está entero dentro del cuadro, no hay recorte real. El log conserva la evidencia.

### 3.2 Deduplicación

- **Bytes:** SHA-256 del `File` → mismo archivo, misma acta.
- **Percepción:** dhash de 64 bits sobre un canvas 9×8 en grises, con orientación
  EXIF normalizada. Distancia ≤ 6 → se reutiliza el resultado.
- **Prohibido** deduplicar por nombre o fecha. Cualquier fallo de decode/hash
  devuelve `null` y la fila se procesa normal: nunca se inventa un match.

## 4. Contratos

### 4.1 `SupervisionRepository`

Única puerta de datos de la UI. Lecturas async (`getResumen`, `getPuestos`,
`getMesasDePuesto`, `getActaDeMesa`) y mutaciones (`resolverRescaneo`,
`aplicarTransicionVida`, `aprobarActa`, `confirmarRescanActa`,
`reportarAnomaliaActa`, `registrarCargaMasiva`). Sustituir el mock por una
implementación real no debe requerir cambios en componentes.

### 4.2 Seams motor ↔ monitor

- `publicarActaMasiva` / `suscribirseActasRuntime` / `registrarCargaMasiva`.
- `onVerEnMonitor` viaja por props desde el shell; la vista de carga masiva no
  conoce el visor.
- Las actas publicadas se superponen al repositorio en `getActaDeMesa`.

### 4.3 Contrato de acta real (D24)

Manifest JSON con `idEnlace`, `mesa`, `formulario`, etiqueta, barcode,
impresión y páginas. Los assets se importan estáticamente; la clave de registro
es `${idEnlace}::${mesa}`. El loader está memoizado y devuelve también las
actas bloqueadas con su motivo.

### 4.4 Cuarentena (D25)

Un acta se publica solo si: el `idEnlace` existe en el catálogo exterior, la
mesa ≤ `totalMesas`, el formulario es conocido, las páginas son continuas y el
asset carga. Si falla, queda en cuarentena con `BLOQUEADA: <motivo>` y no mueve
los KPIs.

## 5. Modelo de dominio

- `Puesto` — fila del catálogo exterior; su `id` **es** el `idEnlace`.
  Estados: `COMPLETO`, `CRITICO`, `PENDIENTE`, `NO_INICIADO`.
- `Mesa` — delegados P1/P2 y transmisión P1/P2; estado `COMPLETO`,
  `EN_PROCESO`, `INCOMPLETO`, `NO_INICIADO`.
- `ActaMesa` — formularios `TRANSMISION` y `DELEGADOS`, páginas, historial,
  fotos reales opcionales e impresión verbatim.
- KPIs — invariante exacta: `total = completo + crítico + pendiente + no_iniciado`.

Los estados del demo se derivan de un seed determinístico por `idEnlace`; el
golden vigente es `mock-determinismo.test.ts`.

## 6. Persistencia

| Dato | Dónde | Vida |
|---|---|---|
| Cola de ingesta | IndexedDB | Persistente hasta vaciar/reiniciar. |
| Dedup de enviadas | IndexedDB (SHA-256) | Persistente; se borra con REINICIAR ENVÍOS. |
| Métricas de corrida | IndexedDB separada | Histórico local. |
| Actas publicadas | Memoria de sesión | Se pierde al recargar (diseño sin backend). |
| Recepción | Memoria de sesión | Ídem. |
| Flags | `localStorage` | Por navegador. |

## 7. Render y UI

- Tema **solo dark**, tokens en `src/app/globals.css`, radio 4 px, cero sombras.
- Sin `next/image`: los assets son importaciones estáticas.
- Sin rutas: la vista activa es estado del shell y se refleja en el hash
  (`#vista=recepcion`, `#vista=carga-masiva`, …).
- El visor del monitor y el de carga masiva son componentes distintos; no se
  unifican a la fuerza (D62).

## 8. Despliegue

- `next build` genera `out/` estático.
- **Cloudflare Pages** es el canal primario: `_headers` (un único bloque `/*`)
  activa COOP/COEP y el OCR multihilo; los wasm > 25 MiB se parten en build y
  una Pages Function los reensambla.
- **GitHub Pages** convive como canal secundario sin cabeceras.
- `public/vendor/onnxruntime/` se materializa en `predev`/`prebuild`; no se
  versiona.

## 9. Dónde tocar qué

| Quiero… | Ir a… |
|---|---|
| Cambiar el gate o los umbrales | `digitalizador/lib/e14/gate.ts` |
| Cambiar la detección de recorte | `digitalizador/lib/e14/completitud.ts` |
| Añadir/cambiar un modelo OCR | `digitalizador/lib/e14/ocr/rapidocr.ts` + `public/models/rapidocr/` |
| Cambiar la cadena QR | `digitalizador/lib/e14/masiva/prescan-qr.client.ts`, `qr-zxing.ts` |
| Cambiar la validación de actas | `supervision/data/validacion-d25.ts` |
| Añadir una vista | `supervision/components/supervision-shell.tsx` (estado, no ruta) |
| Cambiar el visor | `supervision/components/actas/*` |
| Cambiar el catálogo | `supervision/data/divipola-exterior.json` + adapter |
| Cambiar el despliegue | `public/_headers`, `scripts/cf-wasm-partes.mjs`, `functions/` |
