"use client";

import {
  Contrast,
  Maximize,
  Minimize,
  RotateCw,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

/**
 * TOOLBAR del visor (kit stitch-visor-actas-v1 — diseño Stitch): zoom
 * (multiplicativo por ref sobre VisorZoom, límites [0.3, 4.0] — el %
 * es ESPEJO de la escala real), rotación, contraste (NORMAL → ALTO →
 * NEGATIVO) y pantalla completa + badge SCORE de calidad de la página.
 *
 * Dos variantes del MISMO diseño:
 * - "flotante" (desktop): píldora centrada con backdrop-blur y sombra,
 *   flotando sobre el papel milimetrado del canvas.
 * - "barra" (móvil): fila estática con borde inferior (del card móvil).
 *
 * SCORE (diseño Stitch): verde si la página es fiel (≥8), ámbar si trae
 * advertencias (<8). badge con borde acento del tono correspondiente.
 */

const LIMITE_ZOOM = { min: 0.3, max: 4.0 } as const;

function BotonHerramienta({
  etiqueta,
  onClick,
  deshabilitado,
  activo,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  deshabilitado?: boolean;
  activo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={activo || undefined}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-[4px] text-gray-300 transition-colors hover:bg-white/5 hover:text-brand-emerald focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40",
        activo && "bg-emerald-950/40 text-emerald-400"
      )}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <div className="h-3 w-px bg-brand-border-light" aria-hidden />;
}

function BadgeScore({ score }: { score: number }) {
  const fiel = score >= 8;
  return (
    <div
      role="status"
      aria-label={`Score de calidad de la página: ${score} de 10`}
      className={cn(
        "flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider",
        fiel
          ? "border-emerald-500/70 bg-[#10231b] text-emerald-300"
          : "border-amber-500/70 bg-[#231a07] text-amber-300"
      )}
    >
      <CheckCircle2
        className={cn("size-3", fiel ? "text-emerald-400" : "text-amber-400")}
        aria-hidden
      />
      <span>SCORE: {score}/10</span>
    </div>
  );
}

export function ActaToolbar({
  zoom,
  onZoomMas,
  onZoomMenos,
  onAjustar,
  onRotar,
  onContraste,
  pantallaCompleta,
  onPantallaCompleta,
  score,
  variante = "flotante",
}: {
  zoom: number;
  onZoomMas: () => void;
  onZoomMenos: () => void;
  onAjustar: () => void;
  onRotar: () => void;
  onContraste: () => void;
  pantallaCompleta: boolean;
  onPantallaCompleta: () => void;
  /** SCORE de la página visible (0-10) — diseño Stitch. */
  score: number;
  variante?: "flotante" | "barra";
}) {
  const porcentaje = (
    <span
      className="min-w-[36px] text-center font-mono text-xs font-bold text-gray-200"
      aria-label="Nivel de zoom actual"
    >
      {Math.round(zoom * 100)}%
    </span>
  );

  const controles = (
    <>
      <BotonHerramienta
        etiqueta="Reducir zoom (también con la rueda del mouse o pellizco)"
        onClick={onZoomMenos}
        deshabilitado={zoom <= LIMITE_ZOOM.min}
      >
        <ZoomOut className="size-4" aria-hidden />
      </BotonHerramienta>
      {porcentaje}
      <BotonHerramienta
        etiqueta="Aumentar zoom (también con la rueda del mouse o pellizco)"
        onClick={onZoomMas}
        deshabilitado={zoom >= LIMITE_ZOOM.max}
      >
        <ZoomIn className="size-4" aria-hidden />
      </BotonHerramienta>
      <Separador />
      <BotonHerramienta etiqueta="Ajustar al ancho" onClick={onAjustar}>
        <Scan className="size-4" aria-hidden />
      </BotonHerramienta>
      <BotonHerramienta etiqueta="Rotar 90 grados" onClick={onRotar}>
        <RotateCw className="size-4" aria-hidden />
      </BotonHerramienta>
      <BotonHerramienta
        etiqueta="Modo alto contraste B/N"
        onClick={onContraste}
        activo
      >
        <Contrast className="size-4" aria-hidden />
      </BotonHerramienta>
      <BotonHerramienta
        etiqueta={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
        onClick={onPantallaCompleta}
      >
        {pantallaCompleta ? (
          <Minimize className="size-4" aria-hidden />
        ) : (
          <Maximize className="size-4" aria-hidden />
        )}
      </BotonHerramienta>
    </>
  );

  if (variante === "barra") {
    return (
      <div
        role="toolbar"
        aria-label="Herramientas del documento"
        className="flex items-center justify-between gap-2 border-b border-[#21342b] bg-[#121f19]/90 p-2 backdrop-blur"
      >
        <div className="flex items-center gap-1">{controles}</div>
        <BadgeScore score={score} />
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Herramientas del documento"
      className="flex flex-wrap items-center space-x-3 rounded-md border border-brand-border-light bg-[#0d1613]/90 px-3 py-1.5 font-mono text-xs text-gray-300 shadow-2xl backdrop-blur"
    >
      {controles}
      <Separador />
      <BadgeScore score={score} />
    </div>
  );
}
