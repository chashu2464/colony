import { BaseCLIProvider } from '../BaseCLIProvider.js';
import { LLMCapabilities, TokenUsage, ToolCall } from '../types.js';
import { InvokeOptions } from '../../types.js';

export class ClaudeProvider extends BaseCLIProvider {
    readonly name = 'claude';

    get capabilities(): LLMCapabilities {
        const hasToken = !!process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
        return {
            streaming: true,
            toolUse: true,
            attachments: true,
            sessionResume: true,
            hasToken
        };
    }

    protected buildArgs(prompt: string, sessionId: string | null, files: string[], options: InvokeOptions): string[] {
        // BUG-INT-001: Claude attachment failure due to missing token
        if (files && files.length > 0 && !this.capabilities.hasToken) {
            throw new Error('Claude attachment failure: CLAUDE_CODE_SESSION_ACCESS_TOKEN must be set to use attachments.');
        }

        const args = [
            '-p', prompt,
            '--output-format', 'stream-json',
            '--verbose',
        ];

        // BUG-SEC-001: Default use of dangerous parameters
        if (options.security?.skipPermissions) {
            args.push('--dangerously-skip-permissions');
        }

        if (sessionId) args.push('--resume', sessionId);
        if (files && files.length > 0) {
            for (const file of files) {
                args.push('--file', file);
            }
        }
        return args;
    }

    protected extractText(event: Record<string, unknown>): string | null {
        if (event.type !== 'assistant') return null;
        const content = (event.message as Record<string, unknown>)?.content;
        if (!Array.isArray(content)) return null;
        return content
            .filter((b: Record<string, unknown>) => b.type === 'text')
            .map((b: Record<string, unknown>) => b.text as string)
            .join('');
    }

    protected extractSessionId(event: Record<string, unknown>): string | null {
        if ((event.type === 'system' || event.type === 'result') && event.session_id) {
            return event.session_id as string;
        }
        return null;
    }

    protected extractToolUse(event: Record<string, unknown>): ToolCall[] {
        if (event.type === 'assistant') {
            const content = (event.message as Record<string, unknown>)?.content;
            if (!Array.isArray(content)) return [];
            return content
                .filter((b: Record<string, unknown>) => b.type === 'tool_use')
                .map((b: Record<string, unknown>) => ({
                    id: b.id as string,
                    name: b.name as string,
                    input: b.input as Record<string, unknown>,
                }));
        } else if (event.type === 'user') {
            const content = (event.message as Record<string, unknown>)?.content;
            if (!Array.isArray(content)) return [];
            return content
                .filter((b: Record<string, unknown>) => b.type === 'tool_result')
                .map((b: Record<string, unknown>) => ({
                    id: b.tool_use_id as string,
                    name: 'tool_result_placeholder', // Name will be overridden by merge if ID exists
                    result: b.content as string,
                    isError: b.is_error as boolean,
                    input: {} // Result doesn't have input, but interface requires it
                }));
        }
        return [];
    }

    protected extractTokenUsage(event: Record<string, unknown>): TokenUsage | null {
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
