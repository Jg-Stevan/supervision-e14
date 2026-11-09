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
 *   GET  /actas?desde=<ts> → { ok, ahora, total, actas[] }  (cursor epoch ms, exclusivo)
 *   (`/actas` en POST se acepta como alias del contrato viejo)
 *   GET  /foto/<seq>       la foto almacenada (dataURL → bytes, con su content-type)
 *   GET  /hub/estado       contadores en vivo (para el runbook)
 *   POST /hub/reset        vacía el almacén (demo)
 *
 * USO:
 *   bun scripts/hub-local.mjs                 # https en :8443 + http en :8081
 *   bun scripts/hub-local.mjs --puerto 9443 --no-http
 *   bun scripts/hub-local.mjs --movil ../digielect14/out --supervision out
 *
 * El almacén vive en `.hub-local/` (ignoradísimo por git: son actas REALES).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, normalize, resolve, sep } from "node:path";
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
const TOPE_FOTO_BYTES = 16 * 1024 * 1024; // un dataURL de 16 MB ya es absurdo
const MAX_PAGINA = 200;

// ─── almacén ────────────────────────────────────────────────────────────────

const INDICE = join(ALMACEN, "indice.jsonl");
const CARPETA_ACTAS = join(ALMACEN, "actas");

/** @type {{seq:number, ts:number, dispositivo:string, entrada:any, foto:string|null, bytes:number}[]} */
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

// ─── validación del sobre (contrato de digielect14 puente/tipos.ts) ─────────

const FORMULARIOS = new Set(["TRANSMISION", "DELEGADOS"]);

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
  if (e.srcFoto != null && (typeof e.srcFoto !== "string" || !e.srcFoto.startsWith("data:image/")))
    return "srcFoto no es un dataURL de imagen";
  if (typeof e.srcFoto === "string" && e.srcFoto.length > TOPE_FOTO_BYTES)
    return `srcFoto de ${(e.srcFoto.length / 1048576).toFixed(1)} MB (tope ${TOPE_FOTO_BYTES / 1048576} MB)`;
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
const HEADERS_BASE = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
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

function json(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...HEADERS_BASE, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Mismo origen: si el navegador manda un Origin distinto, se rechaza. Un
 *  cliente sin header (curl, el poller del panel) pasa. */
function esSameOrigin(req, url) {
  const origin = req.headers.get("origin");
  return !origin || origin === url.origin;
}

async function recibirActas(req, url) {
  if (!esSameOrigin(req, url)) return json({ ok: false, error: "origen distinto" }, 403);
  let cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }
  const actas = Array.isArray(cuerpo?.actas) ? cuerpo.actas : null;
  if (!actas) return json({ ok: false, error: "falta el array `actas`" }, 400);
  if (actas.length === 0) return json({ ok: true, recibidas: 0, insertadas: 0, rechazadas: [] });
  if (actas.length > TOPE_LOTE)
    return json({ ok: false, error: `lote de ${actas.length} excede el tope ${TOPE_LOTE}` }, 413);

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
    const entrada = { ...actas[i] };
    const foto = typeof entrada.srcFoto === "string" ? entrada.srcFoto : null;
    // La foto se guarda aparte y se sirve por URL: el poller del panel no debe
    // arrastrar dataURLs de megas en cada sondeo.
    delete entrada.srcFoto;
    const fila = {
      seq: seqSiguiente(),
      ts: tsIngreso + insertadas, // monotónico dentro del mismo lote
      dispositivo,
      entrada,
      foto,
      bytes: foto ? foto.length : 0,
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
  });
}

function listarActas(url) {
  const desde = Number(url.searchParams.get("desde") ?? 0);
  const conFoto = url.searchParams.get("conFoto") === "1";
  const cortadas = registro.filter((r) => r.ts > desde);
  const pagina = cortadas.slice(0, MAX_PAGINA);
  return json({
    ok: true,
    ahora: Date.now(),
    total: registro.length,
    hay: cortadas.length,
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

async function servirFoto(seq) {
  const fila = registro.find((r) => r.seq === seq);
  if (!fila?.foto) return null;
  const coma = fila.foto.indexOf(",");
  const cabecera = fila.foto.slice(0, coma);
  const tipo = /data:([^;,]+)/.exec(cabecera)?.[1] ?? "image/png";
  const binario = Buffer.from(fila.foto.slice(coma + 1), "base64");
  return new Response(binario, {
    headers: { ...HEADERS_BASE, "Content-Type": tipo, "Content-Length": String(binario.length) },
  });
}

function estado() {
  const porDispositivo = {};
  for (const r of registro) porDispositivo[r.dispositivo] = (porDispositivo[r.dispositivo] ?? 0) + 1;
  return json({
    ok: true,
    ahora: Date.now(),
    recibidas: registro.length,
    bytes: registro.reduce((s, r) => s + r.bytes, 0),
    ultimoTs: registro.length ? registro[registro.length - 1].ts : null,
    porDispositivo,
    almacen: ALMACEN,
    movil: MOVIL,
    panel: PANEL,
  });
}

function resetear() {
  rmSync(ALMACEN, { recursive: true, force: true });
  mkdirSync(CARPETA_ACTAS, { recursive: true });
  writeFileSync(INDICE, "", "utf8");
  registro = [];
  console.log("  ✱ almacén vacío (reset)");
  return json({ ok: true, recibidas: 0 });
}

// ─── handler común (los dos servidores comparten la lógica) ─────────────────

async function manejar(req) {
  const url = new URL(req.url);
  const ruta = url.pathname;

  // El móvil publica en `/v1/actas` (contrato 0.7); el panel sondea `/actas`.
  if (ruta === "/actas" || ruta === "/v1/actas") {
    if (req.method === "POST") return recibirActas(req, url);
    if (req.method === "GET") return listarActas(url);
    return json({ ok: false, error: "método no soportado" }, 405);
  }
  if (ruta === "/foto" || ruta.startsWith("/foto/")) {
    const seq = Number(ruta.split("/")[2]);
    const foto = Number.isInteger(seq) ? await servirFoto(seq) : null;
    return foto ?? new Response("404", { status: 404, headers: HEADERS_BASE });
  }
  if (ruta === "/hub/estado") return estado();
  if (ruta === "/hub/reset") {
    if (req.method !== "POST") return json({ ok: false, error: "usa POST" }, 405);
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

const CARPETA_CERT = join(ALMACEN, "cert");

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

const ips = ipsDeRed();
const ip = ips[0] ?? "127.0.0.1";
const tls = asegurarCertificado(ip);

console.log("\nHUB LOCAL e14 — almacén en", ALMACEN);
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

  Si el celular NO conecta: es el firewall de Windows bloqueando el puerto
  ${puertoVivo} en la red privada (no lo abro por ti;
  «netsh advfirewall firewall add rule …» requiere administrador).
  Sin HTTPS la cámara queda bloqueada por el navegador y solo sirve IMPORTAR
  un archivo; el puente igual envía (SIM nunca envía, D6).
\n`);
