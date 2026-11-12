"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, RadioTower, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { tiempoRelativo } from "./tiempo";
import {
  alternarHubLocal,
  estadoHubLocal,
  reiniciarHubRemoto,
  suscribirseHubLocal,
  sincronizarHubLocal,
  type EstadoHubLocal,
} from "../data/hub-local";

/**
 * TARJETA HUB LOCAL (flujo E2E celular → computador).
 *
 * El panel y el digitalizador móvil los sirve UN solo servidor
 * (`scripts/hub-local.mjs`): el celular hace `POST {origen}/actas` y esta
 * tarjeta sondea `GET {origen}/actas?desde=<seq>` (C-06: cursor por SEQ con
 * drenaje) para traerlas al embudo de siempre (`publicarActaMasiva` con
 * origen `puente-local`).
 *
 * Por qué un interruptor y no arranque automático: en GitHub Pages no hay hub,
 * y un sondeo fallando cada 4 s sería ruido + 5 errores consecutivos en el
 * log del supervisor. El default es APAGADO; lo prende quien esté probando el
 * flujo (queda en `localStorage`, así que sobrevive al recargo).
 *
 * C-16 — muestra el aviso de reconciliación cuando la `generacion` del hub
 * cambió (reset destructivo) y expone el RESET manual con diálogo de
 * confirmación: `POST /hub/reset` con el segundo factor `x-hub-reset:
 * confirmar` (sin él el hub responde 428).
 */

function Chip({ tono, children }: { tono: string; children: ReactNode }) {
  return (
    <span className={cn("label-caps inline-block rounded-[4px] border px-1.5 py-0.5", tono)}>
      {children}
    </span>
  );
}

export function HubLocalCard() {
  const [estado, setEstado] = useState<EstadoHubLocal>(() => estadoHubLocal());
  const [enCurso, setEnCurso] = useState(false);
  const [resetEnCurso, setResetEnCurso] = useState(false);
  const [confirmarReset, setConfirmarReset] = useState(false);

  useEffect(() => suscribirseHubLocal(() => setEstado(estadoHubLocal())), []);

  const sincronizar = async () => {
    setEnCurso(true);
    const r = await sincronizarHubLocal();
    setEnCurso(false);
    if (r.error) toast.error(`El hub no respondió: ${r.error}`);
  };

  const reiniciar = async () => {
    setResetEnCurso(true);
    const r = await reiniciarHubRemoto();
    setResetEnCurso(false);
    if (r.ok) {
      toast.success(
        `Hub reiniciado — almacén vacío (generación nueva ${r.generacion ?? "…"}); recepción re-sincronizada`
      );
    } else {
      toast.error(`No se pudo reiniciar el hub: ${r.error}`);
    }
  };

  const encendido = estado.activo;
  const origen = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section
      className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
      style={{ borderTopColor: encendido ? "var(--success)" : "var(--neutral-state)" }}
      aria-label="Hub local — puente desde el celular"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps flex flex-wrap items-center gap-2 text-muted-foreground">
            {encendido ? (
              <RadioTower className="size-4 text-(--success)" aria-hidden />
            ) : (
              <WifiOff className="size-4 text-muted-foreground" aria-hidden />
            )}
            HUB LOCAL · puente desde el celular
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip
              tono={
                estado.detenido
                  ? "border-(--warning) text-(--warning)"
                  : encendido
                    ? "border-(--success) text-(--success)"
                    : "border-border text-muted-foreground"
              }
            >
              {estado.detenido
                ? // C-24 — término correcto en español + N real de fallos
                  // consecutivos (antes: «DETRANSPORTE · 5» pegado y falso).
                  `EN TRANSPORTE · ${estado.fallosSeguidos} fallos seguidos`
                : encendido
                  ? "SONDEANDO CADA 4 S"
                  : "APAGADO"}
            </Chip>
            <Chip tono="border-(--outline-variant) text-muted-foreground">
              EN EL HUB {estado.enHub}
            </Chip>
            <Chip tono="border-(--outline-variant) text-muted-foreground">
              TRAÍDAS {estado.procesadas}
            </Chip>
            <Chip tono="border-(--success) text-(--success)">
              PUBLICADAS {estado.publicas}
            </Chip>
            <Chip tono="border-(--warning) text-(--warning)">
              BLOQUEADAS {estado.bloqueadas}
            </Chip>
            {/* Anti-reproceso: reenvíos idénticos (misma página + misma
                huella SHA-256) — detectados y NO republicados. */}
            {estado.duplicadas > 0 && (
              <Chip tono="border-border text-muted-foreground">
                DUPLICADAS {estado.duplicadas}
              </Chip>
            )}
            {estado.ultimaSyncTs && (
              <span className="font-data text-[11px] text-muted-foreground">
                última sync {tiempoRelativo(estado.ultimaSyncTs).toLowerCase()}
              </span>
            )}
          </div>
          {estado.ultimoError && (
            <p className="body-md mt-2 text-(--warning)">
              El hub no respondió: {estado.ultimoError}. Si abriste el panel
              desde GitHub Pages (o sin <span className="font-data">hub-local</span>),
              no hay puente que sondear — enciéndelo solo cuando el servidor
              local esté corriendo.
            </p>
          )}
          {/* C-16 — aviso de reconciliación: la generación del hub cambió
              (reset destructivo): cursor a 0, log de recepción purgado y
              re-sincronización completa (la semilla demo no se re-siembra). */}
          {estado.aviso && (
            <p
              role="status"
              className="body-md mt-2 rounded-[4px] border border-(--warning)/50 bg-(--warning)/10 px-3 py-2 text-(--warning)"
            >
              {estado.aviso}
              {estado.generacion && (
                <span className="font-data"> · generación {estado.generacion}</span>
              )}
            </p>
          )}
          <p className="body-md mt-2 max-w-xl text-muted-foreground">
            En el celular, abra la misma dirección del panel sin la ruta
            <span className="font-data"> /supervision</span> (o sea{" "}
            <span className="font-data">{origen}/</span>), escanea y envía: el
            puente del móvil apunta al hub en <span className="font-data">localStorage</span> y
            esta tarjeta trae las filas al embudo de recepción.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="label-caps h-11"
            onClick={() => alternarHubLocal()}
            aria-pressed={encendido}
          >
            {encendido ? "Apagar hub" : "Prender hub"}
          </Button>
          {/* C-16 — re-sincronización manual (drena TODO lo pendiente desde
              el cursor SEQ, no solo una página). */}
          <Button
            variant="outline"
            size="sm"
            className="label-caps h-11"
            onClick={() => void sincronizar()}
            disabled={enCurso}
          >
            <RefreshCw className={cn("size-4", enCurso && "animate-spin")} aria-hidden />
            Re-sincronizar con el hub
          </Button>
          {/* C-16 — reset destructivo del hub (demo): el botón SOLO abre el
              diálogo; el POST con el segundo factor sale confirmado. */}
          <Button
            variant="outline"
            size="sm"
            className="label-caps h-11 text-(--warning) hover:text-(--warning)"
            onClick={() => setConfirmarReset(true)}
            disabled={resetEnCurso}
            title="Vacía el almacén del hub local (destructivo)"
          >
            <Trash2 className="size-4" aria-hidden />
            Reiniciar hub
          </Button>
        </div>
      </div>

      {/* C-16 — confirmación del reset destructivo (shadcn alert-dialog). */}
      <AlertDialog
        open={confirmarReset}
        onOpenChange={(abierto) => !resetEnCurso && setConfirmarReset(abierto)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reiniciar el hub local?</AlertDialogTitle>
            <AlertDialogDescription>
              Vacía TODAS las filas del almacén del hub en{" "}
              <span className="font-data">{origen}</span> (acción destructiva:
              las fotos y metadatos se pierden, queda registro en el log del
              servidor). El panel detectará la generación nueva y
              re-sincronizará la recepción desde cero. El hub puede volver a
              llenarse en cuanto el celular envíe de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetEnCurso}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetEnCurso}
              onClick={(e) => {
                e.preventDefault(); // el diálogo NO se cierra hasta terminar
                void reiniciar().then(() => setConfirmarReset(false));
              }}
            >
              {resetEnCurso ? "Reiniciando…" : "Reiniciar hub"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
