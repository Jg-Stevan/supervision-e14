/**
 * KIT perfil-recursos-v1 — plan de recursos RECOMENDADO por dispositivo.
 *
 * La parte "APROVECHAR" de la petición del dueño: no basta con degradar en
 * gama baja (lo hace la capa adaptativa D74) — un dispositivo ALTO debe
 * poder RENDIR más (más workers, más hilos OCR, precalor ampliado, más
 * caché, precarga de modelos) y un celular debe UI distinta a un PC.
 *
 * D6: esto es un CATÁLOGO — el panel lo muestra y los módulos lo consumen
 * de forma ACOTADA y REVOCABLE (cada consumidor decide; el override manual
 * del dueño manda siempre). Nada aquí configura la app solo.
 *
 * Tabla base = flags/defaults del pipeline (FLAGS_DEFAULT + gama.ts BASE).
 */
import type { FilaRecomendacion, PlanRecursos, RecursoSenales, Tier } from "../domain/tipos";

export function planRecomendado(tier: Tier, senales: RecursoSenales | null): PlanRecursos {
  try {
    const esBajo = tier === "BAJO";
    const esAlto = tier === "ALTO";
    const forma = senales?.forma ?? "desconocido";
    const esMovil = forma === "celular" || forma === "tablet";
    const redDebil =
      senales?.sync.saveData === true ||
      (senales?.sync.redTipo !== null && senales?.sync.redTipo !== undefined && senales.sync.redTipo !== "4g");

    const poolWorkers = esBajo ? 1 : esAlto ? 2 : 1;
    const ocrThreads = esBajo ? 2 : 4;
    const masterLadoMayor = esBajo ? 3072 : 4032;
    const precalorCola = esBajo ? 1 : esAlto ? 3 : 2;
    const qrLadoLargo = esBajo ? 1600 : 2048;
    const cacheThumbsMB = esBajo ? 32 : esAlto ? 128 : 64;
    const preloadModelos = !esBajo;
    const animaciones = esBajo ? "reducidas" : esAlto ? "completas" : "normales";
    const hilosWasmActivos = (senales?.runtime.wasmHilos ?? false) && !esBajo;

    const filas: FilaRecomendacion[] = [
      {
        parametro: "Workers del pool OCR",
        base: "1 (flag poolWorkers)",
        recomendado: `${poolWorkers}`,
        nota:
          esAlto
            ? "≥ 6 núcleos sin competencia: el segundo worker amortiza el arranque frío"
            : esBajo
              ? "Dos OCR en paralelo se reparten el mismo CPU sin ganancia y la UI sufre (e71)"
              : "Sin ganancia medida en gama media — se conserva el base",
      },
      {
        parametro: "Hilos de OCR",
        base: "4 (flag ocrThreadsTope)",
        recomendado: hilosWasmActivos ? `${ocrThreads} (hilos WASM ✓)` : `${ocrThreads}`,
        nota: hilosWasmActivos
          ? "El aislamiento COOP/COEP está activo: los wasm pueden usar hilos reales"
          : "Los wasm corren mono-hilo; con COOP/COEP (Cloudflare Pages) podrían usar hilos",
      },
      {
        parametro: "Lado mayor del master",
        base: "4032 px",
        recomendado: `${masterLadoMayor} px`,
        nota: esBajo
          ? "Pico de bitmap −42 % (≈ 38 MB vs 65 MB RGBA) donde el aborto por memoria domina"
          : "Calibración de escritorio — se conserva",
      },
      {
        parametro: "Precalor de masters en memoria",
        base: "3",
        recomendado: `${precalorCola}`,
        nota: esMovil ? "En móvil el pico de RAM es el riesgo dominante" : "Cola de calentamiento estándar",
      },
      {
        parametro: "Capa QR — lado largo",
        base: "2048 px",
        recomendado: `${qrLadoLargo} px`,
        nota: esBajo ? "La capa 0 sin QR media 15-17 s SYNC — con menos lado salta antes a zxing" : "Se conserva",
      },
      {
        parametro: "Caché de thumbnails",
        base: "— (según vista)",
        recomendado: `${cacheThumbsMB} MB`,
        nota: esAlto ? "Caché amplia: la bandeja no re-genera miniaturas al volver" : "Caché moderada para no competir por RAM",
      },
      {
        parametro: "Precarga de modelos (OCR/QR)",
        base: "al primer uso",
        recomendado: preloadModelos ? "precarga en idle" : "al primer uso",
        nota: esBajo
          ? "Precargar compite por memoria/red en dispositivos ajustados"
          : "Precarga en idle: la primera acta del día no paga el arranque frío",
      },
      {
        parametro: "Animaciones de UI",
        base: "completas",
        recomendado: animaciones,
        nota: esBajo ? "Menos re-raster en scroll de bandejas grandes" : "Coste de animación despreciable",
      },
      {
        parametro: "Sincronización de datos",
        base: "siempre",
        recomendado: redDebil ? "solo en wifi" : "siempre",
        nota: redDebil
          ? "Red lenta o saveData activo — evita consumir el plan del dueño"
          : "Red holgada",
      },
    ];

    return {
      tier,
      forma,
      filas,
      poolWorkers,
      ocrThreads,
      masterLadoMayor,
      precalorCola,
      qrLadoLargo,
      cacheThumbsMB,
      preloadModelos,
      animaciones,
      hilosWasmActivos,
      sincronizarSoloWifi: redDebil,
    };
  } catch {
    return {
      tier,
      forma: "desconocido",
      filas: [],
      poolWorkers: 1,
      ocrThreads: 4,
      masterLadoMayor: 4032,
      precalorCola: 3,
      qrLadoLargo: 2048,
      cacheThumbsMB: 64,
      preloadModelos: false,
      animaciones: "normales",
      hilosWasmActivos: false,
      sincronizarSoloWifi: false,
    };
  }
}
