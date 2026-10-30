# PR R8 — Runner & store de masiva (ETAPA 1 de 2)

## Agente

R8 (etapa 1) — branch `refactor/r8-runner-store` desde `ff61533`
(R5/R6/R7a/R7b mergeados). Ola 2, secuencial, único agente. Zona:
`src/modules/digitalizador/lib/e14/masiva/**` (+ su carpeta de tests,
+ `docs/informes/R8.md` por contrato del orquestador).

Commits (orden git test→refactor garantizado):

1. `f4ef115` — test(r8): caracterización del núcleo masiva contra el ORIGINAL
2. `edc63b6` — fix(r8): C5 — la espera del dedup ya no bloquea el slot del pool (aparcado + re-visita fin de ola)
3. `a307deb` — refactor(r8): retiro de los re-exports temporales de R7b (identidad-qr y origen)
4. `089a070` — docs(r8): informe etapa 1 (contrato de 10 secciones)

## Qué

ETAPA 1 (la etapa 2 hará los splits grandes):

- **Caracterización commiteada** (heredada sin tracking del agente anterior,
  que murió tras escribirla; el orquestador la corrió contra el ORIGINAL:
  48 pass / 0 fail). Revisada: cobertura COMPLETA de las 8+ puertas de
  dedup, las fases de `procesarUno`, el contrato de trazas post-mortem y
  las anclas QA → commiteada byte a byte (corrección: 0).
- **FIX C5**: la rama DUPLICADA de `procesarUno` esperaba el desenlace de su
  original hasta 10 min SIN verificar el orden FIFO → slot del pool
  bloqueado (con pool 1, cola entera congelada — post-mortem
  20261020-122235). Ahora aplica el patrón del guard `agregadaEn` (P2.1-v2):
  original DELANTE en FIFO → espera intacta (techo 10 min); copiable pero
  DETRÁS → **APARCA** (fila vuelve a DUPLICADA, slot liberado al instante,
  `siguientePendiente` la salta) y el FIN DE LA OLA la **RE-VISITA** (copia
  con cero OCR si la original aterrizó, o fallback honesto a PENDIENTE que
  la misma ola reprocesa). La re-visita jamás espera ni reaparca
  (terminación garantizada). `rearrancarTrasEncolar` rearranca con
  aparcadas. +3 tests (sección F).
- **Retiro de re-exports temporales de R7b**: `identidad-qr.ts` ya no
  re-exporta `estadoZxingQr/moduloZxingDe/qrCorto` (consume `../qr-zxing`);
  `runner.ts` importa `qrCorto` DIRECTO del canónico; `origen.ts` ya no
  re-exporta `OrigenActa` (consume `../types`); `deskew.ts` re-apuntado.
  Grep verifica CERO consumidores restantes. El import dinámico del bridge
  (bridge:593, nativo) no se tocó.
- **Informe parcial**: `docs/informes/R8.md` (10 secciones del contrato).

## Cómo

- Conservador siempre: el camino feliz (original delante en FIFO, original
  muerta, copia inmediata) queda byte-idéntico; el comportamiento observable
  SOLO cambia en el caso patológico (original detrás / cola congelada /
  pausa), documentado en el informe §5 y en el comentario C5 de runner.ts.
- Nada de timer nuevo: el park es un Set de módulo + re-visita secuencial al
  final de `bucle()`; sin imports circulares (runner-dedup sigue sin importar
  otros runner-*.ts; runner-dedup solo recibió un comentario).
- Anclas QA intactas: los 15+ literales grepeados por scripts/qa-*.ts
  permanecen en runner.ts (sección E de la caracterización los verifica).
- Store Zustand público: sin cambios de firma (0 líneas tocadas en su API).

## Evidencia de verificación

Contra el ORIGINAL `ff61533` (caracterización sola):

```
$ bun test src/modules/digitalizador/lib/e14/masiva/__tests__/masiva-caracterizacion.test.ts
 48 pass
 0 fail
 191 expect() calls
Ran 48 tests across 1 file. [3.02s]
```

Estado final de etapa (REAL, commit `089a070`):

```
$ bunx tsc --noEmit     → exit 0 (0 errores)

$ bun test              → corrida completa (20 files, un proceso)
 210 pass
 0 fail
 2830 expect() calls
Ran 210 tests across 20 files. [19.12s]
  (= 159 base + 48 caracterización heredada + 3 nuevos C5)

$ bun run lint
✖ 5 problems (0 errors, 5 warnings)   # los 5 pre-existentes, TODOS fuera de zona

$ git diff --stat ff61533...HEAD → SOLO rutas de zona (7 files:
  masiva/{runner,runner-dedup,identidad-qr,origen,deskew}.ts
  + masiva/__tests__/{caracterizacion.harness,masiva-caracterizacion.test}.ts)
```

Hallazgo de infra de test (documentado en el informe §8-e): entre
`f4ef115` y el shim, la corrida COMPLETA daba `159 pass / 1 fail / 1 error`
(`window` falso global de `flags-schema.test.ts` abortaba la evaluación del
store-e14 REAL de este suite cuando bun corre todos los files en un
proceso). Reproducido con 3 files, resuelto con un shim mínimo en el
harness (navigator.onLine=true + listeners no-op), sin tocar el file ajeno.

## Riesgo y rollback

- Riesgo principal: C5 toca la rama DUPLICADA del pool (código sensible de
  dedup). Cobertura: 4 tests de sección D (contrato `esperarDesenlaceOriginal`
  intacto) + 3 de sección F (park/re-visita-copia/re-visita-fallback, con
  bucle REAL) + red completa A-E.
- Rollback: revert del commit `edc63b6` restaura la espera bloqueante
  byte-idéntica (los re-exports `a307deb` son independientes).

## Decisiones pendientes del dueño

1. `esperarDesenlaceQr` (capa-0, 15 s) tampoco verifica `agregadaEn` —
   mismo patrón park aplicable; REQUIERE DUEÑO (kit e63m; fuera del alcance
   C5 de etapa 1).
2. Comentarios obsoletos fuera de zona: `types.ts:12` y `qr-zxing.ts:9`
   anuncian el re-export temporal que este PR retiró (2 líneas de núcleo).
3. Helper único `sondeoHasta` para las 3 esperas por sondeo (L-6) — etapa 2.
4. Benchmark InformeCorrida antes→después — etapa 2 (obligatorio antes del
   PR final; regresión >5% = no sale).

## Hallazgos fuera de alcance

- `flags-schema.test.ts:107` deja un `globalThis.window` falso incompleto:
  cualquier suite futuro que evalúe módulos client-only (store-e14, obs)
  abortará igual — conviene sanearlo en su origen (dueño de infra de tests).
- Los 5 warnings de lint pre-existentes viven en `perfil-provider.tsx`,
  `acta-viewer-modal.tsx`, `vista-recepcion.tsx` (×2) y `actas-mock.ts` —
  nada tocado.
