import { scrubSecretString, scrubSecrets } from '../src/services/security/secret-scrubber'

describe('scrubSecretString — provider key patterns', () => {
    test('redacts OpenAI sk- keys', () => {
        const out = scrubSecretString('Authorization failed: sk-abcdefghijklmnopqrstuvwxyz')
        expect(out).not.toContain('sk-abcdefghij')
        expect(out).toContain('sk-<redacted>')
    })

    test('redacts OpenAI sk-proj- project keys', () => {
        // sk-proj- prefix matches the same `\bsk-` pattern.
        const out = scrubSecretString('key: sk-proj-AAAA1111BBBB2222CCCC3333DDDD')
        expect(out).toContain('sk-<redacted>')
    })

    test('redacts Anthropic sk-ant- user keys', () => {
        const out = scrubSecretString('header: sk-ant-api03-aaaaBBBBccccDDDDeeeeFFFF')
        expect(out).toContain('sk-ant-<redacted>')
    })

    test('redacts Anthropic admin/org keys (sk-ant-admin01-)', () => {
        const out = scrubSecretString('admin token: sk-ant-admin01-XXXXyyyyZZZZ1111aaaa')
        expect(out).toContain('sk-ant-<redacted>')
    })

    test('redacts Groq gsk_ keys', () => {
        const out = scrubSecretString('GROQ_API_KEY=gsk_abcdefghijklmnopqrstUVWX')
        expect(out).not.toContain('gsk_abcdefghij')
        expect(out).toContain('gsk_<redacted>')
    })

    test('redacts xAI xai- keys', () => {
        const out = scrubSecretString('Bearer xai-AbCdEfGhIjKlMnOpQrStUvWxYz123456')
        expect(out).toContain('xai-<redacted>')
    })

    test('redacts HuggingFace hf_ tokens', () => {
        const out = scrubSecretString('HF token: hf_abcdefghijklmnopqrstUVWXYZ1234')
        expect(out).toContain('hf_<redacted>')
    })

    test('redacts Replicate r8_ tokens', () => {
        const out = scrubSecretString('REPLICATE_API_TOKEN=r8_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345')
        expect(out).toContain('r8_<redacted>')
    })

    test('redacts JWTs', () => {
        const jwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.' +
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1234567890'
        const out = scrubSecretString(`token: ${jwt}`)
        expect(out).toContain('<redacted-jwt>')
        expect(out).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0')
    })

    test('does not over-match short version triplets', () => {
        // "1.2.345" has dots but isn't a JWT — must not get redacted.
        const out = scrubSecretString('app version 1.2.345 released today')
        expect(out).toContain('1.2.345')
    })

    test('redacts Authorization: Bearer <token>', () => {
        const out = scrubSecretString('Authorization: Bearer abc123def456ghi789jkl012')
        expect(out).not.toContain('abc123def456')
        expect(out).toContain('Bearer <redacted>')
    })

    test('redacts named credentials in JSON-ish blobs', () => {
        const out = scrubSecretString('"api_key": "supersecretvalue"')
        expect(out).not.toContain('supersecretvalue')
    })

    test('passes through non-credential strings unchanged', () => {
        const text = 'The user asked about the weather in San Francisco.'
        expect(scrubSecretString(text)).toBe(text)
    })
})

describe('scrubSecrets — recursive object scrub', () => {
    test('redacts known credential keys regardless of value shape', () => {
        const out = scrubSecrets({
            user: 'alice',
            api_key: 'whatever-this-is',
            nested: { password: 'p4ssw0rd' },
        })
        expect(out.user).toBe('alice')
        expect(out.api_key).toBe('<redacted>')
        expect(out.nested.password).toBe('<redacted>')
    })

    test('walks arrays', () => {
        const out = scrubSecrets([
            'plain text',
            'sk-abcdefghijklmnopqrstuvwxyz',
            // The recursive scrubber redacts based on KEY NAME for a
            // conservative whitelist (api_key, password, secret, etc.).
            // For values inside non-matching keys, it falls through to
            // the value-shape regexes — so a key like "auth_token" that
            // holds a real OpenAI key still gets redacted via the
            // sk- pattern.
            { auth_token: 'sk-abcdefghijklmnopqrstuvwxyz' },
        ])
        expect(out[0]).toBe('plain text')
        expect(out[1]).toContain('sk-<redacted>')
        // auth_token IS in the named-credential whitelist, so the value
        // is wholesale-redacted rather than pattern-scrubbed.
        expect(out[2].auth_token).toBe('<redacted>')
    })

    test('coerces non-plain objects (Date, Map) to string before scrubbing', () => {
        const m = new Map<string, string>([['k', 'gsk_abcdefghijklmnopqrstUVWX']])
        const out = scrubSecrets(m)
        expect(typeof out).toBe('string')
        // The Map's stringification is `[object Map]` so the secret won't
        // appear there anyway, but verify nothing throws and the contract
        // (return string) holds.
        expect(out).not.toContain('gsk_abcdefghij')
    })

    test('respects max recursion depth', () => {
        // Build a deeply nested object beyond the 8-level cap.
        let deep: any = { val: 'gsk_abcdefghijklmnopqrstUVWX' }
        for (let i = 0; i < 12; i++) deep = { next: deep }
        const out = scrubSecrets(deep)
        // Doesn't throw; deepest level is replaced by the depth marker.
        const stringified = JSON.stringify(out)
        expect(stringified).toContain('[scrub: max depth]')
    })
})
