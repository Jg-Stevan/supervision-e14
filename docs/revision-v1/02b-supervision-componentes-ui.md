# Revisión Profunda — Paquete 2-b: supervision · componentes UI

> Task ID: 2-b · Alcance: `src/modules/supervision/components/**` (23 archivos · 5.502 líneas, verificado con `wc -l`) · Lecturas de apoyo: `domain/types.ts` (contrato), `docs/DECISIONS.md` (D11, D20), kit `fundacion-v1` y `monitor-jornada-v1` (worklog/README/código). Repo: supervision-e14 · Next 16 + React 19 + TS estricto + Tailwind 4 + shadcn/ui, tema dark-only.

---

## 1. Mapa del paquete

| Archivo | Líneas | Rol (1 línea) | Observación |
|---|---|---|---|
| `datos-provider.tsx` | 595 | Store cliente (contexto grande + ticker en contexto hoja D42 + estado/acciones del visor + monta el modal) | 🔴 side-effect dentro de updater (223); gigante a partir |
| `actas/documento-e14.tsx` | 575 | Papel A4 E-14 sintético en SVG/JSX, 3 variantes de página, datos determinísticos | Duplica helpers de dominio; generaradores mezclados con UI |
| `puestos-table.tsx` | 500 | Matriz maestra: 949 filas memoizadas, colgroup fijo (D43), filtro de columna | 🔴 trigger `<tr>` sin teclado (411); consume contexto grande (398) |
| `supervision-shell.tsx` | 489 | Shell: header sticky, overlay sidebar (D14), flag MODULOS_INACTIVOS (D20), navegación por estado (D11) | Dialog sin focus trap; chip de gama podría vivir en su módulo |
| `vista-recepcion.tsx` | 433 | Log en vivo de recepción (suscripción + frescos 1.7 s), KPIs-filtro, búsqueda | CLASE_CHIP duplicado; skeleton inline |
| `actas/acta-viewer-modal.tsx` | 426 | Modal visor por estado (D17): canvas + toolbar por ref + caption + sidebar | 426 líneas, derivaciones de caption/página en render |
| `vista-informes.tsx` | 410 | Informes .md/.csv client-side (Blob + `<a download>`), preview | Dormida (D20); duplica resumenDePuestos y formato OK/Pend |
| `actas/visor-zoom.tsx` | 384 | Lienzo con zoom real (rueda anclada, pellizco, arrastre, doble toque) por rAF | Excelente; límites duplicados con toolbar |
| `actas/acta-header.tsx` | 225 | Header del visor: breadcrumb, navegador MESA n/N, toggle formulario, páginas | Hex hardcodeados (155, 190, 208) |
| `mesas-subtable.tsx` | 214 | Sub-tabla de mesas: chips P1/P2, REINSPECCIONAR, VER ACTA | Consume contexto grande (93); NO remains of NOTIFICAR (kit jornada) |
| `filtros-bar.tsx` | 192 | 5 selects + búsqueda, select FECHA real (kit monitor-jornada-v1) | Limpio; grid responsive correcto |
| `monitor-global.tsx` | 173 | Coordinador dashboard: KPIs clickeables, resumen del día, filtros, tabla | Bien particionado; transición simulada delega al provider |
| `vista-anomalias.tsx` | 162 | Lista de anomalías con filtro Abiertas/Todas/Revisadas + VER ACTA | CLASE_CHIP duplicado |
| `vista-notificaciones.tsx | 138 | Centro de notificaciones (marcar leída / todas) | Dormida (D20), código sano |
| `actas/acta-toolbar.tsx` | 133 | Toolbar flotante: zoom ±, ajustar, rotar, contraste, pantalla completa | Duplica constante de límites |
| `actas/acta-acciones.tsx` | 126 | Aprobar / Confirmar rescaneo + observación obligatoria | Validación accesible correcta; hex hardcodeados |
| `kpi-card.tsx` | 78 | Card KPI clickeable (filtro toggle) con aria-pressed | Modelo a seguir |
| `resumen-chips.tsx` | 71 | Barra resumen + chip ticker (recibe texto por prop, D42) | `role="status"` + `aria-live="off"` contradictorios |
| `status-badge.tsx` | 61 | Badge de estado (tinte 10 % + borde + icono) y `colorDeEstado()` | Fuente única de colores de estado |
| `actas/acta-historial.tsx` | 53 | Timeline de eventos del acta | Hex #e9c400 no tokenizado |
| `esqueleto.tsx` | 36 | Skeleton del módulo (pulse) | Solo lo usa el monitor; 5 vistas duplican skeletons inline |
| `tiempo.ts` | 14 | `tiempoRelativo()` determinístico | Bien, pero hay otros formateadores sueltos |
| `status-dot.tsx` | 14 | Punto verde "live" | OK |

Total: 23 archivos · 5.502 líneas · 18 con `"use client"` · ~5.500 líneas cumplen el inventario del encargo.

---

## 2. Arquitectura UI y flujo de interacción (explicado al programador nuevo)

**Una sola página, cero rutas (D11).** `src/app/page.tsx:11` monta `<SupervisionShell />` y nada más. Toda la "navegación" es un `useState<VistaId>` en `supervision-shell.tsx:355` (`monitor | recepcion | carga-masiva | notificaciones | anomalias | informes | perfil`) resuelto por un `switch` (`VistaActual`, líneas 277–298). No hay Next Router, no hay URL, no hay deep-link. La razón declarada (D11 en `docs/DECISIONS.md:154`) es mantener trivial el `output: "export"` estático y no abrir la frontera del módulo.

**Capas de datos — un solo dueño.** `DatosProvider` (`datos-provider.tsx:137`) es el store cliente: carga el repositorio async (mock, ~400 ms), expone mutaciones (`reinspeccionar`, acciones del visor) y corre la vida simulada (ticker +5 s cada 5 s, transición cada 45 s). Las vistas **no** tocan el repositorio: solo `useDatos()`. Los datos de recepción llegan por suscripción (`suscribirseRecepcion`, `vista-recepcion.tsx:209`; badge en `supervision-shell.tsx:367`) y las publicaciones de carga masiva por `suscribirseActasRuntime` (`datos-provider.tsx:268`).

**Dos contextos, uno grande y uno hoja (D42).** El contexto de DATOS (`Contexto`, línea 107) lleva estado + acciones + visor; su `valor` está memoizado (518) y SOLO cambia con eventos reales. El ticker vive en `ContextoTicker` (113) para que «Sincronizado hace Xs» no re-renderice las 949 filas cada 5 s; su único consumidor es `ResumenChips` vía prop desde `monitor-global.tsx:37,156`.

**El visor de actas es un modal por estado (D17).** `visorActa` vive en el store; `ActaViewerModal` se monta desde el propio provider (577) y solo existe mientras `visorActa !== null` (`acta-viewer-modal.tsx:61-65`). Al cerrar se desmonta → zoom/rotación/contraste se resetean gratis (sin effect de reset). El zoom real vive en `VisorZoom` (ref imperativa + estado espejo para el %).

**Módulos dormidos (D20).** `MODULOS_INACTIVOS = ["notificaciones","informes"]` (`supervision-shell.tsx:77-80`) se filtra del sidebar (215); sus vistas quedan sin import ni caso en el switch — inalcanzables por UI y por estado (el `default` cae al monitor). Reactivar = reponer 2 imports + 2 casos + vaciar la lista (costo documentado en D20, DECISIONS.md:336-342).

**Seams entre módulos por props, no por contexto cruzado.** La única puerta supervision→digitalizador es `onVerEnMonitor` (`supervision-shell.tsx:43,289-291,477-482`): aterriza un acta publicada cambiando a MONITOR y abriendo el visor. Mismo seam para recepción (D28).

**Flujo típico de una fila:** Monitor → FiltrosBar filtra el día (por defecto LUNES, `monitor-global.tsx:42`) → `PuestosTable` memoiza filas → clic en fila (`Collapsible` con `<tbody>` como raíz) → `MesasSubtable` → VER ACTA → `abrirVisor` en el store → modal carga el acta por repositorio → Aprobar/Rescanear → notificación + toast + KPIs actualizados en vivo.

---

## 3. Lo que está BIEN

1. **La optimización D42 está bien ejecutada en su diseño**: contexto hoja para el ticker (`datos-provider.tsx:109-113,569,593`), valor memoizado con todas las acciones en `useCallback` (518-567), `MESAS_VACIAS` estable para no romper el memo por fila (`puestos-table.tsx:229`), `PuestoRow` memoizado (382) y toggle estable (267). La intención y la mayor parte de la plomería son correctas (el agujero concreto se lista en §4).
2. **Higiene de efectos ejemplar**: flags `vivo` contra carreras de async (`datos-provider.tsx:171-196,325-339`), limpieza de timers de "filas frescas" (`vista-recepcion.tsx:224-229`), `ResizeObserver.disconnect` (`visor-zoom.tsx:228`), pausa del ticker con pestaña oculta (`datos-provider.tsx:222`, D39).
3. **`VisorZoom` es el mejor componente del paquete**: escala/offset en refs + rAF coalescing (1 setState por frame, `visor-zoom.tsx:97-117`), zoom anclado al cursor con fórmula correcta (169-187), pellizco de 2 punteros con arrastre del punto medio (291-311), doble toque ajustar↔acercar (334-346), límites y `limitar()` que impide vacíos, fail-safe en `setPointerCapture` (270-274), re-ajuste por `fitKey` y resize.
4. **Matriz con columnas deterministas (D43)**: `table-fixed` + `<colgroup>` con % calibrados que suman 100 y una sola fuente de alineación (`puestos-table.tsx:44-69,315-320`); sticky header dentro del scrollport correcto (306); técnica replicada en la sub-tabla (`mesas-subtable.tsx:52-59`).
5. **Accesibilidad por encima del promedio del repo**: 52 `aria-label`, 11 `aria-pressed`, 21 `focus-visible` visibles; `aria-current="page"` en nav (`supervision-shell.tsx:153`); validación de formulario con `aria-invalid` + `aria-describedby` + `role="alert"` (`acta-acciones.tsx:107-122`); `role="progressbar"` con `aria-valuenow` (`puestos-table.tsx:212-216`); `caption sr-only` (`mesas-subtable.tsx:111-113`); `aria-live="polite"` en MESA n/N (`acta-header.tsx:109`).
6. **Tamaños de toque correctos donde importa**: filtros, chips, KPI y botones de fila a `h-11` (44 px) — 36 usos.
7. **Sistema visual coherente**: tinte 10 % con `color-mix` + borde del color (`status-badge.tsx:51-55`, `resumen-chips.tsx:58-62`), cero sombras (D14) respetado en todo el paquete, radios `4px` uniformes, jerarquía por capas tonales (`--surface-lowest` → `--card`).
8. **Contrato único de estado**: `resumenDePuestos` exportado y reutilizado para los KPIs del día (`monitor-global.tsx:55`), el informe no recalcula con otra regla (aunque ver §5.3).
9. **Sin binarios inventados**: el papel E-14 es SVG/JSX determinístico (D18) y la miniatura sin foto es un "hueco honesto" (`vista-recepcion.tsx:57-67`).
10. **CSV seguro** (escape de comillas/comas, `vista-informes.tsx:140-145`) y descarga con `revokeObjectURL` (49).

---

## 4. Deudas y problemas

### 🔴 Críticos

**C1 — Las filas de la matriz no son operables con teclado.**
`puestos-table.tsx:410-415`: el `CollapsibleTrigger asChild` convierte el `<TableRow>` (un `<tr>`) en el trigger. Radix solo fusiona `onClick`/`aria-expanded`/`data-state` sobre el `<tr>`: **sin `tabIndex`, sin `role="button"`, sin `onKeyDown`** — un `<tr>` no es enfocable. Consecuencia: un usuario de teclado no puede expandir ningún puesto y TODO el contenido de la sub-tabla (REINSPECCIONAR, VER ACTA por mesa) queda inalcanzable. WCAG 2.1.1 (Keyboard) violado en el componente central del producto. Fix barato: `tabIndex={0}` + `role="button"` + Enter/Space, o mover el trigger a un `<button>` dentro de la primera celda.

**C2 — Las filas memoizadas se suscriben al contexto GRANDE y anulan D42 justo en los eventos del visor.**
`puestos-table.tsx:398` (`const { abrirVisorDePuesto } = useDatos()`) y `mesas-subtable.tsx:93` (`abrirVisor`) consumen el contexto completo dentro de filas `memo`. Pero el `valor` del contexto incluye `visorActa`, `actaCargando`, `actaActual`, `accionActaEnCurso` (`datos-provider.tsx:518-567`): **abrir/cerrar el visor, navegar MESA n/N, cargar un acta o pulsar Aprobar re-crea la identidad del contexto → TODAS las filas visibles re-renderizan** (la suscripción a contexto bypasa el `memo`, `puestos-table.tsx:382`). El comentario de D42 promete «una fila solo re-renderiza cuando SUS datos cambiaron» — se cumple para el ticker, no para el flujo de actas, que es justo el flujo caliente. Fix (S): partir el contexto en Estado/Acciones (o un `ContextoAcciones` hoja con callbacks estables) y que las filas consuman solo acciones.

**C3 — Efecto secundario dentro de un updater de estado: transición doble en StrictMode.**
`datos-provider.tsx:223-229`: `setSegundosTicker((segundos) => { … void aplicarTransicion(); return 0; })`. Los updaters deben ser puros; React 19/StrictMode los invoca **dos veces** en dev → `aplicarTransicion()` corre dos veces, mutando el mock dos veces (dos mesas completadas por ciclo de 45 s, D13 corrompido en dev; KPIs del dueño no cuadran). Fix (S): sacar el side-effect del updater (comparar `segundos + TICKER_SEGUNDOS >= TRANSICION` fuera, o guardar el disparo en un flag ref).

### 🟡 Medios

**M1 — Sin virtualización para 949 filas.** `puestos-table.tsx:361-371` renderiza todas las filas del conjunto filtrado. El filtro por defecto LUNES (`monitor-global.tsx:42`) baja a 116 filas y salva el primer render, pero «Fecha: todos los días» monta las ~949 filas × 10 columnas (~14k componentes, cifra del propio comentario `datos-provider.tsx:149`) de golpe. No hay `react-window`/`@tanstack/react-virtual` en `package.json` (coherente con la regla «sin libs nuevas», pero hoy el límite lo sostiene un filtro, no la arquitectura). Al menos documentar el tope o virtualizar cuando se elija "todos".

**M2 — Menú de filtro de columna a mano, sin semántica de menú.** `puestos-table.tsx:93-161`: `role="menu"`/`menuitem` sobre un `Collapsible` — no cierra con Escape, ni con clic fuera, ni al perder foco; sin `aria-haspopup`, sin `aria-checked` (el check es un icono con opacidad), sin navegación por flechas. Radix ya está en dependencias (`radix-ui 1.8.1`): `DropdownMenu` resuelve todo gratis y elimina ~70 líneas.

**M3 — Diálogos sin focus trap ni devolución de foco.** Sidebar overlay (`supervision-shell.tsx:410-419`) y visor (`acta-viewer-modal.tsx:187-199`): `role="dialog" aria-modal="true"` + foco inicial al panel, pero Tab escapa al contenido de fondo (no hay `inert`/focus-trap) y al cerrar el foco NO vuelve al disparador (☰, 👁, VER ACTA). Con `aria-modal` el lector de pantallas cree que el fondo está inerte pero el foco real sigue saliendo.

**M4 — Cero deep-linking / back button (costo estructural de D11).** Refrescar vuelve a `monitor` con filtros por defecto (LUNES, expansión de Italia); el botón Atrás del navegador abandona la app; no se puede compartir «el acta de la mesa 002 de Roma» por URL, y el visor abierto se pierde al recargar. D11 es una decisión válida para el export estático, pero sync `vista`+`visorActa` con `location.hash` (o `history.replaceState`) lo resolvería sin rutas ni server (esfuerzo S). Hoy el estado de trabajo del supervisor es incapturable.

**M5 — Hex hardcodeados fuera del papel (rompen el sistema de tokens).** `acta-acciones.tsx:54,76` (`#003912`, `#410004`), `acta-header.tsx:155,190,208` (mismos), `acta-historial.tsx:17` (`#e9c400`). Son los "containers" del par primary/error que NO existen como tokens en `globals.css` (solo hay `--primary`, `--danger`, `--error-text`). El kit permite hex SOLO dentro del papel D18 (`documento-e14.tsx:20-24`, excepción documentada). Fix: tokenizar `--primary-container`/`--error-container` en el tema.

**M6 — Sintaxis Tailwind v3 suelta en un código v4.** `vista-informes.tsx:250`: `text-[--primary-foreground]` (shorthand implícito de var, estilo v3) en medio de un paquete que usa consistentemente la sintaxis v4 `text-(--x)` (36+ ocurrencias). Verificar que compila; unificar a `text-(--primary-foreground)`.

**M7 — Dos definiciones de "mesa con acta" que hoy coinciden y mañana pueden divergir.** El dominio exporta `tieneActa` (`data/actas-mock.ts:265-267`, usado por el store en `datos-provider.tsx:369,375`), pero la fila y el visor re-implementan el predicado inline: `puestos-table.tsx:402` y `acta-viewer-modal.tsx:123` (`estadoMesa !== "NO_INICIADO"`). Si la regla cambia (p. ej. acta en cuarentena), el índice MESA n/N del visor y el 👁 de la fila pueden apuntar a mesas distintas. Usar el helper.

**M8 — `vista-informes` y `vista-notificaciones` consumen el contexto completo.** `vista-informes.tsx:172`, `vista-notificaciones.tsx:34-40`: re-renderizan por cualquier evento del store (incluida la vida de 45 s). Hoy son dormidas (D20) y el impacto es nulo, pero al reactivarlas conviene pasarles props derivadas o separar acciones/estado (misma solución que C2).

### 🟢 Leves

**L1 — `expandidoInicialId` silenciosamente obsoleto.** `monitor-global.tsx:166` pasa `filtrados[0]?.id` que cambia con los filtros, pero `expandidos` solo se inicializa una vez (`puestos-table.tsx:261-263`): al cambiar de día no se re-expande la primera fila. Probablemente deseable (conserva la elección del usuario), pero conviene documentarlo.

**L2 — Contradicción ARIA live.** `resumen-chips.tsx:46-47`: `role="status"` (implícitamente `aria-live="polite"`) junto a `aria-live="off"` — el valor final depende del AT. Elegir uno (para un ticker de 5 s, `off`/ninguno).

**L3 — Objetivos de toque pequeños en el visor.** Botones de toolbar `size-9` (36 px, `acta-toolbar.tsx:48`), chevrons de mesa `size-8` (32 px, `acta-header.tsx:78`), 👁 de fila `size-9` (`puestos-table.tsx:476`). Bajo los 44 px de WCAG 2.5.5; en desktop aceptable, en el uso táctil (gama baja móvil es escenario explícito del proyecto) conviene `size-10/11` con hit-area ampliada.

**L4 — Texto microscópico.** `documento-e14.tsx` (papel, justificado) pero también UI real: `acta-viewer-modal.tsx:417` (`text-[9px]`), `acta-historial.tsx:44` (`text-[11px]`), footer de auditoría. En proyector/sala de mando (contexto electoral) el 9 px no es legible.

**L5 — Nomenclatura inconsistente del formulario DELEGADOS.** `vista-recepcion.tsx:146-149` lo etiqueta "CÓNSUL/EMBAJADOR"; `acta-header.tsx` usa "Acta de Acreditación de Delegados"/"Delegados"; el caption del visor dice "ACTA DE DELEGADOS" (`acta-viewer-modal.tsx:168`). Es el mismo `FormularioTipo`; un mapa de etiquetas único evitaría confusión (D26 llama al acta real "CÓNSUL/EMBAJADOR", pero para el sintético se usa Delegados).

**L6 — `abrirVisorDeAnomalia` decide la página con un heurístico de dominio en el store.** `datos-provider.tsx:388-393` («COMPLETO → pág 1, si no → pág 2»): regla de negocio viva en la capa de UI/store; moverla a `domain/acta.ts` cuando crezca.

**L7 — Scroll doble posible en el modal a <1024px.** Panel `overflow-y-auto` (`acta-viewer-modal.tsx:195`) + canvas con zoom propio; con sidebar apilada y zoom alto el gesto de arrastre compite con el scroll del panel (`touch-none` del lienzo lo mitiga dentro del documento, pero el borde queda "pegajoso"). Vigilar en pruebas móviles.

---

## 5. Duplicados y reutilización

1. **`CLASE_CHIP` — 3 copias idénticas**: `vista-recepcion.tsx:35`, `vista-anomalias.tsx:31`, `vista-notificaciones.tsx:30` (misma cadena literal). → extraer a `ui/chips.tsx` del módulo con el patrón activo (`border-(--primary) bg-(--accent)`) incluido.
2. **Skeletons inline — 5 copias** del mismo bloque `animate-pulse` pese a existir `Esqueleto`/`EsqueletoMonitor` (`esqueleto.tsx`): `supervision-shell.tsx:470-473`, `vista-recepcion.tsx:273-277`, `vista-informes.tsx:182-187`, `vista-anomalias.tsx:46-50`, `vista-notificaciones.tsx:44-50`. Solo el monitor usa el componente. → `<EsqueletoVista />` único.
3. **KPIs derivados — 2 implementaciones**: `resumenDePuestos` (`datos-provider.tsx:120-135`) vs `kpisDe` (`vista-informes.tsx:64-73`) — misma invariante `total = completo + crítico + pendiente + noIniciado` duplicada. La vista dormida debería importar la del store.
4. **Helpers de dominio re-implementados en el papel**: `delegadosAcreditados` (`documento-e14.tsx:31-35` ≡ `actas-mock.ts:271-273`) y `ciudadDePuesto` (`documento-e14.tsx:38-41` ≡ `actas-mock.ts:58-62`), copia literal.
5. **Constante de zoom duplicada**: `LIMITE_ZOOM` (`acta-toolbar.tsx:24`) vs `LIMITES_ZOOM_VISOR` (`visor-zoom.tsx:69`) — el comentario lo admite («misma constante»); importar la exportada.
6. **Plomería de diálogo duplicada**: bloque Escape + scroll-lock + foco inicial (`supervision-shell.tsx:376-389` ≈ `acta-viewer-modal.tsx:94-106`). → hook `useDialogOverlay({onClose, ref})` (y de paso se resuelve M3 en un solo sitio).
7. **Parches de estado casi idénticos**: `reinspeccionar` (`datos-provider.tsx:235-261`) y la suscripción de carga masiva (268-294) hacen el mismo merge de `puestos` + `mesasPorPuesto` + prepend de notificación + toast. → helper `aplicarResultadoMesa(resultado)`.
8. **Formato OK/Pend por parte — 3 copias en una vista**: `vista-informes.tsx:124-127` (md), `156-159` (csv), `372-385` (JSX). → `parteEtiqueta(e)` única.
9. **Mapeos estado→color en paralelo**: `ESTILOS` (`status-badge.tsx:19-30`, canónico), `ESTADO_PILDORA` (`vista-recepcion.tsx:39-43`), `CLASE_SEVERIDAD` (`vista-anomalias.tsx:17-21`), `COLOR_PUNTO` (`acta-historial.tsx:15-20`), `VAR_TONO` (`kpi-card.tsx:17-22`), `COLOR_SEVERIDAD` (`puestos-table.tsx:164-168`). No son equivalentes (dominios distintos) pero convergen en los mismos 4 tokens; un módulo `semantica.ts` con `tono→var` unificaría el resto.
10. **Formateadores de fecha/hora dispersos**: `tiempoRelativo` (canonizado en `tiempo.ts`), `horaExacta` (`vista-recepcion.tsx:52-54`), `fechaLarga`/`fechaISO` (`vista-informes.tsx:27-38`). → mover a `tiempo.ts`.

---

## 6. Guía de lectura para el programador nuevo

1. **Empieza por el esqueleto**: `src/app/page.tsx` → `supervision-shell.tsx` (header + overlay + switch de vistas). Entiende D11 (nada de rutas), D14 (sidebar overlay único) y D20 (`MODULOS_INACTIVOS`).
2. **Luego el corazón**: `datos-provider.tsx`. Es store + ciclo de vida: carga async → ticker cada 5 s (contexto hoja D42) → transición cada 45 s; y todo el estado del visor de actas. No leas las mutaciones una por una: son el patrón «spinner → repo → merge estado → toast» repetido.
3. **La matriz**: `monitor-global.tsx` (composición) → `filtros-bar.tsx` (filtro FECHA real del kit monitor-jornada-v1) → `puestos-table.tsx` (D43 colgroup + memo PuestoRow) → `mesas-subtable.tsx` (chips P1/P2 + acciones).
4. **El visor**: `acta-viewer-modal.tsx` (orquesta) → `visor-zoom.tsx` (gestos; la joya) → `acta-header/toolbar/acciones/historial` (piezas tontas) → `documento-e14.tsx` (papel sintético D18; ignora la paleta `PAPEL`, es excepción acotada).
5. **Las vistas de listas**: `vista-recepcion.tsx` (log en vivo por suscripción) y `vista-anomalias.tsx`; las dormidas `vista-notificaciones.tsx` / `vista-informes.tsx` léelas solo si reactivas D20.
6. **Convenciones que debes respetar**: sin sombras (D14), tokens `(--var)` de Tailwind 4, `h-11` para controles, `label-caps`/`font-data`/`stats-number` como clases semánticas, acciones asíncronas con spinner + toast desde el store, y `tieneActa` del dominio como único predicado de "hay acta" (ver M7).

---

## 7. Recomendaciones de reorganización (partir componentes, extraer hooks, esfuerzo S/M/L)

| # | Recomendación | Dónde | Esfuerzo | Impacto |
|---|---|---|---|---|
| 1 | **Partir el contexto en Estado/Acciones** (o contexto hoja de acciones) y que `PuestoRow`/`MesasSubtable` solo consuman acciones | `datos-provider.tsx` + `puestos-table.tsx:398` + `mesas-subtable.tsx:93` | S | Resuelve C2; restaura la promesa D42 en el flujo del visor |
| 2 | **Purar el updater del ticker** (side-effect fuera del `setSegundosTicker`) | `datos-provider.tsx:223-229` | S | Resuelve C3 (transición doble en dev) |
| 3 | **Fila accesible por teclado** (`tabIndex`+`role`+teclas, o trigger en botón de la celda) | `puestos-table.tsx:410-415` | S | Resuelve C1 (WCAG 2.1.1) |
| 4 | Extraer hook **`useVisorActa`** (estado + 8 acciones del visor, ~230 líneas) fuera del provider; el provider solo lo compone | `datos-provider.tsx:155-498` | M | Baja el archivo a ~350; separa "datos" de "UI estado" |
| 5 | Extraer **`useDialogOverlay`** (Escape + scroll-lock + foco + trap/inert + devolución de foco) y usarlo en shell y visor | `supervision-shell.tsx:376-389`, `acta-viewer-modal.tsx:94-106` | S | Resuelve M3 y duplicado §5.6 |
| 6 | Reemplazar el menú a mano por **Radix DropdownMenu** (o componente `MenuFiltroColumna` reutilizable) | `puestos-table.tsx:93-161` | S | Resuelve M2 |
| 7 | **Hash-sync de vista** (`#monitor`, `#recepcion`, `#acta/puesto/mesa/tipo/pag`) con `hashchange`; conserva export estático | `supervision-shell.tsx:355` + `datos-provider.tsx:349` | M | Resuelve M4 (deep-link, back, refresh) |
| 8 | **Partir `documento-e14.tsx`**: `papel-datos.ts` (generadores determinísticos → reusar `actas-mock`) + `página-transmision.tsx` + `página-firmas.tsx` + `página-delegados.tsx` | `actas/documento-e14.tsx` | M | Elimina duplicados §5.4; archivo de 575 → 4 de ~150 |
| 9 | Mover **`aMarkdown`/`aCsv`/`descargar`/`kpisDe`** a `lib/informes.ts` (funciones puras, testeables) | `vista-informes.tsx:40-169` | S | Vista queda en UI; reutilizable al reactivar D20 |
| 10 | Extraer **`ChipGamaHeader`** al módulo `perfil-dispositivo` (ya importa todo de allí) | `supervision-shell.tsx:315-340` | S | El shell deja de conocer detalles de tier |
| 11 | **Virtualizar la matriz** (ventana de ~30 filas) o al menos medir y documentar el tope de "todos los días" | `puestos-table.tsx:361` | M/L | Resuelve M1 |
| 12 | Tokenizar contenedores (`--primary-container`, `--error-container`) y migrar los 5 hex | `globals.css` + `acta-acciones.tsx`, `acta-header.tsx`, `acta-historial.tsx` | S | Resuelve M5 |
| 13 | Unificar **`CLASE_CHIP` → `ChipFiltro`** y skeletons → `EsqueletoVista` | §5.1, §5.2 | S | −90 líneas, un solo lugar para el estilo de chip |
| 14 | Dividir `puestos-table.tsx` en `puestos-table.tsx` + `puesto-row.tsx` + `filtro-columna.tsx` + `senal-tiempo.tsx` | `puestos-table.tsx` | S/M | Archivo de 500 → 4 piezas; facilita virtualizar |

Orden sugerido: 1 → 2 → 3 (críticos, un día) → 5 → 6 → 12 → 13 (higiene, dos días) → 4 → 7 → 14 → 8 → 11 (reorganización, un sprint).

---

## 8. Métricas rápidas

| Métrica | Valor |
|---|---|
| Archivos analizados | 23 (.tsx/.ts) · **5.502 líneas** (`wc -l`) |
| Archivos > 400 líneas | 5 (`datos-provider` 595, `documento-e14` 575, `puestos-table` 500, `supervision-shell` 489, `vista-recepcion` 433) |
| `"use client"` | 18/23 |
| Hooks | `useEffect` 17 · `useMemo` 22 · `useCallback` 32 · `memo()` 2 (solo `DocumentoE14` y `PuestoRow`) |
| Accesibilidad | 52 `aria-label` · 11 `aria-pressed` · 21 `focus-visible` · 36 usos de `h-11` (44 px) |
| Hallazgos | 🔴 3 · 🟡 8 · 🟢 7 |
| Duplicados confirmados | 10 grupos (≈ 250–300 líneas recuperables) |
| Hex fuera de tokens | 5 usos en UI real (+ paleta `PAPEL` D18, excepción) |
| Filas renderizables sin filtro | 949 puestos · 67 países · 3.670 mesas (DIVIPOLA, `divipola-adapter.ts:18`) |
| Ritmo de vida simulada | ticker 5 s (`mock-repository.ts:78`) · transición 45 s (`:80`) |
| Veredicto global | **Base sólida y disciplinada (D42/D43 bien resueltas en diseño, a11y por encima del promedio)**, con 3 críticos puntuales de bajo costo de arreglo: teclado en la matriz, suscripción de filas al contexto grande, y side-effect en updater. La deuda estructural mayor es D11 sin deep-linking y la ausencia de virtualización. |
