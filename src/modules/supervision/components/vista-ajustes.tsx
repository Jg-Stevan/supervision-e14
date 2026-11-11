"use client";

/**
 * VISTA "Configuración" (0.2/H-2 + 0.6 — plan de remediación).
 *
 * Dos tarjetas, lenguaje de operador:
 *  · TOKEN DE LECTURA DEL HUB — el supervisor pega aquí la clave de
 *    lectura del hub del puente (`GET /actas` autenticado, 0.2). Vive SOLO
 *    en el localStorage de ESTE navegador (`e14-token-lectura`): jamás en
 *    el bundle ni en el repo (H-2). La LAN local (hub-local.mjs) no pide
 *    token — el header solo sale contra orígenes NO locales.
 *  · PRIVACIDAD Y RETENCIÓN — el aviso mínimo legal (0.6, fase 2 §9.2):
 *    qué contiene el panel, de dónde viene, cuánto se retiene (30 días o
 *    antes si hay confirmación oficial), quién responde y cómo pedir
 *    expurgo. Breve y visible, sin legalese.
 *
 * Estilo del kit SUP-1: superficies oscuras, bordes 1px (sin sombras),
 * label-caps para títulos, radius 4px. La lectura de localStorage entra por
 * `useSyncExternalStore` (snapshot de servidor vacío): hydration-safe con el
 * export estático y sin `setState` dentro de un efecto.
 */
import { useSyncExternalStore, useState } from "react";
import { Eraser, EyeOff, KeyRound, Lock, ScrollText, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  borrarTokenLectura,
  fijarTokenLectura,
  tokenLectura,
} from "../lib/token-lectura";

/** Evento local para que la vista relea el token tras guardarlo o quitarlo
 *  (el `storage` solo avisa a las OTRAS pestañas). */
const EVENTO_TOKEN = "e14-token-lectura-cambio";

function suscribirToken(avisar: () => void): () => void {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO_TOKEN, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO_TOKEN, avisar);
  };
}

// ── C-13 — clave ADMIN del hub local (expurgo DELETE autenticado) ──────────
// Misma disciplina H-2 que el token de lectura: vive SOLO en el localStorage
// de este navegador (`e14-hub-admin`), jamás en el bundle ni en el repo. La
// clave la imprime `hub-local.mjs` en su consola al arrancar.

const CLAVE_ADMIN_LS = "e14-hub-admin";
const EVENTO_ADMIN = "e14-hub-admin-cambio";

function claveAdmin(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CLAVE_ADMIN_LS) ?? "";
  } catch {
    return "";
  }
}

function fijarClaveAdmin(valor: string): boolean {
  try {
    window.localStorage.setItem(CLAVE_ADMIN_LS, valor.trim());
    window.dispatchEvent(new Event(EVENTO_ADMIN));
    return true;
  } catch {
    return false;
  }
}

function borrarClaveAdmin(): void {
  try {
    window.localStorage.removeItem(CLAVE_ADMIN_LS);
    window.dispatchEvent(new Event(EVENTO_ADMIN));
  } catch {
    /* nada que borrar */
  }
}

function suscribirAdmin(avisar: () => void): () => void {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO_ADMIN, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO_ADMIN, avisar);
  };
}

export function VistaAjustes() {
  // Lectura del token por store externo (useSyncExternalStore): el snapshot
  // del servidor es "" y el de hidratación `montado=false`, así el export
  // estático no cambia el HTML inicial ni dispara renders en cascada.
  const token = useSyncExternalStore(suscribirToken, tokenLectura, () => "");
  const montado = useSyncExternalStore(suscribirToken, () => true, () => false);
  const estado = montado
    ? { configurado: token.length > 0, cola: token.slice(-4) }
    : null;
  const [valor, setValor] = useState("");

  const guardar = () => {
    const limpio = valor.trim();
    if (!limpio) {
      toast.error("Pega el token antes de guardar");
      return;
    }
    fijarTokenLectura(limpio);
    const persistido = tokenLectura();
    if (!persistido) {
      // localStorage bloqueado (modo privado): el token NO sobrevive a la
      // recarga — honesto antes que un «guardado» falso.
      toast.error(
        "No se pudo persistir el token (¿modo privado?): no sobrevivirá a la recarga"
      );
      return;
    }
    setValor("");
    window.dispatchEvent(new Event(EVENTO_TOKEN));
    toast.success("Token de lectura guardado en este navegador");
  };

  const quitar = () => {
    borrarTokenLectura();
    setValor("");
    window.dispatchEvent(new Event(EVENTO_TOKEN));
    toast.success("Token de lectura quitado");
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Cabecera de la vista */}
      <div>
        <h2 className="headline-md">CONFIGURACIÓN</h2>
        <p className="body-md mt-0.5 text-muted-foreground">
          Ajustes locales del panel — cada cosa vive en ESTE navegador, sin
          servidor de configuración (export estático)
        </p>
      </div>

      {/* ── Token de lectura del hub (0.2/H-2) ─────────────────────────── */}
      <section className="rounded-[4px] border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <KeyRound className="size-4 shrink-0 text-(--primary)" aria-hidden />
          <h3 className="label-caps text-foreground">
            Token de lectura del hub
          </h3>
          <span className="body-md text-muted-foreground">
            — credencial del sondeo <span className="font-data">GET /actas</span>{" "}
            cuando el hub NO es local (0.2)
          </span>
        </header>
        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "label-caps inline-block rounded-[4px] border px-1.5 py-0.5",
                estado === null
                  ? "border-border text-muted-foreground"
                  : estado.configurado
                    ? "border-(--success) text-(--success)"
                    : "border-(--warning) text-(--warning)"
              )}
            >
              {estado === null
                ? "LEYENDO…"
                : estado.configurado
                  ? `CONFIGURADO · TERMINA EN ${estado.cola}`
                  : "SIN TOKEN"}
            </span>
            <span className="body-md text-muted-foreground">
              El token vive solo en el <span className="font-data">localStorage</span>{" "}
              de este navegador — jamás viaja en el bundle ni en el repo.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="token-lectura">
              Token de lectura del hub
            </label>
            <input
              id="token-lectura"
              type="password"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="pega aquí el token de lectura"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="font-data h-10 min-w-0 flex-1 rounded-[4px] border border-border bg-(--input) px-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
            />
            <button
              type="button"
              onClick={guardar}
              className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-(--primary)/40 bg-card px-3 text-(--primary) hover:bg-(--accent) focus-visible:outline-2 focus-visible:outline-(--primary)"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={quitar}
              disabled={estado !== null && !estado.configurado}
              className="label-caps inline-flex h-10 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary) disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="size-4" aria-hidden />
              Quitar
            </button>
          </div>

          <p className="body-md text-muted-foreground">
            ¿Cuándo se usa? El sondeo manda{" "}
            <span className="font-data">Authorization: Bearer …</span> SOLO
            contra un hub NO local. En la red local (
            <span className="font-data">hub-local.mjs</span>, LAN) no hace
            falta token y no se envía ninguno. Si el hub responde{" "}
            <span className="font-data">401</span>, la tarjeta «Hub local»
            de Recepción lo muestra con el aviso de configurarlo aquí.
          </p>
        </div>
      </section>

      {/* ── Privacidad y retención (0.6 — fase 2 §9.2) ─────────────────── */}
      <section className="rounded-[4px] border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <ScrollText
            className="size-4 shrink-0 text-(--primary)"
            aria-hidden
          />
          <h3 className="label-caps text-foreground">Privacidad y retención</h3>
          <span className="body-md text-muted-foreground">
            — qué maneja este panel, en lenguaje de operador
          </span>
        </header>
        <div className="space-y-3 px-4 py-4">
          <p className="body-md text-foreground">
            <span className="font-semibold">Qué contiene.</span> Actas E-14:
            la foto PROCESADA del formulario y sus metadatos de ubicación
            (país/zona/puesto/mesa, formulario, encabezado impreso, barcode y
            score OCR). El panel NO lee votos: nunca muestra ni interpreta
            cifras de votación, y no maneja nombres ni cédulas de jurados.
          </p>
          <p className="body-md text-foreground">
            <span className="font-semibold">De dónde viene.</span> Del hub
            del puente: el digitalizador del puesto envía cada acta (
            <span className="font-data">POST /actas</span>, firmada) y este
            panel la consulta sondeando{" "}
            <span className="font-data">GET /actas</span> con el token de
            lectura de arriba.
          </p>
          <p className="body-md text-foreground">
            <span className="font-semibold">Cuánto se retiene.</span> La
            política del hub es <span className="font-semibold">30 días</span>{" "}
            desde la jornada, o ANTES si hay confirmación oficial de
            recepción del material. Cumplido eso, las fotos se expurgan del
            hub (puede quedar solo hash + metadatos).
          </p>
          <p className="body-md text-foreground">
            <span className="font-semibold">Quién responde.</span> El
            responsable del tratamiento es quien opera el hub y este panel.
            Las fotos pre-publicación (firmas y cédulas impresas en el
            papel) son lo sensible: trátalas como material restringido
            mientras existan.
          </p>
          <p className="body-md text-foreground">
            <span className="font-semibold">Cómo pedir el expurgo.</span>{" "}
            Solicítalo al operador del hub: se aplica un{" "}
            <span className="font-data">DELETE</span> autenticado contra el
            hub (por hash de acta o por jornada), con registro del evento.
            Retiro inmediato, no espera a los 30 días.
          </p>
          <p className="body-md flex items-start gap-2 text-muted-foreground">
            <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            Desde D35 (2026-11-08) este repositorio NO contiene fotos reales
            de actas: el kit de práctica quedó metadata-only y el visor
            muestra el placeholder «foto retirada (D35)» o el documento
            sintético.
          </p>
          <p className="body-md flex items-start gap-2 text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            Detalle operativo y línea de respuesta a incidentes:{" "}
            <span className="font-data">SECURITY.md</span> del repositorio.
          </p>
        </div>
      </section>
    </div>
  );
}
