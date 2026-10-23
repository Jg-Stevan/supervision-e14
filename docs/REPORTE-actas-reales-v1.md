# REPORTE — kit `sup-e14-actas-reales-v1` (SUP-6)

Rama `feat/actas-reales-v1` sobre `main @ 25602ef` · Kit: `actas-reales-v1` ·
Agente: ejecución automatizada según `INSTRUCCIONES-sup-e14-actas-reales-v1.md`.

---

## 1. Hashes SHA-256 de los 4 assets copiados

Verificados con `sha256sum` tras copiar de la fuente (Anexo A) a
`src/modules/supervision/data/actas-reales/assets/` — **los 4 coinciden exactamente**:

| Archivo | SHA-256 | Bytes |
|---|---|---|
| `E14_88_335_005_02_001_TRANSMISION-1.png` | `d02f7fd04395364fa0218dd9e9e4a5d7e474a120f10dc431907cf768b223676d` | 237,038 |
| `E14_88_335_005_02_001_TRANSMISION-2.png` | `d27c3d22f2ce2d8970a6b32528839ddeb7d24fe2272e940cecb6aabaf927ab40` | 204,950 |
| `E14_88_335_005_02_001_CONSUL_EMBAJADOR-1.png` | `8f87736964fce8e42f5d5b7188fb63fc00a945644bb16408177ae63fde26e629` | 262,874 |
| `E14_88_335_005_02_001_CONSUL_EMBAJADOR-2.png` | `17af89fe9f55b2b98ca150e385624305e8257c8f8d4c4ea8eeb740dfb09538e2` | 194,627 |

Total: **899,495 bytes (≈ 0.88 MB)** — dentro del guardrail D25 (≤ 10 assets, ≤ 2 MB).
Manifest copiado VERBATIM del Anexo B (`actas-reales-manifest.json`).

## 2. Resultado del loader

`cargarActasReales()` (memo en módulo, validaciones D25 a–e contra
`CARGAR_CATALOGO()`):

- **2 actas publicadas** (1 clave: `88_335_005_02::001`, con
  TRANSMISION P1/P2 + DELEGADOS P1/P2 — 4 fotos), **0 bloqueadas**.
- Consola: **sin avisos de cuarentena** (verificado en navegador — §4.13).
- Dimensiones intrínsecas servidas al visor: 1314–1327 × 3979–3982 px
  (aspect ~1:3, navegación por scroll vertical — kit T5.1).

## 3. Verificación §4 (tabla firmada + capturas)

| # | Chequeo | Esperado | Resultado |
|---|---------|----------|-----------|
| 1 | `bun run lint` + `tsc --noEmit` (sin typegen) | 0 errores | **OK** — eslint 0 problemas; tsc 0 errores (`next build` además pasó su propio chequeo TS) |
| 2 | El Cairo en tabla de sedes (búsqueda "EL CAIRO") | estado COMPLETO, 1 mesa | **OK** — fila `335 - EGIPTO · 02 - El Cairo - Consulado · COMPLETO`; sub-tabla muestra MESA 001 única (captura `01`) |
| 3 | VER ACTA → TRANSMISIÓN P1 | foto real (encabezado E-14 TRANSMISIÓN, barcode 710003993010102) | **OK** — foto real como papel del canvas; barcode y encabezado visibles (captura `02`) |
| 4 | Caption P1 | `CONSULADO 88 · PAÍS 335 - EGIPTO · ZONA 05 · PUESTO 02 · MESA 001 · LUGAR El Cairo - Consulado` | **OK** — línea 1 `ACTA REAL · TRANSMISIÓN · PÁG 1/2`, línea 2 verbatim + barcode en mono (la UI lo muestra en MAYÚSCULAS por el estilo `label-caps` preexistente — el dato es verbatim, convención D21) |
| 5 | Zoom 2.0 + contraste NEGATIVO sobre la foto | filtros reales sobre la imagen | **OK** — zoom 2.05 (paso 0.25 desde 0.8) + `invert(1)` reales sobre la foto (captura `03`) |
| 6 | Página 2 (flecha →) | foto de constancias + firmas de jurados | **OK** — P2 real con barcode 710003993010202, «Pag: 2 de 2»; scroll muestra FIRMA JURADO 1-4 y KIT 399 (captura `04`) |
| 7 | Pestaña DELEGADOS P1 y P2 | fotos reales del formulario CÓNSUL/EMBAJADOR (2 páginas) | **PARCIAL — ver BLOQUEADA-1**: P1 real OK (captura `05`, etiqueta CÓNSUL/EMBAJADOR + barcode 710003992010102); **P2 inalcanzable en la UI** por el clamp de páginas del provider (fuera de whitelist) |
| 8 | CERO cifras de votación leídas de la imagen en la UI | §0-1 | **OK** — caption/historial/header solo llevan encabezado impreso + textos estándar por seed; la imagen se muestra tal cual |
| 9 | Roma mesa 1 (`88_495_010_02`) VER ACTA | documento sintético #A92-F SIN cambios | **OK** — sintético `#A92-F`, 14:20 LOCAL, motivo SOLICITUD DE RESCANEO, historial intacto, 0 fotos (captura `06`) |
| 10 | Cualquier otra mesa con acta (Roma 002) | sintético, sin fotos | **OK** — `#KYD-P` sintético, 0 fotos |
| 11 | Vida / anomalías / KPIs | sin cambios (solo El Cairo → COMPLETO) | **OK** — KPIs 232/44/199/474 = baseline D21 (231/44/199/475) + delta exacto del ancla; anomalías/notificaciones semillas intactas; El Cairo sin mesas EN_PROCESO (no entra al ticker de vida) |
| 12 | `next build` export + servir en subpath bajo `/supervision-e14/` | las 4 fotos cargan con basePath (no 404) | **OK** — `NEXT_PUBLIC_BASE_PATH=/supervision-e14 next build` + `python3 -m http.server` :8077; las 4 PNG responden 200 bajo `/supervision-e14/_next/static/media/…` (captura `07`) |
| 13 | Consola del navegador | sin errores; sin avisos de cuarentena | **OK** — 0 errores de página, 0 warnings de cuarentena en toda la sesión |

Capturas en `docs/capturas-actas-reales-v1/` (mínimas del kit + firmas P2 y landing subpath).

## 4. Peso del bundle

- Assets: **899,495 B (≈ 0.88 MB)** — los 4 PNG del ancla.
- Export estático total (`out/` con basePath): 2.34 MB en disco /
  **1.25 MB gz**, del cual ≈ 0.88 MB son los 4 PNG (el gz no los reduce —
  ya comprimidos): **delta del export gz ≈ +0.88 MB**, atribuible al kit.
- Sin dependencias nuevas; el loader es perezoso y el resto del bundle no cambia.

## 5. Decisiones D23–D26 añadidas

Añadidas a `docs/DECISIONS.md` con el texto de §2 del kit, más las notas de
implementación: (D24) etiqueta/barcode impresos POR formulario en el
registro del loader (el barcode difiere entre TRANSMISIÓN y
CÓNSUL/EMBAJADOR); mapa de bytes para el guardrail (el bundle no expone
el peso del asset); (D26) el seed natural de El Cairo re-derivado localmente
cae en NO_INICIADO (4ª llamada del seed, rango > 0.5 — el kit lo anota como
0.9872; la conclusión es la misma: sin fuerza el ancla es inalcanzable).

## 6. BLOQUEADA (sin improvisar — §0-2)

> **BLOQUEADA-1 — T5.4/§4.7 parcial: PÁGINA 2 de DELEGADOS inalcanzable en la UI.**
> La pestaña DELEGADOS del ancla SÍ muestra 2 páginas (PÁGINA 1 / PÁGINA 2 en
> el header, datos servidos por el loader) y su foto P2 existe, pero
> `cambiarPagina` en `datos-provider.tsx` clampea a 1 página cuando
> `tipo !== "TRANSMISION"` (`const maxima = prev.tipo === "TRANSMISION" ? 2 : 1;`
> — supuesto del kit SUP-4, cuando DELEGADOS era de 1 página). Ese archivo
> está FUERA de la whitelist §1 (frontera dura §0-3), así que NO se tocó.
> El arreglo es 1 línea para el dueño (usar el largo real de páginas del
> acta: `maxima = acta.formularios[tipo].length` o equivalente); hecho eso,
> la P2 real del formulario CÓNSUL/EMBAJADOR queda servida sin ningún otro
> cambio (la foto está en `acta.fotos.DELEGADOS[1]`).

Ninguna otra desviación. Los archivos prohibidos (`divipola-adapter.ts`,
`domain/divipola.ts`, `supervision-repository.ts`, `domain/types.ts`,
`documento-e14.tsx`, vida, anomalías, shell, filtros, KPIs) quedaron intactos;
sin dependencias nuevas y sin `next/image`.
