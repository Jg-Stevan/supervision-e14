# WORKLOG — registro breve de kits

> Los docs previos `DECISIONS.md`/`worklog.md` ya no existían en el repo
> (ver REPORTE-actas-reales-v2.md) — este archivo retoma la bitácora:
> una entrada por kit, fecha, qué hace, archivos y gates.

## 2026-10-29 — kit `puente-remoto-v1` (productor remoto de actas)

**Qué hace:** el supervisor ahora TRAE las actas que el digitalizador
publica en el hub `e14-puente` (workers.dev) y las inyecta en la
recepción en memoria existente (`publicarActaMasiva` — validación
DIVIPOLA D25, merge runtime, evento a datos-provider, recepcion-log).
Cadena: route proxy del servidor (`E14_PUENTE_URL`) → módulo client-safe
con dedup por `hash` + `ULTIMO_TS` (idempotente: la primera sync desde 0
repuebla TODO el histórico; el polling desde el último ts trae lo
nuevo) → hook poller (800 ms inicial, intervalo 8 s solo con pestaña
visible y sin ciclo en curso, botón manual con el mismo guardia) →
bloque compacto "PUENTE REMOTO" en el footer del sidebar (punto verde
pulse / rojo, "EN VIVO" / "SIN CONEXIÓN", contador "+N nuevas"; clic =
sincronizar ahora + abrir Recepción). Sin libs nuevas; el hub caído NO
rompe el poller (502 → `HUB_INALCANZABLE`, reintento en el siguiente
ciclo). Formularios distintos de TRANSMISION/DELEGADOS se filtran
(cuentan como bloqueadas, nunca se publican).

**Archivos:**
- NUEVO `src/app/api/supervision/remotas/route.ts` — proxy GET del hub
  (fetch server-side, `force-dynamic`, 502 con `HUB_INALCANZABLE`).
- NUEVO `src/modules/supervision/data/puente-remoto.ts` —
  `sincronizarRemota()` (fetch relativo al proxy, dedup por hash,
  `publicarActaMasiva`) + `estadoPuenteRemoto()` (telemetría).
- NUEVO `src/modules/supervision/components/use-puente-remoto.ts` —
  poller `usePuenteRemoto()` (estado + `sincronizarAhora`, timers
  limpios).
- MODIFICADO `src/modules/supervision/components/supervision-shell.tsx`
  — `usePuenteRemoto()` en `ShellInterno`, bloque `BloquePuenteRemoto`
  en el footer de `ContenidoNav` (mismo lenguaje visual de los badges).

**Gates:** `bun install` OK (827 pkgs) · `bunx tsc --noEmit` = salida
IDÉNTICA al baseline preexistente (11 errores ajenos al kit: 2 en
`examples/websocket` sin socket.io + 9 declaraciones de PNG en
`actas-reales.ts` — 0 errores en archivos del kit) · `bun run lint`
limpio (exit 0, repo completo).
