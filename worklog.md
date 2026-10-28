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
