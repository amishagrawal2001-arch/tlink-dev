import fs from 'fs'
import path from 'path'
import * as url from 'url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_OLLAMA_DIR = path.resolve(__dirname, '../extras-ollama')

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

export function getExtraResources (bundleOllama) {
    if (!bundleOllama) {
        return null
    }

    const ollamaDir = getOllamaSourceDir()
    if (!fs.existsSync(ollamaDir)) {
        throw new Error(`TLINK_BUNDLE_OLLAMA=1 requires ${ollamaDir} to exist`)
    }

    return [{ from: ollamaDir, to: 'ollama' }]
}
