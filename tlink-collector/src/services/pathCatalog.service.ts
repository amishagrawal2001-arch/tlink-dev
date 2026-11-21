import { Injectable } from '@angular/core'
import { ProfilesService, TelemetrySourceRef } from 'tlink-core'
import { CollectorProfile } from '../api'
import { CollectorTelemetryBroker } from './telemetryBroker.service'

/**
 * Catalog of metric paths for a collector profile. Unlike the gNMI
 * catalog (a curated, static list of common OpenConfig paths), a
 * collector profile has no fixed universe — paths are whatever the
 * scraped endpoint emits. So the catalog here is dynamic:
 *
 *   - `starredFor(profileId)` reads the user's starred list from the
 *     profile config. Instant, no network.
 *   - `observedFor(profileId, windowMs)` opens a brief observeAll()
 *     window on the broker, collects the distinct paths seen in that
 *     window, then closes the subscription. Uses the broker's
 *     existing ref count — opens the scrape if nothing else is
 *     observing it and tears down as soon as we unsubscribe.
 *
 * M4.3 (dashboards editor): consumed by the collector path picker in
 * the dashboard editor. Returns starred paths immediately; observed
 * paths stream in as the scrape cycles.
 */
@Injectable({ providedIn: 'root' })
export class CollectorPathCatalogService {
    constructor (
        private readonly profiles: ProfilesService,
        private readonly broker: CollectorTelemetryBroker,
    ) { }

    /** Starred paths for a profile. Empty array if the profile has none or doesn't exist. */
    async starredFor (profileId: string): Promise<string[]> {
        const list = await this.profiles.getProfiles({ includeBuiltin: true })
        const found = list.find(p => p.id === profileId && p.type === 'collector') as CollectorProfile | undefined
        return found?.options.starredPaths ? [...found.options.starredPaths] : []
    }

    /**
     * Observe a profile's scrape stream for `windowMs` milliseconds
     * and return the distinct paths seen. The picker uses this as a
     * live-discovery fallback alongside the instant starred list.
     *
     * Default window is 3 seconds — long enough to catch a scrape
     * cycle on a 1-s or 2-s interval, short enough that the picker
     * doesn't feel laggy. For slow scrapes (10+ seconds) the picker
     * shows "no observed paths yet" and users fall back to starred
     * or hand-typed paths.
     */
    observedFor (profileId: string, windowMs = 3000): Promise<string[]> {
        const ref: TelemetrySourceRef = { kind: 'collector', profileId }
        return new Promise(resolve => {
            const seen = new Set<string>()
            const sub = this.broker.observeAll(ref).subscribe({
                next: s => { if (s.path) { seen.add(s.path) } },
                error: () => {
                    sub.unsubscribe()
                    resolve([...seen])
                },
            })
            setTimeout(() => {
                sub.unsubscribe()
                resolve([...seen])
            }, windowMs)
        })
    }
}
