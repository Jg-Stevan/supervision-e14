#!/usr/bin/env node
/**
 * D-35 (plan 2026-11-12) — verificación AUTOMÁTICA de cabeceras COOP/COEP
 * contra el dominio que sirva la app (Cloudflare Pages en producción, el
 * servidor COOP/COEP local en desarrollo).
 *
 * La deuda: la verificación era MANUAL (D80/SEC-3 — `curl -sI | grep
 * cross-origin`) y se olvidaba en cada deploy. Sin COOP/COEP el
 * crossOriginIsolated cae a false, SharedArrayBuffer desaparece y el OCR
 * WASM corre a 1 hilo SIN ERROR VISIBLE — el deploy se ve verde y el motor
 * pierde los hilos. Este script es el check de CI: sale 1 si las cabeceras
 * no llegan o están mal, 0 si están bien.
 *
 * Uso:
 *   node scripts/verificar-cabeceras.mjs [url]
 *   DOMINIO_PRODUCCION=https://<dominio-final> node scripts/verificar-cabeceras.mjs
 *   (en CI: la variable DOMINIO_PRODUCCION del repo — sin ella, el paso se
 *    OMITE con aviso: un check que no puede correr no debe mentir verde.)
 *
 * Qué exige (misma matriz del RUNBOOK / D80):
 *   COOP:  Cross-Origin-Opener-Policy: same-origin
 *   COEP:  Cross-Origin-Embedder-Policy: require-corp | credentialless
 *   COEP-Report-Only NUNCA cuenta (report-only no aísla nada).
 */

const COOP_OK = new Set(["same-origin"]);
const COEP_OK = new Set(["require-corp", "credentialless"]);

function cabeceraDe(headers, nombre) {
  const v = headers.get(nombre);
  return typeof v === "string" ? v.trim() : null;
}

async function verificar(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.error(`✗ ${url} → HTTP ${res.status}`);
    return false;
  }
  const coop = cabeceraDe(res.headers, "cross-origin-opener-policy");
  const coep = cabeceraDe(res.headers, "cross-origin-embedder-policy");
  const coepRo = cabeceraDe(res.headers, "cross-origin-embedder-policy-report-only");
  let ok = true;
  if (coop === null || !COOP_OK.has(coop)) {
    console.error(`✗ COOP ausente o inválida: ${String(coop)} (esperado same-origin)`);
    ok = false;
  } else {
    console.log(`✓ COOP: ${coop}`);
  }
  if (coep === null || !COEP_OK.has(coep)) {
    console.error(`✗ COEP ausente o inválida: ${String(coep)} (esperado require-corp o credentialless)`);
    ok = false;
  } else {
    console.log(`✓ COEP: ${coep}`);
  }
  if (coepRo !== null && coep === null) {
    console.error("✗ SOLO hay COEP-Report-Only: report-only NO aísla (el OCR correría a 1 hilo)");
    ok = false;
  }
  if (ok) console.log(`✓ ${url} aislado (COOP/COEP) — crossOriginIsolated puede ser true`);
  return ok;
}

const url =
  process.argv[2] ??
  process.env.DOMINIO_PRODUCCION ??
  process.env.URL_CABECERAS ??
  null;

if (!url) {
  console.log(
    "SKIP · verificar-cabeceras — sin DOMINIO_PRODUCCION/URL_CABECERAS (y sin url argv): nada real que verificar.",
  );
  process.exit(0);
}

verificar(url.replace(/\/+$/, "") + "/")
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error(`✗ fallo de red: ${String(e)}`);
    process.exit(1);
  });
