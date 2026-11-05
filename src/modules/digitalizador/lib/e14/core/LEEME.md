# `core/` — motor de escaneo vendorizado

Copia local del motor que antes llegaba como paquete npm
`@jg-stevan/scanner-core`. **Es código propio, no una dependencia.**

## Procedencia

| | |
|---|---|
| Origen | `github.com/Jg-Stevan/web-scanner` · `packages/scanner-core/src` |
| Commit | `feba267cb9c01a896f0135ed2e406b7567bec663` (2026-10-25) |
| Versión | 0.4.1 — la misma que estaba instalada al vendorizar |
| Licencia | MIT · texto en `LICENSE-scanner-core.md` (conservado sin cambios) |

Aquí viven **los 6 módulos que este panel importa** (`types`,
`image-processor`, `detector-client`, `ocr`, `image-modes`, `codec`). El resto
del motor —cámara, calidad, perfil de sensor, PDF, PWA— solo lo usa el móvil
(`digielect14`) y vive en su propio `core/`.

## Regla de paridad con `digielect14`

Los archivos que existen en **los dos repos** deben ser **byte a byte
idénticos**: es la garantía de que los dos digitalizadores leen el acta igual,
que antes daba el hecho de compartir la versión de npm. La sostienen dos
artefactos:

- `core/CONTRATO.json` — el md5 de cada módulo de este árbol, validado por
  `src/modules/digitalizador/lib/e14/core/__tests__/contrato-core.test.ts`
  dentro de `bun test` (corre en CI sin necesitar el otro checkout).
- `bun scripts/qa-core-vendorizado.ts` — sus chequeos: compara byte a byte contra
  el hermano cuando los dos checkouts están en disco, revisa el cierre interno,
  la procedencia, que ningún import vuelva a apuntar al paquete npm y que los
  dos `CONTRATO.json` coincidan donde se solapan.

Los md5 se calculan sobre el contenido con los saltos de línea en LF, no sobre
los bytes crudos: `.gitattributes` fija `eol=lf`, así que el CI clonaba en LF un
árbol que en Windows pudo regrabarse en CRLF, y el contrato se cortaba por algo
que no cambia cómo lee el acta un puesto. Un `git diff` del motor solo debe
mostrar cambios de código.

Ritual para un arreglo del motor: editar el archivo **en los dos repos** en el
mismo commit → `bun scripts/qa-core-vendorizado.ts --generar` en cada uno →
`bun run verificar`. Uno exclusivo del modo MASIVA (cola, dedup, hardware) se
queda solo aquí.

## El tope del rescate HEIC (D84)

`image-processor.ts` trae `dimensionesHeic()` + `HEIC_TOPE_MP_DEFECTO` (24 MP):
lean la cabecera ISO-BMFF sin decodificar, porque heic2any 0.0.4 no admite
`width`/`height` y un HEIC grande no termina de convertir. En este repo el tope
no rechaza el acta — se aplica en `masiva/archivos.ts` (`maestroDeImagen`) antes
de importar heic2any, y devuelve `null` como cualquier otro master imposible: la
fila sigue su ruta de siempre. Cambiar el tope o el límite es cambiar el módulo
compartido en los dos repos (ritual de arriba).

## Tests del motor

`core/__tests__/` trae los tests propios del motor que aplican a los módulos de
este repo (`types` · `image-modes-parity` · `parity-worker-filters`), copiados
de `web-scanner/packages/scanner-core/tests` con un solo ajuste: `../src/x` →
`../x` (acá corren con `bun:test`, igual que en el upstream). Son tests PUROS
sobre `Uint8ClampedArray`: no necesitan DOM. `quality` y `pdf-export` no están
porque sus módulos no viven en este panel — esos tests sí viajan con el motor en
`digielect14`.
