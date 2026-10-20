# REPORTE — sup-e14-vida-v1 (SUP-3)

**Kit:** `INSTRUCCIONES-sup-e14-vida-v1.md` · **Fecha:** 2026-10-20
**Entregable:** sidebar ocultable + 3 vistas nuevas + dashboard vivo + PR draft

---

## 1. Alcance ejecutado (T1-T8, cero comportamientos de más)

| Tarea | Estado | Qué se hizo |
|---|---|---|
| T1 sidebar overlay | ✅ | Sidebar oculta por defecto en TODOS los viewports; ☰ siempre visible; panel flotante encima del contenido (scrim `rgba(0,0,0,0.5)`, borde 1px `outline-variant`, sin sombras); cierre con ✕ / Escape / clic en scrim; foco al panel; código unificado móvil/desktop (el Sheet anterior se retiró). Carga Masiva deshabilitada con tooltip del kit. |
| T2 mock completo + repo async | ✅ | Mesas determinísticas para los 20 puestos (cantidad EXACTA = `numeroMesas`; Italia: 3 EXACTAS del mockup + 004-008 coherentes con CRÍTICO); recetas por estado (COMPLETO/PENDIENTE/CRÍTICO/NO_INICIADO); pcts derivables de mesas; interfaz `Promise` + latencia ~400 ms + mutaciones T4/T3 en la interfaz. |
| T3 Monitor vivo | ✅ | Skeletons en primera carga; ticker «Sincronizado hace Xs» de 5 en 5 s; a los 45 s UNA transición (EN_PROCESO → completa partes → recalc mesa/puesto/KPIs si completa). KPI cards clickeables (toggle de filtro de estado, `aria-pressed`, hover bg sin sombra; «Total puestos» sin estado → no clickeable). |
| T4 acciones con estado | ✅ | REINSPECCIONAR: spinner «Procesando…» ~2.5 s → alerta Rescaneo resuelta → mesa/puesto recalculados → notificación + toast; NOTIFICAR: notificación + toast sin cambiar la mesa; badges del sidebar dinámicos. |
| T5 Centro de Notificaciones | ✅ | Vista por estado del shell; 7 semillas coherentes (4 no leídas); icono por tipo, texto, timestamp relativo, punto de no-leída; clic → leída; «Marcar todas como leídas»; badge = no leídas (sin número si 0); filtro Todas/No leídas. |
| T6 Revisión de Anomalías | ✅ | 5 abiertas sembradas (+2 revisadas de histórico); tipo/puesto/mesa/severidad/fecha/estado; «Marcar revisada» por fila; filtro Abiertas/Todas/Revisadas; badge = abiertas restantes (5 → 4 verificado). |
| T7 Generar Informes | ✅ | Alcance Global o cualquiera de los 20 puestos; preview (KPIs del alcance + chips + tabla compacta de puestos o mesas); descarga REAL .md y .csv (Blob + `<a download>`) + toast con nombre; fecha real del navegador en el título. |
| T8 docs + PR | ✅ | DECISIONS D11-D16, este REPORTE, README, commits separados, PR **draft**. |

## 2. Verificación §4 (evidencia de browser, headless 1440×900 y 375×812)

| # | Prueba | Resultado |
|---|---|---|
| 1 | Clone fresco `rm -rf .next && bunx tsc --noEmit` (sin typegen) | **0 errores** · `bun run lint` → **0** |
| 2a | Sidebar oculta al cargar; ☰ abre overlay ENCIMA (scrim + borde 1px); foco en panel | ✓ (dialog visible, scrim presente, `borderRightWidth: 1px`, foco en dialog) |
| 2b | Cierre con ✕ / Escape / clic en scrim | ✓ (los tres verificados uno a uno) |
| 2c | KPIs iniciales EXACTOS 20/5/1/4/10 (D6) | ✓ (leídos del DOM justo tras cargar: Completo 5 · Crítico 1 · Pendiente 4 · No iniciado 10 · Total 20) |
| 2d | Países Bajos y España muestran MESAS coherentes | ✓ (PB: mesa 001 COMPLETO; España: mesa 001; «Sin detalle» ya no aparece) |
| 2e | Skeletons en primera carga | ✓ (`aria-busy` + placeholders antes de los 400 ms) |
| 2f | KPI card clic → filtra; clic de nuevo → desfiltra | ✓ (COMPLETO: 5 filas ⇄ 20+subtabla; `aria-pressed` alterna) |
| 2g | REINSPECCIONAR: spinner ~2.5 s → alerta desaparece → notificación → badge | ✓ («Procesando…» + disabled; mesa 001 de Italia → COMPLETO sin alerta; badge 4 → 5; toast «Rescaneo completado en Mesa 001 (Italia — 02 - Roma)»; la mesa 004 conserva SU Rescaneo — correcto por fila) |
| 2h | NOTIFICAR | ✓ (toast exacto del kit; badge 5 → 6; mesa sin cambio) |
| 2i | Notificaciones: no-leídas, marcar leída, marcar todas, badge dinámico | ✓ (6 → 5 → 0; badge desaparece en 0; botón se deshabilita) |
| 2j | Anomalías: 5 abiertas, marcar revisada actualiza badge | ✓ (badge 5 → 4; filtro Todas = 7 con 2 revisadas de histórico) |
| 2k | Informes: preview Global y por puesto; descarga .md/.csv | ✓ (20 filas Global; España 1 mesa; toasts «Descargado informe-e14-global-2026-10-20.md» y `.csv`) |
| 2l | Ticker corriendo + transición en vivo | ✓ («Sincronizado hace 35s»; tras ~45 s España completó, luego Inglaterra: KPIs 5/1/4 → 7/1/2 EN VIVO; KPIs iniciales intactos tras recargar) |
| 3 | Responsive 375px | ✓ (overlay + scrim; targets de menú ≥44px; panel 256px; 0 scroll horizontal de página) |
| 4 | Export estático `NEXT_PUBLIC_BASE_PATH=/supervision-e14` + preview subpath | ✓ (dashboard renderiza con assets `/supervision-e14/_next/`; sidebar oculta; overlay abre; vista Informes genera y descarga .md con toast; KPIs 20/5/1/4/10 exactos) |
| 5 | Checklist en el PR | ✓ (este mismo cuadro resumido en el body) |

## 3. Decisiones relevantes (detalle en docs/DECISIONS.md)

- **D11** vistas por estado del shell (no rutas — export estático trivial); `page.tsx` mínimo sin Suspense (carga client-side).
- **D12** repositorio async + mutaciones (contrato adelantado para el digitalizador; latencias 400 ms / 2.5 s).
- **D13** reglas de derivación (mesa por partes; pcts por partes ok; puesto → COMPLETO solo si todas sus mesas) + ticker 5s/45s con preferencia por transición que completa puesto; D6 protegido.
- **D14** sidebar overlay por decisión del dueño (máxima área de tabla).
- **D15** informes client-side con Blob (sin backend).
- **D16** ajustes honestos de pcts para que cuadren con las mesas (España 50/50, Inglaterra 0/100, México 50/38, Argentina 75/50, Italia 56/25) + semillas + estado de lectura solo-UI sin localStorage.

## 4. Desviaciones y notas honestas

- **Ninguna de fondo.** Tres notas:
  1. Los pcts del mockup eran decorativos; con mesas reales debían ser derivables (kit T2) — los ajustes están numerados en D16 y son visibles en la tabla.
  2. Italia muestra 8 mesas (3 EXACTAS del mockup + 5 generadas coherentes con CRÍTICO): el kit exige cantidad EXACTA = `numeroMesas` (8) Y no tocar las 3 originales — ambas condiciones se cumplen.
  3. La transición del ticker prefiere la mesa EN_PROCESO cuyo puesto COMPLETA (para que los KPIs se muevan en vivo, como pide el §4.2); si no hay candidata que complete, aplica la primera EN_PROCESO. Documentado en D13.
- Sin libs nuevas (todo con React, lucide-react y shadcn existente); sin localStorage; sin rutas; sin cambios en next.config/.github/public.

## 5. NOTA DE CONTINUIDAD DE SESIÓN

- **Clon de trabajo:** `/home/z/supervision-e14` (rama `feat/vida-v1`, base `main` @ `9b6825a`).
- **Kit:** `/home/z/my-project/upload/INSTRUCCIONES-sup-e14-vida-v1.md` (Task ID SUP-3).
- **Token:** lo entrega el dueño en el chat («Agente 3»); **el dueño debe REVOCARLO al cerrar la sesión** (quedó expuesto en el chat).
- **Worklog de sesión del agente:** `/home/z/my-project/worklog.md` (máquina del agente).
- **Pendiente del dueño:** revisar el PR draft, probar la demo (el ticker mueve KPIs cada ~45 s) y mergear si aprueba.
- **Si la sesión se reinicia:** re-clonar, `git checkout feat/vida-v1`, leer este REPORTE + `docs/DECISIONS.md` (D11-D16); el PR ya estará abierto y esta continuidad vive dentro del repo.
