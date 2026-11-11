/**
 * Contratos del módulo obs (KIT e14-observabilidad-v1).
 *
 * La BASE del evento (TipoEvento … ErroresAgrupados) vive en el paquete y se
 * re-exporta — una sola definición para las dos apps (FASE D3). Aquí solo los
 * tipos de PRODUCTO que divergen por diseño.
 */
import type {
  ErroresAgrupados,
  PoliticaDatos,
  SaludSnapshot,
  UsoContador,
} from "@jg-stevan/scanner-core/obs-base/tipos";

export type {
  Breadcrumb,
  ErrorEvento,
  ErroresAgrupados,
  EventoObs,
  HangEvento,
  PerfActa,
  PoliticaDatos,
  SaludSnapshot,
  Tier,
  TipoEvento,
  UsoContador,
} from "@jg-stevan/scanner-core/obs-base/tipos";

export interface FlagsApp {
  poolWorkers: 1 | 2; // default 1 (D31 — carril QR paralelo; e71 fue 2)
  thumbsOn: boolean; // default true
  ocrThreadsTope: number; // default 4
  telemetriaSalud: boolean; // default true
  endpointReportes: string | null; // default null — sin backend, D1
  colaPersistente: boolean; // default true (cola-persistente-v1) — la masiva SOLO muere con vaciar() del dueño; false = MODO PRUEBAS e64p
  // ─── KIT e73-sondeo-qr-precoz-v1 (§D) — campos ADITIVOS AL FINAL (D57) ───
  sondeoQrPrecoz: boolean; // default true — sondeo QR en INGESTA (worker e73); false = kill-switch (byte-idéntico a 043b2ba)
  sondeoQrPresupuestoMs: number; // default 2500 — presupuesto del reló del ladder del worker (jamás extender — kit §I)
  // ─── D35/D36 — cortocircuito del sondeo bajo hambruna (campo ADITIVO AL FINAL, D57) ───
  sondeoQrCortocircuito: boolean; // default true — ≥3 hard-kills/min (la señal hambruna YA medida) → sondeo PAUSA 30 s: cada kill = terminate+respawn+re-boot wasm que compite con el OCR; pausar es MENOS trabajo (§I compatible); la dedup sigue in-pool (capa0/dhash/payload); false = comportamiento de siempre byte-idéntico
  // ─── KIT e14-obs-hang-atribucion-v1 (§D) — campo ADITIVO AL FINAL (D57) ───
  hangEnCurso: boolean; // default true — sensor hang-en-curso (worker heartbeat + WAL); false = byte-idéntico a b688fbc
  // ─── KIT e107-prescan-qr-cola-v1 (§D.4) — campo ADITIVO AL FINAL (D57) ───
  prescanQrCola: boolean; // default true — pre-scan QR en «PROCESAR COLA» (quad+warp → BarcodeDetector/jsQR); false = byte-idéntico a 3f1cc17
  // ─── KIT e14-orientacion-qr-v1 (§D) — campo ADITIVO AL FINAL (D57) ───
  qrBrujulaOrientacion: boolean; // default true — QR-brújula de orientación (cuadrante del QR manda + rescate hi-res ZXing; bench v8.3 4/4); false = sondeo OCR de siempre byte a byte
  // ─── KIT flujo-dueno-v1 (K2 — brief Agente B) — campo ADITIVO AL FINAL (D57) ───
  masivaSondeoCrudo: boolean; // default TRUE = camino de hoy — el sondeo QR crudo de la cadenaDedup (e73) alimenta el dedup temprano; false = SOLO para la corrida de control del dueño (el guard fuerza sondeo=null, la fila sigue a dhash COMO HOY)
  // ─── KIT e14-prescan-warp-lado-v1 — campos ADITIVOS AL FINAL (D57) ───
  prescanQrPresupuestoMs: number; // default 4000 — presupuesto del hard-kill del pre-scan (PRESUPUESTO_FILA_MS); válvula del dueño para equipos lentos (clamp 1000..30000)
  prescanWarpLado: number; // default 4032 — maxWarpLongSide de la SALIDA del warp del pre-scan (el worker ya aceptaba msg.maxWarpLongSide sin consumidor); 1920 recorta ~4.5x el coste del warpPerspective y la QR se lee igual (el core lee QR a 1280/1920); clamp 256..4032
  // ─── KIT e14-gama-adaptativa-v1 — campo ADITIVO AL FINAL (D57) ───
  masivaAdaptativoGama: boolean; // default true — capa adaptativa de GAMA para masiva+OCR: el tier detectado (obs/dispositivo §4.4) aplica SOLO presupuestos de recursos (pool/threads/warp/watchdog/master/QR/dhash — tabla en gama.ts) en BAJO/MEDIO; el override MANUAL del dueño manda clave a clave (D6) y false = byte-idéntico a hoy en TODOS los dispositivos (D74)
  // ─── KIT e14-capa0-qr-worker-v1 (D40) — campo ADITIVO AL FINAL (D57) ───
  capa0QrWorker: boolean; // default true — la CAPA 0 QR (decode+ladder+barridos jsQR) corre en WORKER dedicado (capa0-qr.worker.js) y el hilo UI deja de comerse los ~15-17 s SYNC del peor caso sin QR; el tier zxing queda en main como rescate único (cobertura EXACTA); false = camino de hoy byte-idéntico (cadena completa en main)
  // ─── Decisión del dueño 2026-11-11 — cascada OCR por defecto (D57) ───
  ocrCascada: boolean; // default true — Tesseract fast (spa 4.0.0_fast) → GATE de producción → RapidOCR PP-OCRv4 escalonado 1280→1920→ROI. false = el escalonado RapidOCR de siempre byte a byte (kill-switch del dueño); SIM nunca corre la cascada
  // ─── KIT e75-qr-zoom-zbar-v1 — campo ADITIVO AL FINAL (D57) ───
  qrZoomTl: boolean; // default true — tier ZOOM TL re-escalado + zbar-wasm en la capa 0 (lab 12 imágenes: 3 páginas del escáner rescatadas con píxeles nativos del QR + 2 que SOLO zbar vio); false = cadena de hoy byte-idéntica (kill-switch del dueño)
  // ─── R1.2 — KIT qr-cache-negativa-v1 — campo ADITIVO AL FINAL (D57) ───
  qrCacheNegativa: boolean; // default true — la capa 0 que terminó null SIN presupuesto vencido se recuerda por SHA-256 de los bytes (session Map + registro.qrSinPayload): las siguientes corridas del MISMO archivo saltan el ladder (2-3 ms); "PROCESAR IGUAL" jamás consulta ni escribe; false = byte-idéntico a hoy (kill-switch del dueño)
  // ─── KIT auto-envio-umbral-v1 (REPORTE-perfil-medio-rendimiento-v1 — objetivo
  // del dueño: «la mayoría de actas se envían automáticamente si son elegibles
  // y el OCR las reconoce») — campo ADITIVO AL FINAL ───
  autoEnvioUmbral: "optima" | "advertencia"; // default "optima" — solo OPTIMA (score ≥ 8) se autoenvía (comportamiento de siempre). "advertencia" = el auto-envío se EXTIENDE a ADVERTENCIA (6.5-7.9) cuando la clasificación es AUTO (ruta divipol completa ≥ 0.82 + mesa + tipo — el mismo requisito del join del monitor, publicarDesdeActa lo vuelve a exigir): la maquinaria de vetos (H1 ledger + remoto + dedup) corre IDÉNTICA. Las ADVERTENCIA sin AUTO siguen a revisión manual
  // ─── KIT e14-ocr-nativo-v1 — campo ADITIVO AL FINAL (D57) ───
  ocrNativoUrl: string | null; // default null = OFF (WASM de siempre, byte-idéntico). URL del SIDE CAR nativo (p. ej. http://127.0.0.1:8765) — si /salud responde, el det+rec del acta corre en CPU nativa (onnxruntime, 4 hilos) en vez de WASM; cualquier fallo (red, timeout, JSON raro) cae al motor de siempre SIN tocar score/gate/dedup/auto-envío. Solo 127.0.0.1/localhost (validator de la tabla) — jamás un remoto configurable
  // ─── KIT e14-ocr-nativo-v1 (FASE 2) — campo ADITIVO AL FINAL (D57) ───
  actaNativa: boolean; // default false. true + sidecar vivo = el ACTA COMPLETA (quad, warp, b/n, sondeo de orientación y OCR) corre en el sidecar en UNA sola ida: el JS conserva calidad, esquinas, completitud, score, gate, dedup y envío. El prefetched del runner masiva alimenta ADEMÁS la capa 0 (el payload del QR que el sidecar lee del warp), así que el ladder jsQR de 8-22 s no se paga. Sidecar mudo o fallo → pipeline JS de siempre, byte-idéntico
  // ─── KIT ocr-ep-webgpu-v1 — campo ADITIVO AL FINAL (D57) ───
  ocrEp: "auto" | "wasm" | "webgpu"; // default "auto" — dónde se multiplica el OCR (los MISMOS modelos ONNX, jamás otro motor): "auto" = WebGPU si el navegador expone un adapter NO fallback (GPU real) y si no, wasm; "wasm" = el camino de siempre byte-idéntico (kill-switch del dueño, cero bytes nuevos); "webgpu" = FORZAR el intento GPU aunque no haya adapter (si el intento falla, initReal vuelve solo al wasm de siempre). Medido 2026-11-03 en HD Graphics 520: det 4,8× · rec_v5 7,4×
  // ─── KIT e14-qr-previo-rapido-v1 — campo ADITIVO AL FINAL (D57) ───
  qrPrevioRapido: boolean; // default true — PASE BARATO (jsQR base + recorte TL zxing + ZOOM TL, ~1-2 s) ANTES de pagar el worker de la capa 0 y su rescate zxing en main. Lee el MISMO payload que leería la escalera; si no lee nada, la cadena de hoy corre INTACTA (aditiva, jamás recorta cobertura). false = capa 0 byte-idéntica a hoy (bench gpu5b: 10-19 s por acta)
  // ─── KIT e14-probe-mini768-v1 — campo ADITIVO AL FINAL (D57) ───
  probeMiniLado: number; // default 320 (hoy, byte-idéntico) — lado mayor (px) de la MINIATURA del sondeo de orientación. El FALLO SEGURO no cambia: la mini manda SOLO con evidencia fuerte (corte sana/confirmada, o rotación aplicada con ≥2 anclas y conf ≥0.6); si no, corre el sondeo a resolución original de siempre. Subirla reduce el «sub-lee» de la mini ⇒ la MISMA evidencia se alcanza más a menudo y se salta el probe completo (4-5 s/acta medidos en gpu7). 320 = hoy · tope 1280.
  // ─── KIT qr-postprevio-corta-v1 — campo ADITIVO AL FINAL (D57) ───
  qrCapa0PostPrevioCorta: boolean; // default true (MEJORA) — cuando el pase barato de la capa 0 (qrPrevioRapido) YA corrió y no leyó nada, la cadena de main se queda en el SALTO DE RESOLUCIÓN que el previo no cubrió (ladder jsQR base + recorte TL a 2048) y OMITE los tiers que el previo ya pagó en esfuerzo equivalente (barridos jsQR de nitidez/binarizada, barrido zxing full-frame, rotaciones, rescate 4096). Medido en gpu12: la acta SIN QR pagaba 4,9 s de previo + 10,0 s de cadena larga = 15,7 s para declarar null, y el presupuesto de gama no la cortaba porque esos tiers no consultan el reló. Con el flag ON la cadena NO se declara completa ⇒ la caché negativa (R1.2) no registra. false = cadena de hoy byte-idéntica.
  // ─── KIT ocr-sin-cls-v1 — campo ADITIVO AL FINAL (D57) ───
  ocrCls: boolean; // default true (hoy, byte-idéntico) — correr el clasificador de 180° POR LÍNEA de RapidOCR (rt.cls). La orientación de PÁGINA la deciden el quad del worker y el probe de rotación antes de llegar al rec; el cls solo voltea líneas sueltas dentro de una página ya derecha (caso nulo en un formulario E-14). Cuesta 1,2-1,9 s por acta (bench gpu12, WebGPU) y compila el pipeline cls en la sonda de arranque (~3 s más). false = se omite el run (la sesión se sigue creando).
  // ─── KIT ocr-cola-global-v1 — campo ADITIVO AL FINAL (D57) ───
  ocrColaGlobal: boolean; // default false (hoy, byte-idéntico) — UN solo cliente a la vez de las sesiones ORT (det/cls/rec del reconocer, det del probe y lote de rec del probe). Con poolWorkers=2 dos actas llaman al MISMO singleton y sus session.run() se solapan: el lote queda COLGADO después de un `det run OK` y la `celda` nunca aparece (benches gpu8 sin GPU y gpu13 con WebGPU, 2026-11-03). Serializar el EP (un solo device, nada se pierde) libera al otro acta para lo que sí es CPU — warp, decode y QR — que es el solapamiento que el pool 2 busca. true = con cola.
  // ─── KIT e14-proceso-lado-v1 — campo ADITIVO AL FINAL (D57) ───
  procesoLadoMayor: number; // default 1920 — lado mayor del lienzo de SALIDA del warp+enhance del lote (processImage opts.maxLongSide del core). Con cap < 4032 el JPEG se decodifica YA redimensionado (DCT, sin materializar los 12 MP) y la homografía + el modelo de sombras/Bradley/despeckle corren sobre ese lienzo: el costo es ∝ píxeles de salida y ESE es el ítem CPU más pesado del lote (procesoBwMs 34,5 s de 144,7 s de muro en gpu18, ~5,8 s por acta). El quad son fracciones 0-1 ⇒ la geometría no cambia. Curva medida en el lote demo (pool 2, perfil caliente, sonda YA fuera del muro): 4032 → 91,8 s · 2048 → 77,8 s · 1920 → 58,8-62,3 s · 1600 → 74,3 s (se aplana: no paga más). Los seis desenlaces y los seis scores de 1920 son IDÉNTICOS a los de 4032 y el blob guardado se revisó a ojo: recorte, sombras fuera y letra leíble. Rango sanado [1024, 4032].
}

export interface ReporteSesion {
  meta: {
    appVersion: string;
    generado: string; // ISO
    deviceId: string;
    sesion: string;
    politica: PoliticaDatos;
    // ─── KIT e14-obs-hang-atribucion-v1 (§F) — AL FINAL (D57): el gate del
    // ─── sampler (dispositivo.ts condicionesOk) espejado — saludMuestras
    // ─── pasa de misterio a explicado DESDE el artefacto.
    modoDev: boolean;
    telemetriaSalud: boolean;
  };
  dispositivo: SaludSnapshot & { os: string; ua: string };
  erroresAgrupados: ErroresAgrupados[];
  perfResumen: {
    actas: number;
    p50OcrMs: number | null;
    p95OcrMs: number | null;
    fallosGate: number;
    memoriaPicoMB: number | null;
    /** §G.3 — ORDEN-WAVE3-add-envio-individual-v1 (aditivos AL FINAL —
     *  precedente hangResumen): telemetría del ENVÍO. envios = diagnósticos
     *  con envioMs presente (0 ms es válido hoy — registro local BASELINE;
     *  con §A/ledger D1 el mismo campo captura latencia de red real). */
    envios: number;
    p50EnvioMs: number | null;
    p95EnvioMs: number | null;
  };
  /** §G.3 — una fila por diagnóstico con envioMs != null (aditivo OPCIONAL
   *  al final — informes previos no cambian de forma). PRIVACIDAD dura
   *  (qa-obs-privacidad): actaIdHash = fnv1a8 del id (JAMÁS el id plano) ·
   *  SIN título/mesa/puesto/payload — solo números y la red del momento. */
  enviosDetalle?: EnvioDetalle[];
  saludMuestras: SaludSnapshot[];
  uso: UsoContador[];
  /** ANEXO Agente C (Pieza 2) — agregación de hangs de la sesión (ADITIVA,
   *  opcional: informes previos no cambian de forma). fuente: eventos "hang"
   *  del buffer filtrados por esta sesión — resumenHangsDe (hang.ts, PURO). */
  hangResumen?: {
    cuenta: number;
    mayorMs: number | null;
    totalMs: number | null;
    /** §G.4 — hangs OCULTOS (document.hidden — timers congelados por el SO:
     *  NO son congelones). cuenta/mayor/total quedan SOLO-VISIBLES desde
     *  wave3; los ocultos van aquí (aditivo AL FINAL — el patrón del
     *  informe 1230 — 117 s fantasma — queda imposible). */
    cuentaOcultas: number;
  };
  /** KIT e14-obs-hang-atribucion-v1 (§B) — distribución de los hangs por la
   *  última operación registrada (D58): una fila por `op` (null = legacy/sin
   *  marca), orden cuenta desc → op asc (JSON estable). Aditivo AL FINAL del
   *  reporte (informes previos no cambian de forma). Correlación, NO prueba
   *  de causalidad (§A — el sesgo viaja en opEdadMs). */
  hangPorOp?: HangPorOp[];
}

/** KIT e14-obs-hang-atribucion-v1 (§B) — fila de hangPorOp (tipado del
 *  agregado PURO hangsPorOp de hang.ts). */
export interface HangPorOp {
  op: string | null;
  cuenta: number;
  totalMs: number;
  mayorMs: number;
}

/** §G.3 — fila de enviosDetalle (una por diagnóstico con envioMs != null).
 *  PRIVACIDAD: actaIdHash (fnv1a8 — JAMÁS el id plano), sin título/mesa/
 *  puesto/payload (qa-obs-privacidad manda). modo = canal del diagnóstico
 *  al export ("individual" = actaActual — una acta abierta desde la bandeja
 *  a REVISIÓN cuenta individual; "masiva" = cola). */
export interface EnvioDetalle {
  actaIdHash: string; // fnv1a8(actaId) — 8 hex (JAMÁS el id plano)
  modo: "individual" | "masiva";
  status: string; // ActaStatus del desenlace (string — informe JSON estable)
  ocrMs: number | null;
  totalMs: number | null;
  envioMs: number; // != null por construcción (solo filas con envío medido)
  envioRedTipo: string | null;
  envioDownlinkMbps: number | null;
}
