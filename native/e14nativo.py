"""
e14nativo — acelerador nativo del pipeline MASIVA (E-14).

Replica en CPU nativa (OpenCV + ONNX Runtime) las etapas que en el navegador
corren en JS/WASM: decodificación con EXIF, detección del cuadrilátero, warp,
filtro b/n (corrección de sombras + Bradley-Roth + despeckle), decodificación
QR y OCR (DB det + cls + rec CTC) con los MISMOS modelos .onnx del repo y el
MESMO pre/post (paridad píxel a píxel con rapidocr.ts / db-postprocess.ts).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from dataclasses import dataclass, field

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ExifTags

# ─── constantes del filtro b/n (scanner-core/dist/image-modes.js) ───────────
BW_T = 0.15
BW_WINDOW_RATIO = 1 / 12
BW_DESPECKLE_PX = 3
ILLUM_MAP_LONG_SIDE = 800
ILLUM_KERNEL = 25
PROCESSED_MAX_LONG_SIDE = 4032

# ─── constantes DB (src/.../ocr/db-postprocess.ts) ──────────────────────────
DB_THRESH = 0.3
DB_BOX_THRESH = 0.5
DB_MAX_CANDIDATES = 1000
DB_UNCLIP_RATIO = 1.6
MIN_SIDE_DESCARTAR = 3
MIN_SIDE_TRAS_UNCLIP = 5
DET_CAP_PROD = 1920
DET_CAP_RAPIDO = 1280
REC_WMAX = 480
TEXT_SCORE = 0.5
MIN_PX_DET = 10  # CCL < 10 px es ruido (db-postprocess.ts:338)
SONDA_CAP = 512   # det de la sonda de orientación (solo decide el giro)

_AQUI = os.path.dirname(os.path.abspath(__file__))


def _modelos() -> str:
    """Carpeta de los .onnx de RapidOCR, en este orden: `E14_MODELS` (escape
    explícito), el bundle congelado del .exe, y la raíz del proyecto — `native/`
    vive DENTRO del repo (la forma versionada) o HERMANO de él (la copia de
    trabajo donde nació el KIT). En el repo se valida por la EXISTENCIA de
    public/models/rapidocr, no por el nombre de la carpeta: eso es lo que dejaba
    el `next(...)` original en un StopIteration ininteligible al mover el archivo
    de sitio.

    La rama congelada es lo que hace repartible el sidecar. PyInstaller (y
    Nuitka en modo onefile) descomprimen el `--add-data` en un directorio
    temporal que el runtime solo expone por `sys._MEIPASS`, y ahí NO existe
    `public/`: sin esta rama el .exe abortaba con «no encuentro la raíz del
    proyecto» en cualquier máquina sin checkout del repo, que es justamente la
    máquina del visitante al que va dirigido el instalador."""
    modelos = os.environ.get("E14_MODELS")
    if modelos:
        return modelos
    congelado = getattr(sys, "_MEIPASS", None)
    if congelado:
        raiz = os.path.join(congelado, "models", "rapidocr")
        if os.path.isdir(raiz):
            return raiz
        raise SystemExit(
            "[e14nativo] el ejecutable viene SIN modelos (no está "
            f"{raiz}). Es un fallo del empaquetado, no del usuario: ver "
            "scripts/empaquetar-sidecar.mjs y su --add-data."
        )
    candidatos = [os.environ["E14_REPO"]] if os.environ.get("E14_REPO") else []
    candidatos += [
        os.path.dirname(_AQUI),  # <repo>/native/e14nativo.py
        os.path.join(_AQUI, "supervision-e14"),
        os.path.join(os.path.dirname(_AQUI), "supervision-e14"),
    ]
    for p in candidatos:
        raiz = os.path.join(p, "public", "models", "rapidocr")
        if os.path.isdir(raiz):
            return os.path.abspath(raiz)
    raise SystemExit(
        "[e14nativo] no encuentro la raíz del proyecto (public/models/rapidocr). "
        "Arranca desde el repo (python native/servidor.py) o apunta E14_MODELOS."
    )


MODELS_DIR = _modelos()
CLS_MODELO = "ch_ppocr_mobile_v2.0_cls_infer.onnx"
CLS_HAY = os.path.exists(os.path.join(MODELS_DIR, CLS_MODELO))


def _sesion(nombre: str, dict_txt: str | None = None, hilos: int | None = None):
    so = ort.SessionOptions()
    so.intra_op_num_threads = hilos or max(1, os.cpu_count() or 2)
    so.inter_op_num_threads = 1
    so.log_severity_level = 3
    ses = ort.InferenceSession(
        os.path.join(MODELS_DIR, nombre), so, providers=["CPUExecutionProvider"]
    )
    if dict_txt:
        with open(os.path.join(MODELS_DIR, dict_txt), encoding="utf-8") as f:
            chars = [l for l in f.read().split("\n") if l]
        return ses, chars
    return ses


# ─── 1) lectura con EXIF ────────────────────────────────────────────────────
def leer_imagen(ruta: str) -> np.ndarray:
    """cv2.imread ya aplica la orientación EXIF (como imageOrientation:
    'from-image' del navegador) y decodifica ~2× más rápido que PIL."""
    img = cv2.imread(ruta, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"no se pudo leer {ruta}")
    return img


# ─── 2) detección del cuadrilátero — réplica de detection-worker.js ─────────
DETECT_PASSES = [  # (cannyLow, cannyHigh, dilate, epsRatio) — F-PERSP
    (50, 150, 0, 0.02), (50, 150, 2, 0.02), (50, 150, 2, 0.05),
    (30, 90, 0, 0.012), (30, 90, 2, 0.02), (20, 60, 2, 0.03),
]
PROCESS_LONG_SIDE = 400  # detector-client.js:5 — el frame de trabajo real
MIN_CONTOUR_AREA_PCT = 5e-3
MAX_CONTOUR_CANDIDATES = 8
TOP_CONTOURS = 5
QUAD_MIN_AREA_RATIO_DETECT = 0.10
MIN_SIDE_RATIO = 0.05
WHITENESS_WEIGHT = 0.25
SHRINK_QUAD_PX = 3.5
WARP_MAX_LONG_SIDE = 4032


def _ordena_pts(pts):
    """orderPoints del worker: TL = min(x+y), BR = max(x+y), TR = max(x−y),
    BL = min(x−y); None si el quad es degenerado (empates)."""
    pts = np.asarray(pts, np.float64).reshape(-1, 2)
    s = pts.sum(1)
    d = pts[:, 0] - pts[:, 1]  # x−y: máximo ⇒ arriba-derecha, mínimo ⇒ abajo-izquierda
    tl, br, tr, bl = s.argmin(), s.argmax(), d.argmax(), d.argmin()
    if len({tl, tr, br, bl}) != 4:
        return None
    return np.array([pts[tl], pts[tr], pts[br], pts[bl]], np.float64)


def _quad_area(q):
    x, y = q[:, 0], q[:, 1]
    return abs(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y)) / 2


def _es_convexo(q):
    sign = 0
    for i in range(4):
        p0, p1, p2 = q[i], q[(i + 1) % 4], q[(i + 2) % 4]
        c = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])
        if abs(c) < 1e-12:
            return False
        s = np.sign(c)
        if sign == 0:
            sign = s
        elif s != sign:
            return False
    return True


def _se_autocruza(q):
    def cruz(a, b, c, d):
        def dird(p, r, s):
            return (s[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (s[1] - p[1])
        d1, d2 = dird(c, d, a), dird(c, d, b)
        d3, d4 = dird(a, b, c), dird(a, b, d)
        return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))
    return cruz(q[0], q[1], q[2], q[3]) or cruz(q[1], q[2], q[3], q[0])


def _valida_quad(q, W, H, min_ratio=QUAD_MIN_AREA_RATIO_DETECT):
    if not _es_convexo(q) or _se_autocruza(q):
        return False
    if _quad_area(q) <= min_ratio * W * H:
        return False
    lados = [np.linalg.norm(q[(i + 1) % 4] - q[i]) for i in range(4)]
    mx = max(lados)
    if mx < 1e-12:
        return False
    return all(l / mx >= MIN_SIDE_RATIO for l in lados)


def _blanquedad(proc, q):
    """whitenessOfQuad: media de luma/255·(1 − sat·2.2) dentro del quad."""
    h, w = proc.shape[:2]
    x0, y0 = np.floor(q.min(0)).astype(int)
    x1, y1 = np.ceil(q.max(0)).astype(int)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w - 1, x1), min(h - 1, y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    m = np.zeros((y1 - y0 + 1, x1 - x0 + 1), np.uint8)
    cv2.fillPoly(m, [np.round(q - [x0, y0]).astype(np.int32)], 1)
    sub = proc[y0:y1 + 1, x0:x1 + 1].astype(np.float32)  # B,G,R
    mx = sub.max(2)
    mn = sub.min(2)
    luma = 0.299 * sub[:, :, 2] + 0.587 * sub[:, :, 1] + 0.114 * sub[:, :, 0]
    sat = (mx - mn) / np.maximum(mx, 1)
    wpx = luma / 255.0 * (1 - sat * 2.2)
    sel = wpx[m > 0]
    return float(np.clip(sel[sel > 0].mean(), 0, 1)) if sel.size else 0.0


def _elige_quad(polys, W, H):
    """selectQuad: top 5 por área ⇒ orden ⇒ valida ⇒ score = área/frame +
    0.25·blanquedad (el perfil 'auto' no añade bonus de aspect)."""
    mejor, mejor_score = None, -1.0
    for p in sorted(polys, key=lambda t: -t["area"])[:TOP_CONTOURS]:
        q = _ordena_pts(p["pts"])
        if q is None or not _valida_quad(q, W, H):
            continue
        score = p["area"] / (W * H) + WHITENESS_WEIGHT * p["wh"]
        if score > mejor_score:
            mejor, mejor_score = q, score
    return mejor


def _intersecta(l1, l2):
    den = l1[0] * l2[1] - l1[1] * l2[0]
    if abs(den) < 1e-12:
        return None
    return np.array([(l1[2] * l2[1] - l1[1] * l2[2]) / den,
                     (l1[0] * l2[2] - l1[2] * l2[0]) / den], np.float64)


def _encoge_quad(q, px=SHRINK_QUAD_PX):
    """shrinkQuad del worker: cada lado desplaza su recta `px` píxeles hacia
    dentro y las esquinas son las intersecciones de rectas consecutivas."""
    rectas = []
    for i in range(4):
        p, r = q[i], q[(i + 1) % 4]
        ex, ey = r - p
        L = np.hypot(ex, ey)
        if L <= 1e-12:
            rectas.append(np.zeros(3))
            continue
        a, b = -ey / L, ex / L
        rectas.append(np.array([a, b, -(a * p[0] + b * p[1]) - px]))
    max_shift = 10 * abs(px)
    out = []
    for i in range(4):
        hit = _intersecta(rectas[(i + 3) % 4], rectas[i])
        if hit is not None and np.isfinite(hit).all() and np.linalg.norm(hit - q[i]) <= max_shift:
            out.append(hit)
        else:
            out.append(q[i])
    return np.array(out, np.float64)


def _dims_warp(q):
    w0 = max(np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[3] - q[2]))
    h0 = max(np.linalg.norm(q[2] - q[1]), np.linalg.norm(q[0] - q[3]))
    s = WARP_MAX_LONG_SIDE / max(w0, h0) if max(w0, h0) > WARP_MAX_LONG_SIDE else 1.0
    return max(1, round(w0 * s)), max(1, round(h0 * s))


def detectar_quad(img: np.ndarray, long_side: int = PROCESS_LONG_SIDE):
    """Cascada de detección del worker: 400 px de lado mayor, Canny + dilate,
    contornos RETR_EXTERNAL, approxPolyDP y selección por área + blanquedad."""
    H, W = img.shape[:2]
    s = long_side / max(H, W)
    pw, ph = max(1, round(W * s)), max(1, round(H * s))
    proc = cv2.resize(img, (pw, ph), interpolation=cv2.INTER_AREA)
    blur = cv2.GaussianBlur(cv2.cvtColor(proc, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    sx, sy = W / pw, H / ph
    kernel = np.ones((3, 3), np.uint8)
    for low, high, dil, eps in DETECT_PASSES:
        edges = cv2.Canny(blur, low, high)
        if dil:
            edges = cv2.dilate(edges, kernel, iterations=dil)
        contornos, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = pw * ph * MIN_CONTOUR_AREA_PCT
        cands = [(cv2.contourArea(c), c) for c in contornos if cv2.contourArea(c) >= min_area]
        cands.sort(key=lambda t: -t[0])
        polys = []
        for area, c in cands[:MAX_CONTOUR_CANDIDATES]:
            approx = cv2.approxPolyDP(c, eps * cv2.arcLength(c, True), True)
            if len(approx) != 4:
                continue
            pts = approx.reshape(-1, 2).astype(np.float64)
            polys.append({"pts": pts * [sx, sy], "area": area * sx * sy,
                          "wh": _blanquedad(proc, pts)})
        q = _elige_quad(polys, W, H)
        if q is not None:
            return q, "worker"
    return None, "sobel"


def warp(img: np.ndarray, quad: np.ndarray) -> np.ndarray:
    """shrinkQuad(3.5 px) + computeWarpDims(≤4032) + warpPerspective INTER_CUBIC,
    en ese orden y con esos números, igual que el worker."""
    q = _encoge_quad(np.asarray(quad, np.float64))
    W, H = _dims_warp(q)
    dst = np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], np.float32)
    M = cv2.getPerspectiveTransform(q.astype(np.float32), dst)
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC)


# ─── 3) filtro b/n idéntico al del navegador ────────────────────────────────
def _odd_window(w: int, ratio: float) -> int:
    k = max(3, int(w * ratio))
    return k - 1 if k % 2 == 0 else k


def corregir_sombras(gris: np.ndarray) -> np.ndarray:
    h, w = gris.shape
    escala = min(1.0, ILLUM_MAP_LONG_SIDE / max(w, h))
    mw, mh = max(1, round(w * escala)), max(1, round(h * escala))
    pequeno = cv2.resize(gris, (mw, mh), interpolation=cv2.INTER_AREA)
    n = ILLUM_KERNEL if ILLUM_KERNEL % 2 else ILLUM_KERNEL - 1
    cerrado = cv2.morphologyEx(
        pequeno, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (n, n))
    ).astype(np.float32)
    mean2 = float(cerrado.mean()) or 255.0
    ganancias = np.where(cerrado > 0, mean2 / np.maximum(cerrado, 1e-6), 1.0).astype(np.float32)
    ganancias = cv2.resize(ganancias, (w, h), interpolation=cv2.INTER_LINEAR)
    return np.clip(gris.astype(np.float32) * ganancias, 0, 255).astype(np.uint8)


def bradley_roth(gris: np.ndarray, t: float = BW_T, ratio: float = BW_WINDOW_RATIO) -> np.ndarray:
    h, w = gris.shape
    ii = cv2.integral(gris.astype(np.float64))
    half = _odd_window(w, ratio) >> 1
    xs = np.arange(w)
    x0, x1 = np.maximum(0, xs - half), np.minimum(w - 1, xs + half)
    ys = np.arange(h)
    y0, y1 = np.maximum(0, ys - half), np.minimum(h - 1, ys + half)
    suma = (
        ii[np.ix_(y1 + 1, x1 + 1)] - ii[np.ix_(y0, x1 + 1)]
        - ii[np.ix_(y1 + 1, x0)] + ii[np.ix_(y0, x0)]
    )
    cuenta = (x1 - x0 + 1)[None, :] * (y1 - y0 + 1)[:, None]
    return np.where(gris <= (suma / cuenta) * (1 - t), 0, 255).astype(np.uint8)


def despeckle(bin_img: np.ndarray, min_px: int = BW_DESPECKLE_PX) -> np.ndarray:
    tinta = (bin_img == 0).astype(np.uint8)
    n, lab = cv2.connectedComponents(tinta, connectivity=4)
    if n <= 1:
        return bin_img
    areas = np.bincount(lab.ravel())
    # fuera[0]=True: el fondo (etiqueta 0) NO es tinta ⇒ blanco.
    fuera = np.ones(n, bool)
    fuera[1:] = areas[1:] < min_px
    return np.where(fuera[lab], 255, 0).astype(np.uint8)


def binarizar(bgr: np.ndarray) -> np.ndarray:
    return despeckle(bradley_roth(corregir_sombras(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))))


# ─── 4) QR ──────────────────────────────────────────────────────────────────
_DETECTOR = cv2.QRCodeDetector()
try:  # zxing-cpp (pip install zxing-cpp): 6x más rápido y lee donde cv2 no
    import zxingcpp as _zx
except ImportError:
    _zx = None

QR_CUADRANTE = (0.30, 0.55)  # el QR del E-14 vive arriba a la izquierda


def decodificar_qr(bgr: np.ndarray):
    """zxing-cpp sobre el warp SIN binarizar (la banda b/n destruye los módulos
    del E-14) y escalonado: cuadrante TL → TL x2 → foto completa. Página con el
    QR legible ≈ 65 ms; sin QR ≈ 680 ms. Sin zxing-cpp queda cv2 (lento, lee
    menos) como única opción."""
    gris = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gris.shape
    if _zx is None:
        return _decodificar_qr_cv2(gris)
    tl = gris[0 : int(h * QR_CUADRANTE[0]), 0 : int(w * QR_CUADRANTE[1])]
    for img in (tl, cv2.resize(tl, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), gris):
        try:
            for b in _zx.read_barcodes(img):
                if b.format == _zx.BarcodeFormat.QRCode and b.text:
                    return b.text
        except Exception:
            pass
    return None


def _decodificar_qr_cv2(gris: np.ndarray):
    h, w = gris.shape
    r = min(1.0, 2048 / max(h, w))
    if r < 1.0:
        gris = cv2.resize(gris, (int(w * r), int(h * r)), interpolation=cv2.INTER_AREA)
    for img in (gris, cv2.flip(gris, 0), cv2.rotate(gris, cv2.ROTATE_90_CLOCKWISE),
                cv2.rotate(gris, cv2.ROTATE_90_COUNTERCLOCKWISE), cv2.rotate(gris, cv2.ROTATE_180)):
        try:
            datos, _, _ = _DETECTOR.detectAndDecode(img)
        except cv2.error:
            datos = ""
        if datos:
            return datos
    return None


# ─── 5) OCR (pre/post idénticos a rapidocr.ts + db-postprocess.ts) ──────────
def _round32(v: int) -> int:
    return max(32, int(v / 32 + 0.5) * 32)


def pre_det(img: np.ndarray, cap: int = DET_CAP_PROD):
    """Espejo de preDet (rapidocr.ts:734): op1 max 1920 → op2 min 30 →
    letterbox → cap + round32. Devuelve (tensor, ops, (srcW, srcH))."""
    srcW, srcH = img.shape[1], img.shape[0]
    w, h = srcW, srcH
    rw, rh = 1.0, 1.0
    if max(h, w) > 1920:  # op1
        ratio = 1920 / max(h, w)
        nh, nw = _round32(int(h * ratio)), _round32(int(w * ratio))
        rw, rh = rw * nw / w, rh * nh / h
        w, h = nw, nh
    if min(h, w) < 30:  # op2
        ratio = 30 / min(h, w)
        nh, nw = _round32(int(h * ratio)), _round32(int(w * ratio))
        rw, rh = rw * nw / w, rh * nh / h
        w, h = nw, nh
    actual = cv2.resize(img, (w, h), interpolation=cv2.INTER_LINEAR)
    pad_top = 0
    if h <= 30 or w / h > 8:  # op3 letterbox negro arriba/abajo
        new_h = max(int(w / 8), 30) * 2
        pad_top = int(abs(new_h - h) / 2)
        pad = np.zeros((h + pad_top * 2, w, 3), actual.dtype)
        pad[pad_top:pad_top + h] = actual
        actual = pad
        h = actual.shape[0]
    ratio_det = cap / max(h, w) if max(h, w) > cap else 1.0  # op4
    dw, dh = _round32(int(w * ratio_det)), _round32(int(h * ratio_det))
    det_in = cv2.resize(actual, (dw, dh), interpolation=cv2.INTER_LINEAR)
    # PaddleOCR/rapidocr trabajan en BGR (el JS mete img[i+2] en el canal 0).
    x = (det_in.astype(np.float32) / 255.0 - 0.5) / 0.5
    ops = {"w": dw, "h": dh, "ratioW": rw, "ratioH": rh, "padTop": pad_top,
           "ratioWDet": dw / w, "ratioHDet": dh / h}
    return x.transpose(2, 0, 1)[None].astype(np.float32), ops, (srcW, srcH)


def _mapear_afuente(p, ops, src_w, src_h):
    x = (p[0] / ops["ratioWDet"]) / ops["ratioW"]
    y = ((p[1] / ops["ratioHDet"]) - ops["padTop"]) / ops["ratioH"]
    return (max(0.0, min(float(src_w), round(x))), max(0.0, min(float(src_h), round(y))))


def _esquinas_rect(cx, cy, w, h, theta):
    cos, sin = np.cos(theta), np.sin(theta)
    hw, hh = w / 2, h / 2
    nx, ny = -sin, cos
    pts = np.array([
        [cx + hw * cos + hh * nx, cy + hw * sin + hh * ny],
        [cx + hw * cos - hh * nx, cy + hw * sin - hh * ny],
        [cx - hw * cos + hh * nx, cy - hw * sin + hh * ny],
        [cx - hw * cos - hh * nx, cy - hw * sin - hh * ny],
    ], np.float32)
    o = pts[np.argsort(pts[:, 0])]
    tl, bl = (o[0], o[1]) if o[0][1] <= o[1][1] else (o[1], o[0])
    tr, br = (o[2], o[3]) if o[2][1] <= o[3][1] else (o[3], o[2])
    return np.array([tl, tr, br, bl], np.float32)  # TL,TR,BR,BL


def _box_score(pred: np.ndarray, box: np.ndarray) -> float:
    """boxScoreFast: media de pred dentro del polígono (rasterizado solo en su
    bbox — mismo resultado, coste proporcional a la línea, no al mapa)."""
    ph, pw = pred.shape
    x0 = max(0, int(np.floor(box[:, 0].min())))
    x1 = min(pw - 1, int(np.ceil(box[:, 0].max())))
    y0 = max(0, int(np.floor(box[:, 1].min())))
    y1 = min(ph - 1, int(np.ceil(box[:, 1].max())))
    if x1 < x0 or y1 < y0:
        return 0.0
    m = np.zeros((y1 - y0 + 1, x1 - x0 + 1), np.uint8)
    cv2.fillPoly(m, [np.round(box - [x0, y0]).astype(np.int32)], 1)
    sub = pred[y0:y1 + 1, x0:x1 + 1]
    return float(sub[m > 0].mean()) if (m > 0).any() else 0.0


def det_postproc(pred: np.ndarray, ops, src_wh):
    ph, pw = pred.shape
    mapa = (pred > DB_THRESH).astype(np.uint8)
    mapa = cv2.dilate(mapa, np.ones((2, 2), np.uint8))  # máx local derecha/abajo
    contornos, _ = cv2.findContours(mapa, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    rects = []
    for c in contornos[:DB_MAX_CANDIDATES]:
        pts = c.reshape(-1, 2)
        if len(pts) < MIN_PX_DET:
            continue
        (cx, cy), (rw, rh), ang = cv2.minAreaRect(pts)
        if min(rw, rh) < MIN_SIDE_DESCARTAR:
            continue
        esq = _esquinas_rect(cx, cy, rw, rh, np.deg2rad(ang))
        if _box_score(pred, esq) < DB_BOX_THRESH:
            continue
        d = (rw * rh * DB_UNCLIP_RATIO) / (2 * (rw + rh))
        w_u, h_u = rw + 2 * d, rh + 2 * d
        if min(w_u, h_u) < MIN_SIDE_TRAS_UNCLIP:
            continue
        rects.append((cx, cy, w_u, h_u, np.deg2rad(ang)))
    boxes = []
    for cx, cy, w_u, h_u, th in rects:
        b = [_mapear_afuente(p, ops, *src_wh) for p in _esquinas_rect(cx, cy, w_u, h_u, th)]
        if all(p[0] >= 0 and p[1] >= 0 for p in b):
            boxes.append(np.array(b, np.float32))
    return _ordena_cajas(boxes), len(rects)


def _ordena_cajas(boxes):
    """ordenarCajas (db-postprocess.ts:242): por y superior; solape <10 px → x."""
    idx = list(range(len(boxes)))
    idx.sort(key=lambda i: (boxes[i][0][1], boxes[i][0][0]))
    for i in range(len(idx) - 1):
        j = i
        while j >= 0 and abs(boxes[idx[j + 1]][0][1] - boxes[idx[j]][0][1]) < 10 \
                and boxes[idx[j + 1]][0][0] < boxes[idx[j]][0][0]:
            idx[j], idx[j + 1] = idx[j + 1], idx[j]
            j -= 1
    return [boxes[i] for i in idx]


class OCR:
    def __init__(self, det_nombre, rec_nombre, dict_nombre, cls_nombre=None, hilos=None,
                 cls_lineas=True):
        # `cls_lineas=False` deja el modelo cls cargado (lo usa la sonda de
        # orientación, 4 cajas) pero SIN el volteo por línea del `reconocer`:
        # así el texto es byte-idéntico al de hoy y el cls solo cuesta ~60 ms.
        self.det = _sesion(det_nombre, hilos=hilos)
        self.rec, self.chars = _sesion(rec_nombre, dict_nombre, hilos=hilos)
        self.cls = _sesion(cls_nombre, hilos=hilos) if cls_nombre else None
        self.cls_lineas = cls_lineas
        self.rec_in = self.rec.get_inputs()[0].name
        self.det_in = self.det.get_inputs()[0].name
        self.cls_in = self.cls.get_inputs()[0].name if self.cls else None

    # ── rec: crop perspectivo + resize NN h=48 + pad a targetW (tensorDeCanvases)
    def _crop(self, bgr, box):
        w1 = int(np.linalg.norm(box[1] - box[0]))
        h1 = int(np.linalg.norm(box[3] - box[0]))
        if w1 < 4 or h1 < 3:
            w1, h1 = max(4, w1), max(3, h1)
        dst = np.array([[0, 0], [w1 - 1, 0], [w1 - 1, h1 - 1], [0, h1 - 1]], np.float32)
        return cv2.warpPerspective(bgr, cv2.getPerspectiveTransform(box, dst), (w1, h1))

    def _tensor_rec(self, crops, target_w):
        b = len(crops)
        data = np.zeros((b, 3, 48, target_w), np.float32)
        for i, c in enumerate(crops):
            ch, cw = c.shape[:2]
            rw = min(max(1, int(np.ceil(48 * cw / ch))), target_w)
            # resize NN idéntico al JS (floor(x*cw/rw))
            sx = np.minimum(cw - 1, (np.arange(rw) * cw // rw))
            sy = np.minimum(ch - 1, (np.arange(48) * ch // 48))
            rec = c[np.ix_(sy, sx)].astype(np.float32) / 255.0  # BGR (orden del JS)
            rec = (rec - 0.5) / 0.5
            data[i, :, :, :rw] = rec.transpose(2, 0, 1)
        return data

    def _ctc(self, out_row):
        idx = out_row.argmax(1)
        pr = out_row.max(1)
        texto, suma, cuenta, ultimo = "", 0.0, 0, -1
        for t in range(len(idx)):
            j = int(idx[t])
            if j != 0 and j != ultimo:
                texto += self.chars[j - 1] if j <= len(self.chars) else " "
                suma += float(pr[t])
                cuenta += 1
            ultimo = j
        return texto, (suma / cuenta if cuenta else 0.0)

    def det_boxes(self, bgr, cap):
        """det + postproceso sin rec — para la sonda de orientación (barata)."""
        x, ops, src_wh = pre_det(bgr, cap)
        pred = self.det.run(None, {self.det_in: x})[0][0, 0]
        return det_postproc(pred, ops, src_wh)

    def aspect_medio(self, boxes) -> float:
        """mediana de ancho/alto de las cajas: >1 = texto horizontal."""
        if not boxes:
            return 0.0
        a = [np.linalg.norm(b[1] - b[0]) / max(1e-3, np.linalg.norm(b[3] - b[0])) for b in boxes]
        return float(np.median(a))

    def sonda_par(self, bgr, boxes, k=4, w_max=320):
        """(conf texto derecho, conf texto 180°) sobre las K cajas más anchas,
        en UN solo lote de rec. Compara las dos orientaciones posibles sin
        lanzar una segunda det: la misma línea volteada es el candidato 180."""
        if not boxes:
            return 0.0, 0.0
        sel = sorted(boxes, key=lambda b: -np.linalg.norm(b[1] - b[0]))[:k]
        crops = [self._crop(bgr, b) for b in sel]
        lote = crops + [cv2.flip(c, -1) for c in crops]
        out = self.rec.run(None, {self.rec_in: self._tensor_rec(lote, w_max)})[0]
        n = len(crops)

        def suma(r):
            return sum(c for (tx, c) in map(self._ctc, r) if len(tx.strip()) >= 2)

        return suma(out[:n]), suma(out[n:])

    def reconocer(self, bgr, cap=DET_CAP_PROD):
        t = {}
        t0 = time.perf_counter()
        x, ops, src_wh = pre_det(bgr, cap)
        pred = self.det.run(None, {self.det_in: x})[0][0, 0]
        t["msDet"] = round((time.perf_counter() - t0) * 1000)

        t0 = time.perf_counter()
        boxes, n_boxes = det_postproc(pred, ops, src_wh)
        t["msPost"] = round((time.perf_counter() - t0) * 1000)
        if not boxes:
            return [], t, 0, 0

        crops = [self._crop(bgr, b) for b in boxes]
        keep = [i for i, c in enumerate(crops) if c.shape[0] >= 3]
        crops, boxes = [crops[i] for i in keep], [boxes[i] for i in keep]

        # cls (opcional, igual que el navegador: p180 > 0.9 ⇒ voltear 180°)
        t0 = time.perf_counter()
        n_180 = 0
        if self.cls is not None and self.cls_lineas:
            for i in range(0, len(crops), 6):
                lote = crops[i:i + 6]
                tensors = []
                for c in lote:
                    ratio = c.shape[1] / c.shape[0]
                    w_obj = min(192, max(1, int(np.ceil(48 * ratio))))
                    tensors.append(self._tensor_rec([c], w_obj)[0, :, :, :w_obj])
                ancho = max(x_.shape[2] for x_ in tensors)
                batch = np.zeros((len(tensors), 3, 48, ancho), np.float32)
                for k, x_ in enumerate(tensors):
                    batch[k, :, :, : x_.shape[2]] = x_
                out = self.cls.run(None, {self.cls_in: batch})[0]
                for k in range(len(lote)):
                    a, b_ = out[k, 0], out[k, 1]
                    m = max(a, b_)
                    p0, p180 = np.exp(a - m) / (np.exp(a - m) + np.exp(b_ - m)), \
                        np.exp(b_ - m) / (np.exp(a - m) + np.exp(b_ - m))
                    if p180 > 0.9 and p180 > p0:
                        crops[i + k] = cv2.flip(crops[i + k], -1)
                        n_180 += 1
        t["msCls"] = round((time.perf_counter() - t0) * 1000)

        # rec por lotes de 6, ordenados por ratio (w/h) — igual que el JS
        t0 = time.perf_counter()
        orden = sorted(range(len(crops)), key=lambda i: crops[i].shape[1] / max(1, crops[i].shape[0]))
        lineas = [None] * len(crops)
        for k in range(0, len(orden), 6):
            lote = orden[k:k + 6]
            max_ratio = max(320 / 48, *(crops[i].shape[1] / max(1, crops[i].shape[0]) for i in lote))
            W = min(REC_WMAX, int(48 * max_ratio))
            out = self.rec.run(None, {self.rec_in: self._tensor_rec([crops[i] for i in lote], W)})[0]
            for m, i in enumerate(lote):
                texto, conf = self._ctc(out[m])
                if conf >= TEXT_SCORE and texto.strip():
                    lineas[i] = {"texto": texto.strip(), "conf": conf, "box": boxes[i]}
        t["msRec"] = round((time.perf_counter() - t0) * 1000)
        aceptadas = [l for l in lineas if l]
        return aceptadas, t, n_boxes, n_180


# ─── 6) pipeline completo ───────────────────────────────────────────────────


def enderezar(ocr: OCR, w: np.ndarray):
    """Rotación de PÁGINA (0/90/180/270) con dos det baratas como máximo: el
    aspect de las cajas dice si el texto corre vertical y sonda_par desempata
    el sentido comparando cada línea ancha contra su versión volteada (un solo
    lote de rec). Devuelve (imagen, grados CW aplicados).

    PROBADO Y DESCARTADO el atajo «decidir el giro con el modelo cls» (4 líneas
    anchas, ~60 ms en vez de ~900): sobre las 6 actas del demo × 4 rotaciones
    (`native/prueba-sonda.py`) el cls se equivocó en 12 de 24 casos — dice
    «derecho» en toda página volteada, incluidas 3 de las 6 actas reales, que
    salen CABEZA ABAJO y se rechazarían. Las cajas de la sonda salen de una det
    a 512 px: líneas de ~12 px de alto, demasiado pequeñas para el clasificador.
    La confianza de texto real (sonda_par) es la que acierta: se queda ella."""
    boxes, _ = ocr.det_boxes(w, SONDA_CAP)
    if ocr.aspect_medio(boxes) >= 1.0:  # texto horizontal ⇒ 0 o 180
        s0, s180 = ocr.sonda_par(w, boxes)
        return (w, 0) if s0 >= s180 else (cv2.rotate(w, cv2.ROTATE_180), 180)
    # texto vertical ⇒ 90 CW o 90 CCW (90CW + 180 = 90CCW, misma det)
    cw = cv2.rotate(w, cv2.ROTATE_90_CLOCKWISE)
    b_cw, _ = ocr.det_boxes(cw, SONDA_CAP)
    s_cw, s_ccw = ocr.sonda_par(cw, b_cw)
    return (cw, 90) if s_cw >= s_ccw else (cv2.rotate(cw, cv2.ROTATE_180), 270)


@dataclass
class Resultado:
    nombre: str = ""
    total_ms: float = 0.0
    etapas: dict = field(default_factory=dict)
    quad: str = ""
    qr: str | None = None
    n_lineas: int = 0
    n_boxes: int = 0
    texto: str = ""
    conf_media: float = 0.0
    rotacion: int = 0
    alto: int = 0
    ancho: int = 0
    quadPts: list | None = None


def procesar_img(img: np.ndarray, ocr: OCR, cap=DET_CAP_PROD, con_qr=True,
                 sonda=True, nombre=""):
    """Pipeline COMPLETO sobre una imagen ya decodificada (sin disco):
    quad → warp → sonda de orientación → b/n → QR → OCR. Es el cuerpo de
    `procesar` extraído para que el sidecar `/acta` sirva un acta entera
    desde bytes en memoria — el navegador deja de hacer warp, sondeo de
    orientación y OCR (los tres pasos más caros del pipeline WASM).

    Devuelve (Resultado, warp, bw): `warp` es la entrada del OCR (recorte SIN
    filtro — la misma regla del mantenedor que `fotoOcr` en el bridge) y `bw` la
    imagen de presentación/guardado."""
    r = Resultado(nombre=nombre)
    t0 = time.perf_counter()
    e = r.etapas

    t = time.perf_counter(); quad, origen = detectar_quad(img); e["detectMs"] = round((time.perf_counter() - t) * 1000)
    r.quad = origen
    t = time.perf_counter()
    w = img if quad is None else warp(img, quad)
    lado = max(w.shape[:2])
    if lado > PROCESSED_MAX_LONG_SIDE:
        rr = PROCESSED_MAX_LONG_SIDE / lado
        w = cv2.resize(w, (int(w.shape[1] * rr), int(w.shape[0] * rr)), interpolation=cv2.INTER_AREA)
    e["warpMs"] = round((time.perf_counter() - t) * 1000)
    r.quadPts = [[round(float(x), 1), round(float(y), 1)] for x, y in quad] if quad is not None else None

    # orientación de PÁGINA (equivalente nativo del probe del navegador, pero
    # con 2 candidatas en vez de 4): el aspect de las cajas dice si el texto
    # corre vertical; la conf de las 6 líneas más anchas desempata el sentido.
    t = time.perf_counter()
    if sonda:
        w, r.rotacion = enderezar(ocr, w)
    e["sondaMs"] = round((time.perf_counter() - t) * 1000)

    # b/n (presentación) y QR van en HEBRA aparte mientras el rec corre: son
    # cv2/zxing (soltan el GIL), no dependen del OCR y `w` es de solo lectura.
    # ~1,2 s por acta que antes eran serial puro.
    caja: dict = {}

    def _luminoso():
        t1 = time.perf_counter()
        caja["bw"] = binarizar(w)
        t2 = time.perf_counter()
        if con_qr:
            # Primero sobre el warp (el QR del E-14 vive en el papel recortado);
            # si no aparece, sobre el FOTOGRAMA COMPLETO. Ese segundo barrido es
            # lo que hace que un `qr=null` sea AUTORITATIVO para el navegador:
            # sin él, el runner no puede fiarse y paga su escalera jsQR de
            # 10-22 s sobre un acta que no lleva QR (medido en 084939.jpg).
            qr = decodificar_qr(w)
            if not qr:
                qr = decodificar_qr(img)
            caja["qr"] = qr
        caja["bwMs"] = round((t2 - t1) * 1000)
        caja["qrMs"] = round((time.perf_counter() - t2) * 1000)

    hebra = threading.Thread(target=_luminoso, daemon=True)
    hebra.start()

    t = time.perf_counter()
    lineas, ocr_ms, n_boxes, n_180 = ocr.reconocer(w, cap=cap)
    e.update(ocr_ms)
    e["ocrMs"] = round((time.perf_counter() - t) * 1000)

    hebra.join()
    bw = caja["bw"]
    r.qr = caja.get("qr")
    # bw/qr se MIDEN dentro de su hebra (competencia con el rec mediante) y
    # llegan a `etapas` como antes; `totalMs` ya no los suma: solapan.
    e["bwMs"], e["qrMs"] = caja["bwMs"], caja.get("qrMs", 0)

    r.n_lineas = len(lineas)
    r.n_boxes = n_boxes
    r.texto = "\n".join(l["texto"] for l in lineas)
    r.conf_media = float(np.mean([l["conf"] for l in lineas])) if lineas else 0.0
    r.alto, r.ancho = w.shape[:2]
    r.total_ms = round((time.perf_counter() - t0) * 1000, 1)
    return r, w, bw


def procesar(ruta, ocr: OCR, salida_dir=None, cap=DET_CAP_PROD, con_qr=True,
             sonda=True) -> Resultado:
    t = time.perf_counter()
    img = leer_imagen(ruta)
    decode_ms = round((time.perf_counter() - t) * 1000)
    r, w, bw = procesar_img(img, ocr, cap=cap, con_qr=con_qr, sonda=sonda,
                            nombre=os.path.basename(ruta))
    r.etapas["decodeMs"] = decode_ms
    r.total_ms += decode_ms

    if salida_dir:
        os.makedirs(salida_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(ruta))[0]
        cv2.imwrite(os.path.join(salida_dir, base + "_procesada.png"), bw)
        cv2.imwrite(os.path.join(salida_dir, base + "_warp.png"), w)
        with open(os.path.join(salida_dir, base + ".txt"), "w", encoding="utf-8") as f:
            f.write(r.texto)
    return r


MOTORES = {
    "v4": ("ch_PP-OCRv4_det_infer.onnx", "ch_PP-OCRv4_rec_infer.onnx", "ppocr_keys.txt"),
    "v5": ("det_v5_mobile.onnx", "rec_v5_latin.onnx", "latin_dict_v2.txt"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("carpeta")
    ap.add_argument("--salida", default=None)
    ap.add_argument("--motor", default="v4", choices=list(MOTORES))
    ap.add_argument("--cap", type=int, default=DET_CAP_PROD)
    ap.add_argument("--sin-cls", action="store_true")
    ap.add_argument("--sin-qr", action="store_true")
    ap.add_argument("--sin-sonda", action="store_true")
    ap.add_argument("--paralelo", type=int, default=1)
    args = ap.parse_args()

    det, rec, d = MOTORES[args.motor]
    cls = None if args.sin_cls else "ch_ppocr_mobile_v2.0_cls_infer.onnx"
    archivos = sorted(
        os.path.join(args.carpeta, f) for f in os.listdir(args.carpeta)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    hilos = max(1, (os.cpu_count() or 2) // args.paralelo)
    t0 = time.perf_counter()
    resultados = []
    if args.paralelo > 1:
        import concurrent.futures as cf
        # una sesión por worker, cada una con 1/n de los núcleos
        ocs = [OCR(det, rec, d, cls, hilos=hilos) for _ in range(args.paralelo)]

        def job(pa):
            a, oc = pa
            return procesar(a, oc, args.salida, cap=args.cap, con_qr=not args.sin_qr,
                            sonda=not args.sin_sonda)

        pares = [(a, ocs[i % len(ocs)]) for i, a in enumerate(archivos)]
        with cf.ThreadPoolExecutor(max_workers=args.paralelo) as ex:
            resultados = list(ex.map(job, pares))
    else:
        ocr = OCR(det, rec, d, cls, hilos=hilos)
        for a in archivos:
            resultados.append(procesar(a, ocr, args.salida, cap=args.cap,
                                       con_qr=not args.sin_qr, sonda=not args.sin_sonda))
    for r in resultados:
        print(f"{r.nombre}: {r.total_ms/1000:.2f}s lineas={r.n_lineas}/{r.n_boxes} "
              f"conf={r.conf_media:.3f} rot={r.rotacion} "
              f"qr={'SI' if r.qr else 'no'} quad={r.quad} {r.etapas}")
    wall = time.perf_counter() - t0
    print(f"\n=== {len(archivos)} actas en {wall:.1f}s (motor {args.motor} cap {args.cap} "
          f"paralelo {args.paralelo}) ===")
    if args.salida:
        with open(os.path.join(args.salida, "nativo.json"), "w", encoding="utf-8") as f:
            json.dump([{k: v for k, v in r.__dict__.items() if k != "texto"} for r in resultados],
                      f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
