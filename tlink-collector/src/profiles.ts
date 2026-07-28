import { Injectable } from '@angular/core'
import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider } from 'tlink-core'
import { CollectorProfileSettingsComponent } from './components/collectorProfileSettings.component'
import { CollectorSessionTabComponent } from './components/collectorSessionTab.component'
import { CollectorProfile } from './api'

/**
 * Registers 'collector' as a first-class profile type. Separate from
 * gNMI because collectors (Prometheus, Telegraf, InfluxDB) work by
 * scraping / querying pre-collected metrics rather than subscribing
 * to a device — different config surface, different lifecycle, worth
 * different profile.
 */
@Injectable({ providedIn: 'root' })
export class CollectorProfilesService extends QuickConnectProfileProvider<CollectorProfile> {
    id = 'collector'
    name = 'Collector'
    supportsQuickConnect = true
    settingsComponent = CollectorProfileSettingsComponent
    configDefaults = {
        icon: 'fas fa-database',
        options: {
            source: 'mock',
            scrapeIntervalSec: 10,
            mock: { hostCount: 5, scenario: 'idle' },
            url: null,
            username: '',
            password: null,
            bearerToken: null,
            insecureTls: false,
            metricFilter: null,
        },
    }

    constructor (private translate: TranslateService) { super() }

    async getBuiltinProfiles (): Promise<PartialProfile<CollectorProfile>[]> {
        return [
            {
                id: 'collector:mock-template',
                type: 'collector',
                name: this.translate.instant('Mock metrics source'),
                icon: 'fas fa-flask',
                options: {
                    source: 'mock',
                    scrapeIntervalSec: 5,
                    mock: { hostCount: 5, scenario: 'idle' },
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            },
            {
                id: 'collector:prometheus-template',
                type: 'collector',
                name: this.translate.instant('Prometheus / Telegraf endpoint'),
                icon: 'fas fa-database',
                options: {
                    source: 'prometheus',
                    scrapeIntervalSec: 15,
                    url: '',
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            },
        ]
    }

    async getNewTabParameters (profile: CollectorProfile): Promise<NewTabParameters<CollectorSessionTabComponent>> {
        return {
            type: CollectorSessionTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName (profile: CollectorProfile): string {
        return this.getDescription(profile)
    }

    /**
     * Description shown in profile lists — mock says "mock (Nx idle)";
     * prometheus says "prom → host". Optimized to be greppable in a
     * long profile list.
     */
    getDescription (profile: PartialProfile<CollectorProfile>): string {
        const src: string = profile.options?.source ?? 'mock'
        if (src === 'mock') {
            const m = profile.options?.mock
            return `mock · ${m?.hostCount ?? 5}× ${m?.scenario ?? 'idle'}`
        }
        if (src === 'prometheus') {
            const u = profile.options?.url ?? '?'
            try { return `prom · ${new URL(u).host}` } catch { return `prom · ${u}` }
        }
        return src
    }

    /**
     * QuickConnect accepts a URL — infers Prometheus source. Bare
     * "mock" launches a default mock target. Everything else null
     * so the caller falls through.
     */
    quickConnect (query: string): PartialProfile<CollectorProfile> | null {
        const q = query.trim()
        if (!q) { return null }
        if (q.toLowerCase() === 'mock') {
            return {
                name: 'mock target',
                type: 'collector',
                icon: 'fas fa-flask',
                options: { source: 'mock', scrapeIntervalSec: 5, mock: { hostCount: 5, scenario: 'idle' } },
            }
        }
        if (/^https?:\/\//i.test(q)) {
            try {
                const url = new URL(q)
                return {
                    name: url.host,
                    type: 'collector',
                    icon: 'fas fa-database',
                    options: { source: 'prometheus', scrapeIntervalSec: 15, url: q },
                }
            } catch { /* fall through */ }
        }
        return null
    }

    intoQuickConnectString (profile: CollectorProfile): string | null {
        const src: string = profile.options.source
        if (src === 'mock') { return 'mock' }
        if (src === 'prometheus') { return profile.options.url ?? null }
        return null
    }
}
