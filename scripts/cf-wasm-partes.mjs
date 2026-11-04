#!/usr/bin/env bun
/**
 * scripts/cf-wasm-partes.mjs — KIT e14-pages-wasm-partes-v1 (D80)
 *
 * Deja `out/` listo para Cloudflare Pages SIN objeto externo: lo que pasa el
 * corte de 25 MiB POR ASSET que Pages impone al SUBIR se parte en trozos
 * chicos, y la Pages Function de `functions/vendor/onnxruntime/[file].ts` los
 * vuelve a pegar por la MISMA ruta. Pages no pone tope al tamaño de la
 * respuesta de una Function, y streamear es I/O y no CPU (el plan Free cobra
 * 10 ms de CPU por invocación): el muro era de subida, no de servicio.
 *
 * Sustituye a `cf-r2-wasm.mjs` (D77), que subía esos assets a R2. R2 resultó
 * inservible aquí: habilitarlo es consentimiento de cuenta en el dashboard
 * (API 10042, ningún token lo puede hacer) y puede exigir método de pago. Con
 * partes el deploy no necesita token de Cloudflare hasta el paso final.
 *
 * Por qué no se puede simply borrar lo excedido: los dos que pasan son
 * `ort-wasm-simd-threaded.jsep.wasm` (27,0 MiB = EP WebGPU) y
 * `…asyncify.wasm` (25,5 MiB = worker proxy del EP wasm). Sin `jsep` el lote
 * demo del site publicado pasa de ~60 s a 218 s CON un acta rechazada; sin
 * `asyncify` se cae `ort.env.wasm.proxy = true` (rapidocr.ts:780 fija
 * `wasmPaths` y el loader del worker se pide el `.mjs` a pelo).
 *
 * Qué hace con cada excedido, decidido por RUTA (no por glob):
 *   · Dentro de `vendor/onnxruntime/` → parte en N trozos ≤ --tamano-max,
 *     escribe el manifiesto `e14/wasm-partes.json` y borra el original.
 *   · Fuera de esa ruta (el duplicado que Turbopack mete en
 *     `_next/static/media/`) → BORRADO a secas: ninguna Function lo sirve.
 *   · Lo que no pasa el umbral NO se toca — en media viven zbar.wasm (capa 0
 *     QR) y unrar.wasm, que sí se piden.
 *
 * La invariante que importa es que lo reensamblado sea BYTE-EXACTO: el sha256
 * del original se calcula antes, y después se releen las partes del disco y se
 * re-verifica. Si no cuadra, aborta sin borrar nada: un wasm corrupto en
 * producción se ve como un fallo de ORT ocho minutos después y nadie lo
 * atribuiría al deploy.
 *
 * El manifiesto vive en `e14/` a propósito: `/e14/*` ya tiene
 * `max-age=86400, must-revalidate` en public/_headers (es DATO), mientras que
 * `/vendor/*` es `immutable` por un año — un manifiesto inmutable es la receta
 * para que un deploy nuevo sirva partes viejas.
 *
 * Uso: bun run scripts/cf-wasm-partes.mjs [--umbral=MB] [--tamano-max=MB] [--dry-run]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a) || [];
    return [m[1], m[2] === undefined ? true : m[2]];
  }),
);

const RAIZ = process.cwd();
const OUT = join(RAIZ, "out");
// Umi de Pages: 25 MiB clavados. 24,5 deja margen para no discutir con el
// redondeo (Pages mide MiB binarios; un borde exacto ya mordió una vez).
const UMBRAL = BigInt(Math.round(Number(argv.umbral ?? 24.5) * 1048576));
// 20 MiB por parte: con 27 MiB salen 2 partes y el margen absorba un wasm que
// crezca un poco sin partirlo en 3.
const TAMANO_PARTE = BigInt(Math.round(Number(argv["tamano-max"] ?? 20) * 1048576));
const DRY = Boolean(argv["dry-run"]);
const CARPETA_WASM = ["vendor", "onnxruntime"].join("/");
const MANIFIESTO_REL = join("e14", "wasm-partes.json");

if (TAMANO_PARTE <= 0n || TAMANO_PARTE >= UMBRAL) {
  console.error(`[wasm-partes] --tamano-max debe estar entre 0 y ${Number(UMBRAL) / 1048576} MiB.`);
  process.exit(1);
}
if (!existsSync(OUT)) {
  console.error(`[wasm-partes] no existe ${OUT} — corre el build antes (bunx next build).`);
  process.exit(1);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Recorre out/ y devuelve TODO lo que pasa el umbral (no solo los conocidos:
 *  si mañana Next mete un asset gordo en otra ruta, hay que saberlo antes de
 *  que el deploy falle con un mensaje de Cloudflare y no con este). */
function excedidos(dir, acc = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) excedidos(ruta, acc);
    else if (st.size > 0 && BigInt(st.size) > UMBRAL)
      acc.push({
        ruta,
        nombre,
        size: st.size,
        rel: ruta.slice(OUT.length + 1).split("\\").join("/"),
      });
  }
  return acc;
}

/** Parte `ruta` en trozos de ≤ TAMANO_PARTE, los escribe al lado, VERIFICA
 *  byte-exactitud releyéndolos del disco, y solo entonces borra el original.
 *  Devuelve la entrada del manifiesto. */
function partir(info) {
  const original = readFileSync(info.ruta);
  const hash = sha256(original);
  const n = Math.ceil(original.byteLength / Number(TAMANO_PARTE));

  if (DRY) {
    console.log(`[wasm-partes] (dry) ${info.rel} ${(info.size / 1048576).toFixed(1)} MiB → ${n} partes ≤ ${(Number(TAMANO_PARTE) / 1048576).toFixed(1)} MiB`);
    return { partes: n, bytes: info.size, sha256: hash };
  }

  for (let i = 0; i < n; i += 1) {
    const destino = `${info.ruta}.parte${i}`;
    if (existsSync(destino)) rmSync(destino); // restos de un deploy anterior
    const trozo = original.subarray(i * Number(TAMANO_PARTE), Math.min((i + 1) * Number(TAMANO_PARTE), original.byteLength));
    writeFileSync(destino, trozo);
  }

  // Re-verificación desde disco: lo que Pages va a servir, no lo que creímos
  // escribir. Con 28 MiB cuesta ~100 ms y es la única defensa contra un corte
  // a medias (disco lleno, Ctrl+C) que deje un wasm roto servido como si no.
  const reconstruido = new Uint8Array(info.size);
  for (let i = 0; i < n; i += 1) {
    const destino = `${info.ruta}.parte${i}`;
    if (!existsSync(destino)) {
      console.error(`[wasm-partes] FALTA ${info.rel}.parte${i} tras escribirla — aborta sin borrar el original.`);
      process.exit(1);
    }
    const trozo = readFileSync(destino);
    if (BigInt(trozo.byteLength) > TAMANO_PARTE) {
      console.error(`[wasm-partes] ${info.rel}.parte${i} mide ${trozo.byteLength} > el umbral — Pages lo rechazaría.`);
      process.exit(1);
    }
    reconstruido.set(trozo, i * Number(TAMANO_PARTE));
  }
  const hashPartes = sha256(reconstruido);
  if (hashPartes !== hash) {
    console.error(`[wasm-partes] ✘ BYTE MISMATCH en ${info.rel}`);
    console.error(`[wasm-partes]   original: ${hash}`);
    console.error(`[wasm-partes]   partes:   ${hashPartes}`);
    console.error(`[wasm-partes]   No se borra el original; el deploy queda rojo a propósito.`);
    process.exit(1);
  }

  rmSync(info.ruta);
  console.log(`[wasm-partes] ${info.rel} ${(info.size / 1048576).toFixed(1)} MiB → ${n} partes · sha256 ${hash.slice(0, 12)}… verificado byte a byte`);
  return { partes: n, bytes: info.size, sha256: hash };
}

/** Re-deriva el inventario de un out/ que YA viene partido (re-ejecución local):
 *  lee los `X.wasm.parteN` contiguos, los suma y recalcula el sha256 desde
 *  disco. Sin esto, correr el script dos veces sobre el mismo `out/` vaciaba el
 *  manifiesto y la Function dejaba de servir los dos wasm — el mismo síntoma que
 *  este kit previene (OCR al camino lento), pero provocado por un simple re-run. */
function inventariarPartes(dir) {
  if (!existsSync(dir)) return {};
  const indices = {};
  for (const nombre of readdirSync(dir)) {
    const m = /^(.+\.wasm)\.parte(\d+)$/.exec(nombre);
    if (!m) continue;
    (indices[m[1]] ??= []).push(Number(m[2]));
  }
  const inventario = {};
  for (const [base, idx] of Object.entries(indices)) {
    idx.sort((a, b) => a - b);
    for (let n = 0; n < idx.length; n += 1) {
      if (idx[n] !== n) {
        console.error(`[wasm-partes] ${base} tiene partes NO contiguas (${idx.join(",")}) — falta .parte${n}.`);
        process.exit(1);
      }
    }
    const trozos = idx.map((n) => readFileSync(join(dir, `${base}.parte${n}`)));
    for (const t of trozos) {
      if (BigInt(t.byteLength) > UMBRAL) {
        console.error(`[wasm-partes] una parte de ${base} mide ${t.byteLength} > el umbral: Pages la rechazaría.`);
        process.exit(1);
      }
    }
    const cuerpo = Buffer.concat(trozos);
    inventario[base] = { partes: idx.length, bytes: cuerpo.byteLength, sha256: sha256(cuerpo) };
    if (!DRY) {
      console.log(
        `[wasm-partes] ${base} ya estaba partido (${idx.length} partes, ${(cuerpo.byteLength / 1048576).toFixed(1)} MiB) · sha256 ${inventario[base].sha256.slice(0, 12)}… reusado`,
      );
    }
  }
  return inventario;
}

// Los dos `assets` de salida salen del MISMO objeto: el manifiesto y
// `_routes.json` se escriben el uno a partir del otro, así que no pueden
// declararse rutas que el manifiesto no conozca (y viceversa).
const assets = inventariarPartes(join(OUT, CARPETA_WASM));
const reusados = Object.keys(assets).length;
const lista = excedidos(OUT);

let partidos = 0;
let borrados = 0;
for (const info of lista) {
  if (!info.rel.startsWith(`${CARPETA_WASM}/`)) {
    if (DRY) {
      console.log(`[wasm-partes] (dry) ${info.rel} ${(info.size / 1048576).toFixed(1)} MiB → BORRADO (sin Function en esa ruta)`);
      continue;
    }
    rmSync(info.ruta);
    borrados += 1;
    console.log(`[wasm-partes] ${info.rel} ${(info.size / 1048576).toFixed(1)} MiB → fuera de out/ (duplicado, no lo sirve ninguna Function)`);
    continue;
  }
  assets[info.nombre] = partir(info);
  partidos += 1;
}

if (lista.length === 0 && reusados === 0) {
  console.log(`[wasm-partes] nada supera ${(Number(UMBRAL) / 1048576).toFixed(1)} MiB en out/ — nada que partir.`);
}

if (DRY) process.exit(0);

const dirE14 = join(OUT, "e14");
mkdirSync(dirE14, { recursive: true });
// Manifiesto SIEMPRE, aunque esté vacío: un archivo viejo con entradas muertas
// hace que la Function pida partes que no están en el deployment (502 en el
// navegador del visitante) en vez de no intervenir.
writeFileSync(join(OUT, MANIFIESTO_REL), `${JSON.stringify({ version: 1, generado: new Date().toISOString(), assets }, null, 2)}\n`);

/** `_routes.json` es OBLIGATORIO, no un adorno. Sin él, Cloudflare Pages ejecuta
 *  las Functions para TODAS las rutas que casen con `functions/**`, así que la de
 *  `vendor/onnxruntime/[file]` sombrearía los assets estáticos chicos (el `.mjs`
 *  del worker de ORT y el `simd-threaded.wasm` de 13,6 MiB) y el OCR se caería a
 *  404 con la app entera intacta. Medido el 2026-11-03 en `wrangler pages dev`:
 *  la premisa de D77 («un asset estático pega PRIMERO que la Function») es FALSA,
 *  así que el esquema R2 de D77 habría roto producción en su primer deploy verde.
 *
 *  `include` lista solo lo que se partió en este run. Con `include: []` no corre
 *  ninguna Function, que es el estado correcto cuando nada pasó el umbral. */
const include = Object.keys(assets)
  .sort()
  .map((nombre) => `/${CARPETA_WASM}/${nombre}`);
writeFileSync(join(OUT, "_routes.json"), `${JSON.stringify({ version: 1, include, exclude: [] }, null, 2)}\n`);

const total = lista.reduce((a, f) => a + f.size, 0);
console.log(
  `[wasm-partes] ${partidos} partidos${reusados ? ` + ${reusados} reusados` : ""} en ${Object.values(assets).reduce((a, e) => a + e.partes, 0)} partes · ${borrados} borrados · ${(total / 1048576).toFixed(1)} MiB fuera del despliegue`,
);
console.log(`[wasm-partes] manifiesto e14/wasm-partes.json · _routes.json → ${include.length ? include.join(" ") : "sin rutas"}`);
