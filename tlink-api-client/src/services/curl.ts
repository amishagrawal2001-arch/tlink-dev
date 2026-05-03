import { APIClientOptions, HttpMethod, RequestHeader } from '../api/interfaces'

/**
 * cURL import / export utilities.
 *
 * Parsing real-world cURL is a long tail of edge cases — line
 * continuations, single vs. double quotes, `-d` vs `--data-raw`,
 * `--data-urlencode`, `@filename` for body, etc. We handle the common
 * cases that DevTools' "Copy as cURL" and Postman emit, since those
 * are what users will most often paste in. Failures fall back to a
 * useful error message rather than silent garbage.
 */

const KNOWN_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

// ---- Helpers (declared first so the parser doesn't trip on
//      no-use-before-define when they're referenced below) -------------

/** Single-quote a string for shell, switching to double quotes when
 *  the value itself contains an apostrophe. */
function shellQuote (s: string): string {
    if (!s.includes('\'')) {
        return `'${s}'`
    }
    return `"${s.replace(/(["\\$`])/g, '\\$1')}"`
}

function tryParseJson (s: string): unknown {
    try { return JSON.parse(s) } catch { return undefined }
}

function b64 (s: string): string {
    if (typeof btoa === 'function') {
        return btoa(s)
    }
    return Buffer.from(s, 'utf8').toString('base64')
}

/** Tokenize a cURL command respecting quotes + line continuations. */
function tokenize (input: string): string[] {
    const cleaned = input.replace(/\\\r?\n/g, ' ').replace(/^﻿/, '').trim().replace(/^\$\s*/, '')
    const tokens: string[] = []
    let i = 0
    while (i < cleaned.length) {
        const c = cleaned[i]
        if (c === ' ' || c === '\t' || c === '\n') {
            i++
            continue
        }
        if (c === '\'' || c === '"') {
            const quoteChar = c
            i++
            let buf = ''
            while (i < cleaned.length && cleaned[i] !== quoteChar) {
                if (quoteChar === '"' && cleaned[i] === '\\' && i + 1 < cleaned.length) {
                    buf += cleaned[i + 1]
                    i += 2
                } else {
                    buf += cleaned[i]
                    i++
                }
            }
            i++  // closing quote
            tokens.push(buf)
            // Adjacent quoted runs concatenate per shell semantics.
            while (i < cleaned.length && (cleaned[i] === '\'' || cleaned[i] === '"')) {
                const q2 = cleaned[i]
                let buf2 = ''
                i++
                while (i < cleaned.length && cleaned[i] !== q2) {
                    buf2 += cleaned[i]
                    i++
                }
                i++
                tokens[tokens.length - 1] += buf2
            }
            continue
        }
        let buf = ''
        while (i < cleaned.length && !' \t\n'.includes(cleaned[i])) {
            if (cleaned[i] === '\\' && i + 1 < cleaned.length) {
                buf += cleaned[i + 1]
                i += 2
            } else {
                buf += cleaned[i]
                i++
            }
        }
        tokens.push(buf)
    }
    return tokens
}

// ---- Public API ----------------------------------------------------

/**
 * Parse a cURL command into APIClientOptions. Throws with a helpful
 * message on the inputs we can't make sense of so the caller can
 * surface it in a toast.
 */
export function importCurl (input: string): APIClientOptions {
    if (!input || !/curl\b/i.test(input)) {
        throw new Error('Input does not look like a cURL command')
    }
    const tokens = tokenize(input)
    const curlIdx = tokens.findIndex(t => /^curl(\.exe)?$/i.test(t))
    const args = curlIdx >= 0 ? tokens.slice(curlIdx + 1) : tokens

    let method: HttpMethod = 'GET'
    let url = ''
    const headers: RequestHeader[] = []
    let body = ''
    let bodyType: APIClientOptions['bodyType'] = 'none'
    let auth: APIClientOptions['auth'] = { type: 'none' }
    const formData: { key: string, value: string, kind: 'text' | 'file', enabled: boolean }[] = []

    let i = 0
    const next = (a: string): string => {
        if (i + 1 >= args.length) {
            throw new Error(`Missing value for ${a}`)
        }
        return args[++i]
    }
    while (i < args.length) {
        const a = args[i]
        if (a === '-X' || a === '--request') {
            const m = next(a).toUpperCase() as HttpMethod
            if (KNOWN_METHODS.includes(m)) {
                method = m
            }
        } else if (a === '-H' || a === '--header') {
            const pair = next(a)
            const idx = pair.indexOf(':')
            if (idx > 0) {
                const k = pair.slice(0, idx).trim()
                const v = pair.slice(idx + 1).trim()
                headers.push({ key: k, value: v, enabled: true })
            }
        } else if (a === '-A' || a === '--user-agent') {
            headers.push({ key: 'User-Agent', value: next(a), enabled: true })
        } else if (a === '-e' || a === '--referer') {
            headers.push({ key: 'Referer', value: next(a), enabled: true })
        } else if (a === '-b' || a === '--cookie') {
            headers.push({ key: 'Cookie', value: next(a), enabled: true })
        } else if (a === '-u' || a === '--user') {
            const pair = next(a)
            const idx = pair.indexOf(':')
            if (idx >= 0) {
                auth = { type: 'basic', username: pair.slice(0, idx), password: pair.slice(idx + 1) }
            } else {
                auth = { type: 'basic', username: pair, password: '' }
            }
        } else if (a === '-d' || a === '--data' || a === '--data-raw' || a === '--data-binary' || a === '--data-ascii') {
            const v = next(a)
            body = body ? body + '&' + v : v
            if (method === 'GET') {method = 'POST'}
            bodyType = bodyType === 'none' ? 'text' : bodyType
        } else if (a === '--data-urlencode') {
            const v = next(a)
            body = body ? body + '&' + v : v
            if (method === 'GET') {method = 'POST'}
            bodyType = 'urlencoded'
        } else if (a === '-F' || a === '--form') {
            const v = next(a)
            const idx = v.indexOf('=')
            if (idx > 0) {
                const key = v.slice(0, idx)
                const raw = v.slice(idx + 1)
                if (raw.startsWith('@')) {
                    formData.push({ key, value: raw.slice(1), kind: 'file', enabled: true })
                } else {
                    formData.push({ key, value: raw, kind: 'text', enabled: true })
                }
            }
            if (method === 'GET') {method = 'POST'}
            bodyType = 'form-data'
        } else if (a === '-G' || a === '--get') {
            method = 'GET'
        } else if (a === '-I' || a === '--head') {
            method = 'HEAD'
        } else if (a === '--url') {
            url = next(a)
        } else if (a === '-k' || a === '--insecure'
            || a === '-L' || a === '--location'
            || a === '-s' || a === '--silent'
            || a === '-S' || a === '--show-error'
            || a === '-v' || a === '--verbose'
            || a === '--compressed') {
            // Silently swallow flags we can't act on.
        } else if (a.startsWith('-')) {
            // Unknown flag — skip its argument if it looks like one.
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                i++
            }
        } else {
            url = a
        }
        i++
    }

    const authHeader = headers.find(h => h.key.toLowerCase() === 'authorization')
    if (authHeader && /^bearer\s+/i.test(authHeader.value) && auth.type === 'none') {
        auth = { type: 'bearer', token: authHeader.value.replace(/^bearer\s+/i, '').trim() }
    }

    if (!url) {
        throw new Error('No URL detected in cURL command')
    }

    if (bodyType === 'text' || bodyType === 'urlencoded') {
        const ct = headers.find(h => h.key.toLowerCase() === 'content-type')?.value ?? ''
        if (/json/i.test(ct)) {
            bodyType = 'json'
        } else if (/x-www-form-urlencoded/i.test(ct)) {
            bodyType = 'urlencoded'
        }
    }

    return {
        url,
        method,
        headers,
        body,
        bodyType,
        timeout: 30000,
        auth,
        formData: formData.length ? formData : undefined,
    }
}

/**
 * Render the current request as a portable cURL command. We use
 * single-quoted args so embedded JSON quotes survive, with a fallback
 * to escape-in-double-quote when the value itself contains `'`.
 */
export function exportCurl (opts: APIClientOptions): string {
    const parts: string[] = ['curl']
    if (opts.method !== 'GET') {
        parts.push('-X', opts.method)
    }
    parts.push(shellQuote(opts.url))
    for (const h of opts.headers) {
        if (!h.enabled || !h.key.trim()) {continue}
        parts.push('-H', shellQuote(`${h.key}: ${h.value}`))
    }
    if (opts.auth.type === 'bearer' && opts.auth.token) {
        parts.push('-H', shellQuote(`Authorization: Bearer ${opts.auth.token}`))
    } else if (opts.auth.type === 'basic' && opts.auth.username) {
        parts.push('-u', shellQuote(`${opts.auth.username}:${opts.auth.password ?? ''}`))
    } else if (opts.auth.type === 'apikey' && opts.auth.apiKeyName && opts.auth.apiKeyValue) {
        if ((opts.auth.apiKeyLocation ?? 'header') === 'header') {
            parts.push('-H', shellQuote(`${opts.auth.apiKeyName}: ${opts.auth.apiKeyValue}`))
        }
    }
    if (opts.bodyType === 'json' && opts.body) {
        if (!opts.headers.some(h => h.enabled && h.key.toLowerCase() === 'content-type')) {
            parts.push('-H', shellQuote('Content-Type: application/json'))
        }
        parts.push('--data-raw', shellQuote(opts.body))
    } else if (opts.bodyType === 'text' && opts.body) {
        parts.push('--data-raw', shellQuote(opts.body))
    } else if (opts.bodyType === 'urlencoded' && opts.body) {
        parts.push('--data-urlencode', shellQuote(opts.body))
    } else if (opts.bodyType === 'form-data' && opts.formData?.length) {
        for (const f of opts.formData) {
            if (!f.enabled || !f.key) {continue}
            const v = f.kind === 'file' ? `@${f.filePath ?? f.value}` : f.value
            parts.push('-F', shellQuote(`${f.key}=${v}`))
        }
    } else if (opts.bodyType === 'graphql' && opts.graphql) {
        if (!opts.headers.some(h => h.enabled && h.key.toLowerCase() === 'content-type')) {
            parts.push('-H', shellQuote('Content-Type: application/json'))
        }
        const payload = JSON.stringify({
            query: opts.graphql.query,
            variables: tryParseJson(opts.graphql.variables) ?? {},
            operationName: opts.graphql.operationName ?? null,
        })
        parts.push('--data-raw', shellQuote(payload))
    }
    return parts.join(' ')
}

/**
 * Render the current request as code in the requested target.
 * Targets are intentionally minimal: enough to copy/paste into a quick
 * script; not a full SDK generator.
 */
export type CodeTarget = 'fetch' | 'axios' | 'python' | 'go'

export function exportCode (opts: APIClientOptions, target: CodeTarget): string {
    const headers: Record<string, string> = {}
    for (const h of opts.headers) {
        if (h.enabled && h.key.trim()) {
            headers[h.key] = h.value
        }
    }
    if (opts.auth.type === 'bearer' && opts.auth.token) {
        headers['Authorization'] = `Bearer ${opts.auth.token}`
    } else if (opts.auth.type === 'basic' && opts.auth.username) {
        headers['Authorization'] = 'Basic ' + b64(`${opts.auth.username}:${opts.auth.password ?? ''}`)
    } else if (opts.auth.type === 'apikey' && opts.auth.apiKeyName && (opts.auth.apiKeyLocation ?? 'header') === 'header') {
        headers[opts.auth.apiKeyName] = opts.auth.apiKeyValue ?? ''
    }
    const hasBody = opts.bodyType !== 'none' && opts.method !== 'GET' && opts.method !== 'HEAD'
    const body = hasBody ? opts.body : ''

    if (target === 'fetch') {
        return [
            `const res = await fetch(${JSON.stringify(opts.url)}, {`,
            `    method: ${JSON.stringify(opts.method)},`,
            `    headers: ${JSON.stringify(headers, null, 4)},`,
            ...(hasBody ? [`    body: ${JSON.stringify(body)},`] : []),
            '})',
            'const data = await res.text()',
            'console.log(res.status, data)',
        ].join('\n')
    }
    if (target === 'axios') {
        return [
            'import axios from \'axios\'',
            '',
            'const res = await axios({',
            `    url: ${JSON.stringify(opts.url)},`,
            `    method: ${JSON.stringify(opts.method)},`,
            `    headers: ${JSON.stringify(headers, null, 4)},`,
            ...(hasBody ? [`    data: ${JSON.stringify(body)},`] : []),
            `    timeout: ${opts.timeout},`,
            '})',
            'console.log(res.status, res.data)',
        ].join('\n')
    }
    if (target === 'python') {
        return [
            'import requests',
            '',
            `headers = ${JSON.stringify(headers, null, 4)}`,
            ...(hasBody ? [`data = ${JSON.stringify(body)}`] : []),
            'res = requests.request(',
            `    method=${JSON.stringify(opts.method)},`,
            `    url=${JSON.stringify(opts.url)},`,
            '    headers=headers,',
            ...(hasBody ? ['    data=data,'] : []),
            `    timeout=${(opts.timeout / 1000).toFixed(0)},`,
            ')',
            'print(res.status_code, res.text)',
        ].join('\n')
    }
    // go
    return [
        'package main',
        '',
        'import (',
        '    "fmt"',
        '    "io"',
        '    "net/http"',
        '    "strings"',
        ')',
        '',
        'func main() {',
        ...(hasBody
            ? [`    body := strings.NewReader(${JSON.stringify(body)})`,
                `    req, _ := http.NewRequest(${JSON.stringify(opts.method)}, ${JSON.stringify(opts.url)}, body)`]
            : [`    req, _ := http.NewRequest(${JSON.stringify(opts.method)}, ${JSON.stringify(opts.url)}, nil)`]),
        ...Object.entries(headers).map(([k, v]) => `    req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`),
        '    res, err := http.DefaultClient.Do(req)',
        '    if err != nil { panic(err) }',
        '    defer res.Body.Close()',
        '    out, _ := io.ReadAll(res.Body)',
        '    fmt.Println(res.StatusCode, string(out))',
        '}',
    ].join('\n')
}

/** Bind so callers can keep static-method style. */
export const Curl = { 'import': importCurl, 'export': exportCurl, code: exportCode }
