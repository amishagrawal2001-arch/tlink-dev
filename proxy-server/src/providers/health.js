// Simple in-memory provider health tracker for admin UI.
// Tracks last success/failure and rolling latency.

const health = new Map();
// suppressionMap: provider -> { reason: 'manual' | 'auto', until?: iso }
const suppressionMap = new Map();

const AUTO_SUPPRESS_FAILS = parseInt(process.env.AUTO_SUPPRESS_FAILS || '3', 10);
const AUTO_SUPPRESS_TTL_MS = parseInt(process.env.AUTO_SUPPRESS_TTL_MS || '600000', 10); // 10m default
const HEALTH_WEBHOOK_URL = process.env.HEALTH_WEBHOOK_URL || null;

function pruneSuppression(provider) {
    if (!provider) return;
    const entry = suppressionMap.get(provider);
    if (!entry) return;
    if (entry.until && Date.now() > Date.parse(entry.until)) {
        suppressionMap.delete(provider);
    }
}

async function notifySuppression({ provider, reason, until, failureStreak }) {
    const payload = {
        type: 'provider_suppressed',
        provider,
        reason,
        until,
        failureStreak
    };
    if (HEALTH_WEBHOOK_URL) {
        try {
            await fetch(HEALTH_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error('[health] webhook notify failed', err?.message || err);
        }
    } else {
        console.warn('[health] suppression alert', payload);
    }
}

export function recordProviderHealth({ provider, success, latencyMs, status, error }) {
    if (!provider) return;
    pruneSuppression(provider);
    const prev = health.get(provider) || { lastSuccessAt: null, lastErrorAt: null, lastLatencyMs: null, failureCount: 0, successCount: 0, failureStreak: 0 };
    const updated = { ...prev };
    if (success) {
        updated.lastSuccessAt = new Date().toISOString();
        updated.lastLatencyMs = latencyMs != null ? latencyMs : updated.lastLatencyMs;
        updated.successCount = (updated.successCount || 0) + 1;
        updated.failureStreak = 0;
    } else {
        updated.lastErrorAt = new Date().toISOString();
        updated.lastError = error || status || 'error';
        updated.failureCount = (updated.failureCount || 0) + 1;
        updated.failureStreak = (updated.failureStreak || 0) + 1;
    }
    // simple rolling latency (decay)
    if (latencyMs != null) {
        const alpha = 0.3;
        updated.rollingLatencyMs = updated.rollingLatencyMs != null
            ? Math.round(alpha * latencyMs + (1 - alpha) * updated.rollingLatencyMs)
            : latencyMs;
    }
    health.set(provider, updated);

    // auto-suppress if consecutive failures exceed threshold
    if (!success && AUTO_SUPPRESS_FAILS > 0 && updated.failureStreak >= AUTO_SUPPRESS_FAILS) {
        const until = new Date(Date.now() + AUTO_SUPPRESS_TTL_MS).toISOString();
        suppressionMap.set(provider, { reason: 'auto', until });
        console.warn(`[health] Auto-suppressing provider ${provider} until ${until} after ${updated.failureStreak} failures`);
        notifySuppression({ provider, reason: 'auto', until, failureStreak: updated.failureStreak });
    }
}

export function getProviderHealth() {
    const out = [];
    for (const [provider, data] of health.entries()) {
        pruneSuppression(provider);
        const suppression = suppressionMap.get(provider);
        out.push({ provider, ...data, suppressed: !!suppression, suppressedReason: suppression?.reason, suppressedUntil: suppression?.until });
    }
    // Also include suppressed providers even if no data
    for (const [prov, suppression] of suppressionMap.entries()) {
        if (!health.has(prov)) out.push({ provider: prov, suppressed: true, suppressedReason: suppression.reason, suppressedUntil: suppression.until });
    }
    return out;
}

export function resetProviderHealth() {
    health.clear();
    suppressionMap.clear();
}

export function setProviderSuppressed(provider, value) {
    if (!provider) return;
    if (value) suppressionMap.set(provider, { reason: 'manual', until: null });
    else suppressionMap.delete(provider);
}

export function isProviderSuppressed(provider) {
    pruneSuppression(provider);
    return suppressionMap.has(provider);
}
