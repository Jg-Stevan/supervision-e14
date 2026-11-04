/**
 * scripts/__tests__/cf-wasm-partes.test.ts — KIT e14-pages-wasm-partes-v1 (D80)
 *
 * La invariante que protege este archivo es una sola: lo que queda en out/ tras
 * el build reensambla BYTE-EXACTO el wasm original. Un jsep.wasm truncado o mal
 * pegado no da un error legible — da un fallo de ORT en el navegador del
 * visitante y el lote publicado se va al camino lento (218 s con un acta
 * rechazada, D77) sin que nadie lo atribuya al deploy.
 *
 * Corre el CLI real (`bun cf-wasm-partes.mjs`) con cwd en un out/ de juguete y
 * umbrales de bytes, no el de producción: 28 MiB por test sería lento y, sobre
 * todo, el umbral es un argumento — lo que importa es la lógica, no el tamaño.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const SCRIPT = join(import.meta.dir, "..", "cf-wasm-partes.mjs");
const UMbral = "--umbral=0.002"; // 2.097 bytes
const TMAX = "--tamano-max=0.001"; // 1.049 bytes
const RUTA_WASM = join("out", "vendor", "onnxruntime");
const RUTA_MEDIA = join("out", "_next", "static", "media");
const RUTA_MANIFIESTO = join("out", "e14", "wasm-partes.json");

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Contenido determinista y con entropía suficiente para que un byte perdido
 *  cambie el hash (no `A` repetido: eso pasa un off-by-one inadvertido). */
function bytesDeterministas(n: number): Buffer {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i += 1) b[i] = (i * 31 + (i >> 8)) % 251;
  return b;
}

async function correr(raiz: string, argumentos: string[] = []) {
  const p = Bun.spawn(["bun", SCRIPT, UMbral, TMAX, ...argumentos], {
    cwd: raiz,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(p.stdout).text();
  const stderr = await new Response(p.stderr).text();
  return { code: await p.exited, salida: `${stdout}${stderr}` };
}

type Manifiesto = { version: number; assets: Record<string, { partes: number; bytes: number; sha256: string }> };

let raiz = "";
beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "e14-partes-"));
  mkdirSync(join(raiz, RUTA_WASM), { recursive: true });
  mkdirSync(join(raiz, RUTA_MEDIA), { recursive: true });
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe("cf-wasm-partes: partir y reensamblar byte-exacto", () => {
  it("parte el asset grande, borra el original y el manifiesto casa con las partes", async () => {
    const original = bytesDeterministas(5000);
    const ruta = join(raiz, RUTA_WASM, "grande.wasm");
    writeFileSync(ruta, original);

    const r = await correr(raiz);
    expect(r.code).toBe(0);
    expect(existsSync(ruta)).toBe(false);

    const partes: Buffer[] = [];
    for (let i = 0; ; i += 1) {
      const p = `${ruta}.parte${i}`;
      if (!existsSync(p)) break;
      const b = readFileSync(p);
      // Cada parte tiene que pasar el corte de Pages por sí sola.
      expect(b.byteLength).toBeLessThanOrEqual(1049);
      partes.push(b);
    }
    expect(partes.length).toBe(5);
    expect(sha(Buffer.concat(partes))).toBe(sha(original));

    const manifiesto = JSON.parse(readFileSync(join(raiz, RUTA_MANIFIESTO), "utf8")) as Manifiesto;
    expect(manifiesto.assets["grande.wasm"]).toEqual({ partes: 5, bytes: 5000, sha256: sha(original) });
  });

  it("deja intacto lo que no pasa el umbral (zbar y unrar viven en media)", async () => {
    const chico = join(raiz, RUTA_WASM, "chico.wasm");
    const zbar = join(raiz, RUTA_MEDIA, "zbar.wasm");
    writeFileSync(chico, bytesDeterministas(100));
    writeFileSync(zbar, bytesDeterministas(90));

    const r = await correr(raiz);
    expect(r.code).toBe(0);
    expect(readFileSync(chico).byteLength).toBe(100);
    expect(readFileSync(zbar).byteLength).toBe(90);
    expect(JSON.parse(readFileSync(join(raiz, RUTA_MANIFIESTO), "utf8")).assets).toEqual({});
  });

  it("borra el duplicado fuera de la ruta de la Function sin meterlo en el manifiesto", async () => {
    // Turbopack mete una copia del mismo wasm en _next/static/media/; ninguna
    // Function la sirve, así que lo único que Pages acepta es borrarla.
    const dup = join(raiz, RUTA_MEDIA, "grande.wasm");
    writeFileSync(dup, bytesDeterministas(5000));

    const r = await correr(raiz);
    expect(r.code).toBe(0);
    expect(existsSync(dup)).toBe(false);
    expect(existsSync(`${dup}.parte0`)).toBe(false);
    const manifiesto = JSON.parse(readFileSync(join(raiz, RUTA_MANIFIESTO), "utf8")) as Manifiesto;
    expect(manifiesto.assets["grande.wasm"]).toBeUndefined();
  });

  it("el manifiesto se reconstruye desde cero: no quedan entradas de assets que ya no existen", async () => {
    // Un manifiesto con entradas muertas hace que la Function pida partes que
    // no están en el deployment → 502 en producción.
    mkdirSync(join(raiz, "out", "e14"), { recursive: true });
    writeFileSync(
      join(raiz, RUTA_MANIFIESTO),
      JSON.stringify({ version: 1, assets: { "fantasma.wasm": { partes: 3, bytes: 999, sha256: "x" } } }),
    );

    const r = await correr(raiz);
    expect(r.code).toBe(0);
    const manifiesto = JSON.parse(readFileSync(join(raiz, RUTA_MANIFIESTO), "utf8")) as Manifiesto;
    expect(manifiesto.assets["fantasma.wasm"]).toBeUndefined();
  });

  it("--dry-run no toca el disco", async () => {
    const ruta = join(raiz, RUTA_WASM, "grande.wasm");
    writeFileSync(ruta, bytesDeterministas(5000));

    const r = await correr(raiz, ["--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.salida).toContain("(dry)");
    expect(existsSync(ruta)).toBe(true);
    expect(existsSync(`${ruta}.parte0`)).toBe(false);
    expect(existsSync(join(raiz, RUTA_MANIFIESTO))).toBe(false);
  });

  it("falla con mensaje claro si no hay out/ (en vez de un ENOENT crudo)", async () => {
    const vacia = mkdtempSync(join(tmpdir(), "e14-sin-out-"));
    try {
      const r = await correr(vacia);
      expect(r.code).toBe(1);
      expect(r.salida).toContain("corre el build antes");
    } finally {
      rmSync(vacia, { recursive: true, force: true });
    }
  });

  it("rechaza un --tamano-max mayor que el umbral (repartiría archivos que Pages sigue rechazando)", async () => {
    const p = Bun.spawn(["bun", SCRIPT, "--umbral=0.002", "--tamano-max=0.005"], {
      cwd: raiz,
      stdout: "pipe",
      stderr: "pipe",
    });
    const err = await new Response(p.stderr).text();
    expect(await p.exited).toBe(1);
    expect(err).toContain("--tamano-max debe estar entre 0");
  });

  it("sobrevive a un size exactamente múltiplo del tamaño de parte (sin parte vacía)", async () => {
    const original = bytesDeterministas(2098); // 2 × 1049
    const ruta = join(raiz, RUTA_WASM, "exacto.wasm");
    writeFileSync(ruta, original);

    expect((await correr(raiz)).code).toBe(0);
    expect(existsSync(`${ruta}.parte2`)).toBe(false);
    expect(statSync(`${ruta}.parte0`).size).toBe(1049);
    expect(statSync(`${ruta}.parte1`).size).toBe(1049);
    const manifiesto = JSON.parse(readFileSync(join(raiz, RUTA_MANIFIESTO), "utf8")) as Manifiesto;
    expect(manifiesto.assets["exacto.wasm"].partes).toBe(2);
  });
});

/** D80. Sin `_routes.json`, Cloudflare Pages ejecuta la Function para TODAS las
 *  rutas que casen con `functions/**` y el asset estático queda sombreado. Medido
 *  el 2026-11-03 en `wrangler pages dev`: `/vendor/onnxruntime/ort-wasm-simd-threaded.wasm`
 *  (13,6 MiB, nunca se partió) respondía 404 con el cuerpo del propio error, y
 *  el OCR se caía al camino lento con la app entera verde. Un deploy que pasa
 *  todos los demás checks pero pierde este archivo es exactamente eso. */
describe("cf-wasm-partes: _routes.json no sombrea assets estáticos", () => {
  const rutas = (raiz: string) =>
    JSON.parse(readFileSync(join(raiz, "out", "_routes.json"), "utf8")) as { version: number; include: string[]; exclude: string[] };

  it("include lista solo los partidos, con la ruta exacta de la Function", async () => {
    writeFileSync(join(raiz, RUTA_WASM, "jsep.wasm"), bytesDeterministas(5000));
    writeFileSync(join(raiz, RUTA_WASM, "simd-threaded.wasm"), bytesDeterministas(100));
    writeFileSync(join(raiz, RUTA_WASM, "ort-wasm-simd-threaded.mjs"), bytesDeterministas(80));
    writeFileSync(join(raiz, RUTA_MEDIA, "otro.wasm"), bytesDeterministas(120));

    expect((await correr(raiz)).code).toBe(0);
    expect(rutas(raiz)).toEqual({
      version: 1,
      include: ["/vendor/onnxruntime/jsep.wasm"],
      exclude: [],
    });
  });

  it("nada partido => include vacío (ninguna Function intercepta)", async () => {
    writeFileSync(join(raiz, RUTA_WASM, "simd-threaded.wasm"), bytesDeterministas(100));

    expect((await correr(raiz)).code).toBe(0);
    expect(rutas(raiz).include).toEqual([]);
  });

  it("correr dos veces sobre el mismo out/ mantiene include idéntico", async () => {
    // El segundo run no ve los .wasm enteros (ya se borraron); si el manifiesto
    // quedara vacío, `_routes.json` vaciaría include y la Function dejaría de
    // correr para un wasm que sí está partido en el deployment → 404.
    writeFileSync(join(raiz, RUTA_WASM, "jsep.wasm"), bytesDeterministas(5000));

    expect((await correr(raiz)).code).toBe(0);
    const primero = rutas(raiz);
    expect((await correr(raiz)).code).toBe(0);
    const segundo = rutas(raiz);
    expect((await correr(raiz)).code).toBe(0);
    expect(segundo).toEqual(primero);
    expect(segundo.include).toEqual(["/vendor/onnxruntime/jsep.wasm"]);
  });
});
