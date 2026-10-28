# REPORTE — recepcion-actas-v1 (módulo RECEPCIÓN DE ACTAS, D28)

**Fecha:** 2026-02 (sesión actual) · **Repo:** supervision-e14 · **Base:** D27
(carga-masiva-supervision-v1 ya integrado y verificado end-to-end).

## 0. Objetivo

El supervisor necesita **saber las actas que van llegando** — hoy el desenlace
queda disperso: toasts efímeros del masiva, `console.warn` de la cuarentena D25
y la bandeja del módulo digitalizador. Este kit añade la vista **Recepción de
actas**: un log EN VIVO, una fila por página recibida, con su desenlace y su
foto.

## 1. Qué se entregó

| Pieza | Archivo | Rol |
|---|---|---|
| Log runtime | `src/modules/supervision/data/recepcion-log.ts` (NUEVO) | Registro en memoria de sesión + suscripción + semilla ingesta-inicial |
| Gancho publicación | `src/modules/supervision/data/actas-runtime.ts` | Registra PUBLICADA/BLOQUEADA en el embudo (`publicarActaMasiva`) |
| Gancho sin-join | `src/modules/digitalizador/store/store-e14.ts` | Registra SIN_JOIN donde se decide (sin join confiable) |
| Vista | `src/modules/supervision/components/vista-recepcion.tsx` (NUEVO) | Log en vivo + KPIs + filtros + búsqueda + VER EN MONITOR |
| Shell | `src/modules/supervision/components/supervision-shell.tsx` | Nav "Recepción de actas" + badge dinámico + routing |
| CSS | `src/app/globals.css` | `.scroll-panel` (scroll fino) y `.fila-llegada` (destello) |
| Docs | `docs/DECISIONS.md` D28 | Decisión y rationale |

## 2. Contrato del log

Grano **página** (1 foto = 1 entrada, igual que el pipeline masiva). Tres
desenlaces, los mismos términos del kit D27:

- **PUBLICADA** — join `idEnlace` (D22) válido; la página aterrizó en el
  monitor (fotos runtime D24 + estado de mesa vía `registrarCargaMasiva`).
- **BLOQUEADA** — cuarentena D25: validación (a) idEnlace ausente,
  (b) mesa fuera de rango o (d) página fuera de rango; la entrada guarda el
  motivo exacto.
- **SIN_JOIN** — llegó sin clasificación AUTO (SUGERIDA/MANUAL/sin cabecera):
  se registra con `—` en idEnlace/mesa y formulario n/d (honestidad §0-1:
  jamás inventar ubicación). `idEnlace`/`mesa`/`formulario` son `null`/`—`.

Cada entrada lleva: fecha (epoch), origen (`carga-masiva` en vivo ·
`ingesta-inicial` semilla), miniatura de la foto recibida (`srcFoto` — null →
hueco honesto), país/lugar del encabezado impreso verbatim, página n/N, score
y status de la bandeja, y nombre de archivo cuando existe.

## 3. Comportamiento en vivo

1. El supervisor sube actas en **Carga masiva** y procesa la cola.
2. Cada envío → `publicarActaMasiva` → **el log recibe la entrada al
   instante** (PUBLICADA o BLOQUEADA con motivo) o `store-e14` la registra
   (SIN_JOIN).
3. La vista Recepción (suscripción) muestra la fila nueva con destello
   (`.fila-llegada` 1.6 s) y los KPIs se mueven.
4. Si el supervisor está en OTRA vista, el badge del sidebar suma 1 por
   llegada (solo `carga-masiva`; la semilla no cuenta) y se anula al abrir
   la vista.
5. **VER EN MONITOR** (solo PUBLICADAS): aterriza el acta en el visor del
   monitor — mismo seam por props que el masiva (D27).

## 4. Semilla `ingesta-inicial`

`asegurarSemilla()` (perezosa, 1 vez, client-only) siembra las páginas del
ancla estático SUP-6 (`cargarActasReales()` — ya memoizado, costo cero) como
llegadas de inicio de sesión con desfases fijos (34/31/27/24 min). Así la
vista abre con contenido real auditable y el log cuenta también la ingesta
inicial. Recargar la página restablece todo (D8/§0-5 — misma disciplina del
dashboard).

## 5. Verificación (este entorno)

- `bunx tsc --noEmit` → 0 errores; `bun run lint` → 0 errores / 0 warnings.
- E2E con agent-browser (dev :3000): la vista abre con la semilla
  ingesta-inicial (4 páginas del ancla), filtros KPI y búsqueda operativos,
  y una carga masiva real produce filas PUBLICADA en vivo + badge del
  sidebar + VER EN MONITOR hasta el visor. Detalle de la pasada en la
  sección de verificación del PR/commit.

## 6. Límites honestos

- Memoria de sesión (D8): recargar restablece el log (el histórico durable
  de enviadas sigue siendo el IDB del módulo masiva).
- SIN_JOIN no tiene dónde aterrizar (sin join no hay destino — así lo exige
  el kit D27; el supervisor lo ve en el log y puede re-clasificar desde la
  bandeja del masiva).
- Las filas BLOQUEADA/SIN_JOIN no mueven KPIs del monitor (solo las
  publicadas lo hacen — comportamiento D27 intacto).
