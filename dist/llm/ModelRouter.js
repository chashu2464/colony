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
    async invoke(primary, prompt, options = {}, fallbacks, callbacks) {
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
            // Check abort before starting a new model
            if (options.signal?.aborted) {
                throw new CLIInvoker_js_1.InvokeError('Invocation aborted', { type: 'exit_error', cli: model });
            }
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
            // Notify about which model we're trying
            if (model !== selectedModel || model !== primary) {
                callbacks?.onStatusUpdate?.(`正在切换到备用模型 ${model}...`);
            }
            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
                // Check abort before each attempt
                if (options.signal?.aborted) {
                    throw new CLIInvoker_js_1.InvokeError('Invocation aborted', { type: 'exit_error', cli: model });
                }
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
                    // ── CRITICAL: Check for abort FIRST, before any retry logic ──
                    if (options.signal?.aborted) {
                        throw new CLIInvoker_js_1.InvokeError('Invocation aborted', { type: 'exit_error', cli: model });
                    }
                    const errMsg = err.message?.toLowerCase() ?? '';
                    if (err instanceof CLIInvoker_js_1.InvokeError) {
                        if (!err.retryable) {
                            log.error(`Non-retryable error for ${model}: ${err.message}`);
                            break;
                        }
                        // Check for hard quota/rate limit exhaustion from the underlying CLI
                        const isQuotaExhausted = errMsg.includes('429')
                            || errMsg.includes('capacity available')
                            || errMsg.includes('resource_exhausted')
                            || errMsg.includes('quota')
                            || errMsg.includes('too many requests');
                        if (isQuotaExhausted) {
                            log.warn(`Model capacity/quota issue for ${model}: ${err.message}. Skipping to fallback.`);
                            callbacks?.onStatusUpdate?.(`⚠️ ${model} 调用受限 (429)，正在尝试备用模型...`);
                            break; // Don't retry same model on 429, jump to fallback
                        }
                        // Check for invalid/stale session ID
                        const isInvalidSession = errMsg.includes('invalid session')
                            || errMsg.includes('error resuming session')
                            || errMsg.includes('no conversation found');
                        if (isInvalidSession) {
                            log.warn(`Invalid session for ${model}, clearing session ID and retrying...`);
                            callbacks?.onStatusUpdate?.(`⚠️ 会话 ID 已失效，正在重新建立会话...`);
                            invokeOptions = { ...invokeOptions, sessionId: undefined };
                            // Don't count this as a real attempt — continue immediately
                            continue;
                        }
                        log.warn(`Retryable error for ${model} (attempt ${attempt + 1}): ${err.message}`);
                        if (attempt < this.maxRetries) {
                            const delayMs = attempt === 0 ? 5000 : 30000;
                            log.info(`Waiting ${delayMs}ms before retrying ${model}...`);
                            // Abort-aware delay: if signal fires during wait, bail out immediately
                            await new Promise((resolve, reject) => {
                                const timer = setTimeout(resolve, delayMs);
                                if (options.signal) {
                                    if (options.signal.aborted) {
                                        clearTimeout(timer);
                                        reject(new CLIInvoker_js_1.InvokeError('Invocation aborted during retry wait', { type: 'exit_error', cli: model }));
                                        return;
                                    }
                                    const onAbort = () => {
                                        clearTimeout(timer);
                                        reject(new CLIInvoker_js_1.InvokeError('Invocation aborted during retry wait', { type: 'exit_error', cli: model }));
                                    };
                                    options.signal.addEventListener('abort', onAbort, { once: true });
                                }
                            });
                        }
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