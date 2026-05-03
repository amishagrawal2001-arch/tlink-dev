import { StreamEvent } from '../../../types/ai.types'

/**
 * State machine for OpenAI-style streaming tool calls — used by OpenAI,
 * Groq, OpenAI-compatible, vLLM, Tabby, and any other `/chat/completions`
 * provider that emits `choices[0].delta.tool_calls[]`.
 *
 * The wire format streams tool-call fragments where each fragment carries
 * an `index` (which tool slot it belongs to) and may incrementally fill
 * in `id`, `function.name`, and `function.arguments`. The `arguments`
 * field is a JSON-string in pieces — concatenated across many deltas
 * until the slot transitions or the stream ends.
 *
 * Before consolidation this state machine was hand-rolled in 4+ providers;
 * it accreted small divergences (different `tool_${Date.now()}` ID
 * fallbacks, different graceful-degrade behavior on bad JSON, missing
 * stream-end flush in some, etc). One implementation now, one set of
 * guarantees.
 */
export class OpenAiToolCallAccumulator {
    private currentIndex = -1
    private currentId = ''
    private currentName = ''
    private currentArgs = ''

    /**
     * Feed a slice of `delta.tool_calls` (the array under
     * `choices[0].delta.tool_calls`). Returns 0..N events to forward to
     * the subscriber:
     *
     *   - `tool_use_end` for the previously-open tool when the index
     *     transitions to a new slot
     *   - `tool_use_start` when entering a brand-new slot
     *
     * Continuation fragments (same index, more `function.arguments` bytes)
     * accumulate silently and emit no events.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feed (toolCalls: any[]): StreamEvent[] {
        const events: StreamEvent[] = []
        for (const tc of toolCalls) {
            const index = tc?.index ?? 0
            if (this.currentIndex !== index) {
                if (this.currentIndex >= 0) {
                    events.push(this.endEvent())
                }
                this.currentIndex = index
                this.currentId = tc?.id || `tool_${Date.now()}_${index}`
                this.currentName = tc?.function?.name || ''
                this.currentArgs = tc?.function?.arguments || ''
                events.push({
                    type: 'tool_use_start',
                    toolCall: { id: this.currentId, name: this.currentName, input: {} },
                })
            } else if (tc?.function?.arguments) {
                this.currentArgs += tc.function.arguments
            }
        }
        return events
    }

    /**
     * Call when the SSE stream completes. Returns a closing
     * `tool_use_end` for any tool that was still open, or [] when there
     * was nothing pending.
     */
    flush (): StreamEvent[] {
        if (this.currentIndex < 0) return []
        const event = this.endEvent()
        this.currentIndex = -1
        this.currentId = ''
        this.currentName = ''
        this.currentArgs = ''
        return [event]
    }

    private endEvent (): StreamEvent {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let input: any = {}
        try {
            input = JSON.parse(this.currentArgs || '{}')
        } catch {
            // Malformed JSON — emit empty input rather than swallowing the
            // whole tool call. Downstream dispatch still fires; the
            // consequences are visible in tool-result handlers instead of
            // being a silent drop.
        }
        return {
            type: 'tool_use_end',
            toolCall: { id: this.currentId, name: this.currentName, input },
        }
    }
}
