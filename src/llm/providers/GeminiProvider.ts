import { BaseCLIProvider } from '../BaseCLIProvider.js';
import { LLMCapabilities, TokenUsage, ToolCall } from '../types.js';
import { Logger } from '../../utils/Logger.js';
import { InvokeOptions } from '../../types.js';

const log = new Logger('GeminiProvider');

export class GeminiProvider extends BaseCLIProvider {
    readonly name = 'gemini';
    readonly capabilities: LLMCapabilities = {
        streaming: true,
        toolUse: true,
        attachments: false, // Gemini CLI doesn't support --file yet
        sessionResume: true,
    };

    protected buildArgs(prompt: string, sessionId: string | null, files: string[], options: InvokeOptions): string[] {
        const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
        if (sessionId) args.push('--resume', sessionId);
        if (files && files.length > 0) {
            log.warn(`Gemini CLI does not support --file parameter. Skipping ${files.length} attachment(s).`);
        }
        return args;
    }

    protected extractText(event: Record<string, unknown>): string | null {
        if (event.type === 'message' && event.role === 'assistant') {
            return (event.content as string) ?? null;
        }
        return null;
    }

    protected extractSessionId(event: Record<string, unknown>): string | null {
        if (event.type === 'init' && event.session_id) {
            return event.session_id as string;
        }
        return null;
    }

    protected extractToolUse(event: Record<string, unknown>): ToolCall[] {
        if (event.type === 'tool_use') {
            return [{
                name: event.tool_name as string,
                input: (event.parameters ?? {}) as Record<string, unknown>,
            }];
        }
        return [];
    }

    protected extractTokenUsage(event: Record<string, unknown>): TokenUsage | null {
        if (event.type === 'result' && (event.usage || event.stats)) {
            const usage = (event.usage ?? event.stats) as Record<string, number>;
            return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
        }
        return null;
    }
}
