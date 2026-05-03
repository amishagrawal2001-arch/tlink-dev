import { StreamEvent } from '../../../types/ai.types'

/**
 * State machine for Anthropic-style streaming tool calls — used by the
 * Anthropic provider directly and by GLM / Minimax when they're talking
 * to the Anthropic-shaped variant of their endpoints (`/api/anthropic`,
 * etc).
 *
 * The wire format frames tool calls as content-block lifecycle events:
 *
 *   1. `content_block_start` with `content_block.type === 'tool_use'`
 *      — opens a tool slot. We surface a `tool_use_start` immediately.
 *   2. `content_block_delta` with `delta.type === 'input_json_delta'`
 *      — incrementally fills `partial_json`. We accumulate silently.
 *   3. `content_block_stop` — closes the slot. We surface
 *      `tool_use_end` with the parsed JSON args.
 *
 * Text-content blocks fire the same `content_block_*` envelope but with
 * `delta.type === 'text_delta'`; those are handled by the caller (we only
 * track tool-use state here).
 *
 * Before consolidation: same logic copy-pasted across Anthropic, GLM
 * (Anthropic mode), and Minimax. One implementation now.
 */
export class AnthropicToolCallAccumulator {
    private currentId = ''
    private currentName = ''
    private currentArgs = ''
    private inToolUse = false

    /**
     * Feed one Anthropic SSE event. Returns 0..N stream events:
     *   - 1 `tool_use_start` on entering a tool block
     *   - 0 events on `input_json_delta` (silent accumulation)
     *   - 1 `tool_use_end` on `content_block_stop` when in a tool block
     *   - 0 events on any unrelated event type (text_delta,
     *     message_start, message_stop, content_block_start for non-tool
     *     blocks, etc — the caller handles those)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feed (event: any): StreamEvent[] {
        if (
            event?.type === 'content_block_start' &&
            event?.content_block?.type === 'tool_use'
        ) {
            this.currentId = event.content_block.id || `tool_${Date.now()}`
            this.currentName = event.content_block.name || ''
            this.currentArgs = ''
            this.inToolUse = true
            return [{
                type: 'tool_use_start',
                toolCall: { id: this.currentId, name: this.currentName, input: {} },
            }]
        }

        if (
            event?.type === 'content_block_delta' &&
            event?.delta?.type === 'input_json_delta'
        ) {
            this.currentArgs += event.delta.partial_json || ''
            return []
        }

        if (event?.type === 'content_block_stop' && this.inToolUse) {
            const events = [this.endEvent()]
            this.reset()
            return events
        }

        return []
    }

    /**
     * Stream-end safety net. Anthropic always closes blocks with
     * `content_block_stop`, so this is normally a no-op. If the upstream
     * dropped mid-tool (network error, abort), we still surface the
     * accumulated partial so downstream tool dispatchers can decide what
     * to do rather than waiting forever.
     */
    flush (): StreamEvent[] {
        if (!this.inToolUse) return []
        const events = [this.endEvent()]
        this.reset()
        return events
    }

    private endEvent (): StreamEvent {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let input: any = {}
        try {
            input = JSON.parse(this.currentArgs || '{}')
        } catch {
            // Malformed JSON — emit empty input. Same rationale as the
            // OpenAI accumulator: visible-but-empty beats silent drop.
        }
        return {
            type: 'tool_use_end',
            toolCall: { id: this.currentId, name: this.currentName, input },
        }
    }

    private reset (): void {
        this.currentId = ''
        this.currentName = ''
        this.currentArgs = ''
        this.inToolUse = false
    }
}
