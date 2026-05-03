import { RequestLogService } from '../src/services/core/request-log.service'

// jest's `node` test environment doesn't expose IndexedDB, so the
// service silently falls back to its in-memory ring. Exactly the path
// we want to exercise without standing up a real fakeIndexedDB.

describe('RequestLogService (in-memory fallback)', () => {
    test('records entries in chronological order', async () => {
        const log = new RequestLogService(); log.setMaxEntries(5)
        await log.record({ timestamp: 1, provider: 'openai', kind: 'request', payload: { a: 1 } })
        await log.record({ timestamp: 2, provider: 'openai', kind: 'response', payload: { ok: true } })
        const entries = await log.recent()
        expect(entries.map(e => e.timestamp)).toEqual([1, 2])
        expect(entries.map(e => e.kind)).toEqual(['request', 'response'])
    })

    test('caps the ring buffer at maxEntries (oldest dropped)', async () => {
        const log = new RequestLogService(); log.setMaxEntries(3)
        for (let i = 1; i <= 5; i++) {
            await log.record({ timestamp: i, provider: 'p', kind: 'request', payload: i })
        }
        const entries = await log.recent()
        expect(entries).toHaveLength(3)
        // Oldest two (1, 2) should have fallen off.
        expect(entries.map(e => e.timestamp)).toEqual([3, 4, 5])
    })

    test('recent(limit) returns the last N entries', async () => {
        const log = new RequestLogService(); log.setMaxEntries(10)
        for (let i = 1; i <= 5; i++) {
            await log.record({ timestamp: i, provider: 'p', kind: 'request', payload: i })
        }
        const entries = await log.recent(2)
        expect(entries.map(e => e.timestamp)).toEqual([4, 5])
    })

    test('clear() empties the log', async () => {
        const log = new RequestLogService()
        await log.record({ timestamp: 1, provider: 'p', kind: 'request', payload: {} })
        await log.clear()
        expect(await log.recent()).toEqual([])
    })

    test('exportNdjson produces one JSON-encoded entry per line', async () => {
        const log = new RequestLogService()
        await log.record({ timestamp: 1, provider: 'p', kind: 'request', payload: { x: 1 } })
        await log.record({ timestamp: 2, provider: 'p', kind: 'response', payload: { y: 2 } })
        const text = await log.exportNdjson()
        const lines = text.split('\n')
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0])).toMatchObject({ timestamp: 1, payload: { x: 1 } })
        expect(JSON.parse(lines[1])).toMatchObject({ timestamp: 2, payload: { y: 2 } })
    })

    test('scrubs known-credential keys at record time', async () => {
        const log = new RequestLogService()
        await log.record({
            timestamp: 1,
            provider: 'openai',
            kind: 'request',
            payload: {
                model: 'gpt-4',
                api_key: 'sk-aaaaaaaaaaaaaaaaaaaaaaaa',
                messages: [{ content: 'hi' }],
            },
        })
        const [entry] = await log.recent()
        const payload = entry.payload as any
        expect(payload.api_key).toBe('<redacted>')
        expect(payload.model).toBe('gpt-4')
        expect(payload.messages[0].content).toBe('hi')
    })

    test('scrubs value-shape secrets even when key name is innocuous', async () => {
        const log = new RequestLogService()
        await log.record({
            timestamp: 1,
            provider: 'openai',
            kind: 'error',
            payload: { error: 'Bearer sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaa was rejected' },
        })
        const [entry] = await log.recent()
        const payload = entry.payload as any
        expect(payload.error).toContain('sk-<redacted>')
        expect(payload.error).not.toContain('sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    })

    test('truncates strings longer than 8KB with a count suffix', async () => {
        const log = new RequestLogService()
        const longText = 'x'.repeat(20_000)
        await log.record({
            timestamp: 1,
            provider: 'p',
            kind: 'request',
            payload: { messages: [{ content: longText }] },
        })
        const [entry] = await log.recent()
        const stored = ((entry.payload as any).messages[0].content) as string
        expect(stored.length).toBeLessThan(longText.length)
        expect(stored).toMatch(/\[truncated, original 20000 chars\]/)
    })

    test('does not truncate strings under 8KB', async () => {
        const log = new RequestLogService()
        const text = 'short message'
        await log.record({ timestamp: 1, provider: 'p', kind: 'request', payload: { content: text } })
        const [entry] = await log.recent()
        expect((entry.payload as any).content).toBe(text)
    })

    test('truncates nested array/object string values', async () => {
        const log = new RequestLogService()
        const longText = 'y'.repeat(15_000)
        await log.record({
            timestamp: 1,
            provider: 'p',
            kind: 'request',
            payload: {
                outer: { inner: { deep: [{ content: longText }] } },
            },
        })
        const [entry] = await log.recent()
        const deep = (entry.payload as any).outer.inner.deep[0].content
        expect(deep).toMatch(/\[truncated, original 15000 chars\]/)
    })

    test('preserves provider/kind/label/durationMs/timestamp on the entry', async () => {
        const log = new RequestLogService()
        await log.record({
            timestamp: 12345,
            provider: 'anthropic',
            kind: 'response',
            label: 'chatStream',
            durationMs: 250,
            payload: {},
        })
        const [entry] = await log.recent()
        expect(entry).toMatchObject({
            timestamp: 12345,
            provider: 'anthropic',
            kind: 'response',
            label: 'chatStream',
            durationMs: 250,
        })
    })
})
