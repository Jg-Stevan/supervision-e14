# Cierre formal del REPORTE-2026-11-11 (Q-58, plan 2026-11-12 v2)

El `REPORTE-2026-11-11-seguimiento.md` quedó VERIFICADO y su inventario
REEMPLAZADO por el plan `PLAN-EJECUCION-PENDIENTES-2026-11-12-v2-CORREGIDO.md`
(el plan corrige 4 errores del reporte, añade ~25 pendientes que no vio y
ordena todo en olas ejecutables). Esta tabla cierra la trazabilidad: **0 ítems
del reporte sin mapear ni cerrar** (cierre del criterio Q-58 del plan).

Estado de ejecución al 2026-11-12 (rama `plan/ejecucion-2026-11-12` de ambos
repos; entrega empaquetada para revisión — ver `docs/archivo/` para el
histórico).

## Trazabilidad reporte → plan → ejecución

| Item del reporte | ID en el plan | Estado (2026-11-12) | Evidencia |
|---|---|---|---|
| §5.1 scoring (calibración) | P-24 | **PENDIENTE — HUMANO**: exige 20-30 actas reales del mantenedor; la mecánica (D6/D41) queda intocable por diseño | plan §Ola 2 |
| §5.2 dedup del puente | P-22 | **EJECUTADO** (ambos repos): sobre con `qrPayload`+`dhash64`, 3 capas en el embudo, tests E2E del cierre literal | commits `feat(puente)`/`feat(supervision)` — sup y dig |
| §5.3 sidecar auto-apagado | P-21 | **EJECUTADO** (sup): timer siempre vivo, 2 fallos → CAÍDO + banner + desarme runtime; recuperación con sondeo directo | commit `feat(sidecar)` |
| §5.4 monitor 949 filas | P-25 | **EJECUTADO** (sup): ventana de filas medida — 117→25 `<tbody>` (4.170→885 nodos DOM); MEDICIONES.md con números; FPS en gama baja → Q-56 | commit `perf(monitor)` |
| §5.5 motores/red (premisa E4 corregida) | P-23 | **EJECUTADO** (espejo core + sup): red congelada en la regla ALTO; precarga de assets OCR respetando `sincronizarSoloWifi` | commits `feat(gama)`/`feat(core)` |
| §5.6 iOS atrapado en MEDIO | P-26 | **EJECUTADO** (sup): sonda GPU (raster ~120 ms, umbral 750) en la rama inferida + benchmark del panel; matriz en MEDICIONES.md pendiente de campo | commit `feat(gama)` |
| §5.7 D82 notificaciones sin UI | P-28 | **EJECUTADO** (sup): decisión D97 — RENDERIZAR: chip de campana + panel (no leídas primero, marcar leída/todas) | commit `feat(supervision)` |
| §5.8 GitHub Pages | A-01 / A-02 | **A-01/A-02: HUMANO** (DELETE de Pages requiere `gh` autenticado; checklist A-02.1..A-02.8 listo en el plan). Docs ya sincronizadas (H-42) y los DOCS de dig declaran el retiro aprobado | H-42 en ambos repos |
| §5.9 `.git` accidental en home | A-03 | **PENDIENTE — HUMANO** (cuarentena en el PC del mantenedor; regla v2: mover, no borrar) | plan §Ola 0 |
| §5.10 fusión de evidencia (E5) | A-07 / T-11 | **T-11 EJECUTADO** (sup): motor byte-a-byte del PR #158 de dig + flag apagado + D95-sup. **A-07: ratificado por el plan** (recomendación explícita de integrar) | commit `feat(e14)` sup |
| §4 fase 1 (SIMULACIÓN móvil) | D-31 | **EJECUTADO DE VERDAD (v2, C-2)** — la v1 era una afirmación sin evidencia (hallazgo G-2 del plan de cierre: el código seguía dev-only, `flags.ts` default `false` + gate `NODE_ENV`): ahora `loteDemoLocal` default **TRUE**, cerradura `NODE_ENV` retirada del orquestador, decisión **D98-sup** escrita y test que fija el default. dig ya tenía SIM con banner D-36 | commit `feat(demo): cierre C-2…` (D98-sup) |
| §4 fase 2 (Simular recepción panel) | D-32 | **EJECUTADO** (sup): origen `demo` + botón en Recepción + chip DEMO en el visor | commit `feat(demo)` |
| §4 fase 3 (Reiniciar demo) | D-33 | **EJECUTADO** (sup): 2 botones con confirmación 2 toques; purga selectiva SOLO demo (tests lo fijan) | commit `feat(demo)` |
| §4 fase 3 (Hub Worker + R2) | D-34 / A-09 | **PENDIENTE — HUMANO + deploy** (fuente del worker `e14-puente` sin versionar — **D99-sup**; el número D98 lo tomó la decisión del botón DEMO (C-2) y la v1 de este reporte y del INFORME citaban D98 para esta — renumerado en v2; A-09 exige aprobar R2). La pieza local (hub-local.mjs) ya consume las huellas P-22 | plan §Ola 3 |
| §4 fase 4 (COOP/COEP verificados) | D-35 | **EJECUTADO** (ambos repos): `scripts/verificar-cabeceras.mjs` + workflow `cabeceras.yml` (SKIP honesto sin variable) | commits `feat(demo)` |
| §6.1 duplicación | H-44 | **COMPLETADO en v2 (C-6, opción A)** — la v1 era sobre-afirmación (hallazgo G-5: solo se retiró la copia muerta de `src/`; quedaban 2 copias del catálogo): ahora UNA sola copia versionada (`public/e14/divipol.json`), los tests del paquete la consumen por ruta relativa, test guardián fija su md5 (`8d4b0963…`), `divipola-exterior.json` conservada (catálogo exterior distinto), knip configurado/triado en ambos (DEUDA.md §6) | commits `chore(publico): H-44/C-6…` (espejo byte-a-byte) |
| §6.3 arquitectura documentada | H-45 | **PENDIENTE (P2)**: diagrama móvil→hub→panel del README público — sugerido con el diagrama vigente de ARQUITECTURA.md | plan §Ola 4 |
| §6.5 vendor/assets (E3) | (sin tarea) | **RESUELTO POR D85/D87** (verificado por el plan v2) | plan §1.2 |
| §6.6 higiene repo | H-46 | **EJECUTADO** (ambos): `.gitignore` SEC-10 + nota de riesgo CSP `unsafe-eval` en SECURITY.md | commit `chore(publico)` |
| Decisión 5 (datos personales, contradice D35/D86) | A-06 | **PENDIENTE — HUMANO** (decisión única del mantenedor; ADR espejo). La doctrina vigente (D35/D86: ANONIMIZAR) quedó escrita y blindada (H-46) | plan §Ola 0 |
| Decisión 7 (calibrar scoring primero) | regla §4 del plan | **RATIFICADA** — P-24 antes de D-31/P-27 respetado en el orden de ejecución | plan §4 |
| Decisión 8 (dedup) | P-22 | **EJECUTADO** (ver §5.2) | commits espejo |

## Ítems SOLO del plan v2 (no estaban en el reporte) — estado

| ID | Estado |
|---|---|
| A-10 (secret scan global de historia) | **EJECUTADO en v2 (C-4)**: fallback documentado del plan (gitleaks/trufflehog no disponibles) sobre `git rev-list --all` con 11 patrones → **0 hallazgos**; reporte REDACTADO en `docs/archivo/gitleaks-2026-11-12.txt` (ambos repos); triage 0 rotaciones; cobertura de dig anotada (tramo de main anterior a ~2026-11-04 pendiente de re-escaneo junto a C-1); coordinación con A-05 en DEUDA.md |
| T-12 (E3 integridad) | **EJECUTADO** (dig): port byte-a-byte desde sup + test; §11 de PENDIENTES-INTEGRACION cerrada |
| T-13 (2 commits UI de dig) | **CERRADO como no-port documentado** (D96-sup: features del móvil — sup no tiene cámara ni auto-captura) |
| T-14 (ramas fusionadas) | **PENDIENTE — HUMANO** (borrado remoto; el listado exacto está en el informe de ejecución entregado) |
| T-15 (PENDIENTES-INTEGRACION de dig) | **EJECUTADO** (§11 cerrada; §8 noImplicitAny cerrada) |
| T-16 (paridad versionada en sup) | **EJECUTADO**: script SIMÉTRICO byte-a-byte en ambos; baseline 14/20 → 20/20 |
| H-41 | **EJECUTADO** (435→0 sup · 437→0 dig) + **excepciones documentadas en v2 (C-7)**, DEUDA.md §7: topónimos oficiales DIVIPOLA (FONTIDUEÑO…) NO se tocan, `docs/archivo/**` se conserva (histórico), `detection-worker.js` con 3 comentarios muertos upstream (sin pipeline local de regeneración — pendiente upstream) |
| H-42 / H-43 | **EJECUTADO** (docs al día; account IDs y rutas personales saneados; históricos a `docs/archivo/`) |
| H-47 / H-50 | **EJECUTADO** (CHANGELOG 0.6.0 en dig + CHANGELOG nuevo en sup; community files espejados) |
| H-48 (dependabot) | **PENDIENTE — HUMANO** (merge por PR con CI; onnxruntime-web exige re-medición — riesgo 2 del plan) |
| H-49 (hardening GitHub) | **PENDIENTE — HUMANO** (branch protection + secret scanning: settings del repo) |
| H-51 (SW huérfano tras Pages) | **PENDIENTE — HUMANO** (decisión: ventana de redirección o aceptar SW muerto; documentar en DEPLOY.md) |
| Q-51 | **EJECUTADO** (sup): el error documentado en ci.yml YA no existe — comentario actualizado; lint 0 errores |
| Q-52 | **EJECUTADO** (dig): test de ReviewView ACTIVADO (alias `@` + deps + recalibrado al copy vigente — 6/6); `e2e/humo.spec.ts` queda para A-02 |
| Q-53 (trocear bridge 2,5k líneas) | **PENDIENTE (P2)**: refactor por pasos con sub-interfaces — recomendado PR propio |
| Q-54 / Q-56 | Q-54: **TRIADO de verdad en v2 (C-5, dig)** — 16 avisos: 4 corregidos (los 3 de scanner-core espejados byte-a-byte en sup) + 12 deliberados documentados en `docs/QA-TRIAGE-lint.md`; **0 avisos sin decisión** (criterio literal); la v1 lo dejaba sin evidencia. Q-56: **PENDIENTE de campo** (agenda en MEDICIONES.md) |
| Q-55 (acta 084906) | **CONFIRMADO NO-ROJO**: el golden del contrato coteja idéntico en ambos (7e059cf3) — el 6.º rojo del plan era el mapping de fusión, cerrado por T-11/T-12 (20/20) |
| Q-57 | **ABIERTO (corregido en v2)** — la v1 lo marcaba «ESTE DOCUMENTO», una auto-referencia sin evidencia: Q-57 queda **ABIERTO** hasta que (a) Pages esté muerto (A-01/A-02 — HUMANO), (b) la historia esté resuelta (A-05), y (c) el checklist maestro §5 esté completo. Es la última puerta del plan de cierre |
| Q-58 | **EJECUTADO** — esta tabla |
| Q-59 (noImplicitAny raíz dig) | **EJECUTADO**: flag activado — `tsc --noEmit` 0 errores |

## Checklist maestro del plan §5 — estado al cierre

Producto: P-21 ✅ · P-22 ✅ · P-23 ✅ · P-24 ⏸ (HUMANO) · P-25 ✅ · P-26 ✅ ·
P-27 ⏸ (tras P-24) · P-28 ✅
Demo: D-31 ✅ (de verdad, v2 C-2) · D-32 ✅ · D-33 ✅ · D-34 ⏸ (A-09/**D99**) · D-35 ✅ · D-36 ✅ ·
D-37 ⏸ (tras D-34)
Gemelos: fusión ✅ · paridad **20/20** ✅ · T-16 ✅ · T-14 ⏸ (HUMANO) ·
H-48 ⏸ (HUMANO) · Q-51/Q-52/Q-59 ✅
Seguridad/público: Pages (docs listos, código sin dependencia de Pages — v2 C-3; DELETE ⏸ HUMANO) · A-03 ⏸ · A-04 ⏸ ·
A-10 ✅ (v2 C-4: 0 hallazgos, reporte redactado) · A-05/A-06 ⏸ (HUMANO) · H-49 ⏸ · H-41 ✅ (con excepciones v2 C-7) · H-42/H-43 ✅ · H-50 ✅ ·
H-51 ⏸ · H-44 ✅ (completado v2 C-6) · H-45 ⏸ (P2) · H-47 ✅ · Q-58 ✅

(`✅` ejecutado y verificado · `⏸` requiere paso humano externo o dependerá de
la decisión registrada — cada uno tiene su criterio de cierre en el plan.)

---

## Correcciones v2 — plan de cierre 2026-11-12 (C-8)

Producto de la revisión externa del paquete v1 (hallazgos G-1..G-6 del
`PLAN-CIERRE-EJECUCION-2026-11-12-v1.md`) y de la ejecución del cierre:

| Fila corregida | Antes (v1) | Ahora (v2) | Evidencia |
|---|---|---|---|
| D-31 | «EJECUTADO» sin evidencia (código dev-only) | Ejecutado DE VERDAD | `flags.ts` default TRUE, sin `NODE_ENV`, D98-sup, tests |
| D-34 (número) | citaba **D98** para versionar la fuente del worker | **D99-sup** (D98 lo tomó el botón DEMO) | este archivo + INFORME v2 |
| H-44 | «EJECUTADO» — sobre-afirmación (quedaban 2 copias del catálogo) | Opción A completada | 1 copia servida + guardián md5 + knip (DEUDA.md §6) |
| A-10 | «PENDIENTE — HUMANO» | EJECUTADO (fallback documentado) | 0 hallazgos; `docs/archivo/gitleaks-2026-11-12.txt` |
| Q-54 | «avisos con decisión anotada» sin evidencia | Triage real: 4 corregidos + 12 deliberados | `dig:docs/QA-TRIAGE-lint.md` |
| H-41 | «435→0» sin excepciones | Excepciones listadas y justificadas | DEUDA.md §7 |
| Q-57 | «ESTE DOCUMENTO» (auto-referencia) | **ABIERTO** (última puerta del plan) | criterio literal del plan de cierre |

Bundles (C-1): el de sup se regeneró y verificó con el protocolo completo
(clone + fsck + rev-list). El de digielect14 **sigue imposible de regenerar
desde el paquete**: falta el objeto ancestro `a3a3d960…` (G-1) — la
regeneración exige partir del clon íntegro del mantenedor (comandos exactos en
la NOTA-BUNDLE-C-1 del paquete v2). Ninguna afirmación de este reporte queda
sin evidencia en código o artefacto.
