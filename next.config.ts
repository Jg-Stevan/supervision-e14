import type { NextConfig } from "next";

// KIT INSTRUCCIONES-sup-e14-pages-v1 (§3 T3 / D8): export estático para
// GitHub Pages. El basePath viene por env (Pages sirve en subpath
// /supervision-e14/); SIN el env (dev/build local) queda en raíz — el dev
// local NO cambia (regla §0-6). Sin backend: mock repository intacto.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  // El módulo digitalizador trasplantado (masiva) fue construido con
  // StrictMode OFF en su repo origen (digielect14): doble montaje dispara
  // doble pre-warm OCR/worker — se conserva su premisa (D27).
  reactStrictMode: false,
  // Mismo patrón del repo origen: orígenes de dev permitidos (previews).
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
};

export default nextConfig;
