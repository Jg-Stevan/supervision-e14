"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * VISOR-ZOOM (kit visor-gestos-v1): lienzo de documento con ZOOM REAL por
 * gestos — rueda del mouse (ancla en el cursor), pellizco táctil (ancla en
 * el punto medio de los 2 dedos), arrastre para desplazar (1 dedo / mouse)
 * y doble clic / doble toque (ajustar ↔ acercar). Los botones de la toolbar
 * del padre operan por ref (acercar/alejar/ajustar) — una sola fuente de
 * verdad para la escala.
 *
 * Comportamiento:
 * - AJUSTE INICIAL automático (contain): el documento entra completo sin
 *   scroll; re-ajusta si cambia el tamaño del contenedor, la rotación o
 *   `fitKey` (cambio de página/foto).
 * - transform ÚNICO translate·scale·rotate (la rotación es visual — el
 *   filtro/contraste viaja como CSS filter del padre).
 * - Límites [minZoom, maxZoom] compartidos con la toolbar del visor.
 * - touch-action: none + select-none: el navegador no interfiere (el modal
 *   ya bloquea el scroll del body).
 * - El contenido vive en `children` con su tamaño base propio (papel A4
 *   sintético 794×1123 o foto real con width/height explícitos) — este
 *   componente NO renderiza la imagen, solo la escena.
 */

export interface VisorZoomHandle {
  acercar: () => void;
  alejar: () => void;
  /** Vuelve al ajuste inicial (contain) con offset centrado. */
  ajustar: () => void;
  /** Escala absoluta solicitada (clamp a [min, max]). */
  fijarZoom: (escala: number) => void;
}

interface VisorZoomProps {
  children: ReactNode;
  /** Rotación visual en grados (0/90/180/270 — la maneja el padre). */
  rotacion?: number;
  /** CSS filter (contraste NORMAL/ALTO/NEGATIVO — lo maneja el padre). */
  filtro?: string;
  /** Reporta la escala absoluta (para mostrar % / deshabilitar botones). */
  onZoomChange?: (escala: number) => void;
  minZoom?: number;
  maxZoom?: number;
  /** Cambia → re-ajuste automático (página nueva, foto nueva, mesa nueva). */
  fitKey?: string;
  className?: string;
  /** aria-label del lienzo (el contenido pone el suyo). */
  ariaLabel?: string;
}

const PAD_AJUSTE = 24; // aire alrededor al ajustar (contain)
const PASO_BOTON = 1.25; // multiplicativo — se siente igual a toda escala
/** Doble toque: si está lejos del ajuste vuelve; si no, acerca a este múltiplo. */
const MULT_DOBLE_TOQUE = 2.2;

/** Límites compartidos con ActaToolbar (misma constante — zoom honesto). */
export const LIMITES_ZOOM_VISOR = { min: 0.3, max: 4 } as const;

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

interface Punto {
  x: number;
  y: number;
}

export const VisorZoom = forwardRef<VisorZoomHandle, VisorZoomProps>(
  function VisorZoom(
    {
      children,
      rotacion = 0,
      filtro,
      onZoomChange,
      minZoom = LIMITES_ZOOM_VISOR.min,
      maxZoom = LIMITES_ZOOM_VISOR.max,
      fitKey,
      className,
      ariaLabel,
    },
    ref,
  ) {
    const contRef = useRef<HTMLDivElement>(null);
    const contenidoRef = useRef<HTMLDivElement>(null);
    // Escala y offset en refs (gestos fluidos sin re-render por evento) +
    // state espejo para el render del transform (máx 1 setState por frame).
    const escalaRef = useRef(1);
    const offsetRef = useRef<Punto>({ x: 0, y: 0 });
    const ajusteRef = useRef(1);
    const rafRef = useRef(0);
    const [transform, setTransform] = useState({ x: 0, y: 0, s: 1 });

    // ── Píntame el transform (rAF coalescing — 1 por frame) ────────────────
    const pintar = useCallback(() => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setTransform({
          x: offsetRef.current.x,
          y: offsetRef.current.y,
          s: escalaRef.current,
        });
        onZoomChange?.(escalaRef.current);
      });
    }, [onZoomChange]);

    /** Offsets al límite: si el contenido (visual) cabe → centrado; si no,
     * el borde nunca deja un vacío mayor que el propio contenido. */
    const limitar = useCallback(
      (escala: number, off: Punto): Punto => {
        const cont = contRef.current;
        const contenido = contenidoRef.current;
        if (!cont || !contenido) return off;
        const girado = rotacion % 180 !== 0;
        const w = girado ? contenido.offsetHeight : contenido.offsetWidth;
        const h = girado ? contenido.offsetWidth : contenido.offsetHeight;
        const cw = cont.clientWidth;
        const ch = cont.clientHeight;
        const maxCx = Math.max(0, (w * escala - cw) / 2);
        const maxCy = Math.max(0, (h * escala - ch) / 2);
        return {
          x: clamp(off.x, -maxCx, maxCx),
          y: clamp(off.y, -maxCy, maxCy),
        };
      },
      [rotacion],
    );

    /** Escala de ajuste (contain) para el contenido actual + rotación. */
    const medirAjuste = useCallback((): number => {
      const cont = contRef.current;
      const contenido = contenidoRef.current;
      if (!cont || !contenido) return 1;
      const w = contenido.offsetWidth;
      const h = contenido.offsetHeight;
      if (!w || !h) return 1;
      const girado = rotacion % 180 !== 0;
      const wv = girado ? h : w;
      const hv = girado ? w : h;
      const cw = Math.max(0, cont.clientWidth - PAD_AJUSTE * 2);
      const ch = Math.max(0, cont.clientHeight - PAD_AJUSTE * 2);
      if (!cw || !ch) return 1;
      return clamp(Math.min(cw / wv, ch / hv), minZoom, maxZoom);
    }, [rotacion, minZoom, maxZoom]);

    const ajustar = useCallback(() => {
      const escala = medirAjuste();
      ajusteRef.current = escala;
      escalaRef.current = escala;
      offsetRef.current = { x: 0, y: 0 };
      pintar();
    }, [medirAjuste, pintar]);

    /** Zoom anclado a un punto del contenedor (rueda / pellizco / doble toque):
     * el contenido bajo el ancla NO se mueve — offset' = (a−C)(1−s'/s) + o·s'/s
     * (la rotación gira alrededor del mismo centro → fórmula idéntica). */
    const zoomEnPunto = useCallback(
      (ancla: Punto, factor: number) => {
        const cont = contRef.current;
        if (!cont) return;
        const previa = escalaRef.current;
        const nueva = clamp(previa * factor, minZoom, maxZoom);
        if (nueva === previa || !Number.isFinite(nueva) || nueva <= 0) return;
        const cx = cont.clientWidth / 2;
        const cy = cont.clientHeight / 2;
        const k = nueva / previa;
        offsetRef.current = limitar(nueva, {
          x: (ancla.x - cx) * (1 - k) + offsetRef.current.x * k,
          y: (ancla.y - cy) * (1 - k) + offsetRef.current.y * k,
        });
        escalaRef.current = nueva;
        pintar();
      },
      [minZoom, maxZoom, limitar, pintar],
    );

    const centroLienzo = (): Punto => {
      const cont = contRef.current;
      return {
        x: cont ? cont.clientWidth / 2 : 0,
        y: cont ? cont.clientHeight / 2 : 0,
      };
    };

    // ── API imperativa (toolbar del padre) ─────────────────────────────────
    useImperativeHandle(ref, () => ({
      acercar: () => zoomEnPunto(centroLienzo(), PASO_BOTON),
      alejar: () => zoomEnPunto(centroLienzo(), 1 / PASO_BOTON),
      ajustar,
      fijarZoom: (escala: number) =>
        zoomEnPunto(
          centroLienzo(),
          clamp(escala, minZoom, maxZoom) / escalaRef.current,
        ),
    }));

    // ── Ajuste al montar / cambiar rotación / fitKey ───────────────────────
    // (ajustar cambia con rotacion → el effect re-dispara al rotar)
    useLayoutEffect(() => {
      ajustar();
    }, [ajustar, fitKey]);

    // Re-ajuste si el contenedor cambia de tamaño (pantalla completa, resize).
    useEffect(() => {
      const cont = contRef.current;
      if (!cont || typeof ResizeObserver === "undefined") return;
      let primer = true; // el primer aviso ya lo cubre el layout effect
      const obs = new ResizeObserver(() => {
        if (primer) {
          primer = false;
          return;
        }
        ajustar();
      });
      obs.observe(cont);
      return () => obs.disconnect();
    }, [ajustar]);

    // Reporte inicial de escala (el padre muestra el % real).
    useEffect(() => {
      onZoomChange?.(escalaRef.current);
    }, [onZoomChange]);

    // ── RUEDA DEL MOUSE → zoom (ancla en el cursor) ────────────────────────
    useEffect(() => {
      const cont = contRef.current;
      if (!cont) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault(); // la rueda es ZOOM, no scroll (pedido del dueño)
        const rect = cont.getBoundingClientRect();
        const dy =
          e.deltaMode === 1
            ? e.deltaY * 33
            : e.deltaMode === 2
              ? e.deltaY * 300
              : e.deltaY;
        // Trackpad-pinch (ctrlKey) viene con deltas chicos — coeficiente mayor.
        const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022));
        zoomEnPunto(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          factor,
        );
      };
      cont.addEventListener("wheel", onWheel, { passive: false });
      return () => cont.removeEventListener("wheel", onWheel);
    }, [zoomEnPunto]);

    // ── PUNTEROS: 1 = arrastrar · 2 = pellizco ─────────────────────────────
    const punterosRef = useRef(new Map<number, Punto>());
    const pinzaRef = useRef<{ dist: number; mid: Punto } | null>(null);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      punterosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Captura para seguir el gesto fuera del lienzo — fail-safe: con
      // pointerIds sintéticos (pruebas/automation) el navegador puede
      // rechazarla (NotFoundError) y JAMÁS debe abortar el gesto.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura el gesto sigue dentro del lienzo — suficiente */
      }
      if (punterosRef.current.size === 2) {
        const [a, b] = [...punterosRef.current.values()];
        pinzaRef.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const activos = punterosRef.current;
      const previo = activos.get(e.pointerId);
      if (!previo) return; // puntero ajeno (hover, segundo botón…)
      const actual: Punto = { x: e.clientX, y: e.clientY };

      // ── PELLIZCO (2 punteros) ────────────────────────────────────────────
      if (activos.size >= 2 && pinzaRef.current) {
        activos.set(e.pointerId, actual);
        const [a, b] = [...activos.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const prev = pinzaRef.current;
        const cont = contRef.current;
        if (cont && dist > 0 && prev.dist > 0) {
          // 1) zoom anclado en el punto medio actual
          const rect = cont.getBoundingClientRect();
          zoomEnPunto({ x: mid.x - rect.left, y: mid.y - rect.top }, dist / prev.dist);
          // 2) arrastre por el movimiento del punto medio (post-zoom)
          offsetRef.current = limitar(escalaRef.current, {
            x: offsetRef.current.x + (mid.x - prev.mid.x),
            y: offsetRef.current.y + (mid.y - prev.mid.y),
          });
          pintar();
        }
        pinzaRef.current = { dist, mid };
        return;
      }

      // ── ARRASTRE (1 puntero: dedo o mouse presionado) ────────────────────
      if (activos.size === 1) {
        activos.set(e.pointerId, actual);
        const dx = actual.x - previo.x;
        const dy = actual.y - previo.y;
        if (dx || dy) {
          offsetRef.current = limitar(escalaRef.current, {
            x: offsetRef.current.x + dx,
            y: offsetRef.current.y + dy,
          });
          pintar();
        }
      }
    };

    const soltarPuntero = (e: React.PointerEvent<HTMLDivElement>) => {
      punterosRef.current.delete(e.pointerId);
      if (punterosRef.current.size < 2) pinzaRef.current = null;
    };

    // Doble clic / doble toque: ajustar ↔ acercar (ancla en el punto).
    const onDobleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const cont = contRef.current;
      if (!cont) return;
      const rect = cont.getBoundingClientRect();
      const ancla = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (escalaRef.current > ajusteRef.current * 1.15) {
        escalaRef.current = ajusteRef.current;
        offsetRef.current = { x: 0, y: 0 };
        pintar();
      } else {
        zoomEnPunto(ancla, MULT_DOBLE_TOQUE);
      }
    };

    return (
      <div
        ref={contRef}
        role="group"
        aria-label={ariaLabel}
        className={cn(
          "relative select-none overflow-hidden",
          // El navegador no interfiere: dedos = zoom/arrastre del documento.
          "touch-none",
          // Cursor de agarre — el documento se desplaza con el mouse.
          "cursor-grab active:cursor-grabbing",
          className,
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={soltarPuntero}
        onPointerCancel={soltarPuntero}
        onDoubleClick={onDobleClick}
      >
        {/* Escena centrada — el transform vive en el wrapper interno para que
            el contenido conserve su tamaño de layout (base del ajuste). */}
        <div className="flex h-full w-full items-center justify-center">
          <div
            ref={contenidoRef}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.s}) rotate(${rotacion}deg)`,
              filter: filtro,
              willChange: "transform",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);
