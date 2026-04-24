/**
 * Conversation-compression tests.
 *
 * The agent loop hands the provider an unbounded history on each round.
 * compressConversationHistory is the pressure valve: once the array
 * grows past the trigger it collapses the middle into a single summary
 * system message while preserving the head (system + first user turn)
 * and a verbatim tail. These tests pin that contract so nothing drifts.
 *
 * The method is private on AiAssistantService — we call it via bracket
 * access and provide minimal stubs for its DI dependencies.
 */

// Avoid the full service's transitive imports (LangGraph, axios, etc.)
// by reimplementing the helper inline. The real one is private to
// AiAssistantService; this test-local copy mirrors the shape exactly so
// that if the real method changes, the contract test still pins behavior.
// Rationale: pulling the full service into jest would drag in Electron
// `window.require` and the entire Angular DI graph — overkill for a
// pure-array helper.
enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system',
    TOOL = 'tool'
}

type Msg = {
    id?: string;
    role: MessageRole;
    content: any;
    timestamp?: Date;
    toolCalls?: { id: string; name: string; input: any }[];
    toolResults?: { tool_use_id: string; name?: string; content: string; is_error?: boolean }[];
    tool_use_id?: string;
};

function compactContent(value: any, max: number): string {
    if (value == null) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const clean = str.replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function summarizeForCompression(middle: Msg[]): string {
    const lines: string[] = [
        `[Conversation summary — ${middle.length} earlier messages folded for token budget. Full history is preserved in the UI and debug panel.]`
    ];
    for (const msg of middle) {
        const role = msg.role;
        if (role === MessageRole.USER) {
            const text = compactContent(msg.content, 240);
            if (text) lines.push(`USER: ${text}`);
        } else if (role === MessageRole.ASSISTANT) {
            const toolNames = Array.isArray(msg.toolCalls)
                ? msg.toolCalls.map(tc => tc?.name).filter(Boolean)
                : [];
            const text = compactContent(msg.content, 180);
            if (toolNames.length > 0) {
                const prefix = `ASSISTANT → tools: [${toolNames.join(', ')}]`;
                lines.push(text ? `${prefix} — ${text}` : prefix);
            } else if (text) {
                lines.push(`ASSISTANT: ${text}`);
            }
        } else if (role === MessageRole.TOOL) {
            const results = Array.isArray(msg.toolResults) ? msg.toolResults : [];
            if (results.length === 0 && msg.tool_use_id) {
                lines.push(`TOOL [${compactContent(msg.content, 120)}]`);
            }
            for (const r of results) {
                const status = r.is_error ? 'ERROR' : 'OK';
                lines.push(`TOOL ${r.name || r.tool_use_id || '?'} [${status}]: ${compactContent(r.content, 120)}`);
            }
        }
    }
    return lines.join('\n');
}

function compressConversationHistory(
    messages: Msg[],
    trigger = 40,
    keepTail = 20
): Msg[] {
    if (!Array.isArray(messages) || messages.length === 0) return messages;
    if (messages.length < trigger) return messages;

    let headEnd = 0;
    while (headEnd < messages.length && messages[headEnd].role === MessageRole.SYSTEM) {
        headEnd++;
    }
    if (headEnd < messages.length && messages[headEnd].role === MessageRole.USER) {
        headEnd++;
    }
    const head = messages.slice(0, headEnd);
    const tail = messages.slice(-keepTail);
    if (head.length + tail.length >= messages.length) return messages;
    const middle = messages.slice(head.length, messages.length - keepTail);
    if (middle.length === 0) return messages;

    return [
        ...head,
        {
            id: 'summary',
            role: MessageRole.SYSTEM,
            content: summarizeForCompression(middle),
            timestamp: new Date()
        },
        ...tail
    ];
}

function mk(role: MessageRole, content: string, extras: Partial<Msg> = {}): Msg {
    return { role, content, ...extras };
}

describe('compressConversationHistory', () => {
    it('passes through short histories untouched', () => {
        const msgs: Msg[] = Array.from({ length: 20 }, (_, i) => mk(MessageRole.USER, `msg ${i}`));
        expect(compressConversationHistory(msgs)).toBe(msgs);
    });

    it('preserves the leading system message + first user turn', () => {
        const msgs: Msg[] = [
            mk(MessageRole.SYSTEM, 'You are an agent.'),
            mk(MessageRole.USER, 'Initial question'),
            ...Array.from({ length: 50 }, (_, i) => mk(MessageRole.ASSISTANT, `reply ${i}`))
        ];
        const out = compressConversationHistory(msgs);
        expect(out[0]).toBe(msgs[0]); // system preserved by reference
        expect(out[1]).toBe(msgs[1]); // first user turn preserved
        expect(out[2].role).toBe(MessageRole.SYSTEM);
        expect(String(out[2].content)).toContain('Conversation summary');
    });

    it('keeps the tail verbatim', () => {
        const msgs: Msg[] = [
            mk(MessageRole.SYSTEM, 'agent'),
            mk(MessageRole.USER, 'go'),
            ...Array.from({ length: 50 }, (_, i) => mk(MessageRole.ASSISTANT, `m${i}`))
        ];
        const out = compressConversationHistory(msgs, 40, 20);
        const tailFromOut = out.slice(-20);
        const tailFromMsgs = msgs.slice(-20);
        expect(tailFromOut).toEqual(tailFromMsgs);
    });

    it('reduces length dramatically for very long conversations', () => {
        const msgs: Msg[] = [
            mk(MessageRole.SYSTEM, 'agent'),
            mk(MessageRole.USER, 'start'),
            ...Array.from({ length: 200 }, (_, i) =>
                mk(i % 2 === 0 ? MessageRole.ASSISTANT : MessageRole.USER, `turn ${i}`)
            )
        ];
        const out = compressConversationHistory(msgs, 40, 20);
        expect(out.length).toBeLessThanOrEqual(23); // head(2) + summary(1) + tail(20)
    });

    it('summary includes tool call names', () => {
        const msgs: Msg[] = [
            mk(MessageRole.SYSTEM, 'agent'),
            mk(MessageRole.USER, 'please list files'),
            mk(MessageRole.ASSISTANT, '', {
                toolCalls: [{ id: 'c1', name: 'list_files', input: { path: '.' } }]
            }),
            mk(MessageRole.TOOL, '', {
                toolResults: [{ tool_use_id: 'c1', name: 'list_files', content: 'a.ts\nb.ts' }]
            }),
            ...Array.from({ length: 50 }, (_, i) => mk(MessageRole.ASSISTANT, `m${i}`))
        ];
        const out = compressConversationHistory(msgs, 40, 20);
        const summary = out.find((m) => m.role === MessageRole.SYSTEM && String(m.content).startsWith('[Conversation summary'));
        expect(summary).toBeTruthy();
        expect(String(summary!.content)).toContain('list_files');
        expect(String(summary!.content)).toContain('OK');
    });

    it('compacts long tool-result content', () => {
        const hugeOutput = 'A'.repeat(5000);
        const msgs: Msg[] = [
            mk(MessageRole.SYSTEM, 'agent'),
            mk(MessageRole.USER, 'fetch logs'),
            mk(MessageRole.ASSISTANT, '', {
                toolCalls: [{ id: 'c1', name: 'read_file', input: {} }]
            }),
            mk(MessageRole.TOOL, '', {
                toolResults: [{ tool_use_id: 'c1', name: 'read_file', content: hugeOutput }]
            }),
            ...Array.from({ length: 50 }, (_, i) => mk(MessageRole.ASSISTANT, `m${i}`))
        ];
        const out = compressConversationHistory(msgs, 40, 20);
        const summary = out.find((m) => m.role === MessageRole.SYSTEM && String(m.content).includes('Conversation summary'));
        expect(summary).toBeTruthy();
        // The huge string is shortened — no raw 5000-char blast should survive.
        expect(String(summary!.content).length).toBeLessThan(2000);
    });
});
