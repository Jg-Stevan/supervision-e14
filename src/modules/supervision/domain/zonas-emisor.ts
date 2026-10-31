/**
 * Zona horaria del PAÍS EMISOR del E-14 — regla del dueño (ronda «reloj
 * real»): «local es colombia, país es el q emite». La hora del supervisor
 * (LOCAL) es Colombia (America/Bogota); la «Hora actual» del puesto es la
 * hora REAL del país que emite el acta, y el cierre de la digitalización
 * es 4:00 p. m. HORA LOCAL de ese país (kit monitor-jornada-v1).
 *
 * El demo no puede depender de una librería de zonas: este mapa traduce
 * el catálogo DIVIPOLA exterior (67 países, nombre sin transformar) a
 * zonas IANA que `Intl.DateTimeFormat` resuelve nativamente. Para los
 * países multizona (EE. UU., Canadá, Brasil, México, Australia, Chile)
 * la zona se refina con la CIUDAD del nombre real del puesto
 * («Miami - Hialeah», «Los Angeles - Phoenix», «Perth», …).
 *
 * Frontera de dominio: sin dependencias de librerías ni de CSS.
 */

/** Normaliza un nombre del catálogo: sin tildes/diacríticos, mayúsculas. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** País (normalizado) → zona IANA de su consulado principal. */
const ZONA_POR_PAIS: Record<string, string> = {
  GHANA: "Africa/Accra",
  ALEMANIA: "Europe/Berlin",
  ARGELIA: "Africa/Algiers",
  AZERBAIYAN: "Asia/Baku",
  CURAZAO: "America/Curacao",
  ARGENTINA: "America/Argentina/Buenos_Aires",
  ARUBA: "America/Aruba",
  AUSTRALIA: "Australia/Sydney",
  AUSTRIA: "Europe/Vienna",
  BELGICA: "Europe/Brussels",
  BOLIVIA: "America/La_Paz",
  BRASIL: "America/Sao_Paulo",
  CANADA: "America/Toronto",
  "COREA DEL SUR": "Asia/Seoul",
  "COSTA RICA": "America/Costa_Rica",
  CUBA: "America/Havana",
  CHILE: "America/Santiago",
  "CHINA REPUBLICA POPULAR": "Asia/Shanghai",
  DINAMARCA: "Europe/Copenhagen",
  ECUADOR: "America/Guayaquil",
  EGIPTO: "Africa/Cairo",
  "EL SALVADOR": "America/El_Salvador",
  "EMIRATOS ARABES UNIDOS": "Asia/Dubai",
  ESPANA: "Europe/Madrid",
  "ESTADOS UNIDOS": "America/New_York",
  "REPUBLICA DE FILIPINAS": "Asia/Manila",
  FINLANDIA: "Europe/Helsinki",
  FRANCIA: "Europe/Paris",
  GUATEMALA: "America/Guatemala",
  HAITI: "America/Port-au-Prince",
  "PAISES BAJOS": "Europe/Amsterdam",
  HONDURAS: "America/Tegucigalpa",
  HUNGRIA: "Europe/Budapest",
  INDIA: "Asia/Kolkata",
  INDONESIA: "Asia/Jakarta",
  INGLATERRA: "Europe/London",
  IRLANDA: "Europe/Dublin",
  ISRAEL: "Asia/Jerusalem",
  ITALIA: "Europe/Rome",
  JAMAICA: "America/Jamaica",
  JAPON: "Asia/Tokyo",
  KENIA: "Africa/Nairobi",
  LIBANO: "Asia/Beirut",
  MALASIA: "Asia/Kuala_Lumpur",
  MARRUECOS: "Africa/Casablanca",
  MEXICO: "America/Mexico_City",
  NICARAGUA: "America/Managua",
  "NUEVA ZELANDIA": "Pacific/Auckland",
  NORUEGA: "Europe/Oslo",
  PANAMA: "America/Panama",
  PARAGUAY: "America/Asuncion",
  PERU: "America/Lima",
  POLONIA: "Europe/Warsaw",
  PORTUGAL: "Europe/Lisbon",
  "PUERTO RICO": "America/Puerto_Rico",
  "REPUBLICA DOMINICANA": "America/Santo_Domingo",
  "REPUBLICA DE SINGAPUR": "Asia/Singapore",
  "REPUBLICA SOCIALISTA DE VIETNA": "Asia/Ho_Chi_Minh",
  RUSIA: "Europe/Moscow",
  SUDAFRICA: "Africa/Johannesburg",
  SUECIA: "Europe/Stockholm",
  SUIZA: "Europe/Zurich",
  TAILANDIA: "Asia/Bangkok",
  TURQUIA: "Europe/Istanbul",
  "TRINIDAD Y TOBAGO": "America/Port_of_Spain",
  URUGUAY: "America/Montevideo",
  VENEZUELA: "America/Caracas",
};

/**
 * Países multizona: la ciudad del nombre del puesto decide la zona. La
 * clave es un fragmento del nombre REAL del puesto (sin prefijo de día —
 * «LUNES MIAMI - CONSULADO» matchea por "MIAMI"). Primer match gana: las
 * claves más específicas van primero dentro de cada país.
 */
const CIUDADES_MULTIZONA: { pais: string; reglas: [string, string][] }[] = [
  {
    pais: "ESTADOS UNIDOS",
    reglas: [
      ["HAWAII", "Pacific/Honolulu"],
      ["ALASKA", "America/Anchorage"],
      ["LOS ANGELES", "America/Los_Angeles"],
      ["SAN FRANCISCO", "America/Los_Angeles"],
      ["SEATTLE", "America/Los_Angeles"],
      ["LAS VEGAS", "America/Los_Angeles"],
      ["SAN DIEGO", "America/Los_Angeles"],
      ["PHOENIX", "America/Phoenix"],
      ["SALT LAKE", "America/Denver"],
      ["DENVER", "America/Denver"],
      ["ALBUQUERQUE", "America/Denver"],
      ["CHICAGO", "America/Chicago"],
      ["HOUSTON", "America/Chicago"],
      ["DALLAS", "America/Chicago"],
      ["KANSAS", "America/Chicago"],
      ["MISSOURI", "America/Chicago"],
      ["MINNESOTA", "America/Chicago"],
      ["NUEVA ORLEANS", "America/Chicago"],
      ["OKLAHOMA", "America/Chicago"],
      ["SAN ANTONIO", "America/Chicago"],
      // El resto de consulados de EE. UU. es costa Este (default del país).
    ],
  },
  {
    pais: "CANADA",
    reglas: [
      ["VANCOUVER", "America/Vancouver"],
      ["CALGARY", "America/Edmonton"],
    ],
  },
  {
    pais: "BRASIL",
    reglas: [
      ["MANAOS", "America/Manaus"],
      ["TABATINGA", "America/Manaus"],
      ["FORTALEZA", "America/Fortaleza"],
      ["RECIFE", "America/Recife"],
    ],
  },
  {
    pais: "MEXICO",
    reglas: [
      ["CANCUN", "America/Cancun"],
    ],
  },
  {
    pais: "AUSTRALIA",
    reglas: [
      ["PERTH", "Australia/Perth"],
      ["BRISBANE", "Australia/Brisbane"],
    ],
  },
  {
    pais: "CHILE",
    reglas: [
      // Antofagasta/Iquique comparten zona con Santiago — sin excepciones.
    ],
  },
];

/**
 * Zona horaria IANA del país emisor de un puesto.
 * - `pais`: nombreMunicipio del catálogo (p. ej. "JAPON").
 * - `nombrePuesto`: nombre real del puesto (p. ej. "LUNES MIAMI - CONSULADO")
 *   — solo se usa para refinar países multizona.
 */
export function zonaDePuesto(pais: string, nombrePuesto: string): string {
  const paisNorm = normalizarNombre(pais);
  const reglas = CIUDADES_MULTIZONA.find((m) => m.pais === paisNorm);
  if (reglas) {
    const nombre = normalizarNombre(nombrePuesto);
    for (const [clave, zona] of reglas.reglas) {
      if (nombre.includes(clave)) return zona;
    }
  }
  return ZONA_POR_PAIS[paisNorm] ?? "America/Bogota";
}
