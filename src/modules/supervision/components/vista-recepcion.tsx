"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
// R4 — CLASE_CHIP único (reporte 02-b §5.1: duplicado ×3).
import { CLASE_CHIP } from "@/shared/ui/tono";
import {
  asegurarSemilla,
  consultarRecepciones,
  suscribirseRecepcion,
  type EntradaRecepcion,
  type EstadoRecepcion,
} from "../data/recepcion-log";
import { tiempoRelativo } from "./tiempo";
import { KpiCard } from "./kpi-card";
import { Esqueleto } from "./esqueleto";
import type { FormularioTipo } from "../domain/acta";

/**
 * VISTA RECEPCIÓN DE ACTAS (kit recepcion-actas-v1, D28) — el log EN VIVO
 * de todo lo que va llegando al monitor: cada página que la CARGA MASIVA
 * entrega aterriza aquí con su desenlace (PUBLICADA · CUARENTENA D25 ·
 * SIN JOIN), la foto recibida y su destino (idEnlace D22 · mesa).
 *
 * Datos: `recepcion-log.ts` (memoria de sesión, D8) por suscripción —
 * mismo patrón del store del shell. El sembrado del ancla estático
 * (ingesta-inicial) corre 1 vez al montar. Filtros por desenlace
 * (KPIs clickeables, gesto del monitor T3) y por formulario + búsqueda.
 * VER EN MONITOR: seam por props (D27) — solo filas PUBLICADAS.
 */

type FiltroEstado = "todas" | EstadoRecepcion;
type FiltroFormulario = "todos" | FormularioTipo;

/** Píldora de desenlace (mismos términos del PublicacionChip del masiva). */
const ESTADO_PILDORA: Record<EstadoRecepcion, string> = {
  PUBLICADA: "border-(--success) text-(--success)",
  BLOQUEADA: "border-(--warning) text-(--warning)",
  SIN_JOIN: "border-border text-muted-foreground",
};

const ETIQUETA_ESTADO: Record<EstadoRecepcion, string> = {
  PUBLICADA: "Publicada",
  BLOQUEADA: "Cuarentena",
  SIN_JOIN: "Sin join",
};

/** "12:40:03" local (client-only — el log se lee tras montar). */
function horaExacta(fecha: number): string {
  return new Date(fecha).toLocaleTimeString("es-CO", { hour12: false });
}

function Miniatura({ entrada }: { entrada: EntradaRecepcion }) {
  if (!entrada.srcFoto) {
    // Sin foto → hueco honesto (jamás inventar binarios — D23/D27).
    return (
      <span
        aria-hidden
        className="flex h-13 w-10 shrink-0 items-center justify-center rounded-[4px] border border-border bg-(--surface-lowest) text-muted-foreground"
      >
        <FileText className="size-4" />
      </span>
    );
  }
  return (
    <img
      src={entrada.srcFoto}
      alt={`Página ${entrada.paginaIndex ?? 1} recibida${
        entrada.nombreArchivo ? ` (${entrada.nombreArchivo})` : ""
      }`}
      className="h-13 w-10 shrink-0 rounded-[4px] border border-border object-cover"
      loading="lazy"
    />
  );
}

function FilaRecepcion({
  entrada,
  nueva,
  onVerEnMonitor,
}: {
  entrada: EntradaRecepcion;
  nueva: boolean;
  onVerEnMonitor?: (puestoId: string, mesaId: string) => void;
}) {
  const conJoin = entrada.estado === "PUBLICADA" && entrada.idEnlace !== "—";
  return (
    <li
      className={cn(
        "border-b border-border px-4 py-3 last:border-b-0",
        nueva && "fila-llegada"
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {/* Miniatura */}
        <Miniatura entrada={entrada} />

        {/* Hora + desenlace */}
        <span className="w-24 shrink-0">
          <span className="font-data block text-[12px] leading-4">
            {horaExacta(entrada.fecha)}
          </span>
          <span className="font-data block text-[11px] text-muted-foreground">
            {tiempoRelativo(entrada.fecha)}
          </span>
          <span
            className={cn(
              "label-caps mt-1.5 inline-block rounded-[4px] border px-1.5 py-0.5",
              ESTADO_PILDORA[entrada.estado]
            )}
          >
            {ETIQUETA_ESTADO[entrada.estado]}
          </span>
        </span>

        {/* Destino (idEnlace D22 · mesa) + lugar impreso */}
        <span className="min-w-0 flex-1">
          <span className="font-data block truncate text-[12px] leading-5 font-semibold">
            {entrada.idEnlace !== "—" ? (
              <>
                {entrada.idEnlace} · MESA {entrada.mesa}
              </>
            ) : (
              <>DESTINO SIN CONFIRMAR</>
            )}
          </span>
          <span className="body-md block truncate text-muted-foreground">
            {entrada.pais && entrada.lugar
              ? `${entrada.pais} — ${entrada.lugar}`
              : "Sin encabezado confiable (sin clasificación AUTO)"}
          </span>
          {entrada.motivo && (
            <span className="body-md mt-0.5 block text-(--warning)">
              {entrada.estado === "BLOQUEADA" ? "CUARENTENA (D25) — " : ""}
              {entrada.motivo}
            </span>
          )}
        </span>

        {/* Formulario · página · score */}
        <span className="w-40 shrink-0">
          <span className="body-md block">
            {entrada.formulario
              ? entrada.formulario === "TRANSMISION"
                ? "TRANSMISIÓN"
                : "CÓNSUL/EMBAJADOR"
              : "Formulario n/d"}
          </span>
          <span className="font-data block text-[11px] text-muted-foreground">
            {entrada.paginaIndex
              ? `PÁG ${entrada.paginaIndex}/${entrada.paginaTotal ?? "—"}`
              : "PÁG —"}
            {typeof entrada.score === "number"
              ? ` · SCORE ${entrada.score.toFixed(1)}`
              : ""}
          </span>
        </span>

        {/* Acción: aterriza el acta en el visor del monitor (seam D27). */}
        <Button
          variant="ghost"
          size="sm"
          className="label-caps h-11 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground disabled:opacity-40"
          disabled={!conJoin}
          title={
            conJoin
              ? "Ver el acta en el monitor"
              : "Solo las publicadas aterrizan en el monitor"
          }
          aria-label={`Ver en monitor: ${entrada.idEnlace} mesa ${entrada.mesa}`}
          onClick={
            conJoin && onVerEnMonitor
              ? () => onVerEnMonitor(entrada.idEnlace, entrada.mesa)
              : undefined
          }
        >
          <FileText className="size-4" aria-hidden />
          Ver en monitor
        </Button>
      </div>
    </li>
  );
}

export function VistaRecepcion({
  onVerEnMonitor,
}: {
  onVerEnMonitor?: (puestoId: string, mesaId: string) => void;
}) {
  // null = primera carga (skeleton — T2/T3). Cero lecturas en render SSR.
  const [entradas, setEntradas] = useState<EntradaRecepcion[] | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas");
  const [filtroFormulario, setFiltroFormulario] =
    useState<FiltroFormulario>("todos");
  const [busqueda, setBusqueda] = useState("");
  /** Ids de llegadas frescas (destello 1.6 s — .fila-llegada). */
  const [frescas, setFrescas] = useState<Set<string>>(() => new Set());
  const temporizadores = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    let vivo = true;
    // El sembrado del ancla estático corre 1 vez (idempotente) ANTES de
    // la primera lectura — la vista abre con la ingesta inicial visible.
    asegurarSemilla();
    setEntradas(consultarRecepciones());
    const desuscribir = suscribirseRecepcion((entrada) => {
      if (!vivo) return;
      setEntradas(consultarRecepciones());
      if (entrada.origen !== "carga-masiva") return;
      setFrescas((prev) => new Set(prev).add(entrada.id));
      const t = setTimeout(() => {
        setFrescas((prev) => {
          const siguiente = new Set(prev);
          siguiente.delete(entrada.id);
          return siguiente;
        });
        temporizadores.current.delete(t);
      }, 1_700);
      temporizadores.current.add(t);
    });
    return () => {
      vivo = false;
      desuscribir();
      for (const t of temporizadores.current) clearTimeout(t);
      temporizadores.current.clear();
    };
  }, []);

  const conteos = useMemo(() => {
    const lista = entradas ?? [];
    let publicadas = 0;
    let bloqueadas = 0;
    let sinJoin = 0;
    for (const e of lista) {
      if (e.estado === "PUBLICADA") publicadas += 1;
      else if (e.estado === "BLOQUEADA") bloqueadas += 1;
      else sinJoin += 1;
    }
    return { total: lista.length, publicadas, bloqueadas, sinJoin };
  }, [entradas]);

  const visibles = useMemo(() => {
    const lista = entradas ?? [];
    const aguja = busqueda.trim().toLowerCase();
    return lista.filter((e) => {
      if (filtroEstado !== "todas" && e.estado !== filtroEstado) return false;
      if (
        filtroFormulario !== "todos" &&
        e.formulario !== filtroFormulario
      ) {
        return false;
      }
      if (!aguja) return true;
      const paja = [
        e.idEnlace,
        e.mesa,
        e.clave ?? "",
        e.pais ?? "",
        e.lugar ?? "",
        e.nombreArchivo ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return paja.includes(aguja);
    });
  }, [entradas, filtroEstado, filtroFormulario, busqueda]);

  if (entradas === null) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <Esqueleto className="h-11 w-full max-w-md" />
        <Esqueleto className="h-96 w-full" />
      </div>
    );
  }

  const ultima = entradas[0];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="headline-md">Recepción de actas</h2>
          <p className="body-md mt-1 flex items-center gap-2 text-muted-foreground">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--success) opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-(--success)" />
            </span>
            En vivo — {conteos.total} página{conteos.total === 1 ? "" : "s"} recibida
            {conteos.total === 1 ? "" : "s"} en esta sesión
            {ultima
              ? ` · última ${tiempoRelativo(ultima.fecha).toLowerCase()}`
              : ""}
          </p>
        </div>
      </header>

      {/* KPIs = filtro de desenlace (mismo gesto del monitor, kit T3). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          titulo="Recibidas"
          valor={conteos.total}
          tono="neutral"
          activo={filtroEstado === "todas"}
          onClick={() => setFiltroEstado("todas")}
        />
        <KpiCard
          titulo="Publicadas"
          valor={conteos.publicadas}
          tono="success"
          activo={filtroEstado === "PUBLICADA"}
          onClick={() =>
            setFiltroEstado(filtroEstado === "PUBLICADA" ? "todas" : "PUBLICADA")
          }
        />
        <KpiCard
          titulo="Cuarentena (D25)"
          valor={conteos.bloqueadas}
          tono="warning"
          activo={filtroEstado === "BLOQUEADA"}
          onClick={() =>
            setFiltroEstado(filtroEstado === "BLOQUEADA" ? "todas" : "BLOQUEADA")
          }
        />
        <KpiCard
          titulo="Sin join"
          valor={conteos.sinJoin}
          tono="neutral"
          activo={filtroEstado === "SIN_JOIN"}
          onClick={() =>
            setFiltroEstado(filtroEstado === "SIN_JOIN" ? "todas" : "SIN_JOIN")
          }
        />
      </div>

      {/* Filtro por formulario + búsqueda */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label="Filtro por formulario"
        >
          {(
            [
              ["todos", "Todos los formularios"],
              ["TRANSMISION", "Transmisión"],
              ["DELEGADOS", "Cónsul/Embajador"],
            ] as [FiltroFormulario, string][]
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              className={cn(
                CLASE_CHIP,
                filtroFormulario === valor &&
                  "border-(--primary) bg-(--accent) text-foreground"
              )}
              aria-pressed={filtroFormulario === valor}
              onClick={() => setFiltroFormulario(valor)}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar idEnlace, mesa, país…"
            aria-label="Búsqueda en el log de recepción"
            className="h-11 border-border bg-(--input) pl-9 font-data text-[13px] shadow-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Log en vivo (alto tope + scroll fino). */}
      {visibles.length === 0 ? (
        <div className="rounded-[4px] border border-border bg-card px-4 py-10 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="body-md mt-3 text-muted-foreground">
            {conteos.total === 0
              ? "Aún no llega nada. Envía actas desde CARGA MASIVA y aparecerán aquí en vivo."
              : "Nada coincide con estos filtros."}
          </p>
        </div>
      ) : (
        <div
          className="flex max-h-[60vh] flex-col overflow-hidden rounded-[4px] border border-border bg-card"
          aria-label="Log de recepción de actas"
          role="region"
        >
          {/* Encabezado (desktop) */}
          <div
            className="hidden items-center gap-4 border-b border-border px-4 py-2 md:flex"
            aria-hidden
          >
            <span className="w-10 shrink-0" />
            <span className="label-caps w-24 shrink-0 text-muted-foreground">
              Hora
            </span>
            <span className="label-caps min-w-0 flex-1 text-muted-foreground">
              Destino (idEnlace · mesa)
            </span>
            <span className="label-caps w-40 shrink-0 text-muted-foreground">
              Formulario · pág
            </span>
            <span className="label-caps w-36 shrink-0 text-muted-foreground text-right">
              Acción
            </span>
          </div>
          <ul className="scroll-panel flex-1 overflow-y-auto">
            {visibles.map((e) => (
              <FilaRecepcion
                key={e.id}
                entrada={e}
                nueva={frescas.has(e.id)}
                onVerEnMonitor={onVerEnMonitor}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
