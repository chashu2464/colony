// ── Colony: Mem0 Integration Tests ───────────────────────
// Tests for Mem0 long-term memory integration.

import { Mem0LongTermMemory } from '../memory/Mem0LongTermMemory.js';
import type { MemoryContent } from '../memory/types.js';

async function testMem0Integration() {
    console.log('=== Testing Mem0 Integration ===\n');

    // Initialize Mem0
    console.log('1. Initializing Mem0...');
    const mem0 = new Mem0LongTermMemory({
        vector_store: {
            provider: 'chroma',
            config: {
                path: './.mem0_test/chroma_db'
            }
        },
        llm: {
            provider: 'openai',
            config: {
                model: 'gpt-4o-mini',
                api_key: process.env.OPENAI_API_KEY || ''
            }
        },
        embedder: {
            provider: 'openai',
            config: {
                model: 'text-embedding-3-small',
                api_key: process.env.OPENAI_API_KEY || '',
                embedding_dims: 1536
            }
        }
    });

    try {
        // Mem0 will auto-initialize on first use
        console.log('✓ Mem0 created (will initialize on first use)\n');

        // Test 1: Retain memories
        console.log('2. Testing retain (add memories)...');

        const memory1: MemoryContent = {
            content: '用户喜欢喝咖啡，特别是拿铁',
            metadata: {
                type: 'conversation',
                importance: 0.8,
                tags: ['preference', 'coffee'],
                agentId: 'agent1',
                roomId: 'room1'
            },
            timestamp: new Date()
        };

        const memory2: MemoryContent = {
            content: '用户使用Python和TypeScript进行开发',
            metadata: {
                type: 'knowledge',
                importance: 0.9,
                tags: ['skill', 'programming'],
                agentId: 'agent1',
                roomId: 'room1'
            },
            timestamp: new Date()
        };

        const memory3: MemoryContent = {
            content: '团队决定使用PostgreSQL作为数据库',
            metadata: {
                type: 'decision',
                importance: 1.0,
                tags: ['decision', 'database'],
                agentId: 'agent1',
                roomId: 'room1'
            },
            timestamp: new Date()
        };

        const id1 = await mem0.retain(memory1);
        console.log(`✓ Memory 1 retained: ${id1}`);

        const id2 = await mem0.retain(memory2);
        console.log(`✓ Memory 2 retained: ${id2}`);

        const id3 = await mem0.retain(memory3);
        console.log(`✓ Memory 3 retained: ${id3}\n`);

        // Test 2: Recall memories
        console.log('3. Testing recall (search memories)...');

        const results1 = await mem0.recall('用户喜欢什么饮料？', 3);
        console.log(`✓ Search "用户喜欢什么饮料？" returned ${results1.length} results:`);
        results1.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.content} (importance: ${r.metadata?.importance})`);
        });

        const results2 = await mem0.recall('用户使用什么编程语言？', 3);
        console.log(`\n✓ Search "用户使用什么编程语言？" returned ${results2.length} results:`);
        results2.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.content}`);
        });

        const results3 = await mem0.recall('数据库选择', 3);
        console.log(`\n✓ Search "数据库选择" returned ${results3.length} results:`);
        results3.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.content}`);
        });

        // Test 3: Get all memories
        console.log('\n4. Testing get_all...');
        const allMemories = await mem0.getAll({
            agentId: 'agent1',
            roomId: 'room1',
            limit: 10
        });
        console.log(`✓ Retrieved ${allMemories.length} memories for agent1/room1`);

        // Test 4: Reflect
        console.log('\n5. Testing reflect...');
        const reflection = await mem0.reflect('用户偏好和技能');
        console.log('✓ Reflection generated:');
        console.log(reflection);

        // Test 5: Update memory
        console.log('\n6. Testing update...');
        await mem0.update(id1, '用户喜欢喝咖啡，特别是冰拿铁');
        console.log(`✓ Memory ${id1} updated`);

        // Verify update
        const updatedResults = await mem0.recall('用户喜欢什么饮料？', 1);
        console.log(`  Updated content: ${updatedResults[0]?.content}`);

        // Test 6: Delete memory
        console.log('\n7. Testing delete...');
        await mem0.delete(id3);
        console.log(`✓ Memory ${id3} deleted`);

        // Verify deletion
        const afterDelete = await mem0.getAll({
            agentId: 'agent1',
            roomId: 'room1'
        });
        console.log(`  Remaining memories: ${afterDelete.length}`);

        console.log('\n=== All Tests Passed ✓ ===\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    } finally {
        // Cleanup
        await mem0.destroy();
        console.log('Mem0 bridge destroyed');
    }
}

// Run tests
if (process.env.OPENAI_API_KEY) {
    testMem0Integration().catch(err => {
        console.error('Test suite failed:', err);
        process.exit(1);
    });
} else {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    console.error('Please set it to run Mem0 tests');
    process.exit(1);
}
