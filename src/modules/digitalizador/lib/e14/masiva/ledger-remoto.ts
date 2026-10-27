/**
 * WAVE3 §A.3 — ORDEN-WAVE3-remoto-rescate-obs-v1 (feat/ledger-remoto-envios-v1):
 * cliente del LEDGER REMOTO de envíos (D1 vía /api/e14/envios — route
 * route.e14api.ts). La lógica de red vive en este módulo testeable con
 * INYECCIÓN de fetch — cero `fetch` suelto en runner.ts.
 *
 * DOCTRINA DEL CONSERVADOR (kit §1): cualquier fallo de red/D1 → la fila
 * sigue su curso COMO HOY (el remoto es una red EXTRA, jamás una
 * dependencia). Timeout 3 s (AbortController — kit §A.3 literal).
 *
 * PRIVACIDAD dura (kit §1): al servidor JAMÁS viaja el payload QR completo
 * — solo su SHA-256 (sha256HexDeTexto), la serie y metadatos mínimos.
 *
 * RL-e65b-6: `forzarDedupOff` salta TAMBIÉN el ledger remoto (el caller lo
 * guarda — el escape del dueño manda SIEMPRE; el módulo ni se consulta).
 */

/** fetch inyectable (tests — cero red real en vitest). */
export type TraerLedger = (entrada: string, init?: RequestInit) => Promise<Response>;

/** Respuesta del check remoto (route.e14api.ts — contrato §A.2). */
export interface RespuestaCheck {
  duplicado: boolean;
  tsOriginal?: number | null;
  filaOriginal?: string | null;
}

/** Datos del registro remoto (SOLO post-envío local exitoso — kit §A.3). */
export interface DatosRegistroRemoto {
  payloadHash: string;
  serie?: string | null;
  filaId?: string | null;
  origenUrl?: string | null;
}

export const LEDGER_RUTA = "/api/e14/envios";
/** Timeout del check (kit §A.3: 3 s — fallo → seguir como hoy). */
export const LEDGER_TIMEOUT_MS = 3_000;

/** SHA-256 de un TEXTO (el payload QR) → hex 64. null si crypto.subtle no
 *  está (contexto raro — el caller salta el remoto, conservador). El hash
 *  de dedup.ts (hashBytesDeArchivo) es de ARCHIVO; este es del STRING del
 *  payload — misma familia, misma llave EXACTA (RL-e65-5: sin prefijos). */
export async function sha256HexDeTexto(
  texto: string,
  deps: { subtle?: SubtleCrypto } = {},
): Promise<string | null> {
  try {
    const subtle =
      deps.subtle ?? (globalThis.crypto?.subtle as SubtleCrypto | undefined);
    if (!subtle || typeof subtle.digest !== "function") return null;
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/** Origen actual (pages.dev | workers.dev — diagnóstico cross-origen §A.1).
 *  null en node/SSR (jamás inventar). */
export function origenActual(): string | null {
  try {
    return typeof location !== "undefined" && location.origin ? location.origin : null;
  } catch {
    return null;
  }
}

/** POST con timeout 3 s (AbortController — kit §A.3 literal). */
async function postConTimeout(
  cuerpo: Record<string, unknown>,
  deps: { traer?: TraerLedger },
): Promise<Response> {
  const traer = deps.traer ?? fetch;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), LEDGER_TIMEOUT_MS);
  try {
    return await traer(LEDGER_RUTA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Check remoto ANTES del envío local (kit §A.3): ¿este payload ya salió
 *  por OTRO origen/dispositivo? null = ledger indisponible (timeout/500/red
 *  caída) → el caller continúa como hoy (doctrina del conservador). */
export async function consultarEnvioRemoto(
  payloadHash: string,
  deps: { traer?: TraerLedger } = {},
): Promise<RespuestaCheck | null> {
  try {
    const r = await postConTimeout({ action: "check", payloadHash }, deps);
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<RespuestaCheck>;
    return {
      duplicado: j.duplicado === true,
      tsOriginal: typeof j.tsOriginal === "number" ? j.tsOriginal : null,
      filaOriginal: typeof j.filaOriginal === "string" ? j.filaOriginal : null,
    };
  } catch {
    return null; // timeout/red caída → sin red extra (conservador)
  }
}

/** Registro remoto DESPUÉS del envío local exitoso (kit §A.3) — el caller
 *  lo invoca fire-and-forget (`void …catch(() => {})`, RL-e65b-3: jamás
 *  bloquea ni tumba el envío). Idempotente por diseño (ON CONFLICT DO
 *  NOTHING en la route). Lanza → el catch del caller lo traga. */
export async function registrarEnvioRemoto(
  datos: DatosRegistroRemoto,
  deps: { traer?: TraerLedger } = {},
): Promise<void> {
  const r = await postConTimeout(
    {
      action: "registrar",
      payloadHash: datos.payloadHash,
      serie: datos.serie ?? null,
      filaId: datos.filaId ?? null,
      origenUrl: datos.origenUrl ?? null,
    },
    deps,
  );
  if (!r.ok) throw new Error(`LEDGER_REGISTRO_${r.status}`);
}

/** Válvula de pruebas del dueño (kit §A.4 — PanelDev): DELETE con la
 *  confirmación EXACTA. NUNCA se llama automáticamente (ni vaciar local ni
 *  el reset del modo de pruebas borran el remoto — esa es la garantía;
 *  literal evitado a propósito — ancla byte-idéntica del kit §1). */
export async function vaciarLedgerRemoto(
  deps: { traer?: TraerLedger } = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    const traer = deps.traer ?? fetch;
    const r = await traer(`${LEDGER_RUTA}?confirmacion=e14-reset-pruebas`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? `HTTP_${r.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "RED_CAIDA" };
  }
}
