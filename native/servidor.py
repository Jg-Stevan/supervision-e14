"""
servidor.py — sidecar nativo del E-14 (KIT e14-ocr-nativo-v1).

Expone en 127.0.0.1 las rutas que la app web necesita para correr en CPU nativa
lo más caro del pipeline (el OCR en WASM y, en modo acta-completa, también el
warp, la b/n y el sondeo de orientación):

  GET  /salud  → {"ok":true,"motor":"v5","version":VERSION}
  POST /ocr    → {"imagen":"data:image/jpeg;base64,...","cap":1280}
              ← {"texto","conf","detMs","recMs","clsMs","nBoxes","nLineas"}
  POST /acta   → {"imagen":<dataURL de la foto ORIGINAL>, "cap":1280}
              ← {"procesada":<dataURL b/n>, "texto","conf","detMs","recMs",
                 "quad":[[x,y]×4 normalizados], "quadOrigen","rot","qr",
                 "ancho","alto","nBoxes","nLineas","etapas","totalMs"}

La app sigue haciendo SU gate, score, dedup y envío — del sidecar salen la
imagen de presentación y el texto ya enderezado. Cualquier fallo o timeout hace
que la app caiga al camino WASM de siempre (kill-switch: flag `ocrNativoUrl` a
null; `actaNativa` y `qrNativo` activan las dos rutas pesadas).

Arranque:  python native/servidor.py [--motor v5] [--puerto 8765]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import base64
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e14nativo as E  # noqa: E402

VERSION = "e14-ocr-nativo-v1"
MAX_BYTES = 32 * 1024 * 1024  # un dataURL de un acta a 4032 px ≈ 2-4 MB

# Orígenes a los que el sidecar le devuelve el cuerpo. Con `*` estaba bien
# mientras esto fue una herramienta del dueño con el repo en su máquina; en
# cuanto se reparte como .exe a visitantes, `*` significa que CUALQUIER página
# abierta en ese navegador puede encolar actas en el CPU del usuario y leer el
# texto que sale. Sin `Access-Control-Allow-Origin` en la respuesta el navegador
# no entrega el cuerpo, así que negar es el camino por defecto.
PROYECTO_PAGES = "supervision-e14.pages.dev"
LAZO = ("http://localhost:", "http://127.0.0.1:", "https://localhost:", "https://127.0.0.1:")


def origen_permitido(origen: str) -> bool:
    """C-22 — `null`/vacío se RECHAZA: un iframe sandbox (`allow-scripts`) de
    cualquier sitio público también manda `Origin: null`, así que aceptarlo
    deja que una página ajena encole actas en el CPU del visitante. La página
    del dueño SIEMPRE manda origen real (Pages/lazo); el modo file:// del
    dueño, si algún día hace falta, se allowlista EXPLÍCITO con
    `E14_ORIGENES="null"` (o el origen concreto) — nunca por omisión.
    Lazo = dev, `serve-export.py` y `pages dev`; y el proyecto de Pages con
    sus previsualizaciones (`https://<hash>.supervision-e14.pages.dev`).
    `E14_ORIGENES` añade dominios propios separados por coma sin tocar el código."""
    if origen in ("", "null"):
        # C-22 — por defecto RECHAZADO; solo entra si el dueño lo allowlistó
        # EXPLÍCITO en E14_ORIGENES (modo file:// de custodia del dueño).
        extra = os.environ.get("E14_ORIGENES", "")
        return origen in {x.strip() for x in extra.split(",") if x.strip()}
    if origen.startswith(LAZO):
        return True
    if origen == f"https://{PROYECTO_PAGES}":
        return True
    sufijo = f".{PROYECTO_PAGES}"
    if origen.startswith("https://") and origen.endswith(sufijo):
        subdominio = origen[len("https://"): -len(sufijo)]
        if subdominio and "." not in subdominio:
            return True
    extra = os.environ.get("E14_ORIGENES", "")
    return origen in {x.strip() for x in extra.split(",") if x.strip()}



class Motor:
    """Un POOL de sesiones ORT: cada una con cpu/n sesiones y su propio lock.
    Con una sola sesión los núcleos se quedan parados mientras el navegador
    decodifica, mide y sube el siguiente acta; con n, el lado nativo mantiene
    n actas en vuelo y el lote entero baja de ~7.6 s/acta a ~3 s."""

    def __init__(self, motor: str, con_cls: bool, sesiones: int = 1, hilos: int | None = None):
        det, rec, d = E.MOTORES[motor]
        self.nombre = motor
        # Hilos por sesión: por defecto los núcleos se REPARTEN entre las
        # sesiones. Con el relé de la app (un acta en vuelo, con huecos) ese
        # reparto deja núcleos parados, así que `--hilos` permite dar los de
        # todos a cada sesión y pagar la contención solo cuando dos actas se
        # cruzan de verdad.
        hilos = hilos or max(1, (os.cpu_count() or 2) // max(1, sesiones))
        self.hilos = hilos
        # cls SOLO si se pide: la sonda de orientación con cls se probó y se
        # descartó (12 de 24 giros mal — ver `enderezar` en e14nativo.py), así
        # que aquí el cls es únicamente el volteo 180° por línea.
        self.sesiones = [
            E.OCR(det, rec, d,
                  cls_nombre="ch_ppocr_mobile_v2.0_cls_infer.onnx" if con_cls else None,
                  hilos=hilos, cls_lineas=con_cls)
            for _ in range(max(1, sesiones))
        ]
        self.candados = [threading.Lock() for _ in self.sesiones]
        self._i = 0
        self._reparto = threading.Lock()

    def _tomar(self):
        """(OCR, lock) de la sesión libre — round-robin; bloquea hasta que una
        se desocupe (nunca dos inferencias en la misma sesión)."""
        with self._reparto:
            k = self._i
            self._i = (self._i + 1) % len(self.sesiones)
        self.candados[k].acquire()
        return self.sesiones[k], self.candados[k]

    def _decodifica(self, data_url: str) -> np.ndarray:
        """dataURL → BGR. El navegador manda SU propia foto original ya
        normalizada por EXIF (`parcial.fotoOriginal`), así que las coordenadas
        del quad que devolvemos caen sobre la MISMA imagen que ve el JS."""
        b64 = data_url.split(",", 1)[1] if "," in data_url[:64] else data_url
        img = cv2.imdecode(np.frombuffer(base64.b64decode(b64), np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("decode")
        return img

    @staticmethod
    def _dataurl_jpeg(img: np.ndarray, calidad: int = 92) -> str:
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, calidad])
        if not ok:
            raise ValueError("encode")
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")

    def ocr_desde_dataurl(self, data_url: str, cap: int):
        img = self._decodifica(data_url)
        ocr, candado = self._tomar()
        try:
            lineas, t, n_boxes, _ = ocr.reconocer(img, cap=cap)
        finally:
            candado.release()
        texto = "\n".join(l["texto"] for l in lineas)
        conf = float(np.mean([l["conf"] for l in lineas])) if lineas else 0.0
        return {
            "texto": texto,
            "conf": round(conf, 4),
            "detMs": t["msDet"],
            "recMs": t["msRec"],
            "clsMs": t["msCls"],
            "nBoxes": n_boxes,
            "nLineas": len(lineas),
        }

    def acta_desde_dataurl(self, data_url: str, cap: int):
        """Pipeline COMPLETO de un acta en una sola ida: quad → warp → sonda
        de orientación → b/n → QR → OCR. Devuelve la imagen de presentación
        (la b/n que el dueño ve en el visor) y el texto ya enderezado, más el
        quad NORMALIZADO (0..1 sobre la foto decodificada) para que el JS lo
        proyecte sobre SU propia copia del original sin depender de que ambos
        decodifiquen con el mismo tamaño — y conserve así SUS mediciones
        (calidad, completitud, esquinas) sin repetir el trabajo."""
        img = self._decodifica(data_url)
        h, w = img.shape[:2]
        ocr, candado = self._tomar()
        try:
            r, _w, bw = E.procesar_img(img, ocr, cap=cap, con_qr=True, sonda=True)
        finally:
            candado.release()
        return {
            "procesada": self._dataurl_jpeg(bw),
            "texto": r.texto,
            "conf": round(r.conf_media, 4),
            "detMs": r.etapas.get("msDet", 0),
            "recMs": r.etapas.get("msRec", 0),
            "clsMs": r.etapas.get("msCls", 0),
            "nBoxes": r.n_boxes,
            "nLineas": r.n_lineas,
            "quad": None if r.quadPts is None
            else [[round(x / w, 5), round(y / h, 5)] for x, y in r.quadPts],
            "quadOrigen": r.quad,
            "rot": r.rotacion,
            "qr": r.qr,
            "ancho": r.ancho,
            "alto": r.alto,
            "totalMs": r.total_ms,
            "sesiones": len(self.sesiones),
            "etapas": r.etapas,
        }

    def calentar(self, cap: int = 1280) -> int:
        """PASAR UNA ACTA POR CADA SESIÓN ANTES DE SERVIR. El primer /acta de un
        lote costaba 13,3 s contra 5,9-7,5 s de los siguientes: el grafo de ONNX
        Runtime se optimiza en la primera corrida y los pesos (~50 MB) todavía
        no están en la page cache. Se corre en paralelo, una hebra por sesión
        (round-robin de `_tomar` las reparte), así que calentar no tarda más que
        un acta. Devuelve ms; 0 si no hay foto de ejemplo (no es un error: el
        primer acta pagará el frío y nada más)."""
        data_url = _dataurl_calentamiento()
        if data_url is None:
            return 0
        t0 = time.perf_counter()
        hilos = [
            threading.Thread(target=self.acta_desde_dataurl, args=(data_url, cap), daemon=True)
            for _ in self.sesiones
        ]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        return round((time.perf_counter() - t0) * 1000)


def _dataurl_calentamiento() -> str | None:
    """Foto REAL de acta para calentar. Una foto de relleno (ruido, texto
    dibujado) no vale: el detector no saca cajas y el recognizador nunca corre,
    así que el grafo seguiría frío. Se buscan las actas del propio proyecto."""
    aqui = os.path.dirname(os.path.abspath(__file__))
    patrones = [
        os.path.join(aqui, "calentamiento", "*.jpg"),
        # C-23 — fixtures SINTÉTICAS vigentes del modo SIM (`acta-sim-*.jpg`),
        # directamente en `assets/` (la subcarpeta `actas-demo/` ya no existe:
        # el lote de fotos reales salió del HEAD con D87). native/ DENTRO del
        # repo (la forma versionada del KIT).
        os.path.join(aqui, "..", "src", "modules",
                     "digitalizador", "assets", "acta-sim-*.jpg"),
        # native/ HERMANO del repo (la copia de trabajo donde nació).
        os.path.join(aqui, "..", "supervision-e14", "src", "modules",
                     "digitalizador", "assets", "acta-sim-*.jpg"),
    ]
    for p in patrones:
        for ruta in sorted(glob.glob(p)):
            try:
                with open(ruta, "rb") as f:
                    return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode("ascii")
            except OSError:
                continue
    return None


class Manejador(BaseHTTPRequestHandler):
    motor: Motor = None  # inyectado por servir()
    protocol_version = "HTTP/1.1"

    def _cabeceras(self, codigo: int, cuerpo: bytes):
        # C-22 — la validación de origen va ANTES de emitir la línea de
        # estado: no se puede enviar `200` y luego un `403` (dos status lines
        # = respuesta rota). Origen no permitido → ÚNICA respuesta: 403.
        origen = self.headers.get("Origin", "")
        if not origen_permitido(origen):
            # C-22 — 403 EXPLÍCITO (antes se enviaba el cuerpo sin ACAO y el
            # navegador lo tapaba: negación invisible). Un iframe sandbox de
            # un sitio público obtiene 403 visible; el flujo legítimo de la
            # app (origen Pages o lazo) no pasa por aquí. Se loggeda porque
            # desde el navegador el síntoma sería «el acelerador no aparece».
            self.log_error("CORS: origen NO permitido: %r (añádelo a E14_ORIGENES si es tuyo)", origen or "null")
            cuerpo_403 = json.dumps(
                {"error": "origen", "detalle": "origen no permitido", "origen": origen or "null"},
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(403)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo_403)))
            # Deliberadamente SIN Access-Control-Allow-Origin ni
            # Access-Control-Allow-Private-Network: las cabeceras permissivas
            # jamás se emiten a orígenes fuera de la allowlist (C-22).
            self.end_headers()
            self.wfile.write(cuerpo_403)
            return
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        # CORS: la app es OTRO origen (lazo local o el sitio publicado) y bajo
        # COEP require-corp todo subrecurso necesita el permiso explícito.
        # Eco en vez de `*`: ver `origen_permitido`. `Vary: Origin` porque la
        # respuesta cambia con el Origin y una caché compartida mezclaría permisos.
        self.send_header("Access-Control-Allow-Origin", origen or "null")
        self.send_header("Vary", "Origin")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # Private Network Access: cuando una página PÚBLICA (https://*.pages.dev)
        # pide algo a 127.0.0.1 el navegador manda un preflight con
        # `Access-Control-Request-Private-Network: true`, y si la respuesta del
        # preflight no devuelve esa misma cabecera, Chrome corta el fetch. Hoy lo
        # consiente con un warning en la consola: el día que endurezcan, un
        # sidecar instalado y funcionando deja de servir y el visitante NI SE
        # ENTERA, porque el fallback al motor JS es silencioso por diseño.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _json(self, codigo: int, obj: dict):
        self._cabeceras(codigo, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):  # noqa: N802 — preflight
        self._cabeceras(204, b"")

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/salud"):
            # `pid` es parte del contrato de la sonda: dos sidecars en el MISMO
            # puerto se ven aquí (en Windows el bind duplicado es legal y el
            # tráfico se reparte — medido: 6 actas pasaron de 52 s a 58 s).
            self._json(200, {"ok": True, "version": VERSION, "motor": self.motor.nombre,
                             "pid": os.getpid(), "sesiones": len(self.motor.sesiones)})
        else:
            self._json(404, {"error": "ruta"})

    def _cuerpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BYTES:
            raise ValueError("tamano")
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def do_POST(self):  # noqa: N802
        ruta = self.path.split("?")[0]
        if not (ruta.startswith("/ocr") or ruta.startswith("/acta")):
            return self._json(404, {"error": "ruta"})
        try:
            cuerpo = self._cuerpo()
            cap = int(cuerpo.get("cap", 1280))
            t0 = time.perf_counter()
            if ruta.startswith("/acta"):
                salida = self.motor.acta_desde_dataurl(cuerpo["imagen"], cap)
            else:
                salida = self.motor.ocr_desde_dataurl(cuerpo["imagen"], cap)
            salida["totalMs"] = round((time.perf_counter() - t0) * 1000)
            self._json(200, salida)
        except Exception as err:  # nunca un 500 sin cuerpo: la app cae a WASM
            self._json(400, {"error": type(err).__name__, "detalle": str(err)[:200]})

    def log_message(self, *a):  # silencioso por defecto
        pass


def otro_sidecar(puerto: int) -> dict | None:
    """`/salud` de OTRO sidecar ya escuchando, o None. En Windows el segundo
    bind de un puerto NO falla (SO_REUSEADDR), así que arrancar dos veces deja
    DOS servidores repartiéndose las actas: cada una con la mitad de las hebras
    que necesita y el doble de memoria. Medido el 2026-11-03: el lote demo pasó
    de 52,0 s a 58,0 s con dos sidecars vivos. Se detecta ANTES de cargar los
    modelos para que el segundo arranque falle en menos de un segundo."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{puerto}/salud", timeout=1.0) as r:
            j = json.loads(r.read().decode("utf-8"))
        return j if j.get("ok") else None
    except Exception:
        return None


def servir(motor: str, puerto: int, con_cls: bool, sesiones: int, hilos: int | None = None,
           forzar: bool = False):
    previo = otro_sidecar(puerto)
    if previo and not forzar:
        print(f"[e14-nativo] YA HAY un sidecar en http://127.0.0.1:{puerto} "
              f"(pid={previo.get('pid')} motor={previo.get('motor')} "
              f"sesiones={previo.get('sesiones')}). Arrancar un SEGUNDO reparte los "
              f"núcleos y RALENTIZA el lote. Ciérralo primero, o arranca este con "
              f"--puerto OTRO si de verdad quieres dos.", flush=True)
        raise SystemExit(2)
    m = Motor(motor, con_cls, sesiones, hilos)
    Manejador.motor = m
    # SIN SO_REUSEADDR: así un puerto ocupado es un error ruidoso en lugar de
    # un segundo servidor fantasma (el `otro_sidecar` de arriba da el mensaje
    # legible; este es el cinturón para el caso de un no-sidecar escuchando).
    ThreadingHTTPServer.allow_reuse_address = 0
    httpd = ThreadingHTTPServer(("127.0.0.1", puerto), Manejador)
    print(f"[e14-nativo] sidecar en http://127.0.0.1:{puerto} · motor {motor} · "
          f"cls-lineas {con_cls} · {sesiones} sesión(es) × "
          f"{m.hilos} hilos — calentando…", flush=True)
    ms = m.calentar()
    print(f"[e14-nativo] LISTO{f' (calentada en {ms} ms)' if ms else ' (sin acta de ejemplo: no calentada)'}",
          flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor", default="v5", choices=list(E.MOTORES))
    ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--sesiones", type=int, default=2,
                    help="actas en vuelo a la vez (los núcleos se reparten entre ellas)")
    ap.add_argument("--con-cls", action="store_true", help="volteo 180° por línea (más lento)")
    ap.add_argument("--hilos", type=int, default=None,
                    help="hebras ORT por sesión (default: núcleos / sesiones)")
    ap.add_argument("--forzar", action="store_true",
                    help="arrancar aunque ya haya un sidecar en el puerto (RALENTIZA el lote)")
    args = ap.parse_args()
    servir(args.motor, args.puerto, args.con_cls, args.sesiones, args.hilos, args.forzar)
