import { EventBus } from '../utils/EventBus.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import type { AgentConfig, AgentStatus, Message } from '../types.js';
interface AgentEventMap {
    'status_change': {
        agentId: string;
        status: AgentStatus;
    };
    'message_sent': Message;
}
export declare class Agent {
    readonly id: string;
    readonly name: string;
    readonly config: AgentConfig;
    readonly events: EventBus<AgentEventMap>;
    private modelRouter;
    private status;
    private messageQueue;
    private processing;
    private lastProcessedTime;
    private sessionStore;
    private transcriptWriter;
    private sessionSealer;
    private digestGenerator;
    private sessionBootstrap;
    private contextAssembler;
    private shortTermMemory;
    private chatRoomManager;
    private activeInvocations;
    constructor(config: AgentConfig, modelRouter: ModelRouter, contextAssembler: ContextAssembler, shortTermMemory: ShortTermMemory, chatRoomManager: ChatRoomManager);
    getStatus(): AgentStatus;
    /**
     * Cancel any active invocation for the given room.
     */
    abortRoomInvocation(roomId: string): void;
    /**
     * Receive a message that has been routed to this agent.
     * The ChatRoom has already decided this agent should handle this message
     * (via @mention or default agent fallback).
     */
    receiveMessage(message: Message): Promise<void>;
    /**
     * Get the session health status for a specific room.
     * Returns a default empty health object if there is no active session.
     */
    getSessionHealth(roomId: string): import("../session/ContextHealthBar.js").HealthStatus;
    /**
     * Set the session ID for a specific room.
     */
    setRoomSession(roomId: string, sessionId: string): void;
    private processQueue;
    /**
     * Maximum follow-up rounds when skills return data that needs
     * to be fed back to the LLM (e.g. get_messages → send_message).
     */
    private static readonly MAX_FOLLOW_UP_ROUNDS;
    private handleMessage;
    /**
     * Store important context to long-term memory.
     */
    private storeToLongTermMemory;
    /**
     * Ensure skills symlinks exist in the working directory.
     * Creates .claude/skills and .gemini/skills pointing to Colony's skills directory.
     */
    private ensureSkillsSymlinks;
    private setStatus;
}
export {};
