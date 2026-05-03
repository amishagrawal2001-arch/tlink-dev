import { OpenAiToolCallAccumulator } from '../src/services/providers/streaming/openai-tool-accumulator'

describe('OpenAiToolCallAccumulator', () => {
    test('emits tool_use_start on first delta with new index', () => {
        const acc = new OpenAiToolCallAccumulator()
        const events = acc.feed([{ index: 0, id: 't1', function: { name: 'search', arguments: '{"q":' } }])
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'tool_use_start',
            toolCall: { id: 't1', name: 'search', input: {} },
        })
    })

    test('continuation deltas (same index) accumulate silently', () => {
        const acc = new OpenAiToolCallAccumulator()
        acc.feed([{ index: 0, id: 't1', function: { name: 'search', arguments: '{"q":' } }])
        const events = acc.feed([{ index: 0, function: { arguments: '"hello"}' } }])
        expect(events).toEqual([])

        const flushed = acc.flush()
        expect(flushed).toHaveLength(1)
        expect(flushed[0]).toMatchObject({
            type: 'tool_use_end',
            toolCall: { id: 't1', name: 'search', input: { q: 'hello' } },
        })
    })

    test('index transition emits tool_use_end + tool_use_start back-to-back', () => {
        const acc = new OpenAiToolCallAccumulator()
        acc.feed([{ index: 0, id: 't1', function: { name: 'search', arguments: '{"q":"a"}' } }])
        const events = acc.feed([{ index: 1, id: 't2', function: { name: 'fetch', arguments: '{}' } }])
        expect(events).toHaveLength(2)
        expect(events[0]).toMatchObject({ type: 'tool_use_end', toolCall: { id: 't1', name: 'search', input: { q: 'a' } } })
        expect(events[1]).toMatchObject({ type: 'tool_use_start', toolCall: { id: 't2', name: 'fetch' } })
    })

    test('flush emits tool_use_end for the last open tool', () => {
        const acc = new OpenAiToolCallAccumulator()
        acc.feed([{ index: 0, id: 't1', function: { name: 'noop', arguments: '{}' } }])
        const flushed = acc.flush()
        expect(flushed).toHaveLength(1)
        expect(flushed[0]).toMatchObject({ type: 'tool_use_end', toolCall: { name: 'noop', input: {} } })
    })

    test('flush is idempotent', () => {
        const acc = new OpenAiToolCallAccumulator()
        acc.feed([{ index: 0, id: 't1', function: { name: 'noop', arguments: '{}' } }])
        const first = acc.flush()
        const second = acc.flush()
        expect(first).toHaveLength(1)
        expect(second).toEqual([])
    })

    test('malformed JSON in arguments yields empty input rather than dropping the tool call', () => {
        const acc = new OpenAiToolCallAccumulator()
        acc.feed([{ index: 0, id: 't1', function: { name: 'broken', arguments: '{not valid' } }])
        const events = acc.flush()
        expect(events[0]).toMatchObject({ type: 'tool_use_end', toolCall: { name: 'broken', input: {} } })
    })

    test('synthesises an id when the first delta omits it', () => {
        const acc = new OpenAiToolCallAccumulator()
        const events = acc.feed([{ index: 0, function: { name: 'fn', arguments: '{}' } }])
        expect(events[0].toolCall?.id).toMatch(/^tool_\d+_0$/)
    })

    test('handles arguments split across many continuation deltas', () => {
        const acc = new OpenAiToolCallAccumulator()
        acc.feed([{ index: 0, id: 't1', function: { name: 'fn', arguments: '{"a":' } }])
        acc.feed([{ index: 0, function: { arguments: '1, "b":' } }])
        acc.feed([{ index: 0, function: { arguments: '"x"}' } }])
        const flushed = acc.flush()
        expect(flushed[0].toolCall?.input).toEqual({ a: 1, b: 'x' })
    })

    test('feed with empty array is a no-op', () => {
        const acc = new OpenAiToolCallAccumulator()
        expect(acc.feed([])).toEqual([])
    })
})
