import { RateLimitManager } from './llm/RateLimitManager.js';
import { AgentRegistry } from './agent/AgentRegistry.js';
import { MessageBus } from './conversation/MessageBus.js';
import { ChatRoomManager } from './conversation/ChatRoomManager.js';
import { SessionManager } from './conversation/SessionManager.js';
import { ShortTermMemory, ContextAssembler, ContextScheduler } from './memory/index.js';
import { DiscordManager } from './discord/index.js';
import type { Participant } from './types.js';
import type { LongTermMemory } from './memory/types.js';
export interface ColonyOptions {
    agentConfigDir?: string;
    skillsDir?: string;
    dataDir?: string;
    enableLongTermMemory?: boolean;
    mem0ConfigPath?: string;
    enableDiscord?: boolean;
    discordConfigPath?: string;
}
export declare class Colony {
    readonly messageBus: MessageBus;
    readonly agentRegistry: AgentRegistry;
    readonly chatRoomManager: ChatRoomManager;
    readonly rateLimitManager: RateLimitManager;
    readonly sessionManager: SessionManager;
    readonly shortTermMemory: ShortTermMemory;
    readonly longTermMemory?: LongTermMemory;
    readonly contextAssembler: ContextAssembler;
    readonly contextScheduler: ContextScheduler;
    readonly discordManager?: DiscordManager;
    private modelRouter;
    constructor(options?: ColonyOptions);
    /**
     * Initialize Colony (restore saved sessions and start Discord).
     */
    initialize(): Promise<void>;
    /**
     * Create a new chat session with agents.
     */
    createSession(name: string, agentIds?: string[]): string;
    /**
     * Send a message from a human into a room.
     */
    sendMessage(roomId: string, senderId: string, content: string, mentions?: string[]): void;
    /**
     * Add a human participant to a room.
     */
    joinSession(roomId: string, participant: Participant): void;
    /**
     * Get status summary.
     */
    getStatus(): object;
}
export default Colony;
