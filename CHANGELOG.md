# CHANGELOG — supervision-e14

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) — este
archivo cubre el PANEL `supervision-e14` (raíz del workspace). El motor
compartido tiene su propio changelog:
[`packages/scanner-core/CHANGELOG.md`](./packages/scanner-core/CHANGELOG.md)
(última entrada del paquete: **0.5.0** — 2026-11-07, migración v2.3).
Las decisiones D-xx / P-xx viven en `docs/` (por repo: pueden divergir del
hermano `digielect14`).

## [2026-11-12] — kits de campo (olas del plan 2026-11-11)

### Añadido
- **P-21 — sidecar auto-apagado**: si el sidecar nativo muere, se apaga solo y
  avisa en la UI en vez de quedar colgado.
- **P-22 — dedup del puente con 3 capas**: SHA-256 + `qrPayload` exacto +
  `dhash64` perceptual — el receptor descarta reenvíos y re-procesos por
  identidad de contenido (complementa el anti-reproceso por página del móvil).
- **P-28 — chip de notificaciones**: dato vivo de notificaciones renderizado
  (chip + panel, D82).
- **P-23 + P-26 — tier de gama**: regla ALTO con red CONGELADA, sonda GPU para
  iOS y precarga de modelos solo con wifi.
- **D-31/32/33 — botones demo públicos** (ola 3): superficie de demostración
  honesta, separada del dato de jornada.
- **D-35 — check de cabeceras**: verificación de las cabeceras de seguridad
  del despliegue en cada build (espejo del hermano).
- **T-11 — fusión de evidencia acta ↔ DIVIPOL**: motor integrado en espejo del
  PR #158 de dig (D89-dig), tras kill-switch con flag APAGADO por defecto.

### Cambiado
- **P-25 — ventana de filas del monitor**: <tbody> medido y verificado (25
  filas vs 949) — sin paginar, sin scroll fantasma.
- **T-16 — paridad simétrica**: `scripts/qa-paridad-motor.ts` versionado,
  idéntico byte a byte al de dig (qa-paridad-motor 20/20).

## [2026-11-08] — D35: actas reales retiradas del HEAD

- Fotos de actas reales fuera del repo (kit metadata-only) y lectura del hub
  autenticada con token. Detalle en [`SECURITY.md`](./SECURITY.md).
