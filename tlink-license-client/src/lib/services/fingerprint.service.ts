import { Injectable } from '@angular/core'

/**
 * Thrown when a native platform refuses to surface its machine identity
 * (ioreg / /etc/machine-id / HKLM\...\MachineGuid). Callers should treat
 * this as a terminal condition for license operations: without a stable
 * machine-root identifier the hash we'd compute is just `platform|arch`,
 * which collides across every user on the same OS.
 *
 * `supportCode` is a short per-run token the user can paste to support so
 * ops can correlate client telemetry without us having to dump the
 * underlying error message into the UI.
 */
export class FingerprintUnavailableError extends Error {
    readonly reason: string
    readonly supportCode: string

    constructor (reason: string, supportCode: string) {
        super(`Machine identity unavailable (${reason}). Support code: ${supportCode}`)
        this.name = 'FingerprintUnavailableError'
        this.reason = reason
        this.supportCode = supportCode
    }
}

/**
 * Produces a stable per-machine hash that the license server treats as
 * `device_fingerprint_hash`.
 *
 * Composition (post-stability-pass):
 *   SHA256(machineUuid | platform | arch)
 *
 * The raw inputs never leave the machine. The MAC, hostname and
 * `os.release()` that older builds mixed into the hash are deliberately
 * excluded — each of them drifts under legitimate conditions (Thunderbolt
 * dock plug, hostname rename, kernel point release) and would false-lock
 * the user out of a license they own. Those fields still travel to the
 * server as advisory metadata on activate/refresh (`mac_address`,
 * `platform`, `os_version`) for the fraud dashboard.
 *
 * `getLegacy()` returns the pre-upgrade composition so `verifyOfflineBlob`
 * can accept offline blobs minted against the old hash during the
 * rollover window.
 */
@Injectable({ providedIn: 'root' })
export class FingerprintService {
    private cached: string | null = null

    async get (): Promise<string> {
        if (this.cached) {return this.cached}

        const os = this.tryRequire<typeof import('os')>('os')
        const crypto = this.tryRequire<typeof import('crypto')>('crypto')
        if (!os || !crypto) {
            // Non-electron context (design-time Storybook / unit tests).
            // The native app always has `os` + `crypto`, so this branch
            // only fires in environments that will never talk to the real
            // license server. A per-profile random id is good enough to
            // keep component tests deterministic.
            this.cached = this.browserFallback()
            return this.cached
        }

        const machineUuid = await this.readMachineUuid()
        if (!machineUuid) {
            // Audit #13: no silent degradation. Previous behaviour was to
            // fall back to MAC|hostname|platform|arch when the machine
            // UUID lookup failed, which is both weaker (hostname/MAC are
            // user-rotatable) and silent (ops couldn't tell the user was
            // running on a degraded fingerprint). Refuse to produce one.
            throw new FingerprintUnavailableError(
                this.machineUuidFailureReason(),
                this.generateSupportCode(),
            )
        }

        const parts = [machineUuid, os.platform(), os.arch()]
        this.cached = crypto.createHash('sha256').update(parts.join('|')).digest('hex')
        return this.cached
    }

    /**
     * Pre-stability-pass composition. Only used by `verifyOfflineBlob`
     * when the primary fingerprint mismatches — it's a fallback that
     * keeps users with existing offline blobs working through the
     * rollover. Returns null in non-native contexts or if no component
     * was readable (nothing to fall back to).
     */
    async getLegacy (): Promise<string | null> {
        const os = this.tryRequire<typeof import('os')>('os')
        const crypto = this.tryRequire<typeof import('crypto')>('crypto')
        if (!os || !crypto) {return null}

        const parts: string[] = [
            await this.readMachineUuid(),
            this.primaryMac(os),
            os.hostname() || '',
            os.platform(),
            os.arch(),
        ].filter(Boolean)

        if (!parts.length) {return null}
        return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
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
            // Fall through — the error cause is captured by
            // machineUuidFailureReason() when the caller decides what to
            // surface. We lose the underlying errno text, but the support
            // code pattern lets ops correlate without it.
        }
        return ''
    }

    private machineUuidFailureReason (): string {
        const { platform } = process
        if (platform === 'darwin') {
            return 'ioreg IOPlatformUUID unreadable (restricted by MDM / sandbox?)'
        }
        if (platform === 'linux') {
            return '/etc/machine-id and /var/lib/dbus/machine-id both missing or unreadable'
        }
        if (platform === 'win32') {
            return 'HKLM\\SOFTWARE\\Microsoft\\Cryptography\\MachineGuid unreadable'
        }
        return `unsupported platform (${platform})`
    }

    private generateSupportCode (): string {
        // Short, human-readable. Not a secret and not stable across runs —
        // it exists purely so a user can paste something ops can grep for
        // in the renderer log.
        const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
        return `F-${rand}`
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
