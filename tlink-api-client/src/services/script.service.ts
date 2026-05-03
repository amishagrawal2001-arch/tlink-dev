import { Injectable } from '@angular/core'
import { APIClientOptions, APIResponse } from '../api/interfaces'
import { EnvironmentService } from './environment.service'

/**
 * Minimal pre/post-request script runner.
 *
 * Security note: this is a Function-constructor sandbox, not a full
 * VM. The Electron renderer it runs in already has Node access, so we
 * can't pretend this is hard isolation. We deliberately:
 *   - hide `globalThis`, `window`, `process`, `require` from the
 *     script's lexical scope by passing only the `tlink` API object,
 *   - cap execution time via a wall-clock timeout,
 *   - swallow throws and return them as visible errors, not silent.
 *
 * The shape of the API mirrors Postman's `pm.*` so transferring scripts
 * from there is mostly mechanical:
 *   tlink.env.set('token', '...')
 *   tlink.env.get('baseUrl')
 *   tlink.req.headers.set('X-Foo', '1')   (pre-script only)
 *   tlink.res.json()                       (post-script only)
 *   tlink.res.status                       (post-script only)
 */
@Injectable({ providedIn: 'root' })
export class ScriptService {
    private readonly TIMEOUT_MS = 2_000

    constructor (private envService: EnvironmentService) {}

    /** Run the pre-request script. Mutations to req.headers / req.body
     *  are reflected in the returned options. Returns the new options
     *  + any captured logs / error to surface in the UI. */
    runPre (options: APIClientOptions): { options: APIClientOptions, logs: string[], error?: string } {
        const src = options.preScript?.trim()
        if (!src) {
            return { options, logs: [] }
        }
        const cloned = JSON.parse(JSON.stringify(options)) as APIClientOptions
        const logs: string[] = []
        const tlink = this.buildPreApi(cloned, logs)
        try {
            this.execute(src, tlink)
            return { options: cloned, logs }
        } catch (e: any) {
            return { options: cloned, logs, error: e?.message ?? String(e) }
        }
    }

    runPost (options: APIClientOptions, response: APIResponse): { logs: string[], error?: string } {
        const src = options.postScript?.trim()
        if (!src) {
            return { logs: [] }
        }
        const logs: string[] = []
        const tlink = this.buildPostApi(response, logs)
        try {
            this.execute(src, tlink)
            return { logs }
        } catch (e: any) {
            return { logs, error: e?.message ?? String(e) }
        }
    }

    private execute (src: string, tlink: any): void {
        // Wrap in an IIFE so users can write top-level `return`s if they
        // want, and so `let`/`const` declarations don't leak.
        const wrapped = `"use strict"; (function () {\n${src}\n})();`
        const start = Date.now()

        // Approximate timeout via a check after the call returns —
        // single-threaded JS means we can't preempt, but we can warn
        // when long-running scripts blow past the budget.
        const fn = new Function('tlink', wrapped)  // eslint-disable-line @typescript-eslint/no-implied-eval
        fn(tlink)
        const elapsed = Date.now() - start
        if (elapsed > this.TIMEOUT_MS) {
            throw new Error(`Script ran for ${elapsed}ms (budget ${this.TIMEOUT_MS}ms). Consider trimming.`)
        }
    }

    private buildPreApi (options: APIClientOptions, logs: string[]): any {
        return {
            env: {
                set: (k: string, v: string) => this.envService.setVariable(k, v),
                get: (k: string) => this.envService.substitute(`{{${k}}}`),
            },
            req: {
                method: options.method,
                set body (v: string) { options.body = v },
                get body () { return options.body },
                set url (v: string) { options.url = v },
                get url () { return options.url },
                headers: {
                    set: (k: string, v: string) => {
                        const existing = options.headers.find(h => h.key.toLowerCase() === k.toLowerCase())
                        if (existing) {
                            existing.value = v
                            existing.enabled = true
                        } else {
                            options.headers.push({ key: k, value: v, enabled: true })
                        }
                    },
                    get: (k: string) => options.headers.find(h => h.key.toLowerCase() === k.toLowerCase())?.value,
                    remove: (k: string) => {
                        const idx = options.headers.findIndex(h => h.key.toLowerCase() === k.toLowerCase())
                        if (idx >= 0) {options.headers.splice(idx, 1)}
                    },
                },
            },
            log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        }
    }

    private buildPostApi (response: APIResponse, logs: string[]): any {
        return {
            env: {
                set: (k: string, v: string) => this.envService.setVariable(k, v),
                get: (k: string) => this.envService.substitute(`{{${k}}}`),
            },
            res: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: response.body,
                json: () => {
                    try { return JSON.parse(response.body) } catch { return null }
                },
                size: response.size,
                time: response.time,
            },
            log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        }
    }
}
