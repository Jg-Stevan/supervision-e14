"use client";

/**
 * KIT perfil-recursos-v1 — VISTA "Perfil del dispositivo".
 *
 * Pantalla de diagnóstico que hace VISIBLE lo que la app detecta: recursos
 * del equipo (CPU/RAM/GPU/red/energía/storage/pantalla), factor de forma
 * (PC/tablet/móvil), capacidades del runtime (WASM SIMD/hilos), el tier
 * con su EVIDENCIA auditable y el PLAN DE RECURSOS RECOMENDADO (catálogo
 * D6-safe — muestra, no configura).
 *
 * Estilo del kit SUP-1: superficies oscuras, bordes 1px (sin sombras),
 * label-caps para títulos, font-data para datos, radius 4px.
 */
import {
  BatteryCharging,
  CheckCircle2,
  CircleAlert,
  CircuitBoard,
  Copy,
  Cpu,
  Gauge,
  HardDrive,
  Info,
  ListChecks,
  MemoryStick,
  Microchip,
  Monitor,
  RefreshCw,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { usePerfilRecursos } from "../perfil-provider";
import { tonoTier } from "../lib/clasificador";
import { etiquetaForma } from "../lib/senales";
import type { PerfilRecursos, PlanRecursos } from "../domain/tipos";

// ─── piezas locales (mismo lenguaje visual del kit) ────────────────────────

function KpiPerfil({
  titulo,
  valor,
  sub,
  tono,
}: {
  titulo: string;
  valor: string;
  sub: string;
  tono: "success" | "warning" | "danger" | "neutral";
}) {
  const color =
    tono === "success"
      ? "var(--success)"
      : tono === "warning"
        ? "var(--warning)"
        : tono === "danger"
          ? "var(--danger)"
          : "var(--neutral-state)";
  return (
    <div
      className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
      style={{ borderTopColor: color }}
    >
      <p className="label-caps text-muted-foreground">{titulo}</p>
      <p
        className={cn("stats-number", tono === "neutral" && "text-muted-foreground")}
        style={tono === "neutral" ? undefined : { color }}
      >
        {valor}
      </p>
      <p className="body-md mt-0.5 text-muted-foreground">{sub}</p>
    </div>
  );
}

function Tarjeta({
  Icono,
  titulo,
  children,
  className,
}: {
  Icono: LucideIcon;
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // min-w-0: como ítem del grid, su mínimo automático NO puede
        // superar el track — el renderer largo de la GPU trunca en vez de
        // desbordar la página en pantallas chicas.
        "min-w-0 rounded-[4px] border border-border bg-card p-4",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <Icono className="size-4 shrink-0 text-(--primary)" aria-hidden />
        <h3 className="label-caps text-foreground">{titulo}</h3>
      </header>
      <dl className="mt-3 space-y-2">{children}</dl>
    </section>
  );
}

function Fila({ k, v, titulo }: { k: string; v: string; titulo?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="body-md shrink-0 text-muted-foreground">{k}</dt>
      <dd
        className="body-md min-w-0 truncate text-right font-data text-foreground"
        title={titulo ?? v}
      >
        {v}
      </dd>
    </div>
  );
}

function SiNo({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span
      className={cn(
        "body-md inline-flex items-center gap-1 font-data",
        ok ? "text-(--success)" : "text-(--neutral-state)",
      )}
    >
      {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
      {texto}
    </span>
  );
}

// ─── formatos ───────────────────────────────────────────────────────────────

function fmtMB(v: number | null): string {
  if (v === null) return "no informado";
  return v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`;
}
function fmtN(v: number | null, sufijo: string): string {
  return v === null ? "no informado" : `${v} ${sufijo}`;
}

// ─── copia del diagnóstico ──────────────────────────────────────────────────

function diagnosticoJson(perfil: PerfilRecursos, plan: PlanRecursos): string {
  try {
    return JSON.stringify(
      {
        generado: new Date().toISOString(),
        kit: "perfil-recursos-v1",
        tier: perfil.tier,
        tierInferido: perfil.tierInferido,
        confianza: perfil.confianza,
        evidencia: perfil.evidencia,
        senales: perfil.senales,
        benchmark: perfil.benchmark,
        planRecomendado: plan,
      },
      null,
      2,
    );
  } catch {
    return "{}";
  }
}

// ─── vista ──────────────────────────────────────────────────────────────────

export function VistaPerfil() {
  const { perfil, plan, refrescar, midiendo } = usePerfilRecursos();
  const s = perfil.senales;
  const tono = tonoTier(perfil.tier);
  const forma = s ? etiquetaForma(s.forma) : "—";

  const copiar = () => {
    try {
      // El rechazo de clipboard es ASYNC — se maneja en .catch (el
      // try/catch solo protege la llamada síncrona).
      navigator.clipboard
        .writeText(diagnosticoJson(perfil, plan))
        .then(() => toast.success("Diagnóstico copiado al portapapeles (JSON)"))
        .catch(() => toast.error("El navegador denegó el portapapeles — usa RE-DETECTAR y revisa aquí"));
    } catch {
      toast.error("No se pudo copiar el diagnóstico");
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Cabecera de la vista */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="headline-md">PERFIL DEL DISPOSITIVO</h2>
          <p className="body-md mt-0.5 text-muted-foreground">
            Recursos detectados en este equipo — la app los usa para adaptar y
            aprovechar (kit perfil-recursos-v1)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refrescar}
            disabled={midiendo}
            className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary) disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", midiendo && "animate-spin")} aria-hidden />
            {midiendo ? "MIDIENDO…" : "RE-DETECTAR"}
          </button>
          <button
            type="button"
            onClick={copiar}
            className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
          >
            <Copy className="size-4" aria-hidden />
            COPIAR JSON
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiPerfil
          titulo="Gama del dispositivo"
          valor={perfil.listo ? perfil.tier : "…"}
          sub={
            perfil.listo
              ? perfil.tierInferido
                ? "tier inferido (sin RAM informada)"
                : "según señales del navegador"
              : "detectando…"
          }
          tono={tono}
        />
        <KpiPerfil
          titulo="Dispositivo"
          valor={perfil.listo ? forma : "…"}
          sub={s ? `${s.sync.os} · ${s.sync.navegador}` : "detectando…"}
          tono="neutral"
        />
        <KpiPerfil
          titulo="Confianza de la detección"
          valor={perfil.listo ? `${perfil.confianzaPct}%` : "…"}
          sub={
            perfil.listo
              ? `señales decisivas presentes (${perfil.confianza})`
              : "detectando…"
          }
          tono={perfil.confianzaPct >= 83 ? "success" : perfil.confianzaPct >= 50 ? "warning" : "danger"}
        />
        <KpiPerfil
          titulo="Benchmark"
          valor={perfil.benchmark.ejecutado && perfil.benchmark.score !== null ? String(perfil.benchmark.score) : "—"}
          sub={perfil.benchmark.nota}
          tono={
            perfil.benchmark.score === null
              ? "neutral"
              : perfil.benchmark.score >= 750
                ? "success"
                : perfil.benchmark.score >= 350
                  ? "warning"
                  : "danger"
          }
        />
      </div>

      {/* Tarjetas de recursos */}
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
          <Fila k="DPR" v={s?.sync.dpr !== null && s !== undefined ? String(s.sync.dpr) : "—"} />
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

      {/* Plan de recursos recomendado */}
      <section className="rounded-[4px] border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <ListChecks className="size-4 shrink-0 text-(--primary)" aria-hidden />
          <h3 className="label-caps text-foreground">Plan de recursos recomendado</h3>
          <span className="body-md text-muted-foreground">
            — catálogo para este dispositivo (la app muestra; el dueño decide · D6)
          </span>
        </header>
        <div className="max-h-96 overflow-auto scroll-panel">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="label-caps px-4 py-2 text-muted-foreground">Parámetro</th>
                <th className="label-caps px-4 py-2 text-muted-foreground">Base</th>
                <th className="label-caps px-4 py-2 text-(--primary)">Recomendado</th>
                <th className="label-caps px-4 py-2 text-muted-foreground">Por qué</th>
              </tr>
            </thead>
            <tbody>
              {plan.filas.map((f) => (
                <tr key={f.parametro} className="border-b border-border/60 last:border-0 hover:bg-(--hover-row)">
                  <td className="body-md px-4 py-2.5 font-semibold text-foreground">{f.parametro}</td>
                  <td className="body-md px-4 py-2.5 font-data text-muted-foreground">{f.base}</td>
                  <td className="body-md px-4 py-2.5 font-data text-(--primary)">{f.recomendado}</td>
                  <td className="body-md max-w-[360px] px-4 py-2.5 text-muted-foreground">{f.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Evidencia del tier */}
      <section className="rounded-[4px] border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Gauge className="size-4 shrink-0 text-(--primary)" aria-hidden />
          <h3 className="label-caps text-foreground">Evidencia del tier</h3>
          <span className="body-md text-muted-foreground">
            — por qué es {perfil.tier === "PENDIENTE" ? "…" : perfil.tier} (mismas reglas §4.4 que la capa adaptativa)
          </span>
        </header>
        <ul className="max-h-96 space-y-0 overflow-y-auto scroll-panel">
          {perfil.evidencia.map((e) => (
            <li key={e.clave} className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              {e.veredicto === "favorable" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--success)" aria-hidden />
              ) : e.veredicto === "debil" ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-(--danger)" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-(--neutral-state)" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="body-md text-foreground">
                  <span className="font-semibold">{e.etiqueta}</span>
                  {e.valor !== null && (
                    <span className="font-data text-muted-foreground"> · {e.valor}</span>
                  )}
                </p>
                <p className="body-md text-muted-foreground">{e.detalle}</p>
              </div>
            </li>
          ))}
          {perfil.evidencia.length === 0 && (
            <li className="px-4 py-3">
              <p className="body-md text-muted-foreground">Detectando señales…</p>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
