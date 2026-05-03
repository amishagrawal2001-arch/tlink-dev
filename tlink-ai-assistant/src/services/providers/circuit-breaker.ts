/**
 * Per-provider circuit breaker — fails subsequent requests fast when an
 * upstream is hard-down so the user doesn't sit through a 14-second
 * exponential-backoff hang on every chat turn.
 *
 * Without this, a typical "Groq is down" experience looks like:
 *   request → 5xx → wait 1s → retry → 5xx → wait 2s → retry → 5xx
 *   → wait 4s → retry → 5xx → throw "exhausted retries" (~14s)
 *   ... user retypes the message, repeats the whole thing.
 *
 * With this:
 *   first 3 requests: same as above (the breaker is learning).
 *   4th onward: instant `Error("provider unavailable, retry in Xs")`
 *   until cooldown elapses; one half-open probe; if it succeeds the
 *   breaker closes, otherwise it stays open another full cooldown.
 *
 * Rate-limited (429) and 4xx errors do NOT count as breaker failures —
 * the breaker is a model of upstream LIVENESS, not user-config errors.
 * Those go straight back to the caller via the existing withRetry
 * fast-fail path.
 */

export type CircuitBreakerState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerOptions {
    /** Consecutive failures required to trip from CLOSED → OPEN. Default 3. */
    threshold?: number
    /** Time to stay OPEN before allowing a half-open probe. Default 30s. */
    cooldownMs?: number
}

export interface CircuitBreakerSnapshot {
    state: CircuitBreakerState
    consecutiveFailures: number
    /** Wall-clock ms when the breaker most recently opened. 0 if never. */
    openedAt: number
    /** ms left in the current cooldown window. 0 unless OPEN. */
    remainingCooldownMs: number
}

export class CircuitBreaker {
    private state: CircuitBreakerState = 'closed'
    private consecutiveFailures = 0
    private openedAt = 0
    private readonly threshold: number
    private readonly cooldownMs: number

    constructor (options: CircuitBreakerOptions = {}) {
        this.threshold = Math.max(1, options.threshold ?? 3)
        this.cooldownMs = Math.max(1000, options.cooldownMs ?? 30_000)
    }

    /**
     * Returns true when the caller should fail FAST without attempting
     * the upstream call. Lazily transitions OPEN → HALF_OPEN once the
     * cooldown elapses; the next call after that point gets through
     * to upstream as a probe.
     */
    shouldShortCircuit (): boolean {
        if (this.state === 'closed') return false
        if (this.state === 'half_open') return false
        // OPEN — check if cooldown elapsed.
        if (Date.now() - this.openedAt >= this.cooldownMs) {
            this.state = 'half_open'
            return false
        }
        return true
    }

    /** Call after a successful upstream request. */
    recordSuccess (): void {
        this.consecutiveFailures = 0
        this.state = 'closed'
    }

    /**
     * Call after a transient failure (5xx, network error, timeout).
     * Returns true when this call caused the breaker to trip — the caller
     * can use that to log a one-time "circuit OPEN" warning instead of
     * one warning per failure.
     */
    recordFailure (): boolean {
        this.consecutiveFailures += 1
        if (this.state === 'half_open') {
            // Probe failed — back to OPEN with a fresh cooldown.
            this.state = 'open'
            this.openedAt = Date.now()
            return false   // already open before this call, not "newly tripped"
        }
        if (this.consecutiveFailures >= this.threshold) {
            const wasClosed = this.state === 'closed'
            this.state = 'open'
            this.openedAt = Date.now()
            return wasClosed
        }
        return false
    }

    /** Read-only snapshot for UI/health probes. Doesn't mutate state. */
    snapshot (): CircuitBreakerSnapshot {
        const remaining = this.state === 'open'
            ? Math.max(0, this.cooldownMs - (Date.now() - this.openedAt))
            : 0
        return {
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            openedAt: this.openedAt,
            remainingCooldownMs: remaining,
        }
    }

    /** Configured cooldown duration in ms. */
    getCooldownMs (): number {
        return this.cooldownMs
    }

    /** Manual reset — for "I fixed the upstream, retry now" UI buttons. */
    reset (): void {
        this.state = 'closed'
        this.consecutiveFailures = 0
        this.openedAt = 0
    }
}

/** Error thrown when a request short-circuits because the breaker is open. */
export class CircuitOpenError extends Error {
    public readonly code = 'CIRCUIT_OPEN'
    constructor (
        public readonly providerName: string,
        public readonly remainingCooldownMs: number,
    ) {
        super(
            `${providerName} is temporarily unavailable — failing fast ` +
            `(retry in ${Math.ceil(remainingCooldownMs / 1000)}s).`
        )
        this.name = 'CircuitOpenError'
    }
}
