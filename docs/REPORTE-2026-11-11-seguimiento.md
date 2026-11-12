# Reporte de seguimiento — 2026-11-11

> Para retomar mañana sin releer la sesión. Estado real verificado al cierre:
> gate en verde, commit subido, prueba E2E en teléfono físico hecha.

---

## 1. Hecho hoy y ya subido

| Qué | Estado |
|---|---|
| Anti-reproceso de reenvíos del móvil (9 archivos, +298/−31) | **Commit `dbac9b9` · push a `main`** |
| Retiro del workflow `pages.yml` + comentario en `ci.yml` | **Commit `0e555bd` · push a `main`** |
| `bun run verificar` (tsc + eslint + suites) | **VERDE**: 520 + 141 tests, 0 fallos |
| Modelos OCR sueltos (51 MB: `rapidocr-v5/`, `v6/`) | Movidos fuera del repo a `%TEMP%\rapidocr-modelos-retirados-2026-11-11` |
| Rama `feat/fusion-evidencia-divipol` | **Subida a `origin`** (commits `e7b146e`…`ea6b767`) |
| Prueba en dispositivo real (Galaxy A56, Android 16, ADB wireless) | **Funciona**: captura automática + pipeline + envío al hub |

### Cómo funciona el anti-reproceso (resumen)
El embudo único `actas-runtime.publicarActaMasiva` identifica cada página por
`idEnlace::mesa::formulario::página` y compara la huella `hashSha256` del sobre:

- Misma página + misma huella → `DUPLICADA` con `dupOf` (no republica, no re-mide, no suma).
- Misma página + huella distinta → reescaneo legítimo (reemplaza la foto).
- Sin huella → conservador, no se marca nada.

Regla heredada de masiva: **solo contenido, jamás nombre de archivo ni fecha**.

---

## 2. Prueba en el teléfono (cómo repetirla)

```bash
ADB=/c/platform-tools/adb.exe
D=$(/c/platform-tools/adb.exe devices | awk 'NR==2{print $1}')
$ADB -s "$D" reverse tcp:8443 tcp:8443
$ADB -s "$D" reverse tcp:8081 tcp:8081
$ADB -s "$D" shell "am start -a android.intent.action.VIEW -d 'https://localhost:8443/' -p com.android.chrome"
```

- Requiere el hub corriendo (`bun scripts/hub-local.mjs`) en el PC.
- Alternativa sin ADB (misma red Wi-Fi): `https://192.168.1.9:8443/`.
- El túnel `adb reverse` se pierde al desconectar la depuración.

**Hallazgo de la prueba**: llegaron 4 actas al hub (seq 33–36); la página 2 de
`88_335_005_02` llegó dos veces **con hashes distintos** → el sistema la trató
como reescaneo (correcto según la regla actual). La detección de "misma acta,
otra foto" depende de la capa perceptual: ver §5.2.

---

## 3. Decisiones tomadas hoy

| # | Tema | Decisión |
|---|---|---|
| 1 | Anti-reproceso | Subido ✅ |
| 2 | Rama `feat/fusion-evidencia-divipol` | **Subida a `origin`** ✅ (integrar en `main` o descartar tras probarla) |
| 3 | Modelos OCR sueltos | Retirados del repo ✅ |
| 4 | Alcance | **Demo pública en navegador** con botón SIMULACIÓN |
| 5 | Datos personales en assets | Dejarlos como documentos públicos (asumir firmas visibles) |
| 6 | Aprobación manual en Recepción | No se implementa |
| 7 | Actas ADVERTENCIA | Lo ideal: todas pasan solas → calibrar scoring primero |
| 8 | Reescaneos | Detectar por QR / información impresa (lo más rápido) |
| 9 | Sidecar instalable | **Se queda**: es el OCR nativo del producto |
| 10 | Monitor lento | Medir y comparar opciones de render antes de decidir |
| 11 | Regla ALTO | Los **dos motores en cascada, siempre disponibles** (zonas sin conexión) |
| 12 | iOS y otros Android | Sí: corregir iOS y ampliar matriz de compatibilidad |
| 13 | Notificaciones (D82) | Eliminada (la vista ya no existe) |
| 14 | GitHub Pages | Retirar (bloqueo técnico abajo) |
| 15 | `.git` accidental en el home del mantenedor | Borrar (bloqueo técnico abajo) |

---

## 4. Siguiente entrega: demo pública con botón SIMULACIÓN

### Objetivo
Que cualquiera pruebe el flujo completo desde el navegador, sin actas físicas y
sin instalar nada. La única pieza descargable seguirá siendo la versión nativa
de **carga masiva** del panel (el resto es web).

### UX propuesta
1. **Botón `SIMULACIÓN` (móvil)** — carga 3–4 actas de ejemplo (imágenes
   sintéticas incluidas en el bundle), las pasa por el pipeline real
   (clasificación + score) y las publica en el hub. Todo marcado como DEMO.
2. **Botón `Simular recepción` (panel)** — inyecta las mismas actas en el
   embudo de Recepción para ver el visor sin depender del teléfono.
3. **Botón `Reiniciar demo`** en ambas apps: vacía envíos del móvil (outbox
   demo) y la recepción/visor del panel (la memoria es de sesión).
4. Aviso visible: «Modo demostración — no usar con actas reales».

### Infraestructura recomendada (gratuita)
| Pieza | Servicio | Motivo |
|---|---|---|
| Estáticos (panel y móvil) | **Cloudflare Pages** (ya hay `cloudflare-pages.yml`) | Gratis, conectado a GitHub, headers propios |
| API del hub | **Cloudflare Worker** (`e14-puente`, ya existe) | Mismo mantenedor, gratis hasta 100k req/día |
| Fotos subidas | **Cloudflare R2** | 10 GB gratis, sin costo de salida |
| COOP/COEP (multi-hilo) | Headers en `public/_headers` de Pages y en el Worker | Requisito del OCR multihilo |

Alternativas descartadas: Vercel (no incluye almacenamiento), Render/Railway
(se duermen), Netlify (funciones y blobs con más límites).

### Fases
1. `SIMULACIÓN` móvil con fixtures locales (no requiere backend).
2. `Simular recepción` en el panel reutilizando `publicarActaMasiva` con origen
   demo (evaluar si se añade un origen `demo` al log).
3. Deploy del hub a Worker + R2 y persistencia real de fotos.
4. Verificar COOP/COEP y wasm partido en Pages (pendiente ya anotado en DEUDA).
5. `Reiniciar demo` en ambos lados, con confirmación.

### Riesgos a respetar
- **No subir actas reales** a la demo pública (SEC-10 y regla de privacidad).
- Sin URLs externas configurables (el hub es ruta fija del mismo origen).
- La demo debe poder vaciarse por completo con un botón.

---

## 5. Pendientes técnicos, con plan

### 5.1 Scoring: ¿una acta legible puede bajar de score? (decisión 7)
Hoy el score pondera nitidez, reflejos, encuadre y confianza del OCR. Un acta
legible **no debería** bajar; si baja, es falso negativo.
**Plan**: reunir 20–30 actas reales con score bajo, revisarlas a mano y ajustar
pesos solo donde se confirme el falso negativo. Documentar el antes/después en
`docs/MEDICIONES.md`.

### 5.2 Detección de reescaneos por QR / impreso (decisión 8)
El QR/1D impreso da identidad exacta en milisegundos y ya se decodifica en el
pipeline. **Plan**:
1. Añadir `qrPayload` normalizado al sobre (`EntradaPuente` + hub + móvil).
2. Indexar por (página + payload QR) en el embudo → duplicado inmediato aunque
   la foto sea distinta.
3. Respaldo `dhash64` (Hamming ≤ 6) para páginas sin QR legible.

### 5.3 Sidecar OCR instalable = OCR nativo (decisión 9)
Se queda como parte del producto. Es el acelerador nativo que corre en el PC y
hace el OCR localmente (más rápido que el navegador); el panel lo detecta con un
ping a `localhost:8765/salud`.
**P0 vigente**: si el sidecar estaba encendido y se cae, el panel debe apagarlo
y avisar solo (hoy no lo hace).

### 5.4 Monitor global sin virtualización (decisión 10)
El monitor dibuja las ~950 filas de golpe; en equipos modestos se siente lento.
Virtualizar = dibujar solo las ~20 visibles.
**Plan**: medir tiempo de render y FPS con el catálogo completo; si supera el
umbral acordado, virtualizar sin paginar (prohibido inventar paginación).

### 5.5 Regla ALTO / motores en cascada (decisión 11)
Hoy, al escanear, la app decide si usa el motor pesado según la red del momento.
Eso castiga un acta escaneada sin datos aunque luego se sincronice.
**Decisión**: los **dos modelos (v5 y v6) deben estar siempre disponibles en
cascada**, también sin conexión. La red solo puede limitar la descarga de
modelos (`sincronizarSoloWifi`), nunca qué motor clasifica ni su orden.
**Plan**: pre-cargar ambos modelos en el paquete/PWA, cascada
«rápido → preciso» con fallback local, y pruebas explícitas en modo avión.

### 5.6 iOS y compatibilidad Android (decisión 12)
- iOS: sin `deviceMemory`/`performance.memory` la ruta de inferencia queda en
  MEDIO; fix propuesto: renderer GPU + sonda ≥ 750.
- Android: ampliar la matriz de equipos (gama baja/media/alta) y anotar en
  `docs/MEDICIONES.md` qué modelo cae en qué perfil.

### 5.7 Notificaciones (decisión 13)
La **vista** ya está eliminada (D82). Queda el dato en el dominio sin UI.
No se hará cirugía de tipos salvo que el negocio pida la pantalla de nuevo.

### 5.8 GitHub Pages (decisión 14) — paso manual
El workflow `pages.yml` de `supervision-e14` ya está eliminado del repo. Para
apagar el sitio publicado:

```bash
gh api -X DELETE repos/Jg-Stevan/supervision-e14/pages
```

En `digielect14` queda `deploy-pages.yml`; decidir lo mismo y borrarlo junto con
sus menciones en comentarios (`deploy-cf.yml`, `quality.yml`, `frescura-deploys.yml`).
*(El agente no ejecutó el DELETE remoto: acción externa bloqueada en auto mode.)*

### 5.9 `.git` accidental en el home del mantenedor (decisión 15) — paso manual
Es un repo sin commits que ve todo el home. El agente no pudo moverlo (permiso
denegado; posible bloqueo del propio editor/indexador). Cerrar el editor que lo
tenga abierto y ejecutar:

```powershell
Move-Item <ruta-local-del-mantenedor>\.git <ruta-local-del-mantenedor>\git-accidental-home-2026-11-11
# o, si no está en uso:
Remove-Item -Recurse -Force <ruta-local-del-mantenedor>\.git
```

### 5.10 Rama `feat/fusion-evidencia-divipol` (decisión 2)
4 commits, ~1 292 líneas nuevas en `packages/scanner-core`:
`fusion.ts` (motor que combina lo leído del acta con el catálogo DIVIPOL usando
pesos), `normalizar.ts`, tipos y 223 líneas de tests.
En simple: **si el OCR confunde un código (1↔7, 0↔8), el motor busca la
combinación válida más probable contra DIVIPOL y "rescata" el acta**.
**Estado**: ya está subida a `origin`. Pendiente: probarla con actas reales y
decidir si se integra en `main` o se descarta.

---

## 6. Deuda de calidad y preparación para público

Objetivo: que el repo se pueda publicar sin arrastrar material interno, con
código mantenible y una descarga mínima para quien lo pruebe.

### 6.1 Refactor y reutilización
- Unificar lógica duplicada entre `supervision`, `digitalizador` y
  `packages/scanner-core` (normalización de códigos, impresión de encabezados,
  validaciones D22/D25, formateo de horas).
- Eliminar utilidades muertas y exports sin consumidores antes de publicar.
- Adoptar un mínimo común: nombres en español consistentes, tipos de dominio
  compartidos en un solo lugar y tests junto al código que cubren.

### 6.2 Comentarios y atribuciones personales
- **~399 menciones al rol de propietario en código y scripts** (350 del tipo «el/del propietario»).
  Se deben neutralizar: la decisión se documenta como decisión
  (p. ej. «Decisión D-8: …») sin atribuir a una persona.
- Revisar «feedback del propietario», «regla del propietario» y similares en comentarios;
  conservar el *qué* y el *porqué*, no el quién.
- Comentarios solo para el porqué no obvio; eliminar los que narran la tarea o
  el historial de una corrección.

### 6.3 Arquitectura
- Evaluar si la separación actual (`supervision` / `digitalizador` / `shared` /
  `packages/scanner-core`) es la ideal o si hay capas de más.
- Detectar dependencias cruzadas entre módulos y proponer fronteras claras
  (datos ↔ componentes ↔ dominio).
- Documentar el resultado en `docs/ARQUITECTURA.md` con un diagrama de flujo
  (móvil → hub → panel) y las reglas de dependencia.

### 6.4 Documentación del repo
- Auditar `docs/`: qué se queda (runbooks vigentes, ADR, DEUDA, MEDICIONES),
  qué se archiva y qué se elimina (históricos e informes internos).
- Reescribir `README` para público: qué es, cómo probarlo en 5 minutos,
  arquitectura y límites.
- Revisar que ningún documento cite rutas, personas o procesos internos.

### 6.5 Peso y descargas para el público
- Revisar qué se descarga hoy: vendor de OCR (~75 MB), assets de actas
  (~37 MB) y modelos. La demo no debe obligar a bajar material innecesario.
- Cargar assets de demostración bajo demanda (o servirlos desde el hub demo) y
  excluir del paquete público todo lo que no sea imprescindible.
- Verificar `preparar` en un clon limpio: debe fallar claro si falta algo y no
  descargar silenciosamente basura.

### 6.6 Higiene antes de abrir el repo
- Confirmar que no hay binarios, capturas ni credenciales versionadas.
- Revisar `.gitignore` (modelos, capturas, `.hub-local`, `out/`, certificados).
- Decidir sobre el historial con datos personales (decisión 5: se dejan como
  documentos públicos; no se purga).

---

## 7. Criterio de «terminado» (demo)

- [ ] `SIMULACIÓN` móvil y `Simular recepción` panel funcionando online.
- [ ] `Reiniciar demo` limpia envíos y visor en ambos lados.
- [ ] Hub desplegado en Worker + R2 con fotos persistidas.
- [ ] COOP/COEP verificados en el proveedor (OCR multihilo).
- [ ] Scoring calibrado con muestra real (§5.1).
- [ ] Dedup por QR + dhash (§5.2).
- [ ] Dos motores OCR en cascada y disponibles sin conexión (§5.5).
- [ ] Sidecar nativo con auto-apagado y aviso (§5.3).
- [ ] Monitor medido con opciones comparadas (§5.4).
- [ ] Matriz Android/iOS documentada (§5.6).
- [ ] GitHub Pages apagado en ambos repos (§5.8).
- [ ] `.git` accidental del home retirado (§5.9).
- [ ] Refactor, reutilización y comentarios sin atribuciones (§6.1–6.2).
- [ ] Arquitectura revisada y documentada (§6.3).
- [ ] Documentación y peso de descarga depurados para público (§6.4–6.6).

---

## 8. Comandos del día siguiente

```bash
cd repos/supervision-e14
bun run verificar                 # puerta de calidad
bun scripts/hub-local.mjs         # hub E2E local
# panel: https://localhost:8443/supervision/  ·  móvil: https://localhost:8443/
git log --oneline -3              # dbac9b9 / 0e555bd
```
