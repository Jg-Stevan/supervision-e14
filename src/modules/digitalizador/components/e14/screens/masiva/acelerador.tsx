"use client";

/**
 * KIT e14-sidecar-instalable-v1 (D81) — tarjeta ACELERADOR NATIVO.
 *
 * Qué resuelve: el sidecar le baja el lote de ~101,6 s a 40-58 s medidos, pero
 * solo si está corriendo, y `python native/servidor.py --puerto 8765` no es una
 * frase que un visitante elector vaya a escribir. Aquí el visitante ve EN UN
 * CLICK si su máquina ya tiene el motor y, si no, lo descarga.
 *
 * Doctrina intacta (la del cliente, `lib/e14/ocr/nativo.ts`): el sidecar es una
 * ACELERACIÓN, jamás un requisito. Esta tarjeta informa y descarga; NUNCA
 * bloquea el lote ni condiciona el gate. Un «no lo instales» deja la app
 * funcionando por WASM, que es lo que hoy hace todo el mundo.
 *
 * Por qué el botón REINTENTAR existe (y por qué llama a invalidarSondaNativo):
 * el sondeo cachea 15 s para no cobrarle un timeout a cada acta. Instalado el
 * .exe, ese caché es exactamente lo que dejaría la tarjeta diciendo «ausente»
 * frente a un sidecar que ya contesta. Sin invalidar, el click no hace nada.
 * El auto-reintento mientras está AUSENTE (REINTENTO_MS) cubre al que descarga
 * y vuelve sin leer la pantalla: la tarjeta se voltea sola.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  invalidarSondaNativo,
  ladoNativoDisponible,
  saludNativo,
  urlLadoNativo,
  type SaludNativo,
} from "@/modules/digitalizador/lib/e14/ocr/nativo";

/** Asset publicado por `.github/workflows/sidecar-release.yml` en la release
 *  `latest`: la URL NO lleva versión a propósito, para que la tarjeta apunte
 *  siempre al build más reciente sin recompilar la app. Se exporta porque el
 *  NOMBRE del archivo es un contrato a tres bandas (esta URL ↔ el asset que
 *  sube el workflow ↔ el ZIP que produce `scripts/empaquetar-sidecar.mjs`) y un
 *  desalineamiento es un 404 silencioso en un link. Lo fija
 *  `__tests__/acelerador-tarjeta.test.ts`. */
export const URL_DESCARGA_SIDECAR =
  "https://github.com/Jg-Stevan/supervision-e14/releases/latest/download/supervision-e14-sidecar-win-x64.zip";

/** Re-sondeo en modo AUSENTE: el visitante descarga, ejecuta y NO vuelve a
 *  mirar la pantalla. 15 s = lo mismo que vale el caché del sondeo. */
const REINTENTO_MS = 15_000;

type Estado = "probando" | "activo" | "ausente";

export function AceleradorNativo() {
  const url = urlLadoNativo();
  // Sin URL en los flags no hay nada que decir: la app compilada sin sidecar
  // no tiene por qué hablar de un acelerador que no puede usar.
  const [estado, setEstado] = useState<Estado | null>(url ? "probando" : null);
  const [salud, setSalud] = useState<SaludNativo | null>(null);
  const [reintentos, setReintentos] = useState(0);
  const vivoRef = useRef(true);

  const sondear = useCallback(async (cortarCache: boolean) => {
    if (cortarCache) invalidarSondaNativo();
    const ok = await ladoNativoDisponible();
    if (!vivoRef.current) return ok;
    setSalud(saludNativo());
    setEstado(ok ? "activo" : "ausente");
    return ok;
  }, []);

  useEffect(() => {
    if (!url) return;
    vivoRef.current = true;
    void sondear(false);
    return () => {
      vivoRef.current = false;
    };
  }, [url, sondear]);

  // Reintento pasivo SOLO mientras falta el sidecar; al activarse se apaga el
  // timer (no hay motivo para seguir pegándole a /salud cada 15 s).
  useEffect(() => {
    if (estado !== "ausente") return;
    const t = window.setInterval(() => void sondear(true), REINTENTO_MS);
    return () => window.clearInterval(t);
  }, [estado, sondear]);

  if (!url || estado === null) return null;

  const activo = estado === "activo";

  return (
    <div className="w-full space-y-1.5 border-t border-[#112b2a]/60 pt-2 text-left">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
        <span className="flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              activo
                ? "bg-[#00e599] shadow-[0_0_8px_#10b981]"
                : estado === "probando"
                  ? "animate-pulse bg-amber-400"
                  : "bg-gray-600"
            }`}
            aria-hidden
          />
          ACELERADOR NATIVO
        </span>
        <span
          className="font-mono text-[9px]"
          title={
            activo
              ? `El det+rec corre en CPU nativa (onnxruntime), no en WASM`
              : "El det+rec corre en WASM dentro del navegador"
          }
        >
          <span className={activo ? "text-[#00e599]" : "text-gray-500"}>
            {activo ? "CPU" : estado === "probando" ? "…" : "WASM"}
          </span>
        </span>
      </div>

      <div className="space-y-1 rounded border border-[#112b2a] bg-[#061214] p-2 font-mono text-[9px]">
        {activo && salud ? (
          <>
            <Linea k="MOTOR" v={salud.motor ?? "—"} />
            <Linea k="SESIONES" v={String(salud.sesiones || "—")} />
            <Linea k="PID" v={String(salud.pid ?? "—")} />
            <Linea k="SONDEO" v={`${salud.ms} ms`} />
          </>
        ) : estado === "probando" ? (
          <p className="text-gray-500">SONDEANDO {url}…</p>
        ) : (
          <p className="text-gray-400">
            No hay nada escuchando en{" "}
            <span className="text-gray-300">{url}</span>. El lote igual sale —
            por WASM, más lento.
          </p>
        )}
      </div>

      {activo ? (
        <p className="text-[9px] uppercase tracking-wider text-[#00e599]/70" role="status">
          LISTO — LAS ACTAS SALEN POR CPU NATIVA
        </p>
      ) : estado === "ausente" ? (
        <>
          <a
            href={URL_DESCARGA_SIDECAR}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#00e599]/40 bg-[#061e19] px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[#00e599] shadow-[0_0_8px_rgba(0,229,153,0.12)] transition-all hover:bg-[#0c2f29] active:scale-[0.98]"
            title="ZIP de Windows con el motor y los modelos dentro (~108 MiB). No necesita Python, ni git, ni instalador."
          >
            DESCARGAR ZIP (≈108 MiB)
          </a>
          <button
            type="button"
            onClick={() => {
              setReintentos((n) => n + 1);
              void sondear(true);
            }}
            className="min-h-[28px] w-full rounded border border-[#112b2a] bg-[#071214] px-2 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-400 transition hover:border-[#1b3f3e] hover:bg-[#0b191c] hover:text-white active:scale-[0.98]"
            title="Volver a preguntar si el sidecar ya está corriendo (salta el cache de 15 s del sondeo)"
          >
            {reintentos > 0 ? `REINTENTAR (${reintentos})` : "YA LO PUSE — REINTENTAR"}
          </button>
          <p className="text-[9px] leading-tight text-gray-500">
            Descomprime la carpeta y ejecuta{" "}
            <span className="text-gray-400">supervision-e14-sidecar.exe</span>.
            Deja la ventana abierta: tarda 5-15 s en decir LISTO. SmartScreen lo
            frena la primera vez (binario sin firmar): «Más información →
            Ejecutar de todas formas».
          </p>
        </>
      ) : null}
    </div>
  );
}

function Linea({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-gray-400">
      <span>{k}:</span>
      <span className="font-bold text-gray-200">{v}</span>
    </div>
  );
}
