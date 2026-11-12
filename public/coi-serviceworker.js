/**
 * KIT perf/coi-sw-v1 (P0-1 del REPORTE-perfil-medio-rendimiento-v1) —
 * Service Worker de AISLAMIENTO CROSS-ORIGIN + caché de assets vendidos.
 *
 * PROBLEMA: el plan recomendado ofrece `ocrThreads: 4` pero el runtime ONNX
 * queda forzado a 1 hilo cuando `crossOriginIsolated === false` (rapidocr.ts
 * L521-527 — el branch threaded requiere SharedArrayBuffer, que requiere
 * COOP/COEP). GitHub Pages NO permite cabeceras HTTP (public/_headers es
 * de Cloudflare Pages) → en el despliegue actual el OCR corre mono-hilo.
 *
 * SOLUCIÓN: un Service Worker SÍ puede añadir cabeceras a SUS respuestas —
 * incluidas las de navegación. Al servir la página con
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 * la página nace crossOriginIsolated=true → SAB disponible → el runtime
 * wasm (onnxruntime/zxing/zbar) usa hilos reales. Mismas cabeceras que
 * public/_headers (paridad Cloudflare ↔ GH Pages).
 *
 * SEGURIDAD (paridad con la fortaleza documentada del repo): el sitio es
 * 100 % same-origin (sin CDNs, sin iframes externos) — require-corp es
 * seguro. La CSP viaja por <meta> (SEC-3) y no cambia. El SW NO intercepta
 * cross-origin (guard de origen) ni métodos no-GET.
 *
 * BONUS P0-2: caché-FIRST persistente para los assets vendidos inmutables
 * (/vendor/, /models/, /wasm/, /scanner/) — GH Pages sirve max-age=600
 * (10 min); el SW elimina el re-fetch de ~46 MB de modelos/wasm en cada
 * visita fría dentro del plazo del cache (independiente de las cabeceras
 * del host). Solo assets vendidos: NUNCA cachea/_next/ (dev/HMR intacto).
 *
 * Registro: <head> del layout (script inline) — solo si
 * !crossOriginIsolated. Tras la primera activación recarga la página UNA
 * vez (guard sessionStorage) para heredar el aislamiento de la navegación.
 * Subsecuentes visitas nacen aisladas sin recarga.
 *
 * Kill-switch del mantenedor: no registrar el SW (el script del layout es la
 * única línea que lo activa) → byte-idéntico a hoy.
 */

// ─── caché de assets vendidos (P0-2.3) ──────────────────────────────────────
const NOMBRE_CACHE = "e14-vendor-cache-v1";
const TOPE_ENTRADAS = 80; // vendor+models+wasm+scanner ≈ 60 MB — acotado

/** ¿Es un asset vendido inmutable (mismo patrón que _headers de CF Pages)?
 *  Substring match — seguro con basePath de GH Pages (/supervision-e14/). */
function esAssetVendido(pathname) {
  return (
    pathname.includes("/vendor/") ||
    pathname.includes("/models/") ||
    pathname.includes("/wasm/") ||
    pathname.includes("/scanner/")
  );
}

/** Cache-first con eviction FIFO (tope acotado). Fallo de red sin cache →
 *  re-lanza (comportamiento normal del navegador). Jamás cachea respuestas
 *  no-OK ni only-if-cached (sourcemaps de dev). */
async function assetDesdeCache(req) {
  const cache = await caches.open(NOMBRE_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && req.cache !== "only-if-cached") {
    // Fire-and-forget con eviction: la respuesta ya sale al consumidor.
    cache.put(req, res.clone()).then(async () => {
      const claves = await cache.keys();
      if (claves.length > TOPE_ENTRADAS) {
        await cache.delete(claves[0]); // FIFO — los vendidos no caducan
      }
    }).catch(() => {});
  }
  return res;
}

/** Navegación → MISMA respuesta con COOP/COEP añadidos (paridad _headers). */
async function navegacionAislada(req) {
  const res = await fetch(req);
  try {
    const cabeceras = new Headers(res.headers);
    cabeceras.set("Cross-Origin-Opener-Policy", "same-origin");
    cabeceras.set("Cross-Origin-Embedder-Policy", "require-corp");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: cabeceras,
    });
  } catch {
    return res; // body ya consumido/roto — devolver tal cual
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // cross-origin jamás toca
  if (req.mode === "navigate") {
    event.respondWith(navegacionAislada(req));
    return;
  }
  if (esAssetVendido(url.pathname)) {
    event.respondWith(assetDesdeCache(req));
  }
});

// Activación: tomar el control de las páginas abiertas (la recarga la hace
// el script del layout cuando registration.active existe).
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
