/**
 * Tiny JSON-path resolver for response extractors and assertions.
 *
 * We don't need the full RFC 6902 / JSONPath grammar — just enough to
 * cover the workflows users actually want:
 *   - dot-notation:  data.user.id
 *   - array index:   items[0].name
 *   - mixed:         response.tokens[1].value
 *
 * Unknown / out-of-range paths return `undefined`. The caller
 * stringifies the leaf for env-var storage.
 */
export function getByPath (root: unknown, path: string): unknown {
    if (!path) {
        return root
    }
    // Tokenize: split on `.` and `[N]` boundaries.
    const parts: (string | number)[] = []
    let buf = ''
    for (let i = 0; i < path.length; i++) {
        const c = path[i]
        if (c === '.') {
            if (buf) {parts.push(buf); buf = ''}
        } else if (c === '[') {
            if (buf) {parts.push(buf); buf = ''}
            const close = path.indexOf(']', i)
            if (close < 0) {
                return undefined
            }
            const idxStr = path.slice(i + 1, close).trim().replace(/^['"]|['"]$/g, '')
            const n = Number(idxStr)
            parts.push(Number.isNaN(n) ? idxStr : n)
            i = close
        } else {
            buf += c
        }
    }
    if (buf) {parts.push(buf)}
    let cur: any = root
    for (const p of parts) {
        if (cur == null) {
            return undefined
        }
        cur = cur[p]
    }
    return cur as unknown
}
