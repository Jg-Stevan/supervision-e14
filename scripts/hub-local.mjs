/**
 * HUB LOCAL — el receptor del puente de `digielect14` corriendo en tu máquina.
 *
 * PARA QUÉ: el flujo E2E real es «celular digitaliza → POST → panel de
 * supervisión lo muestra». En producción ese POST va al Worker
 * (`e14-puente.julistevan02.workers.dev`, ver `puente/envio.ts` del hermano).
 * Aquí se reemplaza ese Worker por un proceso local, sin tocar el código de
 * negocio de ninguno de los dos repos y SIN que ningún acta salga de la LAN
 * (regla de privacidad de AGENTS.md).
 *
 * UN ORIGEN, DOS FRONTS: servir las dos apps desde el mismo origen no es
 * cosmética — resuelve tres problemas a la vez:
 *   · la cámara del celular exige contexto SEGURO (`useSesionCamara` chequea
 *     `window.isSecureContext`); por HTTP de LAN la cámara está bloqueada.
 *   · si el móvil se sirve por HTTPS, un POST a `http://…` sería MIXED CONTENT
 *     y el navegador lo corta. Same-origin ⇒ no hay mixed content.
 *   · el CSP del supervisor fija `connect-src 'self' …` (`src/app/layout.tsx`);
 *     un hub en otro origen obligaría a relajar el CSP. Same-origin ⇒ intacto.
 *
 * RUTAS:
 *   GET  /…                estático del MÓVIL   (digielect14/out, basePath "")
 *   GET  /supervision/…    estático del PANEL   (supervision-e14/out, basePath /supervision)
 *   POST /v1/actas         ← { dispositivo, actas: EntradaPuente[] }  (tope 10)
 *   GET  /actas?desde=<seq> → { ok, ahora, total, hay, proximoSeq, generacion, actas[] }
 *                             (cursor por SEQ, exclusivo; `hay` = quedan filas
 *                             más allá de la página — drenaje del panel, C-06)
 *   (`/actas` en POST se acepta como alias del contrato viejo)
 *   GET  /foto/<seq>       la foto almacenada (mime VALIDADO en recepción)
 *   GET  /hub/estado       contadores en vivo (para el runbook; sin rutas de disco)
 *   POST /hub/reset        vacía el almacén (demo) — exige header
 *                          `x-hub-reset: confirmar` (segundo factor, C-01)
 *   DELETE /v1/actas/<seq> expurgo individual — exige header
 *                          `x-hub-admin: <clave>` (se imprime al arrancar, C-13)
 *
 * HARDENING (plan 2026-11-11, olas 0–1):
 *   · C-01 — toda ruta mutante valida origen+Host contra una lista fija
 *     construida al arrancar (anti-CSRF y anti DNS-rebinding).
 *   · C-02 — el cert TLS vive FUERA del almacén: el reset jamás lo borra.
 *   · C-03 — solo se aceptan fotos jpeg/png/webp base64; el mime servido en
 *     /foto/<seq> es el validado en recepción (jamás eco del dataURL); CSP +
 *     nosniff en TODAS las respuestas.
 *   · C-04 — cuota de filas/bytes (507) y rate limit por IP (429).
 *   · C-05 — las claves reservadas del sobre (seq/ts/dispositivo/hashHub) se
 *     sanitizan: la entrada jamás pisa metadatos del hub.
 *   · C-13 — DELETE con clave admin + auditoría expurgo.jsonl.
 *   · C-16 — `generacion` (UUID persistido) cambia en cada reset: el panel
 *     detecta el reinicio y re-sincroniza.
 *
 * USO:
 *   bun scripts/hub-local.mjs                 # https en :8443 + http en :8081
 *   bun scripts/hub-local.mjs --puerto 9443 --no-http
 *   bun scripts/hub-local.mjs --movil ../digielect14/out --supervision out
 *
 * El almacén vive en `.hub-local/` (ignoradísimo por git: son actas REALES).
 * El certificado vive en `.hub-local-cert/` (fuera del almacén — C-02).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { basename, dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ─── argumentos ─────────────────────────────────────────────────────────────

function arg(flag, defecto) {
  const i = process.argv.indexOf(`--${flag}`);
  if (i === -1) return defecto;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const PUERTO_HTTPS = Number(arg("puerto", 8443));
const PUERTO_HTTP = Number(arg("puerto-http", 8081));
const SIN_HTTP = arg("no-http", false) === true;
const MOVIL = resolve(RAIZ, String(arg("movil", "../digielect14/out")));
const PANEL = resolve(RAIZ, String(arg("supervision", "out")));
const ALMACEN = resolve(RAIZ, String(arg("almacen", ".hub-local")));
const PREFIJO_PANEL = "/supervision";

const TOPE_LOTE = 10;
// C-21 — el tope protege RAM, no ancho de banda: se mide en BYTES REALES de
// la foto (base64 decodificado), no en longitud del string.
const TOPE_FOTO_BYTES = 16 * 1024 * 1024; // una foto de 16 MB reales ya es absurdo
// C-06 — página de drenaje: 500 filas por sondeo (el panel drena con bucle
// hasta `hay === false`, así que ninguna fila se queda fuera).
const MAX_PAGINA = 500;
// C-04 — cuota del hub (ajustable por env): techo duro de RAM/disco de sesión.
const CUOTA = {
  filas: Number(process.env.HUB_CUOTA_FILAS ?? 500),
  bytes: Number(process.env.HUB_CUOTA_BYTES ?? 512 * 1024 * 1024),
};

// ─── almacén ────────────────────────────────────────────────────────────────

const INDICE = join(ALMACEN, "indice.jsonl");
const EXPURGO = join(ALMACEN, "expurgo.jsonl"); // auditoría de DELETE (C-13)
const ARCHIVO_GENERACION = join(ALMACEN, "generacion.txt"); // C-16
const CARPETA_ACTAS = join(ALMACEN, "actas");

/** @type {{seq:number, ts:number, dispositivo:string, entrada:any, foto:string|null, mime:string|null, bytes:number}[]} */
let registro = [];

function asegurarAlmacen() {
  mkdirSync(CARPETA_ACTAS, { recursive: true });
  if (!existsSync(INDICE)) return;
  for (const linea of readFileSync(INDICE, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    try {
      registro.push(JSON.parse(linea));
    } catch {
      // línea corrupta (corte a media escritura): se ignora, no se inventa.
    }
  }
}

function seqSiguiente() {
  return registro.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
}

function guardar(fila) {
  appendFileSync(INDICE, `${JSON.stringify(fila)}\n`, "utf8");
  writeFileSync(join(CARPETA_ACTAS, `${fila.seq}.json`), JSON.stringify(fila.entrada), "utf8");
}

/** Reescritura del índice tras un expurgo (única escritura no-append, C-13). */
function reescribirIndice() {
  const cuerpo = registro.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(INDICE, registro.length ? `${cuerpo}\n` : "", "utf8");
}

// ─── generación del almacén (C-16) ──────────────────────────────────────────

/** UUID persistido junto al índice: cambia en cada `/hub/reset`. El panel lo
 *  compara para detectar el reinicio y re-sincronizar (purge de filas zombis). */
let generacion = "";

function asegurarGeneracion() {
  try {
    generacion = readFileSync(ARCHIVO_GENERACION, "utf8").trim();
  } catch {
    generacion = "";
  }
  if (!generacion) {
    generacion = randomUUID();
    writeFileSync(ARCHIVO_GENERACION, `${generacion}\n`, "utf8");
  }
}

// ─── validación del sobre (contrato de digielect14 puente/tipos.ts) ─────────

const FORMULARIOS = new Set(["TRANSMISION", "DELEGADOS"]);
// C-03 — solo formatos rasterizados sin script: SVG (puede llevar <script>),
// GIF u otros quedan fuera. El mime se re-valida al servir /foto/<seq>.
const MIME_FOTO_OK = /^data:image\/(jpeg|png|webp);base64,/;

/** C-21 — bytes REALES del payload binario del dataURL (no la longitud del
 *  string base64): `Buffer.from(..., "base64").length` decodifica nativo. */
function bytesDeDataUrl(dataUrl) {
  const coma = dataUrl.indexOf(",");
  return coma === -1 ? 0 : Buffer.from(dataUrl.slice(coma + 1), "base64").length;
}

function validarEntrada(e) {
  if (!e || typeof e !== "object") return "no es un objeto";
  if (typeof e.idEnlace !== "string" || !/^\d+_\d+_\d{3}_\d{2}$/.test(e.idEnlace))
    return `idEnlace inválido (${JSON.stringify(e.idEnlace)})`;
  if (typeof e.mesa !== "string" || !/^\d{1,3}$/.test(e.mesa)) return `mesa inválida (${JSON.stringify(e.mesa)})`;
  if (!FORMULARIOS.has(e.formulario)) return `formulario desconocido (${JSON.stringify(e.formulario)})`;
  if (!Number.isInteger(e.paginaIndex) || e.paginaIndex < 1) return `paginaIndex inválido (${e.paginaIndex})`;
  if (!Number.isInteger(e.paginaTotal) || e.paginaTotal < 1) return `paginaTotal inválido (${e.paginaTotal})`;
  if (e.paginaIndex > e.paginaTotal) return `página ${e.paginaIndex} de un total ${e.paginaTotal}`;
  if (!e.impresion || typeof e.impresion !== "object") return "falta la cabecera impresa";
  if (e.srcFoto != null && (typeof e.srcFoto !== "string" || !MIME_FOTO_OK.test(e.srcFoto)))
    return "(m) tipo de foto no permitido — solo jpeg/png/webp en base64";
  if (typeof e.srcFoto === "string") {
    const bytes = bytesDeDataUrl(e.srcFoto);
    if (bytes > TOPE_FOTO_BYTES)
      return `srcFoto de ${(bytes / 1048576).toFixed(1)} MB reales (tope ${TOPE_FOTO_BYTES / 1048576} MB)`;
  }
  // C-20 — la escala del score es 0–10 (tipos.ts: score de calidad del gate).
  // Un 91.4 es una fila en escala 0–100 que se coló: se rechaza con motivo.
  if (e.score != null && (typeof e.score !== "number" || !Number.isFinite(e.score) || e.score < 0 || e.score > 10))
    return "(s) score fuera de escala 0–10";
  return null;
}

// ─── mime / estáticos ───────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".data": "application/octet-stream",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// COOP/COEP: sin esto `crossOriginIsolated` es falso y el OCR baja a un hilo
// (y el COI-service-worker del panel entra en juego). Con esto, no.
//
// C-03 — CSP + nosniff en TODAS las respuestas del hub (estáticos incluidos).
// Nota de implementación: el plan pedía literalmente `script-src 'self'`, pero
// el export estático de Next.js arranca con scripts inline (ver comentario de
// `public/_headers` de ambos repos: «script-src 'unsafe-inline' →
// bootstrap/hidratación de Next.js») y el OCR corre sobre WASM
// ('wasm-unsafe-eval'). Se espeja la CSP de PRODUCCIÓN de las apps servidas
// (misma superficie de confianza, mismo origen) con el endurecido que pide el
// plan: object-src 'none', base-uri 'none' y frame-ancestors 'self'.
//
// Ola 0-3 (regresión detectada en la prueba en dispositivo 2026-11-11):
// 'unsafe-eval' es OBLIGATORIO para el detector. El core self-hosted de
// OpenCV (vendor/opencv-4.5.5-core.js, emscripten) usa `new Function` en
// `makeDynCaller` (tabla dynCall de WASM) y en `createNamedFunction`
// (errores con nombre). Sin 'unsafe-eval' el importScripts del core lanza
// EvalError → el DetectionWorker nunca emite 'ready' → el frame loop se
// detiene → la cámara queda en «BUSCANDO ACTA… / NO DETECTADA» sin captura
// automática. React no usa eval en producción, pero este motor sí.
const CSP_HUB =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
  "connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

const HEADERS_BASE = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": CSP_HUB,
};

function dentroDe(raiz, pedido) {
  const absoluta = normalize(join(raiz, pedido));
  return absoluta === raiz || absoluta.startsWith(raiz + sep) ? absoluta : null;
}

async function servirEstatico(raiz, ruta) {
  let pedido = decodeURIComponent(ruta);
  if (pedido.endsWith("/")) pedido += "index.html";
  let camino = dentroDe(raiz, pedido.replace(/^\/+/, ""));
  if (!camino) return new Response("403", { status: 403, headers: HEADERS_BASE });
  if (!(await Bun.file(camino).exists())) {
    const alternativa = dentroDe(raiz, `${pedido.replace(/^\/+/, "")}index.html`);
    if (alternativa && (await Bun.file(alternativa).exists())) camino = alternativa;
  }
  const archivo = Bun.file(camino);
  if (!(await archivo.exists())) return null;
  const ext = (camino.match(/\.[a-zA-Z0-9]+$/) || [""])[0].toLowerCase();
  return new Response(archivo, {
    headers: { ...HEADERS_BASE, "Content-Type": MIME[ext] ?? "application/octet-stream" },
  });
}

// ─── API ────────────────────────────────────────────────────────────────────

function json(cuerpo, status = 200, extra = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...HEADERS_BASE, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

/** Mismo origen: si el navegador manda un Origin distinto, se rechaza. Un
 *  cliente sin header (curl, el poller del panel) pasa. */
function esSameOrigin(req, url) {
  const origin = req.headers.get("origin");
  return !origin || origin === url.origin;
}

// C-01 — hosts que este hub sirve de verdad, construidos AL ARRANCAR desde las
// interfaces locales. Un `Host` forjado (DNS-rebinding) no está en la lista.
const HOSTS_CONFIABLES = new Set();

function construirHostsConfiables() {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", ...ipsDeRed()]);
  for (const h of hosts) {
    HOSTS_CONFIABLES.add(`${h}:${PUERTO_HTTPS}`);
    if (!SIN_HTTP) HOSTS_CONFIABLES.add(`${h}:${PUERTO_HTTP}`);
  }
}

/** C-01 — puerta única de las rutas mutantes: (a) Origin same-origin y
 *  (b) Host ∈ hosts confiables. Devuelve el motivo de rechazo o null. */
function motivoOrigenNoConfiable(req, url) {
  if (!esSameOrigin(req, url)) return "origen distinto";
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!host || !HOSTS_CONFIABLES.has(host)) return "host no confiable";
  return null;
}

// C-04 — rate limit por IP en memoria (ventana deslizante). Espeja la regla
// WAF del hub de producción (SECURITY.md 0.3): mutantes 30/min, lecturas 120/min.
const LIMITES = {
  mutante: { max: 30, ventanaMs: 60_000 },
  lectura: { max: 120, ventanaMs: 60_000 },
};

/** @type {Map<string, number[]>} clave `${clase}:${ip}` → timestamps de la ventana */
const tasa = new Map();

function limitar(req, clase) {
  const { max, ventanaMs } = LIMITES[clase];
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const clave = `${clase}:${ip}`;
  const ahora = Date.now();
  const ventana = (tasa.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (ventana.length >= max) {
    const retry = Math.max(1, Math.ceil((ventana[0] + ventanaMs - ahora) / 1000));
    return { ok: false, retry };
  }
  ventana.push(ahora);
  tasa.set(clave, ventana);
  return { ok: true, retry: 0 };
}

function ipDe(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

// C-05 — claves que el hub estampa por su cuenta: una entrada del puente
// jamás puede pisarlas (un `ts: 0` malicioso rompería el cursor del panel).
const CLAVES_RESERVADAS = new Set(["seq", "ts", "dispositivo", "hashHub"]);

function sanitizarEntrada(e) {
  for (const k of CLAVES_RESERVADAS) delete e[k];
  return e;
}

async function recibirActas(req, url) {
  let cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }
  const actas = Array.isArray(cuerpo?.actas) ? cuerpo.actas : null;
  if (!actas) return json({ ok: false, error: "falta el array `actas`" }, 400);
  if (actas.length === 0) return json({ ok: true, recibidas: 0, insertadas: 0, rechazadas: [], generacion });
  if (actas.length > TOPE_LOTE)
    return json({ ok: false, error: `lote de ${actas.length} excede el tope ${TOPE_LOTE}` }, 413);

  // C-04 — cuota: filas y bytes del lote contra el techo. Se rechaza ANTES de
  // insertar nada (el lote entra completo o no entra — sin lotes a medias).
  const bytesLote = actas.reduce((s, a) => {
    const f = a?.srcFoto;
    return s + (typeof f === "string" ? bytesDeDataUrl(f) : 0);
  }, 0);
  if (registro.length + actas.length > CUOTA.filas || bytesTotales() + bytesLote > CUOTA.bytes)
    return json(
      {
        ok: false,
        error: "(n) cuota del hub agotada — expurgue con /hub/reset o baje el lote",
        cuota: { filas: CUOTA.filas, bytes: CUOTA.bytes, enUso: { filas: registro.length, bytes: bytesTotales() } },
      },
      507
    );

  // C-03/C-20 — las señales de SEGURIDAD del sobre (tipo de foto no permitido,
  // score fuera de escala) rechazan el LOTE completo con 400 (criterio de
  // cierre del plan); el resto de validaciones sigue siendo por-fila.
  for (let i = 0; i < actas.length; i++) {
    const motivo = validarEntrada(actas[i]);
    if (motivo && /^\((m|s)\)/.test(motivo))
      return json({ ok: false, error: motivo, indice: i }, 400);
  }

  const dispositivo = String(cuerpo.dispositivo ?? "desconocido").slice(0, 64);
  const rechazadas = [];
  let insertadas = 0;
  const tsIngreso = Date.now();

  for (let i = 0; i < actas.length; i++) {
    const motivo = validarEntrada(actas[i]);
    if (motivo) {
      rechazadas.push({ indice: i, motivo });
      continue;
    }
    const entrada = sanitizarEntrada({ ...actas[i] }); // C-05
    const foto = typeof entrada.srcFoto === "string" ? entrada.srcFoto : null;
    // La foto se guarda aparte y se sirve por URL: el poller del panel no debe
    // arrastrar dataURLs de megas en cada sondeo.
    delete entrada.srcFoto;
    // C-03 — mime LIMPIO derivado del formato validado en recepción (nunca
    // eco literal del dataURL al servir). Ya pasó por MIME_FOTO_OK.
    const mime = foto ? (/^data:image\/(jpeg|png|webp);base64,/.exec(foto)?.[1] ?? null) : null;
    const fila = {
      seq: seqSiguiente(),
      ts: tsIngreso + insertadas, // monotónico dentro del mismo lote
      dispositivo,
      entrada,
      foto,
      mime: mime ? `image/${mime}` : null,
      bytes: foto ? bytesDeDataUrl(foto) : 0, // C-21 — bytes reales
    };
    registro.push(fila);
    guardar(fila);
    insertadas++;
  }

  console.log(
    `  ← ${insertadas} acta(s) de ${dispositivo}` +
      (rechazadas.length ? ` · ${rechazadas.length} rechazada(s)` : "") +
      ` · almacén ${registro.length} filas`,
  );
  return json({
    ok: true,
    recibidas: insertadas,
    publicadas: insertadas,
    insertadas,
    rechazadas,
    ahora: tsIngreso,
    generacion,
  });
}

function bytesTotales() {
  return registro.reduce((s, r) => s + r.bytes, 0);
}

/** C-06 — listado con cursor por SEQ (exclusivo) y señal de truncado:
 *  `hay: true` ⇒ el panel debe volver a sondear con `proximoSeq` (drenaje).
 *  Seq es estrictamente creciente ⇒ sin filas perdidas por colisión de ts. */
function listarActas(url) {
  const desde = Number(url.searchParams.get("desde") ?? 0);
  const conFoto = url.searchParams.get("conFoto") === "1";
  const cortadas = registro.filter((r) => r.seq > desde);
  const pagina = cortadas.slice(0, MAX_PAGINA);
  const truncada = cortadas.length > pagina.length;
  return json({
    ok: true,
    ahora: Date.now(),
    total: registro.length,
    hay: truncada,
    proximoSeq: pagina.length ? pagina[pagina.length - 1].seq : desde,
    generacion,
    desde,
    actas: pagina.map((r) => ({
      seq: r.seq,
      ts: r.ts,
      dispositivo: r.dispositivo,
      ...r.entrada,
      fotoUrl: r.foto ? `/foto/${r.seq}` : null,
      ...(conFoto ? { srcFoto: r.foto } : {}),
    })),
  });
}

/** C-03 — la foto se sirve SOLO con el mime validado en recepción (jpeg/png/
 *  webp); nosniff + CSP viajan en HEADERS_BASE. Sin eco del dataURL. */
async function servirFoto(seq) {
  const fila = registro.find((r) => r.seq === seq);
  if (!fila?.foto || !fila.mime) return null;
  const binario = Buffer.from(fila.foto.slice(fila.foto.indexOf(",") + 1), "base64");
  return new Response(binario, {
    headers: { ...HEADERS_BASE, "Content-Type": fila.mime, "Content-Length": String(binario.length) },
  });
}

/** C-04 — /hub/estado ya no filtra rutas absolutas del disco: solo nombres
 *  base. + generación (C-16) y cuota vigente. */
function estado() {
  const porDispositivo = {};
  for (const r of registro) porDispositivo[r.dispositivo] = (porDispositivo[r.dispositivo] ?? 0) + 1;
  return json({
    ok: true,
    ahora: Date.now(),
    generacion,
    recibidas: registro.length,
    bytes: bytesTotales(),
    ultimoTs: registro.length ? registro[registro.length - 1].ts : null,
    porDispositivo,
    almacen: basename(ALMACEN),
    movil: basename(MOVIL),
    panel: basename(PANEL),
    cuota: { filas: CUOTA.filas, bytes: CUOTA.bytes },
  });
}

/** C-01/C-02/C-16 — el reset exige el segundo factor `x-hub-reset: confirmar`
 *  (lo valida la ruta), borra SOLO el almacén de actas (el cert vive fuera,
 *  C-02) y estampa una NUEVA generación + log con timestamp. */
function resetear() {
  rmSync(ALMACEN, { recursive: true, force: true });
  mkdirSync(CARPETA_ACTAS, { recursive: true });
  writeFileSync(INDICE, "", "utf8");
  registro = [];
  asegurarGeneracion(); // nueva generación → el panel re-sincroniza (C-16)
  console.log(`  ✱ ${new Date().toISOString()} — almacén vacío (reset)`);
  return json({ ok: true, recibidas: 0, generacion });
}

/** C-13 — expurgo individual: quita la fila, borra el JSON de la entrada,
 *  reescribe el índice y deja línea de auditoría en expurgo.jsonl. */
function expurgar(seq, quien) {
  const i = registro.findIndex((r) => r.seq === seq);
  if (i === -1) return json({ ok: false, error: `seq ${seq} no existe` }, 404);
  const [fila] = registro.splice(i, 1);
  try {
    rmSync(join(CARPETA_ACTAS, `${seq}.json`), { force: true });
  } catch {
    /* el JSON de la entrada ya no estaba: el expurgo sigue */
  }
  reescribirIndice();
  appendFileSync(EXPURGO, `${JSON.stringify({ ts: Date.now(), seq, quien })}\n`, "utf8");
  console.log(`  ✱ ${new Date().toISOString()} — expurgo seq ${seq} (${fila.dispositivo}) por ${quien}`);
  return json({ ok: true, expurgada: seq, recibidas: registro.length, generacion });
}

// ─── handler común (los dos servidores comparten la lógica) ─────────────────

const RUTA_MUTANTE = /^\/(?:v1\/)?actas(?:\/(\d+))?$|^\/hub\/reset$/;

async function manejar(req) {
  const url = new URL(req.url);
  const ruta = url.pathname;

  // C-01/C-04 — puerta de seguridad de las rutas mutantes: origen+Host
  // confiables y rate limit propio (30/min). El rechazo es 403 ANTES de
  // tocar nada; un curl con Origin/Host forjados no llega al almacén.
  if ((req.method === "POST" || req.method === "DELETE") && RUTA_MUTANTE.test(ruta)) {
    const motivoOrigen = motivoOrigenNoConfiable(req, url);
    if (motivoOrigen) return json({ ok: false, error: motivoOrigen }, 403);
    const limite = limitar(req, "mutante");
    if (!limite.ok)
      return json({ ok: false, error: "demasiadas peticiones — reintenta en un momento" }, 429, {
        "Retry-After": String(limite.retry),
      });
  }

  // El móvil publica en `/v1/actas` (contrato 0.7); el panel sondea `/actas`.
  if (ruta === "/actas" || ruta === "/v1/actas") {
    if (req.method === "POST") return recibirActas(req, url);
    if (req.method === "GET") return limitarLectura(req) ?? listarActas(url);
    return json({ ok: false, error: "método no soportado" }, 405);
  }
  // C-13 — expurgo individual autenticado (la clave admin se imprime al arrancar).
  const mBorrar = /^\/(?:v1\/)?actas\/(\d+)$/.exec(ruta);
  if (mBorrar) {
    if (req.method !== "DELETE") return json({ ok: false, error: "usa DELETE" }, 405);
    if (req.headers.get("x-hub-admin") !== CLAVE_ADMIN)
      return json({ ok: false, error: "x-hub-admin inválido (la clave se imprime en la consola del hub)" }, 401);
    return expurgar(Number(mBorrar[1]), ipDe(req));
  }
  if (ruta === "/foto" || ruta.startsWith("/foto/")) {
    const excedido = limitarLectura(req);
    if (excedido) return excedido;
    const seq = Number(ruta.split("/")[2]);
    const foto = Number.isInteger(seq) ? await servirFoto(seq) : null;
    return foto ?? new Response("404", { status: 404, headers: HEADERS_BASE });
  }
  if (ruta === "/hub/estado") return limitarLectura(req) ?? estado();
  if (ruta === "/hub/reset") {
    if (req.method !== "POST") return json({ ok: false, error: "usa POST" }, 405);
    // C-01 — segundo factor barato del reset destructivo (el botón de la UI
    // del panel lo envía; un POST suelto sin el header recibe 428).
    if (req.headers.get("x-hub-reset") !== "confirmar")
      return json(
        { ok: false, error: "falta el header x-hub-reset: confirmar (segundo factor del reset)" },
        428
      );
    return resetear();
  }

  if (ruta === PREFIJO_PANEL || ruta.startsWith(`${PREFIJO_PANEL}/`)) {
    const respuesta = await servirEstatico(PANEL, ruta.slice(PREFIJO_PANEL.length) || "/");
    if (respuesta) return respuesta;
    return servir404();
  }
  const delMovil = await servirEstatico(MOVIL, ruta);
  if (delMovil) return delMovil;
  return servir404();
}

/** C-04 — rate limit de lecturas (120/min). Devuelve la respuesta 429 o null
 *  para continuar. (El pattern `?? handler` mantiene el dispatch plano.) */
function limitarLectura(req) {
  const limite = limitar(req, "lectura");
  if (limite.ok) return null;
  return json({ ok: false, error: "demasiadas lecturas — reintenta en un momento" }, 429, {
    "Retry-After": String(limite.retry),
  });
}

async function servir404() {
  const pagina = Bun.file(join(MOVIL, "404.html"));
  if (await pagina.exists())
    return new Response(pagina, { status: 404, headers: { ...HEADERS_BASE, "Content-Type": MIME[".html"] } });
  return new Response("404", { status: 404, headers: HEADERS_BASE });
}

// ─── certificado self-signed (openssl, sin dependencias nuevas) ────────────

function ipsDeRed() {
  const salida = [];
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family === "IPv4" && !i.internal) salida.push(i.address);
    }
  }
  return salida;
}

// C-02 — el cert vive FUERA del almacén: `resetear()` borra `.hub-local/`
// completo, y el certificado debe sobrevivir (si no, cada reset obliga a los
// celulares a re-aceptar el aviso de privacidad del cert nuevo).
const CARPETA_CERT = join(dirname(ALMACEN), ".hub-local-cert");

function asegurarCertificado(ipPrimaria) {
  const cert = join(CARPETA_CERT, "cert.pem");
  const llave = join(CARPETA_CERT, "key.pem");
  if (existsSync(cert) && existsSync(llave)) return { cert, llave };
  const san = ["IP:127.0.0.1", "IP:::1", "DNS:localhost", ...ipsDeRed().map((ip) => `IP:${ip}`)].join(",");
  mkdirSync(CARPETA_CERT, { recursive: true });
  const r = spawnSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256",
      // ≤825 días: Safari/iOS rechaza certificados self-signed más largos.
      "-days", "820", "-nodes",
      "-keyout", llave, "-out", cert,
      "-subj", "/CN=e14-hub-local",
      "-addext", `subjectAltName=${san}`,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !existsSync(cert)) {
    rmSync(CARPETA_CERT, { recursive: true, force: true });
    console.warn(`  ! openssl falló (${r.stderr?.slice(0, 200) ?? "sin openssl"}): sin HTTPS la cámara del celular NO anda.`);
    return null;
  }
  console.log(`  ✚ certificado self-signed (SAN: ${san})`);
  return { cert, llave };
}

// ─── arranque ───────────────────────────────────────────────────────────────

asegurarAlmacen();
asegurarGeneracion();
construirHostsConfiables();

// C-13 — clave de expurgo: equivalente local de `CLAVE_ADMIN` de producción.
// Se genera por sesión y se imprime: el dueño la copia al panel (vista
// Ajustes → Expurgo) para borrar filas individuales.
const CLAVE_ADMIN = randomUUID();

// C-04 — si el índice cargado excede la cuota, se AVISA (no se borra nada por
// decisión propia): el hub atenderá lecturas pero rechazará lotes con 507.
if (registro.length > CUOTA.filas || bytesTotales() > CUOTA.bytes)
  console.warn(
    `  ! el índice cargado (${registro.length} filas / ${(bytesTotales() / 1048576).toFixed(1)} MB) ` +
      `excede la cuota (${CUOTA.filas} filas / ${(CUOTA.bytes / 1048576).toFixed(0)} MB): ` +
      `los lotes nuevos recibirán 507 hasta un /hub/reset. No se borra nada por decisión propia.`,
  );

const ips = ipsDeRed();
const ip = ips[0] ?? "127.0.0.1";
const tls = asegurarCertificado(ip);

console.log("\nHUB LOCAL e14 — almacén en", ALMACEN);
console.log(`  cert TLS en   ${CARPETA_CERT} (sobrevive al reset — C-02)`);
console.log(`  generación    ${generacion} (cambia en cada reset — C-16)`);
console.log(`  clave admin   ${CLAVE_ADMIN} (header x-hub-admin para DELETE /v1/actas/<seq> — C-13)`);
console.log(`  cuota         ${CUOTA.filas} filas / ${(CUOTA.bytes / 1048576).toFixed(0)} MB (HUB_CUOTA_FILAS / HUB_CUOTA_BYTES)`);
console.log(`  actas recibidas hoy: ${registro.length}`);

/** Un puerto ocupado no tumba el servidor: se avisa y se sigue con el otro. */
function escuchar(puerto, etiqueta, tls) {
  try {
    Bun.serve({
      hostname: "0.0.0.0",
      port: puerto,
      ...(tls ? { tls: { key: Bun.file(tls.llave), cert: Bun.file(tls.cert) } } : {}),
      fetch: manejar,
      error(err) {
        return json({ ok: false, error: String(err).slice(0, 200) }, 500);
      },
    });
    return true;
  } catch (e) {
    console.warn(`  ! no se pudo escuchar :${puerto} (${etiqueta}) — ${String(e.message ?? e)}`);
    return false;
  }
}

const httpsVivo = tls ? escuchar(PUERTO_HTTPS, "https", tls) : false;
const httpVivo = !SIN_HTTP && escuchar(PUERTO_HTTP, "http", null);

const protocolo = httpsVivo ? "https" : "http";
const puertoVivo = httpsVivo ? PUERTO_HTTPS : PUERTO_HTTP;
if (!httpsVivo && !httpVivo) {
  console.error("\n  Ningún puerto quedó libre. Relanza con --puerto <libre>.\n");
  process.exit(1);
}
console.log(`
  MÓVIL     ${protocolo}://${ip}:${puertoVivo}/
  PANEL     ${protocolo}://${ip}:${puertoVivo}${PREFIJO_PANEL}/
  HUB       ${protocolo}://${ip}:${puertoVivo}/actas

  1. En el celular, abre la URL del MÓVIL con la IP (no con «localhost»).
     El primer cargue muestra «no es privado» (cert self-signed): Avanzado →
     Continuar. Acepta el permiso de cámara.
  2. En el celular, pestaña RESUMEN → tarjeta «PUENTE A SUPERVISIÓN» → botón
     «USAR HUB LOCAL (ESTE EQUIPO)». Deja el hub en este origen sin consola.
     (Fallback manual: localStorage.setItem("e14-puente-url", location.origin))
  3. Escanea y envía; en el PANEL, la vista Recepción debe mostrar la fila
     — prende antes la tarjeta «HUB LOCAL» (el sondeo viene apagado).
  4. Verificación sin celular, desde este PC:
       curl -k ${protocolo}://${ip}:${puertoVivo}/hub/estado
       curl -k -X POST ${protocolo}://${ip}:${puertoVivo}/hub/reset \\
            -H "x-hub-reset: confirmar"          # destructivo, con log

  Si el celular NO conecta: es el firewall de Windows bloqueando el puerto
  ${puertoVivo} en la red privada (no lo abro por ti;
  «netsh advfirewall firewall add rule …» requiere administrador).
  Sin HTTPS la cámara queda bloqueada por el navegador y solo sirve IMPORTAR
  un archivo; el puente igual envía (SIM nunca envía, D6).
\n`);
