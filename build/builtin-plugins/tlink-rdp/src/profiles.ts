import { Injectable } from '@angular/core'
import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider } from 'tlink-core'
import { RDPProfileSettingsComponent } from './components/rdpProfileSettings.component'
import { RDPTabComponent } from './components/rdpTab.component'
import { RDPProfile } from './api'

@Injectable({ providedIn: 'root' })
export class RDPProfilesService extends QuickConnectProfileProvider<RDPProfile> {
    id = 'rdp'
    name = 'RDP'
    supportsQuickConnect = true
    settingsComponent = RDPProfileSettingsComponent
    configDefaults = {
        behaviorOnSessionEnd: 'reconnect',
        clearServiceMessagesOnConnect: true,
        options: {
            host: null,
            port: 3389,
            user: '',
            password: null,
            domain: '',
            clientType: 'node-rdpjs', // Default client
            width: 1920,
            height: 1080,
            colorDepth: 24,
            enableAudio: true,
            enableClipboard: true,
            enablePrinting: false,
            enableDrives: false,
            enableWallpaper: true,
            enableThemes: true,
            enableFontSmoothing: true,
            enableDesktopComposition: true,
            enableNLA: true,
            enableTLS: true,
            ignoreCertificate: false,
            compression: true,
            bitmapCaching: true,
            customParams: '',
        },
    }

    constructor (private translate: TranslateService) { super() }

    async getBuiltinProfiles (): Promise<PartialProfile<RDPProfile>[]> {
        return [
            {
                id: 'rdp:template',
                type: 'rdp',
                name: this.translate.instant('RDP connection'),
                icon: 'fas fa-desktop',
                options: {
                    host: '',
                    port: 3389,
                    user: '',
                    width: 1920,
                    height: 1080,
                    colorDepth: 24,
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            },
        ]
    }

    async getNewTabParameters (profile: RDPProfile): Promise<NewTabParameters<RDPTabComponent>> {
        return {
            type: RDPTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName (profile: RDPProfile): string {
        const port = profile.options.port !== 3389 ? `:${profile.options.port}` : ''
        return profile.options.user 
            ? `${profile.options.user}@${profile.options.host}${port}`
            : `${profile.options.host}${port}`
    }

    getDescription (profile: PartialProfile<RDPProfile>): string {
        return profile.options?.host ?? ''
    }

    quickConnect (query: string): PartialProfile<RDPProfile> {
        let user: string | undefined = undefined
        let host = query
        let port = 3389

        if (host.includes('@')) {
            const parts = host.split(/@/g)
            host = parts[parts.length - 1]
            user = parts.slice(0, parts.length - 1).join('@')
        }

        if (host.includes('[')) {
            port = parseInt(host.split(']')[1].substring(1))
            host = host.split(']')[0].substring(1)
        } else if (host.includes(':')) {
            const parts = host.split(/:/g)
            if (parts.length === 2 && !parts[1].includes('/')) {
                port = parseInt(parts[1])
                host = parts[0]
            }
        }

        return {
            name: query,
            type: 'rdp',
            options: {
                host,
                port,
                user: user ?? '',
                width: 1920,
                height: 1080,
                colorDepth: 24,
            },
        }
    }

    intoQuickConnectString (profile: RDPProfile): string | null {
        let s = profile.options.host
        if (profile.options.user) {
            s = `${profile.options.user}@${s}`
        }
        if (profile.options.port !== 3389) {
            s = `${s}:${profile.options.port}`
        }
        return s
    }
}

