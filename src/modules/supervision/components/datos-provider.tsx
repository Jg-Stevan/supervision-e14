"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  mockSupervisionRepository,
  TICKER_SEGUNDOS,
  TRANSICION_CADA_SEGUNDOS,
} from "../data/mock-repository";
import type {
  Anomalia,
  Mesa,
  Notificacion,
  Puesto,
  ResumenGlobal,
} from "../domain/types";

/**
 * Store cliente del shell (kit SUP-3 T4: «los datos viven en el store
 * client del shell»). Carga el mock async (D12) con skeletons en T3 y
 * expone las mutaciones de T4 + la vida de T3 (ticker). React state — sin
 * libs nuevas (§1) y sin persistencia (§0-5).
 */

interface EstadoDatos {
  cargando: boolean;
  puestos: Puesto[];
  mesasPorPuesto: Record<string, Mesa[]>;
  notificaciones: Notificacion[];
  anomalias: Anomalia[];
  /** Ticker T3: segundos desde la última sincronización (avanza de 5 en 5). */
  segundosDesdeSync: number;
  /** Mesa con REINSPECCIONAR en curso (spinner del botón). */
  mesaEnAccionId: string | null;
}

interface AccionesDatos {
  reinspeccionar: (puestoId: string, mesaId: string) => Promise<void>;
  notificar: (puestoId: string, mesaId: string) => Promise<void>;
  marcarNotificacionLeida: (id: string) => void;
  marcarTodasLeidas: () => void;
  marcarAnomaliaRevisada: (id: string) => void;
}

interface DatosContexto extends EstadoDatos, AccionesDatos {
  resumen: ResumenGlobal;
  notificacionesNoLeidas: number;
  anomaliasAbiertas: number;
}

const Contexto = createContext<DatosContexto | null>(null);


function resumenDePuestos(puestos: Puesto[]): ResumenGlobal {
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
    segundosDesdeSync: 0,
    mesaEnAccionId: null,
  });
  // ── Carga inicial (T2/T3): skeletons visibles durante la latencia ──────
  // (sin guard de una-sola-vez: StrictMode monta dos veces y la carga es
  // idempotente — cada instancia solo aplica su setState si sigue viva).
  useEffect(() => {
    let vivo = true;
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
  const aplicarTransicion = useCallback(async () => {
    const repo = mockSupervisionRepository;
    const transicion = await repo.aplicarTransicionVida();
    if (!transicion) return;
    const [puestos, mesas] = await Promise.all([
      repo.getPuestos(),
      repo.getMesasDePuesto(transicion.puestoId),
    ]);
    setEstado((prev) => ({
      ...prev,
      puestos,
      mesasPorPuesto: { ...prev.mesasPorPuesto, [transicion.puestoId]: mesas },
    }));
  }, []);

  useEffect(() => {
    if (estado.cargando) return;
    const intervalo = setInterval(() => {
      setEstado((prev) => {
        const segundos = prev.segundosDesdeSync + TICKER_SEGUNDOS;
        if (segundos >= TRANSICION_CADA_SEGUNDOS) {
          void aplicarTransicion();
          return { ...prev, segundosDesdeSync: 0 };
        }
        return { ...prev, segundosDesdeSync: segundos };
      });
    }, TICKER_SEGUNDOS * 1000);
    return () => clearInterval(intervalo);
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

  // ── T4 — NOTIFICAR (el estado de la mesa no cambia) ────────────────────
  const notificar = useCallback(async (puestoId: string, mesaId: string) => {
    const notificacion = await mockSupervisionRepository.notificarMesa(puestoId, mesaId);
    setEstado((prev) => ({
      ...prev,
      notificaciones: [notificacion, ...prev.notificaciones],
    }));
    toast.success(notificacion.texto);
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

  const valor: DatosContexto = {
    ...estado,
    resumen,
    notificacionesNoLeidas,
    anomaliasAbiertas,
    reinspeccionar,
    notificar,
    marcarNotificacionLeida,
    marcarTodasLeidas,
    marcarAnomaliaRevisada,
  };

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDatos(): DatosContexto {
  const ctx = useContext(Contexto);
  if (!ctx) {
    throw new Error("useDatos debe usarse dentro de <DatosProvider>");
  }
  return ctx;
}
