/**
 * Very small in-memory telemetry so you can confirm traffic is hitting the proxy.
 * Not persisted; resets on restart.
 */
const telemetryState = {
    totalRequests: 0,
    errors: 0,
    perProvider: {},
    perUser: {},
    lastRequestAt: null
};

export function recordRequest(providerName, ok = true, userId = 'anonymous') {
    telemetryState.totalRequests += 1;
    telemetryState.lastRequestAt = new Date().toISOString();

    if (!telemetryState.perProvider[providerName]) {
        telemetryState.perProvider[providerName] = { requests: 0, errors: 0, lastRequestAt: null };
    }

    telemetryState.perProvider[providerName].requests += 1;
    telemetryState.perProvider[providerName].lastRequestAt = telemetryState.lastRequestAt;

    if (!ok) {
        telemetryState.errors += 1;
        telemetryState.perProvider[providerName].errors += 1;
    }

    if (!telemetryState.perUser[userId]) {
        telemetryState.perUser[userId] = { requests: 0, errors: 0, lastRequestAt: null };
    }
    telemetryState.perUser[userId].requests += 1;
    telemetryState.perUser[userId].lastRequestAt = telemetryState.lastRequestAt;
    if (!ok) {
        telemetryState.perUser[userId].errors += 1;
    }
}

export function getTelemetry() {
    return { ...telemetryState };
}
