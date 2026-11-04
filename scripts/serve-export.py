"""serve-export.py — sirve `out/` (el `next build` con `output: "export"`) con
las cabeceras que el navegador NECESITA para el motor OCR.

Por qué existe: `public/_headers` (Cloudflare Pages) manda COOP/COEP, eso activa
`window.crossOriginIsolated`, y con él `SharedArrayBuffer` — que es lo que
permite a onnxruntime-web y a zxing/wasm usar VARIOS hilos. Sin esas cabeceras
el mismo build corre el OCR con UN hilo. Medido el 2026-11-03 en el lote demo
(6 actas, CPU de 4 núcleos, `python -m http.server`, sin COOP/COEP): la primera
acta tardó 352 s y salió RECHAZADA (score 0); con las cabeceras el mismo build
baja a minutos y las actas se aceptan. En el `next dev` de siempre tampoco
aplican, así que las cifras de navegador que salgan de ahí son falsas.

Uso:  python scripts/serve-export.py [puerto]     # puerto = 8080 por defecto
Luego:  http://localhost:8080/#vista=carga-masiva

Si en ese puerto y origin corrías algo SIN COOP/COEP antes, Chrome puede
reutilizar el documento desde su caché y `window.crossOriginIsolated` sale
false aunque las cabeceras viajen (el OCR queda en UN hilo y el lote se cae a
hard-kills). Abre con un query nuevo (`/?cb=1#vista=carga-masiva`) o recarga
forzada. Verificar: `crossOriginIsolated === true` en la consola.

Solo bucle local y solo lectura: es un servidor de desarrollo/medición, no una
manera de publicar (para publicar está Cloudflare Pages / GitHub Pages).

Lo que además hace (KIT e14-pages-wasm-partes-v1, D80): `out/` ya NO trae
enteros los wasm que Pages rechaza por tamaño — `scripts/cf-wasm-partes.mjs` los
parte y lo que sirve producción es la Pages Function que los pega. Este servidor
pega lo mismo, leyendo `out/e14/wasm-partes.json`. Sin eso el navegador medaría
un build al que le faltan `jsep.wasm` (EP WebGPU) y `asyncify.wasm` (worker del EP
wasm), que es justamente el camino lento: la medición saldría lenta y atribuida
al código equivocado.
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import shutil
import socketserver
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(AQUI, "..", "out"))
MANIFIESTO = os.path.join(OUT, "e14", "wasm-partes.json")

# application/wasm es obligatorio para el compile streaming de los .wasm; los
# demás los conoce mimetypes, pero se listan por si el registro del host falta.
TIPOS = {
    ".wasm": "application/wasm",
    ".onnx": "application/octet-stream",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".data": "application/octet-stream",
}

# `--no-store` en la línea de mando: nada cacheable (la medición vieja).
SIN_CACHA = "--no-store" in sys.argv


class Manejador(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 por OPEN: el predato de `http.server` es 1.0 sin keep-alive, así
    # que cada imagen del lote demo abre su TCP propio. Medido: SEMBRAR el lote
    # (6 fotos de ~3 MB) tardó 80 s con 1.0 y segundos con 1.1 — una medición
    # del navegador tomada sobre 1.0 es basura.
    protocol_version = "HTTP/1.1"

    # Lo pone `_error` a True: una respuesta de fallo nunca va `immutable`.
    _no_store = False

    def do_GET(self):
        """Archivo que existe en disco -> el comportamiento de siempre.

        Archivo que NO existe pero está en el manifiesto -> se ensamblean sus
        partes en la misma URL, igual que `functions/vendor/onnxruntime/[file].ts`
        en Pages. Cualquier otra cosa cae al 404 de `SimpleHTTPRequestHandler`.
        """
        fisica = self.translate_path(self.path)
        if not os.path.isfile(fisica):
            entrada = self._entrada_del_manifiesto(fisica)
            if entrada is not None:
                self._servir_partes(fisica, entrada)
                return
        super().do_GET()

    @staticmethod
    def _entrada_del_manifiesto(fisica):
        if not os.path.isfile(MANIFIESTO):
            return None
        try:
            with open(MANIFIESTO, encoding="utf-8") as fh:
                man = json.load(fh)
        except (OSError, ValueError):
            return None
        # Clave = nombre de archivo (el manifiesto solo lista `vendor/onnxruntime/`),
        # así que un `X.parte0` huérfano en otra ruta no se cuela.
        return man.get("assets", {}).get(os.path.basename(fisica))

    def _servir_partes(self, fisica, entrada):
        partes = [f"{fisica}.parte{i}" for i in range(int(entrada["partes"]))]
        rotas = [p for p in partes if not os.path.isfile(p)]
        if rotas:
            self._error(500, f"FALTA {os.path.basename(rotas[0])} — corre `bun run scripts/cf-wasm-partes.mjs`")
            return
        # El mismo pre-chequeo de la Function: un `split` cortado a medias dejaría
        # un total distinto al declarado, y es mejor un 500 que servir un wasm
        # truncado que ORT falle 600 km más adentro con un `CompileError` raro.
        total = sum(os.path.getsize(p) for p in partes)
        if total != int(entrada["bytes"]):
            self._error(500, f"LAS PARTES DE {os.path.basename(fisica)} SUMAN {total} Y EL MANIFIESTO DECLARA {entrada['bytes']}")
            return
        self.send_response(200)
        self.send_header("Content-Type", TIPOS.get(os.path.splitext(fisica)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(total))
        self.end_headers()
        try:
            for p in partes:
                with open(p, "rb") as fh:
                    shutil.copyfileobj(fh, self.wfile, 1 << 20)
        except (BrokenPipeError, ConnectionResetError):
            pass  # el navegador canceló el fetch; no es un fallo que denunciar

    def _error(self, codigo, texto):
        # Cuerpo en UTF-8 y cabecera propia, no `send_error`: (1) la línea de
        # estado de HTTP se codifica en latin-1 y un em-dash español la revienta
        # con UnicodeEncodeError antes de enviar nada; (2) el `end_headers` de
        # abajo marca los `.wasm` como `immutable`, y un 500 cacheado un año es
        # un fallo eterno y silencioso. Mismo criterio que `CABECERAS_FALLO` en
        # la Pages Function.
        cuerpo = texto.encode("utf-8")
        self._no_store = True
        self.send_response(codigo)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        try:
            self.wfile.write(cuerpo)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def end_headers(self):
        # Las tres de siempre: sin COEP `require-corp` no hay aislamiento y el
        # navegador niega SharedArrayBuffer. Todo el sitio es same-origin (los
        # modelos y el WASM viajan en public/), así que no rompe nada.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        # Caché por tipo, NO `no-store` global: los modelos (.onnx/.wasm, ~32 MB)
        # se piden cada vez que un worker de OCR arranca, y en el lote eso pasa
        # varias veces por acta. Con `no-store` el mismo build se midió 3× más
        # lento que en Pages. Lo hasheado (`/_next/static`, `/vendor`) es
        # inmutable por nombre; el HTML va `no-cache` para medir el build de HOY.
        # `--no-store` (arg 2) fuerza el comportamiento viejo si se duda.
        ruta = self.path.split("?", 1)[0]
        if self._no_store:
            # Respuesta de `_error`: la regla por tipo marcaría `.wasm` como
            # inmutable y el fallo quedaría cacheado un año. Se consume aquí
            # porque el mismo handler sirve varias peticiones por conexión
            # (keep-alive 1.1).
            self.send_header("Cache-Control", "no-store")
            self._no_store = False
        elif SIN_CACHA or ruta.endswith(".html") or ruta in ("/", ""):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return TIPOS.get(ext) or super().guess_type(path)

    def log_message(self, *a):  # silencioso: el lote hace cientos de peticiones
        pass


def main() -> int:
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    puerto = int(pos[0]) if pos else 8080
    if not os.path.isdir(OUT):
        print(f"[serve-export] no existe {OUT} — corre primero `bun run build`")
        return 1
    handler = functools.partial(Manejador, directory=OUT)

    class Servidor(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True  # keep-alive 1.1: una hebra por conexión viva

    with Servidor(("127.0.0.1", puerto), handler) as httpd:
        print(f"[serve-export] {OUT} en http://localhost:{puerto}/#vista=carga-masiva "
              f"(COOP/COEP ON -> crossOriginIsolated -> hilos WASM)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
