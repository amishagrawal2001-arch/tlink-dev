import { addUser } from '../users/user-store.js';

/**
 * Issue a new user token.
 * Requires ADMIN_TOKEN env; client must send Authorization: Bearer <ADMIN_TOKEN>.
 */
export function issueToken(req, res) {
    const adminToken = (process.env.ADMIN_TOKEN || '').trim();
    const authHeader = req.headers['authorization'] || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (adminToken) {
        if (!provided || provided !== adminToken) {
            return res.status(403).json({
                error: { message: 'Invalid admin token', type: 'forbidden' }
            });
        }
    } else {
        // If no ADMIN_TOKEN set, block issuance to avoid open token minting
        return res.status(503).json({
            error: { message: 'ADMIN_TOKEN not configured; token issuance disabled', type: 'service_unavailable' }
        });
    }

    const { id, name, allowedProviders, allowedModels, allowedModelsByProvider, deniedModels, deniedModelsByProvider, rateLimit, rateLimitByProvider, preferredProvider, modelRouting, token } = req.body || {};
    try {
        const user = addUser({
            id,
            name,
            allowedProviders: allowedProviders || [],
            allowedModels: allowedModels || [],
            allowedModelsByProvider: allowedModelsByProvider || {},
            deniedModels: deniedModels || [],
            deniedModelsByProvider: deniedModelsByProvider || {},
            rateLimit: rateLimit || null,
            rateLimitByProvider: rateLimitByProvider || {},
            preferredProvider: preferredProvider || null,
            modelRouting: modelRouting || {},
            token
        });
        return res.status(201).json({
            token: user.tokens?.[0]?.token,
            user: {
                id: user.id,
                name: user.name,
                allowedProviders: user.allowedProviders,
                preferredProvider: user.preferredProvider,
                modelRouting: user.modelRouting
            }
        });
    } catch (error) {
        if (error.code === 'USER_EXISTS') {
            return res.status(409).json({
                error: { message: 'User already exists', type: 'conflict' }
            });
        }
        console.error('Failed to issue token', error);
        return res.status(500).json({
            error: { message: 'Failed to issue token', type: 'internal_error' }
        });
    }
}
