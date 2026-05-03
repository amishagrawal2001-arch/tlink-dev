import { UsageAggregatorService } from '../src/services/core/usage-aggregator.service'
import { ChatMessage, MessageRole } from '../src/types/ai.types'

function aiMessage (
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    provider?: string,
    model?: string,
    timestamp: Date = new Date(),
): ChatMessage {
    return {
        id: Math.random().toString(36).slice(2),
        role: MessageRole.ASSISTANT,
        content: '',
        timestamp,
        metadata: usage ? { usage, provider, model } : undefined,
    }
}

describe('UsageAggregatorService.aggregate', () => {
    const svc = new UsageAggregatorService()

    test('returns zero aggregate for empty input', () => {
        expect(svc.aggregate([])).toMatchObject({
            messageCount: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            totalCost: 0,
        })
    })

    test('skips messages without usage metadata', () => {
        const messages = [
            { id: '1', role: MessageRole.USER, content: 'hi', timestamp: new Date() },
            aiMessage(),  // AI message but no usage
        ] as ChatMessage[]
        expect(svc.aggregate(messages).messageCount).toBe(0)
    })

    test('sums tokens across multiple AI messages', () => {
        const messages = [
            aiMessage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
            aiMessage({ promptTokens: 200, completionTokens: 100, totalTokens: 300 }),
            aiMessage({ promptTokens: 50, completionTokens: 25, totalTokens: 75 }),
        ]
        expect(svc.aggregate(messages)).toMatchObject({
            messageCount: 3,
            promptTokens: 350,
            completionTokens: 175,
            totalTokens: 525,
        })
    })

    test('computes cost using each message\'s stamped provider+model', () => {
        const messages = [
            // gpt-4o: $2.5/$10 per million
            aiMessage({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }, 'openai', 'gpt-4o'),
            // claude-3-5-sonnet: $3/$15 per million
            aiMessage({ promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 }, 'anthropic', 'claude-3-5-sonnet'),
        ]
        const agg = svc.aggregate(messages)
        // openai: 1000/1M * 2.5 + 500/1M * 10 = 0.0025 + 0.005 = 0.0075
        // anthropic: 2000/1M * 3 + 1000/1M * 15 = 0.006 + 0.015 = 0.021
        // total = 0.0285
        expect(agg.totalCost).toBeCloseTo(0.0285, 5)
    })

    test('zero cost when provider/model context missing', () => {
        // Older message has usage but no provider+model stamp.
        const messages = [
            aiMessage({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }),
        ]
        const agg = svc.aggregate(messages)
        expect(agg.totalTokens).toBe(1500)
        expect(agg.totalCost).toBe(0)
    })

    test('self-hosted providers contribute tokens but no cost', () => {
        const messages = [
            aiMessage({ promptTokens: 5000, completionTokens: 2000, totalTokens: 7000 }, 'vllm', 'llama-3.1-8b'),
            aiMessage({ promptTokens: 3000, completionTokens: 1500, totalTokens: 4500 }, 'ollama', 'qwen2.5'),
        ]
        const agg = svc.aggregate(messages)
        expect(agg.totalTokens).toBe(11500)
        expect(agg.totalCost).toBe(0)
    })

    test('mixed local + cloud sums only the cloud cost', () => {
        const messages = [
            aiMessage({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }, 'openai', 'gpt-4o'),
            aiMessage({ promptTokens: 5000, completionTokens: 2000, totalTokens: 7000 }, 'vllm', 'llama-3.1-8b'),
        ]
        const agg = svc.aggregate(messages)
        expect(agg.totalTokens).toBe(8500)
        // Only the openai message contributes cost.
        expect(agg.totalCost).toBeCloseTo(0.0075, 5)
    })
})

describe('UsageAggregatorService.aggregateSince', () => {
    const svc = new UsageAggregatorService()

    test('filters by timestamp', () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const today = new Date()
        const messages = [
            aiMessage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }, 'openai', 'gpt-4o', yesterday),
            aiMessage({ promptTokens: 200, completionTokens: 100, totalTokens: 300 }, 'openai', 'gpt-4o', today),
        ]
        const todayMidnight = new Date()
        todayMidnight.setHours(0, 0, 0, 0)
        const agg = svc.aggregateSince(messages, todayMidnight)
        expect(agg.messageCount).toBe(1)
        expect(agg.totalTokens).toBe(300)
    })

    test('handles ISO-string timestamps gracefully', () => {
        const past = new Date(Date.now() - 1_000_000)
        const recent = new Date()
        const messages = [
            { ...aiMessage({ promptTokens: 50, completionTokens: 25, totalTokens: 75 }), timestamp: past.toISOString() as any },
            { ...aiMessage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }), timestamp: recent.toISOString() as any },
        ] as ChatMessage[]
        const agg = svc.aggregateSince(messages, new Date(Date.now() - 500_000))
        expect(agg.messageCount).toBe(1)
        expect(agg.totalTokens).toBe(150)
    })
})
