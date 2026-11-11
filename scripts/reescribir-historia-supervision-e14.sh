#!/usr/bin/env bash
# KIT e14-ola1 (bloque 1.3, cierra F11 en el hermano) — REESCRITURA de historia
# de supervision-e14 para eliminar las actas REALES del repositorio:
#   · src/modules/supervision/data/actas-reales/assets (8 WebP con códigos DANE)
#   · src/modules/digitalizador/assets/actas-demo (6 JPG reales del consulado)
#   · src/modules/digitalizador/assets/acta-e14-real.jpg (copia del digitalizador)
#   · docs/capturas-actas-reales-v1 (capturas con fotos reales)
#   · docs/historico/actas-reales-manifest.original.json (G2: purgar también)
#
# ⚠️  LO EJECUTA EL DUEÑO, no un agente: fuerza push y reescribe SHAs.
# Endurecido en la remediación de la auditoría 2026-11-11: bundle de respaldo
# obligatorio, --force-with-lease (nunca --force a secas) y registro del SHA
# previo de main. El manifest metadata-only VIGENTE
# (src/modules/supervision/data/actas-reales/actas-reales-manifest.json) y
# actas-reales.ts SOBREVIVEN: el --path apunta solo a assets/.
set -euo pipefail

REPO_URL="https://github.com/Jg-Stevan/supervision-e14.git"
DIR="${1:-supervision-e14-rewrite}"
# G2 (dueño, 2026-11-11): purgar también la evidencia metadata-only original.
# Pon PURGA_MANIFEST_ORIGINAL=0 para conservarla.
PURGA_MANIFEST_ORIGINAL="${PURGA_MANIFEST_ORIGINAL:-1}"

command -v git-filter-repo >/dev/null || { echo "FALTA: pip install git-filter-repo"; exit 1; }

git clone "$REPO_URL" "$DIR"
cd "$DIR"

# Re-verifica las rutas alcanzables antes de filtrar. Si aparece una ruta
# nueva con actas reales, añádela al --path de abajo.
echo "▶ Rutas alcanzables (objetivo: las 4 familias de abajo):"
git rev-list --all --objects | grep -iE "acta-e14-real|actas-reales/assets|actas-demo|capturas-actas-reales|actas-reales-manifest.original" || echo "0 (limpio)"

SHA_PREVIO="$(git rev-parse origin/main 2>/dev/null || git rev-parse main)"
echo "▶ SHA previo de main: $SHA_PREVIO"
echo "  Anótalo en docs/adr/README.md al cerrar la purga (plantilla Anexo C)."

BUNDLE="../supervision-e14-backup-$(date +%Y%m%d).bundle"
git bundle create "$BUNDLE" --all
echo "▶ Respaldo creado: $BUNDLE (guárdalo fuera de la máquina de trabajo)"

ARGS=(
  --path src/modules/supervision/data/actas-reales/assets
  --path src/modules/digitalizador/assets/actas-demo
  --path src/modules/digitalizador/assets/acta-e14-real.jpg
  --path docs/capturas-actas-reales-v1
)
if [ "$PURGA_MANIFEST_ORIGINAL" = "1" ]; then
  ARGS+=(--path docs/historico/actas-reales-manifest.original.json)
fi

git filter-repo --invert-paths "${ARGS[@]}" --force

# Re-añadir el remote (filter-repo lo suelta a propósito) y refrescar los
# refs: --force-with-lease necesita conocer el estado real del remoto.
git remote add origin "$REPO_URL"
git fetch origin

echo "▶ Verificación ANTES del push (objetivo: 0):"
git rev-list --all --objects | grep -icE "acta-e14-real|actas-reales/assets|actas-demo|capturas-actas-reales" || echo "0 (limpio)"
if [ "$PURGA_MANIFEST_ORIGINAL" = "1" ]; then
  echo "▶ Manifest original (G2) — objetivo: 0:"
  git rev-list --all --objects | grep -ic "actas-reales-manifest.original" || echo "0 (limpio)"
fi
echo "▶ Supervivientes esperados en el HEAD reescrito:"
git ls-files | grep -E "actas-reales-manifest.json|actas-reales.ts" || echo "AVISO: revisa que el manifest vigente y actas-reales.ts sigan en el HEAD"
echo "▶ gitleaks sobre la historia completa (objetivo: 0 hallazgos):"
gitleaks git --log-opts="--all" || true

echo ""
echo "REVISIÓN LISTA en $DIR. SHA previo de main: $SHA_PREVIO"
echo "Para aplicarla (nunca --force a secas — regla del AGENTS.md):"
echo "  cd $DIR && git push origin --force-with-lease --all && git push origin --force-with-lease --tags"
echo "Después: contactar GitHub Support para purgar vistas cacheadas de los blobs"
echo "(SHA directo), re-corre CI y registra SHA previo/nuevo en docs/adr/README.md."
