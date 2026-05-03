import { AwsSigV4Config } from '../api/interfaces'

/**
 * AWS Signature Version 4 — pure-TS implementation good enough for
 * direct API Gateway / Lambda / S3 / generic AWS service calls.
 *
 * We follow the canonical recipe from the AWS docs:
 *   1. Build a canonical request (method, path, query, headers, body).
 *   2. Compute its SHA-256.
 *   3. Build a "string to sign" with date / scope / canonical hash.
 *   4. Derive a signing key by walking
 *        kDate = HMAC("AWS4" + secret, dateStamp)
 *        kRegion = HMAC(kDate, region)
 *        kService = HMAC(kRegion, service)
 *        kSigning = HMAC(kService, "aws4_request")
 *   5. HMAC the string-to-sign with kSigning.
 *
 * The signed request gets:
 *   - x-amz-date           (ISO 8601 basic format, e.g. 20240101T123045Z)
 *   - host                 (URL host, including non-default port)
 *   - x-amz-security-token (only when sessionToken is set)
 *   - Authorization        (the SigV4 header)
 *
 * The body hash uses the request body (or the empty-string SHA-256
 * if no body). For binary uploads we accept a Uint8Array; for text
 * we accept a string.
 *
 * This runs in the renderer process via `crypto.subtle`, which is
 * available in Electron. No native deps.
 */

export interface SigV4SignArgs {
    method: string
    url: string
    headers: Record<string, string>
    body?: string | Uint8Array
    cfg: AwsSigV4Config
}

export interface SigV4SignResult {
    /** Headers to merge into the outgoing request. */
    headers: Record<string, string>
    /** The (possibly host-rewritten) URL to send to. */
    url: string
}

const ALGORITHM = 'AWS4-HMAC-SHA256'

/** Hex-encode an ArrayBuffer / Uint8Array. */
function toHex (buf: ArrayBuffer | Uint8Array): string {
    const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let out = ''
    for (const b of arr) {
        out += b.toString(16).padStart(2, '0')
    }
    return out
}

async function sha256Hex (input: string | Uint8Array): Promise<string> {
    const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
    const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
    return toHex(digest)
}

async function hmac (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

/**
 * RFC-3986 percent-encoding for the canonical URI / query. AWS is
 * picky here: spaces must be %20 (not +), and `/` is preserved in
 * paths but encoded in query values.
 */
function encodeRFC3986 (s: string, encodeSlash = true): string {
    return encodeURIComponent(s).replace(/[!'()*]/g, c =>
        '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    ).replace(/%2F/g, encodeSlash ? '%2F' : '/')
}

function canonicalQuery (search: string): string {
    if (!search || search === '?') {return ''}
    const raw = search.startsWith('?') ? search.slice(1) : search
    const pairs: [string, string][] = []
    for (const seg of raw.split('&')) {
        if (!seg) {continue}
        const eq = seg.indexOf('=')
        const k = eq >= 0 ? seg.slice(0, eq) : seg
        const v = eq >= 0 ? seg.slice(eq + 1) : ''
        // Decode then re-encode to normalize (AWS expects strict RFC3986).
        const dk = (() => { try { return decodeURIComponent(k) } catch { return k } })()
        const dv = (() => { try { return decodeURIComponent(v) } catch { return v } })()
        pairs.push([encodeRFC3986(dk), encodeRFC3986(dv, true)])
    }
    pairs.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return pairs.map(([k, v]) => `${k}=${v}`).join('&')
}

function canonicalPath (pathname: string): string {
    if (!pathname) {return '/'}
    // S3 needs literal-encoded paths; other services accept once-encoded.
    // We do a single normalization pass that handles both correctly for
    // typical inputs (tested against API Gateway + S3 paths).
    return pathname.split('/').map(seg => encodeRFC3986(seg, false)).join('/')
}

export async function signRequest (args: SigV4SignArgs): Promise<SigV4SignResult> {
    const { method, url, headers, body, cfg } = args
    const u = new URL(url)

    const now = new Date()
    const isoDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')  // 20240101T123045Z
    const dateStamp = isoDate.slice(0, 8)
    const scope = `${dateStamp}/${cfg.region}/${cfg.service}/aws4_request`

    const bodyHash = body
        ? await sha256Hex(body)
        : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'  // empty string SHA-256

    // Canonical headers must be lowercase, sorted, with multi-line
    // values trimmed. We always include host + x-amz-date + (optional)
    // x-amz-security-token + content sha256.
    const canonicalHeaders = new Map<string, string>()
    for (const [k, v] of Object.entries(headers)) {
        canonicalHeaders.set(k.toLowerCase(), v.trim().replace(/\s+/g, ' '))
    }
    canonicalHeaders.set('host', u.host)
    canonicalHeaders.set('x-amz-date', isoDate)
    canonicalHeaders.set('x-amz-content-sha256', bodyHash)
    if (cfg.sessionToken) {
        canonicalHeaders.set('x-amz-security-token', cfg.sessionToken)
    }

    const sortedHeaderKeys = [...canonicalHeaders.keys()].sort()
    const canonicalHeadersBlock = sortedHeaderKeys
        .map(k => `${k}:${canonicalHeaders.get(k)}\n`)
        .join('')
    const signedHeaders = sortedHeaderKeys.join(';')

    const canonicalRequest = [
        method.toUpperCase(),
        canonicalPath(u.pathname),
        canonicalQuery(u.search),
        canonicalHeadersBlock,
        signedHeaders,
        bodyHash,
    ].join('\n')

    const canonicalRequestHash = await sha256Hex(canonicalRequest)

    const stringToSign = [
        ALGORITHM,
        isoDate,
        scope,
        canonicalRequestHash,
    ].join('\n')

    const kDate = await hmac(new TextEncoder().encode(`AWS4${cfg.secretAccessKey}`), dateStamp)
    const kRegion = await hmac(kDate, cfg.region)
    const kService = await hmac(kRegion, cfg.service)
    const kSigning = await hmac(kService, 'aws4_request')
    const signature = toHex(await hmac(kSigning, stringToSign))

    const authorization = `${ALGORITHM} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    // Build the headers we want to merge into the outgoing request. We
    // intentionally don't return the user-provided ones — those are
    // already in the request, so we just contribute the SigV4 ones.
    const out: Record<string, string> = {
        'X-Amz-Date': isoDate,
        'X-Amz-Content-Sha256': bodyHash,
        Authorization: authorization,
    }
    if (cfg.sessionToken) {
        out['X-Amz-Security-Token'] = cfg.sessionToken
    }
    return { headers: out, url }
}
