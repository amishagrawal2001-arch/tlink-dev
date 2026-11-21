import { Observable } from 'rxjs'

/**
 * Reference-counted multi-observer source of telemetry samples. Each
 * plugin that owns a telemetry subscription lifecycle (tlink-gnmi,
 * tlink-collector) ships its own implementation, and the dashboards
 * plugin dispatches by `TelemetrySourceRef.kind`. Multiple observers
 * on the same identity share one underlying subscription — the first
 * `observe()` call spawns it, the last unsubscribe tears it down
 * (with a short grace period so a tab swap doesn't thrash).
 *
 * Lives in tlink-core so neither tlink-gnmi nor tlink-collector needs
 * to depend on the dashboards plugin (which is the consumer side).
 */
export interface TelemetryBroker {
    /**
     * Subscribe to the stream of samples at `path` from the profile
     * identified by `ref`. Returns a cold Observable: subscribing
     * increments the broker's internal ref count and (on 0→1)
     * spawns the underlying process; unsubscribing decrements and
     * (on 1→0, after a small grace period) tears it down.
     *
     * If `ref.profileId` doesn't resolve to a known profile, the
     * Observable errors synchronously on subscribe.
     */
    observe(ref: TelemetrySourceRef, path: string): Observable<TelemetrySample>
}

/**
 * Identity of a telemetry source. The gNMI-only fields are packaged
 * together with path because the gNMI broker ref-counts on these as
 * part of the subscription identity (same path at different sample
 * intervals is really two subscriptions). Collector ignores them —
 * one scrape per profile fans out to every path.
 */
export interface TelemetrySourceRef {
    /** Which plugin owns the profile. Dispatcher picks the broker by this. */
    kind: 'gnmi' | 'collector'
    /** Profile id registered with ProfilesService for that plugin. */
    profileId: string
    /** gNMI-only: subscribe RPC mode. Defaults to STREAM in the broker. */
    mode?: 'STREAM' | 'ONCE' | 'POLL'
    /** gNMI-only: stream sub-mode when mode=STREAM. Defaults to SAMPLE. */
    streamMode?: 'TARGET_DEFINED' | 'ON_CHANGE' | 'SAMPLE'
    /** gNMI-only: sample cadence in seconds. Defaults to 10. */
    sampleIntervalSec?: number
}

/**
 * One telemetry sample pushed by a broker. Shape mirrors
 * GnmiNotification and CollectorSample so downstream consumers can
 * use it uniformly.
 */
export interface TelemetrySample {
    /** Nanoseconds since epoch when the source sampled the value. */
    timestampNs: number
    /** Raw value — numeric for gauges/counters, string for labels. */
    value: unknown
    /** 'update' for new/changed values; 'delete' for dropped series. */
    kind: 'update' | 'delete'
}
