#!/usr/bin/env bash
#
# rebuild-native.sh
#
# Rebuilds native Node modules (node-pty, keytar, fontmanager-redux) for the
# current platform architecture against the installed Electron version.
#
# This restores the local dev environment after an installer build
# (build-mac-dmg.sh, build-windows-installer.sh, build-linux-packages.sh)
# recompiles native modules for a different target architecture.
#
# Usage:
#   ./scripts/rebuild-native.sh              # auto-detect arch
#   ARCH=arm64 ./scripts/rebuild-native.sh   # force a specific arch
#
# Safe to run at any time (idempotent).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Detect platform and architecture
# ---------------------------------------------------------------------------
PLATFORM="$(uname -s)"
case "$PLATFORM" in
    Darwin)  PLATFORM_NAME="macOS" ;;
    Linux)   PLATFORM_NAME="Linux" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM_NAME="Windows" ;;
    *)       PLATFORM_NAME="$PLATFORM" ;;
esac

if [[ -n "${ARCH:-}" ]]; then
    HOST_ARCH="$ARCH"
else
    RAW_ARCH="$(uname -m)"
    case "$RAW_ARCH" in
        arm64|aarch64)  HOST_ARCH="arm64" ;;
        x86_64|amd64)   HOST_ARCH="x64" ;;
        *)              HOST_ARCH="$RAW_ARCH" ;;
    esac
fi

echo "==> rebuild-native: platform=$PLATFORM_NAME  arch=$HOST_ARCH"

# ---------------------------------------------------------------------------
# Resolve Electron version
# ---------------------------------------------------------------------------
ELECTRON_PKG="$ROOT_DIR/node_modules/electron/package.json"
if [[ ! -f "$ELECTRON_PKG" ]]; then
    ELECTRON_PKG="$ROOT_DIR/app/node_modules/electron/package.json"
fi

if [[ ! -f "$ELECTRON_PKG" ]]; then
    echo "ERROR: Cannot find electron package.json. Run 'yarn install' first." >&2
    exit 1
fi

ELECTRON_VERSION="$(node -e "console.log(require('$ELECTRON_PKG').version)")"
echo "==> rebuild-native: Electron version=$ELECTRON_VERSION"

# ---------------------------------------------------------------------------
# Native modules to rebuild (module-name : relative path to binding.gyp dir)
# We scan known directories for these modules
# ---------------------------------------------------------------------------
NATIVE_MODULES=("node-pty" "keytar" "fontmanager-redux")
SEARCH_DIRS=("app" "tlink-core" "tlink-local" "tlink-ssh" "tlink-terminal")

# Use node-gyp from the project
NODE_GYP="$(command -v node-gyp 2>/dev/null || echo "")"
if [[ -z "$NODE_GYP" ]]; then
    NODE_GYP="$ROOT_DIR/app/node_modules/.bin/node-gyp"
fi
if [[ ! -x "$NODE_GYP" ]]; then
    # Fall back to npx
    NODE_GYP="npx --yes node-gyp"
fi

# ---------------------------------------------------------------------------
# Rebuild each native module found
# ---------------------------------------------------------------------------
rebuild_module() {
    local mod_path="$1"
    local mod_name="$2"
    local dir_name="$3"

    if [[ ! -f "$mod_path/binding.gyp" ]]; then
        echo "   Skipping $dir_name/$mod_name (no binding.gyp)"
        return 0
    fi

    echo "   Rebuilding $dir_name/$mod_name ..."
    (
        cd "$mod_path"
        $NODE_GYP rebuild \
            --arch="$HOST_ARCH" \
            --runtime=electron \
            --target="$ELECTRON_VERSION" \
            --dist-url=https://electronjs.org/headers \
            2>&1 | tail -3
    )
}

echo ""
echo "==> rebuild-native: Rebuilding native modules for $HOST_ARCH ..."

REBUILT=0
for dir in "${SEARCH_DIRS[@]}"; do
    for mod in "${NATIVE_MODULES[@]}"; do
        mod_path="$ROOT_DIR/$dir/node_modules/$mod"
        if [[ -d "$mod_path" ]]; then
            rebuild_module "$mod_path" "$mod" "$dir"
            REBUILT=$((REBUILT + 1))
        fi
    done
done

if [[ "$REBUILT" -eq 0 ]]; then
    echo "   No native modules found to rebuild."
    exit 0
fi

# ---------------------------------------------------------------------------
# Verify architecture of rebuilt .node files
# ---------------------------------------------------------------------------
echo ""
echo "==> rebuild-native: Verifying rebuilt modules ..."

VERIFY_FAILED=0

for dir in "${SEARCH_DIRS[@]}"; do
    for mod in "${NATIVE_MODULES[@]}"; do
        mod_path="$ROOT_DIR/$dir/node_modules/$mod"
        if [[ -d "$mod_path" ]]; then
            while IFS= read -r -d '' node_file; do
                case "$PLATFORM" in
                    Darwin)
                        file_arch="$(file "$node_file" | grep -oE 'arm64|x86_64' | head -1)"
                        expected_arch="$HOST_ARCH"
                        if [[ "$HOST_ARCH" == "x64" ]]; then
                            expected_arch="x86_64"
                        fi
                        if [[ "$file_arch" == "$expected_arch" ]]; then
                            echo "   OK   $dir/$mod ($file_arch)"
                        else
                            echo "   FAIL $dir/$mod (got ${file_arch:-unknown}, expected $expected_arch)"
                            VERIFY_FAILED=1
                        fi
                        ;;
                    Linux)
                        file_arch="$(file "$node_file" | grep -oE 'x86-64|aarch64|ARM' | head -1)"
                        expected_label=""
                        case "$HOST_ARCH" in
                            x64)    expected_label="x86-64" ;;
                            arm64)  expected_label="aarch64" ;;
                            *)      expected_label="$HOST_ARCH" ;;
                        esac
                        if [[ "$file_arch" == "$expected_label" ]]; then
                            echo "   OK   $dir/$mod ($file_arch)"
                        else
                            echo "   FAIL $dir/$mod (got ${file_arch:-unknown}, expected $expected_label)"
                            VERIFY_FAILED=1
                        fi
                        ;;
                    *)
                        echo "   OK   $dir/$mod (exists, arch check skipped)"
                        ;;
                esac
            done < <(find "$mod_path/build/Release" -name '*.node' -print0 2>/dev/null)
        fi
    done
done

if [[ "$VERIFY_FAILED" -eq 1 ]]; then
    echo ""
    echo "WARNING: Some native modules may not match the expected architecture."
    echo "         Try: ARCH=$HOST_ARCH ./scripts/rebuild-native.sh"
    exit 1
fi

echo ""
echo "==> rebuild-native: Done. $REBUILT module(s) rebuilt for $PLATFORM_NAME/$HOST_ARCH."
