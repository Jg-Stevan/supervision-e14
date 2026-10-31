"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  initSupervisionDatos,
  mockSupervisionRepository,
  TICKER_SEGUNDOS,
  TRANSICION_CADA_SEGUNDOS,
} from "../data/mock-repository";
import { tieneActa } from "../data/actas-mock";
import { suscribirseActasRuntime } from "../data/actas-runtime";
// R4-M7 — espejo del visor en location.hash (D11: espejo, NO router).
import { escribirHashParcial, leerEstadoHash } from "./espejo-url";
import type {
  ActaMesa,
  FormularioTipo,
} from "../domain/acta";
import type {
  Anomalia,
  Mesa,
  Notificacion,
  Puesto,
  ResumenGlobal,
} from "../domain/types";
import { ActaViewerModal } from "./actas/acta-viewer-modal";

/**
 * Store cliente del shell (kit SUP-3 T4: «los datos viven en el store
 * client del shell»). Carga el mock async (D12) con skeletons en T3 y
 * expone las mutaciones de T4 + la vida de T3 (ticker). React state — sin
 * libs nuevas (§1) y sin persistencia (§0-5).
 *
 * KIT SUP-4 (T3.2): añade el estado del VISOR DE ACTAS (modal por estado,
 * D17) — `visorActa` + acciones abrir/cerrar/navegar/cambiar — y el acta
 * actual, que llega SIEMPRE por `SupervisionRepository` (~400 ms, §0-9:
 * nada se lee directo del mock desde componentes). Las 2 acciones del
 * visor siguen el patrón vida-v1: spinner 2.5 s → notificación + toast +
 * efectos enlazados (anomalía revisada, D19). El modal se monta aquí
 * dentro (el shell no está en la whitelist del kit). */

/** Estado del visor (kit T3.2) + puestoId: el breadcrumb y el navegador
 * MESA n/N necesitan el puesto dueño de la mesa (ids de mesa se repiten
 * entre puestos). Desviación menor del kit, documentada en el REPORTE. */
export interface EstadoVisorActa {
  puestoId: string;
  mesaId: string | null;
  tipo: FormularioTipo;
  pagina: number;
  /** KIT feedback-ronda-1 — aterrizaje desde VER EN MONITOR (masiva): el
   *  visor abre LIMPIO — sin la información del acta en la cabecera (solo
   *  el botón de cerrar) y sin el panel de acciones. Solo lectura. */
  modoMonitor?: boolean;
}

interface EstadoDatos {
  cargando: boolean;
  puestos: Puesto[];
  mesasPorPuesto: Record<string, Mesa[]>;
  notificaciones: Notificacion[];
  anomalias: Anomalia[];
  /** Mesa con REINSPECCIONAR en curso (spinner del botón). */
  mesaEnAccionId: string | null;
}

/**
 * R4-C6 (reporte 02-b C2) — el contexto GRANDE se parte en DOS con valores
 * memoizados separados:
 *
 * · ContextoDatos — catálogo y filas (EstadoDatos + derivados). Su valor
 *   solo cambia con eventos REALES de datos (transición de vida, carga
 *   masiva, reinspección, publicación).
 * · ContextoAcciones — el VISOR (estado + acciones) y el resto de las
 *   acciones. Abrir/cerrar el visor, navegar MESA n/N, cargar un acta o
 *   pulsar Aprobar re-crea ESTE valor y SOLO re-renderiza a sus
 *   consumidores directos (visor, shell, vistas) — jamás a las 949 filas:
 *   PuestoRow/MesasSubtable ya no se suscriben a contexto alguno (llegan
 *   las acciones por props estables — puestos-table.tsx).
 */
interface DatosContexto extends EstadoDatos {
  resumen: ResumenGlobal;
  notificacionesNoLeidas: number;
  anomaliasAbiertas: number;
  /** Mesas CON acta de un puesto (en orden — alimenta MESA n/N). */
  mesasConActaDelPuesto: (puestoId: string) => Mesa[];
}

interface AccionesContexto {
  // ── KIT SUP-4 — estado del visor de actas (T3.2) ─────────────────────
  visorActa: EstadoVisorActa | null;
  /** El acta de la mesa abierta; null mientras carga o si no hay acta. */
  actaActual: ActaMesa | null;
  actaCargando: boolean;
  /** Acción del visor en curso (spinner 2.5 s en el botón — kit T5). */
  accionActaEnCurso: "aprobar" | "rescanear" | null;
  // ── Acciones de datos (T4/T5/T6) ─────────────────────────────────────
  reinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
  marcarNotificacionLeida: (id: string) => void;
  marcarTodasLeidas: () => void;
  marcarAnomaliaRevisada: (id: string) => void;
  // ── Acciones del visor (T3/T5) ───────────────────────────────────────
  abrirVisor: (
    puestoId: string,
    mesaId: string,
    opciones?: {
      tipo?: FormularioTipo;
      pagina?: number;
      modoMonitor?: boolean;
    }
  ) => void;
  /** 👁 de la fila de puesto: primera mesa con acta (T3.4). */
  abrirVisorDePuesto: (puestoId: string) => void;
  /** VER ACTA de una anomalía: aterriza en PÁGINA 2 si su advertencia
   * es de página 2 (mesa no COMPLETA) — T3.4. */
  abrirVisorDeAnomalia: (anomalia: Anomalia) => void;
  cerrarVisor: () => void;
  navegarMesa: (delta: 1 | -1) => void;
  cambiarTipo: (tipo: FormularioTipo) => void;
  cambiarPagina: (pagina: number) => void;
  /** T5 — APROBAR Y MARCAR COMO VÁLIDA (spinner 2.5 s + toast + efectos). */
  aprobarActaVisor: (observacion: string) => Promise<void>;
  /** T5 — CONFIRMAR RESCANEO (spinner 2.5 s + toast + versión 2). */
  confirmarRescanVisor: (observacion: string) => Promise<void>;
}

const ContextoDatos = createContext<DatosContexto | null>(null);
const ContextoAcciones = createContext<AccionesContexto | null>(null);

/** D42 — KIT e14-monitor-memo-v1: contexto HOJA del ticker de vida. Único
 *  consumidor: el chip «Sincronizado hace Xs» de la cabecera (ResumenChips
 *  lo recibe por prop desde monitor-global). Cualquier otro consumidor de
 *  `useDatos()` deja de re-renderizar cada 5 s. */
const ContextoTicker = createContext<{ segundos: number }>({ segundos: 0 });


/** Resumen (KPIs) derivado de una lista de puestos — invariante
 *  `total = completo + crítico + pendiente + no_iniciado` exacta. Exportado
 *  para que el monitor derive el resumen del DÍA seleccionado (kit
 *  monitor-jornada-v1) con la MISMA regla del store. */
export function resumenDePuestos(puestos: Puesto[]): ResumenGlobal {
  const resumen: ResumenGlobal = {
    total: puestos.length,
    completo: 0,
    critico: 0,
    pendiente: 0,
    noIniciado: 0,
  };
  for (const puesto of puestos) {
    if (puesto.estadoGlobal === "COMPLETO") resumen.completo += 1;
    if (puesto.estadoGlobal === "CRITICO") resumen.critico += 1;
    if (puesto.estadoGlobal === "PENDIENTE") resumen.pendiente += 1;
    if (puesto.estadoGlobal === "NO_INICIADO") resumen.noIniciado += 1;
  }
  return resumen;
}

export function DatosProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDatos>({
    cargando: true,
    puestos: [],
    mesasPorPuesto: {},
    notificaciones: [],
    anomalias: [],
    mesaEnAccionId: null,
  });
  // D42 — KIT e14-monitor-memo-v1: el ticker de vida vive en SU PROPIO
  // contexto hoja. Antes `segundosDesdeSync` viajaba en el estado grande →
  // cada tick de 5 s re-creaba el valor del contexto y re-reconciliaba las
  // 949 filas (~14k componentes) SOLO para el texto «Sincronizado hace Xs».
  // Ahora el único consumidor del segundo-contexto es el chip del ticker —
  // el contexto de DATOS solo cambia con eventos REALES (transiciones,
  // publicaciones, acciones) y el `valor` memoizado no invalida cada 5 s.
  const [segundosTicker, setSegundosTicker] = useState(0);
  // R9 (ola-3) — motivo de la init BLOQUEADA (banner simple y accesible).
  // null = catálogo válido (estado normal; jamás se pinta el banner).
  const [motivoBloqueo, setMotivoBloqueo] = useState<string | null>(null);

  // ── KIT SUP-4 — estado del visor de actas (T3.2) ─────────────────────
  const [visorActa, setVisorActa] = useState<EstadoVisorActa | null>(null);
  /** Última respuesta del repositorio (acta + a qué mesa pertenece): de
   * aquí se DERIVAN actaActual y actaCargando (evita setState sincrónico
   * en el effect — regla de lint del proyecto). */
  const [actaCargada, setActaCargada] = useState<{
    puestoId: string;
    mesaId: string;
    acta: ActaMesa | null;
  } | null>(null);
  const [accionActaEnCurso, setAccionActaEnCurso] = useState<
    "aprobar" | "rescanear" | null
  >(null);
  // ── Carga inicial (T2/T3): skeletons visibles durante la latencia ──────
  // (sin guard de una-sola-vez: StrictMode monta dos veces y la carga es
  // idempotente — cada instancia solo aplica su setState si sigue viva).
  useEffect(() => {
    let vivo = true;
    // R9 (ola-3) — ADOPCIÓN explícita de initSupervisionDatos() (C1/R3 +
    // propuesta R4, RESUMEN-ola-1 §4-3): el momento de carga deja de ser un
    // efecto perezoso de la primera lectura y pasa a ser ESTE mount.
    // IDEMPOTENTE (memoizada en el repo): StrictMode puede llamarla 2 veces.
    // Si la validación ESTRUCTURAL del catálogo falla el repo arranca VACÍO
    // (0 puestos, jamás un white-screen) y el motivo `BLOQUEADA: …` del
    // Result alimenta el banner de abajo — las lecturas siguen (devuelven
    // listas vacías) y la UI sigue servible.
    const resultadoInit = initSupervisionDatos();
    if (!resultadoInit.ok) {
      // setState diferido a microtask (misma regla de lint que C8/R4: nada
      // de setState sincrónico en el cuerpo del effect).
      queueMicrotask(() => {
        if (vivo) setMotivoBloqueo(resultadoInit.motivo);
      });
    }
    (async () => {
      const repo = mockSupervisionRepository;
      const [puestos, notificaciones, anomalias] = await Promise.all([
        repo.getPuestos(),
        repo.getNotificaciones(),
        repo.getAnomalias(),
      ]);
      const pares = await Promise.all(
        puestos.map(async (p) => [p.id, await repo.getMesasDePuesto(p.id)] as const)
      );
      if (!vivo) return;
      setEstado((prev) => ({
        ...prev,
        cargando: false,
        puestos,
        mesasPorPuesto: Object.fromEntries(pares),
        notificaciones,
        anomalias,
      }));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // ── Ticker de vida (T3): +5s cada 5s; a los 45s UNA transición ─────────
  // R4-C8 (reporte 02-b C3): la transición ya NO se dispara DENTRO del
  // updater de setSegundosTicker — StrictMode invoca los updaters 2 veces
  // (prueba de pureza) y la transición de vida se aplicaba DOS veces por
  // cada cruce del umbral. El cruce se detecta en el callback del
  // intervalo (sistema externo → setState en callback: el patrón que
  // React recomienda), con ref anti-doble-invoke y bandera de limpieza
  // (nada escribe estado tras el desmontaje).
  const aplicarTransicion = useCallback(async (vida?: { abortado: boolean }) => {
    const repo = mockSupervisionRepository;
    const transicion = await repo.aplicarTransicionVida();
    if (!transicion || vida?.abortado) return;
    const [puestos, mesas] = await Promise.all([
      repo.getPuestos(),
      repo.getMesasDePuesto(transicion.puestoId),
    ]);
    if (vida?.abortado) return;
    setEstado((prev) => ({
      ...prev,
      puestos,
      mesasPorPuesto: { ...prev.mesasPorPuesto, [transicion.puestoId]: mesas },
    }));
  }, []);

  /** Espejo del contador del ticker (fuente de la detección del cruce;
   * el state solo alimenta el chip «Sincronizado hace Xs»). */
  const segundosRef = useRef(0);
  /** R4-C8 — UNA transición en vuelo (anti-doble-invoke). */
  const transicionEnVueloRef = useRef(false);

  useEffect(() => {
    if (estado.cargando) return;
    const vida = { abortado: false };
    const intervalo = setInterval(() => {
      // D39 — pausa de la simulación con la pestaña oculta: cada tick sin
      // espectador era un re-render completo de 949 filas (CPU/batería en
      // gama baja, y ráfagas encoladas al volver). Al reabrir, el ticker
      // sigue desde donde quedó — el navegador ya estrangula timers en
      // background; esto elimina el trabajo residual que quedaba.
      if (typeof document !== "undefined" && document.hidden) return;
      const siguientes = segundosRef.current + TICKER_SEGUNDOS;
      if (siguientes >= TRANSICION_CADA_SEGUNDOS) {
        segundosRef.current = 0;
        setSegundosTicker(0);
        if (!transicionEnVueloRef.current) {
          transicionEnVueloRef.current = true;
          void aplicarTransicion(vida).finally(() => {
            transicionEnVueloRef.current = false;
          });
        }
      } else {
        segundosRef.current = siguientes;
        setSegundosTicker(siguientes);
      }
    }, TICKER_SEGUNDOS * 1000);
    return () => {
      clearInterval(intervalo);
      vida.abortado = true;
    };
  }, [estado.cargando, aplicarTransicion]);

  // ── T4 — REINSPECCIONAR (spinner ~2.5s en el botón) ────────────────────
  const reinspeccionar = useCallback(async (puestoId: string, mesaId: string) => {
    setEstado((prev) => ({ ...prev, mesaEnAccionId: mesaId }));
    try {
      const repo = mockSupervisionRepository;
      const resultado = await repo.resolverRescaneo(puestoId, mesaId);
      if (resultado) {
        const puestos = await repo.getPuestos();
        setEstado((prev) => {
          const actuales = prev.mesasPorPuesto[puestoId] ?? [];
          return {
            ...prev,
            puestos,
            mesasPorPuesto: {
              ...prev.mesasPorPuesto,
              [puestoId]: actuales.map((m) =>
                m.id === resultado.mesa.id ? resultado.mesa : m
              ),
            },
            notificaciones: [resultado.notificacion, ...prev.notificaciones],
          };
        });
        toast.success(resultado.notificacion.texto);
      }
    } finally {
      setEstado((prev) => ({ ...prev, mesaEnAccionId: null }));
    }
  }, []);

  // ── KIT carga-masiva-supervision-v1 (D27) — publicaciones del
  // digitalizador: cada acta que la CARGA MASIVA envía aterriza aquí → el
  // repo actualiza la mesa (partes + KPIs derivados) y el monitor la refleja
  // en vivo, junto con la notificación del evento. Patrón idéntico a
  // reinspeccionar (el store del shell manda — kit SUP-3 T4).
  useEffect(() => {
    const repo = mockSupervisionRepository;
    const desuscribir = suscribirseActasRuntime(async (evento) => {
      const resultado = await repo.registrarCargaMasiva(
        evento.idEnlace,
        evento.mesa,
        evento.formulario,
        evento.paginas
      );
      if (!resultado) return;
      const puestos = await repo.getPuestos();
      setEstado((prev) => ({
        ...prev,
        puestos,
        mesasPorPuesto: {
          ...prev.mesasPorPuesto,
          [evento.idEnlace]:
            prev.mesasPorPuesto[evento.idEnlace]?.map((m) =>
              m.id === resultado.mesa.id ? resultado.mesa : m
            ) ?? [resultado.mesa],
        },
        notificaciones: [resultado.notificacion, ...prev.notificaciones],
      }));
      toast.success(resultado.notificacion.texto);
    });
    return desuscribir;
  }, []);

  // ── T5/T6 — estado de lectura/revisión (solo UI, sin persistencia) ─────
  const marcarNotificacionLeida = useCallback((id: string) => {
    setEstado((prev) => ({
      ...prev,
      notificaciones: prev.notificaciones.map((n) =>
        n.id === id ? { ...n, leida: true } : n
      ),
    }));
  }, []);

  const marcarTodasLeidas = useCallback(() => {
    setEstado((prev) => ({
      ...prev,
      notificaciones: prev.notificaciones.map((n) => ({ ...n, leida: true })),
    }));
  }, []);

  const marcarAnomaliaRevisada = useCallback((id: string) => {
    setEstado((prev) => ({
      ...prev,
      anomalias: prev.anomalias.map((a) =>
        a.id === id ? { ...a, revisada: true } : a
      ),
    }));
  }, []);

  // ── KIT SUP-4 — visor de actas: carga por contrato async (§0-9) ───────
  const puestoIdVisor = visorActa?.puestoId ?? null;
  const mesaIdVisor = visorActa?.mesaId ?? null;
  useEffect(() => {
    if (!puestoIdVisor || !mesaIdVisor) return;
    let vivo = true;
    (async () => {
      const acta = await mockSupervisionRepository.getActaDeMesa(
        puestoIdVisor,
        mesaIdVisor
      );
      if (!vivo) return;
      setActaCargada({ puestoId: puestoIdVisor, mesaId: mesaIdVisor, acta });
    })();
    return () => {
      vivo = false;
    };
  }, [puestoIdVisor, mesaIdVisor]);

  // R4-M7 — espejo del visor en location.hash: escritura en cada cambio y
  // restauración UNA vez, recién terminada la carga (ref anti-doble-invoke
  // + setState diferido a microtask — misma regla de lint que C8). El hash
  // JAMÁS inventa estado: puesto y mesa se validan contra el catálogo ya
  // cargado; un enlace viejo/foráneo se ignora en silencio.
  const visorRestauradoRef = useRef(false);
  useEffect(() => {
    if (estado.cargando || visorRestauradoRef.current) return;
    visorRestauradoRef.current = true;
    const { visor } = leerEstadoHash();
    if (!visor) return;
    queueMicrotask(() => {
      const existePuesto = estado.puestos.some((p) => p.id === visor.puestoId);
      const existeMesa =
        visor.mesaId !== null &&
        (estado.mesasPorPuesto[visor.puestoId] ?? []).some(
          (m) => m.id === visor.mesaId
        );
      if (!existePuesto || (visor.mesaId !== null && !existeMesa)) return;
      setVisorActa({
        puestoId: visor.puestoId,
        mesaId: visor.mesaId,
        tipo: visor.tipo ?? "TRANSMISION",
        pagina: visor.pagina ?? 1,
      });
    });
  }, [estado.cargando, estado.puestos, estado.mesasPorPuesto]);

  // R4-M7 — espejo de escritura del visor (merge con las otras claves).
  useEffect(() => {
    escribirHashParcial({
      visor: visorActa
        ? {
            puestoId: visorActa.puestoId,
            mesaId: visorActa.mesaId,
            tipo: visorActa.tipo,
            pagina: visorActa.pagina,
          }
        : null,
    });
  }, [visorActa]);

  // Derivaciones: ¿la respuesta en memoria corresponde a la mesa abierta?
  const actaAlDia =
    actaCargada !== null &&
    actaCargada.puestoId === (visorActa?.puestoId ?? "") &&
    actaCargada.mesaId === (visorActa?.mesaId ?? "");
  const actaCargando = visorActa !== null && !actaAlDia;
  const actaActual = visorActa !== null && actaAlDia ? actaCargada!.acta : null;

  const abrirVisor = useCallback(
    (
      puestoId: string,
      mesaId: string,
      opciones?: {
        tipo?: FormularioTipo;
        pagina?: number;
        modoMonitor?: boolean;
      }
    ) => {
      setVisorActa({
        puestoId,
        mesaId,
        tipo: opciones?.tipo ?? "TRANSMISION",
        pagina: opciones?.pagina ?? 1,
        modoMonitor: opciones?.modoMonitor,
      });
    },
    []
  );

  const cerrarVisor = useCallback(() => setVisorActa(null), []);

  const mesasConActaDelPuesto = useCallback(
    (puestoId: string) =>
      (estado.mesasPorPuesto[puestoId] ?? []).filter(tieneActa),
    [estado.mesasPorPuesto]
  );

  const abrirVisorDePuesto = useCallback(
    (puestoId: string) => {
      const primera = (estado.mesasPorPuesto[puestoId] ?? []).find(tieneActa);
      if (primera) abrirVisor(puestoId, primera.id);
    },
    [estado.mesasPorPuesto, abrirVisor]
  );

  const abrirVisorDeAnomalia = useCallback(
    (anomalia: Anomalia) => {
      if (!anomalia.mesaId) return;
      const mesa = (estado.mesasPorPuesto[anomalia.puestoId] ?? []).find(
        (m) => m.id === anomalia.mesaId
      );
      if (!mesa || !tieneActa(mesa)) return;
      // La advertencia del acta es de PÁGINA 2 cuando la mesa no está
      // COMPLETA (su P2 es ADVERTENCIA o PENDIENTE) — kit T3.4.
      abrirVisor(anomalia.puestoId, anomalia.mesaId, {
        tipo: "TRANSMISION",
        pagina: mesa.estadoMesa === "COMPLETO" ? 1 : 2,
      });
    },
    [estado.mesasPorPuesto, abrirVisor]
  );

  const navegarMesa = useCallback(
    (delta: 1 | -1) => {
      setVisorActa((prev) => {
        if (!prev) return prev;
        const lista = (estado.mesasPorPuesto[prev.puestoId] ?? []).filter(
          tieneActa
        );
        const indice = lista.findIndex((m) => m.id === prev.mesaId);
        const siguiente = lista[indice + delta];
        if (!siguiente) return prev;
        // El tipo se conserva; DELEGADOS solo tiene 1 página.
        return {
          ...prev,
          mesaId: siguiente.id,
          pagina: prev.tipo === "DELEGADOS" ? 1 : prev.pagina,
        };
      });
    },
    [estado.mesasPorPuesto]
  );

  const cambiarTipo = useCallback((tipo: FormularioTipo) => {
    setVisorActa((prev) => (prev ? { ...prev, tipo, pagina: 1 } : prev));
  }, []);

  const cambiarPagina = useCallback(
    (pagina: number) => {
      setVisorActa((prev) => {
        if (!prev) return prev;
        // BLOQUEADA-1 resuelta (actas-reales-v2 / D44): el techo de páginas
        // es el largo REAL del formulario del acta ABIERTA (el CÓNSUL/
        // EMBAJADOR real trae 2 páginas — D26/D44; el supuesto «DELEGADOS
        // = 1 página» del kit SUP-4 quedó atrás). Sin acta cargada aún →
        // techo 1 (conservador; el clamp se afloja al aterrizar el acta).
        const propia =
          actaCargada !== null &&
          actaCargada.acta !== null &&
          actaCargada.puestoId === prev.puestoId &&
          actaCargada.mesaId === prev.mesaId
            ? actaCargada.acta.formularios[prev.tipo]
            : null;
        const maxima = Math.max(1, propia?.length ?? 1);
        return { ...prev, pagina: Math.min(Math.max(1, pagina), maxima) };
      });
    },
    [actaCargada]
  );

  // ── KIT SUP-4 — acciones del visor (patrón vida-v1, D19) ─────────────
  const aprobarActaVisor = useCallback(
    async (observacion: string) => {
      if (!actaActual || accionActaEnCurso) return;
      setAccionActaEnCurso("aprobar");
      try {
        const resultado = await mockSupervisionRepository.aprobarActa(
          actaActual.id,
          observacion
        );
        if (resultado) {
          setActaCargada((prev) => (prev ? { ...prev, acta: resultado.acta } : prev));
          setEstado((prev) => ({
            ...prev,
            notificaciones: [resultado.notificacion, ...prev.notificaciones],
            anomalias: resultado.anomalia
              ? prev.anomalias.map((a) =>
                  a.id === resultado.anomalia!.id ? resultado.anomalia! : a
                )
              : prev.anomalias,
          }));
          toast.success("Acta marcada como válida");
        }
      } finally {
        setAccionActaEnCurso(null);
      }
    },
    [actaActual, accionActaEnCurso]
  );

  const confirmarRescanVisor = useCallback(
    async (observacion: string) => {
      if (!actaActual || accionActaEnCurso) return;
      setAccionActaEnCurso("rescanear");
      try {
        const resultado = await mockSupervisionRepository.confirmarRescanActa(
          actaActual.id,
          observacion
        );
        if (resultado) {
          setActaCargada((prev) => (prev ? { ...prev, acta: resultado.acta } : prev));
          setEstado((prev) => ({
            ...prev,
            notificaciones: [resultado.notificacion, ...prev.notificaciones],
          }));
          toast.success("Rescan confirmado y recibido");
        }
      } finally {
        setAccionActaEnCurso(null);
      }
    },
    [actaActual, accionActaEnCurso]
  );

  const resumen = useMemo(
    () => resumenDePuestos(estado.puestos),
    [estado.puestos]
  );
  const notificacionesNoLeidas = useMemo(
    () => estado.notificaciones.filter((n) => !n.leida).length,
    [estado.notificaciones]
  );
  const anomaliasAbiertas = useMemo(
    () => estado.anomalias.filter((a) => !a.revisada).length,
    [estado.anomalias]
  );

  // D42 — KIT e14-monitor-memo-v1: los DOS valores van MEMOIZADOS — con el
  // ticker fuera del estado grande y TODAS las acciones en useCallback
  // estable, la identidad de cada contexto solo cambia con sus propios
  // eventos (R4-C6): el de DATOS con eventos reales de catálogo, el de
  // ACCIONES con el flujo del visor/acciones — que ya no alcanza a las
  // filas (los callbacks que éstas reciben son estables durante el flujo
  // del visor y viajan por props).
  const valorDatos: DatosContexto = useMemo(
    () => ({
      ...estado,
      resumen,
      notificacionesNoLeidas,
      anomaliasAbiertas,
      mesasConActaDelPuesto,
    }),
    [estado, resumen, notificacionesNoLeidas, anomaliasAbiertas, mesasConActaDelPuesto]
  );

  const valorAcciones: AccionesContexto = useMemo(
    () => ({
      visorActa,
      actaActual,
      actaCargando,
      accionActaEnCurso,
      reinspeccionar,
      marcarNotificacionLeida,
      marcarTodasLeidas,
      marcarAnomaliaRevisada,
      abrirVisor,
      abrirVisorDePuesto,
      abrirVisorDeAnomalia,
      cerrarVisor,
      navegarMesa,
      cambiarTipo,
      cambiarPagina,
      aprobarActaVisor,
      confirmarRescanVisor,
    }),
    [
      visorActa,
      actaActual,
      actaCargando,
      accionActaEnCurso,
      reinspeccionar,
      marcarNotificacionLeida,
      marcarTodasLeidas,
      marcarAnomaliaRevisada,
      abrirVisor,
      abrirVisorDePuesto,
      abrirVisorDeAnomalia,
      cerrarVisor,
      navegarMesa,
      cambiarTipo,
      cambiarPagina,
      aprobarActaVisor,
      confirmarRescanVisor,
    ],
  );

  const valorTicker = useMemo(() => ({ segundos: segundosTicker }), [segundosTicker]);

  return (
    <ContextoDatos.Provider value={valorDatos}>
      <ContextoAcciones.Provider value={valorAcciones}>
        <ContextoTicker.Provider value={valorTicker}>
          {/* R9 (ola-3) — banner BLOQUEADA (propuesta R4, RESUMEN-ola-1
              §4-3): visible en TODAS las vistas mientras la init del
              catálogo haya fallado. UX conservadora: sin rediseño, un
              bloque de texto con el motivo verbatim del Result. role="alert"
              lo anuncia una vez al insertarse (aparece tras el mount). */}
          {motivoBloqueo !== null && (
            <div
              role="alert"
              className="border-b border-(--warning) bg-card px-4 py-2.5 md:px-6"
            >
              <p className="body-md font-semibold text-(--warning)">
                Datos de supervisión no disponibles
              </p>
              <p className="body-md mt-0.5 text-muted-foreground">
                {motivoBloqueo} — el monitor arranca sin filas hasta que el
                catálogo vuelva a ser válido.
              </p>
            </div>
          )}
          {children}
          {/* KIT SUP-4 — el visor de actas es un modal por estado (D17): se
              monta desde el store del módulo (estado visorActa). */}
          <ActaViewerModal />
        </ContextoTicker.Provider>
      </ContextoAcciones.Provider>
    </ContextoDatos.Provider>
  );
}

/**
 * R4-C6 — catálogo y filas (EstadoDatos + derivados). Las filas de la
 * matriz NO deben consumir ni siquiera este hook: sus datos ya llegan por
 * props y sus acciones por props estables desde `useDatosAcciones()`.
 */
export function useDatos(): DatosContexto {
  const ctx = useContext(ContextoDatos);
  if (!ctx) {
    throw new Error("useDatos debe usarse dentro de <DatosProvider>");
  }
  return ctx;
}

/** R4-C6 — visor (estado + acciones) y acciones del módulo. Consumidores
 *  legítimos: shell, vistas y el visor de actas — NUNCA una fila memoizada. */
export function useDatosAcciones(): AccionesContexto {
  const ctx = useContext(ContextoAcciones);
  if (!ctx) {
    throw new Error("useDatosAcciones debe usarse dentro de <DatosProvider>");
  }
  return ctx;
}

/** D42 — segundos del ticker de vida (contexto hoja): SOLO el chip de la
 *  cabecera lo consume — nadie más re-renderiza cada 5 s. */
export function useDatosTicker(): { segundos: number } {
  return useContext(ContextoTicker);
}
