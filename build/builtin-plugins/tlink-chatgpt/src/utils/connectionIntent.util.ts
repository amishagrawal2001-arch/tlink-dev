export type ConnectionProtocol = 'ssh' | 'telnet'

export interface ParsedSshCredentials {
    user?: string
    password?: string
    port?: number
}

export interface ParsedSshHost {
    host: string
    user?: string
    port?: number
}

export function cleanConnectionTarget (value: string): string | null {
    if (!value) {
        return null
    }
    let target = value.trim()
    target = target.replace(/^[\"'`]+|[\"'`]+$/g, '')
    target = target.replace(/[?.!,;:\s]+$/g, '')
    target = target.replace(/\s+(please|pls|now)$/i, '')
    target = target.trim()
    return target.length ? target : null
}

export function stripLeadingStopwords (value: string): string {
    const stopwords = [
        'to',
        'with',
        'for',
        'at',
        'into',
        'on',
        'via',
        'using',
        'from',
        'host',
        'device',
        'server',
        'router',
        'switch',
        'named',
        'called',
    ]
    let result = value.trim()
    let changed = true
    while (changed) {
        changed = false
        for (const word of stopwords) {
            if (result.toLowerCase().startsWith(`${word} `)) {
                result = result.slice(word.length).trim()
                changed = true
            }
        }
    }
    return result
}

export function normalizeHostToken (value: string): string {
    let hostPart = value.trim()
    hostPart = hostPart.replace(/^(?:ssh|telnet)\s+/i, '')
    hostPart = hostPart.replace(/^(?:connections?|sessions?|tabs?|devices?|hosts?)\s+(?:to|with|for|at)\s+/i, '')
    hostPart = hostPart.replace(/^(?:connections?|sessions?|tabs?|devices?|hosts?)\s+/i, '')
    hostPart = hostPart.replace(/^(?:to|with|for|at|into|on|via|using|from)\s+/i, '')
    hostPart = stripLeadingStopwords(hostPart)
    return hostPart.trim()
}

export function stripCredentialSuffix (value: string): string {
    return value.replace(/\s+(?:user(?:name)?|pass(?:word)?)\b.*$/i, '').trim()
}

export function splitTargets (value: string): string[] {
    if (!value) {
        return []
    }
    const normalized = value.replace(/\s+and\s+/gi, ',')
    return normalized
        .split(/[;,]/)
        .map(item => cleanConnectionTarget(item) ?? '')
        .filter(item => item.length > 0)
}

export function normalizeGroupTarget (value: string | null | undefined): string | null {
    const cleaned = cleanConnectionTarget(value ?? '')
    if (!cleaned) {
        return null
    }
    let target = cleaned
        .replace(/^profile\s+group\s*/i, '')
        .replace(/\s+profile\s+group$/i, '')
        .replace(/^group\s*/i, '')
        .replace(/\s+group$/i, '')
        .trim()
    if (!target) {
        return null
    }
    if (/^(group|profile|profile\s+group|all|devices?)$/i.test(target)) {
        return null
    }
    return target
}

export function parseGroupTarget (prompt: string): string | null {
    const patterns = [
        /all\s+devices?\s+(?:in|under)\s+(?<target>.+?)\s+profile\s+group\b/i,
        /(?:in|under)\s+(?<target>.+?)\s+profile\s+group\b/i,
        /(?<target>.+?)\s+profile\s+group\b/i,
        /all\s+devices?\s+(?:in|under)\s+(?:profile\s+group|group|profile)\s*[:=]?\s+(?<target>.+)$/i,
        /profile\s+group\s*[:=]?\s+(?<target>.+)$/i,
        /device\s+in\s+(?:group\/profile|group|profile)\s*[:=]?\s+(?<target>.+)$/i,
        /for\s+(?:device\s+in\s+)?(?:group\/profile|group|profile)\s*[:=]?\s+(?<target>.+)$/i,
        /(?:group\/profile|group|profile(?!\s+group))\s*[:=]?\s+(?<target>.+)$/i,
    ]

    for (const pattern of patterns) {
        const match = prompt.match(pattern)
        if (!match) {
            continue
        }
        const raw = match.groups?.target ?? match[1]
        const cleaned = normalizeGroupTarget(raw)
        if (cleaned) {
            return cleaned
        }
    }

    return null
}

export function parseHostTargets (prompt: string, protocol: ConnectionProtocol): string[] {
    const patterns = protocol === 'telnet'
        ? [
            /open\s+telnet\s+connection\s+(?:with|to)\s+(?<target>.+)$/i,
            /open\s+telnet\s+session\s+(?:with|to)\s+(?<target>.+)$/i,
            /\btelnet\s+(?<target>.+)$/i,
        ]
        : [
            /open\s+(?:an?\s+)?ssh\s+connection\s+(?:with|to)\s+(?<target>.+)$/i,
            /open\s+(?:an?\s+)?ssh\s+session\s+(?:with|to)\s+(?<target>.+)$/i,
            /open\s+(?:an?\s+)?ssh\s+connections?\s+(?<target>.+)$/i,
            /\bssh\s+(?:to|into)\s+(?<target>.+)$/i,
            /\bssh\s+connections?\s+(?<target>.+)$/i,
            /\bssh\s+(?<target>.+)$/i,
        ]

    const sharedPatterns = [
        /\bconnect\s+to\s+(?<target>.+)$/i,
        /for\s+device\s+(?<target>.+)$/i,
        /\bdevice\s+(?<target>.+)$/i,
    ]

    for (const pattern of [...patterns, ...sharedPatterns]) {
        const match = prompt.match(pattern)
        if (!match) {
            continue
        }
        const raw = match.groups?.target ?? match[1]
        const cleaned = stripCredentialSuffix(cleanConnectionTarget(raw) ?? '')
        return splitTargets(cleaned)
    }

    return []
}

export function parseDisconnectTargets (prompt: string, protocol: ConnectionProtocol): string[] {
    const action = '(?:close|disconnect|terminate|end|kill|stop)'
    const protocolToken = protocol === 'telnet' ? 'telnet' : 'ssh'
    const patterns = [
        new RegExp(`${action}\\s+(?:all\\s+)?${protocolToken}\\s+(?:connections?|sessions?|tabs?)\\s+(?:to|for|with)\\s+(?<target>.+)$`, 'i'),
        new RegExp(`${action}\\s+${protocolToken}\\s+(?:connections?|sessions?|tabs?)\\s+(?:to|for|with)\\s+(?<target>.+)$`, 'i'),
        new RegExp(`${action}\\s+${protocolToken}\\s+(?:to|from|for|with)\\s+(?<target>.+)$`, 'i'),
        new RegExp(`${action}\\s+(?:${protocolToken}\\s+)?(?:connection|session|tab)\\s+(?:to|for|with)\\s+(?<target>.+)$`, 'i'),
        new RegExp(`${action}\\s+${protocolToken}\\s+(?<target>.+)$`, 'i'),
        new RegExp(`${action}\\s+(?<target>.+)$`, 'i'),
    ]

    for (const pattern of patterns) {
        const match = prompt.match(pattern)
        if (!match) {
            continue
        }
        const raw = match.groups?.target ?? match[1]
        const cleaned = stripCredentialSuffix(cleanConnectionTarget(raw) ?? '')
        const patternTarget = extractPatternTargetFromPhrase(cleaned) ?? cleaned
        if (!patternTarget
            || isDisconnectAllPrompt(cleaned)
            || /^(?:connection|connections|session|sessions|tab|tabs)$/i.test(patternTarget)
            || /^(?:ssh|telnet)\s*(?:connection|connections|session|sessions|tab|tabs)?$/i.test(patternTarget)) {
            return []
        }
        return splitTargets(patternTarget)
    }

    return []
}

export function parseSshCredentials (prompt: string): ParsedSshCredentials {
    const credentials: ParsedSshCredentials = {}

    const slashMatch = prompt.match(/user\s*\/\s*pass(?:word)?\s*[:=]?\s*(?<user>[^\s/]+)\s*\/\s*(?<pass>[^\s,]+)/i)
    if (slashMatch?.groups) {
        credentials.user = slashMatch.groups.user
        credentials.password = slashMatch.groups.pass
    }

    const combinedMatch = prompt.match(/user(?:name)?\s*,?\s*pass(?:word)?\s*[-:=]\s*(?<user>[^\s/]+)\s*\/\s*(?<pass>[^\s,]+)/i)
    if (combinedMatch?.groups) {
        credentials.user = combinedMatch.groups.user
        credentials.password = combinedMatch.groups.pass
    }

    if (!credentials.user) {
        const userMatch = prompt.match(/\buser(?:name)?\b\s*[:=,-]?\s*(?<user>[^\s,]+)/i)
        if (userMatch?.groups?.user) {
            credentials.user = userMatch.groups.user
        }
    }

    if (!credentials.password) {
        const passMatch = prompt.match(/\bpass(?:word)?\b\s*[:=,-]?\s*(?<pass>[^\s,]+)/i)
        if (passMatch?.groups?.pass) {
            credentials.password = passMatch.groups.pass
        }
    }

    const portMatch = prompt.match(/\bport\b\s*[:=,-]?\s*(?<port>\d{2,5})/i)
    if (portMatch?.groups?.port) {
        credentials.port = Number(portMatch.groups.port)
    }

    return credentials
}

export function parseHostToken (value: string): ParsedSshHost | null {
    const cleaned = stripCredentialSuffix(cleanConnectionTarget(value) ?? '')
    if (!cleaned) {
        return null
    }

    let hostPart = normalizeHostToken(cleaned)
    let user: string | undefined
    let port: number | undefined

    if (hostPart.includes('@')) {
        const idx = hostPart.lastIndexOf('@')
        user = hostPart.slice(0, idx)
        hostPart = hostPart.slice(idx + 1)
    }

    if (hostPart.startsWith('[') && hostPart.includes(']')) {
        const end = hostPart.indexOf(']')
        const after = hostPart.slice(end + 1)
        if (after.startsWith(':')) {
            const parsed = Number(after.slice(1))
            if (Number.isFinite(parsed)) {
                port = parsed
            }
        }
        hostPart = hostPart.slice(1, end)
    } else {
        const parts = hostPart.split(':')
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            port = Number(parts[1])
            hostPart = parts[0]
        }
    }

    return hostPart ? { host: hostPart, user, port } : null
}

export function parseRegexLiteral (value: string): RegExp | null {
    if (!value.startsWith('/') || value.length < 2) {
        return null
    }
    const lastSlash = value.lastIndexOf('/')
    if (lastSlash <= 0) {
        return null
    }
    const pattern = value.slice(1, lastSlash)
    const rawFlags = value.slice(lastSlash + 1) || 'i'
    const flags = rawFlags.replace('g', '') || 'i'
    try {
        return new RegExp(pattern, flags)
    } catch {
        return null
    }
}

export function isPatternTarget (value: string): boolean {
    return value.includes('*') || value.includes('?') || !!parseRegexLiteral(value)
}

export function extractPatternTargetFromPhrase (value: string): string | null {
    const cleaned = cleanConnectionTarget(value ?? '')
    if (!cleaned) {
        return null
    }
    if (isPatternTarget(cleaned)) {
        return cleaned
    }

    const regexMatch = cleaned.match(/(?:regex|regexp|pattern|matches|matching)\s+(?<pattern>\/.+\/[a-z]*)/i)
    if (regexMatch?.groups?.pattern) {
        return regexMatch.groups.pattern.trim()
    }

    const startsMatch = cleaned.match(/(?:starts with|starting with|begins with|prefix(?: is)?)\s+(?<value>.+)$/i)
    if (startsMatch?.groups?.value) {
        const token = cleanConnectionTarget(startsMatch.groups.value)
        return token ? `${token}*` : null
    }

    const endsMatch = cleaned.match(/(?:ends with|ending with|finishes with|suffix(?: is)?)\s+(?<value>.+)$/i)
    if (endsMatch?.groups?.value) {
        const token = cleanConnectionTarget(endsMatch.groups.value)
        return token ? `*${token}` : null
    }

    const containsMatch = cleaned.match(/(?:contains|containing|includes|including|with string)\s+(?<value>.+)$/i)
    if (containsMatch?.groups?.value) {
        const token = cleanConnectionTarget(containsMatch.groups.value)
        return token ? `*${token}*` : null
    }

    return null
}

export function buildTargetMatcher (target: string): (value: string) => boolean {
    const regex = parseRegexLiteral(target)
    if (regex) {
        return value => regex.test(value)
    }
    if (target.includes('*') || target.includes('?')) {
        const escaped = target.replace(/[.+^${}()|[\]\\]/g, '\\$&')
        const pattern = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`
        const wildcard = new RegExp(pattern, 'i')
        return value => wildcard.test(value)
    }
    const normalized = target.toLowerCase()
    return value => value.toLowerCase() === normalized
}

export function normalizeCloseTarget (value: string): string | null {
    const cleaned = cleanConnectionTarget(value) ?? ''
    if (!cleaned) {
        return null
    }
    const parsed = parseHostToken(cleaned)
    return parsed?.host ?? cleaned
}

export function normalizeOpenTargets (targets: string[]): { directTargets: string[], patternTargets: string[] } {
    const directTargets: string[] = []
    const patternTargets: string[] = []
    for (const target of targets) {
        const pattern = extractPatternTargetFromPhrase(target)
        if (pattern) {
            patternTargets.push(pattern)
            continue
        }
        if (isPatternTarget(target)) {
            patternTargets.push(target)
            continue
        }
        directTargets.push(target)
    }
    return { directTargets, patternTargets }
}

export function isDisconnectIntent (prompt: string): boolean {
    return /\b(close|disconnect|terminate|end|kill|stop)\b/i.test(prompt)
}

export function isReconnectIntent (prompt: string): boolean {
    return /\b(reconnect|re-open|reopen|retry|restart)\b/i.test(prompt)
}

export function isDisconnectAllPrompt (prompt: string): boolean {
    return /\b(all|everything|all\s+connections|all\s+sessions|all\s+devices?)\b/i.test(prompt)
}

export function isSshConnectionIntent (prompt: string): boolean {
    return /open\s+(?:an?\s+)?ssh\s+connection/i.test(prompt)
        || /open\s+(?:an?\s+)?ssh\s+session/i.test(prompt)
        || /\bssh\s+(?:to|into)\b/i.test(prompt)
        || /\bssh\s+\S+/i.test(prompt)
        || /\bconnect\s+to\b/i.test(prompt)
        || /\bopen\s+connection\b/i.test(prompt)
        || /\bopen\s+session\b/i.test(prompt)
}

export function getConnectionProtocol (prompt: string): ConnectionProtocol | null {
    if (/\btelnet\b/i.test(prompt)) {
        return 'telnet'
    }
    if (isSshConnectionIntent(prompt)) {
        return 'ssh'
    }
    return null
}

export function getDisconnectProtocol (prompt: string): ConnectionProtocol | null {
    if (!isDisconnectIntent(prompt)) {
        return null
    }
    if (/\btelnet\b/i.test(prompt)) {
        return 'telnet'
    }
    if (/\bssh\b/i.test(prompt)) {
        return 'ssh'
    }
    return 'ssh'
}
