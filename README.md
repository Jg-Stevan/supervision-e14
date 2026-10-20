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
├── data/supervision-repository.ts   # interfaz SupervisionRepository
├── data/mock-repository.ts          # implementación mock (20 puestos demo)
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

- Todo dato en pantalla viene del mock (`mock-repository.ts`).
- Los botones de acción muestran el toast
  “Función de demostración — sin backend”.
- Las entradas de sidebar distintas de Monitor Global no navegan
  (tooltip “Próximamente”).

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
