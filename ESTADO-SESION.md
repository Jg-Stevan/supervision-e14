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

## 8. RONDA 3 (2026-10-31) — NUEVOS DISEÑOS: pantalla CARGA MASIVA + visor SIN
##    envío automático + barcode real (✅ IMPLEMENTADA Y VERIFICADA E2E)

El dueño anexó 2 zips nuevos (`upload/design_extract_r3/` y
`upload/design_extract_r3b/`) con 3 pantallas (la de carga masiva viene
duplicada, idéntica):

- **Diseño A — «SISTEMA DE MONITOREO ELECTORAL E-14 · CARGA MASIVA»**:
  remodelación de la PANTALLA principal (no del modal): navbar del sistema
  (ya existía en supervision-shell), header del módulo con métricas de
  sesión (SESIÓN INICIO/FIN · DURACIÓN · ESTADO barra), SIDEBAR izquierda
  (ELEGIR FOTOS + PROCESAR COLA + VACIAR/REINICIAR + MOTOR OCR +
  INFORME & TELEMETRÍA + TELEMETRÍA JSON) y cola a la derecha con filtros y
  tarjetas (thumb blanca, título acta, filename, chips, pills %/score/
  TIEMPO, ABRIR/QUITAR).
- **Diseño B — «visor_de_actas_sin_envio_automatico»**: la SEGUNDA cara del
  modal de revisión (la ronda 1-2 era la variante «ENVÍO AUTOMÁTICO»,
  score 10/10, sin ACEPTAR). Esta variante (score 6/10 ámbar) = panel
  «INGRESO MANUAL DE DATOS» con selects editables (PAÍS/ZONA/PUESTO/MESA/
  ORIGEN/PÁGINA) + KIT/CÓDIGO DE BARRAS read-only + **ACEPTAR ACTA**
  (verde, envía) + RECHAZAR (REESCANEAR).
- **MOTOR OCR (duda resuelta por el dueño)**: el toggle del diseño es REAL —
  «tess best (rápido)» = `tesseract-spa-best-psm4` y «pp (preciso)» =
  `tesseract-best-psm4` (RapidOCR PP-OCRv4, motor de producción).

### Implementación (archivos)

| Cambio | Archivo |
|---|---|
| Header del módulo (métricas reales) | `masiva/barra-lote.tsx` (NUEVO) |
| Selector MOTOR OCR (tess best/pp vía flags.ocrMotor + reinicio seguro) | `masiva/motor-ocr.tsx` (NUEVO) |
| Tarjeta INFORME & TELEMETRÍA + TELEMETRÍA (JSON) | `masiva/informe-lote.tsx` (NUEVO) |
| Hook de métricas (corrida viva O última cerrada; latencia media; msPorFila) | `masiva/metricas-vista.ts` (NUEVO) |
| Layout 2 columnas (sidebar + cola) — acciones al sidebar | `masiva/orquestador.tsx` |
| ZonaCarga sin borde propio (vive en el card del sidebar) | `masiva/dropzone.tsx` |
| Filtros paleta diseño + hilo msPorFila → tiempoTexto | `masiva/bandeja.tsx` |
| Tarjeta de fila (thumb blanca, título=infoTitulo, pills %/score/tiempo) | `masiva/fila.tsx` |
| Fila "PROCESANDO X/Y · COLA QUIETA" | `masiva/progreso-lote.tsx` |
| Glow del sidebar | `src/app/globals.css` → `.glow-border-emerald` |
| **ACEPTAR ACTA** — envío real de la fila abierta (registrarEnvioMasiva → monitor + registro ENVIADA + ledger e65b + patchFila) | `lib/e14/masiva/store.ts` → `enviarActaAbierta` (+ tipos.ts) |
| Variante INGRESO MANUAL (header SquarePen, selects DIVIPOL reales en cascada, ACEPTAR 2 toques, flash → avance) | `masiva/modal-revisor.tsx` |
| **Barcode REAL compartido** (`codigoUnico.crudo` → manifiesto D24; NUNCA `*E14-SEN-…*`) — modal Y publicación del monitor | `store/store-e14.ts` → `barcodeRealDeActa` + `publicarDesdeActa` |

### Puntos finos descubiertos (NO romper)

1. `sincronizarAlVolver` SIEMPRE limpia `origenAbierto` al final (línea
   ~1269) — es su contrato «al volver». `enviarActaAbierta` captura el id
   ANTES, lo re-establece tras el sync (la revisión sigue abierta) y
   re-verifica identidad contra `actaActual` (no contra el puntero).
2. Zona DIVIPOL = 2 dígitos en la base (`zonasDe` → "05"); el join del
   adaptador la normaliza a 3 ("005"). En el modal la zona viaja verbatim
   de la base (2 dígitos) — si no, `puestosDe` no resuelve.
3. El selector de motor usa `reiniciarMotorOcrSiInactivo` (NUNCA
   `rapidOcrReiniciar` a pelo — eso tumba sesiones con OCR en vuelo).
   Si hay OCR en vuelo: override queda guardado + aviso «se aplica al
   próximo arranque». El modelo REAL que cargó se muestra
   (`motorOcrActual()?.modelos` → PP-OCRV4/TESS SPA-BEST).
4. Score pill del modal: esmeralda si `score >= 8` (diseño 10/10) · ámbar
   si < 8 (diseño 6/10) — semántica de los dos diseños.
5. La publicación de actas ACEPTADAS con clasificación débil (EN RH/
   SUGERIDA) sigue el camino D27 honesto: SIN_JOIN → registro en Recepción
   (joinDeActa exige nivel AUTO — no se maquilla). La fila queda ENVIADA
   con los datos corregidos por el supervisor.

### Verificación E2E ronda 3 (agent-browser — r3-*.png en tool-results/)

- Desktop 1360×820: pantalla masiva IDÉNTICA al diseño con datos reales —
  VELOCIDAD PROMEDIO 7.5 s/acta, SESIÓN/DURACIÓN, LOTE #3, latencia 7.5 s,
  SHA-256 VÁLIDA, pills de tiempo por acta (8.6 s, 6.3 s, …) (r3-01/09).
- MOTOR OCR: selector visible con modelo vivo; RÁPIDO/PRECISO cambian
  `flags.ocrMotor` (localStorage e14-flags-overrides) — verificado por
  código + render.
- **Flujo ACEPTAR completo (Diseño B)**: se procesó una foto DEGRADADA
  (`/tmp/acta-degradada.py` PIL: rotada −7°, blur, oscuridad) → pipeline
  real → REVISIÓN HUMANA (score 8.5) → ABRIR → panel INGRESO MANUAL DE
  DATOS con selects en cascada de la base DIVIPOL REAL (Egipto 335 → Zona
  05 → 02 - El Cairo → Mesa 001) → franja inferior refleja la corrección
  en vivo → ACEPTAR (2 toques) → fila ENVIADA con datos corregidos
  (r3-02/03).
- Variante conmuta sola: al re-abrir la acta ya enviada → header ENVÍO
  AUTOMÁTICO + VER EN MONITOR + sin ACEPTAR + datos display (r3-04).
- **Ronda 3 cerrada E2E**: CÓDIGO DE BARRAS = `710003992010202` (1D real del
  papel, NO «E14-SEN-2026-001») en el modal, y el MISMO barcode viaja en la
  publicación → caption del visor del monitor `· 710003992010202` (r3-04).
- Móvil 375×812: masiva apilada (header + sidebar full-width) (r3-06);
  modal scrollable completo (CERRAR/RECHAZAR/auditoría alcanzables,
  r3-07/08).
- lint 0 errores (5 warnings preexistentes ajenos) · dev.log limpio.

## 8b. Feedback del dueño — POST-RONDA 3 (2026-10-31, ✅ APLICADO)

- **«elimina lo de INTEGRIDAD SHA-256:»** → fila retirada del sidebar
  INFORME & TELEMETRÍA (`informe-lote.tsx`): quedan LATENCIA MEDIA ·
  ID LOTE · botón TELEMETRÍA (JSON). Props `enviadas`/`enCola` salieron
  del componente (orquestador deja de pasarlas — siguen vivas para la
  barra de éxito y la bandeja). El hash SHA-256 por acta SIGUE vivo en
  el ledger e65b — solo deja de pintarse en el UI (cero cambios de
  lógica, regla §2 respetada).
- **Push a GitHub aprobado por el dueño** (token entregado en chat) →
  serie completa de parches subida a `main` de
  `Jg-Stevan/supervision-e14`. Pendiente de push (§10) queda CERRADO.
- Verificado: lint 0 errores · dev.log limpio · E2E agent-browser
  (desktop + móvil 375×812): tarjeta sin la fila, resto intacto,
  consola sin errores.

## 8c. Feedback del dueño — MATRIZ DEL MONITOR (✅ IMPLEMENTADA Y VERIFICADA E2E)

Pedidos (cita del dueño): «los filtro de "cierre colombia" y "tiempo" en
realidad eran filtros de mayor a menor, cambialos» · «por defecto mostrar
los urgentes, pero si se aplica un filtro de "cierre col" mostrarlos con
el filtro de mayor a menor» · «si pasan mas de 3 horas transcurridas pasa
a estado critico el puesto» · «los puesto que ya quedan en estado
completo, se van ordenando en orden en la parte inferior» · «verificar
que la "la hora actual" (hora actual pais/puesto emisor) sea correcta».

1. **CIERRE COL y TIEMPO → órdenes, no filtros** (`puestos-table.tsx`):
   los dropdowns Radix de columna (FiltroColumna) se RETIRARON; el
   encabezado COMPLETO es botón de orden (BotonOrden): 1.er clic =
   MAYOR A MENOR (desc), 2.º = menor a mayor (asc), 3.er clic = vuelve
   al orden de urgencia. `aria-sort` en el `th` activo; ámbar + flecha
   ↓/↑/↕ como señalética. Props `puestosBase`/`filtros`/
   `onFiltroColumna` salieron de la tabla (monitor-global deja de
   pasarlas); el filtrado por `cierreCol`/`tiempo` queda vivo en el
   repo/dominio (tests de filtros intactos) pero la UI ya no lo emite.
2. **Orden por defecto = URGENCIA**: sin completar arriba por tiempo
   transcurrido DESC (los quedados primero); COMPLETO SIEMPRE al fondo
   (en orden), incluso con un orden activo.
3. **Regla del dueño >3 hrs → CRÍTICO** (`mock-repository.ts` +
   `domain/tiempo-cierre.ts`): fuente única `UMBRAL_CRITICO_MIN = 180`;
   `derivarEstadoPorUmbral` aplica POSTERIOR al draw de estado (D43:
   cero draws consumidos — semillas intactas). COMPLETO no se toca;
   CRÍTICO sembrado no se degrada. GOLDEN actualizado CONSCIENTEMENTE
   (regla del propio test): 949 = 233 COMPLETO + **218 CRÍTICO** +
   138 PENDIENTE + 360 NO_INICIADO (antes 233/44/198/474).
4. **Verificación «hora actual»**: script sobre los 949 puestos →
   0 incoherencias (`horaActualLocal` = 16:00 local + transcurrido
   EXACTO en el 100%; coherente por construcción). NOTA honesta: el
   demo NO conoce husos reales (cierre COL aleatorio 9 AM–1 PM por
   diseño del kit §4.9); si el dueño quiere cierre geográfico real
   (Tokio 2:00 AM COL primero), es un follow-up con tabla país→huso.
5. Suite: **68/68 tests pass** (determinismo con regla+golden nuevos).
   E2E agent-browser (1440×900 + 375×812): urgencia por defecto
   (críticos >3 hrs arriba, transcurrido descendente exacto), ciclo de
   orden verificado (desc/asc/urgencia), COMPLETO al fondo incluso
   ordenando, KPIs CRÍTICO 27 (lunes), consola/dev.log limpios, lint
   0 errores en archivos tocados.
6. **BACKLOG (palabra del dueño)**: botón de SIMULACIÓN que auto-complete
   puestos con estándares — «después de 2 horas los puestos con menos
   de 3 mesas se completen automáticamente, los paises con mas de 4
   mesas se completen despues de las 5 horas». NO implementado aún.

## 8d. Feedback del dueño — REGLA 100% ⟺ COMPLETO (✅ IMPLEMENTADA Y VERIFICADA E2E)

Pedido (cita del dueño): «si ya se recibieron todas las actas de un puesto
deberia quedar al 100% y completado en verde».

Diagnóstico (script sobre los 949 puestos — `tool-results/diag-coherencia.ts`):
**134 puestos mostraban 100%/100% en las barras con badge CRÍTICO rojo**
(todos de 1 mesa: el acta llegó completa pero una parte de transmisión
tenía alerta «Rescaneo»). La incoherencia: `pctsDeMesas` contaba la parte
alertada como «ok» mientras `estadoMesaDePartes` la marca INCOMPLETO —
la barra decía 100% y el estado decía que no.

Regla grabada (invariante exacta): **100% visible ⟺ todas las actas
válidas ⟺ COMPLETO verde**. Una parte con rescaneo pendiente NO cuenta
como recibida (el acta llegó pero fue rechazada); el CRÍTICO automático
(>3 hrs) solo alcanza a los que NO han completado.

1. `pctsDeMesas` (`mock-repository.ts`): la parte de transmisión con
   `alerta` deja de contar como ok → 100/100 solo con todo válido. Los
   134 casos contradictorios pasan a 100/50 honestos (el detalle muestra
   «Rescaneo» + REINSPECCIONAR: la razón exacta de por qué siguen rojos).
2. Red de seguridad en `initSupervisionDatos`: tras derivar pcts, el
   estado pasa por `estadoGlobalTrasMesas` — si TODAS las mesas están
   completas, el puesto QUEDA COMPLETO (no-op sobre la receta actual,
   garantiza la invariante ante futuras recetas; un COMPLETO jamás es
   degradado por el umbral de 3 hrs).
3. Transición en vivo intacta: resolver el rescaneo (REINSPECCIONAR)
   sube la barra y el puesto culmina 100/100 verde.
4. Verificación: diagnóstico post-fix → **0 filas 100/100 sin verde y
   0 verdes sin 100/100** (DOM completo, 116 filas del día, distribución
   de estados intacta — GOLDEN 233/218/138/360 sin cambio). Suite
   **68/68 pass**. E2E agent-browser: ARGELIA 81 (CRÍTICO 100/50) →
   REINSPECCIONAR → **100/100 COMPLETO** con KPIs moviéndose en vivo
   (COMPLETO 38→39, CRÍTICO 27→26); invariantes y orden de urgencia
   re-escaneados sobre el DOM real; móvil 375×812 sin roturas.
5. Lint del árbol a **0 errores** (los 3 errores que arrastraba el
   template shadcn ahora rastreado — `carousel.tsx` setState-in-effect
   ×2, `sidebar.tsx` Math.random en render, `use-mobile.ts` setState en
   effect — quedaron resueltos con patrones canónicos: rAF diferido con
   limpieza, ancho determinista por `useId`, `useSyncExternalStore`).

## 9. Cómo verificar (SIEMPRE)

```bash
bun run lint          # 0 errores
tail -n 40 dev.log    # dev server corre en :3000 (preview del dueño)
# E2E con agent-browser: / → CARGA MASIVA → botón DEMO ×6 (o abrir acta de la
# bandeja LISTAS) → modal: zoom, AJUSTAR (pantalla completa), rotar, contraste,
# chevrons, MOSTRAR ORIGINAL, RECHAZAR con motivo, VER EN MONITOR.
# Repetir a 375px (móvil).
```

## 10. Pendientes futuros (que el dueño anexará)

- ~~Diseños para los demás flujos (score bajo)~~ → **ENTREGADOS e
  implementados en ronda 3 (§8)**.
- Posible rediseño del visor del MONITOR de supervisión (hoy conserva su
  diseño original — se abre con VER EN MONITOR).
- ~~Push a GitHub del repo `Jg-Stevan/supervision-e14` cuando el dueño
  apruebe.~~ → **HECHO (§8b)** — dueño aprobó y serie completa en `main`.
- Decisión del dueño (opcional): que las actas ACEPTADAS con clasificación
  débil (ingreso manual confirmado) aterricen en el monitor con join — hoy
  van honestas a Recepción como SIN_JOIN (joinDeActa exige nivel AUTO).
