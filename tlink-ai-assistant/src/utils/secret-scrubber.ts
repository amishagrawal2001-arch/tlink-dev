/**
 * Secret scrubber - scan outbound user text for credentials / tokens
 * / keys before a message is sent to a cloud AI provider.
 *
 * Ported from tlink-chatgpt/src/utils/secret-scrubber.ts. Kept in sync
 * so both AI surfaces share identical detection patterns.
 *
 * Distinct from the Network Context redactor: that one supports blind-
 * mode redaction for network topology; this one catches unambiguously
 * *dangerous* leaks (API keys, tokens, private keys), regardless of
 * other privacy toggles.
 *
 * Trust model: only runs for *cloud/custom* providers. Local Ollama/
 * localhost endpoints are trusted and bypass the scrubber.
 */

export type SecretKind =
    | 'aws_access_key'
    | 'aws_secret_key'
    | 'openai_key'
    | 'anthropic_key'
    | 'github_token'
    | 'slack_token'
    | 'stripe_key'
    | 'google_api_key'
    | 'jwt'
    | 'private_key'
    | 'url_password'
    | 'env_secret';

export interface SecretMatch {
    kind: SecretKind;
    label: string;
    start: number;
    end: number;
    preview: string;
}

interface PatternDef {
    kind: SecretKind;
    label: string;
    pattern: RegExp;
}

const PATTERNS: PatternDef[] = [
    { kind: 'aws_access_key', label: 'AWS access key', pattern: /\b(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[0-9A-Z]{16}\b/g },
    { kind: 'aws_secret_key', label: 'AWS secret key', pattern: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|AWS_SECRET_ACCESS_KEY)["'\s:=]+["']?([A-Za-z0-9/+=]{40})["']?/gi },
    { kind: 'openai_key', label: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
    { kind: 'anthropic_key', label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
    { kind: 'github_token', label: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
    { kind: 'github_token', label: 'GitHub fine-grained PAT', pattern: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/g },
    { kind: 'slack_token', label: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { kind: 'stripe_key', label: 'Stripe key', pattern: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
    { kind: 'google_api_key', label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { kind: 'jwt', label: 'JWT token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
    { kind: 'private_key', label: 'PEM private key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
    { kind: 'url_password', label: 'URL credentials', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/:@]+)@/gi },
    {
        kind: 'env_secret',
        label: 'Environment secret',
        pattern: /\b(?:API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|DB[_-]?PASSWORD|DATABASE[_-]?URL|BEARER[_-]?TOKEN|PASSWORD)\s*[:=]\s*["']?([^\s"'`]{8,})["']?/gi,
    },
];

export function detectSecrets(text: string): SecretMatch[] {
    if (!text) return [];
    const matches: SecretMatch[] = [];
    for (const def of PATTERNS) {
        def.pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = def.pattern.exec(text)) !== null) {
            if (m[0].length === 0) {
                def.pattern.lastIndex++;
                continue;
            }
            matches.push({
                kind: def.kind,
                label: def.label,
                start: m.index,
                end: m.index + m[0].length,
                preview: makePreview(m[0]),
            });
        }
    }
    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const kept: SecretMatch[] = [];
    for (const m of matches) {
        const last = kept[kept.length - 1];
        if (last && m.start >= last.start && m.end <= last.end) continue;
        kept.push(m);
    }
    return kept;
}

export function redactSecrets(text: string, matches?: SecretMatch[]): { redacted: string; matches: SecretMatch[] } {
    const found = matches ?? detectSecrets(text);
    if (!found.length) {
        return { redacted: text, matches: [] };
    }
    let out = '';
    let cursor = 0;
    for (const m of found) {
        out += text.slice(cursor, m.start);
        out += `[REDACTED:${kindToToken(m.kind)}]`;
        cursor = m.end;
    }
    out += text.slice(cursor);
    return { redacted: out, matches: found };
}

function kindToToken(kind: SecretKind): string {
    switch (kind) {
        case 'aws_access_key': return 'AWS_ACCESS_KEY';
        case 'aws_secret_key': return 'AWS_SECRET_KEY';
        case 'openai_key': return 'OPENAI_KEY';
        case 'anthropic_key': return 'ANTHROPIC_KEY';
        case 'github_token': return 'GITHUB_TOKEN';
        case 'slack_token': return 'SLACK_TOKEN';
        case 'stripe_key': return 'STRIPE_KEY';
        case 'google_api_key': return 'GOOGLE_API_KEY';
        case 'jwt': return 'JWT';
        case 'private_key': return 'PRIVATE_KEY';
        case 'url_password': return 'URL_PASSWORD';
        case 'env_secret': return 'ENV_SECRET';
    }
}

function makePreview(raw: string): string {
    if (raw.length <= 10) {
        return raw[0] + '*'.repeat(raw.length - 1);
    }
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export function summarizeMatches(matches: SecretMatch[]): string {
    if (!matches.length) return '';
    const counts = new Map<string, number>();
    for (const m of matches) {
        counts.set(m.label, (counts.get(m.label) || 0) + 1);
    }
    const parts: string[] = [];
    for (const [label, n] of counts) {
        parts.push(n === 1 ? `1 ${label}` : `${n} ${label}s`);
    }
    return parts.join(', ');
}
