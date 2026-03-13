// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registry } from '../../llm/index.js';
import { BaseCLIProvider } from '../../llm/BaseCLIProvider.js';
import { ClaudeProvider } from '../../llm/providers/ClaudeProvider.js';
import { GeminiProvider } from '../../llm/providers/GeminiProvider.js';
import { CodexProvider } from '../../llm/providers/CodexProvider.js';
import { loadSessions, saveSession, deleteSession } from '../../llm/SessionUtils.js';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

vi.mock('fs');
vi.mock('child_process');
vi.mock('readline');

describe('LLM Providers & Utilities', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('ProviderRegistry', () => {
        it('should have all providers registered', () => {
            const providers = registry.list();
            expect(providers).toContain('claude');
            expect(providers).toContain('gemini');
            expect(providers).toContain('codex');
        });
    });

    describe('ClaudeProvider', () => {
        const provider = registry.get('claude') as ClaudeProvider;

        it('should report hasToken correctly', () => {
            delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
            expect(provider.capabilities.hasToken).toBe(false);
            
            process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = 'test-token';
            expect(provider.capabilities.hasToken).toBe(true);
        });

        it('should throw error if attachments used without token', () => {
            delete process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
            const buildArgs = (provider as any).buildArgs.bind(provider);
            expect(() => buildArgs('test', null, ['file.png'], {})).toThrow('Claude attachment failure');
        });

        it('should NOT include dangerous parameter by default', () => {
            const buildArgs = (provider as any).buildArgs.bind(provider);
            const args = buildArgs('test', null, [], {});
            expect(args).not.toContain('--dangerously-skip-permissions');
        });

        it('should include dangerous parameter if explicitly requested', () => {
            const buildArgs = (provider as any).buildArgs.bind(provider);
            const args = buildArgs('test', null, [], { security: { skipPermissions: true } });
            expect(args).toContain('--dangerously-skip-permissions');
        });

        it('should correctly handle concurrent requests with different security settings (BUG-SEC-002)', async () => {
            const buildArgs = (provider as any).buildArgs.bind(provider);
            
            const args1 = buildArgs('prompt1', null, [], { security: { skipPermissions: true } });
            const args2 = buildArgs('prompt2', null, [], { security: { skipPermissions: false } });
            const args3 = buildArgs('prompt3', null, [], { security: { skipPermissions: true } });

            expect(args1).toContain('--dangerously-skip-permissions');
            expect(args2).not.toContain('--dangerously-skip-permissions');
            expect(args3).toContain('--dangerously-skip-permissions');
        });
    });

    describe('CodexProvider', () => {
        const provider = registry.get('codex') as CodexProvider;

        it('should NOT include dangerous parameter by default', () => {
            const buildArgs = (provider as any).buildArgs.bind(provider);
            const args = buildArgs('test', null, [], {});
            expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
        });

        it('should include dangerous parameter if explicitly requested', () => {
            const buildArgs = (provider as any).buildArgs.bind(provider);
            const args = buildArgs('test', null, [], { security: { bypassSandbox: true } });
            expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
        });
    });

    describe('BaseCLIProvider Execution', () => {
        const provider = registry.get('gemini') as GeminiProvider;
        let mockChild: any;
        let mockRl: any;

        beforeEach(() => {
            vi.clearAllMocks();
            mockChild = new EventEmitter();
            mockChild.stdout = new EventEmitter();
            mockChild.stderr = new EventEmitter();
            mockChild.stdin = { write: vi.fn(), end: vi.fn() };
            mockChild.kill = vi.fn();
            (child_process.spawn as any).mockReturnValue(mockChild);
            (child_process.execSync as any).mockReturnValue('/usr/local/bin/gemini');

            mockRl = new EventEmitter();
            mockRl.close = vi.fn();
            (readline.createInterface as any).mockReturnValue(mockRl);
        });

        it('should successfully invoke and return response', async () => {
            const invokePromise = provider.invoke({ prompt: 'test' });
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            mockRl.emit('line', JSON.stringify({ type: 'init', session_id: 'new-sid' }));
            mockRl.emit('line', JSON.stringify({ type: 'message', role: 'assistant', content: 'READY' }));
            mockRl.emit('line', JSON.stringify({ type: 'result', usage: { input_tokens: 10, output_tokens: 5 } }));
            
            mockRl.emit('close');
            mockChild.emit('close', 0);

            const result = await invokePromise;
            expect(result.text).toBe('READY');
            expect(result.sessionId).toBe('new-sid');
            expect(result.tokenUsage?.input).toBe(10);
        });
    });
});
