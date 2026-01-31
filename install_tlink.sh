#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() { printf "[tlink] %s\n" "$*"; }

SKIP_SYSTEM_DEPS="${TLINK_SKIP_SYSTEM_DEPS:-0}"
SKIP_INSTALL="${TLINK_SKIP_INSTALL:-0}"
SKIP_BUILD="${TLINK_SKIP_BUILD:-0}"
SKIP_START="${TLINK_SKIP_START:-0}"
REBUILD_NATIVE="${TLINK_REBUILD_NATIVE:-0}"
CLEAN_USER_PLUGINS="${TLINK_CLEAN_USER_PLUGINS:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system-deps) SKIP_SYSTEM_DEPS=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-start) SKIP_START=1 ;;
    --rebuild-native) REBUILD_NATIVE=1 ;;
    --clean-user-plugins) CLEAN_USER_PLUGINS=1 ;;
    --install-only) SKIP_BUILD=1; SKIP_START=1 ;;
    --build-only) SKIP_INSTALL=1; SKIP_START=1 ;;
    --help|-h)
      cat <<'EOF'
Usage: ./install_tlink.sh [options]

Options:
  --skip-system-deps  Skip OS-level dependencies
  --skip-install      Skip yarn install
  --skip-build        Skip yarn build
  --skip-start        Skip yarn start
  --rebuild-native    Rebuild native modules (keytar, node-pty, etc.)
  --clean-user-plugins  Move user plugin cache out of the way
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

resolve_user_plugins_dir() {
  case "$OS" in
    macos)
      echo "$HOME/Library/Application Support/Tlink/plugins"
      ;;
    linux)
      echo "${XDG_CONFIG_HOME:-$HOME/.config}/tlink/plugins"
      ;;
    windows)
      if command -v cygpath >/dev/null 2>&1 && [[ -n "${APPDATA:-}" ]]; then
        echo "$(cygpath -u "$APPDATA")/tlink/plugins"
      else
        echo "$HOME/AppData/Roaming/tlink/plugins"
      fi
      ;;
    *)
      echo ""
      ;;
  esac
}

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

if [[ "$CLEAN_USER_PLUGINS" -eq 1 ]]; then
  USER_PLUGINS_DIR="$(resolve_user_plugins_dir)"
  if [[ -n "$USER_PLUGINS_DIR" && -d "$USER_PLUGINS_DIR" ]]; then
    BACKUP_DIR="${USER_PLUGINS_DIR}.bak-$(date +%Y%m%d%H%M%S)"
    log "Moving user plugins cache to: $BACKUP_DIR"
    mv "$USER_PLUGINS_DIR" "$BACKUP_DIR"
  else
    log "No user plugins cache found to move."
  fi
fi

if [[ "$SKIP_INSTALL" -ne 1 ]]; then
  log "Installing dependencies with yarn..."
  yarn install
fi

if [[ "$SKIP_BUILD" -ne 1 ]]; then
  log "Building project..."
  yarn run build
fi

if [[ "$REBUILD_NATIVE" -eq 1 ]]; then
  log "Rebuilding native modules..."
  node scripts/build-native.mjs
fi

if [[ "$SKIP_START" -ne 1 ]]; then
  log "Starting app..."
  yarn start
else
  log "Start skipped."
fi
