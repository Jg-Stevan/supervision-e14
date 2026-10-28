# Worklog — supervision-e14 (port del módulo masiva desde digielect14)

---
Task ID: 1
Agent: Z.ai Code (orquestador principal)
Task: Pasar el módulo de carga masiva de https://github.com/Jg-Stevan/digielect14 a https://github.com/Jg-Stevan/supervision-e14, completar la funcionalidad para que se completen mutuamente, y eliminar la basura/experimentos del módulo masiva.

Work Log:
- Clonados ambos repos a /home/z/repos (digielect14 @ 0a72edb, supervision-e14 @ aa72b23).
- Exploración con 2 subagentes Explore: inventario completo del módulo masiva (42 archivos, ~24K líneas), grafo de dependencias (cierre transitivo de 71 archivos calculado con script), contratos de supervision (D22 idEnlace, D24 manifest, D25 validación/cuarentena, SupervisionRepository, placeholder del nav).
- Workspace: /home/z/my-project convertido en clone de supervision-e14 (conservando Caddyfile/dev.log/skills del sandbox).
- Port en bloque del cierre de 71 archivos → src/modules/digitalizador/** (estructura preservada = imports relativos intactos) + assets públicos (~40 MB: RapidOCR, onnxruntime, OpenCV, workers, zxing, divipol.json) + assets de prewarm.
- Reescrituras mecánicas de imports (@/lib/e14 → @/modules/digitalizador/lib/e14, @/assets, ../store → adaptador, package.json path).
- Task 6-a (subagente cirugía): eliminación de experimentos flag-OFF — warp-ingesta (K2), turno-clasificacion/quad-streaming (P4/P5), prescan-qr-rescate (§F.3), ocr-cascada/Tesseract (K3), DRY RUN «solo QR», hand-off P1, prioridad W1, dhash-resize — con sus flags de FlagsApp/whitelistas y bloques del runner/store/prescan/bridge; también politica.ts, dedup.ts y la UI del DRY RUN en MasivaView. Resultado: cero referencias a experimentos (verificado con grep + tsc).
- Adaptador nuevo src/modules/digitalizador/store/store-e14.ts: superficie exacta del kit T3 (online, registrarEnvioMasiva→publicación, contarMotivoNoEnvioActa con mismas claves, abrirActaMasiva/cerrarActaMasiva) + joinDeActa (normalización idEnlace D22: dep 2 · mun 3 · zona 3 · puesto 2 dígitos).
- Integración supervision: data/actas-runtime.ts (NUEVO — registro runtime D24/D25 con cuarentena y eventos), mock-repository.ts (overlay runtime en getActaDeMesa + fusionarActaRuntime + registrarCargaMasiva: partes de mesa + KPIs + notificación), supervision-repository.ts (método nuevo), datos-provider.tsx (suscripción → setState + toast), supervision-shell.tsx (VistaId "carga-masiva" + nav activado + prop onVerEnMonitor), acta-viewer-modal.tsx (caption prefiere impresión del runtime).
- MasivaView.tsx: modal de revisión propio (foto procesada + grid de datos + píldora de publicación + VER EN MONITOR), props seam, import del adaptador.
- Config: package.json (+7 deps del motor), next.config.ts (reactStrictMode false + allowedDevOrigins), tsconfig (excluye carpetas del sandbox), eslint.config.mjs (reglas del repo origen + ignores del vendor).
- Verificación: bunx tsc --noEmit → 0 errores; eslint → 0 errores/0 warnings.
- Verificación end-to-end con agent-browser (dev server :3000): monitor OK (949 puestos, invariante KPIs); vista Carga masiva activa; upload de acta-e14-real.jpg → SONDEO QR 1/1 → PREPARADA → PROCESAR COLA → pipeline OCR completo → "88 - PORTUGAL - SABADO LISBOA - CONSULADO - TRANSMISION - MESA 003 - PAG 1/2", score 10.0, ENVIADA AUTO, QR ✓; traza "acta publicada 88_680_005_86::003"; KPIs del monitor se movieron en vivo (COMPLETO 232→235+); mesa 003 a 13% TRANSM con notificación CARGA MASIVA; visor con ACTA REAL + encabezado impreso verbatim; modal de revisión con VER EN MONITOR → aterriza en el visor. Cero errores de consola/runtime.
- Commits en main: 4feaf89 (feat, D27) + docs REPORTE-carga-masiva-supervision-v1.md. Artefactos para el usuario en /home/z/my-project/download/: supervision-e14-carga-masiva.bundle + 0001/0002 patches.

Stage Summary:
- El módulo masiva vive en src/modules/digitalizador/** (limpio, sin experimentos) y la vista está ACTIVA en el nav del dashboard.
- La completación mutua funciona end-to-end: clasificación AUTO → idEnlace (D22) → validación D25 → actas-runtime → monitor en vivo → visor con foto real → VER EN MONITOR.
- Punto de costura documentado: adaptador store-e14 (kit T3, 5 puntos) + seam por props (onVerEnMonitor); decisiones en docs/DECISIONS.md D27; REPORTE en docs/REPORTE-carga-masiva-supervision-v1.md.
- Límites honestos: publicación en memoria de sesión (export estático, D8); ledger remoto D1 sin endpoint (fail-soft); solo se publican actas AUTO; build de Pages no verificado en este entorno (solo dev + tsc + lint).

---
Task ID: 2
Agent: Z.ai Code (orquestador principal)
Task: Agregar un módulo de RECEPCIÓN para saber las actas que van llegando (sobre la base D27 del port del módulo masiva).

Work Log:
- Explorado el estado actual (post-Task 1): supervision-shell (nav/vistas), datos-provider (suscripción actas-runtime), actas-runtime (embudo de publicaciones D24/D25), mock-repository (registrarCargaMasiva), store-e14 (sin-join), actas-reales (loader estático SUP-6), vistas de referencia (anomalias/notificaciones), KpiCard, filtros-bar y tokens del tema.
- NUEVO src/modules/supervision/data/recepcion-log.ts (kit recepcion-actas-v1, D28): log runtime en memoria de sesión (D8), grano PÁGINA (1 foto = 1 entrada — el grano del pipeline masiva), 3 desenlaces = los del kit D27 (PUBLICADA / BLOQUEADA con motivo D25 / SIN_JOIN), suscripción por oyentes (sin libs), y asegurarSemilla() perezosa 1-vez que siembra el ancla estático SUP-6 como "ingesta-inicial" con desfases fijos (§0-7, nada aleatorio).
- Enganches de escritura en punto ÚNICO: actas-runtime.publicarActaMasiva registra PUBLICADA/BLOQUEADA (los 3 early-returns de validación a/b/d incluidos) y store-e14.publicarDesdeActa registra SIN_JOIN (ese desenlace nunca llega a publicar). Sin ciclos de import (recepcion-log no importa actas-runtime).
- NUEVO src/modules/supervision/components/vista-recepcion.tsx: header EN VIVO (dot pulsante + última llegada), 4 KpiCards clickeables como filtro de desenlace (gesto del monitor T3), chips de formulario (Todos/TRANSMISIÓN/CÓNSUL-EMBAJADOR), búsqueda (idEnlace/mesa/país/lugar/archivo), log con encabezado desktop + filas (miniatura real, hora exacta + relativa, píldora de estado, destino idEnlace·mesa + lugar impreso, formulario PÁG n/N + SCORE, VER EN MONITOR solo en PUBLICADAS), alto tope 60vh con scroll fino, empty states, skeleton de primera carga (cero lecturas en render SSR).
- supervision-shell.tsx: vista "recepcion" en VistaId, ítem nav con Inbox + badge dinámico "recepcion" (cuenta llegadas carga-masiva fuera de la vista; se anula al abrir; la semilla no cuenta), routing en VistaActual con seam onVerEnMonitor (mismo patrón D27).
- globals.css: utilidades .scroll-panel (scrollbar fina webkit/Firefox) y @keyframes recepcion-llegada + .fila-llegada (destello 1.6 s).
- store-e14.ts: sin-join ahora también deja entrada en el log (idEnlace/mesa "—", formulario null, motivo honesto) antes de marcar sin-join.
- Docs: DECISIONS.md D28 + docs/REPORTE-recepcion-actas-v1.md.
- Verificación: bunx tsc --noEmit → 0 errores; bun run lint → 0/0. E2E agent-browser (dev :3000): vista abre con semilla (4 páginas del ancla); filtros TRANSMISIÓN (2 filas) y búsqueda "egipto" (4) / "zzz" (empty state); VER EN MONITOR de semilla → visor con ACTA REAL El Cairo; carga masiva REAL (acta-e14-real.jpg) → SONDEO QR 1/1 → PROCESAR COLA → OCR completo → ENVIADA AUTO → publicación "88_680_005_86::003 (pág 1)" → badge del sidebar contó la llegada en vivo ("RECEPCIÓN DE ACTAS 1") → al abrir la vista: fila nueva al tope (PORTUGAL - SABADO LISBOA - CONSULADO, TRANSMISIÓN PÁG 1/2, SCORE 10.0, foto real, "Hace instantes") y KPIs 5/5/0/0 → VER EN MONITOR aterriza en el visor con el acta real de Portugal; móvil 390px OK (KPIs 2 col, filas apiladas); dev.log sin errores (solo telemetría preexistente del watchdog sondeo-qr).
- Commit en main: 896670f. Artefactos en /home/z/my-project/download/: supervision-e14-recepcion.bundle + 0001-feat-recepcion-*.patch.

Stage Summary:
- La vista RECEPCIÓN DE ACTAS está ACTIVA en el nav (badge en vivo) y muestra TODO lo que llega: ingesta inicial (semilla del ancla) + publicaciones en vivo del masiva, con desenlace honesto (publicada/cuarentena D25/sin join).
- Puntos de costura: recepcion-log es el único log (actas-runtime y store-e14 escriben ahí); la vista consume por suscripción; VER EN MONITOR reutiliza el seam por props D27.
- Límites honestos: memoria de sesión (D8 — recargar restablece; el histórico durable sigue siendo el IDB del masiva); SIN_JOIN no aterriza en el monitor (no hay join confiable); filas BLOQUEADA/SIN_JOIN no mueven KPIs del monitor (comportamiento D27 intacto).

---
Task ID: 3
Agent: Z.ai Code (orquestador principal)
Task: Verificación final de estado (Task 1 masiva + Task 2 recepción ya completados) — detectado y resuelto el ruido recurrente de POST /api/e14/envios 404 (ledger remoto sin receptor en este repo).

Work Log:
- Estado heredado verificado: Task 1 (port masiva, commit 4feaf89) y Task 2 (recepción, commit 896670f) completados; dev server :3000 sano (GET / 200).
- dev.log mostraba POST /api/e14/envios 404 recurrentes: el cliente del ledger remoto (ledger-remoto.ts, WAVE3 §A.3, portado con el masiva) apunta a una route que SOLO existe en digielect14 (D1 vía OpenNext).
- Descartado implementar la route en supervision-e14: el repo es export estático a GitHub Pages (output: "export", D8) — una route handler no existiría en el deploy y rompería el build de Pages.
- Gate de punto ÚNICO en ledger-remoto.ts (D29): LEDGER_REMOTO_ACTIVO = false → consultarEnvioRemoto→null (contrato «ledger indisponible»), registrarEnvioRemoto→no-op (ya era fire-and-forget), vaciarLedgerRemoto→{ok:false,LEDGER_AUSENTE_E14}. Cero cambios en runner.ts/store.ts.
- Verificación: tsc 0 errores; lint 0/0; E2E agent-browser con 2 corridas nuevas (acta-sim-intermedia.jpg → ALEMANIA Frankfurt MESA 012; acta-sim-baja.jpg → EGIPTO El Cairo MESA 001): ENVIADA AUTO ×3 en cola (incluida la fila histórica PORTUGAL MESA 003), QR ✓, 100%, COLA COMPLETADA; conteo de envios en dev.log 16→16 (cero nuevos 404); cero errores de consola; badge RECEPCIÓN DE ACTAS contó la llegada post-reload y la vista mostró la fila PUBLICADA (88_120_015_02 · MESA 012, SCORE 8.5).
- Commit en main: 8e68a8a (fix + DECISIONS.md D29).

Stage Summary:
- Los tres entregables quedan cerrados: masiva portado y limpio (D27), recepción en vivo (D28) y el ledger remoto cortado con honestidad de contrato en el repo estático (D29).
- La completación mutua digielect14↔supervision-e14 queda así: en digielect14 el masiva usa su ledger D1 nativo; en supervision-e14 el masiva alimenta el monitor/recepción y el ledger queda listo para reactivarse con una constante si algún día hay backend.
- Límite honesto: los 404 históricos ya presentes en dev.log son de sesiones previas al gate (no se borran logs).

---
Task ID: 4
Agent: Z.ai Code (orquestador principal)
Task: Mejorar los tiempos de procesamiento del módulo masiva (pedido directo del dueño) + preparar los cambios para subir.

Work Log:
- Exploración (subagente Explore, very thorough): mapa completo del pipeline con presupuestos — OCR domina (12.5-22.6 s de ~21 s), 3-4 pasadas QR redundantes por fila (sondeo→prescan→capa-0 sin compartir resultados), ~5-6 decodes del mismo blob, master a 4032, frío OCR ~27 s tras kill, cola serial con pool 2 + prefetch.
- Línea base medida con protocolo reproducible (reset IDB → reload → 2 actas sim-extra → click → poll 1 s): wall 15.7 s; pipeline total= 6498+5763 ms; sondeo leyó ambos QR (429-653 ms tier=full) pero prescan y capa-0 re-decodificaban todo.
- KIT e14-qr-heredado-v1 (D30) implementado — 5 ediciones: campo FilaMasiva.qrPrevio (tipos.ts, aditivo al final), estampa del sondeo en cadenaDedup (store.ts), estampa del prescan en aplicarVeredictoPrescan-registrar + skip por fila + early-exit del boot OpenCV cuando TODAS traen payload (prescan-qr.ts), herencia en la capa 0 del runner con traza hereda-payload (runner.ts). Fallback byte-idéntico cuando qrPrevio está ausente (flags OFF/abort/recarga).
- Descartado por conservador (documentado en D30): dhash con decode reducido (rompe hashes históricos), tocar la mini-sonda de orientación (regresión de las 12 RECHAZADAS), master 4032 (calidad), doble write persistMs (telemetría D61).
- Verificación: tsc 0 errores; lint 0/0; E2E agent-browser back-to-back mismo protocolo: wall 15.7 s → 12.8 s (−18 %), trazas «boot omitido» + «hereda-payload ×2», pipeline total= estable (6421+5341 — control OCR intacto), resultados idénticos (clasificación AUTO MESA 001/012, ENVIADA AUTO, QR ✓ 100%), RECEPCIÓN DE ACTAS contó las 2 llegadas, dev.log sin errores, cero POST al ledger (D29 intacto).
- Commit en main + artefactos renovados en download/ (bundle + patches) para que el dueño los suba a GitHub.

Stage Summary:
- El masiva procesa más rápido SIN tocar el camino OCR ni las doctrinas de dedup: el payload QR (llave EXACTA de siempre) se lee UNA vez en la capa más temprana disponible y viaja a la identidad por qrPrevio.
- Presupuesto honesto: −18 % wall en lote pequeño limpio del sandbox; el ahorro crece por fila con fotos grandes/dispositivos lentos y alega el peor caso QR-duro (~15-17 s) cuando el sondeo ya leyó.
- Lo que domina los tiempos sigue siendo el OCR (rec ~3 s/fila) — siguiente palanca real si el dueño quiere más: calidad/resolución del rec y orientación, ambos con riesgo de calidad (decisión del dueño).

---
Task ID: 5
Agent: Z.ai Code (orquestador principal)
Task: D31 — optimizar y ordenar el proceso de masiva según el pedido literal del dueño: «solo dejando procesar un acta (no dos como está actualmente) y que en paralelo se vayan leyendo los qr de los otros archivos para detectar duplicados».

Work Log:
- Mapeado el pipeline post-D30: pool 2 workers (e71) + prescan e107 BLOQUEANTE antes de iniciar() + sondeo e73 en ingesta (D30 qrPrevio). El OCR es wasm mono-hilo — dos OCR paralelos se reparten el mismo CPU sin ganancia (cabecera runner.ts).
- Cambio 1 (flags.ts): FLAGS_DEFAULT.poolWorkers 2 → 1 — UNA acta a la vez en el carril pesado; override manual del dueño (poolWorkers: 2) restaura e71; whitelist politica.ts intacta. Comentarios actualizados en obs/tipos.ts y bloque e71 del runner.
- Cambio 2 (prescan-qr.ts): prescanYIniciar reordenado — iniciar() PRIMERO (Fase 3), carril QR EN PARALELO (Fases 1+2) con pre-chequeo anti-carrera nuevo (re-lectura del store: fila fuera de PENDIENTE ⇒ skip). Abort honesto reescrito («el runner ya corre»). Header/contrato §0 documentados.
- Seguridad de la carrera: todo preexistente (WAVE2 B1 re-chequeo post-reserva, anti-zombi §G, hereda-payload D30) — cero blindaje nuevo; ver D31 en DECISIONS.md.
- Verificación: bunx tsc --noEmit → 0 errores; bun run lint → 0/0.
- E2E agent-browser corrida A (realista, sondeo ON, 2 actas): boot omitido (D30), arranque inmediato, pool=1 visible (nunca 2 PROCESANDO simultáneos), pipeline total= 6401+5889 ms (estable vs D30), hereda-payload ×2, ENVIADA AUTO ×2, recepción contó las 2 llegadas.
- E2E corrida B (carril bajo carga: override sondeoQrPrecoz=false + copia renombrada): runner y lector arrancan mismo tick (PREPARANDO LECTOR… + fila PROCESANDO a 151 ms); el prescan leyó el QR de la fila 2 EN PARALELO con el OCR de la fila 1 → «capa0-qr hereda-payload (sondeo/prescan — sin re-decode)»; duplicado por bytes copiado en 19 ms (cero OCR); pipeline 6776+6011 ms; ENVIADAS 2 + DUPLICADA 1; recepción 6/6/0/0; dev.log 0 errores, 0 POST ledger (D29 intacto).
- Docs: DECISIONS.md D31 + artefactos para el dueño renovados en download/.
- Commit en main.

Stage Summary:
- El masiva queda ordenado como pidió el dueño: UNA acta paga OCR completa a la vez (CPU completo, UI fluida) y en paralelo el carril QR va leyendo el resto del lote — las gemelas/ya-enviadas se marcan ANTES de que el pool las alcance (jamás pagan OCR) y el arranque de la corrida ya no espera el prescan.
- Los hallazgos del carril quedan demostrados con trazas: hereda-payload en plena corrida (cero re-decode) y reutilización de duplicado en 19 ms.
- Límite honesto: en este sandbox (tier BAJO) el plan gama ya forzaba pool 1 — el default D31 gobierna en los equipos ALTO/MEDIO del dueño; el ahorro del carril escala con lotes grandes y QR-duros (los que el sondeo no leyó en ingesta).

---
Task ID: 6
Agent: Z.ai Code (orquestador principal)
Task: Tanda del dueño 2026-10-28 — (a) RECUPERACIÓN del proyecto tras reinicio de sandbox; (b) BOTÓN «REINICIAR ENVÍOS» (prerrequisito de las mediciones); (c) métricas por acta + informe en Carga Masiva; (d) auditoría de reglas de negocio; (e) optimización de recursos (miniaturas y más).

Contexto de recuperación (leer PRIMERO si la sesión muere):
- El reinicio de sandbox restauró /home/z/my-project al template Z.ai: borró el clon supervision-e14 y el worklog interno. Este worklog (COMMITTEADO al repo) es la única memoria durable → actualizar SIEMPRE aquí.
- El trabajo «D32 gama-baja + dedup» de la sesión 2026-10-27 quedó COMMITTEADO SOLO LOCAL y NUNCA pushed → PERDIDO (fc9318f no existe en origin). Pérdida real: badge «GAMA BAJO · ADAPTADO» y pulido fino. NO crítico: D30/D31 (optimizaciones grandes) SÍ están; gama.ts/dedup.ts/runner-dedup.ts llegaron con D27 y siguen intactos. Lección: push SIEMPRE al cerrar cada tarea.
- Patrón de arranque persistente del dev server (el sandbox mata el árbol de cada llamada Bash — probado empíricamente):
  `bash -c 'cd /home/z/my-project/supervision-e14 && setsid nohup bun run dev > /home/z/my-project/repo-dev.log 2>&1 < /dev/null &'`
- Verificación de recuperación: HTTP 200 en :3000, título «Sistema de Monitoreo Electoral E-14», monitor renderiza (captura tool-results/recovery-01-home.png en /home/z/my-project — NO committear).

Plan de la tanda (estado):
- (b) BOTÓN REINICIAR ENVÍOS → docs/DECISIONS.md D33. Causa raíz del «ya enviada»: el ledger e65b (historico.ts, IDB e14-masiva-historico-v1) sobrevive a vaciar() POR DISEÑO (D-e65b-1, RL-e65b-5: «la cola es el taller; el envío es el hecho») — el dueño lo confirma funcionando pero necesita re-probar el MISMO lote para medir. Implementación: acción nueva reiniciarEnvios() en store.ts (vaciarCola + borrarHistorico + limpiar mapaQrPayload + índices de sesión a null) + botón de 2 toques en la barra de acciones de MasivaView (mismo patrón VACIAR→¿SEGURO?, desarme a 3 s, disabled si corriendo).
- (c) métricas por acta/etapa + informe UI → siguiente (usar obs/ existente).
- (d) auditoría reglas de negocio → después de (c), con datos reales de las mediciones.
- (e) recursos/miniaturas → al final.

Task ID: 6 (cont.) — RESULTADO
- (b) BOTÓN REINICIAR ENVÍOS: COMPLETADO y verificado E2E (ver D33 en docs/DECISIONS.md). 3 ediciones: historico.ts (resetearIndicePayload), store.ts (reiniciarEnvios), MasivaView.tsx (botón 2 toques). Prueba: YA-ENVIADA reproducida → reinicio → ledger 0 → mismo archivo nace PENDIENTE → pipeline completo (score 8.5). Commit + PUSH (lección D32).
- NOTA: badge «GAMA BAJO · ADAPTADO» SÍ existe (chip D74 en MasivaView) — la pérdida real del D32 no-pushed era menor a lo estimado.
- SIGUIENTE (c): métricas por acta/etapa + informe en Carga Masiva — usar obs/ existente; con el reset ya se puede re-pasar el lote real del dueño para medir.

Task ID: 6 (cont.) — ESTADO DEL PUSH
- El sandbox NO tiene credenciales de GitHub (git push → «could not read Username»). El commit 7c1c22e (D33) está LOCAL en main.
- Artefactos para el dueño (convención download/, gitignoreado): download/supervision-e14-d33.bundle (bundle completo de main) + download/patches-d33/0001-*.patch (patch único).
- El dueño aplica con: `git fetch /ruta/supervision-e14-d33.bundle main:main` o `git am 0001-*.patch` — y PUSHEA desde su máquina. LECCIÓN D32 reincidente: sin push, el siguiente reinicio de sandbox vuelve a comerse el trabajo.

---
Task ID: 7
Agent: Z.ai Code (orquestador principal)
Task: (c) MÉTRICAS por acta individual + INFORME de comportamiento en Carga Masiva — el dueño quiere saber cuánto tarda cada acta, en qué etapa tarda, y tener datos reales para diagnosticar fallos. D33 ya pushed a origin/main (7c1c22e) con token del dueño — riesgo D32 neutralizado.

Plan (leer si la sesión muere):
1. Explorar observabilidad existente (obs/, tipos.ts FilaMasiva, runner.ts traces «pipeline total=», sondeoQrMs) — NO duplicar lo que ya mide.
2. Módulo metricas.ts en masiva/: registro por acta {id, archivo, etapas: {sondeoQr, cola, prescan, ocr, clasificacion, envio}, wall, desenlace, score} + agregados de corrida {inicio, fin, total, porEtapa, fallos}. Persistir en IDB NUEVA (e14-masiva-metricas-v1) — sobrevive recargas (prevención del dueño).
3. UI «INFORME» en MasivaView: panel con duración total de corrida, desglose por etapa (barras), top actas más lentas, fallos con motivo. Botón EXPORTAR (JSON descargable) para que el dueño lo archive.
4. E2E agent-browser con lote real del dueño (o actas sintéticas) — validar números contra traces del logger.
5. D34 en DECISIONS.md + commit + PUSH inmediato.

Task ID: 7 — RESULTADO
- (c) MÉTRICAS + INFORME: COMPLETADO y verificado E2E (ver D34 en docs/DECISIONS.md). metricas.ts (IDB e14-masiva-metricas-v1 + 4 hooks fire-and-forget en runner) + InformeCorrida.tsx (panel: KPIs, barras por etapa, actas más lentas con cuello, fallos, historial de corridas, export JSON, limpiar). Dato real del sandbox: OCR = 98% del trabajo pipeline (2.0s de 2.1s) — la palanca sigue siendo el OCR.
- Contrato verificado: REINICIAR ENVÍOS (D33) NO toca las métricas (IDBs separadas) → el dueño compara corridas antes/después del reset.
- Commit + PUSH inmediato (lección D32/D33).

---
Task ID: 8
Agent: Z.ai Code (orquestador principal)
Task: Tanda del dueño 2026-10-28 (ronda 2) — (e) optimización de recursos empezando por miniaturas + UX-1 del REPORTE digielect14 + cierre del P0. Prevención de contexto: este worklog + DECISIONS.md + push inmediato.

Plan (leer si la sesión muere):
1. Cruzar REPORTE-que-esta-bien-y-que-falta.md (línea digielect14, base 3f1cc17 + PRs #104/#105 — VERIFICADO: ese commit/PRs NO existen en este repo) contra este código antes de implementar nada.
2. (e) miniaturas: medir primero (thumbMs en métricas D34), decidir después.
3. UX-1: motivo real de lectura en archivos.ts (NotReadableError vs PasswordException vs corrupción).
4. P0 del reporte (watchdog OCR): verificar si ya existe aquí (D65) antes de duplicar.
5. (d) auditoría de reglas de negocio: SIGUIENTE — con datos del INFORME + JSON exportable.
6. Commit + PUSH por cada tarea cerrada (lección D32).

Task ID: 8 — RESULTADO (D35)
- UX-1: archivos.ts PDF/ZIP/RAR distinguen ARCHIVO_ILEGIBLE (lectura de disco) / PDF_PROTEGIDO (PasswordException) / PROTEGIDO_O_CORRUPTO (corrupción — intacto). E2E: PDF cifrado → fila ERROR «PDF_PROTEGIDO» en ingesta.
- thumbMs: etapa nueva en metricas.ts (no compite por cuello, línea propia en INFORME «+ THUMBS DE BANDEJA»). VEREDICTO MEDIDO: 3 ms/acta vs OCR 2.0 s (666×) → las miniaturas NO se quitan (costo ruido, valor bandeja). Palanca manual: flags.thumbsOn:false. Cuello real de recursos: persistencia whole-record (P2, decisión del dueño).
- P0 reporte: YA EXISTE aquí (D65 runner-watchdog: carrera 75s por gama + matarYRecrearWorkers). Sin duplicación. Opcional pendiente: telemetría de hangs de esa línea.
- Verificación: tsc 0 · lint 0/0 · E2E agent-browser (REINICIAR ENVÍOS → lote acta+pdf-protegido → PDF_PROTEGIDO + COMPLETADA 6.4 s + INFORME con «+ THUMBS: 3 ms en 1 acta(s)» + EXPORTAR OK) · 0 errores consola.
- SIGUIENTE: (d) auditoría de reglas de negocio con datos del INFORME (BUG-5 AUTO-sin-QR del reporte, orden de capas dedup, presupuesto del sondeo con hard-kills bajo hambruna).

---
Task ID: 8 (cont.) — D36 AUDITORÍA DE REGLAS + CORTOCIRCUITO SONDEO
- R1 AUTO-sin-QR confirmado (gate = OPTIMA/score≥8; QR no bloquea) — decisión del dueño documentada en DECISIONS.md, recomendación: mantener.
- R2 CB del sondeo implementado (flags.sondeoQrCortocircuito, default true): ≥3 kills/min → pausa 30 s self-healing. Flag plumbing probado EN VIVO (override 500 ms → aborts a ~500 ms). Disparo real no reproducible en sandbox (sondeos máx 833 ms vs kill 1500/3500) — se arma con la señal real del dueño.
- R3 capas dedup en orden correcto VERIFICADO EN VIVO (dup byte-exacto vetadas pre-sondeo). R4 dhash ya fuera en gama BAJO (D74). R5 watchdog/rescate/relectura acotados (D65 existe — P0 del reporte no aplica). R6 cuello = OCR 98%; palancas restantes: precalor (ya) + persistencia whole-record (P2, decisión del dueño).
- Estrés E2E: 58 archivos (únicas/dup/12MP) + recarga + cráter del navegador → cola restauró 48/58 (prevención de reinicios OK), runner re-armado, 0 errores de app. tsc 0 · lint 0/0.

---
Task ID: 9
Agent: Z.ai Code (orquestador principal)
Task: El dueño entrega tokens (GitHub + Cloudflare) y pide «ayudame a subirlo» — subir el
commit pendiente dd3e6db (perfil-recursos-v1) y desplegar a Cloudflare Pages (D37).

Plan (leer si la sesión muere):
1. Build de verificación ANTES de push (el commit dd3e6db se hizo sin build — encontrar
   errores de TS si los hay, corregir, documentar).
2. public/_headers (COOP/COEP) → hilos WASM reales en Cloudflare (la palanca OCR del D34) — decisión documentada como D37 (su D36 ya existía en origin: auditoría).
3. Deploy wrangler → proyecto supervision-e14 → verificación E2E contra producción.
4. Commit + PUSH INMEDIATO (lección D32) + secrets de GitHub para CI/CD.

Task ID: 9 — RESULTADO
- Build inicial FALLÓ: 2 errores TS del kit perfil-recursos-v1 (panel-perfil.tsx DPR guard
  sin estrechar; clasificador.ts `saveData !== true` muerta por estrechamiento §4.4).
  Corregidos — lógica intacta, solo tipos/guards.
- public/_headers: COOP same-origin + COEP require-corp en /*. Sitio 100 % same-origin
  (grep: sin CDNs ni iframes) → require-corp seguro. Next lo copia a out/ automáticamente.
- Cloudflare Pages: proyecto `supervision-e14` creado (account d6515fed) y DEPLOYADO →
  **https://supervision-e14.pages.dev** (79 archivos, _headers reconocido).
- Verificación PRODUCCIÓN (agent-browser): título OK · crossOriginIsolated=true /
  SharedArrayBuffer OK · Perfil del dispositivo completo con las 5 capacidades del runtime
  en VERDE (la nota «Hilos WASM inactivos» ya NO aparece) · chip GAMA BAJO · TABLET ·
  assets críticos 200 (onnx OCR, zxing wasm, _next) · responsive 375 px OK · 0 errores.
- CI/CD: .github/workflows/cloudflare-pages.yml (push main → build sin basePath →
  wrangler pages deploy) + secrets CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID en GitHub.
- GitHub Pages (pages.yml) intacto y conviviendo — basePath /supervision-e14 solo ahí.
- Detalle completo en docs/DECISIONS.md D37.

---
Task ID: 10
Agent: Z.ai Code (orquestador principal)
Task: El dueño pregunta si Cloudflare Pages se sincroniza con main y pide autonomía plena
en recursos («aprovecharlos al máximo») → D38 KIT e14-recursos-autonomos-v1.

Task ID: 10 — RESULTADO
- Sincronización CONFIRMADA con corridas (cloudflare-pages.yml push→deploy; la failure
  histórica fue la corrida previa a los secrets). GitHub Pages también sigue en verde.
- D38 en gama.ts: AMPLIFICACIÓN ALTO (pool 2 solo con hilos WASM reales — D37) +
  GOBERNADOR REACTIVO (reportarPresionGama en matarYRecrearWorkers; ≥2 kills/3min ⇒
  presupuestos un escalón abajo 3 min, self-healing; BAJO suelo; tier real intacto) +
  tarjeta AUTONOMÍA en panel-perfil (AUTO/MANUAL, tier real→efectivo, pool/hilos efectivos,
  ajustes, aviso reactivo, precedencia D6). Panel importa gama/flags (leerFlags desde
  flags.ts — fix de export en build).
- Verificación: build 0 · lint 0/0 · download/verifica-d38.ts 7/7 · E2E tarjeta AUTO en
  sandbox (BAJO: pool 1, OCR 2 hilos, warp 1920) · 0 errores consola.
- Commit + PUSH (auto-deploy a Cloudflare Pages activo).

---
Task ID: 11
Agent: Z.ai Code (orquestador principal)
Task: Dos ajustes del Monitor Global pedidos por el dueño: (1) filtro por DÍA de la
semana electoral (semana antes de la segunda vuelta, elecciones domingo 21 de
junio de 2026) para no mezclar puestos de días distintos, y (2) quitar el botón
NOTIFICAR («en el momento no se está utilizando»).

Task ID: 11 — RESULTADO (KIT monitor-jornada-v1)
- Hallazgo clave: el catálogo DIVIPOLA exterior YA trae el día EN el nombre del
  puesto («LUNES ACCRA…», «SABADO LISBOA…») — 116 puestos por día lun-sáb y 253
  puestos base SIN prefijo = jornada de cierre del domingo (2.181 mesas vs 1.489
  lun-sáb: números EXACTOS del README del vault «Mesas y volumen electoral 2026»).
  El filtro es 100% data-driven, nada inventado.
- NUEVO domain/jornada.ts: DiaJornada (LUNES…DOMINGO), DIAS_JORNADA con el
  calendario real de la 2ª vuelta 2026 (lun 15 → dom 21 de junio, domingo marcado
  esCierre), diaDeNombrePuesto() (prefijo → día; base sin prefijo → DOMINGO;
  «Santo Domingo» jamás cuenta como prefijo) y diaCalendario().
- domain/types.ts: Puesto.diaJornada (derivado del catálogo) y
  FiltrosPuestos.fecha: DiaJornada (era un select mock de una sola opción
  «Domingo, 14 Jun»).
- mock-repository.ts: puestoDeRegistro deriva diaJornada del nombre real;
  coincide() aplica el filtro por fecha (contrato del repo coherente).
- filtros-bar.tsx: el select FECHA deja de ser mock — lista los 7 días de la
  semana electoral con conteo real de puestos por día («Lunes 15 de junio (116)»,
  «Domingo 21 de junio — cierre (253)») + opción «Fecha: todos los días».
- monitor-global.tsx: el día seleccionado filtra la matriz Y los KPIs
  (puestosDelDia + resumenDelDia con la MISMA regla resumenDePuestos del store,
  ahora exportada); los demás filtros siguen afectando solo la matriz.
- Retiro NOTIFICAR: mesas-subtable.tsx solo pinta el botón de acción cuando
  accionSugerida === "reinspeccionar" (columna Acción = REINSPECCIONAR o VER
  ACTA); onNotificar sale de MesasSubtable/PuestosTable/VistaMonitor;
  datos-provider pierde la acción notificar; mock-repository y
  supervision-repository pierden notificarMesa. El dominio AccionMesa queda
  intacto (dato, no UI) — reactivar el botón cuando exista el canal real.
- Verificación: tsc 0 · eslint 0/0 · E2E agent-browser (:3000): KPIs 949
  (232/44/199/474, invariante exacta); dropdown con 116×6 + 253; LUNES → 116
  puestos (38/5/20/53) todos con prefijo LUNES; DOMINGO → 253 (63/5/63/122) con
  ancla Roma accesible; «todos los días» → 949; cero «NOTIFICAR» en el DOM;
  REINSPECCIONAR e2e (spinner → rescaneo resuelto → mesa COMPLETO → toast);
  móvil 375px OK; vista anomalías OK (provider compartido); 0 errores consola.
- Artefactos para el dueño en /home/z/my-project/download/:
  supervision-e14-monitor-jornada-v1.bundle + patches 0001/0002 + capturas.

---
Task ID: 12
Agent: Z.ai Code (orquestador principal)
Task: Mejorar los visores de documentos (zoom con rueda del mouse y pellizco táctil) y habilitar edición (recorte/rotar) de actas NO enviadas automáticamente en el módulo masiva.

Work Log:
- NUEVO supervision/components/actas/visor-zoom.tsx (KIT visor-gestos-v1): primitivo compartido de visor con ZOOM REAL — rueda del mouse anclada al cursor (listener nativo passive:false, deltaMode normalizado, trackpad-pinch ctrlKey con coeficiente mayor), pellizco de 2 dedos anclado al punto medio (Pointer Events + setPointerCapture fail-safe), arrastre para desplazar (1 puntero), doble clic/toque (ajustar ↔ 2.2×), ajuste inicial contain automático (ResizeObserver + re-fit por rotación y fitKey), límites de offset (nada de vacíos) y API imperativa (acercar/alejar/ajustar/fijarZoom) + onZoomChange (espejo del % para la toolbar).
- acta-viewer-modal.tsx: el canvas vive en VisorZoom (fuera la caja de scroll y su math de zoom); toolbar opera por ref; % de zoom real visible; botón AJUSTAR nuevo (Scan); límites compartidos [0.3, 4] con acta-toolbar.tsx (LIMITE_ZOOM actualizado). Rotación/contraste/pantalla completa intactos.
- acta-toolbar.tsx: separador + botón "Ajustar a la pantalla" + % tabular; etiquetas de los botones de zoom documentan los gestos («también con la rueda del mouse o pellizco»).
- MasivaView.tsx — ModalRevisor (KIT editor-masiva-v1): foto vive en VisorZoom (hint flotante «ZOOM: RUEDA O PELLIZCO · MOVER: ARRASTRA · DOBLE TOQUE: AJUSTAR», canvas h-[44vh]/sm:h-[52vh], modal max-w-3xl). Actas SIN envío automático ganan barra EDITAR FOTO: ROTAR (90° horneo por canvas vía rotateProcessedDataUrl) y RECORTAR (modo propio: foto estática + overlay pointer-events para arrastrar el rect en % + exterior atenuado por box-shadow + APLICAR hornea recortarDataUrl NUEVO en image-utils.ts); chip EDITADA + DESHACER (restaura la foto pre-edición de la sesión). Enviadas AUTO: mismo visor mejorado, sin editor (pedido del dueño).
- store-e14.ts: acción editarActaActual(patch) — parche inmutable de actaActual sin tocar id; la persistencia ya existía (sincronizarAlVolver re-persiste en IDB + thumb fresco + fila al cerrar el modal).
- Fix proactivo: setPointerCapture bajo try/catch en visor-zoom y en el overlay de recorte (pointerIds sintéticos/automation lanzan NotFoundError y abortaban el gesto — visto en dev.log durante la verificación).
- Verificación E2E agent-browser (:3000): visor del dashboard — ajuste inicial 34%, rueda ±(34→129→34%), botones (34→53%), arrastre con clamp (x centrado, y +50px), pinza 3× (34→103%), doble toque vuelve al ajuste; masiva — acta real subida y procesada ENVIADA AUTO (visor mejorado sin editor + zoom legible del acta), acta dañada (drop sintético del 55% superior) → RECHAZADA BAJO 4.9 (no enviada) → editor visible: ROTAR hornea 90° (chip EDITADA + DESHACER), RECORTAR dibuja y aplica (foto recortada), DESHACER restaura, ciclo editar→cerrar→reabrir conserva la edición (IDB round-trip); móvil 390px — visor dashboard (toolbar 2 filas, pinza 30→83%) y modal masiva con editor OK. lint 0/0 · tsc 0.
- Commits en main: feat(visores) + docs(worklog Task 12).

Stage Summary:
- Ambos visores (dashboard y masiva) comparten el MISMO primitivo VisorZoom: zoom con rueda/pellizco/arrastre/doble toque, ajuste automático y % real en la toolbar.
- El módulo masiva completa el ciclo de revisión: actas no enviadas auto se CORRIGEN (recorte/rotación horneadas + persistencia IDB + thumb en bandeja); las enviadas auto se INSPECCIONAN mejor (zoom legible).
- Límites honestos: DESHACER cubre la sesión de edición actual (tras reabrir, la edición persistida es la fuente de verdad); la edición no re-corre OCR (la clasificación existente se conserva — corregir la foto es para inspección/registro, no re-clasificación).

---
Task ID: 13
Agent: Z.ai Code (orquestador principal)
Task: El dueño pide poner en práctica la estrategia por dispositivo del benchmark OCR
(ronda 1-3, 9 motores, 6 actas E-14, sandbox 2 núcleos/4 GB) y pregunta si el
diagnóstico automático (perfil-dispositivo) basta para repartir motores entre
dispositivos → KIT ocr-router-v1 (PR aditivo).

Task ID: 13 — RESULTADO
- Nuevo módulo PURO src/modules/digitalizador/lib/e14/ocr/router-ocr.ts (KIT
  ocr-router-v1): resuelve el motor OCR por dispositivo con la evidencia medida
  (Tesseract spa-best psm 4 → 94,4 % de dígitos impresos con ~67 MB de RAM ·
  PP-OCRv5 mobile latin ONNX → 100 % de dígitos, 97,6 solo-impreso > VLM cloud
  94,4, inmune a rotación 1,5°, ~487 MB pico · Tesseract fast descartado como
  default (83,3 %) · EasyOCR/docTR no caben en web).
- D6 intacto (mismo espíritu que gama.ts): flag revocable `ocrMotorAdaptativo`
  (default ON; OFF ⇒ Tesseract byte-idéntico), override manual `ocrMotor` manda,
  gobernador reactivo (≥ 2 fallos/OOM de v5 en 3 min ⇒ degradación por sesión,
  patrón reportarPresionGama) y sonda de carga real del ONNX (inferencia 200×60,
  timeout 8 s, castigo 7 días en localStorage — el deviceMemory no garantiza los
  buffers del detector).
- v2 del diagnóstico (3 ajustes medidos en el benchmark): 1) la sonda de CPU
  DECIDE (score < 350 ⇒ Tesseract aunque las señales digan ALTO; ≥ 750 habilita
  v5 — hoy benchmark.ts es «evidencia que no decide»); 2) vía iOS por GPU Apple
  (sin deviceMemory ni performance.memory, la inferencia §4.4 por heap nunca
  aplica en Safari y todo iPhone queda MEDIO para siempre); 3) la red condiciona
  la DESCARGA del modelo (una vez, wifi — sincronizarSoloWifi), no la capacidad
  del motor.
- docs/ESTRATEGIA-ocr-router-v1.md: matriz de decisión por gama (BAJO/MEDIO/ALTO)
  + pipeline perfil → router → worker → reglas e14 (red de seguridad en TODOS los
  tiers) → VLM cloud como verificador de campos ambiguos.
- PR ADITIVO (no wire-in): no toca flags.ts/FlagsApp (contrato §4.2 congelado),
  ocr-escalonado.ts ni workers — la integración del consumidor queda como
  siguiente kit (registrar `ocrMotorAdaptativo` en FlagsApp + resolver motor en
  el arranque del worker OCR).

---
Task ID: 14
Agent: Z.ai Code (orquestador principal)
Task: El dueño aprueba conectar el ROUTER (KIT ocr-router-v1, PR #10) al informe
del diagnóstico — que cada JSON traiga motor + motivo + origen para auditar por
qué cada dispositivo corre lo que corre.

Task ID: 14 — RESULTADO
- FlagsApp (obs/tipos.ts) + FLAGS_DEFAULT/sanearFlags (flags.ts) + whitelist de
  leerOverridesFlags (politica.ts): `ocrMotorAdaptativo` (default true —
  kill-switch único) y `ocrMotor` ("ppocrv5" | "tesseract-best-psm4" | null —
  default null = el router decide). Ambos ADITIVOS AL FINAL (D57) con DOBLE
  whitelist (cada puerta su línea): el kill-switch y el override MANUAL del
  dueño ya son reales vía e14-flags-overrides.
- panel-perfil.tsx: el informe «COPIAR JSON» (diagnosticoJson) trae el campo
  ADITIVO AL FINAL `motorOcr: { motor, motivo, origen, requiereSondaCarga,
  condicionesUpgrade }` resuelto con la cadena COMPLETA del router (flag ←
  override manual ← gobernador ← sonda de carga cacheada ← sonda de CPU ←
  tier). Informes previos no cambian de forma (mismo patrón
  hangResumen/enviosDetalle). Ausente = sin señales aún (honesto, jamás
  inventar).
- Adaptador perfilMinimoDe (PerfilRecursos → PerfilMinimo del router:
  runtime/sync/async a la raíz) + resolverMotorDelDispositivo (jamás lanza;
  se resuelve EN MONTAJE como el resto del bloque autonomía — hydration-safe).
- La tarjeta AUTONOMÍA muestra la fila «Motor OCR» (etiqueta legible + origen,
  tooltip con el motivo) y, si aplican, la fila «Upgrade a v5» con las
  condiciones pendientes del upgrade a PP-OCRv5.
- Verificación: tsc --noEmit → los 9 errores TS2307 de assets son
  PRE-EXISTENTES en main (9 = 9, verificado con stash — archivos que este PR
  no toca); eslint → 0 errores / 0 warnings.
- PENDIENTE (siguiente kit): consumir resolverMotor en el ARRANQUE del worker
  OCR (ocr-escalonado.ts / rapidocr.ts) — hoy el router decide, el informe
  audita y los flags existen, pero el worker aún no cambia de motor.

---
Task ID: 15
Agent: Z.ai Code (orquestador principal)
Task: El dueño aprueba el wire-in completo (que el worker OCR consuma
resolverMotor en su arranque) y comparte A/B real: mismas 6 actas en laptop
MEDIO (2C/4T Skylake) y celular ALTO (Samsung Xclipse 540, 8 núcleos) — cuello
«ocr» en 12/12, scores idénticos 8.6/10/8.5/10/10/10 en ambos, corrida 151.8 s
vs 55.0 s → KIT ocr-router-v1 fase 3: PP-OCRv5 como motor de gama ALTO.

Task ID: 15 — RESULTADO
- Assets: public/models/rapidocr/ + det_v5_mobile.onnx (4.8 MB) +
  rec_v5_latin.onnx (7.9 MB) + latin_dict.txt — los MISMOS archivos que el
  benchmark midió al 100 % de dígitos impresos (validados además con la
  corrida real del dueño vía RapidOCR python).
- rapidocr.ts (motor de producción): initReal() ahora resuelve el set de
  modelos con el router ANTES de crear sesiones — v4 (byte-idéntico) o v5.
  Mapping honesto: «tesseract-best-psm4» del benchmark = el motor base de
  siempre (aquí v4); solo «ppocrv5» cambia modelos. Sesiones extraídas a
  crearSesiones() (los nombres de entrada se leen de inputNames[0] — el swap
  es transparente; el cls v2.0 es común a v4/v5).
- Sonda de carga REAL como gate de v5 (ejecutarSondaCarga del router):
  crear sesiones v5 + inferir «E14 SONDA 1234» en canvas 320×120 (timeout
  8 s) → OK ⇒ v5; fallo ⇒ v4 + castigo 7 días en localStorage. Limpieza de
  sesiones huérfanas si el timeout abandona la sonda (abandonada + soltar).
- Gobernador reactivo: rapidOcrReiniciar() (D65, la llaman el watchdog y el
  recovery) reporta presión si el runtime muerto era v5 (motorModelosActual)
  → 2 fallos/OOM en 3 min ⇒ la próxima init resuelve v4 por el resto de la
  sesión (origen «gobernador-presion» del router).
- Perfil headless del motor (sin React): tier §4.4 de obs/dispositivo (la
  MISMA fuente que gama.ts) + probe WASM SIMD (módulo de bytes fijo) + probe
  GPU renderer — paridad con perfil-dispositivo/senales.ts sin importar el
  kit (el módulo masiva ESPEJA señales, D74). benchmark.score null HONESTO:
  no viaja del provider al motor — la sonda de carga es el gate real.
- Telemetría: logger.info [ocr-router] con motor/modelos/origen/motivo en el
  arranque y en cada evento de sonda/gobernador — auditable en consola.
- El informe de corrida (D34) NO cambia de forma; el informe del diagnóstico
  ya audita el motor desde la fase 2 (motorOcr).
- Verificación: tsc --noEmit → 9 errores TS2307 de assets PRE-EXISTENTES
  (9 = 9 baseline con stash — fuera de alcance); eslint → 0/0.
- Evidencia A/B del dueño (informes D34 19:56 y 20:05): el celular ALTO
  (pool/hilos WASM activos) procesó 6 actas en 55.0 s vs 151.8 s de la laptop
  MEDIO (2.8×), OCR medio 5.5 s vs 6.6 s, sin un solo hard-kill y con scores
  IDÉNTICOS — el pipeline es determinista entre dispositivos y el OCR es el
  cuello 12/12: exactamente lo que ataca esta fase (v5 en ALTO: 100 % vs
  v4; y el A/B confirma que el motor base v4 es sólido en MEDIO/BAJO).
- PENDIENTE (fase 4): tarjeta «Activar OCR de precisión» en el panel
  (escribe el override ocrMotor) + viaje del benchmark.score al motor.

---
Task ID: 16
Agent: Z.ai Code (orquestador principal)
Task: Fase 4 del KIT ocr-router-v1 (aprobada por el dueño tras el análisis de
su A/B real 2026-10-28 — informe-masiva 20:41/20:47): (1) tarjeta «Activar
OCR de precisión» en el panel, (2) informe de corrida D34 auto-identificado
(gama + motorOcr aditivos).

Task ID: 16 — RESULTADO
- Hueco de evidencia cerrado por datos: los dos informes del A/B no traían
  motor ni tier — el análisis mostró la laptop MEDIO como control estable
  (153.0 s vs 151.8 s, OCR 6.82 vs 6.6 s) y el celular ALTO consistente con
  PP-OCRv5 vivo (OCR medio 5.5→4.25 s, −23 %) pero el JSON no podía
  confirmarlo → fase 4: cada informe NUEVO se auto-identifica.
- rapidocr.ts: estado EN VIVO de la resolución (MotorOcrVivo: motor decidió
  el router + modelos REALES cargados + origen + motivo) fijado en
  resolverModeloDeArranque (incluye desenlace de la sonda de carga: decisión
  v5 con modelos v4 queda visible, cero maquillaje; catch ⇒ v4 honesto) +
  getter puro motorOcrActual() (misma fuente que la telemetría [ocr-router]).
- metricas.ts (exportarInformeMetricas): campos ADITIVOS AL FINAL (D57) —
  gama {tier, tierEfectivo} del plan aplicado + motorOcr {motor, modelos,
  origen, motivo}. Informes previos no cambian de forma; ausencia = honesta.
- panel-perfil.tsx: tarjeta «OCR de precisión (PP-OCRv5)» dentro de
  AUTONOMÍA — visible en origen «medio-elegible-upgrade» o con override
  vigente; ACTIVAR escribe el override vía guardarOverridesFlags (puerta
  oficial, DOBLE whitelist de fase 2) y QUITAR OVERRIDE escribe null (el
  whitelist lo descarta ⇒ router recupera la decisión). resolverAuto en
  useCallback re-resuelve montaje + clicks (hydration-safe intacto). La
  sonda de carga real sigue siendo el gate técnico del arranque (el botón
  NO la salta; fallo ⇒ v4 + castigo 7 días).
- docs/ESTRATEGIA-ocr-router-v1.md: sección Fase 4.
- Pendiente honesto (fase 5 si el dueño lo quiere): viaje del
  benchmark.score al perfil headless del motor (hoy null honesto; la sonda
  de carga real es el gate real).
- Verificación: tsc --noEmit → 9 errores TS2307 de assets PRE-EXISTENTES
  (9 = 9 baseline con stash — fuera de alcance); eslint → 0/0.

Task ID: 17 — selector-motor-v1 (fase 5): el dueño elige el modelo OCR
- Pedido con datos (informe 21:26, laptop MEDIO): la tarjeta de fase 4 era
  condicional (medio-elegible-upgrade / override vigente) y el informe real
  vino con origen «tier» + motivo del fallback plano de MEDIO — sin override
  en la init y SIN tarjeta visible: no había forma de probar v5 sin consola.
- panel-perfil.tsx: la tarjeta fase 4 se convierte en SELECTOR de motor
  (radiogroup, todos los tiers): Automático (default, el router decide) /
  Motor base / PP-OCRv5. fijarMotor() escribe el override vía
  guardarOverridesFlags (null = retirar); descripción honesta por opción +
  ADVERTENCIA cuando el dueño fuerza v5 que el router no elegiría (resolución
  SIN override nueva: resolverRecomendacionRouter) + castigo v5 visible con
  LIMPIAR CASTIGO (infoCastigoV5/limpiarCastigoV5 nuevas en router-ocr.ts) +
  APLICAR AHORA (reinicia el motor sin recargar).
- rapidocr.ts: reiniciarMotorOcrSiInactivo() — suelta el singleton SOLO si no
  hay inferencia en vuelo (contador en rapidOcrReconocer via wrapper
  rapidOcrReconocerInterno; probes fuera del conteo: auto-reparables). La
  sonda de carga sube 8 s → 30 s cuando origen=override-manual (el dueño
  pidió esperar; sospecha #1 del «se canceló por mucho tiempo» del A/B).
  El panel importa rapidocr dinámicamente en el click (el módulo pre-calienta
  al importarse — nunca por visitar el perfil).
- D6 íntegro: auto por defecto; la decisión del dueño se respeta (paso 1 de
  la cadena manda sobre gobernador/castigos/tier); la sonda de carga sigue
  siendo el gate técnico (fallo ⇒ v4 honesto, la corrida jamás se tumba).
- Verificación: tsc --noEmit → 9 errores TS2307 de assets PRE-EXISTENTES
  (baseline 9 = 9); eslint → 0/0.
