#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

OLLAMA_DIR="${TLINK_OLLAMA_DIR:-$ROOT_DIR/extras-ollama}"
OLLAMA_AUTO_DOWNLOAD="${TLINK_OLLAMA_AUTO_DOWNLOAD:-1}"
OLLAMA_URL_MAC="${TLINK_OLLAMA_URL_MAC:-https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz}"
OLLAMA_URL_WIN_AMD64="${TLINK_OLLAMA_URL_WIN_AMD64:-https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip}"
OLLAMA_URL_WIN_ARM64="${TLINK_OLLAMA_URL_WIN_ARM64:-https://github.com/ollama/ollama/releases/latest/download/ollama-windows-arm64.zip}"

detect_arch() {
    local arch
    arch="$(node -p "process.env.ARCH || process.arch")"
    case "$arch" in
        arm64|aarch64) echo "arm64" ;;
        x64|x86_64) echo "x64" ;;
        *) echo "$arch" ;;
    esac
}

is_valid_binary() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        return 1
    fi
    local size
    size="$(wc -c < "$file" | tr -d ' ')"
    if [[ "$size" -gt 1000000 ]]; then
        return 0
    fi
    return 1
}

download_file() {
    local url="$1"
    local dest="$2"
    curl -fL --retry 3 --retry-delay 1 -o "$dest" "$url"
}

extract_mac_archive() {
    local source="$1"
    local archive="$2"
    local dest="$3"
    local tmpdir="$4"

    case "$source" in
        *.tgz|*.tar.gz)
            tar -xzf "$archive" -C "$tmpdir"
            ;;
        *.zip)
            unzip -q "$archive" -d "$tmpdir"
            ;;
        *)
            cp "$archive" "$dest"
            chmod +x "$dest"
            return 0
            ;;
    esac

    local candidate=""
    if [[ -f "$tmpdir/ollama" ]]; then
        candidate="$tmpdir/ollama"
    else
        candidate="$(find "$tmpdir" -type f \( -name 'ollama' -o -name 'Ollama' \) | head -n 1)"
    fi

    if [[ -z "$candidate" ]]; then
        echo "ERROR: Unable to locate Ollama binary in macOS archive" >&2
        return 1
    fi

    cp "$candidate" "$dest"
    chmod +x "$dest"
    return 0
}

extract_windows_archive() {
    local source="$1"
    local archive="$2"
    local dest="$3"
    local tmpdir="$4"

    case "$source" in
        *.zip)
            unzip -q "$archive" -d "$tmpdir"
            ;;
        *)
            cp "$archive" "$dest"
            return 0
            ;;
    esac

    local candidate=""
    if [[ -f "$tmpdir/ollama.exe" ]]; then
        candidate="$tmpdir/ollama.exe"
    else
        candidate="$(find "$tmpdir" -type f \( -name 'ollama.exe' -o -name 'Ollama.exe' \) | head -n 1)"
    fi

    if [[ -z "$candidate" ]]; then
        echo "ERROR: Unable to locate Ollama binary in Windows archive" >&2
        return 1
    fi

    cp "$candidate" "$dest"
    return 0
}

ensure_ollama_binary() {
    local platform="$1"
    local arch
    arch="$(detect_arch)"

    if [[ "$platform" == "mac" ]]; then
        local mac_bin="$OLLAMA_DIR/mac/ollama"
        if is_valid_binary "$mac_bin"; then
            return 0
        fi
        if [[ -f "$mac_bin" ]]; then
            echo "Existing Ollama macOS binary is too small; re-downloading."
            rm -f "$mac_bin"
        fi
        if [[ "$OLLAMA_AUTO_DOWNLOAD" != "1" ]]; then
            return 1
        fi
        if ! command -v curl >/dev/null 2>&1; then
            echo "ERROR: curl not available to download Ollama" >&2
            return 1
        fi
        mkdir -p "$OLLAMA_DIR/mac"
        echo "Downloading Ollama macOS binary..."
        local tmpdir
        tmpdir="$(mktemp -d)"
        trap 'rm -rf "$tmpdir"' RETURN
        local archive="$tmpdir/ollama-download"
        download_file "$OLLAMA_URL_MAC" "$archive"
        extract_mac_archive "$OLLAMA_URL_MAC" "$archive" "$mac_bin" "$tmpdir"
        rm -rf "$tmpdir"
        trap - RETURN
        return 0
    fi

    if [[ "$platform" == "windows" ]]; then
        local win_bin="$OLLAMA_DIR/windows/ollama.exe"
        if is_valid_binary "$win_bin"; then
            return 0
        fi
        if [[ -f "$win_bin" ]]; then
            echo "Existing Ollama Windows binary is too small; re-downloading."
            rm -f "$win_bin"
        fi
        if [[ "$OLLAMA_AUTO_DOWNLOAD" != "1" ]]; then
            return 1
        fi
        if ! command -v curl >/dev/null 2>&1; then
            echo "ERROR: curl not available to download Ollama" >&2
            return 1
        fi
        mkdir -p "$OLLAMA_DIR/windows"
        local url="$OLLAMA_URL_WIN_AMD64"
        if [[ "$arch" == "arm64" ]]; then
            url="$OLLAMA_URL_WIN_ARM64"
        fi
        echo "Downloading Ollama Windows binary ($arch)..."
        local tmpdir
        tmpdir="$(mktemp -d)"
        trap 'rm -rf "$tmpdir"' RETURN
        local archive="$tmpdir/ollama-download"
        download_file "$url" "$archive"
        extract_windows_archive "$url" "$archive" "$win_bin" "$tmpdir"
        rm -rf "$tmpdir"
        trap - RETURN
        return 0
    fi

    return 1
}

build_mac() {
    local bundle="$1"
    rm -rf "$ROOT_DIR/dist/mac"* "$ROOT_DIR/dist/mac-"* 2>/dev/null || true
    if [[ "$bundle" == "1" ]]; then
        if ensure_ollama_binary "mac"; then
            echo "==> macOS build (with Ollama bundle)"
            TLINK_BUNDLE_OLLAMA=1 node scripts/build-macos.mjs
        else
            echo "==> macOS build (with Ollama bundle) skipped - missing Ollama binary"
        fi
    else
        echo "==> macOS build (no Ollama bundle)"
        TLINK_BUNDLE_OLLAMA=0 node scripts/build-macos.mjs
    fi
}

build_windows() {
    local bundle="$1"
    rm -rf "$ROOT_DIR/dist/win"* "$ROOT_DIR/dist/win-"* 2>/dev/null || true
    if [[ "$bundle" == "1" ]]; then
        if ensure_ollama_binary "windows"; then
            echo "==> Windows build (with Ollama bundle)"
            TLINK_BUNDLE_OLLAMA=1 node scripts/build-windows.mjs
        else
            echo "==> Windows build (with Ollama bundle) skipped - missing Ollama binary"
        fi
    else
        echo "==> Windows build (no Ollama bundle)"
        TLINK_BUNDLE_OLLAMA=0 node scripts/build-windows.mjs
    fi
}

echo "==> Building app bundles"
npm run build

echo "==> Preparing builtin plugins"
node scripts/prepackage-plugins.mjs

build_mac 0
build_mac 1
build_windows 0
build_windows 1

echo "Done."
