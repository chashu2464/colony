import { describe, expect, it } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { loadAgentConfig } from '../../agent/AgentConfig.js';

function writeConfig(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-'));
    const filePath = path.join(dir, 'agent.yaml');
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

describe('loadAgentConfig routable', () => {
    it('defaults routable to true when omitted', () => {
        const file = writeConfig(`
id: a1
name: Agent1
model:
  primary: codex
personality: test
`);
        const cfg = loadAgentConfig(file);
        expect(cfg.routable).toBe(true);
    });

    it('respects routable: false when configured', () => {
        const file = writeConfig(`
id: a2
name: Agent2
model:
  primary: codex
personality: test
routable: false
`);
        const cfg = loadAgentConfig(file);
        expect(cfg.routable).toBe(false);
    });
});
