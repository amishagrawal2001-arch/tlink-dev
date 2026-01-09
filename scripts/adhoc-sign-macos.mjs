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

export default async function afterPack (context) {
    if (context.electronPlatformName !== 'darwin') {
        return
    }

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

    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    if (!fs.existsSync(appPath)) {
        return
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
