"""bench-acta.py — mide el /acta SECUENCIAL (una ida a la vez, como el relé de
la app) contra un sidecar ya arrancado. Se usa para comparar `--sesiones` sin
el navegador en medio.

  python native/servidor.py --sesiones 1 &   # o 2
  python native/bench-acta.py
"""
from __future__ import annotations

import base64
import glob
import hashlib
import json
import os
import sys
import time
import urllib.request

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
CAP = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
AQUI = os.path.dirname(os.path.abspath(__file__))
RUTAS = sorted(
    glob.glob(
        os.path.join(
            AQUI, "..", "src", "modules", "digitalizador",
            "assets", "actas-demo", "*.jpg",
        )
    )
    or glob.glob(
        os.path.join(
            AQUI, "..", "supervision-e14", "src", "modules", "digitalizador",
            "assets", "actas-demo", "*.jpg",
        )
    )
)


def acta(data_url: str) -> dict:
    cuerpo = json.dumps({"imagen": data_url, "cap": CAP}).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:{PUERTO}/acta", data=cuerpo,
        headers={"content-type": "application/json"},
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=180) as res:
        j = json.loads(res.read().decode("utf-8"))
    j["_muro"] = round((time.perf_counter() - t0) * 1000)
    return j


def main() -> int:
    if not RUTAS:
        print("no hay actas de ejemplo")
        return 1
    # DOS pasadas: la primera calienta (page cache, grafo), la segunda es la
    # que se mide — misma regla que el relé de la app con el sidecar caliente.
    for pasada in (1, 2):
        totales, etapa = [], {}
        for r in RUTAS:
            with open(r, "rb") as f:
                d = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode("ascii")
            j = acta(d)
            e = j.get("etapas") or {}
            for k, v in e.items():
                etapa[k] = etapa.get(k, 0) + int(v or 0) / len(RUTAS)
            totales.append(j["_muro"])
            if pasada == 2:
                print(f"  {os.path.basename(r)}: {j['_muro']/1000:.2f}s "
                      f"srv={j['totalMs']}ms lineas={j['nLineas']} qr={'si' if j['qr'] else 'no'} "
                      f"texto={hashlib.md5(j['texto'].encode('utf-8')).hexdigest()[:10]} "
                      f"conf={j['conf']} rot={j['rot']}")
        if pasada == 2:
            print(f"TOTAL {sum(totales)/1000:.1f}s · media {sum(totales)/len(totales)/1000:.2f}s/acta")
            print("etapas (ms promedio por acta): " +
                  ", ".join(f"{k}={round(v)}" for k, v in sorted(etapa.items(), key=lambda t: -t[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
