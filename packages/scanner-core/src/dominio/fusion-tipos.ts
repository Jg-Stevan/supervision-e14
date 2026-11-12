/**
 * Contrato del motor de fusión de evidencia acta ↔ DIVIPOL
 * (TAREA-AGENTE-fusion-divipol §3.2, §3.7, §3.8, §3.11 — D89).
 *
 * Tipos PUROS: no importan el motor ni el catálogo, así el panel de revisión
 * puede consumir la resolución sin arrastrar la base DIVIPOL al bundle.
 */

/** Calidad de un campo leído (§3.2): `ilegible` está muerto y NO bloquea;
 *  `borroso` aporta por vías degradadas (permutación/fuzzy). */
export type CalidadCampo = "legible" | "borroso" | "ilegible";

export interface CampoLeido {
  valor: string;
  calidad: CalidadCampo;
}

/** Lectura del encabezado del acta (§3.2). Los campos ausentes/ilegibles no
 *  bloquean: la identidad sale de la composición, no de un campo. */
export interface LecturaActa {
  departamento?: CampoLeido | null;
  paisCodigo?: CampoLeido | null;
  paisNombre?: CampoLeido | null;
  zona?: CampoLeido | null;
  puesto?: CampoLeido | null;
  mesa?: CampoLeido | null;
  lugar?: CampoLeido | null;
  /** Código de 15 dígitos — fuera del puntaje territorial (§3.7). */
  barcode?: CampoLeido | null;
  /** `Ver: 01 Pag: 1 de 2` impreso — fuente de página (§3.8). */
  verpag?: CampoLeido | null;
  /** Banner del tipo (`TRANSMISIÓN` / `CÓNSUL/EMBAJADOR` / `DELEGADOS`). */
  tipoBanner?: CampoLeido | null;
  /** Contenido de la página: resultados ⇒ 1, constancias ⇒ 2 (§3.8). */
  contenido?: "resultados" | "constancias" | null;
}

export type NivelFusion = "AUTO" | "SUGERIDA" | "MANUAL";

/** Vía por la que un campo aportó (§3.11 — toda suma queda trazada). */
export type ViaEvidencia =
  | "EXACTA"
  | "PERMUTACIÓN"
  | "FUZZY"
  | "FUZZY (alto)"
  | "ÚNICO"
  | "ACUERDO"
  | "RESTRICCIÓN"
  | "FUERA DE RANGO";

export interface Evidencia {
  campo: string;
  leido: string;
  via: ViaEvidencia;
  puntos: number;
}

export interface StandResuelto {
  departamento: { codigo: string; nombre: string };
  municipio: { codigo: string; nombre: string };
  zona: { codigo: string };
  puesto: { codigo: string; nombre: string; mesas: number };
}

export interface Candidato {
  stand: StandResuelto;
  puntos: number;
  evidencias: Evidencia[];
  /** Cantidad de grupos independientes que aportaron (§3.5). */
  grupos: number;
  gruposActivos: string[];
  mesaValida: boolean;
  mesaResuelta: number | null;
}

export type TipoAviso = "info" | "alerta" | "error";

export interface Aviso {
  tipo: TipoAviso;
  /** Código estable para UI/tests (p. ej. `MESA_FUERA_RANGO`). */
  codigo: string;
  mensaje: string;
}

export type TipoActa = "TRANSMISION" | "DELEGADOS" | "CONSUL/EMBAJADOR";

/** Hipótesis del dígito 9 (§3.7): NUNCA una certeza salvo `3`. */
export interface HipotesisTipo {
  valor: TipoActa;
  certeza: "acordada" | "ambigua" | "no-verificada";
  alternativas: TipoActa[];
}

export interface CodigoBarras {
  /** 15 dígitos limpios (sin separadores). */
  crudo: string;
  prefijo: string;
  form: string;
  d9: string;
  ver: string;
  pag: string;
  sufijo: string;
  plausible: boolean;
  tipoHipotesis: HipotesisTipo | null;
}

export interface FuentePagina {
  fuente: "verpag" | "barcode" | "contenido";
  valor: number;
}

export interface PaginaConsenso {
  valor: number | null;
  fuentes: FuentePagina[];
  consistente: boolean;
}

export interface FuenteTipo {
  fuente: "banner" | "barcode";
  valor: TipoActa;
}

export interface TipoConsenso {
  valor: TipoActa | null;
  fuentes: FuenteTipo[];
  consistente: boolean;
}

/** Salida del motor (§3.11). `mejor` es HIPÓTESIS: en MANUAL con empate en
 *  la cima queda null (el motor no elige por orden de recorrido). */
export interface Resolucion {
  nivel: NivelFusion;
  gap: number;
  mejor: Candidato | null;
  alternativas: Candidato[];
  avisos: Aviso[];
  rescates: string[];
  gruposActivos: string[];
  barcode: CodigoBarras | null;
  pagina: PaginaConsenso;
  tipo: TipoConsenso;
}
