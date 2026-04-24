/**
 * Recursive redactor for credential-shaped strings.
 *
 * Any time we log a tool input or a user-supplied command, there's a
 * realistic chance the string contains an API key, bearer token, or
 * AWS secret — pasted into a `curl` call, an env var assignment, an
 * SSH-over-HTTP pattern, etc. Logs end up in dev consoles, crash
 * reports, user-submitted screenshots; treating them as "internal-
 * only" is wishful.
 *
 * scrubSecrets() walks any value (string / array / plain object) and
 * returns a structurally-identical copy with known credential patterns
 * replaced by `<redacted>`. The original reference is never mutated.
 *
 * Deliberately conservative: over-redaction is fine (a logged command
 * is still searchable even with the secret blanked), but UNDER-
 * redaction once is a real data leak. When in doubt, redact.
 */

const SECRET_PATTERNS: { label: string; regex: RegExp; replace: (m: string) => string }[] = [
    // HTTP Authorization: Bearer tokens, including the `Bearer ` prefix.
    {
        label: 'bearer',
        regex: /\b(Bearer|Token)\s+([A-Za-z0-9\-_.=+/]{8,})/gi,
        replace: (_m) => `${_m.split(/\s+/)[0]} <redacted>`
    },
    // OpenAI-style `sk-…` keys (project keys are longer; this catches both).
    {
        label: 'openai-sk',
        regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
        replace: () => 'sk-<redacted>'
    },
    // Anthropic `sk-ant-…`.
    {
        label: 'anthropic',
        regex: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
        replace: () => 'sk-ant-<redacted>'
    },
    // Google API keys (AIza…).
    {
        label: 'google-api',
        regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g,
        replace: () => 'AIza<redacted>'
    },
    // AWS access keys (AKIA… / ASIA…).
    {
        label: 'aws-access',
        regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
        replace: () => '<redacted-aws-access-key>'
    },
    // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_).
    {
        label: 'github',
        regex: /\bgh[pours]_[A-Za-z0-9]{36,}\b/g,
        replace: (m) => `${m.slice(0, 4)}<redacted>`
    },
    // Slack tokens (xoxb-, xoxp-, xoxa-, xoxr-).
    {
        label: 'slack',
        regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
        replace: (m) => `${m.slice(0, 5)}<redacted>`
    },
    // Named credential assignments. Matches:
    //   password=secret / "api_key": "abc" / -H "X-Api-Key: xyz"
    // Captures the key name + separator so we can keep it for context.
    {
        label: 'named-cred',
        regex: /\b(api[_-]?key|apikey|secret|password|passwd|pwd|auth[_-]?token|access[_-]?token|private[_-]?key)(\s*[:=]\s*|["'\s:=]+)([^\s"'`]{6,})/gi,
        replace: (_m) => _m.replace(/([^\s"'`]{6,})$/, '<redacted>')
    },
    // curl / wget Authorization header variant with quoted value.
    {
        label: 'http-auth-header',
        regex: /(-H|--header)\s+["']?Authorization:\s*(Bearer|Basic|Token)\s+([^"'\s]+)/gi,
        replace: (_m) => _m.replace(/(Bearer|Basic|Token)\s+[^"'\s]+/i, (_g) => `${_g.split(/\s+/)[0]} <redacted>`)
    },
    // Long hex-like tokens (32+ hex chars) — catches generic session cookies.
    {
        label: 'hex-blob',
        regex: /\b[a-f0-9]{40,}\b/gi,
        replace: () => '<redacted-hex>'
    }
];

export function scrubSecretString(input: string): string {
    if (!input) return input;
    let out = input;
    for (const { regex, replace } of SECRET_PATTERNS) {
        out = out.replace(regex, replace as any);
    }
    return out;
}

/**
 * Deep-copy value with secrets scrubbed. Handles primitives, arrays,
 * and plain objects. Non-plain objects (Map, Set, Date) are coerced
 * to their string form before scrubbing — good enough for logging.
 */
export function scrubSecrets(value: any, depth: number = 0): any {
    if (depth > 8) return '[scrub: max depth]';
    if (value == null) return value;
    if (typeof value === 'string') return scrubSecretString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(v => scrubSecrets(v, depth + 1));
    if (typeof value === 'object') {
        // For objects not plain (Map/Set/Date/etc.), stringify.
        const proto = Object.getPrototypeOf(value);
        if (proto !== null && proto !== Object.prototype) {
            try { return scrubSecretString(String(value)); }
            catch { return '[scrub: unstringifiable]'; }
        }
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
            // If the KEY itself looks like a credential name, redact the
            // value wholesale regardless of its shape.
            if (/^(api[_-]?key|apikey|secret|password|passwd|pwd|auth[_-]?token|access[_-]?token|private[_-]?key)$/i.test(k)) {
                out[k] = typeof v === 'string' && v.length > 0 ? '<redacted>' : v;
            } else {
                out[k] = scrubSecrets(v, depth + 1);
            }
        }
        return out;
    }
    // Functions, symbols, etc. — drop.
    return undefined;
}
