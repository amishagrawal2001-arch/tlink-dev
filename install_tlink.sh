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
UPGRADE_NODE="${TLINK_UPGRADE_NODE:-1}"
MIN_NODE_VERSION="${TLINK_NODE_MIN_VERSION:-22.12.0}"
INSTALL_OLLAMA="${TLINK_INSTALL_OLLAMA:-1}"
ONLY_INSTALL_OLLAMA=0
SKIP_NODE_CHECK=0
SKIP_YARN_CHECK=0

if [[ $# -gt 0 ]]; then
  ONLY_INSTALL_OLLAMA=1
  for arg in "$@"; do
    case "$arg" in
      --install-ollama) ;;
      --help|-h) ;;
      *) ONLY_INSTALL_OLLAMA=0 ;;
    esac
  done
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system-deps) SKIP_SYSTEM_DEPS=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-start) SKIP_START=1 ;;
    --rebuild-native) REBUILD_NATIVE=1 ;;
    --clean-user-plugins) CLEAN_USER_PLUGINS=1 ;;
    --upgrade-node) UPGRADE_NODE=1 ;;
    --no-upgrade-node) UPGRADE_NODE=0 ;;
    --install-ollama) INSTALL_OLLAMA=1 ;;
    --no-install-ollama) INSTALL_OLLAMA=0 ;;
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
  --upgrade-node      Attempt to upgrade Node if below minimum
  --no-upgrade-node   Do not attempt to upgrade Node
  --install-ollama    Attempt to install Ollama (optional; if used alone, only installs Ollama)
  --no-install-ollama Skip Ollama installation
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

if [[ "$ONLY_INSTALL_OLLAMA" -eq 1 ]]; then
  SKIP_SYSTEM_DEPS=1
  SKIP_INSTALL=1
  SKIP_BUILD=1
  SKIP_START=1
  UPGRADE_NODE=0
  SKIP_NODE_CHECK=1
  SKIP_YARN_CHECK=1
fi

version_ge() {
  # returns 0 if $1 >= $2
  [[ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" == "$2" ]]
}

try_upgrade_node() {
  local target="$1"

  if command -v fnm >/dev/null 2>&1; then
    log "Upgrading Node via fnm..."
    fnm install "$target"
    eval "$(fnm env --use-on-cd)"
    fnm use "$target"
    return 0
  fi

  if [[ -z "${NVM_DIR:-}" ]]; then
    export NVM_DIR="$HOME/.nvm"
  fi
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi
  if command -v nvm >/dev/null 2>&1; then
    log "Upgrading Node via nvm..."
    nvm install "$target"
    nvm use "$target"
    return 0
  fi

  if command -v volta >/dev/null 2>&1; then
    log "Upgrading Node via volta..."
    volta install "node@$target"
    return 0
  fi

  if command -v asdf >/dev/null 2>&1; then
    log "Upgrading Node via asdf..."
    if ! asdf plugin list | grep -q nodejs; then
      log "asdf nodejs plugin missing. Install with: asdf plugin add nodejs"
      return 1
    fi
    asdf install nodejs "$target"
    asdf global nodejs "$target"
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    log "Homebrew detected. Please run:"
    log "  brew install node@22 && brew link --force --overwrite node@22"
    return 1
  fi

  return 1
}

install_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    log "Ollama already installed."
    return 0
  fi

  case "$OS" in
    macos)
      if command -v brew >/dev/null 2>&1; then
        log "Installing Ollama via Homebrew..."
        brew install ollama
        return $?
      fi
      if ! command -v curl >/dev/null 2>&1; then
        log "curl not found. Install Ollama manually from https://ollama.com/download."
        return 1
      fi
      if ! command -v hdiutil >/dev/null 2>&1; then
        log "hdiutil not found. Install Ollama manually from https://ollama.com/download."
        return 1
      fi
      log "Installing Ollama via DMG (no Homebrew)..."
      local tmp_dir dmg mount_point
      tmp_dir="$(mktemp -d)"
      dmg="$tmp_dir/Ollama.dmg"
      mount_point="$tmp_dir/OllamaMount"
      mkdir -p "$mount_point"

      cleanup_ollama_dmg() {
        hdiutil detach "$mount_point" >/dev/null 2>&1 || true
        rm -rf "$tmp_dir" || true
      }
      trap cleanup_ollama_dmg EXIT

      curl -fsSL "https://ollama.com/download/Ollama.dmg" -o "$dmg"
      hdiutil attach "$dmg" -nobrowse -mountpoint "$mount_point"

      if [[ -d "/Applications/Ollama.app" ]]; then
        log "Ollama.app already exists in /Applications. Skipping copy."
        return 0
      fi

      if cp -R "$mount_point/Ollama.app" /Applications/; then
        log "Ollama installed to /Applications."
        return 0
      fi
      if command -v sudo >/dev/null 2>&1; then
        log "Retrying copy with sudo..."
        sudo cp -R "$mount_point/Ollama.app" /Applications/
        log "Ollama installed to /Applications."
        return 0
      fi
      log "Failed to copy Ollama.app to /Applications. Please install manually."
      return 1
      ;;
    linux)
      if command -v curl >/dev/null 2>&1; then
        log "Installing Ollama via install script (requires sudo)..."
        curl -fsSL https://ollama.com/install.sh | sh
        return $?
      fi
      log "curl not found. Please install Ollama from https://ollama.com/download."
      return 1
      ;;
    windows)
      log "Windows detected. Please install Ollama from https://ollama.com/download."
      return 1
      ;;
    *)
      log "Unknown OS. Please install Ollama manually from https://ollama.com/download."
      return 1
      ;;
  esac
}

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

if [[ "$SKIP_NODE_CHECK" -ne 1 && ! command -v node >/dev/null 2>&1 ]]; then
  if [[ "$UPGRADE_NODE" -eq 1 ]]; then
    log "Node.js not found. Attempting install (>= $MIN_NODE_VERSION)..."
    if ! try_upgrade_node "$MIN_NODE_VERSION"; then
      log "Node.js >= $MIN_NODE_VERSION is required. Please install and re-run."
      exit 1
    fi
  else
    log "Node.js is required (>= $MIN_NODE_VERSION). Please install and re-run."
    exit 1
  fi
fi

if [[ "$SKIP_NODE_CHECK" -ne 1 ]]; then
  NODE_VERSION="$(node -v | sed -E 's/^v//')"
  if ! version_ge "$NODE_VERSION" "$MIN_NODE_VERSION"; then
    if [[ "$UPGRADE_NODE" -eq 1 ]]; then
      log "Node.js >= $MIN_NODE_VERSION is required. Current: v$NODE_VERSION"
      log "Attempting upgrade..."
      if try_upgrade_node "$MIN_NODE_VERSION"; then
        NODE_VERSION="$(node -v | sed -E 's/^v//')"
        if ! version_ge "$NODE_VERSION" "$MIN_NODE_VERSION"; then
          log "Upgrade completed but Node version is still v$NODE_VERSION"
          exit 1
        fi
      else
        log "Automatic upgrade failed. Please upgrade Node to >= $MIN_NODE_VERSION."
        exit 1
      fi
    else
      log "Node.js >= $MIN_NODE_VERSION is required. Current: v$NODE_VERSION"
      exit 1
    fi
  fi
fi

if [[ "$SKIP_YARN_CHECK" -ne 1 && ! command -v yarn >/dev/null 2>&1 ]]; then
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

if [[ "$INSTALL_OLLAMA" -eq 1 ]]; then
  install_ollama || true
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
