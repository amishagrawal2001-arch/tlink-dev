const globalWindowMs = parseInt(process.env.USER_RATE_LIMIT_WINDOW_MS || '60000', 10);
const globalMax = parseInt(process.env.USER_RATE_LIMIT_MAX || '0', 10); // 0 = disabled

// in-memory buckets: { [userId]: { [provider]: { windowStart:number, count:number, max, windowMs } } }
const buckets = {};

export function checkRateLimit({ userId, provider, userConfig }) {
    if (!userId || !provider) return { ok: true };

    const perProvider = userConfig?.rateLimitByProvider?.[provider];
    const cfg = perProvider || userConfig?.rateLimit || {};
    const max = Number.isFinite(cfg.max) ? cfg.max : globalMax;
    const windowMs = Number.isFinite(cfg.windowMs) ? cfg.windowMs : globalWindowMs;
    if (!max || max <= 0) return { ok: true }; // disabled

    buckets[userId] = buckets[userId] || {};
    const bucket = buckets[userId][provider] || { windowStart: Date.now(), count: 0 };

    const now = Date.now();
    if (now - bucket.windowStart >= windowMs) {
        bucket.windowStart = now;
        bucket.count = 0;
    }

    if (bucket.count >= max) {
        const retryAfterMs = windowMs - (now - bucket.windowStart);
        buckets[userId][provider] = bucket;
        return { ok: false, retryAfterMs, reason: 'rate_limit', max, windowMs };
    }

    bucket.count += 1;
    buckets[userId][provider] = bucket;
    return { ok: true };
}
