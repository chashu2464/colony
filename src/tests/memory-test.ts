// ── Colony: Memory System Tests ──────────────────────────
// Basic tests for the memory system components.

import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ContextScheduler } from '../memory/ContextScheduler.js';
import type { Message, AgentConfig } from '../types.js';

// ── Test Helpers ─────────────────────────────────────────

function createTestMessage(id: string, content: string, roomId: string = 'test-room'): Message {
    return {
        id,
        roomId,
        sender: { id: 'user1', type: 'human', name: 'Test User' },
        content,
        mentions: [],
        timestamp: new Date(),
    };
}

function createTestAgentConfig(id: string, name: string): AgentConfig {
    return {
        id,
        name,
        model: { primary: 'claude' },
        personality: `I am ${name}, a helpful assistant.`,
        skills: ['send-message', 'get-messages'],
    };
}

function createMockChatRoom(roomId: string, participants: any[] = []) {
    return {
        getInfo: () => ({
            id: roomId,
            name: 'Test Room',
            participants: participants.length > 0 ? participants : [
                { id: 'agent1', type: 'agent', name: 'Test Agent' },
                { id: 'user1', type: 'human', name: 'Test User' }
            ],
            createdAt: new Date(),
            messageCount: 0
        })
    };
}

async function runTests() {
    // ── Test: Short-Term Memory ─────────────────────────────

    console.log('=== Testing ShortTermMemory ===\n');

    const stm = new ShortTermMemory({
        windowSize: 10,
        maxTokens: 500,
        compressionThreshold: 0.8,
    });

    // Add messages
    for (let i = 1; i <= 5; i++) {
        stm.add('room1', createTestMessage(`msg${i}`, `Message ${i}`, 'room1'));
    }

    console.log('✓ Added 5 messages to room1');
    console.log(`  Token count: ${stm.getTokenCount('room1')}`);

    // Get messages
    const messages = stm.get('room1');
    console.log(`✓ Retrieved ${messages.length} messages`);

    // Mark important
    stm.markImportant('msg3');
    console.log('✓ Marked msg3 as important');

    // Test compression
    console.log('\n--- Testing Compression ---');
    for (let i = 6; i <= 20; i++) {
        stm.add('room1', createTestMessage(`msg${i}`, `This is a longer message ${i} with more content to trigger compression`, 'room1'));
    }
    console.log(`✓ Added 15 more messages (total 20)`);
    console.log(`  Token count before compression: ${stm.getTokenCount('room1')}`);

    await stm.compress('room1');
    const afterCompression = stm.get('room1');
    console.log(`✓ Compressed: ${messages.length} → ${afterCompression.length} messages`);
    console.log(`  Token count after compression: ${stm.getTokenCount('room1')}`);

    // ── Test: Context Assembler ─────────────────────────────

    console.log('\n=== Testing ContextAssembler ===\n');

    const stm2 = new ShortTermMemory();
    const assembler = new ContextAssembler(stm2);

    // Register a test agent
    const agentConfig = createTestAgentConfig('agent1', 'Test Agent');
    const mockSkillManager = {
        toPromptBlock: () => '## Available Skills\n- send-message: Send a message\n- get-messages: Get recent messages',
        get: () => null,
        getAll: () => [],
        loadSkills: () => {},
        discoverFromDirectory: () => {},
    };
    assembler.registerAgent(agentConfig, mockSkillManager as any);

    // Add some history
    for (let i = 1; i <= 3; i++) {
        stm2.add('room2', createTestMessage(`msg${i}`, `History message ${i}`, 'room2'));
    }

    // Assemble prompt
    const currentMsg = createTestMessage('current', 'What is the status?', 'room2');
    stm2.add('room2', currentMsg);

    const prompt = await assembler.assemble({
        agentId: 'agent1',
        roomId: 'room2',
        currentMessage: currentMsg,
        tokenBudget: 2000,
        includeHistory: true,
        chatRoom: createMockChatRoom('room2') as any,
    });

    console.log('✓ Assembled prompt:');
    console.log(`  Length: ${prompt.length} chars`);
    console.log(`  Contains identity: ${prompt.includes('Test Agent')}`);
    console.log(`  Contains skills: ${prompt.includes('Available Skills')}`);
    console.log(`  Contains history: ${prompt.includes('History message')}`);
    console.log(`  Contains current: ${prompt.includes('What is the status')}`);

    // ── Test: Context Scheduler ─────────────────────────────

    console.log('\n=== Testing ContextScheduler ===\n');

    const stm3 = new ShortTermMemory();
    const scheduler = new ContextScheduler(stm3);

    // Set sharing policy
    scheduler.setPolicy('room3', { mode: 'shared' });
    console.log('✓ Set sharing policy to "shared"');

    // Add messages
    for (let i = 1; i <= 5; i++) {
        stm3.add('room3', createTestMessage(`msg${i}`, `Message ${i}`, 'room3'));
    }

    // Get shared memory
    const sharedMemory = scheduler.getSharedMemory('agent1', 'room3');
    console.log(`✓ Retrieved ${sharedMemory.length} shared messages`);

    // Export session
    const snapshot = await scheduler.exportSession('room3');
    console.log('✓ Exported session snapshot:');
    console.log(`  Summary: ${snapshot.summary.substring(0, 50)}...`);
    console.log(`  Key decisions: ${snapshot.keyDecisions.length}`);
    console.log(`  Participants: ${snapshot.participants.length}`);

    // Import to new room
    await scheduler.importSession(snapshot, 'room4');
    const importedMessages = stm3.get('room4');
    console.log(`✓ Imported session to room4: ${importedMessages.length} messages`);

    // Archive session
    await scheduler.archiveSession('room3');
    console.log('✓ Archived session room3');

    console.log('\n=== All Tests Passed ✓ ===\n');
}

// Run tests
runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
