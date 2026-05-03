import { parseSseStream } from '../src/services/providers/streaming/sse-parser'

/** Yield values one at a time so the parser sees genuine async iteration. */
async function *fromArray<T> (xs: T[]): AsyncGenerator<T> {
    for (const x of xs) {yield x}
}

async function collect<T> (gen: AsyncGenerator<T>): Promise<T[]> {
    const out: T[] = []
    for await (const x of gen) {out.push(x)}
    return out
}

describe('parseSseStream', () => {
    test('yields data payloads from a buffered string', async () => {
        const text = [
            'data: {"a":1}',
            'data: {"a":2}',
            'data: [DONE]',
            '',
        ].join('\n')
        const out = await collect(parseSseStream(text))
        expect(out).toEqual([{ data: '{"a":1}' }, { data: '{"a":2}' }])
    })

    test('strips both `data: ` (with space) and `data:` (no space)', async () => {
        const text = ['data:{"x":1}', 'data: {"y":2}'].join('\n')
        const out = await collect(parseSseStream(text))
        expect(out).toEqual([{ data: '{"x":1}' }, { data: '{"y":2}' }])
    })

    test('skips blank lines, comments, and non-data SSE fields', async () => {
        const text = [
            ': keep-alive comment',
            'event: ping',
            'id: 42',
            '',
            'data: {"ok":true}',
            '',
        ].join('\n')
        const out = await collect(parseSseStream(text))
        expect(out).toEqual([{ data: '{"ok":true}' }])
    })

    test('reassembles a JSON payload split across chunk boundaries', async () => {
        // Simulate a TCP segmentation that cuts a single line in half. The
        // old per-provider parsers dropped this line silently — manifested
        // as missing tokens in long responses.
        const chunks = [
            'data: {"a":1, "b":',
            '"split"}\ndata: {"c":3}\n',
        ]
        const out = await collect(parseSseStream(fromArray(chunks)))
        expect(out).toEqual([
            { data: '{"a":1, "b":"split"}' },
            { data: '{"c":3}' },
        ])
    })

    test('decodes Uint8Array chunks (fetch-style)', async () => {
        const enc = new TextEncoder()
        const chunks = [
            enc.encode('data: {"a":1}\n'),
            enc.encode('data: {"a":2}\n'),
        ]
        const out = await collect(parseSseStream(fromArray(chunks)))
        expect(out).toEqual([{ data: '{"a":1}' }, { data: '{"a":2}' }])
    })

    test('respects an aborted signal mid-stream', async () => {
        const ac = new AbortController()
        async function *src (): AsyncGenerator<string> {
            yield 'data: {"a":1}\n'
            ac.abort()
            yield 'data: {"a":2}\n'
        }
        const out = await collect(parseSseStream(src(), { signal: ac.signal }))
        expect(out).toEqual([{ data: '{"a":1}' }])
    })

    test('flushes a trailing line not terminated by newline', async () => {
        const out = await collect(parseSseStream(fromArray(['data: {"trail":1}'])))
        expect(out).toEqual([{ data: '{"trail":1}' }])
    })

    test('skips [DONE] sentinel', async () => {
        const text = ['data: {"a":1}', 'data: [DONE]'].join('\n')
        const out = await collect(parseSseStream(text))
        expect(out).toEqual([{ data: '{"a":1}' }])
    })
})
