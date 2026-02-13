# How Tlink Bundles Ollama and How to Update It

This guide explains how Tlink bundles Ollama and how to update the bundled version.

---

## Overview

Tlink can bundle Ollama directly into the application, making it available without requiring users to install Ollama separately. The bundled Ollama is stored in `extras-ollama/` and gets copied into the app bundle during the build process.

---

## How Tlink Bundles Ollama

### 1. Directory Structure

```
extras-ollama/
  ├── mac/
  │   └── ollama          # macOS binary
  ├── windows/
  │   └── ollama.exe      # Windows binary
  └── README.txt          # Instructions
```

### 2. Build Process

When building Tlink with `TLINK_BUNDLE_OLLAMA=1`:

1. **Build Script** (`build.sh`) checks for Ollama binaries
2. **Auto-Download**: If missing, automatically downloads from GitHub releases
3. **Bundling**: `scripts/bundle-ollama.mjs` copies `extras-ollama/` to app bundle
4. **Runtime**: `app/lib/ollama.ts` finds and starts the bundled Ollama

### 3. Build Scripts

- **`build.sh`**: Main build script with `ensure_ollama_binary()` function
- **`scripts/bundle-ollama.mjs`**: Handles bundling logic
- **`scripts/build-macos.mjs`**: macOS-specific build with Ollama bundling
- **`scripts/build-windows.mjs`**: Windows-specific build with Ollama bundling

---

## Automatic Download (Default Behavior)

By default, `build.sh` automatically downloads the **latest** Ollama release if binaries are missing:

### Default URLs

```bash
# macOS
TLINK_OLLAMA_URL_MAC="https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz"

# Windows (AMD64)
TLINK_OLLAMA_URL_WIN_AMD64="https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip"

# Windows (ARM64)
TLINK_OLLAMA_URL_WIN_ARM64="https://github.com/ollama/ollama/releases/latest/download/ollama-windows-arm64.zip"
```

### How It Works

1. **Check**: `build.sh` checks if `extras-ollama/mac/ollama` exists and is valid (>1MB)
2. **Download**: If missing or invalid, downloads from GitHub releases
3. **Extract**: Extracts the binary from the archive
4. **Place**: Places it in the correct location

---

## Method 1: Update to Latest Version (Automatic)

The easiest way to update to the latest Ollama version:

### Step 1: Remove Old Binary

```bash
cd /Users/surajsharma/Tlink
rm extras-ollama/mac/ollama
```

### Step 2: Rebuild with Auto-Download

```bash
# This will automatically download the latest version
./build.sh
```

Or build just the macOS bundle:

```bash
# Build macOS with Ollama bundle (auto-downloads if missing)
TLINK_BUNDLE_OLLAMA=1 node scripts/build-macos.mjs
```

The `ensure_ollama_binary()` function in `build.sh` will detect the missing binary and download the latest version.

---

## Method 2: Update to Specific Version

To bundle a specific Ollama version (not just "latest"):

### Step 1: Find the Version URL

Visit: https://github.com/ollama/ollama/releases

Find the specific version you want (e.g., `v0.14.0`), then construct the URL:

```bash
# Example: v0.14.0 for macOS
TLINK_OLLAMA_URL_MAC="https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-darwin.tgz"

# Example: v0.14.0 for Windows AMD64
TLINK_OLLAMA_URL_WIN_AMD64="https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-windows-amd64.zip"
```

### Step 2: Remove Old Binary

```bash
rm extras-ollama/mac/ollama
```

### Step 3: Build with Specific URL

```bash
# Set the URL for the specific version
export TLINK_OLLAMA_URL_MAC="https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-darwin.tgz"

# Build (will download from the specified URL)
./build.sh
```

Or directly:

```bash
TLINK_OLLAMA_URL_MAC="https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-darwin.tgz" \
TLINK_BUNDLE_OLLAMA=1 \
node scripts/build-macos.mjs
```

---

## Method 3: Manual Download and Place

If you want full control over the download process:

### Step 1: Download Manually

```bash
# Visit GitHub releases and download manually, or use curl:
cd /tmp
curl -L -o ollama-darwin.tgz \
  "https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-darwin.tgz"
```

### Step 2: Extract

```bash
# Extract the archive
tar -xzf ollama-darwin.tgz

# Find the binary (might be in a subdirectory)
find . -name ollama -type f
```

### Step 3: Place in Tlink Directory

```bash
cd /Users/surajsharma/Tlink
mkdir -p extras-ollama/mac

# Copy the binary
cp /tmp/path/to/ollama extras-ollama/mac/ollama

# Make it executable
chmod +x extras-ollama/mac/ollama
```

### Step 4: Verify

```bash
# Check file size (should be >1MB)
ls -lh extras-ollama/mac/ollama

# Test it works
extras-ollama/mac/ollama --version
```

### Step 5: Build

```bash
# Disable auto-download to use your manually placed binary
TLINK_OLLAMA_AUTO_DOWNLOAD=0 \
TLINK_BUNDLE_OLLAMA=1 \
node scripts/build-macos.mjs
```

---

## Environment Variables

Tlink's build system supports these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TLINK_BUNDLE_OLLAMA` | `0` | Set to `1` to enable Ollama bundling |
| `TLINK_OLLAMA_DIR` | `./extras-ollama` | Directory containing Ollama binaries |
| `TLINK_OLLAMA_AUTO_DOWNLOAD` | `1` | Auto-download if binary missing |
| `TLINK_OLLAMA_URL_MAC` | `latest/download/ollama-darwin.tgz` | macOS download URL |
| `TLINK_OLLAMA_URL_WIN_AMD64` | `latest/download/ollama-windows-amd64.zip` | Windows AMD64 URL |
| `TLINK_OLLAMA_URL_WIN_ARM64` | `latest/download/ollama-windows-arm64.zip` | Windows ARM64 URL |

---

## Complete Update Workflow

Here's a complete example workflow to update Ollama to a specific version:

```bash
# 1. Navigate to Tlink directory
cd /Users/surajsharma/Tlink

# 2. Check current version (if Ollama is running)
curl http://localhost:11434/api/version

# 3. Remove old binary
rm extras-ollama/mac/ollama

# 4. Set the URL for the version you want (e.g., v0.14.0)
export TLINK_OLLAMA_URL_MAC="https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-darwin.tgz"

# 5. Build with auto-download enabled
TLINK_BUNDLE_OLLAMA=1 node scripts/build-macos.mjs

# 6. Verify the new binary
extras-ollama/mac/ollama --version

# 7. Test it works
./extras-ollama/mac/ollama serve &
sleep 2
curl http://localhost:11434/api/version
pkill ollama
```

---

## Checking Current Bundled Version

To check what version is currently bundled:

```bash
# Check the binary directly
extras-ollama/mac/ollama --version

# Or start it and check via API
./extras-ollama/mac/ollama serve &
sleep 2
curl http://localhost:11434/api/version
pkill ollama
```

**Your Current Version:** 0.13.5

---

## Finding Available Versions

To see all available Ollama versions:

1. **GitHub Releases**: https://github.com/ollama/ollama/releases
2. **API Check** (if you have access):
   ```bash
   curl https://api.github.com/repos/ollama/ollama/releases | grep tag_name
   ```

---

## Important Notes

### 1. Binary Validation

The build script validates binaries by checking file size (>1MB). If a binary is too small, it's considered invalid and will be re-downloaded.

### 2. Development vs Production

- **Development**: Tlink looks for Ollama in `extras-ollama/` relative to the app path
- **Production**: Bundled Ollama is in `Resources/ollama/` inside the app bundle

### 3. Model Persistence

Ollama models are stored separately in:
- **macOS**: `~/Library/Application Support/Tlink/ollama/`
- Models persist across Ollama updates

### 4. Runtime Behavior

When Tlink starts:
- `app/lib/ollama.ts` checks for bundled Ollama
- If found, starts it automatically
- Uses `OLLAMA_HOST=127.0.0.1:11434` by default
- Models are stored in user data directory

---

## Troubleshooting

### Issue: Binary Not Found After Update

**Solution:**
```bash
# Check if binary exists
ls -lh extras-ollama/mac/ollama

# Check if it's executable
chmod +x extras-ollama/mac/ollama

# Verify file size (>1MB)
du -h extras-ollama/mac/ollama
```

### Issue: Auto-Download Fails

**Solution:**
```bash
# Check network connectivity
curl -I https://github.com/ollama/ollama/releases/latest

# Try manual download
curl -L -o /tmp/ollama.tgz \
  "https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz"
```

### Issue: Wrong Architecture

**Solution:**
- Ensure you're downloading the correct binary for your architecture
- macOS: `ollama-darwin.tgz` (universal binary)
- Windows AMD64: `ollama-windows-amd64.zip`
- Windows ARM64: `ollama-windows-arm64.zip`

### Issue: Build Fails with "Ollama binary is too small"

**Solution:**
```bash
# Remove the invalid binary
rm extras-ollama/mac/ollama

# Re-download
TLINK_BUNDLE_OLLAMA=1 node scripts/build-macos.mjs
```

---

## Quick Reference Commands

```bash
# Update to latest (automatic)
rm extras-ollama/mac/ollama && ./build.sh

# Update to specific version
export TLINK_OLLAMA_URL_MAC="https://github.com/ollama/ollama/releases/download/v0.14.0/ollama-darwin.tgz"
rm extras-ollama/mac/ollama
TLINK_BUNDLE_OLLAMA=1 node scripts/build-macos.mjs

# Check current version
extras-ollama/mac/ollama --version

# Disable auto-download (use existing binary)
TLINK_OLLAMA_AUTO_DOWNLOAD=0 TLINK_BUNDLE_OLLAMA=1 node scripts/build-macos.mjs
```

---

## Summary

**To update Tlink's bundled Ollama:**

1. **Automatic (Latest)**: Remove old binary → Run build → Auto-downloads latest
2. **Specific Version**: Set `TLINK_OLLAMA_URL_MAC` → Remove old binary → Run build
3. **Manual**: Download → Extract → Place in `extras-ollama/mac/` → Build

**Current Setup:**
- Version: 0.13.5
- Location: `extras-ollama/mac/ollama`
- Status: Working ✅

---

## Related Files

- `build.sh` - Main build script with `ensure_ollama_binary()`
- `scripts/bundle-ollama.mjs` - Bundling logic
- `scripts/build-macos.mjs` - macOS build with Ollama
- `scripts/build-windows.mjs` - Windows build with Ollama
- `app/lib/ollama.ts` - Runtime Ollama management
- `extras-ollama/README.txt` - Original instructions
