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

    /**
     * Subscribe to every sample from the source identified by `ref`,
     * regardless of path. Intended for consumers that natively want
     * the full stream (a session tab's Wire log + Latest view). The
     * collector broker implements this upstream of its per-path
     * fan-out; the gNMI broker rejects it synchronously because gNMI
     * subscriptions are inherently per-path. Optional on the
     * interface so a broker can refuse.
     */
    observeAll?(ref: TelemetrySourceRef): Observable<PathedSample>

    /**
     * Error channel for the subscription identified by (ref, path).
     * Decoupled from `observe()`'s sample stream so a transient
     * underlying error (gnmic reconnect stderr, flaky scrape) does
     * NOT terminate every observer's Observable. The broker's
     * internal error handler emits here; `observe()` continues to
     * emit samples. For a FATAL error, the broker completes the
     * sample Observable AFTER emitting the error, so observers can
     * distinguish "the stream is done" from "a transient hiccup".
     *
     * For brokers whose errors are profile-scoped rather than
     * per-path (collector), `path` is ignored — every observer of
     * that profile's errors sees the same stream.
     */
    observeErrors?(ref: TelemetrySourceRef, path: string): Observable<Error>
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

/**
 * Sibling of `TelemetrySample` carrying the path. Emitted only by
 * `observeAll()`, which exposes the full profile-level stream to
 * consumers that need the path per sample (session tab Wire log).
 * `observe(ref, path)` keeps emitting `TelemetrySample` because its
 * caller already knows the path it subscribed for.
 */
export interface PathedSample extends TelemetrySample {
    path: string
}
