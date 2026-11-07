/**
 * Ítem 3.6 (costura ④): base en el paquete (sin React) + el
 * ErrorBoundaryObs de ESTA app (la única pieza React de obs).
 */
import { configurarObsBase } from "@jg-stevan/scanner-core/obs-base/config";
import { leerPolitica } from "./politica";
import { emitirError } from "@jg-stevan/scanner-core/obs-base/captura";

configurarObsBase({
  politicaMetadatos: () => {
    try {
      return leerPolitica().metadatos;
    } catch {
      return true;
    }
  },
});

export * from "@jg-stevan/scanner-core/obs-base/captura";
export { emitirError };

// ─── ErrorBoundaryObs (contrato §4.3 — clase React de ESTA app) ─────────
import { createElement, Component } from "react";
import type * as React from "react";

interface EstadoBoundary {
  fallo: Error | null;
}

export class ErrorBoundaryObs extends Component<{ children: React.ReactNode }, EstadoBoundary> {
  state: EstadoBoundary = { fallo: null };

  static getDerivedStateFromError(error: Error): EstadoBoundary {
    return { fallo: error };
  }

  componentDidCatch(error: Error): void {
    void emitirError(error, "ErrorBoundary");
  }

  render(): React.ReactNode {
    const { fallo } = this.state;
    if (!fallo) return this.props.children;
    return createElement(
      "div",
      {
        role: "alert",
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          color: "#e2e8f0",
          background: "#090d12",
        },
      },
      createElement("p", { style: { fontWeight: 600 } }, "La vista falló."),
      createElement(
        "p",
        { style: { opacity: 0.7, fontSize: 14 } },
        "El fallo quedó registrado en el dispositivo. Recarga para continuar.",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => window.location.reload(),
          style: {
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#e2e8f0",
            cursor: "pointer",
          },
        },
        "Recargar",
      ),
    );
  }
}
