#!/usr/bin/env node
/**
 * scripts/bench-navegador.mjs — banco HEADLESS del camino 100 % navegador
 * (sin sidecar, sin instalar nada). Mide el lote demo de 6 fotos reales y
 * responde en una corrida: ¿cuánto tarda el lote y EN QUÉ SE VA el tiempo?
 *
 * Por qué no medir en la pestaña normal: Chrome estrecha los timers y la
 * animación de una página `visibilityState === "hidden"` (pestaña de fondo,
 * oculta, panel cerrado). Medido el 2026-11-03 en el navegador embebido: la
 * PRIMERA acta tardó 12 min con `crossOriginIsolated=true` — el pipeline se
 * ahoga en sus propios esperas. Las flags `--disable-background-timer-throttling`
 * / `-renderer-backgrounding` / `-backgrounding-occluded-windows` devuelven la
 * página a comportamiento de primer plano, y `--headless=new` la reporta
 * VISIBLE. Sin eso cualquier número del navegador es basura.
 *
 * Requiere: `bun run build` (export a out/) servido CON COOP/COEP — ver
 * scripts/serve-export.py. Sin `crossOriginIsolated` no hay SharedArrayBuffer
 * y el WASM corre a 1 hilo: el banco se NEGUE (aborta) antes de medir.
 *
 * Uso:
 *   node scripts/bench-navegador.mjs [--url=http://localhost:8080] [--tag=v1]
 *                                    [--motor=ppocrv5|tesseract-best-psm4]
 *                                    [--flags=json] [--espera=900]
 *                                    [--sin-coi]  mide SIN exigir aislación
 *                                    (sitio publicado: GH Pages no puede mandar
 *                                    COOP/COEP; el EP wasm pierde los hilos)
 *                                    [--extra=expresion JS preclick]
 * Informe JSON: <repo>/bench-navegador-<tag>.json
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a) || [];
    return [m[1], m[2] === undefined ? true : m[2]];
  }),
);
// `--url` con subpath (GH Pages: …/supervision-e14) sin la barra final NO es
// la raíz: el `${URL_BASE}/?cb=` de abajo armaría …/supervision-e14/?cb= y GH
// responde 404 (la ruta «/supervision-e14/» es la que existe). Se normaliza una
// vez aquí en vez de recordar la barra en cada corrida.
const URL_BASE = (argv.url || "http://localhost:8080").replace(/\/+$/, "");
const TAG = argv.tag || new Date().toISOString().slice(11, 19).replace(/:/g, "");
const ESPERA_S = Number(argv.espera || 900);
const FILAS = Number(argv.filas || 6); // detener al llegar a N concluidas (trazas cortas)
const TODO_CONSOLA = Boolean(argv.consola); // info/log además de warn/error
// `--limpiar-estado=true`: borra TODAS las IndexedDB del origen antes de
// sembrar. Necesario con `--perfil` persistente: sin él, la segunda corrida
// ve las 6 actas YA concluidas de la anterior, «termina» en 2 s y lo que
// informa es el muro de la corrida vieja. La caché HTTP de los `.onnx`/`.wasm`
// y la caché de shaders WebGPU viven en el perfil, NO en el storage del
// origen — se borra el estado y siguen calientes. Las flags (`e14-flags-overrides`
// en localStorage) se respetan: es el único localStorage que se conserva.
const PUERTO_CDP = Number(argv.puerto || 9333);
const FIN = ["ENVIADA", "OPTIMA", "ADVERTENCIA", "RECHAZADA", "DUPLICADA", "ERROR"];

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!CHROME) {
  console.error("sin Chrome/Edge — no se puede medir el camino navegador");
  process.exit(2);
}

// ─── CDP mínimo (Node 24 trae WebSocket global — cero dependencias) ────────
function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const eventos = [];
  let id = 0;
  const esperas = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && esperas.has(m.id)) {
      const { res, rej } = esperas.get(m.id);
      esperas.delete(m.id);
      if (m.error) rej(new Error(m.error.message));
      else res(m.result);
    } else if (m.method) eventos.push(m);
  });
  const abierto = new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", () => rej(new Error("CDP ws error")));
  });
  return {
    abierto,
    eventos,
    send: (method, params) =>
      new Promise((res, rej) => {
        const n = ++id;
        esperas.set(n, { res, rej });
        ws.send(JSON.stringify({ id: n, method, params: params || {} }));
      }),
    cerrar: () => ws.close(),
  };
}

const cdp = { cli: null };

async function js(expresion) {
  const r = await cdp.cli.send("Runtime.evaluate", {
    expression: expresion,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      "pagina: " +
        (r.exceptionDetails.exception?.description || r.exceptionDetails.text),
    );
  return r.result.value;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(etiqueta, expresion, topeMs = 60000) {
  const fin = Date.now() + topeMs;
  while (Date.now() < fin) {
    try {
      if (await js(expresion)) return true;
    } catch {
      /* la página aún no tiene el contexto — seguir esperando */
    }
    await esperar(500);
  }
  throw new Error(`no cumplió: ${etiqueta}`);
}

// ─── Chrome de primer plano ────────────────────────────────────────────────
// `--ventana`: Chrome REAL (con GPU) sacado de pantalla. `--headless=new`
// rasteriza el canvas por software (SwiftShader) y ese costo cae encima del
// warp y del pre-proceso del OCR — que son canvas `drawImage`/`getImageData`
// por docena. Medir el camino navegador sin GPU es medir otro camino.
// `--perfil=<dir>`: perfil PERSISTENTE de Chrome. Sin él se sigue creando un
// mkdtemp desechable (comportamiento histórico, byte a byte). Con él se mide
// el usuario real: la segunda corrida contra el mismo directorio ya trae la
// caché HTTP de los `.onnx`/`.wasm` y la caché de shaders WebGPU en disco, y
// ese ahorro es exactamente la ventana de la sonda de carga que la medición
// de perfil frío NO puede ver. El directorio NO se borra al terminar.
const perfilPersistente = typeof argv.perfil === "string" && argv.perfil.length > 0;
const perfil = perfilPersistente
  ? (mkdirSync(argv.perfil, { recursive: true }), argv.perfil)
  : mkdtempSync(join(tmpdir(), "e14-bench-"));
const chrome = spawn(
  CHROME,
  [
    ...(argv.ventana ? [] : ["--headless=new"]),
    ...(argv.ventana
      ? ["--window-position=-32000,-32000", "--window-size=1280,900"]
      : []),
    `--remote-debugging-port=${PUERTO_CDP}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${perfil}`,
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function arrancarChrome() {
  const fin = Date.now() + 30000;
  while (Date.now() < fin) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json`)).json();
      const t = l.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
      if (t) {
        cdp.cli = conectar(t.webSocketDebuggerUrl);
        await cdp.cli.abierto;
        await cdp.cli.send("Runtime.enable");
        await cdp.cli.send("Page.enable");
        return;
      }
    } catch {
      /* aún no escucha */
    }
    await esperar(300);
  }
  throw new Error("Chrome no levantó el endpoint CDP");
}

// ─── Lectura de métricas (IndexedDB del informe de la app) ─────────────────
const LEER = `(async () => {
  const dbs = indexedDB.databases ? await indexedDB.databases() : [];
  if (!dbs.some(d => d.name === 'e14-masiva-metricas-v1')) return null;
  const db = await new Promise((res, rej) => { const r = indexedDB.open('e14-masiva-metricas-v1'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  if (!db.objectStoreNames.contains('actas')) { db.close(); return null; }
  const g = (st) => new Promise((res, rej) => { const rq = db.transaction(st, 'readonly').objectStore(st).getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const [actas, corridas] = [await g('actas'), await g('corridas')];
  db.close();
  return { actas, corridas, vis: document.visibilityState, coi: self.crossOriginIsolated, hc: navigator.hardwareConcurrency };
})()`;

async function navegar(url) {
  await cdp.cli.send("Page.navigate", { url });
  await esperar(1500);
  await hasta(`carga ${url}`, "document.readyState === 'complete'", 90000);
}

const informe = { tag: TAG, url: URL_BASE, inicio: Date.now(), avisos: [], actas: [], corridas: [] };

try {
  await arrancarChrome();

  // Flags ANTES de montar la vista: same-origin → localStorage ya accesible.
  const overrides = argv.flags ? JSON.parse(argv.flags) : {};
  if (argv.motor) overrides.ocrMotor = argv.motor;
  if (Object.keys(overrides).length) {
    await navegar(`${URL_BASE}/?cb=${Date.now()}`);
    await js(
      `localStorage.setItem('e14-flags-overrides', JSON.stringify(Object.assign({}, JSON.parse(localStorage.getItem('e14-flags-overrides')||'{}'), ${JSON.stringify(overrides)})))`,
    );
    console.log("flags", JSON.stringify(overrides));
  }

  await navegar(`${URL_BASE}/?cb=${Date.now()}#vista=carga-masiva`);
  const entorno = await js(
    `JSON.stringify({vis:document.visibilityState,coi:self.crossOriginIsolated,sab:typeof SharedArrayBuffer,hc:navigator.hardwareConcurrency})`,
  );
  console.log("entorno", entorno);
  const env = JSON.parse(entorno);
  if (!env.coi && !argv["sin-coi"])
    throw new Error("SIN crossOriginIsolated — sirve out/ con COOP/COEP (scripts/serve-export.py) o pasa --sin-coi");
  if (!env.coi) {
    // El sitio PUBLICADO en GitHub Pages no puede tener COOP/COEP (no hay
    // control de cabeceras ahí), así que medirlo exige venir a saber lo que se
    // pierde: sin SAB el EP wasm va a 1 hilo. WebGPU no depende de la
    // aislación, así que esta corrida sigue diciendo algo real sobre el demo.
    console.log("AVISO --sin-coi: aislación OFF ⇒ hilos WASM muertos; se mide igual (lo que se quiere ver es el sitio publicado)");
    informe.avisos.push("++ entorno SIN crossOriginIsolated (--sin-coi) — no hay SharedArrayBuffer, 1 hilo en el EP wasm");
  }

  if (argv["limpiar-estado"]) {
    const n = await js(`(async () => {
      const dbs = indexedDB.databases ? await indexedDB.databases() : [];
      await Promise.all(dbs.map(d => new Promise(res => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); })));
      const keys = Object.keys(localStorage).filter(k => k !== 'e14-flags-overrides');
      for (const k of keys) localStorage.removeItem(k);
      return dbs.length;
    })()`);
    await navegar(`${URL_BASE}/?cb=${Date.now()}#vista=carga-masiva`);
    console.log(`estado limpiado (${n} IndexedDB) — perfil caliente, lote limpio`);
  }

  // Botón del lote demo → sembrar y procesar (UN solo clic).
  const BOTON = `(() => [...document.querySelectorAll('button')].find(x => /Sembrar el lote demo/i.test((x.textContent || '') + ' ' + (x.getAttribute('aria-label') || ''))))()`;
  await hasta("botón lote demo", `${BOTON} && !${BOTON}.disabled`, 90000);
  // `--asentarse=<ms>`: el usuario REAL abre la app, espera a la cámara,
  // elige las fotos y ENTONCES procesa. La sonda de carga (sesiones ORT +
  // compilación de shaders) corre al MONTAR la vista, no al hacer clic, así
  // que en su sesión ya abierta ese costo quedó pagado antes del lote. Sin
  // este delay el cronómetro del bench se lo cobra al lote y mide una
  // ARRANCADA, no un ESCANEO. 0/Ausente = comportamiento de siempre.
  if (argv.asentarse) {
    await esperar(Number(argv.asentarse));
    console.log(`asentado ${argv.asentarse} ms (sonda/shaders fuera del muro)`);
  }
  if ((await js(`${BOTON}.click(); 'clic'`)) !== "clic") throw new Error("no se pudo sembrar");
  if (argv.extra) await js(argv.extra);
  informe.t0 = Date.now();
  console.log(`lote sembrado — a medir (${ESPERA_S} s de tope)`);

  let ultimo = "";
  let cursor = 0;
  const tope = informe.t0 + ESPERA_S * 1000;
  while (Date.now() < tope) {
    await esperar(2000);
    const d = await js(LEER).catch(() => null);
    if (!d || !d.actas) continue;
    informe.actas = d.actas;
    informe.corridas = d.corridas;
    for (const c of cdp.cli.eventos.slice(cursor)) {
      if (c.method !== "Runtime.consoleAPICalled") continue;
      const tipo = c.params.type;
      if (!(TODO_CONSOLA ? true : /warn|error/.test(tipo))) continue;
      const texto = c.params.args
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 300);
      const linea = `+${(((c.params.timestamp || Date.now()) - informe.t0) / 1000).toFixed(1)}s [${tipo}] ${texto}`;
      informe.avisos.push(linea);
      if (TODO_CONSOLA) console.log(linea);
    }
    cursor = cdp.cli.eventos.length;
    const lista = d.actas
      .slice()
      .sort((a, b) => (a.tsFin || 0) - (b.tsFin || 0))
      .map(
        (a) =>
          `${(a.nombre || "").slice(0, 18).padEnd(18)} ${String(a.desenlace).padEnd(11)} sc=${a.score ?? "—"} muro=${(((a.muroMs || 0) / 1000).toFixed(1) + "s").padStart(7)} cuello=${a.cuello || "—"} ocr=${a.etapas?.ocrMs ?? "—"} qr=${a.etapas?.preOcrQrMs ?? "—"} or=${a.etapas?.orientacionProbeMs ?? "—"} proc=${a.etapas?.procesoMs ?? "—"} dec=${a.etapas?.decodeMs ?? "—"}`,
      );
    const firma = lista.join("\n");
    if (firma !== ultimo) {
      ultimo = firma;
      console.log(`[${Math.round((Date.now() - informe.t0) / 1000)}s]\n` + lista.join("\n"));
    }
    if (d.actas.filter((a) => FIN.includes(a.desenlace)).length >= FILAS) break;
  }
  informe.fin = Date.now();
  informe.muroTotalMs = informe.fin - informe.t0;
  if (argv.texto) {
    // Volcado del OCR: `acta.ocrTexto` de cada fila (DB de la cola) — para
    // comparar byte a byte contra el sidecar y ver QUÉ dejó de leer el WASM.
    informe.textos = await js(`(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('e14-masiva-v1'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      if (!db.objectStoreNames.contains('archivos')) { db.close(); return []; }
      const rows = await new Promise((res, rej) => { const rq = db.transaction('archivos','readonly').objectStore('archivos').getAll(); rq.onsuccess = () => res(rq.result||[]); rq.onerror = () => rej(rq.error); });
      db.close();
      return rows.map(r => ({ nombre: r.nombre, status: r.acta?.status, score: r.acta?.score, rot: r.acta?.rotation,
        cabecera: r.acta?.diagnostico?.cabeceraE14, lectura: r.acta?.diagnostico?.lectura?.nivel,
        largo: (r.acta?.ocrTexto || '').length, texto: r.acta?.ocrTexto || '' }));
    })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
  }
  if (argv.fotos) {
    // `--fotos=<dir>`: vuelca la `fotoProcesadaBlob` (el acta YA recortada y
    // con el filtro de sombras) de cada fila. Es el ÚNICO control de calidad
    // que no pasa por un número: bajar el tope del warp tiene que seguir
    // dando una página legible, y eso se mira, no se mide. De una en una: el
    // base64 por CDP son cientos de KB por acta y juntas revientan el frame.
    const dir = argv.fotos;
    mkdirSync(dir, { recursive: true });
    const nombres = await js(`(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('e14-masiva-v1'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      if (!db.objectStoreNames.contains('archivos')) { db.close(); return []; }
      const rows = await new Promise((res, rej) => { const rq = db.transaction('archivos','readonly').objectStore('archivos').getAll(); rq.onsuccess = () => res(rq.result||[]); rq.onerror = () => rej(rq.error); });
      db.close();
      return rows.map(r => ({ nombre: r.nombre, tam: r.fotoProcesadaBlob?.size || 0, tiene: !!r.fotoProcesadaBlob }));
    })()`);
    for (const n of nombres || []) {
      if (!n.tiene) {
        console.log(`foto ${n.nombre} SIN blob (persistido como dataURL o descartado)`);
        continue;
      }
      const url = await js(`(async () => {
        const db = await new Promise((res) => { const r = indexedDB.open('e14-masiva-v1'); r.onsuccess = () => res(r.result); });
        const rows = await new Promise((res) => { const rq = db.transaction('archivos','readonly').objectStore('archivos').getAll(); rq.onsuccess = () => res(rq.result||[]); });
        db.close();
        const rec = rows.find(x => x.nombre === ${JSON.stringify(n.nombre)});
        if (!rec?.fotoProcesadaBlob) return null;
        return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(rec.fotoProcesadaBlob); });
      })()`);
      if (!url) {
        console.log(`foto ${n.nombre} no leída`);
        continue;
      }
      const b64 = url.slice(url.indexOf(",") + 1);
      const ruta = join(dir, `${TAG}--${n.nombre}`);
      writeFileSync(ruta, Buffer.from(b64, "base64"));
      console.log(`foto → ${ruta} (${(b64.length * 0.75 / 1024).toFixed(0)} KB)`);
    }
  }
} finally {
  // Avisos de la página (hard-kills, degradaciones) — oro para diagnosticar.
  const unicos = [...new Set(informe.avisos.map((a) => a.replace(/^\+\S+s /, "")))];
  if (unicos.length && !TODO_CONSOLA)
    console.log("\navisos:\n" + unicos.map((u) => " · " + u).join("\n"));
  if (TODO_CONSOLA) console.log(`\n(${informe.avisos.length} líneas de consola → informe JSON)`);
  if (informe.corridas?.length)
    console.log(
      "\ncorridas:\n" +
        informe.corridas
          .map((c) => ` ${(c.id || "").slice(0, 8)} n=${c.nActas} dur=${c.inicio && c.fin ? ((c.fin - c.inicio) / 1000).toFixed(1) + "s" : "—"}`)
          .join("\n"),
    );
  const fila = informe.actas?.filter((a) => FIN.includes(a.desenlace)) || [];
  if (fila.length) {
    const suma = {};
    for (const a of fila)
      for (const [k, v] of Object.entries(a.etapas || {})) if (typeof v === "number") suma[k] = (suma[k] || 0) + v;
    const trabajo = Object.entries(suma)
      .filter(([k]) => !["sondeoQrMs", "thumbMs"].includes(k))
      .sort((x, y) => y[1] - x[1]);
    console.log("\nse va el tiempo en (suma 6 actas, ms):\n" + trabajo.map(([k, v]) => ` ${k.padEnd(20)} ${String(Math.round(v)).padStart(7)}  ${(v / fila.length / 1000).toFixed(1)}s/acta`).join("\n"));
    console.log(`\nRESULTADO ${TAG}: ${fila.length}/6 concluidas · muro total ${((informe.muroTotalMs || 0) / 1000).toFixed(1)}s`);
  }
  for (const t of informe.textos || [])
    console.log(
      `TEXTO ${t.nombre} st=${t.status} sc=${t.score} rot=${t.rot} cab=${t.cabecera} led=${t.lectura} len=${t.largo}\n  ${(t.texto || "").replace(/\s+/g, " ").slice(0, 240)}`,
    );
  const ruta = join(process.cwd(), `bench-navegador-${TAG}.json`);  writeFileSync(ruta, JSON.stringify({ ...informe, avisos: [...new Set(informe.avisos)] }, null, 2));
  console.log(`informe → ${ruta}`);
  cdp.cli?.cerrar();
  chrome.kill();
  await esperar(500);
  try {
    if (!perfilPersistente) rmSync(perfil, { recursive: true, force: true });
  } catch {}
}
