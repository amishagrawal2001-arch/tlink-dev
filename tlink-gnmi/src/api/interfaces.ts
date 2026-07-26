import { ConnectableProfile } from 'tlink-core'

/**
 * A saved gNMI target — one connection to one network device.
 * Modeled after RDPProfile: the ConnectableProfile base carries name/
 * group/color chrome; everything under `options` is gNMI-specific.
 */
export interface GnmiProfile extends ConnectableProfile {
    options: GnmiProfileOptions
}

/**
 * Encoding requested from the target in Get/Subscribe responses.
 * JSON_IETF is the most portable across vendors (Arista/Cisco/Juniper/
 * Nokia all support it); PROTO is the wire format and needs a schema
 * to render meaningfully; ASCII/JSON are legacy fallbacks some older
 * platforms still emit.
 */
export type GnmiEncoding = 'JSON_IETF' | 'JSON' | 'PROTO' | 'ASCII' | 'BYTES'

/**
 * gNMI security tiers. `insecure` is a plaintext gRPC channel — only
 * safe on trusted lab / management networks. `tls` uses TLS with cert
 * verification. `mtls` adds a client certificate. `skip-verify` is TLS
 * that ignores the server cert (useful with self-signed lab certs but
 * never enable in production).
 */
export type GnmiSecurity = 'insecure' | 'tls' | 'mtls' | 'skip-verify'

/**
 * Subscribe mode per RFC-8641 / gNMI spec.
 *   - STREAM: continuous updates on a sample_interval (or ON_CHANGE)
 *   - ONCE:   one-shot snapshot then close the stream
 *   - POLL:   send poll requests on demand (rarely used in telemetry)
 */
export type GnmiSubscribeMode = 'STREAM' | 'ONCE' | 'POLL'

/**
 * Per-subscription sub-mode when parent is STREAM.
 *   - TARGET_DEFINED: target picks (equivalent to ON_CHANGE for
 *     leaves that support it, SAMPLE otherwise)
 *   - ON_CHANGE:      send only when the value changes
 *   - SAMPLE:         send every sample_interval regardless
 */
export type GnmiStreamMode = 'TARGET_DEFINED' | 'ON_CHANGE' | 'SAMPLE'

/**
 * Persisted gNMI target settings. All fields are user-editable in
 * the target-profile dialog (added in M2 UI work).
 *
 * Notes on defaults:
 *   - Port 6030 is Arista; Nokia/Cisco IOS-XR use 57400; Junos uses
 *     32767. We don't default a port because a wrong default just
 *     hides the "you need to set the right port" learning moment.
 *   - `insecure` defaults false because plaintext should be an
 *     explicit opt-in, not a silent fallback.
 */
export interface GnmiProfileOptions {
    /** Target host or IP. Required. */
    host: string
    /** Target port. Common: 6030 (Arista), 57400 (Nokia/Cisco), 32767 (Junos). */
    port?: number
    /** Username for gNMI auth. Optional — some setups use cert-only auth. */
    username?: string
    /** Password. Stored via keytar (RDPPasswordStorageService pattern). */
    password?: string

    /** TLS / mTLS / insecure. See GnmiSecurity docstring. */
    security?: GnmiSecurity
    /** Path to CA cert bundle (PEM). Optional — uses system trust store when unset. */
    caCertPath?: string
    /** Path to client cert (PEM). Required when security='mtls'. */
    clientCertPath?: string
    /** Path to client key (PEM). Required when security='mtls'. */
    clientKeyPath?: string
    /** SNI override — some load-balancer setups need this. */
    tlsServerName?: string

    /** Default encoding requested from the target. */
    encoding?: GnmiEncoding
    /** Vendor label — used to preselect known-good defaults / capability hints. */
    vendor?: 'arista' | 'cisco-iosxr' | 'juniper-junos' | 'nokia-srlinux' | 'nokia-sros' | 'other'
    /** Free-form gRPC dial timeout in ms. Default 10000. */
    timeoutMs?: number

    /**
     * Persisted per-target subscription templates. Populated when the
     * user "stars" an active subscription; consumed when the session
     * tab opens to seed the Saved section (and auto-start the ones
     * flagged autoStart). Kept optional so existing profiles don't
     * need migration on upgrade.
     */
    savedSubscriptions?: GnmiSavedSubscription[]
}

/**
 * One entry in a profile's saved-subscriptions list. Same shape the UI
 * uses for an active subscription, minus the runtime state — enough to
 * reconstruct a working subscribe request on click.
 */
export interface GnmiSavedSubscription {
    /** Stable id so the star-toggle can match an existing entry. */
    id: string
    /** gNMI path to subscribe to. */
    path: string
    /** Subscribe RPC mode this template was starred as. */
    mode: GnmiSubscribeMode
    /** Stream sub-mode when mode=STREAM. */
    streamMode: GnmiStreamMode
    /** Sample interval in seconds — matches the UI's editable unit. */
    sampleIntervalSec: number
    /** When true, this saved sub subscribes automatically on tab open. */
    autoStart: boolean
    /** Optional user-editable display name. Defaults to path when unset. */
    label?: string
}

/**
 * A single subscription entry inside a SubscribeRequest. STREAM mode
 * subscriptions carry a sample_interval; ONCE/POLL don't.
 */
export interface GnmiSubscription {
    /** gNMI path — origin:elem/elem/… form, e.g. "openconfig:/interfaces/interface[name=Ethernet1]/state/counters". */
    path: string
    /** Sample cadence for STREAM.SAMPLE mode. Nanoseconds per gNMI spec. */
    sampleIntervalNs?: number
    streamMode?: GnmiStreamMode
    /** Suppress redundant SAMPLE updates when the value hasn't changed. */
    suppressRedundant?: boolean
    /** Heartbeat cadence when suppressRedundant=true. Nanoseconds. */
    heartbeatIntervalNs?: number
}

/**
 * Full request shape a caller hands to GnmiService.subscribe().
 * Kept as a plain data object (not a class) so it can be persisted
 * as JSON in saved subscriptions / dashboards later.
 */
export interface GnmiSubscribeRequest {
    mode: GnmiSubscribeMode
    encoding?: GnmiEncoding
    subscriptions: GnmiSubscription[]
    /** Optional prefix concatenated to each subscription path. */
    prefix?: string
    /** When true, request only updates for the paths (no config-side data). */
    updatesOnly?: boolean
}

/**
 * A single notification received from the target — one entry per
 * Update or Delete in a gNMI Notification message.
 */
export interface GnmiNotification {
    /** Nanoseconds since epoch when the target sampled the value. */
    timestampNs: number
    /** Full path (prefix + entry.path). */
    path: string
    /** JSON-decoded value if encoding is JSON/JSON_IETF; hex string for BYTES. */
    value: unknown
    /** Kind of update — 'update' or 'delete' (delete carries no value). */
    kind: 'update' | 'delete'
    /** Target hostname the notification came from — useful when the UI multiplexes. */
    target?: string
}

/**
 * Result of a Capabilities RPC — used by the path autocomplete + the
 * target's "supported models" panel.
 */
export interface GnmiCapabilities {
    /** gNMI protocol version reported by the target. */
    gnmiVersion: string
    /** Supported YANG models with name/organization/version. */
    supportedModels: GnmiSupportedModel[]
    /** Encodings the target says it can emit. */
    supportedEncodings: GnmiEncoding[]
}

/** One entry in `GnmiCapabilities.supportedModels`. */
export interface GnmiSupportedModel {
    name: string
    organization: string
    version: string
}
