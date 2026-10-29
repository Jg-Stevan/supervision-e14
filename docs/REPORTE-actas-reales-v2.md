# REPORTE — kit `actas-reales-v2` (D44)

Rama `feat/actas-reales-roma-barcelona-v2` sobre `main` (re-baseada sobre el
main re-inicializado del dueño — el cherry-pick del kit conservó el contenido;
los docs previos `DECISIONS.md`/`worklog.md` ya no existen en el repo, la
decisión queda registrada AQUÍ) · Kit: `actas-reales-v2` ·
Origen: pedido del dueño — «las actas que digitalicé en digielect14 se suban a
supervision-e14».

## 0. DECISIÓN (D44)

1. **Ingesta (data):** 4 assets PNG nuevos (grises, misma escala del lote El
   Cairo ~1320×3985) + 2 entradas en `actas-reales-manifest.json` (Roma
   `88_495_010_02::001` y Barcelona `88_355_003_08::001`, formulario DELEGADOS,
   P1/P2, barcode impreso verbatim). El loader (D24/D25) queda INTACTO en su
   lógica: solo imports/ASSETS/PESO_ASSETS crecen. Guardrail: 8 assets /
   1.82 MB ≤ (10 / 2 MB) — sin cambio de constantes.
2. **Conexión al monitor:** `obtenerActa` generaliza la rama real de El Cairo
   (D26) a CUALQUIER mesa con registro en el loader (`construirActaReal`,
   paginación DELEGADOS derivada del largo real del registro). El ANCLA Roma
   mesa 001 (#A92-F, §0-6) conserva id/hora/motivo/historial EXACTOS y RECIBE
   las fotos reales de DELEGADOS + impresión verbatim (la foto se UBICA —
   TRANSMISIÓN queda sintética, honesto: no hay fotos de ese formulario).
   Barcelona-Girona se FUERZA a COMPLETO como «ancla de práctica #2» (mismo
   mecanismo D26; seed natural PENDIENTE dejaba la mesa 001 en NO_INICIADO →
   ancla inalcanzable). Delta del demo: +1 puesto COMPLETO, +3 mesas COMPLETO
   (001-003) — KPIs suben en consecuencia (§5).
3. **BLOQUEADA-1 (SUP-6) resuelta:** `cambiarPagina` en datos-provider
   clampeaba DELEGADOS a 1 página (supuesto del kit SUP-4). El techo ahora es
   el largo REAL del formulario del acta ABIERTA (conservador: 1 hasta que el
   acta aterrice). La P2 real del CÓNSUL/EMBAJADOR queda alcanzable en los 3
   anclas (El Cairo incluido).

**Qué NO se tocó (conservador):** loader actas-reales.ts (validaciones D25 a–e
idénticas), recepción-log (la semilla itera el loader — las 4 páginas nuevas
entran solas como ingesta-inicial), documento-e14 (sintético), vida/anomalías/
notificaciones (seeds intactos; Barcelona solo sale del pool de transición
PENDIENTE), divipola-adapter, módulo digitalizador/masiva, y el kit
stitch-visor-actas-v1 (`reportarAnomalia*`) que trae el main re-inicializado.

**Fuente de las fotos:** los escaneos de la práctica viven como PDFs en el vault
(`proyecto-electoral-e14-vault`, `06 RECURSOS/Actas E-14 de ejemplo/`) — la MISMA
fuente del lote El Cairo (SUP-6): `E14_XXX_X_88_495_010_02_000_X_XXX.pdf` (Roma)
y `E14_XXX_X_88_355_003_08_000_X_XXX.pdf` (Barcelona). Cada PDF trae 2 páginas del
formulario CÓNSUL/EMBAJADOR (DELEGADOS). Se renderizaron a PNG escala de grises
(mismo estándar del lote anterior, zoom 1.53 → ~1320×3985 px).

> Nota de alcance: los 5 JPG (`acta-e14-real.jpg` + simuladas) que viven en
> `digielect14/src/assets/` ya estaban byte-idénticos en
> `src/modules/digitalizador/assets/` desde el port (hashes SHA-256 verificados).
> Lo que faltaba por «subir» eran estos 2 puestos, y es lo que hace este kit.
> Las actas digitizadas CON LA APP (cámara) nunca salen del navegador del
> dispositivo por diseño (privacidad §5 de obs) — esas entran por Carga Masiva.

---

## 1. Hashes SHA-256 y pesos de los 4 assets nuevos

Verificados con `sha256sum` tras renderizar y copiar a
`src/modules/supervision/data/actas-reales/assets/`:

| Archivo | SHA-256 | Bytes |
|---|---|---|
| `E14_88_495_010_02_001_DELEGADOS-1.png` | `1b30315c4dc07decc927669c38ba7cf1fbb6985f620e542d11a6b37d77b31773` | 253,534 |
| `E14_88_495_010_02_001_DELEGADOS-2.png` | `535d5c30238562220cb9e86d967b16b097082d1f5092a8fd1c340b419377c390` | 214,258 |
| `E14_88_355_003_08_001_DELEGADOS-1.png` | `8313f3a9301e807693110844468af6d8440110aea6c4d31b643afac1f12f2a64` | 254,952 |
| `E14_88_355_003_08_001_DELEGADOS-2.png` | `e017e2bd53cd5650d18a02f297503958b80ccc671b97e1cb85bc6db33ee9cb2e` | 197,248 |

## 2. Guardrail D25 — presupuesto del manifest completo

| Lote | Assets | Bytes |
|---|---|---|
| El Cairo (SUP-6, sin cambios) | 4 | 899,495 |
| **Roma + Barcelona (nuevo)** | 4 | 919,992 |
| **TOTAL** | **8 ≤ 10** | **1,819,487 ≤ 2,097,152 (86.8 %)** |

Sin cambio de constantes `MAX_ASSETS`/`MAX_BYTES_TOTALES`.

## 3. Datos verbatim del manifest (leídos de las imágenes)

| Acta | idEnlace | Mesa | Formulario | Etiqueta impresa | Barcode P1 | Encabezado impreso |
|---|---|---|---|---|---|---|
| Roma | `88_495_010_02` | 001 | DELEGADOS | CÓNSUL/EMBAJADOR | `710009822010102` | CONSULADO 88 · PAÍS 495 - ITALIA · ZONA 10 · PUESTO 02 · MESA 001 · LUGAR Roma - Consulado |
| Barcelona | `88_355_003_08` | 001 | DELEGADOS | CÓNSUL/EMBAJADOR | `710012652010102` | CONSULADO 88 · PAÍS 355 - ESPAÑA · ZONA 03 · PUESTO 08 · MESA 001 · LUGAR Barcelona - Girona |

Validación D25: (a) ambos `idEnlace` EXISTEN en el catálogo DIVIPOLA exterior
(Roma: 8 mesas · Barcelona: 3) — (b) mesa 001 ≤ totalMesas — (c) DELEGADOS clave
de dominio — (d) P1/P2 continuas — (e) assets importables. **0 bloqueadas.**

## 4. Conexión al monitor (código)

- `actas-mock.ts` — `construirActaRealCairo` → `construirActaReal` (generalizada:
  paginación DELEGADOS = largo real del registro). `obtenerActa` resuelve
  cualquier clave del loader. El ancla Roma 001 (#A92-F) RECIBE fotos reales de
  DELEGADOS + impresión verbatim; textos §0-6 intactos; TRANSMISIÓN sintética
  (no hay fotos de ese formulario — honesto).
- `mock-repository.ts` — ancla de práctica #2: Barcelona-Girona forzada a
  COMPLETO (mismo mecanismo D26; seed natural PENDIENTE → mesa 001 NO_INICIADO).
- `datos-provider.tsx` — **BLOQUEADA-1 (SUP-6) resuelta**: el techo de
  `cambiarPagina` es el largo real del formulario del acta abierta (antes:
  DELEGados clampeado a 1). La P2 real de CÓNSUL/EMBAJADOR es alcanzable en los
  3 anclas (El Cairo incluido — quedó servida por el loader pero inalcanzable
  desde SUP-6).

## 5. Impacto en el demo (KPIs/vida)

- Puestos COMPLETO del catálogo: +1 (Barcelona) → KPIs base D38/D39 suben en
  +1 puesto y +3 mesas completas (001-003); los pcts derivan del estado, sin
  código tocado.
- Barcelona sale del pool de transición de vida PENDIENTE (su 003 era el
  candidato EN_PROCESO) — el ticker sigue con los demás puestos del seed.
- Recepción de actas: la semilla `ingesta-inicial` pasa de 4 a **8 filas**
  (itera el loader — cero código).
- Roma sigue siendo el ancla CRÍTICO: anomalía 004, historial y textos exactos.

## 6. Verificación

| # | Chequeo | Resultado |
|---|---|---|
| 1 | `bunx tsc --noEmit` | **0 errores propios** — solo baseline del repo re-inicializado: 13 TS2307 (imports estáticos de imágenes sin typegen — clase documentada) + 1 TS2339 pre-existente en `ui/input-otp.tsx` (shadcn), ambos SIN mi kit también |
| 2 | `bun run lint` | **0 problemas en los archivos del kit** — 2 errores PRE-EXISTENTES del scaffold shadcn (`ui/carousel.tsx`, `hooks/use-mobile.ts` — `react-hooks/set-state-in-effect`), idénticos en `origin/main` sin mi kit |
| 3 | El Cairo mesa 001 VER ACTA | TRANSMISIÓN P1/P2 + DELEGADOS P1/**P2** con foto real — intacto y con la P2 nueva alcanzable |
| 4 | Roma mesa 001 VER ACTA | id #A92-F · 14:20 · motivo/historial EXACTOS; DELEGADOS P1/P2 con FOTO REAL + caption `ACTA REAL · CÓNSUL/EMBAJADOR · PÁG n/2` + barcode 710009822010102; TRANSMISIÓN sintética |
| 5 | Barcelona-Girona en el monitor | estado COMPLETO; mesa 001 con acta real P1/P2 navegable + barcode 710012652010102 |
| 6 | Recepción de actas | 8 filas ingesta-inicial (4 El Cairo + 4 nuevas), KPIs/filtros operativos |
| 7 | Consola del navegador | 0 errores; 0 avisos de cuarentena |
| 8 | Responsive 375px | KPIs/filtros apilados, visor operativo |

## 7. Límites honestos

- TRANSMISIÓN de Roma y Barcelona sigue en documento sintético D18 (solo hay
  fotos del formulario CÓNSUL/EMBAJADOR en la fuente — no se inventa nada).
- Los assets son renders de PDF anonimizado (`E14_XXX_*`): la convención de
  nombre usa `DELEGADOS` (lote v2) vs `CONSUL_EMBAJADOR` (lote v1) — misma clave
  de dominio, documentado en el header del loader.
- Las actas de PRÁCTICA futuras (captura con cámara en digielect14) entran por
  Carga Masiva (archivos/ZIP/PDF) o por un lote manifest como este.
