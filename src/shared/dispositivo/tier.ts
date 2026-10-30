/**
 * Capa shared (R2) — reglas de tier §4.4 ÚNICAS (reporte 04 §B2 #1,
 * quick-win 6 de la misión R2).
 *
 * Hoy las reglas viven DUPLICADAS y ya DESINCRONIZADAS en el borde
 * `nucleos=null` (§B3 #1):
 *   · obs/dispositivo.ts:136-161 — `nucleos` SIEMPRE number (default 1 en
 *     nucleosDel) → null/nucleos≤2 CONDENA a BAJO.
 *   · perfil-dispositivo/lib/clasificador.ts:194-212 — `nucleos!==null`
 *     NO condena (null honesto).
 *   · gama.ts:345-360 (tierSyncDe) — 3er consumidor, alimenta el dispositivo
 *     por su variante (default 1).
 *
 * CANÓNICA = la de perfil-dispositivo (decisión de la misión R2): es la
 * fuente del §4.4 documentada («null no condena» — solo con el dato presente
 * se condena) y null-honest de punta a punta. El delta del borde
 * `nucleos=null` (dispositivo: BAJO por default 1 vs canónica: no condena →
 * MEDIO INFERIDO) queda fijado como EXPECTED-DIFF en el test de paridad
 * (test explícito del delta con comentario — NO se corrige aquí: adoptar la
 * canónica en obs/dispositivo.ts cambia un veredicto de borde y es decisión
 * del dueño; §B5 (4) la lista como el fix planeado).
 *
 * COPIA «mover sin cambiar» del cuerpo de clasificador.ts:194-212 (mismo
 * orden de cortocircuito); las condiciones ya no anidan en `s.sync.*`.
 * `shared/` NUNCA importa de `modules/`. Jamás lanza.
 */

/** Tier del contrato §4.4 (los 3 REALES — "PENDIENTE" es estado de UI del
 *  panel perfil-dispositivo y vive en su dominio, no aquí). */
export type Tier = "ALTO" | "MEDIO" | "BAJO";

/** Entrada null-honest (superset de EntradaTier de obs/dispositivo.ts: los
 *  callers que pasan `nucleos: number` / `saveData: boolean` siguen
 *  tipando — el estrechado es compatible). */
export interface EntradaTier {
  memoriaGB: number | null; // deviceMemory — null en iOS/Safari
  nucleos: number | null; // hardwareConcurrency — null honesto (canónica)
  saveData: boolean | null;
  bateriaNivel: number | null; // 0..1
  bateriaCargando: boolean | null;
  storageLibreMB: number | null;
  redTipo: string | null; // effectiveType: slow-2g|2g|3g|4g
  redWifi: boolean | null;
  heapLimitMB: number | null;
}

export interface ResultadoTier {
  tier: Tier;
  tierInferido: boolean;
}

/** Reglas §4.4 — CANÓNICA (variante perfil-dispositivo): BAJO por
 *  CUALQUIER señal débil SOLO con el dato presente (null NO condena);
 *  ALTO exige deviceMemory real ≥ 4 ∧ núcleos ≥ 6 ∧ red 4g/wifi; sin
 *  deviceMemory (iOS) se INFERE por núcleos ≥ 6 + heap ≥ 2048 MB y
 *  tierInferido=true. MEDIO el resto. Jamás lanza. */
export function calcularTier(e: EntradaTier): ResultadoTier {
  // ── decisión §4.4 (PARIDAD EXACTA — mismo orden de cortocircuito) ──
  let tier: Tier;
  let tierInferido = false;
  if (e.memoriaGB !== null && e.memoriaGB < 2) tier = "BAJO";
  else if (e.nucleos !== null && e.nucleos <= 2) tier = "BAJO";
  else if (e.saveData === true) tier = "BAJO";
  else if (e.bateriaNivel !== null && e.bateriaNivel < 0.2 && e.bateriaCargando === false)
    tier = "BAJO";
  else if (e.storageLibreMB !== null && e.storageLibreMB < 500) tier = "BAJO";
  else if (e.memoriaGB !== null) {
    // saveData===true ya cortó a BAJO más arriba (§4.4).
    if (e.memoriaGB >= 4 && (e.nucleos ?? 0) >= 6 && (e.redTipo === "4g" || e.redWifi === true))
      tier = "ALTO";
    else tier = "MEDIO";
  } else if ((e.nucleos ?? 0) >= 6 && (e.heapLimitMB ?? 0) >= 2048) {
    tier = "ALTO";
    tierInferido = true;
  } else {
    tier = "MEDIO";
    tierInferido = true;
  }
  return { tier, tierInferido };
}
