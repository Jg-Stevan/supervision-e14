# supervision-e14

**Sistema de Monitoreo Electoral E-14** — módulo de monitoreo y auditoría de
votaciones en el exterior. Pantalla actual: **Monitor Global** (kit
`SUP-1` / `fundacion-v1`).

## Stack

- Next.js 16 (App Router) + TypeScript estricto
- Tailwind CSS 4 + shadcn/ui (estilo New York) + lucide-react
- Tema **solo dark** (tokens en `src/app/globals.css`)
- Fuentes vía `next/font`: Hanken Grotesk (estructura) + JetBrains Mono (datos)
- Estado: `useState`/`useMemo` (sin librerías extra)

## Cómo correr

```bash
bun install
bun run dev
```

## Arquitectura

**Frontera de módulo dura:** TODO el código del producto vive en
`src/modules/supervision/**`. Fuera de esa carpeta solo hay scaffolding y
config. El módulo se **trasplantará** al monorepo del digitalizador cuando
madure; ningún archivo externo importa nada del módulo.

**Datos siempre detrás de una interfaz:**

```
src/modules/supervision/
├── domain/types.ts                  # contrato de dominio (sin dependencias)
├── domain/divipola.ts               # tipos canónicos + validación DIVIPOLA (SUP-5)
├── data/supervision-repository.ts   # interfaz SupervisionRepository
├── data/divipola-puestos.json       # catálogo MAESTRO (solo datos del join futuro — NUNCA importado)
├── data/divipola-exterior.json      # derivado exterior canónico (única fuente que importa el código)
├── data/divipola-adapter.ts         # carga + validación estricta del derivado (SUP-5)
├── data/mock-repository.ts          # implementación mock (catálogo DIVIPOLA exterior — 949 puestos)
└── components/                      # shell + Monitor Global
```

> **Punto de intercambio:** en la integración al digitalizador se reemplaza
> `mockSupervisionRepository` por la implementación real. Nada más cambia.
> El resto de la app nunca consume datos directo: solo habla con la interfaz.

## Plan de integración futura (al monorepo del digitalizador)

1. Mover `src/modules/supervision/**` tal cual.
2. Crear la implementación real de `SupervisionRepository` contra los datos
   del digitalizador y sustituir el mock en el único punto de consumo.
3. Ajustar tokens de tema si el monorepo ya define los suyos.
4. Nada del shell/pantalla cambia: la frontera está diseñada para eso.

## Estado del demo

- Todo dato en pantalla viene del mock (`mock-repository.ts`), hoy sobre
  el catálogo DIVIPOLA exterior (ver «Fuente de datos» abajo).
- Los botones de acción muestran el toast
  “Función de demostración — sin backend”.

## Fuente de datos (DIVIPOLA)

Kit `SUP-5` (`divipola-v1`): el módulo monitorea **voto exterior** y su
fuente es el **catálogo DIVIPOLA real** entregado por el dueño:

- **`data/divipola-puestos.json`** — catálogo MAESTRO (34 deptos · 1.189
  municipios · 3.013 zonas · **14.438 puestos**). Solo vive en el repo
  como base del join futuro con el digitalizador/carga masiva —
  **NUNCA se importa en código**.
- **`data/divipola-exterior.json`** — derivado exterior canónico
  (**949 puestos · 67 países · 3.670 mesas**, departamento 88
  CONSULADOS). Es la ÚNICA fuente que consume el código
  (`data/divipola-adapter.ts`), con validación estricta propia
  (`domain/divipola.ts`): 8 campos exactos, códigos como strings con
  ancho fijo, `idEnlace` único y congruente, y los números esperados
  del kit (cualquier desviación aborta con `BLOQUEADA: …`).
- **`idEnlace` (`<dept>_<mun>_<zona>_<puesto>`, ej. `88_495_010_02`)**
  es la clave de join (D22): identifica cada fila del demo y casará los
  datos futuros del digitalizador.
- **Estado simulado determinístico:** el estado de cada puesto se siembra
  por hash del `idEnlace` (mismo seed → mismos KPIs siempre) con la
  distribución histórica del demo; los KPIs se **derivan** del catálogo
  con la invariante `total = completo + crítico + pendiente +
  no_iniciado` exacta (D21 — supersede D6). Mesas por puesto =
  `totalMesas` real del catálogo (1..159).
- **Ancla demo:** `88_495_010_02` (Roma - Consulado, ITALIA 495)
  conserva el estado demo completo — CRÍTICO, 8 mesas, mesas 001-003
  exactas al mockup y acta `#A92-F` con historial 14:00/14:18/14:20.

## Módulos temporalmente desactivados

Las vistas **Centro de notificaciones** y **Generar informes** están
OCULTAS (retiro TEMPORAL del kit `SUP-5` / D20 — no borradas):

- El flag vive en `src/modules/supervision/components/supervision-shell.tsx`:
  `MODULOS_INACTIVOS = ["notificaciones", "informes"]`.
- **Reactivar las entradas:** vaciar esa lista (las 2 entradas vuelven al
  sidebar). La restauración completa (render de las vistas) requiere
  además reponer sus 2 imports y 2 casos del switch en el mismo archivo.
- Mientras tanto el código queda dormido e INTACTO — componentes, store
  y acciones que escriben notificaciones siguen operando en memoria
  (invisibles para el usuario); su lógica no se toca.

## Ver en GitHub Pages

- URL (disponible tras el merge de este PR):
  **https://jg-stevan.github.io/supervision-e14/**
- **Cómo funciona el export estático:** `next.config.ts` usa
  `output: "export"` con `basePath` inyectado por env
  (`NEXT_PUBLIC_BASE_PATH=/supervision-e14` SOLO en el build de Actions —
  ver `docs/DECISIONS.md` D8). El workflow
  `.github/workflows/pages.yml` corre `bun install` → `next typegen` →
  `next build`, sube `out/` como artefacto y lo despliega con
  `actions/deploy-pages`. `public/.nojekyll` evita que GitHub Pages
  ignore `_next/`. Se activa con cada push a `main` (o manualmente con
  `workflow_dispatch`).
- **Build estático sin sorpresas:** sin env el build genera rutas de raíz
  (`/_next/...`, verificado), y el `bun run dev` local sigue funcionando
  en raíz sin basePath.

## Vistas disponibles (demo)

El shell cambia de vista por estado interno (sin rutas — ver
`docs/DECISIONS.md` D11). La sidebar está oculta por defecto: ábrela con
el botón ☰ (se cierra con ✕, Escape o clic fuera).

**Activas:**

1. **Monitor global** — dashboard VIVO sobre el catálogo real (949
   puestos): 5 KPIs derivados clickeables (filtro de estado toggle),
   ticker «Sincronizado hace Xs», y cada ~45 s una transición simulada
   (mesa EN_PROCESO → COMPLETO) recalcula pcts y, si un puesto completa,
   los KPIs se mueven en vivo. REINSPECCIONAR resuelve alertas de
   rescaneo (~2.5 s) y NOTIFICAR registra la acción.
2. **Revisión de anomalías** — 5 abiertas sembradas (re-ancladas al
   catálogo); marcar revisada; badge = abiertas restantes.

**Temporalmente desactivadas (D20 — ver sección anterior):**

3. ~~Centro de notificaciones~~ — dormido (código intacto).
4. ~~Generar informes~~ — dormido (código intacto).

Carga masiva queda como placeholder deshabilitado (integración futura
con el digitalizador).

## Visor de Actas (kit `SUP-4` / `actas-v1`)

El **visor de actas** permite revisar el documento E-14 digitalizado de
cualquier mesa con transmisión. Es un **modal por estado** (no una ruta —
ver `docs/DECISIONS.md` D17): el export estático no cambia.

**Entradas (exactamente 3):**

1. Botón VER ACTA (`FileText`) en cada fila de la sub-tabla de mesas
   (deshabilitado en mesas NO INICIADO — sin transmisión).
2. Botón VER ACTA en las tarjetas de anomalías — aterriza directamente en
   PÁGINA 2 cuando la advertencia de la anomalía es de página 2.
3. Botón 👁 (`Eye`) en la fila del puesto — abre la primera mesa con
   acta del puesto.

**Qué contiene:** breadcrumb del puesto, navegador de mesas
`< MESA n/N >` (solo mesas con acta), chip de credencial + hora de
carga, toggle DELEGADOS/TRANSMISIÓN, conmutador de páginas con badge de
estado (✓ válida / ⚠ advertencia pulsante / reloj pendiente), documento
sintético A4 con **zoom (0.5–3.0), rotación (4 posiciones), contraste
(normal/alto/negativo) y pantalla completa**, y una sidebar con las dos
acciones del supervisor: **APROBAR Y MARCAR COMO VÁLIDA** y **CONFIRMAR
RESCANEO** (~2.5 s de spinner, motivo obligatorio), observaciones,
historial de trazabilidad y nota de auditoría.

**Límites de la demo:** el documento se dibuja como SVG/JSX sintético
(sin binarios — D18); los datos se derivan de forma determinística por
seed de la mesa (Roma mesa 1 es exacta al mockup: credencial `#A92-F`).
Las acciones solo mutan nivel acta + anomalías + notificaciones — los
contadores de mesa del monitor NO cambian (T5.7). Sin backend y sin
persistencia (§0-5): recargar la página restablece el estado inicial.

**Flujo de demostración sugerido (visor):** abre ITALIA (495) → VER ACTA
en Mesa 001 de Roma - Consulado (credencial `#A92-F`, motivo «SOLICITUD
DE RESCANEO», PÁGINA 2 con sello «FIRMA ILEGIBLE») → escribe una
observación → APROBAR (spinner → overlay «ACTA VALIDADA», anomalía
revisada) → navega a la Mesa 004 con `< MESA n/N >` → CONFIRMAR
RESCANEO (caption «VERSIÓN 2 — RECIBIDA…»).

**Flujo de demostración sugerido (dashboard vivo):** abre ☰ → visita las
vistas activas → vuelve al Monitor → busca «roma» y expande 02 - Roma -
Consulado → pulsa REINSPECCIONAR en Mesa 001 → espera ~45 s y mira cómo
el ticker completa una mesa en vivo.
