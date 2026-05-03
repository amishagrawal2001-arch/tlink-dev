import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { ConfigService } from 'tlink-core'
import { CookieEntry } from '../api/interfaces'

/**
 * Domain-scoped cookie jar.
 *
 * On send, we collect cookies whose domain matches the request host
 * and emit a single `Cookie:` header. After receive, we parse
 * `Set-Cookie` from the response and add/update entries. The user can
 * view + edit + delete via the Cookies tab.
 *
 * We intentionally don't honor Path / Same-Site / HttpOnly / strict
 * expiry — full-fat jars belong in server-side libs. What we do here
 * is enough for the dev workflow (poke an API, see what cookies it
 * sets, replay them).
 */
@Injectable({ providedIn: 'root' })
export class CookiesService {
    private cookiesSubject = new BehaviorSubject<CookieEntry[]>([])

    constructor (private config: ConfigService) {
        const stored = this.config.store.apiClient?.cookies
        if (Array.isArray(stored)) {
            this.cookiesSubject.next(stored)
        }
    }

    get cookies$ (): Observable<CookieEntry[]> {
        return this.cookiesSubject.asObservable()
    }

    get cookies (): CookieEntry[] {
        return this.cookiesSubject.value
    }

    /** Build the `Cookie: a=1; b=2` header value for an outgoing host. */
    buildCookieHeader (host: string): string | null {
        const matches = this.cookies.filter(c => c.enabled && this.domainMatches(c.domain, host))
        if (!matches.length) {return null}
        return matches.map(c => `${c.name}=${c.value}`).join('; ')
    }

    /**
     * Parse one or more `Set-Cookie` headers (comma-joined or newline-
     * separated, since fetch's headers.get returns them concatenated)
     * and merge into the jar.
     */
    ingestSetCookie (host: string, raw: string | undefined): void {
        if (!raw) {return}
        const lines = this.splitSetCookie(raw)
        for (const line of lines) {
            this.parseAndStore(host, line)
        }
    }

    create (entry: Omit<CookieEntry, 'id'>): CookieEntry {
        const e: CookieEntry = { id: `ck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...entry }
        const next = [...this.cookies, e]
        this.cookiesSubject.next(next)
        this.persist(next)
        return e
    }

    update (entry: CookieEntry): void {
        const next = this.cookies.map(c => c.id === entry.id ? { ...entry } : c)
        this.cookiesSubject.next(next)
        this.persist(next)
    }

    delete (id: string): void {
        const next = this.cookies.filter(c => c.id !== id)
        this.cookiesSubject.next(next)
        this.persist(next)
    }

    clearAll (): void {
        this.cookiesSubject.next([])
        this.persist([])
    }

    /**
     * Domain-suffix match. `cookie.domain` of `.example.com` matches
     * `api.example.com`; an exact domain matches itself only. We
     * normalize a leading dot off both sides.
     */
    private domainMatches (cookieDomain: string, host: string): boolean {
        const cd = cookieDomain.replace(/^\./, '').toLowerCase()
        const h = host.toLowerCase()
        if (cd === h) {return true}
        if (h.endsWith(`.${cd}`)) {return true}
        return false
    }

    /**
     * Split a `Set-Cookie` blob. Browsers concatenate multiple Set-
     * Cookie response headers into a single comma-separated value
     * (when read via fetch's headers.get). The catch is that an
     * `Expires=...` attribute itself contains a comma in the date,
     * so we split on commas not preceded by an attribute value.
     *
     * Heuristic: split on `, ` only when the next token has the shape
     * `name=value`. Falls back to single-cookie if we can't tell.
     */
    private splitSetCookie (raw: string): string[] {
        const out: string[] = []
        let start = 0
        for (let i = 0; i < raw.length; i++) {
            if (raw[i] === ',' && raw[i + 1] === ' ') {
                // Peek ahead: a new cookie starts with `name=…`. If we
                // see another `=` before a `;`, it's a new cookie.
                const rest = raw.slice(i + 2)
                const semi = rest.indexOf(';')
                const eq = rest.indexOf('=')
                if (eq > 0 && (semi < 0 || eq < semi)) {
                    out.push(raw.slice(start, i))
                    start = i + 2
                }
            }
        }
        out.push(raw.slice(start))
        return out.map(s => s.trim()).filter(Boolean)
    }

    /** Parse a single `name=value; Domain=...; Path=/; Secure; …` line. */
    private parseAndStore (host: string, line: string): void {
        const semi = line.split(';').map(s => s.trim())
        const head = semi.shift() ?? ''
        const eq = head.indexOf('=')
        if (eq <= 0) {return}
        const name = head.slice(0, eq)
        const value = head.slice(eq + 1)

        let domain = host
        let secure = false
        for (const attr of semi) {
            const [k, v] = attr.split('=', 2)
            const kk = k.toLowerCase()
            if (kk === 'domain' && v) {domain = v.replace(/^\./, '')} else if (kk === 'secure') {secure = true}
        }

        const existing = this.cookies.find(c =>
            c.name === name && this.domainMatches(c.domain, host),
        )
        if (existing) {
            this.update({ ...existing, value, secure })
        } else {
            this.create({ domain, name, value, enabled: true, secure })
        }
    }

    private persist (next: CookieEntry[]): void {
        if (!this.config.store.apiClient) {
            (this.config.store).apiClient = { collections: [], cookies: [] }
        }
        this.config.store.apiClient.cookies = JSON.parse(JSON.stringify(next))
        this.config.save()
    }
}
