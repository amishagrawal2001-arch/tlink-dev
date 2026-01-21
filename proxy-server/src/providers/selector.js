import { getAllProviders } from './config.js';

const MODEL_HINTS = [
    { test: (m) => /^gpt-/i.test(m) || /^o[13]/i.test(m) || /omni|dall-e|tts|whisper/i.test(m), provider: 'openai' },
    { test: (m) => /^claude/i.test(m), provider: 'anthropic' },
    { test: (m) => /llama|mixtral|qwen|gemma|groq\//i.test(m), provider: 'groq' }
];

let roundRobinIndex = 0;

/**
 * Select a provider based on strategy
 */
export function selectProvider({ model, user }) {
    const allowedProviders = user?.allowedProviders || [];
    const providers = getAllProviders(allowedProviders);

    if (providers.length === 0) {
        return null;
    }

    // User-defined routing takes priority
    if (user?.modelRouting && model) {
        const route = user.modelRouting[model] || user.modelRouting[`${model.split(':')[0]}*`];
        if (route) {
            const match = providers.find(p => p.name === route || p.name.startsWith(`${route}-`));
            if (match) return match;
        }
    }

    if (model) {
        const hint = MODEL_HINTS.find(h => h.test(model));
        if (hint) {
            const match = providers.find(p => p.name === hint.provider || p.name.startsWith(`${hint.provider}-`));
            if (match) return match;
        }
    }

    // If user has a preferred provider, honor it
    if (user?.preferredProvider) {
        const match = providers.find(p => p.name === user.preferredProvider || p.name.startsWith(`${user.preferredProvider}-`));
        if (match) return match;
    }

    const strategy = process.env.PROVIDER_STRATEGY || 'round-robin';

    switch (strategy) {
        case 'round-robin':
            // Rotate through providers
            const provider = providers[roundRobinIndex % providers.length];
            roundRobinIndex++;
            return provider;

        case 'cheapest':
            // Prefer Groq (usually cheapest)
            return providers.find(p => p.name === 'groq') || providers[0];

        case 'fastest':
            // Prefer Groq (usually fastest)
            return providers.find(p => p.name === 'groq') || providers[0];

        case 'random':
            return providers[Math.floor(Math.random() * providers.length)];

        default:
            return providers[0];
    }
}
