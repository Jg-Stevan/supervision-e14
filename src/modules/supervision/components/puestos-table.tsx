"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Eye, Funnel } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";
import type { FiltrosPuestos, Mesa, Puesto } from "../domain/types";
import {
  minutosDeReloj,
  tramoDeMinutos,
  TRAMOS_TIEMPO,
  type SeveridadTiempo,
} from "../domain/tiempo-cierre";
import { colorDeEstado, StatusBadge } from "./status-badge";
import { MesasSubtable } from "./mesas-subtable";

const ENCABEZADOS = [
  "País",
  "Zona",
  "Puesto",
  "# Mesas",
  // D10 — abreviado (kit SUP-2 §2 lo permite): la cabecera completa
  // «Hora cierre Colombia» (158px) obligaba a scroll horizontal a 1440px.
  "Cierre COL",
  "Hora actual",
  "Tiempo",
  "E-14 deleg.",
  "E-14 transm.",
  "Estado global",
] as const;

/**
 * D43 — columnas FIJAS y alineadas (fix «no están alineadas ni ordenadas»):
 * con `table-layout: auto` el navegador reparte el sobrante según el
 * contenido de cada fila → País/Puesto se inflaban con espacio muerto,
 * las columnas de tiempo se comprimían y el ancho de UNA columna cambiaba
 * cuando los datos vivos cambiaban (las filas "bailaban"). Con
 * `table-fixed` + <colgroup> cada columna recibe un % estable del ancho
 * de la tabla y la alineación del encabezado y de las celdas queda
 * definida en UN solo lugar (`align`), sin divergencias.
 *
 * Los % se calibraron contra el contenido real más largo de cada columna
 * (p. ej. «83 - MIERCOLES ACCRA CONSULADO», badge «NO INICIADO» + 👁) y
 * suman exactamente 100. Bajo 1200px la tabla hace scroll horizontal en
 * su contenedor (min-w) en vez de aplastar columnas.
 */
const COLUMNAS = [
  { ancho: "15%", align: "left" }, // País
  { ancho: "4.5%", align: "left" }, // Zona
  { ancho: "18.5%", align: "left" }, // Puesto
  { ancho: "7%", align: "right" }, // # Mesas (encabezado Y celda a la derecha)
  { ancho: "8%", align: "left" }, // Cierre COL (con filtro de columna)
  { ancho: "8%", align: "left" }, // Hora actual
  { ancho: "7%", align: "left" }, // Tiempo (con filtro de columna)
  { ancho: "9.5%", align: "right" }, // E-14 deleg.
  { ancho: "9.5%", align: "right" }, // E-14 transm.
  { ancho: "13%", align: "right" }, // Estado global
] as const;

/** Índices de columnas con filtro en el encabezado. */
const INDICE_CIERRE = 4;
const INDICE_TIEMPO = 6;

/** Opción del filtro de columna (valor canónico + etiqueta visible). */
interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

/** Opciones del filtro «Tiempo» — los tramos canónicos del dominio. */
const OPCIONES_TIEMPO: OpcionFiltro[] = TRAMOS_TIEMPO.map((tramo) => ({
  valor: tramo.id,
  etiqueta: tramo.etiqueta,
}));

/**
 * Clases comunes de los RadioItems del menú de columna: el resaltado de
 * Radix (puntero o teclado) usa data-highlighted — el foco es siempre
 * visible y la navegación por flechas la resuelve el propio primitive.
 */
const CLASE_RADIO_ITEM =
  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-left outline-none data-[highlighted]:bg-(--accent)";

/**
 * Filtro de COLUMNA (pedido del dueño): embudo en el encabezado de
 * «Cierre COL» y «Tiempo». Abre un menú con «Todos» + las opciones del
 * conjunto del día; el activo queda marcado y el embudo se señaliza en
 * ámbar mientras haya filtro aplicado.
 *
 * R4-C7 (reporte 02-b M2) — era un menú a mano (role="menu" sobre un
 * Collapsible): no cerraba con Escape ni clic-fuera, sin aria-haspopup,
 * sin aria-checked real y sin flechas. Ahora es DropdownMenu de Radix
 * (ya en deps): Escape/clic-fuera/flechas/aria-expanded/aria-checked y
 * typeahead gratis, misma señalética visual (check con opacidad).
 */
function FiltroColumna({
  label,
  valor,
  opciones,
  onFiltro,
}: {
  label: string;
  valor: string | undefined;
  opciones: OpcionFiltro[];
  onFiltro: (valor: string | undefined) => void;
}) {
  const activa = valor !== undefined;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Filtrar por ${label}`}
          title={activa ? `Filtro activo por ${label}` : `Filtrar por ${label}`}
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-[2px] hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)",
            activa ? "text-(--warning)" : "text-muted-foreground"
          )}
        >
          <Funnel className="size-3" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[10rem] border border-border bg-popover font-data text-[13px] shadow-md"
        >
          <DropdownMenu.RadioGroup
            value={valor ?? "todos"}
            onValueChange={(nuevo) =>
              onFiltro(nuevo === "todos" ? undefined : nuevo)
            }
          >
            <DropdownMenu.RadioItem value="todos" className={CLASE_RADIO_ITEM}>
              <Check
                className={cn("size-3", !activa ? "opacity-100" : "opacity-0")}
                aria-hidden
              />
              Todos
            </DropdownMenu.RadioItem>
            {opciones.map((opcion) => (
              <DropdownMenu.RadioItem
                key={opcion.valor}
                value={opcion.valor}
                className={CLASE_RADIO_ITEM}
              >
                <Check
                  className={cn(
                    "size-3",
                    valor === opcion.valor ? "opacity-100" : "opacity-0"
                  )}
                  aria-hidden
                />
                {opcion.etiqueta}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Color de señalización del «Tiempo» según la severidad del tramo. */
const COLOR_SEVERIDAD: Record<SeveridadTiempo, string> = {
  ok: "var(--success)",
  alerta: "var(--warning)",
  critico: "var(--danger)",
};

/**
 * Celda «Tiempo» — transcurrido desde el cierre de 4:00 p. m. HORA LOCAL
 * del país del puesto de digitalización (pedido del dueño), señalizado
 * por color según el tramo: verde < 1 hr · ámbar 1-3 hrs · rojo > 3 hrs
 * (umbral crítico del dueño).
 */
function SenalTiempo({ minutos }: { minutos: number }) {
  const tramo = tramoDeMinutos(minutos);
  const color = COLOR_SEVERIDAD[tramo.severidad];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{ color }}
      title="Tiempo transcurrido desde el cierre (4:00 p. m. hora local del país del puesto de digitalización). Más de 3 horas es crítico."
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {tramo.etiqueta}
    </span>
  );
}

// D10 — px-1.5 compacta el padding horizontal (override del px-2 de ui/table
// vía tailwind-merge): a 1440px con sidebar de 256px las 10 columnas caben
// sin scroll horizontal (hallazgo de auditoría SUP-2 §2).
const TH =
  "label-caps sticky top-0 z-10 h-12 border-b border-border bg-card text-muted-foreground whitespace-nowrap px-1.5";

/**
 * Mini barra de progreso 4px (track #242e2e, relleno del color de estado).
 * D43 — `w-full` (antes min-w-24): con columnas fijas la barra SIEMPRE
 * llena su celda y la etiqueta % queda shrink-0 alineada al borde derecho
 * donde termina el encabezado — todas las filas comparten el mismo borde.
 */
function MiniProgreso({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex w-full items-center gap-1.5">
      <div
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-(--border)"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="body-md w-9 shrink-0 text-right">{pct}%</span>
    </div>
  );
}

/** D42 — KIT e14-monitor-memo-v1: array vacío ESTABLE — `?? []` creaba una
 *  identidad nueva por fila por render y rompía el memo de PuestoRow. */
const MESAS_VACIAS: Mesa[] = [];

/**
 * R4-C6 — telemetría de renders de PuestoRow (solo para la MEDICIÓN de
 * aceptación del fix C6: abrir el visor debe dejarla en 0; se lee en
 * consola con `window.__R4_FILAS.renders`). En el build de producción
 * `process.env.NODE_ENV` se inline-a como "production" y el minificador
 * elimina la rama: costo cero en prod.
 */
const RECUENTO_FILAS = { renders: 0 };
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __R4_FILAS?: { renders: number } }).__R4_FILAS =
    RECUENTO_FILAS;
}

interface PuestosTableProps {
  puestos: Puesto[];
  /**
   * Conjunto del día SIN filtros de columna/búsqueda — de donde salen
   * las opciones de los filtros de columna (ver FiltroColumna).
   */
  puestosBase: Puesto[];
  /** Filtros activos — marca los embudos de «Cierre COL» y «Tiempo». */
  filtros: FiltrosPuestos;
  /** Actualización parcial de filtros desde los encabezados. */
  onFiltroColumna: (parcial: Partial<FiltrosPuestos>) => void;
  /** Mesas del store del shell (kit SUP-3 T4 — ya no se piden al repo
   * directamente desde la fila: los datos viven en el store cliente). */
  mesasPorPuesto: Record<string, Mesa[]>;
  /** Fila expandida por defecto (Italia, primera del mock). */
  expandidoInicialId?: string;
  mesaEnAccionId: string | null;
  onReinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
  /**
   * R4-C6 — abrir el visor llega por PROPS (callbacks estables del
   * contexto de acciones, vía monitor-global): la fila no se suscribe a
   * contexto alguno y el flujo del visor no la re-renderiza.
   */
  onAbrirVisor: (puestoId: string, mesaId: string) => void;
  onAbrirVisorDePuesto: (puestoId: string) => void;
}

export function PuestosTable({
  puestos,
  puestosBase,
  filtros,
  onFiltroColumna,
  mesasPorPuesto,
  expandidoInicialId,
  mesaEnAccionId,
  onReinspeccionar,
  onAbrirVisor,
  onAbrirVisorDePuesto,
}: PuestosTableProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(
    () => new Set(expandidoInicialId ? [expandidoInicialId] : [])
  );

  // D42 — toggle ESTABLE (useCallback): el onToggle por fila ya no cambia
  // de identidad en cada render del padre → el memo de PuestoRow aplica.
  const toggle = useCallback(
    (id: string) =>
      setExpandidos((prev) => {
        const siguiente = new Set(prev);
        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);
        return siguiente;
      }),
    []
  );

  // Filtro de columna «Cierre COL»: valores distintos del día, ordenados
  // cronológicamente (minutosDeReloj), no lexicográficamente.
  const opcionesCierre = useMemo<OpcionFiltro[]>(() => {
    const minutos = new Map<string, number>();
    for (const puesto of puestosBase) {
      if (!minutos.has(puesto.horaCierreColombia)) {
        minutos.set(
          puesto.horaCierreColombia,
          minutosDeReloj(puesto.horaCierreColombia)
        );
      }
    }
    return [...minutos.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([hora]) => ({ valor: hora, etiqueta: hora }));
  }, [puestosBase]);

  if (puestos.length === 0) {
    return (
      <div className="rounded-[4px] border border-border bg-card px-4 py-8 text-center">
        <p className="body-md text-muted-foreground">
          Ningún puesto coincide con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100dvh-21rem)] min-h-[320px] overflow-auto rounded-[4px] border border-border">
      {/*
        <table> directo (sin el wrapper de shadcn): su contenedor con
        overflow-x-auto crearía un scrollport propio y rompería el sticky
        del encabezado dentro de esta región de scroll.

        D43 — table-fixed + colgroup: anchos de columna deterministas
        (ver COLUMNAS); min-w evita aplastar columnas bajo 1200px.
      */}
      <table className="w-full min-w-[1200px] table-fixed border-collapse bg-card text-sm">
        <colgroup>
          {COLUMNAS.map((columna, indice) => (
            <col key={indice} style={{ width: columna.ancho }} />
          ))}
        </colgroup>
        <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-border">
          {ENCABEZADOS.map((encabezado, indice) => (
            <TableHead
              key={encabezado}
              className={cn(
                TH,
                COLUMNAS[indice].align === "right" && "text-right"
              )}
            >
              <span className="inline-flex items-center gap-1">
                {encabezado}
                {indice === INDICE_CIERRE && opcionesCierre.length > 0 && (
                  <FiltroColumna
                    label="Cierre COL"
                    valor={filtros.cierreCol}
                    opciones={opcionesCierre}
                    onFiltro={(valor) => onFiltroColumna({ cierreCol: valor })}
                  />
                )}
                {indice === INDICE_TIEMPO && (
                  <FiltroColumna
                    label="Tiempo"
                    valor={filtros.tiempo}
                    opciones={OPCIONES_TIEMPO}
                    onFiltro={(valor) => onFiltroColumna({ tiempo: valor })}
                  />
                )}
              </span>
            </TableHead>
          ))}
        </TableRow>
        </TableHeader>

        {/*
          Un <tbody> por puesto: cada tbody es el raíz de un Collapsible
          (asChild) para poder expandir/colapsar sin romper la semántica de
          tabla (el raíz por defecto de Radix sería un <div> dentro de la
          tabla). Expansión controlada: Italia abierta por defecto (kit §2.4).
        */}
        {puestos.map((puesto) => (
          <PuestoRow
            key={puesto.id}
            puesto={puesto}
            mesas={mesasPorPuesto[puesto.id] ?? MESAS_VACIAS}
            abierto={expandidos.has(puesto.id)}
            onToggle={toggle}
            mesaEnAccionId={mesaEnAccionId}
            onReinspeccionar={onReinspeccionar}
            onAbrirVisor={onAbrirVisor}
            onAbrirVisorDePuesto={onAbrirVisorDePuesto}
          />
        ))}
      </table>
    </div>
  );
}

/** D42 — KIT e14-monitor-memo-v1: PuestoRow va MEMOIZADO. Con el contexto
 *  de datos memoizado (D42 en datos-provider) y props estables (toggle
 *  estable, MESAS_VACIAS estable), una fila solo re-renderiza cuando SUS
 *  datos cambiaron — el re-render completo de 949 filas por tecla/tick
 *  desaparece.
 *
 *  R4-C6 (reporte 02-b C2): además, la fila ya NO consume `useDatos()` —
 *  el valor grande incluía visorActa/actaActual/actaCargando, así que
 *  abrir el visor re-creaba la identidad del contexto y re-renderizaba las
 *  949 filas (la suscripción a contexto bypasa el memo). Las acciones del
 *  visor llegan ahora por props estables (useDatosAcciones → monitor →
 *  props); el flujo de actas no cambia ninguna prop de la fila. */
const PuestoRow = memo(function PuestoRow({
  puesto,
  mesas,
  abierto,
  onToggle,
  mesaEnAccionId,
  onReinspeccionar,
  onAbrirVisor,
  onAbrirVisorDePuesto,
}: {
  puesto: Puesto;
  mesas: Mesa[];
  abierto: boolean;
  onToggle: (id: string) => void;
  mesaEnAccionId: string | null;
  onReinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
  onAbrirVisor: (puestoId: string, mesaId: string) => void;
  onAbrirVisorDePuesto: (puestoId: string) => void;
}) {
  const acento = colorDeEstado(puesto.estadoGlobal);
  // R4-C6 — telemetría de renders (ver RECUENTO_FILAS): el effect corre tras
  // CADA commit donde la fila se renderizó de verdad; si el memo SALTA el
  // render, el effect no corre y el contador no sube. SOLO dev: la mutación
  // de telemetría vive en un effect (el lugar que el propio lint recomienda).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") RECUENTO_FILAS.renders += 1;
  });
  // KIT SUP-4 T3.4 — el 👁 abre el visor en la primera mesa CON acta del
  // puesto; deshabilitado si el puesto no tiene ninguna (todas
  // NO_INICIADO).
  const tieneActa = mesas.some((m) => m.estadoMesa !== "NO_INICIADO");
  // R4-C7 — id estable del detalle (aria-controls del botón de expansión).
  const idDetalle = `detalle-puesto-${puesto.id}`;
  return (
    <Collapsible
      open={abierto}
      onOpenChange={(v) => v !== abierto && onToggle(puesto.id)}
      asChild
    >
      <tbody
        className="[content-visibility:auto] [contain-intrinsic-size:auto_49px]"
      >
        {/* R4 — virtualización barata (sin deps): «Todos los días» monta
            ~949 <tbody> (uno por puesto); content-visibility:auto deja que
            el navegador NO pinte/skipee los que están fuera del scrollport
            (contain-intrinsic-size estima 49px = fila h-12 + borde). La
            virtualización completa (ventana de filas) queda como propuesta
            en pr.md — decisión del dueño. */}
        {/** R4-C7 (reporte 02-b C1): el <tr> vuelve a ser fila semántica —
         * YA NO es el CollapsibleTrigger (un <tr> no es enfocable: sin foco
         * ni Enter/Space, todo el detalle quedaba inalcanzable por teclado,
         * WCAG 2.1.1). La expansión vive en el BOTÓN real de la primera
         * celda (aria-expanded + aria-controls + foco visible, toque 44px);
         * el clic en cualquier parte de la fila sigue alternando. */}
        <TableRow
          className="h-12 cursor-pointer border-b border-border hover:bg-(--hover-row)"
          style={{ borderLeft: `4px solid ${acento}` }}
          onClick={() => onToggle(puesto.id)}
        >
          <TableCell className="body-md px-1.5 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                aria-expanded={abierto}
                aria-controls={idDetalle}
                aria-label={`${abierto ? "Ocultar" : "Ver"} mesas del puesto ${puesto.puesto}`}
                title={abierto ? "Ocultar mesas" : "Ver mesas"}
                onClick={(e) => {
                  e.stopPropagation(); // la fila también alterna — evitar doble toggle
                  onToggle(puesto.id);
                }}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary)"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    abierto && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {puesto.codigoPais} - {puesto.pais}
            </span>
          </TableCell>
            <TableCell className="body-md px-1.5">{puesto.zona}</TableCell>
            <TableCell
              className="body-md px-1.5 whitespace-nowrap overflow-hidden text-ellipsis"
              title={puesto.puesto}
            >
              {puesto.puesto}
            </TableCell>
            <TableCell className="body-md px-1.5 text-right">
              {puesto.numeroMesas}
            </TableCell>
            <TableCell
              className="body-md px-1.5 whitespace-nowrap"
              title="Hora de cierre en hora de Colombia (cierre 4:00 p. m. hora local del país)"
            >
              {puesto.horaCierreColombia}
            </TableCell>
            <TableCell className="body-md px-1.5">
              <span
                className="inline-block rounded-[4px] border border-(--success) px-1.5 py-0.5 whitespace-nowrap"
                title="Hora local del país del puesto de digitalización"
              >
                {puesto.horaActualLocal}
              </span>
            </TableCell>
            <TableCell className="body-md px-1.5">
              <SenalTiempo minutos={puesto.minutosDesdeCierre} />
            </TableCell>
            <TableCell className="text-right px-1.5">
              <MiniProgreso pct={puesto.pctDelegado} color={acento} />
            </TableCell>
            <TableCell className="text-right px-1.5">
              <MiniProgreso pct={puesto.pctTransmision} color={acento} />
            </TableCell>
            <TableCell className="text-right px-1.5">
              <span className="flex items-center justify-end gap-1">
                <StatusBadge estado={puesto.estadoGlobal} />
                {/* KIT SUP-4 — 👁 abre el visor (punto de entrada 3/3).
                    stopPropagation: el clic sobre la fila alterna la
                    expansión y aquí NO debe hacerlo. */}
                <button
                  type="button"
                  disabled={!tieneActa}
                  title={tieneActa ? "Ver acta del puesto" : "Sin acta"}
                  aria-label={`Ver acta del puesto ${puesto.puesto}`}
                  onClick={(e) => {
                    e.stopPropagation(); // la fila alterna al clic — no aquí
                    onAbrirVisorDePuesto(puesto.id);
                  }}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-(--accent) hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--primary) disabled:pointer-events-none disabled:opacity-40"
                >
                  <Eye className="size-4" aria-hidden />
                </button>
              </span>
            </TableCell>
          </TableRow>

        <CollapsibleContent asChild>
          <TableRow
            id={idDetalle}
            className="hover:bg-transparent border-b border-border"
          >
            <TableCell colSpan={ENCABEZADOS.length} className="p-0">
              <MesasSubtable
                mesas={mesas}
                puestoId={puesto.id}
                mesaEnAccionId={mesaEnAccionId}
                onReinspeccionar={onReinspeccionar}
                onAbrirVisor={onAbrirVisor}
              />
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </tbody>
    </Collapsible>
  );
});
