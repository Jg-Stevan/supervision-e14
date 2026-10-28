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
import { useEffect, useState } from "react";
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
  Sparkles,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { usePerfilRecursos } from "../perfil-provider";
import { tonoTier } from "../lib/clasificador";
import { etiquetaForma } from "../lib/senales";
import type { PerfilRecursos, PlanRecursos } from "../domain/tipos";
// D38 (KIT e14-recursos-autonomos-v1) — la tarjeta AUTONOMÍA lee el plan que
// la capa adaptativa (gama.ts, D74/D38) está APLICANDO de verdad: planGamaActual
// (presupuestos vivos) + flagsMasivaEfectivos (flags que consumen los workers,
// ya filtrados por el override manual del dueño). Paridad visual: lo que la
// app usa, visible en pantalla.
import {
  flagsMasivaEfectivos,
  planGamaActual,
} from "@/modules/digitalizador/lib/e14/gama";
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";
// KIT ocr-router-v1 — el ROUTER de motor OCR por dispositivo (PR #10). El
// informe reporta QUÉ motor corre en este equipo y el porqué auditable.
import {
  presionReciente,
  resolverMotor,
  type MotorOcr,
  type PerfilMinimo,
  type ResolucionMotor,
} from "@/modules/digitalizador/lib/e14/ocr/router-ocr";
import type { PlanGama } from "@/modules/digitalizador/lib/e14/gama";

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

// ─── ocr-router-v1 — resolución del motor para el informe ───────────────────

const ETIQUETA_MOTOR: Record<MotorOcr, string> = {
  "tesseract-best-psm4": "Tesseract best + psm 4",
  ppocrv5: "PP-OCRv5 (ONNX)",
};

/** Adapta el `PerfilRecursos` del kit a la estructura mínima que espera el
 *  router (`PerfilMinimo` — runtime/sync/async en la raíz). null = sin
 *  señales aún (SSR / primer pase): el informe sale SIN bloque de motor —
 *  honesto, jamás inventar. */
function perfilMinimoDe(perfil: PerfilRecursos): PerfilMinimo | null {
  const s = perfil.senales;
  if (!s) return null;
  return {
    tier: perfil.tier,
    benchmark: perfil.benchmark,
    runtime: s.runtime,
    sync: s.sync,
    async: s.async,
    gpu: s.gpu,
    forma: s.forma,
  };
}

/** Resuelve el motor con la cadena COMPLETA de prioridad del router:
 *  flag kill-switch ← override manual ← gobernador ← sonda de carga ←
 *  sonda de CPU ← tier. Jamás lanza (null si aún no hay señales). */
function resolverMotorDelDispositivo(perfil: PerfilRecursos): ResolucionMotor | null {
  try {
    const p = perfilMinimoDe(perfil);
    if (!p) return null;
    const flags = leerFlags();
    return resolverMotor(p, {
      flagOn: flags.ocrMotorAdaptativo !== false,
      overrideManual: flags.ocrMotor ?? null,
      presionReciente: presionReciente(),
    });
  } catch {
    return null;
  }
}

// ─── copia del diagnóstico ──────────────────────────────────────────────────

function diagnosticoJson(
  perfil: PerfilRecursos,
  plan: PlanRecursos,
  motor: ResolucionMotor | null,
): string {
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
        // KIT ocr-router-v1 — qué motor OCR corre en este dispositivo y el
        // porqué auditable (origen: flag-off | override-manual |
        // gobernador-presion | sonda-cpu | sonda-carga-previa | tier |
        // medio-elegible-upgrade). Aditivo AL FINAL (mismo patrón
        // hangResumen/enviosDetalle): informes previos no cambian de forma.
        // Ausente = sin señales aún (no debería ocurrir en una copia hecha
        // desde el panel).
        ...(motor && {
          motorOcr: {
            motor: motor.motor,
            motivo: motor.motivo,
            origen: motor.origen,
            requiereSondaCarga: motor.requiereSondaCarga,
            condicionesUpgrade: motor.condicionesUpgrade,
          },
        }),
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

  // D38 — estado de autonomía (plan aplicado AHORA por gama.ts). Se resuelve
  // EN MONTAJE (no en render) para hydration-safe con el export estático;
  // se re-resuelve cuando el perfil se re-detecta.
  const [auto, setAuto] = useState<
    | null
    | {
        planGama: PlanGama;
        poolOcr: number;
        hilosOcr: number;
        flagAuto: boolean;
        /** KIT ocr-router-v1 — motor resuelto para el informe y la tarjeta. */
        motor: ResolucionMotor | null;
      }
  >(null);
  useEffect(() => {
    try {
      setAuto({
        planGama: planGamaActual(),
        poolOcr: flagsMasivaEfectivos().poolWorkers,
        hilosOcr: flagsMasivaEfectivos().ocrThreadsTope,
        flagAuto: leerFlags().masivaAdaptativoGama !== false,
        motor: resolverMotorDelDispositivo(perfil),
      });
    } catch {
      setAuto(null); // jamás tumba el panel
    }
  }, [perfil]);

  const copiar = () => {
    try {
      // El rechazo de clipboard es ASYNC — se maneja en .catch (el
      // try/catch solo protege la llamada síncrona).
      navigator.clipboard
        .writeText(
          diagnosticoJson(perfil, plan, resolverMotorDelDispositivo(perfil)),
        )
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

      {/* D38 — AUTONOMÍA: lo que la capa adaptativa está APLICANDO ahora */}
      {auto && (
        <section className="rounded-[4px] border border-border bg-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="size-4 shrink-0 text-(--primary)" aria-hidden />
            <h3 className="label-caps text-foreground">Autonomía — aplicado ahora</h3>
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-data text-[10px] uppercase tracking-wider",
                auto.flagAuto
                  ? "border-(--success)/40 bg-(--success)/10 text-(--success)"
                  : "border-(--outline-variant) text-muted-foreground",
              )}
              title={
                auto.flagAuto
                  ? "La app ajusta sola los presupuestos de recursos (KIT e14-recursos-autonomos-v1 · D38)"
                  : "Kill-switch del dueño activo (masivaAdaptativoGama=false) — la app no se auto-configura"
              }
            >
              {auto.flagAuto ? "AUTO" : "MANUAL"}
            </span>
          </header>
          <div className="px-4 py-3">
            {auto.planGama.reactivo && (
              <div className="mb-3 flex items-start gap-2 rounded-[4px] border border-(--warning)/40 bg-(--warning)/10 p-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-(--warning)" aria-hidden />
                <p className="body-md text-muted-foreground">
                  <span className="font-semibold text-foreground">Degradación preventiva activa:</span>{" "}
                  {auto.planGama.reactivo.motivo} — presupuestos de un escalón menor; se recupera
                  sola al expirar (self-healing, sin tocar tu tier real).
                </p>
              </div>
            )}
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Fila
                k="Tier real → efectivo"
                v={
                  auto.planGama.tierEfectivo !== auto.planGama.tier
                    ? `${auto.planGama.tier} → ${auto.planGama.tierEfectivo} (reactivo)`
                    : auto.planGama.tier
                }
              />
              <Fila k="Pool OCR efectivo" v={`${auto.poolOcr} worker(s)`} />
              <Fila k="Hilos OCR efectivos" v={String(auto.hilosOcr)} />
              {/* KIT ocr-router-v1 — el motor que correría HOY en este equipo
                  y el porqué (auditable también en el JSON del informe: campo
                  motorOcr). */}
              <Fila
                k="Motor OCR"
                v={
                  auto.motor
                    ? `${ETIQUETA_MOTOR[auto.motor.motor]} · ${auto.motor.origen}`
                    : "—"
                }
                titulo={auto.motor?.motivo}
              />
              <Fila
                k="Ajustes activos"
                v={
                  auto.planGama.activo
                    ? auto.planGama.ajustes.join(" · ")
                    : "base del pipeline (sin adaptación)"
                }
                titulo={auto.planGama.activo ? auto.planGama.ajustes.join(" · ") : undefined}
              />
              {auto.motor && auto.motor.condicionesUpgrade.length > 0 && (
                <Fila
                  k="Upgrade a v5"
                  v={auto.motor.condicionesUpgrade.join(" · ")}
                  titulo={auto.motor.condicionesUpgrade.join(" · ")}
                />
              )}
            </div>
            <p className="body-md mt-3 text-muted-foreground">
              La app administra los recursos sola: detecta el equipo, aplica presupuestos
              (CPU/memoria/reló) y se degrada preventivamente bajo presión observada (hard-kills).
              Jamás toca criterios ni score. Tu override manual manda clave a clave (D6) y{" "}
              <code className="font-data text-(--primary)">masivaAdaptativoGama=false</code> apaga
              toda la autonomía.
            </p>
          </div>
        </section>
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
