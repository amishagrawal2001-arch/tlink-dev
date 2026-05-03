import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { ConfigService } from 'tlink-core'
import { RequestHistoryEntry, APIClientOptions, APIResponse, HttpMethod } from '../api/interfaces'

/**
 * Auto-history of every send. Writes through to config so it survives
 * a relaunch. Capped to MAX_HISTORY entries — older entries fall off
 * the back. Bodies are trimmed to a preview length so the store
 * doesn't bloat.
 *
 * The list is global (not per-tab) by design: the most common workflow
 * is "I just sent it, where did it go" and the user shouldn't have to
 * remember which tab it was in.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
    private readonly MAX_HISTORY = 100
    private readonly PREVIEW_LIMIT = 2048

    private entriesSubject = new BehaviorSubject<RequestHistoryEntry[]>([])

    constructor (private config: ConfigService) {
        const stored = this.config.store.apiClient?.history
        if (Array.isArray(stored)) {
            this.entriesSubject.next(stored)
        }
    }

    get entries$ (): Observable<RequestHistoryEntry[]> {
        return this.entriesSubject.asObservable()
    }

    get entries (): RequestHistoryEntry[] {
        return this.entriesSubject.value
    }

    /** Append a new entry and trim the tail. The options snapshot is
     *  deep-cloned so subsequent edits to the open tab don't mutate
     *  history. */
    record (options: APIClientOptions, response: APIResponse): void {
        const trim = (s: string) =>
            s.length > this.PREVIEW_LIMIT ? s.slice(0, this.PREVIEW_LIMIT) + '…' : s
        const entry: RequestHistoryEntry = {
            id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            method: options.method,
            url: options.url,
            status: response.status,
            statusText: response.statusText,
            time: response.time,
            size: response.size,
            options: JSON.parse(JSON.stringify(options)),
            responseSnippet: response.body ? trim(response.body) : undefined,
        }
        const next = [entry, ...this.entries].slice(0, this.MAX_HISTORY)
        this.entriesSubject.next(next)
        this.persist(next)
    }

    clear (): void {
        this.entriesSubject.next([])
        this.persist([])
    }

    delete (id: string): void {
        const next = this.entries.filter(e => e.id !== id)
        this.entriesSubject.next(next)
        this.persist(next)
    }

    /** Lightweight filter helper for the UI search box. */
    search (query: string, method?: HttpMethod): RequestHistoryEntry[] {
        const q = query.trim().toLowerCase()
        return this.entries.filter(e => {
            if (method && e.method !== method) {
                return false
            }
            if (!q) {
                return true
            }
            return e.url.toLowerCase().includes(q)
                || `${e.status}`.includes(q)
                || (e.responseSnippet?.toLowerCase().includes(q) ?? false)
        })
    }

    private persist (next: RequestHistoryEntry[]): void {
        if (!this.config.store.apiClient) {
            (this.config.store).apiClient = { collections: [], history: [] }
        }
        this.config.store.apiClient.history = JSON.parse(JSON.stringify(next))
        this.config.save()
    }
}
