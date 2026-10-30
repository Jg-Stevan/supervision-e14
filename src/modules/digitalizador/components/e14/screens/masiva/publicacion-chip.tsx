"use client";

/**
 * KIT carga-masiva-supervision-v1 (D27) — chip de publicación en el monitor
 * (R6: SPLIT move-only de MasivaView.tsx — reporte 03b M-2, verbatim).
 */
import type { PublicacionActa } from "@/modules/digitalizador/store/store-e14";

/** Desenlace de la publicación en el monitor (D27) — honestidad ante todo:
 * publicada · cuarentena D25 · sin join (sin clasificación AUTO) · en vuelo. */
export function PublicacionChip({ publicacion }: { publicacion?: PublicacionActa }) {
  if (!publicacion) return null;
  if (publicacion.estado === "publicando") {
    return (
      <p
        className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400"
        role="status"
        aria-live="polite"
      >
        PUBLICANDO EN EL MONITOR…
      </p>
    );
  }
  if (publicacion.estado === "publicada") {
    return (
      <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
        PUBLICADA EN EL MONITOR · {publicacion.clave}
      </p>
    );
  }
  if (publicacion.estado === "bloqueada") {
    return (
      <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
        CUARENTENA (D25) — {publicacion.motivo ?? "validación fallida"}
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-slate-800 bg-[#090d12] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
      SIN PUBLICAR EN EL MONITOR — SOLO REGISTRO LOCAL (SIN CLASIFICACIÓN AUTO)
    </p>
  );
}
