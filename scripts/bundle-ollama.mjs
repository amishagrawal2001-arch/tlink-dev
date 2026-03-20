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

export function getArtifactSuffix (bundleOllama) {
    return bundleOllama ? '-ollama' : ''
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

export function getExtraResources (bundleOllama) {
    if (!bundleOllama) {
        return null
    }

    const ollamaDir = getOllamaSourceDir()
    if (!fs.existsSync(ollamaDir)) {
        throw new Error(`TLINK_BUNDLE_OLLAMA=1 requires ${ollamaDir} to exist`)
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
