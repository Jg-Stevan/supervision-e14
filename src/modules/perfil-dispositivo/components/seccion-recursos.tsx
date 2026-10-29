"use client";

/**
 * KIT perfil-recursos-v1 — SECCIÓN "Recursos detectados" del perfil.
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): el grid de tarjetas
 * de recursos (CPU/RAM/GPU/red/energía/storage/pantalla/runtime) + la nota
 * honesta de hilos WASM cuando falta COOP/COEP. Consume el perfil por el
 * hook del provider — null HONESTO donde el navegador no da el dato.
 */
import {
  BatteryCharging,
  CircuitBoard,
  Cpu,
  HardDrive,
  Info,
  MemoryStick,
  Microchip,
  Monitor,
  Wifi,
} from "lucide-react";
import { usePerfilRecursos } from "../perfil-provider";
import { Fila, SiNo, Tarjeta, fmtMB, fmtN } from "./piezas";

export function SeccionRecursos() {
  const { perfil } = usePerfilRecursos();
  const s = perfil.senales;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Tarjeta Icono={Cpu} titulo="Procesador">
          <Fila k="Núcleos" v={fmtN(s?.sync.nucleos ?? null, "lógicos")} />
          <Fila
            k="CPU medida"
            v={perfil.benchmark.cpuOpsMs !== null ? `${perfil.benchmark.cpuOpsMs} ops/ms` : "sin medir"}
          />
          <Fila
            k="Duración del test"
            v={perfil.benchmark.duracionMs !== null ? `${perfil.benchmark.duracionMs} ms` : "—"}
          />
        </Tarjeta>

        <Tarjeta Icono={MemoryStick} titulo="Memoria">
          <Fila k="RAM (deviceMemory)" v={s?.sync.memoriaGB !== null && s ? `${s.sync.memoriaGB} GB` : "no informada (iOS)"} />
          <Fila k="Límite de heap JS" v={fmtMB(s?.sync.heapLimiteMB ?? null)} />
          <Fila k="Heap en uso" v={fmtMB(s?.sync.heapUsadoMB ?? null)} />
        </Tarjeta>

        <Tarjeta Icono={CircuitBoard} titulo="Gráficos">
          <Fila k="Renderer" v={s?.gpu.renderer ?? "no informado"} titulo={s?.gpu.renderer ?? undefined} />
          <Fila k="WebGL2" v={s ? (s.gpu.webgl2 ? "sí" : "no") : "—"} />
          <Fila k="WebGPU" v={s ? (s.gpu.webgpu ? "disponible" : "no disponible") : "—"} />
          <Fila k="Textura máxima" v={s?.gpu.maxTexturaLado !== null && s ? `${s.gpu.maxTexturaLado} px` : "—"} />
        </Tarjeta>

        <Tarjeta Icono={Wifi} titulo="Red">
          <Fila k="Tipo efectivo" v={s?.sync.redTipo ?? "no informado"} />
          <Fila
            k="Downlink"
            v={s?.sync.redDownlinkMbps !== null && s?.sync.redDownlinkMbps !== undefined ? `${s.sync.redDownlinkMbps} Mbps` : "no informado"}
          />
          <Fila k="Ahorro de datos" v={s?.sync.saveData !== null && s ? (s.sync.saveData ? "ACTIVO" : "inactivo") : "no informado"} />
        </Tarjeta>

        <Tarjeta Icono={BatteryCharging} titulo="Energía">
          <Fila
            k="Batería"
            v={s?.async.bateriaNivel !== null && s ? `${Math.round(s.async.bateriaNivel * 100)}%` : "no informada"}
          />
          <Fila
            k="Cargando"
            v={s?.async.bateriaCargando !== null && s ? (s.async.bateriaCargando ? "sí" : "no") : "no informado"}
          />
        </Tarjeta>

        <Tarjeta Icono={HardDrive} titulo="Almacenamiento">
          <Fila k="Libre" v={fmtMB(s?.async.storageLibreMB ?? null)} />
          <Fila k="Usado por la app" v={fmtMB(s?.async.storageUsadoMB ?? null)} />
          <Fila k="Cuota total" v={fmtMB(s?.async.storageTotalMB ?? null)} />
        </Tarjeta>

        <Tarjeta Icono={Monitor} titulo="Pantalla">
          <Fila
            k="Resolución lógica"
            v={s ? `${s.sync.pantallaW ?? "?"} × ${s.sync.pantallaH ?? "?"}` : "—"}
          />
          <Fila
            k="Resolución física"
            v={s ? `${Math.round((s.sync.pantallaW ?? 0) * (s.sync.dpr ?? 1))} × ${Math.round((s.sync.pantallaH ?? 0) * (s.sync.dpr ?? 1))}` : "—"}
          />
          <Fila k="DPR" v={s && s.sync.dpr !== null ? String(s.sync.dpr) : "—"} />
          <Fila k="Puntos táctiles" v={fmtN(s?.sync.touchMax ?? null, "máx")} />
        </Tarjeta>

        <Tarjeta Icono={Microchip} titulo="Capacidades del runtime">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <SiNo ok={!!s?.runtime.wasmSimd} texto="WASM SIMD" />
            <SiNo ok={!!s?.runtime.wasmHilos} texto="Hilos WASM" />
            <SiNo ok={!!s?.runtime.crossOriginIsolated} texto="COOP/COEP" />
            <SiNo ok={!!s?.runtime.offscreenCanvas} texto="OffscreenCanvas" />
            <SiNo ok={!!s?.runtime.serviceWorker} texto="ServiceWorker" />
          </div>
        </Tarjeta>
      </div>

      {/* Nota Cloudflare Pages (hilos WASM) — solo si está inactivo */}
      {s && !s.runtime.crossOriginIsolated && (
        <div className="flex items-start gap-3 rounded-[4px] border border-(--outline-variant) bg-card p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-(--warning)" aria-hidden />
          <p className="body-md text-muted-foreground">
            <span className="font-semibold text-foreground">Hilos WASM inactivos:</span>{" "}
            falta aislamiento COOP/COEP. GitHub Pages no permite cabeceras, pero{" "}
            <span className="text-foreground">Cloudflare Pages sí</span> — con un archivo{" "}
            <code className="font-data text-(--primary)">_headers</code> (Cross-Origin-Opener-Policy:
            same-origin + Cross-Origin-Embedder-Policy: require-corp) los workers OCR/QR
            podrían usar hilos reales y SIMD en paralelo.
          </p>
        </div>
      )}
    </>
  );
}
