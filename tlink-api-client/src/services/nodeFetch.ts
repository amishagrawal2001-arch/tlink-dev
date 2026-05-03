import { TLSConfig } from '../api/interfaces'

/**
 * Node-side fetch shim — same call signature shape as the browser's
 * fetch, but reaches all the way down to Node's http/https stack so we
 * can plumb mTLS, custom CAs, "ignore TLS errors", and HTTP proxies.
 *
 * We only route through here when the request needs Node-level
 * features. Plain HTTP / HTTPS without TLS overrides + no proxy keeps
 * the renderer's fetch path (lighter, supports streaming + AbortSignal
 * out of the box).
 *
 * Limitations:
 *   - No streaming response — we collect the full body into memory.
 *     Fine for the API-client use case (responses are usually small);
 *     would need rework for large file downloads.
 *   - HTTP proxy: CONNECT for HTTPS, plain forward for HTTP. Supports
 *     basic auth in the proxy URL (http://user:pass@host:port).
 *   - Cancellation: honored via the supplied AbortSignal.
 */

export interface NodeFetchInit {
    method: string
    headers: Record<string, string>
    body?: string | Uint8Array | undefined
    signal?: AbortSignal
    tls?: TLSConfig
    proxy?: string
}

export interface NodeFetchResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    /** Raw response bytes — caller decodes as needed. */
    body: Uint8Array
}

/**
 * Returns true if `init` requires the Node-side path. The renderer's
 * fetch is plenty for the common case; we only switch when one of
 * the Node-only knobs is in play.
 */
export function needsNodeFetch (init: NodeFetchInit): boolean {
    if (init.proxy?.trim()) {return true}
    const { tls } = init
    if (!tls) {return false}
    if (tls.clientCertPath?.length) {return true}
    if (tls.clientKeyPath?.length) {return true}
    if (tls.caPath?.length) {return true}
    if (tls.rejectUnauthorized === false) {return true}
    return false
}

/**
 * Build an https.Agent that tunnels through an HTTP proxy via CONNECT.
 * We open a raw TCP connection to the proxy, send `CONNECT host:port
 * HTTP/1.1`, and once we get a 2xx, hand the resulting socket to
 * https.Agent so it can do the TLS handshake on top.
 */
async function connectTunnelAgent (proxyUrlString: string, targetHost: string, tlsOpts: any): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const net = require('net')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('https')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { URL: NodeURL } = require('url')

    const proxy = new NodeURL(proxyUrlString)
    const proxyHost = proxy.hostname
    const proxyPort = parseInt(proxy.port?.length ? proxy.port : '8080', 10)

    return new Promise<any>((resolve, reject) => {
        const socket = net.createConnection({ host: proxyHost, port: proxyPort })
        let connected = false

        socket.once('error', (err: Error) => {
            if (!connected) {reject(err)}
        })

        const auth = proxy.username
            ? `\r\nProxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`
            : ''
        socket.on('connect', () => {
            socket.write(`CONNECT ${targetHost} HTTP/1.1\r\nHost: ${targetHost}${auth}\r\n\r\n`)
        })

        socket.once('data', (chunk: Buffer) => {
            const head = chunk.toString('utf8')
            if (!/^HTTP\/1\.[01] 2\d\d/.test(head)) {
                socket.destroy()
                reject(new Error(`Proxy CONNECT failed: ${head.split('\r\n')[0]}`))
                return
            }
            connected = true
            // Hand the now-tunneled socket to an https.Agent — it'll do
            // the TLS handshake on the next request.
            const agent = new https.Agent({
                ...tlsOpts,
                createConnection: () => socket,
            })
            resolve(agent)
        })
    })
}

export async function nodeFetch (urlString: string, init: NodeFetchInit): Promise<NodeFetchResponse> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('http')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('https')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { URL: NodeURL } = require('url')

    const target = new NodeURL(urlString)
    const isHttps = target.protocol === 'https:'

    // Resolve TLS config — read cert/key/ca from disk if paths are set.
    const tlsOpts: any = {}
    if (init.tls) {
        if (init.tls.rejectUnauthorized === false) {
            tlsOpts.rejectUnauthorized = false
        }
        if (init.tls.clientCertPath) {
            tlsOpts.cert = await fs.promises.readFile(init.tls.clientCertPath)
        }
        if (init.tls.clientKeyPath) {
            tlsOpts.key = await fs.promises.readFile(init.tls.clientKeyPath)
        }
        if (init.tls.caPath) {
            tlsOpts.ca = await fs.promises.readFile(init.tls.caPath)
        }
    }

    // Build request options for the destination — possibly via proxy.
    const reqOpts: any = {
        method: init.method,
        headers: { ...init.headers },
        ...tlsOpts,
    }

    let agent: any = undefined
    if (init.proxy?.trim()) {
        // Two flavors:
        //   - HTTPS via CONNECT tunnel (most corp proxies)
        //   - HTTP forward (proxy receives the full URL)
        if (isHttps) {
            agent = await connectTunnelAgent(init.proxy, target.host, tlsOpts)
            reqOpts.agent = agent
            reqOpts.host = target.hostname
            reqOpts.port = target.port || '443'
            reqOpts.path = target.pathname + (target.search || '')
        } else {
            // Plain HTTP through proxy: use the proxy as the destination
            // and emit the full URL in the request line. Node's http
            // does this when path is the absolute URL.
            const proxyUrl = new NodeURL(init.proxy)
            reqOpts.host = proxyUrl.hostname
            reqOpts.port = proxyUrl.port || '80'
            reqOpts.path = urlString
            if (proxyUrl.username) {
                reqOpts.headers['Proxy-Authorization'] = 'Basic '
                    + Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString('base64')
            }
        }
    } else {
        reqOpts.host = target.hostname
        reqOpts.port = target.port || (isHttps ? '443' : '80')
        reqOpts.path = target.pathname + (target.search || '')
    }

    // Ensure Host is set for the *destination*, not the proxy.
    if (!Object.keys(reqOpts.headers).some(k => k.toLowerCase() === 'host')) {
        reqOpts.headers['Host'] = target.host
    }

    return new Promise<NodeFetchResponse>((resolve, reject) => {
        const lib = isHttps ? https : http
        const req = lib.request(reqOpts, (res: any) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () => {
                const body = Buffer.concat(chunks)
                const headers: Record<string, string> = {}
                for (const [k, v] of Object.entries<any>(res.headers)) {
                    headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
                }
                resolve({
                    status: res.statusCode ?? 0,
                    statusText: res.statusMessage ?? '',
                    headers,
                    body: new Uint8Array(body),
                })
            })
            res.on('error', (err: Error) => reject(err))
        })
        req.on('error', (err: Error) => reject(err))

        // Bridge AbortSignal into the Node request.
        if (init.signal) {
            const onAbort = () => {
                try { req.destroy(new Error('Request cancelled')) } catch { /* already destroyed */ }
            }
            if (init.signal.aborted) {
                onAbort()
            } else {
                init.signal.addEventListener('abort', onAbort, { once: true })
            }
        }

        if (init.body !== undefined) {
            const buf = typeof init.body === 'string' ? Buffer.from(init.body) : Buffer.from(init.body)
            req.write(buf)
        }
        req.end()
    })
}
