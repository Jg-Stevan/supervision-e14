/**
 * Dominio E-14 (SPEC §6 — ampliado para v2).
 * FASE LÓGICA L1: campos async opcionales (§3.1) — el mock y el seed siguen
 * compatibles (todo es opcional).
 */
import type { PageFilter, Quad } from "@jg-stevan/scanner-core/types";
import type { ClasificacionE14 } from "./clasificador";
import type { NivelLectura } from "./senal-lectura";
import type { OrigenActa } from "./masiva/origen"; // D63-A — tipo del origen (kit: tipos viven en origen.ts)

// ---------- Captura y análisis (SPEC fase lógica §3.1) ----------
export type FuenteCaptura = "SIMULACION" | "CAMARA" | "ARCHIVO";

export type EtapaAnalisis = "DETECTANDO" | "RECORTANDO" | "REALZANDO" | "CALIDAD" | "OCR";

export interface ProgresoAnalisis {
  etapa: EtapaAnalisis;
  progreso: number; // 0..1 dentro de la etapa
}

// ---------- Acta (flujo de revisión) ----------
export type ActaStatus =
  | "OPTIMA" // verde   ≥ 8.0  → envío automático
  | "ADVERTENCIA" // ámbar   6.5–7.9 → confirmar o repetir
  | "RECHAZADA" // rojo    < 6.5  → repetir obligatorio (4 intentos; contingencia automática al agotar)
  | "ENVIADA" // verde   tras envío (auto o manual)
  | "EN_REVISION_HUMANA" // ámbar   contingencia al AGOTAR intentos (C4 automática) o SUGERIDA/MANUAL «repetir-primero»
  | "DUPLICADA"; // e66 — SOLO lo estampa reutilizarResultado (gemela: desenlace COPIADO, cero pipeline propio, cero envío propio — el envío real vive en la original). JAMÁS lo produce el gate/score (statusDeScore intacto); antes la gemela heredaba ENVIADA/OPTIMA de la original y corrompía porStatusActa y el historial (plan P2).

/** Ubicación del acta (jerarquía DIVIPOL + mesa). Consumida internamente
 *  por ActaEscrutinio.ubicacion — ya sin uso externo (knip, overnight 3B-B1b). */
interface ActaUbicacion {
  departamento: string;
  municipio: string;
  zona: string;
  puesto: string;
  mesa: string;
}

interface ActaCandidato {
  codigo: string;
  votos: number;
} // "101": 25 …

/**
 * Estado de una firma sobre el acta.
 * D6: "TENUE" añadido para reproducir el marcado ámbar "TRAZO TENUE"
 * de las pantallas de advertencia del zip v2 (ver docs/DECISIONS.md).
 */
export interface ActaFirma {
  nombre: string;
  jurado: string;
  estado: "OK" | "NO_DETECTADO" | "TENUE";
}

// ---------- KIT e14-diagnostico-autoenvio-v1 (§3-A) ----------
/** Registro estructurado del DESENLACE del pipeline («por qué no se envió
 *  automáticamente»). Lo monta el bridge justo donde hoy escribe el log de
 *  auditoría (UNA sola fuente de verdad — pitfall §9.6) y lo cuelga en
 *  Acta.diagnostico. Observación PASIVA: nunca altera el desenlace (§2).
 *  Campos aditivos §8 — KIT e14-diag-campos-aditivos-v1: DES-STUB. El
 *  builder ya recibe sharpnessHi/contrastPapel REALES (calidadDeActa v2 de
 *  main) y lectura.nivel/anclas de la señal del C3. Los TIPOS conservan
 *  null/"—" SOLO para los registros viejos del localStorage e14-diag-v1
 *  (cap 500 — §5 del kit T-B): los NUEVOS siempre traen valores reales. */
export interface DiagnosticoActa {
  ts: string; // ISO
  actaId: string;
  intento: number;
  maxIntentos: number;
  status: ActaStatus; // el del DESENLACE (pre-decisión humana)
  rechazo: Acta["rechazo"];
  /** score visual = bruto de scoreDeCalidad ANTES de los caps del sitio;
   *  final = el del log; techos en ORDEN de aplicación (techo-fair:7.9 ·
   *  techo-poor:6.4 · sin-senal:4.9 · escudo-fondo:7.9 · recortada:7.9 ·
   *  incompleta:6.4 · sin-votos:6.4 — lectura-DEBIL/piso-FUERTE llegan con
   *  score-lectura, §8). */
  score: { visual: number; final: number; techos: string[] };
  metricas: {
    sharpness: number;
    brightness: number;
    contrast: number;
    /** v2 score-lectura (REAL desde el kit diag-campos-aditivos) — null
     *  solo en registros PREVIOS al score v2 (localStorage cap 500). */
    sharpnessHi: number | null;
    contrastPapel: number | null;
    contrasteEfectivo: number;
  };
  level: string; // excellent|good|fair|poor
  /** KIT e14-diag-campos-aditivos-v1 (§4-D): "—" solo en registros previos
   *  al score v2 (localStorage e14-diag-v1 — los viejos siguen siendo
   *  válidos). Con el des-stub, los NUEVOS traen FUERTE/MEDIA/DEBIL. */
  lectura: { nivel: NivelLectura | "—"; anclas: number; chars: number };
  senalActa: boolean;
  ocrValido: boolean;
  gate: {
    completa: boolean;
    /** D63-C — KIT e63c-quad-gate-escaneo-v1 (T2.3): veredicto del MARCO
     *  IMPRESO del formulario en escaneos ("completo" | "cortado" |
     *  "no-encontrado"). null = no se evaluó (fotos, SIM, registros
     *  previos a D63-C — jamás inventar). Aditivo al final del contrato.
     *  KIT e63d (F3.2): nuevo valor "ceñido" — marco EN el filo (escáner
     *  atravesó el marco: corte geométrico, sin pérdida de contenido) —
     *  NUNCA bloquea. Valor ADITIVO: los instrumentos previos siguen
     *  parseando los tres valores viejos (contrato D51). */
    gateMarco?: "completo" | "ceñido" | "cortado" | "no-encontrado" | null;
    fondo: boolean;
    recortada: boolean;
    ladoEsquina: string | null;
    votos: { densidadPct: number | null; skipPag2: boolean; ok: boolean };
    procesadaVacia: boolean;
    clasifNivel: string;
  };
  captura: {
    motor: string;
    filtro: string;
    crop: { w: number; h: number; fallback: boolean };
    quad: Quad;
    // KIT e14-quad-sobel-v1 (P1 §4-C): quién fabricó el quad de verdad.
    // null SOLO si la detección NO corrió (recorte manual del editor, catch
    // de mejorarResolución — n/d jamás miente, misma filosofía del T-A).
    // D63-C (T1): valor NUEVO "pagina-completa" — escaneos sin quad real
    // (worker falló + sobel fabricó): la página completa es el acta, sin
    // warp de perspectiva (la rotación recta ya la trajo D63-B).
    quadOrigen: "worker" | "sobel" | "pagina-completa" | null;
  };
  tiempos: {
    procesoMs: number;
    calidadMs: number;
    ocrMs: number;
    totalMs: number;
    /** D57 — KIT e14-instrumentos-espera-v1 (T1): espera en cola MASIVA, desde
     *  `agregadaEn` hasta iniciar el pipeline (tInicio − agregadaEn). SOLO
     *  masiva/runner.ts lo llena (el flujo individual no tiene espera de
     *  cola). Opcional: los registros previos y el flujo individual van sin
     *  él — jamás inventar (kit §2). */
    esperaMs?: number;
    /** D61 — KIT e14-tiempos-ocultos-v1 (T1): coste de DECODE del archivo
     *  (heic2any/imagen→canvas). Ya se medía en el bridge (traza) — ahora
     *  persiste. null/ausente en canvas-path y SIM. */
    decodeMs?: number | null;
    /** D61 — KIT e14-tiempos-ocultos-v1 (T1): coste de la DETECCIÓN de página
     *  del core (worker). ídem. */
    detectMs?: number | null;
    /** D61 — KIT e14-tiempos-ocultos-v1 (T1): MASIVA — persistencia del
     *  desenlace en IDB (guardarRegistro). */
    persistMs?: number;
    /** D61 — KIT e14-tiempos-ocultos-v1 (T1): MASIVA — envío (SHA-256 + POST
     *  / reintentos offline). */
    envioMs?: number;
    /** WAVE3 G.5 — ORDEN-WAVE3-add-envio-individual-v1: latencia del CHECK
     *  remoto (ledger D1 — §A.3 hook del runner). null/ausente = sin check
     *  (offline, forzarDedupOff, hash ausente o ledger indisponible) —
     *  jamás inventar. La maquinaria §G.3 lo agrega a percentiles gratis
     *  después (mismo patrón D61). */
    remotoMs?: number | null;
  };
  /** D57 — KIT e14-instrumentos-espera-v1 (T2): coste del probe de
   *  orientación (`probe.ms` de `probeOrientacion()`) persistido en la ficha
   *  — la traza de consola (D51) ya existía, esto lo vuelve permanente.
   *  Asignación defensiva en el bridge (si no hay diagnóstico, se omite).
   *  Ausente en SIM (el probe no corre) y en registros previos a D57. */
  orientacionProbeMs?: number;
  /** WAVE2 A1 — KIT REPARTE-WAVE2-tiempos-v1 (Agente A, Tarea A1):
   *  sub-decisión de la MINIATURA (320 px) descartada por el FALLO SEGURO
   *  del probe de orientación — datos de campo para la calibración wave 3.
   *  SOLO visibilidad: jamás cambia la decisión de orientación de HOY (el
   *  fallo seguro es lo único que evita rotaciones equivocadas). Presente
   *  únicamente cuando la miniatura CORRIÓ y fue descartada; ausente en el
   *  camino confiado (escala=320), en foto pequeña (≤320) y cuando la
   *  miniatura falló/no corrió — jamás inventar. */
  orientacionProbeMini?: {
    /** Rotación ganadora de la miniatura descartada. */
    rot: 0 | 90 | 180 | 270;
    /** ¿Habría aplicado la miniatura su rotación? (diagnóstico — la decisión
     *  aplicada sigue siendo la del sondeo a resolución original). */
    aplicado: boolean;
    /** Corte por el que terminó la miniatura (mismo vocabulario D56 §3 T4
     *  de la traza; "presupuesto" = abortó a mitad por el techo de 12 s). */
    corte: "sana" | "presupuesto" | "completo" | "confirmada";
    /** conf media del rec de la ganadora (null si sin dato para esa rot). */
    conf: number | null;
    /** anclas de la ganadora (null si sin dato para esa rot). */
    anclas: number | null;
  };
  /** D63-A — KIT e63a-origen-escaneo-v1 (T2): origen del archivo MASIVA
   *  según el detector heurístico (masiva/origen.ts). null = duda honesta —
   *  jamás inventar. Ausente en SIM y en registros previos a D63-A. SOLO
   *  visibilidad: no toca score/gate/veredictos (kit §0). */
  origen?: OrigenActa;
  /** D63-A — T2: señales auditables de la decisión del detector (p. ej.
   *  "sin-exif+borde-blanco+ratio-hoja"). null = no evaluado. */
  origenSenales?: string | null;
  /** D63-B — KIT e63b-deskew-escaneo-v1 (T2): ángulo de skew detectado en la
   *  banda del encabezado (con signo, pasos de 0.1°; null = banda sin tinta
   *  suficiente o ángulo fuera de ±10° — captura torcida, no skew). */
  skewGrados?: number | null;
  /** D63-B — T2: ms del deskew (detección + rotación del master). null si
   *  no se rotó (|θ| < 0.3° o fuera de rango o no es escaneo). */
  deskewMs?: number | null;
  /** D63-B — T3: limpieza de blanco aplicada al master ("blanco" cuando el
   *  histograma no llegaba a blanco puro). "no" = sin limpieza; null = no
   *  evaluado (no escaneo / registro previo a D63-B). */
  limpieza?: "blanco" | "no" | null;
  /** D63-A2 — KIT e14-d63a2-deskew-pipeline-v1 (T0): provenance del master
   *  que el bridge CONSUMIÓ — "corregido" (deskew del pre-proceso aplicado)
   *  | "original". Aditivo al final del contrato; null = sin pre-proceso
   *  (no debería en MASIVA post-D63-A2 — jamás inventar). El informe lo
   *  consume como `preprocesoAplicado` (bool, presente si origen escaneo). */
  maestroFuente?: "corregido" | "original" | null;
  /** §G.2 — ORDEN-WAVE3-add-envio-individual-v1 (obs-envio-individual-v1):
   *  la red del MOMENTO del envío (aditivos AL FINAL del interface — patrón
   *  «diag-campos-aditivos»). tipo = effectiveType ("4g"/"3g"… —
   *  NetworkInformation) · downlinkMbps = downlink estimado. null = sin
   *  dato (navegador sin navigator.connection — iOS/Safari — o SSR):
   *  jamás inventar. JAMÁS dentro de `tiempos` (es Record de números — el
   *  tipo de red es string). Con §G.1/G.3 el dueño correlaciona envíos
   *  lentos con red mala (evidencia 1230: cel en 4G 1.5 Mbps). */
  envioRedTipo?: string | null;
  envioDownlinkMbps?: number | null;
}

export interface Acta {
  id: string;
  titulo: string; // "ROMA - CONSULADO"
  ubicacion: ActaUbicacion;
  tipo: string; // "SENADO DE LA REPÚBLICA"
  /** Página del acta (KIT actas-vivas-paginas-v1, FASE B — nullable): la
   *  página del papel es DATO — si el OCR/1D no la leyó viaja null
   *  (DESCONOCIDA) y TODOS los consumidores muestran la honestidad
   *  («PÁG - DE -», hueco al primer libre) en vez de asumir P1 mintiendo. */
  pagina: { index: number; total: number } | null;
  candidatos: ActaCandidato[];
  firmas: ActaFirma[];
  codigoBarras: string; // "*E14-SEN-2026-001*"
  score: number; // 0..10 SIEMPRE /10 (D2)
  status: ActaStatus;
  /** Motivo del rechazo → define la variante visual (§7.5) */
  rechazo:
    | null
    | { tipo: "ILEGIBLE"; detalle: string }
    | { tipo: "GENERICO"; detalle: string }
    | { tipo: "INCOMPLETA"; detalle: string }
    /** §D3 (SPEC-e14-score-ocr): sin señal de contenido del acta — «score
     *  bajo» determinista (repetir NUNCA revisión humana en 1ª ronda). */
    | { tipo: "BAJO"; detalle: string }
    /** KIT e14-gate-v2 (FASE G2): marcador OBLIGATORIO fallido — la zona de
     *  votos del acta no tiene tinta (fallo 2026-10-16: acta sin votos
     *  10/10 y auto-enviada). Rechazo directo → se repite la captura. */
    | { tipo: "SIN_VOTOS"; detalle: string };
  intento: number;
  maxIntentos: number; // "INTENTO 1 DE 4"
  enviadoAutomaticamente?: string | null; // "16:42:00" · e66: null EXPLÍCITO en la gemela DUPLICADA (el envío no es suyo — plan P2); undefined = sin envío aún
  hashSha256?: string; // "EN COLA" | hash

  // ----- FASE LÓGICA (§3.1, opcionales — compatibles con seed/mocks) -----
  fuente?: FuenteCaptura;
  /** data URL warp+realce (la evidencia real). */
  fotoProcesada?: string;
  /** data URL cruda del frame/archivo. */
  fotoOriginal?: string;
  /** §D4 (SPEC-e14-score-ocr): la PROCESADA salió sin tinta (warp de un quad
   *  degenerado sobre superficie lisa) → REVISIÓN muestra la ORIGINAL. */
  procesadaVacia?: boolean;
  /** KIT actas-vivas-paginas-v1 (FASE C): OCR de secciones detectó el
   *  RECORTE del papel (P1 sin «SUMA TOTAL» / P≥2 sin «FIRMA» — el caso
   *  real del dueño: captura con la parte inferior pisada sin advertencia).
   *  Score con techo 7.9 (ADVERTENCIA, no rechazo) + píldora «ACTA
   *  RECORTADA». Página desconocida → jamás se marca. */
  recortada?: boolean;
  /** KIT identificacion-codigo-v1 (FASE F, Task 120): LADO de la esquina
   *  fiducial faltante («sup-izq» — marcasEsquina sobre el crop ya
   *  enderezado) cuando el recorte lo detectó la señal de esquinas; null si
   *  el recorte vino SOLO del OCR de secciones del kit 118 o 4/4 presentes. */
  recorteLado?: string | null;
  /** KIT e14-recorte-manual-v1 (T3): el recorte MANUAL se aplicó (warp del
   *  editor completado) pero la foto procesada salió SIN TINTA SUFICIENTE
   *  (procesadaVacia) — REVISIÓN muestra la ORIGINAL con el aviso honesto
   *  «TU RECORTE SE APLICÓ…» (el dueño no debe creer que su recorte falló).
   *  Solo lo marca el pipeline del RECORTE con manual=true; el umbral de
   *  tinta NO cambia (image-utils intacto). */
  recorteManualSinTinta?: boolean;
  /** texto detectado (debug/verificación). */
  ocrTexto?: string;
  /** métricas del core 0-100. */
  metricas?: { sharpness: number; brightness: number; contrast: number };
  motor?: "worker" | "canvas" | "mock";
  /** esquinas de la detección automática (inicio del editor §7.5). */
  quadDetectado?: Quad;
  /** 0|90|180|270 — horneada en fotoProcesada. */
  rotation?: number;
  /** F2 (D36): filtro con el que se procesó (default del producto = "bw"). */
  filtro?: PageFilter;
  /**
   * Clasificación de cabecera contra la base DIVIPOL (SPEC-cabecera-
   * clasificacion §4/§6 — opcional, compatible con seed): nivel AUTO →
   * archivada en su mesa al envío; SUGERIDA/MANUAL → panel de corrección.
   */
  clasificacion?: ClasificacionE14;
  /** KIT e14-diagnostico-autoenvio-v1 (C1): registro del DESENLACE montado
   *  por el bridge junto al log de auditoría. SIM nunca lo trae (§9.2 —
   *  doble guard) y el ZIP solo nace con status ≠ OPTIMA (§1). */
  diagnostico?: DiagnosticoActa;
  // ---------- e64-qr-v1 — KIT PLAN-e64-qr (T-2.1) — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** Payload QR EXACTO de la CAPA 0 en el flujo de CÁMARA (T-2.1 — el MISMO
   *  decodificador de masiva, tiers base, señal ADITIVA: jamás afecta
   *  score/status/gate/OCR). Llave OPACA: NO se parsea, NO se invierte, NO
   *  se compara por prefijos (red line 10) — el chip de REVISIÓN muestra
   *  SOLO presencia. Ausente = la capa 0 no corrió o no terminó (timeout —
   *  jamás inventar). */
  qrPayload?: string;
  /** e64-qr T-2.1: estado de la capa 0 de cámara — "leido" con payload,
   *  "sin-payload" cuando el intento terminó en null. Ausente = n/d (la
   *  capa 0 no llegó a correr). */
  qrEstado?: "leido" | "sin-payload";
  // ---------- e67-watchdog-rescate-v1 — campos ADITIVOS AL FINAL (contrato D57) ----------
  /** e67 (cambio B — rescate post-timeout): marca de PROVENANCE cuando el
   *  watchdog venció y el pipeline TARDÍO terminó VÁLIDO (el rechazo por
   *  tiempo se revirtió). Valor canónico: "post-timeout". Ausente = desenlace
   *  normal del pipeline (el rescate jamás corrió) — jamás inventar. */
  scoreRescatadoPor?: string;
  /** e67 (T): ms REALES del pipeline completo cuando el rescate post-timeout
   *  corrió (medidos en el bridge — dato, no estimación). Ausente = desenlace
   *  normal (el acta llegó a tiempo y no hay nada que documentar). */
  tiempoRealMs?: number;
}

// ---------- Control de mesas (vista ACTAS) ----------
type MesaEstado = "COMPLETADA" | "EN_PROCESO" | "PENDIENTE";
type PaginaEstado = "OK" | "RESCANEO" | "EN_PROCESO" | "PENDIENTE";
export type TipoPagina = "DELEGADOS" | "TRANSMISIÓN";

export interface MesaPagina {
  tipo: TipoPagina;
  pagina: 1 | 2;
  estado: PaginaEstado;
}
export interface Mesa {
  id: string; // "MESA 01"
  estado: MesaEstado;
  progresoPct: number; // 100 | 50 | 0
  paginas: MesaPagina[]; // DELEGADOS P1/P2 · TRANSMISIÓN P1/P2
  /** Fase B (§6): clave DIVIPOL de la mesa real (seed no la lleva). */
  clave?: string;
}

// ---------- Resumen de trabajo (vista RESUMEN) ----------
export interface ProgresoPuesto {
  asignadasHoy: number;
  completadas: number;
} // 12 / 9 → 75%
export interface HistorialRow {
  id: string;
  titulo: string; // "MESA 01 — TRANSMISIÓN P2"
  estado: "ENVIADO" | "RESCANEO_REQUERIDO" | "REVISION_HUMANA";
  hora?: string; // "14:32"
}

/** Score → estado canónico (§6). */
export function statusDeScore(score: number): ActaStatus {
  if (score >= 8) return "OPTIMA";
  if (score >= 6.5) return "ADVERTENCIA";
  return "RECHAZADA";
}
