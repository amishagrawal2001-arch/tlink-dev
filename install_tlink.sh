#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() { printf "[tlink] %s\n" "$*"; }

SKIP_SYSTEM_DEPS="${TLINK_SKIP_SYSTEM_DEPS:-0}"
SKIP_INSTALL="${TLINK_SKIP_INSTALL:-0}"
SKIP_BUILD="${TLINK_SKIP_BUILD:-0}"
SKIP_START="${TLINK_SKIP_START:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system-deps) SKIP_SYSTEM_DEPS=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-start) SKIP_START=1 ;;
    --install-only) SKIP_BUILD=1; SKIP_START=1 ;;
    --build-only) SKIP_INSTALL=1; SKIP_START=1 ;;
    --help|-h)
      cat <<'EOF'
Usage: ./start_tlink.sh [options]

Options:
  --skip-system-deps  Skip OS-level dependencies
  --skip-install      Skip yarn install
  --skip-build        Skip yarn build
  --skip-start        Skip yarn start
  --install-only      Only install dependencies
  --build-only        Only run build
EOF
      exit 0
      ;;
    *)
      log "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  Darwin) OS="macos" ;;
  Linux) OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  *) OS="unknown" ;;
esac

log "Detected OS: $OS_NAME ($OS)"

if ! command -v node >/dev/null 2>&1; then
  log "Node.js is required (>=15). Please install Node.js and re-run."
  exit 1
fi

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "$NODE_MAJOR" -lt 15 ]]; then
  log "Node.js >= 15 is required. Current: $(node -v)"
  exit 1
fi

if ! command -v yarn >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    log "Yarn not found. Enabling Yarn Classic via corepack..."
    corepack prepare yarn@1.22.22 --activate
  else
    log "Yarn Classic (1.x) is required. Install with: npm i -g yarn@1.22.22"
    exit 1
  fi
fi

if [[ "$OS" == "linux" && "$SKIP_SYSTEM_DEPS" -ne 1 ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    log "Installing Linux system dependencies (requires sudo)..."
    sudo apt-get update
    sudo apt-get install -y \
      libfontconfig-dev libsecret-1-dev libarchive-tools libnss3 \
      libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 \
      libgbm1 cmake
  else
    log "System deps install skipped (apt-get not found)."
  fi
fi

if [[ "$OS" == "windows" ]]; then
  log "Windows detected. This script expects Git Bash or WSL."
fi

if [[ "$SKIP_INSTALL" -ne 1 ]]; then
  log "Installing dependencies with yarn..."
  yarn install
fi

if [[ "$SKIP_BUILD" -ne 1 ]]; then
  log "Building project..."
  yarn run build
fi

if [[ "$SKIP_START" -ne 1 ]]; then
  log "Starting app..."
  yarn start
else
  log "Start skipped."
fi
