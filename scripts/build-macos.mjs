#!/usr/bin/env node
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { build as builder } from 'electron-builder'
import { rebuild } from '@electron/rebuild'
import * as vars from './vars.mjs'
import { getArtifactSuffix, getExtraResources, isOllamaBundleEnabled } from './bundle-ollama.mjs'
import { ensureBuiltinPlugins } from './ensure-builtin-plugins.mjs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as url from 'node:url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const appPath = path.join(repoRoot, 'app')
const keytarBinaryPath = path.join(appPath, 'node_modules', 'keytar', 'build', 'Release', 'keytar.node')
// node-pty's prebuild-install hook downloads a host-arch binary during
// `yarn install`. On the arm64 macOS-15 runner that's normally arm64,
// but we've seen it land as x86_64 (likely a Rosetta'd shell or a stale
// prebuild cache). The downstream symptom is a fully-built arm64 .app
// that crashes on launch with "Cannot find module '../build/Debug/pty.node'"
// because dlopen rejects the wrong-arch binary. Verify-then-rebuild like
// keytar.
const ptyBinaryPath = path.join(appPath, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node')

function normalizeMacArch (arch) {
    if (arch === 'x86_64' || arch === 'x64') {
        return 'x86_64'
    }
    if (arch === 'aarch64' || arch === 'arm64') {
        return 'arm64'
    }
    return arch
}

function detectBinaryArchitectures (filePath) {
    try {
        const stdout = execFileSync('/usr/bin/lipo', ['-archs', filePath], { encoding: 'utf8' }).trim()
        if (stdout) {
            return new Set(stdout.split(/\s+/).filter(Boolean))
        }
    } catch {
        // fall through
    }

    try {
        const stdout = execFileSync('/usr/bin/file', [filePath], { encoding: 'utf8' })
        const arches = new Set()
        if (stdout.includes('x86_64')) {
            arches.add('x86_64')
        }
        if (stdout.includes('arm64')) {
            arches.add('arm64')
        }
        return arches
    } catch {
        return new Set()
    }
}

function nativeBinaryMatchesTargetArch (binaryPath, targetArch) {
    if (!fs.existsSync(binaryPath)) {
        return false
    }
    const expectedArch = normalizeMacArch(targetArch)
    const arches = detectBinaryArchitectures(binaryPath)
    if (!arches.size) {
        return true
    }
    return arches.has(expectedArch)
}

/**
 * Verify a native module's pty.node / keytar.node / etc. matches the
 * target arch; rebuild if not. Generalized from the original keytar-only
 * guard so node-pty (and any future native module) can use the same
 * pre-flight without repeating the verify-rebuild-verify dance.
 */
async function ensureNativeBinary (label, binaryPath, moduleName, targetArch) {
    if (nativeBinaryMatchesTargetArch(binaryPath, targetArch)) {
        return
    }

    console.log(`Ensuring ${label} native module for arch=${targetArch}`)
    await rebuild({
        buildPath: appPath,
        electronVersion: vars.electronVersion,
        arch: targetArch,
        force: true,
        useCache: false,
        onlyModules: [moduleName],
    })

    if (!fs.existsSync(binaryPath)) {
        throw new Error(`Missing ${label} native module after rebuild: ${binaryPath}`)
    }
    if (!nativeBinaryMatchesTargetArch(binaryPath, targetArch)) {
        const detected = [...detectBinaryArchitectures(binaryPath)].join(', ') || 'unknown'
        throw new Error(`${label} native module arch mismatch: expected ${normalizeMacArch(targetArch)}, got ${detected}`)
    }
}

const ensureKeytarBinary = (targetArch) => ensureNativeBinary('keytar', keytarBinaryPath, 'keytar', targetArch)
const ensureNodePtyBinary = (targetArch) => ensureNativeBinary('node-pty', ptyBinaryPath, 'node-pty', targetArch)

const isTag = (process.env.GITHUB_REF || '').startsWith('refs/tags/')

process.env.ARCH = normalizeMacArch(process.env.ARCH || process.arch)

if (process.env.GITHUB_HEAD_REF) {
    delete process.env.CSC_LINK
    delete process.env.CSC_KEY_PASSWORD
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
}

process.env.APPLE_ID ??= process.env.APPSTORE_USERNAME
process.env.APPLE_APP_SPECIFIC_PASSWORD ??= process.env.APPSTORE_PASSWORD

ensureBuiltinPlugins()

const bundleOllama = isOllamaBundleEnabled()
const artifactSuffix = getArtifactSuffix(bundleOllama)
const extraResources = getExtraResources(bundleOllama)

const requestedMacArtifacts = (process.env.TLINK_MAC_ARTIFACTS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)

const macTargets = requestedMacArtifacts.length ? requestedMacArtifacts : ['dmg', 'zip']

function removeNestedBinDirs () {
    const dirs = [
        path.join(repoRoot, 'app', 'node_modules'),
        path.join(repoRoot, 'build', 'builtin-plugins'),
    ]
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue
        try {
            execFileSync('/usr/bin/find', [dir, '-path', '*/node_modules/.bin', '-type', 'd', '-exec', 'rm', '-rf', '{}', '+'], { stdio: 'ignore' })
        } catch { /* ignore */ }
    }
}

;(async () => {
    await ensureKeytarBinary(process.env.ARCH)
    await ensureNodePtyBinary(process.env.ARCH)

    // Remove nested .bin symlink directories to prevent EEXIST errors during packaging
    removeNestedBinDirs()

    await builder({
        dir: true,
        mac: macTargets,
        x64: process.env.ARCH === 'x86_64',
        arm64: process.env.ARCH === 'arm64',
        config: {
            extraMetadata: {
                version: vars.version,
                teamId: process.env.APPLE_TEAM_ID,
            },
            ...(extraResources ? { extraResources } : {}),
            mac: {
                identity: !process.env.CI || process.env.CSC_LINK ? undefined : null,
                notarize: !!process.env.APPLE_TEAM_ID,
                artifactName: `tlink-\${version}-macos-\${arch}${artifactSuffix}.\${ext}`,
            },
            npmRebuild: true,
            publish: process.env.KEYGEN_TOKEN ? [
                vars.keygenConfig,
                {
                    provider: 'github',
                    channel: `latest-${process.env.ARCH}`,
                },
            ] : undefined,
        },
        publish: (process.env.KEYGEN_TOKEN && isTag) ? 'always' : 'never',
    })
})().catch(e => {
    console.error(e)
    process.exit(1)
})
