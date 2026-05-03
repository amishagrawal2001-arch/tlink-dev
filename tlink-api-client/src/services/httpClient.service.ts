import { Injectable } from '@angular/core'
import * as fs from 'fs'
import { APIClientOptions, APIResponse } from '../api/interfaces'
import { EnvironmentService } from './environment.service'
import { OAuth2Service } from './oauth2.service'
import { CookiesService } from './cookies.service'
import { getByPath } from './jsonPath'
import { signRequest as awsSign } from './awsSigV4'
import { needsNodeFetch, nodeFetch } from './nodeFetch'

/**
 * HTTP execution layer. Owns the wire format — env-var substitution,
 * auth, body shaping, abort, and translating fetch errors into a
 * stable APIResponse.
 *
 * Cancellation is exposed via `executeWithSignal`, which returns the
 * AbortController so the UI can wire a Cancel button. Callers that
 * don't care about cancellation use the simpler `execute`.
 */
@Injectable({ providedIn: 'root' })
export class HttpClientService {
    constructor (
        private envService: EnvironmentService,
        private oauth2: OAuth2Service,
        private cookies: CookiesService,
    ) {}

    async execute (options: APIClientOptions): Promise<APIResponse> {
        const controller = new AbortController()
        return this.executeWithSignal(options, controller).promise
    }

    /**
     * Variant that hands back the controller so the UI can cancel
     * mid-flight. Promise resolves with the response (or an error
     * shape) once the request settles.
     */
    executeWithSignal (
        options: APIClientOptions,
        controller: AbortController,
    ): { promise: Promise<APIResponse>, controller: AbortController } {
        const promise = this.runRequest(options, controller)
        return { promise, controller }
    }

    private async runRequest (rawOptions: APIClientOptions, controller: AbortController): Promise<APIResponse> {
        const startTime = performance.now()

        // Resolve env-var tokens across the whole options shape. We
        // operate on a deep clone so the open form's literal text
        // (with `{{var}}` placeholders) survives unchanged.
        const options = this.envService.substituteAll<APIClientOptions>(JSON.parse(JSON.stringify(rawOptions)))

        const headers: Record<string, string> = {}
        for (const h of options.headers) {
            if (h.enabled && h.key.trim()) {
                headers[h.key.trim()] = h.value
            }
        }

        // ---- Auth -------------------------------------------------
        if (options.auth.type === 'bearer' && options.auth.token) {
            headers['Authorization'] = `Bearer ${options.auth.token}`
        } else if (options.auth.type === 'basic' && options.auth.username) {
            const encoded = btoa(`${options.auth.username}:${options.auth.password ?? ''}`)
            headers['Authorization'] = `Basic ${encoded}`
        } else if (options.auth.type === 'apikey' && options.auth.apiKeyName && options.auth.apiKeyValue) {
            const loc = options.auth.apiKeyLocation ?? 'header'
            if (loc === 'header') {
                headers[options.auth.apiKeyName] = options.auth.apiKeyValue
            } else {
                // append as query param — preserve any existing string.
                try {
                    const u = new URL(options.url)
                    u.searchParams.set(options.auth.apiKeyName, options.auth.apiKeyValue)
                    options.url = u.toString()
                } catch {
                    // URL not parseable yet (e.g. partially-typed); fall back to manual.
                    options.url += (options.url.includes('?') ? '&' : '?')
                        + encodeURIComponent(options.auth.apiKeyName)
                        + '=' + encodeURIComponent(options.auth.apiKeyValue)
                }
            }
        } else if (options.auth.type === 'oauth2' && options.auth.oauth2) {
            try {
                const token = await this.oauth2.acquireToken(options.auth.oauth2)
                headers['Authorization'] = `${options.auth.oauth2.tokenType ?? 'Bearer'} ${token}`
            } catch (e: any) {
                return this.errorResponse(startTime, e?.message ?? 'OAuth2 token acquisition failed')
            }
        }
        // AWS SigV4 is signed *after* the body is built (it hashes the
        // body). Defer until below.

        // Cookie jar — attach matching cookies to outgoing request.
        if (options.sendCookies !== false) {
            try {
                const u = new URL(options.url)
                const cookieHeader = this.cookies.buildCookieHeader(u.host)
                if (cookieHeader) {
                    const existing = Object.keys(headers).find(k => k.toLowerCase() === 'cookie')
                    if (existing) {
                        headers[existing] = `${headers[existing]}; ${cookieHeader}`
                    } else {
                        headers['Cookie'] = cookieHeader
                    }
                }
            } catch { /* URL not parseable yet */ }
        }

        // ---- Body -------------------------------------------------
        let body: any = undefined
        if (options.method !== 'GET' && options.method !== 'HEAD') {
            switch (options.bodyType) {
                case 'json':
                    ({ body } = options)
                    if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
                        headers['Content-Type'] = 'application/json'
                    }
                    break
                case 'text':
                    ({ body } = options)
                    break
                case 'urlencoded': {
                    // Parse the textarea contents as `key=value` pairs,
                    // one per line or `&`-joined, and re-encode.
                    const params = new URLSearchParams()
                    const raw = options.body.split(/\r?\n|&/).map(s => s.trim()).filter(Boolean)
                    for (const p of raw) {
                        const idx = p.indexOf('=')
                        if (idx > 0) {
                            params.append(p.slice(0, idx), p.slice(idx + 1))
                        } else {
                            params.append(p, '')
                        }
                    }
                    body = params.toString()
                    if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
                        headers['Content-Type'] = 'application/x-www-form-urlencoded'
                    }
                    break
                }
                case 'form-data': {
                    const fd = new FormData()
                    for (const f of options.formData ?? []) {
                        if (!f.enabled || !f.key) {continue}
                        if (f.kind === 'file' && f.filePath) {
                            try {
                                const buf = await fs.promises.readFile(f.filePath)
                                const blob = new Blob([buf])
                                const name = f.filePath.split(/[\\/]/).pop() ?? 'upload.bin'
                                fd.append(f.key, blob, name)
                            } catch (e: any) {
                                return this.errorResponse(startTime, `Failed to read ${f.filePath}: ${e?.message ?? e}`)
                            }
                        } else {
                            fd.append(f.key, f.value)
                        }
                    }
                    body = fd
                    // Don't set Content-Type — fetch picks the boundary itself.
                    delete headers['Content-Type']
                    break
                }
                case 'graphql': {
                    const gql = options.graphql ?? { query: '', variables: '{}' }
                    let vars: any = {}
                    if (gql.variables.trim()) {
                        try { vars = JSON.parse(gql.variables) } catch { /* leave as {} */ }
                    }
                    body = JSON.stringify({
                        query: gql.query,
                        variables: vars,
                        operationName: gql.operationName ?? null,
                    })
                    if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
                        headers['Content-Type'] = 'application/json'
                    }
                    break
                }
                case 'binary': {
                    if (options.binaryPath) {
                        try {
                            body = await fs.promises.readFile(options.binaryPath)
                        } catch (e: any) {
                            return this.errorResponse(startTime, `Failed to read ${options.binaryPath}: ${e?.message ?? e}`)
                        }
                    }
                    break
                }
                case 'none':
                default:
                    break
            }
        }

        // ---- AWS SigV4 ------------------------------------------------
        // Sign *after* the body is built so the body hash is correct.
        // FormData / Blob bodies aren't signable in the renderer
        // (no easy way to bytes them); we skip signing and warn.
        if (options.auth.type === 'awsSigV4' && options.auth.awsSigV4) {
            try {
                let bodyForSigning: string | Uint8Array | undefined = undefined
                if (typeof body === 'string') {
                    bodyForSigning = body
                } else if (body instanceof Uint8Array) {
                    bodyForSigning = body
                } else if (body instanceof Buffer) {
                    bodyForSigning = new Uint8Array(body)
                } else if (body !== undefined) {
                    // FormData / Blob — can't reliably hash; AWS will
                    // reject. Surface a clear error rather than silent.
                    return this.errorResponse(startTime, 'AWS SigV4 cannot sign multipart / blob bodies; use raw JSON or text')
                }
                const signed = await awsSign({
                    method: options.method,
                    url: options.url,
                    headers,
                    body: bodyForSigning,
                    cfg: options.auth.awsSigV4,
                })
                Object.assign(headers, signed.headers)
                options.url = signed.url
            } catch (e: any) {
                return this.errorResponse(startTime, e?.message ?? 'AWS SigV4 signing failed')
            }
        }

        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000)

        try {
            // Decide between renderer fetch and Node-side fetch. The
            // Node path handles mTLS, custom CAs, ignore-TLS, and
            // HTTP proxies — features fetch doesn't expose.
            const useNode = needsNodeFetch({
                method: options.method,
                headers,
                body,
                tls: options.tls,
                proxy: options.proxy,
            })

            let responseStatus = 0
            let responseStatusText = ''
            let responseHeaders: Record<string, string> = {}
            let bodyBytes: Uint8Array = new Uint8Array(0)

            if (useNode) {
                const r = await nodeFetch(options.url, {
                    method: options.method,
                    headers,
                    body: typeof body === 'string' || body instanceof Uint8Array ? body : undefined,
                    signal: controller.signal,
                    tls: options.tls,
                    proxy: options.proxy,
                })
                responseStatus = r.status
                responseStatusText = r.statusText
                responseHeaders = r.headers
                bodyBytes = r.body
            } else {
                const response = await fetch(options.url, {
                    method: options.method,
                    headers,
                    body,
                    signal: controller.signal,
                    redirect: 'follow',
                })
                responseStatus = response.status
                responseStatusText = response.statusText
                responseHeaders = {}
                response.headers.forEach((value, key) => {
                    responseHeaders[key.toLowerCase()] = value
                })
                const buf = await response.arrayBuffer()
                bodyBytes = new Uint8Array(buf)
            }

            clearTimeout(timeoutId)
            const elapsed = performance.now() - startTime
            const contentType = responseHeaders['content-type'] ?? ''
            const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(bodyBytes)

            const apiResponse: APIResponse = {
                status: responseStatus,
                statusText: responseStatusText,
                headers: responseHeaders,
                body: bodyText,
                bodyBytes,
                contentType,
                size: bodyBytes.byteLength,
                time: Math.round(elapsed),
            }

            // Cookie ingest — Set-Cookie response header(s).
            if (options.sendCookies !== false) {
                try {
                    const u = new URL(options.url)
                    this.cookies.ingestSetCookie(u.host, responseHeaders['set-cookie'])
                } catch { /* URL not parseable */ }
            }

            // ---- Post-response side effects -------------------------
            this.runExtractors(rawOptions, apiResponse)

            // Persist response to disk if requested.
            if (options.saveResponseTo) {
                try {
                    await fs.promises.writeFile(options.saveResponseTo, Buffer.from(bodyBytes))
                } catch (e: any) {
                    apiResponse.error = `${apiResponse.error ? apiResponse.error + '. ' : ''}saveResponseTo: ${e?.message ?? e}`
                }
            }

            return apiResponse
        } catch (error: any) {
            clearTimeout(timeoutId)
            const elapsed = performance.now() - startTime

            if (error.name === 'AbortError') {
                return {
                    status: 0,
                    statusText: 'Cancelled',
                    headers: {},
                    body: '',
                    size: 0,
                    time: Math.round(elapsed),
                    error: controller.signal.reason instanceof Error
                        ? controller.signal.reason.message
                        : 'Request cancelled',
                }
            }

            return this.errorResponse(startTime, error.message ?? 'Request failed')
        }
    }

    private errorResponse (startTime: number, message: string): APIResponse {
        return {
            status: 0,
            statusText: 'Error',
            headers: {},
            body: '',
            size: 0,
            time: Math.round(performance.now() - startTime),
            error: message,
        }
    }

    /**
     * Walk the configured extractors and write their resolved values
     * into the active environment. Quietly skips entries whose path
     * doesn't resolve — surfacing these in the UI would feel like
     * yelling at the user every time their schema drifts.
     */
    private runExtractors (options: APIClientOptions, response: APIResponse): void {
        if (!options.extractors?.length) {
            return
        }
        let parsedBody: any = null
        for (const ex of options.extractors) {
            if (!ex.enabled || !ex.name) {continue}
            let value: unknown = undefined
            if (ex.source === 'status') {
                value = response.status
            } else if (ex.source === 'header') {
                value = response.headers[ex.path.toLowerCase()] ?? ''
            } else {
                if (parsedBody === null) {
                    try { parsedBody = JSON.parse(response.body) } catch { parsedBody = undefined }
                }
                value = getByPath(parsedBody, ex.path)
            }
            if (value !== undefined && value !== null) {
                this.envService.setVariable(ex.name, typeof value === 'string' ? value : JSON.stringify(value))
            }
        }
    }

    formatJson (body: string): string {
        try {
            return JSON.stringify(JSON.parse(body), null, 2)
        } catch {
            return body
        }
    }

    formatSize (bytes: number): string {
        if (bytes < 1024) { return `${bytes} B` }
        if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB` }
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    getStatusClass (status: number): string {
        if (status >= 200 && status < 300) { return 'success' }
        if (status >= 300 && status < 400) { return 'warning' }
        if (status >= 400) { return 'danger' }
        return 'secondary'
    }
}
