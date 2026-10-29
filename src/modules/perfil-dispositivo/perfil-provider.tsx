"use client";

/**
 * KIT perfil-recursos-v1 — provider + hook del perfil de recursos.
 *
 * CICLO (hydration-safe — cero mismatch):
 * 1. SSR/primer render: perfil PENDIENTE (listo=false) — determinista.
 * 2. useEffect (montaje): pase SYNC (navigator/GPU/WASM/forma) → tier
 *    provisional + clasificación §4.4. setState post-montaje (nunca
 *    durante el render — no hay mismatch).
 * 3. Pase ASYNC (batería + storage) → re-clasificación (puede BAJAR a
 *    BAJO por batería/storage — misma semántica de refrescarPlanGama).
 * 4. Benchmark en idle (requestIdleCallback → fallback setTimeout) →
 *    evidencia (no decide el tier v1).
 *
 * usePerfilRecursos(): { perfil, plan, refrescar, midiendo }
 * · refrescar(): re-corre los 4 pasos (botón del panel).
 * · plan = planRecomendado(tier) — catálogo D6-safe para consumidores.
 *
 * Jamás lanza: todo el ciclo está blindado — un fallo de detección deja
 * el perfil PENDIENTE/MEDIO sin romper la app.
 */
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
import type {
  BenchmarkResultado,
  PerfilRecursos,
  PlanRecursos,
} from "./domain/tipos";
import { BENCHMARK_SIN_EJECUTAR, ejecutarBenchmark } from "./lib/benchmark";
// KIT autonomia-ui-v1 (D44) — la autonomía de UI/arranque corre en TODA la
// app (el provider envuelve el shell público también): animaciones por gama
// + precarga del motor OCR en idle. Acotada y revocable (uiAdaptativaGama).
import { aplicarAutonomiaUi } from "./lib/autonomia";
import { clasificar, confianzaDe } from "./lib/clasificador";
import { planRecomendado } from "./lib/recomendaciones";
import {
  detectarForma,
  hayEntornoNavegador,
  recolectarAsync,
  recolectarSync,
  sondearGpu,
  sondearRuntime,
} from "./lib/senales";

/** Async vacío del pase provisional (batería/storage llegan al segundo pase). */
const PERFIL_VACIO_ASYNC = {
  bateriaNivel: null,
  bateriaCargando: null,
  storageTotalMB: null,
  storageUsadoMB: null,
  storageLibreMB: null,
} as const;

const PERFIL_PENDIENTE: PerfilRecursos = {
  listo: false,
  tier: "PENDIENTE",
  tierInferido: false,
  confianza: "pendiente",
  confianzaPct: 0,
  evidencia: [],
  senales: null,
  benchmark: BENCHMARK_SIN_EJECUTAR,
};

interface PerfilContexto {
  perfil: PerfilRecursos;
  plan: PlanRecursos;
  /** Re-corre la detección completa (botón Re-detectar). */
  refrescar: () => void;
  /** true durante un pase de detección/benchmark en curso. */
  midiendo: boolean;
}

const Ctx = createContext<PerfilContexto | null>(null);

/** schedule en idle — requestIdleCallback con fallback honesto. */
function enIdle(fn: () => void): () => void {
  try {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(fn, { timeout: 2000 });
      return () => {
        try {
          w.cancelIdleCallback?.(id);
        } catch {
          /* no crítico */
        }
      };
    }
  } catch {
    /* fallback */
  }
  const id = window.setTimeout(fn, 1200);
  return () => window.clearTimeout(id);
}

export function PerfilProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<PerfilRecursos>(PERFIL_PENDIENTE);
  const [midiendo, setMidiendo] = useState(false);
  const cancelIdleRef = useRef<(() => void) | null>(null);
  const montadoRef = useRef(false);

  /** Pase SYNC + ASYNC + clasificación (sin benchmark). */
  const detectar = useCallback(async () => {
    try {
      if (!hayEntornoNavegador()) return;
      const sync = recolectarSync();
      const gpu = sondearGpu();
      const runtime = sondearRuntime();
      const forma = detectarForma(sync);
      const senalesSync = { sync, async: PERFIL_VACIO_ASYNC, gpu, runtime, forma };
      // 1) provisional sync (inmediato — la UI no espera la batería)
      const c1 = clasificar(senalesSync, perfil.benchmark);
      setPerfil({
        listo: true,
        tier: c1.tier,
        tierInferido: c1.tierInferido,
        confianza: confianzaDe(c1.confianzaPct),
        confianzaPct: c1.confianzaPct,
        evidencia: c1.evidencia,
        senales: senalesSync,
        benchmark: perfil.benchmark,
      });
      // 2) pase async (batería + storage — puede BAJAR el tier)
      const async_ = await recolectarAsync();
      const senales = { sync, async: async_, gpu, runtime, forma };
      const c2 = clasificar(senales, perfil.benchmark);
      setPerfil({
        listo: true,
        tier: c2.tier,
        tierInferido: c2.tierInferido,
        confianza: confianzaDe(c2.confianzaPct),
        confianzaPct: c2.confianzaPct,
        evidencia: c2.evidencia,
        senales,
        benchmark: perfil.benchmark,
      });
    } catch {
      /* la detección jamás tumba la app — el perfil queda como esté */
    }
  }, [perfil.benchmark]);

  /** Benchmark en idle → actualiza la evidencia. */
  const programarBenchmark = useCallback((alTerminar?: (b: BenchmarkResultado) => void) => {
    try {
      if (!hayEntornoNavegador()) return;
      cancelIdleRef.current?.();
      cancelIdleRef.current = enIdle(async () => {
        try {
          setMidiendo(true);
          const b = await ejecutarBenchmark();
          setPerfil((p) => (p.senales ? { ...p, benchmark: b } : p));
          alTerminar?.(b);
        } catch {
          /* silencioso */
        } finally {
          setMidiendo(false);
        }
      });
    } catch {
      /* silencioso */
    }
  }, []);

  // Ciclo de arranque: sync+async al montar, benchmark en idle.
  useEffect(() => {
    if (montadoRef.current) return; // StrictMode-safe (el shell lo desactiva, pero por si acaso)
    montadoRef.current = true;
    void detectar();
    programarBenchmark();
    return () => {
      cancelIdleRef.current?.();
      cancelIdleRef.current = null;
    };
    // Montaje único (guard por ref) — el ciclo de pases no depende de props.
  }, []);

  const refrescar = useCallback(() => {
    try {
      void detectar();
      programarBenchmark();
    } catch {
      /* silencioso */
    }
  }, [detectar, programarBenchmark]);

  const plan = useMemo(
    () => planRecomendado(perfil.tier === "PENDIENTE" ? "MEDIO" : perfil.tier, perfil.senales),
    [perfil.tier, perfil.senales],
  );

  // KIT autonomia-ui-v1 (D44) — al tener el perfil listo, la app APLICA la
  // autonomía de UI/arranque del plan (animaciones por gama + precarga OCR
  // en idle). Efecto cliente post-montaje (hydration-safe — igual que la
  // detección); idempotente; jamás lanza (try/catch total en el kit).
  useEffect(() => {
    if (!perfil.listo) return;
    aplicarAutonomiaUi(plan);
  }, [perfil.listo, plan]);

  const valor = useMemo<PerfilContexto>(
    () => ({ perfil, plan, refrescar, midiendo }),
    [perfil, plan, refrescar, midiendo],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Consumidor del perfil — lanza si se usa fuera del provider (error de cable). */
export function usePerfilRecursos(): PerfilContexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePerfilRecursos fuera de PerfilProvider");
  return ctx;
}
