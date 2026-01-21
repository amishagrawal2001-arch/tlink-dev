import { getAllProviders, getProviderConfig } from './providers/config.js';
import { selectProvider } from './providers/selector.js';
import { getRoutingSettings } from './routing/settings.js';

const AUTO_TOKENS = ['auto', 'tlink-proxy-auto', 'tlink-agentic-auto'];
const OPENAI_STRONG = process.env.ROUTER_OPENAI_STRONG_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o';
const OPENAI_FAST = process.env.ROUTER_OPENAI_FAST_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
const GROQ_STRONG = process.env.ROUTER_GROQ_STRONG_MODEL || process.env.GROQ_DEFAULT_MODEL || 'llama-3.1-70b-versatile';
const GROQ_FAST = process.env.ROUTER_GROQ_FAST_MODEL || process.env.GROQ_DEFAULT_MODEL || 'llama-3.1-8b-instant';

function normalizeIntent(intent) {
    if (!intent) return null;
    const t = String(intent).toLowerCase().trim();
    if (!t) return null;
    if (t.includes('vision') || t.includes('image')) return 'vision';
    if (t.includes('audio') || t.includes('speech')) return 'audio';
    if (t.includes('translate')) return 'translate';
    if (t.includes('summarize') || t.includes('summary')) return 'summarize';
    if (t.includes('code')) return 'code';
    if (t.includes('long')) return 'long';
    if (t.includes('default') || t === 'auto') return 'default';
    // compound hints such as "code/long" or "translate/summarize"
    if (t.includes('code/long') || t.includes('long/code')) return 'code';
    if (t.includes('translate/summarize') || t.includes('summarize/translate')) return 'translate';
    return t;
}

function providerByBase(providers, baseName) {
    if (!baseName) return null;
    return providers.find(p => p.name === baseName || p.name.startsWith(`${baseName}-`)) || null;
}

function extractText(messages = []) {
    let text = '';
    let hasImage = false;
    let hasAudio = false;
    if (Array.isArray(messages)) {
        for (const m of messages) {
            if (m?.role !== 'user') continue;
            const content = m.content;
            if (typeof content === 'string') {
                text += `\n${content}`;
            } else if (Array.isArray(content)) {
                for (const part of content) {
                    if (typeof part === 'string') text += `\n${part}`;
                    else if (part?.text) text += `\n${part.text}`;
                    if (part?.image_url) hasImage = true;
                    if (part?.audio) hasAudio = true;
                }
            } else if (content?.text) {
                text += `\n${content.text}`;
            }
            if (m?.images?.length) hasImage = true;
            if (m?.audio) hasAudio = true;
        }
    }
    return { text: text.trim(), hasImage, hasAudio };
}

function detectIntent(meta) {
    const text = (meta.text || '').toLowerCase();
    const hinted = normalizeIntent(meta.intentHint);
    if (hinted) return hinted;
    if (meta.hasImage) return 'vision';
    if (meta.hasAudio) return 'audio';
    if (/translate|translation|अनुवाद|in hindi|in english/.test(text)) return 'translate';
    if (/summarize|summary|tl;dr/.test(text)) return 'summarize';
    if (/```|exception|stack trace|traceback|error|npm |docker|k8s|kubectl|sql|bash|python|java|c#|c\+\+|typescript|javascript/.test(text)) return 'code';
    if (text.length > 1800) return 'long';
    return 'default';
}

/**
 * Decide provider/model when model is "auto".
 * Rules (optional) are applied first; heuristics fill in if no match.
 * Returns an ordered candidate list with optional routing reason.
 */
export function pickProviderModel({ user, requestedModel, messages, rules, intentHint }) {
    const providers = getAllProviders(user?.allowedProviders);
    if (!providers.length) return { candidates: [], reason: 'no_providers' };

    const settings = getRoutingSettings();
    const activeRules = Array.isArray(rules) ? rules : (Array.isArray(settings.rules) ? settings.rules : []);

    const { text, hasImage, hasAudio } = extractText(messages);
    const textLower = text.toLowerCase();
    const intent = detectIntent({ text, hasImage, hasAudio, intentHint: normalizeIntent(intentHint) });
    const candidates = [];

    const lockedProvider = user?.lockedProvider || null;
    const isAuto = !requestedModel || AUTO_TOKENS.includes(String(requestedModel).toLowerCase());

    const pushCandidate = (base, model, reason) => {
        const provider = lockedProvider
            ? providerByBase(providers, lockedProvider)
            : providerByBase(providers, base);
        if (!provider) return;
        const cfg = getProviderConfig(provider.name, user?.allowedProviders);
        const effectiveModel = model || cfg?.defaultModel || requestedModel || 'auto';
        candidates.push({ provider, model: effectiveModel, reason });
    };

    if (!isAuto) {
        const provider = selectProvider({ model: requestedModel, user });
        if (provider) {
            return { candidates: [{ provider, model: requestedModel, reason: 'explicit-model' }], reason: 'explicit-model' };
        }
        return { candidates: [], reason: 'no_provider_for_explicit' };
    }

    // Apply custom rules first (optional)
    for (const rule of activeRules) {
        if (!rule || typeof rule !== 'object') continue;
        const ruleIntent = normalizeIntent(rule.intent);
        const intentOk = ruleIntent ? ruleIntent === intent : true;
        const matchOk = rule.match ? textLower.includes(String(rule.match).toLowerCase()) : true;
        if (!intentOk || !matchOk) continue;
        const base = rule.provider || rule.providerName;
        const model = rule.model || rule.modelName;
        if (!base) continue;
        pushCandidate(base, model, `rule:custom${rule.intent ? ':' + rule.intent : ''}`);
    }

    // Built-in heuristics
    switch (intent) {
        case 'code':
        case 'long':
            pushCandidate('openai', OPENAI_STRONG, `rule:${intent}->openai`);
            pushCandidate('groq', GROQ_STRONG, `rule:${intent}->groq`);
            break;
        case 'translate':
        case 'summarize':
            pushCandidate('openai', OPENAI_FAST, `rule:${intent}->openai`);
            pushCandidate('groq', GROQ_FAST, `rule:${intent}->groq`);
            break;
        case 'vision':
            pushCandidate('openai', OPENAI_STRONG, 'rule:vision->openai');
            break;
        case 'audio':
            pushCandidate('openai', 'whisper-1', 'rule:audio->openai');
            pushCandidate('groq', 'whisper-large-v3', 'rule:audio->groq');
            break;
        default:
            pushCandidate('groq', GROQ_FAST, 'rule:default->groq');
            pushCandidate('openai', OPENAI_FAST, 'rule:default->openai');
            break;
    }

    // Fallback to strategy if no match or locked provider missing
    if (!candidates.length) {
        const provider = selectProvider({ model: requestedModel, user });
        if (provider) {
            const cfg = getProviderConfig(provider.name, user?.allowedProviders);
            candidates.push({
                provider,
                model: cfg?.defaultModel || requestedModel || 'auto',
                reason: 'fallback-strategy'
            });
        }
    }

    // Deduplicate providers while keeping order
    const seen = new Set();
    const deduped = [];
    for (const c of candidates) {
        if (c.provider && !seen.has(c.provider.name)) {
            seen.add(c.provider.name);
            deduped.push(c);
        }
    }

    return { candidates: deduped, reason: deduped[0]?.reason || 'fallback', intent };
}

export function isAutoModel(model) {
    if (!model) return true;
    const m = String(model).toLowerCase();
    return AUTO_TOKENS.includes(m);
}

export function getBuiltinHeuristics() {
    return {
        defaults: {
            openaiStrong: OPENAI_STRONG,
            openaiFast: OPENAI_FAST,
            groqStrong: GROQ_STRONG,
            groqFast: GROQ_FAST,
            modeDefault: (process.env.ROUTING_MODE || 'auto').toLowerCase()
        },
        rules: [
            { intent: 'code/long', order: 1, provider: 'openai', model: OPENAI_STRONG },
            { intent: 'code/long', order: 2, provider: 'groq', model: GROQ_STRONG },
            { intent: 'translate/summarize', order: 1, provider: 'openai', model: OPENAI_FAST },
            { intent: 'translate/summarize', order: 2, provider: 'groq', model: GROQ_FAST },
            { intent: 'vision', order: 1, provider: 'openai', model: OPENAI_STRONG },
            { intent: 'audio', order: 1, provider: 'openai', model: 'whisper-1' },
            { intent: 'audio', order: 2, provider: 'groq', model: 'whisper-large-v3' },
            { intent: 'default', order: 1, provider: 'groq', model: GROQ_FAST },
            { intent: 'default', order: 2, provider: 'openai', model: OPENAI_FAST }
        ]
    };
}
