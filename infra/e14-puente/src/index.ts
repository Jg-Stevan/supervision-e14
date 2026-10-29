/**
 * e14-puente — hub de actas entre el digitalizador (digielect14 PWA) y el
 * panel de supervisión (supervision-e14).
 *
 * POST /actas   → recibe lotes de páginas de actas (EntradaActaMasiva) del PWA
 *                 y las UPSERTA en D1 (una fila por slot idEnlace+mesa+form+pg).
 * GET  /actas?desde=<epoch ms>&limite=<n> → feed incremental para el receptor.
 * GET  /salud   → ping.
 *
 * Contrato del lote POST:
 *   { dispositivo: string, actas: Entrada[] }
 * Entrada = {
 *   idEnlace, mesa, formulario: "TRANSMISION"|"DELEGADOS",
 *   paginaIndex, paginaTotal, srcFoto: string|null (dataURL),
 *   impresion: {consulado,pais,zona,puesto,mesa,lugar,barcode?,etiquetaFormulario?},
 *   nombreArchivo, score, statusActa
 * }
 */

export interface Env {
  DB: D1Database;
}

// ─── CORS (reflect con allowlist) ───────────────────────────────────────────

const ORIGEN_OK =
  /^(https?:\/\/([a-z0-9-]+\.)*(digielect14|supervision-e14)\.pages\.dev|https?:\/\/([a-z0-9-]+\.)*julistevan02\.workers\.dev|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https?:\/\/([a-z0-9-]+\.)*jg-stevan\.github\.io)$/i;

function cabecerasCors(request: Request): Record<string, string> {
  const origen = request.headers.get("origin") ?? "";
  const h: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
  if (origen && ORIGEN_OK.test(origen)) {
    h["access-control-allow-origin"] = origen;
    h.vary = "origin";
  }
  return h;
}

function json(request: Request, cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cabecerasCors(request) },
  });
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

function entero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

async function sha256Hex(textoPlano: string): Promise<string> {
  const bytes = new TextEncoder().encode(textoPlano);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Validación de una entrada ──────────────────────────────────────────────

export interface EntradaValida {
  hash: string;
  dispositivo: string;
  idEnlace: string;
  mesa: string;
  formulario: string;
  paginaIndex: number;
  paginaTotal: number;
  srcFoto: string | null;
  impresionJson: string;
  nombreArchivo: string;
  score: number;
  statusActa: string;
  ts: number;
}

const TOPE_FOTO = 1_800_000; // caracteres del dataURL (D1: valor máx ~2 MB)

async function validarEntrada(
  bruta: unknown,
  dispositivo: string,
  ts: number,
): Promise<{ ok: true; entrada: EntradaValida } | { ok: false; motivo: string }> {
  if (typeof bruta !== "object" || bruta === null) {
    return { ok: false, motivo: "entrada no es objeto" };
  }
  const e = bruta as Record<string, unknown>;

  const idEnlace = texto(e.idEnlace, 64);
  if (!idEnlace) return { ok: false, motivo: "idEnlace inválido" };

  const mesa = texto(e.mesa, 8);
  if (!mesa) return { ok: false, motivo: "mesa inválida" };

  const formulario = texto(e.formulario, 16);
  if (formulario !== "TRANSMISION" && formulario !== "DELEGADOS") {
    return { ok: false, motivo: "formulario inválido" };
  }

  const paginaIndex = entero(e.paginaIndex, 1, 999);
  if (paginaIndex === null) return { ok: false, motivo: "paginaIndex inválido" };
  const paginaTotal = entero(e.paginaTotal, 1, 99);
  if (paginaTotal === null) return { ok: false, motivo: "paginaTotal inválido" };
  if (paginaIndex > paginaTotal) return { ok: false, motivo: "paginaIndex > paginaTotal" };

  let srcFoto: string | null = null;
  if (e.srcFoto !== null && e.srcFoto !== undefined && e.srcFoto !== "") {
    if (typeof e.srcFoto !== "string" || !e.srcFoto.startsWith("data:image/")) {
      return { ok: false, motivo: "srcFoto no es dataURL de imagen" };
    }
    if (e.srcFoto.length > TOPE_FOTO) {
      return { ok: false, motivo: `srcFoto excede el tope (${e.srcFoto.length} > ${TOPE_FOTO})` };
    }
    srcFoto = e.srcFoto;
  }

  const imp = e.impresion;
  if (typeof imp !== "object" || imp === null) {
    return { ok: false, motivo: "impresion ausente" };
  }
  const i = imp as Record<string, unknown>;
  const impresion = {
    consulado: texto(i.consulado, 16) ?? "",
    pais: texto(i.pais, 64) ?? "",
    zona: texto(i.zona, 16) ?? "",
    puesto: texto(i.puesto, 16) ?? "",
    mesa: texto(i.mesa, 8) ?? mesa,
    lugar: texto(i.lugar, 128) ?? "",
    barcode: texto(i.barcode, 64) ?? undefined,
    etiquetaFormulario: texto(i.etiquetaFormulario, 32) ?? undefined,
  };

  const nombreArchivo = texto(e.nombreArchivo, 128) ?? "E14.png";
  const score = typeof e.score === "number" && Number.isFinite(e.score)
    ? Math.min(Math.max(e.score, 0), 10)
    : 0;
  const statusActa = texto(e.statusActa, 32) ?? "DESCONOCIDO";

  const hash = await sha256Hex(
    [
      dispositivo,
      idEnlace,
      mesa,
      formulario,
      String(paginaIndex),
      nombreArchivo,
      String(srcFoto ? srcFoto.length : 0),
      srcFoto ? srcFoto.slice(0, 512) : "",
      srcFoto ? srcFoto.slice(-256) : "",
    ].join("|"),
  );

  return {
    ok: true,
    entrada: {
      hash,
      dispositivo,
      idEnlace,
      mesa,
      formulario,
      paginaIndex,
      paginaTotal,
      srcFoto,
      impresionJson: JSON.stringify(impresion),
      nombreArchivo,
      score,
      statusActa,
      ts,
    },
  };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function postActas(request: Request, env: Env): Promise<Response> {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return json(request, { ok: false, error: "JSON_INVALIDO" }, 400);
  }
  if (typeof cuerpo !== "object" || cuerpo === null) {
    return json(request, { ok: false, error: "CUERPO_NO_OBJETO" }, 400);
  }
  const c = cuerpo as Record<string, unknown>;
  const dispositivo = texto(c.dispositivo, 64);
  if (!dispositivo) return json(request, { ok: false, error: "DISPOSITIVO_INVALIDO" }, 400);
  if (!Array.isArray(c.actas) || c.actas.length === 0) {
    return json(request, { ok: false, error: "LOTE_VACIO" }, 400);
  }
  if (c.actas.length > 10) {
    return json(request, { ok: false, error: "LOTE_GRANDE (tope 10)" }, 413);
  }

  const ts = Date.now();
  const validas: EntradaValida[] = [];
  const rechazadas: { indice: number; motivo: string }[] = [];
  for (let idx = 0; idx < c.actas.length; idx++) {
    const r = await validarEntrada(c.actas[idx], dispositivo, ts);
    if (r.ok) validas.push(r.entrada);
    else rechazadas.push({ indice: idx, motivo: r.motivo });
  }

  let insertadas = 0;
  try {
    for (const a of validas) {
      const r = await env.DB.prepare(
        `INSERT INTO actas_publicadas
           (hash, dispositivo, id_enlace, mesa, formulario, pagina_index, pagina_total,
            src_foto, impresion_json, nombre_archivo, score, status_acta, ts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id_enlace, mesa, formulario, pagina_index) DO UPDATE SET
           hash = excluded.hash,
           dispositivo = excluded.dispositivo,
           pagina_total = excluded.pagina_total,
           src_foto = excluded.src_foto,
           impresion_json = excluded.impresion_json,
           nombre_archivo = excluded.nombre_archivo,
           score = excluded.score,
           status_acta = excluded.status_acta,
           ts = excluded.ts`,
      )
        .bind(
          a.hash,
          a.dispositivo,
          a.idEnlace,
          a.mesa,
          a.formulario,
          a.paginaIndex,
          a.paginaTotal,
          a.srcFoto,
          a.impresionJson,
          a.nombreArchivo,
          a.score,
          a.statusActa,
          a.ts,
        )
        .run();
      insertadas += r.meta?.changes ?? 0;
    }
  } catch (err) {
    return json(
      request,
      { ok: false, error: "D1_INDISPONIBLE", detalle: String(err).slice(0, 200) },
      500,
    );
  }

  return json(request, {
    ok: true,
    recibidas: c.actas.length,
    publicadas: validas.length,
    insertadas,
    rechazadas,
  });
}

interface FilaD1 {
  hash: string;
  dispositivo: string | null;
  id_enlace: string;
  mesa: string;
  formulario: string;
  pagina_index: number;
  pagina_total: number;
  src_foto: string | null;
  impresion_json: string | null;
  nombre_archivo: string | null;
  score: number | null;
  status_acta: string | null;
  ts: number;
}

async function getActas(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const desde = entero(url.searchParams.get("desde"), 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const limite = Math.min(
    entero(url.searchParams.get("limite"), 1, 500) ?? 200,
    500,
  );
  try {
    const { results } = await env.DB.prepare(
      `SELECT hash, dispositivo, id_enlace, mesa, formulario, pagina_index, pagina_total,
              src_foto, impresion_json, nombre_archivo, score, status_acta, ts
       FROM actas_publicadas
       WHERE ts > ?1
       ORDER BY ts ASC
       LIMIT ?2`,
    )
      .bind(desde, limite)
      .all<FilaD1>();

    const actas = (results ?? []).map((f) => ({
      hash: f.hash,
      dispositivo: f.dispositivo,
      ts: f.ts,
      idEnlace: f.id_enlace,
      mesa: f.mesa,
      formulario: f.formulario === "DELEGADOS" ? "DELEGADOS" : "TRANSMISION",
      paginaIndex: f.pagina_index,
      paginaTotal: f.pagina_total,
      srcFoto: f.src_foto,
      impresion:
        f.impresion_json != null
          ? safeJson(f.impresion_json)
          : { consulado: "", pais: "", zona: "", puesto: "", mesa: f.mesa, lugar: "" },
      nombreArchivo: f.nombre_archivo ?? "E14.png",
      score: f.score ?? 0,
      statusActa: f.status_acta ?? "DESCONOCIDO",
    }));

    return json(request, { ok: true, ahora: Date.now(), total: actas.length, actas });
  } catch (err) {
    return json(
      request,
      { ok: false, error: "D1_INDISPONIBLE", detalle: String(err).slice(0, 200) },
      500,
    );
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cabecerasCors(request) });
    }

    if (url.pathname === "/salud" && request.method === "GET") {
      return json(request, { ok: true, servicio: "e14-puente", ts: Date.now() });
    }

    if (url.pathname === "/actas" && request.method === "POST") {
      return postActas(request, env);
    }

    if (url.pathname === "/actas" && request.method === "GET") {
      return getActas(request, env);
    }

    return json(request, { ok: false, error: "RUTA_DESCONOCIDA" }, 404);
  },
};
