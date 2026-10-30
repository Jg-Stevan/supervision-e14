# pr.md — R5 (continuación/REMATE): zip-guard con topes de bytes y ratio

## Agente

R5 — remate del trabajo heredado (el R5 anterior dejó el refactor sin comitear
en `src/modules/digitalizador/lib/e14/masiva/archivos.ts` y agotó contexto sin
tests, commits ni pr.md). Branch: `refactor/r5-zip-guard`. Sin GitHub: no hay
push ni PR real — este archivo es el entregable.

## Qué

Kit M-1 de `03b-digitalizador-masiva` (recomendación #4): guard de comprimidos
contra zip-bombas / RAM desbocada. Antes el zip se descomprimía COMPLETO en RAM
(`unzipSync` → `Record<string,Uint8Array>`) ANTES de filtrar y el tope de 500
solo contaba archivos: un zip de 500×100 MB (o 1 entrada de GB) reventaba la
pestaña. Ahora:

- **Streaming**: `fflate.Unzip` empuja el stream por trozos de 64 KB; cada
  entrada se clasifica POR CABECERA antes de retener un byte — lo rechazado
  jamás se descomprime.
- **Tres topes** (tuneables vía `OpcionesGuardaR5`, defaults 2 GB acumulado /
  128 MB por entrada / ratio 100 con piso de 1 MB): producen filas ERROR
  trazables nuevas (`TOPE_BYTES_ENTRADA`, `RATIO_SOSPECHOSO`,
  `TOPE_BYTES_COMPRIMIDO`) — doctrina del conservador: rechazar con traza >
  consumir RAM; jamás tumban la cola (patrón kit T2.2, el store ya convierte
  filas en filas ERROR).
- **Sin doble buffer**: `archivoDePartes` usa los chunks del stream — el
  constructor `File` ya copia por especificación; el `slice()` extra duplicaba
  cada foto.
- **RAR con los mismos topes**: el predicado `files` de node-unrar-js corre por
  cabecera (packSize/unpSize) ANTES de extraer (readFile skip) y la
  contabilidad acumulada corta el generador al reventar el techo.
- **11 tests** nuevos junto al módulo, fixtures 100 % en runtime (fflate), nada
  binario commiteado.

## Cómo

- `crearPortero()`: un portero por comprimido, compartido por zip y rar.
  - `clasificar(nombre, tamComp, tamDesc)`: anidado → SU fila; no-imagen →
    silencio (≡ hoy); cap 500 → UNA fila y silencio posterior (≡ break);
    techo/ratio declarados en cabecera → fila por entrada. Los tamaños pueden
    llegar `undefined` (zips «streamed» con data-descriptor: fflate no los
    escribe) → los guards REALES actúan en vuelo.
  - `contabilizar(bytes, comprimidosEntrada)`: contabilidad REAL de bytes
    descomprimidos (también los de entradas ya descartadas en vuelo — la RAM
    transitoria es RAM igual). Devuelve RETENER / DESCARTAR (cabecera mintió →
    fila por entrada) / ABORTAR (techo acumulado → fila del comprimido y corte
    del stream).
- El zip se empuja por trozos de 64 KB para poder revisar las señales de aborto
  ENTRE trozos (un `push` único no es interrumpible).
- Corrupto/protegido: fflate lanza → mismo trato que siempre
  (`PROTEGIDO_O_CORRUPTO`); si ya había imágenes extraídas viajan PARCIALES + UNA
  fila (jamás tumba lo logrado). Diagnóstico honesto: un zip donde ni siquiera
  se parseó una entrada es corrupto (throw); uno válido sin fotos es
  `SIN_IMAGENES_DENTRO` (motivo de siempre).
- Compatibilidad: `extraerArchivo(archivo, opciones?)` — el store y el resto de
  callers siguen llamando con UN argumento (defaults). `store.ts`, `runner.ts` y
  `runners/*` intactos (regla de la misión).

## Evidencia de verificación

Números reales de esta sesión (bun 1.3.14):

| Verificación | Resultado |
|---|---|
| `bun install` | 512 installs, 592 packages, sin cambios |
| `bunx tsc --noEmit` | **0 errores** (exit 0) |
| `bun test` (repo completo) | **58 pass / 0 fail** (47 pre-existentes + 11 nuevos), 1260 expect() |
| `bun run lint` | 2 errores `react-hooks/set-state-in-effect` — **pre-existentes** (confirmados stashando el árbol: persisten sin el cambio R5); viven en `src/modules/perfil-dispositivo/components/panel-perfil.tsx:360` y `src/modules/supervision/components/vista-recepcion.tsx:208` (zona R4/dueño). Zona R5 (`archivos.ts` + test): **0 problemas** |
| Commits | `6941999` refactor(r5) · `83c9a9f` test(r5) — sin amend, árbol limpio |

Casos cubiertos por los tests (todos con fixtures `zipSync` en runtime):
zip normal (extrae + fila anidado + no-imagen en silencio) · cap 500 EXACTO
(501 entradas → 500 archivos + UNA fila) · `SIN_IMAGENES_DENTRO` · ratio ~1000
(2 MB de ceros) → `RATIO_SOSPECHOSO` · foto incompresible pasa intacta ·
`TOPE_BYTES_ENTRADA` por entrada (la chica se encola, la grande deja SU fila) ·
`TOPE_BYTES_COMPRIMIDO` (corte con parcial + fila del comprimido) · basura y
zip truncado pre-1ª imagen → throw capturable `PROTEGIDO_O_CORRUPTO` · truncado
post-1ª imagen → extracción PARCIAL + fila.

## Riesgo y rollback

- **Riesgo bajo**: un solo módulo (`archivos.ts`), contract de
  `extraerArchivo` intacto (misma firma + argumento opcional), todos los
  motivos nuevos son ADITIVOS al tipo `MotivoExtraccion` (la unión crece; nada
  existente cambia de semántica). El único cambio de comportamiento observable
  sin topes configurados: una imagen real >128 MB o con ratio >100 se rechaza
  con fila (antes pasaba y reventaba después en el decode) — ver Decisiones.
- **Riesgo medio conocido**: fflate retiene los bytes COMPRIMIDOS de las
  entradas omitidas en su buffer interno hasta que el `Unzip` se descarta
  (verificado en la fuente de fflate 0.8.3: `start()` nunca llamado → chunks a
  `k[0]`). Acotado por el tamaño del zip, que ya está íntegro en RAM
  (`arrayBuffer()`). Peor caso ≈ 2× el tamaño comprimido transitorio, nunca
  descomprimido.
- **Rollback**: `git revert 83c9a9f 6941999` (en ese orden) restaura el
  `unzipSync` completo; ningún otro archivo depende de `OpcionesGuardaR5`.

## Decisiones pendientes del dueño

1. **Valores de los topes**: 2 GB / 128 MB / ratio 100 son la propuesta de la
   misión + M-1, tuneables vía `OpcionesGuardaR5` SIN tocar código. El dueño
   puede fijar otros (o cablearlos a flags) cuando quiera.
2. **Caso borde del ratio**: un BMP escaneado de página casi vacía puede pasar
   de ratio 100 legítimamente (blanco plano comprime ~1000:1). Ante duda se
   rechaza con traza (doctrina), pero si el dueño ve falsos positivos reales,
   subir `ratioSospechoso` o el piso de 1 MB.
3. **Entrada de imagen de 0 bytes**: en el camino streaming ya NO se encola
   (antes sí: `unzipSync` la entregaba y el pipeline generaba una fila de
   error genérica al fallar el decode). Decidido conservador: un File vacío es
   basura conocida; si el dueño prefiere la fila explícita, es un cambio de 3
   líneas en `ondata`.
4. **¿Cablear opciones desde flags?** Hoy los topes solo se ajustan por código
   (`OpcionesGuardaR5`); exponerlos en el panel de flags es un paso extra que
   no pedía la misión.

## Hallazgos fuera de alcance

- **RAR — topes con límite de la API (documentado, no “fallos”)**:
  node-unrar-js materializa CADA entrada completa en RAM antes de entregarla
  (`extraction: Uint8Array`), y el wasm no expone streaming. Consecuencias:
  (a) el corte EN VUELO por entrada (chunk a chunk) es imposible — el techo
  por entrada se aplica POR CABECERA (`packSize`/`unpSize`, cubre lo
  declarado) y post-materialización (`contabilizar`): una cabecera RAR
  mentirosa cuesta UNA entrada materializada antes del `DESCARTAR`, no el
  archivo entero; (b) el techo acumulado sí corta el generador al reventar.
  El zip (la vía real de las cargas masivas) SÍ queda con corte en vuelo
  completo. Si el dueño quiere paridad total en rar, hay que cambiar de
  librería (p.ej.Bindings con streaming) — fuera de alcance R5.
- **No hay test de rar en runtime**: generar un RAR válido requiere un
  codificador rar (no existe en deps y la misión prohíbe commitear binarios).
  La lógica compartida (portero) queda ejercitada vía zip; el camino rar solo
  compila (tsc) y preserva sus guards históricos (protegido/parcial).
- **Lint pre-existente**: los 2 errores `set-state-in-effect` (R4) y 5
  warnings (exhaustive-deps, img, `_observacion`) persisten con el árbol
  stashado — verificados, NO introducidos por R5 y fuera de mi zona.
- **fflate 0.8.3 tipa `size`/`originalSize` como opcionales** en
  `UnzipFile` — el código ya maneja `undefined` (zips streamed); verificado
  contra `node_modules/fflate/esm/index.d.mts`.
