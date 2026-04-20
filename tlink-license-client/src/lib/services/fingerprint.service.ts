import { Injectable } from '@angular/core'

/**
 * Produces a stable per-machine hash that the license server treats as
 * `device_fingerprint_hash`. We combine whatever cross-platform identifiers
 * we can read without adding runtime deps:
 *   - platform-specific machine UUID (ioreg / /etc/machine-id / registry)
 *   - primary non-loopback MAC address
 *   - os.hostname(), platform, arch
 *
 * SHA256'd so the raw identifiers never leave the machine. Cached in memory
 * after the first compute — it doesn't change for the life of the process.
 */
@Injectable({ providedIn: 'root' })
export class FingerprintService {
    private cached: string | null = null

    async get (): Promise<string> {
        if (this.cached) {return this.cached}

        const os = this.tryRequire<typeof import('os')>('os')
        const crypto = this.tryRequire<typeof import('crypto')>('crypto')
        if (!os || !crypto) {
            // Non-electron / non-node context: fall back to a per-profile random
            // id so at least fingerprint stability within this browser holds.
            this.cached = this.browserFallback()
            return this.cached
        }

        const parts: string[] = [
            await this.readMachineUuid(),
            this.primaryMac(os),
            os.hostname() || '',
            os.platform(),
            os.arch(),
        ].filter(Boolean)

        this.cached = crypto.createHash('sha256').update(parts.join('|')).digest('hex')
        return this.cached
    }

    private tryRequire<T> (name: string): T | null {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return (window as any).require ? (window as any).require(name) : require(name)
        } catch {
            return null
        }
    }

    private async readMachineUuid (): Promise<string> {
        const cp = this.tryRequire<typeof import('child_process')>('child_process')
        const fs = this.tryRequire<typeof import('fs')>('fs')
        const { platform } = process
        try {
            if (platform === 'darwin' && cp) {
                const out = cp.execSync('ioreg -rd1 -c IOPlatformExpertDevice').toString()
                const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)
                return m ? m[1] : ''
            }
            if (platform === 'linux' && fs) {
                for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
                    if (fs.existsSync(p)) {return fs.readFileSync(p, 'utf8').trim()}
                }
                return ''
            }
            if (platform === 'win32' && cp) {
                const out = cp.execSync(
                    'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
                ).toString()
                const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(out)
                return m ? m[1] : ''
            }
        } catch {
            // Fall through — any missing cmd / permission error just loses that
            // input; the remaining parts are still enough for a stable hash.
        }
        return ''
    }

    private primaryMac (os: typeof import('os')): string {
        const ifaces = os.networkInterfaces()
        for (const name of Object.keys(ifaces)) {
            for (const iface of ifaces[name] ?? []) {
                if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
                    return iface.mac
                }
            }
        }
        return ''
    }

    private browserFallback (): string {
        const key = 'tlink_fp_browser_fallback'
        let v = localStorage.getItem(key)
        if (!v) {
            v = 'browser-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
            localStorage.setItem(key, v)
        }
        return v
    }

    /** Also surface a few metadata fields the server records on activation. */
    getPlatform (): 'macos' | 'windows' | 'linux' | 'unknown' {
        const p = typeof process !== 'undefined' ? process.platform : ''
        if (p === 'darwin') {return 'macos'}
        if (p === 'win32') {return 'windows'}
        if (p === 'linux') {return 'linux'}
        return 'unknown'
    }

    getOsVersion (): string {
        const os = this.tryRequire<typeof import('os')>('os')
        return os ? os.release() : ''
    }

    getPrimaryMac (): string {
        const os = this.tryRequire<typeof import('os')>('os')
        return os ? this.primaryMac(os) : ''
    }
}
