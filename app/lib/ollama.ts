import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { spawn, type ChildProcess } from 'child_process'

const DEFAULT_MODEL = process.env.TLINK_OLLAMA_MODEL || 'llama3.1:8b'
const DEFAULT_HOST = process.env.TLINK_OLLAMA_HOST || '127.0.0.1:11434'
const AUTO_PULL = parseBool(process.env.TLINK_OLLAMA_AUTO_PULL, true)
const START_TIMEOUT_MS = getNumber(process.env.TLINK_OLLAMA_START_TIMEOUT_MS, 15000)

let started = false
let ollamaProcess: ChildProcess | null = null
let pullInProgress = false

export function ensureBundledOllama (): void {
    if (started) {
        return
    }
    started = true
    void startBundledOllama().catch(err => {
        console.warn('Ollama init failed', err)
    })
}

async function startBundledOllama (): Promise<void> {
    const binary = findBundledOllamaBinary()
    if (!binary) {
        return
    }

    const modelDir = getModelDir()
    fs.mkdirSync(modelDir, { recursive: true })

    const running = await probeOllama()
    if (!running) {
        startOllama(binary, modelDir)
    }

    const ready = await waitForOllama(START_TIMEOUT_MS)
    if (!ready || !AUTO_PULL) {
        return
    }

    void ensureModelAvailable(DEFAULT_MODEL, binary, modelDir)
}

function findBundledOllamaBinary (): string | null {
    const baseDir = getBundledOllamaDir()
    if (!baseDir) {
        return null
    }

    const candidates: string[] = []
    if (process.platform === 'darwin') {
        candidates.push(
            path.join(baseDir, 'mac', 'ollama'),
            path.join(baseDir, 'ollama'),
        )
    } else if (process.platform === 'win32') {
        candidates.push(
            path.join(baseDir, 'windows', 'ollama.exe'),
            path.join(baseDir, 'ollama.exe'),
        )
    } else {
        candidates.push(
            path.join(baseDir, 'linux', 'ollama'),
            path.join(baseDir, 'ollama'),
        )
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(candidate, 0o755)
                } catch {}
            }
            return candidate
        }
    }

    return null
}

function getBundledOllamaDir (): string | null {
    if (app.isPackaged) {
        const dir = path.join(process.resourcesPath, 'ollama')
        return fs.existsSync(dir) ? dir : null
    }
    const devDir = process.env.TLINK_OLLAMA_DIR || path.join(app.getAppPath(), '..', 'extras-ollama')
    return fs.existsSync(devDir) ? devDir : null
}

function getModelDir (): string {
    return path.join(app.getPath('userData'), 'ollama')
}

function buildOllamaEnv (modelDir: string): NodeJS.ProcessEnv {
    return {
        ...process.env,
        OLLAMA_HOST: DEFAULT_HOST,
        OLLAMA_MODELS: modelDir,
    }
}

function startOllama (binary: string, modelDir: string): void {
    const env = buildOllamaEnv(modelDir)
    ollamaProcess = spawn(binary, ['serve'], {
        env,
        stdio: 'ignore',
    })

    ollamaProcess.on('exit', () => {
        ollamaProcess = null
    })

    app.on('before-quit', () => {
        if (ollamaProcess && !ollamaProcess.killed) {
            ollamaProcess.kill()
        }
    })
}

async function ensureModelAvailable (model: string, binary: string, modelDir: string): Promise<void> {
    if (pullInProgress) {
        return
    }
    pullInProgress = true
    try {
        const tags = await fetchTags()
        if (tags?.models?.some(entry => entry.name === model)) {
            return
        }
        const env = buildOllamaEnv(modelDir)
        const pull = spawn(binary, ['pull', model], { env, stdio: 'ignore' })
        await new Promise<void>(resolve => {
            pull.on('exit', () => resolve())
            pull.on('error', () => resolve())
        })
    } finally {
        pullInProgress = false
    }
}

async function probeOllama (): Promise<boolean> {
    const tags = await fetchTags()
    return !!tags
}

async function waitForOllama (timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await probeOllama()) {
            return true
        }
        await sleep(500)
    }
    return false
}

async function fetchTags (): Promise<{ models?: Array<{ name: string }> } | null> {
    const url = buildOllamaUrl('/api/tags')
    return new Promise(resolve => {
        const req = http.request(url, { method: 'GET' }, res => {
            let data = ''
            res.on('data', chunk => {
                data += chunk
            })
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data))
                        return
                    } catch {}
                }
                resolve(null)
            })
        })
        req.on('error', () => resolve(null))
        req.setTimeout(1500, () => {
            req.destroy()
            resolve(null)
        })
        req.end()
    })
}

function buildOllamaUrl (pathName: string): URL {
    const base = DEFAULT_HOST.startsWith('http') ? DEFAULT_HOST : `http://${DEFAULT_HOST}`
    return new URL(pathName, base)
}

function sleep (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function parseBool (value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback
    }
    const lowered = value.toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(lowered)) {
        return true
    }
    if (['0', 'false', 'no', 'off'].includes(lowered)) {
        return false
    }
    return fallback
}

function getNumber (value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}
