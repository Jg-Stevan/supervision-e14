/**
 * RELOJ REAL de la jornada (ronda «reloj real») — pruebas del dominio.
 *
 * Regla del dueño: «local es colombia, país es el q emite» — el cierre
 * de cada puesto son las 4:00 p. m. HORA LOCAL del país emisor, en la
 * fecha de SU día de jornada de la semana actual (la de Colombia). El
 * instante de cierre se ancla con Intl; estas pruebas fijan:
 *
 *  1. El anclaje iterativo: formatear el instante de cierre EN LA ZONA
 *     del país devuelve exactamente 16:00 (propiedad fuerte para TODAS
 *     las zonas del catálogo — DST incluido).
 *  2. La conversión «Cierre COL» es hora real de Bogotá del cierre.
 *  3. `minutosDesdeCierreReal` es coherente con ese instante (negativo
 *     antes del cierre → NO INICIADO).
 *  4. El día de jornada EN CURSO según Colombia.
 *
 * Deterministas: epochs fijos — nada depende de Date.now() implícito.
 */
import { describe, expect, test } from "bun:test";

import {
  cierreColombiaDe,
  diaJornadaHoy,
  instanteCierreDeJornada,
  instanteDeLocal,
  minutosDesdeCierreReal,
  relojColombiaConSegundos,
  relojDeZona,
} from "../reloj-jornada";
import { normalizarNombre, zonaDePuesto } from "../zonas-emisor";
import { diaDeNombrePuesto } from "../jornada";

/** Los 4 epochs de prueba: días de la semana del 15-21 jun 2026 (el
 * ancla del calendario del demo) en varios momentos del día. */
const EPOCHS_PRUEBA = [
  Date.UTC(2026, 5, 15, 12, 0, 0), // lunes 15 jun 2026 12:00 UTC
  Date.UTC(2026, 5, 17, 22, 30, 0), // miércoles 17 jun 2026 22:30 UTC
  Date.UTC(2026, 5, 19, 2, 15, 0), // viernes 19 jun 2026 02:15 UTC
  Date.UTC(2026, 5, 21, 18, 0, 0), // domingo 21 jun 2026 18:00 UTC
];

/** Zonas representativas del catálogo (incluye DST y hemisferio sur). */
const ZONAS = [
  "Africa/Cairo",
  "Africa/Accra",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Santiago",
  "Asia/Baku",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Rome",
  "Pacific/Auckland",
];

describe("instanteDeLocal — anclaje 16:00 local del país emisor", () => {
  for (const zona of ZONAS) {
    test(`en ${zona}, el instante de cierre SON las 16:00 locales`, () => {
      for (const ahora of EPOCHS_PRUEBA) {
        const instante = instanteCierreDeJornada(zona, "DOMINGO", ahora);
        const partes = partesDeZonaRef(zona, instante);
        expect(partes.hora).toBe(16);
        expect(partes.minuto).toBe(0);
      }
    });
  }
});

describe("cierreColombiaDe — conversión REAL a hora de Colombia", () => {
  test("formato h:mm AM/PM parseable y coherente con el instante", () => {
    for (const zona of ZONAS) {
      for (const ahora of EPOCHS_PRUEBA) {
        const cierre = cierreColombiaDe(zona, "DOMINGO", ahora);
        expect(cierre).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
        const instante = instanteCierreDeJornada(zona, "DOMINGO", ahora);
        expect(cierre).toBe(relojColombiaRef(instante));
      }
    }
  });

  test("Japón cierra 14 horas antes que Colombia en hora COL", () => {
    // Asia/Tokyo = UTC+9 · America/Bogota = UTC-5 → 14 h de diferencia.
    const ahora = EPOCHS_PRUEBA[0];
    const tokio = instanteCierreDeJornada("Asia/Tokyo", "DOMINGO", ahora);
    const bogota = instanteCierreDeJornada("America/Bogota", "DOMINGO", ahora);
    // El DOMINGO es la misma fecha: Tokio 16:00 JST = 2:00 AM COL.
    expect(Math.round((bogota - tokio) / 3_600_000)).toBe(14);
  });
});

describe("minutosDesdeCierreReal — reloj real con signo", () => {
  test("una hora ANTES del cierre es negativa (NO INICIADO)", () => {
    const ahora = EPOCHS_PRUEBA[0];
    const instante = instanteCierreDeJornada("Asia/Tokyo", "DOMINGO", ahora);
    const minutos = minutosDesdeCierreReal(
      "Asia/Tokyo",
      "DOMINGO",
      instante - 3_600_000
    );
    expect(minutos).toBe(-60);
  });

  test("90 minutos DESPUÉS del cierre es positivo (amarillo)", () => {
    const ahora = EPOCHS_PRUEBA[0];
    const instante = instanteCierreDeJornada("Asia/Tokyo", "DOMINGO", ahora);
    const minutos = minutosDesdeCierreReal(
      "Asia/Tokyo",
      "DOMINGO",
      instante + 90 * 60_000
    );
    expect(minutos).toBe(90);
  });

  test("el día de jornada decide la SEMANA: LUNES es pasado desde el domingo", () => {
    // Domingo 21 jun: el LUNES de esta semana fue hace 6 días.
    const domingo = Date.UTC(2026, 5, 21, 18, 0, 0);
    const lunes = minutosDesdeCierreReal("Europe/Rome", "LUNES", domingo);
    // Lunes 15 jun 16:00 CEST → ~6 días después: crítico por tiempo real.
    expect(lunes).toBeGreaterThan(180);
  });
});

describe("relojDeZona — formato y coincidencia con Intl directo", () => {
  test("la hora del país emisor coincide con Intl independiente", () => {
    for (const zona of ["Asia/Tokyo", "Europe/Madrid", "America/Bogota"]) {
      for (const ahora of EPOCHS_PRUEBA) {
        expect(relojDeZona(zona, ahora)).toBe(relojColombiaRef(ahora, zona));
      }
    }
  });

  test("el reloj con segundos de Colombia lleva segundos y meridiem", () => {
    const reloj = relojColombiaConSegundos(Date.UTC(2026, 5, 21, 18, 5, 9));
    expect(reloj).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)$/);
  });
});

describe("diaJornadaHoy — la LOCAL es Colombia", () => {
  test("domingo UTC 21 jun 21:00 = domingo en Bogotá", () => {
    // 21:00 UTC = 16:00 COL (UTC-5) — mismo día.
    expect(diaJornadaHoy(Date.UTC(2026, 5, 21, 21, 0, 0))).toBe("DOMINGO");
  });

  test("lunes UTC 02:00 = domingo en Bogotá (día anterior)", () => {
    // 02:00 UTC del lunes = 21:00 del domingo en Colombia.
    expect(diaJornadaHoy(Date.UTC(2026, 5, 22, 2, 0, 0))).toBe("DOMINGO");
  });
});

describe("zonas-emisor — mapa país/ciudad → IANA", () => {
  test("los países del catálogo resuelven zona (sin fallback Bogotá salvo Colombia)", () => {
    for (const pais of ["JAPON", "EGIPTO", "ITALIA", "ESPANA", "ESTADOS UNIDOS", "GHANA", "BRASIL", "VENEZUELA"]) {
      expect(zonaDePuesto(pais, "CONSULADO")).not.toBe("America/Bogota");
    }
    expect(zonaDePuesto("JAPON", "LUNES TOKIO - CONSULADO")).toBe("Asia/Tokyo");
  });

  test("ciudades multizona refinan la zona (EE. UU. y amigos)", () => {
    expect(zonaDePuesto("ESTADOS UNIDOS", "MIAMI - CONSULADO")).toBe("America/New_York");
    // La ciudad PRINCIPAL del consulado manda (primer match): el anexo
    // «Los Angeles - Phoenix» vive en la zona del consulado de LA.
    expect(zonaDePuesto("ESTADOS UNIDOS", "Los Angeles - Phoenix")).toBe("America/Los_Angeles");
    expect(zonaDePuesto("ESTADOS UNIDOS", "SABADO HOUSTON - CONSULADO")).toBe("America/Chicago");
    expect(zonaDePuesto("ESTADOS UNIDOS", "San Francisco - Seattle")).toBe("America/Los_Angeles");
    expect(zonaDePuesto("CANADA", "Vancouver Consulado")).toBe("America/Vancouver");
    expect(zonaDePuesto("BRASIL", "Manaos - Consulado")).toBe("America/Manaus");
    expect(zonaDePuesto("MEXICO", "Cancún Consulado")).toBe("America/Cancun");
    expect(zonaDePuesto("AUSTRALIA", "Perth")).toBe("Australia/Perth");
  });

  test("normalizarNombre quita tildes y mayúscula", () => {
    expect(normalizarNombre("México")).toBe("MEXICO");
    expect(normalizarNombre("ESPAÑA")).toBe("ESPANA");
  });

  test("diaDeNombrePuesto + zona: el prefijo de día no confunde la ciudad", () => {
    const dia = diaDeNombrePuesto("LUNES MIAMI - CONSULADO");
    expect(dia).toBe("LUNES");
    expect(zonaDePuesto("ESTADOS UNIDOS", "LUNES MIAMI - CONSULADO")).toBe("America/New_York");
  });
});

describe("instanteDeLocal — casos adversos DST", () => {
  test("Santiago (hemisferio sur, DST junio) ancla 16:00 en invierno austral", () => {
    const instante = instanteDeLocal("America/Santiago", 2026, 6, 21, 960);
    const partes = partesDeZonaRef("America/Santiago", instante);
    expect(partes.hora).toBe(16);
    expect(partes.minuto).toBe(0);
  });

  test("Auckland (DST junio) ancla 16:00", () => {
    const instante = instanteDeLocal("Pacific/Auckland", 2026, 6, 21, 960);
    const partes = partesDeZonaRef("Pacific/Auckland", instante);
    expect(partes.hora).toBe(16);
    expect(partes.minuto).toBe(0);
  });
});

// ─── Referencias Intl (cálculo INDEPENDIENTE del módulo bajo prueba) ────────

function partesDeZonaRef(
  zona: string,
  t: number
): { hora: number; minuto: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = fmt.format(new Date(t)).split(":");
  return { hora: Number(h) % 24, minuto: Number(m) };
}

function relojColombiaRef(t: number, zona = "America/Bogota"): string {
  const d = new Date(t);
  const h24 = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      hour: "2-digit",
    }).format(d)
  );
  // Bun devuelve el minuto sin padding cuando es el único field — el
  // módulo SIEMPRE lo rellena ("9:00 PM"); la ref alinea su formato.
  const mm = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    minute: "2-digit",
  }).format(d);
  const sufijo = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm.padStart(2, "0")} ${sufijo}`;
}
