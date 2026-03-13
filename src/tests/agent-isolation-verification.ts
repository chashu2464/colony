
import { Agent } from '../agent/Agent.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import { SkillManager } from '../agent/skills/SkillManager.js';
import * as path from 'path';
import * as fs from 'fs';
import { Message } from '../types.js';

async function verifyAgentIsolationAndContinuation() {
    console.log('=== Verifying Agent Isolation and Continuation Prompt ===');

    const stm = new ShortTermMemory();
    const assembler = new ContextAssembler(stm);
    const mockRouter = {
        invoke: async (model: any, prompt: string, options: any) => {
            console.log(`\n[Round ${options.round || 1}] Invoke with model: ${model}`);
            console.log(`[Round ${options.round || 1}] Prompt snippet: ${prompt.substring(0, 100)}...`);
            console.log(`[Round ${options.round || 1}] Env XDG_CONFIG_HOME: ${options.env.XDG_CONFIG_HOME}`);
            console.log(`[Round ${options.round || 1}] Env CLAUDE_CONFIG_DIR: ${options.env.CLAUDE_CONFIG_DIR}`);
            
            // Check if isolation works
            if (!options.env.XDG_CONFIG_HOME.includes('.data/sessions/test-room')) {
                throw new Error('XDG_CONFIG_HOME isolation failed!');
            }
            if (!options.env.CLAUDE_CONFIG_DIR.includes('.data/sessions/test-room')) {
                throw new Error('CLAUDE_CONFIG_DIR isolation failed!');
            }

            // Simulate tool call in first round
            if (!options.round || options.round === 1) {
                return {
                    text: 'I will read a file.',
                    sessionId: 'session-123',
                    toolCalls: [{ id: 'call1', name: 'read-file', input: { file_path: 'README.md' } }]
                };
            }
            
            // Second round: check if identity is preserved in prompt
            if (options.round === 2) {
                if (!prompt.includes('# 你是 架构师')) {
                    throw new Error('Identity lost in continuation prompt!');
                }
                if (prompt.includes('[系统提示] 你在上一轮执行了以下工具：read-file')) {
                    console.log('✓ System hint found in continuation prompt.');
                } else {
                    throw new Error('System hint missing in continuation prompt!');
                }
                
                return {
                    text: 'Everything looks good.',
                    sessionId: 'session-123',
                    toolCalls: [{ id: 'call2', name: 'send-message', input: { content: 'Done' } }]
                };
            }
            return { text: 'Done', sessionId: 'session-123', toolCalls: [] };
        }
    };

    const roomManager = new ChatRoomManager({} as any, {} as any, {} as any);
    const mockChatRoom = {
        id: 'test-room',
        workingDir: process.cwd(),
        getInfo: () => ({
            id: 'test-room',
            participants: [{ id: 'architect', name: '架构师' }]
        }),
        sendAgentMessage: (agentId: string, text: string, mentions: string[], options: any) => {
            console.log(`[ChatRoom] Message from ${agentId}: ${text}`);
            return { id: 'msg-' + Date.now() };
        },
        updateMessage: (id: string, text: string, options: any) => {
            console.log(`[ChatRoom] Updated message ${id}: ${text.substring(0, 50)}...`);
        },
        on: () => {}
    };
    (roomManager as any).getRoom = () => mockChatRoom;

    const config = {
        id: 'architect',
        name: '架构师',
        model: { primary: 'claude' },
        personality: 'You are an architect.',
        rules: ['Rule 1'],
        session: { strategy: 'threshold' }
    };

    const agent = new Agent(config as any, mockRouter as any, assembler, stm, roomManager, new SkillManager());

    const message: Message = {
        id: 'msg1',
        roomId: 'test-room',
        sender: { id: 'user', type: 'human', name: 'User' },
        content: 'Hello',
        mentions: ['architect'],
        timestamp: new Date(),
        metadata: { attachments: [] }
    };

    // Override handleMessage to track rounds in mockRouter
    let currentRound = 0;
    const originalInvoke = mockRouter.invoke;
    mockRouter.invoke = async (model: any, prompt: string, options: any) => {
        currentRound++;
        return originalInvoke(model, prompt, { ...options, round: currentRound });
    };

    console.log('--- Starting handleMessage simulation ---');
    await (agent as any).handleMessage(message);
    console.log('--- Simulation finished ---');

    console.log('\n=== All verifications passed! ===');
}

verifyAgentIsolationAndContinuation().catch(err => {
    console.error('\nVerification FAILED:', err);
    process.exit(1);
});
