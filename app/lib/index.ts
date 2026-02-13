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

ipcMain.on('app:new-window', () => {
    application.newWindow()
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
    application.handleSecondInstance(newArgv, cwd)
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
    window.passCliArguments(process.argv, process.cwd(), false)
    window.focus()
})
