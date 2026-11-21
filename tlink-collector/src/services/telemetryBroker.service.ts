import { Injectable } from '@angular/core'
import { EMPTY, Observable, Subject } from 'rxjs'
import { PathedSample, ProfilesService, TelemetryBroker, TelemetrySample, TelemetrySourceRef } from 'tlink-core'
import { CollectorProfile, CollectorSample } from '../api'
import { CollectorHandle, CollectorMockService } from './mock.service'
import { PrometheusCollectorService } from './prometheus.service'

const TEARDOWN_GRACE_MS = 500

interface ScrapeEntry {
    profileId: string
    handle: CollectorHandle
    /** Per-path fan-out. One Subject per path currently observed. */
    pathSubjects: Map<string, Subject<TelemetrySample>>
    /**
     * Upstream profile-level stream. Emits every sample from this
     * scrape, with path, so a consumer (session tab) that wants the
     * full fire-hose doesn't need to materialize per-path observers.
     * Fed in parallel with `pathSubjects` — same sample, two channels.
     */
    profileSubject: Subject<PathedSample>
    /**
     * Sibling error channel — see `TelemetryBroker.observeErrors`.
     * Profile-scoped; `observeErrors(ref, _path)` returns this
     * regardless of path (scrape errors aren't per-path for
     * collector). Scrape loop stays alive across errors, so this
     * never terminates the sample Subjects.
     */
    errors: Subject<Error>
    /** Sum of ref counts across all pathSubjects for this profile. */
    totalRefCount: number
    /** Separate ref count for profile-level `observeAll` subscribers. */
    allRefCount: number
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
 * M4.2b: added `observeAll()` for session tabs that want the whole
 * profile stream, plus `observeErrors()` for scrape-level errors
 * decoupled from sample Subjects. Scrape stays alive if either
 * ref count (totalRefCount or allRefCount) is non-zero.
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
            const entry = this.ensureEntry(ref.profileId)

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
                entry.totalRefCount -= 1
                // Drop the per-path Subject when nothing is listening on
                // it anymore. Scrape loop stays alive as long as any
                // path OR an `observeAll` subscriber is observed.
                // eslint-disable-next-line deprecation/deprecation
                if (subj!.observers.length === 0) {
                    entry.pathSubjects.delete(path)
                }
                this.maybeScheduleTeardown(entry)
            }
        })
    }

    observeAll (ref: TelemetrySourceRef): Observable<PathedSample> {
        return new Observable<PathedSample>(subscriber => {
            const entry = this.ensureEntry(ref.profileId)

            if (entry.graceTimer) {
                clearTimeout(entry.graceTimer)
                entry.graceTimer = null
            }
            entry.allRefCount += 1
            const inner = entry.profileSubject.subscribe(subscriber)

            return () => {
                inner.unsubscribe()
                entry.allRefCount -= 1
                this.maybeScheduleTeardown(entry)
            }
        })
    }

    observeErrors (ref: TelemetrySourceRef, _path: string): Observable<Error> {
        const entry = this.scrapes.get(ref.profileId)
        if (!entry) { return EMPTY }
        return entry.errors.asObservable()
    }

    private ensureEntry (profileId: string): ScrapeEntry {
        const existing = this.scrapes.get(profileId)
        if (existing) { return existing }

        const entry: ScrapeEntry = {
            profileId,
            handle: null as unknown as CollectorHandle,
            pathSubjects: new Map(),
            profileSubject: new Subject<PathedSample>(),
            errors: new Subject<Error>(),
            totalRefCount: 0,
            allRefCount: 0,
            graceTimer: null,
        }
        this.scrapes.set(profileId, entry)
        this.spawn(profileId, entry)
            .catch(err => {
                const e = err instanceof Error ? err : new Error(String(err))
                // Surface the error on every observer channel so
                // whoever's listening (per-path, profile-level,
                // errors) sees it. Per-path and profile subjects
                // complete after — the scrape never started.
                entry.errors.next(e)
                for (const subj of entry.pathSubjects.values()) { subj.complete() }
                entry.profileSubject.complete()
                this.scrapes.delete(profileId)
            })
        return entry
    }

    private maybeScheduleTeardown (entry: ScrapeEntry): void {
        if (entry.totalRefCount > 0 || entry.allRefCount > 0) { return }
        entry.graceTimer = setTimeout(() => {
            if (entry.totalRefCount === 0 && entry.allRefCount === 0) {
                entry.handle?.stop()
                this.scrapes.delete(entry.profileId)
            }
        }, TEARDOWN_GRACE_MS)
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
            const sample: TelemetrySample = { timestampNs: s.timestampNs, value: s.value, kind: s.kind }
            const subj = entry.pathSubjects.get(s.path)
            if (subj) {
                subj.next(sample)
            }
            entry.profileSubject.next({ ...sample, path: s.path })
        })
        handle.on('error', (err: Error) => {
            // Per-scrape errors are transient by contract (the source
            // service keeps the timer alive). Forward to the sibling
            // error channel so session tabs can surface them without
            // the sample Subjects terminating.
            entry.errors.next(err)
            // eslint-disable-next-line no-console
            console.warn(`[collector-broker] ${profileId}: ${err.message}`)
        })
    }
}
