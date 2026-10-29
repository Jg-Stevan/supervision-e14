"use client";

/**
 * KIT puente-remoto-v1 — POLLER del hub de actas remotas (hook cliente).
 *
 * CICLO: timeout inicial de 800 ms → PRIMERA sincronización con
 * `desde=0` (trae TODO el histórico del hub y lo publica — idempotente
 * por hash: repuebla el runtime de monitor/recepción tras recargar la
 * página); luego `setInterval` de 8000 ms. Cada ciclo llama
 * `sincronizarRemota()` (módulo puente-remoto) que trae SOLO lo nuevo
 * (`desde=último ts`) y lo inyecta por `publicarActaMasiva`.
 *
 * HIGIENE: un ciclo se ejecuta SOLO si (a) la pestaña está visible
 * (`document.hidden`) y (b) no hay otra sincronización en curso (flag
 * ref — el botón manual usa el MISMO guardia). Timers limpiados en el
 * cleanup del efecto. Sin libs nuevas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { sincronizarRemota } from "../data/puente-remoto";

/** Estado observable del puente para la UI (badge del sidebar). */
export interface EstadoPuenteRemoto {
  /** Última sincronización contactó al hub (fetch directo). */
  conectado: boolean;
  /** Actas nuevas vistas en la ÚLTIMA sincronización. */
  nuevas: number;
  /** Actas publicadas en el runtime en la ÚLTIMA sincronización. */
  publicadas: number;
  /** Último error de conexión (null si la última sync fue OK). */
  ultimoError: string | null;
  /** Fecha/hora de la última sincronización terminada. */
  ultimaSync: Date | null;
  /** Hay una sincronización en curso (poll o manual). */
  sincronizando: boolean;
}

const INTERVALO_MS = 8000;
const PRIMERA_SYNC_MS = 800;

export function usePuenteRemoto(): EstadoPuenteRemoto & {
  sincronizarAhora: () => void;
} {
  const [estado, setEstado] = useState<EstadoPuenteRemoto>({
    conectado: false,
    nuevas: 0,
    publicadas: 0,
    ultimoError: null,
    ultimaSync: null,
    sincronizando: false,
  });

  // Guardia anti-reentrada: un solo ciclo a la vez (poll y manual
  // comparten el flag). El módulo puente-remoto es idempotente por
  // hash, pero no hace falta martillar el hub.
  const enCurso = useRef(false);
  const vivo = useRef(true);

  const sincronizar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setEstado((previo) => ({ ...previo, sincronizando: true }));
    try {
      const resumen = await sincronizarRemota();
      if (!vivo.current) return;
      setEstado({
        conectado: resumen.conectado,
        nuevas: resumen.nuevas,
        publicadas: resumen.publicadas,
        ultimoError: resumen.error,
        ultimaSync: new Date(),
        sincronizando: false,
      });
    } finally {
      enCurso.current = false;
    }
  }, []);

  // Botón manual del bloque del sidebar (mismo guardia del poller).
  const sincronizarAhora = useCallback(() => {
    void sincronizar();
  }, [sincronizar]);

  useEffect(() => {
    vivo.current = true;
    // Primera sync: 800 ms tras montar — repuebla el histórico.
    const inicial = setTimeout(() => void sincronizar(), PRIMERA_SYNC_MS);
    // Polling: solo con la pestaña visible y sin sync en curso.
    const intervalo = setInterval(() => {
      if (document.hidden) return;
      void sincronizar();
    }, INTERVALO_MS);
    return () => {
      vivo.current = false;
      clearTimeout(inicial);
      clearInterval(intervalo);
    };
  }, [sincronizar]);

  return { ...estado, sincronizarAhora };
}
