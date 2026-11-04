/**
 * functions/vendor/onnxruntime/[file].ts — KIT e14-pages-wasm-partes-v1 (D80)
 *
 * Devuelve entero el asset que `scripts/cf-wasm-partes.mjs` PARTIÓ al subir.
 *
 * El problema de origen: Cloudflare Pages corta en 25 MiB POR ASSET SUBIDO y
 * dos wasm del camino rápido lo pasan —
 *
 *   ort-wasm-simd-threaded.jsep.wasm      27,0 MiB  ← el EP WebGPU
 *   ort-wasm-simd-threaded.asyncify.wasm  25,5 MiB  ← el worker proxy del EP wasm
 *
 * Borrarlos no sirve (sin `jsep` el demo publicado pasa de ~60 s a 218 s CON
 * un acta rechazada; sin `asyncify` se cae el `ort.env.wasm.proxy = true` del
 * camino CPU, rapidocr.ts:780-822) y el R2 que usaba D77 tampoco: habilitar R2
 * es consentimiento de cuenta en el dashboard y puede pedir método de pago.
 *
 * La salida: Pages no limita el tamaño de la RESPUESTA de una Function, y en
 * Free cobra 10 ms de CPU por invocación con streamear counted como I/O. Así
 * que se suben partes de ≤20 MiB (cada una pasa el corte) y aquí se pegan en
 * un `ReadableStream` con backpressure. El `fetch` de ORT pide la MISMA URL de
 * siempre, así que la app, `wasmPaths`, la CSP y `public/_headers` no se tocan.
 *
 * Coste por invocación: 1 subrequest del manifiesto + N de partes (límite 50,
 * usamos 3) y ~1 ms de CPU. Cero dependencias de cuenta.
 *
 * Por qué esto no cambia nada para la app:
 * · Same-origin: la Function vive bajo /vendor/onnxruntime/ → COEP
 *   `require-corp` satisfecho sin CORP nuevo; `connect-src 'self'` intacto.
 * · Prioridad: NO es que un asset estático pegue primero que la Function — esa
 *   premisa de D77 es FALSA y se midió (sin `_routes.json` esta ruta sombreaba
 *   el `simd-threaded.wasm` de 13,6 MiB y los `.mjs` y los devolvía 404). Lo que
 *   hace que lo chico lo sirva Pages es `out/_routes.json`, que el build escribe
 *   con `include` = solo los assets partidos. Si alguien toca esta ruta sin tocar
 *   el generador de `_routes.json`, el OCR se cae a 404 con la app entera verde.
 * · Solo LECTURA: se leen assets propios por nombre validado con patrón
 *   estricto de un segmento (no hay `..` ni slashes → ni SSRF ni path traversal
 *   a otras rutas del deployment).
 * · La invariante es byte-exactitud: el manifiesto declara `bytes` y `sha256`
 *   y aquí se comprueba que la SUMA de `content-length` de las partes cuadra
 *   antes de streamar. Si un deploy quedó a medias, el navegador ve un 5xx con
 *   `no-store` y ORT cae al EP que sí puede cargar — nunca un wasm roto
 *   cacheado un año, que es el fallo silencioso que este kit viene a evitar.
 *
 * El manifiesto vive en /e14/ y no en /vendor/ a propósito: `/e14/*` se sirve
 * con `must-revalidate` (es DATO) mientras `/vendor/*` es `immutable` un año;
 * un manifiesto inmutable es la receta exacta para servir partes viejas de un
 * asset que cambió de tamaño entre deploys.
 */

interface EntradaManifiesto {
  partes: number;
  bytes: number;
  sha256: string;
}

interface Manifiesto {
  version?: number;
  assets?: Record<string, EntradaManifiesto>;
}

interface ContextoFuncion {
  params: Record<string, string | string[]>;
  request: { url: string };
}

const CLAVE_VALIDA = /^[A-Za-z0-9._-]+$/;
const PREFIJO_WASM = "/vendor/onnxruntime/";
const RUTA_MANIFIESTO = "/e14/wasm-partes.json";

const TIPOS: Record<string, string> = {
  wasm: "application/wasm",
  mjs: "text/javascript",
  js: "text/javascript",
  json: "application/json",
};

/** Todo lo que es fallo o dato volátil: sin esto, un 404 de Function quedaría
 *  cacheado por el navegador y el fallo se volvería eterno hasta otra URL. */
const CABECERAS_FALLO: Record<string, string> = { "cache-control": "no-store" };

export const onRequestGet = async (context: ContextoFuncion): Promise<Response> => {
  const clave = String(context.params.file ?? "");
  if (!CLAVE_VALIDA.test(clave) || clave.includes("..")) {
    return new Response("CLAVE INVÁLIDA", { status: 400, headers: CABECERAS_FALLO });
  }

  const origen = new URL("/", context.request.url);
  const respuestaManifiesto = await fetch(new URL(RUTA_MANIFIESTO, origen));
  if (!respuestaManifiesto.ok) {
    return new Response(`NO HAY MANIFIESTO en ${RUTA_MANIFIESTO} (${respuestaManifiesto.status})`, {
      status: 500,
      headers: CABECERAS_FALLO,
    });
  }
  const manifiesto = (await respuestaManifiesto.json()) as Manifiesto;
  const entrada = manifiesto.assets?.[clave];
  if (!entrada || entrada.partes < 1) {
    // 404 con no-store: si el `split` del build no corrió, el navegador ve el
    // fallo de frente (ORT cae solo al EP que pueda cargar) en vez de un HTML
    // de Pages cacheado por un año que haría el fallo eterno y silencioso.
    return new Response(`${clave} NO ESTÁ EN EL MANIFIESTO DE PARTES`, { status: 404, headers: CABECERAS_FALLO });
  }

  // En paralelo: son N subrequests del mismo deployment y esperarlos de uno en
  // uno solo alarga el wall-clock de la invocación (el límite es 50 subrequests
  // y usamos 1 + N).
  const respuestas: Response[] = await Promise.all(
    Array.from({ length: entrada.partes }, (_, n) => fetch(new URL(`${PREFIJO_WASM}${clave}.parte${n}`, origen))),
  );
  const mala = respuestas.findIndex((r) => !r.ok || !r.body);
  if (mala !== -1) {
    return new Response(`PARTE ${mala}/${entrada.partes} DE ${clave} NO RESPONDE (${respuestas[mala].status})`, {
      status: 502,
      headers: CABECERAS_FALLO,
    });
  }

  // Pre-chequeo de coherencia manifiesto↔partes. Si un deploy subió partes de
  // otro build, el `content-length` no cuadra y es MEJOR un 503 visible que
  // streamar un wasm truncado.
  const longitudes = respuestas.map((r) => Number(r.headers.get("content-length") ?? "0"));
  if (longitudes.every((n) => n > 0)) {
    const total = longitudes.reduce((a, n) => a + n, 0);
    if (total !== entrada.bytes) {
      return new Response(
        `PARTES DE ${clave} SUMAN ${total} Y EL MANIFIESTO DECLARA ${entrada.bytes} — deploy inconsistente`,
        { status: 503, headers: CABECERAS_FALLO },
      );
    }
  }

  // Pegado con backpressure real (pull, no un bucle en start): si esto se
  // bufferara entero serían 27 MiB dentro de un isolate con techo de 128 MB.
  // Cada pull o encola un trozo o cierra — nunca devuelve sin progreso, porque
  // un ReadableStream cuyo pull no encola nada depende de que el motor vuelva a
  // llamarlo, y eso es exactamente cómo un wasm se queda colgado a medio bajar.
  let i = 0;
  let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const cuerpo = new ReadableStream<Uint8Array>({
    async pull(controlador) {
      for (;;) {
        if (!lector) {
          if (i >= respuestas.length) {
            controlador.close();
            return;
          }
          const parte = respuestas[i];
          if (!parte.body) {
            controlador.error(new Error(`parte ${i} de ${clave} sin cuerpo`));
            return;
          }
          lector = parte.body.getReader();
        }
        const { done, value } = await lector.read();
        if (done) {
          lector.releaseLock();
          lector = null;
          i += 1;
          continue;
        }
        if (value) {
          controlador.enqueue(value);
          return;
        }
      }
    },
    cancel() {
      if (!lector) return;
      try {
        lector.releaseLock();
      } catch {
        // releaseLock con una lectura pendiente lanza; el stream ya se va.
      }
      lector = null;
    },
  });

  const ext = clave.split(".").pop() ?? "";
  return new Response(cuerpo, {
    headers: {
      "content-type": TIPOS[ext] ?? "application/octet-stream",
      "content-length": String(entrada.bytes),
      "cache-control": "public, max-age=31536000, immutable",
      "cross-origin-resource-policy": "same-origin",
      "etag": `"${entrada.sha256}"`,
    },
  });
};
