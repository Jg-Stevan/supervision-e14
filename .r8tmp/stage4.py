#!/usr/bin/env python3
# R8 stage 4/5 — extrae faseEnvio de procesarUno (bloque VERBATIM + transformaciones)
import io

P = "src/modules/digitalizador/lib/e14/masiva/runner.ts"
src = io.open(P, encoding="utf-8").read()

START = "    // Desenlace → la MISMA vía que el flujo normal (T3.3/T3.2). El envío"
END_MARK = "    // D35 — thumbMs: la miniatura de la bandeja es TRABAJO REAL del main"
i0 = src.index(START)
i1 = src.index(END_MARK)
block_end = src.rindex("    }\n", i0, i1) + len("    }\n")
block = src[i0:block_end]
assert "veto ya-enviada post-ocr" in block and "contarMotivoNoEnvioActa" in block
assert "registrarEnvioMasiva" in block and "registrarEnvioRemoto" in block

def rep(b, old, new, count=1):
    assert b.count(old) == count, f"anchor x{b.count(old)} != {count}: {old[:70]!r}"
    return b.replace(old, new)

# R1 — veto H1 → resuelto
block = rep(block,
"""            return; // sin envío — el OCR pagado es costo hundido (caso raro)
""",
"""            // sin envío — el OCR pagado es costo hundido (caso raro)
            return { resuelto: true, ctx };
""")

# R2 — veto remoto → resuelto
block = rep(block,
"""              return; // sin envío — igual que H1 (costo OCR hundido)
""",
"""              // sin envío — igual que H1 (costo OCR hundido)
              return { resuelto: true, ctx };
""")

TYPES = """/** Ctx POST-desenlace: el stage 3 garantizó los DOS acta del desenlace
 *  (parcheada pre-relectura + post re-lectura) al seguir al envío. */
type CtxPostDesenlace = CtxPostPipeline & { actaParcheada: Acta; actaDesenlace: Acta };

/** Salida del STAGE 4: sin resuelto el ctx garantiza actaFinal (ENVIADA o el
 *  desenlace de siempre — el parche D61 con envioMs/remotoMs ya aplicado) —
 *  el stage 5 la consume Acta no-null. */
type SalidaFaseEnvio =
  | { resuelto: true; ctx: CtxProcesarUno }
  | { resuelto: false; ctx: CtxProcesarUno & { actaFinal: Acta } };

"""

FUNC = """// ─── R8 · STAGE 4/5 — faseEnvio (H1 · WAVE3 §A.3 · H2 · D61) ────────────────
/** ENVÍO del desenlace: veto ya-enviada POST-OCR (H1 — ledger local) → veto
 *  REMOTO (WAVE3 §A.3 — SHA-256 del payload, jamás el payload) → envío propio
 *  (registrarEnvioMasiva + métrica del roundtrip D45 + acta ENVIADA) → H2
 *  ledger de enviadas (llaves FRESCAS de la fila) → registro remoto
 *  fire-and-forget → parche D61 del diagnóstico (envioMs/remotoMs/red).
 *  Los vetos salen como resuelto:true (sin envío — el OCR pagado es costo
 *  hundido); cualquier throw cae al MISMO catch de procesarUno (jamás tumba
 *  la cola). Función PURA salvo los efectos de siempre (store/IDB/ledger/
 *  logger): recibe ctx y devuelve ctx nuevo — jamás muta el que recibe. */
async function faseEnvio(ctx: CtxPostDesenlace): Promise<SalidaFaseEnvio> {
  const fila = ctx.fila;
  const registro = ctx.registro;
  const actaDesenlace = ctx.actaDesenlace;
  const qrPayload = ctx.qrPayload;
  const identidad = ctx.identidad;
  // (bloque movido VERBATIM de procesarUno — mismo orden, mismos literales)
""" + block + """    return { resuelto: false, ctx: { ...ctx, actaFinal, enviadaAuto } };
}

"""

CALL = """    // ─── R8 · STAGE 4/5 (split de procesarUno): ENVÍO ───
    // Veto H1 + veto remoto + envío propio + ledger H2 + registro remoto +
    // parche D61 — el bloque vive en faseEnvio (arriba). Los vetos salen como
    // resuelto:true (el finally del orquestador limpia igual); cualquier
    // throw cae al MISMO catch de siempre (fila ERROR — la cola jamás se
    // tumba).
    const r4 = await faseEnvio({
      ...ctx,
      registro,
      archivo,
      actaBruta: r2.ctx.actaBruta,
      actaDesenlace: r3.ctx.actaDesenlace,
      actaParcheada: r3.ctx.actaParcheada,
    });
    if (r4.resuelto) return;
    ctx = r4.ctx;
    // Espejo transitorio (estrangulamiento incremental): el stage 5 aún no
    // extraído lee la variable local — muere en su commit. actaFinal la
    // garantiza la SALIDA del stage (SalidaFaseEnvio, no-null).
    const actaFinal = r4.ctx.actaFinal;
"""

src = src[:i0] + CALL + src[block_end:]

# insertar tipos + faseEnvio antes del doc-comment de procesarUno
INS = "/** Desenlace de UNA foto — byte a byte el pipeline real (kit §6-C: el"
j = src.index(INS)
src = src[:j] + TYPES + FUNC + src[j:]

io.open(P, "w", encoding="utf-8").write(src)
print("OK — bloque", block.count("\n"), "líneas movidas")
