
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../src/agent/Agent.js';
import { ModelRouter } from '../src/llm/ModelRouter.js';
import { ContextAssembler } from '../src/memory/ContextAssembler.js';
import { ShortTermMemory } from '../src/memory/ShortTermMemory.js';
import { ChatRoomManager } from '../src/conversation/ChatRoomManager.js';
import { MessageBus } from '../src/conversation/MessageBus.js';

async function reproduce() {
    const workingDir = path.resolve('./.tmp/repro-symlink');
    if (fs.existsSync(workingDir)) {
        fs.rmSync(workingDir, { recursive: true });
    }
    fs.mkdirSync(workingDir, { recursive: true });

    console.log(`Reproduction working directory: ${workingDir}`);

    // Mock dependencies
    const messageBus = new MessageBus();
    const chatRoomManager = new ChatRoomManager(messageBus, {} as any, {} as any);
    const modelRouter = {} as any;
    const contextAssembler = {
        registerAgent: () => {},
        assemble: async () => 'prompt'
    } as any;
    const shortTermMemory = {} as any;

    const agentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        model: { primary: 'gemini' as any, fallback: [] },
    } as any;

    const agent = new Agent(
        agentConfig,
        modelRouter,
        contextAssembler,
        shortTermMemory,
        chatRoomManager
    );

    // Call the private method via casting to any
    console.log('Calling ensureSkillsSymlinks...');
    await (agent as any).ensureSkillsSymlinks(workingDir);

    const dirs = ['.claude', '.gemini', '.codex'];
    for (const dir of dirs) {
        const target = path.join(workingDir, dir, 'skills');
        if (fs.existsSync(target)) {
            console.log(`✅ ${dir}/skills exists`);
        } else {
            console.log(`❌ ${dir}/skills MISSING`);
        }
    }
}

reproduce().catch(console.error);
