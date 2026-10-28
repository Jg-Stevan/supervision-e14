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

## D23 — Acta real = imagen + información impresa (kit SUP-6 §2 / T2)

- **Decisión:** cada muestra del digitalizador es una foto escaneada del
  E-14 más los metadatos impresos de su encabezado. El dominio NO
  interpreta el contenido: `ActaMesa` se extiende con `fotos`
  (`Partial<Record<FormularioTipo, (FotoActa | null)[]>>` — índice =
  página − 1; `null`/ausente → esa página cae al sintético) e
  `impresion?: ImpresionActa` (campos del encabezado verbatim). Tipos
  nuevos: `FotoActa` (src/ancho/alto/archivo) e `ImpresionActa`
  (consulado/país/zona/puesto/mesa/lugar + barcode y etiqueta opcional).
- **Prioridad de render:** si la página tiene foto → foto real; si no →
  documento sintético D18 (hoy). El papel de la foto mide 460 CSS px de
  ancho a zoom 1 (alto por aspect ratio intrínseco ~1:3 — scroll
  vertical); la caja rotada usa las dimensiones de la FOTO (no las del
  papel A4 794×1123).
- **Regla de oro intacta (§0-1):** el módulo NO mira votos — prohibido
  OCR/extracción/deducción; la imagen se muestra tal cual junto a la
  información impresa. `documento-e14.tsx` NO se toca; toolbar, zoom
  (0.5–3.0), rotación (0/90/180/270) y contraste (NORMAL/ALTO/NEGATIVO)
  del visor se reutilizan tal cual (filtros CSS reales sobre la imagen).

## D24 — Contrato de ingesta = manifest + assets (kit SUP-6 §2 / T1/T3)

- **Decisión:** `data/actas-reales/actas-reales-manifest.json` declara
  las actas: `idEnlace`, `mesa`, `formulario` (clave de dominio
  `TRANSMISION` | `DELEGADOS`), `etiquetaImpresa` (texto del encabezado
  impreso, p. ej. «CÓNSUL/EMBAJADOR» → clave de dominio `DELEGADOS`),
  `barcodeImpreso`, `impresion` (verbatim) y `paginas[]` (`pagina`,
  `archivo`). Los assets son PNG importados estáticamente desde
  `data/actas-reales/assets/` (el export estático resuelve la ruta con
  basePath solo; sin `next/image` — §0-3). Convención de nombre (la del
  digitalizador): `E14_<idEnlace con _>_<mesa>_<FORMULARIO>-<pagina>.png`.
- **Loader (`data/actas-reales/actas-reales.ts`):** `cargarActasReales()`
  memoizado en módulo devuelve `ResultadoIngesta` — `actas: Record<string,
  ActaRealLista>` con clave `${idEnlace}::${mesa}` (las 2 entradas del
  ancla comparten mesa y se fusionan: fotos + etiqueta/barcode POR
  formulario, porque el barcode impreso difiere entre TRANSMISIÓN y
  CÓNSUL/EMBAJADOR) y `bloqueadas: { clave, motivo }[]` (cuarentena,
  D25). El `impresion` adjunto al acta es el encabezado verbatim de 6
  campos; etiqueta/barcode viajan por formulario en el registro del
  loader y el visor los consulta por clave (resolución de ambigüedad
  registrada en el REPORTE — el kit los lista dentro de `ImpresionActa`
  como opcionales).
- **Peso de assets:** el bundle no expone el peso del asset, así que el
  guardrail usa un mapa de bytes verificado con sha256sum al copiar
  (Anexo A); es metadata de ingesta, no dato de dominio.

## D25 — Validación de ubicación (join por `idEnlace`, D22) + cuarentena (kit SUP-6 §2 / T3)

- **Decisión:** al cargar el manifest se valida CADA acta contra el
  catálogo DIVIPOLA (`CARGAR_CATALOGO()` — import de solo-lectura; el
  adaptador NO se modifica): (a) `idEnlace` existe en el catálogo;
  (b) `mesa` ≤ `totalMesas` del puesto; (c) `formulario` es clave
  conocida del dominio; (d) páginas 1..N completas y continuas;
  (e) asset importable. La que falle NO se publica y se marca
  `BLOQUEADA: <motivo>` en consola y en el reporte (cuarentena); el
  resto sigue. Guardrail: máx 10 assets y 2 MB totales; más →
  BLOQUEADA del manifest completo.
- **Caída amable:** si el ancla quedara en cuarentena, `obtenerActa()`
  sirve el documento sintético como cualquier otra mesa — nada se
  improvisa y la UI no se rompe.

## D26 — Ancla de práctica El Cairo (kit SUP-6 §2 / T4) — equivalente al ancla Roma de SUP-5

- **Decisión:** el puesto `88_335_005_02` (El Cairo - Consulado,
  EGIPTO, `totalMesas: 1` — registro real del catálogo) se **FUERZA a
  `COMPLETO`** en `puestoDeRegistro` (mismo mecanismo del ancla Roma →
  CRÍTICO; su seed natural cae en NO_INICIADO — el kit lo anota como
  0.9872; sin fuerza el ancla es inalcanzable). Su mesa `001` sirve el
  acta real: `formularios` con TRANSMISION P1/P2 y DELEGADOS P1/P2
  (2 páginas — la realidad impresa del formulario CÓNSUL/EMBAJADOR),
  todas `VALIDA`, sin motivo, `fotos` + `impresion` del loader/manifest,
  id/hora/historial generados por seed como cualquier acta (mismas
  reglas, sin textos custom).
- **El resto NO cambia:** las otras 948 sedes y su vida/anomalías
  quedan intactas; Roma mesa 1 sigue EXACTA al mockup (sintético
  `#A92-F`); el acta real solo altera el estado del ancla (NO_INICIADO →
  COMPLETO en los KPIs derivados — la única transición de estado del kit).

## D27 — TRASPLANTE del módulo CARGA MASIVA (digitalizador → supervision, kit carga-masiva-supervision-v1)

- **Decisión:** el módulo de carga masiva del digitalizador
  (`digielect14` — cola persistente IndexedDB, dedup de 3 capas
  SHA-256/QR/dhash, pre-scan QR, runner OCR OpenCV+RapidOCR vía
  `@jg-stevan/scanner-core`, clasificación DIVIPOL, envío automático de
  ÓPTIMAS) se TRASPLANTA a este repo como `src/modules/digitalizador/**`
  (lib/e14 del motor + vista MasivaView + adaptador store-e14). El
  placeholder deshabilitado del nav queda ACTIVADO como vista
  `"carga-masiva"` (D11 — estado interno, sin rutas).
- **Se completan mutuamente (el join D22 en runtime):** cada envío de la
  cola masiva publica el acta en `data/actas-runtime.ts` — la
  clasificación AUTO del OCR (dept/mun/zona/puesto/mesa/tipo/página)
  se normaliza a `idEnlace` (dep 2 · mun 3 · zona 3 · puesto 2 dígitos),
  se valida contra el catálogo (D25 a/b/d — cuarentena `BLOQUEADA: …`
  en consola y en la bandeja si falla) y la foto procesada viaja como
  `FotoActa` + encabezado impreso verbatim (`ImpresionActa`, D23/D24 —
  se muestra, no se interpreta). `mock-repository` superpone el registro
  runtime en `getActaDeMesa` y `registrarCargaMasiva` actualiza las
  partes de la mesa (TRANSMISION pág n → transmisión pn ok · DELEGADOS →
  delegados ok) + KPIs derivados + notificación — el monitor refleja la
  carga EN VIVO. El caption del visor prefiere la etiqueta/barcode del
  acta runtime sobre el manifest estático.
- **Adaptador (punto de costura):** `store-e14.ts` reemplaza al store del
  flujo individual de digielect14 con la superficie EXACTA que consume
  el motor (5 puntos del kit T3): `online`, `registrarEnvioMasiva`
  (→ publicación fire-and-forget), `contarMotivoNoEnvioActa` (mismas
  claves), `abrirActaMasiva`/`cerrarActaMasiva` (→ modal de revisión de
  la bandeja, con VER EN MONITOR cuando el acta aterrizó en el catálogo
  — seam por props con el shell: `onVerEnMonitor`).
- **Limpieza del port (sin experimentos):** quedan FUERA del trasplante
  los experimentos flag-OFF del repo origen y su maquinaria: warp de
  ingesta (K2), quad-streaming/turno de clasificación (P4/P5), rescate
  ZXing del pre-scan (§F.3), cascada OCR Tesseract (K3, sin motor),
  DRY RUN «solo QR», hand-off P1, prioridad W1, dhash-resize (NO-GO) +
  sus flags de `FlagsApp` y sus whitelists; también `tools/bench-*`,
  `lab/`, `scripts/qa-*`, PanelDev, informe/obs-de-informe y los tests
  vitest (su harness queda en el repo origen). El núcleo productivo
  (runner, cola IDB, dedup 3 capas, identidad QR/serie, precalor,
  watchdog, gama adaptativa, histórico, ledger-remoto fail-soft) llega
  INTACTO.
- **Límites honestos del port:** sin backend (D8) — la "publicación" es
  memoria de sesión (recargar restablece; §0-5); el ledger remoto D1 de
  idempotencia queda SIN endpoint (su cliente fail-soft sigue —
  "ledger remoto indisponible — continúo"; el histórico IDB
  `e14-masiva-historico-v1` conserva la dedup de enviadas). Los assets
  del motor (modelos RapidOCR ~16 MB, onnxruntime, OpenCV, workers,
  zxing wasm, divipol.json) viven en `public/` con la misma convención
  `NEXT_PUBLIC_BASE_PATH` del repo origen. `reactStrictMode: false` se
  conserva (premisa del motor: pre-warm idempotente por diseño de su
  repo origen).

## D28 — MÓDULO RECEPCIÓN DE ACTAS: log en vivo de lo que va llegando (kit recepcion-actas-v1)

**Qué se pidió:** un módulo de RECEPCIÓN para saber las actas que van llegando al
monitor (el supervisor hoy solo ve el desenlace disperso: toasts del masiva,
consola de cuarentena y la bandeja del módulo).

**Decisión:** log runtime único `src/modules/supervision/data/recepcion-log.ts`
con grano de PÁGINA (1 foto = 1 entrada — el grano del pipeline masiva) y los
MISMOS tres desenlaces del kit D27: `PUBLICADA` (aterrizó en el monitor),
`BLOQUEADA` (cuarentena D25 con motivo) y `SIN_JOIN` (sin clasificación AUTO —
solo registro local, sin inventar ubicación).

- **Punto único de escritura:** `actas-runtime.publicarActaMasiva()` registra
  PUBLICADA/BLOQUEADA (es el embudo de toda publicación) y
  `store-e14.publicarDesdeActa()` registra SIN_JOIN (ese desenlace nunca llega a
  publicar — se registra donde se decide). Sin ciclos de import: recepcion-log
  no importa actas-runtime.
- **Semilla determinística (`ingesta-inicial`):** el ancla estático SUP-6
  (manifest actas-reales) se siembra 1 vez perezosa como llegadas de inicio de
  sesión con desfases FIJOS (§0-7: nada aleatorio) — la vista abre con
  contenido y la ingesta queda auditable.
- **Memoria de sesión (D8/§0-5):** sin persistencia ni backend; recargar
  restablece. Suscripción por oyentes (patrón actas-runtime, sin libs nuevas).
- **Vista `vista-recepcion.tsx`:** KPIs clickeables (Recibidas/Publicadas/
  Cuarentena/Sin join — mismo gesto del monitor T3), filtro por formulario,
  búsqueda (idEnlace/mesa/país/archivo), miniatura real recibida, hora exacta +
  relativa, y VER EN MONITOR por props (`onVerEnMonitor`, seam D27) — solo
  filas PUBLICADAS aterrizan en el visor. Log con alto tope + scroll fino.
- **Badge en vivo:** el sidebar cuenta las llegadas `carga-masiva` que ocurren
  fuera de la vista (se anula al abrirla). La semilla no cuenta.
- **CSS:** utilidades `scroll-panel` (scrollbar fina webkit/Firefox) y
  `fila-llegada` (destello 1.6 s de llegada nueva) en globals.css.

## D29 — LEDGER REMOTO de envíos: CORTADO en supervision-e14 (repo estático sin backend)

**Problema:** el módulo masiva trasplantado (D27) conserva su cliente del ledger
remoto (`ledger-remoto.ts`, kit WAVE3 §A.3) que consulta/registra cada envío en
`/api/e14/envios`. Esa route vive SOLO en digielect14 (D1 vía OpenNext). En
supervision-e14 cada llamada era un 404 garantizado: ruido en la red y en el
log del dev server, y latencia muerta en el runner (timeout 3 s era el peor
caso por fila).

**Por qué NO se implementó la route aquí:** supervision-e14 es export estático
a GitHub Pages (`output: "export"`, KIT INSTRUCCIONES-sup-e14-pages-v1 §3/D8).
Una route handler no existe en un deploy estático y además rompería el build
de Pages — la vía correcta no era un backend nuevo.

**Decisión:** válvula de punto ÚNICO en `ledger-remoto.ts` — constante
exportada `LEDGER_REMOTO_ACTIVO = false` (D29) que corta las tres funciones en
su entrada, respetando el CONTRATO ORIGINAL de cada una (doctrina del
conservador: el remoto es una red EXTRA, jamás una dependencia):

- `consultarEnvioRemoto()` → `null` (= «ledger indisponible»: el caller
  continúa como hoy — idéntico al contrato de timeout/500).
- `registrarEnvioRemoto()` → `return` silencioso (ya era fire-and-forget
  best-effort).
- `vaciarLedgerRemoto()` → `{ ok: false, error: "LEDGER_AUSENTE_E14" }`
  (honesto: no simula éxito; la válvula no tiene receptor aquí y jamás tuvo
  caller en este repo).

Cero cambios en runner.ts/store.ts (mismos callers, mismos contratos). Si
algún día supervision-e14 gana un backend con la route, basta
`LEDGER_REMOTO_ACTIVO = true` para restaurar la ruta completa intacta.

**Verificación:** dos corridas E2E nuevas (acta-sim-intermedia.jpg → ALEMANIA
Frankfurt MESA 012; acta-sim-baja.jpg → EGIPTO El Cairo MESA 001) con cola
procesada completa (ENVIADA AUTO, QR ✓, 100%): cero `POST /api/e14/envios`
nuevos en el log del dev server (16 antes → 16 después, todas previas al
gate), cero errores de consola, recepción contando las llegadas en vivo.

## D30 — TIEMPOS del masiva: PAYLOAD QR HEREDADO (kit e14-qr-heredado-v1)

**Problema:** el QR de una acta se leía 3-4 veces por fila con el MISMO coste
cada vez: sondeo de ingesta (worker e73) → prescan de «PROCESAR COLA» (e107:
decode full + detect + warp + lectura, serial FIFO) → capa 0 del runner
(`fileToCaptureDataUrl` + ladder completo de identidad-qr — peor caso
documentado sin QR: ~15-17 s SYNC). Cada capa ignoraba lo que la anterior ya
había leído; el payload exacto (Reed-Solomon — misma llave de SIEMPRE) ya
estaba en RAM.

**Decisión:** un solo campo ADITIVO AL FINAL (contrato D57),
`FilaMasiva.qrPrevio?: string` (RAM del lote — NUNCA a IDB, mismo trato que
prescanOk), estampado por las capas tempranas y consumido por la capa 0:

- **Estampa el sondeo (store.cadenaDedup):** con payload ≠ null, el patchFila
  de telemetría lleva también `qrPrevio`.
- **Estampa el prescan (`aplicarVeredictoPrescan` rama `registrar`):**
  además de `registrarQrPayload`, la fila recibe `qrPrevio`.
- **Consume la capa 0 (runner):** `qrPrevio` presente ⇒ `qrPayload = qrPrevio`
  con traza `capa0-qr hereda-payload` — SIN re-decode. Todo el bloque de
  decisión (original/nuevo/ya-enviada/APLAZADA) consume `qrPayload` IGUAL que
  ayer. `qrPrevio` AUSENTE (flags OFF, abort honesto, recarga) ⇒ decode de hoy
  byte-idéntico.
- **Prescan más barato:** (a) salta fila por fila las que ya traen `qrPrevio`
  (cuenta como leídas — lo fueron); (b) si TODAS las objetivo lo traen, ni
  siquiera bootea el worker OpenCV (wasm ~10 MB — boot + RAM por nada) y
  entra directo a `iniciar()`.
- **Confianza justificada:** el prescan YA marcaba DUPLICADA/YA-ENVIADA con
  ese payload — heredarlo para la identidad es estrictamente MENOS riesgo.
  PROCESAR IGUAL (forzarDedupOff) sigue sin sondeo/prescan ⇒ sin estampa ⇒
  reproceso completo intacto.

**Qué NO se tocó (conservador):** el dhash de ingesta (decode full → hash 9×8:
bajar el decode cambia los hashes históricos — dedup roto), la mini-sonda de
orientación (1.3-1.5 s: nuestras actas legítimamente no alcanzan su umbral de
confianza a 320 px — tocarla arriesga la regresión de las 12 RECHAZADAS que el
kit repara), el master a 4032 (decisión de calidad) y la doble escritura
persistMs (contrato de telemetría D61).

**Medición (sandbox throttled, gama BAJO adaptativo, lote de 2 actas
sim-extra, protocolo idéntico reset-IDB→reload→upload→click, n=1 por
condición):** wall 15.7 s → **12.8 s (−18 %)**; trazas de control
`pipeline total=` 6498+5763 ms (antes) vs 6421+5341 ms (después — camino OCR
intacto); en el after: «boot omitido» + «hereda-payload» ×2 + resultados
idénticos (misma clasificación AUTO, ENVIADA, QR ✓, recepción contó las 2
llegadas). Ahorro por fila que escala con el tamaño de la foto (el decode
evitado es del ORIGINAL) y con el peor caso QR-duro (hasta ~15-17 s/fila si
el sondeo la leyó y la capa 0 hoy re-pagaba el ladder completo).

## D31 — TIEMPOS del masiva: CARRIL QR PARALELO + POOL 1 (kit e14-carril-qr-paralelo-v1)

**Fecha:** 2026-02-14 · **Pedido:** «optimizar y ordenar el proceso de masiva tal vez
solo dejando procesar un acta (no dos como está actualmente) y que en paralelo se
vayan leyendo los qr de los otros archivos para detectar duplicados».

**Diagnóstico previo (con evidencia):** el OCR es wasm mono-hilo (GH Pages sin SAB —
cabecera runner.ts AUDITORIA §2): DOS OCR en paralelo (pool 2 de e71) se reparten el
mismo CPU sin ganancia de throughput y con jank de UI. Y el prescan QR
(e107) corría ANTES de `iniciar()` — el carril pesado arrancaba tarde cuando el
sondeo de ingesta no leyó algún QR.

**Decisión (2 cambios quirúrgicos):**

1. **Pool default 2 → 1** (`FLAGS_DEFAULT.poolWorkers`, flags.ts): UNA acta a la vez
   en el carril pesado, con CPU completo. El override manual del dueño
   (`e14-flags-overrides` / flags.json `poolWorkers: 2`) restaura e71 byte-idéntico —
   whitelist politica.ts intacta. El plan gama BAJO (D74) ya forzaba 1: en ese tier
   no cambia nada (evidencia: sandbox tier BAJO).
2. **Fase 3 PRIMERO (prescan-qr.ts):** `prescanYIniciar` llama `iniciar()` ANTES del
   carril QR — el OCR de la primera fila nunca espera el boot de OpenCV (~10 MB wasm)
   ni la lectura del resto. Las Fases 1+2 bajan a CARRIL PARALELO: mientras el OCR
   corre, el prescan lee el QR del resto de la cola y estampa `qrPrevio` /
   DUPLICADA / YA-ENVIADA — las gemelas jamás llegan a pagar OCR.

**Seguridad de la carrera — todo YA construido (cero blindaje nuevo):** el
pre-chequeo anti-carrera nuevo (re-lectura del store por fila: `estado !==
"PENDIENTE"` ⇒ skip — el prescan no paga det+warp por una fila que el runner ya
tomó) + el anti-zombi post-lectura §G intacto + el re-chequeo post-reserva del
runner (WAVE2 B1) consume la marca DUPLICADA que aterrice durante la reserva + la
capa 0 hereda `qrPrevio` estampado antes de su decode (D30). El QR no leído JAMÁS
se descarta — pasa al OCR (regla de oro 4).

**Verificación E2E (sandbox, agent-browser, tsc 0 · lint 0/0):**

- **Corrida A (realista — sondeo ON, 2 actas):** «boot omitido (D30)» + arranque
  inmediato de la corrida; pool=1 visible en la bandeja (nunca 2 PROCESANDO);
  `pipeline total=` 6401+5889 ms (control OCR intacto vs D30: 6421+5341);
  `hereda-payload` ×2; ENVIADA AUTO ×2; recepción contó las 2 llegadas.
- **Corrida B (carril bajo carga — sondeo OFF + copia renombrada):** runner y lector
  arrancan en el MISMO tick (banner «PREPARANDO LECTOR…» con fila ya PROCESANDO a
  151 ms); el prescan leyó el QR de la fila 2 EN PARALELO con el OCR de la fila 1 →
  `capa0-qr hereda-payload (sondeo/prescan — sin re-decode)`; el duplicado por bytes
  se copió en **19 ms** (cero OCR); `pipeline total=` 6776+6011 ms (estable);
  ENVIADAS 2 + DUPLICADA 1; recepción 6/6/0/0; dev.log 0 errores/0 POST ledger.

**Qué NO se tocó:** la maquinaria del pool (bucle/reserva/mutex e71 — solo cambió el
default), el watchdog, el precalor/prefetch, el filtro `objetivoPrescan`, la UI del
banner (overlay — coexiste con el progreso de la corrida sin mover layout) y el
camino OCR completo (totales `pipeline total=` estables en ambas corridas).

## D33 — REINICIAR ENVÍOS: reset EXPLÍCITO del ciclo de vida de envíos (kit e14-reiniciar-envios-v1)

**Pedido literal del dueño (2026-10-28):** «agregremos un botón para reiniciar los
envíos, porque cada vez que paso el mismo lote me aparece ya enviada… para que se
reinicie y poder probar las mismas imágenes y hacer las medidas». El dueño NO tiene
más imágenes — necesita re-procesar el MISMO lote para medir tiempos por acta.

**Causa raíz (por diseño, no bug):** el ledger e65b (historico.ts — IDB
`e14-masiva-historico-v1`, store `llaves`) sobrevive a `vaciar()` y recargas
(D-e65b-1, RL-e65b-5: «la cola es el taller; el envío es el hecho»). Re-subir lo ya
enviado nace YA-ENVIADA por payload EXACTO (sondeo §C, store.ts cadenaDedup) — el
comportamiento correcto para producción y el bloqueo exacto para re-probar.

**Implementación (3 ediciones, cero borrado):**

1. `historico.ts` — `resetearIndicePayload()` NUEVO (nombre de producción): mata el
   índice de sesión por payload (`indicePayload`/`indicePayloadListo` a nulo). El
   alias de tests `__resetIndicePayloadParaTest()` delega aquí (byte-idéntico).
2. `store.ts` — acción `reiniciarEnvios()` NUEVA junto a `vaciar()`: `vaciarCola()`
   + `mapaQrPayload.clear()` (capa 0 QR) + `borrarHistorico()` (ledger completo) +
   `resetearIndicePayload()` + `indiceEnviadas = null` + reset de la bandeja. Doble
   guard `corriendo`. Es la MISMA higiene del C-2 (modo pruebas e64p) promovida a
   acción EXPLÍCITA de UI en producción.
3. `MasivaView.tsx` — botón «REINICIAR ENVÍOS» en la barra de acciones (hermano del
   VACIAR): armado en 2 toques («¿SEGURO?» rojo pulsante, desarme a 3 s — mismo
   patrón del kit §6, sin window.confirm), `disabled` si `corriendo`, `title`/`aria`
   que dicen exactamente qué borra.

**Contrato:** `vaciar()` queda BYTE A BYTE (RL-e65b-5 intacto — el VACIAR de siempre
sigue respetando el ledger). El reinicio es el corte EXPLÍCITO y CONSCIENTE del
dueño: borra cola + ledger + TODA la memoria de dedup (capa 0 QR / payload / bytes /
visual). Re-subir el mismo lote tras reiniciar nace PENDIENTE y se procesa de cero.

**Verificación E2E (sandbox 2 hilos, agent-browser, tsc 0 · lint 0/0):** acta
sintética con QR controlado (`E14-PRUEBA-RESET-D33|…`): (1) ledger sembrado con ese
payload → re-subir el archivo nace YA-ENVIADA instantánea (sondeo 1/1, conteo «ya
enviadas 1» — dolor del dueño reproducido); (2) REINICIAR ENVÍOS ×2 → ledger IDB
verificado en **0 llaves** (getAll por eval), bandeja limpia; (3) RE-subir el MISMO
archivo → «1 pendientes, 0 ya enviadas» → PROCESAR → pipeline COMPLETO (sondeo 1/1
→ OCR → clasificación «ROMA - CONSULADO - TRANSMISION - MESA 012», score 8.5, 100%,
QR ✓ → REVISIÓN HUMANA — honesto: acta sintética al detector de reales). Sin
errores JS; sondeo hard-kill/respawn = watchdog preexistente del sandbox (hambruna
de CPU por burst, no zombi).

**Nota de contexto:** el trabajo «D32» de la sesión 2026-10-27 (badge gama-baja +
pulso) quedó committeado SOLO local y nunca pushed — PERDIDO con el reinicio del
sandbox (fc9318f no existe en origin). Lo esencial sobrevivió (D30/D31 pushed; gama/
dedup base llegaron con D27). El número D32 se considera RESERVADO-perdido; esta
decisión continúa en D33. Lección institucional: push SIEMPRE al cerrar cada tarea.

## D34 — MÉTRICAS por acta + INFORME DE CARGA en el masiva (kit e14-metricas-corrida-v1)

**Pedido literal del dueño (2026-10-28):** «quiero saber cuánto tardó en procesarse
cada acta (individual) para saber cuáles están tardando más… en el mismo masiva
podemos agregar como un algo para sacar un informe de cómo se está comportando la
carga masiva, cuánto está tardando, en qué está tardando para tener datos reales y
poder diagnosticar bien los fallos».

**Hallazgo que guía el diseño:** los tiempos por acta YA EXISTEN y YA viajan al
acta (`DiagnosticoActa.tiempos` — procesoMs/calidadMs/ocrMs/totalMs + D61
esperaMs/decodeMs/detectMs/persistMs/envioMs) y en la fila (sondeoQrMs, dedup,
etapaAlMorir). Lo que faltaba era VISIBILIDAD + AGREGACIÓN + HISTORIA. Cero
instrumentación nueva del pipeline: un observador pasivo en 4 puntos.

**Implementación (2 archivos nuevos + 1 edit, fire-and-forget, §0 intocado):**

1. `masiva/metricas.ts` NUEVO — IDB SEPARADA `e14-masiva-metricas-v1` (stores
   `actas` + `corridas`, índice porCorrida; filas de NÚMEROS, jamás Blob — L7).
   Hooks: `iniciarCorridaMetrica()` (iniciarRunner — cierra honesta una corrida
   huérfana antes de abrir la nueva), `registrarMetricaDesenlace()` (desenlace
   LISTA — lee `actaFinal.diagnostico.tiempos` QUE YA ESTÁ EN SCOPE), 
   `registrarMetricaCopia()` (reutilizarResultado — totalMs propio ≈0 + ocrMs=0
   EXPLÍCITO del guard e72; etapas heredadas FUERA), `registrarMetricaError()`
   (catch — totalMs null, jamás inventar), `cerrarCorridaMetrica()` (finally del
   bucle). Espejo RAM de la corrida viva + suscripción de UI. Poda a 30 corridas.
   `cuelloDeEtapas()` PURO: máx de decode/detect/ocr/persist/envio — la espera de
   cola y el sondeo (ingesta paralela) NO compiten por «cuello».
2. `screens/InformeCorrida.tsx` NUEVO — panel entre filtros y bandeja: KPIs
   (actas / trabajo pipeline / OCR p50-p95 / desenlaces), barras «¿EN QUÉ SE VA
   EL TIEMPO?» (share % del trabajo), + sondeo y + espera como info aparte,
   ACTAS MÁS LENTAS (top 5 con cuello/score/desenlace, chip COPIA), FALLOS
   (con motivo), HISTORIAL de corridas (clic cambia la vista), EXPORTAR JSON
   (descarga completa) y LIMPIAR (escoba 2 toques). Cero ruido: sin corridas el
   panel NO se renderiza. Misma estética mono/dark del módulo.
3. `runner.ts` — SOLO los 4 hooks (try/catch interno en cada uno: un fallo de
   métrica jamás toca el desenlace). `MasivaView.tsx` — import + render del panel.

**Contratos:** D33 (REINICIAR ENVÍOS) NO toca las métricas — IDBs separadas:
comparar corridas ANTES/DESPUÉS de un reset es exactamente el caso de uso del
dueño. `vaciar()`/`reiniciarEnvios()` byte a byte. El informe es LOCAL del dueño
(export manual — sin canal obs nuevo: el canal obs/ mantiene su privacidad
actaIdHash y otro propósito). Persistencia sobrevive recargas.

**Verificación E2E (sandbox 2 hilos, agent-browser, tsc 0 · lint 0/0):** lote de
2 actas sintéticas (1 real-pipeline + 1 gemela dhash → COPIA): panel EN CURSO en
vivo → COMPLETADA · 5.4 s; KPIs ACTAS 2 · TRABAJO 2.1 s · OCR p50/p95 2.0s/2.0s;
barras DECODE 50 ms (2%) / OCR 2.0 s (98%); sondeo 224 ms · espera en cola
20.6 s (etiquetada «no es trabajo — es turno»); lentas: acta real 3.4 s cuello
OCR vs copia 23 ms DUPLICADA. IDB verificada por eval: corrida fin sellado +
2 actas con cuello/desenlace correctos. Recarga → informe persiste. REINICIAR
ENVÍOS → cola vacía y el informe INTACTO. Export sin errores de consola. cero
errores JS/dev.log.

**Qué NO se hizo (consciente):** no se estampa por-fila en la bandeja (el informe
lo cubre; el acta detallada ya trae tiempos en REVISIÓN); no hay agregados
trans-corrida en la UI (van en el export); no se toca obs/ ni telemetría.

---

## D35 — Motivos honestos de lectura (UX-1) + thumbMs medido: veredicto sobre las miniaturas

**Fecha:** 2026-10-28 · **Origen:** tanda del dueño (e: optimizar recursos «tal vez quitando
las miniaturas») + cruce con el REPORTE de la línea digielect14 (base 3f1cc17, PRs #104/#105
— repo DISTINTO: sin PRs ni ese commit aquí; hallazgos cruzados uno por uno contra este código).

**Parte 1 — UX-1 (motivo real de lectura de archivos).** `archivos.ts` tenía un catch único
en PDF/ZIP/RAR que convertía TRES motivos distintos en «PROTEGIDO_O_CORRUPTO» en falso: el
dueño perseguía corruptos fantasmas que eran archivos ilegibles del disco (bloqueados por otro
proceso, permisos, USB extraído). Ahora: `arrayBuffer()` falla → **ARCHIVO_ILEGIBLE** (el
contenido ni se leyó); pdf.js `PasswordException` → **PDF_PROTEGIDO**; parse/corrupción →
PROTEGIDO_O_CORRUPTO (motivo de siempre, intacto). `motivoCorto` deja pasar códigos nuevos sin
cambios. Verificado E2E: PDF cifrado (pypdf, clave) → fila ERROR «PDF_PROTEGIDO» en ingesta.

**Parte 2 — thumbMs (la decisión de las miniaturas con DATOS, no con corazonadas).**
`hacerThumb` (runner-thumbs.ts: canvas 320px, JPEG 0.7) NO estaba medido. D35 agrega la etapa
`thumbMs` a metricas.ts (EtapasMetrica + hook desenlace + args) — cronometrada en runner.ts
en el desenlace LISTA (DUPLICADA/ERROR temprano no la pagan). En el INFORME: línea propia
«+ THUMBS DE BANDEJA (post-pipeline)» al lado de sondeo/espera; NO compite por «cuello» ni
entra a las barras (es cosmético post-pipeline — igual doctrina que el sondeo).

**Veredicto medido (sandbox, acta sintética, INFORME en vivo):** THUMBS = **3 ms** por acta
frente a OCR 2.0 s (666×). **Las miniaturas NO se quitan:** el costo es ruido y la bandeja
pierde valor UX. Palanca existente si el dueño la quiere en gama BAJO: `flags.thumbsOn:false`
(D6: la app nunca se auto-configura — decisión manual del dueño). El cuello REAL de recursos
sigue siendo la persistencia whole-record (fotoOriginal+fotoProcesada ~MBs por acta en IDB) —
candidato P2 con decisión del dueño (impacta REVISIÓN).

**P0 del reporte (watchdog OCR): YA EXISTE aquí como D65** — runner-watchdog.ts:
carrera WATCHDOG_MS 75s (calibrado por gama: planGamaActual().watchdogMs) + 2 intentos +
`matarYRecrearWorkers()` (dispose OpenCV + rapidOcrReiniciar + re-warm D74). La otra línea
no lo tiene; no se duplica nada. Pendiente opcional de esa línea: telemetría de hangs
(heartbeat WAL) — post-mortem, no bloqueante aquí.

**Contratos:** solo-additive (D57): thumbMs viaja AUSENTE si no se midió — jamás 0 inventado.
Barras/aggregate del INFORME intocados (thumbMs con `continue` propio). UX-1 no toca la
política de errores del pipeline (motivoCorto/rutas de siempre).

**Verificación E2E (agent-browser, tsc 0 · lint 0/0):** REINICIAR ENVÍOS (D33) → cola 0 →
lote {acta sintética, pdf-protegido.pdf}: PDF fila ERROR **PDF_PROTEGIDO** en ingesta (antes
PROTEGIDO_O_CORRUPTO en falso) + acta LISTA pipeline completo (COMPLETADA · 6.4 s, OCR
p50/p95 2.2 s, EN_REVISION_HUMANA 1); INFORME: «+ THUMBS DE BANDEJA: 3 ms en 1 acta(s)»;
EXPORTAR JSON OK; 0 errores de consola/dev.log.

---

## D36 — Auditoría de reglas de negocio (tanda del dueño d) + cortocircuito del sondeo bajo hambruna

**Fecha:** 2026-10-28 · **Método:** reglas leídas en el código + cruzadas con los datos del
INFORME (D34/D35) y con la corrida de estrés E2E (58 archivos: únicas, duplicadas byte-exacto,
12 MP, recarga + cráter del navegador a mitad de corrida).

**Hallazgos de la auditoría (R1-R6):**
- **R1 — AUTO sin QR (BUG-5 del reporte): CONFIRMADO también aquí** — el gate de envío
  automático es `status === "OPTIMA"` (runner.ts, score ≥ 8 vía statusDeScore); el QR NO
  bloquea (perdón por lectura fuerte). Una acta con QR ✗ y score ≥ 8 sale ENVIADA AUTO sin
  payload → el veto por payload no la cubre (bytes/visual sí). **DECISIÓN DEL DUEÑO**: se
  recomienda MANTENER (el gate de legibilidad es el fuerte; endurecer a «AUTO solo con QR»
  baja el rendimiento para proteger contra un caso que las otras capas ya cubren). Si el
  dueño decide endurecer: es 1 línea en el gate + kill-switch.
- **R2 — Sondeo bajo hambruna de CPU: CORTOCIRCUITO implementado (flag
  `sondeoQrCortocircuito`, default true).** La señal hambruna YA se medía (≥3 hard-kills/min
  en e14-sondeo-burst-v1; dev.log del dueño: 11-12 kills/min sostenidos) pero solo se
  LOGUEABA. Cada kill = terminate + respawn + re-boot del wasm del worker que compite con el
  OCR — bucle vicioso que ALARGA el pipeline que el sondeo quiere ayudar. Ahora: ≥3 kills/min
  → sondeo PAUSA 30 s (null inmediato, drena la ingesta), media apertura self-healing (1
  intento/min en lo peor). Compatible con §I («jamás extender presupuesto» — aquí se reduce
  carga). La dedup NO se pierde: capa0-qr + dhash + payload in-pool cubren las mismas gemelas
  (el sondeo solo ADELANTA el marcaje). Kill-switch del dueño: false = byte-idéntico a hoy.
- **R3 — Orden de capas dedup: CORRECTO y verificado en vivo** — en el estrés, las 6
  duplicadas byte-exacto fueron vetadas por la capa bytes ANTES del sondeo («dedup … bytes
  gemela viva → sondeo QR omitido (dhash decide)»): cero OCR, cero sondeo, cero contención.
  Capa más barata primero — sin cambio.
- **R4 — dhash ya está desactivado en gama BAJO** («dhash OMITIDO — gama adaptativa,
  identidad post-OCR decide», D74): el plan gama ya gobierna. Sin cambio.
- **R5 — Watchdog/rescate/relectura: acotados y correctos** — carrera 75 s calibrada por
  gama (D65), 2 intentos, relectura con tope, rescate anti-falso-rechazo bounded. Sin
  hallazgos. El P0 del REPORTE (watchdog OCR inexistente) NO aplica aquí: D65 ya existe.
- **R6 — El cuello sigue siendo el OCR (98% del trabajo, D34/D35)** — las reglas que
  multiplican OCR (relectura/rescate) están acotadas; paralelizar NO aplica (wasm mono-hilo,
  D31); palancas reales restantes: precalor (existe), persistencia whole-record (P2 —
  decisión del dueño, impacta REVISIÓN).

**Verificación E2E del R2 (honesta):** flag plumbing probado EN VIVO — override
`sondeoQrPresupuestoMs: 500` (localStorage, se lee por sondeo sin reload) → sondeos abortando
en ~500 ms (504/552 vs 235 base) ✓. Regresión limpia: 58 archivos (únicas + duplicadas
byte-exacto + 12 MP) con el CB activo: sondeos 232-833 ms, dedup por capas correcto, runner
avanzando (5→50/58), cola persistente restauró 48/58 tras recarga Y tras cráter del navegador
(prevención de reinicios del dueño FUNCIONANDO). **El disparo del CB NO se reprodujo en este
sandbox**: el sondeo worker nunca superó 833 ms (kill a 1500/3500 ms) — la hambruna real del
dueño (12 MP × lotes grandes + REVISIÓN abierta) es el disparador; el CB se arma solo con su
señal ya medida. tsc 0 · lint 0/0 · 0 errores de consola de la app.

---

## D37 — Despliegue en CLOUDFLARE PAGES: `_headers` COOP/COEP + CI/CD desde GitHub (kit e14-cloudflare-pages-v1)

**Fecha:** 2026-10-28 · **Origen:** el dueño migra el hosting (GitHub Pages → Cloudflare
Pages) y entrega tokens de GitHub + Cloudflare para subir y dejar el pipeline completo.

**Por qué Cloudflare Pages.** GitHub Pages no permite cabeceras HTTP → el perfil del
dispositivo (kit perfil-recursos-v1) reporta «Hilos WASM inactivos» porque falta
crossOriginIsolated. Cloudflare Pages SÍ: un archivo `_headers` en la raíz del export activa
COOP/COEP → SharedArrayBuffer → los workers OCR (onnxruntime-web) y QR (zxing-wasm) usan
HILOS REALES + SIMD en paralelo. El OCR es el 98 % del cuello del pipeline (D34) — esta es
la palanca grande que GitHub Pages nunca pudo dar.

**Qué se hizo.**
1. `public/_headers` global: `Cross-Origin-Opener-Policy: same-origin` +
   `Cross-Origin-Embedder-Policy: require-corp` en `/*`. Seguro: el sitio es 100 % same-origin
   (sin CDNs, sin iframes — verificado por grep; pdf.js/OCR/QR/wasm viajan en /public).
2. Correcciones del kit perfil-recursos-v1 que impedían compilar (el commit dd3e6db se hizo
   sin build de verificación — lección): panel-perfil.tsx línea del DPR (guard que no
   estrechaba `s` → `s && s.sync.dpr !== null`) y clasificador.ts comparación muerta
   `s.sync.saveData !== true` (TS ya estrecha tras el `else if saveData===true` de §4.4).
3. basePath VACÍO en Cloudflare (sirve en raíz) vs `/supervision-e14` en GitHub Pages.
   El build para CF NO define NEXT_PUBLIC_BASE_PATH — next.config.ts ya lo resuelve por env.
4. CI/CD: workflow `.github/workflows/cloudflare-pages.yml` (push a main → build →
   `wrangler pages deploy out --project-name=supervision-e14`) con secrets
   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID en GitHub. El workflow de GitHub Pages
   (pages.yml) queda intacto y sigue desplegando — ambos despliegues conviven.
5. Deploy inicial directo (wrangler desde sandbox) + verificación E2E contra la URL de
   producción: crossOriginIsolated=true, panel con las 5 capacidades en verde, monitor y
   perfil íntegros en móvil 375px.

**Contratos:** sin cambios de lógica de negocio. `_headers` es infraestructura de hosting
(Next lo copia de public/ a out/ tal cual). El modo GitHub Pages sigue intacto (mismo
export, basePath por env) — ambos despliegues conviven mientras el dueño corta el DNS.

**Verificación E2E (agente-browser contra out/ con cabeceras simuladas y contra la URL
de producción):** título «Sistema de Monitoreo Electoral E-14» · chip «GAMA BAJO · TABLET»
en header · vista Perfil del dispositivo con GAMA/FORMA/CONFIANZA 100 %/BENCHMARK ·
Capacidades del runtime: WASM SIMD ✓ Hilos WASM ✓ COOP/COEP ✓ (crossOriginIsolated=true) ·
Plan de recursos recomendado y Evidencia del tier íntegros · responsive 375 px OK ·
0 errores de consola. `tsc 0 · lint 0/0`.
