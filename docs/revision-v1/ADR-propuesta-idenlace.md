# ADR-propuesta-idenlace — el ancho de ZONA contradictorio en la identidad E-14

- **Estado:** PROPUESTA — decisión pendiente del dueño (M1/D22). Nada del código fue unificado por R2 (bloqueado por producto).
- **Autor:** Agente R2 (capa shared), reporte de revisión v1 §B2 #4 y MASTER-REVIEW §2/§4 (trampa conocida).
- **Alcance:** documentar la contradicción, el riesgo de join roto y 2 opciones con trade-offs. No cambia comportamiento.

## 1. La contradicción (verificada hoy)

El MISMO concepto — el código de zona DIVIPOLA dentro de la identidad de un
puesto — viaja con **2 dígitos** en la base nacional y con **3 dígitos** en
la identidad del monitor (catálogo exterior):

| Convención | Sitios (archivo:línea) | Evidencia |
|---|---|---|
| **Zona a 2 dígitos** | `digitalizador/lib/e14/divipol.ts:161` (`mesasDePuesto`, `zon.padStart(2,"0")`) · `clasificador.ts:508` (`zonaLeida.padStart(2,"0")`) · `clasificador.ts:1080` (`claveDeMesa`, `zon.padStart(2,"0")` → «88-335-**05**-02-001») | `public/e14/divipol.json`: las zonas del árbol nacional son `'00'…'99'` (2 dígitos) |
| **Zona a 3 dígitos** | `store/store-e14.ts:100` (`joinDeActa`, `zona.padStart(3,"0")`) · `supervision/domain/divipola.ts:29,59,110` (`codigoZona` validado `RE_CODIGO_3` = 3 dígitos) | `supervision/data/divipola-exterior.json`: `idEnlace:"88_495_010_02"` Roma (zona **010**), Accra `88_115_005_02` (zona **005**) |

El puente entre las dos convenciones está **manualizado** en `joinDeActa`
(comentario `store-e14.ts:79-82`: *«la zona impresa "05" viaja verbatim en
`impresion`, el join usa "005"»*). Además, el MISMO puesto produce **dos
nombres derivados distintos** según qué camino lo construya:

- `nombreExportacion` / clave de mesa (zona 2): `E14_..._88-335-05-02_...`
- `nombreArchivo` de la masiva (`store-e14.ts:163`): `E14_{idEnlace}_...`
  con el idEnlace de zona 3.

## 2. El riesgo (join roto silencioso)

1. **Dos claves para el mismo puesto.** La clave de mesa (zona 2) y el
   idEnlace del monitor (zona 3) difieren en el segmento de zona; cualquier
   comparación directa entre archivos exportados, actas archivadas y
   publicaciones al monitor falla o requiere re-normalizar a mano.
2. **Join dependiente de un solo punto manual.** Si un futuro productor de
   idEnlace (p. ej. un importador del catálogo nacional o un nuevo consumidor
   del JSON) usa el ancho de la fuente sin `padStart(3)`, el join contra el
   catálogo del monitor devuelve vacío **sin error** — el clásico fallo
   silencioso que la paridad por comentario no detecta.
3. **El catálogo exterior es real a 3 dígitos** (Roma `010`, Accra `005`),
   mientras el árbol nacional real es a 2 (`00`–`99`). No es un bug de dato:
   son dos convenciones conviviendo, hoy separadas porque el catálogo en
   código es SOLO exterior (`divipola-adapter.ts:12-14` — el maestro nacional
   «NUNCA se importa»). El día que el join nacional exista de verdad, la
   contradicción pasa de latente a activa.

## 3. Opciones (trade-offs)

### Opción A — Canon único: zona a 3 dígitos en todas las convenciones

Regenerar `public/e14/divipol.json` con zonas a 3 dígitos y ajustar
`divipol.ts`, `clasificador.ts:508,1080` (y el modo texto libre que rellena
defensivamente).

- ✅ Una sola convención; el join deja de necesitar puente manual.
- ❌ Toca el clasificador (zona caliente del pipeline, con anclas QA que
  grepean literales como «88-335-05-02-001»).
- ❌ Regenera el asset de ~620 KB y cambia TODAS las claves de mesa
  históricas (`05`→`005`): rompe comparaciones con archivos y actas ya
  exportadas/escaneadas.
- ❌ Riesgo alto — no hacer sin guard de benchmark + QA portado (ola 2).

### Opción B — Convención dual NOMBRADA, centralizada en un único constructor (recomendada)

Mantener los anchos de hoy (nacional/mesa a 2 · monitor a 3) pero
extraer el constructor a `src/shared/e14/identidad.ts`:

```ts
const ANCHOS_ZONA = { nacional: 2, monitor: 3 } as const;
export function construirIdEnlace(c: CodigosPuesto, destino: "nacional" | "monitor"): string;
export function claveDeMesa(c: CodigosPuesto): string;      // zona 2 (hoy)
export function nombreArchivoE14(c: CodigosPuesto, mesa, formulario, pagina): string;
```

- ✅ Cero cambio de comportamiento y de datos; el puente manual queda
  reemplazado por UNA función testeada (se mata el «cada quien su
  padStart»).
- ✅ Riesgo bajo; compatible con la doctrina «mover sin cambiar».
- ❌ La dualidad persiste (documentada, no eliminada): quien una contra la
  base nacional directa sigue necesitando saber el ancho.

## 4. Recomendación y condición

B ahora (barata, no rompe nada), A solo si el dueño decide regenerar la base
DIVIPOLA nacional con zonas a 3 dígitos y acepta la migración de claves
históricas. **Es decisión de producto (M1): R2 no movió `idEnlace` ni el
ancho de zona a `src/shared/`** — queda fuera del alcance hasta que el dueño
resuelva.
