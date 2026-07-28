import { ConnectableProfile } from 'tlink-core'

/**
 * A saved metrics-collector target. One profile per data source
 * endpoint — a Prometheus /metrics URL, a Telegraf prometheus_client
 * output, or (initially) the built-in Mock source.
 *
 * Kept separate from tlink-gnmi's GnmiProfile: this plugin polls
 * metrics endpoints on an interval rather than subscribing to a
 * device directly, and the config surface is different.
 */
export interface CollectorProfile extends ConnectableProfile {
    options: CollectorProfileOptions
}

/** Which data source this profile reads from. */
export type CollectorSourceKind = 'mock' | 'prometheus'

export interface CollectorProfileOptions {
    /** Data source. Extend the union as new adapters land (Influx, Kafka, …). */
    source: CollectorSourceKind

    // ─── Common ─────────────────────────────────────────────────────
    /** Scrape / poll interval in seconds. Every source honors this. */
    scrapeIntervalSec?: number

    // ─── Prometheus / HTTP scrape ──────────────────────────────────
    /** Full URL of a metrics endpoint. e.g. https://prom:9090/metrics */
    url?: string
    /** Optional Basic auth username. */
    username?: string
    /** Optional Basic auth password. Persisted via keychain like RDP/gNMI. */
    password?: string
    /** Optional bearer token. Sent as `Authorization: Bearer …`. */
    bearerToken?: string
    /** Skip TLS certificate verification. Lab-only. */
    insecureTls?: boolean
    /** Optional Prometheus-style relabel filter — glob on metric name. */
    metricFilter?: string

    // ─── Mock ──────────────────────────────────────────────────────
    /**
     * Mock generator configuration. Populated only when
     * source === 'mock'; ignored otherwise. Kept optional so
     * switching source types doesn't require nulling other fields.
     */
    mock?: MockSourceConfig
}

/** Knobs for the built-in Mock data source. */
export interface MockSourceConfig {
    /**
     * How many synthetic hosts to emit metrics for. Each host gets its
     * own set of metrics (cpu, memory, requests), so total cardinality
     * ≈ hosts × metrics-per-host (~4-6).
     */
    hostCount: number
    /** Named scenario — controls the shape of the generated values. */
    scenario: 'idle' | 'busy' | 'flapping' | 'growing'
}

/**
 * One data point emitted by a data source. Same conceptual shape as
 * gNMI's notification (path + value + timestamp + kind) so the
 * downstream UI (Wire/Latest/Graphical) can consume both without
 * caring about the source. Duplicated deliberately rather than
 * imported from tlink-gnmi — cross-plugin type dependencies get
 * awkward, and the schemas may drift as sources add source-specific
 * metadata.
 */
export interface CollectorSample {
    /** Nanoseconds since epoch when the sample was observed. */
    timestampNs: number
    /** Path-form identifier. Prometheus adapter uses `/metric_name[tag=val][tag2=val2]`. */
    path: string
    /** Raw value — numeric for gauges/counters, string for labels. */
    value: unknown
    /** 'update' for new/changed values; 'delete' for series that dropped. */
    kind: 'update' | 'delete'
    /** Optional origin label — useful when the UI shows multi-target aggregates. */
    target?: string
}
