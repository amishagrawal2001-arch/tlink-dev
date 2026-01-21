import axios from 'axios';
import { Transform } from 'stream';
import { selectProvider } from '../providers/selector.js';
import { getProviderConfig, getAllProviders } from '../providers/config.js';
import { recordRequest } from '../providers/telemetry.js';
import { recordUserUsage } from '../users/user-store.js';
import { recordUsage, checkQuota } from '../users/quota.js';
import { recordProviderHealth, isProviderSuppressed } from '../providers/health.js';
import { recordAudit } from '../audit/store.js';
import { checkRateLimit } from '../users/rate-limit.js';
import { pickProviderModel, isAutoModel } from '../router.js';
import { getRoutingSettings } from '../routing/settings.js';

const RETRY_MAX = parseInt(process.env.PROXY_RETRY_MAX || '2', 10);
const RETRY_BASE_MS = parseInt(process.env.PROXY_RETRY_BASE_MS || '500', 10);
const RETRY_MAX_MS = parseInt(process.env.PROXY_MAX_MS || process.env.PROXY_RETRY_MAX_MS || '4000', 10);
const FAILOVER_ON_429 = process.env.PROXY_FAILOVER_ON_429 !== 'false';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error) {
    const status = error?.response?.status;
    const code = error?.code;
    return (
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNABORTED'
    );
}

function getRetryDelayMs(error, attempt) {
    const retryAfter = error?.response?.headers?.['retry-after'];
    if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!Number.isNaN(seconds) && seconds > 0) {
            return Math.min(seconds * 1000, RETRY_MAX_MS);
        }
    }

    const base = RETRY_BASE_MS * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 100);
    return Math.min(base + jitter, RETRY_MAX_MS);
}

// Simple guardrail to strip obvious loop artifacts
function sanitizeModelResponse(data) {
    if (!data?.choices || !Array.isArray(data.choices)) return data;
    const choice = data.choices[0];
    const content = choice?.message?.content;
    if (!content || typeof content !== 'string') return data;

    const patterns = [/---\s*round/i, /task complete/i];
    const lines = content.split('\n');
    const cleaned = [];
    for (const line of lines) {
        if (patterns.some(p => p.test(line))) continue;
        cleaned.push(line);
        if (cleaned.length >= 200) { // hard cap lines to prevent runaway
            cleaned.push('[truncated]');
            break;
        }
    }
    choice.message.content = cleaned.join('\n');
    data.choices[0] = choice;
    return data;
}

function createStreamGuard() {
    const patterns = [/---\s*round/i, /task complete/i];
    let lineCount = 0;
    let truncated = false;
    return new Transform({
        transform(chunk, encoding, callback) {
            if (truncated) return callback(); // drop further data
            let text = chunk.toString();
            const lines = text.split('\n');
            const filtered = [];
            for (const line of lines) {
                if (patterns.some(p => p.test(line))) continue;
                if (line.trim().length === 0 && filtered.length === 0) continue; // drop leading empties
                lineCount += 1;
                if (lineCount > 200) {
                    filtered.push('[truncated]');
                    truncated = true;
                    break;
                }
                filtered.push(line);
            }
            const out = filtered.join('\n');
            if (out) this.push(out);
            if (truncated) this.push('\n[stream closed]');
            callback();
        }
    });
}

/**
 * Proxy chat completions requests to AI providers
 */
export async function chatCompletions(req, res) {
    let providerName = 'unknown';
    let finalReason = null;
    try {
        const userIP = req.ip || req.connection.remoteAddress;
        const userId = req.user?.id || req.user?.name || 'anonymous';
        const tokenValue = (() => {
            const authHeader = req.headers['authorization'] || '';
            return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        })();
        console.log(`[${new Date().toISOString()}] Request from ${userIP} user=${userId}`);

        const routingSettings = getRoutingSettings();
        const routingMode = (routingSettings.mode || process.env.ROUTING_MODE || 'auto').toLowerCase();
        const routingEnabled = routingMode !== 'off';
        const incomingModel = req.body.model;

        const providers = getAllProviders(req.user?.allowedProviders);
        if (!providers.length) {
            return res.status(503).json({
                error: {
                    message: 'No AI providers available',
                    type: 'service_unavailable'
                }
            });
        }

        // Model allowlist enforcement
        const allowedModels = req.user?.allowedModels || [];
        const deniedModels = req.user?.deniedModels || [];
        const allowedByProvider = req.user?.allowedModelsByProvider || {};
        const deniedByProvider = req.user?.deniedModelsByProvider || {};
        const lockedProvider = req.user?.lockedProvider || null;
        const providerModelOverrides = {};
        let routingInfo = null;

        function isModelAllowed(model, provider) {
            if (!model) return true;
            // Deny checks first
            if (deniedModels.includes(model)) return false;
            const providerDenied = deniedByProvider?.[provider] || [];
            if (providerDenied.includes(model)) return false;
            const providerList = allowedByProvider?.[provider] || [];
            if (providerList.length > 0) {
                return providerList.includes(model);
            }
            if (allowedModels.length > 0) {
                return allowedModels.includes(model);
            }
            return true;
        }

        if (routingEnabled && isAutoModel(incomingModel)) {
            routingInfo = pickProviderModel({
                user: req.user,
                requestedModel: incomingModel,
                messages: req.body?.messages,
                rules: routingSettings.rules,
                intentHint: req.body?.intent
            });
            (routingInfo?.candidates || []).forEach(c => {
                if (c?.provider?.name && c.model) {
                    providerModelOverrides[c.provider.name] = c.model;
                }
            });
        }

        let orderedProviders = [];
        const seenProviders = new Set();
        const addProvider = (p) => {
            if (!p || !p.name || seenProviders.has(p.name)) return;
            seenProviders.add(p.name);
            orderedProviders.push(p);
        };

        if (lockedProvider) {
            const locked = providers.find(p => p.name === lockedProvider || p.name.split('-')[0] === lockedProvider);
            if (!locked) {
                return res.status(503).json({
                    error: { message: 'Locked provider not configured for this user', type: 'service_unavailable' }
                });
            }
            addProvider(locked);
        } else {
            if (routingInfo?.candidates?.length) {
                routingInfo.candidates.forEach(c => addProvider(c.provider));
            }
            const strategyProvider = selectProvider({ model: incomingModel, user: req.user });
            if (strategyProvider) addProvider(strategyProvider);
        }

        providers.forEach(addProvider);

        if (!orderedProviders.length) {
            return res.status(503).json({
                error: {
                    message: 'No AI providers available',
                    type: 'service_unavailable'
                }
            });
        }

        providerName = orderedProviders[0]?.name || 'unknown';

        // Optional auto-suppress unhealthy providers
        const suppressUnhealthy = process.env.AUTO_SUPPRESS_UNHEALTHY === 'true';
        if (suppressUnhealthy) {
            orderedProviders = orderedProviders.filter(p => !p?.name || !isProviderSuppressed(p.name));
            if (!orderedProviders.length) {
                return res.status(503).json({ error: { message: 'All providers suppressed', type: 'service_unavailable' } });
            }
        }

        const wantsAuto = isAutoModel(incomingModel);
        const routingModeLabel = routingEnabled ? (wantsAuto ? 'auto' : 'explicit') : 'off';
        const routingReason = routingInfo?.reason || null;
        const routingIntent = routingInfo?.intent || null;

        let lastError = null;

        const attempts = [];

        for (const candidate of orderedProviders) {
            finalReason = null;
            // Get provider configuration
            const config = getProviderConfig(candidate.name, req.user?.allowedProviders);
            if (!config || !config.apiKey) {
                console.error(`Provider ${candidate.name} not configured`);
                recordRequest(candidate.name, false, userId);
                lastError = new Error(`Provider ${candidate.name} not configured`);
                continue;
            }

            // Prepare request
            // Normalize "auto" selectors to the provider's default model, honoring router overrides
            const overrideModel = providerModelOverrides[candidate.name];
            const effectiveModel = overrideModel
                || (wantsAuto ? (config.defaultModel || 'gpt-3.5-turbo') : (incomingModel || config.defaultModel || 'gpt-3.5-turbo'));

            console.log(`Using provider: ${candidate.name} model=${effectiveModel}`);

            const requestBody = {
                ...req.body,
                model: effectiveModel
            };
            // Do not forward proxy-only hints to upstream providers
            delete requestBody.intent;
            const wantsStream = requestBody.stream !== false;

            for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
                try {
                    // Quota check (cumulative)
                    const quota = checkQuota(req.user, { promptTokens: requestBody.max_tokens || 0, completionTokens: 0 });
                    if (!quota.ok) {
                        const errMsg = 'Quota exceeded';
                        lastError = { response: { status: 429, data: { error: { message: errMsg, type: quota.reason || 'quota_exceeded', code: quota.reason || 'quota_exceeded' } } } };
                        attempts.push({ provider: candidate.name, model: effectiveModel, status: 429, error: errMsg, reason: quota.reason || 'quota_exceeded' });
                        finalReason = quota.reason || 'quota_exceeded';
                        break;
                    }

                    // Rate limit check per user/provider
                    const rl = checkRateLimit({ userId, provider: candidate.name, userConfig: req.user });
                    if (!rl.ok) {
                        console.warn(`Rate limit hit for user=${userId} provider=${candidate.name}`);
                        lastError = { response: { status: 429, data: { error: { message: 'Rate limit exceeded', type: 'rate_limit', code: 'rate_limit' } } } };
                        attempts.push({ provider: candidate.name, model: effectiveModel, status: 429, error: 'rate_limit', reason: 'rate_limit' });
                        finalReason = 'rate_limit';
                        // Try next provider if available
                        break;
                    }

                    if (!isModelAllowed(effectiveModel, candidate.name)) {
                        const errMsg = 'Model not allowed for this user';
                        lastError = { response: { status: 403, data: { error: { message: errMsg, type: 'model_not_allowed' } } } };
                        attempts.push({ provider: candidate.name, model: effectiveModel, status: 403, error: 'model_not_allowed', reason: 'model_not_allowed' });
                        finalReason = 'model_not_allowed';
                        // Try next provider if available
                        break;
                    }

                    const startTs = Date.now();
                    const response = await axios.post(
                        `${config.baseURL}/chat/completions`,
                        requestBody,
                        {
                            headers: {
                                ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
                                'Content-Type': 'application/json',
                                'User-Agent': 'Tlink-AI-Proxy/1.0'
                            },
                            responseType: wantsStream ? 'stream' : 'json', // Stream for SSE, JSON for non-stream
                            timeout: config.timeout || 60000
                        }
                    );

                    recordRequest(candidate.name, true, userId);
                    recordUserUsage(userId, tokenValue, { provider: candidate.name, model: effectiveModel });
                    const promptTokens = response.data?.usage?.prompt_tokens || 0;
                    const completionTokens = response.data?.usage?.completion_tokens || 0;
                    recordUsage(userId, {
                        provider: candidate.name,
                        model: effectiveModel,
                        promptTokens,
                        completionTokens
                    });
                    recordProviderHealth({ provider: candidate.name, success: true, latencyMs: Date.now() - startTs, status: response.status });
                    attempts.push({ provider: candidate.name, model: effectiveModel, status: response.status, latencyMs: Date.now() - startTs });
                    recordAudit({
                        success: true,
                        userId,
                        provider: candidate.name,
                        model: effectiveModel,
                        requestedModel: incomingModel,
                        routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
                        routingMode: routingModeLabel,
                        routedProvider: candidate.name,
                        routedModel: effectiveModel,
                        status: response.status,
                        latencyMs: Date.now() - startTs,
                        attemptCount: attempts.length,
                        attempts
                    });

                    // Forward status and headers from upstream
                    res.status(response.status);
                    Object.entries(response.headers || {}).forEach(([key, value]) => {
                        if (value) res.setHeader(key, value);
                    });

                    if (!wantsStream) {
                        // Return JSON directly for non-streaming requests
                        res.json(sanitizeModelResponse(response.data));
                        return;
                    }

                    // Stream response back to client with guardrails
                    const guard = createStreamGuard();
                    response.data.pipe(guard).pipe(res);

                    response.data.on('error', (error) => {
                        console.error('Stream error:', error);
                        if (!res.headersSent) {
                            res.status(500).json({
                                error: {
                                    message: 'Stream error',
                                    type: 'stream_error'
                                }
                            });
                        } else {
                            res.end();
                        }
                    });
                    return;
                } catch (error) {
                    lastError = error;
                    recordRequest(candidate.name, false, userId);
                    const status = error?.response?.status;
                    recordAudit({
                        success: false,
                        userId,
                        provider: candidate.name,
                        model: effectiveModel,
                        requestedModel: incomingModel,
                        routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
                        routingMode: routingModeLabel,
                        routedProvider: candidate.name,
                        routedModel: effectiveModel,
                        status: status || error?.code || 'error',
                        latencyMs: null,
                        error: error?.response?.data?.error?.message || error?.message,
                        reason: error?.response?.data?.error?.code || error?.response?.data?.error?.type || finalReason,
                        attemptCount: attempts.length + 1,
                        attempts: [...attempts, { provider: candidate.name, model: effectiveModel, status: status || error?.code || 'error', error: error?.response?.data?.error?.message || error?.message, reason: error?.response?.data?.error?.code || error?.response?.data?.error?.type || finalReason }]
                    });
                    const shouldRetry = isRetryable(error) && attempt < RETRY_MAX;
                    const shouldFailover = status === 429 && FAILOVER_ON_429 && attempt >= RETRY_MAX;

                    console.error(`Proxy error from ${candidate.name} (attempt ${attempt + 1}/${RETRY_MAX + 1})`, error?.response?.status || error?.code || error?.message);

                    if (shouldRetry) {
                        const delay = getRetryDelayMs(error, attempt);
                        console.log(`Retrying ${candidate.name} after ${delay}ms`);
                        await sleep(delay);
                        continue;
                    }

                    if (shouldFailover) {
                        console.warn(`Failing over from ${candidate.name} after 429`);
                        break;
                    }

                    if (!isRetryable(error)) {
                        // Non-retryable error - return immediately
                        if (error.response) {
                            return res.status(error.response.status).json({
                                error: {
                                    message: error.response.data?.error?.message || 'Provider error',
                                    type: error.response.data?.error?.type || 'provider_error',
                                    code: error.response.data?.error?.code
                                }
                            });
                        } else if (error.request) {
                            return res.status(503).json({
                                error: {
                                    message: 'Provider unavailable',
                                    type: 'provider_unavailable'
                                }
                            });
                        } else {
                            return res.status(500).json({
                                error: {
                                    message: error.message || 'Internal proxy error',
                                    type: 'internal_error'
                                }
                            });
                        }
                    }
                }
            }
        }

        // If all providers failed
        if (lastError?.response) {
            recordAudit({
                success: false,
                userId,
                provider: providerName,
                model: incomingModel,
                requestedModel: incomingModel,
                routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
                routingMode: routingModeLabel,
                status: lastError.response.status,
                error: lastError.response.data?.error?.message,
                reason: lastError.response.data?.error?.code || lastError.response.data?.error?.type || finalReason,
                attemptCount: attempts.length,
                attempts
            });
            return res.status(lastError.response.status).json({
                error: {
                    message: lastError.response.data?.error?.message || 'Provider error',
                    type: lastError.response.data?.error?.type || 'provider_error',
                    code: lastError.response.data?.error?.code
                }
            });
        }
        if (lastError?.request) {
            recordAudit({
                success: false,
                userId,
                provider: providerName,
                model: incomingModel,
                requestedModel: incomingModel,
                routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
                routingMode: routingModeLabel,
                status: 'unavailable',
                error: 'Provider unavailable',
                attemptCount: attempts.length,
                attempts
            });
            return res.status(503).json({
                error: {
                    message: 'Provider unavailable',
                    type: 'provider_unavailable'
                }
            });
        }
        return res.status(500).json({
            error: {
                message: lastError?.message || 'Internal proxy error',
                type: 'internal_error'
            }
        });

    } catch (error) {
        console.error('Proxy error:', error);
        // Record telemetry
        const userId = req.user?.id || req.user?.name || 'anonymous';
        recordRequest(providerName, false, userId);
        recordAudit({
            success: false,
            userId,
            provider: providerName,
            model: req.body?.model,
            requestedModel: incomingModel,
            routingReason: routingReason || (routingIntent ? `intent:${routingIntent}` : null),
            routingMode: routingModeLabel,
            status: error?.response?.status || error?.code || 'error',
            error: error?.message,
            reason: error?.response?.data?.error?.code || error?.response?.data?.error?.type || finalReason,
            attemptCount: attempts?.length,
            attempts
        });

        // Handle axios errors
        if (error.response) {
            // Provider returned an error
            return res.status(error.response.status).json({
                error: {
                    message: error.response.data?.error?.message || 'Provider error',
                    type: error.response.data?.error?.type || 'provider_error',
                    code: error.response.data?.error?.code
                }
            });
        } else if (error.request) {
            // Request made but no response
            return res.status(503).json({
                error: {
                    message: 'Provider unavailable',
                    type: 'provider_unavailable'
                }
            });
        } else {
            // Error setting up request
            return res.status(500).json({
                error: {
                    message: error.message || 'Internal proxy error',
                    type: 'internal_error'
                }
            });
        }
    }
}
