import { Profile } from 'tlink-core'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
export type BodyType = 'none' | 'json' | 'text' | 'form-data' | 'urlencoded' | 'graphql' | 'binary'
export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2' | 'awsSigV4'
export type APIKeyLocation = 'header' | 'query'
export type OAuth2GrantType = 'authorization_code' | 'client_credentials' | 'password'

export interface RequestHeader {
    key: string
    value: string
    enabled: boolean
}

/** Structured form-data field — supports text and file. The file path
 *  is stored verbatim and read at send-time, since we can't keep a
 *  File handle across recovery / restart. */
export interface FormDataField {
    key: string
    value: string
    /** Absolute path on disk for `kind === 'file'`. Read at send-time. */
    filePath?: string
    kind: 'text' | 'file'
    enabled: boolean
}

export interface AuthConfig {
    type: AuthType
    token?: string
    username?: string
    password?: string
    /** API key auth — header or query param. */
    apiKeyName?: string
    apiKeyValue?: string
    apiKeyLocation?: APIKeyLocation
    /** OAuth2 — once a token is acquired we cache it here so subsequent
     *  sends don't re-prompt. The user can clear via the UI. */
    oauth2?: OAuth2Config
    /** AWS Signature Version 4 — for SigV4-protected APIs. The session
     *  token is optional (used by STS / role-assumption credentials). */
    awsSigV4?: AwsSigV4Config
}

export interface AwsSigV4Config {
    accessKeyId: string
    secretAccessKey: string
    /** Service name (e.g. `execute-api`, `s3`, `lambda`). */
    service: string
    /** AWS region (e.g. `us-east-1`). */
    region: string
    /** Optional STS / temporary-credential token. */
    sessionToken?: string
}

export interface OAuth2Config {
    grantType: OAuth2GrantType
    /** Authorization endpoint (auth-code grant only). */
    authUrl?: string
    /** Token endpoint. */
    tokenUrl: string
    clientId: string
    clientSecret?: string
    /** Where to send credentials on the token request. Default: body. */
    clientAuth?: 'body' | 'header'
    redirectUri?: string
    scope?: string
    /** Resource owner credentials for the password grant — discouraged
     *  but supported for legacy APIs. */
    username?: string
    password?: string
    /** Use PKCE for auth-code (recommended). */
    usePkce?: boolean
    /** Cached token + refresh metadata. Populated by acquireToken(). */
    accessToken?: string
    refreshToken?: string
    tokenType?: string
    expiresAt?: number
}

/**
 * Post-response extractor — pulls a value out of the response and saves
 * it as an environment variable so subsequent requests can reference
 * `{{name}}`. Path is JSON-pointer-ish: dot/bracket notation, e.g.
 * `data.user.id`, `items[0].token`.
 */
export interface ResponseExtractor {
    /** Variable name to write into the active (or global) env. */
    name: string
    /** Where to read from — JSON body, response header, or status code. */
    source: 'body' | 'header' | 'status'
    /** JSON path for `body`, header name for `header`, ignored for `status`. */
    path: string
    enabled: boolean
}

/** Sub-form for GraphQL requests — parallel `query` / `variables`
 *  editors that get serialized into a JSON body at send-time. */
export interface GraphQLPayload {
    query: string
    variables: string
    operationName?: string
}

export interface APIClientOptions {
    url: string
    method: HttpMethod
    headers: RequestHeader[]
    body: string
    bodyType: BodyType
    bodyColor?: string
    bodyBgColor?: string
    timeout: number
    auth: AuthConfig
    /** Structured form-data — only used when bodyType === 'form-data'. */
    formData?: FormDataField[]
    /** Path on disk to send as the raw body — bodyType === 'binary'. */
    binaryPath?: string
    /** GraphQL split editor — bodyType === 'graphql'. */
    graphql?: GraphQLPayload
    /** Post-response extractors run on success; results land in env. */
    extractors?: ResponseExtractor[]
    /** Pre-request script — runs in a sandbox before the network call.
     *  Has access to env via `tlink.env.set / get` and `tlink.req`
     *  for header / body mutation. */
    preScript?: string
    /** Post-response script — runs after the call returns. Has access
     *  to `tlink.res` plus `tlink.test()` for response assertions. */
    postScript?: string
    /** Quick assertions — sibling of postScript for one-liner checks
     *  ("status is 200", "body has token"). Editor sugar; postScript
     *  has full power. */
    assertions?: ResponseAssertion[]
    /** When true the response body is written to disk on success. */
    saveResponseTo?: string
    /** Per-request TLS overrides — used for self-signed certs and
     *  mutual-TLS handshakes. */
    tls?: TLSConfig
    /** Per-request HTTP proxy URL (e.g. http://corp:3128). Empty / unset
     *  means "respect the system proxy". */
    proxy?: string
    /** Whether to attach matching cookies from the cookie jar. */
    sendCookies?: boolean
}

export interface TLSConfig {
    /** Skip cert / hostname verification. Surfaced with a red warning
     *  in the UI — only ever for dev / self-signed targets. */
    rejectUnauthorized?: boolean
    /** PEM cert (string) or path to .pem/.crt for mTLS. */
    clientCertPath?: string
    /** PEM key (string) or path to .pem/.key for mTLS. */
    clientKeyPath?: string
    /** Custom CA bundle path (PEM). */
    caPath?: string
}

/** Quick assertion — exists primarily as UI sugar over postScript. */
export interface ResponseAssertion {
    kind: 'status' | 'header' | 'body-contains' | 'json-path-equals'
    op: 'eq' | 'neq' | 'lt' | 'gt' | 'contains' | 'exists'
    target?: string
    expected: string
    enabled: boolean
}

export interface APIClientProfile extends Profile {
    options: APIClientOptions
}

export interface APIResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    /** Set when the response was binary; we keep both representations
     *  so the user can switch between text view and "Save as…". */
    bodyBytes?: Uint8Array
    contentType?: string
    size: number
    time: number
    error?: string
    /** Snapshot of assertion outcomes from the latest send. Empty when
     *  no assertions are configured. */
    assertionResults?: AssertionResult[]
}

export interface AssertionResult {
    label: string
    pass: boolean
    detail?: string
}

export interface SavedRequest {
    id: string
    name: string
    options: APIClientOptions
    /** Optional folder id within the parent collection — null = root. */
    folderId?: string | null
}

/** Optional folder under a collection. Flat hierarchy for now (no
 *  nested folders) to keep the UI simple. `order` carries the
 *  user's drag-reordered position; folders without an explicit
 *  order fall to the bottom of the list. */
export interface APIFolder {
    id: string
    name: string
    order?: number
}

/** Cookie jar entry — domain-scoped, persisted across sessions.
 *  We deliberately keep this minimal (no Path attribute, no
 *  Same-Site, no expiry tracking) — full RFC-compliant jars are
 *  the realm of HttpOnly server-side libs and not worth the
 *  weight here. The user can edit values directly in the UI. */
export interface CookieEntry {
    id: string
    domain: string
    name: string
    value: string
    enabled: boolean
    secure: boolean
}

export interface APICollection {
    id: string
    name: string
    requests: SavedRequest[]
    folders?: APIFolder[]
    /** Source label — "postman", "openapi", or undefined for hand-built. */
    source?: string
}

/**
 * Environment-variable bag. Key/value pairs with an enabled toggle so
 * the user can swap between alternates without deletion (e.g. a `token`
 * variable with three flavors, two disabled).
 */
export interface APIEnvironment {
    id: string
    name: string
    variables: EnvironmentVariable[]
}

export interface EnvironmentVariable {
    key: string
    value: string
    enabled: boolean
    /** Marks the value as a secret — UI dots out the value and the
     *  history pane redacts it. Persisted in the same store as the
     *  rest of the config (no separate vault yet). */
    secret: boolean
}

/** History entry — auto-logged on every send. Capped per the
 *  service's MAX_HISTORY constant. */
export interface RequestHistoryEntry {
    id: string
    timestamp: number
    method: HttpMethod
    url: string
    status: number
    statusText: string
    time: number
    size: number
    /** Snapshot of the options at send-time so re-running history is
     *  reproducible even if the open form has drifted. */
    options: APIClientOptions
    /** Trimmed response preview — full bodies aren't kept (memory). */
    responseSnippet?: string
}

/** Slim result returned by Postman/OpenAPI importers. */
export interface ImportResult {
    collection: APICollection
    environment?: APIEnvironment
}
