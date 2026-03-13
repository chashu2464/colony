// @ts-nocheck
import { ContextAssembler } from '../src/memory/ContextAssembler.js';
import { ShortTermMemory } from '../src/memory/ShortTermMemory.js';
import { Logger } from '../src/utils/Logger.js';
import * as path from 'path';

async function benchmarkAssemble() {
    console.log('=== Performance Test: ContextAssembler.assemble ===');
    const stm = new ShortTermMemory();
    const assembler = new ContextAssembler(stm);
    
    // Register agent
    assembler.registerAgent({
        id: 'developer',
        name: 'Developer',
        personality: 'test',
        is_default: true,
        rules: ['rule1'],
    } as any, {
        toPromptBlock: () => 'skills block'
    } as any);

    // Add 50 dummy messages to STM
    for (let i = 0; i < 50; i++) {
        stm.add('room1', {
            id: `msg-${i}`,
            roomId: 'room1',
            sender: { id: 'user', type: 'human', name: 'User' },
            content: `Message ${i}: This is some long message content to simulate real history.`.repeat(10),
            mentions: [],
            timestamp: new Date(),
        });
    }

    const currentMsg = {
        id: 'current',
        roomId: 'room1',
        sender: { id: 'user', type: 'human', name: 'User' },
        content: 'Current message content',
        mentions: ['developer'],
        timestamp: new Date(),
    } as any;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        await assembler.assemble({
            agentId: 'developer',
            roomId: 'room1',
            currentMessage: currentMsg,
            chatRoom: { getInfo: () => ({ participants: [] }) } as any,
            tokenBudget: 4000
        });
    }
    const end = performance.now();
    const average = (end - start) / 100;
    console.log(`Average assemble time over 100 iterations: ${average.toFixed(4)}ms`);

    if (average < 50) {
        console.log('✓ PASS: Assemble time is below 50ms');
    } else {
        console.error('✗ FAIL: Assemble time exceeds 50ms');
        process.exit(1);
    }

    console.log('=== Test Completed ===');
}

benchmarkAssemble().catch(console.error);
