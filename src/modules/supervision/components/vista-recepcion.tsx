"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Inbox, Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
// R4 — CLASE_CHIP único (reporte 02-b §5.1: duplicado ×3).
import { CLASE_CHIP } from "@/shared/ui/tono";
import {
  asegurarSemilla,
  consultarRecepciones,
  esLlegadaViva,
  suscribirseRecepcion,
  type EntradaRecepcion,
  type EstadoRecepcion,
} from "../data/recepcion-log";
import { tiempoRelativo } from "./tiempo";
import { KpiCard } from "./kpi-card";
import { Esqueleto } from "./esqueleto";
// E2E local — la tarjeta que sondea el hub del celular (flujo cel → compu).
import { HubLocalCard } from "./hub-local-card";
// Ronda C (R2/R3/R5) — métricas del feed + reloj vivo canónico (1 s).
import { calcularMetricasFeed, type TonoRitmo } from "../data/feed-metricas";
import { useRelojSegundos } from "./reloj-vivo";
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

/** "17:44:29" — hora de RECEPCIÓN en Colombia (regla del dueño: LOCAL=COL,
 * ronda «reloj real»). TZ explícito: el supervisor puede estar en cualquier
 * huso; esta columna siempre muestra la hora colombiana. */
function horaColombia(fecha: number): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(fecha);
}

/** "19:44:29" — hora LOCAL del país emisor (zona IANA de zonas-emisor,
 * ronda C R6). Zona inválida → "—" (jamás inventar la hora). */
function horaEnZona(fecha: number, zona: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: zona,
    }).format(fecha);
  } catch {
    return "—";
  }
}

/** Ronda C (R2) — tono del chip RITMO (relativo al pico de la sesión).
 * Mapea el cálculo puro (feed-metricas) a tokens CSS del sistema. */
const TONO_RITMO: Record<
  TonoRitmo,
  { etiqueta: string; token: string; clase: string }
> = {
  OPTIMO: {
    etiqueta: "Ritmo óptimo",
    token: "var(--success)",
    clase: "border-(--success) text-(--success)",
  },
  ESTABLE: {
    etiqueta: "Ritmo estable",
    token: "var(--neutral-state)",
    clase: "border-border text-muted-foreground",
  },
  LENTO: {
    etiqueta: "Ritmo lento",
    token: "var(--warning)",
    clase: "border-(--warning) text-(--warning)",
  },
  SIN_DATOS: {
    etiqueta: "Sin datos",
    token: "var(--neutral-state)",
    clase: "border-border text-muted-foreground",
  },
};

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
  // C-17 — el sobre trae el formulario (`entrada.formulario`): viaja al visor
  // para abrir el acta en el TIPO correcto (no siempre TRANSMISION).
  onVerEnMonitor?: (
    puestoId: string,
    mesaId: string,
    tipo?: FormularioTipo
  ) => void;
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

        {/* Hora dual (ronda C R6): REC = hora de RECEPCIÓN en Colombia —
            C-15: en filas del hub se muestra la LLEGADA REAL AL HUB
            (`fechaRecepcionHub`, el `ts` que el hub estampa), y solo si falta
            (filas viejas / bandeja local) cae a `fecha` del sondeo. ORIGEN =
            escaneo en la hora local del país emisor; C-07: si la fila no trae
            `fechaOrigen`, se muestra «ORIGEN —» (honestidad — jamás
            proyectar la hora del escaneo). */}
        <span className="w-40 shrink-0">
          <span className="font-data block whitespace-nowrap text-[12px] leading-4">
            REC {horaColombia(entrada.fechaRecepcionHub ?? entrada.fecha)}{" "}
            <span className="text-muted-foreground">(COL)</span>
          </span>
          {entrada.fechaOrigen !== undefined && entrada.tzOrigen ? (
            <span
              className="font-data block truncate text-[11px] text-muted-foreground"
              title={
                entrada.pais
                  ? `Escaneado en hora local de ${entrada.pais} (${entrada.tzOrigen})`
                  : `Escaneado en ${entrada.tzOrigen}`
              }
            >
              ORIGEN {horaEnZona(entrada.fechaOrigen, entrada.tzOrigen)}
              {entrada.pais
                ? ` (${entrada.pais.replace(/^\d+\s*-\s*/, "")})`
                : ""}
            </span>
          ) : (
            <span
              className="font-data block truncate text-[11px] text-muted-foreground"
              title="El origen no reportó la hora de escaneo — no se inventa"
            >
              ORIGEN —
            </span>
          )}
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
          {entrada.origen === "puente-local" && (
            <span
              className="label-caps mt-1.5 ml-1 inline-block rounded-[4px] border border-(--outline-variant) px-1.5 py-0.5 text-muted-foreground"
              title="Llegó por la red desde un celular, traída del hub local"
            >
              DEL CELULAR
            </span>
          )}
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
          {/* U-2 (INFORME-PRUEBAS-Y-AUDITORIA) — trazabilidad del archivo:
              dos entradas con el mismo score/mesa son indistinguibles en el
              feed sin el nombre del archivo de origen; es el campo que
              permite correlacionar la entrada con la bandeja de Carga
              Masiva y el modal revisor (auditoría de origen). */}
          {entrada.nombreArchivo && (
            <span
              className="font-data block truncate text-[11px] text-muted-foreground/70"
              title={entrada.nombreArchivo}
            >
              {entrada.nombreArchivo}
            </span>
          )}
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
              ? () =>
                  onVerEnMonitor(
                    entrada.idEnlace,
                    entrada.mesa,
                    // C-17 — el formulario del sobre manda; null (SIN_JOIN)
                    // no llega aquí (botón deshabilitado), pero undefined
                    // deja que el shell aplique su fallback honesto.
                    entrada.formulario ?? undefined
                  )
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

/** Ronda C (R3) — sparkline del FLUJO: 60 barritas (1 s c/u), altura
 * relativa al segundo más alto de la ventana. Los segundos vacíos pisan
 * la línea base (2 px) — el hueco también es información. */
function Sparkline({ buckets }: { buckets: readonly number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <div
      className="mt-2 flex h-14 items-end gap-px"
      role="img"
      aria-label={`Flujo de llegadas de los últimos 60 segundos; pico ${max} por segundo`}
    >
      {buckets.map((v, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-[1px]",
            v > 0 ? "bg-(--success)" : "bg-(--surface-lowest)"
          )}
          style={{
            height: v > 0 ? `${Math.max(12, (v / max) * 100)}%` : "2px",
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}

export function VistaRecepcion({
  onVerEnMonitor,
}: {
  // C-17 — misma firma que la vista Carga Masiva: el TIPO viaja al visor.
  onVerEnMonitor?: (
    puestoId: string,
    mesaId: string,
    tipo?: FormularioTipo
  ) => void;
}) {
  // null = primera carga (skeleton — T2/T3). Cero lecturas en render SSR.
  const [entradas, setEntradas] = useState<EntradaRecepcion[] | null>(null);
  // Ronda C (R4) — PAUSAR FEED: congela la vista (snapshot) SIN cortar la
  // ingesta: la suscripción sigue llenando `entradas` (y el badge del
  // sidebar cuenta); el render lee la copia congelada hasta reanudar.
  const [pausado, setPausado] = useState(false);
  const [congeladas, setCongeladas] = useState<EntradaRecepcion[] | null>(
    null
  );
  // Ronda C (R2/R3) — reloj vivo canónico (1 s): ritmo, buckets y el
  // frescor del log se re-miden cada segundo sin setState desde effects.
  const reloj = useRelojSegundos();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas");
  const [filtroFormulario, setFiltroFormulario] =
    useState<FiltroFormulario>("todos");
  const [busqueda, setBusqueda] = useState("");
  /** Ids de llegadas frescas (destello 1.6 s — .fila-llegada). */
  const [frescas, setFrescas] = useState<Set<string>>(() => new Set());
  const temporizadores = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  /** R4-lint — la lectura inicial corre UNA vez aunque el effect se monte
   * dos veces (StrictMode); el state persiste entre esos remontajes. */
  const leimosRef = useRef(false);
  /** R4-lint — ¿hay una instancia viva de la vista AHORA? (el microtask de
   * la lectura inicial consulta esto: nada de setState tras desmontar). */
  const montadoRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    montadoRef.current = true;
    // R9 — fix del warning react-hooks (antes L245): el cleanup NO debe leer
    // `temporizadores.current` (el ref puede haber cambiado cuando corra).
    // Copia LOCAL del Set al entrar al effect: la instancia del ref nunca se
    // reasigna (solo se muta in place), así que la copia es la MISMA referencia
    // viva y add/delete/clear siguen operando el set real. Accesibilidad y
    // los 44px de toque intactos — cero cambio de comportamiento.
    const temporizadoresActivos = temporizadores.current;
    // El sembrado del ancla estático corre 1 vez (idempotente) ANTES de
    // la primera lectura — la vista abre con la ingesta inicial visible.
    asegurarSemilla();
    // R4-lint (vista-recepcion.tsx:208) — la primera lectura ya NO es un
    // setState sincrónico en el cuerpo del effect (react-hooks/
    // set-state-in-effect): se difiere a una microtarea. Mismo resultado
    // observable: el skeleton ya está pintado y el log aterriza una
    // microtask después; el ref evita la doble lectura en StrictMode.
    if (!leimosRef.current) {
      leimosRef.current = true;
      queueMicrotask(() => {
        if (montadoRef.current) setEntradas(consultarRecepciones());
      });
    }
    const desuscribir = suscribirseRecepcion((entrada) => {
      if (!vivo) return;
      // C-16 — `null` = cambio estructural sin llegada (purga tras reset del
      // hub): re-lee el log, sin destello (no es una llegada viva).
      setEntradas(consultarRecepciones());
      if (!entrada || !esLlegadaViva(entrada.origen)) return;
      setFrescas((prev) => new Set(prev).add(entrada.id));
      const t = setTimeout(() => {
        setFrescas((prev) => {
          const siguiente = new Set(prev);
          siguiente.delete(entrada.id);
          return siguiente;
        });
        temporizadoresActivos.delete(t);
      }, 1_700);
      temporizadoresActivos.add(t);
    });
    return () => {
      vivo = false;
      montadoRef.current = false;
      desuscribir();
      for (const t of temporizadoresActivos) clearTimeout(t);
      temporizadoresActivos.clear();
    };
  }, []);

  /** Ronda C (R4) — pausa/reanuda el feed VISUAL (la ingesta nunca para). */
  const alternarFeed = () => {
    if (pausado) {
      setPausado(false);
      setCongeladas(null);
    } else {
      setCongeladas(consultarRecepciones());
      setPausado(true);
    }
  };

  // Fuente del render: el snapshot congelado mientras el feed está en
  // pausa; el log vivo en cuanto se reanuda (y para TODAS las métricas).
  // Memoizada (lint react-hooks/exhaustive-deps): identidad estable entre
  // renders — los useMemo de métricas/lista no se invalidan de más.
  const fuente = useMemo(
    () => (pausado && congeladas ? congeladas : (entradas ?? [])),
    [pausado, congeladas, entradas]
  );

  /** Ronda C (R4) — llegadas registradas durante la pausa (ingesta viva). */
  const pendientes =
    pausado && entradas
      ? Math.max(0, entradas.length - (congeladas?.length ?? 0))
      : 0;

  const conteos = useMemo(() => {
    const lista = fuente;
    let publicadas = 0;
    let bloqueadas = 0;
    let sinJoin = 0;
    for (const e of lista) {
      if (e.estado === "PUBLICADA") publicadas += 1;
      else if (e.estado === "BLOQUEADA") bloqueadas += 1;
      else sinJoin += 1;
    }
    return { total: lista.length, publicadas, bloqueadas, sinJoin };
  }, [fuente]);

  // Ronda C (R2/R3/R5) — métricas del feed sobre la fuente del render.
  const metricas = useMemo(
    () => calcularMetricasFeed(fuente, reloj),
    [fuente, reloj]
  );

  const visibles = useMemo(() => {
    const lista = fuente;
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
  }, [fuente, filtroEstado, filtroFormulario, busqueda]);

  if (entradas === null) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <Esqueleto className="h-11 w-full max-w-md" />
        <Esqueleto className="h-96 w-full" />
      </div>
    );
  }

  const ultima = fuente[0];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="headline-md">Recepción de actas</h2>
          <p className="body-md mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="relative flex size-2" aria-hidden>
              {pausado ? (
                <span className="relative inline-flex size-2 rounded-full bg-(--warning)" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--success) opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-(--success)" />
                </>
              )}
            </span>
            {pausado
              ? `Feed pausado — ${conteos.total} página${
                  conteos.total === 1 ? "" : "s"
                } en el log`
              : `En vivo — ${conteos.total} página${
                  conteos.total === 1 ? "" : "s"
                } recibida${conteos.total === 1 ? "" : "s"} en esta sesión`}
            {ultima && !pausado
              ? ` · última ${tiempoRelativo(ultima.fecha).toLowerCase()}`
              : ""}
            {/* Ronda C (R5) — latencia media rec vs origen. C-07: SOLO con
                pares reales (fechaOrigen presente → recibida) y con ≥ 2
                muestras: con menos, una «media» sería un invento (la fila
                se oculta — ni división por cero ni cifras fabricadas). */}
            {metricas.latenciaMedia !== null && metricas.latenciaMuestras >= 2 && (
              <span className="font-data label-caps text-[10px] text-muted-foreground">
                · Latencia media: {metricas.latenciaMedia.toFixed(1)}s
              </span>
            )}
          </p>
        </div>
        {/* Ronda C (R4) — estado del feed + PAUSAR/REANUDAR (44 px de toque). */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "label-caps inline-flex h-11 items-center rounded-[4px] border px-3",
              pausado
                ? "border-(--warning) text-(--warning)"
                : "border-(--success) text-(--success)"
            )}
          >
            {pausado
              ? pendientes > 0
                ? `Pausado · ${pendientes} en cola`
                : "Pausado"
              : "Feed: transmitiendo"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="label-caps h-11"
            onClick={alternarFeed}
            aria-pressed={pausado}
          >
            {pausado ? (
              <Play className="size-4" aria-hidden />
            ) : (
              <Pause className="size-4" aria-hidden />
            )}
            {pausado ? "Reanudar feed" : "Pausar feed"}
          </Button>
        </div>
      </header>

      {/* Ronda C (R1/R2/R3/R7) — métricas del feed: KPI TOTAL protagonista,
          RITMO/throughput con chip y pico, FLUJO (barritas de 60 s). */}
      <div className="grid gap-3 md:grid-cols-3">
        <div
          className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
          style={{ borderTopColor: "var(--success)" }}
        >
          <p className="label-caps flex items-center gap-2 text-muted-foreground">
            Recibidas
            <span className="font-data rounded-[4px] border border-(--outline-variant) px-1 py-0.5 text-[10px] tracking-normal text-muted-foreground">
              TOTAL
            </span>
          </p>
          <p className="stats-number text-[2rem] leading-10 text-(--success)">
            {conteos.total}
          </p>
          <p className="body-md mt-1 text-muted-foreground">
            {conteos.total > 0
              ? `${conteos.publicadas}/${conteos.total} transmitidas · ${Math.round((conteos.publicadas / conteos.total) * 100)}%`
              : "Sin llegadas todavía en esta sesión"}
          </p>
        </div>

        <div
          className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
          style={{ borderTopColor: TONO_RITMO[metricas.tono].token }}
        >
          <p className="label-caps text-muted-foreground">
            Ritmo en vivo / Throughput
          </p>
          <p
            className="stats-number text-[2rem] leading-10"
            style={{ color: TONO_RITMO[metricas.tono].token }}
          >
            {metricas.ritmo}
            <span className="body-md ml-1.5 font-normal text-muted-foreground">
              actas/min
            </span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "label-caps inline-block rounded-[4px] border px-1.5 py-0.5",
                TONO_RITMO[metricas.tono].clase
              )}
            >
              {TONO_RITMO[metricas.tono].etiqueta}
            </span>
            <span className="body-md text-muted-foreground">
              Pico: {metricas.pico} actas/min
            </span>
          </p>
        </div>

        <div
          className="rounded-[4px] border border-border border-t-2 bg-card px-4 py-3"
          style={{ borderTopColor: "var(--neutral-state)" }}
        >
          <p className="label-caps text-muted-foreground">
            Flujo en tiempo real
          </p>
          <Sparkline buckets={metricas.buckets} />
          <p className="body-md mt-1 text-muted-foreground">
            Últimos 60 s · 1 barra = 1 s
          </p>
        </div>
      </div>

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

      {/* E2E local — el puente del celular entra al mismo embudo (D25/D22). */}
      <HubLocalCard />

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
            <span className="label-caps w-40 shrink-0 text-muted-foreground">
              Hora (REC · origen)
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
