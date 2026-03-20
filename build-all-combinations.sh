#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

OLLAMA_DIR="${TLINK_OLLAMA_DIR:-extras-ollama}"
MAC_ARTIFACTS="${TLINK_MAC_ARTIFACTS:-dmg}"
WINDOWS_ARTIFACTS="${TLINK_WINDOWS_ARTIFACTS:-nsis}"

build_macos() {
    local arch="$1"
    local bundle_ollama="$2"
    local label="without Ollama"
    if [[ "$bundle_ollama" == "1" ]]; then
        label="with Ollama"
        if [[ ! -d "$OLLAMA_DIR" ]]; then
            echo "Missing Ollama bundle directory: $OLLAMA_DIR"
            echo "Set TLINK_OLLAMA_DIR to a valid path, or create extras-ollama."
            exit 1
        fi
    fi

    echo "==> macOS ${arch} (${label})"
    ARCH="$arch" \
    TLINK_MAC_ARTIFACTS="$MAC_ARTIFACTS" \
    TLINK_BUNDLE_OLLAMA="$bundle_ollama" \
    TLINK_OLLAMA_DIR="$OLLAMA_DIR" \
    node scripts/build-macos.mjs
}

build_windows() {
    local arch="$1"
    local bundle_ollama="$2"
    local label="without Ollama"
    if [[ "$bundle_ollama" == "1" ]]; then
        label="with Ollama"
        if [[ ! -d "$OLLAMA_DIR" ]]; then
            echo "Missing Ollama bundle directory: $OLLAMA_DIR"
            echo "Set TLINK_OLLAMA_DIR to a valid path, or create extras-ollama."
            exit 1
        fi
    fi

    echo "==> Windows ${arch} (${label})"
    ARCH="$arch" \
    TLINK_WINDOWS_ARTIFACTS="$WINDOWS_ARTIFACTS" \
    TLINK_BUNDLE_OLLAMA="$bundle_ollama" \
    TLINK_OLLAMA_DIR="$OLLAMA_DIR" \
    node scripts/build-windows.mjs
}

# macOS combinations
##build_macos x86_64 0 #without ollama
##build_macos x86_64 1 #ollama
##build_macos arm64 0 #without ollama
build_macos arm64 1 #ollama

# Windows combinations
##build_windows x64 0 #without ollama
##build_windows x64 1 #ollama
##build_windows arm64 0 #without ollama
##build_windows arm64 1 #ollama

echo "Done: completed enabled macOS/Windows combinations in build-all-combinations.sh."
