"use client";

import {
  CheckCircle2,
  Contrast,
  Maximize,
  Minimize,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
// R4 — límites de zoom ÚNICOS (antes duplicados: LIMITE_ZOOM local ×2).
import { LIMITES_ZOOM_VISOR } from "./visor-zoom";

/**
 * Toolbar flotante del visor (KIT VISOR-MONITOR-GLOBAL-v1 §4-T3 — diseño
 * del dueño): `🔍− % 🔍+ │ ↻ ◐ ⛶ │ SCORE`.
 *
 * - **Sin botón AJUSTAR** (T3.1 — el ajuste sigue disponible con doble
 *   clic/toque, gesto de VisorZoom; los title/aria del zoom lo mencionan).
 * - Orden como la imagen: zoom−, %, zoom+ · separador · rotación,
 *   contraste, pantalla completa · separador · chip SCORE ADHERIDO como
 *   segmento final (T3.2/T3.3).
 * - Zoom multiplicativo por ref sobre VisorZoom (kit visor-gestos-v1,
 *   límites [0.3, 4.0] — los límites deshabilitan su botón). El % es
 *   ESPEJO de la escala real (VisorZoom onZoomChange).
 * - Rotación cicla 0/90/180/270° y contraste NORMAL → ALTO → NEGATIVO
 *   (sin cambios, T3.4).
 * - Fondo #121919/90 + backdrop-blur, sin sombras: jerarquía por borde
 *   1px (D14/D17).
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

/**
 * Chip SCORE (plan V1 desktop / M3 móvil — diseño r7): verde ≥ 9 · ámbar < 9.
 * El icono check sale en desktop y el punto en móvil (mismo chip, dos
 * variantes del diseño). Ámbar = token único --amber #ffb800 (T-03 de la
 * auditoría diseños — antes #e9c400 suelto, hoy un solo ámbar en el tema).
 *
 * C-20 — el score es telemetría del OCR y pudo venir fuera de rango (un
 * «13.7» de un motor desbocado): se CLAMPEA a [0, 10] antes de mostrar.
 * El umbral óptimo sigue siendo `score >= 9` (dominio — no cambia con el
 * clamp: fuera de rango por arriba sigue siendo óptimo, por abajo no).
 */
function ChipScore({ score }: { score: number }) {
  const clampeado = Math.min(10, Math.max(0, score));
  const optimo = clampeado >= 9;
  return (
    <span
      role="status"
      aria-label={`Score OCR de la página: ${clampeado.toFixed(1)} de 10`}
      title="Score OCR de la página (telemetría del digitalizador)"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider",
        optimo
          ? "border-(--primary)/70 bg-(--primary)/10 text-(--primary)"
          : "border-(--amber)/70 bg-(--amber)/10 text-(--amber)"
      )}
    >
      <CheckCircle2
        className="hidden size-3 sm:block"
        aria-hidden
      />
      <span
        className={cn(
          "size-1.5 rounded-full sm:hidden",
          optimo ? "bg-(--primary)" : "bg-(--amber)"
        )}
        aria-hidden
      />
      <span className="text-muted-foreground">SCORE:</span>
      <span className="tabular-nums">{clampeado.toFixed(1)}/10</span>
    </span>
  );
}

export function ActaToolbar({
  zoom,
  score,
  onZoomMas,
  onZoomMenos,
  onRotar,
  onContraste,
  pantallaCompleta,
  onPantallaCompleta,
}: {
  zoom: number;
  /** Score OCR de la página visible (plan V1): null/undefined → sin chip
   * (página PENDIENTE — no hay lectura que evaluar). */
  score?: number | null;
  onZoomMas: () => void;
  onZoomMenos: () => void;
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
      {/* Orden de la imagen (T3.2): 🔍− % 🔍+ │ ↻ ◐ ⛶ │ SCORE */}
      <BotonHerramienta
        etiqueta="Alejar (también con la rueda del mouse o pellizco; doble clic para ajustar)"
        onClick={onZoomMenos}
        deshabilitado={zoom <= LIMITES_ZOOM_VISOR.min}
      >
        <ZoomOut className="size-4" aria-hidden />
      </BotonHerramienta>
      <span
        className="min-w-[3.25rem] text-center font-mono text-[10px] tabular-nums tracking-wider text-muted-foreground"
        aria-label="Nivel de zoom actual"
      >
        {Math.round(zoom * 100)}%
      </span>
      <BotonHerramienta
        etiqueta="Acercar (también con la rueda del mouse o pellizco; doble clic para ajustar)"
        onClick={onZoomMas}
        deshabilitado={zoom >= LIMITES_ZOOM_VISOR.max}
      >
        <ZoomIn className="size-4" aria-hidden />
      </BotonHerramienta>
      <Separador />
      <BotonHerramienta etiqueta="Rotar" onClick={onRotar}>
        <RotateCw className="size-4" aria-hidden />
      </BotonHerramienta>
      <BotonHerramienta etiqueta="Contraste" onClick={onContraste}>
        <Contrast className="size-4" aria-hidden />
      </BotonHerramienta>
      <BotonHerramienta
        etiqueta={
          pantallaCompleta
            ? "Salir de pantalla completa (Escape)"
            : "Pantalla completa (imagen)"
        }
        onClick={onPantallaCompleta}
      >
        {pantallaCompleta ? (
          <Minimize className="size-4" aria-hidden />
        ) : (
          <Maximize className="size-4" aria-hidden />
        )}
      </BotonHerramienta>
      {/* T3.3 — chip SCORE como segmento final ADHERIDO (score REAL de la
          foto; sin score → sin chip, página PENDIENTE). */}
      {typeof score === "number" && Number.isFinite(score) && (
        <>
          <Separador />
          <ChipScore score={score} />
        </>
      )}
    </div>
  );
}
