# REPORTE SUP-5 — divipola-v1

- Rama: **feat/divipola-v1** (base: `ea8092e` — main post-merge actas)
- Commits:
  - `08db333` feat(supervision): retiro TEMPORAL de notificaciones e informes por flag (SUP-5 T1, D20)
  - `d91ea63` feat(supervision): ingesta del catálogo DIVIPOLA exterior + validación estricta (SUP-5 T2, D21/D22)
  - `af7c3ee` feat(supervision): repositorio y ancla demo sobre el catálogo DIVIPOLA real (SUP-5 T3)
  - *(docs)* feat(supervision): docs REPORTE + DECISIONS D20-D22 + README + capturas (SUP-5 T5)

## DIVIPOLA

- SHA-256 copias: maestro
  `bcd8f47d596cbe64ab66de5ed4ec1db3df1ab331f534eca0e22590f843a3e015` /
  derivado
  `bbb12832429e32ce8568aa2e6b0cc3b41f30ac50d0bf1ead3c9c48867d360ee4`
  (¿coinciden con §0.2?: **sí** — copiados verbatim, sin reformatear).
- Maestro: 620 KB · **14.438 registros** verificados (34 deptos
  incluido `88 CONSULADOS`) · ¿importado en código?: **NO**:

  ```
  $ rg -n "divipola-puestos" src/ --glob '!*.json'
  (sin resultados — exit 1)
  ```
- Derivado: **949 registros · 67 países · 3.670 mesas**
  (Σ totalMesas) · duplicados: **0** (949 idEnlace únicos) ·
  ordenado por idEnlace: sí · guardrail 1.500: OK.
- Registros de control §2.1: primero/ancla/último ¿presentes?: **sí**
  - primero `88_115_005_02` — Accra Consulado (GHANA)
  - ancla `88_495_010_02` — Roma - Consulado (ITALIA) · **totalMesas: 8**
  - último `88_815_065_86` — SABADO SAN CRISTÓBAL - CONSULADO (VENEZUELA)
- Números del catálogo confirmados: mayor puesto Madrid - Consulado
  (ESPAÑA) 159 mesas · top países por puestos: EEUU 123, España 66,
  Venezuela 59, Ecuador 44, Brasil 42.
- Anomalías de validación: **ninguna** (0 errores de adaptador).

## Whitelist

| Archivo | Tipo | OK |
|---|---|---|
| `src/modules/supervision/data/divipola-puestos.json` | nuevo (verbatim) | ✅ |
| `src/modules/supervision/data/divipola-exterior.json` | nuevo (verbatim) | ✅ |
| `src/modules/supervision/domain/divipola.ts` | nuevo | ✅ |
| `src/modules/supervision/data/divipola-adapter.ts` | nuevo | ✅ |
| `src/modules/supervision/data/mock-repository.ts` | editado | ✅ |
| `src/modules/supervision/data/actas-mock.ts` | editado (re-anclaje ancla) | ✅ |
| `src/modules/supervision/components/supervision-shell.tsx` | editado (flag + filtro + switch) | ✅ |
| `src/modules/supervision/domain/types.ts` | editado (docs del contrato con códigos divipola) | ✅ |
| `docs/DECISIONS.md` | editado (D20-D22 + supersedencia de D6 dentro de D21) | ✅ |
| `README.md` | editado («Fuente de datos (DIVIPOLA)» + «Módulos temporalmente desactivados») | ✅ |
| `docs/REPORTE-divipola-v1.md` | nuevo (este informe) | ✅ |
| `docs/capturas-divipola-v1/*.png` | nuevo (evidencia §4 — declarado, ver «Decisiones») | ✅ |

`git diff --stat main...feat/divipola-v1` → solo archivos de la tabla
anterior. `git diff main -- package.json` → **vacío** (sin deps nuevas;
el JSON se parsea con `JSON.parse` nativo vía import, sin librerías de
validación). Sin toques a `.github/`, `next.config.ts`, `src/app/`.

## Verificación §4

| # | Punto | Resultado | Evidencia |
|---|---|---|---|
| 1 | `bunx tsc --noEmit` en clone fresco SIN typegen | ✅ 0 errores | ejecución registrada (exit 0) |
| 2 | `bun run lint` | ✅ 0 | ejecución registrada (exit 0) |
| 3 | Sidebar: solo Monitor global, Carga masiva (disabled), Revisión de anomalías (badge 5) | ✅ | captura `02-sidebar-reducido.png` |
| 4 | `rg 'vista-notificaciones\|vista-informes' supervision-shell.tsx` → 0 referencias activas; archivos dormidos en repo | ✅ 0 matches; `vista-informes.tsx` y `vista-notificaciones.tsx` intactos | salida registrada |
| 5 | Reactivar en dev (sin commitear): vaciar el flag → las 2 entradas vuelven | ✅ verificado en caliente (CENTRO DE NOTIFICACIONES 4 + GENERAR INFORMES reaparecen); revertido y NO commiteado | snapshot del navegador |
| 6 | JSON: SHA-256 de ambas copias; maestro 620 KB/14.438 (sin import); derivado 949/67/3.670 | ✅ | sección DIVIPOLA arriba |
| 7 | `idEnlace` únicos (0 duplicados); 3 registros de control; ancla `88_495_010_02` con 8 mesas | ✅ | adaptador + verificación runtime |
| 8 | KPIs derivados: 949 = 231 completo + 44 crítico + 199 pendiente + 475 no iniciado — suma EXACTA | ✅ invariante intacta (también tras transiciones de vida: 949 = 239+44+191+475) | captura `01-monitor-1440.png` |
| 9 | Italia/Roma real: fila `495 - ITALIA`, CRÍTICO, 8 mesas, 9:00 AM / 7:08 PM / > 3 hrs | ✅ | captura `03-busqueda-roma.png` |
| 10 | Expandir Roma: mesas 001-003 exactas (001 INCOMPLETO Rescaneo · 002 EN_PROCESO · 003 NO_INICIADO); VER ACTA abre visor; `#A92-F` con historial 14:00/14:18/14:20 intacto | ✅ breadcrumb real `ITALIA (495) › ZONA 10 › 02 - ROMA - CONSULADO`; PÁGINA 2 ADVERTENCIA; documento con TOTAL = suma exacta | captura `04-roma-expandido-acta.png` |
| 11 | Búsqueda «roma» filtra sobre el catálogo real | ✅ 7 filas ITALIA zona 10 | captura `03-busqueda-roma.png` |
| 12 | REINSPECCIONAR en mesa del catálogo | ✅ spinner ~2.5 s → alerta resuelta → toast «Rescaneo completado en Mesa 001 (ITALIA — 02 - Roma - Consulado)» | capturas `05-reinspeccionar-resuelto.png` |
| 13 | Anomalías: badge 5 y lista intactas (re-ancladas); VER ACTA desde anomalía funciona (aterriza PÁGINA 2) | ✅ | captura `06-anomalias.png` |
| 14 | 1440×900 sin scroll horizontal (scrollWidth = clientWidth = 1440; tabla overflowX = 0). 375px sin scroll de página (375 = 375) | ✅ nombres reales caben (truncado del shell preexistente); no hizo falta px-1.5 extra ni memo | capturas `01-monitor-1440.png` / `07-movil-375.png` |
| 15 | `bun run build` con `NEXT_PUBLIC_BASE_PATH=/supervision-e14` → OK; preview subpath funcional | ✅ `out/` generado; assets `/supervision-e14/_next/...`; preview HTTP servido en subpath renderiza KPIs 949/231/44/199/475 | captura `08-subpath-export.png` |
| 16 | `git diff --stat main...feat/divipola-v1` solo archivos de §1 | ✅ | whitelist arriba |
| 17 | `git diff main -- package.json` vacío (sin deps nuevas) | ✅ | whitelist arriba |

## Decisiones dentro del kit

- **Nombres reales integrados:** la whitelist del kit listaba posibles
  ediciones; el editado real es exactamente el declarado arriba.
  `supervision-repository.ts` NO requirió cambios (la interfaz no
  necesitó el tipo divipola — condición "solo si" del kit).
- **Formato del puesto mostrado:** `<codigoPuesto> - <nombre real>`
  (p. ej. `02 - Roma - Consulado`). El kit ilustra el breadcrumb con
  separador «·»; se conserva el separador ` - ` del mockup porque los
  componentes del visor NO están en la whitelist y derivan la ciudad
  con `split(" - ")` (`documento-e14.tsx`: «02 - Roma - Consulado» →
  ROMA). El nombre real del catálogo se muestra VERBATIM en la fila y
  el visor lo capitaliza por su estilo preexistente — el dato no se
  reescribe (§2.3).
- **Códigos en la UI:** la fila muestra `<mun> - <país>` (p. ej.
  `495 - ITALIA`) reutilizando las columnas existentes (`codigoPais`
  ahora lleva el código divipola del municipio/país — D21). Zona UI sin
  ceros ("010" → "10") vía `zonaParaUI` del dominio.
- **Retiro temporal (D20):** la verificación §4.4 (0 referencias activas
  en el shell) exige retirar también los imports de las vistas
  dormidas; por eso la restauración COMPLETA cuesta el flag + 2 imports
  + 2 casos del switch (declarado en D20 y README). La prueba §4.5 del
  kit (las 2 ENTRADAS vuelven al vaciar el flag) funciona con 1 línea.
- **Receta de mesas CRÍTICO (puestos nuevos del catálogo):** el mock
  anterior solo tenía 1 crítico (Roma, con receta propia). Para los
  ~44 críticos que salen del seed se aplicó una receta coherente con el
  kit SUP-3 («mayormente NO_INICIADO/INCOMPLETO, alerta "Rescaneo"
  presente»): mesa 001 INCOMPLETO con Rescaneo (reinspeccionable), 002
  EN_PROCESO si hay más mesas, resto NO_INICIADO. Los pcts siguen
  DERIVÁNDOSE de las mesas (D16), regla intacta.
- **Re-anclaje de semillas (anomalías/notificaciones):** España, México,
  Países Bajos e Inglaterra EXISTEN en el catálogo real (66/30/8/8
  puestos); las semillas apuntan a puestos reales hallados por búsqueda
  determinística (país + mesa con estado útil) — §0-9 sin aleatoriedad.
  «Desfase de hora» queda sin mesa (igual que hoy) → VER ACTA
  deshabilitado en esa fila, como antes.
- **Horarios:** los campos de hora (cierre COL / hora local /
  diferencia) son de simulación; se siembran por seed con pools del
  mockup. Coherencia EXACTA solo exigida para el ancla Roma (valores
  literales del mockup: 9:00 AM / 7:08 PM / > 3 hrs) — §4.9.
- **Capturas:** `docs/capturas-divipola-v1/` (8 PNG) no estaba en la
  whitelist literal, pero §4 exige «capturas en el reporte» — se añaden
  como evidencia y se declaran aquí (única adición fuera de la lista
  literal; cero impacto en código/bundle).
- **Nota de render:** la tabla renderiza 949 filas sin paginación ni
  virtualización (prohibido inventarlas). Verificado fluido en el
  navegador en dev; el re-render por ticker (cada 5 s) respeta las
  referencias de props (useMemo del store) y no degrada la página.

## BLOQUEADAS

- **Ninguna.** (T1-T5 completos; validación del catálogo con 0 errores.)

## Screenshots

- `01-monitor-1440.png` — Monitor a 1440×900: KPIs derivados
  949/231/44/199/475 (suma exacta), catálogo real en tabla, sin scroll
  horizontal.
- `02-sidebar-reducido.png` — sidebar tras el retiro: Monitor global ·
  Carga masiva (disabled) · Revisión de anomalías (badge 5) · Cerrar
  sesión. Sin notificaciones ni informes.
- `03-busqueda-roma.png` — búsqueda «roma»: 7 filas ITALIA; ancla
  `495 - ITALIA · 10 · 02 - Roma - Consulado · 8 · CRÍTICO · 44%/31%`.
- `04-roma-expandido-acta.png` — visor de actas con breadcrumb real
  `ITALIA (495) › ZONA 10 › 02 - ROMA - CONSULADO`, credencial `#A92-F`,
  motivo SOLICITUD DE RESCANEO, historial 14:20/14:18/14:20, documento
  E-14 sintético con TOTAL = suma exacta.
- `05-reinspeccionar-resuelto.png` — REINSPECCIONAR resuelto en Mesa 001
  (alerta fuera, mesa COMPLETO, toast, KPIs en vivo con invariante).
- `06-anomalias.png` — 5 abiertas de 7 re-ancladas al catálogo real;
  VER ACTA por fila.
- `07-movil-375.png` — 375px: KPIs apilados, filtros en columna, sin
  scroll de página.
- `08-subpath-export.png` — preview del export estático servido en
  `/supervision-e14/` (assets con basePath), estado inicial determinístico.
