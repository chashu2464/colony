"use strict";
// ── Colony: Model Router ─────────────────────────────────
// Routes LLM invocations through rate limit manager,
// auto-switches models on quota exhaustion.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRouter = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const CLIInvoker_js_1 = require("./CLIInvoker.js");
const log = new Logger_js_1.Logger('ModelRouter');
class ModelRouter {
    rateLimiter;
    maxRetries = 2;
    constructor(rateLimiter) {
        this.rateLimiter = rateLimiter;
    }
    /**
     * Invoke an LLM, with automatic rate-limit-aware model selection.
     */
    async invoke(primary, prompt, options = {}, fallbacks) {
        const selectedModel = this.rateLimiter.selectModel(primary, fallbacks);
        if (!selectedModel) {
            throw new CLIInvoker_js_1.InvokeError('All models exhausted — no available quota', {
                type: 'exit_error',
                cli: primary,
            });
        }
        if (selectedModel !== primary) {
            log.info(`Model switched: ${primary} → ${selectedModel}`);
        }
        let lastError = null;
        const modelsToTry = [selectedModel, ...(fallbacks ?? []).filter(f => f !== selectedModel)];
        for (const model of modelsToTry) {
            if (!this.rateLimiter.canUse(model))
                continue;
            // If we switched models, clear sessionId to avoid cross-CLI session conflicts
            let invokeOptions = options;
            let modifiedPrompt = prompt;
            if (model !== primary && options.sessionId) {
                invokeOptions = { ...options, sessionId: undefined };
                log.warn(`Model switched from ${primary} to ${model}, CLI session context will be lost`);
                // Add context warning to prompt
                modifiedPrompt = prompt + '\n\n---\n\n' +
                    '⚠️ **系统提示**：由于模型切换，之前的CLI session上下文已丢失。' +
                    '如需访问之前读取的文件内容或执行的操作结果，请重新执行相应的操作。';
            }
            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
                try {
                    log.info(`Invoking ${model} (attempt ${attempt + 1})`);
                    const result = await (0, CLIInvoker_js_1.invoke)(model, modifiedPrompt, invokeOptions);
                    // Record token usage if available
                    if (result.tokenUsage) {
                        this.rateLimiter.recordUsage(model, result.tokenUsage);
                    }
                    return { ...result, actualModel: model };
                }
                catch (err) {
                    lastError = err;
                    if (err instanceof CLIInvoker_js_1.InvokeError) {
                        if (!err.retryable) {
                            log.error(`Non-retryable error for ${model}: ${err.message}`);
                            break;
                        }
                        log.warn(`Retryable error for ${model} (attempt ${attempt + 1}): ${err.message}`);
                    }
                    else {
                        log.error(`Unexpected error for ${model}:`, err);
                        break;
                    }
                }
            }
        }
        throw lastError ?? new CLIInvoker_js_1.InvokeError('All invocation attempts failed', {
            type: 'exit_error',
            cli: primary,
        });
    }
}
exports.ModelRouter = ModelRouter;
//# sourceMappingURL=ModelRouter.js.map