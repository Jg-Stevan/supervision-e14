/**
 * KIT e14-observabilidad-v1 (A1-C3/C4) — breadcrumbs: el ring buffer 30 en
 * memoria del «cómo llegamos al fallo».
 *
 * · registrarBreadcrumb(b) — push público (ring FIFO, max 30).
 * · obtenerBreadcrumbs() — snapshot del ring (los últimos 30, en orden
 *   cronológico) — lo consumen logger/captura al construir ErrorEvento.
 * · registrarVista(v) — transición de vista (la engancha uso.ts vía
 *   suscripción al store — SIN editar componentes).
 * · iniciarBreadcrumbs() — idempotente: listener global `click` en
 *   capture+passive que extrae del target el `closest("[aria-label],
 *   [data-accion]")` → detalle = ese label/acción ("clic" si no hay).
 *   JAMÁS textContent del acta (cero PII, README-KITS §2.5).
 *
 * Ring en MEMORIA (muere con la sesión): los breadcrumbs solo valen como
 * contexto INMEDIATO de un error — persistirlos aparte no aporta (el error
 * ya viaja con los últimos 30 adjuntos).
 */
import type { Breadcrumb } from "./tipos";

const MAX_BREADCRUMBS = 30;

let ring: Breadcrumb[] = [];

/** Push al ring (FIFO 30). Nunca lanza (regla de oro §2.4). */
export function registrarBreadcrumb(b: Omit<Breadcrumb, "t">): void {
  try {
    ring.push({ ...b, t: Date.now() });
    if (ring.length > MAX_BREADCRUMBS) ring = ring.slice(-MAX_BREADCRUMBS);
  } catch {
    /* silencioso */
  }
}

/** Transición de vista — tipo "vista" del contrato (detalle = nombre de
 *  vista; jamás contenido). La consume uso.ts (C4) en su suscripción. */
export function registrarVista(vista: string): void {
  registrarBreadcrumb({ tipo: "vista", detalle: vista });
}

/** Snapshot cronológico del ring (copia — el ring sigue vivo). */
export function obtenerBreadcrumbs(): Breadcrumb[] {
  return [...ring];
}

/** detalle de un click: aria-label o data-accion del elemento (o su
 *  ancestro) — PURA y testeable con fakes; null honesto si no hay. */
export function detalleDeTarget(
  target: { closest: (sel: string) => { getAttribute(n: string): string | null } | null } | null,
): string | null {
  try {
    const el = target?.closest("[aria-label],[data-accion]") ?? null;
    if (!el) return null;
    return el.getAttribute("aria-label") ?? el.getAttribute("data-accion");
  } catch {
    return null;
  }
}

let clickInstalado = false;

/** Listener global de clicks (idempotente): capture+passive — el detalle
 *  sale del aria-label/data-accion (clic anónimo si no hay ninguno). */
export function iniciarBreadcrumbs(): void {
  try {
    if (clickInstalado || typeof window === "undefined") return;
    clickInstalado = true;
    const onClic = (e: MouseEvent) => {
      const detalle = detalleDeTarget(e.target as HTMLInputElement | null);
      registrarBreadcrumb({ tipo: "click", detalle: detalle ?? "clic" });
    };
    window.addEventListener("click", onClic, { capture: true, passive: true });
  } catch {
    /* silencioso — el rastreo jamás rompe la app */
  }
}
