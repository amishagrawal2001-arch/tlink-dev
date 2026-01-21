import { validateTotp } from './totp.js';

/**
 * Admin authentication middleware using ADMIN_TOKEN.
 * Requests must include Authorization: Bearer <ADMIN_TOKEN>.
 * If ADMIN_TOKEN is not set, admin routes are disabled.
 */
export function requireAdmin(req, res, next) {
    const adminToken = (process.env.ADMIN_TOKEN || '').trim();
    if (!adminToken) {
        return res.status(503).json({
            error: { message: 'ADMIN_TOKEN not configured; admin UI disabled', type: 'service_unavailable' }
        });
    }

    // Optional IP allowlist for admin endpoints
    const ipAllowlist = (process.env.ADMIN_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ipAllowlist.length > 0) {
        const forwarded = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
        const ip = forwarded || req.ip;
        const ok = ipAllowlist.includes(ip);
        if (!ok) {
            return res.status(403).json({ error: { message: 'Admin IP not allowed', type: 'forbidden' } });
        }
    }

    // Optional OTP header for an extra factor (static or TOTP)
    const otpSecret = (process.env.ADMIN_OTP_SECRET || '').trim();
    const totpSecret = (process.env.ADMIN_TOTP_SECRET || '').trim();
    if (otpSecret || totpSecret) {
        const providedOtp = (req.headers['x-admin-otp'] || req.headers['x-admin-totp'] || '').toString().trim();
        let ok = true;
        if (totpSecret) {
            ok = validateTotp({ secret: totpSecret, token: providedOtp });
        } else if (otpSecret) {
            ok = !!providedOtp && providedOtp === otpSecret;
        }
        if (!ok) {
            return res.status(403).json({ error: { message: 'Invalid admin OTP', type: 'forbidden' } });
        }
    }

    const authHeader = req.headers['authorization'] || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!provided || provided !== adminToken) {
        return res.status(403).json({
            error: { message: 'Invalid admin token', type: 'forbidden' }
        });
    }

    req.isAdmin = true;
    next();
}
