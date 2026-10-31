# ESTADO DE SESIÓN — Rediseño visor de actas E-14 (módulo masiva)

> ⚠️ DOCUMENTO DE RECUPERACIÓN — leer al inicio de CADA sesión nueva.
> Objetivo: sobrevivir a reinicios de sesión, pérdida de parches y pérdida de
> ventana de contexto. Actualizar al final de CADA cambio importante.

## 1. Misión del dueño (Jg-Stevan)

Remodelar el **visor de actas (modal flotante) del módulo MASIVA** del repo
`https://github.com/Jg-Stevan/supervision-e14` con el diseño Stitch
(`/home/z/my-project/upload/design_extract/code.html` + `screen.png`).
Flujo acordado: (1) hacer este visor de ENVÍO AUTOMÁTICO → (2) preview aquí →
(3) al aprobar el dueño, **subir al repo GitHub**. El dueño anexará DESPUÉS
más diseños (score bajo, otros flujos) — este primero y bien hecho.

## 2. Reglas del dueño (NO negociables)

- **Cero cambios de lógica** — solo remodelación y reubicación. La lógica
  (score real, editor, publicación D27, rechazo, sincronizarAlVolver) está toda.
- **Nada de fotos inventadas** — solo imágenes reales (actas-demo = las 6
  fotos del RAR "Imagenes Buenas" del dueño + assets actas-reales del repo).
- Score dinámico real por imagen (`acta.score`), jamás maquitar.
- ENVÍO AUTOMÁTICO = **estado** (la foto cumple el score), no botón. El
  supervisor solo puede RECHAZAR (motivo obligatorio, 2 toques).
- "AJUSTAR" = **pantalla completa** del acta (no es fit/reset).
- Chevrons laterales = navegar **las imágenes procesadas del lote masiva**.
- El diseño es para el flujo de envío automático; las actas SIN envío auto
  mantienen su editor (RECORTAR/ROTAR/DESHACER horneados) en la toolbar.

## 3. Dónde vive TODO

| Cosa | Ruta |
|---|---|
| Modal remodelado (Stitch) | `src/modules/digitalizador/components/e14/screens/masiva/modal-revisor.tsx` |
| Orquestador (navegación, cargarOriginal, DEMO ×6) | `.../screens/masiva/orquestador.tsx` (MasivaView) |
| Visor con gestos (zoom rueda/pellizco/arrastre) | `src/modules/supervision/components/actas/visor-zoom.tsx` |
| Chip publicación D27 | `.../masiva/publicacion-chip.tsx` |
| Píldora de estado | `.../masiva/helpers.tsx` → `pildoraEstadoActa` |
| Retícula del canvas | `src/app/globals.css` → `.grid-paper-bg` |
| Botón VER EN MONITOR → monitor | `supervision-shell.tsx` L~502: `elegirVista("monitor"); abrirVisor(...)` |
| Visor VIEJO de supervisión (se abre en el monitor) | `src/modules/supervision/components/actas/acta-viewer-modal.tsx` (+acta-header/toolbar/acciones) |
| Demo del lote | `src/modules/digitalizador/lib/e14/actas-demo.ts` + `assets/actas-demo/*.jpg` |
| Diseño fuente | `upload/design_extract/code.html` + 2 capturas en `upload/pasted_image_*.png` |
| Parche de respaldo | `download/0001…0008-*.patch` — serie completa regenerada con `git format-patch 710f8c6 -o download/` (regenerar TRAS CADA commit) |

## 4. Commits (rama main del sandbox — `git log --oneline`)

- `465c750` redesign(masiva): visor flotante estilo Stitch (auditoría y escrutinio)
- `2ea4b7c` chore(sandbox): adaptaciones del entorno de preview (NO para merge)
- `1e5f9fd` snapshot sandbox (tool-results, zscripts, patch)
- `b4abd4f` feedback ronda 1 (ver §5)
- `1cd7c37` feedback ronda 2 — parte A (auto-commit): VER EN MONITOR fijo,
  tarjeta shrink-0 + desplazador interno, gap-4, caption sin asteriscos
- `67c2f71` feedback ronda 2 — parte B: barcode REAL del escaneo (ver §5-bis)

El repo original está en GitHub; el sandbox es clone de supervision-e14.
**PUSH al repo SOLO cuando el dueño lo apruebe.**

## 5. Feedback del dueño — RONDA 1 (2026-10-30, ✅ IMPLEMENTADA Y VERIFICADA)

Petición textual: «lo de ver en el monitor está muy bien, solo que no se ve
bien la información del acta; deja solo el botón de cerrar; y cambia como está
en la imagen el botón de ver en editor» + correcciones. Interpretación
aprobada por evidencia (2 capturas del dueño en `upload/`):

1. **VER EN MONITOR** pasa a la **cabecera del panel** (junto a
   «✓ ENVÍO AUTOMÁTICO», outline verde + icono Monitor, como la captura
   `pasted_image_1793402902287.png`). En la parte baja del panel queda
   **SOLO el botón CERRAR**; `PublicacionChip` se recoloca compacto bajo la
   tarjeta de datos (es lógica D27, no se elimina).
2. **Campos del panel** = EXACTAMENTE los del diseño: Verificación de
   Identificador/Código, PAÍS, ZONA, PUESTO, MESA, ORIGEN, PÁGINA, KIT,
   CÓDIGO DE BARRAS. ELIMINADOS: Intento, Hash, IdEnlace (D22) — no están
   en el diseño.
3. **«Verificación de Identificador / Código»** = el código IMPRESO entre las
   XX del acta física = `X 7 - 23 - 10 - 19 X` (constante de plancha del
   formulario E-14 exterior — verificado en las actas reales y en las 6 fotos
   del dueño). NO es el código de barras (ese va en su campo propio).
4. **Móvil no navegable**: el root del modal era `overflow-hidden` con aside
   `shrink-0` → el panel quedaba cortado e inalcanzable. Fix: root
   `overflow-y-auto` en móvil (`lg:overflow-hidden`), chevrons con target
   táctil ≥44px.
5. **«ampliar» no ampliaba en celular**: `expandido` solo ocultaba el aside
   (que ya estaba fuera de pantalla) — el canvas seguía en 52vh. Fix:
   `expandido` → canvas `h-dvh` en móvil (pantalla completa real).

### Verificación E2E (agent-browser — evidencia en tool-results/r1-*.png)

- Desktop 1366×900: panel EXACTO al diseño (`X 7 - 23 - 10 - 19 X`, sin
  Intento/Hash/IdEnlace), VER EN MONITOR en cabecera (publicada → r1-04),
  abajo SOLO CERRAR, chip PUBLICADA bajo la tarjeta.
- VER EN MONITOR → aterrizaje LIMPIO: cabecera solo con ✕ y sin panel de
  acciones (r1-12) — el resto de los flujos del visor de supervisión
  (tablas del monitor → r1-13) conservan cabecera completa + acciones.
- Móvil 375×812: modal completo scrollable (panel + CERRAR alcanzables,
  r1-08/09), AJUSTAR = pantalla completa real del acta (r1-10, re-fit
  automático 66→186 %), zoom ± OK (r1-11), chevrons 44px.
- RECHAZAR a 2 toques con motivo obligatorio OK (r1-14/15).
- lint 0 errores · tsc sin errores nuevos · dev.log limpio.

## 6. Feedback del dueño — RONDA 2 (✅ IMPLEMENTADA Y VERIFICADA E2E)

Textual: «deja el "ver en monitor" fijo (que no se elimine despues de darle
click)» · «el espacio del codigo de barras no esta digilenciado correctamente
aparece "*E14-SEN-2026-001*"» · «se sigue sin ver la info del acta lo tapan
los demas campos … agrega un desplasador dentro de la misma clase para
ventanas medianas o pequeñas» · «en "Código de Barras / E14-SEN-2026-001"
debe de aparecer el codigo de barras del acta escaneada».

1. **VER EN MONITOR FIJO** (modal-revisor): la condición ya NO es
   `publicacion?.estado === "publicada"` (registro EN MEMORIA del store — se
   perdía al recargar/cerrar y el botón desaparecía). Ahora es
   `join && onVerEnMonitor && publicacion?.estado !== "bloqueada"` — el join
   sale de la clasificación AUTO que VIAJA PERSISTIDA con el acta. Solo se
   oculta en cuarentena D25 (ahí el acta NO está en el monitor — honesto).
2. **CÓDIGO DE BARRAS = el del acta ESCANEADA**: el campo muestra
   `clasificacion.codigoUnico.crudo` (15 dígitos decodificados del 1D del
   papel por el pipeline — gramática codigoUnicoE14), con respaldo del
   manifiesto D24 (`barcodesImpresos`) vía join. FUERA el tracking del
   sistema `*E14-SEN-2026-001*` (acta.codigoBarras — no está impreso en el
   papel). Verificado en las 6 fotos: 710003993010102 / …010202 (TRANSMISIÓN
   pág 1/2), 710007453010102 / …010202 (kit 745), 710003992010102 / …010202
   (DELEGADOS). El caption del visor de supervision también salió sin
   asteriscos Code 39.
3. **TARJETA DE DATOS siempre visible**: la tarjeta era ítem flex con
   `overflow-hidden` → mínimo 0 → se COMPRIMÍA y el contenido quedaba tapado
   en ventanas medianas/pequeñas. Fix doble: (a) `shrink-0` en la tarjeta —
   jamás se comprime (el aside desplaza); (b) DESPLAZADOR INTERNO pedido por
   el dueño: el div de datos (`space-y-3 p-3.5 font-mono text-xs`) lleva
   `max-h-[45dvh] overflow-y-auto scroll-panel` (scroll fino, overscroll
   containment solo en lg para no atrapar el dedo en móvil). Panel
   compactado: gap-6→4, space-y-6→4.

### Verificación E2E ronda 2 (agent-browser — r2-*.png en tool-results/)

- Ventana MEDIANA 1100×650 (el caso que comprimía): tarjeta íntegra con
  desplazador interno, VER EN MONITOR visible (r2-01/02), barcode limpio.
- FIJO: click → aterrizaje monitor limpio (r2-03) → volver a masiva → el
  modal reabre CON el botón (r2-04) → **reload de página** → reabrir el acta
  → el botón SIGUE (r2-05, condición por join persistida) ✓.
- Móvil 375×812: panel completo alcanzable (r2-06/07: tarjeta + barcode real
  + OBSERVACIONES + RECHAZAR + CERRAR), chevrons navegan IMG 1→2 con panel
  sincronizado (r2-08), AJUSTAR = pantalla completa real (r2-09).
- Barcodes reales por imagen verificados 1 a 1 (r2-10/11).
- lint 0 errores · dev.log limpio.

## 7. Cómo verificar (SIEMPRE)

```bash
bun run lint          # 0 errores
tail -n 40 dev.log    # dev server corre en :3000 (preview del dueño)
# E2E con agent-browser: / → CARGA MASIVA → botón DEMO ×6 (o abrir acta de la
# bandeja LISTAS) → modal: zoom, AJUSTAR (pantalla completa), rotar, contraste,
# chevrons, MOSTRAR ORIGINAL, RECHAZAR con motivo, VER EN MONITOR.
# Repetir a 375px (móvil).
```

## 8. Pendientes futuros (que el dueño anexará)

- Diseños para los demás flujos (ej. fotos de score bajo → flujo con editor).
- Posible rediseño del visor del MONITOR de supervisión (hoy conserva su
  diseño original — se abre con VER EN MONITOR).
- Push a GitHub del repo `Jg-Stevan/supervision-e14` cuando el dueño apruebe.
