// ── Colony: Agent Runtime ────────────────────────────────
// Core agent loop: receives routed messages, assembles context,
// invokes LLM, executes skills.

import { randomUUID as uuid } from 'crypto';
import { Logger } from '../utils/Logger.js';
import { EventBus } from '../utils/EventBus.js';
import { SkillManager } from './skills/SkillManager.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js'; // Added import
import type {
    AgentConfig,
    AgentStatus,
    Message,
    SkillExecutionContext,
    ToolUseEvent,
} from '../types.js';

const log = new Logger('Agent');

interface AgentEventMap {
    'status_change': { agentId: string; status: AgentStatus };
    'message_sent': Message;
}

/**
 * Skill invocation pattern in LLM output.
 * Agent LLM should output JSON blocks like:
 *   ```json
 *   {"skill": "send-message", "params": {"content": "hello"}}
 *   ```
 */
const SKILL_PATTERN = /```json\s*\n?\s*(\{[\s\S]*?"skill"\s*:[\s\S]*?\})\s*\n?\s*```/g;

export class Agent {
    readonly id: string;
    readonly name: string;
    readonly config: AgentConfig;
    readonly events = new EventBus<AgentEventMap>();

    private skillManager = new SkillManager();
    private modelRouter: ModelRouter;
    private status: AgentStatus = 'idle';
    private messageQueue: Message[] = [];
    private processing = false;

    // Per-room session IDs for conversation isolation
    private roomSessions = new Map<string, string>();

    // Memory system
    private contextAssembler: ContextAssembler;
    private shortTermMemory: ShortTermMemory;
    private chatRoomManager: ChatRoomManager; // Added chatRoomManager

    // Callbacks set by ChatRoom
    private sendMessageToRoom?: (roomId: string, message: Message) => void;
    private getMessagesFromRoom?: (roomId: string, limit?: number) => Message[];

    constructor(
        config: AgentConfig,
        modelRouter: ModelRouter,
        contextAssembler: ContextAssembler,
        shortTermMemory: ShortTermMemory,
        chatRoomManager: ChatRoomManager, // Added chatRoomManager
        skillsDir?: string
    ) {
        this.id = config.id;
        this.name = config.name;
        this.config = config;
        this.modelRouter = modelRouter;
        this.contextAssembler = contextAssembler;
        this.shortTermMemory = shortTermMemory;
        this.chatRoomManager = chatRoomManager; // Added chatRoomManager assignment

        // Discover skills from filesystem, then load the ones configured for this agent
        if (skillsDir) {
            this.skillManager.discoverFromDirectory(skillsDir);
        }
        this.skillManager.loadSkills(config.skills);

        // Register this agent with the context assembler
        this.contextAssembler.registerAgent(config, this.skillManager);
    }

    // ── Public API ───────────────────────────────────────

    getStatus(): AgentStatus {
        return this.status;
    }

    /**
     * Register message sender callback (called by ChatRoom).
     */
    setSendMessageHandler(handler: (roomId: string, message: Message) => void): void {
        this.sendMessageToRoom = handler;
    }

    /**
     * Register get-messages callback (called by ChatRoom).
     * Enables the get_messages skill for passive visibility.
     */
    setGetMessagesHandler(handler: (roomId: string, limit?: number) => Message[]): void {
        this.getMessagesFromRoom = handler;
    }

    /**
     * Receive a message that has been routed to this agent.
     * The ChatRoom has already decided this agent should handle this message
     * (via @mention or default agent fallback).
     */
    async receiveMessage(message: Message): Promise<void> {
        // Don't process own messages
        if (message.sender.id === this.id) return;

        const isMentioned = message.mentions.includes(this.id);
        log.info(`[${this.name}] Received routed message from ${message.sender.name}${isMentioned ? ' (@mentioned)' : ' (default)'}`);

        // Add message to short-term memory
        this.shortTermMemory.add(message.roomId, message);

        this.messageQueue.push(message);
        await this.processQueue();
    }

    /**
     * Set the session ID for a specific room.
     */
    setRoomSession(roomId: string, sessionId: string): void {
        this.roomSessions.set(roomId, sessionId);
    }

    // ── Internal Processing ──────────────────────────────

    private async processQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift()!;
            await this.handleMessage(message);
        }

        this.processing = false;
    }

    /**
     * Maximum follow-up rounds when skills return data that needs
     * to be fed back to the LLM (e.g. get_messages → send_message).
     */
    private static readonly MAX_FOLLOW_UP_ROUNDS = 3;

    private async handleMessage(message: Message): Promise<void> {
        this.setStatus('thinking');

        try {
            const sessionName = `agent-${this.id}-room-${message.roomId}`;
            let round = 0;

            // Retrieve the ChatRoom instance
            const chatRoom = this.chatRoomManager.getRoom(message.roomId);
            if (!chatRoom) {
                log.error(`[${this.name}] ChatRoom ${message.roomId} not found for message processing.`);
                this.setStatus('error');
                return;
            }

            // Use ContextAssembler to build the initial prompt
            let currentPrompt = await this.contextAssembler.assemble({
                agentId: this.id,
                roomId: message.roomId,
                currentMessage: message,
                tokenBudget: 8000, // Adjust based on model context window
                includeHistory: true,
                includeLongTerm: true, // ✅ Enable long-term memory (Mem0)
                chatRoom: chatRoom, // Pass the chatRoom instance
            });

            while (round < Agent.MAX_FOLLOW_UP_ROUNDS) {
                round++;
                const existingSession = this.roomSessions.get(message.roomId);

                log.info(`[${this.name}] Invoking LLM (round ${round}) for message from ${message.sender.name}...`);

                const result = await this.modelRouter.invoke(
                    this.config.model.primary,
                    currentPrompt,
                    {
                        sessionName,
                        sessionId: existingSession ?? undefined,
                        env: {
                            COLONY_AGENT_ID: this.id,
                            COLONY_ROOM_ID: message.roomId,
                            COLONY_API: process.env.COLONY_API ?? 'http://localhost:3001',
                        },
                    },
                    this.config.model.fallback
                );

                // ── Log full raw LLM response for debugging ──
                log.info(`[${this.name}] ── LLM Response round ${round} (${result.text.length} chars) ──`);
                log.info(`[${this.name}] ${result.text}`);
                log.info(`[${this.name}] ── End Response ──`);

                // Save session ID for this room
                if (result.sessionId) {
                    this.roomSessions.set(message.roomId, result.sessionId);
                }

                // Parse and execute skill invocations, collect results
                const { skillResults, calledSendMessage } = await this.processLLMResponse(
                    result.text,
                    message.roomId,
                    result.toolCalls || []
                );

                // If send_message was called, the agent has spoken — done.
                // If no data-returning skills were called, also done.
                if (calledSendMessage || skillResults.length === 0) {
                    // Store important context to long-term memory
                    await this.storeToLongTermMemory(message, result.text);
                    break;
                }

                // Data-returning skills were called (e.g. get_messages)
                // but send_message was NOT called. Feed results back to LLM.
                log.info(`[${this.name}] Skills returned data but no send-message called. Feeding results back to LLM (round ${round + 1})...`);

                const feedbackParts = skillResults.map(sr =>
                    `## 技能 "${sr.skill}" 的结果:\n${sr.output}`
                );
                currentPrompt = feedbackParts.join('\n\n') +
                    '\n\n请根据以上信息，使用 send-message 技能来回复用户。' +
                    '\n```json\n{"skill": "send-message", "params": {"content": "你的回复内容"}}\n```';
            }
        } catch (err) {
            log.error(`[${this.name}] Error handling message:`, err);
            this.setStatus('error');

            const errMsg = (err as Error).message ?? '';
            if (errMsg.includes('exhausted') || errMsg.includes('rate')) {
                log.warn(`[${this.name}] Agent hit rate limit on model: ${this.config.model.primary}`);
                this.setStatus('rate_limited');
            }
            return;
        }

        this.setStatus('idle');
    }

    /**
     * Store important context to long-term memory.
     */
    private async storeToLongTermMemory(message: Message, response: string): Promise<void> {
        const longTermMemory = (this.contextAssembler as any).longTermMemory;
        if (!longTermMemory) {
            return; // Long-term memory not enabled
        }

        try {
            // Combine user message and agent response for context
            const conversationContext = `用户 (${message.sender.name}): ${message.content}\n\n${this.name}: ${response}`;

            await longTermMemory.retain({
                content: conversationContext,
                context: message,
                metadata: {
                    type: 'conversation' as const,
                    agentId: this.id,
                    roomId: message.roomId,
                    tags: [this.name, message.sender.name],
                },
                timestamp: new Date(),
            });

            log.debug(`[${this.name}] Stored conversation to long-term memory`);
        } catch (error) {
            log.error(`[${this.name}] Failed to store to long-term memory:`, error);
        }
    }

    /**
     * Parse LLM response for skill invocations and execute them.
     * Returns skill results for data-returning skills and whether send_message was called.
     */
    private async processLLMResponse(
        response: string,
        roomId: string,
        toolCalls: ToolUseEvent[] = []
    ): Promise<{
        skillResults: { skill: string; output: string }[];
        calledSendMessage: boolean;
    }> {
        const matches = [...response.matchAll(SKILL_PATTERN)];

        if (matches.length === 0) {
            // If native tools were used, trust the CLI handled it (no warning)
            if (toolCalls.length > 0) {
                log.info(`[${this.name}] Native tool execution detected (${toolCalls.length} calls). Skills handled by CLI.`);
                return { skillResults: [], calledSendMessage: true };
            }

            log.warn(`[${this.name}] ⚠ No skill invocations found in response! The model did not call send-message.`);
            log.warn(`[${this.name}] Raw response was: ${response.substring(0, 500)}`);
            return { skillResults: [], calledSendMessage: false };
        }

        log.info(`[${this.name}] Found ${matches.length} skill invocation(s)`);

        const skillResults: { skill: string; output: string }[] = [];
        let calledSendMessage = false;

        for (const match of matches) {
            const jsonStr = match[1];
            if (!jsonStr) continue;

            try {
                const invocation = JSON.parse(jsonStr) as { skill: string; params: Record<string, unknown> };

                if (invocation.skill === 'send-message') {
                    calledSendMessage = true;
                }

                const result = await this.executeSkill(invocation.skill, invocation.params, roomId);

                if (result && !result.success && result.error) {
                    // Skill failed (e.g. unknown skill) — feed error back to LLM
                    skillResults.push({ skill: invocation.skill, output: `❌ 错误: ${result.error}` });
                } else if (result && result.output && invocation.skill !== 'send-message') {
                    // Data-returning skill succeeded
                    skillResults.push({ skill: invocation.skill, output: result.output });
                }
            } catch (err) {
                log.error(`[${this.name}] Failed to parse skill invocation:`, jsonStr, err);
            }
        }

        return { skillResults, calledSendMessage };
    }

    private async executeSkill(
        skillName: string,
        params: Record<string, unknown>,
        roomId: string
    ): Promise<{ success: boolean; output?: string; error?: string } | null> {
        const skill = this.skillManager.get(skillName);
        if (!skill) {
            const availableSkills = this.skillManager.getAll().map(s => s.name).join(', ');
            log.warn(`[${this.name}] Unknown skill: "${skillName}" — available: [${availableSkills}]`);
            return {
                success: false,
                error: `技能 "${skillName}" 不存在。可用的技能有: ${availableSkills}。请使用正确的技能名称。`,
            };
        }

        this.setStatus('executing_skill');
        log.info(`[${this.name}] Executing skill: ${skillName}`);

        const context: SkillExecutionContext = {
            agentId: this.id,
            roomId,
            sendMessage: (content: string, mentions?: string[]) => {
                const msg: Message = {
                    id: uuid(),
                    roomId,
                    sender: { id: this.id, type: 'agent', name: this.name },
                    content,
                    mentions: mentions ?? [],
                    timestamp: new Date(),
                    metadata: { skillInvocation: true },
                };
                this.sendMessageToRoom?.(roomId, msg);
                this.events.emit('message_sent', msg);
            },
            getMessages: (limit?: number) => {
                return this.getMessagesFromRoom?.(roomId, limit) ?? [];
            },
        };

        try {
            const result = await skill.execute(params, context);
            if (!result.success) {
                log.warn(`[${this.name}] Skill "${skillName}" failed: ${result.error}`);
            }
            return result;
        } catch (err) {
            log.error(`[${this.name}] Skill "${skillName}" threw:`, err);
            return null;
        }
    }

    private setStatus(status: AgentStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.events.emit('status_change', { agentId: this.id, status });
    }
}
