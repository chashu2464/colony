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
