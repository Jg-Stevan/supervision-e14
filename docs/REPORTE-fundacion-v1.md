# REPORTE — fundacion-v1 (kit SUP-1)

**Repo:** `supervision-e14` (privado, creado en T0)
**Rama:** `feat/fundacion-v1` → PR **draft** hacia `main`
**Fecha:** 2026-10-20

---

## 1. Qué se implementó

- **T0 — Repo + scaffold:** repo privado creado vía `gh repo create
  supervision-e14 --private`; scaffold Next.js 16.4.2 + TS 5.9 + Tailwind
  4.3 (create-next-app en temp, movido al repo); shadcn/ui New York con los
  13 componentes pedidos. Commit de scaffold puro directo a `main`
  (`8aaf0a0`, ÚNICO push a main permitido por el kit).
- **T1 — Tema:** `globals.css` dark-only con los tokens §2.1 mapeados a
  variables shadcn + custom de estado; radio 4px global; sin azules/índigos;
  sin sombras. `next/font` con Hanken Grotesk + JetBrains Mono; utilidades
  `headline-lg/md`, `label-caps`, `stats-number`, `body-lg/md`, `font-data`.
- **T2 — Dominio + mock:** `domain/types.ts` (Puesto, Mesa, ParteTransmision,
  ResumenGlobal, Supervisor, enums, FiltrosPuestos);
  `data/supervision-repository.ts` (interfaz + comentario de punto de
  intercambio textual del kit); `data/mock-repository.ts` (20 puestos
  KPI-consistentes + mesas 001–003 de Italia, datos exactos del kit).
- **T3 — Shell:** `supervision-shell.tsx` — sidebar 256px fija ≥1024px con
  MONITOR GLOBAL activo y el resto con tooltip “Próximamente” + badges
  “RESCANEO 0” y “Anomalía 5”; header sticky 48px (dot verde ONLINE,
  SUPERVISOR, ID: ADM-9482); drawer Sheet en <1024px vía botón ☰.
- **T4 — Monitor Global:** `kpi-card`, `filtros-bar` (5 selects + búsqueda
  funcional con `useMemo`), `resumen-chips` (tint 10%), `puestos-table`
  (filas 48px, acento vertical 4px, header sticky, expansión con
  Collapsible, Italia abierta por defecto), `mesas-subtable` (chips P1/P2,
  alerta Rescaneo, badges, acciones → toast demo), `status-badge`,
  `status-dot`, coordinador `monitor-global`. `page.tsx` (Server Component)
  consume el repositorio mock y compone todo; Toaster montado en layout.

## 2. Evidencias (comandos + resultados)

| Verificación | Resultado |
|---|---|
| `bun run lint` | 0 errores |
| `bunx tsc --noEmit` | 0 errores |
| `bun run dev` (puerto local) | Ready, GET / 200, consola del servidor limpia |
| Consola del navegador | Sin errores ni warnings de la app |
| KPIs en runtime | 20 / 5 / 1 / 4 / 10 (fotografiado) |
| Filtro Estado=COMPLETO | Exactamente 5 filas (Países Bajos, Francia, Alemania, Brasil, Canadá) |
| Búsqueda “499” | 1 puesto (Italia) · Búsqueda “Roma” | 1 puesto (02 - Roma) |
| Búsqueda sin resultados | Estado vacío “Ningún puesto coincide…” |
| Expansión Italia | Abierta por defecto; clic colapsa/expand; sub-tabla 001–003 visible |
| Acciones REINSPECCIONAR / NOTIFICAR | Toast “Función de demostración — sin backend” |
| Sidebar → drawer <1024px | Sheet con nav completa, captura a 375px |
| Legibilidad 375px y 1440px | Capturas completas revisadas |
| Targets táctiles | Trigger/inputs/botones ≥44px (opciones de Select y acciones a 44px) |
| Fuentes | `document.fonts` carga Hanken Grotesk + JetBrains Mono |

Verificación funcional ejecutada con navegador headless (agent-browser)
contra el dev server local: sticky del header de tabla medido
programáticamente, expansión/colapso, toast, filtros, búsqueda, drawer
móvil y capturas a 1440×900 y 375×812.

## 3. Desviaciones (todas documentadas en docs/DECISIONS.md)

1. **D6:** España CRÍTICO→PENDIENTE + 15 puestos de relleno para cuadrar
   KPIs (opción explícita del kit §2.4).
2. **D4.a:** `--warning` = `#ffd600` (ámbar “alternativo” ofrecido por el
   propio kit) para unificarlo con el estado PENDIENTE.
3. **D7.1–D7.2:** ajustes técnicos (Collapsible sobre múltiples `<tbody>`;
   sticky del header de tabla dentro de su propia región de scroll) por
   conflictos de DOM/scrollport — cero cambios de alcance.
4. **D5 nota:** SUPERVISOR/ADM-9482 exportado como constante del mock (la
   interfaz conserva EXACTOS los 3 métodos del kit).
5. **Entorno:** `gh` no venía en la máquina → instalado binario oficial
   v2.63.2 antes de T0 (el kit pedía usar `gh`). El CLI `shadcn` actual
   (v3) eliminó el estilo New York → se usó el CLI clásico `shadcn@2`;
   su `init` falló validación sin TTY → `components.json` escrito
   equivalente al de init + `add` del CLI (mismos artefactos).

## 4. BLOQUEADAS

Ninguna.

## 5. NOTA DE CONTINUIDAD DE SESIÓN

- Clon local de trabajo: `/home/z/supervision-e14` (máquina del agente).
- Kit leído de `/home/z/my-project/upload/INSTRUCCIONES-sup-e14-fundacion-v1.md`.
- Identidad git del repo: **Jg-Stevan <julistevan02@gmail.com>**.
- El token de GitHub lo entrega el dueño por chat y se configura SOLO en la
  URL del remote de este clone. **PENDIENTE PERMANENTE DEL DUEÑO: revocar el
  token “Agente 3” (quedó expuesto en el chat).**
- Si la sesión se reinicia: re-clonar
  `https://github.com/Jg-Stevan/supervision-e14.git` (privado), crear
  `feat/fundacion-v1` si no existe, y continuar desde el reporte anterior;
  el PR draft queda registrado en GitHub.
