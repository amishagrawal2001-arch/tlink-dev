import { Injectable } from '@angular/core'
import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider } from 'tlink-core'
import { GnmiProfileSettingsComponent } from './components/gnmiProfileSettings.component'
import { GnmiSessionTabComponent } from './components/gnmiSessionTab.component'
import { GnmiProfile } from './api'

/**
 * Registers `gnmi` as a first-class profile type alongside SSH / RDP.
 *
 * The provider's job is threefold:
 *   1. Tell the Profiles UI what to render when the user picks
 *      "New profile → gNMI target" — that's `settingsComponent`.
 *   2. Provide default values for a fresh target — `configDefaults`.
 *      Kept in sync with `GnmiConfigProvider` in ../config.ts.
 *   3. Turn a saved target into a tab on Connect — currently opens
 *      the M2.1 placeholder; M2.2 will swap in the real live view.
 */
@Injectable({ providedIn: 'root' })
export class GnmiProfilesService extends QuickConnectProfileProvider<GnmiProfile> {
    id = 'gnmi'
    name = 'gNMI'
    supportsQuickConnect = true
    settingsComponent = GnmiProfileSettingsComponent
    configDefaults = {
        options: {
            host: null,
            port: null,
            username: '',
            password: null,
            security: 'tls',
            encoding: 'JSON_IETF',
            vendor: 'other',
            timeoutMs: 10_000,
            caCertPath: null,
            clientCertPath: null,
            clientKeyPath: null,
            tlsServerName: null,
        },
    }

    constructor (private translate: TranslateService) { super() }

    /**
     * Seed the "New profile" list with a gNMI template so users find
     * this without knowing to type "gnmi" in the QuickConnect field.
     * Same convention every other profile type uses (see tlink-rdp).
     */
    async getBuiltinProfiles (): Promise<PartialProfile<GnmiProfile>[]> {
        return [
            {
                id: 'gnmi:template',
                type: 'gnmi',
                name: this.translate.instant('gNMI target'),
                icon: 'fas fa-satellite-dish',
                options: {
                    host: '',
                    port: 6030,
                    username: '',
                    security: 'tls',
                    encoding: 'JSON_IETF',
                    vendor: 'other',
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            },
        ]
    }

    async getNewTabParameters (profile: GnmiProfile): Promise<NewTabParameters<GnmiSessionTabComponent>> {
        return {
            type: GnmiSessionTabComponent,
            inputs: { profile },
        }
    }

    /**
     * The label shown on the profile card and the tab title. We prefer
     * "user@host:port" when a username is set (matches SSH convention),
     * falling back to "host:port" for anonymous / cert-only setups.
     */
    getSuggestedName (profile: GnmiProfile): string {
        return this.getDescription(profile)
    }

    /**
     * Human-readable description shown alongside the profile name in
     * lists. Same shape as SSH/RDP: user@host:port when we have a
     * user, host:port otherwise.
     */
    getDescription (profile: PartialProfile<GnmiProfile>): string {
        const port = profile.options?.port ? `:${profile.options.port}` : ''
        const host = profile.options?.host ?? '?'
        return profile.options?.username
            ? `${profile.options.username}@${host}${port}`
            : `${host}${port}`
    }

    /**
     * Parse a QuickConnect string into a fresh gNMI profile.
     * Accepted shapes:
     *   host                              → port stays null (must edit)
     *   host:port                         → both set
     *   user@host:port                    → user + host + port
     *   scheme://user@host:port           → scheme prefix stripped
     * Returns null for anything that doesn't look at least host-shaped;
     * the caller then falls through to the next provider.
     */
    quickConnect (query: string): PartialProfile<GnmiProfile> | null {
        let q = query.trim()
        if (!q) { return null }
        // Strip an optional scheme like `gnmi://` so pasted URIs still
        // work — we only support gNMI here so the scheme carries no
        // extra information.
        q = q.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')

        let username = ''
        const at = q.indexOf('@')
        if (at >= 0) {
            username = q.slice(0, at)
            q = q.slice(at + 1)
        }

        let host = q
        let port: number | undefined = undefined
        const colon = q.lastIndexOf(':')
        if (colon > 0) {
            const maybePort = Number(q.slice(colon + 1))
            if (Number.isInteger(maybePort) && maybePort > 0 && maybePort < 65536) {
                host = q.slice(0, colon)
                port = maybePort
            }
        }
        if (!host) { return null }

        return {
            name: username ? `${username}@${host}` : host,
            type: 'gnmi',
            options: {
                host,
                port,
                username,
                security: 'tls',
                encoding: 'JSON_IETF',
                vendor: 'other',
            },
        }
    }

    /**
     * Serialize a profile back into the compact QuickConnect string
     * so the user can save it back to the tab bar. Inverse of
     * quickConnect(). Returns null when we don't have enough to
     * reconstruct — QuickConnect is best-effort.
     */
    intoQuickConnectString (profile: GnmiProfile): string | null {
        if (!profile.options.host) { return null }
        const port = profile.options.port ? `:${profile.options.port}` : ''
        return profile.options.username
            ? `${profile.options.username}@${profile.options.host}${port}`
            : `${profile.options.host}${port}`
    }
}
