/**
 * KIT puente-remoto-v1 — proxy del HUB de actas publicadas por el
 * digitalizador (e14-puente, workers.dev).
 *
 * POR QUÉ UN PROXY: el dashboard del supervisor consume el hub con fetch
 * RELATIVO (`/api/supervision/remotas`) — el navegador jamás habla directo
 * con el workers.dev (CORS, URL hardcodeada en el cliente, etc.). Este
 * route handler resuelve el hub en el SERVIDOR (env `E14_PUENTE_URL`) y
 * reenvía la respuesta verbatim.
 *
 * Contrato del hub: GET /actas?desde=<epoch ms>&limite=<n> →
 * { ok, ahora, total, actas: EntradaActaMasiva & { hash, dispositivo, ts } }.
 * `desde=0` trae el histórico completo (repuebla el runtime tras recargar);
 * `desde=<último ts>` trae solo lo nuevo (polling).
 *
 * Fallos: si el hub no responde o responde mal → 502 con
 * { ok:false, error:"HUB_INALCANZABLE" } — el poller del cliente
 * (`puente-remoto.ts`) sobrevive y reintenta en el siguiente ciclo.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const hub =
    process.env.E14_PUENTE_URL ||
    "https://e14-puente.julistevan02.workers.dev";
  const params = new URL(request.url).searchParams;
  const desde = params.get("desde") ?? "0";
  const limite = params.get("limite");

  const query = new URLSearchParams({ desde });
  if (limite) query.set("limite", limite);

  try {
    const res = await fetch(`${hub}/actas?${query.toString()}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "HUB_INALCANZABLE",
        detalle: String(error).slice(0, 200),
      },
      { status: 502 }
    );
  }
}
