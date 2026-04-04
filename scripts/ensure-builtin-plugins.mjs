import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as url from 'url'
import * as vars from './vars.mjs'
import { passthroughBuiltinPlugins, passthroughPluginValidation } from './builtin-plugin-layout.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const builtinPluginRoot = path.resolve(repoRoot, 'build/builtin-plugins')
const stageMetadataPath = path.join(builtinPluginRoot, '.stage-meta.json')
const criticalMainPlugins = new Set([
    'tlink-core',
    'tlink-settings',
    'tlink-terminal',
    'tlink-electron',
    'tlink-intellij-bridge',
    'tabby-vscode-agent',
])

function getStagedFolderName(plugin) {
    return plugin.startsWith('builtin-plugins/')
        ? plugin.slice('builtin-plugins/'.length)
        : plugin
}

function getRequiredPlugins() {
    const required = vars.builtinPlugins
        .filter(plugin => plugin !== 'tlink-web')
        .map(plugin => ({
            sourcePlugin: plugin,
            stagedPlugin: getStagedFolderName(plugin),
            mode: 'package',
        }))

    for (const plugin of passthroughBuiltinPlugins) {
        const stagedPlugin = getStagedFolderName(plugin)
        if (required.some(x => x.stagedPlugin === stagedPlugin)) {
            continue
        }
        required.push({
            sourcePlugin: plugin,
            stagedPlugin,
            mode: 'passthrough',
            marker: passthroughPluginValidation[stagedPlugin],
        })
    }

    return required
}

function parseJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
        return null
    }
}

function getExpectedStageMetadata() {
    return {
        arch: process.env.ARCH ?? process.arch,
        electronVersion: vars.electronVersion,
    }
}

function getStageMetadataProblem() {
    const expected = getExpectedStageMetadata()
    if (!fs.existsSync(stageMetadataPath)) {
        return `stage metadata missing (expected arch=${expected.arch}, electron=${expected.electronVersion})`
    }

    const stagedMeta = parseJsonFile(stageMetadataPath)
    if (!stagedMeta) {
        return 'stage metadata invalid'
    }

    if (stagedMeta.arch !== expected.arch) {
        return `stage metadata arch mismatch (have ${stagedMeta.arch ?? 'unknown'}, expected ${expected.arch})`
    }

    if (stagedMeta.electronVersion !== expected.electronVersion) {
        return `stage metadata electron mismatch (have ${stagedMeta.electronVersion ?? 'unknown'}, expected ${expected.electronVersion})`
    }

    return null
}

function checkStaleMainEntrypoint({
    sourcePlugin,
    stagedPlugin,
    stagedPluginDir,
    stagedPkg,
}) {
    if (!stagedPkg?.main || !criticalMainPlugins.has(stagedPlugin)) {
        return null
    }

    const sourcePluginDir = path.join(repoRoot, sourcePlugin)
    const sourcePackagePath = path.join(sourcePluginDir, 'package.json')
    if (!fs.existsSync(sourcePackagePath)) {
        return null
    }

    const sourcePkg = parseJsonFile(sourcePackagePath)
    if (!sourcePkg?.main) {
        return null
    }

    const sourceMainPath = path.resolve(sourcePluginDir, sourcePkg.main)
    const stagedMainPath = path.resolve(stagedPluginDir, stagedPkg.main)

    if (!fs.existsSync(sourceMainPath) || !fs.existsSync(stagedMainPath)) {
        return null
    }

    try {
        const sourceMtime = fs.statSync(sourceMainPath).mtimeMs
        const stagedMtime = fs.statSync(stagedMainPath).mtimeMs
        if (sourceMtime > stagedMtime) {
            return `${stagedPlugin} (stale main: ${stagedPkg.main})`
        }
    } catch {
        return `${stagedPlugin} (could not compare main timestamps: ${stagedPkg.main})`
    }

    return null
}

function getPluginProblems() {
    if (!fs.existsSync(builtinPluginRoot)) {
        return getRequiredPlugins().map(({ stagedPlugin }) => `${stagedPlugin} (missing directory)`)
    }

    const problems = []
    const stageMetadataProblem = getStageMetadataProblem()
    if (stageMetadataProblem) {
        problems.push(stageMetadataProblem)
    }

    for (const requiredPlugin of getRequiredPlugins()) {
        const {
            sourcePlugin,
            stagedPlugin,
            mode,
            marker,
        } = requiredPlugin
        const stagedPluginDir = path.join(builtinPluginRoot, stagedPlugin)
        if (!fs.existsSync(stagedPluginDir)) {
            problems.push(`${stagedPlugin} (missing directory)`)
            continue
        }

        if (mode === 'passthrough') {
            if (marker && !fs.existsSync(path.join(stagedPluginDir, marker))) {
                problems.push(`${stagedPlugin} (missing marker: ${marker})`)
            }
            continue
        }

        const packagePath = path.join(stagedPluginDir, 'package.json')
        if (!fs.existsSync(packagePath)) {
            problems.push(`${stagedPlugin} (missing package.json)`)
            continue
        }

        const pkg = parseJsonFile(packagePath)
        if (!pkg) {
            problems.push(`${stagedPlugin} (invalid package.json)`)
            continue
        }

        if (pkg.main && criticalMainPlugins.has(stagedPlugin)) {
            const mainPath = path.resolve(stagedPluginDir, pkg.main)
            if (!fs.existsSync(mainPath)) {
                problems.push(`${stagedPlugin} (missing main: ${pkg.main})`)
                continue
            }

            try {
                if (fs.statSync(mainPath).size === 0) {
                    problems.push(`${stagedPlugin} (empty main: ${pkg.main})`)
                }
            } catch {
                problems.push(`${stagedPlugin} (unreadable main: ${pkg.main})`)
            }
        }

        const staleMainProblem = checkStaleMainEntrypoint({
            sourcePlugin,
            stagedPlugin,
            stagedPluginDir,
            stagedPkg: pkg,
        })
        if (staleMainProblem) {
            problems.push(staleMainProblem)
        }
    }

    return problems
}

export function ensureBuiltinPlugins() {
    const problemsBefore = getPluginProblems()
    if (!problemsBefore.length) {
        return
    }

    console.log(`Builtin plugin staging issues detected: ${problemsBefore.join(', ')}`)
    console.log('Running scripts/prepackage-plugins.mjs to repair builtin plugin staging...')

    execFileSync(process.execPath, [path.resolve(__dirname, 'prepackage-plugins.mjs')], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
    })

    const problemsAfter = getPluginProblems()
    if (problemsAfter.length) {
        throw new Error(`Builtin plugin staging is incomplete after prepackage step: ${problemsAfter.join(', ')}`)
    }
}
