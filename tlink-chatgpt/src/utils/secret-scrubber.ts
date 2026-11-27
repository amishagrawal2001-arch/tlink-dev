/**
 * Secret scrubber - scan user text for credentials / tokens / keys
 * before a message is sent to a cloud AI provider.
 *
 * This is distinct from the Network Context redactor (IPs/hostnames)
 * in chatTab.component.ts: that one supports blind-mode redaction for
 * leaking network topology; this one catches things that are
 * unambiguously *dangerous* to leak to a third party, regardless of
 * whether blind mode is on.
 *
 * Scope: catch high-confidence credential shapes only. We would rather
 * miss an exotic token than redact "sunny" inside "my API is sunny
 * today". Each pattern has a distinctive prefix / structural anchor.
 *
 * Trust model: the scrubber only runs for *cloud* providers. Local
 * Ollama endpoints get the text verbatim - local is trusted.
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
    | 'env_secret'

export interface SecretMatch {
    kind: SecretKind
    label: string         // human-friendly name for the UI
    start: number
    end: number
    preview: string       // short, safe-to-show-in-UI fragment (first 4 + last 4 chars)
}

interface PatternDef {
    kind: SecretKind
    label: string
    // Exec-style RegExp so we can read .index + match[0] without
    // worrying about matchAll iterator quirks.
    pattern: RegExp
}

const PATTERNS: PatternDef[] = [
    // AWS access key: AKIA + 16 uppercase alnum (also AGPA, AIDA, etc. for other IAM types)
    { kind: 'aws_access_key', label: 'AWS access key', pattern: /\b(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[0-9A-Z]{16}\b/g },
    // AWS secret: harder to catch without context; require "aws_secret" or "AWS_SECRET_ACCESS_KEY" nearby.
    { kind: 'aws_secret_key', label: 'AWS secret key', pattern: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|AWS_SECRET_ACCESS_KEY)["'\s:=]+["']?([A-Za-z0-9/+=]{40})["']?/gi },
    // OpenAI: sk-<alnum>{>=20} (older) or sk-proj-<...> (newer project keys)
    { kind: 'openai_key', label: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
    // Anthropic: sk-ant-<...>
    { kind: 'anthropic_key', label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
    // GitHub classic + fine-grained PATs + OAuth / app tokens
    { kind: 'github_token', label: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
    { kind: 'github_token', label: 'GitHub fine-grained PAT', pattern: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/g },
    // Slack tokens: xoxb-..., xoxp-..., xoxa-..., xoxr-...
    { kind: 'slack_token', label: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    // Stripe live/test keys
    { kind: 'stripe_key', label: 'Stripe key', pattern: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
    // Google API key: AIza + 35 chars
    { kind: 'google_api_key', label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    // JWT: three base64url chunks separated by dots, first one starts with "eyJ"
    { kind: 'jwt', label: 'JWT token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
    // PEM private keys - match the header line, we'll expand to the full block later
    { kind: 'private_key', label: 'PEM private key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
    // Credentials in URLs: scheme://user:password@host
    { kind: 'url_password', label: 'URL credentials', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/:@]+)@/gi },
    // .env-style lines: KEY=value where KEY smells secret and value is non-trivial.
    // Deliberately conservative - require a known-secret substring in the key name
    // and a plausible value (8+ chars, no spaces).
    {
        kind: 'env_secret',
        label: 'Environment secret',
        pattern: /\b(?:API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|DB[_-]?PASSWORD|DATABASE[_-]?URL|BEARER[_-]?TOKEN|PASSWORD)\s*[:=]\s*["']?([^\s"'`]{8,})["']?/gi,
    },
]

function makePreview (raw: string): string {
    // Show first 4 and last 4 characters so the user can recognize
    // which secret was caught without exposing enough for a leak.
    if (raw.length <= 10) {
        return raw[0] + '*'.repeat(raw.length - 1)
    }
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`
}

function kindToToken (kind: SecretKind): string {
    // Compact, ALL-CAPS tokens for the redaction placeholder.
    switch (kind) {
        case 'aws_access_key': return 'AWS_ACCESS_KEY'
        case 'aws_secret_key': return 'AWS_SECRET_KEY'
        case 'openai_key': return 'OPENAI_KEY'
        case 'anthropic_key': return 'ANTHROPIC_KEY'
        case 'github_token': return 'GITHUB_TOKEN'
        case 'slack_token': return 'SLACK_TOKEN'
        case 'stripe_key': return 'STRIPE_KEY'
        case 'google_api_key': return 'GOOGLE_API_KEY'
        case 'jwt': return 'JWT'
        case 'private_key': return 'PRIVATE_KEY'
        case 'url_password': return 'URL_PASSWORD'
        case 'env_secret': return 'ENV_SECRET'
    }
}

export function detectSecrets (text: string): SecretMatch[] {
    if (!text) { return [] }
    const matches: SecretMatch[] = []
    for (const def of PATTERNS) {
        // Reset lastIndex because we reuse PatternDef instances across calls.
        def.pattern.lastIndex = 0
        let m: RegExpExecArray | null = null
        while ((m = def.pattern.exec(text)) !== null) {
            if (m[0].length === 0) {
                // Zero-width match - break to avoid infinite loop.
                def.pattern.lastIndex++
                continue
            }
            matches.push({
                kind: def.kind,
                label: def.label,
                start: m.index,
                end: m.index + m[0].length,
                preview: makePreview(m[0]),
            })
        }
    }
    // Sort by start then by -length so outer (longer) matches win when
    // two patterns overlap (e.g. a JWT-shaped string also matching a
    // broader token pattern).
    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
    // Drop matches fully contained by an earlier (equal or longer) one.
    const kept: SecretMatch[] = []
    for (const m of matches) {
        const last = kept[kept.length - 1] as SecretMatch | undefined
        if (last !== undefined && m.start >= last.start && m.end <= last.end) {
            continue
        }
        kept.push(m)
    }
    return kept
}

export function redactSecrets (text: string, matches?: SecretMatch[]): { redacted: string, matches: SecretMatch[] } {
    const found = matches ?? detectSecrets(text)
    if (!found.length) {
        return { redacted: text, matches: [] }
    }
    // Rebuild the string with placeholders. `found` is already sorted
    // and non-overlapping.
    let out = ''
    let cursor = 0
    for (const m of found) {
        out += text.slice(cursor, m.start)
        out += `[REDACTED:${kindToToken(m.kind)}]`
        cursor = m.end
    }
    out += text.slice(cursor)
    return { redacted: out, matches: found }
}

/**
 * Group matches by kind, returning a user-friendly summary like
 * "1 OpenAI API key, 2 JWT tokens".
 */
export function summarizeMatches (matches: SecretMatch[]): string {
    if (!matches.length) { return '' }
    const counts = new Map<string, number>()
    for (const m of matches) {
        counts.set(m.label, (counts.get(m.label) ?? 0) + 1)
    }
    const parts: string[] = []
    for (const [label, n] of counts) {
        parts.push(n === 1 ? `1 ${label}` : `${n} ${label}s`)
    }
    return parts.join(', ')
}
