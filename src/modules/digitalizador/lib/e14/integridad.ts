/**
 * Marcas fiduciales de esquina — señal POSITIVA de «acta completa (sin
 * recortar)». Fuente: ANALISIS §5.1 (docs/research/
 * PATRON-identificacion-actas-e14.md): el acta imprime un cuadrado negro
 * relleno cerca de cada una de las 4 esquinas. Detecta recortes SUPERIORES
 * que la señal de contenido del kit 118 (`faltaSeccionInferior`, solo
 * inferior: SUMA TOTAL/FIRMA) no ve.
 *
 * Presente = núcleo oscuro CON anillo blanco alrededor (distingue la marca
 * de una mesa oscura / de una esquina recortada). El QR queda FUERA
 * (ANALISIS §6: blob criptográfico opaco — documentado, sin jsQR/zxing:
 * §6 inmutables del kit identificacion-codigo-v1).
 *
 * KIT consenso-frankfurt-v1 (FASE 1, §2, Task 122): `marcasEsquina` pasa de
 * muestreo de ventana FIJA a BÚSQUEDA de marca con imagen integral.
 * // Fuente: §0-F1 del kit — la marca fiducial REAL mide ~3%W de lado
 * (27px/908 Frankfurt · 30px/995 El Cairo — cuadrado) y vive en y 2.2-5.2%
 * (sup) · 97.6-97.9% (inf), x 3.8-8% (izq) · 97.2% (der); la ventana fija
 * del kit 120 (núcleo 7%W×3%H en 2%W, 1.5%H) dejaba la marca en ~14% del
 * área → promedio del núcleo 0.87 con umbral <0.45 IMPOSIBLE de pasar → las
 * 4 esquinas «FALTA» en TODA captura real → pill + techo 7.9 sistemáticos
 * (falso positivo del dueño: Frankfurt 746 mesa 012 pág 2, fill 0.86-0.92
 * medido pixel a pixel). Reproducción: research/repro_marcas.py.
 */

/** tl=sup-izq · tr=sup-der · bl=inf-izq · br=inf-der. */
export interface EsquinasActa {
  tl: boolean;
  tr: boolean;
  bl: boolean;
  br: boolean;
}

/** Todas las esquinas «medidas presentes» — valor NEUTRO para los casos en
 *  que la señal no se puede medir (SIM sin calibrar / decode fallido): la
 *  política del repo es «sin señal honesta no se condena» (página
 *  desconocida → false en faltaSeccionInferior; mismo espíritu). */
export const ESQUINAS_OK: EsquinasActa = { tl: true, tr: true, bl: true, br: true };

/**
 * Marcas fiduciales de esquina sobre el crop YA enderezado (mismo contenido
 * que evalúa calidadDeActa — el bridge le pasa la fotoProcesada warpeada).
 * Canvas mínimo del acta: 80×120 → MENOR devuelve null (no medible): hoy
 * devolvía todo-false, que ES condena y contradice la política «sin señal
 * honesta no se condena» documentada arriba. Los 2 callers ya manejan null
 * (esquinasDeActa envuelve con try/catch y trazaEsquinas imprime n/d).
 *
 * Algoritmo (§2 del kit — una sola pasada, SIN dependencias nuevas):
 *  1. luminancia `getImageData` UNA vez (pesos 0.2126/0.7152/0.0722 como hoy);
 *  2. imagen integral (W+1)×(H+1) Uint32 → media de cualquier rectángulo O(1);
 *  3. por esquina, región de búsqueda con margen 2× sobre las posiciones
 *     medidas (sup y∈[0,10%H] · inf y∈[90%H,H] · izq x∈[0,14%W] · der
 *     x∈[86%W,W]);
 *  4. deslizar ventana CUADRADA de lado s ∈ {2.5%W, 3.2%W, 4.2%W} con paso
 *     2px (la marca real es un cuadrado de ~3%W — 3 tamaños = tolerancia de
 *     escala). Por posición: núcleo = media(s×s) oscuro Y anillo = media(3s×3s,
 *     la ventana centrada que INCLUYE el núcleo) claro. Gana el candidato con
 *     núcleo más oscuro que cumpla AMBOS.
 * Presupuesto: <30 ms por acta (las medias O(1) caen en regiones pequeñas).
 */
export function marcasEsquina(canvas: HTMLCanvasElement): EsquinasActa | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 80 || canvas.height < 120) return null;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H).data;
  // Cuantización de la luminancia a 6 bits (0-63): sin ella, la suma integral
  // de una captura de alta resolución desbordaría Uint32 (>16.8M px con luma
  // 0-255). Error por píxel ≤ 1/126 ≈ 0.008 → en la media de una ventana
  // (≥23² px) queda ≈0.001, despreciable frente a las holguras de los
  // umbrales (núcleo >2×, anillo 0.14).
  const ESCALA = 63 / 255;
  const iw = W + 1;
  const integral = new Uint32Array(iw * (H + 1));
  for (let y = 0; y < H; y += 1) {
    let fila = 0;
    const iFila = (y + 1) * iw;
    const iPrev = y * iw;
    const iImg = y * W * 4;
    for (let x = 0; x < W; x += 1) {
      const i = iImg + x * 4;
      fila += Math.round((0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]) * ESCALA);
      integral[iFila + x + 1] = integral[iPrev + x + 1] + fila;
    }
  }
  /** Media 0-1 del rectángulo clampado a la imagen (coordenadas de imagen). */
  const media = (x0: number, y0: number, w: number, h: number): number => {
    const xa = Math.max(0, x0);
    const ya = Math.max(0, y0);
    const xb = Math.min(W, x0 + w);
    const yb = Math.min(H, y0 + h);
    const area = (xb - xa) * (yb - ya);
    if (area <= 0) return 1;
    const suma =
      integral[yb * iw + xb] -
      integral[ya * iw + xb] -
      integral[yb * iw + xa] +
      integral[ya * iw + xa];
    return suma / area / 63;
  };

  // // Fuente: §0-F1 — regiones con margen 2× sobre las posiciones medidas
  // (marcas: y 2.2-5.2% sup · 97.6-97.9% inf · x 3.8-8% izq · 97.2% der).
  const regiones = [
    { x0: 0, x1: Math.round(W * 0.14), y0: 0, y1: Math.round(H * 0.1) }, // tl
    { x0: Math.round(W * 0.86), x1: W, y0: 0, y1: Math.round(H * 0.1) }, // tr
    { x0: 0, x1: Math.round(W * 0.14), y0: Math.round(H * 0.9), y1: H }, // bl
    { x0: Math.round(W * 0.86), x1: W, y0: Math.round(H * 0.9), y1: H }, // br
  ] as const;
  // Lados de la ventana cuadrada: la marca real mide ~3%W (27px/908 ·
  // 30px/995) → 3 tamaños = tolerancia de escala.
  const lados = [Math.round(W * 0.025), Math.round(W * 0.032), Math.round(W * 0.042)];
  // // Fuente: núcleo de marca real medido 0.05-0.14 (fill 0.86-0.92, tinta
  // lum<0.15) → umbral 0.30 con holgura >2×. Anillo real ≈0.89 (3s×3s con
  // s=27px en 908px: (81²-27²)·blanco/81²) → umbral 0.75 con holgura 0.14.
  // El anillo descarta texto/barras: el barcode a y≥6%H da anillo ~0.5-0.6
  // bajo un candidato → rechazado.
  const UMBRAL_NUCLEO = 0.3;
  const UMBRAL_ANILLO = 0.75;

  const buscaEsquina = (r: (typeof regiones)[number]): boolean => {
    let mejor = Infinity;
    for (const s of lados) {
      if (s < 2) continue;
      for (let y = r.y0; y + s <= r.y1; y += 2) {
        for (let x = r.x0; x + s <= r.x1; x += 2) {
          const nucleo = media(x, y, s, s);
          if (nucleo >= UMBRAL_NUCLEO || nucleo >= mejor) continue;
          const anillo = media(x - s, y - s, 3 * s, 3 * s);
          if (anillo > UMBRAL_ANILLO) mejor = nucleo;
        }
      }
    }
    return Number.isFinite(mejor);
  };

  return {
    tl: buscaEsquina(regiones[0]),
    tr: buscaEsquina(regiones[1]),
    bl: buscaEsquina(regiones[2]),
    br: buscaEsquina(regiones[3]),
  };
}

/** Primer LADO faltante (prioridad tl→tr→bl→br) con el copy del aviso
 *  display («RECORTADA sup-izq») — null si las 4 están presentes. */
export function ladoEsquinaFaltante(e: EsquinasActa): string | null {
  if (!e.tl) return "sup-izq";
  if (!e.tr) return "sup-der";
  if (!e.bl) return "inf-izq";
  if (!e.br) return "inf-der";
  return null;
}

/** Traza para el log de auditoría: `esquinas=OK` · `esquinas=FALTA_tl` ·
 *  `esquinas=n/d` (no medible — el null del bridge). */
export function trazaEsquinas(e: EsquinasActa | null): string {
  if (e === null) return "n/d";
  const faltan = (["tl", "tr", "bl", "br"] as const).filter((k) => !e[k]);
  return faltan.length === 0 ? "OK" : `FALTA_${faltan.join("+")}`;
}

/** e71 (P10) — ¿fallaron LAS 4 esquinas fiduciales? (`esquinas=FALTA_tl+tr+
 *  bl+br` de la traza de arriba). Kit e71-consolidación: cuando la medición
 *  de integridad encuentra las 4 marcas ausentes el papel NO está demostrado
 *  entero → el gate NO puede reportar `completa: true`. Puro (sin DOM) —
 *  consumido por AMBOS pipelines del bridge (escaneo + recorte, pitfall
 *  §9.9: mismo criterio). null (no medible) → false — jamás condena a
 *  ciegas (la ausencia de medición no es evidencia). */
export function cuatroEsquinasFaltan(e: EsquinasActa | null | undefined): boolean {
  return !!e && !e.tl && !e.tr && !e.bl && !e.br;
}
