/**
 * KIT identificacion-codigo-v1 (FASE E, Task 120): registro KIT→mesa para
 * recuperar la MESA cuando el ancla de cabecera falla (recortes, «NESA»,
 * dedo sobre «MESA:»…). Fuente de la evidencia: ANALISIS §4.2
 * (docs/research/PATRON-identificacion-actas-e14.md — 6 actas oficiales del
 * visor Registraduría + Frankfurt 745 por OCR del dueño con filename oficial).
 *
 * REGLAS DEL KIT (§4 + §6 inmutables):
 *  - Clave = (mun/país, kit). El kit es único por puesto en la evidencia;
 *    AMPLIAR solo con actas oficiales verificadas (visor Registraduría).
 *  - NUNCA da AUTO ni decide envío: el consumidor (clasificador.ts FASE D.6)
 *    solo rellena la mesa cuando la cabecera NO la leyó; el nivel sigue
 *    exigiendo mesaValidaLeida (máx SUGERIDA, como hoy).
 *  - Guardas al consumir: municipio resuelto que coincida; zona/puesto
 *    resueltos que no contradigan el registro (KIT_OTRA_RUTA); con ruta
 *    completa, 1 ≤ mesa ≤ p.t (regla 5 — KIT_MESA_FUERA_RANGO).
 */

// knip C3: de-export — uso SOLO interno (REGISTRO_KITS/kitEnRegistro).
interface RegistroKit {
  mun: string;
  zon: string;
  std: string;
  kit: number;
  mesa: number;
  fuente: string;
}

/** // Fuente: ANALISIS §4.2 — tabla verificada 6/6 (12 páginas 1D 12/12). */
export const REGISTRO_KITS: RegistroKit[] = [
  { mun: "495", zon: "10", std: "02", kit: 982, mesa: 1, fuente: "visor: ROMA - CONSULADO" },
  { mun: "335", zon: "05", std: "02", kit: 399, mesa: 1, fuente: "visor: EL CAIRO - CONSULADO (2 copias)" },
  { mun: "120", zon: "05", std: "02", kit: 726, mesa: 8, fuente: "visor: BERLIN CONSULADO" },
  { mun: "120", zon: "05", std: "02", kit: 727, mesa: 9, fuente: "visor: BERLIN CONSULADO" },
  { mun: "120", zon: "15", std: "02", kit: 745, mesa: 12, fuente: "OCR dueño: FRANKFURT CONSULADO" },
  { mun: "355", zon: "03", std: "08", kit: 1265, mesa: 1, fuente: "visor: BARCELONA - GIRONA" },
];

/** Búsqueda por (municipio resuelto, kit del consenso del código 1D).
 *  mun null / kit null / kit no finito → null (sin señal, sin invención). */
export function kitEnRegistro(mun: string | null, kit: number | null): RegistroKit | null {
  if (!mun || kit === null || !Number.isFinite(kit)) return null;
  return REGISTRO_KITS.find((r) => r.mun === mun && r.kit === kit) ?? null;
}
