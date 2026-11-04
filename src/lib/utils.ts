import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * R1 — utilidad `cn` estándar de shadcn/ui.
 *
 * components.json apunta a `@/lib/utils`; hasta ahora el repo usaba el
 * paquete npm `cn` (sin tailwind-merge), por lo que el primer
 * `shadcn add` habría generado imports rotos. Esta es la firma canónica:
 * clsx (condicionales) + twMerge (resuelve colisiones de clases Tailwind).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
