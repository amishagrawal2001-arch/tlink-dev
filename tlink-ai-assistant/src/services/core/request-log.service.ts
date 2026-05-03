import { Injectable, Optional } from '@angular/core';
import { scrubSecrets } from '../security/secret-scrubber';

/**
 * Persistent on-disk transcript of recent AI provider HTTP exchanges.
 *
 * Why this exists:
 *   Support traffic is full of "the AI gave me garbage 20 minutes ago,
 *   what did it actually receive?" debug questions. Every provider
 *   already calls `logger.debug` in BaseAiProvider's logRequest /
 *   logResponse / logError hooks, but those go to an in-memory array
 *   that's lost on app restart, and to the console, which is useless
 *   for forensics on a user's machine.
 *
 *   This service piggybacks on the same hooks and writes a SCRUBBED,
 *   TRUNCATED, capped ring buffer to IndexedDB. A user hitting
 *   "Export AI debug log" gets a single NDJSON file containing the
 *   last N entries — paste-into-bug-report friendly, no secrets.
 *
 * Design choices:
 *   - IndexedDB rather than localStorage so 100KB+ entries don't blow
 *     the localStorage 5MB quota; IDB is hundreds-of-MB-tolerant.
 *   - Ring buffer (default 100 entries) — an active user can hit
 *     thousands of API calls per session; we deliberately keep only
 *     the recent slice that's debug-relevant.
 *   - Per-string truncation at 8KB — long conversation contexts can
 *     reach 100KB+ in a single request; full payloads aren't useful
 *     for support and would crowd the ring buffer.
 *   - Scrubbing happens at record time, NOT at export time. Once a
 *     secret-shaped value lands in IDB unscrubbed it could persist
 *     across many sessions; scrub-at-write means the on-disk store
 *     never holds a raw key.
 *   - Falls back to in-memory storage when IndexedDB isn't available
 *     (Node-side jest tests, certain Electron contexts) so callers
 *     don't have to feature-detect.
 */

export type RequestLogKind = 'request' | 'response' | 'error'

export interface RequestLogEntry {
    /** Auto-incrementing IDB key. Set on insert. */
    id?: number
    /** Wall-clock ms timestamp at record time. */
    timestamp: number
    /** Provider that originated the call. e.g. "openai", "anthropic". */
    provider: string
    /** Lifecycle phase of this entry. */
    kind: RequestLogKind
    /** Free-form label — usually the request type ("chat", "chatStream",
     *  "generateCommand", etc.) so devs can filter the export. */
    label?: string
    /** Scrubbed + truncated payload. Shape depends on `kind`. */
    payload: unknown
    /** Wall-clock ms duration. Set on response/error if a paired
     *  request entry exists; left undefined otherwise. */
    durationMs?: number
}

const DB_NAME = 'tlink-ai-request-log'
const STORE_NAME = 'entries'
const DB_VERSION = 1
const DEFAULT_MAX_ENTRIES = 100
/** Per-string cap. Long messages get sliced + a `[truncated, NN bytes]`
 *  suffix. Whole-payload size is bounded indirectly via this. */
const STRING_TRUNCATE_BYTES = 8 * 1024

@Injectable({ providedIn: 'root' })
export class RequestLogService {
    /** In-memory fallback used when IDB isn't available. Bounded by
     *  the same maxEntries cap so this can't grow without limit. */
    private memory: RequestLogEntry[] = []
    private dbPromise: Promise<IDBDatabase | null> | null = null
    private readonly maxEntries: number

    constructor (@Optional() options?: { maxEntries?: number }) {
        this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES
    }

    /**
     * Persist one log entry. Scrub-at-write — `payload` is run through
     * the recursive secret scrubber and per-string truncation BEFORE it
     * lands in the store. Caller doesn't need to pre-scrub.
     */
    async record (entry: Omit<RequestLogEntry, 'id'>): Promise<void> {
        const safe: RequestLogEntry = {
            ...entry,
            payload: this.prepare(entry.payload),
        }
        const db = await this.openDb()
        if (!db) {
            // IDB unavailable — keep an in-memory ring.
            this.memory.push(safe)
            if (this.memory.length > this.maxEntries) {
                this.memory.splice(0, this.memory.length - this.maxEntries)
            }
            return
        }
        await this.writeIdb(db, safe)
    }

    /**
     * Return the most recent `limit` entries (default: all of them, up
     * to maxEntries). Oldest first so a chronological export reads
     * naturally.
     */
    async recent (limit?: number): Promise<RequestLogEntry[]> {
        const db = await this.openDb()
        if (!db) {
            const all = [...this.memory]
            return limit ? all.slice(-limit) : all
        }
        return this.readIdb(db, limit)
    }

    /** Wipe the log. */
    async clear (): Promise<void> {
        this.memory = []
        const db = await this.openDb()
        if (!db) return
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite')
            tx.objectStore(STORE_NAME).clear()
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    }

    /**
     * Render the log as newline-delimited JSON — one entry per line.
     * Convenient for dropping into a bug report or piping through
     * `jq`. Caller decides what to do with the string (download as
     * file, copy to clipboard, POST to a support endpoint, etc.).
     */
    async exportNdjson (): Promise<string> {
        const entries = await this.recent()
        return entries.map(e => JSON.stringify(e)).join('\n')
    }

    // ─── Internals ─────────────────────────────────────────────────────

    private async openDb (): Promise<IDBDatabase | null> {
        if (this.dbPromise) return this.dbPromise
        this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
            // Feature detect — tests, SSR, and certain Electron contexts
            // don't have IDB. Falling back silently is the right call;
            // logging is best-effort.
            const idb = (globalThis as any).indexedDB as IDBFactory | undefined
            if (!idb) { resolve(null); return }
            const req = idb.open(DB_NAME, DB_VERSION)
            req.onupgradeneeded = () => {
                const db = req.result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
                }
            }
            req.onsuccess = () => resolve(req.result)
            // Open failures (quota, private mode) → fall back to memory.
            req.onerror = () => resolve(null)
            req.onblocked = () => resolve(null)
        })
        return this.dbPromise
    }

    private writeIdb (db: IDBDatabase, entry: RequestLogEntry): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite')
            const store = tx.objectStore(STORE_NAME)
            store.add(entry)
            // After insert, prune to the ring-buffer cap. Read all keys,
            // delete the oldest until count fits. Cheap because the
            // store is bounded by `maxEntries` to begin with.
            const countReq = store.count()
            countReq.onsuccess = () => {
                const overflow = countReq.result - this.maxEntries
                if (overflow > 0) {
                    const cursorReq = store.openCursor()
                    let removed = 0
                    cursorReq.onsuccess = () => {
                        const cursor = cursorReq.result
                        if (cursor && removed < overflow) {
                            cursor.delete()
                            removed++
                            cursor.continue()
                        }
                    }
                }
            }
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    }

    private readIdb (db: IDBDatabase, limit?: number): Promise<RequestLogEntry[]> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly')
            const store = tx.objectStore(STORE_NAME)
            const out: RequestLogEntry[] = []
            // Iterate forward (oldest first); slice at the end if a
            // limit was requested. Fine for buffers <= maxEntries.
            const cursorReq = store.openCursor()
            cursorReq.onsuccess = () => {
                const cursor = cursorReq.result
                if (cursor) {
                    out.push(cursor.value)
                    cursor.continue()
                }
            }
            tx.oncomplete = () => resolve(limit ? out.slice(-limit) : out)
            tx.onerror = () => reject(tx.error)
        })
    }

    /**
     * Recursive scrub + truncate. Strings longer than STRING_TRUNCATE_BYTES
     * get sliced with a count suffix so the export still tells the dev
     * "there was 47KB of context here" without storing all of it.
     */
    private prepare (value: unknown): unknown {
        const scrubbed = scrubSecrets(value)
        return this.truncateStrings(scrubbed)
    }

    private truncateStrings (value: unknown): unknown {
        if (typeof value === 'string') {
            if (value.length > STRING_TRUNCATE_BYTES) {
                return value.slice(0, STRING_TRUNCATE_BYTES)
                    + ` … [truncated, original ${value.length} chars]`
            }
            return value
        }
        if (Array.isArray(value)) {
            return value.map(v => this.truncateStrings(v))
        }
        if (value && typeof value === 'object') {
            const out: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                out[k] = this.truncateStrings(v)
            }
            return out
        }
        return value
    }
}
