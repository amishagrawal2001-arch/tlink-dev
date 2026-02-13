import * as fs from 'fs'
import * as path from 'path'
import { Injectable } from '@angular/core'
import { HostAppService, Platform } from 'tlink-core'

import { ShellProvider, Shell } from 'tlink-local'
import { ElectronService } from '../services/electron.service'

/**
 * Provides a Fish shell backed by a binary shipped inside the app bundle:
 * - Packaged:   <resources>/extras/fish/<platform>/fish
 * - Dev mode:   <repo>/extras/fish/<platform>/fish
 *
 * Note: The actual fish binary is not part of the repo. See `extras/fish/README.txt`.
 */
@Injectable()
export class BundledFishShellProvider extends ShellProvider {
    constructor (
        private hostApp: HostAppService,
        private electron: ElectronService,
    ) {
        super()
    }

    async provide (): Promise<Shell[]> {
        if (this.hostApp.platform === Platform.Windows) {
            // Fish isn't typically a native Windows shell; users can still use WSL/MSYS2 shells instead.
            return []
        }

        const binary = this.findBundledFishBinary()
        if (!binary) {
            return []
        }

        return [{
            id: 'fish-bundled',
            name: 'Fish (bundled)',
            command: binary,
            args: ['-l'],
            env: {},
        }]
    }

    private findBundledFishBinary (): string|null {
        const platformDir =
            this.hostApp.platform === Platform.macOS
                ? 'mac'
                : 'linux'

        const candidates: string[] = []

        const resourcesPath =
            (this.electron.process as any)?.resourcesPath
            ?? (process as any).resourcesPath

        if (!process.env.TLINK_DEV && resourcesPath) {
            candidates.push(path.join(resourcesPath, 'extras', 'fish', platformDir, 'fish'))
        }

        // Dev layout: app/ is the Electron app root, extras/ is at repo root
        const devBase = path.join(this.electron.app.getAppPath(), '..', 'extras', 'fish', platformDir, 'fish')
        candidates.push(devBase)

        for (const candidate of candidates) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                try {
                    fs.chmodSync(candidate, 0o755)
                } catch {
                    // ignore
                }
                return candidate
            }
        }
        return null
    }
}


