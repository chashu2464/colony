// @ts-nocheck
// ── Colony: CLI Invoker (Adapter Wrapper) ────────────────
// Thin wrapper around the new provider system for backward compatibility.

import { Logger } from '../utils/Logger.js';
import { registry } from './index.js';
import type { SupportedCLI, InvokeOptions, InvokeResult } from '../types.js';

const log = new Logger('CLIInvoker');

// Re-export InvokeError for compatibility if needed (moved to this file for now)
export class InvokeError extends Error {
    type: 'spawn_error' | 'exit_error' | 'timeout';
    cli: SupportedCLI;
    code: number | null;
    stderr: string;

    constructor(
        message: string,
        detail: { type: 'spawn_error' | 'exit_error' | 'timeout'; cli: SupportedCLI; code?: number; stderr?: string }
    ) {
        super(message);
        this.name = 'InvokeError';
        this.type = detail.type;
        this.cli = detail.cli;
        this.code = detail.code ?? null;
        this.stderr = detail.stderr ?? '';
    }

    get retryable(): boolean {
        return this.type !== 'spawn_error';
    }
}

/**
 * Legacy invoke function - redirects to the appropriate provider.
 */
export async function invoke(
    cli: SupportedCLI,
    prompt: string,
    options: InvokeOptions = {}
): Promise<InvokeResult> {
    const provider = registry.get(cli);
    if (!provider) {
        throw new InvokeError(`Provider "${cli}" not registered`, { type: 'spawn_error', cli });
    }

    try {
        const response = await provider.invoke({
            prompt,
            sessionId: options.sessionId,
            sessionName: options.sessionName,
            attachments: options.attachments,
            options: options
        });

        return {
            text: response.text,
            sessionId: response.sessionId,
            tokenUsage: response.tokenUsage,
            toolCalls: response.toolCalls
        };
    } catch (err) {
        // Map generic errors to InvokeError for compatibility
        if (err instanceof Error) {
            throw new InvokeError(err.message, { 
                type: err.message.includes('timeout') ? 'timeout' : 'exit_error', 
                cli 
            });
        }
        throw err;
    }
}

/**
 * Health check: Verify if a CLI is working correctly.
 */
export async function verifyCLI(cli: SupportedCLI): Promise<boolean> {
    const provider = registry.get(cli);
    if (!provider) return false;
    
    log.info(`Health check: Verifying ${cli} via provider...`);
    return await provider.healthCheck();
}

// Session utility functions (re-exported for compatibility)
export { loadSessions, saveSession, deleteSession } from './SessionUtils.js';
