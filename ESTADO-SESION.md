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
| Parche de respaldo | `download/0001-redesign-masiva-visor-flotante-estilo-Stitch-auditor.patch` (+ regenerar tras cada commit: `git format-patch` contra `710f8c6`) |

## 4. Commits (rama main del sandbox — `git log --oneline`)

- `465c750` redesign(masiva): visor flotante estilo Stitch (auditoría y escrutinio)
- `2ea4b7c` chore(sandbox): adaptaciones del entorno de preview (NO para merge)
- `1e5f9fd` snapshot sandbox (tool-results, zscripts, patch)
- `<siguiente>` feedback ronda 1 (ver §5)

El repo original está en GitHub; el sandbox es clone de supervision-e14.
**PUSH al repo SOLO cuando el dueño lo apruebe.**

## 5. Feedback del dueño — RONDA 1 (2026-10-30, EN PROGRESO)

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

## 6. Cómo verificar (SIEMPRE)

```bash
bun run lint          # 0 errores
tail -n 40 dev.log    # dev server corre en :3000 (preview del dueño)
# E2E con agent-browser: / → CARGA MASIVA → botón DEMO ×6 (o abrir acta de la
# bandeja LISTAS) → modal: zoom, AJUSTAR (pantalla completa), rotar, contraste,
# chevrons, MOSTRAR ORIGINAL, RECHAZAR con motivo, VER EN MONITOR.
# Repetir a 375px (móvil).
```

## 7. Pendientes futuros (que el dueño anexará)

- Diseños para los demás flujos (ej. fotos de score bajo → flujo con editor).
- Posible rediseño del visor del MONITOR de supervisión (hoy conserva su
  diseño original — se abre con VER EN MONITOR).
- Push a GitHub del repo `Jg-Stevan/supervision-e14` cuando el dueño apruebe.
