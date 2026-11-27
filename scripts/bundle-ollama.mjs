import fs from 'fs'
import path from 'path'
import * as url from 'url'
import yaml from 'js-yaml'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_OLLAMA_DIR = path.resolve(__dirname, '../extras-ollama')
const ELECTRON_BUILDER_CONFIG = path.resolve(__dirname, '../electron-builder.yml')

export function isOllamaBundleEnabled () {
    const value = (process.env.TLINK_BUNDLE_OLLAMA || '').toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(value)
}

/**
 * '-ollama' only when we actually copied a binary into extraResources.
 * Prevents the Linux armhf leg from stamping '-ollama' on an installer
 * that ships without the embedded server.
 */
export function getArtifactSuffix (bundleOllama) {
    if (!bundleOllama) { return '' }
    return hasAnyOllamaBinary(getOllamaSourceDir()) ? '-ollama' : ''
}

export function getOllamaSourceDir () {
    return process.env.TLINK_OLLAMA_DIR ? path.resolve(process.env.TLINK_OLLAMA_DIR) : DEFAULT_OLLAMA_DIR
}

function getDefaultExtraResources () {
    try {
        const content = fs.readFileSync(ELECTRON_BUILDER_CONFIG, 'utf8')
        const parsed = yaml.load(content)
        return Array.isArray(parsed?.extraResources) ? parsed.extraResources : []
    } catch {
        return []
    }
}

/**
 * Does the ollama source dir hold at least one platform binary? Used
 * to decide whether a build leg actually ships ollama — e.g. Linux
 * armhf has no upstream Ollama binary, so fetch-ollama.mjs soft-skips,
 * and this returns false so the installer ships without the embedded
 * server rather than copying an empty resources dir and misleading
 * app/lib/ollama.ts into trying to spawn a nonexistent binary.
 */
export function hasAnyOllamaBinary (ollamaDir) {
    if (!fs.existsSync(ollamaDir)) { return false }
    const candidates = [
        path.join(ollamaDir, 'mac', 'ollama'),
        path.join(ollamaDir, 'linux', 'ollama'),
        path.join(ollamaDir, 'windows', 'ollama.exe'),
    ]
    return candidates.some(p => fs.existsSync(p))
}

export function getExtraResources (bundleOllama) {
    if (!bundleOllama) {
        return null
    }

    const ollamaDir = getOllamaSourceDir()
    if (!hasAnyOllamaBinary(ollamaDir)) {
        console.warn(`[bundle-ollama] TLINK_BUNDLE_OLLAMA=1 but no binary found under ${ollamaDir} — building without the embedded server. Run \`node scripts/fetch-ollama.mjs\` first to include it.`)
        return null
    }

    const resources = getDefaultExtraResources()
    const hasOllama = resources.some(entry =>
        typeof entry === 'object' && entry !== null && entry.to === 'ollama',
    )
    if (!hasOllama) {
        resources.push({ from: ollamaDir, to: 'ollama' })
    }
    return resources
}
