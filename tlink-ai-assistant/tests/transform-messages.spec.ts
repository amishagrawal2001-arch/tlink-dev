/**
 * Provider transformMessages tests.
 *
 * Pins the "tool_call round-trip" invariant across OpenAI-compatible
 * providers. The same flatten-to-{role,content} bug hit Tabby, the
 * OpenAI-compatible base, and (in its fallback branch) Ollama — each
 * time causing a 4xx on the next turn because `tool_call_id` went
 * missing. These tests encode the contract: given a conversation with
 * an assistant tool_use + tool_result turn, the wire payload MUST
 * carry `tool_calls[*].id` and `tool_call_id` respectively.
 */
import { TabbyProviderService } from '../src/services/providers/tabby-provider.service';
import { OpenAIProviderService } from '../src/services/providers/openai-provider.service';
import { OllamaProviderService } from '../src/services/providers/ollama-provider.service';

class StubLogger {
    debug() {} info() {} warn() {} error() {}
}

type Provider = { transformMessages?: (msgs: any[]) => any[] };

function makeProvider<T>(Ctor: new (...args: any[]) => T): T & Provider {
    const p = new Ctor(new StubLogger() as any) as any;
    return p;
}

// transformMessages is `protected`. Reach past TypeScript's visibility
// via bracket access — it's a test, not a consumer.
function callTransform(p: any, msgs: any[]): any[] {
    return p['transformMessages'](msgs);
}

const CONVERSATION = [
    { role: 'system', content: 'You are an agent.' },
    { role: 'user', content: 'List the files.' },
    {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_abc', name: 'list_files', input: { path: '.' } }]
    },
    {
        role: 'tool',
        content: 'Tool execution completed',
        toolResults: [{ tool_use_id: 'call_abc', name: 'list_files', content: 'README.md\nsrc/' }]
    },
    { role: 'assistant', content: 'Here are the files: ...' }
];

describe('TabbyProviderService.transformMessages', () => {
    const p = makeProvider(TabbyProviderService);

    it('preserves tool_calls on assistant messages', () => {
        const out = callTransform(p, CONVERSATION);
        const assistantWithTools = out.find((m: any) => m.role === 'assistant' && m.tool_calls);
        expect(assistantWithTools).toBeTruthy();
        expect(assistantWithTools.tool_calls[0].id).toBe('call_abc');
        expect(assistantWithTools.tool_calls[0].function.name).toBe('list_files');
        expect(assistantWithTools.tool_calls[0].function.arguments).toBe(JSON.stringify({ path: '.' }));
    });

    it('emits tool-result messages with tool_call_id', () => {
        const out = callTransform(p, CONVERSATION);
        const toolMsg = out.find((m: any) => m.role === 'tool');
        expect(toolMsg).toBeTruthy();
        expect(toolMsg.tool_call_id).toBe('call_abc');
        expect(toolMsg.content).toContain('README.md');
    });
});

describe('OpenAIProviderService.transformMessages', () => {
    const p = makeProvider(OpenAIProviderService);

    it('preserves tool_calls on assistant messages', () => {
        const out = callTransform(p, CONVERSATION);
        const assistantWithTools = out.find((m: any) => m.role === 'assistant' && m.tool_calls);
        expect(assistantWithTools).toBeTruthy();
        expect(assistantWithTools.tool_calls[0].id).toBe('call_abc');
    });

    it('emits tool-result messages with tool_call_id', () => {
        const out = callTransform(p, CONVERSATION);
        const toolMsg = out.find((m: any) => m.role === 'tool');
        expect(toolMsg).toBeTruthy();
        expect(toolMsg.tool_call_id).toBe('call_abc');
    });
});

describe('OllamaProviderService.transformMessages', () => {
    const p = makeProvider(OllamaProviderService);

    it('preserves tool_calls on assistant messages', () => {
        const out = callTransform(p, CONVERSATION);
        const assistantWithTools = out.find((m: any) => m.role === 'assistant' && m.tool_calls);
        expect(assistantWithTools).toBeTruthy();
        expect(assistantWithTools.tool_calls[0].id).toBe('call_abc');
    });

    it('emits tool-result messages with tool_call_id', () => {
        const out = callTransform(p, CONVERSATION);
        const toolMsg = out.find((m: any) => m.role === 'tool');
        expect(toolMsg).toBeTruthy();
        expect(toolMsg.tool_call_id).toBe('call_abc');
    });

    it('does NOT relabel system as assistant (regression)', () => {
        const out = callTransform(p, [{ role: 'system', content: 'hi' }]);
        const rendered = out[0];
        // Previously this branch coerced anything non-user to assistant.
        expect(rendered.role).not.toBe('assistant');
    });
});
