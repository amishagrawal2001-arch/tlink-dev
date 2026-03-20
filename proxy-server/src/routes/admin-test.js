import express from 'express';
import axios from 'axios';
import { getAllProviders } from '../providers/config.js';
import { selectProvider } from '../providers/selector.js';
import { recordAudit } from '../audit/store.js';
import { pickProviderModel, isAutoModel } from '../router.js';
import { getRoutingSettings } from '../routing/settings.js';

const router = express.Router();

function providerMatches(provider, name) {
    if (!provider || !name) return false;
    return provider.name === name || provider.name.split('-')[0] === name;
}

router.post('/users/:id/test', async (req, res) => {
    const user = req.body?.user;
    if (!user) {
        return res.status(400).json({ error: { message: 'User payload required', type: 'bad_request' } });
    }

    let selectedProviderName = user.lockedProvider || 'unknown';
    let selectedModel = req.body?.model || 'auto';
    let routingReason = null;
    let routingIntent = null;
    const routingSettings = getRoutingSettings();
    const routingMode = (routingSettings.mode || process.env.ROUTING_MODE || 'auto').toLowerCase();

    try {
        const requestedModel = req.body?.model || 'auto';
        const messages = Array.isArray(req.body?.messages) && req.body.messages.length > 0
            ? req.body.messages
            : [{ role: 'user', content: req.body?.prompt || 'ping' }];
        const intentHint = req.body?.intent || null;
        const routingEnabled = routingMode !== 'off';
        const wantsAuto = isAutoModel(requestedModel);

        const providers = getAllProviders(user.allowedProviders);
        if (!providers.length) {
            return res.status(503).json({ error: { message: 'No provider available for user', type: 'service_unavailable' } });
        }

        const providerModelOverrides = {};
        const orderedProviders = [];
        const seenProviders = new Set();
        const addProvider = (provider) => {
            if (!provider?.name || seenProviders.has(provider.name)) return;
            seenProviders.add(provider.name);
            orderedProviders.push(provider);
        };

        if (user.lockedProvider) {
            const locked = providers.find((p) => providerMatches(p, user.lockedProvider));
            if (!locked) {
                return res.status(503).json({
                    error: { message: 'Locked provider not configured for this user', type: 'service_unavailable' }
                });
            }
            addProvider(locked);
        } else {
            if (routingEnabled && wantsAuto) {
                const routingInfo = pickProviderModel({
                    user,
                    requestedModel,
                    messages,
                    rules: routingSettings.rules,
                    intentHint
                });
                routingReason = routingInfo?.reason || null;
                routingIntent = routingInfo?.intent || null;
                for (const candidate of routingInfo?.candidates || []) {
                    if (candidate?.provider?.name && candidate.model) {
                        providerModelOverrides[candidate.provider.name] = candidate.model;
                    }
                    if (candidate?.provider?.name) {
                        const matched = providers.find((p) => providerMatches(p, candidate.provider.name));
                        if (matched) addProvider(matched);
                    }
                }
            }

            const selected = selectProvider({ model: requestedModel, user });
            if (selected?.name) {
                const matched = providers.find((p) => providerMatches(p, selected.name));
                if (matched) addProvider(matched);
            }
        }

        providers.forEach(addProvider);

        if (!orderedProviders.length) {
            return res.status(503).json({ error: { message: 'No provider available for user', type: 'service_unavailable' } });
        }

        const attempts = [];
        let lastError = null;
        const routingModeLabel = routingEnabled ? (wantsAuto ? 'auto' : 'explicit') : 'off';

        for (const cfg of orderedProviders) {
            const model = providerModelOverrides[cfg.name]
                || (wantsAuto ? (cfg.defaultModel || 'gpt-3.5-turbo') : requestedModel);
            selectedProviderName = cfg.name;
            selectedModel = model;

            const body = {
                model,
                stream: false,
                messages
            };
            const start = Date.now();

            try {
                const resp = await axios.post(`${cfg.baseURL}/chat/completions`, body, {
                    headers: {
                        'Authorization': `Bearer ${cfg.apiKey}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Tlink-AI-Proxy/Admin-Test'
                    },
                    timeout: 20000
                });

                const latencyMs = Date.now() - start;
                attempts.push({ provider: cfg.name, model, status: resp.status, latencyMs });

                const result = {
                    provider: cfg.name,
                    model,
                    status: resp.status,
                    latencyMs,
                    snippet: resp.data?.choices?.[0]?.message?.content?.slice(0, 80) || '',
                    routingMode: routingModeLabel,
                    routingReason,
                    routingIntent,
                    attemptCount: attempts.length,
                    attempts
                };

                recordAudit({
                    success: true,
                    userId: user.id || 'admin-test',
                    provider: cfg.name,
                    model,
                    requestedModel,
                    status: resp.status,
                    latencyMs,
                    attemptCount: attempts.length,
                    attempts,
                    routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
                    routingMode: routingModeLabel
                });
                return res.json(result);
            } catch (err) {
                const status = err?.response?.status || err?.code || 500;
                const errorMessage = err?.response?.data?.error?.message || err?.message || 'Test failed';
                attempts.push({ provider: cfg.name, model, status, error: errorMessage });
                lastError = err;
            }
        }

        const status = lastError?.response?.status || (lastError?.request ? 503 : 500);
        recordAudit({
            success: false,
            userId: req.body?.user?.id || 'admin-test',
            provider: selectedProviderName || 'unknown',
            model: selectedModel || 'unknown',
            status,
            error: lastError?.response?.data?.error?.message || lastError?.message || 'Test failed',
            attemptCount: attempts.length,
            attempts,
            routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
            routingMode: routingModeLabel
        });
        return res.status(status).json({
            error: {
                message: lastError?.response?.data?.error?.message || lastError?.message || 'Test failed',
                type: lastError?.response?.data?.error?.type || (lastError?.request ? 'provider_unavailable' : 'test_failed'),
                code: lastError?.response?.data?.error?.code
            },
            provider: selectedProviderName || 'unknown',
            model: selectedModel || 'unknown',
            routingMode: routingModeLabel,
            routingReason,
            routingIntent,
            attemptCount: attempts.length,
            attempts
        });
    } catch (err) {
        const status = err?.response?.status || 500;
        recordAudit({
            success: false,
            userId: req.body?.user?.id || 'admin-test',
            provider: selectedProviderName || 'unknown',
            model: selectedModel || 'unknown',
            status,
            error: err?.response?.data?.error?.message || err?.message,
            attemptCount: 1,
            attempts: [{ provider: selectedProviderName || 'unknown', model: selectedModel || 'unknown', status, error: err?.message }],
            routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
            routingMode: routingMode !== 'off' ? (isAutoModel(req.body?.model || 'auto') ? 'auto' : 'explicit') : 'off'
        });
        return res.status(status).json({
            error: {
                message: err?.response?.data?.error?.message || err?.message || 'Test failed',
                type: err?.response?.data?.error?.type || 'test_failed',
                code: err?.response?.data?.error?.code
            },
            provider: selectedProviderName || 'unknown',
            model: selectedModel || 'unknown',
            routingMode: routingMode !== 'off' ? (isAutoModel(req.body?.model || 'auto') ? 'auto' : 'explicit') : 'off',
            routingReason,
            routingIntent,
            attemptCount: 1,
            attempts: [{ provider: selectedProviderName || 'unknown', model: selectedModel || 'unknown', status, error: err?.message }]
        });
    }
});

export default router;
