import { TerminalOutputHighlightConfig, TerminalOutputHighlightRule } from './api/interfaces'

export interface OutputHighlightRule {
    regex: RegExp
    start: string
    prefixGroup?: number
    captureGroup?: number
    suffixGroup?: number
}

const RESET_FOREGROUND = '\x1b[39m'
const ANSI_SEQUENCE_REGEX = /(?:\x1b\[[0-?]*[ -/]*[@-~])|(?:\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))|(?:\x9b[0-?]*[ -/]*[@-~])/g

const LEGACY_IPV6_PATTERN = '\\b(?:(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|:(?::[0-9a-fA-F]{1,4}){1,7})(?:%[\\w./-]+)?\\b'

type HighlightRuleDefinition = TerminalOutputHighlightRule & {
    prefixGroup?: number
    captureGroup?: number
    suffixGroup?: number
}

export const DEFAULT_OUTPUT_HIGHLIGHT_RULES: HighlightRuleDefinition[] = [
    {
        pattern: '\\bOK\\b',
        flags: 'gi',
        color: '#33d17a',
    },
    {
        pattern: '\\bUP\\b',
        flags: 'gi',
        color: '#33d17a',
    },
    {
        pattern: '\\bWARN(?:ING)?\\b',
        flags: 'gi',
        color: '#f6d32d',
    },
    {
        pattern: '\\bDOWN\\b',
        flags: 'gi',
        color: '#ed333b',
    },
    {
        pattern: '\\bERROR\\b|\\bFAIL(?:ED)?\\b',
        flags: 'gi',
        color: '#ed333b',
    },
    {
        pattern: '\\b(?:Errors|Drops|Framing errors|Runts|Policed discards|L3 incompletes|L2 channel errors|L2 mismatch timeouts|FIFO errors|Resource errors|Carrier transitions|Collisions|Aged packets|HS link CRC errors|MTU errors|ECN Marked packets):\\s*[1-9]\\d*\\b',
        flags: 'gi',
        color: '#f59e0b',
    },
    {
        pattern: '^(\\s*\\d+\\s+\\d+\\s+\\d+\\s+)([1-9]\\d*)(\\s*)$',
        flags: 'm',
        color: '#f59e0b',
        prefixGroup: 1,
        captureGroup: 2,
        suffixGroup: 3,
    },
    {
        pattern: '\\b(?:et|xe|ge)-\\d+\\/\\d+\\/\\d+(?:\\.\\d+)?\\b',
        flags: 'gi',
        color: '#62a0ea',
    },
    {
        pattern: '\\b((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b',
        flags: 'g',
        color: '#62a0ea',
    },
    {
        pattern: '(?<![0-9A-Fa-f:])(?=[0-9A-Fa-f:]*[0-9A-Fa-f])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?:%[\\w./-]+)?(?:\\/\\d{1,3})?(?![0-9A-Fa-f:])',
        flags: 'gi',
        color: '#62a0ea',
    },
]

export function compileOutputHighlightRules (config?: TerminalOutputHighlightConfig): OutputHighlightRule[] {
    if (!config) {
        return []
    }

    const normalizedRules = normalizeOutputHighlightRules(config.rules)
    if (!normalizedRules.length) {
        return []
    }

    const rules: OutputHighlightRule[] = []
    for (const rule of normalizedRules) {
        const color = colorToAnsi(rule.color)
        if (!color) {
            continue
        }
        const regex = buildRegex(rule.pattern, rule.flags)
        if (!regex) {
            continue
        }
        rules.push({
            regex,
            start: color,
            prefixGroup: rule.prefixGroup,
            captureGroup: rule.captureGroup,
            suffixGroup: rule.suffixGroup,
        })
    }
    return rules
}

export function applyOutputHighlighting (
    data: string,
    rules: OutputHighlightRule[],
    skipIfAnsiPresent = true,
): string {
    if (!data || !rules.length) {
        return data
    }
    if (skipIfAnsiPresent && (data.includes('\x1b') || data.includes('\x9b'))) {
        return data
    }

    let result = data
    for (const rule of rules) {
        result = applyRule(result, rule)
    }
    return result
}

function applyRule (input: string, rule: OutputHighlightRule): string {
    const parts = splitByAnsi(input)
    let changed = false
    const out = parts.map(part => {
        if (part.ansi) {
            return part.value
        }
        if (!rule.captureGroup) {
            return part.value.replace(rule.regex, match => {
                changed = true
                return `${rule.start}${match}${RESET_FOREGROUND}`
            })
        }
        return part.value.replace(rule.regex, (...args) => {
            const match = args[0]
            const groups = args.slice(1, -2)
            const target = groups[rule.captureGroup! - 1]
            if (!target) {
                return match
            }
            changed = true
            if (rule.prefixGroup || rule.suffixGroup) {
                const prefix = rule.prefixGroup ? (groups[rule.prefixGroup - 1] ?? '') : ''
                const suffix = rule.suffixGroup ? (groups[rule.suffixGroup - 1] ?? '') : ''
                return `${prefix}${rule.start}${target}${RESET_FOREGROUND}${suffix}`
            }
            return `${rule.start}${match}${RESET_FOREGROUND}`
        })
    }).join('')
    return changed ? out : input
}

function normalizeOutputHighlightRules (rules?: TerminalOutputHighlightRule[]): HighlightRuleDefinition[] {
    const customRules = (rules ?? []).filter(rule => rule?.pattern && rule?.color) as HighlightRuleDefinition[]
    const filteredCustomRules = customRules.filter(rule => rule.pattern !== LEGACY_IPV6_PATTERN)
    const customByKey = new Map<string, HighlightRuleDefinition>()
    for (const rule of filteredCustomRules) {
        customByKey.set(ruleKey(rule), rule)
    }

    const merged: HighlightRuleDefinition[] = []
    for (const rule of DEFAULT_OUTPUT_HIGHLIGHT_RULES) {
        const key = ruleKey(rule)
        if (customByKey.has(key)) {
            merged.push(customByKey.get(key)!)
            customByKey.delete(key)
        } else {
            merged.push(rule)
        }
    }

    for (const rule of customByKey.values()) {
        merged.push(rule)
    }

    return merged
}

function ruleKey (rule: TerminalOutputHighlightRule): string {
    return `${rule.pattern}@@${rule.flags ?? ''}`
}

function splitByAnsi (input: string): Array<{ value: string, ansi: boolean }> {
    if (!input.includes('\x1b') && !input.includes('\x9b')) {
        return [{ value: input, ansi: false }]
    }

    const parts: Array<{ value: string, ansi: boolean }> = []
    let lastIndex = 0
    ANSI_SEQUENCE_REGEX.lastIndex = 0
    let match: RegExpExecArray|null
    while ((match = ANSI_SEQUENCE_REGEX.exec(input)) !== null) {
        const index = match.index
        if (index > lastIndex) {
            parts.push({ value: input.slice(lastIndex, index), ansi: false })
        }
        parts.push({ value: match[0], ansi: true })
        lastIndex = index + match[0].length
    }
    if (lastIndex < input.length) {
        parts.push({ value: input.slice(lastIndex), ansi: false })
    }
    return parts
}

function buildRegex (pattern: string, flags?: string): RegExp|null {
    if (!pattern) {
        return null
    }
    let normalizedFlags = flags ?? ''
    if (!normalizedFlags.includes('g')) {
        normalizedFlags += 'g'
    }
    try {
        return new RegExp(pattern, normalizedFlags)
    } catch (error) {
        console.warn('Invalid output highlight regex:', pattern, error)
        return null
    }
}

function colorToAnsi (color: string): string|null {
    const rgb = parseHexColor(color)
    if (!rgb) {
        return null
    }
    const [r, g, b] = rgb
    return `\x1b[38;2;${r};${g};${b}m`
}

function parseHexColor (color: string): [number, number, number]|null {
    if (!color) {
        return null
    }
    const trimmed = color.trim()
    const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed)
    if (!match) {
        return null
    }
    const hex = match[1]
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return [r, g, b]
}
