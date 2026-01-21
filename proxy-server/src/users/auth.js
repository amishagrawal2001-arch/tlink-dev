import { getUserByTokenWithMeta, hasUsersConfigured, recordUserUsage } from './user-store.js';

/**
 * Simple bearer-token auth. If no users are configured, auth is a no-op.
 */
export function authenticateUser(req, res, next) {
    // Skip auth for token issuance endpoint (it has its own admin check)
    if (
        req.path === '/v1/tokens' ||
        req.path.startsWith('/admin') ||
        req.path === '/v1/verify-email' ||
        req.path.startsWith('/v1/self-service') ||
        req.path === '/API-ADMIN.md' ||
        req.path === '/API-ADMIN.html'
    ) {
        return next();
    }

    if (!hasUsersConfigured()) {
        return next();
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
        return res.status(401).json({
            error: { message: 'Missing bearer token', type: 'unauthorized' }
        });
    }

    const match = getUserByTokenWithMeta(token);
    const user = match?.user;
    const tokenMeta = match?.tokenMeta;
    if (!match || !user) {
        return res.status(403).json({
            error: { message: 'Invalid token', type: 'forbidden' }
        });
    }

    if (tokenMeta?.expiresAt && new Date(tokenMeta.expiresAt) < new Date()) {
        return res.status(403).json({
            error: { message: 'Token expired', type: 'token_expired' }
        });
    }

    if (user.active === false) {
        return res.status(403).json({
            error: { message: 'User disabled', type: 'forbidden' }
        });
    }

    const requireVerified = process.env.REQUIRE_VERIFIED !== 'false';
    const needsVerification = requireVerified && user.email;
    if (needsVerification && !user.verified) {
        return res.status(403).json({
            error: { message: 'Email not verified', type: 'email_not_verified' }
        });
    }

    req.user = user;
    recordUserUsage(user.id, token, {});
    return next();
}
