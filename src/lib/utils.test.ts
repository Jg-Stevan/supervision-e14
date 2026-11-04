import { describe, expect, test } from "bun:test";
import { cn } from "./utils";

/**
 * R1 — smoke de `cn` (clsx + tailwind-merge): el punto clave es que
 * resuelva COLISIONES de utilidades Tailwind quedándose con la última,
 * cosa que el paquete `cn@0.5.0` anterior (solo classnames) no hacía.
 */
describe("cn (src/lib/utils)", () => {
  test("resuelve colisiones de padding: la última gana", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("resuelve colisiones entre variantes (px/py vs p)", () => {
    expect(cn("px-2 py-2", "p-4")).toBe("p-4");
    expect(cn("p-4", "px-2")).toBe("p-4 px-2");
  });

  test("clsx: filtra falsy y combina condicionales", () => {
    expect(cn("base", false && "no", null, undefined, "otro")).toBe(
      "base otro",
    );
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });

  test("clases sin colisión se conservan todas", () => {
    expect(cn("flex", "items-center", "bg-red-500")).toBe(
      "flex items-center bg-red-500",
    );
  });
});
