"use client";

import { CheckCircle2, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { FormularioTipo } from "../../domain/acta";

/**
 * PANEL DE VERIFICACIÓN DE IDENTIFICADOR (kit stitch-visor-actas-v1 —
 * diseño Stitch): caja hundida con el identificador/código impreso del
 * formulario y los campos técnicos PAÍS · ZONA · PUESTO · MESA ·
 * ORIGEN · PÁGINA.
 *
 * - "envio-automatico": cabecera fija `✓ ENVIO AUTOMATICO` (el acta se
 *   publica sola; la decisión del supervisor es rechazar o no tocar).
 * - "ingreso-manual": `INGRESO MANUAL DE DATOS` — plegable (Collapsible,
 *   abierto por defecto como en el diseño) con chevron.
 *
 * ORIGEN y PÁGINA son operativos: cambian el formulario/página del visor.
 * El resto de campos muestran el encabezado impreso del acta (verbatim —
 * se muestra, no se interpreta, §0-1).
 */

const ETIQUETA_ORIGEN: Record<FormularioTipo, string> = {
  DELEGADOS: "Delegados",
  TRANSMISION: "Transmisión",
};

const CLASE_INPUT =
  "w-full rounded border border-brand-border bg-[#060a09] px-2 py-1.5 font-mono text-xs text-gray-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

const CLASE_LABEL =
  "mb-1 block font-mono text-[10px] font-bold uppercase tracking-wide text-gray-400";

export function PanelVerificacion({
  modo,
  identificador,
  pais,
  zona,
  puesto,
  mesa,
  tipo,
  onCambiarTipo,
  pagina,
  totalPaginas,
  onCambiarPagina,
  inputId,
}: {
  modo: "envio-automatico" | "ingreso-manual";
  /** Identificador impreso (barcode o etiqueta) del formulario visible. */
  identificador: string;
  pais: string;
  zona: string;
  puesto: string;
  mesa: string;
  tipo: FormularioTipo;
  onCambiarTipo: (tipo: FormularioTipo) => void;
  pagina: number;
  totalPaginas: number;
  onCambiarPagina: (pagina: number) => void;
  /** id único del input (por si el panel aparece dos veces — móvil). */
  inputId: string;
}) {
  const esAutomatico = modo === "envio-automatico";

  const cabecera = (
    <div className="flex items-center gap-2">
      {esAutomatico ? (
        <CheckCircle2 className="size-4 text-emerald-400" aria-hidden />
      ) : (
        <PencilLine className="size-4 text-emerald-400" aria-hidden />
      )}
      <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-200">
        {esAutomatico ? "Envio automatico" : "Ingreso manual de datos"}
      </span>
    </div>
  );

  const cuerpo = (
    <div className="space-y-3 font-mono text-xs">
      {/* VERIFICACIÓN DE IDENTIFICADOR / CÓDIGO */}
      <div className="mb-2">
        <label
          htmlFor={inputId}
          className="mb-1 block text-center font-mono text-[10px] font-bold uppercase tracking-wide text-gray-400"
        >
          Verificación de identificador / código
        </label>
        <div className="flex items-center rounded border border-brand-border bg-[#060a09] px-2 py-1.5 focus-within:border-emerald-500">
          <input
            id={inputId}
            type="text"
            defaultValue={`X   ${identificador}   X`}
            readOnly
            aria-label="Identificador impreso del formulario"
            className="w-full border-0 bg-transparent p-0 text-center font-mono text-sm font-bold tracking-widest text-emerald-400 focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* PAÍS · ZONA */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${inputId}-pais`} className={CLASE_LABEL}>
            País
          </label>
          <select
            id={`${inputId}-pais`}
            defaultValue={pais}
            className={CLASE_INPUT}
            onChange={() => {
              /* catálogo del acta — solo lectura operativa */
            }}
          >
            <option>{pais}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${inputId}-zona`} className={CLASE_LABEL}>
            Zona
          </label>
          <input
            id={`${inputId}-zona`}
            type="text"
            value={zona}
            readOnly
            className={CLASE_INPUT}
          />
        </div>
      </div>

      {/* PUESTO · MESA */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${inputId}-puesto`} className={CLASE_LABEL}>
            Puesto
          </label>
          <input
            id={`${inputId}-puesto`}
            type="text"
            value={puesto}
            readOnly
            className={CLASE_INPUT}
          />
        </div>
        <div>
          <label htmlFor={`${inputId}-mesa`} className={CLASE_LABEL}>
            Mesa
          </label>
          <input
            id={`${inputId}-mesa`}
            type="text"
            value={mesa}
            readOnly
            className={CLASE_INPUT}
          />
        </div>
      </div>

      {/* ORIGEN · PÁGINA — operativos */}
      <div className="grid grid-cols-2 gap-2 border-t border-brand-border/40 pt-1">
        <div>
          <label htmlFor={`${inputId}-origen`} className={CLASE_LABEL}>
            Origen
          </label>
          <select
            id={`${inputId}-origen`}
            value={ETIQUETA_ORIGEN[tipo]}
            onChange={(e) => {
              const valor = e.target.value;
              onCambiarTipo(
                valor === "Transmisión" ? "TRANSMISION" : "DELEGADOS"
              );
            }}
            className={CLASE_INPUT}
          >
            <option>Delegados</option>
            <option>Transmisión</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${inputId}-pagina`} className={CLASE_LABEL}>
            Página
          </label>
          <select
            id={`${inputId}-pagina`}
            value={`Página ${pagina}`}
            onChange={(e) => {
              const numero = Number(e.target.value.replace("Página ", ""));
              if (!Number.isNaN(numero)) onCambiarPagina(numero);
            }}
            className={CLASE_INPUT}
          >
            {Array.from({ length: Math.max(1, totalPaginas) }, (_, i) => (
              <option key={i + 1}>Página {i + 1}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="border-t border-brand-border/40 pt-1" />
    </div>
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded border border-brand-border bg-[#080d0b]",
        esAutomatico ? "mb-6" : ""
      )}
      data-purpose="manual-data-entry-accordion"
    >
      {esAutomatico ? (
        <>
          <div className="flex items-center justify-between border-b border-brand-border/60 bg-[#0d1613]/90 p-3 select-none">
            {cabecera}
          </div>
          <div className="p-3.5">{cuerpo}</div>
        </>
      ) : (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between border-b border-brand-border/60 bg-[#0d1613]/90 p-3 transition-colors list-none select-none hover:bg-[#12201c] focus-visible:outline-2 focus-visible:outline-(--primary)">
            {cabecera}
            <ChevronDown
              className="size-4 text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="p-3.5">{cuerpo}</CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
