// Simple quota/billing buckets per user. Tracks aggregate usage tokens/requests.
// Persistence piggybacks on users.json via user.billing field.

import { getUsers, updateUser } from './user-store.js';
import axios from 'axios';

export function recordUsage(userId, { provider, model, promptTokens = 0, completionTokens = 0 } = {}) {
    if (!userId) return;
    const user = getUsers().find(u => u.id === userId);
    if (!user) return;
    const billing = user.billing || { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, lastProvider: null, lastModel: null, updatedAt: null };
    billing.totalRequests = (billing.totalRequests || 0) + 1;
    billing.totalPromptTokens = (billing.totalPromptTokens || 0) + promptTokens;
    billing.totalCompletionTokens = (billing.totalCompletionTokens || 0) + completionTokens;
    billing.lastProvider = provider || billing.lastProvider;
    billing.lastModel = model || billing.lastModel;
    billing.updatedAt = new Date().toISOString();
    // Track when we last sent a webhook to avoid spam
    billing.lastNotifiedRequests = billing.lastNotifiedRequests || 0;
    billing.lastNotifiedPromptTokens = billing.lastNotifiedPromptTokens || 0;
    billing.lastNotifiedCompletionTokens = billing.lastNotifiedCompletionTokens || 0;
    updateUser(userId, { billing });

    // Optional webhook for overage/thresholds (per-user overrides > env)
    const effectiveWebhookUrl = billing.webhookUrl || webhookUrl;
    const requestThreshold = billing.webhookThresholdRequests ?? webhookThresholdRequests;
    const promptThreshold = billing.webhookThresholdPromptTokens ?? webhookThresholdPromptTokens;
    const completionThreshold = billing.webhookThresholdCompletionTokens ?? webhookThresholdCompletionTokens;

    const shouldNotifyRequests = requestThreshold > 0 && billing.totalRequests >= billing.lastNotifiedRequests + requestThreshold;
    const shouldNotifyPrompt = promptThreshold > 0 && billing.totalPromptTokens >= billing.lastNotifiedPromptTokens + promptThreshold;
    const shouldNotifyCompletion = completionThreshold > 0 && billing.totalCompletionTokens >= billing.lastNotifiedCompletionTokens + completionThreshold;

    const notifyNow = shouldNotifyRequests || shouldNotifyPrompt || shouldNotifyCompletion;

    if (notifyNow) {
        if (shouldNotifyRequests) billing.lastNotifiedRequests = billing.totalRequests;
        if (shouldNotifyPrompt) billing.lastNotifiedPromptTokens = billing.totalPromptTokens;
        if (shouldNotifyCompletion) billing.lastNotifiedCompletionTokens = billing.totalCompletionTokens;
        updateUser(userId, { billing });
        if (effectiveWebhookUrl) {
            axios.post(effectiveWebhookUrl, {
                type: 'usage_threshold',
                userId,
                totalRequests: billing.totalRequests,
                totalPromptTokens: billing.totalPromptTokens,
                totalCompletionTokens: billing.totalCompletionTokens,
                provider: billing.lastProvider,
                model: billing.lastModel,
                exceeded: {
                    requests: shouldNotifyRequests,
                    promptTokens: shouldNotifyPrompt,
                    completionTokens: shouldNotifyCompletion
                }
            }).catch(err => {
                console.error('Usage webhook failed', err?.message || err);
            });
        } else {
            console.warn(`[usage] User ${userId} crossed usage thresholds (${[
                shouldNotifyRequests ? `requests ${billing.totalRequests}` : null,
                shouldNotifyPrompt ? `prompt ${billing.totalPromptTokens}` : null,
                shouldNotifyCompletion ? `completion ${billing.totalCompletionTokens}` : null
            ].filter(Boolean).join(', ')})`);
        }
    }
}

export function getBilling(userId) {
    const user = getUsers().find(u => u.id === userId);
    return user?.billing || null;
}

export function resetBilling(userId) {
    return updateUser(userId, { billing: { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, updatedAt: new Date().toISOString() } });
}
const webhookUrl = process.env.USAGE_WEBHOOK_URL || null;
const webhookThresholdRequests = parseInt(process.env.USAGE_WEBHOOK_THRESHOLD_REQUESTS || '0', 10); // 0 = disabled
const webhookThresholdPromptTokens = parseInt(process.env.USAGE_WEBHOOK_THRESHOLD_PROMPT || '0', 10);
const webhookThresholdCompletionTokens = parseInt(process.env.USAGE_WEBHOOK_THRESHOLD_COMPLETION || '0', 10);

/**
 * Enforce per-user quota limits (cumulative).
 * Limits live in user.billing.limits.{maxRequests,maxPromptTokens,maxCompletionTokens}
 */
export function checkQuota(user, { promptTokens = 0, completionTokens = 0 } = {}) {
    if (!user) return { ok: true };
    const billing = user.billing || {};
    const limits = billing.limits || {};
    const nextRequests = (billing.totalRequests || 0) + 1;
    const nextPrompt = (billing.totalPromptTokens || 0) + promptTokens;
    const nextCompletion = (billing.totalCompletionTokens || 0) + completionTokens;

    if (limits.maxRequests && limits.maxRequests > 0 && nextRequests > limits.maxRequests) {
        return { ok: false, reason: 'quota_requests' };
    }
    if (limits.maxPromptTokens && limits.maxPromptTokens > 0 && nextPrompt > limits.maxPromptTokens) {
        return { ok: false, reason: 'quota_prompt_tokens' };
    }
    if (limits.maxCompletionTokens && limits.maxCompletionTokens > 0 && nextCompletion > limits.maxCompletionTokens) {
        return { ok: false, reason: 'quota_completion_tokens' };
    }
    return { ok: true };
}
