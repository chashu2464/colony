import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { Agent } from '../../agent/Agent.js';

describe('Agent Claude config resolution', () => {
    const originalEnv = process.env;
    const resolveClaudeConfigDir = (Agent as any).prototype.resolveClaudeConfigDir as (sessionConfigDir: string) => string;
    const fakeAgent = { name: 'qa-agent' };
    const sessionConfigDir = path.join(process.cwd(), '.data/sessions', 'room-1');

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.CLAUDE_CONFIG_DIR;
        delete process.env.COLONY_CLAUDE_AUTH_CONFIG_DIR;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('prefers explicit COLONY_CLAUDE_AUTH_CONFIG_DIR', () => {
        process.env.COLONY_CLAUDE_AUTH_CONFIG_DIR = '/tmp/custom-claude-auth';
        expect(resolveClaudeConfigDir.call(fakeAgent, sessionConfigDir)).toBe('/tmp/custom-claude-auth');
    });

    it('keeps inherited global CLAUDE_CONFIG_DIR when not room-scoped', () => {
        process.env.CLAUDE_CONFIG_DIR = '/tmp/shared-claude-auth';
        expect(resolveClaudeConfigDir.call(fakeAgent, sessionConfigDir)).toBe('/tmp/shared-claude-auth');
    });

    it('ignores inherited absolute room-scoped CLAUDE_CONFIG_DIR', () => {
        process.env.CLAUDE_CONFIG_DIR = sessionConfigDir;
        expect(resolveClaudeConfigDir.call(fakeAgent, sessionConfigDir)).toBe(path.join(os.homedir(), '.claude'));
    });

    it('ignores inherited relative room-scoped CLAUDE_CONFIG_DIR', () => {
        process.env.CLAUDE_CONFIG_DIR = '.data/sessions/room-1';
        expect(resolveClaudeConfigDir.call(fakeAgent, sessionConfigDir)).toBe(path.join(os.homedir(), '.claude'));
    });

    it('falls back to ~/.claude when no env override is set', () => {
        expect(resolveClaudeConfigDir.call(fakeAgent, sessionConfigDir)).toBe(path.join(os.homedir(), '.claude'));
    });
});

describe('Agent send-message success detection', () => {
    const hasSuccessfulSendMessage = (Agent as any).prototype.hasSuccessfulSendMessage as (toolCalls: any[]) => boolean;
    const fakeAgent = Object.create((Agent as any).prototype);

    it('treats command_execution as successful only with receipt message.id and exit_code=0', () => {
        const toolCalls = [
            {
                name: 'command_execution',
                isError: false,
                input: {
                    command: `echo '{"content":"ok"}' | bash skills/send-message/scripts/handler.sh`,
                    exit_code: 0,
                    aggregated_output: `API Response (HTTP 200): {"message":{"id":"edfbde2b-d63a-4011-8797-889614273bca","roomId":"room-1"}}`,
                },
            },
        ];
        expect(hasSuccessfulSendMessage.call(fakeAgent, toolCalls)).toBe(true);
    });

    it('does not treat log grep containing send-message text as a successful send', () => {
        const toolCalls = [
            {
                name: 'command_execution',
                isError: false,
                input: {
                    command: `rg -n "Invalid JSON format" logs/skill-send-message.log`,
                    exit_code: 0,
                    aggregated_output: '1182:[2026-03-20] [DEBUG] Error: Invalid JSON format',
                },
            },
        ];
        expect(hasSuccessfulSendMessage.call(fakeAgent, toolCalls)).toBe(false);
    });

    it('does not treat send-message tool call as successful when it is marked as error', () => {
        const toolCalls = [
            {
                name: 'send-message',
                isError: true,
                input: { content: 'hello' },
                result: '{"error":"Invalid JSON format"}',
            },
            {
                name: 'command_execution',
                isError: false,
                input: {
                    command: `echo '{"content":"hi"}' | bash skills/send-message/scripts/handler.sh`,
                    exit_code: 1,
                    aggregated_output: '{"error":"content is required"}',
                },
            },
        ];
        expect(hasSuccessfulSendMessage.call(fakeAgent, toolCalls)).toBe(false);
    });

    it('treats direct send-message tool result with message.id as successful', () => {
        const toolCalls = [
            {
                name: 'send-message',
                isError: false,
                input: { content: 'hello world' },
                result: '{"message":{"id":"msg-123","roomId":"room-1"}}',
            },
        ];
        expect(hasSuccessfulSendMessage.call(fakeAgent, toolCalls)).toBe(true);
    });
});
