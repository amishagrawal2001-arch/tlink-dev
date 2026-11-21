import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'
import { ProfilesService, TelemetryBroker, TelemetrySample, TelemetrySourceRef } from 'tlink-core'
import { GnmiProfile } from '../api'
import { GnmiService, GnmiSubscribeHandle } from './gnmi.service'

const DEFAULT_MODE = 'STREAM' as const
const DEFAULT_STREAM_MODE = 'SAMPLE' as const
const DEFAULT_INTERVAL_SEC = 10
const TEARDOWN_GRACE_MS = 500

interface StreamEntry {
    key: string
    handle: GnmiSubscribeHandle
    subject: Subject<TelemetrySample>
    refCount: number
    graceTimer: ReturnType<typeof setTimeout> | null
}

/**
 * gNMI implementation of TelemetryBroker. Ref-counts on the full
 * subscription identity `(profileId, path, mode, streamMode,
 * sampleIntervalSec)` because each distinct tuple maps to a distinct
 * `gnmic` subprocess. Two tiles on the same path at different
 * intervals legitimately spawn two subscriptions.
 *
 * Session tabs in M4.2a still call `gnmi.subscribe()` directly — a
 * live tab plus a dashboard tile on the same tuple will spawn TWO
 * subprocesses for now. M4.2b migrates session tabs to this broker
 * so they share one.
 */
@Injectable({ providedIn: 'root' })
export class GnmiTelemetryBroker implements TelemetryBroker {
    private readonly streams = new Map<string, StreamEntry>()

    constructor (
        private readonly gnmi: GnmiService,
        private readonly profiles: ProfilesService,
    ) { }

    observe (ref: TelemetrySourceRef, path: string): Observable<TelemetrySample> {
        return new Observable<TelemetrySample>(subscriber => {
            const mode = ref.mode ?? DEFAULT_MODE
            const streamMode = ref.streamMode ?? DEFAULT_STREAM_MODE
            const intervalSec = ref.sampleIntervalSec ?? DEFAULT_INTERVAL_SEC
            const key = buildKey(ref.profileId, path, mode, streamMode, intervalSec)

            let entry = this.streams.get(key)
            if (!entry) {
                // Async lookup + spawn — resolve the profile, build a
                // SubscribeRequest, open the stream. Errors on the way
                // are forwarded to this subscriber (the first observer
                // after a cold start); existing-entry observers below
                // skip this path entirely.
                const pending = new Subject<TelemetrySample>()
                entry = {
                    key,
                    handle: null as unknown as GnmiSubscribeHandle,
                    subject: pending,
                    refCount: 0,
                    graceTimer: null,
                }
                this.streams.set(key, entry)
                this.spawn(ref.profileId, path, mode, streamMode, intervalSec, entry)
                    .catch(err => {
                        pending.error(err instanceof Error ? err : new Error(String(err)))
                        this.streams.delete(key)
                    })
            }
            if (entry.graceTimer) {
                clearTimeout(entry.graceTimer)
                entry.graceTimer = null
            }
            entry.refCount += 1
            const inner = entry.subject.subscribe(subscriber)
            return () => {
                inner.unsubscribe()
                entry!.refCount -= 1
                if (entry!.refCount === 0) {
                    entry!.graceTimer = setTimeout(() => {
                        if (entry!.refCount === 0) {
                            entry!.handle?.kill()
                            this.streams.delete(entry!.key)
                        }
                    }, TEARDOWN_GRACE_MS)
                }
            }
        })
    }

    private async spawn (
        profileId: string,
        path: string,
        mode: 'STREAM' | 'ONCE' | 'POLL',
        streamMode: 'TARGET_DEFINED' | 'ON_CHANGE' | 'SAMPLE',
        intervalSec: number,
        entry: StreamEntry,
    ): Promise<void> {
        const list = await this.profiles.getProfiles({ includeBuiltin: true })
        const found = list.find(p => p.id === profileId && p.type === 'gnmi') as GnmiProfile | undefined
        if (!found) {
            throw new Error(`gNMI profile not found: ${profileId}`)
        }
        const handle = this.gnmi.subscribe(found, {
            mode,
            subscriptions: [{
                path,
                streamMode: mode === 'STREAM' ? streamMode : undefined,
                sampleIntervalNs: mode === 'STREAM' && streamMode === 'SAMPLE'
                    ? intervalSec * 1_000_000_000
                    : undefined,
            }],
        })
        entry.handle = handle
        handle.on('notification', (n: { timestampNs: number; value: unknown; kind: 'update' | 'delete' }) => {
            entry.subject.next({ timestampNs: n.timestampNs, value: n.value, kind: n.kind })
        })
        handle.on('error', (err: Error) => {
            // Transient errors keep the stream alive; the gnmic
            // subprocess retries internally. Non-transient errors
            // propagate to observers.
            if (!(err as Error & { transient?: boolean }).transient) {
                entry.subject.error(err)
                this.streams.delete(entry.key)
            }
        })
        handle.on('close', () => {
            entry.subject.complete()
            this.streams.delete(entry.key)
        })
    }
}

function buildKey (
    profileId: string,
    path: string,
    mode: string,
    streamMode: string,
    intervalSec: number,
): string {
    return `${profileId}|${path}|${mode}|${streamMode}|${intervalSec}`
}
