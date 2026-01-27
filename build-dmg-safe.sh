#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="${TLINK_REPO_URL:-git@github.com-amishagrawal:amishagrawal2001-arch/tlink-dev.git}"
WORK_PARENT="${TLINK_BUILD_WORKDIR:-/tmp}"
WORK_DIR="${WORK_PARENT%/}/tlink-dev-build"
LOG_FILE="${TLINK_BUILD_LOG:-${ROOT_DIR}/dist-safe/build.log}"

show_help() {
    cat <<'EOF'
Usage: ./build-dmg-safe.sh [--help]

Builds the macOS DMG in a clean clone to avoid corrupting your working repo.

Environment overrides:
  TLINK_REPO_URL=git@github.com-amishagrawal:amishagrawal2001-arch/tlink-dev.git
  TLINK_BUILD_WORKDIR=/tmp

Output:
  Artifacts are copied to ./dist-safe/

Examples:
  TLINK_REPO_URL=git@github.com:amishagrawal2001-arch/tlink-dev.git ./build-dmg-safe.sh
  TLINK_BUILD_WORKDIR=/private/tmp ./build-dmg-safe.sh
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

info() {
    echo "[build-dmg-safe] $*"
}

mkdir -p "$(dirname "${LOG_FILE}")"
exec > >(tee -a "${LOG_FILE}") 2>&1
info "Logging to ${LOG_FILE}"

info "Using repo: ${REPO_URL}"
info "Working dir: ${WORK_DIR}"

if [[ -d "${WORK_DIR}/.git" ]]; then
    info "Reusing existing clone"
    cd "${WORK_DIR}"
    git remote set-url origin "${REPO_URL}"
    git fetch --tags origin
    git checkout main
    git pull --ff-only origin main
elif [[ -e "${WORK_DIR}" ]]; then
    echo "[build-dmg-safe] ERROR: ${WORK_DIR} exists but is not a git repo" >&2
    exit 1
else
    info "Cloning..."
    git clone "${REPO_URL}" "${WORK_DIR}"
    cd "${WORK_DIR}"
fi

if ! git describe --tags >/dev/null 2>&1; then
    info "No git tags found; creating a local tag from package.json version"
    PACKAGE_VERSION="$(node -p "require('./package.json').version")"
    git tag "v${PACKAGE_VERSION}"
fi

info "Installing dependencies..."
if [[ -f package-lock.json ]]; then
    npm ci --legacy-peer-deps
else
    npm install --legacy-peer-deps
fi

info "Building DMG..."
chmod +x ./build.sh
TLINK_BUILD_TARGETS=mac TLINK_BUILD_MAC_DMG_ONLY=1 ./build.sh

info "Copying DMG artifacts back to ${ROOT_DIR}/dist-safe" 
mkdir -p "${ROOT_DIR}/dist-safe"

# Copy any DMG/ZIP artifacts produced
find "${WORK_DIR}/dist" -maxdepth 2 -type f \( -name "*.dmg" -o -name "*.zip" \) -print -exec cp -f {} "${ROOT_DIR}/dist-safe/" \;

info "Done. Artifacts in ${ROOT_DIR}/dist-safe"
