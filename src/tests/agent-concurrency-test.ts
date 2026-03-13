// ── Colony: Agent Concurrency & Cooldown Integration Test ────────────────
// Validates serial processing, 1s cooldown, and error isolation.

import { Agent } from '../agent/Agent.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { SkillManager } from '../agent/skills/SkillManager.js';
import type { Message, AgentConfig, SupportedCLI, InvokeResult } from '../types.js';

// ── Mocks ────────────────────────────────────────────────

class MockModelRouter {
    public invocationTimes: number[] = [];
    public completionTimes: number[] = [];
    public processingTime = 200; // ms
    public shouldFailOnce = false;

    async invoke(primary: SupportedCLI, prompt: string, options: any): Promise<InvokeResult & { actualModel: SupportedCLI }> {
        const startTime = Date.now();
        this.invocationTimes.push(startTime);

        if (this.shouldFailOnce) {
            this.shouldFailOnce = false;
            throw new Error('Simulated LLM Failure');
        }

        await new Promise(resolve => setTimeout(resolve, this.processingTime));
        
        const endTime = Date.now();
        this.completionTimes.push(endTime);

        return { 
            text: 'Mock Response', 
            sessionId: 'mock-session',
            actualModel: primary,
            toolCalls: []
        };
    }
}

function createTestMessage(id: string, content: string): Message {
    return {
        id,
        roomId: 'test-room',
        sender: { id: 'user1', type: 'human', name: 'Test User' },
        content,
        mentions: ['agent1'],
        timestamp: new Date(),
    };
}

// ── Test Runner ──────────────────────────────────────────

async function runTests() {
    console.log('=== Starting Agent Concurrency & Cooldown Tests ===');

    const config: AgentConfig = {
        id: 'agent1',
        name: 'Test Agent',
        model: { primary: 'claude' },
        personality: 'Test personality',
    };

    const stm = new ShortTermMemory();
    const assembler = new ContextAssembler(stm);
    const mockRouter = new MockModelRouter();
    
    // Mock ChatRoomManager
    const mockChatRoomManager = {
        getRoom: (id: string) => ({
            id,
            workingDir: null,
            getInfo: () => ({ participants: [] }),
            sendAgentMessage: (agentId: string, content: string, mentions: any, options: any) => ({ id: 'msg-' + Math.random() }),
            updateMessage: (id: string, content: string, options: any) => { }
        })
    };

    const agent = new Agent(
        config,
        mockRouter as any,
        assembler,
        stm,
        mockChatRoomManager as any,
        new SkillManager()
    );

    // 🧪 Scenario 1 & 2: Serial Processing & Cooldown
    console.log('--- Scenario 1 & 2: Serial Processing & 1s Cooldown ---');
    const m1 = createTestMessage('m1', 'First message');
    const m2 = createTestMessage('m2', 'Second message');

    // Send both nearly simultaneously
    const p1 = agent.receiveMessage(m1);
    const p2 = agent.receiveMessage(m2);

    await Promise.all([p1, p2]);

    const gap = mockRouter.invocationTimes[1] - mockRouter.completionTimes[0];
    console.log('Gap between M1 finish and M2 start: ' + gap + 'ms');

    if (gap >= 1000) {
        console.log('✓ PASS: Gap is at least 1000ms');
    } else {
        console.log('✗ FAIL: Gap is less than 1000ms');
    }

    // 🧪 Scenario 3: Error Recovery
    console.log('--- Scenario 3: Error Recovery ---');
    mockRouter.invocationTimes = [];
    mockRouter.completionTimes = [];
    mockRouter.shouldFailOnce = true;

    const m3 = createTestMessage('m3', 'Failure message');
    const m4 = createTestMessage('m4', 'Recovery message');

    const p3 = agent.receiveMessage(m3);
    const p4 = agent.receiveMessage(m4);

    await Promise.all([p3, p4]);

    console.log('Invocation count: ' + mockRouter.invocationTimes.length);
    if (mockRouter.invocationTimes.length === 2) {
        console.log('✓ PASS: Second message processed after first one failed');
    } else {
        console.log('✗ FAIL: Agent stopped processing after failure');
    }

    // 🧪 Scenario 5: External message arrival during idle transition
    console.log('--- Scenario 5: Async Arrival Cooldown ---');
    mockRouter.invocationTimes = [];
    mockRouter.completionTimes = [];
    
    const m5 = createTestMessage('m5', 'Message 5');
    await agent.receiveMessage(m5); // Wait for it to finish
    
    const finishTime = mockRouter.completionTimes[0];
    console.log('M5 finished. Waiting 500ms before sending M6...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const m6 = createTestMessage('m6', 'Message 6');
    await agent.receiveMessage(m6);
    
    const startM6 = mockRouter.invocationTimes[1];
    const asyncGap = startM6 - finishTime;
    console.log('Gap between M5 finish and M6 start: ' + asyncGap + 'ms');

    if (asyncGap >= 1000) {
        console.log('✓ PASS: Async gap is at least 1000ms');
    } else {
        console.log('✗ FAIL: Async gap is less than 1000ms (Immediate processing detected)');
    }

    console.log('=== Concurrency Tests Completed ===');
}

runTests().catch(err => {
    console.error('Test suite crashed:', err);
    process.exit(1);
});
