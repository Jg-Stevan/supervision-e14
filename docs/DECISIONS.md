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
