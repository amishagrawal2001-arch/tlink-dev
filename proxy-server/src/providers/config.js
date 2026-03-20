import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..');
const DEFAULT_ENV_FILE = process.env.PROXY_ENV_FILE || path.join(PROJECT_ROOT, '.env');
const ADMIN_PROVIDER_CONFIG_PERSIST = process.env.ADMIN_PROVIDER_CONFIG_PERSIST !== 'false';

const PROVIDER_META = {
    groq: {
        singleEnv: 'GROQ_API_KEY',
        multiEnv: 'GROQ_API_KEYS',
        defaultModelEnv: 'GROQ_DEFAULT_MODEL',
        defaultModelFallback: 'llama-3.1-8b-instant',
        placeholder: '',
    },
    openai: {
        singleEnv: 'OPENAI_API_KEY',
        multiEnv: 'OPENAI_API_KEYS',
        defaultModelEnv: 'OPENAI_DEFAULT_MODEL',
        defaultModelFallback: 'gpt-4o-mini',
        placeholder: 'your_openai_api_key_here',
    },
    anthropic: {
        singleEnv: 'ANTHROPIC_API_KEY',
        multiEnv: 'ANTHROPIC_API_KEYS',
        defaultModelEnv: 'ANTHROPIC_DEFAULT_MODEL',
        defaultModelFallback: 'claude-3-sonnet-20240229',
        placeholder: 'your_anthropic_api_key_here',
    },
};

/**
 * Provider configurations
 * Load API keys from environment variables
 */
function isValidKey(key, placeholder) {
    if (!key) return false;
    const normalized = key.trim().toLowerCase();
    return normalized !== placeholder.toLowerCase();
}

function parseKeyList(singleKey, multiKey, placeholder = '') {
    const keys = [];
    if (multiKey) {
        const split = multiKey.split(',').map(k => k.trim()).filter(Boolean);
        for (const key of split) {
            if (isValidKey(key, placeholder)) {
                keys.push(key);
            }
        }
    }
    if (singleKey && isValidKey(singleKey, placeholder)) {
        keys.push(singleKey.trim());
    }
    return keys;
}

function buildProviderConfigs() {
    const groqDefaultModel = process.env.GROQ_DEFAULT_MODEL || PROVIDER_META.groq.defaultModelFallback;
    const openaiDefaultModel = process.env.OPENAI_DEFAULT_MODEL || PROVIDER_META.openai.defaultModelFallback;
    const anthropicDefaultModel = process.env.ANTHROPIC_DEFAULT_MODEL || PROVIDER_META.anthropic.defaultModelFallback;

    const groqKeys = parseKeyList(process.env.GROQ_API_KEY, process.env.GROQ_API_KEYS, PROVIDER_META.groq.placeholder);
    const openaiKeys = parseKeyList(process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEYS, PROVIDER_META.openai.placeholder);
    const anthropicKeys = parseKeyList(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEYS, PROVIDER_META.anthropic.placeholder);

    const allowList = process.env.ALLOWED_PROVIDERS
        ? process.env.ALLOWED_PROVIDERS.split(',').map(s => s.trim()).filter(Boolean)
        : null;

    const configs = {};

    groqKeys.forEach((key, index) => {
        const name = groqKeys.length > 1 ? `groq-${index + 1}` : 'groq';
        configs[name] = {
            name,
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: key,
            defaultModel: groqDefaultModel,
            timeout: 30000,
            enabled: true,
        };
    });

    openaiKeys.forEach((key, index) => {
        const name = openaiKeys.length > 1 ? `openai-${index + 1}` : 'openai';
        configs[name] = {
            name,
            baseURL: 'https://api.openai.com/v1',
            apiKey: key,
            defaultModel: openaiDefaultModel,
            timeout: 60000,
            enabled: true,
        };
    });

    anthropicKeys.forEach((key, index) => {
        const name = anthropicKeys.length > 1 ? `anthropic-${index + 1}` : 'anthropic';
        configs[name] = {
            name,
            baseURL: 'https://api.anthropic.com/v1',
            apiKey: key,
            defaultModel: anthropicDefaultModel,
            timeout: 60000,
            enabled: true,
        };
    });

    const all = Object.values(configs);

    if (allowList && allowList.length > 0) {
        return Object.fromEntries(
            all
                .filter(cfg => allowList.includes(cfg.name) || allowList.includes(cfg.name.split('-')[0]))
                .map(cfg => [cfg.name, cfg]),
        );
    }

    return configs;
}

export function getProviderConfig(providerName, allowedProviders) {
    const configs = buildProviderConfigs();
    if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(providerName) && !allowedProviders.includes(providerName.split('-')[0])) {
        return null;
    }
    return configs[providerName] || null;
}

export function getAllProviders(allowedProviders) {
    const configs = buildProviderConfigs();
    return Object.values(configs).filter(p => p && p.enabled).filter(p => {
        if (!allowedProviders || allowedProviders.length === 0) return true;
        return allowedProviders.includes(p.name) || allowedProviders.includes(p.name.split('-')[0]);
    });
}

function maskSecret(secret) {
    if (!secret) return '';
    const value = String(secret);
    if (value.length <= 8) return `${value.slice(0, 2)}***`;
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
}

function sanitizeInput(value) {
    if (value == null) return '';
    return String(value).replace(/[\r\n]+/g, '').trim();
}

function normalizeEnvAssignment(value, envField) {
    const text = sanitizeInput(value);
    if (!text) return '';

    let normalized = text;
    normalized = normalized.replace(/^export\s+/i, '');

    if (normalized.startsWith('#')) {
        normalized = normalized.slice(1).trim();
    }

    const assignment = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (assignment) {
        const lhs = assignment[1].toUpperCase();
        const rhs = assignment[2];
        if (!envField || lhs === String(envField).toUpperCase()) {
            normalized = rhs.trim();
        }
    }

    if (
        (normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
        normalized = normalized.slice(1, -1).trim();
    }

    return normalized;
}

function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodeEnvValue(value) {
    const text = String(value ?? '');
    if (!text) return '';
    if (/\s|#|"|'|`/.test(text)) {
        return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return text;
}

function persistEnvUpdates(updates, envFilePath = DEFAULT_ENV_FILE) {
    const keys = Object.keys(updates);
    if (!keys.length) return { persisted: false, path: envFilePath };

    let lines = [];
    if (fs.existsSync(envFilePath)) {
        lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
    }

    for (const key of keys) {
        const value = updates[key];
        const line = `${key}=${encodeEnvValue(value)}`;
        const regex = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
        const idx = lines.findIndex(l => regex.test(l));
        if (idx >= 0) {
            lines[idx] = line;
        } else {
            lines.push(line);
        }
    }

    const content = `${lines.join('\n').replace(/\n+$/g, '')}\n`;
    fs.writeFileSync(envFilePath, content, 'utf8');
    return { persisted: true, path: envFilePath };
}

function getProviderSnapshot(includeSecrets = false) {
    const snapshot = {};

    for (const [name, meta] of Object.entries(PROVIDER_META)) {
        const singleRaw = process.env[meta.singleEnv] || '';
        const multiRaw = process.env[meta.multiEnv] || '';
        const parsed = parseKeyList(singleRaw, multiRaw, meta.placeholder);

        const entry = {
            provider: name,
            keyCount: parsed.length,
            hasKey: parsed.length > 0,
            singleKeyConfigured: !!singleRaw,
            multiKeyCount: multiRaw ? multiRaw.split(',').map(s => s.trim()).filter(Boolean).length : 0,
            singleKeyMasked: singleRaw ? maskSecret(singleRaw) : '',
            multiKeysMasked: multiRaw
                ? multiRaw.split(',').map(s => s.trim()).filter(Boolean).map(maskSecret)
                : [],
            defaultModel: process.env[meta.defaultModelEnv] || meta.defaultModelFallback,
        };

        if (includeSecrets) {
            entry.singleKey = singleRaw;
            entry.multiKeys = multiRaw
                ? multiRaw.split(',').map(s => s.trim()).filter(Boolean)
                : [];
        }

        snapshot[name] = entry;
    }

    return snapshot;
}

export function getProviderAdminConfig(options = {}) {
    const includeSecrets = !!options.includeSecrets;
    return {
        providers: getProviderSnapshot(includeSecrets),
        persistence: {
            defaultEnabled: ADMIN_PROVIDER_CONFIG_PERSIST,
            envFile: DEFAULT_ENV_FILE,
        },
        updatedAt: new Date().toISOString(),
    };
}

export function updateProviderAdminConfig(payload = {}, options = {}) {
    const input = payload || {};
    const updates = {};

    const fieldMap = {
        groqApiKey: 'GROQ_API_KEY',
        openaiApiKey: 'OPENAI_API_KEY',
        anthropicApiKey: 'ANTHROPIC_API_KEY',
        groqApiKeys: 'GROQ_API_KEYS',
        openaiApiKeys: 'OPENAI_API_KEYS',
        anthropicApiKeys: 'ANTHROPIC_API_KEYS',
        groqDefaultModel: 'GROQ_DEFAULT_MODEL',
        openaiDefaultModel: 'OPENAI_DEFAULT_MODEL',
        anthropicDefaultModel: 'ANTHROPIC_DEFAULT_MODEL',
        GROQ_API_KEY: 'GROQ_API_KEY',
        OPENAI_API_KEY: 'OPENAI_API_KEY',
        ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
        GROQ_API_KEYS: 'GROQ_API_KEYS',
        OPENAI_API_KEYS: 'OPENAI_API_KEYS',
        ANTHROPIC_API_KEYS: 'ANTHROPIC_API_KEYS',
        GROQ_DEFAULT_MODEL: 'GROQ_DEFAULT_MODEL',
        OPENAI_DEFAULT_MODEL: 'OPENAI_DEFAULT_MODEL',
        ANTHROPIC_DEFAULT_MODEL: 'ANTHROPIC_DEFAULT_MODEL',
    };

    for (const [inputField, envField] of Object.entries(fieldMap)) {
        if (Object.prototype.hasOwnProperty.call(input, inputField)) {
            const cleaned = normalizeEnvAssignment(input[inputField], envField);
            updates[envField] = cleaned;
            process.env[envField] = cleaned;
        }
    }

    const explicitPersist = options.persist ?? input.persist;
    const persist = explicitPersist == null ? ADMIN_PROVIDER_CONFIG_PERSIST : String(explicitPersist) !== 'false';

    let persisted = { persisted: false, path: DEFAULT_ENV_FILE };
    if (persist && Object.keys(updates).length > 0) {
        persisted = persistEnvUpdates(updates);
    }

    return {
        ok: true,
        updatedKeys: Object.keys(updates),
        persisted: persisted.persisted,
        envFile: persisted.path,
        config: getProviderAdminConfig({ includeSecrets: false }),
    };
}
