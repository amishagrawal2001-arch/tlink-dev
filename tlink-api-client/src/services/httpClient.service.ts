import { Injectable } from '@angular/core'
import { APIClientOptions, APIResponse } from '../api/interfaces'

@Injectable({ providedIn: 'root' })
export class HttpClientService {

    async execute (options: APIClientOptions): Promise<APIResponse> {
        const startTime = performance.now()

        const headers: Record<string, string> = {}
        for (const h of options.headers) {
            if (h.enabled && h.key.trim()) {
                headers[h.key.trim()] = h.value
            }
        }

        // Auth
        if (options.auth?.type === 'bearer' && options.auth.token) {
            headers['Authorization'] = `Bearer ${options.auth.token}`
        } else if (options.auth?.type === 'basic' && options.auth.username) {
            const encoded = btoa(`${options.auth.username}:${options.auth.password ?? ''}`)
            headers['Authorization'] = `Basic ${encoded}`
        }

        // Body
        let body: string | undefined
        if (options.method !== 'GET' && options.method !== 'HEAD' && options.bodyType !== 'none') {
            body = options.body
            if (options.bodyType === 'json' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json'
            }
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000)

        try {
            const response = await fetch(options.url, {
                method: options.method,
                headers,
                body,
                signal: controller.signal,
                redirect: 'follow',
            })

            clearTimeout(timeoutId)
            const elapsed = performance.now() - startTime

            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value
            })

            let responseBody = ''
            try {
                responseBody = await response.text()
            } catch (e: any) {
                return {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders,
                    body: '',
                    size: 0,
                    time: Math.round(elapsed),
                    error: `Failed to read response body: ${e.message}`,
                }
            }

            return {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
                size: new Blob([responseBody]).size,
                time: Math.round(elapsed),
            }
        } catch (error: any) {
            clearTimeout(timeoutId)
            const elapsed = performance.now() - startTime

            if (error.name === 'AbortError') {
                return {
                    status: 0,
                    statusText: 'Timeout',
                    headers: {},
                    body: '',
                    size: 0,
                    time: Math.round(elapsed),
                    error: `Request timed out after ${options.timeout || 30000}ms`,
                }
            }

            return {
                status: 0,
                statusText: 'Error',
                headers: {},
                body: '',
                size: 0,
                time: Math.round(elapsed),
                error: error.message || 'Request failed',
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
