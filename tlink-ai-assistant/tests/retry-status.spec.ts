/**
 * BaseAiProvider.withRetry tests.
 *
 * Pins the retry-decision invariant we re-fixed recently: 4xx client
 * errors (except 429 rate-limit) must bail immediately instead of
 * retrying — there's no universe where a 401 or 422 will succeed on
 * attempt 3 of 3. Also pins Retry-After honoring for 429.
 */

// We need access to the protected `withRetry` method. Subclass the
// concrete OpenAI provider (arbitrary choice — the method lives on
// the base) and expose it.
import { OpenAIProviderService } from '../src/services/providers/openai-provider.service';

class StubLogger {
    debug(..._args: any[]) { /* noop */ }
    info(..._args: any[]) { /* noop */ }
    warn(..._args: any[]) { /* noop */ }
    error(..._args: any[]) { /* noop */ }
}

class TestProvider extends OpenAIProviderService {
    constructor() {
        super(new StubLogger() as any);
        // Shorten the retry budget — we assert on attempt counts, not timing.
        this.config = { retries: 3 } as any;
    }
    public runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        return (this as any).withRetry(fn);
    }
}

function httpError(status: number, headers: Record<string, any> = {}) {
    const err: any = new Error(`HTTP ${status}`);
    err.response = { status, headers };
    return err;
}

describe('BaseAiProvider.withRetry', () => {
    it('retries a transient network failure then succeeds', async () => {
        const p = new TestProvider();
        let attempts = 0;
        const result = await p.runWithRetry(async () => {
            attempts++;
            if (attempts < 2) throw new Error('ECONNRESET');
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(attempts).toBe(2);
    });

    it('retries 5xx errors', async () => {
        const p = new TestProvider();
        let attempts = 0;
        const result = await p.runWithRetry(async () => {
            attempts++;
            if (attempts < 2) throw httpError(503);
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(attempts).toBe(2);
    });

    it('BAILS on 401 — does not retry auth errors', async () => {
        const p = new TestProvider();
        let attempts = 0;
        await expect(p.runWithRetry(async () => {
            attempts++;
            throw httpError(401);
        })).rejects.toThrow();
        expect(attempts).toBe(1);
    });

    it('BAILS on 422 — does not retry validation errors', async () => {
        const p = new TestProvider();
        let attempts = 0;
        await expect(p.runWithRetry(async () => {
            attempts++;
            throw httpError(422);
        })).rejects.toThrow();
        expect(attempts).toBe(1);
    });

    it('BAILS on 404 — does not retry not-found', async () => {
        const p = new TestProvider();
        let attempts = 0;
        await expect(p.runWithRetry(async () => {
            attempts++;
            throw httpError(404);
        })).rejects.toThrow();
        expect(attempts).toBe(1);
    });

    it('DOES retry 429 — rate limit is transient', async () => {
        const p = new TestProvider();
        let attempts = 0;
        const result = await p.runWithRetry(async () => {
            attempts++;
            // Short Retry-After so the test doesn't stall on real backoff.
            if (attempts < 2) throw httpError(429, { 'retry-after': '0' });
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(attempts).toBe(2);
    }, 10_000);
});
