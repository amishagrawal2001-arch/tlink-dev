import { AnthropicToolCallAccumulator } from '../src/services/providers/streaming/anthropic-tool-accumulator'

describe('AnthropicToolCallAccumulator', () => {
    test('emits tool_use_start on content_block_start.tool_use', () => {
        const acc = new AnthropicToolCallAccumulator()
        const events = acc.feed({
            type: 'content_block_start',
            content_block: { type: 'tool_use', id: 'tool_abc', name: 'search' },
        })
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'tool_use_start',
            toolCall: { id: 'tool_abc', name: 'search', input: {} },
        })
    })

    test('input_json_delta events accumulate silently', () => {
        const acc = new AnthropicToolCallAccumulator()
        acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_abc', name: 'search' } })
        expect(acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"q":' } })).toEqual([])
        expect(acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"hi"}' } })).toEqual([])
    })

    test('content_block_stop emits tool_use_end with parsed input', () => {
        const acc = new AnthropicToolCallAccumulator()
        acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_abc', name: 'search' } })
        acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"q":"hi"}' } })
        const events = acc.feed({ type: 'content_block_stop' })
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'tool_use_end',
            toolCall: { id: 'tool_abc', name: 'search', input: { q: 'hi' } },
        })
    })

    test('content_block_stop outside a tool block emits nothing', () => {
        // Anthropic sends content_block_stop for text blocks too — we
        // must NOT emit a tool_use_end for those.
        const acc = new AnthropicToolCallAccumulator()
        const events = acc.feed({ type: 'content_block_stop' })
        expect(events).toEqual([])
    })

    test('text_delta events are not handled (caller forwards inline)', () => {
        const acc = new AnthropicToolCallAccumulator()
        const events = acc.feed({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } })
        expect(events).toEqual([])
    })

    test('content_block_start for non-tool blocks is ignored', () => {
        const acc = new AnthropicToolCallAccumulator()
        const events = acc.feed({ type: 'content_block_start', content_block: { type: 'text', text: '' } })
        expect(events).toEqual([])
    })

    test('flush emits a closing tool_use_end when stream drops mid-tool', () => {
        const acc = new AnthropicToolCallAccumulator()
        acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'fn' } })
        acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } })
        const flushed = acc.flush()
        expect(flushed).toHaveLength(1)
        expect(flushed[0]).toMatchObject({ type: 'tool_use_end', toolCall: { name: 'fn', input: {} } })
    })

    test('flush is a no-op when no tool was open', () => {
        const acc = new AnthropicToolCallAccumulator()
        expect(acc.flush()).toEqual([])
    })

    test('handles two sequential tool calls in one stream', () => {
        const acc = new AnthropicToolCallAccumulator()
        acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'a' } })
        acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } })
        const e1 = acc.feed({ type: 'content_block_stop' })
        expect(e1[0].toolCall?.name).toBe('a')

        acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', id: 't2', name: 'b' } })
        acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"k":1}' } })
        const e2 = acc.feed({ type: 'content_block_stop' })
        expect(e2[0]).toMatchObject({ type: 'tool_use_end', toolCall: { id: 't2', name: 'b', input: { k: 1 } } })
    })

    test('malformed JSON in partial_json yields empty input', () => {
        const acc = new AnthropicToolCallAccumulator()
        acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'fn' } })
        acc.feed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{not valid' } })
        const events = acc.feed({ type: 'content_block_stop' })
        expect(events[0].toolCall?.input).toEqual({})
    })

    test('synthesises an id when content_block omits it', () => {
        const acc = new AnthropicToolCallAccumulator()
        const events = acc.feed({ type: 'content_block_start', content_block: { type: 'tool_use', name: 'fn' } })
        expect(events[0].toolCall?.id).toMatch(/^tool_\d+$/)
    })
})
