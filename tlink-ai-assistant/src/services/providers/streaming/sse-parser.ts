/**
 * Shared SSE-stream parser used by every OpenAI-style chat provider
 * (OpenAI, Groq, OpenAI-compatible, GLM-axios, vLLM, Tabby, …).
 *
 * Before this lived in one place, each provider had its own near-identical
 * `chunk.toString().split('\n').filter(Boolean) → if line.startsWith('data: ')
 * → JSON.parse(line.slice(6))` ladder. They drifted over time:
 *   - some used `data: ` (with space), some `data:` (no space)
 *   - only the GLM-axios path correctly buffered partial lines across
 *     chunk boundaries; the others lost any JSON object that spanned a
 *     TCP-segment boundary, manifesting as silent token drops
 *   - none of them treated [DONE] consistently with whitespace
 *   - none cooperated with AbortSignal once the for-await loop entered a
 *     chunk
 *
 * This module collapses all of that into one tested implementation.
 */

export interface SseChunk {
    /** The raw `data:` payload — already stripped of the prefix and trimmed.
     *  `[DONE]` is filtered upstream so callers never see it. */
    data: string
}

export interface ParseSseOptions {
    /** When set, the generator returns at the next chunk boundary after the
     *  signal aborts. Provider's chatStream pipes its own AbortController
     *  here so unsubscribing tears the loop down promptly. */
    signal?: AbortSignal
}

/**
 * Streams SSE text from an async iterable (Node Readable, Web ReadableStream,
 * or any Symbol.asyncIterator yielding string / Buffer / Uint8Array) and
 * yields each `data:` payload as a string. Also accepts an already-buffered
 * string for the browser-axios path that returns SSE as a single text blob.
 *
 * Buffers across chunk boundaries — a JSON object split mid-line by TCP
 * segmentation is reassembled before being yielded. This was the source of
 * sporadic "missing tokens" bugs in GLM, vLLM, and ollama before
 * consolidation.
 */
export async function *parseSseStream (
    stream: AsyncIterable<unknown> | string,
    options: ParseSseOptions = {},
): AsyncGenerator<SseChunk> {
    if (typeof stream === 'string') {
        // Buffered text (browser-axios fallback). No chunk boundaries to
        // worry about; emit synchronously.
        for (const data of splitDataLines(stream)) {
            if (options.signal?.aborted) return
            yield { data }
        }
        return
    }

    let buffer = ''
    for await (const chunk of stream) {
        if (options.signal?.aborted) return
        buffer += decodeChunk(chunk)
        // Emit only up to the last newline; the trailing fragment stays
        // in `buffer` and gets prefixed onto the next chunk.
        const newlineIdx = buffer.lastIndexOf('\n')
        if (newlineIdx < 0) continue
        const ready = buffer.slice(0, newlineIdx)
        buffer = buffer.slice(newlineIdx + 1)
        for (const data of splitDataLines(ready)) {
            if (options.signal?.aborted) return
            yield { data }
        }
    }

    // Stream ended — flush any trailing line that wasn't newline-terminated.
    // Most servers terminate with `\n\n` so this is rare, but defensive.
    if (buffer.trim()) {
        for (const data of splitDataLines(buffer)) {
            if (options.signal?.aborted) return
            yield { data }
        }
    }
}

/**
 * Best-effort decode of an SSE chunk. axios in Node yields Buffer, in browser
 * yields string; ollama-via-fetch yields Uint8Array; vLLM yields ArrayBuffer
 * in some configurations. Handle all of them without a hard dependency on
 * Node Buffer (which would break browser builds).
 */
function decodeChunk (chunk: unknown): string {
    if (typeof chunk === 'string') return chunk
    if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk)
    if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(chunk))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = chunk as any
    if (c && typeof c.toString === 'function') return c.toString()
    return String(chunk ?? '')
}

/**
 * Pull `data:` payloads out of a multi-line SSE chunk. Tolerates:
 *   - `data: <payload>` and `data:<payload>` (some servers omit the space)
 *   - blank lines (event boundaries — we don't surface those)
 *   - non-`data:` fields (`event:`, `id:`, `retry:` — ignored, we don't use them)
 *   - the [DONE] sentinel — skipped so callers don't have to special-case it
 */
function *splitDataLines (text: string): Generator<string> {
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line) continue
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') continue
        yield data
    }
}
