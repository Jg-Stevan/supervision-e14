import type { NextConfig } from "next";

/**
 * Configuración DUAL (patrón del repo hermano digielect14):
 *
 *  · Dev / servidor local: `bun run dev` → standalone (Node).
 *  · Cloudflare Pages (estático): `BUILD_STATIC=1 NEXT_PUBLIC_BASE_PATH=
 *    bunx next build` → `./out/` — el dashboard vive en la raíz del
 *    subdominio (supervision-e14.pages.dev) y NO tiene backend Node:
 *    el productor remoto (puente-remoto.ts) habla DIRECTO con el hub
 *    `e14-puente` (workers.dev) vía CORS reflect del propio hub.
 */
const isStatic = process.env.BUILD_STATIC === "1";

const nextConfig: NextConfig = {
  ...(isStatic
    ? { output: "export" as const, trailingSlash: true }
    : { output: "standalone" as const }),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: { unoptimized: true },
};

export default nextConfig;
