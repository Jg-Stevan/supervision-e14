/** KIT e14-carga-masiva-v1: tipos del módulo MASIVA — cola de fotos que
 *  alimenta al bridge REAL (mismo pipeline §5, mismo gate). Sin duplicación:
 *  aquí SOLO vive la orquestación. */
import type { Acta } from "../types";
// KIT e14-quad-streaming-v1 (P4): forma canónica del quad del core — SOLO
// tipo (se borra en compile: cero dependencia runtime desde los tipos).
import type { Quad } from "@jg-stevan/scanner-core/types";

/** KIT e14-masiva-tiempos-v1 (PR-1): DUPLICADA = gemela por hash perceptual
 *  (dhash Hamming ≤ 6, dedup.ts) — estado SOLO visual: al procesar REUTILIZA
 *  el resultado de la original (runner) sin correr el pipeline. «PROCESAR
 *  IGUAL» la devuelve a PENDIENTE (reproceso completo — kit §2). */
export type EstadoEntrada = "PENDIENTE" | "PROCESANDO" | "LISTA" | "ERROR" | "DUPLICADA"
  | "YA-ENVIADA"; // e65-dedup-enviadas-v1 — SOLO-VISUAL (D-e65-2): sin acta propia, sin envío, sin runner (valor NUEVO AL FINAL — contrato D57)

/** Fila LIVIANA en memoria (lo que pinta la bandeja) — NUNCA trae la foto:
 *  RAM acotada (lección L7). El acta completa duerme en IndexedDB. */
export interface FilaMasiva {
  id: string;
  nombre: string;
  agregadaEn: number;
  estado: EstadoEntrada;
  /** Presente cuando estado === "LISTA". */
  statusActa?: Acta["status"];
  score?: number;
  nivel?: string | null; // clasificacion?.nivel
  pagina?: string | null; // "1/2" · "-/-"
  /** Copy corto del motivo de rechazo (acta.rechazo?.tipo). */
  motivo?: string | null;
  thumb?: string; // dataURL JPEG ≤320px, ~20-40 KB
  enviadaAuto?: boolean; // ÓPTIMA → envío automático del runner
  /** KIT e14-masiva-ux-v1 (T3): el envío quedó «EN COLA» (offline —
   *  acta.hashSha256 === "EN COLA"); se drena al reactivar conexión. */
  envioEnCola?: boolean;
  error?: string | null; // estado ERROR (decode/IDB/pipeline)
  /** KIT e14-masiva-tiempos-v1 (PR-1): hash perceptual dhash 64-bit (hex 16,
   *  dedup.ts) calculado al ENCOLAR en background — null si falló el decode. */
  hashDedup?: string | null;
  /** KIT e14-masiva-tiempos-v1 (PR-1): id de la fila ORIGINAL cuando la fila
   *  está DUPLICADA (Hamming ≤ 6) — el runner copia SU resultado. */
  dupOf?: string | null;
  /** D59 — KIT e14-info-acta-filas-v1 (T1): título compuesto con la info
   *  reconocida del acta (idea del dueño, mockup Stitch corregido).
   *  string|null: null = sin datos → la fila solo pinta el nombre de archivo
   *  (honestidad, jamás inventar). */
  infoTitulo?: string | null;
  /** D66 — KIT e14-decode-unico-precalor-v1 (T3.2/T3.5): flag TRANSITORIO
   *  del precalor — esta fila PENDIENTE ya tiene master (blob JPEG a escala
   *  de trabajo) esperando en el mapa del precalor. SOLO memoria del
   *  mini-store: NUNCA viaja a IDB (al recargar se pierde y el precalor
   *  vuelve a precalentar si aplica — kit T3.2 literal). El chip PREPARADA
   *  de la bandeja lo pinta; consumirMaestro/descartarMaestro lo limpian. */
  precalentada?: boolean;
  /** D63-A2 — KIT e14-d63a2-deskew-pipeline-v1 (T1): la fila nació de la
   *  extracción de un PDF (D60 — página renderizada a JPEG). Campo aditivo:
   *  SOLO nace en la rama PDF del store (fotos/WhatsApp/ZIP jamás lo traen
   *  — prueba de lectura en el REPORTE del kit). Persiste en IDB (T1) para
   *  que el override de origen sobreviva la recarga a mitad de corrida. */
  viaPdf?: boolean;
  /** e63f — KIT e63f-autoenvio-v1 (F2): el desenlace pasó por la RE-LECTURA
   *  INTERNA pre-«repetir-primero» (1 pasada OCR extra sobre el MISMO bitmap
   *  — intento de LECTURA, NO de captura). true = corrió (auto | sin-cambio,
   *  el detalle en la traza ` RelecturaInterna=`); ausente = no aplicó. */
  relectura?: boolean;
  // ---------- e63k — KIT e63k-capa2-identidad-v1 (F1) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** Serie impresa 15 dígitos (consenso del código 1D — clasificacion.
   *  codigoUnico.crudo, capa 2 identidad.ts). null/ausente = sin lectura
   *  consensuada (jamás inventar — RED LINE 2). Sirve al mapa de identidad
   *  de la cola y al informe. */
  serie?: string | null;
  /** El dueño pulsó PROCESAR IGUAL: capas 1 (visual) y 2 (identidad) lo
   *  respetan — jamás marcar esta fila de nuevo. Persistente (IDB).
   *  Ausente = sin override (comportamiento de siempre). */
  forzarDedupOff?: boolean;
  // ---------- e64-qr-v1 — KIT PLAN-e64-qr (T-0.2) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** KIT e64-qr-v1 (T-0.2): estado de la CAPA 0 QR — SOLO-VISUAL (la decisión
   *  de dedup sigue siendo la igualdad EXACTA del payload, red line 10).
   *  "n/d" = aún sin intentar (fila en cola) · "leido" = payload EXACTO obtenido
   *  · "sin-payload" = la cadena terminó en null. */
  qrEstado?: "n/d" | "leido" | "sin-payload";
  // ---------- e65-dedup-enviadas-v1 — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** e65-dedup-enviadas-v1: SHA-256 de los bytes del archivo (dedup.ts,
   *  hashBytesDeArchivo) — estampado en cadenaDedup. null = falló el hash
   *  (conservador). Sobrevive la recarga vía RegistroMasiva. SOLO llave de
   *  dedup — jamás identidad del acta ni viaja al envío (RL-e65-1). */
  hashBytes?: string | null;
  /** e65-dedup-enviadas-v1: id del registro YA ENVIADO cuyo contenido matcheó
   *  esta fila (bytes exactos o dhash cinta cierta). SOLO-VISUAL (chip).
   *  Ausente/null = match contra fila viva NO enviada → DUPLICADA de siempre. */
  enviadaDe?: string | null;
  // ---------- KIT e73-sondeo-qr-precoz-v1 (§E) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** (§E) telemetría del sondeo QR en ingesta — espejo de RegistroMasiva
   *  (chip «Sondeo QR N/M» en vivo + supervivencia de recarga). */
  sondeoQrMs?: number;
  /** (§E) tier que leyó el payload — SOLO cuando hubo lectura (jamás inventar). */
  sondeoQrTier?: string;
  // ---------- KIT e14-quad-streaming-v1 (P4/P5) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** (P5) ESTADO-VIVO del pre-scan en «PROCESAR COLA» (e107): esta fila YA
   *  fue decidida por él — veredicto aplicado (registrar/nada) o lectura
   *  imposible (stamp del barrido de cierre). Mientras el TURNO de
   *  clasificación está abierto, el runner con masivaStreaming ON solo
   *  consume filas con esta marca (DUPLICADA/nacidas-después del arranque
   *  están exentas por sí solas — ver siguientePendiente): cierra la carrera
   *  clasificación-vs-pool (la gemela que el pre-scan va a marcar jamás
   *  reserva slot ni paga OCR). RAM del lote — NUNCA viaja a IDB
   *  (sobrevivir recarga no es requisito; el turno muere con la corrida).
   *  Ausente = fila que el pre-scan no vio (nueva / streaming OFF). */
  prescanOk?: boolean;
  /** (P4) quad del acta detectado por el pre-scan sobre el bitmap de la
   *  clase 400 — MISMA convención del core (4 puntos normalizados 0-1,
   *  TL,TR,BR,BL — tipo Quad de @jg-stevan/scanner-core; el bitmap es un
   *  downscale PROPORCIONAL del full, las fracciones viajan sin re-escalar).
   *  El runner lo pasa al bridge como quadPrecomputado (flag masivaQuad ON)
   *  para saltar la re-detección (resuelve la desviación D66 — precalor.ts:
   *  «el bridge no acepta un quad precomputado»); el bridge RE-VALIDA
   *  (plausibilidad — guard conservador, jamás confiar). Ausente = el
   *  pre-scan no detectó quad (o el flag estaba OFF). RAM del lote. */
  quad?: Quad;
  // ---------- W1 — KIT k1-obs-prioridad (brief Agente A) — campo ADITIVO AL FINAL (contrato D57) ----------
  /** W1 (KIT k1-obs-prioridad — brief Agente A): PRIORIDAD de la fila para el
   *  sort del runner (paso 4 del dueño — flag masivaPrioridad ON): 1 = la
   *  fila quedó decidida CON QR leído + quad OK (las mejores — pagan OCR
   *  primero); 2 = quedó sin QR (lectura imposible) o sin estampado (warp
   *  falló / fila sin decisión). Default EFECTIVO 2 (ausente = 2 en el sort).
   *  NUNCA se estampa 3: la DUPLICADA se deriva del `estado` (una sola
   *  fuente de verdad — el sort la calcula). Estampado solo por el pre-scan
   *  con flag ON (estampado del camino lento; el barrido de cierre y las
   *  filas sin decisión NO se estampan — jamás inventar). RAM del lote.
   *  (Integración K1+K2: campo de K1 PRIMERO — orden temporal D57, ver
   *  REPORTE-flujo-dueno-k2-v1 §7.) */
  prioridadProceso?: 1 | 2;
  // ---------- KIT flujo-dueno-v1 (K2 — brief Agente B) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** (K2/paso 5) rotación SUGERIDA por el cuadrante del QR en el warp de
   *  INGESTA (≤2048 — solo para decidir): centroide de la lectura →
   *  orientacion-qr.rotacionDesdeCentroide (mapeo bench v8.3 4/4). El
   *  runner la pasa al bridge como rotacionPrecomputada (flag
   *  masivaRotacionQr ON) para rotar el warp full-res POST-warp y OMITIR
   *  el sondeo de orientación (mismo trato que cuando la brújula decide).
   *  null EXPLÍCITO = el warp corrió pero la lectura del QR falló (el
   *  instrumento llegó, no decidió — honesto). AUSENTE = el warp de
   *  ingesta no llegó a producirse (sin bytes/decode/detect/warp — jamás
   *  inventar). RAM del lote (NUNCA viaja a IDB — sobrevivir recarga no
   *  es requisito; el asegurador (e107) re-decide tras recargar). */
  rotacionSugerida?: 0 | 90 | 180 | 270 | null;
  // ---------- KIT e14-solo-warp-qr-v1 (DRY RUN del dueño) — campo ADITIVO AL FINAL (contrato D57) ----------
  /** Veredicto QR del PRE-SCAN en modo DRY RUN (flag masivaSoloWarpQr ON):
   *  true = el warp produjo un payload legible (BarcodeDetector → jsQR);
   *  false = el pre-scan llegó a la lectura y el QR no salió (o el warp no
   *  se produjo); AUSENTE = el pre-scan no llegó a leer (sin bytes/decode/
   *  corrupto/abort honesto del worker — jamás inventar, regla de oro 4).
   *  Es el ESPEJO del payload del veredicto — SOLO-VISUAL (la UI pinta el
   *  chip QR ✓/✗); cero OCR, cero envío. RAM del lote — NUNCA viaja a IDB
   *  (mismo trato que prescanOk: sobrevivir recarga no es requisito). */
  qrLeido?: boolean;
}

/** Registro PERSISTENTE en IndexedDB — el Blob original + el acta completa. */
export interface RegistroMasiva {
  id: string;
  nombre: string;
  agregadaEn: number;
  estado: EstadoEntrada;
  archivo?: Blob; // el File original (queda en IDB, no en RAM)
  acta?: Acta; // desenlace completo (recortable en REVISIÓN)
  /** DESVIACIÓN ADITIVA documentada (kit §3 no lo trae): la miniatura
   *  persiste junto al registro para pintar la bandeja tras recargar —
   *  mismo dataURL ≤320px (~20-40 KB), sigue durmiendo en IDB, no en RAM. */
  thumb?: string;
  /** KIT e14-masiva-ux-v1 (T2): motivo corto de las filas ERROR SIN acta
   *  (guards de extracción/formato — PROTEGIDO_O_CORRUPTO, etc.). */
  error?: string;
  /** KIT e14-masiva-tiempos-v1 (PR-1): dedup persistente — sobrevive la
   *  recarga (la fila sigue DUPLICADA y el runner puede copiar igual). */
  hashDedup?: string;
  dupOf?: string;
  /** D59 — KIT e14-info-acta-filas-v1 (T1): el título compuesto PERSISTE
   *  junto al registro (misma desviación aditiva documentada de thumb) —
   *  la bandeja lo repinta tras recargar sin re-procesar nada. */
  infoTitulo?: string | null;
  // ─── D65 — KIT e14-progreso-watchdog-dedup-v1: trazas aditivas (kit T1.4/T2.3) ───
  // Contrato D57: campos NUEVOS AL FINAL — los previos no cambian de nombre
  // ni de lugar. Ausente = registro pre-D65 (el instrumento no existía);
  // JAMÁS se inventa un valor.

  /** (T1) intentos consumidos por el watchdog: 0 = ningún intento murió;
   *  1 = el 1.º venció a los 75 s y el reintento tomó el desenlace;
   *  2 = ambos vencieron → rechazo de siempre con trazas. Solo filas que
   *  pasaron por el pipeline (la gemela copiada no corre pipeline → sin campo). */
  watchdog?: number;
  /** (T1) etapa del pipeline al morir el ÚLTIMO intento vencido — vocabulario
   *  del kit: "decodificando" | "deteccion" | "ocr" | "verificacion". El
   *  recorte/realce caen en "deteccion" (cola de la fase de encuadre).
   *  null/ausente = sin señal de progreso antes de morir (jamás inventar). */
  etapaAlMorir?: string | null;
  /** (T1) duración (ms) del intento que murió — hoy era null y escondía los
   *  ~175 s del informe 20261020-122235. null/ausente = sin dato. */
  elapsedMs?: number | null;
  /** (T2) dedup v2 por CONTENIDO: "v2" = gemela matcheada (Hamming ≤ 6);
   *  "sin-match" = hasheada sin gemela. Ausente = pre-D65 o hash falló
   *  (decode — la fila procesa normal, conservador). e63k: valores NUEVOS
   *  AL FINAL de la unión (contrato D57) — "visual-aplazada" = banda 3..6
   *  sin marca pre-OCR (la decide la capa 2 post-OCR); "identidad" = capa 2
   *  marcó DUPLICADA por serie impresa repetida. e63m: "qr" = CAPA 0
   *  (identidad-QR pre-OCR — payload EXACTO repetido, OCR jamás se paga). */
  dedup?: "v2" | "sin-match" | "identidad" | "visual-aplazada" | "qr"
    | "ya-enviada" // e65-dedup-enviadas-v1 — match contra registro ENVIADO del histórico/cola (bytes/dhash cinta cierta) — valor NUEVO AL FINAL (contrato D57)
    // WAVE3 C.2 (obs-informe-wave3-v1) — puertas del veto AL FINAL (D57):
    // distinguen POR DÓNDE llegó el veto ya-enviada (gap real lote 10:
    // filas YA-ENVIADA con dedup:"sin-match" — la puerta quedaba invisible).
    | "ya-enviada-postocr" // H1 post-OCR (punto único de envío — el OCR ya se pagó)
    | "ya-enviada-copia" // la traza visual de cadenaDedup aterrizó sobre un registro YA-ENVIADA (evidencia del veto preservada)
    | "qr-sondeo"; // KIT e73-sondeo-qr-precoz-v1 (§B) — gemela por payload EXACTO leído en INGESTA (pre-pool; no paga slot/probe/OCR) — valor NUEVO AL FINAL (contrato D57)
  /** (T2) distancia de Hamming del match v2 (0–64). Solo filas con
   *  dedup === "v2" lo traen; sin match no hay distancia (no se inventa). */
  dedupDistancia?: number | null;
  // ---------- D66 — KIT e14-decode-unico-precalor-v1 (T4) ----------
  /** ms SOLO del decodificado a MASTER (T4: separado de procesoMs, que
   *  conserva su semántica). Filas precalentadas → 0 (el decode ya pasó en
   *  el precalor; el coste vive en precalorMs). Sin master (fallback a la
   *  ruta de siempre / fila ERROR / registros previos) → campo AUSENTE
   *  (jamás inventar). */
  decodeMs?: number;
  /** D66 (T4): quién fabricó el master — el decode nativo del navegador o
   *  la reserva wasm (heic2any). null/ausente = sin master (fallback). */
  origenDecode?: "nativo" | "wasm" | null;
  /** D66 (T4): el desenlace nació de un master PRECALENTADO (el runner lo
   *  consumió del precalor — decode ≈ 0). Documenta el PROVENANCE del
   *  desenlace y SÍ persiste (a diferencia del flag transitorio de
   *  FilaMasiva, que es estado vivo de la cola). */
  precalentada?: boolean;
  /** D66 (T4): ms TOTALES del precalor para esta fila (solo precalentadas;
   *  null = no precalentada). */
  precalorMs?: number | null;
  // ---------- D63-A2 — KIT e14-d63a2-deskew-pipeline-v1 (T1) ----------
  /** La fila nació de la extracción de un PDF (D60 — página renderizada
   *  a JPEG por extraerPdf). ADITIVO al final del contrato D57: se estampa
   *  en el PRIMER write (cola.ts — agregarLote) y `filaDeRegistro` lo
   *  restaura en la recarga. Ausente = no-PDF (fotos/WhatsApp/registros
   *  previos — jamás inventar). El runner lo consume para el override de
   *  origen por CONSTRUCCIÓN (T1 — el detector D63-A por señales nunca
   *  dirá «escaneo» para un E-14 impreso a sangre). */
  viaPdf?: boolean;
  // ---------- e63k — KIT e63k-capa2-identidad-v1 (F1) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** Serie impresa 15 dígitos (consenso del código 1D — capa 2 identidad.ts,
   *  regla general de persistencia del runner). null/ausente = sin lectura
   *  consensuada (jamás inventar). Sirve al mapa de identidad de la cola. */
  serie?: string | null;
  /** El dueño pulsó PROCESAR IGUAL — persistente: sobrevive la recarga y
   *  manda sobre capas 1 y 2 (el runner ya no pasa por reutilizarResultado
   *  porque dupOf es null, y la capa 2 tampoco la marcará). */
  forzarDedupOff?: boolean;
  /** id del candidato VISUAL cuando la banda fue aplazada (hamming 3..6 —
   *  traza "visual-aplazada"). Sobrevive la resolución final de la capa 2:
   *  oro para el post-mortem (el FP 3992/3993 queda evidenciado). */
  dedupVisualDe?: string;
  // ---------- e63m — KIT e63m-capa0-qr-identidad-v1 (F2) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** Payload QR EXACTO decodificado de la CAPA 0 pre-OCR (identidad-qr.ts —
   *  base64 de 32 bytes, llave OPACA: NO se parsea, NO se invierte, NO se
   *  compara por prefijos — RED LINE 10; la decisión vive en la igualdad
   *  EXACTA del mapa del lote en store.ts). Ausente = sin-payload (el QR no
   *  decodificó o la fila reutilizó antes de la capa 0 — jamás inventar).
   *  Viaja al informe (export-only). */
  qrPayload?: string;
  // ---------- e64-qr-v1 — KIT PLAN-e64-qr (T-0.2) — campo ADITIVO AL FINAL (contrato D57) ----------
  /** KIT e64-qr-v1 (T-0.2): estado de la CAPA 0 QR — persiste junto al
   *  registro para que el chip de la bandeja sobreviva la recarga (misma
   *  desviación aditiva documentada de thumb/infoTitulo). Solo se estampa
   *  cuando la capa 0 CORRIÓ (jamás inventar): "leido" con payload, "sin-
   *  payload" cuando la cadena terminó en null. Ausente = la capa 0 no
   *  llegó a correr (registros previos a la e64 / filas ERROR pre-capa 0). */
  qrEstado?: "leido" | "sin-payload";
  // ---------- e65-dedup-enviadas-v1 — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** e65-dedup-enviadas-v1: SHA-256 de los bytes del archivo original.
   *  Ausente = registro previo al kit o hash falló (jamás inventar).
   *  SOLO llave de dedup — jamás identidad del acta ni viaja al envío
   *  ni al informe de contenido (RL-e65-1). */
  hashBytes?: string;
  /** e65-dedup-enviadas-v1: id del registro enviado matcheado (SOLO-VISUAL).
   *  Ausente = la fila no nació YA-ENVIADA (o PROCESAR IGUAL la limpió). */
  enviadaDe?: string;
  // ---------- e68-blob-idb-v1 — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** e68 — MIGRACIÓN base64 → Blob: la foto ORIGINAL del acta (master
   *  decodificado a escala de trabajo) duerme aquí como Blob NATIVO — el
   *  structured clone la serializa SIN la inflación del 33 % del base64 y
   *  la deserialización es transparente. El acta persistida viaja SIN las
   *  dataURLs (leerRegistro las MATERIALIZA al vuelo para REVISIÓN/
   *  recorte — mismo contrato Acta en RAM). Ausente = registro previo a
   *  e68 con base64 dentro del acta (compatibilidad: el próximo write la
   *  comparte) o fotoOriginal liberada post-envío (cleanup e68). */
  fotoOriginalBlob?: Blob;
  /** e68 — ídem: la foto PROCESADA (warp+realce) como Blob. Se CONSERVA
   *  tras el envío (la REVISIÓN y el recorte manual la usan — kit e68 §3:
   *  «No borrar fotoProcesada»). */
  fotoProcesadaBlob?: Blob;
  // ---------- WAVE3 §B — ORDEN-WAVE3-remoto-rescate-obs-v1 (feat/rescate-rechazo-v1) ----------
  /** (§B) traza del RESCATE anti-falso-rechazo: "lanzado" = el reintento
   *  del paso desenlace corrió (RECHAZADA-BAJO intermitente, intento 1) y
   *  también rechazó (se acepta el rechazo — honesto); "salvado" = el
   *  desenlace final ≠ RECHAZADA tras el reintento. Ausente = sin rescate
   *  (jamás inventar). Aditivo AL FINAL del contrato D57. */
  rescateRechazo?: "lanzado" | "salvado";
  // ---------- KIT e73-sondeo-qr-precoz-v1 (§E) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** (§E) telemetría del SONDEO QR en INGESTA (e73): ms del sondeo del
   *  archivo (corre en el worker — se estampa cuando el sondeo CORRIÓ, con
   *  o sin payload — jamás inventar). Ausente = el sondeo no corrió (flag
   *  OFF / sin soporte / hard-kill / fila previa al kit). */
  sondeoQrMs?: number;
  /** (§E) tier del ladder que LEYÓ el payload ("full" | "recorte" |
   *  "rot90" | "rot180" | "rot270" | "barrido"). PRESENTE SOLO cuando el
   *  sondeo leyó payload ("con payload" del informe) — ausente = sondeó sin
   *  lectura (jamás inventar). */
  sondeoQrTier?: string;
}

/** KIT e14-carga-masiva-v1 (helper compartido runner/store): página corta del
 *  acta para la fila — "1/2" cuando el OCR la leyó, "-/-" si viajó null
 *  (honestidad del kit actas-vivas-paginas-v1, FASE B). */
export function paginaDeActa(acta: Acta): string {
  return acta.pagina ? `${acta.pagina.index}/${acta.pagina.total}` : "-/-";
}

/** D72 — KIT e14-masiva-formato-ancho-v1: título compacto del acta para la fila
 *  en Carga Masiva: solo código del departamento, país/municipio, lugar/puesto,
 *  tipo, mesa y página. Formato optimizado para espacio:
 *  "{dep.codigo} - {país/municipio} - {lugar/puesto} - {tipo} - MESA {nnn} - PAG {i}/{t}"
 */
export function tituloDeActa(acta: Acta): string | null {
  const c = acta.clasificacion;
  if (!c) return null; // sin clasificación NUNCA hay título (honestidad)
  const partes: string[] = [];

  // 1. Código del departamento (solo código, e.g. "88" o "11")
  if (c.departamento?.codigo) {
    partes.push(c.departamento.codigo.trim());
  } else if (c.departamento?.nombre && !c.municipio?.nombre) {
    partes.push(c.departamento.nombre.trim());
  }

  // 2. País / Municipio / Nombre (e.g. "ALEMANIA", "ITALIA", "MEDELLIN", "BOGOTA D.C.")
  if (c.municipio?.nombre) {
    partes.push(c.municipio.nombre.trim());
  }

  // 3. Lugar / Puesto (e.g. "CONSULADO", "FRANKFURT", "CORFERIAS")
  const puesto = c.puesto?.nombre?.trim() || acta.titulo?.trim() || null;
  if (puesto) {
    const puestoNorm = puesto.toUpperCase();
    const munNorm = c.municipio?.nombre?.trim().toUpperCase();
    if (!munNorm || puestoNorm !== munNorm) {
      partes.push(puesto);
    }
  }

  // 4. Tipo (e.g. "TRANSMISION", "DELEGADOS")
  if (c.tipo) {
    partes.push(c.tipo);
  }

  // 5. Mesa (zero-pad 3, e.g. "MESA 002")
  if (c.mesa != null) {
    partes.push(`MESA ${String(c.mesa).padStart(3, "0")}`);
  }

  // 6. Página (e.g. "PAG 1/2")
  if (c.pagina && c.pagina.index != null && c.pagina.total != null) {
    partes.push(`PAG ${c.pagina.index}/${c.pagina.total}`);
  } else if (acta.pagina && acta.pagina.index != null && acta.pagina.total != null) {
    partes.push(`PAG ${acta.pagina.index}/${acta.pagina.total}`);
  }

  const t = partes.join(" - ").toUpperCase();
  return t.length > 0 ? t : null;
}

