"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, RadioTower, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tiempoRelativo } from "./tiempo";
import {
  alternarHubLocal,
  estadoHubLocal,
  suscribirseHubLocal,
  sincronizarHubLocal,
  type EstadoHubLocal,
} from "../data/hub-local";

/**
 * TARJETA HUB LOCAL (flujo E2E celular → computador).
 *
 * El panel y el digitalizador móvil los sirve UN solo servidor
 * (`scripts/hub-local.mjs`): el celular hace `POST {origen}/actas` y esta
 * tarjeta sondea `GET {origen}/actas?desde=` para traerlas al embudo de
 * siempre (`publicarActaMasiva` con origen `puente-local`).
 *
 * Por qué un interruptor y no arranque automático: en GitHub Pages no hay hub,
 * y un sondeo fallando cada 4 s sería ruido + 5 errores consecutivos en el
 * log del supervisor. El default es APAGADO; lo prende quien esté probando el
 * flujo (queda en `localStorage`, así que sobrevive al recargo).
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

  useEffect(() => suscribirseHubLocal(() => setEstado(estadoHubLocal())), []);

  const sincronizar = async () => {
    setEnCurso(true);
    await sincronizarHubLocal();
    setEnCurso(false);
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
                ? "DETRANSPORTE · 5 fallos seguidos"
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
          <p className="body-md mt-2 max-w-xl text-muted-foreground">
            En el celular, abra la misma dirección del panel sin la ruta
            <span className="font-data"> /supervision</span> (o sea{" "}
            <span className="font-data">{origen}/</span>), escanea y envía: el
            puente del móvil apunta al hub en <span className="font-data">localStorage</span> y
            esta tarjeta trae las filas al embudo de recepción.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="label-caps h-11"
            onClick={() => alternarHubLocal()}
            aria-pressed={encendido}
          >
            {encendido ? "Apagar hub" : "Prender hub"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="label-caps h-11"
            onClick={() => void sincronizar()}
            disabled={enCurso}
          >
            <RefreshCw className={cn("size-4", enCurso && "animate-spin")} aria-hidden />
            Sincronizar ahora
          </Button>
        </div>
      </div>
    </section>
  );
}
