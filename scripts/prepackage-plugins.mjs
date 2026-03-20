#!/usr/bin/env node
import { rebuild } from '@electron/rebuild'
import path from 'node:path'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import * as vars from './vars.mjs'
import { passthroughBuiltinPlugins } from './builtin-plugin-layout.mjs'
import log from 'npmlog'

import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const STAGED_PLUGIN_PREFIX = 'builtin-plugins/'
const target = path.resolve(__dirname, '../build/builtin-plugins')
const repoRoot = path.resolve(__dirname, '..')
const buildModulesScript = path.resolve(__dirname, 'build-modules.mjs')
const stageMetadataPath = path.join(target, '.stage-meta.json')
const stageMetadata = {
    arch: process.env.ARCH ?? process.arch,
    electronVersion: vars.electronVersion,
    generatedAt: new Date().toISOString(),
}
const criticalMainPlugins = new Set([
    'tlink-core',
    'tlink-settings',
    'tlink-terminal',
    'tlink-electron',
    'tlink-intellij-bridge',
    'tlink-ai-assistant',
    'builtin-plugins/tabby-vscode-agent',
])

function getStagedFolderName(plugin) {
    return plugin.startsWith(STAGED_PLUGIN_PREFIX)
        ? plugin.slice(STAGED_PLUGIN_PREFIX.length)
        : plugin
}

function stagePlugin(plugin) {
    const source = path.join(repoRoot, plugin)
    const stagedFolderName = getStagedFolderName(plugin)
    const destination = path.join(target, stagedFolderName)

    if (!fs.existsSync(source)) {
        throw new Error(`Builtin plugin source does not exist: ${source}`)
    }

    if (path.resolve(source) !== path.resolve(destination)) {
        fs.rmSync(destination, { recursive: true, force: true })
        fs.cpSync(source, destination, { recursive: true })
    }

    fs.rmSync(path.join(destination, 'node_modules'), { recursive: true, force: true })
    return destination
}

function runYarn(args, cwd) {
    execFileSync('yarn', args, {
        cwd,
        env: process.env,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    })
}

function parsePackageJson(destination) {
    return JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf-8'))
}

function resolveMainPath(destination, pkg) {
    if (!pkg.main) {
        return null
    }
    return path.resolve(destination, pkg.main)
}

function isUsableMainEntrypoint(mainPath) {
    if (!mainPath || !fs.existsSync(mainPath)) {
        return false
    }
    try {
        return fs.statSync(mainPath).size > 0
    } catch {
        return false
    }
}

function buildSinglePluginArtifacts(pluginName) {
    const configPath = pluginName.startsWith(STAGED_PLUGIN_PREFIX)
        ? `../${pluginName}/webpack.config.mjs`
        : `../${pluginName}/webpack.config.mjs`

    log.warn('build', `Rebuilding ${pluginName} via ${configPath}`)
    execFileSync(process.execPath, [buildModulesScript], {
        cwd: repoRoot,
        env: {
            ...process.env,
            TLINK_BUILD_CONFIGS: configPath,
        },
        stdio: 'inherit',
    })
}

function ensureMainEntrypoint(pluginName, destination) {
    const pkg = parsePackageJson(destination)
    const mainPath = resolveMainPath(destination, pkg)
    if (!mainPath || isUsableMainEntrypoint(mainPath)) {
        return
    }

    if (!criticalMainPlugins.has(pluginName)) {
        log.warn('build', `${pluginName}: leaving invalid optional entrypoint ${pkg.main}`)
        return
    }

    log.warn('build', `${pluginName}: invalid ${pkg.main}, rebuilding critical plugin artifacts`)
    buildSinglePluginArtifacts(pluginName)
    const refreshedDestination = stagePlugin(pluginName)
    runYarn(['install', '--force', '--production'], refreshedDestination)
    const refreshedPkg = parsePackageJson(refreshedDestination)
    const refreshedMainPath = resolveMainPath(refreshedDestination, refreshedPkg)

    if (!isUsableMainEntrypoint(refreshedMainPath)) {
        throw new Error(`Build completed but entrypoint is still invalid for ${pluginName}: ${refreshedPkg.main}`)
    }
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
const tempManifestPath = path.join(target, 'package.json')
fs.writeFileSync(tempManifestPath, '{}')

try {
    for (const plugin of vars.builtinPlugins) {
        if (plugin === 'tlink-web') {
            continue
        }
        log.info('install', plugin)
        const destination = stagePlugin(plugin)
        runYarn(['install', '--force', '--production'], destination)
        ensureMainEntrypoint(plugin, destination)

        log.info('rebuild', 'native')
        if (fs.existsSync(path.join(destination, 'node_modules'))) {
            await rebuild({
                buildPath: destination,
                electronVersion: vars.electronVersion,
                arch: process.env.ARCH ?? process.arch,
                force: true,
                useCache: false,
            })
        }
    }

    for (const plugin of passthroughBuiltinPlugins) {
        log.info('install', plugin)
        stagePlugin(plugin)
    }

    fs.writeFileSync(stageMetadataPath, `${JSON.stringify(stageMetadata, null, 2)}\n`)
} finally {
    if (fs.existsSync(tempManifestPath)) {
        fs.unlinkSync(tempManifestPath)
    }
}
