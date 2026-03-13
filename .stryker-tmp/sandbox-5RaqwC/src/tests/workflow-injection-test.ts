// @ts-nocheck
// ── Colony: Workflow Injection Test ──────────────────────
// Tests for automatic injection of workflow stage into context.

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import type { Message, AgentConfig } from '../types.js';

async function testWorkflowInjection() {
    console.log('=== Testing Workflow Stage Injection ===\n');

    const roomId = 'test-room-123';
    const workflowDir = path.join(process.cwd(), '.data/workflows');
    const workflowFile = path.join(workflowDir, `${roomId}.json`);

    // 1. Setup mock workflow file
    console.log('1. Setting up mock workflow file...');
    await fs.mkdir(workflowDir, { recursive: true });
    const mockWorkflow = {
        task_id: '1c2bfbbe',
        task_name: 'Context Workflow Injection',
        current_stage: 5,
        stage_name: '5. Test Case Design',
        status: 'active',
        assignments: {
            architect: 'architect',
            developer: 'developer',
            qa_lead: 'qa-lead',
            tech_lead: 'developer'
        }
    };
    await fs.writeFile(workflowFile, JSON.stringify(mockWorkflow, null, 2));
    console.log(`✓ Mock workflow created at ${workflowFile}\n`);

    // 2. Initialize ContextAssembler
    console.log('2. Initializing ContextAssembler...');
    const stm = new ShortTermMemory();
    const assembler = new ContextAssembler(stm);

    const agentConfig: AgentConfig = {
        id: 'developer',
        name: '开发者',
        model: { primary: 'claude' },
        personality: '你是一个高级开发人员...',
        rules: ['遵循代码规范']
    };

    // Mock SkillManager
    const mockSkillManager: any = {
        toPromptBlock: () => '## Skills\n- write-file\n- read-file'
    };

    assembler.registerAgent(agentConfig, mockSkillManager);
    console.log('✓ Assembler initialized and agent registered\n');

    // 3. Assemble prompt
    console.log('3. Assembling prompt for agent "developer"...');
    const currentMessage: Message = {
        id: 'msg1',
        roomId: roomId,
        sender: { id: 'user', type: 'human', name: 'User' },
        content: '请开始编写测试用例',
        mentions: [],
        timestamp: new Date()
    };

    // Mock ChatRoom
    const mockChatRoom: any = {
        getInfo: () => ({
            id: roomId,
            participants: [
                { id: 'user', type: 'human', name: 'User' },
                { id: 'developer', type: 'agent', name: '开发者' }
            ]
        })
    };

    try {
        const prompt = await assembler.assemble({
            agentId: 'developer',
            roomId: roomId,
            currentMessage: currentMessage,
            tokenBudget: 4000,
            chatRoom: mockChatRoom
        });

        console.log('--- Resulting Prompt (truncated) ---');
        console.log(prompt.substring(0, 1000) + '...');
        console.log('------------------------------------\n');

        // 4. Verify injection
        console.log('4. Verifying injection...');
        if (prompt.includes('## 当前工作流阶段')) {
            console.log('✓ Workflow section found!');
        } else {
            console.error('✗ Workflow section NOT found!');
        }

        if (prompt.includes('5. Test Case Design')) {
            console.log('✓ Stage name found!');
        } else {
            console.error('✗ Stage name NOT found!');
        }

        if (prompt.includes('**你的角色**:')) {
            console.log('✓ Agent role found!');
        } else {
            console.error('✗ Agent role NOT found!');
        }

        if (prompt.includes('**当前阶段指引**：')) {
            console.log('✓ Stage guidance section found!');
        } else {
            console.error('✗ Stage guidance section NOT found!');
        }

    } catch (error) {
        console.error('✗ Test failed with error:', error);
    } finally {
        // Cleanup
        // await fs.unlink(workflowFile);
    }
}

testWorkflowInjection().catch(console.error);
