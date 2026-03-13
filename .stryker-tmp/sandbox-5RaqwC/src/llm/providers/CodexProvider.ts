// @ts-nocheck
import { BaseCLIProvider } from '../BaseCLIProvider.js';
import { LLMCapabilities, TokenUsage, ToolCall } from '../types.js';
import { InvokeOptions } from '../../types.js';

export class CodexProvider extends BaseCLIProvider {
    readonly name = 'codex';
    readonly capabilities: LLMCapabilities = {
        streaming: true,
        toolUse: true,
        attachments: true,
        sessionResume: true,
    };

    protected buildArgs(prompt: string, sessionId: string | null, files: string[], options: InvokeOptions): string[] {
        const args = ['exec', '--json'];

        // BUG-SEC-001: Default use of dangerous parameters
        if (options.security?.bypassSandbox) {
            args.push('--dangerously-bypass-approvals-and-sandbox');
        }

        if (sessionId) args.push('resume', sessionId);
        if (files && files.length > 0) {
            for (const file of files) {
                args.push('-i', file);
            }
        }
        // Note: prompt is passed via stdin in BaseCLIProvider for codex
        return args;
    }

    protected extractText(event: Record<string, unknown>): string | null {
        const item = event.item as Record<string, any> | undefined;
        if (event.type === 'item.completed' && item?.type === 'agent_message') {
            return (item.text as string) ?? null;
        }
        if (event.type === 'message' && event.role === 'assistant') {
            return (event.content as string) ?? null;
        }
        return null;
    }

    protected extractSessionId(event: Record<string, unknown>): string | null {
        if (event.type === 'thread.started' && event.thread_id) {
            return event.thread_id as string;
        }
        if ((event.type === 'init' || event.type === 'system') && event.session_id) {
            return event.session_id as string;
        }
        return null;
    }

    protected extractToolUse(event: Record<string, unknown>): ToolCall[] {
        if (event.type === 'item.completed' && event.item) {
            const item = event.item as Record<string, any>;
            if (['command_execution', 'web_search', 'read_file', 'write_file', 'apply_patch'].includes(item.type)) {
                return [{
                    name: item.type,
                    input: item,
                }];
            }
        }
        if (event.type === 'tool_call') {
            return [{
                name: event.name as string,
                input: (event.arguments ?? {}) as Record<string, unknown>,
            }];
        }
        return [];
    }

    protected extractTokenUsage(event: Record<string, unknown>): TokenUsage | null {
        if (event.type === 'turn.completed' && event.usage) {
            const usage = event.usage as Record<string, number>;
            return {
                input: usage.input_tokens ?? 0,
                output: usage.output_tokens ?? 0,
                cacheRead: usage.cached_input_tokens ?? 0,
            };
        }
        if (event.type === 'result' && event.usage) {
            const usage = event.usage as Record<string, number>;
            return {
                input: usage.input_tokens ?? 0,
                output: usage.output_tokens ?? 0,
                cacheRead: usage.cache_read_input_tokens ?? 0,
                cacheCreation: usage.cache_creation_input_tokens ?? 0,
            };
        }
        return null;
    }
}
