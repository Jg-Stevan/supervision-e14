/**
 * E14Bridge — la ÚNICA fuente de datos de las vistas (SPEC §2, D1).
 * FASE LÓGICA L1 (SPEC-fase-logica §3.2): contrato ASYNC con eventos de
 * progreso. El CompositeBridge enruta por `fuente` (D17: get-bridge.ts
 * sigue siendo el punto único de intercambio — las vistas no se enteran).
 *
 * UX-REAL F1 (SPEC-ux-real-bn-editor §F1, D35): el MockBridge de la fase
 * gráfica se RETIRÓ — SIMULACIÓN también pasa por el bridge real (pipeline
 * real sobre el acta E-14 incluida). Los gates pasan de «fuente ≠ SIM» a
 * PRESENCIA DE FOTO (recortar ya no mira `acta.fuente`; el flujo PDF salió
 * de e14 — SPEC-rediseno-enviada Rev. 2 §7).
 * Fuente: (diseño propio e14, D35 — el mock de la fase gráfica se retiró;
 * SIMULACIÓN = pipeline real sobre el acta incluida).
 */
import type { Acta, ProgresoAnalisis, FuenteCaptura, TipoPagina } from "./types";
import type { PageFilter, Quad } from "@jg-stevan/scanner-core/types";
// KIT e14-esquinas-suaves-v1 (Q2): origen del quad en el contrato del
// recorte (ver comentario del contrato — el flag manual viaja con él).
import type { OrigenQuad } from "@jg-stevan/scanner-core/image-processor";
// D63-A/D63-C — KIT e63a-origen-escaneo-v1: el origen del archivo (detector
// heurístico del runner MASIVA) viaja en opciones SOLO para MASIVA — SIM y
// el flujo individual JAMÁS lo traen (el gate de escaneos no les aplica).
import type { OrigenActa } from "./masiva/origen";

/** Página de mesa a la que apunta el próximo escaneo (D7: vive en el store). */
export interface PaginaObjetivo {
  mesaId: string; // "MESA 02"
  tipo: TipoPagina; // "DELEGADOS" | "TRANSMISIÓN"
  pagina: 1 | 2;
}

export interface OpcionesEscaneo {
  objetivo: PaginaObjetivo | null;
  intento: number;
  maxIntentos: number;
  fuente: FuenteCaptura;
  archivo?: File; // fuente ARCHIVO (y SIMULACIÓN si el store inyecta el acta incluida)
  frameActual?: HTMLVideoElement | null; // fuente CAMARA
  /**
   * §D3 (SPEC-e14-simulacion-scores): true SOLO cuando el disparo viene de un
   * chip de simulación (store.simularScore). Con `simular` el pipeline corre
   * NORMAL sobre el asset FIJO de la banda (resuelto por `scoreSimulado`) y
   * OMITE la verificación de completitud (la acta cortada del dueño es a
   * propósito — un chip jamás cae INCOMPLETA, AC6). El recorte manual NUNCA
   * simula (re-evaluación real, §D4).
   */
  simular?: boolean;
  /** §D3: score INYECTADO del chip (8.2 | 7.0 | 4.3) — reemplaza el calculado
   *  DESPUÉS de scoreDeCalidad y ANTES del gate; el desenlace real (ÓPTIMA
   *  enviada / EN_REVISION_HUMANA / RECHAZADA) lo decide `evaluarGate`. */
  scoreSimulado?: number;
  /** D63-A/D63-C — KIT e63a-origen-escaneo-v1: origen del archivo según el
   *  detector heurístico (masiva/origen.ts). SOLO MASIVA lo llena (runner).
   *  "escaneo" activa el quad página-completa (T1) y el gate del marco
   *  impreso (T2) del kit D63-C; fotos/SIM/ausente = pipeline de siempre. */
  origenActa?: OrigenActa;
  /** e66 (P4) — señal AUDITABLE del detector (veredictoOrigen.senales — el
   *  runner ya la tenía en la traza y en el diagnóstico; ahora también viaja
   *  al pipeline). "exif-camara" = EXIF de cámara presente (el core ya horneó
   *  la orientación al decodificar) → el probe de rotaciones se OMITE
   *  (evidencia del dueño: aplicado=0 SIEMPRE en exif-camara, 4-10 s c/u).
   *  SOLO MASIVA lo llena (mismo criterio de origenActa); los flujos
   *  individual/video/recorte-manual corren el probe de siempre. */
  origenSenales?: string | null;
  onProgreso?: (p: ProgresoAnalisis) => void;
}

export interface E14Bridge {
  /** Analiza la imagen y resuelve con el acta resultante (async, §3.2). */
  escanearActa(opciones: OpcionesEscaneo): Promise<Acta>;
  /**
   * L5 (§7.5): re-ejecuta el pipeline §5 sobre `fotoOriginal` del acta con el
   * QUAD MANUAL (F5-MANUAL: respeta el quad al píxel, sin refine) → devuelve
   * el acta ACTUALIZADA (fotoProcesada/score/status/rechazo/ocr/metricas;
   * fuente/intento/maxIntentos/paginación IGUALES — el rescate D20 NO consume
   * intento). F4/D37: `rotacionOverride` hornea la rotación LOCAL del editor
   * de recorte (undefined = conserva `acta.rotation`).
   */
  recortar(
    acta: Acta,
    quad: Quad,
    onProgreso?: (p: ProgresoAnalisis) => void,
    rotacionOverride?: number,
    // KIT e14-esquinas-suaves-v1 (Q2): `quadOrigen` (n/d si el quad lo puso el
    // usuario) y `manual` (recorte del EDITOR — escudo-manual del Q2) viajan
    // por el contrato para que el flag llegue COMPLETO al pipelineRecorte. Si
    // el composite no lo reenviara, `manual=true` del store se perdería en la
    // delegación y el escudo jamás se activaría (razonamiento del cambio).
    quadOrigen?: OrigenQuad | null,
    manual?: boolean,
  ): Promise<Acta>;
  /**
   * F2 (§F2.2, D36): re-procesa la foto con el filtro elegido — IGUAL que
   * setFilterOnPage del core (apps/scanner-lab/…/store.ts L644-669): solo
   * processImage, SIN re-OCR ni re-calidad (el gate ya resolvió) → acta
   * actualizada (fotoProcesada + filtro).
   */
  revelar(acta: Acta, filtro: PageFilter): Promise<Acta>;
  /**
   * KIT camara-visor-v1 (G3 — upgrade silencioso del lab L1789-1842):
   * re-procesa el acta con una foto NUEVA a máxima resolución (la toma
   * full-res que aterrizó en segundo plano tras el disparo rápido por
   * escalera). REUTILIZA el pipeline del recorte (re-proceso sin consumir
   * intento) con quad RE-DETECTADO sobre la foto nueva (aspecto 4:3 del
   * sensor ≠ preview — quads normalizados). El gate se re-evalúa completo.
   */
  mejorarResolucion(
    acta: Acta,
    fotoNueva: string,
    onProgreso?: (p: ProgresoAnalisis) => void,
  ): Promise<Acta>;
  /**
   * F-OCR del lab (EditorView.tsx L1360-1395): corre requestOcr sobre la
   * imagen PROCESADA del acta y devuelve el texto crudo.
   */
  reconocerTexto(acta: Acta): Promise<string>;
  /** HH:MM:SS — hora del envío automático. */
  horaEnvio(): string;
  /** HH:MM — hora de las filas del historial. */
  horaHistorial(): string;
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Enrutador (SPEC §3.3, D17 — simplificado en D35): TODO pasa al bridge real
 * (SIMULACIÓN incluida: el real carga el acta E-14 incluida). El gate de
 * recortar mira la PRESENCIA DE FOTO, no la fuente.
 * get-bridge.ts sigue siendo el punto único de intercambio.
 */
export class CompositeBridge implements E14Bridge {
  constructor(private real: E14Bridge | null = null) {}

  escanearActa(opciones: OpcionesEscaneo): Promise<Acta> {
    if (!this.real) {
      return Promise.reject(new Error("FUENTE REAL NO IMPLEMENTADA (L2)"));
    }
    return this.real.escanearActa(opciones);
  }

  recortar(
    acta: Acta,
    quad: Quad,
    onProgreso?: (p: ProgresoAnalisis) => void,
    rotacionOverride?: number,
    quadOrigen?: OrigenQuad | null,
    // KIT e14-esquinas-suaves-v1 (Q2): el composite REENVÍA manual (default
    // false — el escaneo/mejorar conservan el comportamiento conservador).
    manual = false,
  ): Promise<Acta> {
    if (!this.real) {
      return Promise.reject(new Error("FUENTE REAL NO IMPLEMENTADA (L2)"));
    }
    // D35: el gate es la foto, no la fuente (SIMULACIÓN tiene foto real).
    if (!acta.fotoOriginal) {
      return Promise.reject(new Error("RECORTAR NO APLICA SIN FOTO REAL"));
    }
    return this.real.recortar(acta, quad, onProgreso, rotacionOverride, quadOrigen, manual);
  }

  revelar(acta: Acta, filtro: PageFilter): Promise<Acta> {
    if (!this.real) {
      return Promise.reject(new Error("FUENTE REAL NO IMPLEMENTADA (L2)"));
    }
    // D35: el gate es la foto, no la fuente (SIMULACIÓN tiene foto real).
    if (!acta.fotoOriginal) {
      return Promise.reject(new Error("FILTRAR NO APLICA SIN FOTO REAL"));
    }
    return this.real.revelar(acta, filtro);
  }

  mejorarResolucion(
    acta: Acta,
    fotoNueva: string,
    onProgreso?: (p: ProgresoAnalisis) => void,
  ): Promise<Acta> {
    if (!this.real) {
      return Promise.reject(new Error("FUENTE REAL NO IMPLEMENTADA (L2)"));
    }
    // D35: el gate es la foto, no la fuente (SIMULACIÓN tiene foto real).
    if (!acta.fotoOriginal || !fotoNueva) {
      return Promise.reject(new Error("MEJORAR RESOLUCIÓN NO APLICA SIN FOTO REAL"));
    }
    return this.real.mejorarResolucion(acta, fotoNueva, onProgreso);
  }

  reconocerTexto(acta: Acta): Promise<string> {
    if (!this.real) {
      return Promise.reject(new Error("FUENTE REAL NO IMPLEMENTADA (L2)"));
    }
    // D35: el gate es la foto, no la fuente (SIMULACIÓN tiene foto real).
    if (!acta.fotoProcesada) {
      return Promise.reject(new Error("RECONOCER TEXTO NO APLICA SIN FOTO REAL"));
    }
    return this.real.reconocerTexto(acta);
  }

  horaEnvio(): string {
    // Las horas son de dominio de sesión, no del motor (D35: antes delegaba
    // al mock; ahora viven aquí — mismo formato HH:MM:SS).
    const d = new Date();
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
  }

  horaHistorial(): string {
    const d = new Date();
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  }
}
