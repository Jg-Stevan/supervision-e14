/**
 * DETERMINISMO DEL MOCK + invariante D21 + anclas + GOLDEN de KPIs (R3 —
 * red de tests C1, reporte 02a §2 «Mock determinístico por hash» e
 * «Invariantes» 1-2).
 *
 * Lo que esta red protege (hoy sin protección, 🔴-3 del reporte):
 * · el seed `divipola::puesto::<idEnlace>` y el ORDEN de draws (D43:
 *   horarioPorSeed consume EXACTAMENTE 3 draws — cierre COL, transcurrido,
 *   jitter quemado — para no desplazar el draw de estado, mock-repository.ts:149-170);
 * · los umbrales de distribución de estados (L99-104) y de tramos de
 *   tiempo (L116-121);
 * · la invariante D21: `total = completo + crítico + pendiente + no_iniciado`
 *   EXACTO en TODOS los puestos;
 * · las 3 ANCLAS forzadas (L189-198): Roma→CRÍTICO (8 mesas, acta #A92-F),
 *   El Cairo→COMPLETO (D26), Barcelona-Girona→COMPLETO (D44);
 * · GOLDEN del resumen agregado medido en el seed vigente:
 *   949 = 233 COMPLETO + 44 CRÍTICO + 198 PENDIENTE + 474 NO_INICIADO.
 *   (Los literales de DECISIONS D21 — 231/44/199/475 — corresponden a un
 *   seed anterior a las anclas D26/D44; el golden vive aquí desde ahora.)
 *
 * REGLA DEL GOLDEN: si un cambio LEGÍTIMO de seeds altera estos números,
 * el dueño debe actualizarlos aquí a conciencia — nunca en silencio.
 */
import { describe, expect, test } from "bun:test";

import { crearRandomDeterministico } from "@/modules/supervision/domain/acta";
import { CIERRE_LOCAL_MIN } from "@/modules/supervision/domain/tiempo-cierre";
import {
  mockSupervisionRepository,
  ID_ENLACE_CAIRO,
  ID_ENLACE_BARCELONA,
} from "@/modules/supervision/data/mock-repository";
import { ID_ENLACE_ROMA } from "@/modules/supervision/data/divipola-adapter";
import type { Puesto } from "@/modules/supervision/domain/types";

// ─── Referencia verbatim de mock-repository.ts (la contraparte de estos
// umbrales vive en el mock; si el mock cambia, este test lo delata) ────────

const CIERRES_COL_MIN_REF = [9 * 60, 10 * 60, 11 * 60, 12 * 60, 13 * 60];

function estadoPorSeedRef(random: number): Puesto["estadoGlobal"] {
  if (random < 0.05) return "CRITICO";
  if (random < 0.3) return "COMPLETO";
  if (random < 0.5) return "PENDIENTE";
  return "NO_INICIADO";
}

function transcurridoPorSeedRef(r: number): number {
  if (r < 0.3) return Math.floor((r / 0.3) * 59);
  if (r < 0.55) return 60 + Math.floor(((r - 0.3) / 0.25) * 59);
  if (r < 0.75) return 120 + Math.floor(((r - 0.55) / 0.2) * 59);
  return 180 + Math.floor(((r - 0.75) / 0.25) * 175);
}

/** "19:08" → "7:08 PM" (mock-repository.ts:124-131). */
function relojDeMinutosRef(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const sufijo = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${sufijo}`;
}

/** HORARIO_ROMA (mock-repository.ts:175-180) — ancla EXACTA del mockup. */
const HORARIO_ROMA_REF = {
  cierre: "9:00 AM",
  local: "7:08 PM",
  diferencia: "> 3 hrs",
  minutosDesdeCierre: 188,
} as const;

/** Re-derivación canónica del estado + horario de un puesto (D43): para
 * NO-anclas el PRNG consume 3 draws de horario y el 4.º decide el estado
 * (anclas Cairo/Barcelona: horario por seed, estado FUERZA COMPLETO sin
 * consumir el 4.º draw; Roma: ni horario ni estado por seed). */
function esperadoDeId(idEnlace: string): {
  estado: Puesto["estadoGlobal"];
  minutosDesdeCierre: number;
  horaActualLocal: string;
  horaCierreColombia: string;
} {
  if (idEnlace === ID_ENLACE_ROMA) {
    return {
      estado: "CRITICO",
      minutosDesdeCierre: HORARIO_ROMA_REF.minutosDesdeCierre,
      horaActualLocal: HORARIO_ROMA_REF.local,
      horaCierreColombia: HORARIO_ROMA_REF.cierre,
    };
  }
  const random = crearRandomDeterministico(`divipola::puesto::${idEnlace}`);
  const cierre = CIERRES_COL_MIN_REF[Math.floor(random() * CIERRES_COL_MIN_REF.length)];
  const transcurrido = transcurridoPorSeedRef(random());
  void random(); // D43 — tercer draw quemado
  return {
    estado:
      idEnlace === ID_ENLACE_CAIRO || idEnlace === ID_ENLACE_BARCELONA
        ? "COMPLETO"
        : estadoPorSeedRef(random()),
    minutosDesdeCierre: transcurrido,
    horaActualLocal: relojDeMinutosRef(CIERRE_LOCAL_MIN + transcurrido),
    horaCierreColombia: relojDeMinutosRef(cierre),
  };
}

describe("PRNG compartido (domain/acta.ts:106) — determinismo por seed", () => {
  test("misma seed → misma secuencia siempre", () => {
    const a = crearRandomDeterministico("divipola::puesto::88_495_010_02");
    const b = crearRandomDeterministico("divipola::puesto::88_495_010_02");
    const secuenciaA = [a(), a(), a(), a(), a()];
    const secuenciaB = [b(), b(), b(), b(), b()];
    expect(secuenciaA).toEqual(secuenciaB);
  });

  test("seeds distintas → secuencias distintas", () => {
    const a = crearRandomDeterministico("divipola::puesto::88_495_010_02");
    const b = crearRandomDeterministico("divipola::puesto::88_115_005_02");
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});

describe("mock determinístico — mismo idEnlace → mismo estado siempre (D21/D43)", () => {
  test(
    "los 949 puestos re-derivados desde su seed cuadran con el repo",
    async () => {
      const puestos = await mockSupervisionRepository.getPuestos();
      expect(puestos.length).toBe(949);
      const divergencias: string[] = [];
      for (const puesto of puestos) {
        const esperado = esperadoDeId(puesto.id);
        if (
          puesto.estadoGlobal !== esperado.estado ||
          puesto.minutosDesdeCierre !== esperado.minutosDesdeCierre ||
          puesto.horaActualLocal !== esperado.horaActualLocal ||
          puesto.horaCierreColombia !== esperado.horaCierreColombia
        ) {
          divergencias.push(puesto.id);
        }
      }
      expect(divergencias).toEqual([]);
    },
    20_000
  );

  test("dos lecturas consecutivas devuelven los mismos estados (sin drift)", async () => {
    const primera = await mockSupervisionRepository.getPuestos();
    const segunda = await mockSupervisionRepository.getPuestos();
    expect(segunda.map((p) => [p.id, p.estadoGlobal])).toEqual(
      primera.map((p) => [p.id, p.estadoGlobal])
    );
  }, 20_000);
});

describe("invariante D21 — total = completo + crítico + pendiente + no_iniciado", () => {
  test("getResumen: suma EXACTA sobre TODOS los puestos", async () => {
    const puestos = await mockSupervisionRepository.getPuestos();
    const resumen = await mockSupervisionRepository.getResumen();
    // Cada puesto cae en EXACTAMENTE uno de los 4 estados.
    for (const puesto of puestos) {
      expect(["COMPLETO", "CRITICO", "PENDIENTE", "NO_INICIADO"]).toContain(
        puesto.estadoGlobal
      );
    }
    expect(resumen.total).toBe(puestos.length);
    expect(
      resumen.completo + resumen.critico + resumen.pendiente + resumen.noIniciado
    ).toBe(resumen.total);
  }, 20_000);

  test("GOLDEN del seed vigente: 949 = 233 + 44 + 198 + 474", async () => {
    const resumen = await mockSupervisionRepository.getResumen();
    expect(resumen).toEqual({
      total: 949,
      completo: 233,
      critico: 44,
      pendiente: 198,
      noIniciado: 474,
    });
  }, 20_000);
});

describe("anclas forzadas (mock-repository.ts:189-198) — alcanzables siempre", () => {
  test("ancla Roma 88_495_010_02: CRÍTICO + horario EXACTO del mockup", async () => {
    const puestos = await mockSupervisionRepository.getPuestos();
    const roma = puestos.find((p) => p.id === ID_ENLACE_ROMA);
    expect(roma).toBeDefined();
    expect(roma?.estadoGlobal).toBe("CRITICO");
    expect(roma?.numeroMesas).toBe(8);
    expect(roma?.horaCierreColombia).toBe(HORARIO_ROMA_REF.cierre);
    expect(roma?.horaActualLocal).toBe(HORARIO_ROMA_REF.local);
    expect(roma?.minutosDesdeCierre).toBe(HORARIO_ROMA_REF.minutosDesdeCierre);
    expect(roma?.diferenciaTiempo).toBe(HORARIO_ROMA_REF.diferencia);
  }, 20_000);

  test("anclas El Cairo (D26) y Barcelona-Girona (D44): COMPLETO forzado", async () => {
    const puestos = await mockSupervisionRepository.getPuestos();
    const cairo = puestos.find((p) => p.id === ID_ENLACE_CAIRO);
    const barcelona = puestos.find((p) => p.id === ID_ENLACE_BARCELONA);
    expect(cairo?.estadoGlobal).toBe("COMPLETO");
    expect(barcelona?.estadoGlobal).toBe("COMPLETO");
  }, 20_000);

  test("Roma: 8 mesas; 001-003 EXACTAS del mockup (MESAS_ITALIA_MOCKUP)", async () => {
    const mesas = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_ROMA);
    expect(mesas.length).toBe(8);
    expect(mesas[0]).toEqual({
      id: "001",
      delegados: { p1: "ok", p2: "ok" },
      transmision: {
        p1: { estado: "ok" },
        p2: { estado: "ok", alerta: "Rescaneo" },
      },
      estadoMesa: "INCOMPLETO",
      ultimaCarga: "Hace 12 min",
      accionSugerida: "reinspeccionar",
    });
    expect(mesas[1]?.estadoMesa).toBe("EN_PROCESO");
    expect(mesas[1]?.ultimaCarga).toBe("Hace 45 min");
    expect(mesas[2]).toEqual({
      id: "003",
      delegados: { p1: "pendiente", p2: "pendiente" },
      transmision: {
        p1: { estado: "pendiente" },
        p2: { estado: "pendiente" },
      },
      estadoMesa: "NO_INICIADO",
      ultimaCarga: null,
      accionSugerida: "notificar",
    });
  }, 20_000);

  test("acta del ancla Roma mesa 001: #A92-F · 14:20 · historial 14:00/14:18/14:20", async () => {
    const acta = await mockSupervisionRepository.getActaDeMesa(ID_ENLACE_ROMA, "001");
    expect(acta).not.toBeNull();
    expect(acta?.id).toBe("#A92-F");
    expect(acta?.mesaId).toBe("001");
    expect(acta?.puestoId).toBe(ID_ENLACE_ROMA);
    expect(acta?.horaCarga).toBe("14:20 LOCAL");
    expect(acta?.motivo).toBe("SOLICITUD DE RESCANEO");
    expect(acta?.historial.map((evento) => evento.hora)).toEqual([
      "14:20 LOCAL",
      "14:18 LOCAL",
      "14:00 LOCAL",
    ]);
    expect(acta?.formularios.TRANSMISION.map((p) => p.estado)).toEqual([
      "VALIDA",
      "ADVERTENCIA",
    ]);
    // D44: la paginación DELEGADOS sale del registro REAL del loader —
    // 2 páginas CÓNSUL/EMBAJADOR en el ancla Roma (ambas VALIDA).
    expect(acta?.formularios.DELEGADOS.map((p) => p.estado)).toEqual([
      "VALIDA",
      "VALIDA",
    ]);
  }, 20_000);

  test("mesas generadas EXACTAS al catálogo en anclas + muestra (kit SUP-3)", async () => {
    const roma = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_ROMA);
    const cairo = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_CAIRO);
    const barcelona = await mockSupervisionRepository.getMesasDePuesto(ID_ENLACE_BARCELONA);
    const accra = await mockSupervisionRepository.getMesasDePuesto("88_115_005_02");
    expect(roma.length).toBe(8);
    expect(cairo.length).toBe(1);
    expect(barcelona.length).toBe(3);
    expect(accra.length).toBe(1);
  }, 20_000);

  test("Σ numeroMesas de los 949 puestos = 3.670 (el catálogo manda)", async () => {
    const puestos = await mockSupervisionRepository.getPuestos();
    const mesas = puestos.reduce((suma, p) => suma + p.numeroMesas, 0);
    expect(mesas).toBe(3_670);
  }, 20_000);
});
