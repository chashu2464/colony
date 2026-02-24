import { RateLimitManager } from './RateLimitManager.js';
import type { SupportedCLI, InvokeOptions, InvokeResult } from '../types.js';
export interface ModelRouterCallbacks {
    onStatusUpdate?: (message: string) => void;
}
export declare class ModelRouter {
    private rateLimiter;
    private maxRetries;
    constructor(rateLimiter: RateLimitManager);
    /**
     * Invoke an LLM, with automatic rate-limit-aware model selection.
     */
    invoke(primary: SupportedCLI, prompt: string, options?: InvokeOptions, fallbacks?: SupportedCLI[], callbacks?: ModelRouterCallbacks): Promise<InvokeResult & {
        actualModel: SupportedCLI;
    }>;
}
