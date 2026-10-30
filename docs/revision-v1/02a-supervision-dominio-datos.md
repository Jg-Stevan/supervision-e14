# Revisión Profunda — Paquete 2-a: supervision · dominio + datos
> Task ID: 2-a · Alcance: `src/modules/supervision/domain/` (types.ts, divipola.ts, jornada.ts, acta.ts, tiempo-cierre.ts) · `src/modules/supervision/data/` (supervision-repository.ts, mock-repository.ts, divipola-adapter.ts, actas-mock.ts, actas-runtime.ts, recepcion-log.ts, actas-reales/actas-reales.ts, JSON) · Componentes fuera de alcance (los cita otro agente); se referencian solo como evidencia de fugas.

## 1. Mapa del paquete

| Archivo | Líneas | Rol (1 línea) | Observación |
|---|---|---|---|
| `domain/types.ts` | 199 | Contrato de dominio del monitor: Puesto, Mesa, ResumenGlobal, FiltrosPuestos, Notificacion, Anomalia, TransicionVida | `FiltrosPuestos.cierreCol/tiempo` declarados (L140-145) pero sin implementación en el repo (ver §4 🔴-1) |
| `domain/acta.ts` | 115 | Tipos del acta E-14 (ActaMesa, FotoActa, ImpresionActa) + PRNG compartido (FNV-1a + mulberry32) | Núcleo del determinismo §0-7; limpio y portable |
| `domain/divipola.ts` | 187 | Forma canónica del catálogo + validación ESTRICTA sin librerías (8 campos exactos, regex ancho fijo, idEnlace congruente y único) | El mejor archivo del paquete |
| `domain/jornada.ts` | 82 | Calendario de 7 días de votación exterior; día derivado del prefijo del nombre del puesto | Correcto; caso «Santo Domingo» cubierto (L71) |
| `domain/tiempo-cierre.ts` | 78 | Regla «cierre 4:00 p. m. local» + tramos de señalización `<1 / 1-2 / 2-3 / >3` hrs | Frontera de dominio limpia |
| `data/supervision-repository.ts` | 74 | Puerto (interfaz async) — «punto de intercambio» para el swap al backend | Su promesa (L4-5) ya no es completamente cierta (§4 🔴-2) |
| `data/mock-repository.ts` | 894 | Implementación mock: catálogo→Puesto, mesas por receta de estado, semillas de notificaciones/anomalías, mutaciones T3/T4, actas | El archivo más grande; concentra semillas, recetas y fusión runtime |
| `data/divipola-adapter.ts` | 103 | ÚNICO consumidor del JSON: valida, agrega `nivel`, ordena, verifica 949/67/3.670 + anclas, memoiza | Guardrails números quemados: decisión consciente (D21) |
| `data/actas-mock.ts` | 441 | Generación por seed del acta sintética + caché histórica + acciones aprobar/rescan | Duplica helpers de formato y construcción (§5) |
| `data/actas-reales/actas-reales.ts` | 332 | Loader estático del manifest (SUP-6): valida D25 a-e, cuarentena `BLOQUEADA`, merge por clave | Duplica validación D25 con actas-runtime (§5) |
| `data/actas-runtime.ts` | 280 | Ingesta RUNTIME de carga masiva: valida (a)/(b)/(d), fusiona páginas, bus de eventos | 3 bloques `registrarRecepcion` casi idénticos (L130-148/159-177/187-205) |
| `data/recepcion-log.ts` | 190 | Log en vivo de recepción (PUBLICADA/BLOQUEADA/SIN_JOIN) + semilla determinística de ingesta inicial | Patrón suscriptor correcto; semilla con desfases fijos (§0-7) |
| `data/divipola-exterior.json` | 190 KB | Única fuente del código: 949 puestos · 67 países · 3.670 mesas (verificado numéricamente en esta revisión) | Entra al bundle por import estático (§4 🟡) |
| `data/divipola-puestos.json` | 635 KB | Catálogo MAESTRO (14.438 puestos) — base del join futuro; JAMÁS importado | Regla respetada: `rg "divipola-puestos" src/` → 0 (verificado) |
| `data/actas-reales/actas-reales-manifest.json` | 83 | Contrato D24: 4 entradas / 8 páginas · anclas El Cairo, Roma, Barcelona-Girona | Coherente con `ASSETS` y `PESO_ASSETS` |
| `data/actas-reales/assets/*.png` | 8 (1,82 MB) | Fotos reales del digitalizador | Guardrail D25: 10 assets / 2 MB — OK |

Verificaciones de catálogo ejecutadas en esta revisión: 949 registros, 67 países, Σ mesas = 3.670, 949 idEnlace únicos, 0 idEnlace incongruentes con sus segmentos, 0 campo `nivel` en el JSON — todo coincide con `divipola-adapter.ts:33-44`.

## 2. Modelo de datos y lógica de negocio (explicado al programador nuevo)

**Entidades.**
- **Puesto** (`types.ts:29-83`): fila de la matriz. Su `id` ES el `idEnlace` DIVIPOLA (`<dept>_<mun>_<zona>_<puesto>`, p. ej. `88_495_010_02` = CONSULADOS · Italia · zona 010 · puesto 02) — decisión D22: esa clave casa el monitor con el digitalizador sin transformar. Ojo con el legado DIVIPOLA: `codigoPais`/`pais` son en realidad `codigoMunicipio`/`nombreMunicipio` del catálogo (en exterior, municipio = país).
- **Mesa** (`types.ts:93-103`): dos partes de delegados (p1/p2 `ok|pendiente`) + dos partes de transmisión (+ `alerta` opcional "Rescaneo") y `estadoMesa` derivado.
- **ActaMesa** (`acta.ts:64-84`): documento histórico de una mesa — páginas por formulario, historial de eventos, `fotos` reales opcionales y encabezado `impresion` verbatim («se muestra, no se interpreta», §0-1).
- **Catálogo** (`PuestoDivipola`, `divipola.ts:19-39`): input obligatorio; códigos SIEMPRE string con ancho fijo (2/3/3/2) para que el join futuro no requiera castings.
- **Recepción** (`recepcion-log.ts:40-68`): log por PÁGINA recibida con desenlace PUBLICADA/BLOQUEADA/SIN_JOIN.

**Invariantes.**
1. **D6/D21 (KPIs exactos):** `total = completo + critico + pendiente + noIniciado` en todo momento (`getResumen` cuenta los 4 estados exhaustivamente, `mock-repository.ts:708-723`; seed vigente 949 = 231+44+199+475 según DECISIONS D21).
2. **D16 (derivación):** `pctDelegado/pctTransmision` SIEMPRE derivables de las mesas (`pctsDeMesas`, `mock-repository.ts:456-475`, aplicado al inicializar L486-495 y tras cada mutación `refrescarPuesto` L587-593).
3. **D13 (estado de mesa derivado):** `estadoMesa` se recalcula de las 4 partes (`estadoMesaDePartes`, L431-447): alerta→INCOMPLETO; 4 ok→COMPLETO; 0 ok→NO_INICIADO; resto EN_PROCESO.
4. **Acta = documento histórico:** se genera UNA vez al primer acceso y se cachea (`CACHE_ACTAS`, `actas-mock.ts:277,290-350`); solo mutan las acciones del visor (aprobar/rescan). Cambios posteriores de la mesa NO reescriben el acta ya vista.
5. **Foto se UBICA, no se interpreta (§0-1/D23):** ninguna ruta infiere datos de la imagen; solo ranuras (idEnlace+mesa+formulario+página) y encabezado impreso verbatim.
6. **Cuarentena D25:** lo que falla validación no se publica; queda `BLOQUEADA: <motivo>` (consola + log de recepción) y el resto sigue.

**Flujo idEnlace.** `divipola-exterior.json` → `CARGAR_CATALOGO()` (valida estricto, agrega `nivel:"EXTERIOR"`, ordena, memoiza — `divipola-adapter.ts:59-103`) → `puestoDeRegistro` crea el `Puesto` con `id = idEnlace` (`mock-repository.ts:188-223`) → mesas/actas/anomalías/notificaciones se anclan a esa clave (`${puestoId}::${mesaId}` es la clave universal de actas, estáticas y runtime) → el digitalizador (módulo externo) publica por la misma clave (`actas-runtime.ts:121-280`) y el log de recepción deja traza por página.

**Mock determinístico por hash.** Un PRNG mulberry32 sembrado con hash FNV-1a de un texto (`crearRandomDeterministico`, `acta.ts:94-115`). Cada dato se deriva de una seed estable, p. ej. `divipola::puesto::<idEnlace>` (estado del puesto, `mock-repository.ts:199,220`), `<idEnlace>::mesa-<n>::carga` (hora/ID del acta, `actas-mock.ts:333-337`). Recargar la página reproduce los mismos KPIs. Dos detalles finos que hay que respetar al editar: (a) el ORDEN de los draws es parte del contrato — `horarioPorSeed` consume EXACTAMENTE 3 draws y el 3.º se quema con `void random()` para no desplazar el draw de estado (D43, `mock-repository.ts:149-170`); (b) los puestos nunca quedan al azar: 3 ANCLAS se FUERZAN (Roma→CRÍTICO, El Cairo y Barcelona-Girona→COMPLETO, L189-198) para que las actas reales sean alcanzables aunque su seed natural caiga en NO_INICIADO. Las mesas salen de recetas por estado (`generarMesasPuesto`, L285-429), con las mesas 001-003 de Roma EXACTAS al mockup (L239-273).

**Distribuciones del demo.** Estados: <0.05 CRÍTICO, <0.30 COMPLETO, <0.50 PENDIENTE, resto NO_INICIADO (`estadoPorSeed`, L99-104). Tiempo transcurrido desde cierre por tramos 30/25/20/25 % (`transcurridoPorSeed`, L116-121). Cierres COL de {9,10,11,12,13} h (L106).

## 3. Lo que está BIEN

- **Validación del adaptador es ejemplar** (`domain/divipola.ts:78-181` + `divipola-adapter.ts:59-103`): campos exactos (sin extras ni faltantes), regex de ancho fijo, congruencia `idEnlace`↔segmentos, unicidad con índice del duplicado, guardrail de tamaño (1.500), números esperados del kit y registros de control (primero/ancla/último + Roma=8 mesas). Sin librerías, con mensajes que incluyen índice y valores recibidos (`ErrorValidacionDivipola`).
- **La regla documentada se cumple:** el maestro `divipola-puestos.json` NO se importa en ningún `.ts/.tsx` (verificado con Grep; solo docs/README lo mencionan — `docs/DECISIONS.md:358`, `docs/REPORTE-divipola-v1.md:21,40`).
- **Repository pattern correcto en el papel:** interfaz async única (`supervision-repository.ts:24-74`), el mock es la única implementación, y el consumidor principal solo conoce el repo (`datos-provider.tsx:17,174`).
- **Determinismo real y documentado:** seeds por texto, sin `Math.random` en render; el caso límite «quema de draws» (D43) está explicado en el propio código (`mock-repository.ts:159-161`). `AHORA = Date.now()` (L497) congela la época de la sesión para que las fechas relativas sean estables entre renders.
- **Copias defensivas al LEER del repo** para colecciones planas: `getPuestos/getNotificaciones/getAnomalias` devuelven clones (`mock-repository.ts:726,734,738`).
- **Contrato de errores del visor:** `resolverRescaneo` es idempotente y honesto — devuelve `null` si la mesa no tiene alerta (L746-748) en vez de simular éxito.
- **Suscripción a eventos sin librerías** con oyentes aislados (`try/catch` por oyente — `actas-runtime.ts:253-259`, `recepcion-log.ts:90-98`): un oyente caído no rompe la publicación.
- **Guardrail de assets** antes de publicar nada (`actas-reales.ts:212-233`) y cuarentena por motivo específico (a)-(e) con mensaje accionable.
- **Días de jornada derivados del dato real** sin hardcodear puestos (`jornada.ts:68-75`), con el edge «Santo Domingo» resuelto explícitamente (L71).
- **Cero TODO/FIXME/HACK** en domain/ y data/ (verificado; los únicos matches son `VALOR_TODOS` en componentes).

## 4. Deudas y problemas

### 🔴 Críticos

1. **El contrato de filtros del repositorio está desconectado de su uso real (fuga de abstracción + código muerto).** `FiltrosPuestos` declara `cierreCol` y `tiempo` (`types.ts:140-145`), pero `coincide()` NO los implementa (`mock-repository.ts:683-705` solo atiende pais/fecha/zona/puesto/estado/busqueda). Además el único consumidor llama `repo.getPuestos()` SIN filtros (`datos-provider.tsx:176,204,241,278`) y es `monitor-global.tsx:59-89` (fuera de mi alcance) quien re-filtra en cliente, reimplementando campo a campo `coincide()` y añadiendo `cierreCol/tiempo`. Consecuencias: (a) la mitad del contrato es código muerto; (b) la lógica de filtrado vive duplicada en dos capas y ya divergió; (c) quien empiece a pasar `FiltrosPuestos` completo al repo obtendrá silenciosamente otro resultado (cierreCol/tiempo ignorados). La promesa del «punto de intercambio» (`supervision-repository.ts:4-6`: «se reemplaza el mock y nada más cambia») se cumple para lecturas, no para filtrado.
2. **El swap al backend real ya no es solo «reemplazar el repositorio»: el estado y el transporte viven en singletons de módulo consumidos transversalmente.** Tres singletons mutables fuera de la interfaz: `MESAS_POR_PUESTO`+`PUESTOS` (`mock-repository.ts:486-495`), `CACHE_ACTAS` (`actas-mock.ts:277`) y `RUNTIME`+`ENTRADAS` con sus buses de oyentes (`actas-runtime.ts:77-78`, `recepcion-log.ts:77-79`). Y el módulo digitalizador importa directamente funciones internas de este paquete: `store-e14.ts:41,44` → `publicarActaMasiva` y `registrarRecepcion` de `@/modules/supervision/data/*`. Al integrar el backend real habrá que migrar el repositorio Y dos buses de eventos Y tres memorias de sesión, y reescribir el acoplamiento cruzado entre módulos. Hoy funciona (demo), pero el diseño contractual que se declara en los headers no coincide con la topología real de dependencias.
3. **Cero tests para un módulo cuyo corazón es frágil por diseño.** No hay ningún `*.test.*` ni runner de tests en `package.json`. La invariante D21 (949 = 231+44+199+475), la distribución de estados, el orden de draws (D43), las 3 anclas forzadas y el validador estricto del catálogo se protegen solo con disciplina manual. Cualquier refactor inocente (reordenar draws en `horarioPorSeed`, tocar `puestoDeRegistro`) cambia TODOS los KPIs del demo sin que nada falle. Es el mayor riesgo de regresión del paquete.

### 🟡 Medios

1. **Copias superficiales que exponen estado interno mutable.** `getMesasDePuesto` devuelve `{...m}` pero `delegados` y `transmision` (con `p1/p2`) siguen siendo referencias al singleton (`mock-repository.ts:730`); `clonarActa` no clona `fotos` (`actas-mock.ts:279-288`); `actaEnCache` devuelve la entrada interna de la caché para mutarla en aprobar/rescan (`actas-mock.ts:352-357,380-440`). Un componente que mute un objeto recibido corrompe el estado global del demo sin rastro. Tipos `Readonly` o clonado profundo en la frontera lo harían estructuralmente seguro.
2. **Inicialización pesada en el import.** Importar `mock-repository` ejecuta: validación del catálogo completo (949 registros con regex) + generación de 3.670 mesas + pcts (`mock-repository.ts:226,486-495`), y arrastra estáticamente `divipola-exterior.json` (190 KB al bundle), el manifest y los 8 PNG (`actas-mock.ts:40` → `actas-reales.ts:39,43-52`). El comentario «el loader es perezoso» (`actas-reales.ts:28-30`) es cierto en EJECUCIÓN (memo `RESULTADO`), no en BUNDLE: todo viaja en el chunk del módulo. Para un demo es tolerable; hay una mejora clara con `dynamic import`.
3. **Duplicación de la validación D25 entre loader estático y runtime con semántica distinta.** (a)/(b) están duplicados casi verbatim (`actas-reales.ts:249-267` ≈ `actas-runtime.ts:126-178`); el (d) es DIFERENTE: el estático exige continuidad 1..N del formulario completo (`actas-reales.ts:272-278`), el runtime solo valida rango de la página individual (`actas-runtime.ts:181-186`) — razonable (llegan de a una página), pero no está documentado como divergencia y alguien podría «unificarlos» mal. Debe extraerse un validador compartido con las dos modalidades nombradas.
4. **`console.warn` como sistema de cuarentena** (`actas-reales.ts:202`): en el loader estático el BLOQUEADA solo existe en consola (el runtime sí deja traza en `recepcion-log`). Si la consola se limpia, la cuarentena es invisible. Sería dato, no efecto: sembrar el BLOQUEADA del manifest en el log de recepción con `origen:"ingesta-inicial"`.
5. **`PESO_ASSETS` duplica a mano los bytes de los PNG** (`actas-reales.ts:72-81`): si se toca un asset sin actualizar la tabla, el guardrail de 2 MB mide mal (falla en falso o deja pasar). Un script de build (o leer el tamaño al importar vía bundler) elimina la sincronización manual.
6. **Búsquedas O(n) evitables:** `CARGAR_CATALOGO().find(...)` por cada publicación (`actas-runtime.ts:127`) y `actaEnCache` lineal sobre toda la caché por cada acción (`actas-mock.ts:352-357`) — el loader estático ya usa `Map` (`actas-reales.ts:236`); homogeneizar.
7. **Números mágicos de distribución dispersos y un comentario desviado.** Umbrales 0.05/0.30/0.50 y tramos 0.30/0.55/0.75 con 175/59 minutos (`mock-repository.ts:99-104,116-121`); ventana de carga «13:00–16:59» (`actas-mock.ts:236,335`) que en realidad es 13:00–16:45 (`780 + floor(r*226)` máx 1005). Están comentados, pero la combinación «orden de draws + umbrales» es un contrato invisible que solo los tests harían seguro.

### 🟢 Leves

1. `confirmarRescanActaMock` tiene una línea en blanco dentro de la lista de parámetros (`actas-mock.ts:410-412`) — restos de renombrar a `_observacion`.
2. `"ADM-9482"` hardcodeado en el detalle del evento de aprobación (`actas-mock.ts:398`) duplica `SUPERVISOR.id` (`mock-repository.ts:68-71`) — si cambia el supervisor, el historial del acta miente.
3. Imports de tipo inline `import("./actas-reales/actas-reales").ActaRealLista` / `import("../domain/acta").FotoActa` dentro del cuerpo (`mock-repository.ts:604,670`) en vez de `import type` arriba.
4. `FiltrosPuestos.puesto` filtra por el string de PRESENTACIÓN `"<codigo> - <nombre>"` (`types.ts:131-132`, `coincide` L689) — acoplado al formato de la celda; el código de puesto sería más robusto.
5. Casts evitables: `as Mesa[]` en los builders de recetas (`mock-repository.ts:298,309`), `hallado as TramoTiempo` (`tiempo-cierre.ts:59`), `diaCalendario` con `as` justificado (`jornada.ts:81`).
6. Nombres heredados de DIVIPOLA en `Puesto` (`codigoPais`=codigoMunicipio, `pais`=nombreMunicipio, `types.ts:40-42`) — documentado, pero es la fuente nº 1 de confusión para alguien nuevo; un alias en el doc del tipo (ya existe) más un mapa de términos en README ayudaría.
7. `horaAMinutos` parsea con `replace(" LOCAL","")` (`actas-mock.ts:52-55`) — frágil si el sufijo cambia de formato; los formatos de hora conviven en 3 variantes (ver §5).
8. Divergencia menor comentario-vs-código de la ventana de carga (ya listada en 🟡-7) — sintomático de que estos números no tienen test.

## 5. Duplicados y reutilización

1. **Filtrado de puestos duplicado entre capas (el más serio):** `coincide()` (`mock-repository.ts:683-705`) ≈ `monitor-global.tsx:59-89` (componente; fuera de alcance, citado como evidencia). Mismas 5 reglas + búsqueda textual idéntica; el componente añade `cierreCol/tiempo` que al repo le faltan. → Ver 🔴-1.
2. **`delegadosAcreditados` y `ciudadDePuesto` existen DOS veces:** exportadas en `actas-mock.ts:271-275` y `58-61`, y RE-definidas idénticas en `components/actas/documento-e14.tsx:31-45`. La regla n/16 (2 partes ok → 16, 1 → 8, 0 → 0) está por tanto en dos fuentes; si cambia la regla, drifted. Debería vivir en `domain/` (o en el dominio del acta) y una sola definición.
3. **Validación D25 (a)/(b) duplicada** loader/runtime: `actas-reales.ts:249-267` ≈ `actas-runtime.ts:126-178` (misma redacción de motivo incluida). Extraer `validarJoinDivipola(idEnlace, mesa)` compartido.
4. **Bloque de registro `BLOQUEADA` repetido 3×** en `actas-runtime.ts` (L130-148, L159-177, L187-205): ~18 líneas de objeto literal idéntico salvo el motivo. Un helper `registrarBloqueada(entrada, clave, motivo)` ahorra ~40 líneas y homogeneiza el log.
5. **Dos constructores del acta sintética casi iguales:** `construirActaReal` (`actas-mock.ts:229-261`) vs la ruta genérica inline de `obtenerActa` (`actas-mock.ts:333-349`) — mismo seed, misma ventana de minutos, mismo `generarIdActa`, misma `historialDeMesa`; la diferencia es solo fotos/impresión. Unificable con un parámetro opcional `registroReal?`.
6. **Dos caminos de fusión de fotos reales sobre el acta:** el estático dentro de `obtenerActa` (`actas-mock.ts:299-331`: ancla Roma + `construirActaReal`) y el runtime `fusionarActaRuntime` (`mock-repository.ts:602-681`). La superposición runtime-sobre-base es coherente, pero el conocimiento de «cómo se pegan las fotos a las páginas» vive en dos archivos; si cambia `FotoActa`, se tocan ambos.
7. **Formateadores de hora en 3 sabores y 2 parsers:** `minutosAHora` 24 h (`actas-mock.ts:44-49`) vs `relojDeMinutos` 12 h AM/PM (`mock-repository.ts:124-131`); `horaAMinutos` (`actas-mock.ts:52-55`) vs `minutosDeReloj` (`tiempo-cierre.ts:72-78`); `horaActual()` (`actas-mock.ts:360-365`) ≈ `horaRuntime` inline (`mock-repository.ts:608-611`). Los formatos son legítimamente distintos (documento vs tabla), pero los helpers de parseo y el "ahora" pueden vivir juntos en `domain/tiempo.ts`.
8. **Dimensiones de página A4 794×1123 duplicadas** (`actas-runtime.ts:108,112,113` ≈ `components/actas/documento-e14.tsx:25-26`) — constante de dominio que merece un hogar único.
9. **Tabla de assets + imports estáticos manuales** (`actas-reales.ts:43-64` + `PESO_ASSETS` L72-81): 8 líneas por asset en dos mapas paralelos; el manifest ya declara los archivos — un paso de generación (script) eliminaría los tres registros paralelos (imports, ASSETS, PESO_ASSETS).

## 6. Guía de lectura para el programador nuevo (orden recomendado)

1. `docs/DECISIONS.md` D21-D22 (+ D6 supersedado) — por qué el catálogo manda y qué es `idEnlace`.
2. `domain/types.ts` — el vocabulario (Puesto/Mesa/estados). Nota mental: `pais` = nombreMunicipio del catálogo.
3. `domain/acta.ts` — el documento E-14 + el PRNG compartido (el corazón del determinismo).
4. `domain/divipola.ts` → `data/divipola-adapter.ts` — cómo entra el catálogo y qué lo hace abortar.
5. Shape de los JSON (no leerlos enteros): `divipola-exterior.json` = array de 8 campos; `divipola-puestos.json` = árbol dept→mun→zona→puesto, solo para el join futuro.
6. `domain/tiempo-cierre.ts` y `domain/jornada.ts` — las dos reglas de negocio «de calendario».
7. `data/supervision-repository.ts` — el contrato que todo consumidor debería usar.
8. `data/mock-repository.ts` — leerlo en este orden interno: header (L1-27) → `puestoDeRegistro` + anclas (L92-226) → recetas de mesas (L285-429) → derivaciones (L431-482) → semillas (L505-568) → implementación del repo (L707-895).
9. `data/actas-mock.ts` — reglas acta←mesa (header L1-28), Roma mesa 1 exacta (L175-211), caché (L263-350).
10. `data/actas-reales/actas-reales.ts` (+ manifest) → `data/actas-runtime.ts` → `data/recepcion-log.ts` — el ciclo de vida de una foto real: validación → publicación → log.

## 7. Recomendaciones de reorganización

| # | Acción | Esfuerzo | Riesgo | Nota |
|---|---|---|---|---|
| 1 | **Decidir dónde vive el filtrado**: o implementar `cierreCol/tiempo` en `coincide()` y hacer que el provider pase filtros, o eliminarlos de `FiltrosPuestos` y documentar que el filtrado es de capa vista. No dejar ambos (🔴-1) | S | Bajo | Mayor valor por línea invertida |
| 2 | **Tests de invariantes** (vitest, sin React): seed→KPIs (949=231+44+199+475), anclas Roma/Cairo/Barcelona, validador del catálogo con fixtures corruptos, orden de draws D43 (🔴-3) | M | Bajo | El determinismo deja de ser frágil |
| 3 | **Extraer validador D25 compartido** (`validarJoinDivipola` + `validarPagina`) usado por loader y runtime; devolver `Map` del catálogo desde el adapter (🟡-3, 🟡-6, §5-3) | M | Bajo | Elimina divergencia futura |
| 4 | **ESLint `no-restricted-imports` para `divipola-puestos.json`** en `eslint.config.mjs` (existe y ya se usa para guardrails del digitalizador) — convierte la regla D21 en check automático | S | Bajo | La verificación manual del REPORTE se automatiza |
| 5 | **Clonado profundo / `Readonly` en la frontera del repo** y `Map` inverso para `actaEnCache` (🟡-1, 🟡-6) | M | Medio | Toca mutaciones internas del mock; hacerlo con tests de por medio (ver #2) |
| 6 | **Unificar helpers duplicados** (`delegadosAcreditados`, `ciudadDePuesto`, 794×1123, `SUPERVISOR` en actas-mock) hacia `domain/` — coordinar con el agente de componentes (§5-2, 🟢-2) | S | Bajo | Cambia también `documento-e14.tsx` |
| 7 | **Pereza real del catálogo/mesas**: `dynamic import` de `divipola-exterior.json`+generación de mesas al primer uso, y valorar servir el JSON desde `/public` (🟡-2) | M | Medio | Cambia el momento de la validación estricta (hoy: import; luego: primer uso) |
| 8 | **`PESO_ASSETS` generado por script** desde el manifest o el FS (🟡-5, §5-9) | S | Bajo | — |
| 9 | **Segundo puerto `IngestaPort`** (publicar acta + log de recepción) detrás del repositorio, para que el digitalizador deje de importar singletons de `supervision/data` y el swap al backend sea verdad (🔴-2) | L | Medio | Diseño primero; el acoplamiento cruzado entre módulos es la pieza más cara de mover |
| 10 | **¿El maestro de 635 KB en el repo?** — **SÍ, mantener** (pregunta §8): es la base verificada del join futuro (D21 exige verbatim), 635 KB es barato y su ausencia obligaría a dependencia externa. Riesgo real = import accidental; mitigar con #4. Mejora opcional (S, riesgo bajo): moverlo a `/catalog/` fuera de `src/` para que «dato maestro» no viva en el árbol compilable | S | Bajo | Decisión documentada, solo falta el guardrail |

## 8. Métricas rápidas

- **TS revisado:** 12 archivos · **2.975 LOC** (domain 661 · data 2.314). Archivo mayor: `mock-repository.ts` (894).
- **Datos estáticos:** 2 JSON (825 KB) + 1 manifest (83 líneas) + 8 PNG (≈1,82 MB).
- **Catálogo verificado en revisión:** 949 puestos · 67 países · Σ 3.670 mesas · 949 idEnlace únicos y congruentes · 0 `nivel` en JSON — ✅ coincide con el adaptador.
- **Regla D21 del maestro:** imports en código = **0** (Grep sobre `.ts/.tsx`) — ✅.
- **Tests:** **0** archivos de test, sin runner en `package.json`.
- **Singletons de módulo mutables:** 6 (`CATALOGO`, `PUESTOS`+`MESAS_POR_PUESTO`, `CACHE_ACTAS`, `RUNTIME`+`oyentes`, `ENTRADAS`+`oyentes`, contadores) — todos en data/.
- **Familias de duplicación detectadas:** 9 (§5), de las cuales 3 cruzan la frontera domain/data↔components.
- **Filtros declarados no implementados en el repo:** 2 de 8 (`cierreCol`, `tiempo`).
- **Anclas demo forzadas:** 3 (Roma→CRÍTICO; El Cairo, Barcelona-Girona→COMPLETO) con mecanismo uniforme y documentado.
- **TODO/FIXME/HACK:** 0 en el alcance.
- **Deudas:** 3 críticas · 7 medias · 8 leves · 9 duplicados.
