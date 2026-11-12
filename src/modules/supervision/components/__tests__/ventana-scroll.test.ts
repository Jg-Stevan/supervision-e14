/**
 * Tests de la VENTANA DE FILAS del monitor (P-25, plan 2026-11-12).
 *
 * Lógica PURA (sin DOM): alturas por fila (reales de abiertos, estimación de
 * cerrados), rango visible por sumas prefijas + búsqueda binaria, y el peso
 * de los espaciadores. Congela los invariantes que el render NO puede romper:
 *  · el scrollbar es HONESTO: arriba + ventana + abajo ≈ altura total real;
 *  · el rango visible cubre SIEMPRE el scrollport ± margen (jamás una fila
 *    visible sin montar);
 *  · O(log n) — el cálculo no escala con el catálogo (949 puestos).
 */
import { describe, expect, test } from "bun:test";

import {
  ALTURA_ABIERTA_ESTIMADA,
  ALTURA_CERRADA,
  alturasDeFilas,
  alturaDeEspaciador,
  rangoVisible,
} from "../ventana-scroll";

describe("alturasDeFilas — cerradas estimadas, abiertas reales", () => {
  test("cerradas usan la estimación de 49 px (h-12 + borde)", () => {
    const alturas = alturasDeFilas(5, new Set(), new Map());
    expect(alturas).toEqual([49, 49, 49, 49, 49]);
  });

  test("abiertas sin medición usan la estimación de abierto", () => {
    const alturas = alturasDeFilas(3, new Set([1]), new Map());
    expect(alturas[1]).toBe(ALTURA_ABIERTA_ESTIMADA);
    expect(alturas[0]).toBe(ALTURA_CERRADA);
  });

  test("abiertas CON medición real manda la real", () => {
    const alturas = alturasDeFilas(3, new Set([1]), new Map([[1, 780]]));
    expect(alturas[1]).toBe(780);
  });

  test("medición sucia (0/negativa) se descarta — estimación", () => {
    const alturas = alturasDeFilas(3, new Set([1]), new Map([[1, 0]]));
    expect(alturas[1]).toBe(ALTURA_ABIERTA_ESTIMADA);
  });
});

describe("rangoVisible — cobertura exacta del scrollport ± margen", () => {
  const N = 949;
  const alturas = alturasDeFilas(N, new Set(), new Map());

  test("arriba del todo: [0, viewport+1+margen)", () => {
    const r = rangoVisible(alturas, 0, 400, 12);
    expect(r.desde).toBe(0);
    // el px 400 cae dentro de la fila 8 (392..441): 8+1+margen 12
    expect(r.hasta).toBe(Math.floor(400 / ALTURA_CERRADA) + 1 + 12);
  });

  test("a mitad del catálogo: ventana acotada (~viewport/margen, jamás 949)", () => {
    const r = rangoVisible(alturas, 20_000, 400, 12);
    expect(r.hasta - r.desde).toBeLessThan(40);
    // la ventana está centrada cerca del índice correspondiente al scroll
    expect(r.desde).toBeGreaterThan(300);
    expect(r.hasta).toBeLessThan(N);
  });

  test("al fondo: hasta = total (jamás deja filas sin montar por el borde)", () => {
    const totalAltura = N * ALTURA_CERRADA;
    const r = rangoVisible(alturas, totalAltura - 200, 400, 12);
    expect(r.hasta).toBe(N);
  });

  test("altura variable (una abierta de 780 px) desplaza la ventana, no la rompe", () => {
    const alturas2 = alturasDeFilas(100, new Set([50]), new Map([[50, 780]]));
    // justo después de la fila abierta: la suma prefija la ubica bien
    const r = rangoVisible(alturas2, 50 * ALTURA_CERRADA + 780, 200, 6);
    // el px de scroll cae en la fila 51 (la abierta termina ahí): margen 6 arriba
    expect(r.desde).toBe(51 - 6);
    expect(r.hasta - r.desde).toBeLessThan(30);
  });

  test("catálogo vacío → [0,0) sin lanzar", () => {
    expect(rangoVisible([], 100, 400, 12)).toEqual({ desde: 0, hasta: 0 });
  });

  test("scroll negativo / viewport 0 → conservador sin lanzar", () => {
    const r = rangoVisible(alturas, -50, 0, 12);
    expect(r.desde).toBe(0);
    expect(r.hasta).toBeGreaterThan(0);
  });
});

describe("alturaDeEspaciador — el scrollbar honesto (arriba + ventana + abajo)", () => {
  test("espaciadores completan la altura total fuera de la ventana", () => {
    const alturas = alturasDeFilas(100, new Set([80]), new Map([[80, 500]]));
    const { desde, hasta } = rangoVisible(alturas, 0, 400, 12);
    const { arriba, abajo } = alturaDeEspaciador(alturas, desde, hasta);
    const ventana = alturas.slice(desde, hasta).reduce((a, b) => a + b, 0);
    expect(arriba + ventana + abajo).toBe(alturas.reduce((a, b) => a + b, 0));
  });

  test("ventana completa → espaciadores 0 (sin windowing no hay espaciador)", () => {
    const alturas = alturasDeFilas(10, new Set(), new Map());
    expect(alturaDeEspaciador(alturas, 0, 10)).toEqual({ arriba: 0, abajo: 0 });
  });
});
