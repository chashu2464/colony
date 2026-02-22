"use strict";
// ── Colony: Rate Limit Manager ────────────────────────────
// Tracks usage quotas per model and auto-switches on exhaustion.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitManager = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const EventBus_js_1 = require("../utils/EventBus.js");
const log = new Logger_js_1.Logger('RateLimitManager');
// Default quotas (conservative estimates, can be overridden via config)
const DEFAULT_QUOTAS = {
    claude: {
        model: 'claude',
        requestsPerMinute: 50,
        tokensPerMinute: 80000,
        tokensPerDay: 1000000,
    },
    gemini: {
        model: 'gemini',
        requestsPerMinute: 60,
        tokensPerMinute: 120000,
        tokensPerDay: 2000000,
    },
    codex: {
        model: 'codex',
        requestsPerMinute: 40,
        tokensPerMinute: 60000,
        tokensPerDay: 800000,
    },
};
class RateLimitManager {
    quotas = new Map();
    events = new EventBus_js_1.EventBus();
    warningThreshold = 0.2; // warn at 20% remaining
    constructor(customQuotas) {
        for (const [model, defaults] of Object.entries(DEFAULT_QUOTAS)) {
            const cli = model;
            const custom = customQuotas?.[cli];
            this.quotas.set(cli, {
                ...defaults,
                ...custom,
                currentUsage: { requests: 0, tokens: 0, dailyTokens: 0 },
                windowStartedAt: new Date(),
                dailyStartedAt: new Date(),
            });
        }
    }
    /**
     * Check if a model has capacity for a request.
     *
     * NOTE: Currently disabled to avoid false positives.
     * The actual rate limiting is handled by the CLI/API itself.
     */
    canUse(model) {
        const quota = this.quotas.get(model);
        if (!quota)
            return false;
        // Always return true - let CLI handle rate limiting
        return true;
        /* Original logic (disabled):
        this.maybeResetWindow(quota);
        return (
            quota.currentUsage.requests < quota.requestsPerMinute &&
            quota.currentUsage.tokens < quota.tokensPerMinute &&
            quota.currentUsage.dailyTokens < quota.tokensPerDay
        );
        */
    }
    /**
     * Record a completed request's usage.
     */
    recordUsage(model, tokens) {
        const quota = this.quotas.get(model);
        if (!quota)
            return;
        this.maybeResetWindow(quota);
        const totalTokens = tokens.input + tokens.output;
        quota.currentUsage.requests++;
        quota.currentUsage.tokens += totalTokens;
        quota.currentUsage.dailyTokens += totalTokens;
        log.debug(`Usage recorded for ${model}: +${totalTokens} tokens (${quota.currentUsage.tokens}/${quota.tokensPerMinute} min, ${quota.currentUsage.dailyTokens}/${quota.tokensPerDay} day)`);
        // Check warning threshold
        const minuteRemaining = quota.tokensPerMinute - quota.currentUsage.tokens;
        const dayRemaining = quota.tokensPerDay - quota.currentUsage.dailyTokens;
        const minRemaining = Math.min(minuteRemaining, dayRemaining);
        const total = Math.min(quota.tokensPerMinute, quota.tokensPerDay);
        if (minRemaining / total <= this.warningThreshold) {
            this.events.emit('quota_warning', { model, remaining: minRemaining, total });
        }
        if (!this.canUse(model)) {
            log.warn(`Quota exhausted for ${model}`);
            this.events.emit('quota_exhausted', { model });
        }
    }
    /**
     * Select best available model: try primary, then fallbacks.
     */
    selectModel(primary, fallbacks) {
        if (this.canUse(primary))
            return primary;
        log.info(`Primary model ${primary} unavailable, checking fallbacks...`);
        if (fallbacks) {
            for (const fb of fallbacks) {
                if (this.canUse(fb)) {
                    log.info(`Switching to fallback model: ${fb}`);
                    return fb;
                }
            }
        }
        log.error('No available model found');
        return null;
    }
    /**
     * Get current quota status for a model.
     */
    getStatus(model) {
        const quota = this.quotas.get(model);
        if (!quota)
            return null;
        this.maybeResetWindow(quota);
        return { ...quota, currentUsage: { ...quota.currentUsage } };
    }
    /**
     * Get all models' status.
     */
    getAllStatus() {
        return Array.from(this.quotas.keys()).map(m => this.getStatus(m));
    }
    /**
     * Reset per-minute window if 60s have passed.
     */
    maybeResetWindow(quota) {
        const now = new Date();
        // Reset minute window
        if (now.getTime() - quota.windowStartedAt.getTime() >= 60_000) {
            quota.currentUsage.requests = 0;
            quota.currentUsage.tokens = 0;
            quota.windowStartedAt = now;
        }
        // Reset daily window
        if (now.getTime() - quota.dailyStartedAt.getTime() >= 86_400_000) {
            quota.currentUsage.dailyTokens = 0;
            quota.dailyStartedAt = now;
            this.events.emit('quota_reset', { model: quota.model });
        }
    }
}
exports.RateLimitManager = RateLimitManager;
//# sourceMappingURL=RateLimitManager.js.map