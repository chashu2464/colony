import { EventBus } from '../utils/EventBus.js';
import type { SupportedCLI, ModelQuota } from '../types.js';
interface RateLimitEvents {
    'quota_warning': {
        model: SupportedCLI;
        remaining: number;
        total: number;
    };
    'quota_exhausted': {
        model: SupportedCLI;
    };
    'quota_reset': {
        model: SupportedCLI;
    };
}
export declare class RateLimitManager {
    private quotas;
    readonly events: EventBus<RateLimitEvents>;
    private warningThreshold;
    constructor(customQuotas?: Partial<Record<SupportedCLI, Partial<ModelQuota>>>);
    /**
     * Check if a model has capacity for a request.
     */
    canUse(model: SupportedCLI): boolean;
    /**
     * Record a completed request's usage.
     */
    recordUsage(model: SupportedCLI, tokens: {
        input: number;
        output: number;
    }): void;
    /**
     * Select best available model: try primary, then fallbacks.
     */
    selectModel(primary: SupportedCLI, fallbacks?: SupportedCLI[]): SupportedCLI | null;
    /**
     * Get current quota status for a model.
     */
    getStatus(model: SupportedCLI): ModelQuota | null;
    /**
     * Get all models' status.
     */
    getAllStatus(): ModelQuota[];
    /**
     * Reset per-minute window if 60s have passed.
     */
    private maybeResetWindow;
}
export {};
