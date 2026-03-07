// ── Colony: Main Entry Point ─────────────────────────────
// Bootstraps the multi-agent system: loads configs, creates agents,
// sets up message routing, and exposes the top-level API.

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { Logger } from './utils/Logger.js';
import { RateLimitManager } from './llm/RateLimitManager.js';
import { ModelRouter } from './llm/ModelRouter.js';
import { AgentRegistry } from './agent/AgentRegistry.js';
import { MessageBus } from './conversation/MessageBus.js';
import { ChatRoomManager } from './conversation/ChatRoomManager.js';
import { SessionManager } from './conversation/SessionManager.js';
import { ShortTermMemory, ContextAssembler, ContextScheduler } from './memory/index.js';
import { Mem0LongTermMemory } from './memory/Mem0LongTermMemory.js';
import { DiscordManager } from './discord/index.js';
import type { Participant } from './types.js';
import type { LongTermMemory } from './memory/types.js';
import type { Mem0Config } from './memory/Mem0LongTermMemory.js';

const log = new Logger('Colony');

export interface ColonyOptions {
    agentConfigDir?: string;
    dataDir?: string;
    enableLongTermMemory?: boolean;
    mem0ConfigPath?: string;
    enableDiscord?: boolean;
    discordConfigPath?: string;
}

export class Colony {
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

    private modelRouter: ModelRouter;

    constructor(options: ColonyOptions = {}) {
        const agentConfigDir = options.agentConfigDir ?? path.join(process.cwd(), 'config', 'agents');
        const dataDir = options.dataDir ?? path.join(process.cwd(), '.data', 'sessions');
        const mem0ConfigPath = options.mem0ConfigPath ?? path.join(process.cwd(), 'config', 'mem0.yaml');
        const discordConfigPath = options.discordConfigPath ?? path.join(process.cwd(), 'config', 'discord.yaml');

        // Initialize memory system
        this.shortTermMemory = new ShortTermMemory({
            windowSize: 50,
            maxTokens: 4000,
            compressionThreshold: 0.8,
        });

        // Initialize long-term memory if enabled (async initialization deferred)
        if (options.enableLongTermMemory !== false && fs.existsSync(mem0ConfigPath)) {
            try {
                log.info('Loading Mem0 configuration...');

                // Load Mem0 configuration from YAML
                const configContent = fs.readFileSync(mem0ConfigPath, 'utf-8');
                const mem0Config = yaml.parse(configContent) as Mem0Config;

                this.longTermMemory = new Mem0LongTermMemory(mem0Config);
                log.info('Mem0 long-term memory created (will initialize on first use)');
            } catch (error) {
                log.error('Failed to load Mem0 configuration:', error);
                log.warn('Continuing without long-term memory');
            }
        }

        this.contextAssembler = new ContextAssembler(this.shortTermMemory, this.longTermMemory);
        this.contextScheduler = new ContextScheduler(this.shortTermMemory);

        // Initialize components
        this.rateLimitManager = new RateLimitManager();
        this.modelRouter = new ModelRouter(this.rateLimitManager);
        this.messageBus = new MessageBus();
        this.sessionManager = new SessionManager(dataDir);

        // Initialize chatRoomManager first (needed by agentRegistry)
        this.chatRoomManager = new ChatRoomManager(
            this.messageBus,
            null as any, // Will be set after agentRegistry is created
            this.sessionManager
        );

        // Now initialize agentRegistry with chatRoomManager
        this.agentRegistry = new AgentRegistry(
            this.modelRouter,
            this.contextAssembler,
            this.shortTermMemory,
            this.chatRoomManager
        );

        // Set agentRegistry in chatRoomManager
        (this.chatRoomManager as any).agentRegistry = this.agentRegistry;

        // Load agent configs
        const agents = this.agentRegistry.loadFromDirectory(agentConfigDir);
        log.info(`Colony initialized with ${agents.length} agents`);

        // Initialize Discord integration if enabled
        if (options.enableDiscord !== false && fs.existsSync(discordConfigPath)) {
            try {
                log.info('Initializing Discord integration...');
                this.discordManager = new DiscordManager(this, discordConfigPath);
                log.info('Discord integration initialized');
            } catch (error) {
                log.error('Failed to initialize Discord:', error);
                log.warn('Continuing without Discord integration');
            }
        }

        // Forward rate limit events
        this.rateLimitManager.events.on('quota_exhausted', ({ model }) => {
            log.warn(`Quota exhausted for model: ${model}`);
            this.messageBus.events.emit('colony_event', {
                type: 'rate_limit',
                model,
                remaining: 0,
                total: 0,
            });
        });
    }

    /**
     * Initialize Colony (restore saved sessions and start Discord).
     */
    async initialize(): Promise<void> {
        await this.chatRoomManager.restoreAllSessions();

        // Start Discord integration if enabled
        if (this.discordManager) {
            await this.discordManager.start();
        }
    }

    /**
     * Create a new chat session with agents.
     * @param workingDir - Optional working directory for CLI tools (defaults to current directory)
     */
    createSession(name: string, agentIds?: string[], workingDir?: string): string {
        const room = this.chatRoomManager.createRoom(name, agentIds, workingDir);

        // Sync to Discord: create a bound channel for this session (fire-and-forget)
        if (this.discordManager) {
            const agentNames = room.getInfo().participants
                .filter(p => p.type === 'agent')
                .map(p => p.name);
            this.discordManager.createChannelForSession(room.id, name, agentNames)
                .catch(err => log.warn(`Discord channel sync failed for session "${name}":`, err));
        }

        return room.id;
    }

    /**
     * Send a message from a human into a room.
     */
    sendMessage(roomId: string, senderId: string, content: string, mentions?: string[]): void {
        const room = this.chatRoomManager.getRoom(roomId);
        if (!room) throw new Error(`Room not found: ${roomId}`);
        room.sendHumanMessage(senderId, content, mentions);
    }

    /**
     * Add a human participant to a room.
     */
    joinSession(roomId: string, participant: Participant): void {
        this.chatRoomManager.joinRoom(roomId, participant);
    }

    /**
     * Get status summary.
     */
    getStatus(): object {
        return {
            agents: this.agentRegistry.getStatusSummary(),
            rooms: this.chatRoomManager.listRooms(),
            rateLimits: this.rateLimitManager.getAllStatus(),
        };
    }
}

export default Colony;
