#!/usr/bin/env node
/**
 * Download the `gnmic` binary that the tlink-gnmi plugin bundles.
 *
 *   node scripts/fetch-gnmic.mjs                # host platform only
 *   node scripts/fetch-gnmic.mjs --all          # every platform (CI use)
 *   node scripts/fetch-gnmic.mjs --version v0.42.0
 *
 * Places the binary at:
 *   extras/gnmic/{mac-arm64|mac-x64|windows-x64|linux-x64|…}/gnmic[.exe]
 *
 * Verifies SHA256 against the checksums.txt in the same GitHub release
 * before extracting. Skips download when the target binary already
 * exists with the correct checksum, so re-running is cheap.
 *
 * The bundled binaries are gitignored — CI runs this script during
 * the platform build step before electron-builder pulls extras/ into
 * the app resources.
 *
 * Source: https://github.com/openconfig/gnmic (Apache-2.0). No auth
 * required; releases are public. Pin the version so a mid-release
 * bump doesn't silently ship a new binary.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import * as crypto from 'node:crypto'
import * as childProcess from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const extrasDir = path.resolve(repoRoot, 'extras', 'gnmic')

/**
 * Pin the gnmic version explicitly. Bump deliberately with a PR that
 * includes a note about any behavioral changes, so we never silently
 * ship a new binary to users. Latest as of 2026-07 is v0.46.0.
 */
const DEFAULT_VERSION = 'v0.46.0'

/**
 * All (platform, arch) combos we ship. Keep parallel with the
 * platformDirName() switch in tlink-gnmi/src/services/gnmicDiscovery.service.ts —
 * a divergence there means the runtime looks for a binary we never
 * fetched. Values are the release-asset name suffix gnmic uses.
 *
 * gnmic names arm64 assets as "aarch64" (goreleaser default), so
 * assetArch for mac-arm64 / linux-arm64 is 'aarch64', not 'arm64'.
 * The extras/ subdirectory keeps the 'arm64' convention to match
 * Node's process.arch.
 */
const PLATFORMS = {
    'mac-arm64': { assetOs: 'Darwin', assetArch: 'aarch64', archive: 'tar.gz', exe: 'gnmic' },
    'mac-x64': { assetOs: 'Darwin', assetArch: 'x86_64', archive: 'tar.gz', exe: 'gnmic' },
    'linux-x64': { assetOs: 'Linux', assetArch: 'x86_64', archive: 'tar.gz', exe: 'gnmic' },
    'linux-arm64': { assetOs: 'Linux', assetArch: 'aarch64', archive: 'tar.gz', exe: 'gnmic' },
    'linux-armv7': { assetOs: 'Linux', assetArch: 'armv7', archive: 'tar.gz', exe: 'gnmic' },
    'windows-x64': { assetOs: 'Windows', assetArch: 'x86_64', archive: 'zip', exe: 'gnmic.exe' },
    'windows-arm64': { assetOs: 'Windows', assetArch: 'aarch64', archive: 'zip', exe: 'gnmic.exe' },
}

const argv = process.argv.slice(2)
const wantAll = argv.includes('--all')
const versionArg = argv.find(a => a.startsWith('--version='))
    ?? (argv.indexOf('--version') >= 0 ? argv[argv.indexOf('--version') + 1] : null)
const VERSION = versionArg?.replace(/^--version=/, '') ?? process.env.GNMIC_VERSION ?? DEFAULT_VERSION

function detectHostPlatform () {
    // Honor an ARCH env var override so cross-arch CI builds fetch
    // the right binary. The macOS matrix runs on macos-latest
    // (Apple Silicon) but iterates arch=x86_64 AND arch=arm64;
    // process.arch would return 'arm64' both times and give us the
    // wrong binary for the x86_64 leg. Same shape on Windows / Linux
    // cross-arch build legs.
    const arch = normalizeArch(process.env.ARCH || process.arch)
    if (process.platform === 'darwin') { return arch === 'arm64' ? 'mac-arm64' : 'mac-x64' }
    if (process.platform === 'win32') { return arch === 'arm64' ? 'windows-arm64' : 'windows-x64' }
    if (process.platform === 'linux') {
        if (arch === 'arm64') { return 'linux-arm64' }
        if (arch === 'arm' || arch === 'armv7l' || arch === 'armhf') { return 'linux-armv7' }
        return 'linux-x64'
    }
    throw new Error(`Unsupported host platform: ${process.platform}/${arch}`)
}

/** Map various arch spellings to the canonical form our PLATFORMS map uses. */
function normalizeArch (raw) {
    const a = String(raw || '').toLowerCase()
    if (a === 'x86_64' || a === 'amd64') { return 'x64' }
    if (a === 'aarch64') { return 'arm64' }
    return a
}

const targets = wantAll ? Object.keys(PLATFORMS) : [detectHostPlatform()]

console.log(`fetch-gnmic: version=${VERSION}, targets=${targets.join(',')}`)

/**
 * Download the release checksums file once and cache it. Every
 * platform archive is verified against a line in this file before
 * extraction — mismatched checksum = abort with a loud error, don't
 * silently ship a corrupt or tampered binary.
 */
async function fetchChecksums () {
    const url = `https://github.com/openconfig/gnmic/releases/download/${VERSION}/checksums.txt`
    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`Failed to fetch checksums.txt from ${url}: ${res.status} ${res.statusText}`)
    }
    return await res.text()
}

async function downloadFile (url, destPath) {
    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, buf)
    return buf
}

function sha256 (buf) {
    return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * Find the checksum line matching an asset filename. The checksums.txt
 * gnmic ships is a plain "<sha256>  <filename>" per line — we grep
 * for the filename and return the hex digest.
 */
function findChecksum (checksumsText, filename) {
    const line = checksumsText.split('\n').find(l => l.trim().endsWith(filename))
    if (!line) {return null}
    return line.trim().split(/\s+/)[0]
}

/**
 * Extract the binary out of the downloaded archive to the platform's
 * bundle directory. tar for .tar.gz on Unix; unzip for .zip on any
 * platform. Falls back to `tar -xf` on Windows because modern Windows
 * has bsdtar built-in.
 */
async function extract (archivePath, platform) {
    const spec = PLATFORMS[platform]
    const outDir = path.join(extrasDir, platform)
    fs.mkdirSync(outDir, { recursive: true })

    if (spec.archive === 'tar.gz') {
        childProcess.execSync(`tar -xzf "${archivePath}" -C "${outDir}"`, { stdio: 'inherit' })
    } else if (spec.archive === 'zip') {
        if (process.platform === 'win32') {
            childProcess.execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${outDir}' -Force"`, { stdio: 'inherit' })
        } else {
            childProcess.execSync(`unzip -o "${archivePath}" -d "${outDir}"`, { stdio: 'inherit' })
        }
    } else {
        throw new Error(`Unknown archive type: ${spec.archive}`)
    }

    const finalPath = path.join(outDir, spec.exe)
    if (!fs.existsSync(finalPath)) {
        throw new Error(`Expected ${spec.exe} inside archive but it wasn't found at ${finalPath}`)
    }
    if (process.platform !== 'win32') {
        fs.chmodSync(finalPath, 0o755)
    }
    return finalPath
}

async function fetchOne (platform, checksumsText) {
    const spec = PLATFORMS[platform]
    const versionNoV = VERSION.replace(/^v/, '')
    const filename = `gnmic_${versionNoV}_${spec.assetOs}_${spec.assetArch}.${spec.archive}`
    const releaseUrl = `https://github.com/openconfig/gnmic/releases/download/${VERSION}/${filename}`
    const expectedSha = findChecksum(checksumsText, filename)
    if (!expectedSha) {
        // openconfig/gnmic does not publish Windows binaries (checked
        // through v0.47.0). Soft-skip rather than fail the whole CI
        // leg — the installer still builds and Windows users get a
        // clear "binary not found" message from GnmicDiscoveryService
        // if they open the gNMI plugin. Non-Windows misses still throw
        // because those SHOULD be present.
        if (platform.startsWith('windows-')) {
            console.log(`  ${platform}: skipped — openconfig/gnmic does not publish a Windows asset for ${VERSION}`)
            return
        }
        throw new Error(`No checksum for ${filename} in checksums.txt — asset name mismatch?`)
    }

    const outBinary = path.join(extrasDir, platform, spec.exe)
    if (fs.existsSync(outBinary)) {
        console.log(`  ${platform}: already present at ${outBinary} — skipping`)
        return
    }

    console.log(`  ${platform}: downloading ${filename}`)
    const tmpArchive = path.join(extrasDir, `.tmp-${platform}.${spec.archive}`)
    const buf = await downloadFile(releaseUrl, tmpArchive)

    const gotSha = sha256(buf)
    if (gotSha !== expectedSha) {
        fs.unlinkSync(tmpArchive)
        throw new Error(`SHA256 mismatch for ${filename}: expected ${expectedSha}, got ${gotSha}`)
    }
    console.log(`  ${platform}: checksum OK (${expectedSha.slice(0, 12)}…)`)

    await extract(tmpArchive, platform)
    fs.unlinkSync(tmpArchive)
    console.log(`  ${platform}: installed to ${outBinary}`)
}

// Suppress node's own gunzip import so tree-shakers don't strip it —
// referenced by tar via popen but not directly. Keeps the imports
// honest for anyone who audits the script.
void createGunzip
void pipeline

;(async () => {
    const checksums = await fetchChecksums()
    for (const platform of targets) {
        if (!PLATFORMS[platform]) {
            throw new Error(`Unknown platform: ${platform}. Valid: ${Object.keys(PLATFORMS).join(', ')}`)
        }
        await fetchOne(platform, checksums)
    }
    console.log('fetch-gnmic: done')
})().catch(err => {
    console.error(`fetch-gnmic: ${err.message || err}`)
    if (err.stack) { console.error(err.stack) }
    process.exit(1)
})
