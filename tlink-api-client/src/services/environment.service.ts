import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { ConfigService } from 'tlink-core'
import { APIEnvironment, EnvironmentVariable } from '../api/interfaces'

/**
 * Environment-variable substitution service.
 *
 * Lets the user maintain named environments (dev / staging / prod / …),
 * each carrying a flat key/value map. Templates of the form `{{name}}`
 * inside URL, headers, body, and auth fields are resolved at send-time.
 *
 * Variables are matched first in the active environment, then falling
 * through to a "global" environment so common things like `apiKey` or
 * `baseUrl` can live in one place. Unresolved tokens are left as-is so
 * the user sees the literal `{{thing}}` in the response and can fix it.
 *
 * State is persisted under `config.store.apiClient.environments` and
 * `…activeEnvironmentId` so a relaunch picks up where you left off.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentService {
    private environmentsSubject = new BehaviorSubject<APIEnvironment[]>([])
    private activeIdSubject = new BehaviorSubject<string | null>(null)

    constructor (private config: ConfigService) {
        this.load()
    }

    get environments$ (): Observable<APIEnvironment[]> {
        return this.environmentsSubject.asObservable()
    }

    get activeId$ (): Observable<string | null> {
        return this.activeIdSubject.asObservable()
    }

    get environments (): APIEnvironment[] {
        return this.environmentsSubject.value
    }

    get activeId (): string | null {
        return this.activeIdSubject.value
    }

    get active (): APIEnvironment | null {
        const id = this.activeId
        if (!id) {
            return null
        }
        return this.environments.find(e => e.id === id) ?? null
    }

    /** The implicit "global" environment — same shape as a user environment
     *  but with a fixed id and only created on first save. */
    get global (): APIEnvironment | null {
        return this.environments.find(e => e.id === 'global') ?? null
    }

    setActive (id: string | null): void {
        this.activeIdSubject.next(id)
        if (this.config.store.apiClient) {
            this.config.store.apiClient.activeEnvironmentId = id
            this.config.save()
        }
    }

    create (name: string): APIEnvironment {
        const env: APIEnvironment = {
            id: `env-${Date.now()}`,
            name: name.trim() || 'Untitled',
            variables: [],
        }
        const next = [...this.environments, env]
        this.environmentsSubject.next(next)
        this.persist(next)
        return env
    }

    /** Lazily creates the global env on first variable add. */
    ensureGlobal (): APIEnvironment {
        let g = this.global
        if (g) {
            return g
        }
        g = { id: 'global', name: 'Global', variables: [] }
        const next = [g, ...this.environments]
        this.environmentsSubject.next(next)
        this.persist(next)
        return g
    }

    update (env: APIEnvironment): void {
        const next = this.environments.map(e => e.id === env.id ? { ...env } : e)
        this.environmentsSubject.next(next)
        this.persist(next)
    }

    delete (id: string): void {
        const next = this.environments.filter(e => e.id !== id)
        this.environmentsSubject.next(next)
        if (this.activeId === id) {
            this.setActive(null)
        }
        this.persist(next)
    }

    /**
     * Resolve `{{var}}` tokens in a string. Active env wins; falls
     * through to global. Disabled variables are skipped (so the user
     * can park alternates without deleting them). Unknown tokens are
     * left literal — better surface than blowing up the request.
     */
    substitute (text: string): string {
        if (!text || !text.includes('{{')) {
            return text
        }
        const map = this.buildLookup()
        return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (full, key) => {
            const v = map.get(key)
            return v ?? full
        })
    }

    /** Apply substitution across the whole request shape. */
    substituteAll<T extends Record<string, any>> (obj: T): T {
        const out: any = Array.isArray(obj) ? [] : {}
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string') {
                out[k] = this.substitute(v)
            } else if (Array.isArray(v)) {
                out[k] = v.map(item => typeof item === 'object' && item ? this.substituteAll(item) : item)
            } else if (typeof v === 'object' && v !== null) {
                out[k] = this.substituteAll(v)
            } else {
                out[k] = v
            }
        }
        return out as T
    }

    /** Set a single variable — used by post-response extractors. Creates
     *  the global env if no active env exists, so chained extractors
     *  always have somewhere to land their result. */
    setVariable (key: string, value: string, envId?: string): void {
        const targetId = envId ?? this.activeId ?? this.ensureGlobal().id
        const target = this.environments.find(e => e.id === targetId)
        if (!target) {
            return
        }
        const existing = target.variables.find(v => v.key === key)
        if (existing) {
            existing.value = value
            existing.enabled = true
        } else {
            target.variables.push({ key, value, enabled: true, secret: false })
        }
        this.update(target)
    }

    /** Build a flat lookup with active-then-global precedence, skipping
     *  disabled rows. Cached per call — env mutations re-build. */
    private buildLookup (): Map<string, string> {
        const m = new Map<string, string>()
        const apply = (env: APIEnvironment | null) => {
            if (!env) {
                return
            }
            for (const v of env.variables) {
                if (v.enabled && v.key) {
                    m.set(v.key, v.value)
                }
            }
        }
        apply(this.global)
        apply(this.active)
        return m
    }

    private load (): void {
        const stored = this.config.store.apiClient?.environments
        if (Array.isArray(stored)) {
            this.environmentsSubject.next(stored)
        }
        const activeId = this.config.store.apiClient?.activeEnvironmentId ?? null
        this.activeIdSubject.next(activeId)
    }

    private persist (envs: APIEnvironment[]): void {
        if (!this.config.store.apiClient) {
            (this.config.store).apiClient = { collections: [], environments: [] }
        }
        // Deep clone to satisfy ConfigProxy nested-write requirements.
        this.config.store.apiClient.environments = JSON.parse(JSON.stringify(envs))
        this.config.save()
    }

    /** Convenience: same shape as a variable but used by the picker UI
     *  to highlight unresolved tokens in the URL bar. */
    findUnresolved (text: string): string[] {
        if (!text) {
            return []
        }
        const map = this.buildLookup()
        const out: string[] = []
        const re = /\{\{\s*([\w.-]+)\s*\}\}/g
        let match: RegExpExecArray | null = re.exec(text)
        while (match !== null) {
            if (!map.has(match[1])) {
                out.push(match[1])
            }
            match = re.exec(text)
        }
        return out
    }

    /** Test helper — exposed for the UI variables editor. */
    static newVariable (): EnvironmentVariable {
        return { key: '', value: '', enabled: true, secret: false }
    }
}
