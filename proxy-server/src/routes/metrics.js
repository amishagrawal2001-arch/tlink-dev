import { getTelemetry } from '../providers/telemetry.js';

/**
 * Lightweight telemetry endpoint to confirm traffic is hitting the proxy.
 */
export function metrics(req, res) {
    res.json({
        status: 'ok',
        telemetry: getTelemetry(),
        timestamp: new Date().toISOString()
    });
}
