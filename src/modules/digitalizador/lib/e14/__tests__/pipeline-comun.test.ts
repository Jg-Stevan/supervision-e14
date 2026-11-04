/**
 * R7c — TESTS DE CARACTERIZACIÓN de pipeline-comun.ts (M6-fin: la UNA
 * implementación de los cuerpos gemelos restantes de
 * pipeline()/pipelineRecorte() del bridge).
 *
 * Patrón R7a: tests commiteados ANTES de que el bridge delegue en este
 * módulo (orden garantizado por git log). Los helpers PUROS se fijan con
 * valores dorados derivados A MANO de las expresiones actuales del bridge
 * (los dos logs de auditoría, las señales de texto, el payload del
 * diagnóstico). Los helpers que llaman canvas/OCR real (ocrBanda,
 * esquinasDeActa) solo se caracterizan en sus rutas sin I/O — el residual
 * (paridad de los logs en runtime) se sostiene en diff + tsc, como declaró
 * R7a §7.
 */

import { describe, expect, test } from "bun:test";
import {
  bandaDirigidaSiFalta,
  construirDiagnosticoSitio,
  caracterizarLectura,
  evidenciaBordeDe,
  fmtClasif,
  medirEsquinasSitio,
  senalDeContenido,
  trazaDesenlaceComun,
  vetoCuatroEsquinas,
} from "../pipeline-comun";
import type { ClasificacionE14 } from "../clasificador";
import type { PageQualityV2 } from "../calidad";
import type { SalidaDesenlace } from "../gate";
import type { ResultadoCompletitud } from "../completitud";
import type { EsquinasActa } from "../integridad";
import type { Quad } from "@jg-stevan/scanner-core/types";

// ── fixtures ─────────────────────────────────────────────────────────────

function clasif(base: Partial<ClasificacionE14> = {}): ClasificacionE14 {
  return {
    departamento: null,
    municipio: null,
    zona: null,
    puesto: null,
    mesa: null,
    tipo: null,
    pagina: null,
    kit: null,
    nivel: "MANUAL",
    confianzas: { departamento: 0, municipio: 0, puesto: 0, tipo: 0 },
    ...base,
  };
}

const CALIDAD: PageQualityV2 = {
  sharpness: 50.5,
  brightness: 70.25,
  contrast: 60.1,
  label: "good",
  sharpnessHi: 50.5, // === sharpness → scoreDeCalidad NO recalcula el level
  contrastPapel: 30, // ≤ contrast → contrasteEfectivo NO cambia el level
  level: "good",
};

const TEXTO_ANCLAS =
  "E-14 REGISTRADURIA CONSULADO 1 PAIS 5 ZONA 88 PUESTO 335 MESA 001 Ver.: 1 Pag.: 1 de 2 KIT 399 123456789012345";

// ── senalDeContenido (§D1, transcripción del bridge) ─────────────────────

describe("caracterización · pipeline-comun (gemelos del bridge, M6-fin)", () => {
  describe("senalDeContenido (transcripción literal del bridge)", () => {
    test("cabecera E-14 en el texto → true", () => {
      expect(senalDeContenido("ACTA E-14", clasif())).toBe(true);
    });
    test("parciales.cabecera / mesa finita / tipo → true", () => {
      expect(senalDeContenido("nada", clasif({ parciales: { cabecera: true, mesa: null, tipo: null } }))).toBe(true);
      expect(senalDeContenido("nada", clasif({ parciales: { cabecera: false, mesa: 12, tipo: null } }))).toBe(true);
      expect(
        senalDeContenido("nada", clasif({ parciales: { cabecera: false, mesa: null, tipo: "TRANSMISION" } })),
      ).toBe(true);
    });
    test("sin ninguna señal → false", () => {
      expect(senalDeContenido("hola mundo", clasif())).toBe(false);
    });
  });

  // ── fmtClasif (formato D51, transcripción literal del bridge) ──────────

  describe("fmtClasif (traza §4.6)", () => {
    test("null → sin-clasificar", () => {
      expect(fmtClasif(null)).toBe("sin-clasificar");
    });
    test("ruta completa + página + tipo T + mesa 3 dígitos", () => {
      expect(
        fmtClasif(
          clasif({
            departamento: { codigo: "88", nombre: " exterior" },
            municipio: { codigo: "335", nombre: "m" },
            zona: { codigo: "05" },
            puesto: { codigo: "02", nombre: "p" },
            mesa: 1,
            tipo: "TRANSMISION",
            pagina: { index: 2, total: 2 },
            nivel: "AUTO",
          }),
        ),
      ).toBe("dep:88,mun:335,zon:05,std:02,mesa:001,pag:2/2,tipo:T,nivel:AUTO");
    });
    test("página desconocida → pag:? · tipo DELEGADOS → D · otro tipo → -", () => {
      expect(fmtClasif(clasif({ tipo: "DELEGADOS", nivel: "SUGERIDA" }))).toBe(
        "dep:?,mun:?,zon:?,std:?,mesa:?,pag:?,tipo:D,nivel:SUGERIDA",
      );
    });
  });

  // ── bandaDirigidaSiFalta (rutas SIN OCR headless) ──────────────────────

  describe("bandaDirigidaSiFalta (guard del sitio — sin I/O)", () => {
    test("SIM (simular=true) → OMITIDA byte a byte: texto intacto, ms.ocr intacto", async () => {
      const ms = { ocr: 500 };
      const texto = await bandaDirigidaSiFalta({ texto: "A", fotoProcesada: "data:x", simular: true, ms });
      expect(texto).toBe("A");
      expect(ms.ocr).toBe(500);
    });
    test("banda YA leída (tipoDeBanda ≠ null) → no segunda pasada", async () => {
      const ms = { ocr: 500 };
      const texto = await bandaDirigidaSiFalta({
        texto: "SELLO TRANSMISION",
        fotoProcesada: "data:x",
        simular: false,
        ms,
      });
      expect(texto).toBe("SELLO TRANSMISION");
      expect(ms.ocr).toBe(500);
    });
  });

  // ── medirEsquinasSitio (ruta SIM headless) ─────────────────────────────

  describe("medirEsquinasSitio (ruta SIM — ESQUINAS_OK neutro)", () => {
    test("simular=true → ESQUINAS_OK, lado null, traza 'sim' (chips 8.2/7.0/4.3 intactos)", async () => {
      const r = await medirEsquinasSitio({ fotoProcesada: "data:x", simular: true });
      expect(r.esquinas).toEqual({ tl: true, tr: true, bl: true, br: true });
      expect(r.ladoEsquina).toBeNull();
      expect(r.trazaEsq).toBe("sim");
    });
  });

  // ── vetoCuatroEsquinas (e71 P10) ───────────────────────────────────────

  describe("vetoCuatroEsquinas (e71 — criterio único cuatroEsquinasFaltan)", () => {
    const faltan4: EsquinasActa = { tl: false, tr: false, bl: false, br: false };
    test("4/4 ausentes + aplica → veto", () => {
      expect(vetoCuatroEsquinas({ esquinas: faltan4, aplica: true })).toBe(true);
    });
    test("4/4 ausentes + !aplica (SIM del escaneo) → sin veto", () => {
      expect(vetoCuatroEsquinas({ esquinas: faltan4, aplica: false })).toBe(false);
    });
    test("null (no medible) → jamás condena a ciegas", () => {
      expect(vetoCuatroEsquinas({ esquinas: null, aplica: true })).toBe(false);
    });
    test("parcial (1 faltante) → NO es el veto e71 (eso es ladoEsquina/lazo)", () => {
      expect(vetoCuatroEsquinas({ esquinas: { tl: false, tr: true, bl: true, br: true }, aplica: true })).toBe(false);
    });
  });

  // ── caracterizarLectura (composición de señales idéntica ×2) ───────────

  describe("caracterizarLectura (faltaSección + lazo + señales + score base)", () => {
    const OK: EsquinasActa = { tl: true, tr: true, bl: true, br: true };

    test("todas las anclas → senal FUERTE anclas=10 · senalActa=true · ocrLegible=true", () => {
      const r = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif({ nivel: "AUTO", parciales: { cabecera: true, mesa: 1, tipo: null } }),
        esquinas: OK,
        ladoEsquina: null,
        calidad: CALIDAD,
      });
      expect(r.senal.nivel).toBe("FUERTE");
      expect(r.senal.anclas).toBe(10);
      expect(r.senalActa).toBe(true);
      expect(r.ocrLegible).toBe(true);
      expect(r.faltaSeccion).toBe(false); // pagina null nunca condena
      expect(r.recortada).toBe(false);
    });

    test("P1 sin SUMA TOTAL → faltaSeccion=true → recortada (la señal de secciones NUNCA se perdona)", () => {
      const r = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif({ pagina: { index: 1, total: 2 } }),
        esquinas: OK,
        ladoEsquina: null,
        calidad: CALIDAD,
      });
      expect(r.faltaSeccion).toBe(true);
      expect(r.recortada).toBe(true);
    });

    test("P1 con SUMA TOTAL → faltaSeccion=false", () => {
      const r = caracterizarLectura({
        texto: TEXTO_ANCLAS + " SUMA TOTAL",
        clasificacion: clasif({ pagina: { index: 1, total: 2 } }),
        esquinas: OK,
        ladoEsquina: null,
        calidad: CALIDAD,
      });
      expect(r.faltaSeccion).toBe(false);
    });

    test("P2 sin FIRMA → faltaSeccion=true · P2 con FIRMA → false", () => {
      const base = { texto: TEXTO_ANCLAS, clasificacion: clasif({ pagina: { index: 2, total: 2 } }), ladoEsquina: null, calidad: CALIDAD };
      expect(caracterizarLectura({ ...base, esquinas: OK }).faltaSeccion).toBe(true);
      expect(caracterizarLectura({ ...base, texto: TEXTO_ANCLAS + " FIRMA", esquinas: OK }).faltaSeccion).toBe(false);
    });

    test("lazo perdonado por lectura (bl ausente, pie dentro) → recortada=false con lado=inf-izq", () => {
      const r = caracterizarLectura({
        texto: TEXTO_ANCLAS, // KIT 399 + SUMA TOTAL no… pagina null → pieDentro=true
        clasificacion: clasif(),
        esquinas: { tl: true, tr: true, bl: false, br: true },
        ladoEsquina: "inf-izq",
        calidad: CALIDAD,
      });
      expect(r.lazoPerdonado).toBe(true);
      expect(r.recortada).toBe(false);
    });

    test("lazo sin perdón (faltaSeccion=true) → recortada=true con lado", () => {
      const r = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif({ pagina: { index: 1, total: 2 } }), // P1 sin SUMA TOTAL
        esquinas: { tl: true, tr: true, bl: false, br: true },
        ladoEsquina: "inf-izq",
        calidad: CALIDAD,
      });
      expect(r.lazoPerdonado).toBe(false);
      expect(r.recortada).toBe(true);
    });

    test("piso-10: FUERTE + anclas≥8 + sharpnessHi≥90 + contrastPapel≥75 → pisoPerfecto (todas o ninguna)", () => {
      const cal: PageQualityV2 = { ...CALIDAD, sharpnessHi: 95, contrastPapel: 80 };
      const si = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif(),
        esquinas: OK,
        ladoEsquina: null,
        calidad: cal,
      });
      expect(si.pisoPerfecto).toBe(true);
      const cal2: PageQualityV2 = { ...CALIDAD, sharpnessHi: 95, contrastPapel: 74.9 };
      const no = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif(),
        esquinas: OK,
        ladoEsquina: null,
        calidad: cal2,
      });
      expect(no.pisoPerfecto).toBe(false);
    });

    test("score base: bruto 10 con level excellent · piso-10 JAMÁS vence al techo poor (6.4)", () => {
      const cal10: PageQualityV2 = {
        sharpness: 100,
        brightness: 100,
        contrast: 100,
        label: "excellent",
        sharpnessHi: 100,
        contrastPapel: 100,
        level: "excellent",
      };
      const r10 = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif(),
        esquinas: OK,
        ladoEsquina: null,
        calidad: cal10,
      });
      expect(r10.scoreBase).toBe(10);

      const calPoor: PageQualityV2 = {
        sharpness: 100,
        brightness: 100,
        contrast: 100,
        label: "poor",
        sharpnessHi: 100, // === sharpness → scoreDeCalidad NO recalcula el level
        contrastPapel: 80, // ≤ contrast → ídem · ≥75 → pisoPerfecto TRUE
        level: "poor",
      };
      const rPoor = caracterizarLectura({
        texto: TEXTO_ANCLAS,
        clasificacion: clasif(),
        esquinas: OK,
        ladoEsquina: null,
        calidad: calPoor,
      });
      expect(rPoor.pisoPerfecto).toBe(true);
      // lección §G3 del kit luz-sim-puntos: el piso (10) NO vence al techo
      // poor — scoreDeCalidad aplica min(score, 6.4) DESPUÉS del piso.
      expect(rPoor.scoreBase).toBe(6.4);
    });
  });

  // ── evidenciaBordeDe (log §3c — AC8) ───────────────────────────────────

  describe("evidenciaBordeDe (segmento del guard-borde)", () => {
    test("null → '' (escaneo sin verificación: fotos/SIM/escaneo)", () => {
      expect(evidenciaBordeDe(null)).toBe("");
    });
    test("sin sospecha → '' (AC8: el log queda como hoy)", () => {
      expect(evidenciaBordeDe({ sospecha: "" } as ResultadoCompletitud)).toBe("");
    });
    test("con sospecha → borde/tintaFilo/franja/fondo (y perdon= al final si hubo)", () => {
      const v = {
        sospecha: "S|E",
        tintaFilo: true,
        densidades: [20.0, 3.5],
        fondo: false,
        perdonLado: "",
      } as ResultadoCompletitud;
      expect(evidenciaBordeDe(v)).toBe(" borde=S|E tintaFilo=true franja=[20.0,3.5] fondo=false");
      const v2 = { ...v, perdonLado: "N|O" } as ResultadoCompletitud;
      expect(evidenciaBordeDe(v2)).toBe(" borde=S|E tintaFilo=true franja=[20.0,3.5] fondo=false perdon=N|O");
    });
  });

  // ── trazaDesenlaceComun (cola del log de auditoría — valores dorados) ──

  describe("trazaDesenlaceComun (formato D51 congelado — cola común)", () => {
    const desenlaceNull = { clasificacion: null } as SalidaDesenlace;
    const diag = { actaId: "a1" } as unknown as Parameters<typeof trazaDesenlaceComun>[0]["diag"];

    test("estilo ESCANEO: tokens sim/detección + diag + quad con origen", () => {
      const s = trazaDesenlaceComun({
        votosSkipPag2: false,
        densidadVotosPct: 12.34,
        marcadoresOk: false,
        recortada: true,
        ladoEsquina: "sup-izq",
        lazoPerdonado: true,
        trazaEsq: "FALTA_tl",
        evidenciaSitio: " recorte=as-is borde=S tintaFilo=true",
        quad: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
          { x: 0.5, y: 0.6 },
          { x: 0.7, y: 0.8 },
        ],
        quadOrigen: "worker",
        pisoPerfecto: true,
        score: 8.5,
        filtro: "bw",
        ocrIn: "original",
        confOcr: 0.912,
        detOcr: 123.6,
        recOcr: 45.4,
        senal: { nivel: "FUERTE", chars: 200, anclas: 9 },
        desenlace: desenlaceNull,
        infoCrop: { w: 800, h: 600, fallback: false },
        calidad: CALIDAD,
        ocrLegible: true,
        extrasSim: " sim=8.2",
        extrasDeteccion: " detectOrigen=worker detectReintento=1",
        diag: diag,
      });
      expect(s).toBe(
        "votos=12.3% SIN_VOTOS recortada=1 lado=sup-izq lazo=perdonado" +
          " esquinas=FALTA_tl recorte=as-is borde=S tintaFilo=true" +
          " quad=[0.100,0.200 0.300,0.400 0.500,0.600 0.700,0.800] piso10=1 origen=worker" +
          " score=8.5 filtro=bw ocrIn=original" +
          " ocr=rapidocr conf=0.91 det=124ms rec=45ms" +
          " lectura=FUERTE anclas=9 piso=true" +
          " clasif={sin-clasificar} crop=800x600" +
          " metricas={sharpness:50.5 brightness:70.25 contrast:60.1 contEff:80 level:good})" +
          " sim=8.2 diag=1" +
          " detectOrigen=worker detectReintento=1",
      );
    });

    test("estilo RECORTE: skip-pag2, escudo-manual, sin sim/detección, crop=full, ClasifDebil", () => {
      const clas = clasif({
        departamento: { codigo: "88", nombre: "e" },
        municipio: { codigo: "335", nombre: "m" },
        zona: { codigo: "05" },
        puesto: { codigo: "02", nombre: "p" },
        mesa: 1,
        tipo: "TRANSMISION",
        pagina: { index: 2, total: 2 },
        nivel: "MANUAL",
        clasifDebil: "puesto-lugar",
      });
      const s = trazaDesenlaceComun({
        votosSkipPag2: true,
        densidadVotosPct: 0,
        marcadoresOk: true,
        recortada: false,
        ladoEsquina: null,
        lazoPerdonado: false,
        trazaEsq: "OK",
        evidenciaSitio: " manual=1 escudo-manual=1",
        quad: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        quadOrigen: null,
        pisoPerfecto: false,
        score: 7.9,
        filtro: "original",
        ocrIn: "bw-fallback",
        confOcr: null,
        detOcr: 0,
        recOcr: 0,
        senal: { nivel: "DEBIL", chars: 5, anclas: 0 },
        desenlace: { clasificacion: clas } as SalidaDesenlace,
        infoCrop: { w: 800, h: 600, fallback: true },
        calidad: { ...CALIDAD, sharpness: 10, brightness: 20.5, contrast: 30.25, level: "poor" },
        ocrLegible: false,
        extrasSim: "",
        extrasDeteccion: "",
        diag: null,
      });
      expect(s).toBe(
        "votos=skip-pag2 esquinas=OK manual=1 escudo-manual=1" +
          " quad=[0.000,0.000 1.000,0.000 1.000,1.000 0.000,1.000] piso10=0" +
          " score=7.9 filtro=original ocrIn=bw-fallback" +
          " ocr=rapidocr conf=? det=0ms rec=0ms" +
          " lectura=DEBIL anclas=0 piso=false" +
          " clasif={dep:88,mun:335,zon:05,std:02,mesa:001,pag:2/2,tipo:T,nivel:MANUAL} crop=full" +
          " metricas={sharpness:10 brightness:20.5 contrast:30.25 contEff:30.25 level:poor})" +
          " ClasifDebil=puesto-lugar",
      );
    });
  });

  // ── construirDiagnosticoSitio (payload del desenlace ×2 → ×1) ──────────

  describe("construirDiagnosticoSitio (payload R7b M4 con diferencias de sitio)", () => {
    const base = {
      desenlace: {
        score: 8.2,
        status: "OPTIMA",
        rechazo: null,
        clasificacion: null,
        marcadoresOk: true,
        techosDiag: ["techo-fair:7.9"],
      } as unknown as SalidaDesenlace,
      rechazoFinal: null,
      scoreVisual: 9,
      scoreFinal: 8.2,
      techosDiag: ["techo-fair:7.9"],
      calidad: CALIDAD,
      texto: "E-14 ACTA",
      ocrLegible: true,
      senal: { nivel: "FUERTE" as const, chars: 9, anclas: 9 },
      senalActa: true,
      completa: true,
      recortada: false,
      ladoEsquina: null,
      marcadores: { densidadVotosPct: 12.5, hayVotos: true },
      marcadoresOk: true,
      votosSkipPag2: false,
      procesadaVacia: false,
      motor: "worker",
      infoCrop: { w: 800, h: 600, fallback: false },
      quad: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ] as Quad,
      quadOrigen: "worker" as const,
      ms: { proceso: 10, procesoBw: 4, procesoOcr: 6, calidad: 2, ocr: 100, total: 112 },
    };

    test("sitio ESCANEO: gateMarco presente (null), decode/detect persisten, actaId parchable", () => {
      const d = construirDiagnosticoSitio({
        ...base,
        sitio: {
          actaId: "",
          intento: 2,
          maxIntentos: 4,
          gateMarco: null,
          fondo: false,
          filtro: "bw",
          decodeMs: 33, // el caller estampa Math.round(ms.decode) — ya redondeado
          detectMs: null, // sinRecorte → detect no corrió → null honesto (caller)
        },
      });
      expect(d.actaId).toBe("");
      expect(d.intento).toBe(2);
      expect(d.maxIntentos).toBe(4);
      expect("gateMarco" in d.gate).toBe(true);
      expect(d.gate.gateMarco).toBeNull();
      expect(d.tiempos.decodeMs).toBe(33); // pasa tal cual (el caller redondea)
      expect(d.tiempos.detectMs).toBeNull();
      expect(d.tiempos.procesoBwMs).toBe(4);
      expect(d.tiempos.procesoOcrMs).toBe(6);
      expect(d.gate.votos).toEqual({ densidadPct: 12.5, skipPag2: false, ok: true });
      expect(d.gate.clasifNivel).toBe("—"); // desenlace.clasificacion null
      expect(d.captura.crop).toEqual({ w: 800, h: 600, fallback: false });
      expect(d.metricas.contrasteEfectivo).toBe(80); // max(60.1, 30, 80 legible)
      expect(d.lectura.chars).toBe("E-14 ACTA".length);
      expect(d.lectura.nivel).toBe("FUERTE");
      expect(d.lectura.anclas).toBe(9);
      expect(d.ocrValido).toBe(true);
    });

    test("sitio RECORTE: gateMarco AUSENTE (undefined → la clave no viaja), decode/detect null/null", () => {
      const d = construirDiagnosticoSitio({
        ...base,
        sitio: {
          actaId: "acta-123",
          intento: 1,
          maxIntentos: 3,
          gateMarco: undefined,
          fondo: true,
          filtro: "original",
          decodeMs: null,
          detectMs: null,
        },
      });
      expect(d.actaId).toBe("acta-123");
      expect("gateMarco" in d.gate).toBe(false); // byte a byte como hoy (R7b M4)
      expect(d.gate.fondo).toBe(true);
      expect(d.captura.filtro).toBe("original");
      expect(d.tiempos.decodeMs).toBeNull();
      expect(d.tiempos.detectMs).toBeNull();
      expect(d.tiempos.procesoBwMs).toBe(4);
    });
  });
});
