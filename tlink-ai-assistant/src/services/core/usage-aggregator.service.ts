import { Injectable } from '@angular/core';
import { ChatMessage } from '../../types/ai.types';
import { calculateCost, AIProvider } from '../../utils/cost.utils';

/**
 * Aggregates AI token-usage stats across collections of chat messages —
 * "how much has this session cost so far", "what's today's spend",
 * "what's the running total since last clear".
 *
 * The data lives on `message.metadata` (provider, model, usage) which
 * gets stamped at stream-end by chat-interface. This service is just a
 * pure-function reducer over those fields — no state of its own, so
 * it's safe to call from anywhere without DI ordering concerns.
 */

export interface UsageAggregate {
    /** Number of AI messages contributing to this aggregate. */
    messageCount: number;
    /** Cumulative prompt-token count across all contributing messages. */
    promptTokens: number;
    /** Cumulative completion-token count. */
    completionTokens: number;
    /** Cumulative total tokens. */
    totalTokens: number;
    /** Cumulative USD cost. Zero for self-hosted providers and for any
     *  message that lacks pricing data (older message, unknown model). */
    totalCost: number;
}

const ZERO_AGGREGATE: UsageAggregate = {
    messageCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
};

@Injectable({ providedIn: 'root' })
export class UsageAggregatorService {
    /**
     * Sum usage + cost across an array of messages. Skips messages
     * without `metadata.usage` (user messages, AI messages from before
     * usage tracking landed, providers that don't supply usage).
     *
     * Cost is computed per-message using the message's stamped
     * `provider` + `model` rather than the currently-active provider —
     * this keeps historic aggregates accurate when the user has
     * switched providers mid-conversation.
     */
    aggregate(messages: ChatMessage[]): UsageAggregate {
        const out: UsageAggregate = { ...ZERO_AGGREGATE };
        for (const msg of messages) {
            const usage = msg.metadata?.usage;
            if (!usage) {continue;}

            out.messageCount += 1;
            out.promptTokens += usage.promptTokens ?? 0;
            out.completionTokens += usage.completionTokens ?? 0;
            out.totalTokens += usage.totalTokens ?? 0;

            const provider = msg.metadata?.provider as AIProvider | undefined;
            const model = msg.metadata?.model as string | undefined;
            if (provider && model) {
                const cost = calculateCost(provider, model, {
                    inputTokens: usage.promptTokens ?? 0,
                    outputTokens: usage.completionTokens ?? 0,
                });
                out.totalCost += cost.totalCost;
            }
        }
        // Round cost to 6 decimals to avoid scientific-notation +
        // floating-point drift in the rendered string.
        out.totalCost = Math.round(out.totalCost * 1_000_000) / 1_000_000;
        return out;
    }

    /**
     * Restrict an aggregate to messages whose timestamp falls within
     * the given window. Useful for "today's spend" / "last hour"
     * displays without forcing the caller to pre-filter.
     */
    aggregateSince(messages: ChatMessage[], since: Date): UsageAggregate {
        const cutoff = since.getTime();
        return this.aggregate(messages.filter(m => {
            const ts = m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime();
            return Number.isFinite(ts) && ts >= cutoff;
        }));
    }
}
