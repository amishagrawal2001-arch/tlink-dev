import express from 'express';
import axios from 'axios';
import { getProviderConfig, getAllProviders } from '../providers/config.js';
import { selectProvider } from '../providers/selector.js';
import { recordAudit } from '../audit/store.js';

const router = express.Router();

router.post('/users/:id/test', async (req, res) => {
    const user = req.body?.user;
    if (!user) {
        return res.status(400).json({ error: { message: 'User payload required', type: 'bad_request' } });
    }
    try {
        // choose provider
        const provider = user.lockedProvider
            ? { name: user.lockedProvider }
            : selectProvider({ model: null, user });
        const providers = getAllProviders(user.allowedProviders);
        const cfg = providers.find(p => p.name === provider.name || p.name.split('-')[0] === provider.name) || providers[0];
        if (!cfg) {
            return res.status(503).json({ error: { message: 'No provider available for user', type: 'service_unavailable' } });
        }
        const model = cfg.defaultModel || 'gpt-3.5-turbo';
        const body = {
            model,
            stream: false,
            messages: [{ role: 'user', content: 'ping' }]
        };
        const start = Date.now();
        const resp = await axios.post(`${cfg.baseURL}/chat/completions`, body, {
            headers: {
                'Authorization': `Bearer ${cfg.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Tlink-AI-Proxy/Admin-Test'
            },
            timeout: 20000
        });
        const result = {
            provider: cfg.name,
            model,
            status: resp.status,
            latencyMs: Date.now() - start,
            snippet: resp.data?.choices?.[0]?.message?.content?.slice(0, 80) || ''
        };
        recordAudit({
            success: true,
            userId: user.id || 'admin-test',
            provider: cfg.name,
            model,
            requestedModel: model,
            status: resp.status,
            latencyMs: result.latencyMs,
            attemptCount: 1,
            attempts: [{ provider: cfg.name, model, status: resp.status, latencyMs: result.latencyMs }]
        });
        return res.json(result);
    } catch (err) {
        const status = err?.response?.status || 500;
        recordAudit({
            success: false,
            userId: req.body?.user?.id || 'admin-test',
            provider: req.body?.user?.lockedProvider || 'unknown',
            model: req.body?.user?.preferredProvider || 'unknown',
            status,
            error: err?.response?.data?.error?.message || err?.message,
            attemptCount: 1,
            attempts: [{ provider: req.body?.user?.lockedProvider || 'unknown', model: req.body?.user?.preferredProvider || 'unknown', status, error: err?.message }]
        });
        return res.status(status).json({
            error: {
                message: err?.response?.data?.error?.message || err?.message || 'Test failed',
                type: err?.response?.data?.error?.type || 'test_failed',
                code: err?.response?.data?.error?.code
            }
        });
    }
});

export default router;
