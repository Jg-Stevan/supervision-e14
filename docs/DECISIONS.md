# Decisiones — supervision-e14

Kit `SUP-1` / `fundacion-v1` (2026-10-20). Formato: D<n> — decisión, razón.

## D1 — Stack exacto del kit

Next.js 16 (App Router) + TypeScript estricto + Tailwind CSS 4 + shadcn/ui
(estilo New York) + lucide-react. Sin zustand/framer-motion/Material: el
estado del kit es mínimo y se resuelve con `useState`/`useMemo`.

## D2 — Frontera de módulo dura (trasplante)

Todo el código del producto vive en `src/modules/supervision/**`. Fuera solo
hay scaffolding/config. Razón: el módulo se trasplantará al monorepo del
digitalizador; ningún archivo externo importa nada del módulo, así el
trasplante es mover la carpeta + cambiar la implementación del repositorio.

## D3 — Repo separado temporal

`supervision-e14` es un repo privado nuevo, independiente del digitalizador,
para fundar el módulo sin tocar repos existentes (kit §0-2). Cuando madure,
se trasplanta (D2).

## D4 — Tema solo dark

`globals.css` define únicamente el tema dark de §2.1 (sin bloque light).
Tokens custom añadidos: `--success`, `--warning`, `--danger`,
`--neutral-state`, `--error-text` y superficies del kit (`--surface-lowest`,
`--surface-high`, `--surface-highest`, `--outline-strong`,
`--outline-variant`, `--hover-row`). `--radius: 0.25rem` forzado a TODOS los
escalones (`--radius-sm/md/lg/xl`) para cumplir “radio 4px en todo”. Sin
sombras: la jerarquía es bordes 1px + capas tonales; los componentes shadcn
que traen `shadow-*` se usan con `shadow-none` en los puntos de uso.

### D4.a — Ámbar

El kit ofrece dos ambarles: `#fdd400` (secondary-container → `--warning`) y
`#ffd600` (“ámbar puro del spec”, alternativo). Se adoptó **`#ffd600`** para
`--warning` y para el estado PENDIENTE, unificando el color del semáforo con
el del spec de componentes; `#fdd400` queda sin uso.

## D5 — Repositorio mock detrás de interfaz

`SupervisionRepository` (exactamente los 3 métodos del kit: `getResumen`,
`getPuestos(filtros)`, `getMesasDePuesto`) es el único punto de consumo de
datos. `mockSupervisionRepository` es la implementación del demo; en la
integración se reemplaza por la implementación real y nada más cambia.

**Nota:** el nombre/ID del supervisor del header (`SUPERVISOR`, `ADM-9482`)
se exporta como constante del mock. Es texto fijo del shell de demostración;
la interfaz del repositorio se mantiene EXACTA a la firma del kit (3 métodos).

## D6 — Consistencia-KPIs sobre fidelidad literal del mockup

El KPI oficial manda: total 20 · completo 5 · crítico 1 · pendiente 4 ·
no iniciado 10. El mockup mostraba 2 CRÍTICOS (Italia y España) con KPI de 1.
Ajuste aplicado (opción ofrecida por el kit):

- **España pasa de CRÍTICO a PENDIENTE** (el CRÍTICO único es Italia).
- Relleno creíble autorizado por el kit: 15 puestos adicionales
  (Francia, Alemania, Brasil, Canadá = COMPLETO; México, Argentina =
  PENDIENTE; Venezuela, Perú, Chile, Ecuador, Costa Rica, República
  Dominicana, Guatemala, El Salvador, Australia = NO INICIADO).
- Resultado verificado en runtime: KPIs 20/5/1/4/10 y filtro Estado=COMPLETO
  devuelve exactamente 5 puestos.

## D7 — Ajustes técnicos de implementación (sin cambios de alcance)

1. **Expansión de filas con Collapsible Radix sin romper `<table>`:** el
   raíz por defecto de Radix Collapsible es un `<div>`, inválido dentro de
   una tabla. Solución: un `<tbody>` por puesto usado como raíz del
   Collapsible (`asChild`), con `CollapsibleTrigger asChild` sobre la fila y
   `CollapsibleContent asChild` sobre la fila de detalle. HTML válido
   (múltiples `<tbody>` son legales) y comportamiento idéntico.
2. **Header sticky de la tabla maestra dentro de su propia región de
   scroll:** el contenedor con `overflow-x-auto` (scroll horizontal
   obligatorio de 10 columnas) crea un scrollport que impide el sticky
   relativo a la página (los `th` se desplazaban y tapaban la primera fila).
   La tabla vive entonces en un wrapper `max-h + overflow-auto` y el header
   se pega dentro de esa región (`top-0`). El `<table>` se renderiza directo
   (sin el wrapper `Table` de shadcn) precisamente porque su contenedor
   interno con `overflow-x-auto` rompía el sticky; `TableRow/TableHead/
   TableCell` de shadcn se conservan.
3. **Select mock de Fecha:** una sola opción, “Domingo, 14 Jun” (kit §2.4).
4. **Mesas:** solo Italia define mesas (001–003, datos exactos del kit). El
   resto de puestos muestra el estado vacío “Sin detalle de mesas para este
   puesto en los datos demo.” al expandir.
5. **Zona:** el mockup solo da números de zona; `zonaId` y `zona` llevan el
   mismo valor de la fila (no se inventan nombres).
6. **Iconos no especificados por el kit:** NO INICIADO → `Minus` (neutral),
   Carga Masiva → `Upload`. El resto usa las equivalencias dadas.
7. **Toasts de demostración:** `sonner` con `theme="dark"` montado en el
   layout; mensaje exacto “Función de demostración — sin backend”.
8. **Targets táctiles:** opciones de los Select a 44px (`h-11`) y botones de
   acción de la sub-tabla a 44px, cumpliendo §0-8.
9. **Fuentes:** `next/font/google` (Hanken Grotesk 600/700, JetBrains Mono
   400/500/600). Carga verificada en runtime (`document.fonts`).
10. **Scaffold:** create-next-app@16 no genera `postcss.config.mjs` (usa el
    loader de Turbopack para Tailwind); se pasó al setup estándar
    `@tailwindcss/postcss` (ambos archivos están en la whitelist) para que
    el CLI de shadcn valide. `bun.lock` y `next-env.d.ts` se incluyen como
    artefactos estándar del scaffold T0.2.

## D8 — Export estático para GitHub Pages con basePath por env

- **Decisión:** `next.config.ts` pasa a `output: "export"` con
  `basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""`,
  `images: { unoptimized: true }` y `trailingSlash: true` (kit SUP-2 §3 T3,
  snippet literal).
- **Por qué:** Pages sirve el sitio en subpath `/supervision-e14/`; el env
  inyecta ese basePath SOLO en el build de Actions. Sin el env (dev/build
  local) la app sigue en raíz — el `bun run dev` local NO cambia (regla
  §0-6, verificada: GET / 200 tras el cambio).
- **Nota honesta:** el snippet del kit reemplazó los flags del scaffold
  (`cacheComponents: true`, `partialPrefetching: true`). Con
  `output: "export"` el sitio es 100% estático (mock repository, sin API
  routes — regla §0-7), así que esos flags no tienen efecto visible en este
  demo; se siguió el snippet del kit VERBATIM por alcance cerrado.
- **`.nojekyll`:** archivo vacío en `public/` — sin él, GitHub Pages ignora
  `_next/` (Jekyll). Crítico para el subpath.

## D9 — `LayoutProps<"/">` → `Readonly<{ children: React.ReactNode }>`

- **Hallazgo (auditoría SUP-2 §2):** `LayoutProps` es un tipo global que
  Next 16 genera en `.next/types` (typegen); en clone fresco
  `bunx tsc --noEmit` directo fallaba con `TS2304: Cannot find name
  'LayoutProps'`.
- **Fix:** firma estándar de Next `Readonly<{ children: React.ReactNode }>`
  en `src/app/layout.tsx` (kit T1, literal).
- **Verificación:** `rm -rf .next && bunx tsc --noEmit` → **0 errores sin
  typegen** en clone fresco (§4.1). El workflow de Pages conserva
  `bunx next typegen` como cinturón adicional (no es bloqueante).

## D10 — Tabla de puestos completa a 1440px sin scroll horizontal

- **Hallazgo (auditoría SUP-2 §2):** a 1440×900 con sidebar de 256px, la
  tabla maestra requería scroll horizontal para alcanzar ESTADO GLOBAL
  (medido antes del fix: `scrollWidth 1245` vs `clientWidth 1134` → exceso
  de **111px**).
- **Técnica (todas permitidas por el kit T2, solo en el módulo):**
  1. Padding horizontal de celdas `px-1.5` (override del `p-2`/`px-2` de
     ui/table vía tailwind-merge) en los 10 `th` y `td` de la fila.
  2. Mini-barras de progreso compactadas: `min-w-28→min-w-24`,
     etiqueta % `w-10→w-9`, `gap-2→gap-1.5`.
  3. Chip de hora actual `px-2→px-1.5`.
  4. Encabezado «Hora cierre Colombia» → «Cierre COL» (abreviatura
     autorizada por el kit: era la columna más ancha, 158px).
- **Verificación (medido):** 1440×900 → `scrollWidth 1134` =
  `clientWidth 1134` → **exceso 0** (tabla COMPLETA hasta ESTADO GLOBAL).
  1280×800 → exceso 123px (scroll horizontal residual aceptable por el
  kit por debajo de 1440). Legibilidad y tokens intactos (interacciones
  verificadas en el preview estático).

## D11 — Vistas por estado interno del shell (NO rutas nuevas)

- **Decisión:** Monitor Global / Centro de Notificaciones / Generar
  Informes / Revisión de Anomalías se cambian con estado interno del
  `SupervisionShell` (`vista: "monitor" | "notificaciones" | "anomalias" |
  "informes"`), no con rutas (kit SUP-3 T5/T6/T7).
- **Por qué:** el export estático sigue siendo trivial (una sola página,
  `output: "export"` intacto) y la frontera de módulo no se abre.
- **`page.tsx` (único archivo fuera del módulo):** quedó en su mínimo —
  solo monta `<SupervisionShell />`. NO necesita Suspense de servidor:
  la carga async de T2 es client-side (provider) y los skeletons de T3
  cubren esa latencia.

## D12 — Repositorio async + mutaciones en la interfaz

- **Decisión:** `SupervisionRepository` devuelve `Promise` en sus lecturas
  y añade las mutaciones del kit: `resolverRescaneo` (T4),
  `notificarMesa` (T4) y `aplicarTransicionVida` (T3).
- **Por qué:** el repositorio real del digitalizador será async — el
  contrato se adelanta hoy sin backend. Latencia simulada: ~400 ms en
  lecturas y ~2.5 s en REINSPECCIONAR (el spinner del kit).
- Las mutaciones viven en el mock (el dueño de los datos); el store
  cliente aplica los resultados y los toasts/reportes de éxito.

## D13 — Simulación de vida (reglas de derivación + ticker; D6 protegido)

- **Reglas de derivación (una sola fuente de verdad):**
  - `estadoMesa` se deriva de sus 4 partes: alerta presente →
    INCOMPLETO; 4 partes ok → COMPLETO; 0 ok → NO_INICIADO; resto →
    EN_PROCESO.
  - `pctDelegado`/`pctTransmision` del puesto = % de partes ok de sus
    mesas (kit T2 «derivable de sus mesas»).
  - `estadoGlobal` del puesto pasa a COMPLETO solo si TODAS sus mesas lo
    están; en otro caso conserva su estado (el kit solo define la
    transición → COMPLETO; no se inventan otras).
- **Ticker (T3):** «Sincronizado hace Xs» avanza de 5 en 5 s; a los 45 s
  el mock aplica UNA transición (mesa EN_PROCESO → completa sus partes
  pendientes), con preferencia por la candidata que COMPLETA su puesto
  (KPIs en vivo); si no hay candidata que complete, la primera
  EN_PROCESO. El contador de sincronización se reinicia tras cada
  transición.
- **D6 protegido:** el estado inicial (20/5/1/4/10) se verifica exacto al
  cargar; las transiciones solo mutan DESPUÉS de ticks (evidencia en el
  REPORTE: KPIs 5/4 → 7/2 en vivo tras 2 transiciones).
- **Mesas de Italia:** 3 EXACTAS del mockup (001-003, intactas) + 004-008
  generadas coherentes con CRÍTICO (kit T2; `numeroMesas=8` exige 8).

## D14 — Sidebar ocultable como overlay flotante (decisión del dueño)

- **Decisión:** la sidebar DEJA de ser fija en ningún viewport. Por
  defecto OCULTA; el botón ☰ (siempre visible) la abre como panel
  flotante anclado a la izquierda, ENCIMA del contenido, con scrim
  `rgba(0,0,0,0.5)` y borde derecho 1px `outline-variant` (sin sombras).
- **Por qué (dueño):** maximizar el área de la tabla; el ancho extra
  beneficia la vista de datos. Móvil y desktop comparten la MISMA
  implementación (unificada — el drawer Sheet anterior se retiró).
- Cierre: ✕ del panel, `Escape` y clic en el scrim. El foco va al panel
  al abrir; el scroll de fondo se bloquea mientras está abierto.
- Carga Masiva sigue deshabilitada con el tooltip del kit («Se conectará
  al digitalizador (fase de integración)»).

## D15 — Informes client-side (Blob, sin backend)

- **Decisión:** la vista Generar Informes construye el .md y el .csv en
  el cliente (`Blob` + `URL.createObjectURL` + `<a download>`) y anuncia
  con toast el nombre del archivo. Nada de APIs (§0-5/§0-7).
- La fecha del informe es la REAL del navegador (es un informe, no un
  dato del mock, kit T7); el nombre de archivo usa la fecha ISO.

## D16 — Ajustes de datos para que las mesas y los pcts cuadren

- **pcts derivados de mesas (kit T2)** — los del mockup eran decorativos
  y con mesas reales debían ser derivables; ajustes aplicados al
  inicializar el mock: España 0/0 → **50/50**, Inglaterra 10/100 →
  **0/100**, México 45/30 → **50/38**, Argentina 70/55 → **75/50**,
  Italia 59/29 → **56/25** (con sus 8 mesas: 3 exactas + 5 generadas).
- **Semillas:** notificaciones 7 (4 no leídas → badge inicial 4) y
  anomalías 7 (5 ABIERTAS = badge dinámico «Anomalía 5» + 2 revisadas de
  histórico para el filtro).
- **Estado de lectura/revisión** (marcar leída, marcar todas, marcar
  revisada) es estado de UI del store — sin persistencia (§0-5: el kit
  NO autoriza localStorage).

## D17 — Visor de actas como modal por estado (kit SUP-4 lo lista como D16)

- **Nota de numeración:** el kit SUP-4 («actas-v1») nombra sus decisiones
  D16–D18, pero **D16 ya estaba usado** por vida-v1 (mergeado en main
  antes de abrir la rama). Se continúa la numeración: D17/D18/D19
  corresponde a los D16/D17/D18 del kit. La referencia interna del kit
  «(D17)» para el documento sintético equivale aquí a **D18**.
- **Decisión:** el visor de actas es un **modal por estado** (`visorActa`
  en el store del módulo), NO una ruta (coherente con D11). Cierre por ✕,
  `Escape` y clic en el scrim; el clic dentro del panel NO cierra. Al
  cerrar, el componente interno se desmonta: zoom/rotación/contraste/
  pantalla completa vuelven a su estado inicial en el siguiente uso
  (T3.1) sin effect de reset. El scroll de fondo se bloquea mientras está
  abierto (patrón D14). Sin sombras en TODO el modal: jerarquía = borde
  1px + capas tonales + scrim `bg-black/80 backdrop-blur-sm` — el
  `shadow-2xl` del mockup Stitch se eliminó.
- **Puntos de entrada (exactamente 3):** botón VER ACTA (`FileText`) por
  fila de mesa (deshabilitado en NO_INICIADO, `title="Sin transmisión"`),
  botón VER ACTA en las tarjetas de anomalías (aterriza en PÁGINA 2
  cuando la mesa no está COMPLETA — su advertencia es de página 2;
  deshabilitado sin mesa vinculada) y el 👁 (`Eye`) de la fila de puesto
  (abre la primera mesa con acta; deshabilitado si el puesto no tiene
  ninguna). El botón 👁 no existía en vida-v1 (el kit lo da por
  «ya existente»): se añadió en la celda ESTADO GLOBAL de la fila con
  `stopPropagation` para no disparar el Collapsible de la fila.
- **Montaje:** el modal se monta dentro de `datos-provider` (el store del
  módulo, que sí está en la whitelist); `supervision-shell.tsx` NO se
  toca.

## D18 — Documento E-14 sintético vectorial (kit lo lista como D17)

- **Decisión:** el documento se DIBUJA con JSX/SVG (`documento-e14.tsx`,
  papel A4 794×1123 px) — sin assets binarios (§0-8): sin PNG/JPG, sin
  PDFs, sin `pdf.js`, sin iframes. El zoom (escala 0.5–3.0, pasos 0.25),
  la rotación (0/90/180/270°) y el contraste (NORMAL/ALTO `contrast(1.5)`/
  NEGATIVO `invert(1)`) son transform/filtro CSS REALES sobre el papel.
- **Paleta del papel acotada al documento:** `#f7f6f2` (papel), `#1c1c1c`
  (tinta), `#c9c5ba` (líneas), `#b3261e` (sello rojo) viven SOLO dentro de
  `documento-e14.tsx` (excepción acotada del kit §2.1); el resto del
  visor usa los tokens congelados.
- **Caja de layout fiel al zoom+rotación:** el wrapper del papel usa una
  caja de tamaño = bounding box exacta (los giros de 90° intercambian
  ancho/alto), de modo que el `overflow-auto` del canvas coincide con el
  tamaño real del documento escalado/rotado.
- **Determinismo (§0-7):** votos, nombres de delegados, trazos de firma y
  observaciones se derivan por seed de la mesa (mulberry32 sobre hash
  FNV-1a — `crearRandomDeterministico` en `domain/acta.ts`). Roma mesa 1
  es EXACTA al mockup (§0-6): ID `#A92-F`, 14:20 LOCAL, motivo
  «SOLICITUD DE RESCANEO», P1 VALIDA / P2 ADVERTENCIA, historial
  14:00/14:18/14:20 con los textos literales.
- **Export estático intacto:** sin rutas nuevas, sin assets añadidos a
  `public/` — el build `output: "export"` no cambia (D8).

## D19 — Trazabilidad de acta + acciones con estado (kit lo lista como D18)

- **Patrón vida-v1:** APROBAR Y MARCAR COMO VÁLIDA y CONFIRMAR RESCANEO
  siguen el patrón de REINSPECCIONAR (D12): spinner ~2.5 s en el botón
  (ambos deshabilitados) → resolución en el mock → notificación + toast +
  efectos enlazados. Textos exactos del kit: toast «Acta marcada como
  válida» / «Rescan confirmado y recibido»; notificaciones «ACTA
  APROBADA — MESA n (Puesto)» y «RESCANEO COMPLETADO — MESA n (Puesto)».
- **Motivo obligatorio (T5.2):** textarea OBSERVACIONES vacío → no se
  ejecuta nada: borde en error + mensaje inline «Ingrese el motivo de la
  decisión» (sin toast). Tras resolver, la caja queda limpia.
- **Efectos enlazados:** APROBAR → todas las páginas VALIDA, chip de
  motivo fuera, evento «APROBADA POR SUPERVISOR» (nivel APROBADA → punto
  primary en la timeline, color nuevo permitido por el kit T5.5), overlay
  «ACTA VALIDADA» y la anomalía abierta vinculada (mismo puesto+mesa)
  pasa a revisada (badge incluido). RESCANEO → versión 1→2, hora de carga
  +30 min determinísticos, páginas VALIDA, evento «RESCANEO CONFIRMADO»,
  caption «VERSIÓN 2 — RECIBIDA hh:mm LOCAL». Los CONTADORES de mesa
  (delegados/transmisión) NO cambian: el visor solo muta nivel acta +
  anomalías + notificaciones (T5.7).
- **Contrato:** el acta SIEMPRE llega por `SupervisionRepository`
  (`getActaDeMesa`, ~400 ms; §0-9). Firma `(puestoId, mesaId)` — los ids
  de mesa se repiten entre puestos (mismo patrón que
  `resolverRescaneo(puestoId, mesaId)`); la variante de 1 argumento del
  kit es imposible de resolver con 20 puestos y se declaró en el REPORTE.
- **Semántica snapshot:** el acta se genera al primer acceso desde el
  estado VIGENTE de la mesa y queda en memoria; después solo las acciones
  del visor la mutan (es un documento histórico, no una vista derivada).
- **Mapeos derivados documentados** (kit ambiguo, resolución registrada
  en el REPORTE): el «CRÍTICO» de mesa es INCOMPLETO; el «mesa PENDIENTE»
  del kit se interpreta como mesas EN_PROCESO de puestos PENDIENTE (P2
  PENDIENTE, sin motivo); chip de motivo solo con alerta «Rescaneo»
  vigente; DELEGADOS (página única) VALIDA si ambas partes de delegados
  están ok; «DELEGADOS ACREDITADOS: n/16» = 2 partes ok → 16, 1 → 8,
  0 → 0; N del navegador MESA n/N = mesas CON acta del puesto (T3.3).

## D20 — Retiro TEMPORAL de módulos por flag (kit SUP-5 §2.5 / T1)

- **Decisión:** "Centro de notificaciones" y "Generar informes" se
  OCULTAN del sidebar por una constante exportada del shell
  (`MODULOS_INACTIVOS = ["notificaciones", "informes"]`): el array de
  ítems se filtra al renderizar. **Retiro, no borrado:** los componentes
  (`vista-notificaciones.tsx`, `vista-informes.tsx`), su store y las
  acciones que escriben notificaciones (NOTIFICAR, REINSPECCIONAR,
  aprobar/rescan de acta) quedan INTACTOS y dormidos — siguen operando
  en el store interno, invisibles para el usuario.
- **Reversibilidad:** vaciar/editar la lista devuelve las 2 entradas
  (verificado en dev — §4.5). La restauración COMPLETA (render de las
  vistas) requiere además reponer sus 2 imports + 2 casos del switch en
  `supervision-shell.tsx` — costo declarado en el REPORTE (el kit pedía
  "1 línea"; la verificación obligatoria §4.4 —0 referencias activas en
  el shell— exige retirar también los imports, se eligió cumplir el
  check estricto y documentar el costo real).
- **Sin rutas (D11 intacto):** las vistas dormidas son inalcanzables (no
  hay rutas ni entradas); el estado del store correspondiente queda sin
  uso. El badge de anomalías NO se toca; el de notificaciones desaparece
  junto con su entrada.
- **Frontera:** solo cambia `supervision-shell.tsx` (flag + filtro +
  switch); cero cambios en el store (`datos-provider.tsx` no está en la
  whitelist del kit).

## D21 — Catálogo DIVIPOLA como fuente del repositorio (kit SUP-5 §3-T2/T3) — SUPERSEDE D6

- **Decisión:** la fuente de puestos deja de ser el array demo de 20 y
  pasa a ser el catálogo DIVIPOLA exterior REAL (derivado canónico,
  949 puestos · 67 países · 3.670 mesas — verificado por el adaptador
  contra los números del kit §2.4, con guardrail de 1.500 registros).
  El MAESTRO (14.438 puestos) vive en el repo como base del join futuro
  y JAMÁS se importa en código (`rg "divipola-puestos" src/` → 0).
- **Adaptador estricto (`data/divipola-adapter.ts` + `domain/divipola.ts`):**
  validación propia sin librerías — 8 campos exactos, códigos como
  STRINGS con ancho fijo (2/3/3/2), `idEnlace` único y congruente con
  sus segmentos, `totalMesas` entero ≥ 1, nombres no vacíos, registros
  de control presentes (primero/ancla/último) y ancla Roma con 8 mesas.
  Cualquier desviación → `BLOQUEADA: validación del catálogo (…)`.
- **Estado simulado determinístico (§0-9):** el estado de cada puesto se
  siembra por seed del `idEnlace` (mulberry32/FNV-1a compartido del
  acta — `crearRandomDeterministico`) con la MISMA distribución que el
  demo: CRÍTICO ~5% · COMPLETO ~25% · PENDIENTE ~20% · NO_INICIADO
  ~50%. Mismo seed → mismos KPIs siempre (verificado entre sesiones).
  Mesas por puesto = `totalMesas` del catálogo (1..159, dato real).
- **D6 SUPERSEDEDO (no borrado):** los KPIs iniciales dejan de ser los
  literales 20/5/1/4/10 y se DERIVAN del catálogo sembrado. La
  INVARIANTE de D6 se MANTIENE: `total = completo + crítico + pendiente
  + no_iniciado` EXACTO en carga (949 = 231+44+199+475 en el seed
  vigente; la suma sigue exacta tras las transiciones de vida).
- **Ancla demo intacta (§2.3):** el puesto `88_495_010_02` Roma -
  Consulado (ITALIA, código real 495 — el catálogo manda sobre el 499
  del demo) conserva CRÍTICO, 8 mesas, mesas 001-003 EXACTAS del
  mockup, acta `#A92-F` con historial 14:00/14:18/14:20 y P2 con
  advertencia. Solo cambió su código/id (re-anclaje al `idEnlace`).
- **Mapeo UI (§2.1):** `pais` = nombreMunicipio ("ITALIA"), fila muestra
  `<mun> - <país>` ("495 - ITALIA"), zona UI sin ceros ("010" → "10"),
  puesto mostrado `<codigoPuesto> - <nombre real>` ("02 - Roma -
  Consulado", nombre verbatim; el visor lo capitaliza por estilo CSS
  preexistente — el dato no se reescribe).
- **Contracto async intacto (D12):** la prep del catálogo es UNA vez
  (memoizada en el adaptador); las promesas y la latencia ~400 ms siguen
  igual. Ticker, transición EN_PROCESO→COMPLETO, REINSPECCIONAR,
  anomalías y visor de actas operan idénticos sobre el catálogo real
  (reglas de mapeo del kit SUP-4 intactas, actas siempre ancladas por
  `idEnlace`).

## D22 — `idEnlace` divipola como clave de join (kit SUP-5 §2.2)

- **Convención observada** en los archivos reales del digitalizador: los
  E-14 traen segmentos separados por `_` — `88_495_010_02` =
  departamento 88 (CONSULADOS) · país/municipio 495 (Italia) · zona 010
  · puesto 02 (Roma). El `idEnlace` respeta ese orden y los códigos van
  como STRINGS sin transformar (solo la zona lleva padding 2→3 dígitos,
  regla del digitalizador).
- **Re-anclaje integral del demo:** `Puesto.id`, actas, anomalías,
  notificaciones y semillas de país (ESPAÑA/MEXICO/PAISES
  BAJOS/INGLATERRA) quedan anclados a `idEnlace` reales del catálogo
  (búsqueda determinística de puestos reales por país + estado de mesa
  útil). Cuando lleguen los datos del digitalizador y la carga masiva,
  las filas se casan por esta clave — nada más cambia.
