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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="antialiased">
      <body className="min-h-screen bg-background font-sans">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
