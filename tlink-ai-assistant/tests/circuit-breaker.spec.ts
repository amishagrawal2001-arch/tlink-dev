import { CircuitBreaker, CircuitOpenError } from '../src/services/providers/circuit-breaker'

describe('CircuitBreaker', () => {
    test('starts closed and lets calls through', () => {
        const cb = new CircuitBreaker()
        expect(cb.shouldShortCircuit()).toBe(false)
        expect(cb.snapshot().state).toBe('closed')
    })

    test('trips OPEN after threshold consecutive failures', () => {
        const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 60_000 })
        expect(cb.recordFailure()).toBe(false) // 1st
        expect(cb.recordFailure()).toBe(false) // 2nd
        expect(cb.recordFailure()).toBe(true)  // 3rd — newly tripped
        expect(cb.snapshot().state).toBe('open')
        expect(cb.shouldShortCircuit()).toBe(true)
    })

    test('subsequent failure while OPEN does NOT report newly-tripped', () => {
        const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 60_000 })
        cb.recordFailure()
        cb.recordFailure() // tripped
        expect(cb.recordFailure()).toBe(false)
        expect(cb.recordFailure()).toBe(false)
    })

    test('recordSuccess closes the breaker and resets the counter', () => {
        const cb = new CircuitBreaker({ threshold: 3 })
        cb.recordFailure()
        cb.recordFailure()
        expect(cb.snapshot().consecutiveFailures).toBe(2)
        cb.recordSuccess()
        expect(cb.snapshot()).toMatchObject({ state: 'closed', consecutiveFailures: 0 })
    })

    test('transitions OPEN → HALF_OPEN once cooldown elapses', () => {
        // Tight cooldown so the test runs fast. The class enforces a 1s
        // floor, so we use that.
        const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 })
        cb.recordFailure() // tripped
        expect(cb.shouldShortCircuit()).toBe(true)

        // Fast-forward "now" by mocking Date.now via the breaker's
        // openedAt field. Easier: wait the cooldown.
        const realNow = Date.now
        Date.now = () => realNow() + 1500
        try {
            // First call after cooldown: short-circuit returns false AND
            // the state flips to half_open (lazy transition).
            expect(cb.shouldShortCircuit()).toBe(false)
            expect(cb.snapshot().state).toBe('half_open')
        } finally {
            Date.now = realNow
        }
    })

    test('HALF_OPEN → CLOSED on success', () => {
        const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 })
        cb.recordFailure()
        const realNow = Date.now
        Date.now = () => realNow() + 1500
        try {
            cb.shouldShortCircuit() // transitions to half_open
            cb.recordSuccess()
            expect(cb.snapshot().state).toBe('closed')
        } finally {
            Date.now = realNow
        }
    })

    test('HALF_OPEN → OPEN on failure (probe failed)', () => {
        const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 })
        cb.recordFailure()
        const realNow = Date.now
        Date.now = () => realNow() + 1500
        try {
            cb.shouldShortCircuit() // half_open
            const tripped = cb.recordFailure()
            expect(cb.snapshot().state).toBe('open')
            // Not "newly tripped" — was already tripped before; just
            // re-armed cooldown.
            expect(tripped).toBe(false)
            // Cooldown timer reset, so we still short-circuit.
            expect(cb.shouldShortCircuit()).toBe(true)
        } finally {
            Date.now = realNow
        }
    })

    test('reset() forces back to closed', () => {
        const cb = new CircuitBreaker({ threshold: 2 })
        cb.recordFailure()
        cb.recordFailure() // tripped
        cb.reset()
        expect(cb.snapshot()).toMatchObject({ state: 'closed', consecutiveFailures: 0 })
        expect(cb.shouldShortCircuit()).toBe(false)
    })

    test('snapshot reports remaining cooldown when OPEN', () => {
        const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 30_000 })
        cb.recordFailure()
        const snap = cb.snapshot()
        expect(snap.state).toBe('open')
        expect(snap.remainingCooldownMs).toBeGreaterThan(0)
        expect(snap.remainingCooldownMs).toBeLessThanOrEqual(30_000)
    })

    test('snapshot remainingCooldownMs is 0 when closed', () => {
        const cb = new CircuitBreaker()
        expect(cb.snapshot().remainingCooldownMs).toBe(0)
    })

    test('threshold floor is 1', () => {
        const cb = new CircuitBreaker({ threshold: 0 })
        expect(cb.recordFailure()).toBe(true) // 0 → clamps to 1, single failure trips
    })

    test('cooldown floor is 1000ms', () => {
        const cb = new CircuitBreaker({ cooldownMs: 100 })
        expect(cb.getCooldownMs()).toBe(1000)
    })
})

describe('CircuitOpenError', () => {
    test('carries provider name and remaining cooldown', () => {
        const err = new CircuitOpenError('groq', 12_345)
        expect(err.code).toBe('CIRCUIT_OPEN')
        expect(err.providerName).toBe('groq')
        expect(err.remainingCooldownMs).toBe(12_345)
        expect(err.message).toMatch(/groq/)
        expect(err.message).toMatch(/13s/)   // ceil(12345/1000)
    })

    test('is an instance of Error', () => {
        const err = new CircuitOpenError('p', 0)
        expect(err).toBeInstanceOf(Error)
        expect(err.name).toBe('CircuitOpenError')
    })
})
