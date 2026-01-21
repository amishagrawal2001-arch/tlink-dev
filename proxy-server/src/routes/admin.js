import express from 'express';
import {
    getUsers,
    addUser,
    updateUser,
    addTokenToUser,
    removeTokenFromUser,
    createVerificationToken
} from '../users/user-store.js';
import { resetBilling } from '../users/quota.js';
import { sendVerificationEmail } from '../notifications/email.js';
import { listAudits, exportAudits } from '../audit/store.js';
import { getProviderHealth } from '../providers/health.js';
import { setProviderSuppressed } from '../providers/health.js';
import { getBilling } from '../users/quota.js';
import { getRoutingSettings, saveRoutingSettings } from '../routing/settings.js';
import { getBuiltinHeuristics } from '../router.js';

const router = express.Router();

function buildVerificationUrl(req, token) {
    if (!token) return null;
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    return `${base}/v1/verify-email?token=${token}`;
}

// Helper to serialize user without exposing token values unless explicitly requested
function sanitizeUser(user, includeTokens = false) {
    const { tokens = [], token, ...rest } = user;
    const verification = rest.verification ? {
        ...rest.verification,
        token: includeTokens ? rest.verification.token : undefined
    } : undefined;
    const billing = rest.billing ? {
        ...rest.billing,
        webhookUrl: includeTokens ? rest.billing.webhookUrl : undefined
    } : undefined;
    return {
        ...rest,
        verification,
        billing,
        tokens: includeTokens ? tokens : (tokens ? tokens.map(t => ({
            createdAt: t.createdAt,
            expiresAt: t.expiresAt,
            lastUsedAt: t.lastUsedAt,
            expired: !!(t.expiresAt && new Date(t.expiresAt) < new Date())
        })) : []),
        tokenCount: tokens?.length || (token ? 1 : 0)
    };
}

router.get('/users', (req, res) => {
    const { search = '', page = 1, pageSize = 50, includeTokens = '0' } = req.query;
    const term = String(search).toLowerCase();
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, Math.min(200, parseInt(pageSize, 10) || 50));
    const withTokens = includeTokens === '1' || includeTokens === 'true';

    const all = getUsers().map(u => sanitizeUser(u, withTokens));
    const filtered = term
        ? all.filter(u =>
            (u.id && u.id.toLowerCase().includes(term)) ||
            (u.name && u.name.toLowerCase().includes(term)) ||
            (u.email && u.email.toLowerCase().includes(term)))
        : all;

    const start = (p - 1) * ps;
    const pageItems = filtered.slice(start, start + ps);

    res.json({
        items: pageItems,
        total: filtered.length,
        page: p,
        pageSize: ps
    });
});

router.get('/users/:id', (req, res) => {
    const withTokens = req.query.includeTokens === '1' || req.query.includeTokens === 'true';
    const user = getUsers().find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: { message: 'User not found', type: 'not_found' } });
    }
    res.json({ user: sanitizeUser(user, withTokens) });
});

router.post('/users', async (req, res) => {
    const { email, name, id, allowedProviders, preferredProvider, modelRouting, verified, active, tokenExpiresInDays, billing } = req.body || {};
    if (!email && !id && !name) {
        return res.status(400).json({ error: { message: 'email or id or name required', type: 'bad_request' } });
    }
    let user;
    try {
        user = addUser({
            email,
            name,
            id,
            allowedProviders: allowedProviders || [],
            allowedModels: req.body?.allowedModels || [],
            allowedModelsByProvider: req.body?.allowedModelsByProvider || {},
            deniedModels: req.body?.deniedModels || [],
            deniedModelsByProvider: req.body?.deniedModelsByProvider || {},
            rateLimit: req.body?.rateLimit || null,
            rateLimitByProvider: req.body?.rateLimitByProvider || {},
            preferredProvider: preferredProvider || null,
            modelRouting: modelRouting || {},
            billing: billing || undefined,
            verified: !!verified,
            active: active !== false,
            tokenExpiresInDays
        });
    } catch (err) {
        if (err.code === 'USER_EXISTS') {
            return res.status(409).json({ error: { message: 'User already exists', type: 'conflict' } });
        }
        console.error('Failed to add user', err);
        return res.status(500).json({ error: { message: 'Failed to create user', type: 'internal_error' } });
    }
    let verificationUrl = null;
    let emailResult = null;
    if (email) {
        const verification = createVerificationToken(user.id);
        verificationUrl = buildVerificationUrl(req, verification?.token);
        try {
            emailResult = await sendVerificationEmail({ to: email, link: verificationUrl });
        } catch (err) {
            console.error('Failed to send verification email', err);
            emailResult = { sent: false, reason: 'send_failed' };
        }
    }
    res.status(201).json({
        user: sanitizeUser(user, true),
        token: user.tokens?.[0]?.token,
        verificationUrl,
        emailResult
    });
});

router.patch('/users/:id', (req, res) => {
    const patch = req.body || {};
    // if billing limits provided, keep them under billing.limits
    if (patch.billingLimits) {
        patch.billing = Object.assign({}, patch.billing || {}, { limits: patch.billingLimits });
    }
    if (patch.billingWebhookUrl || patch.billingWebhookThreshold || patch.billingWebhookThresholdPrompt || patch.billingWebhookThresholdCompletion) {
        patch.billing = Object.assign({}, patch.billing || {}, {
            webhookUrl: patch.billingWebhookUrl,
            webhookThresholdRequests: patch.billingWebhookThreshold,
            webhookThresholdPromptTokens: patch.billingWebhookThresholdPrompt,
            webhookThresholdCompletionTokens: patch.billingWebhookThresholdCompletion
        });
    }
    const user = updateUser(req.params.id, patch);
    if (!user) {
        return res.status(404).json({ error: { message: 'User not found', type: 'not_found' } });
    }
    res.json({ user: sanitizeUser(user, true) });
});

router.post('/users/:id/tokens', (req, res) => {
    const { token, expiresInDays } = req.body || {};
    const result = addTokenToUser(req.params.id, token, { expiresInDays });
    if (!result) {
        return res.status(404).json({ error: { message: 'User not found', type: 'not_found' } });
    }
    res.status(201).json({ token: result.token, user: sanitizeUser(result.user, true) });
});

router.delete('/users/:id/tokens/:token', (req, res) => {
    const ok = removeTokenFromUser(req.params.id, req.params.token);
    if (!ok) {
        return res.status(404).json({ error: { message: 'User or token not found', type: 'not_found' } });
    }
    res.status(204).end();
});

// Reset usage/billing counters
router.post('/users/:id/reset-usage', (req, res) => {
    const user = resetBilling(req.params.id);
    if (!user) {
        return res.status(404).json({ error: { message: 'User not found', type: 'not_found' } });
    }
    res.json({ user: sanitizeUser(user, true) });
});

// Placeholder: resend verification email
router.post('/users/:id/resend', async (req, res) => {
    const verification = createVerificationToken(req.params.id);
    const user = verification?.user;
    if (!user) {
        return res.status(404).json({ error: { message: 'User not found', type: 'not_found' } });
    }
    const verificationUrl = buildVerificationUrl(req, verification?.token);
    let emailResult = null;
    if (user.email) {
        try {
            emailResult = await sendVerificationEmail({ to: user.email, link: verificationUrl });
        } catch (err) {
            console.error('Failed to send verification email', err);
            emailResult = { sent: false, reason: 'send_failed' };
        }
    }
    res.json({ message: 'Verification link issued', verificationUrl, emailResult, user: sanitizeUser(user) });
});

router.get('/audit', (req, res) => {
    const { search = '', page = 1, pageSize = 100, provider, status, success, reason } = req.query;
    const result = listAudits({ search, page, pageSize, provider, status, success, reason });
    res.json(result);
});

router.get('/routing', (req, res) => {
    res.json(getRoutingSettings());
});

router.post('/routing', (req, res) => {
    const { mode, rules } = req.body || {};
    const settings = saveRoutingSettings({ mode, rules });
    res.json(settings);
});

router.get('/routing/builtins', (req, res) => {
    res.json(getBuiltinHeuristics());
});

router.get('/audit/export', (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const rows = exportAudits();
    if (format === 'csv') {
        const header = ['timestamp', 'userId', 'provider', 'model', 'status', 'reason', 'latencyMs', 'error', 'success', 'attemptCount'];
        const csv = [header.join(','), ...rows.map(r => header.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        return res.send(csv);
    }
    res.json({ items: rows, total: rows.length });
});

router.get('/providers/health', (req, res) => {
    const data = getProviderHealth();
    res.json({ items: data });
});

router.post('/providers/health/:provider/suppress', (req, res) => {
    const provider = req.params.provider;
    const { suppressed } = req.body || {};
    setProviderSuppressed(provider, !!suppressed);
    res.json({ provider, suppressed: !!suppressed });
});

router.get('/usage', (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const users = getUsers();
    const rows = users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        totalRequests: u.billing?.totalRequests || 0,
        totalPromptTokens: u.billing?.totalPromptTokens || 0,
        totalCompletionTokens: u.billing?.totalCompletionTokens || 0,
        lastProvider: u.billing?.lastProvider || u.lastProvider,
        lastModel: u.billing?.lastModel || u.lastModel,
        updatedAt: u.billing?.updatedAt || u.lastUsedAt
    }));
    if (format === 'csv') {
        const header = Object.keys(rows[0] || {});
        const csv = [header.join(','), ...rows.map(r => header.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\\n');
        res.setHeader('Content-Type', 'text/csv');
        return res.send(csv);
    }
    res.json({ items: rows, total: rows.length });
});

export default router;
