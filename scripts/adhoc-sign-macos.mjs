import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'

const execFileAsync = promisify(execFile)

async function hasSigningIdentity (identity) {
    if (!identity) {
        return false
    }
    try {
        const { stdout } = await execFileAsync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'])
        return stdout.includes(identity)
    } catch {
        return false
    }
}

async function isSignatureValid (appPath) {
    try {
        await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
        return true
    } catch {
        return false
    }
}

function assertFileExists (filePath, description) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${description} is missing: ${filePath}`)
    }
}

function validateBundledStudioAssets (appPath) {
    const resourcesPath = path.join(appPath, 'Contents', 'Resources')
    const corePluginPath = path.join(resourcesPath, 'builtin-plugins', 'tlink-core')
    const corePackagePath = path.join(corePluginPath, 'package.json')

    assertFileExists(corePackagePath, 'Tlink Studio core plugin package')

    let coreMainRelative = 'dist/index.js'
    try {
        const pkg = JSON.parse(fs.readFileSync(corePackagePath, 'utf8'))
        if (typeof pkg?.main === 'string' && pkg.main.trim()) {
            coreMainRelative = pkg.main
        }
    } catch {
        // Keep default when package metadata cannot be parsed.
    }
    assertFileExists(path.join(corePluginPath, coreMainRelative), 'Tlink Studio core plugin entrypoint')

    const monacoPath = path.join(resourcesPath, 'assets', 'monaco')
    assertFileExists(path.join(monacoPath, 'vs', 'loader.js'), 'Monaco loader')
    assertFileExists(path.join(monacoPath, 'vs', 'editor', 'editor.main.js'), 'Monaco editor bundle')
}

function validateBundledNativeModules (appPath) {
    const resourcesPath = path.join(appPath, 'Contents', 'Resources')
    const keytarNodePath = path.join(resourcesPath, 'node_modules', 'keytar', 'build', 'Release', 'keytar.node')
    assertFileExists(keytarNodePath, 'keytar native module')
}

export default async function afterPack (context) {
    if (context.electronPlatformName !== 'darwin') {
        return
    }

    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    if (!fs.existsSync(appPath)) {
        return
    }

    validateBundledStudioAssets(appPath)
    validateBundledNativeModules(appPath)

    const identity = context.packager?.platformSpecificBuildOptions?.identity
    if (identity && await hasSigningIdentity(identity)) {
        return
    }

    const packager = context.packager
    const configuredFuses = packager?.config?.electronFuses
    if (configuredFuses) {
        console.log('No valid signing identity found, disabling electronFuses for ad-hoc signing')
        packager.config.electronFuses = undefined
    }

    if (configuredFuses) {
        const canApplyFuses = typeof packager?.generateFuseConfig === 'function' && typeof packager?.addElectronFuses === 'function'
        if (canApplyFuses) {
            console.log('Applying electronFuses before ad-hoc signing')
            const fuseConfig = packager.generateFuseConfig(configuredFuses)
            await packager.addElectronFuses(context, fuseConfig)
        } else {
            console.log('Skipping electronFuses, required packager hooks are unavailable')
        }
    }

    if (!await isSignatureValid(appPath)) {
        console.log('No valid signing identity found, applying ad-hoc signature')
        await execFileAsync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath])
    }
}
