import { Injectable } from '@angular/core'
import * as path from 'path'
import * as fs from 'fs'
import { LogService, Logger } from 'tlink-core'

/**
 * Locate the bundled `gnmic` binary. Mirrors the pattern used by
 * `tlink-rdp/src/services/rdp.service.ts` for `xfreerdp`:
 *
 *   1. In packaged builds Electron sets `process.resourcesPath` to
 *      the .app bundle's Contents/Resources; we check
 *      `${resourcesPath}/extras/gnmic/{platform}/gnmic[.exe]`.
 *   2. In dev (TLINK_DEV=1) we walk up from the app dir to the repo
 *      root and check `extras/gnmic/{platform}/gnmic[.exe]`.
 *   3. As a final courtesy fallback we honor `PATH` — engineers who
 *      already have `gnmic` in their $PATH from `brew install gnmic`
 *      can iterate without waiting on the bundling pipeline.
 *
 * Kept as its own service (not folded into GnmiService) so the
 * discovery cache is shared across every gnmi session and the
 * fallback logic has a single place to grow when we add signed-
 * binary verification in M1.6.
 */
@Injectable({ providedIn: 'root' })
export class GnmicDiscoveryService {
    private logger: Logger
    /** Resolved absolute path to gnmic, or null when nothing was found. */
    private cachedPath: string | null | undefined = undefined

    constructor (
        log: LogService,
    ) {
        this.logger = log.create('gnmic-discovery')
    }

    /**
     * Return the absolute path to the gnmic binary, or null when we
     * couldn't find one. Result is cached for the lifetime of the
     * renderer process — restart tlink to re-probe after installing.
     */
    getGnmicPath (): string | null {
        if (this.cachedPath !== undefined) {
            return this.cachedPath
        }
        this.cachedPath = this.locate()
        if (this.cachedPath) {
            this.logger.info(`located gnmic at ${this.cachedPath}`)
        } else {
            this.logger.warn('gnmic not found — bundle missing and not on PATH')
        }
        return this.cachedPath
    }

    private locate (): string | null {
        const exeName = process.platform === 'win32' ? 'gnmic.exe' : 'gnmic'
        const platformDir = this.platformDirName()

        const candidates: string[] = []

        // 1. Packaged app bundle.
        const resourcesPath: string | undefined = (process as any).resourcesPath
        if (resourcesPath) {
            candidates.push(path.join(resourcesPath, 'extras', 'gnmic', platformDir, exeName))
        }

        // 2. Repo root during dev — TLINK_DEV=1 launches from the repo
        //    root, so extras/gnmic/… is a direct relative lookup.
        //    Also probe the parent directory to cover the electron `app/`
        //    subdirectory launch case.
        const cwd = process.cwd()
        candidates.push(path.join(cwd, 'extras', 'gnmic', platformDir, exeName))
        candidates.push(path.join(cwd, '..', 'extras', 'gnmic', platformDir, exeName))

        for (const candidate of candidates) {
            try {
                if (fs.existsSync(candidate)) {
                    return candidate
                }
            } catch {
                // Bundled-binary discovery must never throw — a stat
                // failure on one candidate shouldn't stop us checking
                // the rest.
            }
        }

        // 3. PATH fallback — good enough for dev machines with
        //    `brew install gnmic` / `apt install gnmic`.
        const pathEnv = process.env.PATH ?? ''
        const sep = process.platform === 'win32' ? ';' : ':'
        for (const dir of pathEnv.split(sep).filter(Boolean)) {
            const candidate = path.join(dir, exeName)
            try {
                if (fs.existsSync(candidate)) {
                    return candidate
                }
            } catch { /* skip */ }
        }

        return null
    }

    /**
     * Map Node's process.platform + arch to the extras/ subdirectory
     * layout we ship. Kept parallel to fetch-gnmic.mjs so both sides
     * agree on where the binary lives.
     */
    private platformDirName (): string {
        if (process.platform === 'darwin') {
            return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
        }
        if (process.platform === 'win32') {
            return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64'
        }
        if (process.platform === 'linux') {
            if (process.arch === 'arm64') { return 'linux-arm64' }
            if (process.arch === 'arm') { return 'linux-armv7' }
            return 'linux-x64'
        }
        return `${process.platform}-${process.arch}`
    }
}
