import { Agent } from '../agent/Agent.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import * as path from 'path';
import * as fs from 'fs';

async function testAgentPrompt() {
    console.log('=== Testing Agent Prompt Assembly with Skills ===');

    const stm = new ShortTermMemory();
    const assembler = new ContextAssembler(stm);
    const router = new ModelRouter({} as any);
    const roomManager = new ChatRoomManager({} as any, {} as any, {} as any);

    const config = {
        id: 'architect',
        name: '架构师',
        model: { primary: 'claude' },
        personality: 'You are an architect.',
        rules: ['Rule 1']
    };

    // Instantiate Agent (this should trigger skill loading)
    const agent = new Agent(config as any, router, assembler, stm, roomManager);

    // Create a mock chat room and message
    const roomId = 'test-room';
    const message = {
        id: 'msg1',
        roomId,
        sender: { id: 'user', type: 'human', name: 'User' },
        content: 'Hello',
        mentions: ['architect'],
        timestamp: new Date()
    };

    // Assemble prompt using the same logic as Agent.handleMessage
    const prompt = await assembler.assemble({
        agentId: config.id,
        roomId,
        currentMessage: message as any,
        tokenBudget: 8000,
        includeHistory: true,
        includeLongTerm: false,
        chatRoom: {
            getInfo: () => ({
                id: roomId,
                name: 'Test Room',
                participants: [{ id: 'architect', name: '架构师' }],
                createdAt: new Date(),
                messageCount: 1
            })
        } as any
    });

    console.log('✓ Assembled prompt length:', prompt.length);
    
    const hasSkills = prompt.includes('可用技能 (Available Skills)');
    console.log('✓ Contains skills section:', hasSkills);

    if (hasSkills) {
        console.log('✓ Found skills:');
        const lines = prompt.split('\n');
        const skillLines = lines.filter(l => l.startsWith('### '));
        skillLines.forEach(l => console.log('  -', l.substring(4)));
    } else {
        console.error('✗ Skills section missing!');
        process.exit(1);
    }

    console.log('=== Test Passed ===');
}

testAgentPrompt().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
