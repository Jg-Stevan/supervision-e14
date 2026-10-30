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
import { cn } from "cn";
// R4 — límites de zoom ÚNICOS (antes duplicados: LIMITE_ZOOM local ×2).
import { LIMITES_ZOOM_VISOR } from "./visor-zoom";

/**
 * Toolbar flotante del visor (kit SUP-4 §2.2 / T4): zoom (multiplicativo
 * por ref sobre VisorZoom — kit visor-gestos-v1, límites [0.3, 4.0] — los
 * límites deshabilitan su botón), AJUSTAR (contain), rotación (cicla
 * 0/90/180/270°), contraste (NORMAL → ALTO → NEGATIVO) y pantalla
 * completa. El % de zoom es ESPEJO de la escala real (VisorZoom
 * onZoomChange). Fondo #121919/90 + backdrop-blur, sin sombras:
 * jerarquía por borde 1px (D14/D17).
 */

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
        "inline-flex size-9 items-center justify-center rounded-[4px] text-foreground hover:bg-(--surface-high) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40",
        activo && "text-(--primary)"
      )}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <div className="h-5 w-px bg-(--border)" aria-hidden />;
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
}: {
  zoom: number;
  onZoomMas: () => void;
  onZoomMenos: () => void;
  onAjustar: () => void;
  onRotar: () => void;
  onContraste: () => void;
  pantallaCompleta: boolean;
  onPantallaCompleta: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Herramientas del documento"
      className="mx-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-[4px] border border-(--border) bg-(--input)/90 p-1.5 backdrop-blur"
    >
      <BotonHerramienta
        etiqueta="Acercar (también con la rueda del mouse o pellizco)"
        onClick={onZoomMas}
        deshabilitado={zoom >= LIMITES_ZOOM_VISOR.max}
      >
        <ZoomIn className="size-4" aria-hidden />
      </BotonHerramienta>
      <span
        className="min-w-[3.25rem] text-center font-mono text-[10px] tabular-nums tracking-wider text-muted-foreground"
        aria-label="Nivel de zoom actual"
      >
        {Math.round(zoom * 100)}%
      </span>
      <BotonHerramienta
        etiqueta="Alejar (también con la rueda del mouse o pellizco)"
        onClick={onZoomMenos}
        deshabilitado={zoom <= LIMITES_ZOOM_VISOR.min}
      >
        <ZoomOut className="size-4" aria-hidden />
      </BotonHerramienta>
      <BotonHerramienta
        etiqueta="Ajustar a la pantalla"
        onClick={onAjustar}
      >
        <Scan className="size-4" aria-hidden />
      </BotonHerramienta>
      <Separador />
      <BotonHerramienta etiqueta="Rotar" onClick={onRotar}>
        <RotateCw className="size-4" aria-hidden />
      </BotonHerramienta>
      <Separador />
      <BotonHerramienta etiqueta="Contraste" onClick={onContraste}>
        <Contrast className="size-4" aria-hidden />
      </BotonHerramienta>
      <Separador />
      <BotonHerramienta
        etiqueta={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla Completa"}
        onClick={onPantallaCompleta}
      >
        {pantallaCompleta ? (
          <Minimize className="size-4" aria-hidden />
        ) : (
          <Maximize className="size-4" aria-hidden />
        )}
      </BotonHerramienta>
    </div>
  );
}
