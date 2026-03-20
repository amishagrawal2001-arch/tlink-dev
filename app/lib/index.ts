import { app, ipcMain, Menu, dialog, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as nodeModule from 'module'

// set userData Path on portable version
import './portable'

const packagedNodeModules = app.isPackaged ? path.join(process.resourcesPath, 'node_modules') : null
if (packagedNodeModules && fs.existsSync(packagedNodeModules)) {
    const nodePathEntries = (process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []).filter(Boolean)
    if (!nodePathEntries.includes(packagedNodeModules)) {
        nodePathEntries.push(packagedNodeModules)
        process.env.NODE_PATH = nodePathEntries.join(path.delimiter)
        ;(nodeModule as any)._initPaths()
    }
}

require('dotenv/config')

// set defaults of environment variables

const bundledCAFile = app.isPackaged
    ? path.join(process.resourcesPath, 'certs', 'corp-root.pem')
    : path.join(app.getAppPath(), '..', 'build', 'certs', 'corp-root.pem')
const extraCAFile = process.env.TLINK_NPM_CAFILE
const resolvedExtraCAFile = extraCAFile && fs.existsSync(extraCAFile) ? extraCAFile : undefined
const resolvedCAFile = resolvedExtraCAFile ?? (fs.existsSync(bundledCAFile) ? bundledCAFile : undefined)
if (resolvedCAFile && !process.env.NODE_EXTRA_CA_CERTS) {
    process.env.NODE_EXTRA_CA_CERTS = resolvedCAFile
}
if (resolvedCAFile && !process.env.NPM_CONFIG_CAFILE) {
    process.env.NPM_CONFIG_CAFILE = resolvedCAFile
}
const npmRegistry = process.env.TLINK_NPM_REGISTRY
if (npmRegistry && !process.env.NPM_CONFIG_REGISTRY) {
    process.env.NPM_CONFIG_REGISTRY = npmRegistry
}
const npmStrictSSL = process.env.TLINK_NPM_STRICT_SSL
if (npmStrictSSL && !process.env.NPM_CONFIG_STRICT_SSL) {
    process.env.NPM_CONFIG_STRICT_SSL = npmStrictSSL
}

const appName = 'Tlink'
app.setName(appName)
if (process.platform === 'darwin') {
    app.setAboutPanelOptions({ applicationName: appName })
}

const applyIsolatedProfile = (suffix: string): void => {
    const configuredProfilePath = process.env.TLINK_CONFIG_DIRECTORY
    const baseUserDataPath = configuredProfilePath ?? app.getPath('userData')
    const isolatedProfilePath = baseUserDataPath.endsWith(`-${suffix}`)
        ? baseUserDataPath
        : `${baseUserDataPath}-${suffix}`
    fs.mkdirSync(isolatedProfilePath, { recursive: true })
    const sourceConfigPath = path.join(baseUserDataPath, 'config.yaml')
    const targetConfigPath = path.join(isolatedProfilePath, 'config.yaml')
    if (
        baseUserDataPath !== isolatedProfilePath
        && fs.existsSync(sourceConfigPath)
        && !fs.existsSync(targetConfigPath)
    ) {
        try {
            fs.copyFileSync(sourceConfigPath, targetConfigPath)
        } catch (error) {
            console.warn(`Could not migrate config to isolated profile (${suffix}):`, error)
        }
    }
    app.setPath('userData', isolatedProfilePath)
    process.env.TLINK_CONFIG_DIRECTORY = isolatedProfilePath
    console.log(`Using isolated profile (${suffix}): ${isolatedProfilePath}`)
}

const shouldIsolateDevProfile = (): boolean => !app.isPackaged
    && process.env.TLINK_DEV === '1'
    && process.env.TLINK_DEV_SEPARATE_PROFILE !== '0'

const shouldIsolateSecondaryPackagedProfile = (): boolean => {
    if (!app.isPackaged) {
        return false
    }
    if (process.env.TLINK_PACKAGED_SEPARATE_PROFILE === '0') {
        return false
    }
    if (process.env.TLINK_PACKAGED_SEPARATE_PROFILE === '1') {
        return true
    }
    const executablePath = path.resolve(app.getPath('exe'))
    return process.platform === 'darwin' && !executablePath.startsWith('/Applications/Tlink.app/')
}

if (shouldIsolateDevProfile()) {
    applyIsolatedProfile('dev')
} else if (shouldIsolateSecondaryPackagedProfile()) {
    const executablePath = path.resolve(app.getPath('exe'))
    const profileHash = crypto.createHash('sha1').update(executablePath).digest('hex').slice(0, 8)
    applyIsolatedProfile(`local-${profileHash}`)
}

process.env.TLINK_PLUGINS ??= ''
process.env.TLINK_CONFIG_DIRECTORY ??= app.getPath('userData')

require('v8-compile-cache')
require('source-map-support/register')
require('./sentry')
require('./lru')

// Silence a noisy deprecation warning from electron-debug on newer Electron:
// "session.getAllExtensions is deprecated" (moved to session.extensions.getAllExtensions)
process.on('warning', warning => {
    if (warning.name === 'DeprecationWarning' && warning.message.includes('session.getAllExtensions')) {
        return
    }
    // Re-emit other warnings as usual
    console.warn(warning)
})

const { ensureBundledOllama } = require('./ollama')

const { parseArgs } = require('./cli')
const { Application } = require('./app')
const electronDebug = require('electron-debug')
const { loadConfig } = require('./config')

const argv = parseArgs(process.argv, process.cwd())

// eslint-disable-next-line @typescript-eslint/init-declarations
let configStore: any

try {
    configStore = loadConfig()
} catch (err) {
    dialog.showErrorBox('Could not read config', err.message)
    app.exit(1)
}

process.mainModule = module

const application = new Application(configStore)
const pendingProtocolUrls: string[] = []
const queuedProtocolUrls = new Set<string>()
const recentlyHandledProtocolUrls = new Map<string, number>()
const protocolUrlDedupeWindowMs = 3000

const isShareProtocolUrl = (value: string | undefined | null): boolean => {
    return typeof value === 'string' && value.startsWith('tlink://share/')
}

const isIgnorableSecondInstanceArg = (value: string | undefined | null): boolean => {
    if (typeof value !== 'string') {
        return true
    }
    const arg = value.trim()
    if (!arg) {
        return true
    }
    return process.platform === 'darwin' && arg.startsWith('-psn_')
}

const pruneRecentlyHandledProtocolUrls = (): void => {
    const cutoff = Date.now() - protocolUrlDedupeWindowMs
    for (const [url, timestamp] of recentlyHandledProtocolUrls) {
        if (timestamp < cutoff) {
            recentlyHandledProtocolUrls.delete(url)
        }
    }
}

const flushProtocolUrls = async (): Promise<void> => {
    while (pendingProtocolUrls.length) {
        const url = pendingProtocolUrls.shift()
        if (!url) {
            continue
        }
        queuedProtocolUrls.delete(url)
        await application.send('host:open-shared-session-url', url)
        application.focus()
    }
}

const queueProtocolUrl = (url: string): void => {
    const normalizedUrl = String(url).trim()
    if (!normalizedUrl) {
        return
    }
    if (!isShareProtocolUrl(normalizedUrl)) {
        return
    }
    pruneRecentlyHandledProtocolUrls()
    if (queuedProtocolUrls.has(normalizedUrl)) {
        return
    }
    const lastHandled = recentlyHandledProtocolUrls.get(normalizedUrl)
    if (lastHandled && Date.now() - lastHandled < protocolUrlDedupeWindowMs) {
        return
    }
    recentlyHandledProtocolUrls.set(normalizedUrl, Date.now())
    queuedProtocolUrls.add(normalizedUrl)
    pendingProtocolUrls.push(normalizedUrl)
    if (app.isReady()) {
        void flushProtocolUrls()
    }
}

ipcMain.on('app:new-window', () => {
    application.newWindow()
})

ipcMain.on('app:open-code-editor-window', () => {
    void application.openCodeEditorWindow()
})

ipcMain.on('app:open-ai-assistant-window', () => {
    application.openAIAssistantWindow()
})

process.on('uncaughtException' as any, err => {
    console.log(err)
    application.broadcast('uncaughtException', err)
})

if (argv.d) {
    electronDebug({
        isEnabled: true,
        showDevTools: true,
        devToolsMode: 'undocked',
    })
}

app.on('activate', async () => {
    if (!application.hasWindows()) {
        application.newWindow()
    } else {
        application.focus()
    }
})

app.on('second-instance', async (_event, newArgv, cwd) => {
    const shareUrls = newArgv.filter((arg: string) => isShareProtocolUrl(arg))
    shareUrls.forEach((url: string) => queueProtocolUrl(url))

    const filteredArgv = newArgv.filter((arg: string) => !isShareProtocolUrl(arg))
    const hasMeaningfulArgs = filteredArgv.slice(1).some((arg: string) => !isIgnorableSecondInstanceArg(arg))
    if (hasMeaningfulArgs || shareUrls.length === 0) {
        application.handleSecondInstance(filteredArgv, cwd)
    }
})

app.on('open-url', (event, url) => {
    event.preventDefault()
    queueProtocolUrl(url)
})

const isProcessAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch (error: any) {
        return error?.code === 'EPERM'
    }
}

const getSingletonLockPid = (lockTarget: string): number | null => {
    const match = /-(\d+)$/.exec(lockTarget)
    if (!match) {
        return null
    }
    const pid = Number(match[1])
    return Number.isFinite(pid) ? pid : null
}

const cleanupStaleSingletonLock = (): boolean => {
    const userDataPath = app.getPath('userData')
    const lockPath = path.join(userDataPath, 'SingletonLock')
    if (!fs.existsSync(lockPath)) {
        return false
    }
    try {
        const lockTarget = fs.readlinkSync(lockPath)
        const lockPid = getSingletonLockPid(lockTarget)
        if (lockPid && isProcessAlive(lockPid)) {
            return false
        }
    } catch {
        // If lock metadata is unreadable, still try cleanup as a best effort.
    }

    const singletonFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
    let cleaned = false
    for (const file of singletonFiles) {
        const filePath = path.join(userDataPath, file)
        try {
            if (fs.existsSync(filePath)) {
                fs.rmSync(filePath, { force: true })
                cleaned = true
            }
        } catch (error) {
            console.warn(`Failed removing stale ${file}:`, error)
        }
    }
    return cleaned
}

let hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock && cleanupStaleSingletonLock()) {
    hasSingleInstanceLock = app.requestSingleInstanceLock()
}

if (!hasSingleInstanceLock) {
    app.quit()
    app.exit(0)
}

app.on('ready', async () => {
    ensureBundledOllama()

    try {
        if (!app.isDefaultProtocolClient('tlink')) {
            app.setAsDefaultProtocolClient('tlink')
        }
    } catch (error) {
        console.warn('Could not register tlink:// protocol handler:', error)
    }

    if (process.platform === 'darwin') {
        const dockIconPath = path.join(app.getAppPath(), '..', 'build', 'icons', 'Tlink-logo.png')
        const dockIcon = nativeImage.createFromPath(dockIconPath)
        if (!dockIcon.isEmpty()) {
            app.dock.setIcon(dockIcon)
        }
        app.dock.setMenu(Menu.buildFromTemplate([
            {
                label: 'New window',
                click () {
                    this.app.newWindow()
                },
            },
        ]))
    }

    await application.init()

    const window = await application.newWindow({ hidden: argv.hidden })
    await window.ready
    const startupShareUrls = process.argv.filter(arg => isShareProtocolUrl(arg))
    startupShareUrls.forEach(url => queueProtocolUrl(url))
    const startupArgv = process.argv.filter(arg => !isShareProtocolUrl(arg))
    window.passCliArguments(startupArgv, process.cwd(), false)
    await flushProtocolUrls()
    window.focus()
})
