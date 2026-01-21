import { getTelemetry } from '../providers/telemetry.js';

/**
 * Health check endpoint
 */
export function healthCheck(req, res) {
    res.json({
        status: 'ok',
        service: 'tlink-ai-proxy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        telemetry: getTelemetry()
    });
}
