# Contribuir

Gracias por ayudar. Este repositorio procesa documentos electorales: un cambio
que "mejore la UI" pero altere una regla de negocio es un retroceso, no una
mejora. Antes de escribir código, lee [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
y las decisiones relevantes en [`docs/adr/README.md`](docs/adr/README.md).

## Entorno

- Bun 1.3.x (`packageManager` en `package.json`). Node 20 solo si una herramienta lo exige.
- `bun install && bun run dev`.
- Antes de abrir un PR: `bun run verificar` (typecheck + lint + test).

## Reglas que no se negocian

1. **No leer votos.** El módulo de supervisión muestra la foto y el encabezado
   impreso; no ejecuta OCR ni deduce totales (D23).
2. **No importar el catálogo maestro** `divipola-puestos.json`. El código usa
   solo `divipola-exterior.json` (D21).
3. **No crear rutas nuevas.** La navegación es estado interno y el build es un
   export estático de una sola página (D8/D11).
4. **No usar `next/image`.** Las imágenes son estáticas e importadas (D24).
5. **No cambiar el contrato de `idEnlace`** ni la clave `${idEnlace}::${mesa}` (D22/D24).
6. **No relajar la cuarentena D25.** Un acta que no valida no se publica.
7. **Campos de medición solo aditivos:** al final, opcionales, ausentes si no se
   midieron; nunca `0` inventado (D57).
8. **Dark only:** tokens del tema, radio 4 px, cero sombras y cero hex sueltos (D4).
9. **No commitear artefactos de sesión:** `out/`, `.next/`, `dist/`, `build/`,
   logs, JSON de benchmarks, `public/vendor/onnxruntime/`, `node_modules/`.
10. **Actas y capturas:** solo documentos públicos y recomprimidos. Nada de
    fotos de particulares ni datos personales.

## Estilo de código

- TypeScript estricto. Prefiere funciones puras y contratos explícitos.
- Comenta el **porqué** (una restricción, una trampa, un invariante), no el qué.
- Los comentarios del motor citan decisiones (`Dxx`); al tocar esa zona, conserva
  la cita o actualízala si la decisión cambió.
- No introduzcas dependencias nuevas sin justificar peso y motivo: cada MB de
  modelo o wasm se descarga en el móvil de un voluntario.

## Pruebas

- Toda regla de negocio debe tener prueba en `__tests__` junto al módulo.
- `bun test` debe quedar en verde. Los golden de determinismo
  (`mock-determinismo.test.ts`) no se actualizan "para que pasen": si cambian,
  explica en el PR por qué cambió el seed o el catálogo.
- Las mediciones de tiempo no son gates (la varianza de la máquina las invalida).

## PRs

- Un PR = un cambio con un motivo. Evita mezclar refactor, formato y feature.
- Describe el impacto en el negocio y en los contratos (`idEnlace`, D25, gate).
- Si tocas el pipeline, adjunta la salida de una corrida demo: 6/6 actas y los
  scores observados.
- Si tocas el despliegue, revisa el runbook correspondiente y verifica COOP/COEP
  y los wasm partidos en el preview.

## Reportes

- Bugs funcionales: issue con pasos, navegador, dispositivo y resultado esperado.
- Vulnerabilidades: **no abras un issue público**; sigue [`SECURITY.md`](SECURITY.md).
