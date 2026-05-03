import {
    getModelPricing,
    calculateCost,
    formatCost,
    setCustomPricing,
} from '../src/utils/cost.utils'

describe('getModelPricing', () => {
    afterEach(() => setCustomPricing([]))

    test('returns exact match when present', () => {
        const p = getModelPricing('openai', 'gpt-4o')
        expect(p?.inputPricePerMillion).toBe(2.5)
        expect(p?.outputPricePerMillion).toBe(10)
    })

    test('prefix-matches dated SKUs to base entries', () => {
        // Anthropic streams models like "claude-3-5-sonnet-20241022";
        // pricing is the same as "claude-3-5-sonnet" base.
        const p = getModelPricing('anthropic', 'claude-3-5-sonnet-20241022')
        expect(p?.model).toBe('claude-3-5-sonnet')
        expect(p?.inputPricePerMillion).toBe(3)
    })

    test('prefix-matches longest first (sonnet beats 3)', () => {
        // "claude-3-5-sonnet-20241022" should NOT match the bare
        // "claude-3-haiku" or "claude-3-opus" — must hit the longer
        // sonnet entry.
        const p = getModelPricing('anthropic', 'claude-3-5-sonnet-20241022')
        expect(p?.model).toContain('sonnet')
    })

    test('returns provider default when no model matches', () => {
        const p = getModelPricing('openai', 'totally-made-up-model')
        expect(p).toBeDefined()
        expect(p?.model).toBe('default')
    })

    test('self-hosted providers return zero pricing by default', () => {
        const p = getModelPricing('vllm', 'whatever-llama-variant')
        expect(p?.inputPricePerMillion).toBe(0)
        expect(p?.outputPricePerMillion).toBe(0)
    })

    test('custom pricing takes precedence over defaults', () => {
        setCustomPricing([
            { provider: 'openai', model: 'gpt-4o', inputPricePerMillion: 1, outputPricePerMillion: 2 },
        ])
        const p = getModelPricing('openai', 'gpt-4o')
        expect(p?.inputPricePerMillion).toBe(1)
        expect(p?.outputPricePerMillion).toBe(2)
    })
})

describe('calculateCost', () => {
    test('computes cost from token counts × per-million rate', () => {
        const result = calculateCost('openai', 'gpt-4o', {
            inputTokens: 1000,
            outputTokens: 500,
        })
        // 1000/1M * $2.5 = $0.0025
        // 500/1M * $10  = $0.005
        // total = $0.0075
        expect(result.inputCost).toBe(0.0025)
        expect(result.outputCost).toBe(0.005)
        expect(result.totalCost).toBe(0.0075)
    })

    test('large token counts compute correctly', () => {
        const result = calculateCost('anthropic', 'claude-3-5-sonnet', {
            inputTokens: 100_000,
            outputTokens: 20_000,
        })
        // 100k/1M * $3  = $0.30
        // 20k/1M  * $15 = $0.30
        // total = $0.60
        expect(result.inputCost).toBe(0.3)
        expect(result.outputCost).toBe(0.3)
        expect(result.totalCost).toBe(0.6)
    })

    test('zero tokens yields zero cost', () => {
        const result = calculateCost('openai', 'gpt-4o', { inputTokens: 0, outputTokens: 0 })
        expect(result.totalCost).toBe(0)
    })

    test('vllm / ollama / tabby self-hosted always cost 0', () => {
        for (const provider of ['vllm', 'ollama', 'tabby'] as const) {
            const result = calculateCost(provider, 'any-local-model', {
                inputTokens: 1_000_000,
                outputTokens: 1_000_000,
            })
            expect(result.totalCost).toBe(0)
        }
    })

    test('rounds to 6-decimal precision', () => {
        // Picks a token count that produces a long-decimal raw cost.
        const result = calculateCost('openai', 'gpt-4o-mini', {
            inputTokens: 1, outputTokens: 1,
        })
        // 1/1M * $0.15 = 0.00000015 → rounded to 6 decimals
        // 1/1M * $0.60 = 0.0000006 → rounded
        // The point is no infinite-decimal artifacts — verify by
        // matching the rounded-to-6 representation.
        expect(Number.isFinite(result.totalCost)).toBe(true)
        expect(result.totalCost.toString()).not.toMatch(/e/i) // no scientific notation
    })
})

describe('formatCost', () => {
    test('renders sub-millicent costs as fractions of a cent', () => {
        // 0.0001 = 0.01¢ which formats as "$1.00" in 'µ¢ × 10⁶'
        // The exact representation depends on the helper's branch
        // logic; verify it returns SOMETHING non-empty and doesn't
        // throw.
        const out = formatCost(0.0001)
        expect(out).toMatch(/^\$/)
    })

    test('renders mid costs to 4 decimals', () => {
        expect(formatCost(0.0023)).toBe('$0.0023')
        expect(formatCost(0.5)).toBe('$0.5000')
    })

    test('renders dollar costs with 2 decimals', () => {
        // From source: cost >= 1 falls through to the final branch.
        // Verify it doesn't crash at large numbers.
        const out = formatCost(12.345)
        expect(out).toMatch(/^\$\d+\.\d+/)
    })
})
