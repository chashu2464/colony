import { EventBus } from '../utils/EventBus.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
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
    private skillManager;
    private modelRouter;
    private status;
    private messageQueue;
    private processing;
    private roomSessions;
    private contextAssembler;
    private shortTermMemory;
    private sendMessageToRoom?;
    private getMessagesFromRoom?;
    constructor(config: AgentConfig, modelRouter: ModelRouter, contextAssembler: ContextAssembler, shortTermMemory: ShortTermMemory, skillsDir?: string);
    getStatus(): AgentStatus;
    /**
     * Register message sender callback (called by ChatRoom).
     */
    setSendMessageHandler(handler: (roomId: string, message: Message) => void): void;
    /**
     * Register get-messages callback (called by ChatRoom).
     * Enables the get_messages skill for passive visibility.
     */
    setGetMessagesHandler(handler: (roomId: string, limit?: number) => Message[]): void;
    /**
     * Receive a message that has been routed to this agent.
     * The ChatRoom has already decided this agent should handle this message
     * (via @mention or default agent fallback).
     */
    receiveMessage(message: Message): Promise<void>;
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
     * Parse LLM response for skill invocations and execute them.
     * Returns skill results for data-returning skills and whether send_message was called.
     */
    private processLLMResponse;
    private executeSkill;
    private setStatus;
}
export {};
