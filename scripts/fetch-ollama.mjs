#!/usr/bin/env node
/**
 * Download the `ollama` binary that NexTerm bundles when
 * TLINK_BUNDLE_OLLAMA=1 is set at build time.
 *
 *   node scripts/fetch-ollama.mjs              # host platform/arch only
 *   node scripts/fetch-ollama.mjs --version v0.40.18
 *
 * Places the binary at the exact path the runtime wrapper in
 * app/lib/ollama.ts looks for:
 *   extras-ollama/mac/ollama            (darwin, universal — both archs)
 *   extras-ollama/linux/ollama          (linux, host-arch only)
 *   extras-ollama/windows/ollama.exe    (windows, host-arch only)
 *
 * Each CI leg runs in a fresh clone, so fetching host-only keeps
 * cross-arch builds slim: the macOS leg ships only the mac binary, etc.
 * Re-running locally overwrites the host-platform slot in-place.
 *
 * The bundled binaries are gitignored (see .gitignore `extras-ollama/`
 * entries) — CI runs this before electron-builder pulls extras-ollama/
 * into the app resources via scripts/bundle-ollama.mjs.
 *
 * Source: https://github.com/ollama/ollama (MIT). No auth required;
 * releases are public. Pin the version so a mid-release bump doesn't
 * silently ship a new binary to users.
 *
 * TODO: verify SHA256. Ollama's releases do not publish a single
 * SHA256SUMS.txt in an easy-to-grep format (per release 0.40.x), so
 * trust is anchored at HTTPS + github.com/ollama/ollama. Revisit when
 * their release workflow adds checksums.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import * as childProcess from 'node:child_process'
import * as os from 'node:os'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const extrasDir = path.resolve(repoRoot, 'extras-ollama')

/**
 * Pin the ollama version explicitly. Bump deliberately with a PR
 * noting the behavioral diff — ollama is close to the AI chat UX so
 * a silent model-compat change could break first-run.
 */
const DEFAULT_VERSION = 'v0.40.18'

const argv = process.argv.slice(2)
const versionArg = argv.find(a => a.startsWith('--version='))
    ?? (argv.indexOf('--version') >= 0 ? argv[argv.indexOf('--version') + 1] : null)
const VERSION = versionArg?.replace(/^--version=/, '') ?? process.env.OLLAMA_VERSION ?? DEFAULT_VERSION

/** Normalize various arch spellings to the ollama asset's convention. */
function normalizeArch (raw) {
    const a = String(raw || '').toLowerCase()
    if (a === 'x86_64' || a === 'amd64' || a === 'x64') { return 'amd64' }
    if (a === 'aarch64' || a === 'arm64') { return 'arm64' }
    return a
}

/**
 * Describe the host build leg. `ARCH` env overrides process.arch so
 * cross-arch CI legs (macos-15 running both arm64 and x86_64 matrices)
 * pick the right asset per leg.
 */
function detectHost () {
    const arch = normalizeArch(process.env.ARCH || process.arch)
    if (process.platform === 'darwin') {
        // Ollama ships a single universal darwin tgz — same binary for both archs.
        return { dir: 'mac', exe: 'ollama', archive: 'ollama-darwin.tgz', extract: 'tgz' }
    }
    if (process.platform === 'linux') {
        if (arch !== 'amd64' && arch !== 'arm64') {
            // Ollama does not publish linux/armv7 builds. Soft-skip so
            // the tlink armhf leg stays green; the installer builds
            // without Ollama and the user installs it themselves.
            return null
        }
        return { dir: 'linux', exe: 'ollama', archive: `ollama-linux-${arch}.tar.zst`, extract: 'zst' }
    }
    if (process.platform === 'win32') {
        if (arch !== 'amd64' && arch !== 'arm64') {
            return null
        }
        return { dir: 'windows', exe: 'ollama.exe', archive: `ollama-windows-${arch}.zip`, extract: 'zip' }
    }
    throw new Error(`Unsupported host platform: ${process.platform}`)
}

async function downloadFile (fromUrl, destPath) {
    const res = await fetch(fromUrl, { redirect: 'follow' })
    if (!res.ok) {
        throw new Error(`Failed to download ${fromUrl}: ${res.status} ${res.statusText}`)
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(destPath, buf)
    return buf.length
}

/**
 * Extract the downloaded archive into a temp dir and move the ollama
 * binary into place. We shell out to system tools (tar, unzip,
 * Expand-Archive) rather than adding a native zstd dep: CI images and
 * dev machines already carry these.
 */
function extract (archivePath, host) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlink-ollama-'))
    try {
        switch (host.extract) {
            case 'tgz':
                childProcess.execSync(`tar -xzf "${archivePath}" -C "${workDir}"`, { stdio: 'inherit' })
                break
            case 'zst':
                // -I zstd is widely supported (GNU tar >= 1.31, bsdtar).
                // ubuntu-24.04 CI images and modern macOS both ship tar
                // with zstd support. If this fails, `apt-get install zstd`
                // is the fix on the runner.
                childProcess.execSync(`tar -I zstd -xf "${archivePath}" -C "${workDir}"`, { stdio: 'inherit' })
                break
            case 'zip':
                if (process.platform === 'win32') {
                    childProcess.execSync(
                        `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${workDir}' -Force"`,
                        { stdio: 'inherit' },
                    )
                } else {
                    childProcess.execSync(`unzip -qo "${archivePath}" -d "${workDir}"`, { stdio: 'inherit' })
                }
                break
            default:
                throw new Error(`Unknown extract kind: ${host.extract}`)
        }

        // Locate the ollama binary anywhere in the extracted tree. Some
        // ollama archives put it at the root, others under bin/.
        const found = findBinary(workDir, host.exe)
        if (!found) {
            throw new Error(`Binary ${host.exe} not found inside ${archivePath}`)
        }

        const outDir = path.join(extrasDir, host.dir)
        fs.mkdirSync(outDir, { recursive: true })
        const outPath = path.join(outDir, host.exe)
        fs.copyFileSync(found, outPath)
        if (process.platform !== 'win32') {
            fs.chmodSync(outPath, 0o755)
        }
        return outPath
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true })
    }
}

/** Depth-first scan for the exact filename. */
function findBinary (dir, name) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isFile() && entry.name === name) { return full }
        if (entry.isDirectory()) {
            const nested = findBinary(full, name)
            if (nested) { return nested }
        }
    }
    return null
}

;(async () => {
    const host = detectHost()
    if (!host) {
        console.log(`fetch-ollama: no release for ${process.platform}/${process.env.ARCH || process.arch} — skipping`)
        return
    }
    const outPath = path.join(extrasDir, host.dir, host.exe)
    const releaseUrl = `https://github.com/ollama/ollama/releases/download/${VERSION}/${host.archive}`

    console.log(`fetch-ollama: version=${VERSION}, target=${host.dir}/${host.exe}`)

    if (fs.existsSync(outPath)) {
        console.log(`  already present at ${outPath} — skipping. Delete the file to force a refetch.`)
        return
    }

    const tmpArchive = path.join(extrasDir, `.tmp-${host.dir}-${host.archive}`)
    console.log(`  downloading ${releaseUrl}`)
    const size = await downloadFile(releaseUrl, tmpArchive)
    console.log(`  downloaded ${(size / 1024 / 1024).toFixed(1)} MiB`)

    try {
        const installed = extract(tmpArchive, host)
        console.log(`  installed to ${installed}`)
    } finally {
        if (fs.existsSync(tmpArchive)) { fs.unlinkSync(tmpArchive) }
    }

    console.log('fetch-ollama: done')
})().catch(err => {
    console.error(`fetch-ollama: ${err.message || err}`)
    if (err.stack) { console.error(err.stack) }
    process.exit(1)
})
