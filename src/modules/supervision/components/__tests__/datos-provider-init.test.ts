/**
 * R9 (ola-3) — verificación de la ADOPCIÓN de `initSupervisionDatos()`
 * en el datos-provider (C1/R3 la hizo explícita e idempotente; la llamada
 * en el mount + banner BLOQUEADA era la propuesta R4 pendiente,
 * RESUMEN-ola-1 §4-3).
 *
 * El provider es UI con efectos (el banner nace de un setState en un
 * effect): `renderToStaticMarkup` NO ejecuta effects, así que la paridad
 * se fija a nivel de FUENTE (mismo patrón que la adopción documento-e14
 * en data/__tests__/validacion-d25.test.ts): la llamada explícita, el
 * manejo del Result y el banner accesible deben existir en el fuente.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/** Fuente del provider (ruta relativa a ESTE archivo de test). */
const RUTA_PROVIDER = join(import.meta.dir, "../datos-provider.tsx");

describe("datos-provider — initSupervisionDatos explícita + banner BLOQUEADA (R9)", () => {
  test("llama initSupervisionDatos() explícitamente en el mount (C1/R3)", async () => {
    const fuente = await Bun.file(RUTA_PROVIDER).text();
    expect(fuente).toMatch(/initSupervisionDatos\(\)/);
    // El Result se consume: ok → sigue; !ok → motivo al estado del banner.
    expect(fuente).toMatch(/resultadoInit\.ok/);
    expect(fuente).toMatch(/setMotivoBloqueo\(resultadoInit\.motivo\)/);
  });

  test("banner BLOQUEADA: accesible (role=alert) y con el motivo verbatim", async () => {
    const fuente = await Bun.file(RUTA_PROVIDER).text();
    expect(fuente).toMatch(/role="alert"/);
    expect(fuente).toMatch(/Datos de supervisión no disponibles/);
    // El motivo del Result se muestra (contrato del log — divipola-adapter).
    expect(fuente).toMatch(/\{motivoBloqueo\}/);
  });
});
