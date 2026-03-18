import { MessageBus } from './MessageBus.js';
import type { Agent } from '../agent/Agent.js';
import type { Message, Participant, ChatRoomInfo } from '../types.js';
export declare class ChatRoom {
    readonly id: string;
    readonly name: string;
    readonly createdAt: Date;
    readonly workingDir?: string;
    private agents;
    private agentsByName;
    private humanParticipants;
    private messageHistory;
    private messageBus;
    private unsubscribers;
    private defaultAgentId;
    private autoSaveCallback?;
    private isPaused;
    constructor(name: string, messageBus: MessageBus, id?: string, workingDir?: string);
    /**
     * Add an agent to this room.
     */
    addAgent(agent: Agent): void;
    /**
     * Get all active agents in this room.
     */
    getAgents(): Agent[];
    /**
     * Remove an agent from this room.
     */
    removeAgent(agentId: string): void;
    /**
     * Set the default agent for this room (receives messages when no @ is used).
     */
    setDefaultAgent(agentId: string): void;
    /**
     * Add a human participant.
     */
    addHuman(participant: Participant): void;
    /**
     * Remove a human participant.
     */
    removeHuman(participantId: string): void;
    /**
     * Resolve a mention string to an agent.
     * Matches by name first (e.g. @开发者), then by ID (e.g. @developer).
     */
    private resolveAgentMention;
    /**
     * Parse @mentions from message content text.
     * Extracts all @xxx tokens and resolves them to agent IDs.
     */
    private parseMentionsFromContent;
    /**
     * Send a message from a human into this room (publishes through bus).
     * The `mentions` param can contain agent names OR IDs — both work.
     *
     * Special handling: 'colony-system' is a system role that can send messages
     * to any room without being a participant.
     */
    sendHumanMessage(senderId: string, content: string, mentions?: string[], metadata?: Message['metadata']): Message;
    /**
     * Send a message as an agent into this room (used by CLI skill scripts).
     * The agent must belong to this room.
     */
    sendAgentMessage(agentId: string, content: string, mentions?: string[], metadata?: Message['metadata']): Message;
    /**
     * Send a system notification message into this room.
     */
    sendSystemMessage(content: string, mentions?: string[], metadata?: Message['metadata']): Message;
    /**
     * Update an existing message in-place (used for thinking → response replacement).
     */
    updateMessage(messageId: string, content: string, metadata?: Partial<Message['metadata']>): void;
    /**
     * Layered message routing:
     *   Layer 1: If message has @mentions → route only to mentioned agents
     *   Layer 2: If no @mentions AND sender is human → route to the default agent
     *   Layer 3: Non-routed agents are NOT notified, but can use
     *            get_messages skill to pull the message history themselves
     *
     * IMPORTANT: Agent-sent messages without @mentions do NOT trigger the
     * default agent. This prevents infinite agent-to-agent loops.
     */
    private onMessage;
    getInfo(): ChatRoomInfo;
    getMessages(limit?: number): Message[];
    getParticipantIds(): string[];
    getDefaultAgentId(): string | null;
    getIsPaused(): boolean;
    /**
     * Serialize room state for persistence.
     */
    serialize(): object;
    /**
     * Restore message history (used when loading from persistence).
     * Cleans up any pending messages that were left in an incomplete state.
     */
    restoreMessages(messages: Message[]): void;
    /**
     * Set paused state (used when loading from persistence).
     */
    setPausedState(isPaused: boolean): void;
    /**
     * Pause the chat room.
     */
    pause(): void;
    /**
     * Resume the chat room.
     */
    resume(): void;
    /**
     * Set auto-save callback (called after each message).
     */
    setAutoSaveCallback(callback: (roomId: string) => Promise<void>): void;
    /**
     * Clean up subscriptions.
     */
    destroy(): void;
}
