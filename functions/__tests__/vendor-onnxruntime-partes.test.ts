/**
 * functions/__tests__/vendor-onnxruntime-partes.test.ts — KIT e14-pages-wasm-partes-v1 (D80)
 *
 * Une las dos mitades del kit: `cf-wasm-partes.mjs` parte en el build y esta
 * Function pega en el request. Lo que se comprueba aquí es LA invariante del
 * deploy — que el `/vendor/onnxruntime/*.wasm` que ve ORT es byte-idéntico al
 * que Next metió en out/ antes de partir. Con un wasm truncado el síntoma es un
 * fallo de ORT en el navegador del visitante, no un error de despliegue, así
 * que esto no puede quedar en "confío en el stream".
 *
 * Se corre el CLI real para generar las partes (no se construyen a mano: si el
 * formato del manifiesto cambia, este test se entera) y se stubbea `fetch` con
 * los assets servidos desde disco, que es lo que hace Pages con un asset
 * estático. El runtime de Workers no se emula: solo el `fetch` subyacente.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { onRequestGet } from "../vendor/onnxruntime/[file]";

const SCRIPT = join(import.meta.dir, "..", "..", "scripts", "cf-wasm-partes.mjs");
const URL_BASE = "https://supervision-e14.pages.dev";
const NOM = "grande.wasm";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function bytesDeterministas(n: number): Buffer {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i += 1) b[i] = (i * 37 + (i >> 6)) % 251;
  return b;
}

type Manifiesto = { version: number; assets: Record<string, { partes: number; bytes: number; sha256: string }> };

let raiz = "";
let rutaWasm = "";
let original: Buffer;
const fetchReal = globalThis.fetch;

/** El `fetch` de la Function resuelve rutas absolutas contra el deployment;
 *  aquí se sirven desde el out/ de juguete del test. */
function stubFetch() {
  globalThis.fetch = (async (entrada: string | URL) => {
    const url = typeof entrada === "string" ? new URL(entrada) : entrada instanceof URL ? entrada : new URL(String(entrada));
    const rutaDisco = join(raiz, "out", url.pathname.replace(/^\//, "").split("/").join("/"));
    if (!existsSync(rutaDisco)) return new Response("NO ESTÁ EN EL DEPLOYMENT", { status: 404 });
    const cuerpo = readFileSync(rutaDisco);
    return new Response(cuerpo, {
      headers: {
        "content-type": url.pathname.endsWith(".json") ? "application/json" : "application/wasm",
        "content-length": String(cuerpo.byteLength),
      },
    });
  }) as unknown as typeof fetch;
}

async function pedir(clave: string) {
  return onRequestGet({
    params: { file: clave },
    request: { url: `${URL_BASE}/vendor/onnxruntime/${encodeURIComponent(clave)}` },
  });
}

beforeEach(async () => {
  raiz = mkdtempSync(join(tmpdir(), "e14-fn-partes-"));
  rutaWasm = join(raiz, "out", "vendor", "onnxruntime");
  mkdirSync(rutaWasm, { recursive: true });
  original = bytesDeterministas(5000);
  writeFileSync(join(rutaWasm, NOM), original);
  const p = Bun.spawn(["bun", SCRIPT, "--umbral=0.002", "--tamano-max=0.001"], { cwd: raiz });
  await p.exited;
  stubFetch();
});

afterEach(() => {
  globalThis.fetch = fetchReal;
  rmSync(raiz, { recursive: true, force: true });
});

describe("Pages Function /vendor/onnxruntime/[file]: reensambla lo que partió el build", () => {
  it("devuelve el asset entero, byte-idéntico al original del build", async () => {
    const r = await pedir(NOM);
    expect(r.status).toBe(200);
    const recibido = new Uint8Array(await r.arrayBuffer());
    expect(recibido.byteLength).toBe(original.byteLength);
    expect(sha(recibido)).toBe(sha(original));
  });

  it("trae las cabeceras que ORT y el caché necesitan", async () => {
    const r = await pedir(NOM);
    expect(r.headers.get("content-type")).toBe("application/wasm");
    expect(r.headers.get("cache-control")).toContain("immutable");
    expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    // El ETag sale del sha256 del manifiesto: es fuerte y estable por contenido.
    const manifiesto = JSON.parse(
      readFileSync(join(raiz, "out", "e14", "wasm-partes.json"), "utf8"),
    ) as Manifiesto;
    expect(r.headers.get("etag")).toBe(`"${manifiesto.assets[NOM].sha256}"`);
    const declarado = r.headers.get("content-length");
    if (declarado) expect(Number(declarado)).toBe(original.byteLength);
  });

  it("404 con no-store para un asset que no está en el manifiesto", async () => {
    const r = await pedir("no-partido.wasm");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toContain("MANIFIESTO DE PARTES");
  });

  it("400 rechaza claves con traversal o slashes (la Function solo lee su propia carpeta)", async () => {
    for (const clave of ["../../etc/passwd", "a..b", "con slash/wasm", "espacio wasm", ""]) {
      const r = await pedir(clave);
      expect(r.status).toBe(400);
    }
  });

  it("502 si falta una parte en el deployment (build a medias, no wasm roto)", async () => {
    rmSync(join(rutaWasm, `${NOM}.parte1`));
    const r = await pedir(NOM);
    expect(r.status).toBe(502);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toContain("NO RESPONDE");
  });

  it("503 si las partes no suman lo que declara el manifiesto (despliegue inconsistente)", async () => {
    const ruta = join(raiz, "out", "e14", "wasm-partes.json");
    const manifiesto = JSON.parse(readFileSync(ruta, "utf8")) as Manifiesto;
    manifiesto.assets[NOM].bytes += 1; // miente sobre el tamaño
    writeFileSync(ruta, JSON.stringify(manifiesto));
    const r = await pedir(NOM);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain("deploy inconsistente");
  });

  it("500 si el manifiesto no está (el split del build nunca corrió)", async () => {
    rmSync(join(raiz, "out", "e14", "wasm-partes.json"));
    const r = await pedir(NOM);
    expect(r.status).toBe(500);
    expect(await r.text()).toContain("NO HAY MANIFIESTO");
  });
});
