/**
 * Tests R5 (M-1 de 03b-digitalizador-masiva) — guard de comprimidos de
 * `archivos.ts`: streaming unzip con topes de bytes y ratio-guard.
 *
 * Doctrina del conservador que se verifica aquí: los rechazos son FILAS
 * TRAZABLES (TOPE_BYTES_ENTRADA / RATIO_SOSPECHOSO / TOPE_BYTES_COMPRIMIDO /
 * LIMITE_500_POR_COMPRIMIDO / ARCHIVO_ANIDADO) que jamás tumban la cola;
 * los throws quedan reservados a lo ilegible/protegido/corrupto (patrón del
 * kit T2.2 — el store es quien los convierte en fila).
 *
 * Fixtures GENERADOS EN RUNTIME con fflate (zipSync) — nada binario en el
 * repo. La alta ratio se fabrica con datos muy repetitivos (2 MB de ceros →
 * deflate la deja en ~2 KB → ratio ≈1000 > 100 con el piso de 1 MB cubierto).
 */
import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";

import {
  extraerArchivo,
  type ErrorExtraccion,
  type OpcionesGuardaR5,
} from "@/modules/digitalizador/lib/e14/masiva/archivos";

/** File .zip desde un Record de entradas (fixtures en runtime). */
function zipFile(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "lote.zip", { type: "application/zip" });
}

/** Motivos de las filas de error, en orden (para aserciones legibles). */
function motivos(errores: ErrorExtraccion[]): string[] {
  return errores.map((e) => e.motivo);
}

const CHICA = new Uint8Array(1000).fill(1); // 1000 B "fotos" sintéticas

/** `n` bytes pseudo-aleatorios (LCG): INCOMPRESIBLES por deflate (ratio ≈1)
 *  — para fixtures cuyo tamaño comprimido debe ser predecible. */
function ALEAT(n: number): Uint8Array {
  const u = new Uint8Array(n);
  let s = 0x9e3779b9;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    u[i] = s & 0xff;
  }
  return u;
}

describe("R5 — zip normal (comportamiento heredado intacto)", () => {
  test("extrae imágenes, deja fila de anidado y descarta no-imagen en silencio", async () => {
    const zip = zipFile({
      "acta1.jpg": CHICA,
      "sub/acta2.png": CHICA, // ruta interna → nombre plano
      "nota.txt": new Uint8Array(20), // no-imagen: sin fila
      "anidado.zip": new Uint8Array(50), // anidado: SU fila
    });
    const { archivos, errores } = await extraerArchivo(zip);
    expect(archivos.map((f) => f.name).sort()).toEqual(["acta1.jpg", "acta2.png"]);
    expect(motivos(errores)).toEqual(["ARCHIVO_ANIDADO"]);
    expect(errores[0]?.nombre).toBe("anidado.zip");
  });

  test("cap de 500 por comprimido: 501 entradas → 500 archivos + UNA fila", async () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 501; i++) entries[`f${i}.jpg`] = CHICA;
    const { archivos, errores } = await extraerArchivo(zipFile(entries));
    expect(archivos.length).toBe(500);
    expect(motivos(errores)).toEqual(["LIMITE_500_POR_COMPRIMIDO"]);
    expect(errores[0]?.nombre).toBe("lote.zip"); // la fila es del COMPRIMIDO
  });

  test("zip válido sin imágenes dentro → SIN_IMAGENES_DENTRO (throw del store)", async () => {
    const zip = zipFile({ "nota.txt": new Uint8Array(10) });
    expect(extraerArchivo(zip)).rejects.toThrow("SIN_IMAGENES_DENTRO");
  });
});

describe("R5 — ratio-guard (RATIO_SOSPECHOSO)", () => {
  test("entrada con ratio ≫100 (2 MB de ceros ≈ 2 KB) → rechazo trazable, sin extraer", async () => {
    // Datos MUY repetitivos: deflate la deja en ~0.1% → ratio ~1000 (>100,
    // con los 2 MB ≥ piso de 1 MB para que el ratio decida).
    const bomba = new Uint8Array(2 * 1024 * 1024).fill(0);
    const { archivos, errores } = await extraerArchivo(
      zipFile({ "bomba.jpg": bomba }),
    );
    expect(archivos).toEqual([]);
    expect(motivos(errores)).toEqual(["RATIO_SOSPECHOSO"]);
    expect(errores[0]?.nombre).toBe("bomba.jpg"); // traza POR ENTRADA
  });

  test("ratio normal (foto incompresible) pasa intacta", async () => {
    // Bytes pseudo-aleatorios: incompresibles → ratio ≈1.
    const foto = new Uint8Array(64 * 1024);
    for (let i = 0; i < foto.length; i++) foto[i] = (i * 2654435761) >>> 0 & 0xff;
    const { archivos, errores } = await extraerArchivo(
      zipFile({ "foto.jpg": foto }),
    );
    expect(archivos.length).toBe(1);
    expect(errores).toEqual([]);
  });
});

describe("R5 — techo por entrada (TOPE_BYTES_ENTRADA)", () => {
  const opcionesChicas: OpcionesGuardaR5 = { topeBytesEntrada: 500 };

  test("entrada que excede el techo → fila trazable", async () => {
    const { archivos, errores } = await extraerArchivo(
      zipFile({ "grande.jpg": CHICA }), // 1000 B > 500 B
      opcionesChicas,
    );
    expect(archivos).toEqual([]);
    expect(motivos(errores)).toEqual(["TOPE_BYTES_ENTRADA"]);
    expect(errores[0]?.nombre).toBe("grande.jpg");
  });

  test("es por ENTRADA: la chica se encola y la grande deja SU fila (no tumba la cola)", async () => {
    const { archivos, errores } = await extraerArchivo(
      zipFile({ "ok.jpg": new Uint8Array(100), "grande.jpg": CHICA }),
      opcionesChicas,
    );
    expect(archivos.map((f) => f.name)).toEqual(["ok.jpg"]);
    expect(motivos(errores)).toEqual(["TOPE_BYTES_ENTRADA"]);
    expect(errores[0]?.nombre).toBe("grande.jpg");
  });
});

describe("R5 — techo acumulado (TOPE_BYTES_COMPRIMIDO)", () => {
  test("el acumulado descomprimido que reventa el techo corta el stream + fila del comprimido", async () => {
    const { archivos, errores } = await extraerArchivo(
      zipFile({ "a.jpg": CHICA, "b.jpg": CHICA }), // 1000+1000 = 2000 > 1500
      { topeBytesComprimido: 1500 },
    );
    expect(archivos.length).toBe(1); // lo anterior al corte viaja PARCIAL
    expect(motivos(errores)).toEqual(["TOPE_BYTES_COMPRIMIDO"]);
    expect(errores[0]?.nombre).toBe("lote.zip"); // la fila es del COMPRIMIDO
  });
});

describe("R5 — corrupto/protegido (rechazo controlado, jamás throw suelto)", () => {
  test("bytes basura con nombre .zip → PROTEGIDO_O_CORRUPTO (capturable por el store)", async () => {
    const basura = new File([new Uint8Array(256).fill(7)], "roto.zip", {
      type: "application/zip",
    });
    expect(extraerArchivo(basura)).rejects.toThrow("PROTEGIDO_O_CORRUPTO");
  });

  test("zip truncado ANTES de la 1ª imagen completa → PROTEGIDO_O_CORRUPTO (capturable)", async () => {
    // Datos incompresibles (pseudo-aleatorios): 1000 B declarados ≈ 1000 B
    // reales → los cortes porcentuales caen DENTRO de los datos, no entre
    // entradas (con datos comprimibles las entradas son diminutas).
    const completo = zipSync({ "a.jpg": ALEAT(1000), "b.jpg": ALEAT(1000) });
    const truncado = new File([completo.slice(0, Math.floor(completo.length * 0.3))], "truncado.zip");
    expect(extraerArchivo(truncado)).rejects.toThrow("PROTEGIDO_O_CORRUPTO");
  });

  test("zip truncado tras la 1ª imagen → extracción PARCIAL + fila (jamás tumba lo logrado)", async () => {
    const completo = zipSync({ "a.jpg": ALEAT(1000), "b.jpg": ALEAT(1000) });
    // Corte DENTRO de los datos de b.jpg: a.jpg ya está completa.
    const truncado = new File([completo.slice(0, Math.floor(completo.length * 0.6))], "truncado.zip");
    const { archivos, errores } = await extraerArchivo(truncado);
    expect(archivos.map((f) => f.name)).toEqual(["a.jpg"]);
    expect(motivos(errores)).toEqual(["PROTEGIDO_O_CORRUPTO"]);
    expect(errores[0]?.nombre).toBe("truncado.zip");
  });
});
