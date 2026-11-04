#!/usr/bin/env node
/**
 * scripts/ort-bench.mjs — corre la página `out/orttest/index.html` (bench
 * aislado de EP: wasm vs webgpu por modelo) en Chrome con las MISMAS banderas
 * anti-estrechamiento del banco de navegador y devuelve las filas de
 * `window.__R` en JSON.
 *
 * Uso:
 *   node scripts/ort-bench.mjs [query=eps=webgpu&n=3&only=rec_v5] [--ventana]
 *                              [--url=http://localhost:8080] [--espera=240]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--?([^=]+)(?:=(.*))?$/.exec(a) || [];
    return [m[1], m[2] === undefined ? true : m[2]];
  }),
);
const URL_BASE = argv.url || "http://localhost:8080";
const QUERY = argv.query || "eps=webgpu&n=3";
const ESPERA_S = Number(argv.espera || 240);
const PUERTO = Number(argv.puerto || 9344);

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!CHROME) {
  console.error("sin Chrome/Edge");
  process.exit(2);
}

const perfil = mkdtempSync(join(tmpdir(), "e14-ortbench-"));
const chrome = spawn(
  CHROME,
  [
    ...(argv.ventana ? ["--window-position=-32000,-32000", "--window-size=1280,900"] : ["--headless=new"]),
    `--remote-debugging-port=${PUERTO}`,
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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  const fin = Date.now() + 30000;
  while (Date.now() < fin) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json();
      const t = l.find((x) => x.webSocketDebuggerUrl && x.type === "page");
      if (t) return t.webSocketDebuggerUrl;
    } catch {
      /* aún no escucha */
    }
    await esperar(300);
  }
  throw new Error("Chrome no levantó CDP");
}

const ws = new WebSocket(await targetUrl());
await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", rej);
});
let id = 0;
const esperas = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && esperas.has(m.id)) {
    const { res, rej } = esperas.get(m.id);
    esperas.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
});
const send = (method, params) =>
  new Promise((res, rej) => {
    const n = ++id;
    esperas.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params: params || {} }));
  });
async function js(expr) {
  const r = await send("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

await send("Page.enable");
await send("Page.navigate", { url: `${URL_BASE}/orttest/index.html?${QUERY}` });

const fin = Date.now() + ESPERA_S * 1000;
let listo = false;
while (Date.now() < fin) {
  await esperar(1500);
  try {
    if (await js("!!(window.__R && window.__R.listo)")) {
      listo = true;
      break;
    }
  } catch {
    /* contexto aún no */
  }
}
try {
  console.log(await js("JSON.stringify(window.__R && window.__R.filas)"));
} catch (e) {
  console.error("sin filas:", e.message);
}
if (!listo) console.error(`TIMEOUT tras ${ESPERA_S}s`);
chrome.kill();
ws.close();
try {
  rmSync(perfil, { recursive: true, force: true });
} catch {}
