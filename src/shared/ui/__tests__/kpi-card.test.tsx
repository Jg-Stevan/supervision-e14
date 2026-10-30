/**
 * Test de PARIDAD R2 — KpiCard compartido.
 *
 * El componente es UI (markup JSX): la paridad se fija a nivel de FUENTE —
 * este test compila la copia shared y el original re-exportado y verifica
 * que (a) el sitio original DELEGA en shared (mismo símbolo — identidad de
 * referencia) y (b) el render del sitio original es el MISMO elemento que
 * produce shared (server.renderToStaticMarkup — bun:test soporta React).
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { KpiCard as KpiCardShared } from "@/shared/ui/kpi-card";
// Consumidor del sitio original (después del re-export R2): importar desde
// el sitio original DEBE dar el MISMO símbolo (paridad de identidad).
import { KpiCard as KpiCardSitioOriginal } from "@/modules/supervision/components/kpi-card";

describe("paridad KpiCard (supervision/components/kpi-card.tsx → shared)", () => {
  test("el sitio original es el MISMO símbolo que shared (re-export)", () => {
    expect(KpiCardSitioOriginal).toBe(KpiCardShared);
  });

  test("render estático idéntico (sin onClick — div)", () => {
    const htmlShared = renderToStaticMarkup(
      <KpiCardShared titulo="TOTAL PUESTOS" valor={12} tono="neutral" />,
    );
    expect(htmlShared).toContain("TOTAL PUESTOS");
    expect(htmlShared).toContain("stats-number");
    expect(htmlShared).toContain("text-muted-foreground"); // apagado por neutral
    expect(htmlShared).toContain("var(--neutral-state)");
    expect(htmlShared.startsWith("<div")).toBe(true);
  });

  test("render estático idéntico (con onClick — button aria-pressed)", () => {
    const html = renderToStaticMarkup(
      <KpiCardShared titulo="ENVIADAS" valor={7} tono="success" onClick={() => {}} activo />,
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Quitar filtro"); // activo=true → label de quitar
    expect(html).toContain("var(--success)");
  });

  test("render estático idéntico (onClick sin activo — label de filtrar)", () => {
    const html = renderToStaticMarkup(
      <KpiCardShared titulo="ENVIADAS" valor={7} tono="success" onClick={() => {}} />,
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Filtrar por este estado");
  });
});
