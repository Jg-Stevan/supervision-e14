# Regresiones de lectura — harness 3.10 (fase E)

Cada bug de LECTURA observado en producción entra aquí como un fixture JSON y
queda como test permanente del paquete (`tests/regresiones-lectura.test.ts`).
El backlog es continuo: un directorio vacío es el estado sano; un bug que se
arregla sin fixture es un bug que puede volver.

## Flujo

1. El bug se ve en una corrida real (AUTO/SUGERIDA/MANUAL equivocado, nivel
   inflado, puesto mal resuelto, sección dada por presente…).
2. Copiar el **texto que el OCR produjo** — el misread exacto (`0O1`, letras
   cambiadas, líneas partidas) es la entrada del fixture. La foto NO se guarda:
   el wasm no corre en node y una imagen real es dato electoral sensible.
3. Clasificar ese texto con el motor corregido y guardar el resultado como
   `esperado`.
4. Añadir aquí `R-<AAAA-MM-DD>-<slug>.json`, correr
   `bun test packages/scanner-core/tests/regresiones-lectura.test.ts` y verlo
   verde. Si el bug vuelve, el test se pone rojo.

## Formato

```json
{
  "id": "R-2026-11-07-mesa-confundida",
  "nota": "MESA 001 leída como 0O1 debe seguir resolviendo la mesa del registro",
  "ocr": "REGISTRADURIA NACIONAL DEL ESTADO CIVIL\nE-14\nMESA: 0O1\n...",
  "esperado": { "nivel": "AUTO", "confianzas": {}, "anclas": [], "...": "..." }
}
```

`esperado` es la salida completa de `clasificarCabecera` para ese texto
(`ClasificacionE14`). Generarlo con el motor corregido, no a mano.

## Privacidad (dura)

- **Nunca** una foto, un `idEnlace`, un nombre de operador ni votos.
- Solo la estructura IMPRESA del formulario y cómo la leyó el OCR. Si el texto
  leído arrastra datos de una mesa concreta, reemplazarlos por los valores de
  los fixtures sintéticos del repo antes de guardarlo.
- El fixture viaja en el paquete y por tanto al CI de ambas apps.
