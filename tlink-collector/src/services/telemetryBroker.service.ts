import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'
import { ProfilesService, TelemetryBroker, TelemetrySample, TelemetrySourceRef } from 'tlink-core'
import { CollectorProfile, CollectorSample } from '../api'
import { CollectorHandle, CollectorMockService } from './mock.service'
import { PrometheusCollectorService } from './prometheus.service'

const TEARDOWN_GRACE_MS = 500

interface ScrapeEntry {
    profileId: string
    handle: CollectorHandle
    /** Per-path fan-out. One Subject per path currently observed. */
    pathSubjects: Map<string, Subject<TelemetrySample>>
    /** Sum of ref counts across all pathSubjects for this profile. */
    totalRefCount: number
    graceTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Collector implementation of TelemetryBroker. Ref-counts per
 * `profileId` because one HTTP scrape loop (or mock timer) inherently
 * broadcasts every metric path it sees — paying for a second scrape
 * to isolate path demux would waste wire and clock cycles. Inside a
 * scrape entry, per-path Subjects fan samples out to each path's
 * observers.
 *
 * Session tabs in M4.2a still call the source service's
 * `start(profile)` directly — a live collector tab plus a dashboard
 * tile on the same profile will open TWO scrape timers for now.
 * M4.2b migrates the session tab to this broker.
 */
@Injectable({ providedIn: 'root' })
export class CollectorTelemetryBroker implements TelemetryBroker {
    private readonly scrapes = new Map<string, ScrapeEntry>()

    constructor (
        private readonly profiles: ProfilesService,
        private readonly mock: CollectorMockService,
        private readonly prometheus: PrometheusCollectorService,
    ) { }

    observe (ref: TelemetrySourceRef, path: string): Observable<TelemetrySample> {
        return new Observable<TelemetrySample>(subscriber => {
            let entry = this.scrapes.get(ref.profileId)
            if (!entry) {
                const pending: ScrapeEntry = {
                    profileId: ref.profileId,
                    handle: null as unknown as CollectorHandle,
                    pathSubjects: new Map(),
                    totalRefCount: 0,
                    graceTimer: null,
                }
                this.scrapes.set(ref.profileId, pending)
                entry = pending
                this.spawn(ref.profileId, pending)
                    .catch(err => {
                        // Surface the error on every pending path
                        // subject so observers that got in before the
                        // async start resolves see it.
                        for (const subj of pending.pathSubjects.values()) {
                            subj.error(err instanceof Error ? err : new Error(String(err)))
                        }
                        this.scrapes.delete(ref.profileId)
                    })
            }
            if (entry.graceTimer) {
                clearTimeout(entry.graceTimer)
                entry.graceTimer = null
            }

            let subj = entry.pathSubjects.get(path)
            if (!subj) {
                subj = new Subject<TelemetrySample>()
                entry.pathSubjects.set(path, subj)
            }
            entry.totalRefCount += 1
            const inner = subj.subscribe(subscriber)

            return () => {
                inner.unsubscribe()
                entry!.totalRefCount -= 1
                // Drop the per-path Subject when nothing is listening on
                // it anymore. Scrape loop stays alive as long as any
                // path is observed.
                if (subj!.observers.length === 0) {
                    entry!.pathSubjects.delete(path)
                }
                if (entry!.totalRefCount === 0) {
                    entry!.graceTimer = setTimeout(() => {
                        if (entry!.totalRefCount === 0) {
                            entry!.handle?.stop()
                            this.scrapes.delete(entry!.profileId)
                        }
                    }, TEARDOWN_GRACE_MS)
                }
            }
        })
    }

    private async spawn (profileId: string, entry: ScrapeEntry): Promise<void> {
        const list = await this.profiles.getProfiles({ includeBuiltin: true })
        const found = list.find(p => p.id === profileId && p.type === 'collector') as CollectorProfile | undefined
        if (!found) {
            throw new Error(`Collector profile not found: ${profileId}`)
        }
        const handle = found.options.source === 'mock'
            ? this.mock.start(found)
            : this.prometheus.start(found)
        entry.handle = handle
        handle.on('sample', (s: CollectorSample) => {
            const subj = entry.pathSubjects.get(s.path)
            if (subj) {
                subj.next({ timestampNs: s.timestampNs, value: s.value, kind: s.kind })
            }
        })
        handle.on('error', (err: Error) => {
            // Per-scrape errors are transient by contract (the source
            // service keeps the timer alive). Don't propagate to
            // observers — this would mimic a stream death to a tile
            // that's actually just seeing a flaky endpoint.
            // Logged inline so a debug build can surface them.
            // eslint-disable-next-line no-console
            console.warn(`[collector-broker] ${profileId}: ${err.message}`)
        })
    }
}
