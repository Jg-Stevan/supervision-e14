"use client";

/**
 * KIT perfil-recursos-v1 — SECCIÓN "Autonomía" del perfil (D38).
 *
 * Extrída de panel-perfil.tsx (refactor perfil-dev-v1): lo que la capa
 * adaptativa (gama.ts, D74/D38) está APLICANDO de verdad — planGamaActual
 * (presupuestos vivos) + flagsMasivaEfectivos (los flags que consumen los
 * workers, ya filtrados por el override manual del dueño) — y el SELECTOR
 * de motor OCR (KIT selector-motor-v1 fase 5/5b, D6: la app muestra; el
 * dueño decide).
 *
 * Estado local: `auto` se resuelve EN MONTAJE (no en render) para
 * hydration-safe con el export estático; se re-resuelve cuando el perfil
 * se re-detecta y cuando el dueño cambia el override / castigo.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CircleAlert,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { usePerfilRecursos } from "../perfil-provider";
// KIT autonomia-ui-v1 (D44) — estado REAL de las filas de UI/arranque
// (precarga + animaciones) derivado del plan aplicado, no del catálogo.
import { estadosPlan } from "../lib/autonomia";
import {
  ETIQUETA_MOTOR,
  OPCIONES_MOTOR,
  fmtDuracion,
  resolverMotorDelDispositivo,
  resolverRecomendacionRouter,
} from "../lib/diagnostico";
// D38 — la tarjeta AUTONOMÍA lee el plan que la capa adaptativa (gama.ts,
// D74/D38) está APLICANDO de verdad: planGamaActual (presupuestos vivos) +
// flagsMasivaEfectivos (flags que consumen los workers, ya filtrados por el
// override manual del dueño). Paridad visual: lo que la app usa, visible.
import {
  flagsMasivaEfectivos,
  planGamaActual,
} from "@/modules/digitalizador/lib/e14/gama";
import { leerFlags } from "@/modules/digitalizador/lib/e14/flags";
// KIT ocr-router-v1 fase 4 — el override manual del dueño (D6) viaja por la
// puerta OFICIAL de overrides (la misma de todos los kill-switches): escribe
// en e14-flags-overrides; la lectura ya pasa por la DOBLE whitelist
// (sanearFlags + leerOverridesFlags — registrada en fase 2).
import { guardarOverridesFlags } from "@/modules/digitalizador/lib/e14/obs/politica";
// KIT ocr-router-v1 — fase 5: infoCastigoV5/limpiarCastigoV5 — el castigo
// de la sonda v5 visible y administrable por el dueño (D6).
import {
  infoCastigoV5,
  limpiarCastigoV5,
  type MotorOcr,
} from "@/modules/digitalizador/lib/e14/ocr/router-ocr";
import type { PlanGama } from "@/modules/digitalizador/lib/e14/gama";
import { Fila } from "./piezas";

export function SeccionAutonomia() {
  const { perfil, plan } = usePerfilRecursos();

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
        /** KIT ocr-router-v1 — motor resuelto para la tarjeta. */
        motor: ReturnType<typeof resolverMotorDelDispositivo>;
        /** fase 4 — override manual vigente en e14-flags-overrides (null =
         *  el router decide; «ppocrv5» | «tesseract-best-psm4» = el dueño
         *  fijó el motor a mano). */
        overrideManual: MotorOcr | null;
        /** fase 5 — la recomendación PROPIA del router (sin override) para
         *  la advertencia honesta del selector + estado del castigo v5. */
        motorSinOverride: ReturnType<typeof resolverRecomendacionRouter>;
        castigoV5: { probadoHaceMs: number; msRestantes: number } | null;
        /** KIT autonomia-ui-v1 (D44) — estado real de precarga/animaciones. */
        estadosUi: ReturnType<typeof estadosPlan>;
      }
  >(null);
  // D38 — resolución EN MONTAJE (no en render) para hydration-safe con el
  // export estático; se re-resuelve cuando el perfil se re-detecta y cuando
  // el dueño cambia el override (fase 4 — resolverAuto vía los botones).
  const resolverAuto = useCallback(() => {
    try {
      const f = leerFlags();
      setAuto({
        planGama: planGamaActual(),
        poolOcr: flagsMasivaEfectivos().poolWorkers,
        hilosOcr: flagsMasivaEfectivos().ocrThreadsTope,
        flagAuto: f.masivaAdaptativoGama !== false,
        overrideManual: f.ocrMotor ?? null,
        motor: resolverMotorDelDispositivo(perfil),
        motorSinOverride: resolverRecomendacionRouter(perfil),
        castigoV5: infoCastigoV5(),
        estadosUi: estadosPlan(plan),
      });
    } catch {
      setAuto(null); // jamás tumba el panel
    }
  }, [perfil, plan]);
  useEffect(() => {
    resolverAuto();
  }, [resolverAuto]);

  // KIT selector-motor-v1 fase 5 — el DUEÑO fija el motor (D6: la app
  // muestra y escribe SOLO lo que el dueño pide). Escribe el override en
  // e14-flags-overrides (puerta oficial — DOBLE whitelist de fase 2); null
  // = retirar (el whitelist lo descarta ⇒ el router recupera la decisión).
  // El arranque del OCR lo lee en la PRÓXIMA init — el singleton vigente no
  // se toca (usar APLICAR AHORA para reiniciar sin recargar; el reinicio
  // seguro rechaza si hay OCR en vuelo — la corrida manda).
  const fijarMotor = (valor: MotorOcr | null) => {
    try {
      guardarOverridesFlags({ ocrMotor: valor });
      resolverAuto(); // re-resuelve con el override vigente
      toast.success(
        valor === null
          ? "Automático — el router vuelve a decidir en el próximo arranque"
          : `${ETIQUETA_MOTOR[valor]} fijado — el próximo arranque del OCR lo aplica (o usa APLICAR AHORA)`,
      );
    } catch {
      toast.error("No se pudo escribir el override");
    }
  };

  const limpiarCastigo = () => {
    try {
      limpiarCastigoV5();
      resolverAuto();
      toast.success("Castigo limpiado — la sonda de v5 puede reintentarse");
    } catch {
      toast.error("No se pudo limpiar el castigo");
    }
  };

  // fase 5 — aplicar SIN recargar: import dinámico (el módulo del motor
  // pre-calienta al importarse — cargarlo solo cuando el dueño lo pide).
  const [reiniciandoMotor, setReiniciandoMotor] = useState(false);
  const reiniciarMotorAhora = async () => {
    setReiniciandoMotor(true);
    try {
      const { reiniciarMotorOcrSiInactivo } = await import(
        "@/modules/digitalizador/lib/e14/ocr/rapidocr"
      );
      const ok = await reiniciarMotorOcrSiInactivo();
      if (ok) toast.success("Motor reiniciado — el próximo arranque del OCR aplica tu elección");
      else toast.error("Hay un OCR en curso — espera a que termine la corrida");
    } catch {
      toast.error("No se pudo reiniciar el motor");
    } finally {
      setReiniciandoMotor(false);
    }
  };

  if (!auto) return null;

  return (
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
          {/* KIT autonomia-ui-v1 (D44) — los dos consumidores nuevos de la
              autonomía de UI/arranque, con su estado REAL (no el catálogo). */}
          <Fila
            k="Precarga de modelos"
            v={auto.estadosUi.precarga?.aplicado ?? "—"}
            titulo={auto.estadosUi.precarga?.detalle}
          />
          <Fila
            k="Animaciones de UI"
            v={auto.estadosUi.animaciones?.aplicado ?? "—"}
            titulo={auto.estadosUi.animaciones?.detalle}
          />
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
        {/* KIT selector-motor-v1 fase 5 — el DUEÑO elige el modelo (D6).
            Automático por defecto (el router decide por tier + sondas);
            si el dueño fija un motor, la decisión se RESPETA — paso 1 de
            la cadena del router (override-manual manda sobre gobernador,
            castigos y tier). La sonda de carga sigue siendo el gate
            técnico del arranque: fallo ⇒ v4 honesto, la corrida jamás se
            tumba. Visible en TODOS los tiers — es la herramienta para
            probar v5 (p. ej. en BAJO/MEDIO) sin consola. */}
        {auto.motor && (
          <div className="mt-3 rounded-[4px] border border-(--outline-variant) bg-(--hover-row) p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Zap className="size-4 shrink-0 text-(--primary)" aria-hidden />
              <p className="label-caps text-foreground">Motor OCR — elige el modelo</p>
              {auto.overrideManual && (
                <span
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-(--primary)/40 bg-(--primary)/10 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-(--primary)"
                  title="Override manual del dueño (e14-flags-overrides) — el router NO decide (D6)"
                >
                  Override activo
                </span>
              )}
            </div>
            <div
              role="radiogroup"
              aria-label="Motor OCR a utilizar"
              className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {OPCIONES_MOTOR.map((op) => {
                const activo = auto.overrideManual === op.valor;
                return (
                  <button
                    key={op.etiqueta}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => fijarMotor(op.valor)}
                    className={cn(
                      "rounded-[4px] border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-(--primary)",
                      activo
                        ? "border-(--primary)/60 bg-(--primary)/10"
                        : "border-border bg-card hover:bg-(--accent)",
                    )}
                  >
                    <span className="label-caps block text-foreground">{op.etiqueta}</span>
                    <span className="body-md mt-0.5 block font-data text-muted-foreground">
                      {op.sub}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="body-md mt-3 text-muted-foreground">
              {auto.overrideManual === "ppocrv5"
                ? "Fijado a mano (D6): el próximo arranque descarga los modelos v5 (~13 MB) y corre la sonda de carga (≤ 30 s en override manual). Si la sonda falla, esa corrida sigue con el motor base — sin riesgo; el castigo de 7 días solo afecta al modo automático (tu decisión manda)."
                : auto.overrideManual === "tesseract-spa-best-psm4"
                  ? "Fijado a mano (D6): el Tesseract REAL del benchmark (spa-best + psm 4, 94,4 % de dígitos, ~67 MB) vía tesseract.js — la primera vez descarga ~12 MB (traineddata gz). El modo automático jamás lo elige; la init del worker es la prueba y si falla (o falla en vuelo), esa corrida sigue con el motor base — sin riesgo."
                  : auto.overrideManual === "tesseract-best-psm4"
                    ? "Fijado a mano (D6): motor base — RapidOCR v4, la producción de siempre — en todos los arranques; el router no decide."
                    : `Automático (recomendado): el router elige por tier + sondas de carga. La decisión vigente correría «${ETIQUETA_MOTOR[auto.motor.motor]}» (${auto.motor.origen}).`}
            </p>
            {auto.overrideManual === "ppocrv5" &&
             auto.motorSinOverride &&
             auto.motorSinOverride.motor !== "ppocrv5" && (
              <div className="mt-2 flex items-start gap-2 rounded-[4px] border border-(--warning)/40 bg-(--warning)/10 p-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-(--warning)" aria-hidden />
                <p className="body-md text-muted-foreground">
                  El router NO elegiría v5 aquí por sí solo: {auto.motorSinOverride.motivo} Tu
                  decisión manda (D6) — riesgos honestos: pico ~487 MB (OOM posible en gama
                  baja), descarga ~13 MB, sin WASM SIMD corre lento. La sonda de carga es el
                  gate técnico: un fallo degrada a v4 sin tumbar la corrida.
                </p>
              </div>
            )}
            {auto.castigoV5 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[4px] border border-border bg-card p-2">
                <CircleAlert className="size-4 shrink-0 text-(--warning)" aria-hidden />
                <p className="body-md min-w-0 flex-1 text-muted-foreground">
                  Castigo vigente: la sonda de v5 falló hace{" "}
                  {fmtDuracion(auto.castigoV5.probadoHaceMs)} — el modo automático no reintenta
                  por {fmtDuracion(auto.castigoV5.msRestantes)} (un override manual NO se ve
                  afectado).
                </p>
                <button
                  type="button"
                  onClick={limpiarCastigo}
                  className="label-caps inline-flex h-9 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
                >
                  LIMPIAR CASTIGO
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={reiniciarMotorAhora}
                disabled={reiniciandoMotor}
                className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-(--primary)/40 bg-card px-3 text-(--primary) hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={cn("size-4", reiniciandoMotor && "animate-spin")} aria-hidden />
                {reiniciandoMotor ? "REINICIANDO…" : "APLICAR AHORA (reinicia el motor)"}
              </button>
              <span className="body-md text-muted-foreground">
                sin recargar la página — evítalo en medio de una corrida
              </span>
            </div>
          </div>
        )}
        <p className="body-md mt-3 text-muted-foreground">
          La app administra los recursos sola: detecta el equipo, aplica presupuestos
          (CPU/memoria/reló), reduce animaciones en gama baja y precarga el motor OCR
          en idle (D44). Se degrada preventivamente bajo presión observada (hard-kills).
          Jamás toca criterios ni score. Tu override manual manda clave a clave (D6) y{" "}
          <code className="font-data text-(--primary)">masivaAdaptativoGama=false</code> apaga
          la autonomía del pipeline mientras que{" "}
          <code className="font-data text-(--primary)">uiAdaptativaGama=false</code> apaga la de
          UI/arranque.
        </p>
      </div>
    </section>
  );
}
