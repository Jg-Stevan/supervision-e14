# AGENTS.md — supervision-e14

## Stack y comandos (verificados contra package.json)
- Next.js + TypeScript. Gestor de dependencias: **bun** (`packageManager: bun@1.3.14`). No uses npm ni pnpm.
- `bun run dev` — servidor en el puerto 3000 (ejecuta `preparar` antes).
- `bun run verificar` — typecheck + lint + test. **Es la puerta de salida**: nada se declara terminado sin este comando en verde, y se reporta su salida real.
- Unitario: `bun run typecheck`, `bun run lint`, `bun test`.

## Reglas del producto
- El módulo de supervisión **no lee votos**: muestra la foto y el encabezado impreso tal cual (regla D23). No inventes totales ni interpretes el contenido del acta.
- La validación es contra el catálogo oficial DIVIPOLA (`idEnlace`). Un dato que no está en el catálogo se marca como fallo, no se completa a mano.

## Privacidad e integridad
- Son datos electorales reales: no commitees actas, capturas ni credenciales, y no envíes actas a endpoints externos.
- No añadas dependencias, telemetría ni servicios externos sin preguntarlo antes.
- Nunca `git push --force` ni reescritura de historial.

## Paridad con `digielect14` (el mismo motor, dos productos)

`digielect14` es el digitalizador MÓVIL de un puesto; este repo es el supervisor
masivo. Comparten el motor de OCR (mismo `@jg-stevan/scanner-core`, mismo
`tesseract.js` con el mismo `spa.traineddata`, mismas ONNX PP-OCRv4, mismo
`public/e14/divipol.json`) y el negocio que decide el acta: `clasificador.ts` ·
`completitud.ts` · `kits.ts` · `divipol.ts` · `senal-lectura.ts` ·
`marcadores.ts` · `integridad.ts` · `diagnostico.ts`.

- El contrato está en `src/modules/digitalizador/lib/e14/__tests__/__fixtures__/contrato-motor.json`
  (21 cabeceras SINTÉTICAS + la salida exacta del motor) y lo valida
  `src/modules/digitalizador/lib/e14/__tests__/contrato-motor.test.ts` con `bun test`.
- **El golden NO se edita ni se regenera aquí.** Su fuente de verdad es
  `digielect14/scripts/gen-contrato-motor.ts`. Si un cambio de negocio en ESTE
  repo pone el test rojo, la decisión es explícita: o se revierte el cambio, o se
  hace el mismo cambio de negocio en `digielect14` y se copia SU golden nuevo.
  Copiar el golden sin sincronizar el código, o «arreglar» el esperado a mano,
  es lo que convertiría el contrato en decorativo.
- Diferencias legítimas ya declaradas (no son deuda): aquí `codigoUnicoE14` y la
  interfaz `SenalLectura` están exportadas porque las consumen los tests del
  lote, `PUBLIC_BASE` viene de `@/shared/env`, y `marcadores.ts` cita la
  procedencia de sus muestras con otras palabras.
- Lo que NO se porta desde aquí al móvil: la cola/bandeja/runner de MASIVA, el
  router por hardware y PP-OCRv5 (sidecar nativo). Ver `docs/DECISIONS.md` de
  `digielect14` (D78/D80).
- Cotejo local de los dos checkouts: `bun scripts/qa-paridad-motor.ts` en
  `digielect14` (con `E14_HERMANO` si la ruta del hermano cambia).

## Estilo
- Responde en español. Mantén los identificadores del repo como están.
