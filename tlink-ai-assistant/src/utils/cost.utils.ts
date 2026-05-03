/**
 * API成本计算工具类
 * 提供各AI提供商的API调用成本估算功能
 */

/**
 * AI提供商类型
 *
 * Provider list mirrors the registered providers in
 * src/services/providers/ — adding a new provider here without
 * adding it to DEFAULT_PRICING below means the cost calculator
 * silently returns 0 for that provider's calls. Acceptable; we
 * prefer "no cost shown" over "made-up cost".
 */
export type AIProvider =
    | 'openai'
    | 'anthropic'
    | 'minimax'
    | 'glm'
    | 'groq'
    | 'vllm'
    | 'ollama'
    | 'tabby'
    | 'tlink-agent'
    | 'tlink-proxy'
    | 'openai-compatible';

/**
 * 模型定价信息
 */
export interface ModelPricing {
    provider: AIProvider;
    model: string;
    inputPricePerMillion: number;  // 每百万输入token的价格（美元）
    outputPricePerMillion: number; // 每百万输出token的价格（美元）
}

/**
 * Token使用信息
 */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}

/**
 * 成本计算结果
 */
export interface CostResult {
    inputCost: number;       // 输入成本（美元）
    outputCost: number;      // 输出成本（美元）
    totalCost: number;       // 总成本（美元）
    inputPricePerMillion: number;
    outputPricePerMillion: number;
}

/**
 * Default per-million-token pricing in USD. Numbers track public list
 * prices from each provider's docs. Prefix matching is allowed (see
 * `getModelPricing`) so "gpt-4o-2024-08-06" gracefully resolves to the
 * "gpt-4o" entry below — provider model SKUs change versions often
 * and we'd rather show approximate cost than $0.
 */
const DEFAULT_PRICING: ModelPricing[] = [
    // OpenAI — pricing as of late 2024.
    { provider: 'openai', model: 'gpt-4o', inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    { provider: 'openai', model: 'gpt-4o-mini', inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    { provider: 'openai', model: 'gpt-4-turbo', inputPricePerMillion: 10, outputPricePerMillion: 30 },
    { provider: 'openai', model: 'gpt-4', inputPricePerMillion: 30, outputPricePerMillion: 60 },
    { provider: 'openai', model: 'gpt-3.5-turbo', inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    { provider: 'openai', model: 'o1', inputPricePerMillion: 15, outputPricePerMillion: 60 },
    { provider: 'openai', model: 'o1-mini', inputPricePerMillion: 3, outputPricePerMillion: 12 },

    // Anthropic — pricing as of late 2024 / early 2025.
    { provider: 'anthropic', model: 'claude-3-5-sonnet', inputPricePerMillion: 3, outputPricePerMillion: 15 },
    { provider: 'anthropic', model: 'claude-3-5-haiku', inputPricePerMillion: 0.8, outputPricePerMillion: 4 },
    { provider: 'anthropic', model: 'claude-3-opus', inputPricePerMillion: 15, outputPricePerMillion: 75 },
    { provider: 'anthropic', model: 'claude-3-sonnet', inputPricePerMillion: 3, outputPricePerMillion: 15 },
    { provider: 'anthropic', model: 'claude-3-haiku', inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },
    { provider: 'anthropic', model: 'claude-sonnet-4', inputPricePerMillion: 3, outputPricePerMillion: 15 },
    { provider: 'anthropic', model: 'claude-opus-4', inputPricePerMillion: 15, outputPricePerMillion: 75 },

    // Groq — published list prices, mostly llama variants.
    { provider: 'groq', model: 'llama-3.3-70b', inputPricePerMillion: 0.59, outputPricePerMillion: 0.79 },
    { provider: 'groq', model: 'llama-3.1-70b', inputPricePerMillion: 0.59, outputPricePerMillion: 0.79 },
    { provider: 'groq', model: 'llama-3.1-8b', inputPricePerMillion: 0.05, outputPricePerMillion: 0.08 },
    { provider: 'groq', model: 'mixtral-8x7b', inputPricePerMillion: 0.24, outputPricePerMillion: 0.24 },

    // Minimax
    { provider: 'minimax', model: 'abab6.5s-chat', inputPricePerMillion: 0.3, outputPricePerMillion: 0.3 },
    { provider: 'minimax', model: 'abab6.5-chat', inputPricePerMillion: 0.5, outputPricePerMillion: 0.5 },
    { provider: 'minimax', model: 'abab5.5-chat', inputPricePerMillion: 1, outputPricePerMillion: 1 },
    { provider: 'minimax', model: 'MiniMax-M2', inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },

    // GLM (智谱)
    { provider: 'glm', model: 'glm-4.6', inputPricePerMillion: 0.6, outputPricePerMillion: 2 },
    { provider: 'glm', model: 'glm-4', inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    { provider: 'glm', model: 'glm-4v', inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    { provider: 'glm', model: 'glm-3-turbo', inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },

    // Self-hosted / local providers — zero cost (you're paying for the
    // hardware/electricity, not per-token). Listed explicitly so the
    // fallback in getDefaultPricingForProvider doesn't accidentally
    // report a non-zero number for these.
    { provider: 'vllm', model: 'default', inputPricePerMillion: 0, outputPricePerMillion: 0 },
    { provider: 'ollama', model: 'default', inputPricePerMillion: 0, outputPricePerMillion: 0 },
    { provider: 'tabby', model: 'default', inputPricePerMillion: 0, outputPricePerMillion: 0 },
];

// 自定义定价表（可扩展）
let customPricing: ModelPricing[] = [];

/**
 * 设置自定义模型定价
 */
export function setCustomPricing(pricing: ModelPricing[]): void {
    customPricing = [...pricing];
}

/**
 * 获取模型定价信息
 *
 * Lookup order:
 *   1. Exact match on customPricing
 *   2. Exact match on DEFAULT_PRICING
 *   3. Prefix match on DEFAULT_PRICING (handles SKU drift like
 *      "claude-3-5-sonnet-20241022" → "claude-3-5-sonnet" entry)
 *   4. Provider-level default
 *   5. undefined (caller surfaces $0)
 */
export function getModelPricing(provider: AIProvider, model: string): ModelPricing | undefined {
    const custom = customPricing.find(p => p.provider === provider && p.model === model);
    if (custom) {return custom;}

    const exact = DEFAULT_PRICING.find(p => p.provider === provider && p.model === model);
    if (exact) {return exact;}

    // Prefix match — sorted by descending model-name length so the
    // longest match wins ("claude-3-5-sonnet" beats "claude-3" for a
    // SKU like "claude-3-5-sonnet-20241022").
    const candidates = DEFAULT_PRICING
        .filter(p => p.provider === provider && model.toLowerCase().startsWith(p.model.toLowerCase()))
        .sort((a, b) => b.model.length - a.model.length);
    if (candidates.length > 0) {return candidates[0];}

    return getDefaultPricingForProvider(provider);
}

/**
 * 获取提供商的默认定价
 */
function getDefaultPricingForProvider(provider: AIProvider): ModelPricing | undefined {
    // Conservative defaults — when we have no specific model match,
    // fall back to a number that's roughly representative of the
    // provider's mid-tier model. Self-hosted providers (vllm/ollama/
    // tabby) report 0 because the user is paying for hardware/power,
    // not per-token. tlink-* are routed through our own cloud and
    // billed via the user's Tlink plan, not by-token here.
    const providerDefaults: Record<AIProvider, Partial<ModelPricing>> = {
        'openai': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
        'anthropic': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
        'groq': { inputPricePerMillion: 0.59, outputPricePerMillion: 0.79 },
        'minimax': { inputPricePerMillion: 0.5, outputPricePerMillion: 0.5 },
        'glm': { inputPricePerMillion: 0.5, outputPricePerMillion: 1 },
        'vllm': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        'ollama': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        'tabby': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        'tlink-agent': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        'tlink-proxy': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        'openai-compatible': { inputPricePerMillion: 1, outputPricePerMillion: 2 }
    };

    const defaults = providerDefaults[provider];
    if (defaults) {
        return {
            provider,
            model: 'default',
            inputPricePerMillion: defaults.inputPricePerMillion ?? 1,
            outputPricePerMillion: defaults.outputPricePerMillion ?? 2
        };
    }

    return undefined;
}

/**
 * 计算API调用成本
 * @param provider AI提供商
 * @param model 模型名称
 * @param usage Token使用情况
 * @returns 成本计算结果
 */
export function calculateCost(
    provider: AIProvider,
    model: string,
    usage: TokenUsage
): CostResult {
    const pricing = getModelPricing(provider, model);

    if (!pricing) {
        // 未知提供商，返回零成本
        return {
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            inputPricePerMillion: 0,
            outputPricePerMillion: 0
        };
    }

    const inputCost = (usage.inputTokens / 1000000) * pricing.inputPricePerMillion;
    const outputCost = (usage.outputTokens / 1000000) * pricing.outputPricePerMillion;

    return {
        inputCost: Math.round(inputCost * 1000000) / 1000000, // 保留6位小数
        outputCost: Math.round(outputCost * 1000000) / 1000000,
        totalCost: Math.round((inputCost + outputCost) * 1000000) / 1000000,
        inputPricePerMillion: pricing.inputPricePerMillion,
        outputPricePerMillion: pricing.outputPricePerMillion
    };
}

/**
 * 计算摘要生成成本
 */
export function calculateSummaryCost(
    provider: AIProvider,
    model: string,
    originalMessageCount: number,
    tokensUsed: number
): CostResult {
    // 摘要生成主要是输入成本
    const pricing = getModelPricing(provider, model);

    if (!pricing) {
        return {
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            inputPricePerMillion: 0,
            outputPricePerMillion: 0
        };
    }

    // 估算摘要的输入和输出token（假设输出占输入的5%）
    const estimatedInputTokens = tokensUsed;
    const estimatedOutputTokens = Math.floor(tokensUsed * 0.05);

    return calculateCost(provider, model, {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens
    });
}

/**
 * 格式化成本为可读字符串
 */
export function formatCost(cost: number): string {
    if (cost < 0.001) {
        return `$${(cost * 1000000).toFixed(2)}`;
    } else if (cost < 1) {
        return `$${cost.toFixed(4)}`;
    } else {
        return `$${cost.toFixed(2)}`;
    }
}

/**
 * 格式化成本详细信息
 */
export function formatCostDetail(result: CostResult): string {
    const parts: string[] = [];

    if (result.inputCost > 0) {
        parts.push(`输入: ${formatCost(result.inputCost)}`);
    }
    if (result.outputCost > 0) {
        parts.push(`输出: ${formatCost(result.outputCost)}`);
    }

    return parts.join(', ') + ` (总计: ${formatCost(result.totalCost)})`;
}

/**
 * 估算消息的Token数量
 */
export function estimateTokenCount(text: string): number {
    // 粗略估算：1个Token约等于4个字符（英文）
    // 中文：1个Token约等于1.5个字符
    const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishCharCount = text.length - chineseCharCount;

    return Math.ceil(chineseCharCount / 1.5 + englishCharCount / 4);
}

/**
 * 计算批量请求的总成本
 */
export function calculateBatchCost(
    provider: AIProvider,
    model: string,
    requests: TokenUsage[]
): CostResult {
    const totalUsage = requests.reduce(
        (acc, usage) => ({
            inputTokens: acc.inputTokens + usage.inputTokens,
            outputTokens: acc.outputTokens + usage.outputTokens
        }),
        { inputTokens: 0, outputTokens: 0 }
    );

    return calculateCost(provider, model, totalUsage);
}
