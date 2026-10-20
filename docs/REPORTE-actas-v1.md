# REPORTE SUP-4 — actas-v1

- **Rama:** `feat/actas-v1` (base: `242266c` = merge del PR #5 vida-v1 en
  `main`)
- **Commits:**
  - `774121b` — feat(supervision): dominio de actas + repositorio async y
    datos determinísticos (T1)
  - `15a5734` — feat(supervision): documento E-14 sintético vectorial
    (T2, D18)
  - `f884e28` — feat(supervision): visor de actas — modal, header,
    toolbar, acciones e historial (T3–T5, D17/D19)
  - `9422292` — feat(supervision): puntos de entrada del visor — VER ACTA
    en mesas y anomalías + 👁 de puesto (T3.4)
  - `6ad2910` — docs(supervision): DECISIONS D17–D19 + README Visor de
    Actas + REPORTE-actas-v1 (T7)
- **PR:** draft `feat: visor de actas (SUP-4)` — SIN merge, SIN push a
  `main` (§0).

## Whitelist

**Nuevos (8/8 de §1):**

| Archivo | Tipo | OK |
|---|---|---|
| `src/modules/supervision/domain/acta.ts` | nuevo | ✓ |
| `src/modules/supervision/data/actas-mock.ts` | nuevo | ✓ |
| `src/modules/supervision/components/actas/acta-viewer-modal.tsx` | nuevo | ✓ |
| `src/modules/supervision/components/actas/acta-header.tsx` | nuevo | ✓ |
| `src/modules/supervision/components/actas/acta-toolbar.tsx` | nuevo | ✓ |
| `src/modules/supervision/components/actas/documento-e14.tsx` | nuevo | ✓ |
| `src/modules/supervision/components/actas/acta-acciones.tsx` | nuevo | ✓ |
| `src/modules/supervision/components/actas/acta-historial.tsx` | nuevo | ✓ |

**Editados (§1 — nombres reales localizados con `rg`):**

| Archivo (sugerido por el kit) | Archivo real | OK |
|---|---|---|
| `domain/supervision-repository.ts` (+ getActaDeMesa) | mismo archivo — se añadieron además `aprobarActa` y `confirmarRescanActa` (T1.3/T5, patrón D12) | ✓ |
| `data/*mock*` (delegar a actas-mock + acciones) | `data/mock-repository.ts` | ✓ |
| store del módulo (zustand) | `components/datos-provider.tsx` — el store del módulo es Context+hooks (D1: sin zustand ni libs nuevas) | ✓ |
| componente de la tabla de mesas expandidas | `components/mesas-subtable.tsx` | ✓ |
| componente de tarjetas de anomalías | `components/vista-anomalias.tsx` | ✓ |
| acciones de fila de puesto en la tabla principal | `components/puestos-table.tsx` — el 👁 NO existía (el kit lo da por «ya existente»); se AÑADIÓ en la celda ESTADO GLOBAL | ✓ |
| mock de notificaciones (2 plantillas nuevas) | `data/mock-repository.ts` (mismo archivo de arriba) | ✓ |
| `docs/DECISIONS.md` (D16–D18) | mismo archivo — añadidas como **D17–D19** (D16 ya estaba usado por vida-v1; nota de numeración dentro) | ✓ |
| `README.md` (sección Visor de Actas) | mismo archivo | ✓ |
| `docs/REPORTE-actas-v1.md` (nuevo) | este archivo | ✓ |

**`git diff --stat main...feat/actas-v1`** = exactamente los archivos de
arriba (11 nuevos + 6 editados). **Cero** toques a `.github/`,
`next.config.ts`, `package.json`, `bun.lock`, `public/*`, `src/app/*` o
cualquier otro archivo. `supervision-shell.tsx` NO se tocó: el modal se
monta desde el propio store (D17).

## Verificación §4

Evidencia: capturas de la sesión en `/tmp/shots/` (NO se commitean — el
whitelist no las incluye; los checks se registraron leyendo el DOM y
capturando pantalla con navegador headless 1440×900/375×667/768×900).

| # | Punto | Resultado | Evidencia (captura/medición) |
|---|---|---|---|
| 1 | `bunx tsc --noEmit` en fresco SIN typegen | ✓ 0 errores (`.next` eliminado antes de correr) | exit 0 |
| 2 | `bun run lint` | ✓ 0 errores, 0 warnings | exit 0 |
| 3 | KPIs D6 exactos al cargar; Italia único CRÍTICO; el visor no muta solo | ✓ DOM: `kpis: [20,5,1,4,10]`, `visorAbierto: false`; fila Italia = CRÍTICO; tras recargar (tras minutos de vida) KPIs exactos de nuevo | `00-inicial-1440.png` |
| 4 | Roma mesa 1 = mockup exacto | ✓ ID `#A92-F` · `14:20 LOCAL` · chip `MOTIVO: SOLICITUD DE RESCANEO` · PÁGINA 1 ✓ / PÁGINA 2 ⚠ pulse · historial 14:20/14:18/14:00 con textos literales. **Desviaciones declaradas:** breadcrumb con datos reales del mock congelado (D6): `ITALIA (499) › ZONA 10 › 02 - ROMA` (el kit pide literal 495/CONSULADO ROMA — tocar el mock rompería D6); etiqueta `MESA 1/4` porque T3.3/§4.16 definen N = mesas CON acta (Italia tiene 4 de 8) | `01-mockup-exacto-roma1.png` |
| 5 | TRANSMISIÓN P1 legible; TOTAL = suma; delegados coherentes | ✓ votos 344+344+159+206+187+408 = **1648** = TOTAL renderizado; «DELEGADOS ACREDITADOS: 16/16» (mesa 001 con delegados P1/P2 ok) | `01-mockup-exacto-roma1.png` |
| 6 | PÁGINA 2: 2 recuadros sin firma + sello rojo | ✓ 4 firmas SVG onduladas + Testigos 3-4 «— sin firma —» + sello «FIRMA ILEGIBLE — RESCANEO SOLICITADO» doble borde, −12°, opacity 0.85 | `02-pagina2-sello.png` |
| 7 | Toggle DELEGADOS → folio único coherente n/16 | ✓ 16 filas, 16 ACREDITADO (16/16), credenciales `#A92-F-1…`, pie «FOLIO ÚNICO», caption «PÁGINA 1 DE 1 — ACTA DE DELEGADOS» | `03-delegados.png` |
| 8 | Zoom [0.5, 3.0] con scroll; rotación 4 posiciones; contraste 3 modos | ✓ zoom 0.8→1.3 (caja 1032×1460 = 794·1.3 × 1123·1.3) → 2.3 (caja 1826×2583, scroll activo); rotación 180° verificada (`rotate(180deg)` en transform); contraste NEGATIVO (`filter: invert(1)`) | `04-zoom-rotacion-negativo.png` |
| 9 | Flechas navegan páginas, deshabilitadas en bordes | ✓ en P1: anterior disabled (`Página anterior (Pág 1)`), siguiente enabled; en P2: siguiente disabled; en DELEGADOS ambas disabled | DOM |
| 10 | Pantalla completa alterna | ✓ panel pasa a `h-full w-full max-w-none` + scrim p-0; icono → `Minimize`; title «Salir de pantalla completa»; vuelve igual | `05-fullscreen.png` |
| 11 | Cierre ✕ / Escape / scrim; clic dentro NO cierra | ✓ clic en sidebar → sigue abierto; Escape → cierra; clic en scrim → cierra; los 3 verificados | DOM |
| 12 | Acción con textarea vacío | ✓ sin ejecución, borde en error, mensaje inline «Ingrese el motivo de la decisión» (aria-invalid, role=alert), sin toast, historial intacto | `06-error-motivo.png` |
| 13 | APROBAR end-to-end | ✓ spinner «Procesando…» + ambos botones disabled (2.5 s) → P1/P2 «— válida», chip de motivo desaparece, overlay «ACTA VALIDADA», historial + «APROBADA POR SUPERVISOR / ID: ADM-9482 · Obs: …» (punto primary), notificación nueva (badge 4→5), toast «Acta marcada como válida», anomalía vinculada Mesa 001 → revisada (badge anomalías 5→4) | `07-aprobada-endtoend.png` |
| 14 | RESCANEO end-to-end | ✓ spinner 2.5 s → versión 2, hora de carga 16:02→**16:32** (+30 min determinísticos), caption «VERSIÓN 2 — RECIBIDA 16:32 LOCAL», páginas válidas, historial + «RESCANEO CONFIRMADO / Nueva transmisión recibida desde sesión #MPR-6», notificación + toast «Rescan confirmado y recibido» | `08-rescan-endtoend.png` |
| 15 | Puntos de entrada | ✓ `FileText` por fila de mesa (deshabilitado en mesa 003 NO_INICIADO, `title="Sin transmisión"`); «VER ACTA» desde anomalía Mesa 004 aterriza en TRANSMISIÓN PÁGINA 2 — advertencia pulsante + sello; anomalía sin mesa («Desfase de hora») → deshabilitado «Sin mesa vinculada»; 👁 de puesto abre la primera mesa con acta (10 puestos NO_INICIADO con el 👁 deshabilitado, title «Sin acta») | `09-anomalia-pagina2.png` |
| 16 | Navegador `< 1/N >` solo mesas con acta; bordes deshabilitados | ✓ Italia: 1/4→2/4 (#SVD-A)→3/4 (#MPR-6)→4/4; en 4/4 siguiente disabled, en 1/4 anterior disabled | DOM |
| 17 | 1440×900 sin scroll de página; 375px apilado sin cortes | ✓ 1440: panel 1392×810, sin scroll de página ni horizontal, sidebar 320; 768: header wrap 129px sin scroll; 375: `scrollHorizontalPagina: false`, sidebar bajo el visor (border-t), toolbar con wrap, nada cortado | `10-375px-visor.png`, `11-1440-fullscreen-off.png` |
| 18 | Export estático con basePath + preview subpath | ✓ `NEXT_PUBLIC_BASE_PATH=/supervision-e14 bun run build` → `out/` OK (HTML con URLs `/supervision-e14/_next/...`); servido con `http.server` → `/supervision-e14/` 200, 10 assets 200 / 0 errores, visor abre con `#A92-F` y funciona igual | `12-subpath-preview.png` |
| 19 | Cero cambios fuera de whitelist | ✓ `git status`/`diff --stat` = solo archivos de §1 | tabla Whitelist |
| 20 | Dev local en raíz sin basePath | ✓ `bun run dev` → GET / 200 con la app completa (verificado tras el build) | log |

## Decisiones tomadas dentro del kit

1. **Numeración de decisiones:** el kit lista D16–D18, pero **D16 ya
   existía** (vida-v1, mergeado en main). Se añadieron **D17/D18/D19**
   con los contenidos del kit (nota de correspondencia dentro de
   DECISIONS.md). Las referencias internas «(D17)» del kit al documento
   sintético equivalen aquí a D18.
2. **`getActaDeMesa(puestoId, mesaId)`:** la firma del kit
   `getActaDeMesa(mesaId)` es imposible de resolver en el mock — los ids
   de mesa («001») se repiten en los 20 puestos. Se añade `puestoId`,
   mismo patrón que `resolverRescaneo(puestoId, mesaId)` (D12).
3. **El store del módulo es `datos-provider.tsx`** (Context+hooks, D1 —
   sin zustand). `visorActa` añade `puestoId` además de
   `mesaId/tipo/pagina` (necesario para breadcrumb y navegador n/N).
   `EstadoVisorActa.mesaId` conserva la forma del kit.
4. **El modal se monta dentro de `datos-provider`** — el store está en la
   whitelist y `supervision-shell.tsx` no; así el shell queda intacto.
5. **Botón 👁:** el kit lo da por «ya existente» y NO existía. Se añadió
   (estaba autorizado: «acciones de fila de puesto en la tabla principal
   (👁 = abrir visor)»), con `stopPropagation` porque la fila entera es
   el trigger del Collapsible. A 1440px la tabla sigue cabiendo sin
   scroll horizontal (la celda ESTADO GLOBAL absorbe el botón; verificado
   en §4.17).
6. **Nivel `APROBADA`:** T5.5 exige un punto primary para el evento de
   aprobación; T1 lo omitía en la unión. Se añadió
   `NivelEventoActa = CRITICO | ALERTA | NEUTRAL | APROBADA` (solo
   `domain/acta.ts`, archivo nuevo del whitelist; `types.ts` intacto).
7. **Notificaciones:** `Notificacion` no tiene campo «nivel» y
   `types.ts` está fuera del whitelist → «nivel success/info» del kit se
   mapea a los `TipoNotificacion` existentes: ACTA APROBADA → `sistema`
   (icono Info), RESCANEO COMPLETADO → `rescaneo`. Textos EXACTOS del
   kit.
8. **Observación del rescan:** obligatoria (T5.2) y pasa por el contrato
   `confirmarRescanActa(actaId, observacion)` (T1.3), pero el kit no la
   imprime en el evento/notificación del rescan (textos exactos de
   T5.4) — queda registrada en la auditoría del visor.
9. **Sin fallbacks de iconos:** `IdCard`, `AlertTriangle`, `Contrast`,
   `Maximize/Minimize`, `BadgeCheck`, `RotateCcw/RotateCw`, `ZoomIn/Out`,
   `Loader2`, `Send`, `Info` existen en lucide-react 1.60 — no se usaron
   los fallbacks previstos por §2.4.
10. **Mapeos derivados** (el kit es ambiguo; reglas registradas en D19):
    «CRÍTICO» de mesa = INCOMPLETO; «mesa PENDIENTE» = mesas EN_PROCESO
    de puestos PENDIENTE → P2 PENDIENTE sin motivo; «EN_PROCESO o
    CRÍTICO» → P2 ADVERTENCIA (sin motivo salvo alerta Rescaneo vigente);
    DELEGADOS VALIDA ⇔ ambas partes de delegados ok; «DELEGADOS
    ACREDITADOS n/16» = 2 partes ok→16, 1→8, 0→0; P2 PENDIENTE se dibuja
    como página normal (el kit solo define variante para ADVERTENCIA).
11. **Roma 1 y el resto:** hora de carga genérica derivada por seed
    (ventana 13:00–16:59); historial genérico de 3 eventos con la MISMA
    aritmética que reproduce Roma 1 exacta: estado(horaCarga) →
    RECIBIDO EN COLA (−2 min) → PENDIENTE (−20 min).
12. **Toggle en orden del mockup** `DELEGADOS | TRANSMISIÓN`; al cambiar
    de formulario la página vuelve a 1; al navegar de mesa se conserva el
    tipo (DELEGADOS fuerza página 1). La caja limpia la observación tras
    una acción resuelta.
13. **Badge «ACTA VALIDADA»** derivado del historial (evento APROBADA) —
    sin campo extra en el contrato. Posición: esquina superior izquierda;
    a <1024px baja bajo la toolbar (top-20) para no solaparse.
14. **Firmas vacías con advertencia:** Testigos 3 y 4 (el kit pide «2
    recuadros VACÍOS» sin especificar cuáles).
15. **Observación truncada** en el evento de aprobación a 48 caracteres +
    «…» (kit pide «<observación truncada>» sin límite definido).
16. **Lint del proyecto:** la regla `react-hooks/set-state-in-effect`
    obligó a derivar `actaCargando/actaActual` de una respuesta en
    memoria (snapshot `{puestoId, mesaId, acta}`) y a montar el estado
    local del canvas en un componente interno que se desmonta al cerrar
    (reset de T3.1 sin effect). Cero `eslint-disable` de esa regla.

## BLOQUEADAS

- **Ninguna.** Dos desviaciones declaradas y resueltas por decisión
  documentada (no detienen tareas):
  1. **§4.4 breadcrumb literal** `ITALIA (495) › ZONA 10 › CONSULADO
     ROMA`: el mock congelado (D6/SUP-1, vigente en main) define Italia =
     **499** y puesto **«02 - Roma»**; cambiarlos rompería D6, la tabla
     maestra y vida-v1. El breadcrumb se construye con los datos reales:
     `ITALIA (499) › ZONA 10 › 02 - ROMA`.
  2. **§4.4 etiqueta `MESA 1/8`**: T3.3 («N = total de mesas con acta del
     puesto») y §4.16 («recorre solo mesas con acta») definen el
     comportamiento funcional de forma inequívoca → Italia muestra
     `MESA 1/4` (001/002/004/005 tienen acta; 003/006–008 son
     NO_INICIADO y no navegan).

## Screenshots

Capturas de la sesión de verificación (headless Chrome, no se commitean
por whitelist): `00-inicial-1440` (KPIs D6), `01-mockup-exacto-roma1`
(Roma 1 + P1), `02-pagina2-sello` (P2 sello), `03-delegados` (folio
único), `04-zoom-rotacion-negativo` (zoom+rotación+contraste),
`05-fullscreen`, `06-error-motivo` (validación), `07-aprobada-endtoend`
(overlay + historial), `08-rescan-endtoend` (VERSIÓN 2),
`09-anomalia-pagina2` (entrada por anomalía), `10-375px-visor`,
`11-1440-fullscreen-off`, `12-subpath-preview` (export estático).
