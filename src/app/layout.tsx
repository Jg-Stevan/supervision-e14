import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// FONTS: el layout original usa next/font/google (Hanken Grotesk +
// JetBrains Mono). En este entorno de preview no hay acceso a Google
// Fonts, así que las variables --font-hanken / --font-jetbrains se
// declaran con fallbacks de sistema EQUIVALENTES en globals.css
// (mismos nombres de variable — cero cambios en los consumidores).
// Al volver al repo real, restaurar el import de next/font/google.

export const metadata: Metadata = {
  title: "Sistema de Monitoreo Electoral E-14",
  description: "Módulo de monitoreo y auditoría electoral E-14",
};

// SEC-3 (INFORME-PRUEBAS-Y-AUDITORIA): GitHub Pages NO aplica public/_headers
// (eso es de Cloudflare Pages), así que la CSP viaja también como <meta>.
// Espejo EXACTO de la CSP de _headers — ver la justificación de cada
// apertura (unsafe-inline de Next, wasm-unsafe-eval del motor, blob:/data:)
// en public/_headers. frame-ancestors se OMITE: en <meta> es ignorado por
// especificación (lo cubre _headers en Cloudflare; en GH Pages el sitio no
// se embebe por diseño del export estático).
//
// ÚNICA diferencia con _headers: 'unsafe-eval' en script-src SOLO en
// desarrollo — React dev-mode lo necesita para sus funciones de depuración
// («eval() is not supported… React requires eval() in development mode»,
// issue permanente del DevTools) y el propio React confirma que NUNCA usa
// eval() en producción, donde la CSP queda idéntica a la de _headers.
const CSP_META = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  } 'wasm-unsafe-eval' blob:`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // KIT e14-ocr-nativo-v1: el sidecar loopback (flag `ocrNativoUrl`) es un
  // fetch outbound a 127.0.0.1 — la CSP solo abre BUCLE LOCAL (nunca una
  // host externa: flags-schema ya restringe el valor a 127.0.0.1/localhost).
  // 0.2.2 (remediación): el hub del puente entra en connect-src como origen
  // FIJO (no un string arbitrario — no es canal de exfiltración): el sondeo
  // autenticado GET /actas del panel puede apuntar a producción con el
  // token de lectura (Configuración → Token de lectura del hub).
  "connect-src 'self' data: blob: http://127.0.0.1:* http://localhost:* https://e14-puente.julistevan02.workers.dev",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// KIT perf/coi-sw-v1 (P0-1 del REPORTE-perfil-medio-rendimiento-v1) —
// registro temprano del Service Worker de aislamiento (public/coi-serviceworker.js):
// GH Pages no permite cabeceras COOP/COEP → sin SW, crossOriginIsolated=false
// y el OCR corre mono-hilo (numThreads=1 en rapidocr.ts). Con el SW activo,
// la página nace aislada → SAB → hilos WASM reales (ocrThreads=4 vivo) +
// caché persistente de /vendor//models//wasm//scanner/ (P0-2.3).
// Solo corre cuando NO hay aislamiento (host ya COOP/COEP → no-op) y
// recarga UNA vez (guard sessionStorage) tras la primera activación.
// Kill-switch del dueño: eliminar este <script> → byte-idéntico a hoy.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SW_REGISTRO = `(function(){try{
// KILL-SWITCH + auto-reparación: si el runtime wasm no soportó COI en una
// visita previa (rapidocr escribe e14-coi-sw=off y recarga), el SW NO se
// registra, se des-registra cualquier residuo y la página vuelve al camino
// mono-hilo de siempre (byte-idéntico a sin SW).
if(localStorage.getItem("e14-coi-sw")==="off"){
sessionStorage.removeItem("coi-sw-recarga");
if(navigator.serviceWorker)navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();})}).catch(function(){});
return;
}
if(window.crossOriginIsolated){sessionStorage.removeItem("coi-sw-recarga");return;}
if(!("serviceWorker" in navigator))return;
var base=${JSON.stringify(BASE_PATH || "/")};
navigator.serviceWorker.register(base+"coi-serviceworker.js",{scope:base}).then(function(reg){
function recarga(){if(!sessionStorage.getItem("coi-sw-recarga")){sessionStorage.setItem("coi-sw-recarga","1");location.reload();}}
if(reg.active)recarga();
reg.addEventListener("updatefound",function(){var nw=reg.installing;if(!nw)return;
nw.addEventListener("statechange",function(){if(nw.state==="activated")recarga();});});
}).catch(function(){});
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="antialiased">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP_META} />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTRO }} />
      </head>
      <body className="min-h-screen bg-background font-sans">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
