// ── Colony: Agent Runtime ────────────────────────────────
// Core agent loop: receives routed messages, assembles context,
// invokes LLM via CLI (which handles tool execution natively).

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import { EventBus } from '../utils/EventBus.js';
import { SkillManager } from './skills/SkillManager.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import type {
    AgentConfig,
    AgentStatus,
    Message,
} from '../types.js';

const log = new Logger('Agent');

interface AgentEventMap {
    'status_change': { agentId: string; status: AgentStatus };
    'message_sent': Message;
}

export class Agent {
    readonly id: string;
    readonly name: string;
    readonly config: AgentConfig;
    readonly events = new EventBus<AgentEventMap>();

    private modelRouter: ModelRouter;
    private status: AgentStatus = 'idle';
    private messageQueue: Message[] = [];
    private processing = false;
    private lastProcessedTime = 0;

    // Per-room session IDs for conversation isolation
    private roomSessions = new Map<string, string>();

    // Memory system
    private contextAssembler: ContextAssembler;
    private shortTermMemory: ShortTermMemory;
    private chatRoomManager: ChatRoomManager;

    // Track active invocations per room
    private activeInvocations = new Map<string, AbortController>();

    constructor(
        config: AgentConfig,
        modelRouter: ModelRouter,
        contextAssembler: ContextAssembler,
        shortTermMemory: ShortTermMemory,
        chatRoomManager: ChatRoomManager
    ) {
        this.id = config.id;
        this.name = config.name;
        this.config = config;
        this.modelRouter = modelRouter;
        this.contextAssembler = contextAssembler;
        this.shortTermMemory = shortTermMemory;
        this.chatRoomManager = chatRoomManager;

        // Register this agent with the context assembler
        // Note: SkillManager is still used for context assembly (skill descriptions)
        // but actual skill execution is handled by CLI
        const skillManager = new SkillManager();
        this.contextAssembler.registerAgent(config, skillManager);
    }

    // ── Public API ───────────────────────────────────────

    getStatus(): AgentStatus {
        return this.status;
    }

    /**
     * Cancel any active invocation for the given room.
     */
    abortRoomInvocation(roomId: string): void {
        const controller = this.activeInvocations.get(roomId);
        if (controller) {
            log.info(`[${this.name}] Aborting invocation for room ${roomId}`);
            controller.abort();
            this.activeInvocations.delete(roomId);
            this.setStatus('idle');
        }
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

        try {
            while (this.messageQueue.length > 0) {
                // Ensure at least 1s cooldown since last message finished
                const now = Date.now();
                const elapsed = now - this.lastProcessedTime;
                if (elapsed < 1000) {
                    const delay = 1000 - elapsed;
                    log.info(`[${this.name}] Cooling down for ${delay}ms before processing next message...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const message = this.messageQueue.shift()!;
                try {
                    await this.handleMessage(message);
                } catch (error) {
                    log.error(`[${this.name}] Error handling message ${message.id}:`, error);
                } finally {
                    this.lastProcessedTime = Date.now();
                }
            }
        } finally {
            this.processing = false;
        }
    }

    /**
     * Maximum follow-up rounds when skills return data that needs
     * to be fed back to the LLM (e.g. get_messages → send_message).
     */
    private static readonly MAX_FOLLOW_UP_ROUNDS = 5;

    private async handleMessage(message: Message): Promise<void> {
        this.setStatus('thinking');

        // Retrieve the ChatRoom instance outside try-catch to allow error logging
        const chatRoom = this.chatRoomManager.getRoom(message.roomId);
        if (!chatRoom) {
            log.error(`[${this.name}] ChatRoom ${message.roomId} not found for message processing.`);
            this.setStatus('error');
            return;
        }

        try {
            const sessionName = `agent-${this.id}-room-${message.roomId}`;
            let round = 0;

            // Setup working directory and skills symlinks if needed
            const workingDir = chatRoom.workingDir;
            if (workingDir) {
                await this.ensureSkillsSymlinks(workingDir);
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

                // Send a pending placeholder message — will be updated in-place
                const pendingMsg = chatRoom.sendAgentMessage(this.id, `正在思考...`, [], {
                    isMonologue: true,
                    isPending: true,
                });
                const pendingId = pendingMsg.id;

                const controller = new AbortController();
                this.activeInvocations.set(message.roomId, controller);

                try {
                    const result = await this.modelRouter.invoke(
                        this.config.model.primary,
                        currentPrompt,
                        {
                            sessionName,
                            sessionId: existingSession ?? undefined,
                            cwd: workingDir, // Set working directory for CLI
                            signal: controller.signal,
                            attachments: message.metadata?.attachments,
                            env: {
                                COLONY_AGENT_ID: this.id,
                                COLONY_ROOM_ID: message.roomId,
                                COLONY_API: process.env.COLONY_API ?? 'http://localhost:3001',
                                CLAUDE_CODE_SESSION_ACCESS_TOKEN: process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN ?? '',
                            },
                        },
                        this.config.model.fallback,
                        {
                            onStatusUpdate: (statusMsg: string) => {
                                // Update the pending message with status (e.g. "429, switching...")
                                chatRoom.updateMessage(pendingId, statusMsg, { isPending: true, isMonologue: true });
                            },
                        }
                    );

                    // ── Log full raw LLM response for debugging ──
                    log.info(`[${this.name}] ── LLM Response round ${round} (${result.text.length} chars) ──`);
                    log.info(`[${this.name}] ${result.text}`);
                    log.info(`[${this.name}] ── End Response ──`);

                    // Save session ID for this room
                    if (result.sessionId) {
                        this.roomSessions.set(message.roomId, result.sessionId);
                    }

                    // Update pending message with actual response content
                    if (result.text || (result.toolCalls && result.toolCalls.length > 0)) {
                        chatRoom.updateMessage(pendingId, result.text || '(Silent Execution)', {
                            isMonologue: true,
                            isPending: false,
                            toolCalls: result.toolCalls || [],
                        });
                    } else {
                        // No content — just clear pending state
                        chatRoom.updateMessage(pendingId, '(无输出)', { isMonologue: true, isPending: false });
                    }

                    // Check if CLI executed any tools
                    const toolCalls = result.toolCalls || [];
                    const hasSendMessage = toolCalls.some(t => {
                        const name = t.name.toLowerCase();
                        // Direct match
                        if (name === 'send-message' || name === 'send_message') return true;
                        // Gemini CLI 'Skill' wrapper match
                        if (name === 'skill' && (t.input.name === 'send-message' || t.input.name === 'send_message')) return true;
                        return false;
                    });

                    if (hasSendMessage) {
                        // Agent has spoken - done with this message
                        await this.storeToLongTermMemory(message, result.text);
                        break;
                    }

                    if (toolCalls.length === 0) {
                        // No tools called AND no message sent? 
                        // This usually means the LLM just gave a text response without using send-message.
                        // We'll consider this done to avoid infinite loops, though ideally they should speak.
                        await this.storeToLongTermMemory(message, result.text);
                        break;
                    }

                    // Tools were called but no send-message. 
                    // Continue to next round to let LLM see tool outputs and potentially speak.
                    log.info(`[${this.name}] Tools called (${toolCalls.map(t => t.name).join(', ')}), continuing to round ${round + 1}...`);
                    
                    // Note: currentPrompt remains the same, but since we are in a resumed session,
                    // the LLM will see its previous tool calls and results.
                    continue;
                } catch (innerErr) {
                    const innerErrMsg = (innerErr as Error).message ?? '';

                    // ONLY check the signal itself — don't match error text to avoid
                    // false positives from CLI errors that contain the word 'aborted'.
                    if (controller.signal.aborted) {
                        // Clear stale session so next message starts fresh
                        this.roomSessions.delete(message.roomId);
                        chatRoom.updateMessage(pendingId, `⏹️ 已停止执行`, { isMonologue: true, isPending: false });
                        this.setStatus('idle');
                        return;
                    }

                    if (innerErrMsg.includes('exhausted') || innerErrMsg.includes('rate') || innerErrMsg.includes('429') || innerErrMsg.includes('capacity')) {
                        chatRoom.updateMessage(pendingId, `⚠️ 模型调用受限: ${innerErrMsg}`, { isMonologue: true, isPending: false, error: innerErrMsg });
                        this.setStatus('rate_limited');
                        return;
                    }

                    // Other errors — update pending and re-throw to outer catch
                    chatRoom.updateMessage(pendingId, `❌ 调用出错: ${innerErrMsg}`, { isMonologue: true, isPending: false, error: innerErrMsg });
                    throw innerErr;
                } finally {
                    this.activeInvocations.delete(message.roomId);
                }
            }
        } catch (err) {
            log.error(`[${this.name}] Error handling message:`, err);
            this.setStatus('error');

            const errMsg = (err as Error).message ?? '';
            chatRoom?.sendAgentMessage(this.id, `❌ 调用出错: ${errMsg}`, [], {
                isMonologue: true,
                error: errMsg,
            } as any);
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
     * Ensure skills symlinks exist in the working directory.
     * Creates .claude/skills and .gemini/skills pointing to Colony's skills directory.
     */
    private async ensureSkillsSymlinks(workingDir: string): Promise<void> {
        const colonySkillsDir = path.join(process.cwd(), 'skills');

        // Check if Colony skills directory exists
        if (!fs.existsSync(colonySkillsDir)) {
            log.warn(`Colony skills directory not found: ${colonySkillsDir}`);
            return;
        }

        // Ensure working directory exists
        if (!fs.existsSync(workingDir)) {
            log.warn(`Working directory does not exist: ${workingDir}`);
            return;
        }

        // Create symlinks for both Claude and Gemini
        for (const cliDir of ['.claude', '.gemini']) {
            const targetDir = path.join(workingDir, cliDir);
            const skillsLink = path.join(targetDir, 'skills');

            try {
                // Create CLI directory if it doesn't exist
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // Check if symlink already exists and is valid
                if (fs.existsSync(skillsLink)) {
                    const stats = fs.lstatSync(skillsLink);
                    if (stats.isSymbolicLink()) {
                        const linkTarget = fs.readlinkSync(skillsLink);
                        if (path.resolve(workingDir, linkTarget) === colonySkillsDir) {
                            // Symlink already correct
                            continue;
                        }
                        // Remove incorrect symlink
                        fs.unlinkSync(skillsLink);
                    } else {
                        log.warn(`${skillsLink} exists but is not a symlink, skipping`);
                        continue;
                    }
                }

                // Create symlink
                fs.symlinkSync(colonySkillsDir, skillsLink, 'dir');
                log.info(`Created skills symlink: ${skillsLink} -> ${colonySkillsDir}`);
            } catch (error) {
                log.error(`Failed to create skills symlink for ${cliDir}:`, error);
            }
        }
    }

    private setStatus(status: AgentStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.events.emit('status_change', { agentId: this.id, status });
    }
}
